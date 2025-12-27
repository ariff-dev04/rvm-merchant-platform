import { supabase } from '../services/supabase'; 
import { getUserRecords, getMachineConfig } from '../services/autogcm'; 
import { THEORETICAL_CONSTANTS, UCO_DEVICE_IDS, detectWasteType } from '../utils/wasteUtils';

export const runHarvester = async () => {
    try {
        console.log("🚜 [HARVESTER] Starting...");
        
        // 1. Get Users (Prioritize those who haven't been synced recently)
        const { data: users } = await supabase
            .from('users')
            .select('id, phone, nickname, last_synced_at')
            .order('last_synced_at', { ascending: true, nullsFirst: true });
        
        if (!users || users.length === 0) {
            console.log("⚠️ [HARVESTER] No users found in DB.");
            return;
        }

        console.log(`🔎 [HARVESTER] Checking ${users.length} users...`);
        const machineCache: Record<string, any[]> = {};
        let newRecordsCount = 0;
        const now = new Date();

        for (const user of users) {
            // OPTIMIZATION: Skip if synced less than 2 minutes ago
            // This prevents "useless fetching" as you requested
            if (user.last_synced_at) {
                const lastSync = new Date(user.last_synced_at);
                const diffMinutes = (now.getTime() - lastSync.getTime()) / 60000;
                if (diffMinutes < 2) {
                    console.log(`   ⏭️ Skipping ${user.phone} (Synced recently)`);
                    continue; 
                }
            }

            console.log(`   > Checking User: ${user.phone}...`);
            
            // Update timestamp so we don't check them again immediately
            await supabase.from('users').update({ last_synced_at: now.toISOString() }).eq('id', user.id);

            const apiRecords = await getUserRecords(user.phone, 1, 10);
            
            if (!apiRecords || apiRecords.length === 0) continue;

            for (const record of apiRecords) {
                // Check if record exists
                const { data: existing } = await supabase
                    .from('submission_reviews')
                    .select('id, status')
                    .eq('vendor_record_id', record.id)
                    .maybeSingle();

                const machinePoints = Number(record.integral || 0);

                if (!existing) {
                    // NEW RECORD
                    console.log(`   ✨ FOUND NEW: ${record.deviceNo} | ${record.weight}kg`);
                    await processSingleRecord(record, user, machineCache);
                    newRecordsCount++;
                } else {
                    // EXISTING RECORD - FIX STUCK PENDING
                    // If it is PENDING but the machine actually gave points, VERIFY IT.
                    if (existing.status === 'PENDING' && machinePoints > 0) {
                        console.log(`   🔄 AUTO-VERIFYING stuck record: ${record.deviceNo}`);
                        
                        const { error: updateError } = await supabase.from('submission_reviews').update({
                            status: 'VERIFIED',
                            confirmed_weight: record.weight,
                            calculated_points: machinePoints,
                            machine_given_points: machinePoints,
                            reviewed_at: new Date().toISOString()
                        }).eq('id', existing.id);

                        if (updateError) console.error("   ❌ Update Failed (Check RLS):", updateError.message);
                    }
                }
            }
        }
        console.log(`✅ [HARVESTER] Done. Imported ${newRecordsCount} new.`);

    } catch (err) {
        console.error("❌ [HARVESTER] Failed:", err);
        throw err;
    }
};

async function processSingleRecord(record: any, user: any, machineCache: Record<string, any[]>) {
    let detailName = "";
    let detailPositionId = "";
    
    // 1. Extract Details
    if (record.rubbishLogDetailsVOList && record.rubbishLogDetailsVOList.length > 0) {
        const detail = record.rubbishLogDetailsVOList[0];
        detailName = detail.rubbishName || "";
        detailPositionId = detail.positionId || "";
    }

    // 2. Get/Cache Machine Config
    if (!machineCache[record.deviceNo]) {
        const config = await getMachineConfig(record.deviceNo);
        machineCache[record.deviceNo] = (config && config.data) ? config.data : [];
    }
    const machineBins = machineCache[record.deviceNo] || [];

    // 3. Identify Waste Type
    let finalWasteType = "Unknown";
    if (detailName) {
        finalWasteType = detectWasteType(detailName);
    } else if (detailPositionId) {
        if (UCO_DEVICE_IDS.includes(record.deviceNo)) finalWasteType = 'UCO';
        else if (String(detailPositionId) === '2') finalWasteType = 'Paper';
        else if (String(detailPositionId) === '1') finalWasteType = 'Plastik / Aluminium';
    }

    // 4. Find Rate
    let finalRate = 0;
    const matchedBin = machineBins.find((bin: any) => {
        if (detailPositionId && (String(bin.rubbishType) === String(detailPositionId))) return true;
        const binName = bin.rubbishTypeName?.toLowerCase() || '';
        return binName.includes(finalWasteType.toLowerCase());
    });

    if (matchedBin) {
        finalRate = matchedBin.integral > 0 ? matchedBin.integral : matchedBin.amount;
    } else if (record.weight > 0) {
        const totalVal = Number(record.integral) || Number(record.amount) || 0;
        finalRate = totalVal / Number(record.weight);
    }

    // 5. Calculate Theoretical
    const safeTypeStr = finalWasteType || 'plastic';
    const typeKey = safeTypeStr.toLowerCase().split('/')[0]?.trim() || 'plastic';
    const unitWeight = THEORETICAL_CONSTANTS[typeKey] || 0.05;
    const theoretical = (Number(record.weight) / unitWeight) * unitWeight;

    // 🔥 LOGIC: AUTO-VERIFY NEW RECORDS
    const machinePoints = Number(record.integral || 0);
    
    // If machine gave points, assume it is valid and Verified.
    const isVerified = machinePoints > 0; 

    // 6. Insert into DB
    const { error } = await supabase.from('submission_reviews').insert({
        vendor_record_id: record.id,
        user_id: user.id,
        phone: user.phone,
        device_no: record.deviceNo,
        waste_type: finalWasteType, 
        api_weight: record.weight,
        photo_url: record.imgUrl, 
        submitted_at: record.createTime,
        theoretical_weight: theoretical.toFixed(3),
        rate_per_kg: finalRate.toFixed(4), 
        
        // ✅ AUTO-VERIFY HERE
        status: isVerified ? 'VERIFIED' : 'PENDING',
        confirmed_weight: isVerified ? record.weight : 0, 
        calculated_points: machinePoints, 
        
        bin_weight_snapshot: record.positionWeight || 0, 
        machine_given_points: machinePoints,
        source: 'FETCH'
    });

    if (error) console.error("Insert Error:", error.message);
}