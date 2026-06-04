# Aether — Production & Deploy Guide

Operational runbook for deploying and running Aether in production. For deeper
setup details see [`SETUP.md`](./SETUP.md) and [`docs/SECRETS.md`](./docs/SECRETS.md).

Aether is two deployables:

| Component | Runs on | Purpose |
| --- | --- | --- |
| **Web app** (Next.js 16) | Vercel | UI, API routes, server actions |
| **Worker** (Node + BullMQ) | Railway / Render / Fly / a container host | View-sync, earnings accrual, payouts, fraud, auto-approve sweeps |

The worker is **not** deployed to Vercel (it's a long-lived process). See the
`Dockerfile`, `Procfile`, and `SETUP.md` for worker deployment.

---

## GitHub & deployment workflow

### Branch strategy

| Branch | Role | Deploys to |
| --- | --- | --- |
| `main` | **Production** — always releasable | Vercel Production (web app) + worker host |
| `staging` | **QA / pre-production** — release candidates | Vercel Preview (staging) |
| `development` | **Active development** — integration branch | Vercel Preview |

Promotion flows one direction: `feature/* → development → staging → main`.
Never commit directly to `main` — production changes land via a reviewed PR.

### Pull-request workflow

1. Branch off `development`:
   `git checkout development && git pull && git checkout -b feature/<short-name>`
2. Open a PR into `development` (or `staging` for a release candidate, `main` to ship).
3. CI runs automatically — **all four checks must be green** (see below).
4. Get **1+ approval**, resolve review conversations, then **Squash & merge**.
5. Promote with `development → staging`, then `staging → main` PRs.

### CI pipeline — [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)

Runs on every PR into `main` / `staging` / `development`, and again on push to those
branches. Four parallel, independent jobs — **each is its own required status check**:

| Check | Command | Gate |
| --- | --- | --- |
| `typecheck` | `npm run typecheck` | `tsc --noEmit` — zero type errors |
| `lint` | `npm run lint` | ESLint — zero errors |
| `test` | `npm run test` | Vitest unit/integration suite |
| `preflight` | `npm run preflight` | Required-env + production-safety config check |

Node 20 with cached `npm ci`, least-privilege (`contents: read`), and superseded runs
auto-cancelled. `preflight` uses real repo secrets when present and falls back to safe
CI placeholders otherwise (it asserts env *presence*, never secret values).

### Deployment topology

Aether ships as **two independent deployables** — see §1–§2 for the full runbook:

- **Web app (Next.js 16) → Vercel.** Import the repo with the Next.js preset (no
  `vercel.json` needed); set the §1 *Web app* env vars for Production + Preview.
  `main` → Vercel **Production**; `staging` / `development` → **Preview** deployments.
  Stripe webhooks are served by the Supabase `stripe-webhook` Edge Function
  (`STRIPE_WEBHOOK_HANDLER=supabase`).
- **Worker (Node + BullMQ) → container host, _not_ Vercel.** It's a long-lived process
  (no HTTP surface beyond a `:8080` health probe), so Vercel's serverless model can't
  run it. Deploy from the repo [`Dockerfile`](./Dockerfile) (or
  [`Procfile`](./Procfile): `worker: npm run worker:prod`) to Railway / Render / Fly /
  any container host, with the §1 *Worker* env vars. Horizontally scalable
  (leader-locked sweeps + BullMQ job dedup).

### Branch protection (requires repo admin)

Protection rules are **not yet applied** — the connected service account lacks admin on
the repo (and protection on a private repo needs GitHub Pro/Team/Enterprise). A repo
admin applies them once via [`scripts/setup-branch-protection.sh`](./scripts/setup-branch-protection.sh)
(or **Settings → Branches**). Target rules:

- **`main`**: PR required · 1+ approval · status checks `typecheck` / `lint` / `test` /
  `preflight` (strict / up-to-date) · no force-push · no deletion · admins included ·
  conversation resolution required.
- **`staging`**: PR required · 1+ approval · same status checks · no force-push.

Status and the exact admin steps live in [`GITHUB-SETUP.md`](./GITHUB-SETUP.md).

---

## 1. Environment variables

### Web app — required in production

Validated at build + startup by `lib/env.ts` (`validateEnv`). A missing var fails the build.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `STRIPE_SECRET_KEY` | Stripe Connect secret (server) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (public) |
| `NEXT_PUBLIC_APP_URL` | Canonical origin, e.g. `https://app.aether.example` — used by referral links, `robots.txt`, `sitemap.xml`, Sentry, metadata |
| `CRON_SECRET` | Bearer secret for internal cron/worker calls |

### Web app — recommended / optional

| Variable | Purpose |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Distributed cache, rate limiting, **feature-flag runtime overrides**. (Vercel KV aliases `KV_REST_API_URL` / `KV_REST_API_TOKEN` also work.) Absent → in-memory fallback. |
| `REDIS_REST_TIMEOUT_MS` | Per-command Redis REST timeout (default `1000`). |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (browser). |
| `SENTRY_DSN` | Sentry DSN (server + edge runtimes). |
| `SENTRY_TRACES_SAMPLE_RATE` | Performance trace sampling (e.g. `0.1`). |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Build-time source-map upload (CI only). |
| `FEATURE_ENABLE_REFERRALS` / `FEATURE_ENABLE_CHALLENGES` / `FEATURE_ENABLE_FIRST_CLIP_BONUS` | Deploy-time feature-flag overrides (`true`/`false`). See §5. |
| `XAI_API_KEY` / `XAI_MODEL` | Optional AI campaign-brief generation; defaults to `grok-4.3` when a key is present. |
| `STRIPE_WEBHOOK_HANDLER` | `supabase` (default, recommended) or `vercel` (legacy). Must be `supabase` in prod. |

### Worker (separate host)

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` | BullMQ connection (`redis://` / `rediss://`). |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | DB access for accrual/payouts. |
| `STRIPE_SECRET_KEY` | Real payouts. |
| `YOUTUBE_DATA_API_KEY` | Official YouTube Data API v3 statistics. |
| `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` | TikTok Login Kit credentials; creator OAuth rows with `video.list` scope are also required for TikTok direct polling. |
| `AYRSHARE_API_KEY` | Optional fallback/aggregator. At least one trusted view provider is required; the worker hard-fails without one. |

> **Secret placement:** `SUPABASE_SERVICE_ROLE_KEY` and `STRIPE_WEBHOOK_SECRET` belong in
> Supabase Edge Function secrets (the `stripe-webhook` function), **not** on Vercel, when
> `STRIPE_WEBHOOK_HANDLER=supabase` (the default). See `docs/SECRETS.md`.

---

## 2. Vercel deploy checklist

1. **Project**: import the repo; framework preset **Next.js**. Root = repo root.
2. **Environment variables**: add all of §1 (Web app) for **Production** + **Preview**.
   - `STRIPE_WEBHOOK_HANDLER=supabase` (the default, required on Vercel Production).
3. **Database**: production Supabase project `baiyjsjocwccmlopqyqy` is migrated through
   `20260604125713_function_search_path_hardening`. For future changes, run new SQL
   migrations in timestamp order, then deploy the `stripe-webhook` Edge Function with its secrets.
4. **Stripe**: point the webhook at the Supabase Edge Function URL
   (`<supabase-url>/functions/v1/stripe-webhook`); set `STRIPE_WEBHOOK_SECRET` in Supabase.
5. **Redis (Upstash)**: provision and set `UPSTASH_REDIS_REST_URL` / `_TOKEN` for the app,
   and a `REDIS_URL` for the worker host.
6. **Sentry**: set `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN`; add `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT`
   in CI for source maps.
7. **Worker**: deploy separately (Docker/Procfile) with the §1 worker vars. Scale to N
   instances — leader-locked sweeps + BullMQ job dedup make this safe.
8. **Verify** (see §4): hit `/api/health`, confirm `status: "ok"`, check `robots.txt` /
   `sitemap.xml`, and place a real test campaign + clip end-to-end on staging first.
9. **Promote** to Production.

Pre-promotion gate: `npm run typecheck`, `npm run lint`, `npm run test` all green.

---

## Worker deployment (Hetzner VPS)

The background worker is a long-lived process (it can't run on Vercel — see
"Deployment topology" above). It ships as a Docker image from the repo
[`Dockerfile`](./Dockerfile): multi-stage, non-root, `tini` PID 1 for clean
SIGTERM-driven graceful shutdown, and a health endpoint on `:8080`.

### Prerequisites
- A Hetzner Cloud VPS (CX22 is plenty for a single worker), Ubuntu LTS.
- Docker Engine + the Compose plugin installed.
- Redis — co-located via `docker-compose.yml`, or (preferred for prod) a managed
  Redis with `REDIS_URL` pointed at it.

### Required environment (see §1 "Worker" for the full list)
| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role (bypasses RLS) — server-side only |
| `AYRSHARE_API_KEY` | ✅ | Live view tracking; the worker hard-fails without it and never pays on unverified views |
| `REDIS_URL` | ▲ | BullMQ connection; defaults to `redis://localhost:6379` |
| `STRIPE_SECRET_KEY` | ▲ | Required for creator payouts / withdrawal reconciliation |
| `WORKER_HEALTH_PORT` | optional | Health port (default `8080`; `0` disables) |

### Deploy (Docker Compose — single VPS, co-located Redis)
```bash
ssh root@<your-hetzner-ip>
git clone https://github.com/VenenoGT3/Aether.git && cd Aether
git checkout main
cp .env.example .env        # then edit .env and fill the worker secrets above
docker compose up -d --build worker   # starts redis (dependency) + worker
docker compose logs -f worker         # watch startup; should report schedulers up
curl -s localhost:8080/health         # {"status":"ok", ...}
```

### Deploy (managed Redis, no co-located Redis)
Set `REDIS_URL` in `.env` to the managed instance and run only the worker:
```bash
docker build -t aether-worker .
docker run -d --name aether-worker --restart unless-stopped \
  --env-file .env -p 127.0.0.1:8080:8080 aether-worker
```

### Run as a systemd service (recommended for a VPS)
A ready-made unit and deploy script live in [`deploy/`](./deploy):

```bash
# one-time install (repo cloned to /opt/aether)
sudo cp /opt/aether/deploy/aether-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aether-worker
systemctl status aether-worker
journalctl -u aether-worker -f
```

The unit (`deploy/aether-worker.service`) runs `docker compose up` (worker + Redis)
in the foreground under systemd, with `Restart=always` and a 90s stop timeout so
in-flight BullMQ jobs drain on redeploy (`tini` forwards SIGTERM).

### Update / redeploy
Use the deploy script — it fast-forwards the repo, rebuilds, restarts (via systemd
if installed, else compose), and waits on the health endpoint:
```bash
cd /opt/aether && ./deploy/deploy-worker.sh main
```
Or manually: `git pull origin main && docker compose up -d --build worker`.

### Operations
- **Health:** `GET :8080/health` (liveness — ready + fresh heartbeat), `:8080/ready`
  (readiness). Returns `503` if the heartbeat goes stale (hung loop / dead Redis).
- **Logs:** `docker compose logs -f worker`; alert on lines tagged `[ALERT]`
  (money-integrity, fraud spikes, withdrawal/payout failures).
- **Scaling:** horizontally safe — fleet-wide audits use a Redis leader lock and
  view-sync uses BullMQ `jobId` dedup. Run multiple replicas sharing one Redis.
- **Security:** firewall to SSH only (`ufw allow OpenSSH`); do **not** expose
  `8080` (health) or `6379` (Redis) publicly — bind them to localhost as shown.
  Keep `.env` at `chmod 600`; the image already runs as a non-root user.

---

## 3. Supabase production state

Detailed audit and policy notes live in [`SUPABASE-AUDIT.md`](./SUPABASE-AUDIT.md)
and [`SUPABASE-SECURITY.md`](./SUPABASE-SECURITY.md).

Current verified state:

- `41` migrations applied and recorded remotely.
- `18` public tables, all with RLS enabled.
- No `PUBLIC` table/function grants.
- No `anon` table grants.
- Authenticated table grants are explicit and RLS-scoped.
- All current public RLS policies have database comments.
- Realtime is enabled only on `campaigns`, `messages`, `notifications`,
  `participations`, `posts`, and `transactions`.
- No Supabase Storage buckets are configured yet; portfolio/deliverable data is currently URL/metadata based.

Residual advisor items to plan, not emergency blockers:

- Move `vector` out of `public` only in a planned pgvector compatibility migration.
- Consider moving implementation `SECURITY DEFINER` functions into a private schema later.
- Optimize RLS policy expressions from `auth.uid()` to `(select auth.uid())` before high scale.

---

## 4. Monitoring & alerting

### Health endpoint — `GET /api/health`

Unauthenticated, never cached. Always returns **HTTP 200 while the process is alive**
(downstream issues are reported in the body, not the status code, so a still-serving
instance isn't evicted from rotation).

```json
{
  "status": "ok",            // "ok" | "degraded" ← alert on "degraded"
  "uptimeSec": 1234,
  "checks": {
    "redis": { "configured": true, "reachable": true },
    "circuitBreakers": { "redis": "closed" },
    "backpressure": { "campaigns-search": { "inFlight": 0, "max": 40 } }
  }
}
```

- **Uptime probe**: 200 = process alive. Point Vercel/uptime checks here.
- **Alert** when `status == "degraded"`, any circuit breaker is `open`, or
  `redis.reachable == false`.

### Sentry

- Errors + performance tracing wired for server, edge, and client runtimes
  (`sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`).
- Unexpected errors are captured via `reportError` / `toSafeError` (users only ever see
  safe messages — never raw Stripe/Supabase/Redis detail or stack traces).
- PII is scrubbed; spans cover DB/Redis/cache calls.
- **Recommended alerts:** new-issue spikes, and any log/event tagged `[ALERT]`
  (money-integrity, fraud, withdrawal failures — emitted from SQL `RAISE WARNING` and
  the worker/api loggers).

---

## 5. Feature flags (safe rollouts)

Flags resolve with precedence **remote (Upstash) → env → safe default**
(`lib/feature-flags.ts` + `lib/feature-flags.server.ts`). Current flags
(default **on**): `enable_referrals`, `enable_challenges`, `enable_first_clip_bonus`.

- **Deploy-time:** set `FEATURE_ENABLE_REFERRALS=false` (etc.) in Vercel env.
- **Instant runtime kill-switch (no redeploy):** set the Upstash key —
  `SET flags:enable_referrals false`. Picked up within ~30s (process cache TTL).
- The client reads `/api/flags` (`useFeatureFlags()`); the creator dashboard hides the
  referral card / weekly-challenge widget when their flag is off.

---

## 6. Operational notes

- **Production-only**: there is no mock/demo fallback. Every path uses real Supabase,
  Stripe, Redis, and trusted live view providers; missing required config fails clearly at build/startup.
- **Circuit breakers** (`lib/circuit-breaker.ts`): process-local, 5 failures → open 30s →
  half-open trial. Protect Redis, Stripe, and Supabase reads; fail-open with fallbacks.
  State is surfaced in `/api/health`.
- **Backpressure** (`lib/backpressure.ts`): per-instance concurrency limiter on heavy
  routes (discovery, clip submit/moderation). At capacity it sheds with a safe **503 +
  Retry-After** rather than queueing unboundedly. In-flight counts are in `/api/health`.
- **Timeouts & retries** (`lib/fetch-utils.ts`): outbound calls have per-attempt timeouts
  and exponential backoff + jitter; retries only on idempotent reads.
- **Rate limiting**: distributed (Upstash, fixed-window) with an in-memory fallback;
  fail-open so a Redis blip never locks users out.
- **Money safety**: earnings, payouts, budget thresholds, fraud, and bonuses run through
  atomic `SECURITY DEFINER` SQL functions (row locks / advisory locks, idempotent,
  server-authoritative amounts). Never bypass them from the app layer.
- **Worker scaling**: horizontally scalable — fleet-wide audits use a Redis leader lock and
  view-sync uses BullMQ `jobId` dedup. Graceful shutdown drains jobs on SIGTERM/SIGINT.

---

## 7. Load testing

k6 scripts in `tests/load/` (discovery spike, clip submission, health). Run against a
staging deployment first (never production):

```bash
npm run dev   # or point the scripts at a staging URL
npm run loadtest:health
npm run loadtest:discovery
npm run loadtest:clips
```
