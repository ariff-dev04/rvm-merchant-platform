import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useRouter } from 'vue-router';
import type { User, Session } from '@supabase/supabase-js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const session = ref<Session | null>(null);
  const loading = ref(true);
  
  // SaaS Context
  const role = ref<string | null>(null);
  const merchantId = ref<string | null>(null); 

  const router = useRouter();

  // 1. Initialize: Check session & Load Profile
  async function initializeAuth() {
    if (window.location.pathname === '/login') {
        loading.value = false;
        return; 
    }

    loading.value = true;
    const { data } = await supabase.auth.getSession();
    
    if (data.session) {
      const email = data.session.user.email;
      if (email) {
        // We are already logged in, so we can safely Read the profile
        const success = await fetchAdminProfile(email);
        if (success) {
            session.value = data.session;
            user.value = data.session.user;
        } else {
            await logout(); // Profile missing or deleted
        }
      } else {
        await logout();
      }
    }
    loading.value = false;
  }

  // 2. Helper: Check Whitelist (SECURE RPC)
  // Uses the SQL function we created to bypass RLS safely for anonymous users
  async function checkWhitelist(email: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('check_admin_whitelist', { 
        check_email: email 
    });
    
    if (error) {
        console.error("Whitelist check failed:", error);
        return false;
    }
    return !!data;
  }

  // 3. Helper: Fetch Profile (REQUIRES AUTH)
  // Only call this AFTER logging in
  async function fetchAdminProfile(email: string) {
    const { data } = await supabase
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

  // 4. Login
  async function login(email: string, password: string) {
    // A. Check Whitelist via RPC (Safe for anonymous)
    const isAllowed = await checkWhitelist(email);
    if (!isAllowed) throw new Error("Access Denied: You are not an administrator.");

    // B. Perform Login
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // C. Load Profile (Now that we have a session, RLS allows this)
    if (data.session && data.user?.email) {
        session.value = data.session;
        user.value = data.user;
        await fetchAdminProfile(data.user.email);
        router.push('/');
    }
  }

  // 5. Register
  async function register(email: string, password: string) {
    // A. Check Whitelist via RPC
    const isAllowed = await checkWhitelist(email);
    if (!isAllowed) throw new Error("Access Denied: Email not invited.");

    // B. Create Account
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    
    // C. Handle Auto-Login
    if (data.session && data.user?.email) {
      session.value = data.session;
      user.value = data.user;
      await fetchAdminProfile(data.user.email);
      router.push('/');
    } else {
        alert("Account created! Please check your email.");
    }
  }

  async function logout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.warn("Supabase logout error (ignoring):", error.message);
    } catch (err) {
      console.warn("Logout network error (ignoring):", err);
    } finally {
      console.log("Cleaning up local session...");
      
      // Reset Store
      user.value = null;
      session.value = null;
      role.value = null;
      merchantId.value = null;

      // Wipe Storage
      localStorage.clear(); 

      console.log("Redirecting to login...");
      router.replace('/login');
    }
  }

  return { user, session, role, merchantId, loading, initializeAuth, login, register, logout };
});