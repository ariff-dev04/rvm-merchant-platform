import { ref } from 'vue';
import { supabase } from '../services/supabase';
//import { syncUserAccount } from '../services/autogcm';
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
    const auth = useAuthStore();
    const userId = withdrawal.user_id;

    checkingBalanceId.value = withdrawal.id;
    balanceResult.value = null;

    try {
      // 1. Define the scope (Specific Merchant vs Global)
      const targetMerchantId = auth.merchantId || withdrawal.merchant_id;

      // 2. Fetch Total Earnings from THIS Merchant (Source of Truth)
      // We look at submission_reviews to see how much recycling they did here.
      let earningsQuery = supabase
        .from('submission_reviews')
        .select('machine_given_points')
        .eq('user_id', userId)
        .neq('status', 'REJECTED'); // Valid recycles only

      if (targetMerchantId) {
        earningsQuery = earningsQuery.eq('merchant_id', targetMerchantId);
      }

      const { data: earningsData } = await earningsQuery;
      const totalEarned = (earningsData || []).reduce((sum, r) => sum + Number(r.machine_given_points || 0), 0);

      // 3. Fetch Total Withdrawals from THIS Merchant
      let withdrawalsQuery = supabase
        .from('withdrawals')
        .select('amount')
        .eq('user_id', userId)
        .neq('status', 'REJECTED'); // Valid withdrawals only

      if (targetMerchantId) {
        withdrawalsQuery = withdrawalsQuery.eq('merchant_id', targetMerchantId);
      }

      const { data: withdrawalsData } = await withdrawalsQuery;
      const totalWithdrawn = (withdrawalsData || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);

      // 4. Calculate Available Balance for THIS Merchant
      const availableBalance = totalEarned - totalWithdrawn;

      balanceResult.value = {
        id: withdrawal.id,
        available: Number(availableBalance.toFixed(2)), 
        lifetime: Number(totalEarned.toFixed(2)),
        spent: Number(totalWithdrawn.toFixed(2))
      };

    } catch (error: any) {
      alert(`Audit Error: ${error.message || "Unknown"}`);
      console.error(error);
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