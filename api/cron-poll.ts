import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APP_URL = 'https://rvm-merchant-platform.vercel.app';

// ✅ Fix 1: Added ': any' to req and res to stop TypeScript complaints
export default async function handler(req: any, res: any) {
  
  // Security Check
  if (req.query.key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch Active Machines
    const { data: machines, error } = await supabase
      .from('machines')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;

    let updatesCount = 0;
    let cleaningEvents = 0;

    // Loop through machines
    for (const machine of machines) {
      try {
        const proxyRes = await fetch(`${APP_URL}/api/proxy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint: '/api/open/v1/device/position',
                method: 'GET',
                params: { deviceNo: machine.device_no }
            })
        });

        const apiRes = await proxyRes.json();
        const bins = (apiRes && apiRes.data) ? apiRes.data : [];

        // --- BIN 1 PROCESSING ---
        const bin1 = Array.isArray(bins) ? bins.find((b: any) => b.positionNo === 1) : null;
        if (bin1) {
          // ✅ Fix 2: We now wait for the result (true/false) instead of trying to modify the variable inside the helper
          const wasCleaned = await processBin(machine, 1, bin1.weight, machine.current_bag_weight);
          if (wasCleaned) cleaningEvents++;
        }

        // --- BIN 2 PROCESSING ---
        const bin2 = Array.isArray(bins) ? bins.find((b: any) => b.positionNo === 2) : null;
        if (bin2) {
          const wasCleaned = await processBin(machine, 2, bin2.weight, machine.current_weight_2);
          if (wasCleaned) cleaningEvents++;
        }

        updatesCount++;

      } catch (innerErr) {
        console.error(`Error processing ${machine.device_no}:`, innerErr);
      }
    }

    return res.status(200).json({ 
      success: true, 
      machinesChecked: updatesCount, 
      cleaningEventsDetected: cleaningEvents 
    });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// --- HELPER FUNCTION (Now Clean & Isolated) ---
// Returns TRUE if a cleaning event was recorded, FALSE otherwise
async function processBin(machine: any, position: number, liveWeightStr: string, dbWeightNum: number): Promise<boolean> {
    const liveWeight = Number(liveWeightStr || 0);
    const dbWeight = Number(dbWeightNum || 0);
    const DROP_THRESHOLD = 2.0; 
    
    const diff = dbWeight - liveWeight;
    let cleaningDetected = false;

    // 1. Detect Drop (Cleaning Event)
    if (diff > DROP_THRESHOLD) {
        
        // Cooldown Check: Prevent duplicates from the last 45 mins
        const timeWindow = new Date(Date.now() - 45 * 60 * 1000).toISOString();
        const wasteType = position === 1 ? machine.config_bin_1 : machine.config_bin_2;

        const { data: recentLogs } = await supabase
            .from('cleaning_records')
            .select('id')
            .eq('device_no', machine.device_no)
            .eq('waste_type', wasteType)
            .gt('cleaned_at', timeWindow)
            .limit(1);

        if (!recentLogs || recentLogs.length === 0) {
            console.log(`🧹 Cleaning Detected: ${machine.device_no}`);
            
            await supabase.from('cleaning_records').insert({
                device_no: machine.device_no,
                merchant_id: machine.merchant_id,
                waste_type: wasteType,
                bag_weight_collected: dbWeight,
                cleaned_at: new Date().toISOString(),
                cleaner_name: 'System Detected (Auto)',
                status: 'PENDING'
            });
            
            cleaningDetected = true; // ✅ Signal to main loop to increment counter
        } else {
            console.log(`⚠️ Duplicate Prevented for ${machine.device_no}`);
        }
    }

    // 2. FORCE SYNC DB
    if (Math.abs(liveWeight - dbWeight) > 0.05) {
        const updateField = position === 1 ? 'current_bag_weight' : 'current_weight_2';
        await supabase
          .from('machines')
          .update({ [updateField]: liveWeight })
          .eq('id', machine.id);
    }

    return cleaningDetected;
}