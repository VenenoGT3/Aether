#!/usr/bin/env bash
#
# Snapshot the current database schema to supabase/schema.sql.
#
# Why: core functions (mark_payout_paid, handle_new_user, …) have been
# CREATE OR REPLACE'd across several migrations, so "what does this function
# do right now" requires replaying history. This snapshot makes the current
# truth readable in one file. Regenerate it whenever a migration lands and
# commit the result alongside the migration.
#
# Requires: Supabase CLI authenticated and the project linked
#   supabase login && supabase link --project-ref <ref>
#
# Usage: ./scripts/dump-schema.sh

set -euo pipefail

cd "$(dirname "$0")/.."

OUT="supabase/schema.sql"

if ! command -v supabase >/dev/null 2>&1 && ! npx --no-install supabase --version >/dev/null 2>&1; then
  echo "error: Supabase CLI not found (npm i -g supabase, or npx supabase)." >&2
  exit 1
fi

SUPABASE="supabase"
command -v supabase >/dev/null 2>&1 || SUPABASE="npx --no-install supabase"

echo "Dumping linked project schema to ${OUT} …"
$SUPABASE db dump --schema public --file "$OUT"

echo "Done. Review and commit ${OUT} with your migration."
