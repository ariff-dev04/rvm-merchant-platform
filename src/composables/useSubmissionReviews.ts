import { ref, computed, watch } from 'vue';
import { supabase } from '../services/supabase';
import type { SubmissionReview } from '../types';
import { runHarvester } from '../services/submissionHarvester';
import { useAuthStore } from '../stores/auth';

export function useSubmissionReviews() {
    // --- State ---
    const reviews = ref<SubmissionReview[]>([]);
    const loading = ref(false);
    const isHarvesting = ref(false);
    const isProcessing = ref(false);

    // UI State (Modals)
    const showModal = ref(false);
    const showCleanupModal = ref(false);
    
    // 🔥 NEW: Fast Confirm Modal State
    const showConfirmModal = ref(false);
    const confirmMessage = ref('');
    const reviewToConfirm = ref<SubmissionReview | null>(null);

    const selectedReview = ref<SubmissionReview | null>(null);
    const modalStartInReject = ref(false);

    // Filter State
    const activeStatusTab = ref('PENDING'); 
    const searchFilters = ref({
        search: '',
        wasteType: '',
        startDate: '',
        endDate: ''
    });

    // Pagination State
    const currentPage = ref(1);
    const itemsPerPage = ref(10);

    // --- Computed Logic ---
    const filteredReviews = computed(() => {
        return reviews.value.filter(item => {
            if (item.status !== activeStatusTab.value) return false;
            const q = searchFilters.value.search.toLowerCase();
            if (q) {
                const match = (item.users?.phone || '').includes(q) ||
                    (item.device_no || '').toLowerCase().includes(q) ||
                    (item.vendor_record_id || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            if (searchFilters.value.wasteType && !item.waste_type?.includes(searchFilters.value.wasteType)) return false;
            if (searchFilters.value.startDate || searchFilters.value.endDate) {
                if (!item.submitted_at) return false;
                const itemDate = item.submitted_at.split('T')[0] || '';
                if (searchFilters.value.startDate && itemDate < searchFilters.value.startDate) return false;
                if (searchFilters.value.endDate && itemDate > searchFilters.value.endDate) return false;
            }
            return true;
        });
    });

    const totalPages = computed(() => Math.ceil(filteredReviews.value.length / itemsPerPage.value));
    
    const paginatedReviews = computed(() => {
        const start = (currentPage.value - 1) * itemsPerPage.value;
        const end = start + itemsPerPage.value;
        return filteredReviews.value.slice(start, end);
    });

    watch(filteredReviews, () => { currentPage.value = 1; });

    // --- Actions ---

    const fetchReviews = async () => {
        const auth = useAuthStore();
        loading.value = true;
        try {
            let query = supabase
                .from('submission_reviews')
                .select(`*, users(nickname, avatar_url, phone)`)
                .order('submitted_at', { ascending: false });

            if (auth.merchantId) {
                query = query.eq('merchant_id', auth.merchantId);
            }

            const { data, error } = await query;
            if (error) throw error;
            if (data) reviews.value = data as SubmissionReview[];
        } catch (err) {
            console.error("Fetch Error:", err);
        } finally {
            loading.value = false;
        }
    };

    const harvestNewSubmissions = async () => {
        isHarvesting.value = true;
        try {
            await runHarvester();
            await fetchReviews();
        } catch (err) {
            console.error("Harvest failed:", err);
        } finally {
            isHarvesting.value = false;
        }
    };

    // Open Main Correction Modal
    const openReviewModal = (review: SubmissionReview, startReject: boolean = false) => {
        selectedReview.value = review;
        modalStartInReject.value = startReject;
        showModal.value = true;
    };

    // 🔥 NEW: Trigger Fast Confirm Modal (Replaces window.confirm)
    const triggerFastConfirm = (review: SubmissionReview) => {
        reviewToConfirm.value = review;
        const points = (review.api_weight * review.rate_per_kg).toFixed(2);
        confirmMessage.value = `Approve Submission #${review.vendor_record_id.slice(-6)}?\nWeight: ${review.api_weight}kg\nPoints: ${points}`;
        showConfirmModal.value = true;
    };

    // 🔥 NEW: Actual Execution of Fast Confirm
    const executeFastConfirm = async () => {
        if (!reviewToConfirm.value) return;
        isProcessing.value = true;
        await verifySubmission(reviewToConfirm.value.id, reviewToConfirm.value.api_weight, reviewToConfirm.value.rate_per_kg);
        isProcessing.value = false;
        showConfirmModal.value = false;
        reviewToConfirm.value = null;
    };

    const handleCorrectionSubmit = async (finalWeight: number) => {
        if (!selectedReview.value) return;
        isProcessing.value = true;
        const success = await verifySubmission(selectedReview.value.id, finalWeight, selectedReview.value.rate_per_kg);
        if (success) showModal.value = false;
        isProcessing.value = false;
    };

    const handleRejectSubmit = async (reason: string) => {
        if (!selectedReview.value) return;
        isProcessing.value = true;
        await rejectSubmission(selectedReview.value.id, reason);
        isProcessing.value = false;
        showModal.value = false;
    };

    const handleCleanupSubmit = async (months: number) => {
        isProcessing.value = true;
        const count = await cleanupOldData(months);
        isProcessing.value = false;
        showCleanupModal.value = false;
        if (count >= 0) {
            alert(`Cleanup Complete. Deleted ${count} old records.`);
            fetchReviews();
        } else {
            alert("Error cleaning up data.");
        }
    };

    // --- Private/Internal Actions (FIXED COLUMN NAMES HERE) ---

    const verifySubmission = async (reviewId: string, finalWeight: number, currentRate: number) => {
        try {
            const finalPoints = parseFloat((finalWeight * currentRate).toFixed(2));

            // 1. Get Review Details (We need user_id and merchant_id)
            const { data: reviewData, error: fetchError } = await supabase
                .from('submission_reviews')
                .select('user_id, merchant_id')
                .eq('id', reviewId)
                .single();
            
            if (fetchError || !reviewData) throw new Error("Review not found");

            // 2. Update Review Status
            const { error: updateError } = await supabase
                .from('submission_reviews')
                .update({
                    status: 'VERIFIED',
                    confirmed_weight: finalWeight,
                    calculated_value: finalPoints, 
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', reviewId);

            if (updateError) throw updateError;

            // 3. CREDIT WALLET (This updates the User List Balance)
            const { data: wallet } = await supabase
                .from('merchant_wallets')
                .select('id, current_balance, total_earnings')
                .eq('user_id', reviewData.user_id)
                .eq('merchant_id', reviewData.merchant_id)
                .maybeSingle();

            let newBalance = finalPoints;

            if (wallet) {
                newBalance = Number(wallet.current_balance) + finalPoints;
                // Update existing wallet
                await supabase.from('merchant_wallets').update({
                    current_balance: newBalance,
                    total_earnings: Number(wallet.total_earnings) + finalPoints
                }).eq('id', wallet.id);
            } else {
                // Create new wallet if first time
                await supabase.from('merchant_wallets').insert({
                    user_id: reviewData.user_id,
                    merchant_id: reviewData.merchant_id,
                    current_balance: finalPoints,
                    total_earnings: finalPoints
                });
            }

            // 4. LOG TRANSACTION (Audit Trail)
            await supabase.from('wallet_transactions').insert({
                user_id: reviewData.user_id,
                merchant_id: reviewData.merchant_id,
                amount: finalPoints,
                balance_after: newBalance,
                transaction_type: 'RECYCLE_EARNING',
                description: `Recycled ${finalWeight}kg`
            });

            // 5. UPDATE TOTAL WEIGHT (This updates the User List Recycled Kg)
            const { data: userData } = await supabase
                .from('users')
                .select('total_weight, lifetime_integral')
                .eq('id', reviewData.user_id)
                .single();
            
            const currentWeight = Number(userData?.total_weight || 0);
            const currentIntegral = Number(userData?.lifetime_integral || 0);
            
            await supabase.from('users').update({
                total_weight: currentWeight + finalWeight,
                lifetime_integral: currentIntegral + finalPoints
            }).eq('id', reviewData.user_id);

            await fetchReviews();
            return true;
        } catch (err) {
            console.error("Verification failed:", err);
            return false;
        }
    };

    const rejectSubmission = async (reviewId: string, reason: string) => {
        try {
            const { error } = await supabase
                .from('submission_reviews')
                .update({
                    status: 'REJECTED',
                    confirmed_weight: 0,
                    calculated_value: 0, // ✅ FIXED: Was calculated_points
                    reviewer_note: reason,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', reviewId);

            if (error) throw error;
            await fetchReviews();
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    };

    const cleanupOldData = async (months: number) => {
        try {
            const { data, error } = await supabase.rpc('delete_old_submissions', { months_to_keep: months });
            if (error) throw error;
            return data;
        } catch (err) {
            console.error(err);
            return -1;
        }
    }

    return {
        reviews, loading, isHarvesting, isProcessing,
        showModal, showCleanupModal, selectedReview, modalStartInReject,
        
        // Confirm Modal Exports
        showConfirmModal, confirmMessage, triggerFastConfirm, executeFastConfirm,

        activeStatusTab, searchFilters, currentPage, itemsPerPage,
        paginatedReviews, totalPages, filteredReviews,
        
        fetchReviews, harvestNewSubmissions, openReviewModal,
        handleCorrectionSubmit, handleRejectSubmit, handleCleanupSubmit
    };
}