import { ref } from 'vue';
import { supabase } from '../services/supabase';
import type { Withdrawal, SubmissionReview } from '../types';
import { useAuthStore } from '../stores/auth';

// Define Cleaning Record Type matches your DB relation
interface CleaningRecord {
  id: string;
  device_no: string;
  cleaner_name?: string;
  status: string; // changed from verified_status to status based on your DB
  created_at: string;
  machines?: { device_name: string }; // Supabase returns snake_case usually
}

export function useDashboardStats() {
  const loading = ref(true);
  const pendingCount = ref(0);
  const totalPoints = ref(0);
  const totalWeight = ref(0);
  
  // ⚡ DATA BUCKETS
  const recentWithdrawals = ref<Withdrawal[]>([]);
  const recentSubmissions = ref<SubmissionReview[]>([]);
  const recentCleaning = ref<CleaningRecord[]>([]); // This was empty before!

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
      let statsQuery = supabase.from('submission_reviews').select('api_weight, calculated_value, status');
      
      // C. Recent Lists
      let recWithdrawalsQuery = supabase.from('withdrawals').select('*, users(nickname, phone)').order('created_at', { ascending: false }).limit(5);
      let recSubmissionsQuery = supabase.from('submission_reviews').select('*, users(nickname)').order('submitted_at', { ascending: false }).limit(5);
      
      // 🔥 MISSING PART ADDED HERE: Fetch Cleaning Records
      // We join 'machines' to get the name, and order by 'cleaned_at' (or created_at)
      let recCleaningQuery = supabase
          .from('cleaning_records')
          .select('*') 
          .order('created_at', { ascending: false })
          .limit(5);

      // 2. Apply Filters to ALL queries
      pendingQuery = applyFilter(pendingQuery);
      statsQuery = applyFilter(statsQuery); 
      recWithdrawalsQuery = applyFilter(recWithdrawalsQuery);
      recSubmissionsQuery = applyFilter(recSubmissionsQuery);
      recCleaningQuery = applyFilter(recCleaningQuery); // Don't forget this one!

      // 3. Execute Parallel (Added the 5th query)
      const [pendingRes, statsRes, recWRes, recSRes, recCRes] = await Promise.all([
        pendingQuery,
        statsQuery,
        recWithdrawalsQuery,
        recSubmissionsQuery,
        recCleaningQuery
      ]);

      // 4. Process Results
      if (pendingRes.count !== null) pendingCount.value = pendingRes.count;

      if (statsRes.data) {
          totalWeight.value = statsRes.data.reduce((sum, r) => sum + (Number(r.api_weight) || 0), 0);
          
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
      
      // 🔥 POPULATE THE CLEANING DATA
      if (recCRes.data) {
          // @ts-ignore
          recentCleaning.value = recCRes.data;
      }

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