import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { getUserRecords, syncUserAccount } from '../services/autogcm';
import type { User, Withdrawal, ApiDisposalRecord } from '../types';

export function useUserProfile(userId: string) {
  const user = ref<User | null>(null);
  const disposalHistory = ref<ApiDisposalRecord[]>([]);
  const withdrawalHistory = ref<Withdrawal[]>([]);
  const loading = ref(true);
  const isSyncing = ref(false);

  // 1. Fetch Data (Read-Only)
  const fetchProfile = async () => {
    loading.value = true;
    try {
      // A. Get Local User
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      user.value = userData as User;

      // B. Get Local Withdrawals
      const { data: withdrawals } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      withdrawalHistory.value = (withdrawals as Withdrawal[]) || [];

      // C. Get API History (for display)
      const apiRecords = await getUserRecords(userData.phone);
      disposalHistory.value = apiRecords || [];

    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      loading.value = false;
    }
  };

  // 2. Manual Sync Logic
  const syncData = async () => {
    if (!user.value) return;
    isSyncing.value = true;
    console.log("🔄 Syncing:", user.value.phone);

    try {
      // A. Fetch latest data from API
      const apiAccount = await syncUserAccount(user.value.phone);
      // Re-fetch history to ensure we have the latest weights/ids
      const apiRecords = await getUserRecords(user.value.phone); 
      disposalHistory.value = apiRecords || [];

      if (apiAccount) {
        // B. Calculate Totals & Extract IDs
        // Calculate Total Weight (Sum of all records)
        const calculatedWeight = apiRecords.reduce((sum, r) => sum + Number(r.weight || 0), 0);
        
        // Find first record with IDs
        const recordWithCard = apiRecords.find(r => r.cardNo && r.cardNo !== "0");
        const recordWithInternalId = apiRecords.find(r => r.userId && r.userId !== "0");

        // C. Prepare Updates
        const updates: any = {
          last_synced_at: new Date().toISOString(),
          lifetime_integral: apiAccount.integral,
          vendor_user_no: apiAccount.userNo,
          total_weight: calculatedWeight.toFixed(2) // ✅ NEW: Save Weight
        };

        // Update IDs if found
        if (recordWithCard?.cardNo) updates.card_no = recordWithCard.cardNo;
        if (recordWithInternalId?.userId) updates.vendor_internal_id = recordWithInternalId.userId; // ✅ NEW: Save Internal ID

        // Update Profile Info (only if not empty)
        if (apiAccount.nikeName?.trim()) updates.nickname = apiAccount.nikeName;
        if (apiAccount.imgUrl?.trim()) updates.avatar_url = apiAccount.imgUrl;

        console.log("💾 Saving Updates:", updates);

        // D. Save to DB & Update Local State
        const { error } = await supabase.from('users').update(updates).eq('id', userId);
        if (error) throw error;
        
        user.value = { ...user.value, ...updates };
        console.log("✅ Sync Successful");
      }
    } catch (err) {
      console.error("Sync failed:", err);
      alert("Sync failed. Check console.");
    } finally {
      isSyncing.value = false;
    }
  };

  // Initial Load
  fetchProfile();

  return { 
    user, 
    disposalHistory, 
    withdrawalHistory, 
    loading, 
    isSyncing, 
    fetchProfile, 
    syncData 
  };
}