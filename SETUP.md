# Setup Guide

How to run Aether (Supabase + Stripe + Redis + trusted view providers). For the bigger picture, read [HANDOFF.md](HANDOFF.md).

---

## Prerequisites

- Node.js 20+
- npm
- A Supabase project, a Stripe account, a Redis instance, and at least one trusted view provider: YouTube Data API, TikTok Login Kit/Display API, or Ayrshare

---

## Setup

Install dependencies and create your env file, then fill in real credentials (see the reference below) and complete the steps that follow.

```bash
npm install
cp .env.example .env.local      # fill in real credentials
```

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

4. Deploy `supabase/functions/social-oauth` for creator TikTok/YouTube account linking, with the OAuth secrets listed in [docs/SECRETS.md](docs/SECRETS.md).

### 5. Redis + the worker

The worker is a **standalone Node process** (not Next.js). It needs Supabase (service role) + Redis, and optionally Stripe (live payouts). It also requires at least one trusted view source: YouTube official, TikTok official, or Ayrshare.

```bash
# Provide worker env (see reference below): NEXT_PUBLIC_SUPABASE_URL,
# SUPABASE_SERVICE_ROLE_KEY, REDIS_URL, STRIPE_SECRET_KEY,
# and at least one of YOUTUBE_DATA_API_KEY, TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET,
# or AYRSHARE_API_KEY
npm run worker           # full scheduler + workers (needs Redis)
npm run worker:once      # one view-sync + earnings cycle (no Redis)
npm run payouts:once     # one payout batch (no Redis)
```

> The worker reads `process.env` directly and uses the Supabase **service role** (bypasses RLS). Deploy it somewhere it can hold that key securely. It must **not** run in the Vercel app runtime.

**Monitoring & alerts.** The worker emits structured logs (`<iso> [worker][level] event key=val …`). It logs a `heartbeat` every `WORKER_HEARTBEAT_MINUTES` with queue depths and per-window counters, and tags critical conditions with `[worker][ALERT]` so they're easy to forward to a pager/monitoring tool. Alert conditions: a job that **exhausts its retries** (`job.exhausted`), **any failed payout** in a batch (`payout.batch.failures`), an **exhausted campaign pool** (`campaign.pool_exhausted`), **repeated views-provider errors** in one window (`views.provider.repeated_errors`), and a **payout batch blocked** because the live view source is missing (`payout.blocked.no_view_source`). A minimal setup is a log drain that pages on the substring `[ALERT]`.

**Real-money safety guard.** The worker requires at least one trusted live view source and **hard-fails at startup without one**. Valid sources are `YOUTUBE_DATA_API_KEY`, `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET`, or `AYRSHARE_API_KEY`. As defense-in-depth, if all providers are removed at runtime the worker **refuses to accrue earnings or run payouts** — view-sync records only untrusted last-known snapshots, no `earnings` rows are created, and payout batches no-op with a loud `[ALERT]`. This guarantees real money is never paid out on unverified views.

