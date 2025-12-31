<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useUserList } from '../composables/useUserList';
import { ChevronRight, Smartphone, Scale, Search, UserPlus, Wallet } from 'lucide-vue-next';

// Components
import SimpleConfirmModal from '../components/SimpleConfirmModal.vue';
import UserAdjustBalanceModal from '../components/UserAdjustBalanceModal.vue';
import UserCreateModal from '../components/UserCreateModal.vue';

// Logic
const { users, loading, isSubmitting, adjustBalance, createTestUser } = useUserList();
const searchQuery = ref('');

// --- MODAL STATES ---
const showAdjustModal = ref(false);
const showCreateModal = ref(false);
const showFeedbackModal = ref(false);
const selectedUser = ref<any>(null);

// Feedback State
const feedbackTitle = ref('');
const feedbackMessage = ref('');
const isError = ref(false);

const triggerFeedback = (title: string, message: string, error = false) => {
    feedbackTitle.value = title;
    feedbackMessage.value = message;
    isError.value = error;
    showFeedbackModal.value = true;
};

// --- HANDLERS ---
const openAdjustModal = (user: any) => {
    selectedUser.value = user;
    showAdjustModal.value = true;
};

// Handle event from Child Component
const handleAdjustmentConfirm = async (payload: { userId: string, amount: number, note: string, type: 'ADJUSTMENT'|'WITHDRAWAL' }) => {
    const res = await adjustBalance(payload.userId, payload.amount, payload.note, payload.type);
    
    if (res?.success) {
        showAdjustModal.value = false;
        triggerFeedback('Success', 'Balance updated successfully!', false);
    } else {
        triggerFeedback('Error', res?.error || 'Update failed', true);
    }
};

// Handle event from Child Component
const handleCreateUserConfirm = async (payload: { nickname: string, phone: string }) => {
    const res = await createTestUser(payload.nickname, payload.phone);
    if (res?.success) {
        showCreateModal.value = false;
        triggerFeedback('Success', 'Test User Created!', false);
    } else {
        triggerFeedback('Error', res?.error || 'Creation failed', true);
    }
};

// --- COMPUTED ---
const filteredUsers = computed(() => {
  if (!searchQuery.value) return users.value;
  const q = searchQuery.value.toLowerCase();
  return users.value.filter(u => 
    u.nickname?.toLowerCase().includes(q) || u.phone?.includes(q)
  );
});
</script>

<template>
  <div class="space-y-6">
      
    <div class="flex flex-col md:flex-row justify-between items-center gap-4">
        <div class="relative w-full md:w-96">
            <Search class="absolute left-3 top-2.5 text-gray-400" :size="20"/>
            <input v-model="searchQuery" placeholder="Search users by name or phone..." class="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"/>
        </div>
        <button @click="showCreateModal = true" class="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl hover:bg-gray-800 text-sm font-bold transition-all shadow-lg active:scale-95">
            <UserPlus :size="18" /> New Test User
        </button>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="px-8 py-6 border-b border-gray-100 bg-gray-50/50">
            <h2 class="text-lg font-bold text-gray-900">User Database</h2>
            <p class="text-sm text-gray-500 mt-1">Synced users with wallet balances.</p>
        </div>

        <div v-if="loading" class="p-8 text-center text-gray-500">Loading users...</div>

        <div v-else class="overflow-x-auto">
            <table class="w-full text-left">
                <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold tracking-wider">
                    <tr>
                        <th class="px-6 py-4 w-16">Avatar</th> 
                        <th class="px-6 py-4">Nickname</th>
                        <th class="px-6 py-4">Phone</th>
                        <th class="px-6 py-4">Balance</th> 
                        <th class="px-6 py-4">Recycled</th>
                        <th class="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    <tr v-if="filteredUsers.length === 0">
                        <td colspan="6" class="px-6 py-8 text-center text-gray-400 text-sm">No users found.</td>
                    </tr>
                    <tr v-for="user in filteredUsers" :key="user.id" class="hover:bg-gray-50/80 transition-colors">
                        <td class="px-6 py-4">
                            <div class="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                                <img v-if="user.avatar_url" :src="user.avatar_url" class="h-full w-full object-cover" />
                                <span v-else class="text-lg">👤</span>
                            </div>
                        </td>
                        <td class="px-6 py-4">
                            <div class="text-sm font-bold text-gray-900">{{ user.nickname || '-' }}</div>
                            <div class="text-[10px] text-gray-400 font-mono mt-0.5" v-if="user.vendor_user_no">ID: {{ user.vendor_user_no }}</div>
                        </td>
                        <td class="px-6 py-4">
                            <div class="flex items-center text-sm text-gray-600 font-mono">
                                <Smartphone :size="14" class="mr-1.5 text-gray-400" /> {{ user.phone }}
                            </div>
                        </td>
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-2">
                                <Wallet :size="16" class="text-purple-500" />
                                <span class="font-bold text-gray-900">{{ user.balance.toFixed(2) }}</span>
                            </div>
                        </td>
                        <td class="px-6 py-4">
                            <div class="flex items-center text-sm font-bold text-slate-700">
                                <Scale :size="14" class="mr-1.5 text-slate-400" /> {{ user.total_weight || 0 }} kg
                            </div>
                        </td>
                        <td class="px-6 py-4 text-right flex items-center justify-end gap-2">
                            <button @click="openAdjustModal(user)" class="text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-100 transition-colors">
                                Adjust $
                            </button>
                            <RouterLink :to="`/users/${user.id}`" class="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline decoration-blue-200 underline-offset-4 ml-2">
                                View <ChevronRight :size="14" class="ml-0.5" />
                            </RouterLink>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <UserAdjustBalanceModal 
        :isOpen="showAdjustModal" 
        :user="selectedUser" 
        :isSubmitting="isSubmitting"
        @close="showAdjustModal = false"
        @confirm="handleAdjustmentConfirm"
    />

    <UserCreateModal 
        :isOpen="showCreateModal" 
        :isSubmitting="isSubmitting"
        @close="showCreateModal = false"
        @create="handleCreateUserConfirm"
    />

    <SimpleConfirmModal
        :isOpen="showFeedbackModal"
        :title="feedbackTitle"
        :message="feedbackMessage"
        :isProcessing="false"
        @close="showFeedbackModal = false"
        @confirm="showFeedbackModal = false"
    />

  </div>
</template>