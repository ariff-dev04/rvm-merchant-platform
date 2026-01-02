<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useCleaningRecords } from '../composables/useCleaningRecords';
import CleaningVerificationModal from '../components/CleaningVerificationModal.vue';
import { Trash2, Clock, Search, Scale, User, ImageIcon, CheckCircle, XCircle, RefreshCw } from 'lucide-vue-next';

const { records, loading, fetchCleaningLogs, approveCleaning, rejectCleaning, formatDate } = useCleaningRecords();
const searchTerm = ref('');

// Modal State
const showModal = ref(false);
const selectedRecord = ref<any>(null);
const isProcessing = ref(false);

const filteredRecords = computed(() => {
  if (!searchTerm.value) return records.value;
  const term = searchTerm.value.toLowerCase();
  return records.value.filter(r => 
    r.device_no.includes(term) || 
    r.waste_type.toLowerCase().includes(term)
  );
});

const handleRefresh = async () => {
    await fetchCleaningLogs();     // Refreshes the table
};

// Actions
const openVerifyModal = (record: any) => {
    selectedRecord.value = record;
    showModal.value = true;
};

const handleApprove = async () => {
    if (!selectedRecord.value) return;
    isProcessing.value = true;
    await approveCleaning(selectedRecord.value.id);
    isProcessing.value = false;
    showModal.value = false;
};

const handleReject = async (reason: string) => {
    if (!selectedRecord.value) return;
    isProcessing.value = true;
    await rejectCleaning(selectedRecord.value.id, reason);
    isProcessing.value = false;
    showModal.value = false;
};

onMounted(() => {
  fetchCleaningLogs();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl border border-gray-100 shadow-sm gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 flex items-center">
          <Trash2 class="mr-3 text-emerald-600" :size="28" />
          Waste Disposal Logs
        </h1>
        <p class="text-sm text-gray-500 mt-1">Monitor bag removal and cleaning activities.</p>
      </div>

      <div class="flex gap-3 w-full md:w-auto">
        <button 
            @click="handleRefresh" 
            :disabled="loading" 
            class="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm font-medium"
        >
            <RefreshCw :size="18" :class="{'animate-spin': loading, 'mr-2': true}" />
            {{ loading ? 'Refreshing...' : 'Refresh Data' }}
        </button>

        <div class="relative w-full md:w-64">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" :size="18" />
            <input 
            v-model="searchTerm"
            type="text" 
            placeholder="Search Device ID..." 
            class="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
        </div>
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
          <tr>
            <th class="px-6 py-4">Cleaning Time</th>
            <th class="px-6 py-4">Machine</th>
            <th class="px-6 py-4 text-center">Snapshot</th> <th class="px-6 py-4">Waste Type</th>
            <th class="px-6 py-4 text-center">Collected Weight</th>
            <th class="px-6 py-4">Operator</th>
            <th class="px-6 py-4 text-center">Status</th>
            <th class="px-6 py-4 text-center">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-if="loading" class="animate-pulse">
            <td colspan="8" class="p-8 text-center text-gray-400">Loading records...</td>
          </tr>
          <tr v-else-if="filteredRecords.length === 0">
            <td colspan="8" class="p-8 text-center text-gray-400">No cleaning records found.</td>
          </tr>
          
          <tr v-for="item in filteredRecords" :key="item.id" class="hover:bg-gray-50 transition-colors">
            
            <td class="px-6 py-4">
              <div class="flex items-center text-sm text-gray-700 font-medium">
                <Clock :size="16" class="mr-2 text-gray-400" />
                {{ formatDate(item.cleaned_at) }}
              </div>
            </td>

            <td class="px-6 py-4">
              <span class="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">
                {{ item.device_no }}
              </span>
            </td>

            <td class="px-6 py-4 text-center">
                <div v-if="item.photo_url" class="h-10 w-10 mx-auto rounded-lg overflow-hidden border border-gray-200 bg-gray-50 relative group cursor-pointer" @click="openVerifyModal(item)">
                    <img :src="item.photo_url.split(',')[0]" class="h-full w-full object-cover" />
                    <div class="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors"></div>
                </div>
                <div v-else class="text-gray-300 flex justify-center"><ImageIcon :size="20" /></div>
            </td>

            <td class="px-6 py-4">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                {{ item.waste_type }}
              </span>
            </td>

            <td class="px-6 py-4 text-center">
              <div class="flex items-center justify-center space-x-1">
                <Scale :size="16" class="text-amber-500" />
                <span class="text-lg font-bold text-gray-900">{{ item.bag_weight_collected }}</span>
                <span class="text-xs text-gray-500">kg</span>
              </div>
            </td>

            <td class="px-6 py-4">
               <div class="flex items-center text-sm text-gray-600">
                 <User :size="16" class="mr-2 text-gray-400" />
                 {{ item.cleaner_name }}
               </div>
            </td>

            <td class="px-6 py-4 text-center">
              <span v-if="item.status === 'VERIFIED'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                Verified
              </span>
              <span v-else-if="item.status === 'REJECTED'" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                Rejected
              </span>
              <span v-else class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                Pending
              </span>
            </td>

            <td class="px-6 py-4 text-center">
              <button 
                v-if="item.status === 'PENDING'"
                @click="openVerifyModal(item)"
                class="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-all shadow-sm"
              >
                Review
              </button>
              <div v-else class="flex justify-center text-gray-300">
                  <CheckCircle v-if="item.status === 'VERIFIED'" :size="20" class="text-green-300" />
                  <XCircle v-if="item.status === 'REJECTED'" :size="20" class="text-red-300" />
              </div>
            </td>

          </tr>
        </tbody>
      </table>
    </div>

    <CleaningVerificationModal 
        :isOpen="showModal"
        :record="selectedRecord"
        :isProcessing="isProcessing"
        @close="showModal = false"
        @approve="handleApprove"
        @reject="handleReject"
    />
  </div>
</template>