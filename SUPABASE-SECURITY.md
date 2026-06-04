# Supabase Security

Production project: `baiyjsjocwccmlopqyqy`

This document summarizes the current security posture after applying all migrations through `20260604125713_function_search_path_hardening`.

## Baseline

- RLS is enabled on every table in the exposed `public` schema.
- `PUBLIC` table and function grants are revoked.
- `anon` has no table grants.
- `authenticated` has explicit table grants only for operations covered by RLS policies.
- `service_role` is reserved for Supabase Edge Functions, workers, and trusted server-side jobs.
- Every current RLS policy has a database comment describing its purpose.
- Function `search_path` is pinned to `public` for the helper functions flagged by the Supabase security advisor.

## RLS Model

The default access rule is ownership or campaign counterparty access:

- Own-user data uses `auth.uid() = user_id` or `auth.uid() = id`.
- Creator-owned rows use `creator_id` / `influencer_id`.
- Business-owned campaign rows use `business_id`.
- Counterparty access is resolved through `campaigns` and `participations`.
- Internal tables such as `clip_fraud_events` and `platform_revenue` intentionally have RLS enabled with no client policies.

## Money Flows

Money-related writes should not be implemented as direct client table updates.

Current controlled paths:

- `transactions`: authenticated insert is limited by RLS to eligible campaign/business flows.
- `earnings`: readable to creator or campaign owner; writes are function/worker controlled.
- `payouts`: readable to creator; claim/settlement/failure go through RPCs.
- `platform_transactions`: readable to the owning business.
- `platform_revenue`: internal service-role table, no client policies.

Privileged RPCs:

- `request_withdrawal`
- `settle_withdrawal`
- `fail_withdrawal`
- `approve_clip`
- `reject_clip`
- `request_changes_clip`
- `disqualify_clip`
- `override_clip_fraud`
- `claim_first_clip_bonus`
- `claim_referral_bonus`
- `claim_weekly_challenge`
- `attach_referral`

These are intentionally `SECURITY DEFINER` because they perform locked, server-authoritative transitions. Keep ownership/auth checks inside the function body when adding any new RPC.

## Realtime

Realtime is enabled only for tables used by the app:

- `campaigns`
- `messages`
- `notifications`
- `participations`
- `posts`
- `transactions`

Do not add money or audit tables to realtime without checking RLS, payload shape, and whether old-row data could leak.

## Storage

There are currently no Supabase Storage buckets. The app uses URLs/metadata for portfolio and deliverables.

If upload storage is added:

- Create private buckets by default.
- Use owner-scoped object paths, for example `{auth.uid()}/...`.
- Add storage RLS policies for `storage.objects`.
- Use signed URLs for reads unless the asset is intentionally public.

## Remaining Hardening Work

Security advisor residual warnings:

- `vector` is installed in `public`. Moving pgvector to a dedicated extension schema should be planned carefully because it can affect vector types, indexes, and generated SQL.
- Authenticated users can execute selected `SECURITY DEFINER` RPCs. This is intentional now; the stricter future model is to move implementation functions to a private schema and expose only a minimal public facade.
- `clip_fraud_events` and `platform_revenue` have RLS but no policies. This is intentionally closed to clients.

Performance advisor residual warnings:

- Rewrite RLS policies from `auth.uid()` to `(select auth.uid())` where applicable.
- Merge the two `participations` `INSERT` policies into one policy.
- Review unused indexes only after production has meaningful query stats.
