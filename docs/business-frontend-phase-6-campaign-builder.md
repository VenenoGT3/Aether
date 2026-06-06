# Business Frontend Phase 6: Campaign Builder Integration

Phase 6 restyles Aether's production campaign builder around the Phase 2 business design system and the UX engineer's `CampaignWizard` direction, while preserving the real launch and payment flow.

## Scope Completed

- Rebuilt `app/business/campaigns/new/page.tsx` as a business portal workflow with designer-inspired progress, side summary, readiness, and creator matching panels.
- Preserved the real six-step production builder instead of collapsing to the prototype's three steps.
- Kept real AI brief generation, creator profile matching, performance vs fixed-fee modes, UGC vs clipping metadata, Stripe pool funding, and fixed-fee publish behavior.
- Added a visible minimum payout threshold control for performance campaigns and persisted it through `createCampaignAction`.
- Restyled the real Stripe pool funding modal to match the business frontend system.

## Intentional Non-Changes

- No flat-fee performance bonus was added because the current campaign schema and payout worker do not expose a campaign-level bonus field.
- No campaign editing/resume flow was added; this phase only redesigns the new campaign creation path.
- Moderation, treasury, and campaign insights remain in their later phases.
