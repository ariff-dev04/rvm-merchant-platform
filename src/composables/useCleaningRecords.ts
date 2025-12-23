import { ref } from 'vue';
import { supabase } from '../services/supabase';

export interface CleaningRecord {
    id: string;
    device_no: string;
    waste_type: string;
    bag_weight_collected: number;
    bag_no?: string;
    cleaned_at: string;
    cleaner_name: string;
    photo_url?: string; // ✅ New
    status: 'PENDING' | 'VERIFIED' | 'REJECTED';
    admin_note?: string; // ✅ New
    verified_at?: string;
}

export function useCleaningRecords() {
    const records = ref<CleaningRecord[]>([]);
    const loading = ref(false);

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
            console.error("Error fetching cleaning logs:", err);
        } finally {
            loading.value = false;
        }
    };

    // ✅ Approve Logic
    const approveCleaning = async (id: string) => {
        try {
            const { error } = await supabase
                .from('cleaning_records')
                .update({ 
                    status: 'VERIFIED',
                    verified_at: new Date().toISOString()
                })
                .eq('id', id);
            
            if (error) throw error;
            await fetchCleaningLogs(); 
            return true;
        } catch (err) {
            console.error("Verification failed:", err);
            return false;
        }
    };

    // ✅ Reject Logic
    const rejectCleaning = async (id: string, reason: string) => {
        try {
            const { error } = await supabase
                .from('cleaning_records')
                .update({ 
                    status: 'REJECTED',
                    admin_note: reason,
                    verified_at: new Date().toISOString()
                })
                .eq('id', id);
            
            if (error) throw error;
            await fetchCleaningLogs();
            return true;
        } catch (err) {
            console.error("Rejection failed:", err);
            return false;
        }
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('en-MY', {
            timeZone: 'UTC', 
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
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

export const processPotentialCleaning = async (apiRecord: any) => {
    try {
        // 1. Fetch the last known state of this machine from DB
        const { data: lastRecord } = await supabase
            .from('submission_reviews')
            .select('bin_weight_snapshot, waste_type, submitted_at, photo_url')
            .eq('device_no', apiRecord.deviceNo)
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!lastRecord) return;

        // 2. Compare Weights
        const previousWeight = Number(lastRecord.bin_weight_snapshot || 0);
        const currentBinWeight = Number(apiRecord.positionWeight || 0);

        // LOGIC: High weight -> Low weight transition
        if (previousWeight > 5.0 && currentBinWeight < 2.0 && previousWeight > currentBinWeight) {
            
            console.log(`🧹 CLEANING DETECTED on ${apiRecord.deviceNo}! Bag: ${previousWeight}kg`);

            // 3. Deduplication Check
            const { data: existingClean } = await supabase
                .from('cleaning_records')
                .select('id')
                .eq('device_no', apiRecord.deviceNo)
                // Ensure we don't record the same bag twice
                .eq('bag_weight_collected', previousWeight) 
                .gt('cleaned_at', lastRecord.submitted_at) 
                .maybeSingle();

            if (!existingClean) {
                // 4. Insert Record
                await supabase.from('cleaning_records').insert({
                    device_no: apiRecord.deviceNo,
                    cleaned_at: apiRecord.createTime, 
                    waste_type: lastRecord.waste_type || 'Unknown',
                    bag_weight_collected: previousWeight, 
                    previous_clean_time: lastRecord.submitted_at,
                    photo_url: lastRecord.photo_url // Save photo evidence
                });
            }
        }
    } catch (err) {
        console.error("Error processing cleaning event:", err);
    }
};