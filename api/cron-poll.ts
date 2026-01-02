// api/cron-poll.ts
import { createClient } from '@supabase/supabase-js';
import { getMachineConfig } from '../src/services/autogcm'; // Ensure this path is correct for serverless

// Initialize Supabase (Service Role is crucial for server-side updates)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export default async function handler(req, res) {
  // Security Check (Prevent random people from triggering it)
  if (req.query.key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log("⏰ Starting Machine Polling...");

    // 1. Fetch All Active Machines from DB
    const { data: machines, error } = await supabase
      .from('machines')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;

    let updatesCount = 0;
    let cleaningEvents = 0;

    // 2. Loop through each machine
    for (const machine of machines) {
      // Fetch Live Data from Vendor API
      const apiRes = await getMachineConfig(machine.device_no);
      
      if (!apiRes || apiRes.code !== 200) {
        console.warn(`Failed to fetch API for ${machine.device_no}`);
        continue;
      }

      const bins = apiRes.data || [];
      
      // --- BIN 1 PROCESSING ---
      const bin1 = bins.find((b: any) => b.positionNo === 1);
      if (bin1) {
        await processBin(machine, 1, bin1.weight, machine.current_bag_weight);
      }

      // --- BIN 2 PROCESSING ---
      const bin2 = bins.find((b: any) => b.positionNo === 2);
      if (bin2) {
        await processBin(machine, 2, bin2.weight, machine.current_weight_2);
      }
      
      updatesCount++;
    }

    return res.status(200).json({ 
      success: true, 
      machinesChecked: updatesCount, 
      cleaningEventsDetected: cleaningEvents 
    });

  } catch (err: any) {
    console.error("Cron Job Failed:", err.message);
    return res.status(500).json({ error: err.message });
  }

  // Helper Function to process logic per bin
  async function processBin(machine: any, position: number, liveWeightStr: string, dbWeightNum: number) {
      const liveWeight = Number(liveWeightStr || 0);
      const dbWeight = Number(dbWeightNum || 0);
      
      // THRESHOLD: How much weight drop counts as a "Cleaning"? (e.g. > 2kg drop)
      const DROP_THRESHOLD = 2.0; 
      
      // LOGIC: Did weight drop significantly?
      if (dbWeight - liveWeight > DROP_THRESHOLD) {
          console.log(`🧹 CLEANING DETECTED! ${machine.device_no} Bin ${position}: ${dbWeight}kg -> ${liveWeight}kg`);
          
          // 1. Record the Event
          await supabase.from('cleaning_records').insert({
              device_no: machine.device_no,
              merchant_id: machine.merchant_id,
              waste_type: position === 1 ? machine.config_bin_1 : machine.config_bin_2,
              bag_weight_collected: dbWeight, // We record what was THERE before it was emptied
              cleaned_at: new Date().toISOString(),
              cleaner_name: 'System Detected (Auto)',
              status: 'PENDING'
          });
          
          cleaningEvents++;
      }

      // 2. Update DB with new baseline (Always sync)
      // Only update if difference is noticeable (> 0.05kg) to reduce DB writes
      if (Math.abs(liveWeight - dbWeight) > 0.05) {
          const updateField = position === 1 ? 'current_bag_weight' : 'current_weight_2';
          await supabase
            .from('machines')
            .update({ [updateField]: liveWeight })
            .eq('id', machine.id);
      }
  }
}