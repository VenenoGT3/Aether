# Secret management — Vercel + Supabase

**Last updated:** 2026-06-01

Aether splits secrets by **runtime** so the Supabase service role never ships in the main Vercel app by default.

---

## Principle

| Runtime | Holds | Never holds |
|---------|--------|-------------|
| **Browser** | `NEXT_PUBLIC_*` only | Any secret key |
| **Vercel (Next.js)** | Stripe server key, cron secret, optional AI/email keys | Service role (default) |
| **Supabase Edge Functions** | Service role (auto), Stripe webhook secrets | — |

Mock mode (`AETHER_MOCK_MODE=true`) skips validation and uses placeholders.

---

## Vercel environment variables

Set in **Project → Settings → Environment Variables**. Mark sensitive values as **Sensitive** (hidden in UI/logs).

### Production (required)

| Variable | Sensitive | Scope |
|----------|-----------|--------|
| `AETHER_MOCK_MODE` | No | `false` in Production |
| `STRIPE_WEBHOOK_HANDLER` | No | `supabase` (default) |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Production, Preview |
| `STRIPE_SECRET_KEY` | **Yes** | Production |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | No | Production, Preview |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | Supabase Edge Function only (default handler) |
| `NEXT_PUBLIC_APP_URL` | No | Production |
| `CRON_SECRET` | **Yes** | Production |

### Optional (server)

| Variable | Sensitive |
|----------|-----------|
| `GEMINI_API_KEY` | Yes |
| `RESEND_API_KEY` | Yes |
| `SOCIAVAULT_API_KEY` | Yes |

### Do **not** set on Vercel (default)

| Variable | Where instead |
|----------|----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function runtime only |

Exception: `STRIPE_WEBHOOK_HANDLER=vercel` for legacy local testing — then add service role to `.env.local` only, never Production Vercel.

---

## Supabase secrets

### Edge Function: `stripe-webhook`

**Dashboard → Edge Functions → stripe-webhook → Secrets:**

| Secret | Value |
|--------|--------|
| `STRIPE_SECRET_KEY` | Same as Vercel |
| `STRIPE_WEBHOOK_SECRET` | Same signing secret as Stripe Dashboard |

Supabase injects automatically:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Deploy

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

`--no-verify-jwt` is required: Stripe calls the function without a Supabase user JWT.

### Stripe endpoint URL

```
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Do **not** point production Stripe webhooks at `/api/webhooks/stripe` on Vercel when `STRIPE_WEBHOOK_HANDLER=supabase`.

---

## Validation (fail-fast)

| When | What runs |
|------|-----------|
| `next build` | `validateEnv()` in `next.config.ts` |
| Server start | `instrumentation.ts` → `validateEnv()` |

Rules:

1. `AETHER_MOCK_MODE` must be exactly `true` to enable mock mode (not inferred from missing keys).
2. `AETHER_MOCK_MODE=true` and `STRIPE_WEBHOOK_HANDLER=vercel` are **rejected** when `VERCEL_ENV=production` (Vercel Production deploys only; local `next build` with mock mode still works).
3. When mock is off, all vars from `getRequiredEnvVarNames()` must be set.
4. `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are required on Vercel only if `STRIPE_WEBHOOK_HANDLER=vercel` (local legacy).

---

## Code boundaries

| Module | Import from |
|--------|-------------|
| `lib/env.ts` | Anywhere (client-safe flags + public URLs) |
| `lib/env.server.ts` | Server only (`import "server-only"`) |
| `lib/supabase/admin.ts` | Webhook legacy path only |

---

## Rotation checklist

1. Rotate key in Stripe / Supabase dashboard.
2. Update Vercel **and** Supabase Edge secrets if shared (e.g. `STRIPE_WEBHOOK_SECRET`).
3. Redeploy Vercel + `supabase functions deploy stripe-webhook`.
4. Revoke old key after traffic is clean.

---

## Related

- [README § Secret handling](../README.md#secret-handling)
- [SECURITY.md](./SECURITY.md)
- [PERMISSIONS.md](./PERMISSIONS.md)