# Secret management — Vercel + Supabase + Worker

**Last updated:** 2026-06-02

Aether splits secrets by **runtime** so the Supabase service role never ships in the main Vercel app by default.

---

## Principle

| Runtime | Holds | Never holds |
|---------|--------|-------------|
| **Browser** | `NEXT_PUBLIC_*` only | Any secret key |
| **Vercel (Next.js)** | Stripe server key, cron secret, optional AI/email keys | Service role (default) |
| **Supabase Edge Functions** | Service role (auto), Stripe webhook secrets | — |
| **Worker** (standalone Node process) | Service role, Stripe server key, Redis URL, Ayrshare key | Public/browser exposure — it is a backend job, not internet-facing |

Production-only: there is no mock/demo fallback. Missing required config fails clearly at build/startup.

---

## Vercel environment variables

Set in **Project → Settings → Environment Variables**. Mark sensitive values as **Sensitive** (hidden in UI/logs).

### Production (required)

| Variable | Sensitive | Scope |
|----------|-----------|--------|
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
| `XAI_API_KEY` | Yes |
| `RESEND_API_KEY` | Yes |
| `SOCIAVAULT_API_KEY` | Yes |

### Do **not** set on Vercel (default)

| Variable | Where instead |
|----------|----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function runtime **and** the standalone worker process (see [Worker](#worker-standalone-process)) |

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

## Worker (standalone process)

The view-sync / earnings / payout worker (`npm run worker`, code in `worker/`) runs as a **standalone Node process**, separate from the Next.js app and Vercel. It reads `process.env` directly (via `worker/env.ts`) and is the one place **outside** Supabase Edge Functions that legitimately uses the **service role**.

| Secret | Why the worker needs it |
|--------|--------------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Writes `view_snapshots` / `earnings` and runs payout RPCs, bypassing RLS (a background job has no user JWT) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `STRIPE_SECRET_KEY` | Creator transfers for payouts |
| `REDIS_URL` | BullMQ queues + scheduler |
| `AYRSHARE_API_KEY` | **Required** — live view tracking; the worker hard-fails at startup without it |

**Rules:**

1. Store `SUPABASE_SERVICE_ROLE_KEY` **only where the worker runs** (its host's secret store). Never put it in the Next.js / Vercel app runtime, never prefix it `NEXT_PUBLIC_*`, and never let it reach the browser bundle.
2. The worker must **not** be deployed into the Vercel app runtime. Run it on a host that can hold the service role securely (a small VM, container, Railway / Render / Fly, etc.).
3. `worker/env.ts` deliberately avoids importing the app's `server-only` modules (`lib/env.server.ts`, `lib/supabase/admin.ts`) so the runtime boundary stays explicit.
4. The worker talks to a **real** Supabase project, so it always needs the service role and URL there.

---

## Validation (fail-fast)

| When | What runs |
|------|-----------|
| `next build` | `validateEnv()` in `next.config.ts` |
| Server start | `instrumentation.ts` → `validateEnv()` |

Rules:

1. All vars from `getRequiredEnvVarNames()` must be set — there is no mock/demo fallback.
2. `STRIPE_WEBHOOK_HANDLER=vercel` is **rejected** when `VERCEL_ENV=production` (Vercel Production deploys only).
3. `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are required on Vercel only if `STRIPE_WEBHOOK_HANDLER=vercel` (local legacy).

---

## Code boundaries

| Module | Import from |
|--------|-------------|
| `lib/env.ts` | Anywhere (client-safe flags + public URLs) |
| `lib/env.server.ts` | Server only (`import "server-only"`) |
| `lib/supabase/admin.ts` | Webhook legacy path only |
| `worker/env.ts` | Worker process only (standalone Node; reads `process.env`, uses the service role) |

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
