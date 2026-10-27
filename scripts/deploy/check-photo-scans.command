#!/usr/bin/env bash
# Read-only staging check for photo screening (DEC 152).
#   bash scripts/deploy/check-photo-scans.command
# Links the repo to onlyswap-staging (by name, never prod) and prints the
# private.photo_scans queue: counts by status/reason and the latest 15 rows.
# Answers the open question in docs/runbooks/photo-screening.md: if every row
# ends `failed` with attempts=3, the model is not reading .webp.
# Output also goes to photo-scans.log (git-ignored). Changes nothing.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
set -o pipefail
NAME=onlyswap-staging
LOG=photo-scans.log
: > "$LOG"
SB() { pnpm -s supabase "$@"; }
die() { echo "STOPPED: $*" | tee -a "$LOG"; exit 1; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);$1})"; }

SB projects list -o json >/dev/null 2>&1 || SB login || die "login failed"
REF=$(SB projects list -o json | json "const p=(Array.isArray(j)?j:[]).find(p=>p.name==='$NAME');console.log(p?(p.ref||p.id):'')")
[ -n "$REF" ] || die "could not find $NAME"
PW=$(security find-generic-password -a "$NAME" -s onlyswap-db-password -w 2>/dev/null)
[ -n "$PW" ] || die "staging DB password not in Keychain"
export SUPABASE_DB_PASSWORD="$PW"
SB link --project-ref "$REF" >/dev/null 2>&1 || die "link failed"
echo "staging ref: $REF" | tee -a "$LOG"

run() { echo; echo "== $1" | tee -a "$LOG"; SB db query --linked "$2" 2>&1 | tee -a "$LOG"; }
run "queue by status" \
  "select status, reason, attempts, count(*) from private.photo_scans group by 1,2,3 order by 1,2,3;"
run "latest 15" \
  "select id, kind, status, attempts, reason, right(path, 40) as path, created_at, scanned_at from private.photo_scans order by id desc limit 15;"
run "scan job runs (last 10)" \
  "select status, left(return_message, 80) as msg, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'scan_photos') order by start_time desc limit 10;"
echo; echo "Saved to $LOG"
