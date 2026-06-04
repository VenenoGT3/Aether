# Supabase Audit - Aether

Generated: 2026-06-04 12:57 UTC / 14:57 Europe/Madrid  
Project ref: `baiyjsjocwccmlopqyqy`  
Environment: production Supabase project linked from this repo

## Executive Summary

- Local and remote migrations are aligned through `20260604125713_function_search_path_hardening`.
- `41` migrations are recorded in `supabase_migrations.schema_migrations`.
- Public schema has `18` tables; all `18` have RLS enabled.
- `PUBLIC` table grants: `0`.
- `PUBLIC` function grants: `0`.
- `anon` table grants: `0`.
- RLS policies: `38`; all `38` have database comments.
- Realtime is enabled only for `campaigns`, `messages`, `notifications`, `participations`, `posts`, and `transactions`.
- Storage buckets: `0`. The current app stores portfolio items as profile metadata/URLs and does not use Supabase Storage uploads yet.

## Applied Migrations

All repo migrations were applied in timestamp order. Two local migrations had to be patched before applying because Postgres rejected assigning two composite row values into two row variables in a single `INTO` list:

- `20260603050000_clip_approval_hardening.sql`
- `20260603090000_clip_fraud_override_rpc.sql`

Additional production hardening migrations applied:

- `20260604124753_production_security_realtime_hardening.sql`
- `20260604125713_function_search_path_hardening.sql`

## Public Tables

| Table | RLS | Policies | Notes |
| --- | --- | ---: | --- |
| `campaigns` | enabled | 4 | Campaign ownership, discovery, budget and funding surface. |
| `challenge_claims` | enabled | 1 | Creator reward claim read model. |
| `clip_fraud_events` | enabled | 0 | Internal service-role fraud event log; no client policies by design. |
| `clips` | enabled | 3 | Creator submission and brand moderation surface. |
| `earnings` | enabled | 1 | Money table; read-only to creator or campaign owner. |
| `messages` | enabled | 3 | Campaign participation chat; realtime enabled. |
| `notifications` | enabled | 4 | Own-user notification center; realtime enabled. |
| `participations` | enabled | 5 | Creator/campaign join state; money-adjacent. |
| `payouts` | enabled | 1 | Money table; creator read-only, writes via RPCs. |
| `platform_revenue` | enabled | 0 | Internal service-role platform ledger; no client policies by design. |
| `platform_transactions` | enabled | 1 | Business-visible platform fee rows. |
| `posts` | enabled | 4 | Deliverable submissions; realtime enabled. |
| `profiles` | enabled | 3 | User profile and creator portfolio metadata. |
| `ratings` | enabled | 2 | Counterparty campaign ratings. |
| `referrals` | enabled | 1 | Referral ledger, owner/referee read-only. |
| `transactions` | enabled | 2 | Money table; wallet-style transaction ledger. |
| `users` | enabled | 2 | Own-user record. |
| `view_snapshots` | enabled | 1 | Clip view history visible to creator or campaign owner. |

## Policy Inventory

| Table | Action | Role | Policy |
| --- | --- | --- | --- |
| `campaigns` | `INSERT` | `authenticated` | `Allow business insertion of campaigns` |
| `campaigns` | `DELETE` | `authenticated` | `Allow businesses to delete their own campaigns` |
| `campaigns` | `UPDATE` | `authenticated` | `Allow businesses to update their own campaigns` |
| `campaigns` | `SELECT` | `authenticated` | `Allow read access to campaigns` |
| `challenge_claims` | `SELECT` | `authenticated` | `read own challenge claims` |
| `clips` | `UPDATE` | `authenticated` | `Brand moderates clip` |
| `clips` | `INSERT` | `authenticated` | `Creator submits clip` |
| `clips` | `SELECT` | `authenticated` | `Read clips` |
| `earnings` | `SELECT` | `authenticated` | `Read earnings` |
| `messages` | `INSERT` | `authenticated` | `Allow insert access to messages in participations` |
| `messages` | `SELECT` | `authenticated` | `Allow read access to messages in participations` |
| `messages` | `UPDATE` | `authenticated` | `Allow update access to messages in participations` |
| `notifications` | `DELETE` | `authenticated` | `Allow deletion of own notifications` |
| `notifications` | `INSERT` | `authenticated` | `Allow insert notifications for campaign counterparties` |
| `notifications` | `SELECT` | `authenticated` | `Allow read access to own notifications` |
| `notifications` | `UPDATE` | `authenticated` | `Allow update access to own notifications` |
| `participations` | `INSERT` | `authenticated` | `Allow influencer application` |
| `participations` | `DELETE` | `authenticated` | `Allow influencer deletion of applied participations` |
| `participations` | `SELECT` | `authenticated` | `Allow read access to participations` |
| `participations` | `UPDATE` | `authenticated` | `Allow update access to participations` |
| `participations` | `INSERT` | `authenticated` | `Creators self-join performance campaigns` |
| `payouts` | `SELECT` | `authenticated` | `Read payouts` |
| `platform_transactions` | `SELECT` | `authenticated` | `Read own platform fees` |
| `posts` | `DELETE` | `authenticated` | `Allow influencer deletion of posts` |
| `posts` | `INSERT` | `authenticated` | `Allow influencer submission of posts` |
| `posts` | `SELECT` | `authenticated` | `Allow read access to posts` |
| `posts` | `UPDATE` | `authenticated` | `Allow update access to posts` |
| `profiles` | `SELECT` | `authenticated` | `Allow scoped read access to profiles` |
| `profiles` | `INSERT` | `authenticated` | `Allow users to insert their own profile` |
| `profiles` | `UPDATE` | `authenticated` | `Allow users to update their own profile` |
| `ratings` | `INSERT` | `authenticated` | `Allow insertion of ratings by campaign participants` |
| `ratings` | `SELECT` | `authenticated` | `Allow read access to campaign ratings` |
| `referrals` | `SELECT` | `authenticated` | `read own referrals` |
| `transactions` | `SELECT` | `authenticated` | `Allow read access to transactions` |
| `transactions` | `INSERT` | `authenticated` | `Allow transaction insertion` |
| `users` | `SELECT` | `authenticated` | `Allow users to read their own user record` |
| `users` | `UPDATE` | `authenticated` | `Allow users to update their own user record` |
| `view_snapshots` | `SELECT` | `authenticated` | `Read view snapshots` |

