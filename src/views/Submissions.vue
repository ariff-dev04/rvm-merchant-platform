<script setup lang="ts">
import { onMounted } from 'vue';
import { useSubmissionReviews } from '../composables/useSubmissionReviews';
import SubmissionCorrectionModal from '../components/SubmissionCorrectionModal.vue';
import SubmissionCleanupModal from '../components/SubmissionCleanupModal.vue';
import SubmissionFilters from '../components/SubmissionFilters.vue';
import SimpleConfirmModal from '../components/SimpleConfirmModal.vue';
import { RefreshCw, Check, Edit3, Clock, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-vue-next';

// Use the fat composable
const { 
  // State
  isHarvesting, 
  isProcessing,
  showModal,
  showCleanupModal,
  selectedReview,
  modalStartInReject,
  activeStatusTab,
  searchFilters,
  currentPage,
  itemsPerPage,
  
  // Computed Data
  paginatedReviews,
  totalPages,
  filteredReviews,

  // Actions
  fetchReviews, 
  harvestNewSubmissions,
  openReviewModal,
  handleCorrectionSubmit,
  handleRejectSubmit,
  handleCleanupSubmit,
  showConfirmModal, confirmMessage, triggerFastConfirm, executeFastConfirm
} = useSubmissionReviews();

// Utility (kept here for view formatting)
const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-MY', { 
    timeZone: 'UTC', 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true 
  });
};

