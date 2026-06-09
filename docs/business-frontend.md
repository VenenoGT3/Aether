# Business Frontend Integration

Consolidated record of the 12-phase port of the UX/UI reference repo
(`VenenoGT3/Frontend-Business`, React 19 + Vite + Tailwind 4 prototype with
mock data) into Aether's production business routes. The full per-phase
write-ups were squashed into this digest; recover them from git history
(`docs/business-frontend-phase-*.md`, removed 2026-06-09) if you need the
play-by-play.

## Where things live now

| Area | Location |
| --- | --- |
| Business design tokens (scoped dark-glass theme) | `.business-portal` block in `app/globals.css` |
| Business UI primitives | `components/business/business-ui.tsx` (barrel: `components/business/index.ts`) |
| Business shell (header + bottom nav) | `components/business/business-route-shell.tsx` |
| Campaign insights modules | `components/business/business-campaign-insights.tsx` |
| Creator-side equivalents | `components/creator/` |
| Landing page | `components/landing/aether-landing-page.tsx` (RSC wrapper: `app/page.tsx`) |
| Verification screenshots | `docs/phase-12-screenshots/` |

## Phase log

| Phase | Outcome |
| --- | --- |
| 1 — Map | Route-by-route inventory of designer components → Aether routes; mock logic explicitly separated from reusable design. |
| 2 — Design system | Designer visual language extracted as scoped `.business-portal` tokens + `business-ui.tsx` primitives; inert until a route opts in. |
| 3 — Shell | Business-only header/bottom-nav shell; creator nav untouched. |
| 4 — Dashboard | `/business/dashboard` rebuilt on real campaign/clip/transaction data with designer visual direction. |
| 5 — Campaign hub | `/business/campaigns` kanban replaced with performance-state campaign workspace list. |
| 6 — Campaign builder | `/business/campaigns/new` restyled around the `CampaignWizard` direction; real financial fields and Stripe pool funding preserved. |
| 7 — Moderation | `/business/moderation` became the approval matrix / submission queue (not a literal contract screen). |
| 8 — Treasury | `/business/payments` brand treasury/ledger view over transactions, earnings, payouts, funding. |
| 9 — Campaign insights | `app/campaigns/[id]` analytics split into business insight modules. |
| 10 — Language | Business copy normalized (see language rules below) incl. `lib/translations.ts`. |
| 11 — Responsive/a11y QA | Small screens, zoom, keyboard, AT labels, no horizontal overflow. |
| 12 — Final verification | Checks green, browser screenshots captured, PR `Business-Frontend` → `development` (2026-06-06). |

## Durable rules

### Product language

- Prefer **Reward rate** / **RPM** for user-facing payout rate (backed by `brand_cpm_rate` / `cpm_rate`).
- Use **verified views** (not impressions) whenever money is involved.
- Use **budget pool / reserved / paid / remaining** for performance campaigns.
- Replace "escrow" with **funded pool** / **treasury** except on legacy fixed-fee screens or Stripe-specific references.
- Aether's performance model uses a **brand-set rate** — never "creator sets CPM".

### Designer-mock → production data contract

| Designer mock field | Aether production source |
| --- | --- |
| `Campaign.budget` | `campaigns.budget_total`, `budget_pool`, `available_pool` |
| `Campaign.status` | `campaigns.status` + performance lifecycle labels |
| `Campaign.applicants` | `participations` count / pending clips |
| `Campaign.impressions` | verified views from `clips.current_views` / snapshots |
| `Campaign.cpmRate` | `brand_cpm_rate` / `cpm_rate` (shown as Reward rate/RPM) |
| `EscrowContract` | participations + clips + earnings + payouts (never literal) |
| `Transaction` / `Activity` | Aether transactions/earnings/payouts/funding events |

Never import the reference repo's `src/data.ts` / `src/types.ts` into
production pages — design fixture reference only.
