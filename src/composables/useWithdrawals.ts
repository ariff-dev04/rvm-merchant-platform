import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { syncUserAccount } from '../services/autogcm';
import { WithdrawalStatus, type Withdrawal } from '../types';
import { useAuthStore } from '../stores/auth';

interface BalanceCheckResult {
  id: string;
  available: number;
  lifetime: number;
  spent: number;
}

export function useWithdrawals() {
  const withdrawals = ref<Withdrawal[]>([]);
  const loading = ref(false);
  
  // Balance Check State
  const checkingBalanceId = ref<string | null>(null);
  const balanceResult = ref<BalanceCheckResult | null>(null);

  // 1. Fetch Data
  const fetchWithdrawals = async () => {
    const auth = useAuthStore();
    loading.value = true;
    try {
      let query = supabase
        .from('withdrawals')
        .select(`
            *,
            users (
            nickname,
            phone,
            avatar_url
            )
        `)
        .order('created_at', { ascending: false });

      // 🔥 SaaS Filter
      if (auth.merchantId) {
          query = query.eq('merchant_id', auth.merchantId);
      }

      const { data, error } = await query;

      if (error) throw error;
      withdrawals.value = data as Withdrawal[];
    } catch (error) {
      console.error("Failed to load withdrawals", error);
    } finally {
      loading.value = false;
    }
  };

  // 2. Update Status
  const updateStatus = async (id: string, newStatus: WithdrawalStatus) => {
    if (!confirm(`Mark this request as ${newStatus}?`)) return;

    try {
      const { error } = await supabase
        .from('withdrawals')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      // Clear balance check if it was for this item
      if (balanceResult.value?.id === id) {
        balanceResult.value = null;
      }
      await fetchWithdrawals(); // Refresh list
    } catch (error) {
      alert("Failed to update status");
      console.error(error);
    }
  };

  // 3. Hybrid Balance Check
  const checkBalance = async (withdrawal: Withdrawal) => {
    // Safety check for user phone
    const userPhone = withdrawal.users?.phone;
    if (!userPhone) {
      alert("Error: User phone number not found.");
      return;
    }

    checkingBalanceId.value = withdrawal.id;
    balanceResult.value = null;

    try {
      // A. Get Live API Points (This is the CURRENT Available Balance)
      const apiResponse: any = await syncUserAccount(userPhone);
      const currentLiveBalance = Number(apiResponse.integral || 0);

      // B. Get DB Spent (Total Redeemed)
      const { data: history } = await supabase
        .from('withdrawals')
        .select('amount, status')
        .eq('user_id', withdrawal.user_id);

      const totalSpent = (history || [])
        .filter(w => w.status !== WithdrawalStatus.REJECTED)
        .reduce((sum, w) => sum + Number(w.amount), 0);

      // C. Calculate Lifetime (Current + Spent)
      const estimatedLifetime = currentLiveBalance + totalSpent;

      balanceResult.value = {
        id: withdrawal.id,
        available: currentLiveBalance, // ✅ Correct: Directly from API
        lifetime: estimatedLifetime,   // ✅ Correct: Calculated total
        spent: totalSpent
      };
    } catch (error: any) {
      alert(`API Error: ${error.message || "Unknown"}`);
    } finally {
      checkingBalanceId.value = null;
    }
  };

  return {
    withdrawals,
    loading,
    checkingBalanceId,
    balanceResult,
    fetchWithdrawals,
    updateStatus,
    checkBalance
  };
}