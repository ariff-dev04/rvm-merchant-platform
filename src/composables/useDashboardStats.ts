import { ref } from 'vue';
import { supabase } from '../services/supabase';
import type { Withdrawal, SubmissionReview } from '../types';
import { useAuthStore } from '../stores/auth';

// Define a simple type for Cleaning Record
interface CleaningRecord {
  id: string;
  device_no: string;
  cleaner_name?: string;
  verified_status: string;
  created_at: string;
  machines?: { address: string; deviceName: string };
}

export function useDashboardStats() {
  const loading = ref(true);
  const pendingCount = ref(0);
  const totalPoints = ref(0);
  const totalWeight = ref(0);
  
  // ⚡ DATA BUCKETS
  const recentWithdrawals = ref<Withdrawal[]>([]);
  const recentSubmissions = ref<SubmissionReview[]>([]);
  const recentCleaning = ref<CleaningRecord[]>([]);

  async function fetchStats() {
    const auth = useAuthStore();
    loading.value = true;
    
    // Helper to apply merchant filter
    const applyFilter = (query: any) => {
        if (auth.merchantId) return query.eq('merchant_id', auth.merchantId);
        return query;
    };

    try {
      // 1. Prepare Queries
      // A. Pending Withdrawals
      let pendingQuery = supabase.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
      
      // B. Total Stats 
      // 🔥 UPDATED: Added 'status' so we can filter the math
      let statsQuery = supabase.from('submission_reviews').select('api_weight, calculated_value, status');
      
      // C. Recent Lists
      let recWithdrawalsQuery = supabase.from('withdrawals').select('*, users(nickname, phone)').order('created_at', { ascending: false }).limit(5);
      let recSubmissionsQuery = supabase.from('submission_reviews').select('*, users(nickname)').order('submitted_at', { ascending: false }).limit(5);
      
      // 2. Apply Filters
      pendingQuery = applyFilter(pendingQuery);
      statsQuery = applyFilter(statsQuery); 
      recWithdrawalsQuery = applyFilter(recWithdrawalsQuery);
      recSubmissionsQuery = applyFilter(recSubmissionsQuery);

      // 3. Execute Parallel
      const [pendingRes, statsRes, recWRes, recSRes] = await Promise.all([
        pendingQuery,
        statsQuery,
        recWithdrawalsQuery,
        recSubmissionsQuery
      ]);

      // 4. Process Results
      if (pendingRes.count !== null) pendingCount.value = pendingRes.count;

      if (statsRes.data) {
          // Weight: Counts EVERYTHING (The trash is physically in the machine)
          totalWeight.value = statsRes.data.reduce((sum, r) => sum + (Number(r.api_weight) || 0), 0);
          
          // 🔥 POINTS FIX: Only count value if we have VERIFIED it
          totalPoints.value = statsRes.data.reduce((sum, r) => {
              if (r.status === 'VERIFIED') {
                  return sum + (Number(r.calculated_value) || 0);
              }
              return sum;
          }, 0);
      }

      // @ts-ignore
      if (recWRes.data) recentWithdrawals.value = recWRes.data;
      // @ts-ignore
      if (recSRes.data) recentSubmissions.value = recSRes.data;

    } catch (err) {
      console.error("Stats Error:", err);
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    pendingCount,
    totalPoints,
    totalWeight,
    recentWithdrawals,
    recentSubmissions,
    recentCleaning,
    fetchStats
  };
}