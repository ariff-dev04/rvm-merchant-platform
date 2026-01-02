// src/composables/useCleaningRecords.ts
import { ref } from 'vue';
import { supabase } from '../services/supabase';

export interface CleaningRecord {
    id: string;
    device_no: string;
    waste_type: string;
    bag_weight_collected: number;
    cleaned_at: string;
    cleaner_name: string;
    status: 'PENDING' | 'VERIFIED' | 'REJECTED';
    photo_url?: string;
    admin_note?: string;
}

export function useCleaningRecords() {
    const records = ref<CleaningRecord[]>([]);
    const loading = ref(false);

    // 1. Fetch Logs
    const fetchCleaningLogs = async () => {
        loading.value = true;
        try {
            const { data, error } = await supabase
                .from('cleaning_records')
                .select('*')
                .order('cleaned_at', { ascending: false });

            if (error) throw error;
            records.value = data as CleaningRecord[];
        } catch (err) {
            console.error("Error fetching logs:", err);
        } finally {
            loading.value = false;
        }
    };

    // 2. Approve
    const approveCleaning = async (id: string) => {
        const { error } = await supabase
            .from('cleaning_records')
            .update({ status: 'VERIFIED' })
            .eq('id', id);
        if (!error) await fetchCleaningLogs();
    };

    // 3. Reject
    const rejectCleaning = async (id: string, reason: string) => {
        const { error } = await supabase
            .from('cleaning_records')
            .update({ status: 'REJECTED', admin_note: reason })
            .eq('id', id);
        if (!error) await fetchCleaningLogs();
    };

    // 4. Helper
    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('en-MY', {
            month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    };

    return {
        records,
        loading,
        fetchCleaningLogs,
        approveCleaning,
        rejectCleaning,
        formatDate
    };
}