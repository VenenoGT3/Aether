# Content Rewards (Whop) vs Aether — Deep Audit & Gap Analysis

Date: 2026-06-09 · Branch: `fable` · Author: engineering audit

## 0. Scope and method

Aether's founding goal is to bring what Content Rewards does in the US to
Europe. This audit reconstructs Content Rewards' product mechanics in detail
and compares them against Aether's actual codebase (as of `fable`).

**On "their codebase":** Content Rewards is a proprietary product inside Whop
(closed source — no public repository exists). What CAN be audited is their
complete product surface: official docs, the Content Rewards Terms of
Service, the official FAQ, the brand setup guide, the discover marketplace,
and a large body of third-party operator guides and brand post-mortems. Where
sources conflict (they do on fees and verification windows) both figures are
given and flagged. Whop runs its entire ~$1.2B+ GMV run-rate platform with
roughly 20 engineers — the engineering lesson is ruthless product focus, not
exotic technology.

---

## 1. Content Rewards — product dossier

### 1.1 Positioning and scale

- Launched early 2025 (Whop Clips announced 2025-04-08) inside Whop, a
  creator-commerce platform reporting **$2.67B cumulative GMV by Feb 2026**
  and ~$142M annualized revenue (Sacra, Oct 2025).
- Content Rewards itself: tens of thousands of participating clippers
  (one mid-2025 snapshot: 98k+ creators, ~82 concurrent campaigns; the
  marketplace shows individual campaigns with budgets up to $120k).
- Core loop: brand deposits a budget → clippers post short-form videos →
  views are verified → budget is paid out per 1,000 views, first-come-first-served,
  until the pool is empty.

### 1.2 Campaign model (brand side)

| Mechanic | Detail |
| --- | --- |
| Required fields | Title, content type (**Clipping** or **UGC**), category, total budget, reward rate (per 1k views), allowed platforms |
| Optional fields | Tutorial video, **minimum payout threshold** (per-submission earning floor), **maximum payout cap** (per video), **flat fee bonus** (fixed $ per approved submission), requirements free-text, asset links (Google Drive etc.), audio requirements for IG/TikTok |
| Categories observed | Entertainment, Music, Product, Slideshow, Personal brand, Health |
| Currency | Brand chooses budget currency |
| Funding | Full budget deposited upfront before the campaign leaves "Pending"; no minimum budget |
| Immutability | Budget, reward rate, and flat-fee bonus cannot be edited after creation |
| Budget burn | Strictly first-come-first-served until max payout/end date; brand must keep funds covering max payout |

### 1.3 Creator side

- **Discovery marketplace** (contentrewards.com/discover): campaign cards show
  budget progress ("$91,084/$120,000" + progress bar), participant count,
  CPM ("$1.50/1K views"), category tag, verified-brand checkmark, time
  posted, view count contributed; filters by status/category/content type;
  sortable by "most paid out".
- **Joining**: open to anyone, no follower minimums, no application.
- **Account linking**: profile → Linked Accounts → Add Account. Multiple
  TikTok / Instagram / YouTube / **X** accounts per creator; accounts must be
  public.
- **Submission rules**: only videos created *after joining the campaign*;
  one submission per video per campaign; unlimited submissions; wrong-video
  mistakes fixed by resubmitting. Third-party guides stress submitting the
  link quickly after posting (commonly cited: within ~1 hour).
- Typical CPM range: $1–5 per 1,000 views (UGC pays above clipping).

### 1.4 Review, tracking, verification

