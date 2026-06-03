# Setup Guide

How to run Aether in **mock mode** (no external services) and **real mode** (Supabase + Stripe + Redis). For the bigger picture, read [HANDOFF.md](HANDOFF.md).

---

## Prerequisites

- Node.js 20+
- npm
- (Real mode only) a Supabase project, a Stripe account, and a Redis instance

---

## Mock mode (fastest — no backend)

Mock mode runs the full UI in the browser on `localStorage`. No Supabase, Stripe, or Redis required.

```bash
npm install
cp .env.example .env.local      # AETHER_MOCK_MODE=true by default
npm run dev                      # http://localhost:3000
```

Use the role switcher in the nav to move between Brand and Creator views. Campaigns, clips, joins, earnings, and payouts are simulated in `localStorage`.

> **Worker in mock mode:** `npm run worker:once` simulates the *view source* (no Ayrshare), but it still writes to a **real Supabase database** — it does not use `localStorage`. To actually exercise the worker, follow the real-mode setup below and set `AETHER_MOCK_MODE=true` only to keep views simulated.

---

## Real mode

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. From **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → used by the **worker** and the **stripe-webhook Edge Function** only (never in the Vercel app runtime by default — see [docs/SECRETS.md](docs/SECRETS.md)).

### 2. Apply migrations (in order)

Migrations are **additive** and must run in filename order. Both campaign models (fixed-fee + performance) share the schema.

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Or paste each file from `supabase/migrations/` into the SQL Editor, in this order:

| # | Migration | Purpose |
|---|-----------|---------|
| 1 | `20260524000000_aether_init.sql` | Base schema + RLS (users, profiles, campaigns, participations, posts, transactions…) |
| 2 | `20260524000001_stripe_payout_type.sql` | Stripe/profile fields, `payout` txn type |
| 3 | `20260524000002_aether_messages.sql` | Messages |
| 4 | `20260525000000_harden_security.sql` | RLS hardening, `transactions.user_id` |
| 5 | `20260601000000_add_post_metrics_columns.sql` | Post metrics columns |
| 6 | `20260601000001_rls_permissions_hardening.sql` | Tighter RLS |
| 7 | `20260601000002_participation_status_open_join.sql` | `participation_status` += `active`, `banned` (own migration — must commit before later use) |
| 8 | `20260602000000_performance_clipping_phase1.sql` | Performance columns, `clips`/`view_snapshots`/`earnings`/`payouts`, `record_clip_earning` |
| 9 | `20260602010000_open_join_clip_submission.sql` | Open-join policy + trigger; clip-submit RLS |
| 10 | `20260602020000_clip_moderation.sql` | Clip review fields + moderation trigger |
| 11 | `20260602030000_payout_engine.sql` | Payout functions + earnings-reversal trigger |
| 12 | `20260602040000_campaign_pool_funding.sql` | `funding_payment_intent_id`, `funded_at` |
| 13 | `20260602050000_ayrshare_profile_key.sql` | `profiles.ayrshare_profile_key` (account-link prep) |

> ⚠️ Migrations have **never been applied to a live database** in this project. Apply them to a fresh **staging** project first and verify they run cleanly end-to-end.

### 3. Auth

- Enable the **Email** provider in Supabase Authentication.
- Add your app URL to **Redirect URLs** (e.g. `http://localhost:3000/**`).
- Roles (`business` / `influencer`) come from signup metadata and live on `public.users`.

### 4. Stripe

Aether uses **Stripe Connect** for creator payouts and **PaymentIntents** for funding.

