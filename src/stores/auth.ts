import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useRouter } from 'vue-router';
import type { User, Session } from '@supabase/supabase-js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const loading = ref(true);
  
  // 🔥 NEW: Store the SaaS Context
  const role = ref<string | null>(null);
  const merchantId = ref<string | null>(null); // If null, they are Super Admin

  const router = useRouter();

  // 1. Initialize: Check session & Load Profile
  async function initializeAuth() {
    loading.value = true;
    const { data } = await supabase.auth.getSession();
    
    if (data.session) {
      const email = data.session.user.email;
      if (email) {
        // Load the profile (Role + Merchant ID)
        await loadAdminProfile(email);
        session.value = data.session;
        user.value = data.session.user;
      } else {
        await logout();
      }
    }
    loading.value = false;
  }

  // 2. Helper: Fetch Profile from DB
  async function loadAdminProfile(email: string) {
    const { data } = await supabase // <--- Removed 'error'
      .from('app_admins')
      .select('role, merchant_id')
      .eq('email', email)
      .single();
    
    if (data) {
        role.value = data.role;
        merchantId.value = data.merchant_id;
        console.log(`👤 Login Profile: ${data.role} | Merchant: ${data.merchant_id || 'Global'}`);
        return true;
    }
    return false;
  }

  // 3. Login
  async function login(email: string, password: string) {
    // A. Check Whitelist & Load Profile First
    const isValid = await loadAdminProfile(email);
    if (!isValid) throw new Error("Access Denied: You are not an administrator.");

    // B. Perform Login
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    session.value = data.session;
    user.value = data.user;
    router.push('/');
  }

  // 4. Register
  async function register(email: string, password: string) {
    const isValid = await loadAdminProfile(email);
    if (!isValid) throw new Error("Access Denied: Email not invited.");

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    
    if (data.session) {
      session.value = data.session;
      user.value = data.user;
      router.push('/');
    } else {
        alert("Account created! Please check your email.");
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    user.value = null;
    session.value = null;
    role.value = null;
    merchantId.value = null;
    router.push('/login');
  }

  return { user, session, role, merchantId, loading, initializeAuth, login, register, logout };
});