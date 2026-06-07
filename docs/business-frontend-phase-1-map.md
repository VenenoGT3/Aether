# Business Frontend Integration - Phase 1 Map

Branch: `Business-Frontend`

This document maps the UX/UI reference repo (`VenenoGT3/Frontend-Business`) to
the production Aether business-side routes. It is the source of truth for the
later phased frontend integration work.

## Phase 1 Goal

Create a route-by-route inventory before porting code:

- Identify which designer components map to which Aether routes.
- Separate visual design assets from mock business logic.
- Preserve Aether's real backend, auth, payments, and data contracts.
- Define the order and acceptance criteria for later phases.

## Reference Repo Summary

Reference repo: `VenenoGT3/Frontend-Business`

Framework:

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- `motion/react`
- `lucide-react`

Important: this is not Java and should not be translated to Java. Aether is
Next.js + React + TypeScript + Tailwind, so the correct path is a React/Next
port with production data wiring.

The reference app is a single mobile-framed business portal. It uses local
state and seeded mock data from `src/data.ts`. Its design language is useful;
its data model is not production-ready.

## Reference Components

| Reference component | Purpose in designer repo | Production use |
| --- | --- | --- |
| `src/App.tsx` | Mobile app shell, tabs, local state, modals, toasts | Use as visual shell reference only. Do not copy local state model. |
| `src/components/HomeDashboard.tsx` | Business dashboard summary, activity feed, CTA, chart | Port visual patterns into `/business/dashboard`. Replace hardcoded metrics. |
| `src/components/CampaignList.tsx` | Campaign cards, tabs, search, quick actions | Port into `/business/campaigns`. Replace statuses/actions with performance campaign states. |
| `src/components/CampaignWizard.tsx` | Three-step campaign creation wizard | Use as visual reference for `/business/campaigns/new`, but keep Aether's real financial/product fields. |
| `src/components/CampaignInsights.tsx` | Campaign analytics and creator performance detail | Port into campaign detail/analytics after data mapping. |
| `src/components/PaymentsDashboard.tsx` | Escrow/payment overview, transaction list | Adapt into treasury/ledger UI. Replace escrow-first language with performance pool ledger language. |
| `src/components/ContractDetails.tsx` | Creator contract activation detail | Adapt into moderation/application/creator submission detail, not a literal fixed-fee contract flow. |
| `src/data.ts` | Mock campaigns, activities, escrow contracts, transactions | Do not import into Aether production pages. Use only as design fixture reference. |
| `src/types.ts` | Mock types for local prototype | Do not reuse directly. Map to Aether `DbCampaign`, clips, earnings, payouts, participations. |
| `src/index.css` | Visual tokens, glass styles, fonts, animations | Extract scoped business tokens/classes in Phase 2. |

## Aether Business Route Inventory

| Aether route/file | Current role | Designer mapping | Integration notes |
| --- | --- | --- | --- |
| `app/business/dashboard/page.tsx` | Brand dashboard with performance summary plus collapsed legacy fixed-fee sections | `HomeDashboard` | Phase 4. Replace current mixed dashboard with designer-inspired operational summary. Keep real campaign, clip, transaction, profile data. |
| `app/business/campaigns/page.tsx` | Campaign hub, currently legacy escrow/Kanban language | `CampaignList` | Phase 5. High-priority mismatch. Replace "Open Escrows", "Fund Escrow", "Match Creator", "Release Escrow" with performance campaign states. |
| `app/business/campaigns/new/page.tsx` | Real campaign builder with performance/fixed modes, Stripe pool funding, UGC/clipping meta | `CampaignWizard` | Phase 6. Use designer polish, but preserve Aether's current real fields and add missing financial controls. |
| `app/business/moderation/page.tsx` | Brand clip review, fraud queue, budget burn-down | `ContractDetails` and App "Applications" tab | Phase 7. This should become the approval matrix/submission queue, not a mock contract screen. |
| `app/campaigns/[id]/page.tsx` | Large shared campaign workspace/detail/analytics/chat page | `CampaignInsights` | Phase 9. Split business campaign insights into smaller components; avoid copying mock creator rows. |
| `components/brand-performance-summary.tsx` | Dashboard performance summary card cluster | `HomeDashboard` metrics/cards | May be replaced or folded into dashboard module during Phase 4. |
| `components/pool-payment-modal.tsx` | Real Stripe pool funding modal | `CampaignWizard` launch/funding CTA | Keep production Stripe flow. Restyle only. |
| `components/nav-bar.tsx` | Global nav for all roles | `App.tsx` mobile header | Phase 3. Scope business shell changes carefully so creator nav is not broken. |
| `components/mobile-tab-bar.tsx` | Mobile role-based nav | `App.tsx` bottom tab bar | Phase 3. Use designer bottom nav pattern for business only if it remains usable across all business pages. |

