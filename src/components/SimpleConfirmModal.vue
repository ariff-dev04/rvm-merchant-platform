<script setup lang="ts">
import { AlertCircle } from 'lucide-vue-next';

defineProps<{
  isOpen: boolean;
  title?: string;
  message: string;
  isProcessing?: boolean;
}>();

const emit = defineEmits(['close', 'confirm']);
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
      
      <div class="p-6 text-center">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
          <AlertCircle class="h-6 w-6 text-green-600" />
        </div>
        <h3 class="text-lg font-bold text-gray-900">{{ title || 'Confirm Action' }}</h3>
        <p class="mt-2 text-sm text-gray-500 whitespace-pre-line">{{ message }}</p>
      </div>

      <div class="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
        <button 
          @click="$emit('close')" 
          class="flex-1 py-2.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button 
          @click="$emit('confirm')" 
          :disabled="isProcessing"
          class="flex-1 py-2.5 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 shadow-lg shadow-green-900/20 disabled:opacity-70 transition-colors"
        >
          {{ isProcessing ? 'Processing...' : 'Confirm' }}
        </button>
      </div>

    </div>
  </div>
</template>