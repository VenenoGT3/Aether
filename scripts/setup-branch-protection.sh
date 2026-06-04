#!/usr/bin/env bash
#
# Apply Aether's production-grade branch protection rules.
#
# Requires: GitHub CLI (`gh`) authenticated as a user with ADMIN on the repo.
#   gh auth login
#
# Usage:
#   ./scripts/setup-branch-protection.sh [owner/repo]
#
# Defaults to VenenoGT3/Aether. Re-running is safe (PUT is idempotent).
#
# Rules
#   main     -> PR required, 1 approval, status checks (typecheck/lint/test/
#               preflight) must pass & be up to date, no force-push/deletion,
#               admins included, conversations resolved.
#   staging  -> PR required, 1 approval, same status checks, no force-push.
#
# NOTE: Branch protection on PRIVATE repos requires GitHub Pro/Team/Enterprise.
set -euo pipefail

REPO="${1:-VenenoGT3/Aether}"
CHECKS='["typecheck","lint","test","preflight"]'

protect() {
  local branch="$1" approvals="$2" enforce_admins="$3"
  echo "→ Protecting ${REPO}@${branch} ..."
  gh api -X PUT "repos/${REPO}/branches/${branch}/protection" \
    --input - <<JSON
{
  "required_status_checks": { "strict": true, "contexts": ${CHECKS} },
  "enforce_admins": ${enforce_admins},
  "required_pull_request_reviews": {
    "required_approving_review_count": ${approvals},
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
  echo "✓ ${branch} protected"
}

# main: strictest (admins included).
protect main 1 true

# staging: PR + 1 approval + checks, admins not enforced for faster QA hotfixes.
protect staging 1 false

echo "Done. Verify in: https://github.com/${REPO}/settings/branches"
