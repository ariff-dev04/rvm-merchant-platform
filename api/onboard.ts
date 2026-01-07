import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

// 🟢 CONFIGURATION
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
// ⚠️ Use Service Role Key to bypass RLS and ensure writes
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!; 
const SECRET = process.env.VITE_API_SECRET!;        
const MERCHANT_NO = process.env.VITE_MERCHANT_NO!;
const API_BASE = "https://api.autogcm.com";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  const debugLog: any[] = []; 

  try {
    // 1. Get User
    const { data: user } = await supabase.from('users').select('id, phone').eq('phone', phone).single();
    if (!user) return res.status(404).json({ error: 'User not found in DB' });
    
    // 2. Check Migration
    const { data: existing } = await supabase.from('wallet_transactions')
        .select('id').eq('user_id', user.id).eq('transaction_type', 'MIGRATION_ADJUSTMENT').maybeSingle();
    if (existing) return res.status(200).json({ msg: "Already onboarded", debugLog });

    // 3. Vendor Data
    const profile = await callAutoGCM('/api/open/v1/user/account/sync', 'POST', { phone, nikeName: 'User', avatarUrl: '' });
    if (!profile || !profile.data) return res.status(502).json({ error: "Vendor API Failed" });
    const livePoints = Number(profile?.data?.integral || 0);

    // 4. 🔥 FETCH HISTORY (With Loop & Date Range)
    let historyList: any[] = [];
    let pageNum = 1;
    const pageSize = 100;
    let hasNext = true;

    // Date Range: 2020-01-01 to Today
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    
    console.log(`📡 Fetching history for ${phone}...`);
    
    while (hasNext) {
        const res = await callAutoGCM('/api/open/v1/put', 'GET', { 
            phone, 
            pageNum, 
            pageSize,
            startTime: '2020-01-01', 
            endTime: todayStr
        });

        const list = res?.data?.list || [];
        if (list.length > 0) {
            historyList = [...historyList, ...list];
            // Check if we reached the last page
            const total = res?.data?.total || 0;
            if (historyList.length >= total || list.length < pageSize) {
                hasNext = false;
            } else {
                pageNum++;
            }
        } else {
            hasNext = false;
        }
    }

    debugLog.push({ step: "Fetch Complete", totalItems: historyList.length });

    // 5. Get Merchant
    const { data: merchant } = await supabase.from('merchants').select('id').limit(1).single();
    if (!merchant) return res.status(500).json({ error: "Merchant missing" });

    let totalImportedValue = 0;
    let totalImportedWeight = 0;

    // 6. PROCESS LOOP
    for (const record of historyList) {
        const recordValue = Number(record.integral || 0);
        const recordWeight = Number(record.totalWeight || record.weight || 0);
        
        // --- A. EXTRACT FIELDS ---
        const deviceNo = record.deviceNo || null;
        const recordPhone = record.phonenumber || null; 
        
        let photoUrl = null;
        // Parse comma-separated images if present
        if (record.imgUrl) photoUrl = record.imgUrl.split(',')[0];
        
        let wasteType = 'Unknown';

        // Extract detailed info if available
        if (record.rubbishLogDetailsVOList && record.rubbishLogDetailsVOList.length > 0) {
            const detail = record.rubbishLogDetailsVOList[0];
            if (detail.rubbishName) wasteType = detail.rubbishName;
            // Prefer detail image if root image is empty
            if (!photoUrl && detail.imgUrl) photoUrl = detail.imgUrl;
        }

        // --- B. CALCULATE RATE (Points / Weight) ---
        // We calculate this ourselves to ensure accuracy
        let ratePerKg = 0;
        if (recordWeight > 0) {
            // e.g. 1.05 pts / 3.51 kg = 0.299... -> 0.30
            ratePerKg = Number((recordValue / recordWeight).toFixed(3)); 
        }

        // --- C. ID LOGIC (Fixing the undefined bug) ---
        let rawId = record.id || record.putId;
        let putId = rawId ? String(rawId) : "";
        
        if (!putId || putId === "undefined" || putId === "null") {
            const uniqueSuffix = new Date(record.createTime || Date.now()).getTime(); 
            putId = `MANUAL-${uniqueSuffix}-${Math.floor(recordWeight * 100)}-${Math.random().toString(36).substring(7)}`;
            debugLog.push({ warning: "Generated fallback ID", newId: putId });
        }

        // --- D. DB OPERATIONS ---
        const { data: existingRecord } = await supabase.from('submission_reviews')
            .select('id, status')
            .eq('vendor_record_id', putId)
            .eq('user_id', user.id) // Strict check
            .maybeSingle();

        if (existingRecord) {
             if (existingRecord.status === 'PENDING') {
                const { data: updatedData } = await supabase.from('submission_reviews').update({
                    status: 'VERIFIED',
                    source: 'MIGRATION',
                    calculated_value: recordValue,
                    confirmed_weight: recordWeight,
                    reviewed_at: new Date().toISOString(),
                    // Update missing fields
                    device_no: deviceNo,
                    waste_type: wasteType,
                    photo_url: photoUrl,
                    phone: recordPhone,
                    rate_per_kg: ratePerKg
                }).eq('id', existingRecord.id).select();
                
                totalImportedValue += recordValue;
                totalImportedWeight += recordWeight;
            } else {
                totalImportedValue += recordValue;
                totalImportedWeight += recordWeight;
            }
        } else {
            const { data: insertedData, error: insertError } = await supabase.from('submission_reviews').insert({
                user_id: user.id, 
                merchant_id: merchant.id, 
                vendor_record_id: putId,
                status: 'VERIFIED',
                calculated_value: recordValue, 
                waste_type: wasteType,
                source: 'MIGRATION', 
                submitted_at: new Date(record.createTime || Date.now()).toISOString(),
                api_weight: recordWeight,
                confirmed_weight: recordWeight,
                machine_given_points: recordValue,
                // Insert missing fields
                device_no: deviceNo,
                photo_url: photoUrl,
                phone: recordPhone,
                rate_per_kg: ratePerKg
            }).select();

            if (insertError) {
                debugLog.push({ error: "Insert Failed", id: putId, msg: insertError.message });
            } else {
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
        debug_log: debugLog 
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