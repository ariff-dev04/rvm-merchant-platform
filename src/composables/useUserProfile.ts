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

  // AUDIT STATE
  const auditResult = ref({
    totalEarned: 0,
    totalWithdrawn: 0,
    calculatedBalance: 0,
    apiSnapshot: 0,
    isMatch: false,
    externalDeductions: 0 // How many points we just auto-corrected
  });

  const fetchProfile = async () => {
    loading.value = true;
    try {
      // 1. Get User
      const { data: userData } = await supabase.from('users').select('*').eq('id', userId).single();
      user.value = userData as User;

      // 2. Get Withdrawals
      const { data: withdrawals } = await supabase.from('withdrawals').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      withdrawalHistory.value = (withdrawals as Withdrawal[]) || [];

      // 3. Get API History (Recycling)
      if (userData?.phone) {
         const apiRecords = await getUserRecords(userData.phone, 1, 1000); 
         disposalHistory.value = apiRecords || [];
         
         // 4. Run Calc (No auto-fix here, just read-only)
         if (userData.lifetime_integral !== undefined) {
             calculateLedger(disposalHistory.value, withdrawalHistory.value, userData.lifetime_integral);
         }
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      loading.value = false;
    }
  };

  // 🧮 Pure Calculation Helper
  const calculateLedger = (earnings: ApiDisposalRecord[], withdrawals: Withdrawal[], liveBalance: number) => {
      // Sum API Recycling
      const totalEarned = earnings.reduce((sum, r) => sum + Number(r.integral || 0), 0);
      
      // Sum Local Withdrawals
      const totalWithdrawn = withdrawals.reduce((sum, w) => sum + Number(w.amount || 0), 0);
      
      const theoreticalBalance = totalEarned - totalWithdrawn;
      
      auditResult.value = {
          totalEarned: parseFloat(totalEarned.toFixed(2)),
          totalWithdrawn: parseFloat(totalWithdrawn.toFixed(2)),
          calculatedBalance: parseFloat(theoreticalBalance.toFixed(2)),
          apiSnapshot: parseFloat(Number(liveBalance).toFixed(2)),
          isMatch: Math.abs(theoreticalBalance - Number(liveBalance)) < 0.1,
          externalDeductions: 0
      };
      
      return { totalEarned, totalWithdrawn, theoreticalBalance };
  };

  // 🔄 SMART SYNC: Detects & Fixes External Withdrawals
  const syncData = async () => {
    if (!user.value) return;
    isSyncing.value = true;

    try {
      // 1. Get Fresh Data from API
      const apiAccount = await syncUserAccount(user.value.phone);
      const apiRecords = await getUserRecords(user.value.phone, 1, 1000); 
      
      if (apiAccount && apiRecords) {
        // 2. Update Local State Temporarily for Calculation
        const currentWithdrawals = await supabase.from('withdrawals').select('*').eq('user_id', userId);
        const localWithdrawals = (currentWithdrawals.data as Withdrawal[]) || [];
        
        // 3. Calculate Discrepancy
        const { theoreticalBalance } = calculateLedger(apiRecords, localWithdrawals, apiAccount.integral);
        
        const liveBalance = Number(apiAccount.integral);
        const difference = theoreticalBalance - liveBalance;

        // 4. 🚨 AUTO-CORRECT: If Theoretical > Live, they spent points externally!
        if (difference > 0.1) {
            console.log(`⚠️ External Withdrawal Detected: ${difference.toFixed(2)} pts.`);
            
            const { error } = await supabase.from('withdrawals').insert({
                user_id: userId,
                amount: difference.toFixed(2),
                status: 'EXTERNAL_SYNC', // ✅ Uppercase to match DB Check Constraint
                created_at: new Date().toISOString()
            });

            if (error) {
                console.error("🔥 Supabase Insert Failed:", error.message);
                alert("Sync Error: " + error.message);
            }
        }

        // 5. Update User Profile in Supabase (FIXED MAPPING HERE)
        const calculatedWeight = apiRecords.reduce((sum: number, r: any) => sum + Number(r.weight || 0), 0);
        
        const updates: any = {
           last_synced_at: new Date().toISOString(),
           lifetime_integral: apiAccount.integral,
           total_weight: calculatedWeight.toFixed(2),
           // 👇 FIX: Map API 'nikeName' -> DB 'nickname'
           nickname: apiAccount.nikeName || apiAccount.name || user.value.nickname, 
           // 👇 FIX: Map API 'imgUrl' -> DB 'avatar_url'
           avatar_url: apiAccount.imgUrl || user.value.avatar_url,
           // 👇 FIX: Ensure Vendor ID is saved
           vendor_user_no: apiAccount.userNo || user.value.vendor_user_no,
           vendor_internal_id: apiAccount.userNo || user.value.vendor_internal_id
        };

        const { error: updateError } = await supabase.from('users').update(updates).eq('id', userId);
        
        if (updateError) console.error("User Update Failed:", updateError);
        
        user.value = { ...user.value, ...updates };

        // 6. Refresh Lists
        await fetchProfile();
      }
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      isSyncing.value = false;
    }
  };

  fetchProfile();

  return { 
    user, 
    disposalHistory, 
    withdrawalHistory, 
    loading, 
    isSyncing, 
    syncData,
    auditResult 
  };
}