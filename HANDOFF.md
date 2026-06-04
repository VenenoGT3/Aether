# Aether — Engineering Handoff

A direct, honest snapshot of where the project is, what changed, what's risky, and what to do next. For setup, see [SETUP.md](SETUP.md); for the overview, [README.md](README.md).

---

## 1. What this is now

Aether started as a **fixed-fee influencer-marketing marketplace** (brands post campaigns, creators apply, funds sit in Stripe escrow, payout releases on manual approval).

It has been migrated to a **performance-based UGC + clipping platform**:

- Brands fund a **budget pool** and set a **CPM** (pay per 1,000 views).
- Creators **join openly** (no application/approval), submit **multiple clips**.
- Brands **moderate** clips (approve → tracking, or reject).
- A worker **tracks views** and **accrues earnings** (`views × CPM`, capped by pool + per-creator cap).
- Earnings settle after a **holdback window**, then pay out automatically via **Stripe Connect**.

Both models coexist: every campaign has a `campaign_type` of `'fixed'` or `'performance'`. The legacy fixed-fee flow is untouched and still works.

---

## 2. Migration summary (what changed)

Delivered in additive phases (each on `main`):

| Phase | Change |
|-------|--------|
| **1 — Schema + earnings engine** | New tables `clips`, `view_snapshots`, `earnings`, `payouts`; performance columns on `campaigns`/`participations`; `record_clip_earning()` (atomic, pool/cap-aware accrual). |
| **2 — Open join + clip submit** | `participation_status` += `active`/`banned`; open-join RLS + `enforce_open_join` trigger; `POST /api/campaigns/[id]/join`, `POST /api/clips`. |
| **3 — Brand moderation** | `POST /api/clips/[id]/approve|reject`; review fields + `check_clip_update` trigger; approve → `tracking`. |
| **4 — View-sync + earnings worker** | BullMQ worker (`worker/`): view-sync → snapshots → `record_clip_earning`; Ayrshare view provider (required); basic fraud velocity check. |
| **5 — Payouts + reversal** | Payout-batch worker + SQL (`promote_due_earnings`, `create_payout_for_creator`, `mark_payout_paid/failed`); idempotent Stripe transfers; `reverse_earnings_on_clip_block` trigger. |
| **6 — UI** | Performance campaign builder, creator Clips & Earnings page, brand moderation + burn-down, dashboard summaries, nav. |
| **+ Pool funding** | Performance campaigns are `draft` until a Stripe PaymentIntent for the pool succeeds (webhook flips to `open`). Real Stripe Elements UI. |
| **+ Cleanup** | Legacy wallet clarity (perf payouts hidden from fixed-fee wallet), comments, theme-aware brand dashboard, discover Join fix. |

---

## 3. Architecture worth knowing

**The money pipeline (performance):**
```
create campaign (draft) → fund pool (Stripe PaymentIntent) → webhook → status 'open'
creator joins (participation 'active') → submits clip ('pending')
brand approves → clip 'tracking'
worker: fetch views → view_snapshots → record_clip_earning() → earnings 'accrued' (budget_reserved += )
holdback elapses → payout worker: 'accrued' → 'approved' → claim → Stripe transfer → 'paid' (budget_reserved → budget_paid)
reject/disqualify a clip → trigger reverses unpaid 'accrued' earnings, releases reserved budget
```

**Key decisions:**
- **All money mutations are atomic SQL** (SECURITY DEFINER functions / triggers), not app code. Concurrency is handled with `FOR UPDATE` row locks (campaign pool) and a per-creator advisory lock (payout claim), so the pool can't be over-spent and payouts can't double-batch.
- **Idempotent payouts** — claiming sets `earnings.payout_id` (no re-batch); the Stripe transfer uses the payout id as its idempotency key; a failed transfer releases the claim for retry.
- **Earnings reversal is a DB trigger** on `clips` status → `rejected`/`disqualified` — so it fires for both brand rejects and worker auto-disqualifies, atomically, and only touches **unpaid** (`accrued`) earnings.
- **The worker is fully decoupled from Next.js** — it reads `process.env` directly and uses the Supabase service role. It must never import the `server-only` Next modules. (`worker/env.ts`, `worker/supabase.ts`.)
- **View provider** (`worker/views-provider.ts`) — Ayrshare is the only view source and is **required**: the worker hard-fails at startup without `AYRSHARE_API_KEY`, and the payout safety guard blocks accrual/payouts if it's removed at runtime, so earnings never accrue on unverified views.
- **Draft-until-funded** — performance campaigns can't go live without a successful payment; enforced in `createCampaignAction` (always `draft`) + webhook-only activation.
- **Additive migrations** — fixed-fee and performance share one schema; nothing was destructively removed.

