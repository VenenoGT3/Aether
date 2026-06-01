# Aether

**Influencer marketing, end to end.** Aether connects businesses with micro-influencers: brands publish campaigns, creators apply and pitch, funds sit in Stripe escrow, and payouts release when deliverables are approved — all in one place.

---

## Contents

- [Quick start](#quick-start)
- [Philosophy & current status](#philosophy--current-status)
- [What is production-ready](#what-is-production-ready)
- [Mock mode](#mock-mode)
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [Stripe setup](#stripe-setup)
- [Development commands](#development-commands)
- [Tech stack](#tech-stack)

---

## Quick start

Get the full UI running in under a minute — no Supabase or Stripe account required.

```bash
git clone https://github.com/VenenoGT3/Aether.git
cd Aether
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With `AETHER_MOCK_MODE=true` in `.env.local` (the default in `.env.example`), the app runs entirely in the browser using mock auth and `localStorage`.

To run tests:

```bash
npm test
```

---

## Philosophy & current status

We are building Aether in layers. The **core campaign lifecycle** comes first — we want it boringly reliable before adding more surface area:

```
Create  →  Apply  →  Approve  →  Fund  →  Pay  →  Measure
```

| Stage | What happens | Status |
|-------|----------------|--------|
| **Create** | Business defines brief, budget, deliverables | Solid |
| **Apply** | Creator discovers campaigns and submits a pitch | Solid |
| **Approve** | Brand reviews pitch and accepts a creator | Solid |
| **Fund** | Business funds Stripe escrow for the deal | Solid |
| **Pay** | Brand approves post; funds release to creator | Solid |
| **Measure** | Metrics and ROI tracking | Core works; AI/scraping is polish |

**Today:** the campaign lifecycle above is production-grade. AI brief generation, live social scraping, and advanced analytics are intentionally secondary — useful demos, not blockers for launch.

---

## What is production-ready

### Ready for real users

| Area | Details |
|------|---------|
| **Authentication** | Supabase Auth with role-based routing (`business` / `influencer`) |
| **Campaigns** | Create, edit, publish, and manage campaign state |
| **Applications** | Creator pitch flow and brand approval |
| **Escrow** | Stripe PaymentIntents for funding; Connect transfers for payout |
| **Deliverables** | Draft submission, review, approve / request changes |
| **Webhooks** | Signed Stripe events update transactions and participations |
| **Cron** | Protected `/api/cron/metrics` with `CRON_SECRET` |
| **Security** | Server-side role/onboarding checks; RLS on all tables |
| **Build** | TypeScript enforced at build time (`ignoreBuildErrors: false`) |

### Demo-only or polish (not required for core launch)

| Area | Notes |
|------|-------|
| **Mock mode** | Full UI without backend credentials — great for design and demos |
| **AI agents** | `/api/ai/*` — needs `GEMINI_API_KEY`; falls back without it |
| **Live metrics** | SociaVault scraping — needs `SOCIAVAULT_API_KEY` |
| **Email** | Resend notifications — needs `RESEND_API_KEY` |

---

## Mock mode

Mock mode is **explicit**. Set it in `.env.local`:

```env
AETHER_MOCK_MODE=true
```

When enabled:

- No Supabase or Stripe credentials are required
- Auth uses demo cookies: `aether-session`, `aether-role`, `aether-onboarded`
- Campaigns, participations, and transactions persist in `localStorage`
- Stripe fund/release actions return simulated success
- Webhooks and cron endpoints skip secret verification

When disabled (`AETHER_MOCK_MODE=false` or unset):

- The app validates all required env vars at **build time** and **server startup** (`instrumentation.ts`)
- Missing keys produce a clear error listing what to set
- Auth, payments, and webhooks use live services
- Mock mode is **never** inferred from placeholder Supabase/Stripe keys

> **Tip:** Keep `AETHER_MOCK_MODE=true` for local UI work. Unset or set `false` only when testing against a real Supabase project and Stripe test mode.

---

## Environment variables

Copy the template and edit:

```bash
cp .env.example .env.local
```

### Required in production (`AETHER_MOCK_MODE=false`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (client + SSR) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for webhooks and system writes |
| `STRIPE_SECRET_KEY` | Stripe API (server) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js (client) |
| `STRIPE_WEBHOOK_SECRET` | Verifies webhook signatures |
| `NEXT_PUBLIC_APP_URL` | Public app URL (cron callbacks, redirects) |
| `CRON_SECRET` | Bearer token for `/api/cron/metrics` |

### Optional (demo / polish)

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | AI brief, pitch, and safety checks |
| `RESEND_API_KEY` | Transactional email |
| `SOCIAVAULT_API_KEY` | Instagram / TikTok metrics scraping |

### `.env.example` reference

```env
AETHER_MOCK_MODE=true

NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

STRIPE_SECRET_KEY=sk_test_51...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...

NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=your-secure-random-string

GEMINI_API_KEY=AIzaSy...
RESEND_API_KEY=re_...
SOCIAVAULT_API_KEY=sv_your_sociavault_api_key_here
```

Configuration is centralized in `lib/env.ts`. Production builds call `validateEnv()` from `next.config.ts` when mock mode is off.

---

## Supabase setup

### 1. Create a project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. Under **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (never expose to the client)

### 2. Run migrations

Apply SQL files in order from `supabase/migrations/`:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Or paste each file into the **SQL Editor** in the Supabase dashboard.

### 3. Seed demo data (optional)

```bash
# Run supabase/seed.sql in the SQL Editor
```

### 4. Configure auth

- Enable **Email** provider under Authentication.
- Add your app URL to **Redirect URLs** (e.g. `http://localhost:3000/**` for local dev).
- Roles (`business` / `influencer`) are stored in `public.users` and set via signup metadata.

### Schema: `profiles.user_id`

The `profiles` table does **not** have an `id` column. Its primary key is `user_id`, a foreign key to `auth.users.id`:

```sql
-- profiles.user_id is the FK to auth.users.id — do not use .id
CREATE TABLE public.profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  ...
);
```

In application code, always filter with `.eq("user_id", authUserId)`. Role lives on `public.users`, not on `profiles`.

---

## Stripe setup

Aether uses **Stripe Connect** for creator payouts and **PaymentIntents** for business escrow.

### 1. Keys

From the [Stripe Dashboard](https://dashboard.stripe.com):

| Key | Env variable |
|-----|----------------|
| Secret key | `STRIPE_SECRET_KEY` |
| Publishable key | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |

Use test keys (`sk_test_…`, `pk_test_…`) until you are ready for live mode.

### 2. Connect

Enable **Connect** in the dashboard so creators can onboard Express accounts and receive transfers.

### 3. Webhooks

Create an endpoint (or use the CLI locally):

| Setting | Value |
|---------|--------|
| URL | `https://your-domain.com/api/webhooks/stripe` |
| Events | `payment_intent.succeeded`, `account.updated`, `transfer.created` |

Copy the **signing secret** to `STRIPE_WEBHOOK_SECRET`.

**Local development:**

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The CLI prints a `whsec_…` value — use that as `STRIPE_WEBHOOK_SECRET` in `.env.local`.

### 4. Webhook verification (production)

In production (`AETHER_MOCK_MODE=false`):

- Every webhook **must** include a valid `stripe-signature` header.
- The handler verifies the payload with `STRIPE_WEBHOOK_SECRET` via `stripe.webhooks.constructEvent`.
- Unsigned or missing signatures are rejected with `401` — there is no dev fallback in production.
- Updates run through a **service-role** Supabase client so RLS does not block system writes.

---

## Development commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server at `localhost:3000` |
| `npm run build` | Production build (TypeScript checked) |
| `npm run start` | Run production server |
| `npm test` | Run Vitest unit tests |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint |

Tests cover escrow authorization, campaign ownership, creator applications, post approval, RLS policy mirrors, and webhook/cron hardening. See `lib/__tests__/`.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, RSC) |
| Database & auth | Supabase (Postgres, RLS, Realtime) |
| Payments | Stripe Connect |
| UI | Tailwind CSS v4, shadcn/ui, Framer Motion |
| Tests | Vitest |
| Types | TypeScript + Zod (`types/database.ts`) |

---

## License

Private repository. Contact the owner for usage terms.