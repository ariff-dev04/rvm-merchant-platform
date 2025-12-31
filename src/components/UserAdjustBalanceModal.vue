<script setup lang="ts">
import { ref, watch } from 'vue';
import { Wallet, AlertCircle } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  user: any;
  isSubmitting: boolean;
}>();

const emit = defineEmits(['close', 'confirm']);

const amount = ref<number | null>(null);
const note = ref('');
const type = ref<'ADJUSTMENT' | 'WITHDRAWAL'>('ADJUSTMENT');

// Reset state when modal opens
watch(() => props.isOpen, (val) => {
  if (val) {
    amount.value = null;
    note.value = '';
    type.value = 'ADJUSTMENT';
  }
});

const handleSubmit = () => {
  if (!amount.value) return;
  
  // Logic: Ensure withdrawal is negative, adjustment is as-is
  let finalAmount = Number(amount.value);
  if (type.value === 'WITHDRAWAL') {
    finalAmount = -Math.abs(finalAmount);
  }

  emit('confirm', { 
    userId: props.user.id, 
    amount: finalAmount, 
    note: note.value, 
    type: type.value 
  });
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
      
      <div class="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
        <h3 class="font-bold text-gray-900 flex items-center gap-2">
          <Wallet class="text-purple-600" :size="20"/> Adjust Funds
        </h3>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>
      
      <div class="p-6 space-y-5">
        
        <div class="flex gap-2 p-1 bg-gray-100 rounded-lg">
          <button 
            @click="type = 'ADJUSTMENT'"
            :class="`flex-1 py-2 text-xs font-bold rounded-md transition-all ${type === 'ADJUSTMENT' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`"
          >
            Correction
          </button>
          <button 
            @click="type = 'WITHDRAWAL'"
            :class="`flex-1 py-2 text-xs font-bold rounded-md transition-all ${type === 'WITHDRAWAL' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`"
          >
            Past Withdrawal
          </button>
        </div>

        <div v-if="type === 'WITHDRAWAL'" class="bg-blue-50 text-blue-700 p-3 rounded-lg border border-blue-100 text-xs flex items-start gap-2">
          <AlertCircle :size="16" class="shrink-0 mt-0.5" />
          <span><strong>Migration Mode:</strong> Amount entered will be deducted and logged as "Paid" history.</span>
        </div>

        <div class="bg-purple-50 p-3 rounded-lg border border-purple-100 flex justify-between items-center">
          <div>
            <div class="text-[10px] text-purple-600 font-bold uppercase">Current Balance</div>
            <div class="font-bold text-purple-900">{{ user?.nickname }}</div>
          </div>
          <div class="text-xl font-bold text-purple-700">{{ user?.balance.toFixed(2) }}</div>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Amount</label>
          <div class="relative">
            <span v-if="type === 'WITHDRAWAL'" class="absolute left-4 top-3.5 text-red-500 font-bold text-lg">-</span>
            <input 
              v-model="amount" 
              type="number" 
              step="0.01" 
              :class="`w-full p-3 ${type === 'WITHDRAWAL' ? 'pl-8 text-red-600' : 'pl-4 text-gray-900'} pr-4 text-lg font-bold border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-200 outline-none transition-colors`" 
              placeholder="0.00" 
            />
          </div>
          
          <div class="flex gap-2 mt-2 justify-center">
             <template v-if="type === 'ADJUSTMENT'">
                <button @click="amount = 1" class="px-2 py-1 bg-gray-100 text-xs rounded font-bold hover:bg-gray-200">+1</button>
                <button @click="amount = 5" class="px-2 py-1 bg-gray-100 text-xs rounded font-bold hover:bg-gray-200">+5</button>
                <button @click="amount = -1" class="px-2 py-1 bg-red-50 text-red-600 text-xs rounded font-bold border border-red-100 hover:bg-red-100">-1</button>
             </template>
             <template v-else>
                <button @click="amount = 10" class="px-2 py-1 bg-red-50 text-red-600 text-xs rounded font-bold border border-red-100 hover:bg-red-100">10</button>
                <button @click="amount = 50" class="px-2 py-1 bg-red-50 text-red-600 text-xs rounded font-bold border border-red-100 hover:bg-red-100">50</button>
             </template>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-2">Reason / Note</label>
          <textarea 
            v-model="note" 
            rows="2" 
            class="w-full p-3 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-200 outline-none resize-none" 
            placeholder="e.g. Migration from old app..."
          ></textarea>
        </div>

      </div>

      <div class="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button @click="$emit('close')" class="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700">Cancel</button>
        <button 
          @click="handleSubmit" 
          :disabled="isSubmitting || !amount" 
          :class="`px-6 py-2 text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors shadow-lg active:scale-95 ${type === 'WITHDRAWAL' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'}`"
        >
          {{ isSubmitting ? 'Saving...' : 'Confirm' }}
        </button>
      </div>
    </div>
  </div>
</template>