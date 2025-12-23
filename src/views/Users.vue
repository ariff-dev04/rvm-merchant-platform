<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useUserList } from '../composables/useUserList';
import { ChevronRight, Smartphone, Hash, Trophy, CreditCard, Clock, Scale } from 'lucide-vue-next';

const { users, loading } = useUserList();

const formatDate = (dateString?: string | null) => {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleDateString();
};
</script>

<template>
  <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
    <div class="px-8 py-6 border-b border-gray-100 bg-gray-50/50">
      <h2 class="text-lg font-bold text-gray-900">User Management</h2>
      <p class="text-sm text-gray-500 mt-1">Local database users synced with Hardware API</p>
    </div>

    <div v-if="loading" class="p-8 text-center text-gray-500">
      Loading users...
    </div>

    <div v-else class="overflow-x-auto">
      <table class="w-full text-left">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold tracking-wider">
          <tr>
            <th class="px-6 py-4 w-16">Avatar</th> <th class="px-6 py-4">Nickname</th>
            <th class="px-6 py-4">Phone</th>
            <th class="px-6 py-4">Vendor ID</th>
            <th class="px-6 py-4">Card No</th>
            <th class="px-6 py-4">Recycled</th>
            <th class="px-6 py-4">Points</th>
            <th class="px-6 py-4 text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="user in users" :key="user.id" class="hover:bg-gray-50/80 transition-colors">
            
            <td class="px-6 py-4">
              <div class="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                  <img v-if="user.avatar_url" :src="user.avatar_url" class="h-full w-full object-cover" />
                  <span v-else class="text-lg">👤</span>
              </div>
            </td>

            <td class="px-6 py-4">
               <div class="text-sm font-bold text-gray-900">
                 {{ user.nickname || '-' }}
               </div>
            </td>

            <td class="px-6 py-4">
               <div class="flex items-center text-sm text-gray-600">
                  <Smartphone :size="14" class="mr-1.5 text-gray-400" />
                  {{ user.phone }}
               </div>
            </td>

            <td class="px-6 py-4">
               <div class="flex items-center text-sm text-gray-600 font-mono">
                 <Hash :size="12" class="mr-1.5 text-gray-400" />
                 <span v-if="user.vendor_user_no">{{ user.vendor_user_no }}</span>
                 <span v-else class="text-orange-400 text-xs italic">Pending</span>
               </div>
            </td>

            <td class="px-6 py-4">
                <div v-if="user.card_no" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                   <CreditCard :size="12" class="mr-1.5" />
                   {{ user.card_no }}
                </div>
                <span v-else class="text-gray-400 text-xs">-</span>
            </td>

            <td class="px-6 py-4">
               <div class="flex items-center text-sm font-bold text-slate-700">
                  <Scale :size="14" class="mr-1.5 text-slate-400" />
                  {{ user.total_weight || 0 }} kg
               </div>
            </td>

            <td class="px-6 py-4">
              <div class="flex items-center text-sm text-blue-600 font-bold">
                <Trophy :size="14" class="mr-2" />
                {{ user.lifetime_integral ?? 0 }}
              </div>
              <div class="flex items-center text-[10px] text-gray-400 mt-1">
                 <Clock :size="10" class="mr-1" />
                 {{ formatDate(user.last_synced_at) }}
              </div>
            </td>

            <td class="px-6 py-4 text-right">
              <RouterLink :to="`/users/${user.id}`" class="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline decoration-blue-200 underline-offset-4">
                Sync & View <ChevronRight :size="14" class="ml-0.5" />
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>