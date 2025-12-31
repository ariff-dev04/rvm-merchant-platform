<script setup lang="ts">
import { ref, watch } from 'vue';
import { UserPlus } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  isSubmitting: boolean;
}>();

const emit = defineEmits(['close', 'create']);

const nickname = ref('');
const phone = ref('');

watch(() => props.isOpen, (val) => {
  if (val) {
    nickname.value = '';
    phone.value = '';
  }
});

const handleSubmit = () => {
  if (nickname.value && phone.value) {
    emit('create', { nickname: nickname.value, phone: phone.value });
  }
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div class="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <h3 class="font-bold text-gray-900 flex items-center gap-2">
              <UserPlus class="text-blue-600" :size="20"/> New Test User
          </h3>
          <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        
        <div class="p-6 space-y-4">
          <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nickname</label>
              <input v-model="nickname" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-blue-500" placeholder="e.g. Tester John" />
          </div>
          <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
              <input v-model="phone" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-blue-500" placeholder="e.g. 0123456789" />
          </div>
        </div>

        <div class="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button @click="$emit('close')" class="px-4 py-2 text-sm font-bold text-gray-500">Cancel</button>
          <button 
            @click="handleSubmit" 
            :disabled="isSubmitting" 
            class="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
              {{ isSubmitting ? 'Creating...' : 'Create' }}
          </button>
        </div>
    </div>
  </div>
</template>