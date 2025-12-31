<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useUserProfile } from '../composables/useUserProfile'; 
import { RefreshCw, ArrowLeft, CreditCard, Hash } from 'lucide-vue-next';

const route = useRoute();
const activeTab = ref<'earned' | 'spent'>('earned');

// Initialize logic with current route ID
const userId = route.params.id as string;
// 🔥 CHANGED: Destructure 'recyclingHistory' instead of 'disposalHistory'
const { user, recyclingHistory, withdrawalHistory, loading, isSyncing, syncData, auditResult } = useUserProfile(userId);

// Watch for route changes
watch(() => route.params.id, (newId) => {
    if(newId) location.reload(); 
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
                  <div class="text-xs text-gray-500 uppercase tracking-wide font-semibold">Verified Balance</div>
                  <div class="text-3xl font-bold text-blue-600">{{ auditResult.currentBalance }}</div>
              </div>
              
              <div class="flex flex-col items-end">
                <button 
                    @click="syncData" 
                    :disabled="isSyncing" 
                    class="flex items-center justify-center h-10 px-4 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-all active:scale-95 shadow-sm"
                    title="Pull latest machine records"
                >
                    <RefreshCw :size="16" :class="{'animate-spin': isSyncing, 'mr-2': true}" />
                    {{ isSyncing ? 'Harvesting...' : 'Sync Data' }}
                </button>
                <div class="text-[10px] text-gray-400 mt-1.5 text-right max-w-[150px] leading-tight">
                Pulls latest records from machine API.
                </div>
            </div>
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

    <div v-if="!loading" class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div class="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
           <div class="flex items-center">
              <span class="mr-2 text-xl">⚖️</span> 
              <div>
                  <h3 class="text-sm font-bold text-slate-700 uppercase">Merchant Ledger</h3>
                  <div class="text-[10px] text-gray-500">Your Local Transaction History</div>
              </div>
           </div>
        </div>

        <div class="grid grid-cols-3 divide-x divide-gray-100 text-center p-4">
            <div>
                <div class="text-xs text-gray-400 uppercase tracking-wider font-semibold">Verified Earnings</div>
                <div class="text-lg font-bold text-gray-700">{{ auditResult.totalEarned }}</div>
            </div>
            <div>
                 <div class="text-xs text-gray-400 uppercase tracking-wider font-semibold">Withdrawn</div>
                 <div class="text-lg font-bold text-red-600">-{{ auditResult.totalWithdrawn }}</div>
            </div>
            <div>
                 <div class="text-xs text-gray-400 uppercase tracking-wider font-semibold">Net Payable</div>
                 <div class="text-2xl font-bold text-blue-600">{{ auditResult.currentBalance }}</div>
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
                          <th class="px-6 py-3">Machine & Type</th>
                          <th class="px-6 py-3">Weight</th>
                          <th class="px-6 py-3">Status</th>
                          <th class="px-6 py-3 text-right">Value</th>
                      </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                      <tr v-if="recyclingHistory.length === 0"><td colspan="5" class="p-6 text-center text-gray-400">No records found</td></tr>
                      <tr v-for="r in recyclingHistory" :key="r.id" class="hover:bg-gray-50">
                          <td class="px-6 py-3 text-sm text-gray-600">{{ new Date(r.submitted_at).toLocaleString() }}</td>
                          <td class="px-6 py-3 text-sm text-gray-500 font-mono">
                            {{ r.device_no }}
                            <div class="text-[10px] text-gray-400 font-sans">{{ r.waste_type }}</div>
                          </td>
                          <td class="px-6 py-3 text-sm font-bold">{{ r.api_weight }} kg</td>
                          <td class="px-6 py-3 text-sm">
                            <span v-if="r.status === 'VERIFIED'" class="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">Verified</span>
                            <span v-else-if="r.status === 'REJECTED'" class="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">Rejected</span>
                            <span v-else class="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700 animate-pulse">Pending</span>
                          </td>
                          <td class="px-6 py-3 text-sm text-right font-bold">
                            <span v-if="r.status === 'VERIFIED'" class="text-green-600">+{{ r.calculated_value?.toFixed(2) }}</span>
                            <span v-else class="text-gray-300 line-through decoration-gray-300">
                                {{ r.calculated_value?.toFixed(2) }}
                            </span>
                          </td>
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
                        <tr v-if="withdrawalHistory.length === 0">
                            <td colspan="3" class="p-6 text-center text-gray-400">No withdrawals found</td>
                        </tr>
                        <tr v-for="w in withdrawalHistory" :key="w.id" class="hover:bg-gray-50">
                            <td class="px-6 py-3 text-sm text-gray-600">
                                {{ new Date(w.created_at).toLocaleString() }}
                            </td>

                            <td class="px-6 py-3 text-sm font-bold text-red-600">
                                -{{ w.amount }}
                            </td>

                            <td class="px-6 py-3 text-sm">
                                <span v-if="w.status === 'EXTERNAL_SYNC'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                    <span class="mr-1">🤖</span> External Sync
                                </span>
                                
                                <span v-else-if="w.status === 'PENDING'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    Pending
                                </span>

                                <span v-else-if="w.status === 'PAID' || w.status === 'APPROVED'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Paid
                                </span>
                                
                                <span v-else class="capitalize text-gray-600">
                                    {{ w.status }}
                                </span>
                            </td>
                        </tr>
                    </tbody>
              </table>
          </div>
      </div>
    </div>
  </div>
</template>