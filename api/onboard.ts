import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

// 🟢 CONFIGURATION
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!; 
const SECRET = process.env.VITE_API_SECRET!;        
const MERCHANT_NO = process.env.VITE_MERCHANT_NO!;
const API_BASE = "https://api.autogcm.com";

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  try {
    console.log(`🚀 Starting Onboarding for: ${phone}`);

    // --- A. GET USER ---
    const { data: user, error: userError } = await supabase.from('users').select('id').eq('phone', phone).single();
    if (userError || !user) {
        console.error("❌ DB Error finding user:", userError);
        return res.status(404).json({ error: 'User not found in DB' });
    }

    // --- B. CHECK MIGRATION ---
    const { data: existing } = await supabase.from('wallet_transactions')
        .select('id').eq('user_id', user.id).eq('transaction_type', 'MIGRATION_ADJUSTMENT').maybeSingle();
    
    if (existing) return res.status(200).json({ msg: "Already onboarded" });

    // --- C. FETCH VENDOR DATA ---
    const profile = await callAutoGCM('/api/open/v1/user/account/sync', 'POST', { phone, nikeName: 'User', avatarUrl: '' });
    if (!profile || !profile.data) {
        return res.status(502).json({ error: "Vendor API Connection Failed" });
    }
    const livePoints = Number(profile?.data?.integral || 0);

    const historyRes = await callAutoGCM('/api/open/v1/put', 'GET', { phone, pageNum: 1, pageSize: 100 });
    const historyList = historyRes?.data?.list || [];

    // --- D. IMPORT HISTORY ---
    let totalImportedValue = 0;
    let totalImportedWeight = 0; // 🟢 TRACK WEIGHT
    
    // 1. Get Merchant ID
    const { data: merchant, error: merchError } = await supabase.from('merchants').select('id').limit(1).single();
    if (merchError || !merchant) {
        return res.status(500).json({ error: "Merchant configuration missing in DB" });
    }
    const merchantId = merchant.id;

    console.log(`Processing ${historyList.length} history items...`);

    for (const record of historyList) {
        const recordValue = Number(record.integral || 0);
        const recordWeight = Number(record.totalWeight || record.weight || 0); // 🟢 Capture Weight
        const putId = String(record.putId); 

        const { data: existingRecord } = await supabase.from('submission_reviews')
            .select('id, status').eq('vendor_record_id', putId).maybeSingle();

        if (existingRecord) {
            // Record exists, just add to totals
            if (existingRecord.status === 'VERIFIED') {
                totalImportedValue += recordValue;
                totalImportedWeight += recordWeight;
            }
        } else {
            // INSERT NEW RECORD
            const { error: insertError } = await supabase.from('submission_reviews').insert({
                user_id: user.id, 
                merchant_id: merchantId, 
                vendor_record_id: putId,
                status: 'VERIFIED', 
                calculated_value: recordValue, 
                waste_type: 'Unknown',
                source: 'MIGRATION', 
                submitted_at: new Date(record.createTime || Date.now()).toISOString(),
                api_weight: recordWeight,
                confirmed_weight: recordWeight,
                machine_given_points: recordValue
            });
            
            if (insertError) {
                console.error(`❌ Failed to insert record ${putId}:`, insertError.message);
            } else {
                totalImportedValue += recordValue;
                totalImportedWeight += recordWeight;
            }
        }
    }

    // --- E. ADJUSTMENT & SAVE ---
    const adjustmentNeeded = livePoints - totalImportedValue;

    // 2. Insert Transaction 
    const { error: txError } = await supabase.from('wallet_transactions').insert({
        user_id: user.id, 
        merchant_id: merchantId, 
        amount: adjustmentNeeded,
        balance_after: livePoints, 
        transaction_type: 'MIGRATION_ADJUSTMENT', 
        description: adjustmentNeeded < 0 ? 'Legacy System Adjustment (Spent)' : 'Legacy System Adjustment (Correction)'
    });

    if (txError) {
        console.error("❌ Failed to insert Wallet Transaction:", txError.message);
        return res.status(500).json({ error: "DB Insert Failed: " + txError.message });
    }

    // 3. Record in Withdrawals Table if they spent points
    if (adjustmentNeeded < 0) {
        const withdrawalAmount = Math.abs(adjustmentNeeded);
        
        console.log(`📝 Recording legacy withdrawal of ${withdrawalAmount} pts`);

        await supabase.from('withdrawals').insert({
             user_id: user.id,
             merchant_id: merchantId,
             amount: withdrawalAmount,
             status: 'EXTERNAL_SYNC', 
             created_at: new Date().toISOString(),
             bank_name: 'Legacy System',
             account_number: 'MIGRATION',
             account_holder_name: profile?.data?.nikeName || 'System Migration'
        });
    }

    // 4. Update Merchant Wallet
    const { error: walletError } = await supabase.from('merchant_wallets').upsert({
        user_id: user.id, merchant_id: merchantId,
        current_balance: livePoints, 
        total_earnings: totalImportedValue 
    }, { onConflict: 'user_id, merchant_id' });

    if (walletError) {
        console.error("❌ Failed to update Wallet:", walletError.message);
        return res.status(500).json({ error: "DB Error: Could not update wallet. " + walletError.message });
    }

    // --- F. 🚨 CRITICAL: UPDATE USER PROFILE 🚨 ---
    // This was missing in your code!
    const { error: userUpdateError } = await supabase.from('users').update({
        lifetime_integral: livePoints,           // Sets the points
        total_weight: totalImportedWeight,       // Sets the weight
        last_synced_at: new Date().toISOString(),
        nickname: profile?.data?.nikeName || profile?.data?.name || 'User',
        avatar_url: profile?.data?.imgUrl || null,
        vendor_user_no: profile?.data?.userNo
    }).eq('id', user.id);

    if (userUpdateError) {
         console.error("❌ Failed to update User Profile:", userUpdateError.message);
         // Log but don't fail, as transactions are already recorded
    }

    return res.status(200).json({ success: true, balance: livePoints, migrated: true });

  } catch (error: any) {
    console.error("Onboarding Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

// Helper (Unchanged)
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
    } catch (e: any) { 
        console.error(`❌ AutoGCM Call Failed [${endpoint}]:`, e.message);
        return null; 
    }
}