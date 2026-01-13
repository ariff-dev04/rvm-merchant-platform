import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import crypto from 'crypto';

// 🟢 CONFIGURATION
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!; 
const SECRET = process.env.VITE_API_SECRET!;        
const MERCHANT_NO = process.env.VITE_MERCHANT_NO!;
const API_BASE = "https://api.autogcm.com";
// Helper to silence logs in production
const log = (...args: any[]) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(...args);
  }
};

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

  const debugLog: any[] = []; 

  try {
    // 1. Get User (ADD nickname to selection)
    const { data: user } = await supabase
        .from('users')
        .select('id, phone, nickname, avatar_url') // ✅ Fetch existing profile
        .eq('phone', phone)
        .single();

        if (!user) return res.status(404).json({ error: 'User not found in DB' });
    
    // 2. Check Migration
    const { data: existing } = await supabase.from('wallet_transactions')
        .select('id').eq('user_id', user.id).eq('transaction_type', 'MIGRATION_ADJUSTMENT').maybeSingle();
    if (existing) return res.status(200).json({ msg: "Already onboarded", debugLog });

    // 3. Vendor Data
    // LOGIC FIX: Use existing nickname if available, otherwise default to 'User'
    const nameToSync = (user.nickname && user.nickname !== 'New User') ? user.nickname : 'User';
    const avatarToSync = user.avatar_url || '';

    const profile = await callAutoGCM('/api/open/v1/user/account/sync', 'POST', { 
        phone, 
        nikeName: nameToSync, // Send the CORRECT name
        avatarUrl: avatarToSync 
    });

    if (!profile || !profile.data) return res.status(502).json({ error: "Vendor API Failed" });
    const livePoints = Number(profile?.data?.integral || 0);

    // 4. Fetch History
    let historyList: any[] = [];
    let pageNum = 1;
    const pageSize = 100;
    let hasNext = true;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    
    log(`📡 Fetching history for ${phone}...`);
    
    while (hasNext) {
        const res = await callAutoGCM('/api/open/v1/put', 'GET', { 
            phone, pageNum, pageSize, startTime: '2020-01-01', endTime: todayStr
        });
        const list = res?.data?.list || [];
        if (list.length > 0) {
            historyList = [...historyList, ...list];
            const total = res?.data?.total || 0;
            if (historyList.length >= total || list.length < pageSize) hasNext = false;
            else pageNum++;
        } else {
            hasNext = false;
        }
    }

    debugLog.push({ step: "Fetch Complete", totalItems: historyList.length });

    // --- 🔥 FIX STARTS HERE: LOAD MACHINE MAP ---
    
    // A. Get Default Merchant (Smart Fallback)
    // 1. First, try to find "Meranti" specifically (or your main operation merchant)
    let fallbackMerchantId = null;
    
    const { data: preferredMerchant } = await supabase
        .from('merchants')
        .select('id')
        .ilike('name', '%Meranti%') // Change 'Meranti' to your actual main merchant name
        .maybeSingle();

    if (preferredMerchant) {
        fallbackMerchantId = preferredMerchant.id;
    } else {
        // 2. If Meranti doesn't exist, grab the first one available
        const { data: anyMerchant } = await supabase.from('merchants').select('id').limit(1).single();
        if (!anyMerchant) return res.status(500).json({ error: "No merchants found in DB" });
        fallbackMerchantId = anyMerchant.id;
    }

    // B. Build Machine -> Merchant Map
    const { data: machines } = await supabase.from('machines').select('device_no, merchant_id');
    const machineMap: Record<string, string> = {};
    if (machines) {
        machines.forEach(m => {
            if (m.device_no) machineMap[m.device_no] = m.merchant_id;
        });
    }
    
    debugLog.push({ step: "Machine Map Loaded", mapSize: Object.keys(machineMap).length });

    // CHANGE 1: Define the Tracker here
    const merchantStats = new Map<string, { earnings: number, weight: number }>();

    let totalImportedValue = 0;
    let totalImportedWeight = 0;

    // --- FIX END ---

    // 6. PROCESS LOOP
    for (const record of historyList) {
        const recordValue = Number(Number(record.integral || 0).toFixed(2));
        const recordWeight = Number(Number(record.totalWeight || record.weight || 0).toFixed(2));
        
        // Extract Fields
        const deviceNo = record.deviceNo || null;
        const recordPhone = record.phonenumber || null; 
        
        let photoUrl = null;
        if (record.imgUrl) photoUrl = record.imgUrl.split(',')[0];
        
        let wasteType = 'Unknown';
        if (record.rubbishLogDetailsVOList && record.rubbishLogDetailsVOList.length > 0) {
            const detail = record.rubbishLogDetailsVOList[0];
            if (detail.rubbishName) wasteType = detail.rubbishName;
            if (!photoUrl && detail.imgUrl) photoUrl = detail.imgUrl;
        }

        let ratePerKg = 0;
        if (recordWeight > 0) ratePerKg = Number((recordValue / recordWeight).toFixed(3)); 

        // --- 🔥 FIX: RESOLVE CORRECT MERCHANT ---
        // If we know the device, use its owner. Otherwise use fallback.
        let correctMerchantId = fallbackMerchantId;
        if (deviceNo && machineMap[deviceNo]) {
            correctMerchantId = machineMap[deviceNo];
        }

        // 🔥 CHANGE 2: Update Stats for this specific merchant
        const stats = merchantStats.get(correctMerchantId) || { earnings: 0, weight: 0 };
        stats.earnings += recordValue;
        stats.weight += recordWeight;
        merchantStats.set(correctMerchantId, stats);

        // ID Logic
        let rawId = record.id || record.putId;
        let putId = rawId ? String(rawId) : "";
        
        if (!putId || putId === "undefined" || putId === "null") {
            const uniqueSuffix = new Date(record.createTime || Date.now()).getTime(); 
            putId = `MANUAL-${uniqueSuffix}-${Math.floor(recordWeight * 100)}-${Math.random().toString(36).substring(7)}`;
            debugLog.push({ warning: "Generated fallback ID", newId: putId });
        }

        // DB Operations
        const { data: existingRecord } = await supabase.from('submission_reviews')
            .select('id, status')
            .eq('vendor_record_id', putId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (existingRecord) {
             if (existingRecord.status === 'PENDING') {
                await supabase.from('submission_reviews').update({
                    status: 'VERIFIED',
                    source: 'MIGRATION',
                    calculated_value: recordValue,
                    confirmed_weight: recordWeight,
                    reviewed_at: new Date().toISOString(),
                    device_no: deviceNo,
                    waste_type: wasteType,
                    photo_url: photoUrl,
                    phone: recordPhone,
                    rate_per_kg: ratePerKg,
                    merchant_id: correctMerchantId // ✅ Use Correct Merchant
                }).eq('id', existingRecord.id);
                
                totalImportedValue = Number((totalImportedValue + recordValue).toFixed(2));
                totalImportedWeight = Number((totalImportedWeight + recordWeight).toFixed(2));
            } else {
                totalImportedValue = Number((totalImportedValue + recordValue).toFixed(2));
                totalImportedWeight = Number((totalImportedWeight + recordWeight).toFixed(2));
            }
        } else {
            const { error: insertError } = await supabase.from('submission_reviews').insert({
                user_id: user.id, 
                merchant_id: correctMerchantId, // Use Correct Merchant
                vendor_record_id: putId,
                status: 'VERIFIED',
                calculated_value: recordValue, 
                waste_type: wasteType,
                source: 'MIGRATION', 
                submitted_at: new Date(record.createTime || Date.now()).toISOString(),
                api_weight: recordWeight,
                confirmed_weight: recordWeight,
                machine_given_points: recordValue,
                device_no: deviceNo,
                photo_url: photoUrl,
                phone: recordPhone,
                rate_per_kg: ratePerKg
            });

            if (insertError) {
                debugLog.push({ error: "Insert Failed", id: putId, msg: insertError.message });
            } else {
                totalImportedValue = Number((totalImportedValue + recordValue).toFixed(2));
                totalImportedWeight = Number((totalImportedWeight + recordWeight).toFixed(2));
            }
        }
    }

    // --- E. ADJUSTMENT & SAVE ---
    
    // 🟢 FIX: Round to 2 decimal places to ignore floating point dust
    // Before: 0.31 - 0.31000000000000005 = -5.55e-17 (Triggers spending logic)
    // After:  Number((-5.55e-17).toFixed(2)) = 0 (Correct!)
    const adjustmentNeeded = Number((livePoints - totalImportedValue).toFixed(2));

    // Only log transaction if there is a real difference
    if (adjustmentNeeded !== 0) {
        await supabase.from('wallet_transactions').insert({
            user_id: user.id, 
            merchant_id: fallbackMerchantId, 
            amount: adjustmentNeeded,
            balance_after: livePoints, 
            transaction_type: 'MIGRATION_ADJUSTMENT', 
            description: adjustmentNeeded < 0 ? 'Legacy System Adjustment (Spent)' : 'Legacy System Balance'
        });
    }

    // Only create withdrawal if user actually owes money (Real negative balance)
    if (adjustmentNeeded < 0) {
        await supabase.from('withdrawals').insert({
             user_id: user.id,
             merchant_id: fallbackMerchantId,
             amount: Math.abs(adjustmentNeeded),
             status: 'EXTERNAL_SYNC', 
             created_at: new Date().toISOString(),
             bank_name: 'Legacy System',
             account_number: 'MIGRATION',
             account_holder_name: profile?.data?.nikeName || 'System Migration'
        });
    }

    // 🔥 CHANGE 3: Create Wallets for EACH Merchant found
    for (const [merchantId, stats] of merchantStats.entries()) {
        await supabase.from('merchant_wallets').upsert({
            user_id: user.id,
            merchant_id: merchantId,
            current_balance: Number(stats.earnings.toFixed(2)), 
            total_earnings: Number(stats.earnings.toFixed(2)),
            total_weight: Number(stats.weight.toFixed(2))
        }, { onConflict: 'user_id, merchant_id' });
    }

    // 4. Apply Adjustment to Fallback Wallet Only
    if (adjustmentNeeded !== 0) {
        const { data: fallbackWallet } = await supabase.from('merchant_wallets')
            .select('current_balance')
            .eq('user_id', user.id)
            .eq('merchant_id', fallbackMerchantId)
            .single();

        const currentBal = fallbackWallet ? Number(fallbackWallet.current_balance) : 0;
        
        await supabase.from('merchant_wallets').update({
            current_balance: currentBal + adjustmentNeeded
        }).eq('user_id', user.id).eq('merchant_id', fallbackMerchantId);
    }

    // Only use Vendor name if local is "New User", "RVM User", or missing.
    // 1. Determine Name: Trust Local DB if valid, otherwise fallback to Vendor
    const currentName = user.nickname;
    const isLocalNameValid = currentName && currentName !== 'New User' && currentName !== 'RVM User';
    
    const finalNickname = isLocalNameValid 
        ? currentName // Keep "Google Name"
        : (profile?.data?.nikeName || profile?.data?.name || 'User'); // Fallback

    // 2. Determine Avatar: Trust Local DB if valid
    const finalAvatar = user.avatar_url 
        ? user.avatar_url 
        : (profile?.data?.imgUrl || profile?.data?.avatarUrl);

    // 3. Update DB
    await supabase.from('users').update({
        lifetime_integral: livePoints,
        total_weight: Number(totalImportedWeight.toFixed(2)),
        last_synced_at: new Date().toISOString(),
        nickname: finalNickname, 
        vendor_user_no: profile?.data?.userNo,
        avatar_url: finalAvatar
    }).eq('id', user.id);

    const isProduction = process.env.NODE_ENV === 'production';
    return res.status(200).json({ 
        success: true, 
        balance: livePoints, 
        migrated: true,
        debug_log: isProduction ? undefined : debugLog
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