## Grants And Access

The production hardening migration revoked inherited broad permissions and restored explicit grants:

- `PUBLIC` has no table or function grants in `public`.
- `anon` has schema `USAGE` only and no table grants.
- `authenticated` has explicit operation grants matching the policy surface.
- `service_role` has full table/function access for server-side jobs and Edge Functions.

App-facing authenticated RPCs intentionally remain executable:

- Clip moderation/fraud: `approve_clip`, `reject_clip`, `request_changes_clip`, `disqualify_clip`, `override_clip_fraud`
- Withdrawals: `request_withdrawal`, `settle_withdrawal`, `fail_withdrawal`
- Rewards: `attach_referral`, `claim_referral_bonus`, `claim_weekly_challenge`, `claim_first_clip_bonus`
- Policy helper functions: `owns_campaign`, `is_active_creator`

## Money-Sensitive Tables

There is no `wallets` table in the current schema. Wallet-like state is represented by `transactions`, `earnings`, `payouts`, `platform_transactions`, and `platform_revenue`.

Money movement is constrained through RLS plus server-authoritative RPCs:

- Creators can read their own `earnings` and `payouts`.
- Businesses can read fee rows in `platform_transactions` for their own funded campaigns.
- Withdrawal claim/settlement/failure flows go through `request_withdrawal`, `settle_withdrawal`, and `fail_withdrawal`.
- Clip earning accrual, payout creation, payout settlement, platform bonuses, and campaign budget reconciliation are service-role/SQL-controlled.

## Indexes

High-traffic key columns from the audit (`user_id`, `creator_id`, `business_id`, `campaign_id`, `participation_id`, `clip_id`, `status`, and timestamp fields) have index coverage.

The performance advisor reported missing foreign-key indexes; these were added:

- `idx_clips_quality_reviewed_by`
- `idx_clips_reviewed_by`
- `idx_earnings_participation_id`
- `idx_messages_sender_id`
- `idx_ratings_reviewer_id`

## Realtime

Realtime publication tables after hardening:

- `campaigns`
- `messages`
- `notifications`
- `participations`
- `posts`
- `transactions`

These correspond to actual app subscriptions in the campaign chat, notification center, business dashboard, campaign list, and metrics modules.

## Storage

No Supabase Storage buckets currently exist. This matches the current code path: portfolio items are URL metadata in `profiles`, and campaign deliverables are stored as post/clip URLs rather than uploaded binary objects.

If native uploads are added, create a private bucket such as `portfolio-uploads` with owner-only object policies and signed URL reads rather than making it public.

## Advisor Results

Security advisor remaining items after hardening:

- `clip_fraud_events` and `platform_revenue` have RLS enabled with no policies. This is intentional: they are internal service-role tables.
- `vector` extension is installed in `public`. Moving pgvector to a private/extensions schema is a future compatibility migration, not a quick production change.
- Authenticated users can execute selected `SECURITY DEFINER` RPCs. This is intentional for current app flows, but a future stricter design should move privileged implementation functions out of the exposed `public` API schema and expose a smaller RPC facade.

Performance advisor remaining items:

- Many RLS policies call `auth.uid()` directly. For scale, rewrite to `(select auth.uid())` where applicable.
- `participations` has two permissive `INSERT` policies. Merge them later to reduce policy evaluation cost.
- Unused-index notices on a fresh/low-traffic production database were not acted on; they need real query stats before removing indexes.
