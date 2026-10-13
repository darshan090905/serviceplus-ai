# ServicePlus AI (ServicePulse)

> **Track. Analyze. Retain.**  
> An intelligent B2B SaaS platform for field service companies and AMC (Annual Maintenance Contract) operations, powered by AI-driven customer health scoring and retention intelligence.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-serviceplus--ai.slicearrow.com-0284c7?style=for-the-badge&logo=vercel)](https://serviceplus-ai.slicearrow.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)

---

## 🌐 Live Application

- **Production URL:** [https://serviceplus-ai.slicearrow.com/](https://serviceplus-ai.slicearrow.com/)
- **Repository:** [https://github.com/darshan090905/serviceplus-ai](https://github.com/darshan090905/serviceplus-ai)

---

## 🚀 Overview

**ServicePlus AI** streamlines the end-to-end lifecycle of contract-based maintenance, preventive servicing, breakdown resolution, and customer retention. It replaces scattered spreadsheets and manual follow-ups with real-time operational workflows and predictive churn indicators.

```text
Customer & Asset Data
        ↓
Health Scoring Engine (0-100)
        ↓
Renewal & Churn Risk Detection
        ↓
AI-Powered Retention Recommendations
        ↓
Service Operations & Field Dispatch
        ↓
Automated Follow-ups, GST Invoicing & Payments
```

---

## 👥 Multi-Persona Portals & Role-Based Access

The platform provides dedicated, role-scoped experiences:

### 1. Operations & Admin Console (`/dashboard`)
* **Executive Dashboard:** Live metrics, expiring AMC pipelines, SLA alerts, and retention priorities.
* **Customer & Asset Management:** Customer profiles, asset lifecycles, and machine histories.
* **AMC Contracts:** Contract terms, preventive visit schedules, renewal status, and auto-reminders.
* **Smart Dispatch & Tracking:** Interactive field technician maps (Leaflet), SLA timers, and automated assignment.
* **Complaints & SLA Workflows:** AI ticket triage, timeline audit trails, and root-cause classification.
* **Billing & Invoices:** GST-compliant invoicing, instant UPI/QR payment links (`/pay/:refId`).
* **Retention Hub:** AI draft renewal emails, approval workflows, and churn mitigation strategies.

### 2. Technician Mobile Field Portal (`/tech`)
* **Mobile-Optimized Job Feed:** View today's assigned preventive visits and breakdown calls.
* **Proof of Work & Evidence:** Capture service notes, upload job proof images, and collect customer signatures.
* **Real-time Status Updates:** Transition tickets seamlessly from En Route to In Progress and Completed.

### 3. Customer Self-Service Portal (`/portal`)
* **Contract Overview:** View active AMC contracts, remaining visits, and coverage periods.
* **Service History & Invoices:** Access and download GST invoices, receipts, and past service logs.
* **One-Click Requests:** Lodge complaints, book scheduled visits, and settle dues online.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| **Build Tooling** | [Vite 6](https://vitejs.dev/) |
| **Styling & UI** | [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), `@fontsource-variable/inter` |
| **Charts & Visualizations** | [Recharts](https://recharts.org/) |
| **Maps & Geo** | [Leaflet](https://leafletjs.com/) |
| **Backend & Storage** | [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Storage Buckets, Auth) |
| **Testing & Verification** | [Playwright](https://playwright.dev/) end-to-end test harnesses |

---

## 📁 Project Structure

```text
├── public/                 # Static assets and redirects
├── scripts/                # Verification harnesses and seed utilities
│   ├── seed/               # Demo data seeding
│   └── verify/             # Automated test & verification scripts
├── src/
│   ├── components/         # Modular UI & feature components
│   │   ├── amc/            # AMC contract management modals & pickers
│   │   ├── assets/         # Asset tracking components
│   │   ├── complaints/     # AI analysis, chat, and SLA badge components
│   │   ├── dashboard/      # Pipeline and KPI visualizations
│   │   ├── jobs/           # Proof of work and signature capture
│   │   ├── layout/         # Admin, Tech, and Customer layouts
│   │   └── ui/             # Reusable design system primitives
│   ├── pages/              # Route pages (Admin, Portal, Tech, Auth)
│   ├── services/           # Supabase client, AI services, and API layers
│   ├── store/              # Centralized application store & state
│   ├── utils/              # Calculation helpers (GST, SLA, Health, Geo)
│   └── types/              # TypeScript interfaces and schema types
├── supabase/
│   ├── migrations/         # Database migrations (RLS, schema, buckets)
│   └── schema.sql          # Core PostgreSQL database schema
├── .env.example            # Environment configuration template
└── package.json
```

---

## ⚙️ Getting Started

### Prerequisites
- Node.js (v18 or newer recommended)
- npm or pnpm

### 1. Clone the Repository
```bash
git clone https://github.com/darshan090905/serviceplus-ai.git
cd serviceplus-ai
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env.local` and configure your Supabase credentials:

```bash
cp .env.example .env.local
```

Fill in your variables:
```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Optional (for custom URLs or tunneling)
VITE_APP_URL=https://serviceplus-ai.slicearrow.com
VITE_API_BASE_URL=
```

### 4. Run the Development Server
```bash
npm run dev:standalone
```

The app will be available locally at `http://localhost:5173`.

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm run dev:standalone` | Starts Vite local dev server |
| `npm run build` | Runs TypeScript type checking and produces production build |
| `npm run typecheck` | Typechecks the project without emitting output |
| `npm run preview` | Previews the production build locally |
| `npm run test` | Runs the test verification harness |
| `npm run test:live` | Runs verification scripts against live Supabase connection |
| `npm run test:e2e` | Runs Playwright browser tests |
| `npm run db:seed` | Seeds database with initial demo structure |

---

## 🔒 Security & Privacy

- **Protected Secrets:** Environment variables and API keys are strictly excluded via `.gitignore`.
- **Row-Level Security (RLS):** Supabase database tables enforce role-scoped RLS policies for admins, technicians, and customers.
- **Private Evidence Storage:** Photos, signatures, and attachments reside in protected Supabase storage buckets with restricted access.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) (or proprietary to the project maintainers).
