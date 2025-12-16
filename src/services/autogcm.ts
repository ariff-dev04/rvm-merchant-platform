import axios from "axios";
import type { Machine, ApiUserSyncResponse } from "../types";

// 1. Define Proxy URL
// If Localhost: Use Live Vercel Backend
// If Production: Use relative path
const LIVE_BACKEND = 'https://rvm-admin-xi.vercel.app'; 
const PROXY_URL = import.meta.env.DEV ? `${LIVE_BACKEND}/api/proxy` : '/api/proxy';

// 2. Generic Wrapper
async function callApi(endpoint: string, method: 'GET' | 'POST' = 'GET', data: any = {}) {
  try {
    const payload = {
      endpoint,
      method,
      [method === 'GET' ? 'params' : 'body']: data
    };
    
    const res = await axios.post(PROXY_URL, payload);
    return res.data; 
  } catch (error: any) {
    console.error(`❌ API Error [${endpoint}]:`, error.message);
    throw error;
  }
}

// ✅ 3. Get Nearby RVMs
export async function getNearbyRVMs(latitude: number = 3.14, longitude: number = 101.68): Promise<Machine[]> {
  try {
    // Note: The API path must match exactly what the vendor expects
    const res = await callApi('/api/open/video/v2/nearby', 'GET', { latitude, longitude });
    
    // Check for success code 200
    if (res && res.code === 200 && Array.isArray(res.data)) {
      return res.data;
    }
    
    console.warn("⚠️ Vendor returned code:", res?.code, res?.msg);
    console.warn("Using fallback data for display.");
    
    return [
      { id: 'm1', deviceNo: '040201000001', deviceName: 'KLCC Mall Unit', address: 'Suria KLCC, Kuala Lumpur', isOnline: 1, status: 1 },
      { id: 'm2', deviceNo: '040201000002', deviceName: 'Pavilion Entrance', address: 'Pavilion, Bukit Bintang', isOnline: 1, status: 0 },
    ];
  } catch (error) {
    console.error("Failed to fetch machine list", error);
    return [];
  }
}

// ✅ 4. Sync User / Get User Info
export async function syncUserAccount(phone: string): Promise<ApiUserSyncResponse> {
  try {
    const res = await callApi('/api/open/v1/user/account/sync', 'POST', { 
        phone,
        nikeName: "", // API requires this typo 'nikeName'
        avatarUrl: ""
    });
    
    if (res && res.code === 200 && res.data) {
      return res as unknown as ApiUserSyncResponse;
    }
    
    throw new Error(res.msg || "Invalid response from API");
  } catch (error) {
    console.error("Failed to sync user account", error);
    throw error;
  }
}