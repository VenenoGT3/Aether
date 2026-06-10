# Backend-ready features awaiting frontend wiring

These features have working backends (tables, RPCs, server actions, env flags)
but **no page currently mounts or calls them**. They were intentionally kept
during the dead-code cleanup (not deleted) so the remaining work is visible.

When you wire one up, also remove its entry from the `ignore` list in
[`knip.jsonc`](../knip.jsonc) so dead-code analysis keeps protecting it.

| Feature | Backend that exists | Frontend that's missing | To connect |
| --- | --- | --- | --- |
| **Weekly challenges** | `claim_weekly_challenge` RPC, `challenge_claims` table, `FEATURE_ENABLE_CHALLENGES` flag, server actions in [`lib/actions/challenges.ts`](../lib/actions/challenges.ts) | [`components/weekly-challenge-widget.tsx`](../components/weekly-challenge-widget.tsx) is built but mounted on no page | Render `<WeeklyChallengeWidget />` on the creator dashboard (gate on the feature flag). |
| **Referral rewards** | `referrals` table, `FEATURE_ENABLE_REFERRALS` flag, `getReferralOverviewAction` / `claimReferralBonusAction` in [`lib/actions/referral.ts`](../lib/actions/referral.ts). NOTE: the *apply-a-code-at-signup* half is already live (creator onboarding). | [`components/refer-friend-card.tsx`](../components/refer-friend-card.tsx) (the "your referrals + claim rewards" card) is mounted nowhere | Add the card to the creator dashboard or a rewards tab. It uses [`components/ui/status-badge.tsx`](../components/ui/status-badge.tsx), also kept for this reason. |
| **Transactional email** | [`lib/resend.ts`](../lib/resend.ts) (sendCampaignMatchEmail, sendApplicationAcceptedEmail, sendPaymentReleasedEmail, sendNewMessageEmail) + `RESEND_API_KEY` | No code path calls any of these senders | Call the relevant sender from the matching server action / webhook (e.g. send the payment-released email from the escrow-release flow). In-app + push notifications already fire; email is additive. |
| **Client feature-flag hook** | [`lib/use-feature-flags.ts`](../lib/use-feature-flags.ts) (reads flags in the browser) | No client component reads flags via the hook; today flags are resolved server-side only | Use the hook in any client component that needs to show/hide a flagged feature without a server round-trip. |

_Last reviewed: 2026-06-10 (post dead-code cleanup)._
