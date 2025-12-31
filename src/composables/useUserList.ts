import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';

export function useUserList() {
  const auth = useAuthStore();
  const users = ref<any[]>([]);
  const loading = ref(true);
  const isSubmitting = ref(false);

  // 1. Fetch Users + Wallet for Current Merchant
  const fetchUsers = async () => {
    if (!auth.merchantId) return;
    loading.value = true;
    try {
        const { data, error } = await supabase
            .from('users')
            .select(`
                *,
                merchant_wallets!inner (
                    current_balance,
                    total_earnings,
                    merchant_id
                )
            `)
            .eq('merchant_wallets.merchant_id', auth.merchantId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Map data to flatten the wallet structure
        users.value = data.map(u => {
            // Find the wallet belonging to THIS merchant
            const wallet = u.merchant_wallets?.find((w: any) => w.merchant_id === auth.merchantId);
            return {
                ...u,
                balance: wallet ? Number(wallet.current_balance) : 0,
                earnings: wallet ? Number(wallet.total_earnings) : 0
            };
        });

    } catch (err: any) {
        console.error('Error fetching users:', err.message);
    } finally {
        loading.value = false;
    }
  };

  // 2. Adjust Balance
  // 2. Adjust Balance (Updated with Category)
  const adjustBalance = async (userId: string, amount: number, note: string, category: 'ADJUSTMENT' | 'WITHDRAWAL') => {
      if (!userId || amount === 0) return;
      isSubmitting.value = true;
      try {
          // A. Get current wallet
          const { data: wallet } = await supabase
              .from('merchant_wallets')
              .select('*')
              .eq('user_id', userId)
              .eq('merchant_id', auth.merchantId)
              .maybeSingle();

          // Calculate new balance
          // Note: 'amount' comes in as +10 or -10 directly from the input
          const currentBal = wallet ? Number(wallet.current_balance) : 0;
          const currentEarn = wallet ? Number(wallet.total_earnings) : 0;
          const newBalance = currentBal + amount;

          // B. Update Wallet
          if (wallet) {
              const { error: uError } = await supabase.from('merchant_wallets').update({
                  current_balance: newBalance,
                  // If adding money, increase total earnings. If deducting, leave earnings alone.
                  total_earnings: amount > 0 ? currentEarn + amount : currentEarn
              }).eq('id', wallet.id);
              if (uError) throw uError;
          } else {
              const { error: iError } = await supabase.from('merchant_wallets').insert({
                  user_id: userId,
                  merchant_id: auth.merchantId,
                  current_balance: newBalance,
                  total_earnings: amount > 0 ? amount : 0
              });
              if (iError) throw iError;
          }

          // C. 🔥 BRANCHING LOGIC
          if (category === 'WITHDRAWAL') {
              // User is deducting money (-10) to represent a past withdrawal
              // We store positive value "10" in withdrawals table
              await supabase.from('withdrawals').insert({
                  user_id: userId,
                  merchant_id: auth.merchantId,
                  amount: Math.abs(amount), // Store as positive "10.00"
                  status: 'EXTERNAL_SYNC'   // Special flag for migration/manual
              });
          }

          // D. Always Log to Ledger
          await supabase.from('wallet_transactions').insert({
              merchant_id: auth.merchantId,
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

  // 3. Create Test User
  // 3. Create Test User (Updated)
  const createTestUser = async (nickname: string, phone: string) => {
      isSubmitting.value = true;
      try {
          // A. Create User (or ignore if phone exists)
          const { data: newUser, error: uError } = await supabase
              .from('users')
              .upsert({ 
                  phone, 
                  nickname, 
                  is_active: true,
                  vendor_user_no: 'TEST-' + Math.floor(Math.random() * 100000)
              }, { onConflict: 'phone' })
              .select()
              .single();

          if (uError) throw uError;

          // B. Create Wallet for THIS Merchant (So they appear in the list)
          const { error: wError } = await supabase
              .from('merchant_wallets')
              .insert({
                  user_id: newUser.id,
                  merchant_id: auth.merchantId,
                  current_balance: 0,
                  total_earnings: 0
              });

          // Ignore wallet error if it already exists (e.g. 23505 duplicate key)
          if (wError && wError.code !== '23505') throw wError;

          await fetchUsers();
          return { success: true };

      } catch (err: any) {
          return { success: false, error: err.message };
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
      createTestUser 
  };
}