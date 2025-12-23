<script setup lang="ts">
import { ref } from 'vue';
// ✅ FIXED: Removed unused 'Calendar'
import { Trash2, AlertTriangle, X } from 'lucide-vue-next';

defineProps<{ isOpen: boolean; isProcessing: boolean }>();
const emit = defineEmits(['close', 'confirm']);

const selectedTimeframe = ref(3);

const options = [
  { label: 'Keep last 1 Month', value: 1, desc: 'Delete everything older than 30 days.' },
  { label: 'Keep last 3 Months', value: 3, desc: 'Standard retention policy.' },
  { label: 'Keep last 6 Months', value: 6, desc: 'Keep data for half a year.' },
  { label: 'Keep last 1 Year', value: 12, desc: 'Long term archiving.' },
];
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
      
      <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-red-50">
        <div class="flex items-center text-red-700 font-bold">
          <Trash2 :size="20" class="mr-2" /> Data Cleanup
        </div>
        <button @click="$emit('close')" class="p-1 hover:bg-red-100 rounded-full text-red-400">
          <X :size="20" />
        </button>
      </div>

    
      <div class="p-6">
        <div class="bg-amber-50 border border-amber-100 rounded-lg p-3 flex items-start gap-3 mb-6">
          <AlertTriangle :size="20" class="text-amber-600 shrink-0 mt-0.5" />
          <p class="text-xs text-amber-800 leading-relaxed">
            This action will <strong>permanently delete</strong> "Verified" and "Rejected" submissions older than the selected timeframe. Pending submissions will NOT be deleted.
          </p>
        </div>

        <label class="block text-sm font-medium text-gray-700 mb-3">Select Retention Period</label>
        <div class="space-y-2">
          <button 
            v-for="opt in options" 
            :key="opt.value"
            @click="selectedTimeframe = opt.value"
            :class="`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center ${
              selectedTimeframe === opt.value 
              ? 'border-red-500 bg-red-50 ring-1 ring-red-500' 
              : 'border-gray-200 hover:border-gray-300'
            }`"
          >
            <div :class="`w-4 h-4 rounded-full border mr-3 flex items-center justify-center ${selectedTimeframe === opt.value ? 'border-red-500' : 'border-gray-300'}`">
              <div v-if="selectedTimeframe === opt.value" class="w-2 h-2 bg-red-500 rounded-full"></div>
            </div>
            <div>
              <div class="text-sm font-bold text-gray-900">{{ opt.label }}</div>
              <div class="text-xs text-gray-500">{{ opt.desc }}</div>
            </div>
          </button>
        </div>
      </div>

      <div class="p-6 border-t border-gray-100 flex gap-3">
        <button @click="$emit('close')" class="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button 
          @click="$emit('confirm', selectedTimeframe)" 
          :disabled="isProcessing"
          class="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-lg shadow-red-200 disabled:opacity-70 flex justify-center items-center"
        >
          <Trash2 :size="16" class="mr-2" />
          {{ isProcessing ? 'Cleaning...' : 'Delete Old Data' }}
        </button>
      </div>
    </div>
  </div>
</template>