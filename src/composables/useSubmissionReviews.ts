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
    const isProcessing = ref(false); // Shared processing state for actions

    // UI State (Modals & Selection)
    const showModal = ref(false);
    const showCleanupModal = ref(false);
    const selectedReview = ref<SubmissionReview | null>(null);
    const modalStartInReject = ref(false);

    // Filter State
    const activeStatusTab = ref('PENDING'); // Renamed from 'filter' for clarity
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

    // 1. Filtered List
    const filteredReviews = computed(() => {
        return reviews.value.filter(item => {
            // A. Status Check
            if (item.status !== activeStatusTab.value) return false;

            // B. Text Search
            const q = searchFilters.value.search.toLowerCase();
            if (q) {
                const match = (item.users?.phone || '').includes(q) ||
                    (item.device_no || '').toLowerCase().includes(q) ||
                    (item.vendor_record_id || '').toLowerCase().includes(q);
                if (!match) return false;
            }

            // C. Waste Type
            if (searchFilters.value.wasteType && !item.waste_type?.includes(searchFilters.value.wasteType)) return false;

            // D. Date Range
            if (searchFilters.value.startDate || searchFilters.value.endDate) {
                if (!item.submitted_at) return false;
                const itemDate = item.submitted_at.split('T')[0] || '';
                if (searchFilters.value.startDate && itemDate < searchFilters.value.startDate) return false;
                if (searchFilters.value.endDate && itemDate > searchFilters.value.endDate) return false;
            }

            return true;
        });
    });

    // 2. Pagination Logic
    const totalPages = computed(() => Math.ceil(filteredReviews.value.length / itemsPerPage.value));
    
    const paginatedReviews = computed(() => {
        const start = (currentPage.value - 1) * itemsPerPage.value;
        const end = start + itemsPerPage.value;
        return filteredReviews.value.slice(start, end);
    });

    // Watcher: Reset page on filter change
    watch(filteredReviews, () => {
        currentPage.value = 1;
    });


    // --- Actions (Data Fetching) ---

    const fetchReviews = async () => {
        const auth = useAuthStore(); // Get the current user context
        loading.value = true;
        
        try {
            // Start the query
            let query = supabase
                .from('submission_reviews')
                .select(`*, users(nickname, avatar_url, phone)`)
                .order('submitted_at', { ascending: false });

            // 🔥 SaaS Filter: If Merchant, only show their reviews
            if (auth.merchantId) {
                query = query.eq('merchant_id', auth.merchantId);
            }

            const { data, error } = await query;

            if (error) throw error;
            if (data) {
                reviews.value = data as SubmissionReview[];
            }
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

    // --- Actions (Business Logic) ---

    // Open Modal Helper
    const openReviewModal = (review: SubmissionReview, startReject: boolean = false) => {
        selectedReview.value = review;
        modalStartInReject.value = startReject;
        showModal.value = true;
    };

    // Fast Confirm
    const handleFastConfirm = async (review: SubmissionReview) => {
        const points = (review.api_weight * review.rate_per_kg).toFixed(2);
        if (!confirm(`Approve Submission #${review.vendor_record_id.slice(-6)}?\n\nWeight: ${review.api_weight}kg\nPoints: ${points}`)) return;
        
        isProcessing.value = true;
        await verifySubmission(review.id, review.api_weight, review.rate_per_kg);
        isProcessing.value = false;
    };

    // Modal Submit (Correction)
    const handleCorrectionSubmit = async (finalWeight: number) => {
        if (!selectedReview.value) return;
        isProcessing.value = true;
        const success = await verifySubmission(selectedReview.value.id, finalWeight, selectedReview.value.rate_per_kg);
        if (success) showModal.value = false;
        isProcessing.value = false;
    };

    // Modal Reject
    const handleRejectSubmit = async (reason: string) => {
        if (!selectedReview.value) return;
        isProcessing.value = true;
        await rejectSubmission(selectedReview.value.id, reason);
        isProcessing.value = false;
        showModal.value = false;
    };

    // Cleanup
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

    // --- Private/Internal Actions ---

    const verifySubmission = async (reviewId: string, finalWeight: number, currentRate: number) => {
        try {
            const finalPoints = finalWeight * currentRate;
            const { error } = await supabase
                .from('submission_reviews')
                .update({
                    status: 'VERIFIED',
                    confirmed_weight: finalWeight,
                    calculated_points: finalPoints,
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

    const rejectSubmission = async (reviewId: string, reason: string) => {
        try {
            const { error } = await supabase
                .from('submission_reviews')
                .update({
                    status: 'REJECTED',
                    confirmed_weight: 0,
                    calculated_points: 0,
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

    // Return EVERYTHING needed by the view
    return {
        // State
        reviews,
        loading,
        isHarvesting,
        isProcessing,
        showModal,
        showCleanupModal,
        selectedReview,
        modalStartInReject,
        activeStatusTab,
        searchFilters,
        currentPage,
        itemsPerPage,
        
        // Computed
        paginatedReviews,
        totalPages,
        filteredReviews,

        // Actions
        fetchReviews,
        harvestNewSubmissions,
        openReviewModal,
        handleFastConfirm,
        handleCorrectionSubmit,
        handleRejectSubmit,
        handleCleanupSubmit
    };
}