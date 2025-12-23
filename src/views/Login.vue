<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Lock, Mail, ArrowRight, MonitorSmartphone, UserPlus } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

const email = ref('');
const password = ref('');
const loading = ref(false);
const errorMsg = ref('');
const isRegisterMode = ref(false); // Toggle between Login and Register

const router = useRouter();
const auth = useAuthStore();

const handleSubmit = async () => {
  loading.value = true;
  errorMsg.value = '';

  try {
    if (!email.value || !password.value) {
      throw new Error('Please enter both email and password');
    }

    if (isRegisterMode.value) {
      // Create new password for whitelisted email
      await auth.register(email.value, password.value);
    } else {
      // Normal Login
      await auth.login(email.value, password.value);
    }
    
    // Redirect handled inside store, but just in case:
    if (auth.user) router.push('/');

  } catch (e: any) {
    errorMsg.value = e.message || 'Authentication failed';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
    <div class="sm:mx-auto sm:w-full sm:max-w-md">
      <div class="flex justify-center text-blue-600 mb-4">
        <MonitorSmartphone :size="48" />
      </div>
      <h2 class="text-center text-3xl font-extrabold text-gray-900">
        RVM Admin
      </h2>
      <p class="mt-2 text-center text-sm text-gray-600">
        {{ isRegisterMode ? 'Activate your admin account' : 'Sign in to manage the system' }}
      </p>
    </div>

    <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <form class="space-y-6" @submit.prevent="handleSubmit">
          
          <div>
            <label for="email" class="block text-sm font-medium text-gray-700">Email address</label>
            <div class="mt-1 relative rounded-md shadow-sm">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail :size="16" class="text-gray-400" />
              </div>
              <input 
                v-model="email"
                id="email" type="email" required 
                class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="admin@company.com"
              />
            </div>
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">
              {{ isRegisterMode ? 'Set your Password' : 'Password' }}
            </label>
            <div class="mt-1 relative rounded-md shadow-sm">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock :size="16" class="text-gray-400" />
              </div>
              <input 
                v-model="password"
                id="password" type="password" required 
                class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div v-if="errorMsg" class="rounded-md bg-red-50 p-4 border border-red-100">
            <div class="flex">
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800">{{ errorMsg }}</h3>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            :disabled="loading"
            class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
          >
            <span v-if="loading">Processing...</span>
            <span v-else class="flex items-center">
              {{ isRegisterMode ? 'Create Account' : 'Sign in' }} 
              <ArrowRight :size="16" class="ml-2" />
            </span>
          </button>
        </form>

        <div class="mt-6">
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-300"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-white text-gray-500">
                {{ isRegisterMode ? 'Already have an account?' : 'New admin?' }}
              </span>
            </div>
          </div>

          <div class="mt-6 grid grid-cols-1">
            <button 
              @click="isRegisterMode = !isRegisterMode; errorMsg = ''"
              class="w-full flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
            >
              <UserPlus v-if="!isRegisterMode" :size="16" class="mr-2 text-gray-500" />
              {{ isRegisterMode ? 'Back to Login' : 'First Time Activation' }}
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>