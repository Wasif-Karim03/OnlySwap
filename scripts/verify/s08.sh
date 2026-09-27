#!/usr/bin/env bash
# S8 Mac verification (P3-DB-07, P3-DB-10, P3-TEST-01, P3-TEST-02, P3-DB-12, P1-CI-03). Needs Docker Desktop running.
#   bash scripts/verify/s07.sh
# Paste the summary block at the end back to Claude.
set -u
cd "$(git rev-parse --show-toplevel)"

declare -a SUMMARY=()
FAILED=0
step() {
  local name="$1"; shift
  echo ""
  echo "=== $name"
  if "$@"; then SUMMARY+=("PASS  $name"); else SUMMARY+=("FAIL  $name"); FAILED=1; fi
}

supabase_up() {
  command -v docker >/dev/null || { echo "Docker is not installed"; return 1; }
  docker info >/dev/null 2>&1 || { echo "Docker is not running: open Docker Desktop and wait until it says Running"; return 1; }
  pnpm supabase start
}

db_container() { docker ps --format '{{.Names}}' | grep -m1 '^supabase_db_'; }

psql_db() { docker exec -i "$(db_container)" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tA "$@"; }

# Row contents plus xmin: identical before and after means nothing was rewritten.
ref_checksum() {
  psql_db -c "select
    (select md5(string_agg(xmin::text||':'||t::text, ',' order by id)) from public.categories t) ||
    (select md5(string_agg(xmin::text||':'||pattern, ',' order by pattern, match)) from public.banned_words) ||
    (select md5(string_agg(xmin::text||':'||key||value::text, ',' order by key)) from public.app_config)"
}

ref_data_rerun_is_noop() {
  local before after
  before="$(ref_checksum)" || return 1
  psql_db < supabase/migrations/0100_ref_data.sql >/dev/null || return 1
  after="$(ref_checksum)" || return 1
  echo "before: $before"
  echo "after:  $after"
  [ -n "$before" ] && [ "$before" = "$after" ]
}

step "install" pnpm install --frozen-lockfile
step "G1 lint" pnpm lint
step "G2 typecheck" pnpm typecheck
step "G3 unit tests + contract logic + staging guard" pnpm test
step "local Supabase up (Docker)" supabase_up
step "db reset applies every migration (0001-0007, 0100)" pnpm supabase db reset
step "G7 pgTAP: helpers, time travel, integrity suite (todo tracked)" pnpm supabase test db
step "G4 RPC contract matches the snapshot (P1-CI-03)" pnpm rpc:check
step "P3-DB-11 re-running 0100_ref_data.sql is still a no-op" ref_data_rerun_is_noop

echo ""
echo "================ S8 summary ================"
printf '%s\n' "${SUMMARY[@]}"
[ "$FAILED" = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAILED"
