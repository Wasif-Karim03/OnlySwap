#!/usr/bin/env bash
# Adds or updates a school on STAGING from supabase/campuses/<slug>.sql.
#   bash scripts/deploy/add-campus.command owu
# Uses the linked staging project (run staging-supabase.command once first).
# Output: campus.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
SLUG="${1:?usage: add-campus.command <slug>}"
SQL="supabase/campuses/$SLUG.sql"
[ -f "$SQL" ] || { echo "No $SQL"; exit 1; }
PW=$(security find-generic-password -a onlyswap-staging -s onlyswap-db-password -w 2>/dev/null)
[ -n "$PW" ] && export SUPABASE_DB_PASSWORD="$PW"
echo "== Adding $SLUG to staging"
pnpm -s supabase db query --linked -f "$SQL" 2>&1 | tee campus.log
