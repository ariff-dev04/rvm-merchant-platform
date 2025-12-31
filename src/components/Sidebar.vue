<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { LayoutDashboard, Wallet, Users, MonitorSmartphone, LogOut, Shield, ClipboardCheck, Trash2, Settings } from 'lucide-vue-next';

const route = useRoute();
const auth = useAuthStore();
const isActive = (path: string) => route.path === path;

const handleLogout = async () => {
  try {
    await auth.logout();
  } catch (err) {
    console.error("Logout failed", err);
  }
};
</script>

<template>
  <aside class="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-10">
    <div class="h-16 flex items-center px-8 border-b border-gray-100">
      <div class="text-xl font-bold text-blue-600 flex items-center gap-2">
        <MonitorSmartphone />
        <span>RVM Admin</span>
      </div>
    </div>

    <nav class="flex-1 p-4 space-y-2 overflow-y-auto">
      <RouterLink to="/" 
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors"
        :class="isActive('/') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
      >
        <LayoutDashboard :size="20" />
        Dashboard
      </RouterLink>

      <RouterLink to="/submissions" 
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors"
        :class="isActive('/submissions') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
      >
        <ClipboardCheck :size="20" />
        Submissions
      </RouterLink>

      <RouterLink to="/withdrawals" 
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors"
        :class="isActive('/withdrawals') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
      >
        <Wallet :size="20" />
        Withdrawals
      </RouterLink>

      <RouterLink to="/users" 
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors"
        :class="isActive('/users') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
      >
        <Users :size="20" />
        Users
      </RouterLink>

      <RouterLink to="/machines" 
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors"
        :class="isActive('/machines') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
      >
        <MonitorSmartphone :size="20" />
        Machines
      </RouterLink>

      <RouterLink to="/cleaning-logs" 
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors"
        :class="isActive('/cleaning-logs') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
      >
        <Trash2 :size="20" />
        Waste Logs
      </RouterLink>

      <RouterLink to="/admins" 
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors"
        :class="isActive('/admins') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
        >
        <Shield :size="20" /> 
        Admin Access
      </RouterLink>
    </nav>

    <div class="p-4 border-t border-gray-100 space-y-2">
      <RouterLink to="/settings" 
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors"
        :class="isActive('/settings') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
      >
          <Settings :size="20" />
          <span>Settings</span>
      </RouterLink>

      <button 
        @click="handleLogout"
        class="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg w-full transition-colors cursor-pointer"
      >
        <LogOut :size="20" />
        Logout
      </button>
    </div>
  </aside>
</template>