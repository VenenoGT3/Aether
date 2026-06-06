# Business Frontend Integration - Phase 8 Treasury

Branch: `Business-Frontend`

## Goal

Port the designer `PaymentsDashboard` concept into Aether as a production
business treasury view without importing prototype mock data.

## Route Added

- `/business/payments`
- File: `app/business/payments/page.tsx`
- Navigation: `components/business/business-route-shell.tsx`

## Production Data Used

- `campaigns`
  - Performance pool funding, creator-available pool, reserved/paid rollups,
    Stripe funding identifiers, campaign status, RPM, and category.
- `clips`
  - Approved/tracking clip counts and verified view totals.
- `earnings`
  - Brand-readable creator earning accruals, holdback/approved/paid/reversed
    status, billable view deltas, and payout linkage.
- `platform_transactions`
  - Brand-visible platform fee rows created from funded performance pools.
- `transactions`
  - Existing fixed-fee escrow and legacy wallet movements through
    `useTransactions()`.
- `profiles`
  - Stripe Connect readiness through `getClientProfile()`.

## UX Surface

- Treasury header with refresh and fund-campaign actions.
- Stripe readiness banner when the business wallet is not connected.
- Top treasury metrics:
  - Funded pool
  - Remaining creator pool
  - Reserved creator earnings
  - Paid creator earnings
- Pool utilization card with paid/reserved/remaining breakdown.
- Treasury health card covering active pools, creator count, pending fixed-fee
  escrow, and rollup reconciliation state.
- Campaign pool burn-down list for performance campaigns.
- Monthly movement visualization for funding, reserves, and fees.
- Filterable ledger covering funding, creator earnings, platform fees, and
  legacy escrow transactions.
- Bottom reconciliation/legacy context cards.

## Design Mapping

The designer `PaymentsDashboard` emphasized escrow balances, active contracts,
cash movements, and transaction history. In Aether this now maps to:

- Escrow balance -> performance budget pool and creator-available pool.
- Active contracts -> funded performance campaigns.
- Transaction history -> combined treasury ledger.
- Consumption chart -> monthly funding/reserve/fee movement.
- Payment readiness -> Stripe Connect readiness.

## Notes

- Payout rows are creator-readable only under current RLS, so the business page
  intentionally does not query `payouts` directly.
- `earnings` are readable by the campaign-owning business and are included as
  the brand-facing performance ledger.
- Existing fixed-fee transactions remain visible but are labeled as legacy
  movements to avoid mixing them with performance-pool accounting.

Status: complete.
