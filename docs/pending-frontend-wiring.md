# Backend-ready features awaiting frontend wiring

These features have working backends (tables, RPCs, server actions, env flags)
but **no page currently mounts or calls them**. They were intentionally kept
during the dead-code cleanup (not deleted) so the remaining work is visible.

When you wire one up, also remove its entry from the `ignore` list in
[`knip.jsonc`](../knip.jsonc) so dead-code analysis keeps protecting it.

| Feature | Backend that exists | Frontend that's missing | To connect |
| --- | --- | --- | --- |
| **Client feature-flag hook** | [`lib/use-feature-flags.ts`](../lib/use-feature-flags.ts) (reads flags in the browser) | No client component reads flags via the hook; today flags are resolved server-side only | Use the hook in any client component that needs to show/hide a flagged feature without a server round-trip. |
| **Remaining email senders** | [`lib/resend.ts`](../lib/resend.ts) — `sendCampaignMatchEmail`, `sendApplicationAcceptedEmail`, `sendNewMessageEmail` | `sendPaymentReleasedEmail` is wired (fires from `releaseEscrowAction`); the other three senders have no trigger point yet | *Application accepted*: fires when the funding webhook flips a participation to `accepted` — that code runs in the Supabase `stripe-webhook` Edge Function (Deno), so the send has to be ported there (with `RESEND_API_KEY` as an Edge Function secret). *New message*: messages are inserted client-side ([`app/campaigns/[id]/page.tsx`](../app/campaigns/[id]/page.tsx)) and emailing every chat message would spam — route sends through a server action and add batching/unread-only logic first. *Campaign match*: no matching engine emits a "match" event yet. |

## Wired (previously listed here)

- **Weekly challenges** + **Referral rewards** — both widgets now mount on the
  creator dashboard, gated server-side on `enable_challenges` /
  `enable_referrals` ([`app/creator/dashboard/page.tsx`](../app/creator/dashboard/page.tsx)).
- **Transactional email (payment released)** — sent best-effort from the
  escrow-release flow ([`lib/stripe/actions.ts`](../lib/stripe/actions.ts));
  requires `RESEND_API_KEY` (optional `RESEND_FROM`) or it logs and skips.

_Last reviewed: 2026-06-10 (post account-deletion + widget-wiring round)._
