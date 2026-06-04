# GitHub Setup — Status

Quick reference for Aether's GitHub / CI configuration: what's in place and the one
step that still needs a repo admin. Developer-facing detail (branch strategy, PR flow,
deployment) lives in
[`PRODUCTION-README.md`](./PRODUCTION-README.md#github--deployment-workflow).

## Current status

| Item | Status |
| --- | --- |
| `main` / `staging` / `development` branches | ✅ Created & pushed to `origin` |
| CI quality gate (`.github/workflows/ci.yml`) | ✅ Committed & verified green |
| Branch-protection script (`scripts/setup-branch-protection.sh`) | ✅ Committed, ready to run |
| Branch protection on `main` / `staging` | ⚠️ **Pending — requires repo admin** |

## ✅ Already done (no admin needed)

- **Branches.** `main` (production), `staging` (QA / pre-production), and
  `development` (active work) all exist on `origin`.
- **CI pipeline.** [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on PRs
  **and** pushes to the three branches, with four parallel required checks —
  `typecheck`, `lint`, `test`, `preflight` (Node 20, cached `npm ci`, least-privilege,
  auto-cancel of superseded runs). Verified green.
- **Branch-protection automation.**
  [`scripts/setup-branch-protection.sh`](./scripts/setup-branch-protection.sh) is
  committed so an admin can apply the rules in one command.
- **Docs.** Branch strategy, PR workflow, CI, and deployment topology are documented in
  [`PRODUCTION-README.md`](./PRODUCTION-README.md#github--deployment-workflow).

## ⚠️ Requires repo admin (branch protection)

Branch protection could **not** be applied programmatically: the connected token lacks
`admin` on `VenenoGT3/Aether` (GitHub's protection API returns `404` without it), and
protection on a **private** repo requires GitHub Pro / Team / Enterprise.

A repo admin completes it once — run the script:

```bash
./scripts/setup-branch-protection.sh   # defaults to VenenoGT3/Aether
```

…or apply it equivalently in the UI — **Settings → Branches → Add branch protection rule**:

- **`main`**
  - Require a pull request before merging — **1 approval**
  - Require status checks to pass — `typecheck`, `lint`, `test`, `preflight`
    (+ "Require branches to be up to date before merging")
  - Require conversation resolution before merging
  - Do **not** allow force pushes · Do **not** allow deletions
  - Include administrators
- **`staging`**
  - Require a pull request before merging — **1 approval**
  - Require the same status checks
  - Do **not** allow force pushes

Once applied, the workflow is enforced: no direct pushes to `main` / `staging`, and
every change ships through a reviewed, CI-green pull request.

## Verify

```bash
git ls-remote --heads origin                              # main, staging, development
cat .github/workflows/ci.yml                              # CI workflow present
gh api repos/VenenoGT3/Aether/branches/main/protection    # 200 once an admin applies it
```
