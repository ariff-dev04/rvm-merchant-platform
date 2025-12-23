import axios from "axios";
import type { Machine } from "../types";

// 1. Define Proxy URL
// If Localhost: Use Live Vercel Backend to avoid CORS issues
// If Production: Use relative path '/api/proxy'
const LIVE_BACKEND = 'https://rvm-admin-xi.vercel.app'; 
const PROXY_URL = import.meta.env.DEV ? `${LIVE_BACKEND}/api/proxy` : '/api/proxy';

// ✅ FIXED: Changed return type from Promise<any> to Promise<T>
async function callApi<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', data: any = {}): Promise<T> {
  try {
    const payload = {
      endpoint,
      method,
      [method === 'GET' ? 'params' : 'body']: data
    };
    
    const res = await axios.post(PROXY_URL, payload);
    return res.data as T; // Explicitly cast the result to T
  } catch (error: any) {
    console.error(`❌ API Error [${endpoint}]:`, error.message);
    throw error;
  }
}

// ✅ 3. Get Nearby RVMs
// Used to find machines near a coordinate (GPS-based)
export async function getNearbyRVMs(latitude: number = 3.14, longitude: number = 101.68): Promise<Machine[]> {
  try {
    const res = await callApi<any>('/api/open/video/v2/nearby', 'GET', { latitude, longitude });
    
    if (res && res.code === 200 && Array.isArray(res.data)) {
      return res.data;
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch machine list", error);
    return [];
  }
}

// ✅ 4. Sync User / Get User Info
// Used to get the user's "Lifetime Points" (integral) directly from the machine network
export async function syncUserAccount(phone: string): Promise<any> {
  try {
    const res = await callApi<any>('/api/open/v1/user/account/sync', 'POST', { 
        phone,
        nikeName: "", // The API actually requires this typo 'nikeName'
        avatarUrl: ""
    });
    
    // We return res.data directly so components can access .integral immediately
    if (res && res.code === 200 && res.data) {
      return res.data; 
    }
    
    throw new Error(res.msg || "Invalid response from API");
  } catch (error) {
    console.error("Failed to sync user account", error);
    throw error;
  }
}

// ✅ 5. Get Individual Machine Status
// Used by the Store to check status one-by-one (Sequential Fetch)
export async function getMachineConfig(deviceNo: string): Promise<any> {
  try {
    const res = await callApi<any>('/api/open/v1/device/position', 'GET', { deviceNo });
    return res;
  } catch (error) {
    console.error(`Failed to fetch config for ${deviceNo}`, error);
    return null;
  }
}

// ✅ 6. Get User Disposal Records
// Used in User Details to show Recycling History
export async function getUserRecords(phone: string, pageNum = 1, pageSize = 20): Promise<any[]> {
  try {
    const res = await callApi<any>('/api/open/v1/put', 'GET', { 
        phone, 
        pageNum, 
        pageSize 
    });
    
    // The API wraps the list inside data.list
    if (res && res.code === 200 && res.data && Array.isArray(res.data.list)) {
      return res.data.list;
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch user recycling records", error);
    return [];
  }
}