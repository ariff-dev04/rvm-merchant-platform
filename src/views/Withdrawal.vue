<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useWithdrawals } from '../composables/useWithdrawals'; 
import WithdrawalFilters from '../components/WithdrawalFilters.vue'; 
import { WithdrawalStatus } from '../types'; 
import { 
  CheckCircle2, XCircle, RefreshCcw,  ChevronLeft, ChevronRight,
  Clock, CheckSquare
} from 'lucide-vue-next';
import { Eye } from 'lucide-vue-next';
import type { Withdrawal } from '../types';
import WithdrawalDetailsModal from '../components/WithdrawalDetailsModal.vue';

// 1. Init Logic from Composable
const { 
  withdrawals, 
  loading, 
  checkingBalanceId, 
  balanceResult, 
  fetchWithdrawals, 
  updateStatus, 
  checkBalance 
} = useWithdrawals();

// 2. Tab State (New)
const activeTab = ref<string>('PENDING'); // Default to Pending

// 3. Filter State
const searchFilters = ref({ 
  search: '', 
  startDate: '', 
  endDate: '' 
});

// 4. Filter Logic (Computed - Updated for Tabs)
const filteredList = computed(() => {
  return withdrawals.value.filter(w => {
    
    // A. Tab Filtering
    if (activeTab.value === 'PENDING') {
       if (w.status !== 'PENDING') return false;
    } 
    else if (activeTab.value === 'APPROVED') {
       // Group APPROVED, PAID, and EXTERNAL_SYNC together as "Completed"
       if (!['APPROVED', 'PAID', 'EXTERNAL_SYNC'].includes(w.status)) return false;
    }
    else if (activeTab.value === 'REJECTED') {
       if (w.status !== 'REJECTED') return false;
    }

    // B. Date Range Check
    if (searchFilters.value.startDate || searchFilters.value.endDate) {
       const date = w.created_at.split('T')[0] || '';
       if (searchFilters.value.startDate && date < searchFilters.value.startDate) return false;
       if (searchFilters.value.endDate && date > searchFilters.value.endDate) return false;
    }

    // C. Text Search
    const q = searchFilters.value.search.toLowerCase();
    if (q) {
      const match = 
        (w.users?.phone || '').toLowerCase().includes(q) ||
        (w.users?.nickname || '').toLowerCase().includes(q) ||
        (w.bank_name || '').toLowerCase().includes(q) ||
        (w.account_number || '').toLowerCase().includes(q);
      
      if (!match) return false;
    }

    return true;
  });
});

// ... (Pagination Logic stays same) ...
const currentPage = ref(1);
const itemsPerPage = ref(10);
const totalPages = computed(() => Math.ceil(filteredList.value.length / itemsPerPage.value));

const paginatedList = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredList.value.slice(start, start + itemsPerPage.value);
});

watch([filteredList, activeTab], () => currentPage.value = 1);

// ... (Helpers and Modal logic stay same) ...
const getStatusConfig = (status: string) => {
  switch (status) {
    case 'APPROVED': 
    case 'PAID': 
      return { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2, label: 'Paid' };
    case 'EXTERNAL_SYNC': 
      return { bg: 'bg-blue-50', text: 'text-blue-700', icon: CheckSquare, label: 'Migrated' };
    case 'REJECTED': 
      return { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: 'Rejected' };
    default: 
      return { bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock, label: 'Pending' };
  }
};

const showModal = ref(false);
const selectedWithdrawal = ref<Withdrawal | null>(null);

const openDetails = (w: Withdrawal) => {
  selectedWithdrawal.value = w;
  showModal.value = true;
};

