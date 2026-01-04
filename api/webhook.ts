import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS & Method Check
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const data = req.body;

  try {
    // ------------------------------------------------------------------
    // 🔥 STEP 0: RAW LOGGING
    // ------------------------------------------------------------------
    const { error: logError } = await supabase.from('machine_logs').insert({
        device_no: String(data.deviceNo || 'UNKNOWN'),
        type: data.type || 'UNKNOWN',
        vendor_user_no: data.userId ? String(data.userId) : null,
        payload: data
    });

    if (logError) console.error("⚠️ Failed to save raw log:", logError.message);

    // ------------------------------------------------------------------
    // MAIN LOGIC
    // ------------------------------------------------------------------
    if (data.type === 'PUT') {
      const { 
        userId, deviceNo, putId, totalWeight, integral, phone, imgUrl, 
        userRubbishPutDetailsVOList 
      } = data;

      // ------------------------------------------------------------------
      // 1. MACHINE & RATE LOOKUP (FIXED: maybeSingle)
      // ------------------------------------------------------------------
      // ⚠️ FIX: Changed .single() to .maybeSingle() to prevent crashes if machine not found
      const { data: machineState, error: machineError } = await supabase
        .from('machines')
        .select('id, current_bag_weight, current_weight_2, merchant_id, rate_plastic, rate_can, rate_paper, rate_uco')
        .eq('device_no', String(deviceNo))
        .maybeSingle(); 

      if (machineError) console.warn("⚠️ Machine Lookup Error:", machineError.message);

      let merchantId = null;
      let rateConfig: any = {};

      if (machineState) {
        merchantId = machineState.merchant_id;
        rateConfig = machineState; 

        // --- BIN CLEANING LOGIC ---
        const items = userRubbishPutDetailsVOList || [];
        if (items.length === 0 && data.positionWeight) {
            items.push({ positionId: '1', rubbishName: 'UCO', positionWeight: data.positionWeight });
        }
        for (const item of items) {
            const binId = String(item.positionId || '1');
            const currentLevel = Number(item.positionWeight || 0);
            const wasteType = item.rubbishName || 'Unknown';
            const CLEANING_THRESHOLD_KG = 0.5;

            if (binId === '1') {
                const lastWeight = Number(machineState.current_bag_weight || 0);
                if (lastWeight > CLEANING_THRESHOLD_KG && currentLevel < 1.0 && currentLevel < lastWeight) {
                    await logCleaning(deviceNo, wasteType, lastWeight, imgUrl);
                }
                await supabase.from('machines').update({ current_bag_weight: currentLevel }).eq('id', machineState.id);
            } else if (binId === '2') {
                const lastWeight = Number(machineState.current_weight_2 || 0);
                if (lastWeight > CLEANING_THRESHOLD_KG && currentLevel < 1.0 && currentLevel < lastWeight) {
                    await logCleaning(deviceNo, wasteType, lastWeight, imgUrl);
                }
                await supabase.from('machines').update({ current_weight_2: currentLevel }).eq('id', machineState.id);
            }
        }
      } else {
          console.warn(`⚠️ Machine not found in DB: ${deviceNo} (Continuing to save record...)`);
      }

      // ------------------------------------------------------------------
      // 2. USER SUBMISSION & REGISTRATION LOGIC
      // ------------------------------------------------------------------
      let internalUserId = null;
      const machineUserId = userId ? String(userId) : null;
      const userPhone = phone ? String(phone) : null;

      if (machineUserId || userPhone) {
          let existingUser = null;
          // A. Try Match by Vendor ID
          if (machineUserId) {
              const { data: vendorMatch } = await supabase.from('users').select('id, phone, vendor_user_no').eq('vendor_user_no', machineUserId).maybeSingle();
              if (vendorMatch) existingUser = vendorMatch;
          }
          // B. Try Match by Phone
          if (!existingUser && userPhone) {
               const { data: phoneMatch } = await supabase.from('users').select('id, phone, vendor_user_no').eq('phone', userPhone).maybeSingle();
               if (phoneMatch) existingUser = phoneMatch;
          }
          // C. Update or Create
          if (existingUser) {
              internalUserId = existingUser.id;
              const updates: any = {};
              if (!existingUser.vendor_user_no && machineUserId) updates.vendor_user_no = machineUserId;
              if (Object.keys(updates).length > 0) await supabase.from('users').update(updates).eq('id', internalUserId);
          } else {
              const { data: newUser } = await supabase.from('users').insert({
                    vendor_user_no: machineUserId,
                    phone: userPhone,
                    is_active: true,
                    nickname: 'New User'
                }).select('id').single();
              if (newUser) internalUserId = newUser.id;
          }
      }

      // ------------------------------------------------------------------
      // 3. ROBUST VALUATION LOGIC
      // ------------------------------------------------------------------
      const primaryItem = userRubbishPutDetailsVOList?.[0] || {};
      const rawWasteName = (primaryItem.rubbishName || 'Unknown').toLowerCase();
      const weight = Number(totalWeight || 0);
      
      let detectedType = 'Plastic';
      let appliedRate = 0;

      if (rawWasteName.includes('paper') || rawWasteName.includes('kertas')) {
          detectedType = 'Paper';
          appliedRate = Number(rateConfig.rate_paper || 0);
      } else if (rawWasteName.includes('uco') || rawWasteName.includes('oil') || rawWasteName.includes('minyak')) {
          detectedType = 'UCO';
          appliedRate = Number(rateConfig.rate_uco || 0);
      } else if (rawWasteName.includes('can') || rawWasteName.includes('tin') || rawWasteName.includes('aluminium')) {
          detectedType = 'Can';
          appliedRate = Number(rateConfig.rate_can || 0);
      } else {
          detectedType = 'Plastic';
          appliedRate = Number(rateConfig.rate_plastic || 0);
      }

      const calculatedMoney = weight * appliedRate;
      const machinePoints = Number(integral || 0);
      // ✅ If rate found, status becomes VERIFIED
      const isVerified = machinePoints > 0 || calculatedMoney > 0;

      // ------------------------------------------------------------------
      // 4. SAVE RECORD
      // ------------------------------------------------------------------
      const { error: saveError } = await supabase
        .from('submission_reviews')
        .upsert([
          {
            vendor_record_id: String(putId),
            user_id: internalUserId,
            phone: userPhone,
            merchant_id: merchantId, 
            device_no: deviceNo,
            waste_type: detectedType,
            api_weight: weight,
            confirmed_weight: isVerified ? weight : 0,
            calculated_value: calculatedMoney, 
            rate_per_kg: appliedRate,
            machine_given_points: machinePoints,
            photo_url: imgUrl,
            status: isVerified ? 'VERIFIED' : 'PENDING',
            source: 'WEBHOOK',
            submitted_at: new Date().toISOString(),
            bin_weight_snapshot: Number(primaryItem.positionWeight || data.positionWeight || 0)
          }
        ], { onConflict: 'vendor_record_id' });

      if (saveError) console.error("❌ Save Error:", saveError.message);
    }

    return res.status(200).json({ msg: "Success" });

  } catch (error: any) {
    console.error("Webhook Critical Error:", error.message);
    return res.status(200).json({ error: "Logged" });
  }
}

async function logCleaning(deviceNo: string, type: string, weight: number, url: string) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('cleaning_records').insert([{
        device_no: deviceNo, waste_type: type, bag_weight_collected: weight,
        cleaned_at: new Date().toISOString(), photo_url: url, status: 'PENDING' 
    }]);
}