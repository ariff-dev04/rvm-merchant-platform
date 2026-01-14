import { supabase } from '../services/supabase'; 
import { getUserRecords } from '../services/autogcm'; 
import { detectWasteType } from '../utils/wasteUtils';

// Configuration
const BATCH_SIZE = 10; // Process 10 users simultaneously
const SYNC_COOLDOWN_MINUTES = 2; // Prevent spamming api
const FETCH_LIMIT = 50; // Grab last 50 records (covers ~2-3 weeks of active recycling)

export const runHarvester = async (forceResync = false) => {
    try {
        console.log("🚜 [MERCHANT HARVESTER] Starting Parallel Sync...");
        
        // 1. Get Users (Only those who need syncing if not forced? 
        // For now we fetch all and filter in memory to save DB logic complexity)
        const { data: users } = await supabase
            .from('users')
            .select('id, phone, last_synced_at')
            .order('last_synced_at', { ascending: true, nullsFirst: true });
        
        if (!users || users.length === 0) return;

        // 2. Load Machine Map (Cache rates once)
        const { data: machines } = await supabase
            .from('machines')
            .select('device_no, merchant_id, rate_plastic, rate_can, rate_paper, rate_uco');
            
        const machineMap: Record<string, any> = {};
        machines?.forEach(m => {
            if (m?.device_no) machineMap[m.device_no] = m;
        });

        let totalImported = 0;
        const now = new Date();

        // 3. Process in Chunks (Batching)
        // This prevents blowing up the network with 400 simultaneous requests
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const chunk = users.slice(i, i + BATCH_SIZE);
            console.log(`⚡ Processing Batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} users)...`);

            // Run this chunk in parallel
            const results = await Promise.all(
                chunk.map(user => processSingleUser(user, machineMap, now, forceResync))
            );

            // Sum up results
            totalImported += results.reduce((acc, count) => acc + count, 0);
        }

        console.log(`✅ Harvester Complete. Imported ${totalImported} new records.`);

    } catch (err) {
        console.error("❌ Harvester Global Error:", err);
        throw err;
    }
};

// --------------------------------------------------------
// WORKER FUNCTION (Runs for one user)
// --------------------------------------------------------
async function processSingleUser(user: any, machineMap: any, now: Date, forceResync: boolean) {
    try {
        // A. Skip Check
        if (!forceResync && user.last_synced_at) {
            const diff = (now.getTime() - new Date(user.last_synced_at).getTime()) / 60000;
            if (diff < SYNC_COOLDOWN_MINUTES) return 0; // Skip
        }

        // B. Update Sync Time immediately (Optimistic Lock)
        // We do this to prevent another run picking this user up if this takes a while
        await supabase.from('users').update({ last_synced_at: now.toISOString() }).eq('id', user.id);

        // C. Fetch External API
        const apiRecords = await getUserRecords(user.phone, 1, FETCH_LIMIT);
        if (!apiRecords || apiRecords.length === 0) return 0;

        // D. Bulk Check Existing Records
        // Optimization: Instead of querying DB 50 times, query once for these 50 IDs
        const remoteIds = apiRecords.map((r: any) => r.id);
        const { data: existingRows } = await supabase
            .from('submission_reviews')
            .select('vendor_record_id')
            .in('vendor_record_id', remoteIds);

        const existingSet = new Set(existingRows?.map(r => r.vendor_record_id));
        let userImportCount = 0;

        // E. Filter & Prepare Inserts
        const recordsToInsert = [];

        for (const record of apiRecords) {
            if (existingSet.has(record.id)) continue; // Skip duplicates

            const machine = machineMap[record.deviceNo];
            if (!machine) continue; // Skip unknown machines

            const weight = Number(record.weight || 0);
            
            // Waste Type Logic
            let wasteType = 'Plastic';
            if (record.rubbishLogDetailsVOList?.[0]) {
                 wasteType = detectWasteType(record.rubbishLogDetailsVOList[0].rubbishName);
            }

            // Rate Calculation
            let rate = 0;
            const typeKey = wasteType.toLowerCase();
            if (typeKey.includes('paper') || typeKey.includes('kertas')) rate = Number(machine.rate_paper || 0);
            else if (typeKey.includes('uco') || typeKey.includes('minyak')) rate = Number(machine.rate_uco || 0);
            else if (typeKey.includes('plastic') || typeKey.includes('plastik')) rate = Number(machine.rate_plastic || 0);
            else if (typeKey.includes('can') || typeKey.includes('tin')) rate = Number(machine.rate_can || 0);

            const calculatedValue = Number((weight * rate).toFixed(2));

            // Push to batch array
            recordsToInsert.push({
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
            
            userImportCount++;
        }

        // F. Bulk Insert (One DB Call per user instead of 50)
        if (recordsToInsert.length > 0) {
            const { error } = await supabase.from('submission_reviews').insert(recordsToInsert);
            if (error) console.error(`Failed insert for ${user.phone}`, error);
        }

        return userImportCount;

    } catch (err) {
        console.error(`Error processing user ${user.phone}:`, err);
        return 0;
    }
}