onMounted(() => fetchReviews());
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Submission Verification</h1>
        <p class="text-sm text-gray-500 mt-1">Audit user recycling activities.</p>
      </div>

      <div class="flex gap-3">
      <button 
        @click="showCleanupModal = true"
        class="flex items-center px-4 py-2 border border-red-200 text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-all active:scale-95"
        title="Delete old verified data"
      >
        <Trash2 :size="18" class="mr-2" />
        Cleanup
      </button>

      <button 
        @click="() => harvestNewSubmissions(false)" 
        :disabled="isHarvesting" 
        class="flex items-center px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-all"
      >
        <RefreshCw :size="18" :class="{'animate-spin': isHarvesting, 'mr-2': true}" />
        {{ isHarvesting ? 'Syncing...' : 'Fetch & Verify' }}
      </button>

      <button 
        @click="() => harvestNewSubmissions(true)" 
        :disabled="isHarvesting" 
        class="flex items-center px-4 py-2 border border-amber-200 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-all"
        title="Force check all users ignoring 2 min timer"
      >
        <RefreshCw :size="18" :class="{'animate-spin': isHarvesting, 'mr-2': true}" />
        Force Sync
      </button>
    </div>
    </div>

    <SubmissionFilters @update:filters="(val) => searchFilters = val" />

    <div class="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
      <button v-for="f in ['PENDING', 'VERIFIED', 'REJECTED']" :key="f" 
        @click="activeStatusTab = f" 
        :class="`px-4 py-2 text-sm font-medium rounded-lg transition-all ${activeStatusTab === f ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`">
        {{ f }}
      </button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
          <tr>
            <th class="px-6 py-4">Submitted At</th>
            <th class="px-6 py-4">User</th>
            <th class="px-6 py-4">ID</th>
            <th class="px-6 py-4">Machine</th> <th class="px-6 py-4">Type</th>
            <th class="px-6 py-4 text-center font-bold text-gray-900">User Wgt</th>
            <th class="px-6 py-4 text-center text-gray-500">Bin Lvl</th>
            <th class="px-6 py-4 text-center text-gray-400">Theo. Wgt</th>
            <th class="px-6 py-4 text-center font-bold text-amber-700">Warehouse Wgt</th> 
            <th v-if="activeStatusTab === 'VERIFIED'" class="px-6 py-4 text-center font-bold text-green-700">Confirmed Wgt</th>
            <th class="px-6 py-4 text-center">Points</th> <th class="px-6 py-4 text-center">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-if="paginatedReviews.length === 0"><td colspan="12" class="p-8 text-center text-gray-400">No submissions found.</td></tr>
          
          <tr v-for="item in paginatedReviews" :key="item.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4">
              <div class="flex items-center text-sm text-gray-700">
                <Clock :size="14" class="mr-1.5 text-gray-400" />
                {{ formatDate(item.submitted_at) }}
              </div>
            </td>

            <td class="px-6 py-4">
              <div class="flex items-center">
                <div class="h-8 w-8 rounded-full mr-3 bg-slate-100 border flex items-center justify-center overflow-hidden shrink-0">
                    <img v-if="item.users?.avatar_url" :src="item.users.avatar_url" class="h-full w-full object-cover" />
                    <span v-else class="text-xs">👤</span>
                </div>
                <div>
                  <div class="text-sm font-bold text-gray-900">
                      {{ item.users?.nickname || 'Guest User' }}
                  </div>
                  <div class="text-xs text-gray-500 font-mono mb-1">
                      {{ item.users?.phone || item.phone || 'No Phone' }}
                  </div>                  
                </div>
              </div>
            </td>

            <td class="px-6 py-4">
              <span class="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
                #{{ item.vendor_record_id.slice(-8) }}
              </span>
            </td>

            <td class="px-6 py-4">
              <span class="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                {{ item.device_no }}
              </span>
            </td>

            <td class="px-6 py-4">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                {{ item.waste_type }}
              </span>
            </td>

            <td class="px-6 py-4 text-center">
              <span class="text-lg font-bold text-gray-900">{{ item.api_weight }}</span><span class="text-xs text-gray-500 ml-1">kg</span>
            </td>
            <td class="px-6 py-4 text-center">
              <span v-if="(item.bin_weight_snapshot || 0) > 0" class="font-mono text-sm text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{{ item.bin_weight_snapshot }} kg</span>
              <span v-else class="text-gray-300">-</span>
            </td>
            <td class="px-6 py-4 text-center">
              <span class="text-sm text-gray-400 font-mono">{{ item.theoretical_weight }} kg</span>
            </td>
            <td class="px-6 py-4 text-center">
              <span class="font-bold text-amber-700">{{ item.warehouse_weight ? item.warehouse_weight + ' kg' : '-' }}</span>
            </td>
            <td v-if="activeStatusTab === 'VERIFIED'" class="px-6 py-4 text-center">
              <span class="font-bold text-green-600">{{ item.confirmed_weight }} kg</span>
            </td>

            <td class="px-6 py-4 text-center">
              <div v-if="item.status === 'VERIFIED'">
                <span class="text-lg font-bold text-green-600">{{ item.calculated_points }}</span>
                <div class="text-[10px] text-gray-400">Final</div>
              </div>
              <div v-else class="flex flex-col items-center">
                <span class="text-sm font-bold text-gray-700">{{ (item.api_weight * item.rate_per_kg).toFixed(2) }}</span>
                <div v-if="item.machine_given_points" class="text-[10px] mt-1 flex items-center gap-1">
                   <span class="text-gray-400">Machine: {{ item.machine_given_points }}</span>
                   <span v-if="Math.abs(item.machine_given_points - (item.api_weight * item.rate_per_kg)) > 0.02" class="text-amber-500 cursor-help" title="Mismatch!">⚠️</span>
                </div>
              </div>
            </td>

            <td class="px-6 py-4 text-center">
              <div v-if="item.status === 'PENDING'" class="flex justify-center gap-2">
                <button @click="triggerFastConfirm(item)" class="p-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100 border border-green-200" title="Confirm"><Check :size="16" /></button>
                <button @click="openReviewModal(item, false)" class="p-1.5 bg-amber-50 text-amber-700 rounded hover:bg-amber-100 border border-amber-200" title="Correct"><Edit3 :size="16" /></button>
                <button @click="openReviewModal(item, true)" class="p-1.5 bg-red-50 text-red-700 rounded hover:bg-red-100 border border-red-200" title="Reject"><X :size="16" /></button>
              </div>
              <span v-else :class="`px-2.5 py-1 rounded-full text-xs font-bold ${item.status === 'VERIFIED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`">
                {{ item.status }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
        <span class="text-sm text-gray-500">
          Showing <span class="font-medium text-gray-900">{{ (currentPage - 1) * itemsPerPage + 1 }}</span>
          to <span class="font-medium text-gray-900">{{ Math.min(currentPage * itemsPerPage, filteredReviews.length) }}</span>
          of <span class="font-medium text-gray-900">{{ filteredReviews.length }}</span> results
        </span>

        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-500">Rows:</span>
            <select v-model="itemsPerPage" class="text-sm border-gray-300 rounded-lg bg-white py-1">
              <option :value="5">5</option><option :value="10">10</option><option :value="20">20</option><option :value="50">50</option>
            </select>
          </div>
          <div class="flex items-center bg-white rounded-lg border border-gray-300 overflow-hidden">
            <button @click="currentPage--" :disabled="currentPage === 1" class="px-3 py-1 hover:bg-gray-50 disabled:opacity-50 border-r"><ChevronLeft :size="16" /></button>
            <span class="px-4 py-1 text-sm font-medium text-gray-700">Page {{ currentPage }} of {{ totalPages || 1 }}</span>
            <button @click="currentPage++" :disabled="currentPage >= totalPages" class="px-3 py-1 hover:bg-gray-50 disabled:opacity-50"><ChevronRight :size="16" /></button>
          </div>
        </div>
      </div>
    </div>

    <SubmissionCleanupModal 
      :isOpen="showCleanupModal" 
      :isProcessing="isProcessing"
      @close="showCleanupModal = false"
      @confirm="handleCleanupSubmit"
    />

    <SubmissionCorrectionModal 
      :isOpen="showModal" 
      :review="selectedReview" 
      :isProcessing="isProcessing"
      :startInRejectMode="modalStartInReject" 
      @close="showModal = false"
      @confirm="handleCorrectionSubmit"
      @reject="handleRejectSubmit"
    />

    <SimpleConfirmModal
      :isOpen="showConfirmModal"
      title="Verify Submission"
      :message="confirmMessage"
      :isProcessing="isProcessing"
      @close="showConfirmModal = false"
      @confirm="executeFastConfirm"
    />
  </div>
</template>