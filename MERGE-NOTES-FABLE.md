# Merge notes — `fable` → `development` (round 2)

Covers the work after the first fable merge (`609c5fb`): the UGC/clipping
split audit fixes and the Content-Rewards-parity features. **Complete the
steps, then delete this file as part of the merge.**

## 1. Pre-merge verification

```bash
npm run typecheck && npm run lint && npm run test   # 253 tests green
npm run test:e2e                                    # 4 pass, 1 self-skip
npx next build                                      # compiles clean
```

## 2. Deploy steps

- **No new database migrations in this round** (the per-clip bounds and
  atomic-release migrations shipped in the previous merge).
- No edge-function changes in this round.
- `npm ci` after merge — this round adds `knip` as a devDependency.

## 3. Env decisions

| Variable | Action |
| --- | --- |
| `DISCLOSURE_ENFORCEMENT` | New. Default **block**: clip submissions whose YouTube title/description lack a paid-partnership marker (#ad, #sponsorizzato, …) are rejected with an actionable message. Set `warn` for QA accounts whose test videos lack disclosures, `off` to disable. EU posture says leave `block` in production. |
| `TEST_LOGIN_ACCESS_CODE` | The production test-login gate (your `968186a` decision) now additionally requires the code to be **≥16 characters** in production — shorter codes disable test login (logged at startup). Rotate the Vercel value if it's shorter. |

## 4. Behavior changes (context)

- Creator clips/UGC lists now filter by category **in the database query**
  (was client-side after the row limit — could blank one category's page for
  high-volume creators).
- Discover cards and the submission brief panel show live **pool budget
  progress** (remaining € + % used) for performance campaigns.
- Campaign builder exposes the **per-clip payout cap** and **per-clip
  qualification floor** (already enforced server-side since the previous
  merge).
- The "Gross earnings" metric on creator flow pages is labeled
  "All performance campaigns" — the wallet is shared; the old label implied
  category scope it didn't have.

## 5. Dead-code cleanup (this round)

- Removed 14 superseded files (old summary cards, wallet-ui, theme-toggle,
  unused barrels, unused ui primitives). Verified zero-reference via knip +
  grep; tsc/lint/tests/build all green after.
- `knip` is now wired (`npm run lint:dead`, config in `knip.jsonc`) and runs
  clean (exit 0).
- **Backend-ready features awaiting frontend wiring were KEPT, not deleted**
  (founder decision). See [`docs/pending-frontend-wiring.md`](docs/pending-frontend-wiring.md):
  weekly challenges, referral rewards card, transactional email (`lib/resend.ts`),
  and the client feature-flag hook all have live backends but no mounted UI.
  Each is listed in the `knip.jsonc` ignore block with a pointer; remove it
  there once connected.

## 6. After merging

Delete this file in the merge commit.
