# Business Frontend Phase 10 - Language Cleanup

Phase 10 normalizes business-side product language after the dashboard, campaign hub, builder, moderation, treasury, and campaign insights redesigns.

## Scope

- Audited `app/business/**`, `components/business/**`, and `lib/translations.ts` for legacy marketplace copy.
- Kept database field names such as `brand_cpm_rate`, `cpm_rate`, and `influencer_id` unchanged because those are schema/API contracts, not user-facing language.
- Kept escrow language only where the UI is explicitly describing the legacy fixed-fee campaign path.

## Copy Rules Applied

- Performance campaign payouts are described with `Reward rate` and `RPM`.
- Money-bearing view metrics use `verified views`.
- Performance campaign finance areas use `budget pool`, `reserved`, `paid`, `remaining`, and `treasury`.
- Fixed-fee campaign flows are labeled as legacy where Stripe escrow is still part of the existing production path.
- Business onboarding now says Stripe is connected for campaign funding, not a generic payment wallet.
- Campaign insights now use creator language instead of influencer management language.

## Files Updated

- `app/business/onboarding/page.tsx`
- `app/business/campaigns/new/page.tsx`
- `app/business/dashboard/page.tsx`
- `app/business/payments/page.tsx`
- `components/business/business-campaign-insights.tsx`
- `lib/translations.ts`

## Localization Note

The Italian dictionary still does not contain every redesigned business string. Phase 10 added the new normalized language keys and the most important business product terms, but a complete Italian localization pass remains separate from the copy cleanup.

## Status

Complete for the business frontend language-cleanup phase.
