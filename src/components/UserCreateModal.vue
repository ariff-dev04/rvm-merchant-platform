<script setup lang="ts">
import { ref, watch } from 'vue';
import { DownloadCloud, Smartphone, User } from 'lucide-vue-next';

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
  // ✅ FIX: Only phone is strictly required now
  if (phone.value) {
    emit('create', { nickname: nickname.value, phone: phone.value });
  }
};
</script>

<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden transform transition-all">
        
        <div class="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <div>
              <h3 class="font-bold text-gray-900 flex items-center gap-2 text-lg">
                  <DownloadCloud class="text-blue-600" :size="20"/> Import User
              </h3>
              <p class="text-xs text-gray-500 mt-1">Sync user from RVM Machine Cloud.</p>
          </div>
          <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        
        <div class="p-6 space-y-5">
          <div class="bg-blue-50 text-blue-700 px-4 py-3 rounded-lg text-xs flex gap-2 items-start leading-relaxed border border-blue-100">
             <span class="text-lg">ℹ️</span>
             <span>
               Enter the exact <b>Phone Number</b>. If they exist in the machine system, we will fetch their name and points. If you provide a nickname, it will update their profile.
             </span>
          </div>

          <div>
              <label class="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase mb-1.5">
                  <User :size="12" /> Nickname / Label <span class="text-gray-400 font-normal normal-case">(Optional)</span>
              </label>
              <input v-model="nickname" class="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm font-medium" placeholder="Leave empty to fetch existing name" />
          </div>

          <div>
              <label class="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase mb-1.5">
                  <Smartphone :size="12" /> Phone Number
              </label>
              <input v-model="phone" type="tel" class="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm font-mono" placeholder="e.g. 60123456789" />
              <p class="text-[10px] text-gray-400 mt-1.5 text-right">Format: 601...</p>
          </div>
        </div>

        <div class="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button @click="$emit('close')" class="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
          
          <button 
            @click="handleSubmit" 
            :disabled="isSubmitting || !phone" 
            class="px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-95 flex items-center gap-2"
          >
              <DownloadCloud v-if="!isSubmitting" :size="16" />
              <svg v-else class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              {{ isSubmitting ? 'Syncing Data...' : 'Import & Sync' }}
          </button>
        </div>
    </div>
  </div>
</template>