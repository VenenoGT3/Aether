# Aether Security Review

**Last updated:** 2026-06-01  
**Scope:** Auth, RLS, API routes, webhooks, cron, secrets

## Summary

Aether is **secure by default** when `AETHER_MOCK_MODE` is not `true`. Mock mode intentionally relaxes auth and signature checks for local demos only.

| Area | Status | Notes |
|------|--------|-------|
| RLS | Hardened | Policies mirrored in `lib/rls-policies.ts` + property tests |
| API input validation | Hardened | Zod schemas on all `/api/*` POST routes |
| Rate limiting | Added | In-memory limiter on AI, metrics, webhooks |
| Webhook signatures | Enforced | Stripe `constructEvent` when not in mock mode |
| Cron auth | Enforced | `Authorization: Bearer CRON_SECRET` when not in mock mode |
| Service role key | Scoped | `lib/env.server.ts` + `createAdminClient()` — webhooks only |
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

| Secret | Location | Exposure |
|--------|----------|----------|
| `NEXT_PUBLIC_*` | Client bundle | Public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/env.server.ts` only | Server-only import |
| `STRIPE_WEBHOOK_SECRET` | `lib/env.server.ts` | Webhook handler |
| `CRON_SECRET` | Server env | Cron + internal metrics |
| `GEMINI_API_KEY`, `SOCIAVAULT_API_KEY` | `lib/env.server.ts` | API routes |

**Do not** import `lib/env.server.ts` from Client Components.

Production: set secrets in your host's secret manager (Vercel, etc.), never commit `.env.local`.

---

## API hardening

All POST API routes use `guardApiPost()`:

- **Zod** body validation with `400` + field errors
- **Rate limits** per route (see `lib/api/rate-limit.ts`)
- **Auth** via Supabase session (`requireApiAuth`) except mock mode demo bypass

| Route | Auth | Rate limit |
|-------|------|------------|
| `/api/ai/*` | Required (non-mock) | 20/min |
| `/api/ai/discover` | Required | 10/min (apply) |
| `/api/metrics/fetch` | Required + participation | 30/min |
| `/api/webhooks/stripe` | Stripe signature | 200/min |
| `/api/cron/metrics` | CRON_SECRET | N/A (GET) |

---

## Remaining risks & recommendations

1. **In-memory rate limiting** — Resets on cold start; not shared across instances. **Mitigation:** Use Upstash Redis / Vercel KV for production scale.

2. **Mock mode** — Trusts cookies and skips API auth. **Mitigation:** Never deploy with `AETHER_MOCK_MODE=true`.

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