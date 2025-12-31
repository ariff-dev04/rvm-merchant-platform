import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores/auth';

export function useMerchantSettings() {
    const auth = useAuthStore();
    const loading = ref(false);
    const saving = ref(false);
    const message = ref('');

    const merchant = ref<any>({});
    const machines = ref<any[]>([]);

    const fetchData = async () => {
        if (!auth.merchantId) return;
        loading.value = true;
        try {
            // 1. Get Merchant (For Currency Symbol & Profile)
            const { data: merchantData, error: mError } = await supabase
                .from('merchants')
                .select('*')
                .eq('id', auth.merchantId)
                .single();
            if (mError) throw mError;
            merchant.value = merchantData;

            // 2. Get Machines (Now includes Rates)
            const { data: machineData, error: macError } = await supabase
                .from('machines')
                .select('*')
                .eq('merchant_id', auth.merchantId)
                .order('device_no');
            if (macError) throw macError;
            
            // 3. Initialize Helper for Combo Rates (Plastic/Can syncing)
            machines.value = machineData.map((m: any) => ({
                ...m,
                // Create a temporary local variable for the UI input
                _comboRate: m.rate_plastic || 0
            }));

        } catch (err: any) {
            console.error("Error loading settings:", err.message);
        } finally {
            loading.value = false;
        }
    };

    const saveSettings = async () => {
        saving.value = true;
        message.value = '';
        try {
            // 1. Save Merchant Profile (Name, Email, Currency)
            const { error: mError } = await supabase
                .from('merchants')
                .update({
                    name: merchant.value.name,
                    currency_symbol: merchant.value.currency_symbol,
                    contact_email: merchant.value.contact_email,
                })
                .eq('id', auth.merchantId);

            if (mError) throw mError;

            // 2. Save Each Machine (Rates + Location)
            for (const m of machines.value) {
                
                // Sync Combo Rate logic (If user sets 0.20, it applies to Plastic & Can)
                const plasticRate = m._comboRate; 
                const canRate = m._comboRate; 

                await supabase
                    .from('machines')
                    .update({ 
                        name: m.name, 
                        location_name: m.location_name,
                        address: m.address, 
                        maintenance_contact: m.maintenance_contact,
                        latitude: m.latitude,
                        longitude: m.longitude,
                        // 🔥 Saving Rates Per Machine
                        rate_plastic: plasticRate,
                        rate_can: canRate,
                        rate_paper: m.rate_paper,
                        rate_uco: m.rate_uco,
                        config_bin_1: m.config_bin_1,
                        config_bin_2: m.config_bin_2
                    })
                    .eq('id', m.id);
            }

            message.value = "All fleet settings saved successfully!";
            setTimeout(() => message.value = '', 3000);

        } catch (err: any) {
            alert("Failed to save: " + err.message);
        } finally {
            saving.value = false;
        }
    };

    const fetchAddress = async (m: any) => {
        if (!m.latitude || !m.longitude) {
            alert("Please enter Latitude and Longitude first.");
            return;
        }
        const originalText = m.address;
        m.address = "Fetching address...";
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${m.latitude}&lon=${m.longitude}`);
            const data = await res.json();
            if (data && data.display_name) m.address = data.display_name;
            else {
                m.address = originalText;
                alert("Address not found.");
            }
        } catch (err) {
            m.address = originalText;
            alert("Map service unavailable.");
        }
    };

    return {
        loading, saving, message, merchant, machines, 
        fetchData, saveSettings, fetchAddress
    };
}