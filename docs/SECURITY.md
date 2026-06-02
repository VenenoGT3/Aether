# Aether Security Review

**Last updated:** 2026-06-02  
**Scope:** Auth, RLS, API routes, webhooks, cron, secrets, worker

## Summary

Aether is **secure by default** when `AETHER_MOCK_MODE` is not `true`. Mock mode intentionally relaxes auth and signature checks for local demos only.

| Area | Status | Notes |
|------|--------|-------|
| RLS | Hardened | Policies mirrored in `lib/rls-policies.ts` + property tests |
| API input validation | Hardened | Zod schemas on all `/api/*` POST routes |
| Rate limiting | Added | In-memory limiter on AI, metrics, webhooks |
| Webhook signatures | Enforced | Stripe `constructEvent` when not in mock mode |
| Cron auth | Enforced | `Authorization: Bearer CRON_SECRET` when not in mock mode |
| Service role key | Scoped | Supabase Edge Function + standalone worker; `createAdminClient()` only for the legacy `vercel` handler — never in the Vercel app runtime |
| Metrics API | Fixed | Requires auth + participation access (or cron bearer) |

---

## Trust boundaries

```
Browser (anon key + user JWT)
  → Supabase RLS enforces row access
  → Server Actions use authenticated SSR client

API routes (/api/*)
  → Zod validation + rate limits
  → requireApiAuth() except cron-internal metrics calls
  → No service role in user-facing routes

Stripe webhooks
  → Signature verification
  → createAdminClient() bypasses RLS (system actor)

Cron (/api/cron/metrics)
  → CRON_SECRET bearer required (non-mock)
  → Calls metrics with same secret (internal)

Worker (standalone Node process — not Vercel)
  → Supabase service role (bypasses RLS; no user JWT in a background job)
  → Atomic SQL RPCs for earnings/payouts; idempotent Stripe transfers
  → Not internet-facing
```

---

## Row Level Security

Canonical policies live in `supabase/migrations/`. Highlights:

- **`users`:** SELECT own row only (`20260525000000_harden_security.sql`)
- **`profiles`:** UPDATE where `auth.uid() = user_id`
- **`campaigns`:** Drafts hidden from non-owners
- **`participations`:** Readable by influencer or campaign business
- **`posts`:** Trigger `check_post_update` blocks self-approval
- **`transactions`:** Read via participation or `user_id`; payout insert owner-only

**Tests:** `lib/__tests__/rls-policies.test.ts`, `lib/__tests__/rls-properties.test.ts`, `lib/__tests__/rls-violations.test.ts`

**Full permission matrix:** [PERMISSIONS.md](./PERMISSIONS.md)

---

## Secrets management

See **[SECRETS.md](./SECRETS.md)** for the full Vercel + Supabase matrix.

| Secret | Location | Exposure |
|--------|----------|----------|
| `NEXT_PUBLIC_*` | Client bundle | Public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function (default) + worker process | Never in the Vercel app runtime |
| `STRIPE_WEBHOOK_SECRET` | Supabase Edge (default) | Webhook verification; Vercel only if legacy handler |
| `CRON_SECRET` | Vercel server | Cron + internal metrics |
| `GEMINI_API_KEY`, `SOCIAVAULT_API_KEY` | `lib/env.server.ts` | API routes |

**Do not** import `lib/env.server.ts` from Client Components.

---

## API hardening

See `lib/api/README.md`. All routes use Zod + rate limits + friendly `400` errors (`error`, `fields`).

| Route | Auth | Rate limit |
|-------|------|------------|
| `POST /api/campaigns/[id]/apply` | Influencer | 5/min user + 12/min IP; 20/day server cap |
| `POST /api/participations/[id]/posts` | Influencer | 8/min user + 20/min IP |
| `GET /api/campaigns/search` | Signed-in | 60/min user + 100/min IP |
| `POST /api/ai/*` | Role-specific | 15–20/min user + 30–45/min IP |
| `POST /api/metrics/fetch` | Signed-in or cron bearer | 25/min user + 60/min IP |
| `/api/webhooks/stripe` | Stripe signature | 200/min |
| `/api/cron/metrics` | CRON_SECRET | 10/min |

All routes use Zod validation, honeypot (`_hp`), JSON size limits, and friendly `{ error, fields }` responses. See `lib/api/README.md`.

---

## Remaining risks & recommendations

1. **In-memory rate limiting** — Resets on cold start; not shared across instances. **Mitigation:** Use Upstash Redis / Vercel KV for production scale.

2. **Mock mode** — Trusts cookies and skips API auth. **Mitigation:** `validateProductionSafety()` fails Vercel Production deploys if `AETHER_MOCK_MODE=true`.

3. **Service role on webhooks** — Bypasses RLS by design. **Mitigation:** Stripe signature verification; monitor webhook logs.

4. **AI routes** — Prompt injection via user-supplied text. **Mitigation:** Input length caps in Zod; consider output filtering.

5. **SociaVault scraping** — External dependency; URLs are user-controlled. **Mitigation:** URL validation, rate limits, auth gate.

6. **No CSRF tokens on API** — Same-site cookies + JSON POST; consider CSRF for cookie-auth forms if adding non-API mutations.

7. **Gemini API key in query string** — Third-party request logs may capture key. **Mitigation:** Move to header-based API when Gemini supports it.

---

## Verification checklist

```bash
AETHER_MOCK_MODE=true npm test    # unit + RLS property tests
AETHER_MOCK_MODE=true npm run build
```

For production smoke test, set all vars from `.env.example` with `AETHER_MOCK_MODE=false` and confirm build fails if any are missing.