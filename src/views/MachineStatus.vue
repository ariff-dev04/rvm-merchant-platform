<script setup lang="ts">
import { onMounted } from 'vue';
import { useMachineStore } from '../stores/machines'; 
import { storeToRefs } from 'pinia';
import { RefreshCcw, MonitorSmartphone, MapPin, Wifi, WifiOff, AlertTriangle, Phone } from 'lucide-vue-next';

// 1. Initialize Store
const machineStore = useMachineStore();
// 2. Extract Reactive Data
const { machines, loading } = storeToRefs(machineStore);

// 3. Fetch on Mount
onMounted(() => {
  machineStore.fetchMachines();
});

// 4. Force Refresh Button
const handleRefresh = () => {
  machineStore.fetchMachines(true); 
};

// UI Helpers
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
              <th class="px-6 py-4">Device ID</th>
              <th class="px-6 py-4">Bin Level (%)</th>
              <th class="px-6 py-4">Current Weight</th> 
              <th class="px-6 py-4 text-right">Support</th> 
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="loading && machines.length === 0">
                <td colspan="6" class="px-6 py-10 text-center text-gray-400">Syncing with machines...</td>
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
                        {{ m.address || 'No address set' }}
                    </div>
                </td>

                <td class="px-6 py-5 align-top">
                    <span class="font-mono text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-200 select-all">
                        {{ m.deviceNo }}
                    </span>
                </td>

                <td class="px-6 py-5 align-top">
                    <div class="flex flex-col gap-2">
                        <div v-for="(bin, idx) in m.compartments" :key="idx" 
                                :class="`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${bin.color} flex items-center justify-between w-full max-w-[150px]`">
                            <div class="flex items-center w-full justify-between">
                                <span class="font-bold truncate mr-2">{{ bin.label }}</span>
                                <div class="flex items-center">
                                    <span>{{ bin.percent }}%</span>
                                    <AlertTriangle v-if="bin.isFull" :size="12" class="ml-1 text-red-600 animate-pulse" />
                                </div>
                            </div>
                        </div>
                    </div>
                </td>

                <td class="px-6 py-5 align-top">
                    <div class="flex flex-col gap-2">
                        <div v-for="(bin, idx) in m.compartments" :key="idx" 
                                class="px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold border border-gray-200 bg-white text-gray-700 flex items-center justify-end w-full max-w-[100px]">
                            {{ bin.weight }} kg
                        </div>
                    </div>
                </td>

                <td class="px-6 py-5 align-top text-right">
                    <div v-if="m.maintenanceContact" class="inline-flex items-center text-xs font-medium bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                        <Phone :size="12" class="mr-1.5" /> {{ m.maintenanceContact }}
                    </div>
                    <div v-else class="text-xs text-gray-400">-</div>
                </td>

            </tr>
        </tbody>
        </table>
      </div>
    </div>
  </div>
</template>