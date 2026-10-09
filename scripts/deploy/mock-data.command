#!/usr/bin/env bash
# STAGING ONLY (DEC 92): mock sellers, listings with photos and the mock seller
# bot for one school, so the owner can test buying and selling alone.
#   bash scripts/deploy/mock-data.command owu            # add or refresh (safe to re-run)
#   bash scripts/deploy/mock-data.command owu --remove   # stop the bot, remove the mock data
#   bash scripts/deploy/mock-data.command owu --status   # what the bot did lately
# Needs staging-supabase.command (linked project, Keychain password) and
# cloudflare-staging.command (wrangler login, staging bucket) run once before.
# SQL: supabase/campuses/<slug>-mock.sql and <slug>-mock-remove.sql.
# Output: mock.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
set -o pipefail
SLUG="${1:?usage: mock-data.command <slug> [--remove|--status]}"
MODE="${2:-apply}"
BUCKET=onlyswap-media-staging
PREFIX=c/mock/l
PHOTOS=supabase/campuses/mock-photos
SQL="supabase/campuses/$SLUG-mock.sql"
REMOVE_SQL="supabase/campuses/$SLUG-mock-remove.sql"
LOG=mock.log
: > "$LOG"
WR() { npx -y wrangler@4 "$@"; }
say() { echo; echo "== $*" | tee -a "$LOG"; }
die() { echo "STOPPED: $*" | tee -a "$LOG"; exit 1; }
envval() { grep -E "^$1=" .env.staging 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"'"; }
run_sql() { # file
  local out rc
  out=$(mktemp)
  pnpm -s supabase db query --linked -f "$1" >"$out" 2>&1; rc=$?
  tee -a "$LOG" <"$out"
  cp "$out" /tmp/onlyswap-mock-last.txt
  rm -f "$out"
  return $rc
}

[ -f "$SQL" ] && [ -f "$REMOVE_SQL" ] || die "no $SQL or $REMOVE_SQL"

# Staging only: the linked project must be the staging project.
STAGING_REF=$(envval STAGING_REF)
LINKED_REF=$(cat supabase/.temp/project-ref 2>/dev/null)
[ -n "$STAGING_REF" ] || die "no STAGING_REF in .env.staging (run scripts/deploy/staging-supabase.command first)"
[ "$STAGING_REF" = "$LINKED_REF" ] || die "linked project '$LINKED_REF' is not staging '$STAGING_REF' (pnpm supabase link --project-ref $STAGING_REF)"
PW=$(security find-generic-password -a onlyswap-staging -s onlyswap-db-password -w 2>/dev/null)
[ -n "$PW" ] && export SUPABASE_DB_PASSWORD="$PW"
MEDIA_URL=$(envval EXPO_PUBLIC_MEDIA_URL)

status_sql() {
  local f
  f=$(mktemp)
  cat >"$f" <<'EOF'
select j.active as bot_active,
       (select d.status || ' at ' || to_char(d.start_time, 'HH24:MI:SS') || coalesce(' ' || nullif(d.return_message, ''), '')
          from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) as last_run,
       (select count(*) from mock.log g where g.ok) as actions_ok,
       (select count(*) from mock.log g where not g.ok) as actions_failed,
       (select string_agg(x.line, ' | ' order by x.id desc)
          from (select g.id, to_char(g.at, 'MM-DD HH24:MI') || ' ' || g.action
                       || case when g.ok then ' ok' else ' FAILED ' || coalesce(g.detail, '') end as line
                  from mock.log g order by g.id desc limit 10) x) as recent
from cron.job j where j.jobname = 'mock_bot';
EOF
  run_sql "$f"; local rc=$?
  rm -f "$f"
  return $rc
}

if [ "$MODE" = "--status" ]; then
  say "Mock bot status ($SLUG)"
  status_sql || die "status query failed (see $LOG)"
  exit 0
fi

if [ "$MODE" = "--remove" ]; then
  say "1/2 Stop the bot and remove the mock data ($SLUG)"
  run_sql "$REMOVE_SQL" || die "remove SQL failed (see $LOG)"
  INUSE=$(grep -oE 'MOCK_PHOTOS_IN_USE=[0-9]+' /tmp/onlyswap-mock-last.txt | head -1 | cut -d= -f2)
  say "2/2 Photos in R2 ($BUCKET/$PREFIX)"
  if [ "$INUSE" = "0" ]; then
    WR whoami >/dev/null 2>&1 || WR login || die "wrangler login failed"
    for f in "$PHOTOS"/*.webp; do
      WR r2 object delete "$BUCKET/$PREFIX/$(basename "$f")" --remote >>"$LOG" 2>&1 \
        && echo "deleted $(basename "$f")" || echo "could not delete $(basename "$f") (see $LOG)"
    done
  else
    echo "kept: ${INUSE:-unknown} rows still point at them (a real chat or a kept listing)" | tee -a "$LOG"
  fi
  echo "DONE $(date)" | tee -a "$LOG"
  exit 0
fi

[ "$MODE" = "apply" ] || die "unknown option $MODE"

say "1/3 Upload $(find "$PHOTOS" -name '*.webp' | wc -l | tr -d ' ') photos to R2 ($BUCKET/$PREFIX)"
WR whoami >/dev/null 2>&1 || WR login || die "wrangler login failed"
FAILED=0
for f in "$PHOTOS"/*.webp; do
  if WR r2 object put "$BUCKET/$PREFIX/$(basename "$f")" --file "$f" --content-type image/webp --remote >>"$LOG" 2>&1; then
    printf '.'
  else
    FAILED=$((FAILED + 1)); printf 'x'
  fi
done
echo
[ "$FAILED" -eq 0 ] || die "$FAILED uploads failed (see $LOG)"

say "2/3 Mock users, listings and the bot ($SQL)"
run_sql "$SQL" || die "SQL failed (see $LOG)"

say "3/3 Check"
if [ -n "$MEDIA_URL" ]; then
  echo "photo via the media Worker: $(curl -s -o /dev/null -w '%{http_code}' "$MEDIA_URL/$PREFIX/bicycle_thumb.webp") (want 200)" | tee -a "$LOG"
fi
echo "waiting 70 s for the first bot run..."
sleep 70
status_sql || echo "status query failed (see $LOG)"
echo "DONE $(date)" | tee -a "$LOG"
