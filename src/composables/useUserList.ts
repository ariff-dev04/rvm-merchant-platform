import { ref, onMounted } from 'vue';
import { supabase } from '../services/supabase';
import type { User } from '../types';

export function useUserList() {
  const users = ref<User[]>([]);
  const loading = ref(true);

  const fetchUsers = async () => {
    loading.value = true;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      users.value = data as User[];
    }
    loading.value = false;
  };

  onMounted(() => {
    fetchUsers();
  });

  return { users, loading, fetchUsers };
}