<script setup lang="ts">
import { onMounted } from 'vue';
import { useMachineStore } from '../stores/machines'; // Import the new store
import { storeToRefs } from 'pinia';
import { RefreshCcw, MonitorSmartphone, MapPin, Wifi, WifiOff, AlertTriangle, Phone, ExternalLink } from 'lucide-vue-next';

// 1. Initialize Store
const machineStore = useMachineStore();
// 2. Extract Reactive Data
const { machines, loading } = storeToRefs(machineStore);

// 3. Fetch on Mount (The store decides if it needs to hit the API or use Cache)
onMounted(() => {
  machineStore.fetchMachines();
});

// 4. Force Refresh Button
const handleRefresh = () => {
  machineStore.fetchMachines(true); // Pass true to force API call
};

// UI Helpers (Keep these for badge colors)
const getStatusBadge = (code: number) => {
  switch (code) {
    case 0: return 'bg-green-100 text-green-800 border-green-200';
    case 1: return 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse';
    case 3: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 4: return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
         <h1 class="text-2xl font-bold text-gray-900 flex items-center">
           <MonitorSmartphone class="mr-3 text-green-600" :size="28" />
           Machine Status
         </h1>
         <p class="text-gray-500 mt-1">Real-time monitoring of {{ machines.length }} RVM units</p>
      </div>
      <button 
        @click="handleRefresh"
        :disabled="loading"
        class="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50"
      >
        <RefreshCcw :size="14" :class="{ 'animate-spin': loading }" />
        <span>Refresh Data</span>
      </button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold tracking-wider">
            <tr>
              <th class="px-6 py-4">Status & Zone</th>
              <th class="px-6 py-4">Location Details</th>
              <th class="px-6 py-4">Bins (Real-Time)</th>
              <th class="px-6 py-4">Device ID</th>      <th class="px-6 py-4 text-right">Support</th> </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="loading && machines.length === 0">
               <td colspan="5" class="px-6 py-10 text-center text-gray-400">Syncing with machines...</td>
            </tr>

            <tr v-for="m in machines" :key="m.deviceNo" class="hover:bg-gray-50/80 transition-colors">
              
              <td class="px-6 py-5 align-top">
                 <div class="flex flex-col gap-2 items-start">
                    <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusBadge(m.statusCode)}`">
                      <Wifi v-if="m.isOnline" :size="10" class="mr-1.5" /> 
                      <WifiOff v-else :size="10" class="mr-1.5" /> 
                      {{ m.statusText }}
                    </span>
                    <span class="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                      {{ m.zone }} Area
                    </span>
                 </div>
              </td>

              <td class="px-6 py-5 align-top">
                <div class="font-bold text-gray-900">{{ m.name }}</div>
                <div class="flex items-start text-xs text-gray-500 mt-1 max-w-xs">
                   <MapPin :size="12" class="mr-1 mt-0.5 flex-shrink-0" />
                   {{ m.address }}
                </div>
                <a v-if="m.googleMapsUrl !== '#'" 
                   :href="m.googleMapsUrl" 
                   target="_blank"
                   class="inline-flex items-center mt-2 text-xs text-blue-600 hover:underline hover:text-blue-800 transition-colors">
                   View on Map <ExternalLink :size="10" class="ml-1" />
                </a>
              </td>

              <td class="px-6 py-5 align-top">
                <div v-if="m.compartments.length > 0" class="flex gap-2 flex-wrap">
                  <div v-for="(bin, idx) in m.compartments" :key="idx" 
                       :class="`px-2 py-1 rounded text-xs font-medium border ${bin.color} flex items-center`">
                     {{ bin.label }}: {{ bin.percent }}%
                     <AlertTriangle v-if="bin.isFull" :size="12" class="ml-1 text-red-600" />
                  </div>
                </div>
                <div v-else class="text-xs text-gray-400 italic">No detailed data</div>
              </td>

              <td class="px-6 py-5 align-top">
                <span class="font-mono text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-200 select-all">
                  {{ m.deviceNo }}
                </span>
              </td>

              <td class="px-6 py-5 align-top text-right">
                <div class="inline-flex items-center text-xs font-medium bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                  <Phone :size="12" class="mr-1.5" /> {{ m.maintenanceContact }}
                </div>
              </td>

            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>