// src/stores/machines.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { getMachineConfig } from '../services/autogcm';
import { useAuthStore } from './auth'; // <--- Import Auth

// ... (Keep DashboardMachine interface export) ...
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
  const machines = ref<DashboardMachine[]>([]);
  const loading = ref(false);
  const lastUpdated = ref<number>(0);
  const CACHE_DURATION = 5 * 60 * 1000;

  // ... (Keep mapTypeToLabel and sleep helpers) ...
  const mapTypeToLabel = (apiName: string) => {
    // Handle null/undefined safely
    if (!apiName) return { label: "General", color: "bg-gray-100 text-gray-600" };
    
    const lower = apiName.toLowerCase();
    
    // 🔥 Improved Detection Logic
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

const fetchMachines = async (forceRefresh = false) => {
    const auth = useAuthStore();
    
    const now = Date.now();
    if (!forceRefresh && machines.value.length > 0 && (now - lastUpdated.value < CACHE_DURATION)) {
      return;
    }

    loading.value = true;
    const tempMachines: DashboardMachine[] = [];

    try {
      let query = supabase
        .from('machines')
        .select('*, merchant:merchants(config_bin_1, config_bin_2)') 
        .eq('is_active', true)
        .order('zone', { ascending: true });

      if (auth.merchantId) {
          query = query.eq('merchant_id', auth.merchantId);
      }

      const { data: dbMachines, error } = await query;
      if (error || !dbMachines) throw new Error("DB Error");

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

        // DB Fallbacks
        const rawWeight1 = Number(dbMachine.current_bag_weight || 0);
        const rawWeight2 = Number(dbMachine.current_weight_2 || 0);
        
        // --- BIN 1 LOGIC ---
        const bin1Config = apiConfigs.find((c: any) => c.positionNo === 1) || {};
        const weight1 = bin1Config.weight ? Number(bin1Config.weight) : rawWeight1;
        const isFull1 = bin1Config.isFull === true || bin1Config.isFull === "true"; 
        
        // Percent: Trust API Rate unless it's weird or forced full
        let percent1 = bin1Config.rate ? Math.round(Number(bin1Config.rate)) : 0;
        
        if (isFull1) {
            percent1 = 100; 
        } else {
            // If Rate is 0 but we have weight, do manual calc
            if (percent1 === 0 && weight1 > 0) {
                const label1 = mapTypeToLabel(bin1Config.rubbishTypeName || dbMachine.merchant?.config_bin_1 || "Bin 1").label;
                if (label1.includes("Oil") || label1.includes("UCO")) {
                    percent1 = Math.round((weight1 / 400) * 100); // 400kg assumption
                } else {
                    percent1 = Math.round((weight1 / 25) * 100); // 25kg assumption
                }
                if (percent1 > 100) percent1 = 100;
            }
        }

        const bin1 = {
            label: mapTypeToLabel(bin1Config.rubbishTypeName || dbMachine.merchant?.config_bin_1 || "Bin 1").label,
            color: mapTypeToLabel(bin1Config.rubbishTypeName || dbMachine.merchant?.config_bin_1 || "Bin 1").color,
            weight: weight1.toFixed(2),
            percent: percent1,
            isFull: isFull1 
        };

        // --- BIN 2 LOGIC ---
        const bin2Config = apiConfigs.find((c: any) => c.positionNo === 2) || {};
        const weight2 = bin2Config.weight ? Number(bin2Config.weight) : rawWeight2;
        const isFull2 = bin2Config.isFull === true || bin2Config.isFull === "true";

        let percent2 = bin2Config.rate ? Math.round(Number(bin2Config.rate)) : 0;
        
        if (isFull2) {
            percent2 = 100;
        } else if (percent2 === 0 && weight2 > 0) {
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

        // --- COMPARTMENTS ---
        const compartments = [bin1];
        if (!dbMachine.name.toLowerCase().includes('uco')) {
            compartments.push(bin2);
        }

        // --- STATUS LOGIC (CRITICAL FIX) ---
        const hasFault = apiConfigs.some((c: any) => c.status === 2 || c.status === 3);
        const hasActivity = apiConfigs.some((c: any) => c.status === 1);
        
        // 🔥 STRICT CHECK: Only trigger "Bin Full" if the SENSOR (isFull) says so.
        // We do NOT check percent >= 100 anymore.
        const anyBinFull = compartments.some(c => c.isFull);

        if (!isOnline) { statusCode = 0; statusText = "Offline"; }
        else if (anyBinFull) { statusCode = 4; statusText = "Bin Full"; } 
        else if (hasFault) { statusCode = 3; statusText = "Maintenance"; }
        else if (hasActivity) { statusCode = 1; statusText = "In Use"; }
        else { statusCode = 0; statusText = "Online"; }

        // --- DB SYNC ---
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

  return { machines, loading, fetchMachines, lastUpdated };
});