onMounted(() => fetchWithdrawals());
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <div>
        <h2 class="text-lg font-bold text-gray-900">Withdrawal Requests</h2>
        <p class="text-sm text-gray-500 mt-1">Manage point redemption requests</p>
      </div>
      <button 
        @click="fetchWithdrawals" 
        :disabled="loading"
        class="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-50"
      >
        <RefreshCcw :size="14" :class="{'animate-spin': loading}" />
        <span>Refresh</span>
      </button>
    </div>

    <div class="space-y-4">
        <WithdrawalFilters @update:filters="(val) => searchFilters = val" />

        <div class="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
            <button 
                @click="activeTab = 'PENDING'"
                :class="`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'PENDING' ? 'bg-white shadow text-amber-700' : 'text-gray-500 hover:text-gray-900'}`"
            >
                <Clock :size="16" class="mr-2"/> Pending
            </button>
            <button 
                @click="activeTab = 'APPROVED'"
                :class="`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'APPROVED' ? 'bg-white shadow text-green-700' : 'text-gray-500 hover:text-gray-900'}`"
            >
                <CheckCircle2 :size="16" class="mr-2"/> Paid / History
            </button>
            <button 
                @click="activeTab = 'REJECTED'"
                :class="`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'REJECTED' ? 'bg-white shadow text-red-700' : 'text-gray-500 hover:text-gray-900'}`"
            >
                <XCircle :size="16" class="mr-2"/> Rejected
            </button>
        </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold tracking-wider whitespace-nowrap">
            <tr>
              <th class="px-6 py-4 border-b">Date</th>
              <th class="px-6 py-4 border-b">User</th>
              <th class="px-6 py-4 border-b">Phone</th>
              <th class="px-6 py-4 border-b text-right">Amount</th>
              <th class="px-6 py-4 border-b text-center">Status</th>
              <th v-if="activeTab === 'PENDING'" class="px-6 py-4 border-b w-48">Balance Check</th> 
              <th class="px-6 py-4 border-b text-right">Actions</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-gray-100 text-sm">
            <tr v-if="paginatedList.length === 0">
              <td :colspan="activeTab === 'PENDING' ? 7 : 6" class="p-8 text-center text-gray-400">No requests found in {{ activeTab.toLowerCase() }}.</td>
            </tr>

            <tr v-for="w in paginatedList" :key="w.id" class="hover:bg-gray-50/80 transition-colors group">
              <td class="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">
                <div>{{ new Date(w.created_at).toLocaleDateString() }}</div>
                <div class="mt-0.5">{{ new Date(w.created_at).toLocaleTimeString() }}</div>
              </td>

              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                  <div class="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mr-2 overflow-hidden shrink-0">
                    <img v-if="w.users?.avatar_url" :src="w.users.avatar_url" class="h-full w-full object-cover" />
                    <span v-else class="text-xs">👤</span>
                  </div>
                  <span class="font-medium text-gray-900">{{ w.users?.nickname || 'Guest' }}</span>
                </div>
              </td>

              <td class="px-6 py-4 whitespace-nowrap font-mono text-xs text-gray-600">
                {{ w.users?.phone || '-' }}
              </td>

              <td class="px-6 py-4 whitespace-nowrap text-right font-bold text-gray-900">
                {{ w.amount }} pts
              </td>

              <td class="px-6 py-4 whitespace-nowrap text-center">
                <span :class="`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStatusConfig(w.status).bg} ${getStatusConfig(w.status).text} border-opacity-20`">
                  <component :is="getStatusConfig(w.status).icon" :size="12" class="mr-1.5" />
                  {{ getStatusConfig(w.status).label }}
                </span>
              </td>

              <td v-if="activeTab === 'PENDING'" class="px-6 py-4">
                 <div v-if="balanceResult && balanceResult.id === w.id" class="bg-slate-50 border border-slate-200 rounded p-2 text-xs w-40 shadow-sm animate-in fade-in">
                    <div class="flex justify-between font-bold mb-1 border-b border-slate-200 pb-1">
                      <span class="text-slate-600">Current:</span>
                      <span :class="balanceResult.available < w.amount ? 'text-red-600' : 'text-green-600'">
                        {{ balanceResult.available.toFixed(2) }}
                      </span>
                    </div>
                    </div>
                 <button v-else @click="checkBalance(w)" :disabled="checkingBalanceId === w.id" class="w-full py-1.5 px-3 bg-white border border-blue-200 text-blue-600 rounded text-xs font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                   <RefreshCcw :size="12" :class="{'animate-spin': checkingBalanceId === w.id}" />
                   {{ checkingBalanceId === w.id ? '...' : 'Verify' }}
                 </button>
              </td>

              <td class="px-6 py-4 whitespace-nowrap text-right">
                <div class="flex justify-end gap-2">
                  <button @click="openDetails(w)" class="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200" title="View Details">
                    <Eye :size="16" />
                  </button>

                  <template v-if="w.status === 'PENDING'">
                    <button @click="updateStatus(w.id, WithdrawalStatus.APPROVED)" class="p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100 border border-green-200" title="Approve">
                      <CheckCircle2 :size="16" />
                    </button>
                    <button @click="updateStatus(w.id, WithdrawalStatus.REJECTED)" class="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200" title="Reject">
                      <XCircle :size="16" />
                    </button>
                  </template>
                </div>
              </td>

            </tr>
          </tbody>
        </table>
        
        <div class="bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
             <span class="text-sm text-gray-500">
               Page {{ currentPage }} of {{ totalPages || 1 }}
             </span>
             <div class="flex gap-2">
                <button @click="currentPage--" :disabled="currentPage === 1" class="p-1 rounded hover:bg-gray-200 disabled:opacity-50"><ChevronLeft :size="20"/></button>
                <button @click="currentPage++" :disabled="currentPage >= totalPages" class="p-1 rounded hover:bg-gray-200 disabled:opacity-50"><ChevronRight :size="20"/></button>
             </div>
        </div>

      </div>
    </div>
    
    <WithdrawalDetailsModal 
      :isOpen="showModal" 
      :withdrawal="selectedWithdrawal" 
      @close="showModal = false" 
    />
  </div>
</template>