# Merge notes — `fable` → `development`

Instructions for whoever (human or agent) merges this branch. Everything the
merge needs is listed here; nothing else is missing. **Work through the steps
in order, then delete this file as part of the merge.**

## What this branch is

Security/correctness fixes (P0–P4) and 7 improvements from the 2026-06-09
code review of `development`. 16 commits (`9b0acb6..bd4d442`): test-login
hardening, open-redirect fix, social-oauth revoke-at-link (no stored YouTube
tokens), escrow release unique index, middleware perf, view-sync starvation
fix, integer-cent money helpers, RSC dashboard shells, Playwright E2E,
worker alert webhook, beta-platform config, schema tooling, docs squash.

## 1. Pre-merge verification (all must pass)

```bash
npm run typecheck     # clean
npm run lint          # clean
npm run test          # 246 tests green
npm run test:e2e      # 4 pass, 1 self-skip (test-login creds absent locally)
npx next build        # compiles; dashboards are ƒ (Dynamic)
```

## 2. Required deploy steps (order matters)

These ship with the merge — the code assumes them:

1. **Database migrations** — `supabase db push` (or the migration pipeline).
   New on this branch:
   - `20260609220000_release_ledger_unique.sql` — dedupes then uniquely
     constrains succeeded escrow releases (one per participation).
   - `20260609230000_drop_stored_youtube_tokens.sql` — nulls legacy stored
     YouTube OAuth tokens (the flow no longer stores any).
   - `20260610090000_per_clip_payout_bounds.sql` — per-clip payout cap +
     qualification floor columns, record_clip_earning v3, and the funded
     campaign money-terms lock extended to the new columns.
   - `20260610130000_atomic_escrow_release.sql` — complete_escrow_release()
     RPC: ledger row + participation + campaign completion in one
     transaction (service-role only). releaseEscrowAction now requires it —
     deploy this migration BEFORE or WITH the app deploy.
2. **Edge function** — `supabase functions deploy social-oauth --no-verify-jwt`.
   Brings: revoke-at-link (no tokens stored), the `/disconnect` endpoint
   (upstream Google revocation), preview-origin gating, CORS fix.
   The app's disconnect route falls back to the old RPC until this deploys,
   so ordering with the Vercel deploy is not critical — but do both.

## 3. Secrets / env — what's needed and what is NOT

| Variable | Action |
| --- | --- |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | **Do NOT set — not needed.** YouTube links store no tokens. Only required if TikTok token-keeping polling is ever enabled (then: 32 bytes base64, same value on edge function + worker). |
| `SOCIAL_OAUTH_ALLOW_PREVIEW_ORIGINS` | Optional, QA only. Set `true` on the edge function ONLY if creators must link accounts from `*.vercel.app` preview deploys. Leave unset in production. |
| `ALERT_WEBHOOK_URL` | Optional, recommended. Slack-compatible webhook on the **worker host**; worker `[ALERT]` lines (stuck payouts, provider outages) get POSTed there. |
| `BETA_PLATFORMS` | Optional. Defaults to `youtube`; only set when expanding the beta. |
| `ENABLE_TEST_LOGIN` | No change needed. Note: test login is now **hard-blocked when `VERCEL_ENV=production`** regardless of this flag. |
| `NEXT_PUBLIC_PLATFORM_CURRENCY` | **Decision required.** The platform now defaults to **EUR** (EU-first). The current Stripe test account settles USD — set `NEXT_PUBLIC_PLATFORM_CURRENCY=usd` on Vercel (all scopes) AND the worker host until EUR settlement is enabled on Stripe, otherwise transfers/PaymentIntents will fail with a currency mismatch. |
| E2E CI secrets | Optional. The `e2e` workflow self-skips unless `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and ideally `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `CRON_SECRET`) exist as GitHub repo secrets. |

## 4. Behavior changes to be aware of (no action, just context)

- **HTTP security headers** now ship on every response (HSTS preload-eligible,
  nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy). If any
  page must ever be iframed, X-Frame-Options needs revisiting. A strict CSP is
  deliberately NOT included yet (needs nonce wiring) — tracked as follow-up.
- **Landing page is ISR** (revalidates every 5 min) with a cookie-free anon
  client — its stats were previously frozen at build time (always null in
  production) and are now live.
- **Dashboard realtime reloads are coalesced** (≤1 reload/10s per client from
  table-wide channels); the user's own actions still refresh immediately.
- **List queries are bounded** (campaigns 200, dashboard clips 500, creator
  clips 200, notifications 100, wallet ledger 500 most-recent). True
  pagination is a UI follow-up if any account legitimately exceeds these.

- Middleware no longer touches Supabase on public pages; auth pages check
  session only. Protected-path behavior is unchanged.
- Both dashboards are RSC shells now; first paint comes from the server, all
  realtime/refresh behavior is unchanged in the client components.
- Clip submission error copy is generated from `lib/beta.ts` platform labels.
- Worker view-sync only selects `approved` clips whose `quality_status` is
  also `approved` (starvation fix) — promotion behavior itself is unchanged.

## 5. Known open items intentionally NOT in this branch

- `account.updated` Stripe webhook still sets `profiles.onboarded = true` —
  product decision pending on whether Stripe onboarding should complete app
  onboarding.
- Email signup still uses the implicit flow (tokens in URL hash) — documented
  tradeoff until custom SMTP enables PKCE email templates.
- `SUPABASE_SERVICE_ROLE_KEY` is set on Vercel Production, which contradicts
  `docs/SECRETS.md` — either intentional (admin-client server actions) and the
  doc needs updating, or it should be removed from Vercel.
- `supabase/schema.sql` snapshot not yet generated — run
  `./scripts/dump-schema.sh` once on a machine with an authenticated Supabase
  CLI and commit it.
- Campaign builder UI inputs for the new per-clip cap/floor fields are a
  follow-up; the create API accepts and enforces them already.
- `docs/legal/program-terms-draft.md` is an engineering draft — requires
  legal counsel review before publication (checklist at the bottom).

## 6. After merging

Delete this file in the merge commit (or immediately after).
