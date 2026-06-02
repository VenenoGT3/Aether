# Aether

**Performance-based UGC + Clipping platform.** Brands fund a budget pool and pay creators **per view** (CPM). Creators join campaigns openly (no application), post short-form clips, and earn automatically as their views accrue — with brand moderation, a holdback window, and automated batched payouts via Stripe Connect.

The original **fixed-fee escrow** model (apply → approve → escrow → manual release) is still fully supported. The two coexist via a `campaign_type` discriminator (`'fixed'` vs `'performance'`), so the platform handles both during and after the transition.

> **New here? Read [HANDOFF.md](HANDOFF.md)** for the migration story, current state, risks, and next steps, and **[SETUP.md](SETUP.md)** to get it running.

---

## Current status

This is an **honest** status. The performance model is built end-to-end and is fully exercisable in **mock mode**, but the live money pipeline has **not yet been run against real infrastructure**.

### ✅ Complete & working (mock mode)
- **Open join** — creators join active performance campaigns directly (no pitch/approval).
- **Clip submission** — multiple clips per creator per campaign, deduped by URL.
- **Brand moderation** — approve (→ `tracking`) / reject clips.
- **View tracking → earnings** — a worker syncs views and accrues earnings via an atomic, pool-aware SQL function (`record_clip_earning`).
- **Pooled budgets + caps** — per-campaign budget pool, per-creator caps, atomic spend.
- **Real pool funding** — performance campaigns must be paid (Stripe PaymentIntent) before going live; they stay `draft` until the webhook confirms payment.
- **Automated payouts** — a batch worker promotes earnings past the holdback window and pays creators via idempotent Stripe transfers.
- **Earnings reversal** — rejecting/disqualifying a clip reverses its unpaid earnings (DB trigger) and releases reserved budget.
- **UI** — performance campaign builder, creator Clips & Earnings page, brand moderation + burn-down, dashboard summaries.
- **Legacy fixed-fee flow** — unchanged and working.

### 🚧 In progress / needs testing
- **Live end-to-end run** — the schema, worker, and Stripe paths typecheck/build and are unit-tested, but have **never executed against a real Supabase + Redis + Stripe**. This is the top priority before launch.
- **Ayrshare view tracking** — the provider abstraction and DB fields exist, but **account linking is a placeholder** and the real provider response parsing is unverified. Without a key, the worker uses a **simulated** view provider.
- **Worker deployment** — the worker is not deployed and there is no provisioned Redis.
- **Fraud controls** — only a basic velocity check today.

See [HANDOFF.md](HANDOFF.md) → *Known limitations & risks* for the full list.

---

## Quick start (mock mode)

Runs the entire UI in the browser with no Supabase/Stripe/Redis — great for demos and design.

```bash
git clone https://github.com/VenenoGT3/Aether.git
cd Aether
npm install
cp .env.example .env.local   # AETHER_MOCK_MODE=true by default
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use the role switcher in the nav to view the **Brand** and **Creator** experiences.

---

## Running locally

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js app at `localhost:3000` |
| `npm run build` | Production build (TypeScript checked) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| **`npm run worker`** | View-sync + earnings + payout worker (BullMQ; **needs Redis**) |
| **`npm run worker:once`** | One view-sync + earnings cycle, **no Redis** — ideal for testing/cron |
| **`npm run payouts:once`** | One payout batch, **no Redis** — ideal for testing/cron |

> The worker is a **standalone Node process**, separate from the Next.js app. It uses the Supabase **service role** and (in real mode) Stripe + optionally Ayrshare. Even in mock mode the worker needs a real Supabase project — mock mode only simulates the *view source*, not the database. See [SETUP.md](SETUP.md).

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router, React 19, RSC) |
| Database & auth | Supabase (Postgres, RLS, Realtime) |
| Payments | Stripe (PaymentIntents for pool/escrow funding, Connect transfers for payouts) |
| Background worker | BullMQ + Redis (`worker/`), run with `tsx` |
| View tracking | Ayrshare (real) / simulated provider (fallback) |
| UI | Tailwind CSS v4, shadcn/ui + Base UI, Framer Motion, Recharts |
| Types / validation | TypeScript + Zod (`types/database.ts`, `lib/api/schemas.ts`) |
| Tests | Vitest |

---

## Repository layout

```
app/                     Next.js routes (business/, creator/, api/)
  api/campaigns/[id]/join Open-join endpoint (performance)
  api/clips/             Clip submission + moderation (approve/reject)
worker/                  Standalone BullMQ worker (view-sync, earnings, payouts)
  views-provider.ts      Ayrshare (real) + simulated provider abstraction
  payout.ts              Payout batch logic
lib/
  supabase/              Client/server/admin + clips & campaigns data layers
  stripe/                Connect, actions (pool funding, escrow), webhook handler
  api/                   API guard, schemas, services (join, clip submit, moderation)
supabase/migrations/     Schema (additive; fixed-fee + performance coexist)
supabase/functions/      stripe-webhook Edge Function
types/                   Zod schemas / DB types
docs/                    Reference docs (SECRETS, SECURITY, PERMISSIONS, etc.)
```

---

## Documentation

- **[SETUP.md](SETUP.md)** — set up mock mode and real mode (migrations, env, worker, Stripe).
- **[HANDOFF.md](HANDOFF.md)** — migration summary, current state, risks, architecture, next steps.
- **[docs/SECRETS.md](docs/SECRETS.md)** — where every secret lives (Vercel vs Supabase Edge vs worker).
- **[docs/SECURITY.md](docs/SECURITY.md)** / **[docs/PERMISSIONS.md](docs/PERMISSIONS.md)** — RLS and permission model.

> Some files under `docs/` (e.g. `plan.md`, `schema.md`, `metrics.md`, `launch.md`) describe the **original fixed-fee model** and predate the performance migration. Treat HANDOFF.md / SETUP.md as the source of truth.

---

## License

Private repository. Contact the owner for usage terms.
