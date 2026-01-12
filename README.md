# ♻️ RVM Merchant Platform

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Vue 3](https://img.shields.io/badge/Vue.js-3.5-4FC08D?style=flat&logo=vue.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=flat&logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=flat&logo=tailwind-css)

A comprehensive web-based management dashboard for **Reverse Vending Machine (RVM)** merchants. This platform enables administrators to monitor machine status, verify recycling submissions, manage user withdrawals, and track environmental impact statistics in real-time.

It integrates seamlessly with the **Smart Waste Sorting System API** (`api.autogcm.com`) to sync live machine data and user recycling records.

---

## 🚀 Key Features

### 📊 **Dashboard & Analytics**
- **Real-time Overview:** Live stats on total points issued, recycled weight, and pending actions.
- **Activity Feeds:** Monitor recent recycling submissions, machine cleaning logs, and withdrawal requests.
- **System Health:** Instant status checks for system connectivity.

### 🤖 **Machine Management**
- **Live Status Monitoring:** View online/offline status, bin fullness levels, and storage weight for all RVM units.
- **Location Tracking:** Map machine locations and zones via GPS coordinates.
- **Maintenance Logs:** Track cleaning and maintenance history.

### ✅ **Submission Verification**
- **Audit Tool:** Review user recycling claims with "Accept", "Correct", or "Reject" workflows.
- **Data Reconciliation:** Compare user-submitted weight vs. machine-reported warehouse weight.
- **Fraud Prevention:** Flag mismatches between theoretical and actual weights.

### 💰 **Financial & User Management**
- **Withdrawal Processing:** Approve or reject point redemption requests.
- **User CRM:** View user profiles, recycling history, and balance adjustments.
- **Merchant Settings:** Configure rates per kg and platform parameters.

---

## 🛠️ Tech Stack

- **Framework:** [Vue 3](https://vuejs.org/) (Script Setup + Composition API)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **State Management:** [Pinia](https://pinia.vuejs.org/)
- **Backend / Auth:** [Supabase](https://supabase.com/)
- **External API:** Axios + Vercel Serverless Functions (Proxy)

---

## ⚙️ Installation & Setup

### Prerequisites
- Node.js (v18+ recommended)
- npm or pnpm

### 1. Clone the Repository
git clone [https://github.com/your-org/rvm-merchant-platform.git](https://github.com/your-org/rvm-merchant-platform.git)
cd rvm-merchant-platform

### 2. Install Dependencies
npm install

### 3. Environment Configuration
Create a .env file in the root directory. You must configure both Supabase (for auth/db) and the RVM Vendor API keys.
```
# ------------------------------
# 1. Supabase Configuration
# ------------------------------
VITE_SUPABASE_URL=[https://your-project.supabase.co](https://your-project.supabase.co)
VITE_SUPABASE_ANON_KEY=your-public-anon-key
# (Optional) Service role for backend scripts
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ------------------------------
# 2. RVM API Configuration (AutoGCM)
# ------------------------------
# Your specific Merchant ID provided by the vendor
VITE_MERCHANT_NO=....
# Your Secret Key for signing API requests
VITE_API_SECRET=your_api_secret_key

# ------------------------------
# 3. Deployment (Vercel)
# ------------------------------
# (Automatically set by Vercel during deployment, needed for local CLI)
VERCEL_OIDC_TOKEN=...
```

### 4. Run Development Server
```
npm run dev
```
---

### 🔌 API Integration
This platform acts as a bridge between the Supabase Database (internal user data) and the RVM Hardware API (external machine data).

External API Details
Host: https://api.autogcm.com

Authentication: MD5 Signature (merchant-no + secret + timestamp)

Proxy: To avoid CORS issues and secure credentials, API calls are routed through /api/proxy (Vercel Serverless Function).

### Key Endpoints Used

| Feature Category | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| **User Management** | `/api/open/v1/user/account/sync` | `POST` | **User Sync:** Syncs user profile and points balance from the machine network. |
| | `/api/open/v1/register` | `POST` | **Register:** Registers a new user in the system. |
| | `/api/open/v1/code/auth` | `GET` | **QR Auth:** Handles QR code authorization/login requests. |
| | `/api/open/v1/code/auth/bindCard` | `GET` | **Bind Card:** Links a physical IC card to a user account via QR code. |
| **Machine Data** | `/api/open/v1/device/position` | `GET` | **Machine Status:** Gets live bin levels, current weight, and operational status for a specific device. |
| | `/api/open/video/v2/nearby` | `GET` | **Map View:** Fetches a list of nearby RVMs based on GPS coordinates (latitude/longitude). |
| | `/api/open/v1/open` | `POST` | **Remote Control:** Remotely opens a specific bin door on a machine. |
| **Recycling Logs** | `/api/open/v1/put` | `GET` | **Activity Logs:** Retrieves a paginated history of user recycling activities and weights. |
| | `/api/open/v1/put/{putId}` | `GET` | **Log Details:** Fetches detailed data for a specific recycling transaction. |
| **Real-time Events** | `/api/open/v1/subscription` | `PUT` | **Set Webhook:** Registers your server URL to receive real-time push notifications (e.g., bin full, new deposit). |
| | `/api/open/v1/subscription` | `GET` | **Check Webhook:** Queries the currently configured notification URL. |

---

### 🚢 Deployment
The project is optimized for deployment on Vercel.

Push your code to GitHub.

Import the project in Vercel.

Add the Environment Variables (from step 3 above) in the Vercel Project Settings.

Deploy! 🚀

---

### 📄 License
This project is proprietary software developed for HMA Digital Systems. Unauthorized copying or distribution is strictly prohibited.
