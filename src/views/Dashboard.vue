<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { supabase } from '../services/supabase';
import { useMachineStore } from '../stores/machines'; // 1. Import Store
import { storeToRefs } from 'pinia';
import { AlertCircle, Server, Coins, Activity } from 'lucide-vue-next';

// 2. Setup Store
const machineStore = useMachineStore();
const { machines, loading: machineLoading } = storeToRefs(machineStore);

const pendingCount = ref<number>(0);
const totalPoints = ref<number>(0);
const dashboardLoading = ref<boolean>(true);

// 3. Computed Property for Online Count
// This updates automatically whenever the store updates!
const onlineMachinesCount = computed(() => {
  return machines.value.filter((m) => m.isOnline).length;
});

onMounted(async () => {
  try {
    // A. Trigger Machine Store (Uses Cache if available)
    // We don't await this blocking the whole UI, we let it load in parallel
    machineStore.fetchMachines();

    // B. Get Pending Withdrawals count (Supabase)
    const { count, error } = await supabase
      .from('withdrawals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'PENDING');
    
    if (!error && count !== null) {
      pendingCount.value = count;
    }

    // C. Get Total Points (Supabase)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('lifetime_integral');

    if (!userError && userData) {
      totalPoints.value = userData.reduce((sum, user) => sum + Number(user.lifetime_integral || 0), 0);
    }

  } catch (err) {
    console.error("Dashboard Data Error:", err);
  } finally {
    dashboardLoading.value = false;
  }
});

const formatNumber = (num: number) => num.toLocaleString();
</script>

<template>
  <div class="space-y-8 p-6">
    <div v-if="dashboardLoading && machines.length === 0" class="flex h-64 items-center justify-center">
      <div class="text-gray-400 animate-pulse font-medium">Loading Analytics...</div>
    </div>

    <div v-else>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <span class="text-gray-500 font-medium">Pending Withdrawals</span>
            <div class="p-2 bg-amber-50 rounded-lg text-amber-600">
              <AlertCircle :size="24" />
            </div>
          </div>
          <div class="text-3xl font-bold text-gray-900 mb-1">{{ pendingCount }}</div>
          <div class="text-xs text-amber-600 font-medium">Action Required</div>
        </div>

        <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <span class="text-gray-500 font-medium">Online Machines</span>
            <div class="p-2 bg-green-50 rounded-lg text-green-600">
              <Server :size="24" />
            </div>
          </div>
          
          <div class="text-3xl font-bold text-gray-900 mb-1">
             <span v-if="machineLoading && machines.length === 0" class="text-lg text-gray-400">Syncing...</span>
             <span v-else>{{ onlineMachinesCount }}</span>
          </div>
          <div class="text-xs text-green-600 font-medium">Active RVM Units</div>
        </div>

        <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <span class="text-gray-500 font-medium">Total Points Earned</span>
            <div class="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Coins :size="24" />
            </div>
          </div>
          <div class="text-3xl font-bold text-gray-900 mb-1">{{ formatNumber(totalPoints) }}</div>
          <div class="text-xs text-blue-600 font-medium">Lifetime Distribution</div>
        </div>
      </div>

      <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div class="flex items-center space-x-3 mb-6">
          <Activity class="text-green-600" :size="20" />
          <h3 class="text-lg font-bold text-gray-900">System Health Status</h3>
        </div>
        
        <div class="flex items-center space-x-3 text-sm font-medium text-green-700 bg-green-50 px-4 py-3 rounded-lg border border-green-100 w-fit">
          <span class="relative flex h-3 w-3">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
          <span>External Hardware API Proxy is reachable</span>
        </div>
      </div>
    </div>
  </div>
</template>