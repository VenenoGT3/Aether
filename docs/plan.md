# Aether Platform Specification & Architecture Plan

Aether is a premium, Apple-designed influencer marketing platform tailored for microinfluencers and businesses. This document details the visual style guide, technical architecture, folder structure, database schema, and payment flows.

## 1. Visual & Interaction Design Spec

Aether adheres strictly to the **Apple Sequoia and iOS 18 design guidelines**.

### Design Principles:
*   **Whitespace**: Generous layout margins, high content-to-canvas padding (24px+).
*   **Border Radii**: 20-24px rounded corners (`rounded-2xl` and `rounded-3xl` in Tailwind) for primary dashboards and panels.
*   **Glassmorphism**: Backdrop blur filter controls on headers, overlay sheets, and selected dashboard modules (`backdrop-blur-md bg-background/70 border-border/40`).
*   **Typography**: Clean system font stack (San Francisco, Inter, Outfit).
*   **Accent Color**: High contrast premium Apple Blue (`#007AFF` or native OKLCH blue).
*   **Animations**: Custom Framer Motion settings using gentle physics (spring curves) instead of standard linear transitions.

### Accent Palette (OKLCH):
*   **Accent (Apple Blue)**: `oklch(0.56 0.21 254)`
*   **Canvas Light**: `oklch(0.99 0.003 240)`
*   **Canvas Dark**: `oklch(0.12 0.005 240)`
*   **Card Light**: `oklch(1.00 0.000 0.00)`
*   **Card Dark**: `oklch(0.16 0.008 240)`

---

## 2. Technical Stack (2026 Best Practices)

*   **Framework**: Next.js 16.x App Router (React Server Components by default).
*   **Styling**: Tailwind CSS v4 (CSS-first setup).
*   **Components**: shadcn/ui custom variants.
*   **Animations**: Framer Motion 11+.
*   **Database & Auth**: Supabase (PostgreSQL, Realtime subscriptions, Auth, Storage).
*   **Payments**: Stripe Connect (Marketplace payments, escrow, instant payouts).
*   **Analytics**: Recharts (Custom Apple Stocks-inspired line charts).
*   **Validation**: Zod (Full type safety from API payloads to DB queries).

---

## 3. Directory Layout

```
/
├── app/                  # Next.js App Router
│   ├── auth/             # Authentication routes (Supabase SSR)
│   ├── business/         # Business dashboard pages
│   ├── influencer/       # Influencer dashboard pages
│   ├── campaigns/        # Dynamic campaign negotiation details
│   ├── dashboard/        # Dashboard dispatcher
│   ├── globals.css       # Core styling & Tailwind theme variable mapping
│   └── layout.tsx        # Global shell and nav wrapper
├── components/           # Component library
│   ├── ui/               # Headless elements (Button, Dialog, etc.)
│   └── theme-toggle.tsx  # Dynamic 2-State Theme switch
├── lib/                  # Utility libraries
│   ├── supabase/         # SSR Supabase Client/Server wrappers
│   ├── stripe/           # Stripe API utility functions
│   └── utils.ts          # Tailwind ClassMerger
├── types/                # Zod structures and definitions
└── docs/                 # Documentation spec and roadmap
```

---

## 4. Supabase Schema (Postgres)

We utilize PostgreSQL tables mapping relationships between users, campaign orders, payments, and conversations.

### Tables
1.  **profiles**
    *   `id` (uuid, pkey, references auth.users)
    *   `role` (enum: 'business', 'influencer')
    *   `full_name` (text)
    *   `avatar_url` (text)
    *   `created_at` (timestamp)
2.  **campaigns**
    *   `id` (uuid, pkey)
    *   `title` (text)
    *   `description` (text)
    *   `budget` (numeric)
    *   `status` (enum: 'draft', 'open', 'in_progress', 'completed')
    *   `business_id` (uuid, references profiles)
    *   `influencer_id` (uuid, references profiles, nullable)
    *   `created_at` (timestamp)
3.  **payments**
    *   `id` (uuid, pkey)
    *   `campaign_id` (uuid, references campaigns)
    *   `amount` (numeric)
    *   `status` (enum: 'pending', 'escrowed', 'released', 'refunded')
    *   `stripe_transfer_id` (text, nullable)
    *   `created_at` (timestamp)
