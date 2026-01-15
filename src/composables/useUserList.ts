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
    
    // 2. Security: If not a Merchant AND not the Platform Owner, stop.
    if (!auth.merchantId && !isPlatformOwner) return;

    loading.value = true;
    try {
        // 3. Start building the query
        let query = supabase
            .from('users')
            .select(`
                *,
                merchant_wallets (
                    current_balance,
                    total_earnings,
                    merchant_id,
                    total_weight
                )
            `)
            .order('created_at', { ascending: false });

        // 4. Apply Filter: Only filter by merchant_id if NOT Platform Owner
        if (!isPlatformOwner && auth.merchantId) {
            query = query.eq('merchant_wallets.merchant_id', auth.merchantId); 
        }

        // 5. Execute Query (Once)
        const { data, error } = await query;

        if (error) throw error;

        // 6. Map Data
        users.value = data.map(u => {
            let currentBalance = 0;
            let totalEarnings = 0;
            let specificWeight = 0;

            if (auth.merchantId) {
                // 🏪 MERCHANT VIEW
                const wallet = u.merchant_wallets?.find((w: any) => w.merchant_id === auth.merchantId);
                
                currentBalance = wallet ? Number(wallet.current_balance) : 0;
                totalEarnings = wallet ? Number(wallet.total_earnings) : 0;
                specificWeight = wallet ? Number(wallet.total_weight) : 0;
            } else {
                // 👑 SUPER ADMIN VIEW
                if (u.merchant_wallets && Array.isArray(u.merchant_wallets)) {
                    currentBalance = u.merchant_wallets.reduce((sum: number, w: any) => sum + Number(w.current_balance || 0), 0);
                    totalEarnings = u.merchant_wallets.reduce((sum: number, w: any) => sum + Number(w.total_earnings || 0), 0);
                    specificWeight = u.merchant_wallets.reduce((sum: number, w: any) => sum + Number(w.total_weight || 0), 0);
                }
            }

            return {
                ...u,
                // 🟢 FIX: Clean the numbers here to avoid 50.279999999
                balance: Number(currentBalance.toFixed(2)),
                earnings: Number(totalEarnings.toFixed(2)),
                total_weight: Number(specificWeight.toFixed(2)) 
            };
        });

    } catch (err: any) {
        console.error('Error fetching users:', err.message);
    } finally {
        loading.value = false;
    }
  };

  // 2. Adjust Balance (Updated with Category)
  // 2. Adjust Balance (Fixed TypeScript Error)
  const adjustBalance = async (userId: string, amount: number, note: string, category: 'ADJUSTMENT' | 'WITHDRAWAL') => {
      if (!userId || amount === 0) return;
      isSubmitting.value = true;
      try {
          // --- 🔥 DETERMINE TARGET MERCHANT ID ---
          let targetMerchantId = auth.merchantId;

          // If we are Super Admin (no merchantId), find the user's active wallet
          if (!targetMerchantId) {
              const { data: userWallets } = await supabase
                  .from('merchant_wallets')
                  .select('merchant_id')
                  .eq('user_id', userId)
                  .order('total_earnings', { ascending: false }) 
                  .limit(1);
              
              // ✅ TS FIX: Use optional chaining (?.) to safely access the first item
              if (userWallets && userWallets.length > 0) {
                  targetMerchantId = userWallets[0]?.merchant_id; 
              } else {
                  // Fallback: Pick the first merchant in DB
                  const { data: fallback } = await supabase.from('merchants').select('id').limit(1).single();
                  targetMerchantId = fallback?.id;
              }
          }

          if (!targetMerchantId) throw new Error("Could not determine which merchant wallet to adjust.");
          
          // --- END FIX ---

          // A. Get current wallet
          const { data: wallet } = await supabase
              .from('merchant_wallets')
              .select('*')
              .eq('user_id', userId)
              .eq('merchant_id', targetMerchantId)
              .maybeSingle();

          // Calculate new balance
          const currentBal = wallet ? Number(wallet.current_balance) : 0;
          const currentEarn = wallet ? Number(wallet.total_earnings) : 0;
          const newBalance = currentBal + amount;

          // B. Update Wallet
          if (wallet) {
              const { error: uError } = await supabase.from('merchant_wallets').update({
                  current_balance: newBalance,
                  total_earnings: amount > 0 ? currentEarn + amount : currentEarn
              }).eq('id', wallet.id);
              if (uError) throw uError;
          } else {
              const { error: iError } = await supabase.from('merchant_wallets').insert({
                  user_id: userId,
                  merchant_id: targetMerchantId,
                  current_balance: newBalance,
                  total_earnings: amount > 0 ? amount : 0
              });
              if (iError) throw iError;
          }

          // C. BRANCHING LOGIC
          if (category === 'WITHDRAWAL') {
              await supabase.from('withdrawals').insert({
                  user_id: userId,
                  merchant_id: targetMerchantId,
                  amount: Math.abs(amount),
                  status: 'EXTERNAL_SYNC'
              });
          }

          // D. Log to Ledger
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

  
  // 3. Import User (Updated to match Login Flow)
  const importUser = async (nickname: string, phone: string) => {
      isSubmitting.value = true;
      try {
          // A. Create/Ensure User Exists in DB locally
          const { data: newUser, error: uError } = await supabase
              .from('users')
              .upsert({ 
                  phone, 
                  nickname, 
                  is_active: true,
              }, { onConflict: 'phone' })
              .select().single();

          if (uError) throw uError;

          // B. Create Empty Wallet (Safety Step)
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

          // C. THE FIX: Replicate "Login Flow" sequence
          
          // 1. Call Onboard API (This is what Login.vue does first via syncUser)
          // This fetches the Name & Vendor ID so the user is no longer "ghosted"
          try {
             await axios.post('/api/onboard', { phone });
          } catch (e) {
             console.warn("Onboard sync warning:", e);
             // We continue even if this warns, because the webhook might fix it
          }

          // 2. Call Webhook (This is what Login.vue does second via runOnboarding)
          // This fetches the heavy history and calculates points
          await axios.post('/api/webhook', { phone });

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