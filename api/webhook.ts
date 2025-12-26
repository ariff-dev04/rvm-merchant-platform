import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const data = req.body;

  try {
    if (data.type === 'PUT') {
      const { 
        userId, deviceNo, putId, totalWeight, integral, phone, imgUrl, 
        userRubbishPutDetailsVOList 
      } = data;

      // ------------------------------------------------------------------
      // 1. MACHINE MEMORY LOGIC (Track Bin Weights & Detect Cleaning)
      // ------------------------------------------------------------------
      const { data: machineState } = await supabase
        .from('machines')
        .select('id, current_bag_weight, current_weight_2')
        .eq('device_no', String(deviceNo))
        .single();

      if (machineState) {
        const items = userRubbishPutDetailsVOList || [];
        
        // Handle UCO (Empty list fallback)
        if (items.length === 0 && data.positionWeight) {
            items.push({
                positionId: '1', 
                rubbishName: 'UCO', 
                positionWeight: data.positionWeight
            });
        }

        for (const item of items) {
            const binId = String(item.positionId || '1');
            const currentLevel = Number(item.positionWeight || 0);
            const wasteType = item.rubbishName || 'Unknown';

            // Bin 1 (Plastic/UCO)
            if (binId === '1') {
                const lastWeight = Number(machineState.current_bag_weight || 0);
                if (lastWeight > 3.0 && currentLevel < 1.0) {
                    console.log(`🧹 BIN 1 CLEANING (${deviceNo}): ${lastWeight}kg -> ${currentLevel}kg`);
                    await logCleaning(deviceNo, wasteType, lastWeight, imgUrl, 'Bin 1 (Plastic/UCO)');
                }
                await supabase.from('machines').update({ current_bag_weight: currentLevel }).eq('id', machineState.id);
            } 
            // Bin 2 (Paper)
            else if (binId === '2') {
                const lastWeight = Number(machineState.current_weight_2 || 0);
                if (lastWeight > 3.0 && currentLevel < 1.0) {
                    console.log(`🧹 BIN 2 CLEANING (${deviceNo}): ${lastWeight}kg -> ${currentLevel}kg`);
                    await logCleaning(deviceNo, wasteType, lastWeight, imgUrl, 'Bin 2 (Paper)');
                }
                await supabase.from('machines').update({ current_weight_2: currentLevel }).eq('id', machineState.id);
            }
        }
      } else {
          console.warn(`⚠️ Machine not found: ${deviceNo}`);
      }

      // ------------------------------------------------------------------
      // 2. USER SUBMISSION & REGISTRATION LOGIC (The New Part)
      // ------------------------------------------------------------------
      console.log("📝 [SUBMISSION]: Processing User Points...");

      let internalUserId = null;
      const machineUserId = userId ? String(userId) : null;
      const userPhone = phone ? String(phone) : null;

      if (machineUserId || userPhone) {
          let existingUser = null;

          // A. Try Match by Vendor ID (Primary)
          if (machineUserId) {
              const { data: vendorMatch } = await supabase
                  .from('users')
                  .select('id, phone, vendor_user_no')
                  .eq('vendor_user_no', machineUserId)
                  .maybeSingle();
              if (vendorMatch) existingUser = vendorMatch;
          }

          // B. Try Match by Phone (Secondary)
          if (!existingUser && userPhone) {
               const { data: phoneMatch } = await supabase
                  .from('users')
                  .select('id, phone, vendor_user_no')
                  .eq('phone', userPhone)
                  .maybeSingle();
               if (phoneMatch) existingUser = phoneMatch;
          }

          // C. Update or Create
          if (existingUser) {
              internalUserId = existingUser.id;
              // "Heal" missing info
              const updates: any = {};
              if (!existingUser.vendor_user_no && machineUserId) updates.vendor_user_no = machineUserId;
              if (!existingUser.phone && userPhone) updates.phone = userPhone;
              
              if (Object.keys(updates).length > 0) {
                  await supabase.from('users').update(updates).eq('id', internalUserId);
              }
          } else {
              // Create New "Ghost User"
              const { data: newUser } = await supabase
                .from('users')
                .insert({
                    vendor_user_no: machineUserId,
                    phone: userPhone,
                    is_active: true
                })
                .select('id')
                .single();
              if (newUser) internalUserId = newUser.id;
          }
      }

      // ------------------------------------------------------------------
      // 3. SAVE RECORD
      // ------------------------------------------------------------------
      const primaryItem = userRubbishPutDetailsVOList?.[0] || {};
      const primaryBinLevel = Number(primaryItem.positionWeight || data.positionWeight || 0);

      await supabase
        .from('submission_reviews')
        .upsert([
          {
            vendor_record_id: String(putId),
            user_id: internalUserId,
            phone: userPhone,
            device_no: deviceNo,
            waste_type: primaryItem.rubbishName || 'Unknown',
            api_weight: totalWeight,
            machine_given_points: integral,
            photo_url: imgUrl,
            status: 'PENDING',
            source: 'WEBHOOK',
            submitted_at: new Date().toISOString(),
            bin_weight_snapshot: primaryBinLevel
          }
        ], { onConflict: 'vendor_record_id' });
    }

    return res.status(200).json({ msg: "Success" });

  } catch (error: any) {
    console.error("Webhook Error:", error.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Helper function
async function logCleaning(deviceNo: string, type: string, weight: number, url: string, binName: string) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('cleaning_records').insert([{
        device_no: deviceNo,
        waste_type: type,
        bag_weight_collected: weight,
        cleaned_at: new Date().toISOString