- **AI pre-review** checks each submission against campaign requirements;
  suspicious ones become **Flagged** ("unusual activity signals — spikes in
  views, possible botted traffic") and require manual review.
- **48-hour auto-approval** of unflagged submissions; brands can manually
  approve/reject earlier, with a "don't ask again" auto-approve toggle.
- Rejection includes an explanation field and a one-click **"ban the user for
  botting"** option.
- View tracking is native (via linked accounts / platform APIs); operator
  guides report roughly **hourly** view refresh.
- A **verification period** applies before rewards are released (FAQ: paid
  "after 7 days of your submission being verified"; one Whop source mentions
  a 30-day verification period — likely product-version drift; treat 7 days
  as the current public number).

### 1.5 Money mechanics

| Mechanic | Detail |
| --- | --- |
| Creator fee | **7% of clipper payouts** per the official FAQ (the ToS says 10% — the FAQ figure is newer; both documented) |
| Payout cadence | Automatic, **every 7 days**, per verified submission, into Whop balance |
| Withdrawals from Whop balance | ACH $2.50 (next-day), instant 4% + $1, crypto 5% + $1, Venmo 5% + $1, wire $23; 241+ countries |
| Min payout threshold | Per campaign — submissions below the floor never enter review (e.g. $3 CPM + $6 minimum ⇒ videos under 2,000 views are ignored) |
| Max payout cap | Per video — earning stops at the cap even if views keep growing (e.g. $3,000 cap @ $3 CPM ⇒ 1M views) |
| Post-campaign | Earnings remain claimable after campaign end |
| Forfeiture | No pay after cap/end date; rejected submissions earn nothing; fraud ⇒ ban + forfeiture of pending funds |

### 1.6 Compliance posture (US)

- 18+ only; participants affirm they are not bots/virtual influencers.
- **FTC disclosure** contractually mandated (#Sponsored, visible before
  "more"); the *brand* bears responsibility for participant compliance.
- Sweeping IP grant: worldwide, royalty-free, irrevocable, perpetual license
  on deliverables + likeness, moral rights waived.
- Off-platform compensation banned (anti-disintermediation).
- Taxes entirely on the creator; arbitration + class-action waiver.

### 1.7 Known failure modes (documented brand/creator reports)

These are CR's real weaknesses — each is an Aether opportunity:

1. **Bot-view fraud at scale** — brands report videos jumping tens of
   thousands of views overnight, repeatedly landing on *exactly* the max
   payout; one brand: $1,500 spent ⇒ ~845k views, "99.999% bots".
2. **Geo-filter evasion** — country restrictions defeated by VPNs.
3. **Low-effort content flood** — watermarviolating, AI-mass-produced clips
   ignoring brand requirements ("maximum money for minimum effort").
4. **Rule-change disputes** — brands lowering max payouts mid-campaign
   triggered scam accusations; no transparent change-log for creators.
5. **Opaque rejections** — discretionary "sole judgment" fraud calls with no
   real appeal path.
6. **FCFS budget sniping** — "60% of the budget taken by 2 people within 24
   hours"; latecomers earn nothing, brands get burst-not-sustained exposure.

---

## 2. Aether — current state (as of `fable`)

**Model**: two-sided marketplace; `business` and `influencer` roles.
Campaigns are `fixed` (legacy escrow) or `performance` (CPM pool), category
`ugc` | `clipping`. Performance flow: brand funds a **budget pool** via
Stripe PaymentIntent (campaign is `draft` until the webhook settles it
to `open`), sets `brand_cpm_rate`; platform fee **10%** recorded on funding.

**Creator flow**: open join → submit YouTube Shorts links (beta is
YouTube-only via `lib/beta.ts`) → **channel ownership enforced** (YouTube
OAuth link, `channels?mine=true`, clip's channel must match a linked
account) → brand moderation (approve/reject; auto-approval of overdue clips
exists in the worker) → view-sync worker (default every 10 min, batch 200)
pulls **official YouTube Data API** statistics → earnings accrue in
**1,000-view blocks** (`billableViewsForPayout`), first trusted snapshot is a
**non-billable baseline**, per-creator cap (`max_payout_per_creator`) and pool
exhaustion enforced atomically in SQL (`record_clip_earning`).

**Anti-fraud (scored, multi-signal)**: velocity growth factor, absolute jump,
spike-vs-history multiplier, bot-uniformity (coefficient of variation),
engagement-ratio floor, view-drop detection, cross-campaign duplicate
content, creator burst submissions, repeat-offender lookback; weighted score
with flag and disqualify thresholds; earnings reversal on blocked clips;
brand notification on auto-disqualification.

**Money**: 48h holdback then earnings become withdrawable; creator-initiated
withdrawals (min $10) with fee; Stripe **Connect Express** transfers,
idempotency keys, unknown-outcome reconciler, payout ledger with unique
constraints. **Hardcoded `usd`.**

**Platform**: Next.js 16 + Supabase (RLS everywhere, hardened SECURITY
DEFINER RPCs) + standalone BullMQ worker + Stripe + edge functions; EN/IT
i18n; GDPR consent banner; weekly challenges; referral scaffolding; AI
campaign discovery (xAI); E2E + 246 unit tests; alert webhook.

---

## 3. Side-by-side comparison

| Area | Content Rewards | Aether | Verdict |
| --- | --- | --- | --- |
| Platforms tracked | TikTok, IG Reels, YT Shorts, X | YouTube Shorts only (beta) | **Gap (critical)** — CR's volume lives on TikTok/IG |
| View verification | Linked accounts + native tracking, ~hourly | Official YouTube Data API + **OAuth channel-ownership proof**, 10-min cycles | Aether stronger per-platform, weaker in coverage |
| Ownership proof | Linked account; submit any link from it | OAuth-verified channel must own the exact video | **Aether stronger** |
| Pre-existing views | Pays on tracked views | First snapshot is a **non-billable baseline** | **Aether stronger** (kills the "submit an old viral video" exploit CR closes only by a "new videos only" rule) |
| Anti-fraud | AI flagging + manual review + discretionary bans; documented large-scale bot losses | Multi-signal scoring engine, auto-disqualify + earnings reversal, repeat-offender tracking | **Aether stronger** by design |
| Submission floor/cap | Per-submission min payout; **per-video max cap** | Per-creator cap + pool caps; **no per-video cap, no min-payout floor** | **Gap** |
| Flat-fee bonus | Yes (fixed $ per approved submission) | No | **Gap** |
| Approval flow | AI review → 48h auto-approve → flagged state; rejection reasons + ban button | Manual approve/reject + overdue auto-approve; fraud auto-disqualify | **Partial gap** (no flagged-for-review state, no structured rejection reasons/ban UX) |
| Earnings cadence | Automatic every 7 days after verification | 48h holdback → **manual** withdrawal (min $10) | **Gap (UX)** — CR feels "I get paid weekly", Aether feels "I must claim" |
| Withdrawal rails | Whop balance → ACH/instant/crypto/Venmo (fee schedule) | Stripe Connect Express transfer (regulated, KYC'd) | Different philosophies; Aether is the *compliant-in-EU* answer but needs **EUR + SEPA** |
| Currency | Brand-selectable | **USD hardcoded** | **Gap (critical for EU)** |
| Discovery UX | Budget progress bars, participant counts, paid-so-far, verified badges, sort by most-paid-out | Creator discover page + AI matching; no public budget-burn social proof | **Gap** |
| Campaign requirements | Free-text requirements + asset links + audio rules + tutorial video | Deliverables/content_rules JSON exist; thinner authoring & enforcement UX | **Partial gap** |
| Multi-account | Multiple linked accounts per platform | Multiple YouTube channels linkable | Parity (YouTube), gap elsewhere |
| Geo targeting | Country restrictions + audience-share requirements (e.g. 50–60% US) — VPN-evadable | None | **Gap** (do it better: platform-API audience data, not IP) |
| Campaign end dates | End date stops accrual | Timeline JSON exists; lifecycle enforcement is pool-exhaustion-driven | **Partial gap** |
| Disclosure compliance | FTC obligations pushed contractually onto brands/creators | Nothing enforced in-product | **Gap (EU legal exposure)** |
| Fees | 7% (FAQ; ToS says 10%) of creator payouts + withdrawal fees | 10% platform fee on brand pool | Different incidence; Aether's is brand-side and transparent |
| Ecosystem | Whop network effects: communities, agencies, leaderboards, installable app | Standalone product; weekly challenges + referral scaffolding | **Gap (structural)** — CR's distribution is Whop itself |
| Taxes/reporting | Pushed to creators (US) | Pushed to creators — **but EU platforms cannot do this: DAC7 applies** | **Gap (legal, EU-specific)** |

---

## 4. Gaps to address (ranked)

### P0 — existential for the EU Content Rewards thesis

1. **TikTok + Instagram view tracking.** CR's volume is TikTok-first; a
   YouTube-only clipping marketplace cannot compete. TikTok Display API
   (`video.query` — provider already half-built in `worker/views-provider.ts`,
   gated by `BETA_PLATFORMS`) plus token storage re-enabled (the dormant
   `token-crypto` + `SOCIAL_TOKEN_ENCRYPTION_KEY` path). Instagram requires
   the IG Graph API (Business/Creator accounts) — higher friction, plan as
   phase 2 of this item.
2. **EUR end-to-end.** Stripe transfers hardcode `usd`
   ([connect.ts:95](../lib/stripe/connect.ts)); campaign budgets have no
   currency column. A European platform must price, fund, accrue, and pay in
   EUR (multi-currency later; EUR first).
3. **Automatic payout cadence.** Keep manual withdrawal, but add a CR-style
   "verified earnings auto-pay weekly" default (the payout-batch worker
   already supports `WORKER_AUTO_PAYOUTS=true` — productize it: per-creator
   opt-in, weekly schedule, email receipt).
4. **DAC7 compliance (the gap CR never had to solve).** As an EU platform
   operator paying sellers (creators), Aether must collect seller data
   (name, address, TIN/VAT, DOB, account identifiers), report annually
   (first report due 31 Jan following the reporting year), and block payouts
   for non-cooperative sellers after two reminders. Needs: schema for seller
   tax data, collection UI at onboarding/withdrawal, XML export. This is the
   single biggest "Europe is different" engineering item.

### P1 — competitive parity features

5. **Per-video max payout cap + per-submission minimum payout floor**
   (campaign fields + enforcement in `record_clip_earning` and clip-submit).
   CR brands rely on both to shape spend; Aether only caps per-creator.
6. **Flat-fee bonus per approved submission** (fixed € on approval,
   debited from the pool like an earning).
7. **Discovery social proof**: budget progress bar, % paid out, participant
   count, total views contributed, verified-brand badge on campaign cards;
   sort by "most paid out". All the data already exists in
   `campaigns`/`clips`/`earnings`.
8. **Flagged-for-review state + structured rejections.** Add `flagged`
   between fraud-scoring and disqualification with a brand review queue
   (the fraud engine already produces reasons); rejection reason codes; a
   "ban creator from campaign/platform" action (`banned` participation
   status already exists).
9. **Campaign requirements authoring**: structured requirements (min length,
   mention/tag rules, audio rules, watermark policy) + asset-pack links +
   tutorial video field; display at submission time; feed into AI pre-check.
10. **Campaign end dates enforced** (stop accrual + close at `timeline.end`,
    surface countdown).
11. **Audience-geography requirements done right**: CR's IP-based geo checks
    are VPN-evadable; Aether can read **audience country distribution from
    the platform APIs** (YouTube Analytics requires channel OAuth — already
    have it) and verify "≥50% EU audience" claims with real data.
12. **In-product disclosure enforcement (EU)**: require `#ad`/`#sponsorizzato`
    in submitted descriptions, refuse submissions without it
    (UCPD/AGCM-compliant by construction — and checkable via the metadata
    Aether already fetches).

### P2 — growth / ecosystem

13. **Leaderboards** (per-campaign and global earners) — pairs with existing
    weekly challenges.
14. **Referral program activation** (scaffolding exists in `lib/referral.ts`).
15. **Agency/team accounts** (CR's biggest earners are clipping agencies —
    multi-member accounts, revenue splits).
16. **Community surface**: Discord webhook per campaign (new campaign / paid
    milestones), since CR's distribution runs on Discord communities.
17. **Embeddable campaign widget / public campaign pages** for brand sites
    (CR is installable inside any whop; Aether's equivalent is a public,
    SEO-friendly campaign page + embed).
18. **Public API + webhooks** for brands (submissions, views, spend).
19. **X (Twitter) as a tracked platform** — CR supports it; niche but cheap
    once the provider abstraction is multi-platform again.

---

## 5. Where Aether is already ahead — protect these

1. **Verification-first architecture**: OAuth channel-ownership + official
   API metrics + non-billable baselines beats CR's link-submission model.
   CR's bot-fraud horror stories are the marketing pitch for this.
2. **A real fraud engine**: multi-signal scoring with reversal vs CR's
   reactive AI-flag + human discretion. Publish accuracy stats ("verified
   views you can bill against") as a brand-facing differentiator.
3. **Regulated money rails**: Stripe Connect KYC + idempotent transfers +
   reconciliation vs an internal balance ledger. In the EU (PSD2 environment)
   the internal-balance model risks e-money licensing questions; Aether's
   architecture sidesteps that.
4. **Per-creator caps and pool-exhaustion guards in SQL** — money invariants
   in the database, not in app code.
5. **EU-native posture**: GDPR banner, IT/EN i18n, EU data residency option
   via Supabase region — extend, don't dilute.
6. **The brand-side fee model** (10% of pool, visible at funding) is cleaner
   than CR's creator-side skim — keep, but consider advertising "creators
   keep 100% of their rate" as positioning against CR's 7%.

## 6. Fixes to Aether surfaced by this comparison

1. **Currency hardcoding** (`usd` in `lib/stripe/connect.ts`, USD formatting
   sprinkled in UI) — blocker, see P0-2.
2. **Per-video accounting**: earnings accrue per clip already, but there's no
   per-clip cap or floor — schema + `record_clip_earning` change, see P1-5.
3. **`account.updated` webhook sets `profiles.onboarded = true`** — under a
   CR-style funnel (link socials → join → submit) Stripe onboarding must NOT
   short-circuit app onboarding; resolve the open question from the merge
   notes.
4. **View-sync cadence visibility**: views refresh every 10 min server-side
   but creators have no "last verified at" surface — show snapshot freshness
   + next-sync countdown on the clips page (CR's hourly cadence is *worse*
   but feels better because it's visible).
5. **Submission UX parity details**: resubmit-wrong-video flow, unlimited
   submissions messaging, "only videos posted after joining" rule made
   explicit (Aether's baseline mechanism makes old videos non-billable, but
   the UI should say so before a creator wastes a submission).
6. **Brand mid-campaign changes**: CR's rule-change disputes show why rates
   and caps must be immutable post-funding (Aether's campaign-authority
   triggers already lock most of this — verify `brand_cpm_rate` and caps are
   covered, and surface "locked" in the builder UI).
7. **ToS/legal docs**: Aether lacks a Content-Rewards-style program terms
   document (legitimate-view definition, forfeiture rules, disclosure
   obligations, IP license from creator to brand). Engineering ships the
   enforcement hooks; the text needs legal review.

## 7. Suggested sequencing

- **Phase A (parity core, ~now)**: EUR (P0-2) → per-video cap/floor + flat
  bonus (P1-5/6) → auto-pay cadence (P0-3) → discovery social proof (P1-7).
- **Phase B (platform expansion)**: TikTok tracking GA (P0-1) → flagged
  state + structured moderation (P1-8) → requirements authoring (P1-9) →
  end dates (P1-10).
- **Phase C (EU moat)**: DAC7 pipeline (P0-4) → disclosure enforcement
  (P1-12) → audience-geo verification (P1-11) → program terms (Fix 7).
- **Phase D (growth)**: leaderboards, referrals, agencies, Discord, public
  API (P2).

## 8. Primary sources

- Whop Content Rewards setup guide — https://whop.com/blog/set-up-content-rewards/
- Content Rewards brand/creator guide — https://whop.com/blog/whop-content-rewards/
- Content Rewards Terms of Service — https://whop.com/content-rewards-terms-of-service/
- Official FAQ — https://contentrewards.com/faqs
- Discover marketplace — https://contentrewards.com/discover
- Whop docs (Content Rewards app) — https://docs.whop.com/memberships-and-access/third-party-apps/content-rewards
- Whop payout methods/fees — https://docs.whop.com/manage-your-business/manage-payouts/payout-methods · https://whop.com/blog/getting-paid-on-whop/
- Scale estimates — https://sacra.com/c/whop/ · https://www.sourcery.vc/p/exclusive-how-whop-hit-12-billion
- Operator guide (mechanics in practice) — https://clippa.net/blog/complete-whop-clipping-guide-2025/
- Brand post-mortem (fraud failure modes) — https://peterclaridge.com/should-you-use-whop-com-to-promote-your-saas-product
- Competitive landscape — https://www.clipaffiliates.com/blog/whop-vyro-clipping-alternatives-2026