## Data Contract Mapping

| Designer mock field | Aether production source |
| --- | --- |
| `Campaign.id` | `campaigns.id` |
| `Campaign.title` | `campaigns.title` |
| `Campaign.budget` | `campaigns.budget_total`, `budget_pool`, `available_pool` |
| `Campaign.status` | `campaigns.status` plus performance lifecycle derived labels |
| `Campaign.applicants` | `participations` count and/or pending clips/applications count |
| `Campaign.impressions` | aggregate verified views from `clips.current_views` / snapshots |
| `Campaign.roas` | only if ROI data exists; otherwise hide or label unavailable |
| `Campaign.engagement` | aggregate post metrics where available |
| `Campaign.cpmRate` | user-facing `reward rate / RPM`; currently backed by `brand_cpm_rate` / `cpm_rate` |
| `Campaign.maxPayoutCap` | campaign/submission cap field when available; currently `max_payout_per_creator` in builder |
| `EscrowContract` | do not map literally; use participations, clips, earnings, payouts |
| `Transaction` | Aether transactions, earnings, payouts, pool funding, Stripe events |
| `Activity` | derived audit/activity feed from campaign changes, submissions, moderation, funding events |

## Product Language Rules

Later phases should normalize business-side language:

- Prefer `Reward rate` or `RPM` for user-facing payout rate.
- Use `verified views`, not generic impressions, when money is involved.
- Use `budget pool`, `reserved`, `paid`, and `remaining` for performance campaigns.
- Avoid fixed-fee labels unless the screen is explicitly showing legacy fixed-fee campaigns.
- Avoid "creator sets CPM"; Aether's current performance model uses a brand-set rate.
- Replace "escrow" with "funded pool" or "treasury" unless referencing Stripe/legacy fixed-fee flows.

## Phase Dependencies

### Phase 2 - Design System Extraction

Inputs:

- `src/index.css`
- shared visual patterns from all designer components

Outputs:

- Scoped business frontend tokens/classes/components in Aether.
- No route behavior changes yet.

### Phase 3 - Business Shell Redesign

Inputs:

- `src/App.tsx`
- `components/nav-bar.tsx`
- `components/mobile-tab-bar.tsx`

Outputs:

- Business-only page shell/header/nav treatment.
- Mobile bottom nav decision.

### Phase 4 - Business Dashboard Integration

Inputs:

- `HomeDashboard`
- `app/business/dashboard/page.tsx`
- `components/brand-performance-summary.tsx`

Outputs:

- Real-data dashboard with designer visual direction.

### Phase 5 - Campaign Hub Integration

Inputs:

- `CampaignList`
- `app/business/campaigns/page.tsx`

Outputs:

- Business campaign hub aligned to performance marketplace states.

### Phase 6 - Campaign Builder Integration

Inputs:

- `CampaignWizard`
- `app/business/campaigns/new/page.tsx`
- `components/pool-payment-modal.tsx`

Outputs:

- Restyled but production-real campaign builder.

### Phase 7 - Moderation / Applications

Inputs:

- App `applications` tab
- `ContractDetails`
- `app/business/moderation/page.tsx`

Outputs:

- Approval matrix and submission queue.

### Phase 8 - Treasury / Payments

Inputs:

- `PaymentsDashboard`
- Aether transactions/earnings/payouts/funding data

Outputs:

- Brand treasury/ledger view.

### Phase 9 - Campaign Insights

Inputs:

- `CampaignInsights`
- `app/campaigns/[id]/page.tsx`

Outputs:

- Campaign analytics/detail modules.

### Phase 10 - Language Cleanup

Inputs:

- All business pages/components
- `lib/translations.ts`

Outputs:

- Consistent RPM/performance marketplace copy.

### Phase 11 - Responsive + Accessibility QA

Inputs:

- All redesigned business pages

Outputs:

- Mobile/desktop QA fixes, a11y labels, zoom support, no horizontal overflow.

### Phase 12 - Final Verification + PR

Inputs:

- Complete branch

Outputs:

- Passing checks, browser screenshots, PR from `Business-Frontend` to `development`.

## Phase 1 Acceptance Criteria

- `Business-Frontend` branch exists and tracks `origin/Business-Frontend`.
- Reference repo framework and component structure are identified.
- Aether business routes are mapped to designer components.
- Mock logic is explicitly separated from reusable design.
- Later phases have an agreed implementation order.

Status: complete.
