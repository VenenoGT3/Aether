# Business Frontend Phase 3: Business Shell Redesign

Phase 3 introduces a production business-only shell inspired by the UX reference app's brand header and bottom navigation, while avoiding a static mock-app frame and preserving Aether's real route architecture.

## Scope Completed

- Added `app/business/layout.tsx` so all `/business/*` pages share a dedicated shell.
- Added `components/business/business-route-shell.tsx` for the business header, desktop navigation, mobile bottom tabs, brand workspace indicator, profile menu, notifications, and campaign creation shortcut.
- Hid the old shared `NavBar` and `MobileTabBar` only on `/business/*` routes so creator routes keep their existing shell.
- Added a root padding override for pages containing `.business-route-shell` to remove the creator mobile-tab spacing.
- Reused the scoped Phase 2 `.business-portal` token system instead of changing global theme variables.

## Navigation Mapping

- Dashboard: `/business/dashboard`
- Campaigns: `/business/campaigns` and `/business/campaigns/new`
- Submissions: `/business/moderation`
- Setup: `/business/onboarding`

The reference app included a payments tab, but Aether does not yet have a dedicated business treasury route. Phase 8 should add or map the payments/treasury surface once the data contract is ready.

## Intentional Non-Changes

- Dashboard, campaign hub, campaign builder, moderation, and onboarding bodies remain mostly unchanged until their dedicated phases.
- Creator navigation and public/auth navigation are not redesigned in this phase.
- No mock data from `Frontend-Business` was copied into production routes.
