# Business Frontend Phase 2: Design System Extraction

Phase 2 extracts the reusable visual language from `VenenoGT3/Frontend-Business` into Aether without changing live route behavior yet. The designer repo is React, TypeScript, Vite, Tailwind, Framer-style motion, and lucide icons, so the correct integration path is direct React/TypeScript adaptation inside Aether's Next.js app.

## Scope Completed

- Added scoped business CSS tokens and utilities under `.business-portal` in `app/globals.css`.
- Added reusable business UI primitives in `components/business/business-ui.tsx`.
- Added a barrel export at `components/business/index.ts`.
- Kept all new styling inert until a route explicitly renders inside `BusinessPortalShell` or applies `.business-portal`.

## Extracted Tokens

The scoped token set mirrors the designer mockups' dark glass interface:

- `--business-bg`
- `--business-surface`
- `--business-surface-high`
- `--business-surface-highest`
- `--business-primary`
- `--business-secondary`
- `--business-accent`
- `--business-text`
- `--business-muted`
- `--business-success`
- `--business-warning`
- `--business-danger`
- `--business-border`
- `--business-shadow`

## Extracted Utilities

- `.business-glass`
- `.business-glass-heavy`
- `.business-glass-elevated`
- `.business-input`
- `.business-text-metallic`
- `.business-accent-button`
- `.business-progress-track`
- `.business-progress-fill`
- `.business-scrollbar-none`

## Extracted Components

- `BusinessPortalShell`
- `BusinessGlassCard`
- `BusinessSectionHeader`
- `BusinessMetricCard`
- `BusinessStatusPill`
- `BusinessProgressBar`
- `BusinessActionButton`
- `BusinessEmptyState`

These primitives are intentionally data-agnostic. Later phases should wire them into the existing Supabase-backed business pages instead of copying static mock data from the designer repo.

## Follow-On Phase Notes

- Phase 3 should start replacing the business app shell and navigation surfaces with these primitives.
- Phase 4 should adapt the business dashboard to the designer dashboard layout while preserving current data fetches and realtime subscriptions.
- Phase 5 and later should keep product language aligned with Content Rewards terms: reward rate, RPM, verified views, budget pool, paid, reserved, remaining, submission queue, and campaign treasury.
