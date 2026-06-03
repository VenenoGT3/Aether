# Aether — Deploy & Launch Checklist

Run through this before every production deploy. Companion to
[`PRODUCTION-README.md`](./PRODUCTION-README.md) (env vars, ops detail) and
[`SETUP.md`](./SETUP.md). Tick each box; stop on any failure.

---

## 1. Code quality (local / CI — must all pass)

- [ ] `npm run typecheck` — no TypeScript errors
- [ ] `npm run lint` — no new lint errors on changed files
- [ ] `npm run test` — full unit/resilience suite green (currently **215** tests)
- [ ] `npm run test:chaos` — chaos scenarios pass (fail-open, breaker, backpressure)
- [ ] `git status` clean / intended changes only; on the right branch

## 2. Configuration

- [ ] `.env.example` reviewed; all new vars documented
- [ ] Production env set in **Vercel** (Production + Preview) — see `PRODUCTION-README.md` §1
  - [ ] `AETHER_MOCK_MODE=false` (Production) — build refuses `true`
  - [ ] `STRIPE_WEBHOOK_HANDLER=supabase`
  - [ ] `NEXT_PUBLIC_APP_URL` = canonical production origin
- [ ] Worker host env set (`REDIS_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `AYRSHARE_API_KEY`)
- [ ] **Preflight passes in the target env:** `npm run preflight`
  - Hard-fails on missing required vars / unsafe prod config
  - Verifies Redis reachability, Sentry DSN, and feature-flag state
  - In CI: `vercel env pull .env.production.local` then run preflight against it

## 3. Database & payments

- [ ] All `supabase/migrations/*` applied to the production project (in timestamp order)
- [ ] `stripe-webhook` Edge Function deployed with `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` secrets
- [ ] Stripe webhook endpoint points at the Supabase Edge Function URL and is receiving events
- [ ] Stripe Connect enabled; a test brand can fund and a test creator can withdraw (staging)

## 4. Monitoring & alerting

- [ ] Sentry DSNs set (`SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`); a test event appears in Sentry
- [ ] Source maps uploading in CI (`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`)
- [ ] Uptime probe configured against `GET /api/health` (alert when `status: "degraded"`)
- [ ] Alerting wired for `[ALERT]` log lines (money integrity, fraud, withdrawal failures)

## 5. Performance / load

- [ ] Load tests run against staging (mock or seeded): `npm run loadtest:health|discovery|clips`
- [ ] Discovery 10x spike absorbed (cache + backpressure); p95 within target; **zero 5xx**
- [ ] Clip-submit sheds gracefully (429/503) under burst — no server errors

## 6. Feature flags (rollout plan)

- [ ] Confirm flag state for launch: `enable_referrals`, `enable_challenges`, `enable_first_clip_bonus`
- [ ] Dark-launch via env (`FEATURE_*`) or runtime via Upstash (`SET flags:<name> false`)
- [ ] Verify `GET /api/flags` returns the intended state
- [ ] Kill-switch rehearsed (toggle a flag, confirm UI updates within ~30s)

## 7. Worker

- [ ] Worker deployed (Docker/Procfile) and healthy (`WORKER_HEALTH_PORT` probe or logs)
- [ ] Scaled to N instances if needed (leader-locked sweeps + BullMQ dedup make this safe)
- [ ] Real-money guard understood: real mode without `AYRSHARE_API_KEY` blocks earnings/payouts

## 8. Smoke test (production, low-risk)

- [ ] Landing page, `/auth/signup`, `/auth/login` load
- [ ] Sign up a creator → onboarding welcome → wizard → dashboard (no `/influencer/...` 404s)
- [ ] Sign up / log in a brand → `/business/dashboard` → "New Campaign" flow
- [ ] `GET /api/health` → `200` `status: "ok"`
- [ ] `/robots.txt` and `/sitemap.xml` render with the production origin
- [ ] A 404 URL shows the branded not-found page
- [ ] GDPR banner shows once; `/privacy` save + withdraw works

## 9. Go-live & rollback

- [ ] Promote the Vercel deployment to Production
- [ ] Watch Sentry + `/api/health` for the first ~15 min
- [ ] **Rollback ready:** Vercel → Instant Rollback to the previous deployment; flip risky
      feature flags off via Upstash without a redeploy

---

### Quick command reference

```bash
npm run typecheck && npm run lint && npm run test   # gate
npm run preflight                                   # config validation (target env)
curl -s https://<prod-host>/api/health | jq         # health probe
curl -s https://<prod-host>/api/flags | jq          # flag state
```
