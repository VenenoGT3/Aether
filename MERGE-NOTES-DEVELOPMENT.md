# Merge notes — `development` → `staging` / `main`

Instructions for whoever (human or agent) merges this branch. Everything the
merge needs is listed here. **Work through the steps in order, then delete
this file as part of the merge.**

## What this round adds

Beta-readiness fixes (2026-06-10):

- **Account deletion (GDPR Art. 17)** — `delete_own_account()` RPC (money-safe:
  refuses while earnings/payouts/campaigns/escrow are in flight), server action
  `lib/actions/account.ts`, and a danger-zone card on both settings pages.
- **Payment-released email wired** — `releaseEscrowAction` now sends the
  Resend payout email best-effort; `lib/resend.ts` is `server-only` and reads
  `RESEND_FROM` / `NEXT_PUBLIC_APP_URL` instead of hardcoded sender/links.
- **Weekly-challenge + referral widgets mounted** on the creator dashboard,
  gated server-side on `enable_challenges` / `enable_referrals`.
- **Preflight loads `.env.local`** locally (mirrors Next dev), so
  `npm run preflight` is meaningful on dev machines; CI/hosts unaffected.

## 1. Pre-merge verification (all must pass)

```bash
npm run typecheck     # clean
npm run lint          # clean
npm run test          # green
npm run lint:dead     # knip — no new dead files
npx next build        # compiles
npm run test:e2e      # 4 pass, 1 self-skip without test-login creds
```

## 2. Required deploy steps

1. **Database migration** — `supabase db push` (or the migration pipeline).
   New on this branch:
   - `20260610150000_account_deletion.sql` — `delete_own_account()`
     SECURITY DEFINER RPC (granted to `authenticated` only; deletes the
     caller's `auth.users` row and cascades).
   - **Verify on staging before prod**: sign in as a throwaway user and run
     `select public.delete_own_account();` — confirms the `postgres`-owned
     function may delete from `auth.users` on this project.
2. **Env (web app, optional)** — set `RESEND_API_KEY` (and `RESEND_FROM` to a
   sender on the Resend-verified domain) on Vercel for the payout email.
   Without it the release flow still works and just logs the skipped send.

## 3. Post-deploy smoke

- Settings → Delete account on a throwaway creator: blocked while earnings
  are pending; succeeds (and signs out) once clear.
- Creator dashboard shows the Weekly Challenge + Refer-a-Friend cards (flip
  `flags:enable_challenges` / `flags:enable_referrals` in Upstash to hide).
- Release a fixed-fee escrow on staging: creator receives the payout email.
