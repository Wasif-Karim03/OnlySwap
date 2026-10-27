#!/usr/bin/env bash
# Adds or updates a school from supabase/campuses/<slug>.sql.
#   bash scripts/deploy/add-campus.command owu          # staging
#   bash scripts/deploy/add-campus.command owu prod     # production
# Uses the project the repo is linked to; the target is checked first.
# Output: campus.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
SLUG="${1:?usage: add-campus.command <slug> [staging|prod]}"
TARGET="${2:-staging}"
SQL="supabase/campuses/$SLUG.sql"
[ -f "$SQL" ] || { echo "No $SQL"; exit 1; }
case "$TARGET" in
  staging) ACCOUNT=onlyswap-staging; STATE=.env.staging; REFVAR=STAGING_REF ;;
  prod) ACCOUNT=onlyswap-prod; STATE=.env.production; REFVAR=PROD_REF
        case "$SLUG" in *mock*) echo "Mock data never goes to production."; exit 1 ;; esac ;;
  *) echo "target must be staging or prod"; exit 1 ;;
esac
[ -f "$STATE" ] || { echo "No $STATE: run the $TARGET setup script first"; exit 1; }
REF=$(grep "^$REFVAR=" "$STATE" | cut -d= -f2)
PW=$(security find-generic-password -a "$ACCOUNT" -s onlyswap-db-password -w 2>/dev/null)
[ -n "$PW" ] && export SUPABASE_DB_PASSWORD="$PW"
pnpm -s supabase link --project-ref "$REF" >/dev/null 2>&1 || { echo "link to $REF failed"; exit 1; }
echo "== Adding $SLUG to $TARGET ($REF)"
pnpm -s supabase db query --linked -f "$SQL" 2>&1 | tee campus.log