1. Copy keys: `STRIPE_SECRET_KEY` (`sk_test_…`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`). Use **test** keys until ready for live.
2. Enable **Connect** (Express accounts) so creators can onboard and receive transfers.
3. Configure a **webhook** endpoint (default handler is the Supabase Edge Function):
   - URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
   - Events: `payment_intent.succeeded`, `account.updated`, `transfer.created`
   - The `payment_intent.succeeded` handler activates a performance campaign (sets `status='open'`, `funded_at`) when its **pool-funding** PaymentIntent succeeds (`metadata.kind = 'pool_funding'`).
   - Set `STRIPE_WEBHOOK_SECRET` in the Edge Function secrets (not on Vercel) when `STRIPE_WEBHOOK_HANDLER=supabase`.

   Local testing of the legacy Vercel handler: `STRIPE_WEBHOOK_HANDLER=vercel` + `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

### 5. Redis + the worker

The worker is a **standalone Node process** (not Next.js). It needs Supabase (service role) + Redis, and optionally Stripe (live payouts) and Ayrshare (real views).

```bash
# Provide worker env (see reference below): NEXT_PUBLIC_SUPABASE_URL,
# SUPABASE_SERVICE_ROLE_KEY, REDIS_URL, STRIPE_SECRET_KEY, (optional) AYRSHARE_API_KEY
npm run worker           # full scheduler + workers (needs Redis)
npm run worker:once      # one view-sync + earnings cycle (no Redis)
npm run payouts:once     # one payout batch (no Redis)
```

> The worker reads `process.env` directly and uses the Supabase **service role** (bypasses RLS). Deploy it somewhere it can hold that key securely. It must **not** run in the Vercel app runtime.

**Monitoring & alerts.** The worker emits structured logs (`<iso> [worker][level] event key=val …`). It logs a `heartbeat` every `WORKER_HEARTBEAT_MINUTES` with queue depths and per-window counters, and tags critical conditions with `[worker][ALERT]` so they're easy to forward to a pager/monitoring tool. Alert conditions: a job that **exhausts its retries** (`job.exhausted`), **any failed payout** in a batch (`payout.batch.failures`), an **exhausted campaign pool** (`campaign.pool_exhausted`), **repeated views-provider errors** in one window (`views.provider.repeated_errors`), and the **real-mode-with-simulated-views** state (`simulated_views_in_real_mode`). A minimal setup is a log drain that pages on the substring `[ALERT]`.

**Real-money safety guard.** In real mode (`AETHER_MOCK_MODE=false`) without an `AYRSHARE_API_KEY`, views are *simulated* — so the worker **refuses to accrue earnings or run payouts** (it would otherwise pay real money for fake views). View-sync still runs (snapshots update for visibility), but no `earnings` rows are created and payout batches no-op, with a loud `[ALERT]` at startup and each heartbeat. Set `AYRSHARE_API_KEY` for real views, or `ALLOW_SIMULATED_PAYOUTS_IN_REAL_MODE=true` to override on staging (never in production). Mock mode is unaffected.

**Pool-funding reconciliation.** A repeatable worker job (every `POOL_FUNDING_RECONCILIATION_INTERVAL_MINUTES`) recovers performance campaigns stuck in `draft` after pool funding when the `payment_intent.succeeded` webhook is missed or delayed. It finds draft performance campaigns that have a `funding_payment_intent_id`, checks the PaymentIntent status in Stripe, and **activates** (`status: open` + `funded_at`) those that have succeeded — idempotently (guarded on `status='draft'`, so it can't race the webhook or touch live campaigns). Canceled/failed PaymentIntents are **left in draft** (cancellation + refund stays an explicit owner action via the cancel endpoint); a campaign stuck too long fires `campaign.funding_stuck` `[ALERT]`. This complements the manual `POST /api/campaigns/[id]/reconcile-funding` endpoint.

### 6. Deploying the worker (production)

The worker is a **long-running background process with no HTTP port**, and must run **separately from the Next.js app** (the app deploys to Vercel; the worker does **not**). It needs a **managed Redis** instance plus the Supabase service-role key.

**What it needs (real mode):**

- `REDIS_URL` — managed Redis (Upstash, Railway, Render, Redis Cloud…). TLS URLs (`rediss://`) are supported.
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — **required** (service role bypasses RLS; keep it only on the worker host, never in the Vercel app).
- `STRIPE_SECRET_KEY` — required for **live** creator payouts.
- `AYRSHARE_API_KEY` — required for **real** views; without it the real-money safety guard blocks earnings/payouts.

On startup the worker **validates its environment** and aborts with a clear `[worker][ALERT] env.invalid` line if a required var is missing; missing optional vars log `env.warning` and continue.

**Option A — Docker** (`Dockerfile` + `.dockerignore` are included):

```bash
docker build -t aether-worker .
docker run --env-file .env aether-worker
```

Multi-stage `node:22-alpine` image, production dependencies only, runs as a non-root user under `tini` (PID 1) so `SIGTERM` reaches the process and triggers graceful shutdown. Deploy to any container host — Fly.io, Railway, Render, ECS, Cloud Run, or a plain VM.

**Option B — Procfile platforms** (Railway, Render, Fly.io, Heroku-style) — a `Procfile` is included:

```
worker: npm run worker:prod
```

Point the platform at this repo, add a Redis addon, set the env vars above, and it runs `npm run worker:prod` (which is `tsx worker/index.ts`). No build step is required.

**Recommended platforms:** **Railway** or **Render** are simplest (managed Redis + Procfile in a few clicks); **Fly.io** if you prefer the Docker image. Run **one** worker instance — the payout and reconcile workers are single-instance by design.

**Graceful shutdown & restarts.** On `SIGTERM`/`SIGINT` (deploys, scaling, `docker stop`) the worker stops scheduling, drains in-flight jobs, closes Redis, and exits `0` — force-exiting after 15s if a close hangs. BullMQ retries (with backoff) any job interrupted mid-flight, and every money mutation is atomic + idempotent, so restarts and redeploys are safe.

**Health & monitoring.** The worker logs `startup` → `env.validated` → `ready`, then a `heartbeat` every `WORKER_HEARTBEAT_MINUTES` (queue depths + counters). Forward stdout to a log drain and page on the substring `[ALERT]` (see the monitoring note above).

---

## Environment variable reference

| Variable | Used by | Notes |
|----------|---------|-------|
| `AETHER_MOCK_MODE` | app, worker | `true` = simulated; `false` = real (validated at build/startup) |
| `NEXT_PUBLIC_SUPABASE_URL` | app, worker | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | worker, Edge Function | **Never** in the Vercel app runtime (unless `STRIPE_WEBHOOK_HANDLER=vercel`) |
| `STRIPE_SECRET_KEY` | app, worker | Server Stripe API |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | app | Stripe.js / Elements (pool funding UI) |
| `STRIPE_WEBHOOK_SECRET` | Edge Function (default) | Webhook signature verification |
| `STRIPE_WEBHOOK_HANDLER` | app | `supabase` (default) or `vercel` (legacy) |
| `NEXT_PUBLIC_APP_URL` | app | Redirects / cron callbacks |
| `CRON_SECRET` | app | Bearer for `/api/cron/metrics` |
| `REDIS_URL` | worker | BullMQ (`npm run worker`); not needed for `worker:once`/`payouts:once` |
| `AYRSHARE_API_KEY` | worker | Set + `AETHER_MOCK_MODE=false` → real view tracking; else simulated |
| `AYRSHARE_MIN_INTERVAL_MS` | worker | Rate-limit gap between Ayrshare calls (default 350) |
| `VIEW_SYNC_INTERVAL_MINUTES` | worker | View-sync cadence (default 10) |
| `VIEW_SYNC_BATCH_SIZE` | worker | Max clips per sync (default 200) |
| `WORKER_LOG_DEBUG` | worker | `true` enables verbose per-clip/per-job debug logs (default off) |
| `WORKER_HEARTBEAT_MINUTES` | worker | Heartbeat cadence — queue depths + counters (default 5) |
| `WORKER_PROVIDER_ERROR_ALERT_THRESHOLD` | worker | Provider errors per heartbeat window before an `[ALERT]` (default 5) |
| `VIEW_HOLDBACK_HOURS` | worker | Fallback holdback (per-campaign value overrides; default 48) |
| `MIN_PAYOUT_THRESHOLD` | worker | Min creator balance to pay out (default 10) |
| `PAYOUT_BATCH_INTERVAL` | worker | Payout cadence in minutes (default 360) |
| `ALLOW_SIMULATED_PAYOUTS_IN_REAL_MODE` | worker | Override the simulated-views safety guard (testing only; default false — **never enable in production**) |
| `POOL_FUNDING_RECONCILIATION_INTERVAL_MINUTES` | worker | Cadence of the pool-funding reconciliation safety net (default 15) |
| `POOL_FUNDING_STUCK_ALERT_MINUTES` | worker | A draft+funded campaign stuck longer than this fires a `[ALERT]` (default 120) |
| `GEMINI_API_KEY` / `RESEND_API_KEY` / `SOCIAVAULT_API_KEY` | app | Optional (AI brief, email, legacy scraping) |

Full secret-placement matrix: [docs/SECRETS.md](docs/SECRETS.md).

---

## Recommended first live verification (staging)

Before trusting real money, run the full loop once in **Stripe test mode** on a staging Supabase + Redis:

1. Create a **performance** campaign as a brand → confirm it's `draft` until the pool PaymentIntent succeeds, then flips to `open` (via webhook).
2. As a creator, **join** it and **submit a clip**.
3. As the brand, **approve** the clip → it becomes `tracking`.
4. Run `npm run worker:once` a couple of times → confirm `view_snapshots` + `earnings` rows appear and the campaign `budget_reserved` grows.
5. Set `VIEW_HOLDBACK_HOURS=0`, run `npm run payouts:once` → confirm a `payouts` row + Stripe **test** transfer + `earnings` → `paid` + `budget_reserved` → `budget_paid`.
6. **Reject** a tracking clip → confirm its unpaid `accrued` earnings become `reversed` and reserved budget is released.

If all six pass, the money pipeline is proven.
