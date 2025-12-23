import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import crypto from 'crypto'; // Native Node.js library

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Force CORS Headers (The "Nuclear Option")
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 2. Handle Options (Preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 3. Get Secrets
  // Note: We use the names from your .env file here
  const SECRET = process.env.VITE_API_SECRET; 
  const MERCHANT_NO = process.env.VITE_MERCHANT_NO;
  const API_BASE = "https://api.autogcm.com"; // Global Server

  // 4. Debugging: Check if secrets exist
  if (!SECRET || !MERCHANT_NO) {
    console.error("❌ CRITICAL ERROR: Secrets are missing!");
    return res.status(500).json({ error: "Server Secret Missing" });
  }

  // 5. Logic
  const { endpoint, method = 'GET', params = {}, body = {} } = req.body || req.query;
  
  // 🔥 CRITICAL FIX: Use Milliseconds (Date.now()) not Seconds
  const timestamp = Date.now().toString();

  // 6. MD5 Generation
  // Sign = MD5(MERCHANT_NO + SECRET + timestamp)
  const sign = crypto
    .createHash('md5')
    .update(MERCHANT_NO + SECRET + timestamp)
    .digest('hex');

  const headers = {
    "merchant-no": MERCHANT_NO,
    "timestamp": timestamp,
    "sign": sign,
    "Content-Type": "application/json"
  };

  try {
    console.log(`🚀 Proxying ${method} to: ${API_BASE}${endpoint}`); 
    
    const response = await axios({
      url: `${API_BASE}${endpoint}`,
      method: method,
      headers: headers,
      params: params,
      data: body,
      timeout: 8000
    });

    res.status(200).json(response.data);
  } catch (error: any) {
    console.error("❌ Upstream API Error:", error.message);
    // Return the specific error from AutoGCM if available
    res.status(500).json({ 
      error: error.message, 
      details: error.response?.data || "No external response" 
    });
  }
}