**Pool-funding reconciliation.** A repeatable worker job (every `POOL_FUNDING_RECONCILIATION_INTERVAL_MINUTES`) recovers performance campaigns stuck in `draft` after pool funding when the `payment_intent.succeeded` webhook is missed or delayed. It finds draft performance campaigns that have a `funding_payment_intent_id`, checks the PaymentIntent status in Stripe, and **activates** (`status: open` + `funded_at`) those that have succeeded — idempotently (guarded on `status='draft'`, so it can't race the webhook or touch live campaigns). Canceled/failed PaymentIntents are **left in draft** (cancellation + refund stays an explicit owner action via the cancel endpoint); a campaign stuck too long fires `campaign.funding_stuck` `[ALERT]`. This complements the manual `POST /api/campaigns/[id]/reconcile-funding` endpoint.

### 6. Deploying the worker (production)

The worker is a **long-running background process with no HTTP port**, and must run **separately from the Next.js app** (the app deploys to Vercel; the worker does **not**). It needs a **managed Redis** instance plus the Supabase service-role key.

**What it needs:**

- `REDIS_URL` — managed Redis (Upstash, Railway, Render, Redis Cloud…). TLS URLs (`rediss://`) are supported.
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — **required** (service role bypasses RLS; keep it only on the worker host, never in the Vercel app).
- `STRIPE_SECRET_KEY` — required for creator payouts.
- `YOUTUBE_DATA_API_KEY` — official YouTube video statistics.
- `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` — TikTok Login Kit credentials; each creator must also connect TikTok with `video.list` scope before TikTok direct polling can accrue.
- `YOUTUBE_OAUTH_CLIENT_ID` + `YOUTUBE_OAUTH_CLIENT_SECRET` — YouTube creator account linking in `supabase/functions/social-oauth`.
- `SOCIAL_OAUTH_FUNCTION_URL` — optional explicit social OAuth callback base; defaults to the deployed function URL.
- `AYRSHARE_API_KEY` — optional fallback/aggregator.
- At least one trusted view provider is required; the worker hard-fails without one.

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

**Recommended platforms:** **Railway** or **Render** are simplest (managed Redis + Procfile in a few clicks); **Fly.io** if you prefer the Docker image.

**Horizontal scaling (multi-instance).** You can run **N worker instances** against the same Redis for throughput/HA:

- **Schedulers** are registered via BullMQ `upsertJobScheduler` (idempotent, Redis-centralized), so the fan-out / payout / reconcile jobs are produced **exactly once per interval** no matter how many instances are up.
- **View-sync** jobs carry a per-clip `jobId`, so an overlapping fan-out can't enqueue a **concurrent** sync of the same clip (which would corrupt fraud signals).
- **Money mutations** (claims, settlement, accrual) are atomic SQL with advisory locks + claim-by-id-set, so even concurrent processing across instances can't double-pay or overspend.
- **Per-tick audits** (pool scan + budget/revenue/quality/fraud forensics) run under a short **Redis leader lease** (`SET NX PX` via `aether:worker:audit-leader`) so only **one** instance runs them per heartbeat — no N× load or duplicate `[ALERT]`s. The lease auto-expires (< heartbeat interval), so a dead leader never wedges it.

Each instance still logs its own `heartbeat` (per-instance liveness) and processes jobs from the shared queues.

**Graceful shutdown & restarts.** On `SIGTERM`/`SIGINT` (deploys, scaling, `docker stop`) the worker flips its readiness probe to `503`, stops scheduling, drains in-flight jobs, closes Redis + the health server, and exits `0` — force-exiting after 15s if a close hangs. BullMQ retries (with backoff) any job interrupted mid-flight, and every money mutation is atomic + idempotent, so restarts and redeploys are safe.

**Health checks.** The worker exposes a tiny HTTP endpoint on `WORKER_HEALTH_PORT` (default `8080`; set `0` to disable) for orchestrator probes:

- `GET /health` (aliases `/healthz`, `/livez`) — **liveness**: `200` when started **and** the heartbeat is fresh (a hung loop / dead Redis goes stale → `503`).
- `GET /ready` (alias `/readyz`) — **readiness**: `200` once startup completed; flips to `503` immediately on shutdown so a load balancer drains it.

The Docker image ships a `HEALTHCHECK` hitting `/health`. For k8s, point `livenessProbe` at `/health` and `readinessProbe` at `/ready`.

**Monitoring.** The worker logs `startup` → `env.validated` → `ready` (with `instanceId`), then a `heartbeat` every `WORKER_HEARTBEAT_MINUTES` (queue depths + counters). Forward stdout to a log drain and page on the substring `[ALERT]` (see the monitoring note above).

---

## Environment variable reference

| Variable | Used by | Notes |
|----------|---------|-------|
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
| `YOUTUBE_DATA_API_KEY` | worker | Official YouTube Data API v3 statistics (`videos.list`) |
| `YOUTUBE_MIN_INTERVAL_MS` | worker | Rate-limit gap between YouTube calls (default 100) |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | worker | TikTok Login Kit credentials for token refresh and Display API polling |
| `TIKTOK_MIN_INTERVAL_MS` | worker | Rate-limit gap between TikTok calls (default 350) |
| `AYRSHARE_API_KEY` | worker | Optional Ayrshare fallback/aggregator |
| `AYRSHARE_MIN_INTERVAL_MS` | worker | Rate-limit gap between Ayrshare calls (default 350) |
| `VIEW_SYNC_INTERVAL_MINUTES` | worker | View-sync cadence (default 10) |
| `VIEW_SYNC_BATCH_SIZE` | worker | Max clips per sync (default 200) |
| `WORKER_LOG_DEBUG` | worker | `true` enables verbose per-clip/per-job debug logs (default off) |
| `WORKER_HEARTBEAT_MINUTES` | worker | Heartbeat cadence — queue depths + counters (default 5) |
| `WORKER_PROVIDER_ERROR_ALERT_THRESHOLD` | worker | Provider errors per heartbeat window before an `[ALERT]` (default 5) |
| `WORKER_FRAUD_DISQUALIFY_RATE_THRESHOLD` | worker | Auto-disqualifications per heartbeat window before a scoring-anomaly `[ALERT]` (default 25) |
| `WORKER_FRAUD_REPEAT_OFFENDER_MIN_EVENTS` | worker | Cross-campaign fraud events (7d) to flag a repeat offender (default 3) |
| `WORKER_HEALTH_PORT` | worker | HTTP health endpoint port for orchestrator probes; `0` disables (default 8080) |
| `VIEW_HOLDBACK_HOURS` | worker | Fallback holdback (per-campaign value overrides; default 48) |
| `MIN_PAYOUT_THRESHOLD` | worker | Min creator balance to pay out (default 10) |
| `PAYOUT_BATCH_INTERVAL` | worker | Payout cadence in minutes (default 360) |
| `POOL_FUNDING_RECONCILIATION_INTERVAL_MINUTES` | worker | Cadence of the pool-funding reconciliation safety net (default 15) |
| `POOL_FUNDING_STUCK_ALERT_MINUTES` | worker | A draft+funded campaign stuck longer than this fires a `[ALERT]` (default 120) |
| `XAI_API_KEY` / `RESEND_API_KEY` / `SOCIAVAULT_API_KEY` | app | Optional (Grok 4.3 AI brief/pitch/forecast, email, legacy scraping) |

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
