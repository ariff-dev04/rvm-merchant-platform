<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useUserProfile } from '../composables/useUserProfile'; // Logic imported
import { RefreshCw, ArrowLeft, CreditCard, Hash } from 'lucide-vue-next';

const route = useRoute();
const activeTab = ref<'earned' | 'spent'>('earned');

// Initialize logic with current route ID
const userId = route.params.id as string;
const { user, disposalHistory, withdrawalHistory, loading, isSyncing, syncData } = useUserProfile(userId);

// Watch for route changes (if user navigates between profiles)
watch(() => route.params.id, (newId) => {
    // You might need to re-init logic or just call fetchProfile() if logic handles it
    if(newId) location.reload(); // Simple way to reset composable state for now
});
</script>

<template>
  <div v-if="loading || !user" class="p-10 text-center text-gray-500">Loading profile...</div>

  <div v-else class="space-y-6">
    <RouterLink to="/users" class="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 transition-colors">
        <ArrowLeft :size="16" class="mr-1" /> Back to Users
    </RouterLink>
    
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          
          <div class="flex items-center space-x-4">
              <div class="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200 overflow-hidden">
                  <img v-if="user.avatar_url" :src="user.avatar_url" class="h-full w-full object-cover" />
                  <span v-else class="text-2xl">👤</span>
              </div>
              <div>
                  <h1 class="text-2xl font-bold text-gray-900">{{ user.nickname || 'Unknown User' }}</h1>
                  <div class="flex items-center text-gray-500 text-sm mt-1">
                      <span class="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs mr-2">{{ user.phone }}</span>
                      <span v-if="user.vendor_user_no" class="text-xs">Ext ID: {{ user.vendor_user_no }}</span>
                  </div>
              </div>
          </div>

          <div class="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              <div class="text-right">
                  <div class="text-xs text-gray-500 uppercase tracking-wide font-semibold">Recycled</div>
                  <div class="text-xl font-bold text-slate-700">{{ user.total_weight || 0 }} kg</div>
              </div>
              <div class="text-right border-l pl-6 border-gray-100">
                  <div class="text-xs text-gray-500 uppercase tracking-wide font-semibold">Points</div>
                  <div class="text-3xl font-bold text-blue-600">{{ user.lifetime_integral ?? 0 }}</div>
              </div>
              
              <button @click="syncData" :disabled="isSyncing" class="flex items-center justify-center h-10 px-4 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-all active:scale-95">
                  <RefreshCw :size="16" :class="{'animate-spin': isSyncing, 'mr-2': true}" />
                  {{ isSyncing ? 'Syncing...' : 'Sync' }}
              </button>
          </div>
      </div>

      <div class="mt-6 pt-4 border-t border-gray-50 flex gap-6 text-xs text-gray-400">
          <div class="flex items-center">
             <CreditCard :size="12" class="mr-1.5" /> Card: {{ user.card_no || '-' }}
          </div>
          <div class="flex items-center">
             <Hash :size="12" class="mr-1.5" /> Int ID: {{ user.vendor_internal_id || '-' }}
          </div>
          <div class="ml-auto">
             Last Synced: {{ user.last_synced_at ? new Date(user.last_synced_at).toLocaleString() : 'Never' }}
          </div>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden min-h-[400px]">
      <div class="border-b border-gray-100 flex">
          <button @click="activeTab = 'earned'" :class="`flex-1 py-4 text-center text-sm font-medium border-b-2 transition-colors ${activeTab === 'earned' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:bg-gray-50'}`">Recycling History</button>
          <button @click="activeTab = 'spent'" :class="`flex-1 py-4 text-center text-sm font-medium border-b-2 transition-colors ${activeTab === 'spent' ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:bg-gray-50'}`">Withdrawals</button>
      </div>

      <div class="p-0">
          <div v-if="activeTab === 'earned'" class="overflow-x-auto">
              <table class="w-full text-left">
                  <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                          <th class="px-6 py-3">Time</th>
                          <th class="px-6 py-3">Machine</th>
                          <th class="px-6 py-3">Weight</th>
                          <th class="px-6 py-3 text-right">Points</th>
                      </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                      <tr v-if="disposalHistory.length === 0"><td colspan="4" class="p-6 text-center text-gray-400">No records found</td></tr>
                      <tr v-for="d in disposalHistory" :key="d.id" class="hover:bg-gray-50">
                          <td class="px-6 py-3 text-sm text-gray-600">{{ d.createTime }}</td>
                          <td class="px-6 py-3 text-sm text-gray-500 font-mono">{{ d.deviceNo }}</td>
                          <td class="px-6 py-3 text-sm font-bold">{{ d.weight }} kg</td>
                          <td class="px-6 py-3 text-sm text-right font-bold text-green-600">+{{ d.integral }}</td>
                      </tr>
                  </tbody>
              </table>
          </div>
          
          <div v-if="activeTab === 'spent'" class="overflow-x-auto">
               <table class="w-full text-left">
                  <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr><th class="px-6 py-3">Date</th><th class="px-6 py-3">Amount</th><th class="px-6 py-3">Status</th></tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                      <tr v-if="withdrawalHistory.length === 0"><td colspan="3" class="p-6 text-center text-gray-400">No withdrawals found</td></tr>
                      <tr v-for="w in withdrawalHistory" :key="w.id" class="hover:bg-gray-50">
                          <td class="px-6 py-3 text-sm text-gray-600">{{ new Date(w.created_at).toLocaleString() }}</td>
                          <td class="px-6 py-3 text-sm font-bold text-red-600">-{{ w.amount }}</td>
                          <td class="px-6 py-3 text-sm">{{ w.status }}</td>
                      </tr>
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  </div>
</template>