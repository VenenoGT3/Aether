# Prototype Port Backend Audit

Source prototypes:

- `VenenoGT3/Fronted-Aether`: creator-facing Vite prototype (`CreatorHub`).
- `VenenoGT3/Frontend-Business`: brand/business-facing Vite prototype.

Production target:

- `VenenoGT3/Aether`: Next.js 16 App Router, Supabase, Stripe, standalone worker.

## Summary

Both prototype repos are useful as UI/flow references, but neither is production
source of truth. They use hardcoded mock data and local React state. The real
backend workflows already live in this repo and should be kept here.

The correct porting strategy is to rebuild prototype screens against production
data contracts, not copy Vite components wholesale.

## Workflow Coverage

| Prototype workflow | Current production status | Notes |
| --- | --- | --- |
| Business dashboard | Partially backed | Existing page reads real campaigns/metrics, but still assembles dashboard data in a client component and keeps some rich queue data in `localStorage`. |
| Business campaign list | Backed | Reads real business-owned campaigns and updates status through Supabase helpers. |
| Business campaign wizard | Backed | Creates campaigns, supports performance campaigns, category metadata, AI brief generation, and Stripe pool funding. UI can be redesigned later. |
| Business campaign insights | Partially backed | Existing moderation/metrics pages expose most raw data, but there was no single typed server contract for insights cards/tables. |
| Business clip moderation | Backed | Uses API routes + RPCs for approve/reject/request changes/disqualify/fraud override. |
| Creator dashboard | Partially backed | Reads profile, transactions, posts, clips, earnings, and wallet data, but mostly from client hooks. |
| Creator campaign discovery | Backed | Uses `/api/campaigns/search`, AI ranking, apply/join flows, and Supabase participation state. |
| Creator applies to fixed campaign | Backed | `/api/campaigns/[campaignId]/apply` validates auth, limits, budget, status, and duplicate applications. |
| Creator joins performance campaign | Backed | `/api/campaigns/[campaignId]/join` creates active participation after onboarding check. |
| Creator submits YouTube/TikTok clip URL | Backed | `/api/clips` validates membership, campaign budget state, platform, duplicate usage, and stores official provider metadata. |
| Worker verifies views | Backed | Standalone worker supports YouTube official, TikTok official, and optional Ayrshare fallback. |
| Earnings accrue from trusted views | Backed | Worker refuses untrusted provider data for earnings/payout paths. |
| Creator withdrawals | Backed | Stripe Connect withdrawal flow and payout reconciliation exist. |

## Missing Or Weak Backend Contracts

These are the pieces that would make the prototype/Figma port straightforward:

1. Typed server-side dashboard data for business and creator surfaces.
2. A campaign insights contract that groups campaign, creators, clips, views,
   budget, and earnings into one shape.
3. A clean replacement for business-dashboard `localStorage` rich queue state.
4. More complete business-side creator cards once real creator matching moves
   beyond the current live profile preview.
5. TikTok creator OAuth connect flow and UI; schema/worker support exists, but
   creator-facing account-linking is not complete.

## Implemented Now

Added `lib/supabase/dashboard-data.ts`, a server-only data adapter that exposes:

- `getBusinessDashboardData()`
- `getCreatorDashboardData()`
- `getCampaignInsights(campaignId)`

These functions use the authenticated Supabase SSR client, respect RLS, and do
not use the service role. They provide stable backend-shaped data for future
prototype/Figma UI ports.

## Recommended Port Order

1. Business campaign wizard polish, using the existing campaign creation/funding
   backend.
2. Business dashboard and campaign insights, using `getBusinessDashboardData()`
   and `getCampaignInsights()`.
3. Creator discovery and clip submission polish, keeping the existing API routes.
4. Creator dashboard/earnings polish, using `getCreatorDashboardData()`.
5. TikTok account-linking flow once TikTok app review/credentials are ready.
