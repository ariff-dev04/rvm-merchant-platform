<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Trash2, UserPlus, Shield } from 'lucide-vue-next';
import { supabase } from '../services/supabase'; // Import Supabase

interface AdminUser {
  id: string;
  email: string;
  role: 'SUPER_ADMIN' | 'EDITOR' | 'VIEWER';
  created_at: string;
}

const admins = ref<AdminUser[]>([]);
const newEmail = ref('');
const newRole = ref('VIEWER');
const showAddModal = ref(false);
const loading = ref(true);

// 1. Fetch Real Data from Supabase
async function fetchAdmins() {
  loading.value = true;
  const { data, error } = await supabase
    .from('app_admins')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching admins:', error);
  } else {
    admins.value = data as AdminUser[];
  }
  loading.value = false;
}

// 2. Add New Admin to Supabase
const addAdmin = async () => {
  if (!newEmail.value) return;

  const { data, error } = await supabase
    .from('app_admins')
    .insert([
      { email: newEmail.value, role: newRole.value }
    ])
    .select();

  if (error) {
    alert('Failed to add admin: ' + error.message);
  } else if (data) {
    admins.value.unshift(data[0] as AdminUser); // Add to list immediately
    newEmail.value = '';
    showAddModal.value = false;
  }
};

// 3. Remove Admin from Supabase
const removeAdmin = async (id: string) => {
  if (!confirm('Revoke access for this admin?')) return;

  const { error } = await supabase
    .from('app_admins')
    .delete()
    .eq('id', id);

  if (error) {
    alert('Error removing admin');
  } else {
    admins.value = admins.value.filter(a => a.id !== id);
  }
};

// Load data when page opens
onMounted(() => {
  fetchAdmins();
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
         <h1 class="text-2xl font-bold text-gray-900 flex items-center">
           <Shield class="mr-3 text-blue-600" :size="28" />
           Admin Access
         </h1>
         <p class="text-gray-500 mt-1">Manage who can access this dashboard</p>
      </div>
      <button 
        @click="showAddModal = !showAddModal"
        class="flex items-center space-x-2 text-sm text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-sm transition-all"
      >
        <UserPlus :size="16" />
        <span>Add Admin</span>
      </button>
    </div>

    <div v-if="showAddModal" class="bg-blue-50 p-6 rounded-xl border border-blue-100 animate-fade-in-down">
      <h3 class="text-sm font-bold text-blue-800 mb-4">Invite New Administrator</h3>
      <div class="flex gap-4 items-end">
        <div class="flex-1">
          <label class="block text-xs font-medium text-blue-800 mb-1">Email Address</label>
          <input v-model="newEmail" type="email" class="w-full px-3 py-2 border border-blue-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" placeholder="colleague@example.com" />
        </div>
        <div class="w-48">
          <label class="block text-xs font-medium text-blue-800 mb-1">Role</label>
          <select v-model="newRole" class="w-full px-3 py-2 border border-blue-200 rounded-md bg-white">
            <option value="VIEWER">Viewer (Read Only)</option>
            <option value="EDITOR">Editor (Can Approve)</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>
        <button @click="addAdmin" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium">
          Send Invite
        </button>
      </div>
    </div>

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-left">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase font-semibold">
          <tr>
            <th class="px-6 py-4">Admin User</th>
            <th class="px-6 py-4">Role</th>
            <th class="px-6 py-4">Added Date</th>
            <th class="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="admin in admins" :key="admin.id" class="hover:bg-gray-50">
            <td class="px-6 py-4">
              <div class="font-medium text-gray-900">{{ admin.email }}</div>
            </td>
            <td class="px-6 py-4">
              <span :class="`px-2 py-1 text-xs font-bold rounded-full 
                ${admin.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`">
                {{ admin.role.replace('_', ' ') }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ new Date(admin.created_at).toLocaleDateString() }}
            </td>
            <td class="px-6 py-4 text-right">
              <button @click="removeAdmin(admin.id)" class="text-gray-400 hover:text-red-600 transition-colors">
                <Trash2 :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>