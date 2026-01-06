import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

// 🟢 CONFIGURATION
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const SECRET = process.env.VITE_AUTOGCM_SECRET!;     // Ensure these env vars exist in Backend Vercel
const MERCHANT_NO = process.env.VITE_AUTOGCM_MERCHANT_NO!;
const API_BASE = "https://api.autogcm.com";

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS Headers (Allow your Frontend to talk to this Backend)
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Or put 'https://your-rvm-web-url.vercel.app'
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone is required' });

  try {
    console.log(`🚀 Starting Onboarding for: ${phone}`);

    // --- A. GET USER ---
    const { data: user } = await supabase.from('users').select('id').eq('phone', phone).single();
    if (!user) return res.status(404).json({ error: 'User not found in DB' });

    // --- B. CHECK IF ALREADY MIGRATED ---
    const { data: existing } = await supabase.from('wallet_transactions')
        .select('id').eq('user_id', user.id).eq('type', 'MIGRATION_ADJUSTMENT').maybeSingle();
    
    if (existing) return res.status(200).json({ msg: "Already onboarded" });

    // --- C. FETCH VENDOR DATA ---
    // 1. Live Points
    const profile = await callAutoGCM('/api/open/v1/user/account/sync', 'POST', { phone, nikeName: 'User', avatarUrl: '' });
    const livePoints = Number(profile?.data?.integral || 0);

    // 2. History
    const historyRes = await callAutoGCM('/api/open/v1/put', 'GET', { phone, pageNum: 1, pageSize: 100 });
    const historyList = historyRes?.data?.list || [];

    // --- D. IMPORT & CALCULATE ---
    let totalImportedValue = 0;
    const { data: merchant } = await supabase.from('merchants').select('id').limit(1).single();
    const merchantId = merchant?.id;

    for (const record of historyList) {
        const recordValue = Number(record.integral || 0);
        const putId = String(record.putId);

        // Check if we already have this record
        const { data: existingRecord } = await supabase.from('submission_reviews')
            .select('id, status').eq('vendor_record_id', putId).maybeSingle();

        if (existingRecord) {
            if (existingRecord.status === 'VERIFIED') totalImportedValue += recordValue;
        } else {
            // New Record -> Insert as VERIFIED
            await supabase.from('submission_reviews').insert({
                user_id: user.id, merchant_id: merchantId, vendor_record_id: putId,
                status: 'VERIFIED', calculated_value: recordValue, waste_type: 'Unknown',
                source: 'MIGRATION', submitted_at: new Date().toISOString(),
                api_weight: record.totalWeight, confirmed_weight: record.totalWeight
            });
            totalImportedValue += recordValue;
        }
    }

    // --- E. ADJUSTMENT & SAVE ---
    const adjustmentNeeded = livePoints - totalImportedValue;

    await supabase.from('wallet_transactions').insert({
        user_id: user.id, merchant_id: merchantId, amount: adjustmentNeeded,
        type: 'MIGRATION_ADJUSTMENT', status: 'COMPLETED',
        description: adjustmentNeeded < 0 ? 'Legacy System Adjustment' : 'Legacy System Balance'
    });

    await supabase.from('merchant_wallets').upsert({
        user_id: user.id, merchant_id: merchantId,
        current_balance: livePoints, total_earnings: totalImportedValue
    }, { onConflict: 'user_id, merchant_id' });

    return res.status(200).json({ success: true, balance: livePoints });

  } catch (error: any) {
    console.error("Onboarding Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

// Helper Function (Same as Proxy Logic)
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
    } catch (e) { return null; }
}