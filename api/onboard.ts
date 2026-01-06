import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!; 
const SECRET = process.env.VITE_API_SECRET!;        
const MERCHANT_NO = process.env.VITE_MERCHANT_NO!;
const API_BASE = "https://api.autogcm.com";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  const debugLog: any[] = []; // 🔍 We will collect proof here

  try {
    // 1. Get User
    const { data: user } = await supabase.from('users').select('id, phone').eq('phone', phone).single();
    if (!user) return res.status(404).json({ error: 'User not found in DB' });
    
    debugLog.push({ step: "User Found", userId: user.id });

    // 2. Check Migration
    const { data: existing } = await supabase.from('wallet_transactions')
        .select('id').eq('user_id', user.id).eq('transaction_type', 'MIGRATION_ADJUSTMENT').maybeSingle();
    if (existing) return res.status(200).json({ msg: "Already onboarded", debugLog });

    // 3. Vendor Data
    const profile = await callAutoGCM('/api/open/v1/user/account/sync', 'POST', { phone, nikeName: 'User', avatarUrl: '' });
    if (!profile || !profile.data) return res.status(502).json({ error: "Vendor API Failed" });
    const livePoints = Number(profile?.data?.integral || 0);

    const historyRes = await callAutoGCM('/api/open/v1/put', 'GET', { phone, pageNum: 1, pageSize: 100 });
    const historyList = historyRes?.data?.list || [];

    // 4. Get Merchant
    const { data: merchant } = await supabase.from('merchants').select('id').limit(1).single();
    if (!merchant) return res.status(500).json({ error: "Merchant missing" });
    
    debugLog.push({ step: "Merchant Found", merchantId: merchant.id });

    let totalImportedValue = 0;
    let totalImportedWeight = 0;

    // 5. PROCESS LOOP
    for (const record of historyList) {
        const recordValue = Number(record.integral || 0);
        const recordWeight = Number(record.totalWeight || record.weight || 0);
        
        // 🚨 FIX 1: Handle missing/undefined IDs from Vendor API
        let putId = record.putId ? String(record.putId) : "";
        
        // If API gives "undefined" or empty, generate a fallback unique ID (MANUAL-TIMESTAMP-WEIGHT)
        if (!putId || putId === "undefined" || putId === "null") {
            const uniqueSuffix = new Date(record.createTime || Date.now()).getTime(); 
            putId = `MANUAL-${uniqueSuffix}-${Math.floor(recordWeight * 100)}`;
            debugLog.push({ warning: "Missing putId, generated fallback", newId: putId });
        }

        // 🚨 FIX 2: Strict check - Must match Vendor ID AND User ID
        // This prevents matching that one broken "undefined" record belonging to someone else
        const { data: existingRecord } = await supabase.from('submission_reviews')
            .select('id, status')
            .eq('vendor_record_id', putId)
            .eq('user_id', user.id) // <--- CRITICAL: Only match THIS user's records
            .maybeSingle();

        if (existingRecord) {
             if (existingRecord.status === 'PENDING') {
                // UPDATE PENDING RECORD
                const { data: updatedData, error: updateError } = await supabase.from('submission_reviews').update({
                    status: 'VERIFIED',
                    source: 'MIGRATION',
                    calculated_value: recordValue,
                    confirmed_weight: recordWeight,
                    reviewed_at: new Date().toISOString()
                }).eq('id', existingRecord.id).select();

                if (updateError) {
                    debugLog.push({ error: "Update Failed", id: putId, msg: updateError.message });
                } else {
                    debugLog.push({ success: "Updated", id: existingRecord.id, returned: updatedData });
                    totalImportedValue += recordValue;
                    totalImportedWeight += recordWeight;
                }
            } else {
                // ALREADY VERIFIED
                debugLog.push({ info: "Already Verified (Correctly)", id: existingRecord.id });
                totalImportedValue += recordValue;
                totalImportedWeight += recordWeight;
            }
        } else {
            // INSERT NEW RECORD
            const { data: insertedData, error: insertError } = await supabase.from('submission_reviews').insert({
                user_id: user.id, 
                merchant_id: merchant.id, 
                vendor_record_id: putId,
                status: 'VERIFIED',
                calculated_value: recordValue, 
                waste_type: 'Unknown',
                source: 'MIGRATION', 
                submitted_at: new Date(record.createTime || Date.now()).toISOString(),
                api_weight: recordWeight,
                confirmed_weight: recordWeight,
                machine_given_points: recordValue
            }).select();

            if (insertError) {
                debugLog.push({ error: "Insert Failed", id: putId, msg: insertError.message });
            } else {
                debugLog.push({ success: "Inserted", returned: insertedData });
                totalImportedValue += recordValue;
                totalImportedWeight += recordWeight;
            }
        }
    }

    // --- E. ADJUSTMENT & SAVE ---
    const adjustmentNeeded = livePoints - totalImportedValue;

    await supabase.from('wallet_transactions').insert({
        user_id: user.id, 
        merchant_id: merchant.id, 
        amount: adjustmentNeeded,
        balance_after: livePoints, 
        transaction_type: 'MIGRATION_ADJUSTMENT', 
        description: adjustmentNeeded < 0 ? 'Legacy System Adjustment (Spent)' : 'Legacy System Balance'
    });

    if (adjustmentNeeded < 0) {
        await supabase.from('withdrawals').insert({
             user_id: user.id,
             merchant_id: merchant.id,
             amount: Math.abs(adjustmentNeeded),
             status: 'EXTERNAL_SYNC', 
             created_at: new Date().toISOString(),
             bank_name: 'Legacy System',
             account_number: 'MIGRATION',
             account_holder_name: profile?.data?.nikeName || 'System Migration'
        });
    }

    await supabase.from('merchant_wallets').upsert({
        user_id: user.id, merchant_id: merchant.id,
        current_balance: livePoints, 
        total_earnings: totalImportedValue 
    }, { onConflict: 'user_id, merchant_id' });

    await supabase.from('users').update({
        lifetime_integral: livePoints,
        total_weight: totalImportedWeight,
        last_synced_at: new Date().toISOString(),
        nickname: profile?.data?.nikeName || profile?.data?.name || 'User',
        vendor_user_no: profile?.data?.userNo
    }).eq('id', user.id);

    return res.status(200).json({ 
        success: true, 
        balance: livePoints, 
        migrated: true,
        debug_log: debugLog // 👈 The most important part
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message, debug_log: debugLog });
  }
}

// Helper
async function callAutoGCM(endpoint: string, method: string, data: any) {
    const timestamp = Date.now().toString();
    const sign = crypto.createHash('md5').update(MERCHANT_NO + SECRET + timestamp).digest('hex');
    try {
        const res = await axios({
            url: API_BASE + endpoint, method: method,
            headers: { "merchant-no": MERCHANT_NO, "timestamp": timestamp, "sign": sign, "Content-Type": "application/json" },
            [method === 'GET' ? 'params' : 'data']: data
        });
        return res.data;
    } catch (e: any) { return null; }
}