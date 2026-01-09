import { supabase } from '../services/supabase'; 
import { getUserRecords } from '../services/autogcm'; 
import { detectWasteType } from '../utils/wasteUtils';

export const runHarvester = async () => {
    try {
        console.log("🚜 [MERCHANT HARVESTER] Starting...");
        
        // 1. Get Users
        const { data: users } = await supabase
            .from('users')
            .select('id, phone, last_synced_at')
            .order('last_synced_at', { ascending: true, nullsFirst: true });
        
        if (!users || users.length === 0) return;

        let newRecordsCount = 0;
        const now = new Date();

        // 2. Load Machine Map (🔥 NOW FETCHING RATES FROM MACHINES TABLE)
        // We no longer need to fetch merchant rates here, just the merchant_id for linkage
        const { data: machines } = await supabase
            .from('machines')
            .select('device_no, merchant_id, rate_plastic, rate_can, rate_paper, rate_uco, config_bin_1, config_bin_2');
            
        const machineMap: Record<string, any> = {};
        machines?.forEach(m => {
            if (m && m.device_no) {
                 machineMap[m.device_no] = m; // Store the whole machine object with rates
            }
        });

        // 3. Process Users
        for (const user of users) {
            // ... (keep sync time check logic) ...
            if (user.last_synced_at) {
                const diff = (now.getTime() - new Date(user.last_synced_at).getTime()) / 60000;
                if (diff < 2) continue; 
            }
            await supabase.from('users').update({ last_synced_at: now.toISOString() }).eq('id', user.id);

            const apiRecords = await getUserRecords(user.phone, 1, 50);
            if (!apiRecords || apiRecords.length === 0) continue;

            for (const record of apiRecords) {
                const { data: existing } = await supabase
                    .from('submission_reviews')
                    .select('id')
                    .eq('vendor_record_id', record.id)
                    .maybeSingle();

                if (existing) continue; 

                // Machine Logic
                const machine = machineMap[record.deviceNo];
                if (!machine) continue; 

                const weight = Number(record.weight || 0);
                
                // Detect Type
                let wasteType = 'Plastic';
                if (record.rubbishLogDetailsVOList?.[0]) {
                     const rawName = record.rubbishLogDetailsVOList[0].rubbishName;
                     wasteType = detectWasteType(rawName);
                }

                // ---------------------------------------------------------
                // NEW: CALCULATE VALUE USING MACHINE SPECIFIC RATES
                // ---------------------------------------------------------
                let rate = 0;
                const typeKey = wasteType.toLowerCase();

                if (typeKey.includes('paper') || typeKey.includes('kertas')) {
                    rate = Number(machine.rate_paper || 0);
                } 
                else if (typeKey.includes('uco') || typeKey.includes('oil') || typeKey.includes('minyak')) {
                    rate = Number(machine.rate_uco || 0);
                }
                else if (typeKey.includes('plastic') || typeKey.includes('plastik') || typeKey.includes('botol')) {
                    rate = Number(machine.rate_plastic || 0);
                }
                else if (typeKey.includes('can') || typeKey.includes('tin') || typeKey.includes('aluminium')) {
                    rate = Number(machine.rate_can || 0);
                }

                // FIX 1: ROUND HERE IMMEDIATELY
                const calculatedValue = Number((weight * rate).toFixed(2));

                console.log(`   ✨ NEW: ${weight}kg ${wasteType} @ Machine Rate ${rate} = ${calculatedValue}`);

                await supabase.from('submission_reviews').insert({
                    vendor_record_id: record.id,
                    user_id: user.id,
                    phone: user.phone,
                    merchant_id: machine.merchant_id,      
                    device_no: record.deviceNo,
                    waste_type: wasteType,
                    api_weight: weight,
                    calculated_value: calculatedValue, 
                    rate_per_kg: rate,
                    photo_url: record.imgUrl,
                    submitted_at: record.createTime,
                    status: 'PENDING',             
                    source: 'FETCH'
                });

                newRecordsCount++;
            }
        }
        console.log(`✅ Done. Imported ${newRecordsCount} records.`);

    } catch (err) {
        console.error("❌ Harvester Failed:", err);
    }
};