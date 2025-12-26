<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { X, Scale, Calculator, Hash, Ban, Droplet } from 'lucide-vue-next'; // ✅ Added Droplet icon
import { getEvidencePhotos } from '../utils/wasteUtils';
const props = defineProps<{
  isOpen: boolean;
  review: any;
  isProcessing: boolean;
  startInRejectMode?: boolean;
}>();

const emit = defineEmits(['close', 'confirm', 'reject']);

const correctionWeight = ref<number>(0);
const isRejectMode = ref(false); 
const rejectReason = ref('');

const evidence = computed(() => {
    return getEvidencePhotos(props.review?.photo_url);
});

// ✅ Check if we actually have photos (UCO will return false)
const hasPhotos = computed(() => {
    return evidence.value.before !== '' || evidence.value.after !== '';
});

// Initialize weight when modal opens
watch(() => props.review, (newVal) => {
  if (newVal) {
    correctionWeight.value = newVal.api_weight;
    isRejectMode.value = !!props.startInRejectMode;
    rejectReason.value = '';
  }
}, { immediate: true });

watch(() => props.isOpen, (open) => {
    if (open) {
        isRejectMode.value = !!props.startInRejectMode;
    }
});

const calculatedPoints = computed(() => {
  if (!props.review) return 0;
  return (correctionWeight.value * props.review.rate_per_kg).toFixed(2);
});

// Submit Logic
const handleConfirm = () => {
  if (isRejectMode.value) {
    emit('reject', rejectReason.value || 'No reason provided');
  } else {
    emit('confirm', correctionWeight.value);
  }
};
</script>

<template>
  <div v-if="isOpen && review" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col md:flex-row h-full md:h-[800px] md:max-h-[90vh]">
      
      <div class="w-full md:w-7/12 bg-gray-900 p-4 flex flex-col gap-4 h-full relative">
        
        <template v-if="hasPhotos">
            <div class="flex-1 relative bg-black/30 rounded-xl overflow-hidden border border-white/10 group min-h-0">
                <div class="absolute top-3 left-3 z-10 bg-amber-600 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-md shadow-sm uppercase tracking-wider">
                    Before (Bin State)
                </div>
                <div class="w-full h-full">
                    <img :src="evidence.before" class="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity" />
                </div>
            </div>

            <div class="flex-1 relative bg-black rounded-xl overflow-hidden border-2 border-blue-500 shadow-xl shadow-blue-900/20 min-h-0">
                <div class="absolute top-3 left-3 z-10 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-md shadow-sm uppercase tracking-wider">
                    After (Submission)
                </div>
                <div class="w-full h-full">
                    <img :src="evidence.after" class="w-full h-full object-contain" />
                </div>
            </div>
        </template>

        <div v-else class="w-full h-full flex flex-col items-center justify-center text-gray-500 space-y-4 border-2 border-dashed border-gray-700 rounded-xl">
            <div class="bg-gray-800 p-6 rounded-full">
                <Droplet :size="64" class="text-blue-400" /> </div>
            <div class="text-center">
                <h3 class="text-white text-xl font-bold">Weight Only Submission</h3>
                <p class="text-gray-400 text-sm mt-1">This waste type ({{ review.waste_type }}) does not require photos.</p>
            </div>
        </div>

      </div>

      <div class="w-full md:w-5/12 p-8 flex flex-col bg-white h-full overflow-y-auto">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h3 class="text-xl font-bold" :class="isRejectMode ? 'text-red-600' : 'text-gray-900'">
                {{ isRejectMode ? 'Reject Submission' : 'Correct Submission' }}
            </h3>
            <div class="flex items-center text-sm text-gray-500 mt-1 font-mono">
              <Hash :size="14" class="mr-1" /> {{ review.vendor_record_id }}
            </div>
          </div>
          <button @click="$emit('close')" class="p-1 hover:bg-gray-100 rounded-full"><X :size="24" class="text-gray-400" /></button>
        </div>

        <div class="space-y-6 flex-1">
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <div class="text-xs text-gray-500 uppercase font-semibold">Waste Type</div>
              <div class="font-medium text-gray-900">{{ review.waste_type }}</div>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg border border-gray-100">
              <div class="text-xs text-gray-500 uppercase font-semibold">Rate</div>
              <div class="font-medium text-gray-900">{{ review.rate_per_kg }} / kg</div>
            </div>
          </div>

          <hr class="border-gray-100" />

          <div v-if="!isRejectMode" class="space-y-6 animate-in fade-in duration-300">
            <div>
              <label class="block text-sm font-bold text-gray-700 mb-2">
                <Scale :size="16" class="inline mr-1 text-amber-500" /> Actual Delivery Weight
              </label>
              <div class="relative">
                <input v-model.number="correctionWeight" type="number" step="0.01" class="w-full pl-4 pr-12 py-3 border-2 border-amber-100 rounded-xl focus:border-amber-400 outline-none text-lg font-bold" />
                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">KG</span>
              </div>
              <div class="flex justify-between text-xs text-gray-500 mt-2">
                 <span>Machine: {{ review.api_weight }} kg</span>
              </div>
            </div>

            <div class="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
              <div class="flex items-center text-blue-800 font-medium"><Calculator :size="20" class="mr-2" /> Points Awarded</div>
              <div class="text-2xl font-bold text-blue-700">{{ calculatedPoints }}</div>
            </div>
          </div>

          <div v-else class="space-y-4 animate-in fade-in duration-300">
             <div>
                <label class="block text-sm font-bold text-red-700 mb-2">Reason for Rejection</label>
                <textarea 
                    v-model="rejectReason"
                    class="w-full border-2 border-red-100 rounded-xl p-3 focus:border-red-400 outline-none text-gray-700 h-32 resize-none"
                    placeholder="E.g. Empty bottle, wrong material, foreign object..."
                ></textarea>
             </div>
             <p class="text-xs text-gray-500">The user will not receive any points for this submission.</p>
          </div>

        </div>

        <div class="mt-8 pt-6 border-t border-gray-100 flex gap-3">
          <button v-if="!isRejectMode" @click="isRejectMode = true" class="px-4 py-3 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 font-medium flex items-center justify-center transition-colors min-w-[120px]">
            <Ban :size="18" class="mr-2" /> Reject
          </button>
          <button v-else @click="isRejectMode = false" class="px-4 py-3 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-medium transition-colors">
            Back
          </button>

          <button @click="$emit('close')" class="flex-1 py-3 border rounded-xl hover:bg-gray-50 font-medium text-gray-700">Cancel</button>
          <button @click="handleConfirm" :disabled="isProcessing" :class="`flex-1 py-3 text-white rounded-xl disabled:opacity-70 font-bold transition-colors ${isRejectMode ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'}`">
            {{ isProcessing ? 'Saving...' : (isRejectMode ? 'Confirm Rejection' : 'Confirm') }}
          </button>
        </div>

      </div>
    </div>
  </div>
</template>