import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';
import axios from 'axios';

export function useUserList() {
  const auth = useAuthStore();
  const users = ref<any[]>([]);
  const loading = ref(true);
  const isSubmitting = ref(false);

  // 1. Fetch Users + Wallet for Current Merchant
  const fetchUsers = async () => {
    // 1. Define Platform Owner Logic
    const isPlatformOwner = auth.role === 'SUPER_ADMIN' && !auth.merchantId;
    
    // 2. Security Check
    if (!auth.merchantId && !isPlatformOwner) return;

    loading.value = true;
    try {
        // 3. Build Query
        let query = supabase
            .from('users')
            .select(`
                *,
                merchant_wallets (
                    current_balance,
                    total_earnings,
                    merchant_id,
                    total_weight
                ),
                withdrawals (
                    amount,
                    status,
                    merchant_id
                )
            `)
            .order('created_at', { ascending: false });

        // 4. Apply Filter (If not Super Admin)
        if (!isPlatformOwner && auth.merchantId) {
            query = query.eq('merchant_wallets.merchant_id', auth.merchantId); 
        }

        const { data, error } = await query;
        if (error) throw error;

        // 5. Map Data
        users.value = data.map(u => {
            let currentBalance = 0;
            let totalEarnings = 0;
            let specificWeight = 0;
            let totalWithdrawn = 0;

            const userWithdrawals = u.withdrawals || [];

            // --- A. MERCHANT VIEW (Specific Wallet) ---
            if (auth.merchantId) {
                const wallet = u.merchant_wallets?.find((w: any) => w.merchant_id === auth.merchantId);
                
                currentBalance = wallet ? Number(wallet.current_balance) : 0;
                specificWeight = wallet ? Number(wallet.total_weight) : 0;
                
                totalWithdrawn = userWithdrawals
                    .filter((w: any) => w.merchant_id === auth.merchantId && w.status !== 'REJECTED')
                    .reduce((sum: number, w: any) => sum + Number(w.amount), 0);

                totalEarnings = Number((currentBalance + totalWithdrawn).toFixed(2));
            } 
            // --- B. SUPER ADMIN VIEW (Global Data) ---
            else {
                // 🟢 FIX: Prioritize 'lifetime_integral' (Vendor Sync) over 'walletSum' (Local Calc)
                // If lifetime_integral exists (even if 0), it is the Single Source of Truth for Global Balance.
                // We only fallback to wallet sums for legacy users (where lifetime_integral is null).
                
                const globalBalance = u.lifetime_integral; // Can be null
                
                const walletSumBalance = u.merchant_wallets?.reduce((sum: number, w: any) => sum + Number(w.current_balance || 0), 0) || 0;
                
                // If globalBalance is NOT null, use it. Otherwise use legacy wallet sum.
                currentBalance = (globalBalance !== null && globalBalance !== undefined) 
                    ? Number(globalBalance) 
                    : walletSumBalance;

                // 🟢 WEIGHT FIX: Same logic for Weight
                const globalWeight = u.total_weight;
                const walletSumWeight = u.merchant_wallets?.reduce((sum: number, w: any) => sum + Number(w.total_weight || 0), 0) || 0;
                
                specificWeight = (globalWeight !== null && globalWeight !== undefined)
                    ? Number(globalWeight)
                    : walletSumWeight;

                // Count ALL withdrawals (except rejected)
                totalWithdrawn = userWithdrawals
                    .filter((w: any) => w.status !== 'REJECTED')
                    .reduce((sum: number, w: any) => sum + Number(w.amount), 0);

                // Derive Global Earnings: Current Balance + Total Withdrawn
                totalEarnings = Number((currentBalance + totalWithdrawn).toFixed(2));
            }

            return {
                ...u,
                balance: Number(currentBalance.toFixed(2)),
                earnings: Number(totalEarnings.toFixed(2)),
                total_weight: Number(specificWeight.toFixed(2)),
                global_weight: Number(u.total_weight || 0),
            };
        });

    } catch (err: any) {
        console.error('Error fetching users:', err.message);
    } finally {
        loading.value = false;
    }
  };

  // 2. Adjust Balance
  const adjustBalance = async (userId: string, amount: number, note: string, category: 'ADJUSTMENT' | 'WITHDRAWAL') => {
      if (!userId || amount === 0) return;
      isSubmitting.value = true;
      try {
          let targetMerchantId = auth.merchantId;

          // Super Admin Logic: Find User's Primary Wallet
          if (!targetMerchantId) {
              const { data: userWallets } = await supabase
                  .from('merchant_wallets')
                  .select('merchant_id')
                  .eq('user_id', userId)
                  .order('total_earnings', { ascending: false }) 
                  .limit(1);
              
              targetMerchantId = userWallets?.[0]?.merchant_id;

              if (!targetMerchantId) {
                  const { data: fallback } = await supabase.from('merchants').select('id').limit(1).single();
                  targetMerchantId = fallback?.id;
              }
          }

          if (!targetMerchantId) throw new Error("Could not determine target merchant.");

          // Update Wallet
          const { data: wallet } = await supabase
              .from('merchant_wallets')
              .select('*')
              .eq('user_id', userId)
              .eq('merchant_id', targetMerchantId)
              .maybeSingle();

          const currentBal = wallet ? Number(wallet.current_balance) : 0;
          const currentEarn = wallet ? Number(wallet.total_earnings) : 0;
          const newBalance = currentBal + amount;

          if (wallet) {
              await supabase.from('merchant_wallets').update({
                  current_balance: newBalance,
                  total_earnings: amount > 0 ? currentEarn + amount : currentEarn
              }).eq('id', wallet.id);
          } else {
              await supabase.from('merchant_wallets').insert({
                  user_id: userId,
                  merchant_id: targetMerchantId,
                  current_balance: newBalance,
                  total_earnings: amount > 0 ? amount : 0
              });
          }

          // Create Withdrawal Record
          if (category === 'WITHDRAWAL') {
              await supabase.from('withdrawals').insert({
                  user_id: userId,
                  merchant_id: targetMerchantId,
                  amount: Math.abs(amount),
                  status: 'EXTERNAL_SYNC'
              });
          }

          // Ledger Entry
          await supabase.from('wallet_transactions').insert({
              merchant_id: targetMerchantId,
              user_id: userId,
              amount: amount,
              balance_after: newBalance,
              transaction_type: category === 'WITHDRAWAL' ? 'WITHDRAWAL_SYNC' : 'MANUAL_ADJUSTMENT',
              description: note || (category === 'WITHDRAWAL' ? 'Imported Historical Withdrawal' : 'Balance Correction')
          });
          
          await fetchUsers(); 
          return { success: true, newBalance };

      } catch (err: any) {
          return { success: false, error: err.message };
      } finally {
          isSubmitting.value = false;
      }
  };
  
  // 3. Import User
  const importUser = async (nickname: string, phone: string) => {
      isSubmitting.value = true;
      try {
          // A. Create User Locally
          const { data: newUser, error: uError } = await supabase
              .from('users')
              .upsert({ 
                  phone, 
                  nickname, 
                  is_active: true,
              }, { onConflict: 'phone' })
              .select().single();

          if (uError) throw uError;

          // B. Create Empty Wallet for THIS Merchant
          if (auth.merchantId) {
              const { error: wError } = await supabase
                  .from('merchant_wallets')
                  .insert({
                      user_id: newUser.id,
                      merchant_id: auth.merchantId,
                      current_balance: 0,
                      total_earnings: 0
                  });
              if (wError && wError.code !== '23505') throw wError;
          }

          // C. Call Onboard API
          try {
             await axios.post('/api/onboard', { phone });
          } catch (e) {
             console.warn("Onboard sync warning:", e);
          }

          // D. Refresh List
          await fetchUsers(); 
          return { success: true };

      } catch (err: any) {
          console.error("Import failed:", err);
          return { success: false, error: err.response?.data?.error || err.message };
      } finally {
          isSubmitting.value = false;
      }
  };

  onMounted(() => {
    fetchUsers();
  });

  return { 
      users, 
      loading, 
      isSubmitting,
      fetchUsers, 
      adjustBalance, 
      importUser 
  };
}