**Status mapping (avoid confusion):** DB `earnings.status` `accrued` = "in holdback (pending)", `approved` = "ready for payout", `paid` = "paid". The UI labels these accordingly.

---

## 4. Current state

- **Production-only: mock/demo mode fully removed.** Every path uses real Supabase, Stripe, Redis, and Ayrshare; missing required config fails clearly at build/startup. Builds and the full unit-test suite pass.
- **Live infra: built but unproven.** All code typechecks/builds and the SQL/worker logic is unit-tested, but **none of it has executed against a real Supabase + Redis + Stripe**. Migrations are unapplied; the worker is not deployed; no Redis is provisioned.
- **Build/quality:** `npm run typecheck` ✓, `npm run build` ✓, `npm test` ✓ (119). `npm run lint` reports ~158 **pre-existing** errors (mostly `no-explicit-any`, `set-state-in-effect`, impure-render in legacy files); the migration added no net-new lint errors.

---

## 5. Known limitations & risks

**High**
1. **Nothing has run live.** The atomic SQL, worker, payouts, and reversal are unverified against real infrastructure. *Run the staging smoke test in [SETUP.md](SETUP.md) before trusting real money.*
2. **Ayrshare account-linking is not implemented.** The provider, `profiles.ayrshare_profile_key`, and a disabled UI placeholder exist, but the OAuth/Profile-Key flow is missing and the real response parsing is unverified. `AYRSHARE_API_KEY` is required (the worker hard-fails without it). View data = money, so this is the biggest external unknown.
3. **View fraud protection is minimal** — a single velocity check. Bots / re-uploaded clips translate directly into payouts.

**Medium**
4. **No pool refund / webhook reconciliation.** If a funded campaign is cancelled, the pool isn't refunded; if the pool-funding webhook never fires, the campaign is stuck in `draft` with no fallback.
5. **Earnings reversal covers only `accrued`** (unpaid) earnings — `approved`/in-flight earnings aren't reversed (deliberate, to avoid racing the payout worker).
6. **Brand moderation queue shows creator email instead of name** (the `clips.creator_id → profiles` join was deferred).

**Low / cosmetic**
7. Some legacy fixed-fee campaign UI still runs on seeded demo data (e.g. the `/campaigns/[id]` workspace and the campaign-builder's suggested-creators list) and should be wired to live data or removed.
8. **~158 pre-existing lint errors** across legacy files.
9. No worker **monitoring/alerting**; retries are silent.

---

## 6. Recommended next steps (prioritized)

1. **Run the live staging smoke test** (SETUP.md §"first live verification") — proves the money pipeline end-to-end in Stripe test mode. Highest value.
2. **Implement Ayrshare account-linking** + validate per-platform view coverage; then turn on the real provider. Strengthen fraud controls (caps, dedupe, tuned holdback) before real money.
3. **Pool funding robustness** — refund-on-cancel + a reconciliation job for funded-but-unactivated campaigns (don't depend solely on the webhook).
4. **Deploy the worker** (host + Redis). Deployment assets are now in place — a multi-stage `Dockerfile` (non-root, `tini` PID 1, `HEALTHCHECK`), `.dockerignore`, `Procfile`, an `npm run worker:prod` script, **startup env validation** (fails fast with `[ALERT] env.invalid`), **graceful `SIGTERM` shutdown** (readiness→503, drains jobs, closes Redis + health server, 15s force-exit), an **HTTP health endpoint** (`/health` liveness, `/ready` readiness on `WORKER_HEALTH_PORT`, default 8080), and **multi-instance support** (Redis-centralized schedulers, per-clip view-sync dedup, and a Redis leader lease so per-tick audits run once across the fleet). Provision a managed Redis + a worker host and follow **[SETUP.md §6 "Deploying the worker (production)"](SETUP.md)** (Railway/Render/Fly recommended). Structured `[ALERT]` logs + heartbeat already exist — point a log drain at them.
5. **Polish for real mode** — moderation creator-name join, replace hardcoded dashboard numbers with real/empty states.
6. **Tech-debt pass** — clear the 158 lint errors; reduce mock/real dual-path drift.

---

## 7. Honest one-liner

Architecturally solid and production-only, with a well-designed, idempotent, atomic money pipeline — **but not yet proven against real infrastructure.** The single most important next action is one live end-to-end run on staging.
