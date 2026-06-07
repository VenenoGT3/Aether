# Business Frontend Integration - Phase 9 Campaign Insights

Branch: `Business-Frontend`

## Goal

Port the designer `CampaignInsights` direction into Aether's campaign detail
route while preserving the existing creator/fixed-fee workspace.

## Route Updated

- `/campaigns/[id]`
- File: `app/campaigns/[id]/page.tsx`
- New business component: `components/business/business-campaign-insights.tsx`

## Production Data Used

- `campaigns`
  - Campaign identity, status, type/category, RPM, pool funding, creator caps,
    minimum payout threshold, niches, platforms, and dates.
- `participations`
  - Creator participation status and legacy payout context.
- `profiles`
  - Creator display names, avatars, and social handles.
- `clips`
  - Submitted URLs, status, views, quality/fraud flags, and timestamps.
- `earnings`
  - Accrued, approved, paid, and reversed performance earnings.

## UX Surface

- Business-only campaign insights route variant.
- Header with campaign status, campaign type, funding state, RPM, thresholds,
  cap, launch date, niches, and platforms.
- Metric cards for verified views, creator pool, pending review, and creator
  earnings.
- Budget burn-down based on `budget_pool`, `available_pool`,
  `budget_reserved`, and `budget_paid`.
- Monthly signal bars for clip views and estimated earnings.
- Creator leaderboard filtered by active, review, and paid states.
- Recent clip stream with creators, views, estimated earnings, status, and
  fraud flags.
- Financial state panel linking into `/business/payments`.

## Preservation Notes

- The old campaign workspace remains available for creators and non-business
  route usage.
- Fixed-fee escrow actions, creator application flow, chat, annotation, UTM,
  and AI safety tools were not removed in this phase.
- The new view does not import designer mock creators or random live-view
  increments; all numbers are derived from Aether tables.

Status: complete.
