import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { getMachineConfig } from '../services/autogcm';
import { useAuthStore } from './auth';

export interface DashboardMachine {
  deviceNo: string;
  name: string;
  address: string;
  zone: string;
  maintenanceContact: string;
  googleMapsUrl: string;
  isOnline: boolean;
  statusText: string;
  statusCode: number;
  compartments: any[];
}

export const useMachineStore = defineStore('machines', () => {
  // State
  const machines = ref<DashboardMachine[]>([]);
  const loading = ref(false);
  const lastUpdated = ref<number>(0);
  
  // 🔥 NEW: Track who owns the current data
  const lastFetchedMerchantId = ref<string | null>(null);
  
  const CACHE_DURATION = 5 * 60 * 1000;

  // Helpers
  const mapTypeToLabel = (apiName: string) => {
    if (!apiName) return { label: "General", color: "bg-gray-100 text-gray-600" };
    const lower = apiName.toLowerCase();
    
    if (lower.includes("oil") || lower.includes("minyak") || lower.includes("uco")) {
        return { label: "UCO (Oil)", color: "bg-orange-100 text-orange-800 border-orange-200" };
    }
    if (lower.includes("paper") || lower.includes("kertas")) {
        return { label: "Paper", color: "bg-blue-100 text-blue-800 border-blue-200" };
    }
    if (lower.includes("plastic") || lower.includes("botol") || lower.includes("plastik")) {
        return { label: "Plastic/Alu", color: "bg-green-100 text-green-800 border-green-200" };
    }
    return { label: apiName, color: "bg-gray-100 text-gray-600 border-gray-200" };
  };

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // --- ACTION: Fetch Machines ---
  const fetchMachines = async (forceRefresh = false) => {
    const auth = useAuthStore();
    
    // 1. SECURITY WIPE: If no user is logged in, clear everything.
    if (!auth.merchantId) {
      console.warn("MachineStore: No Merchant ID. Clearing data.");
      machines.value = [];
      lastFetchedMerchantId.value = null;
      return;
    }

    // 2. CONTEXT CHECK: Did we switch accounts?
    if (lastFetchedMerchantId.value !== auth.merchantId) {
      console.log("MachineStore: Merchant switched! Wiping old data...");
      machines.value = []; // <--- 🔥 THIS LINE FIXES YOUR BUG
      lastFetchedMerchantId.value = null;
      forceRefresh = true; // Force a new fetch
    }

    // 3. CACHE CHECK
    const now = Date.now();
    if (!forceRefresh && machines.value.length > 0 && (now - lastUpdated.value < CACHE_DURATION)) {
      return; // Return cached data ONLY if it belongs to the current merchant
    }

    loading.value = true;
    const tempMachines: DashboardMachine[] = [];

    try {
      // 4. FETCH DATA (Strictly for current Merchant)
      const { data: dbMachines, error } = await supabase
        .from('machines')
        .select('*, merchant:merchants(config_bin_1, config_bin_2)') 
        .eq('merchant_id', auth.merchantId) // Strict Filter
        .eq('is_active', true)
        .order('zone', { ascending: true });

      if (error) throw error;

      // 5. UPDATE TRACKER
      // We claim this data belongs to the current user
      lastFetchedMerchantId.value = auth.merchantId;

      if (!dbMachines) {
         machines.value = [];
         return;
      }

      // --- LOOP LOGIC (Same as before) ---
      for (const dbMachine of dbMachines) {
        let apiRes = null;
        let isOnline = false;
        let statusCode = 0; 
        let statusText = "Offline";
        
        try {
             apiRes = await getMachineConfig(dbMachine.device_no);
             if (apiRes && apiRes.code === 200) isOnline = true;
        } catch (e) { /* Ignore */ }

        const apiConfigs = apiRes?.data || [];
        const rawWeight1 = Number(dbMachine.current_bag_weight || 0);
        const rawWeight2 = Number(dbMachine.current_weight_2 || 0);
        
        // Bin 1
        const bin1Config = apiConfigs.find((c: any) => c.positionNo === 1) || {};
        const weight1 = bin1Config.weight ? Number(bin1Config.weight) : rawWeight1;
        const isFull1 = bin1Config.isFull === true || bin1Config.isFull === "true"; 
        
        let percent1 = bin1Config.rate ? Math.round(Number(bin1Config.rate)) : 0;
        if (isFull1) percent1 = 100;
        else if (percent1 === 0 && weight1 > 0) {
             // Heuristic calculation if rate is missing
             const label1 = mapTypeToLabel(bin1Config.rubbishTypeName || dbMachine.merchant?.config_bin_1 || "Bin 1").label;
             const capacity = (label1.includes("Oil") || label1.includes("UCO")) ? 400 : 25;
             percent1 = Math.round((weight1 / capacity) * 100);
             if (percent1 > 100) percent1 = 100;
        }

        const bin1 = {
            label: mapTypeToLabel(bin1Config.rubbishTypeName || dbMachine.merchant?.config_bin_1 || "Bin 1").label,
            color: mapTypeToLabel(bin1Config.rubbishTypeName || dbMachine.merchant?.config_bin_1 || "Bin 1").color,
            weight: weight1.toFixed(2),
            percent: percent1,
            isFull: isFull1 
        };

        // Bin 2
        const bin2Config = apiConfigs.find((c: any) => c.positionNo === 2) || {};
        const weight2 = bin2Config.weight ? Number(bin2Config.weight) : rawWeight2;
        const isFull2 = bin2Config.isFull === true || bin2Config.isFull === "true";

        let percent2 = bin2Config.rate ? Math.round(Number(bin2Config.rate)) : 0;
        if (isFull2) percent2 = 100;
        else if (percent2 === 0 && weight2 > 0) {
             percent2 = Math.round((weight2 / 50) * 100); 
             if (percent2 > 100) percent2 = 100;
        }

        const bin2 = {
            label: mapTypeToLabel(bin2Config.rubbishTypeName || dbMachine.merchant?.config_bin_2 || "Bin 2").label,
            color: mapTypeToLabel(bin2Config.rubbishTypeName || dbMachine.merchant?.config_bin_2 || "Bin 2").color,
            weight: weight2.toFixed(2),
            percent: percent2,
            isFull: isFull2
        };

        const compartments = [bin1];
        if (!dbMachine.name.toLowerCase().includes('uco')) {
            compartments.push(bin2);
        }

        // Status
        const hasFault = apiConfigs.some((c: any) => c.status === 2 || c.status === 3);
        const hasActivity = apiConfigs.some((c: any) => c.status === 1);
        const anyBinFull = compartments.some(c => c.isFull);

        if (!isOnline) { statusCode = 0; statusText = "Offline"; }
        else if (anyBinFull) { statusCode = 4; statusText = "Bin Full"; } 
        else if (hasFault) { statusCode = 3; statusText = "Maintenance"; }
        else if (hasActivity) { statusCode = 1; statusText = "In Use"; }
        else { statusCode = 0; statusText = "Online"; }

        // Sync
        if (isOnline) {
             const w1 = Number(bin1.weight);
             const w2 = Number(bin2.weight);
             if (Math.abs(w1 - rawWeight1) > 0.05 || Math.abs(w2 - rawWeight2) > 0.05) {
                 await supabase.from('machines').update({ 
                     current_bag_weight: w1, 
                     current_weight_2: w2 
                 }).eq('id', dbMachine.id);
             }
        }

        let mapsUrl = "#";
        if (dbMachine.latitude && dbMachine.longitude) {
           mapsUrl = `http://googleusercontent.com/maps.google.com/?q=${dbMachine.latitude},${dbMachine.longitude}`;
        }

        tempMachines.push({
          deviceNo: dbMachine.device_no,
          name: dbMachine.name,
          address: dbMachine.address,
          zone: dbMachine.zone || 'General',
          maintenanceContact: dbMachine.maintenance_contact || 'Unassigned',
          googleMapsUrl: mapsUrl,
          isOnline,
          statusCode,
          statusText,
          compartments
        });
        
        await sleep(100); 
      }

      machines.value = tempMachines;
      lastUpdated.value = Date.now();

    } catch (err) {
      console.error("Store Error:", err);
    } finally {
      loading.value = false;
    }
  };

  // Reset function for manual use
  const reset = () => {
      machines.value = [];
      lastFetchedMerchantId.value = null;
      lastUpdated.value = 0;
  };

  return { machines, loading, fetchMachines, lastUpdated, reset, lastFetchedMerchantId };
});