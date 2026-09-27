#!/usr/bin/env bash
# S9 Mac verification (P3-DB-08, P3-DB-09, P3-SAFE-01, P3-TYPES-01). Needs Docker Desktop running.
#   bash scripts/verify/s09.sh
# It also writes packages/shared/src/db.ts (generated types). Paste the summary
# block at the end back to Claude.
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

# T-SEC-19 against the real Supabase roles: anon has no table privileges at all.
anon_has_no_tables() {
  local n
  n="$(psql_db -c "select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'")" || return 1
  echo "anon table grants in public: $n"
  [ "$n" = "0" ]
}

step "install" pnpm install --frozen-lockfile
step "G1 lint" pnpm lint
step "G2 typecheck" pnpm typecheck
step "G3 unit tests + contract logic + staging guard" pnpm test
step "local Supabase up (Docker)" supabase_up
step "db reset applies every migration (0001-0011, 0100)" pnpm supabase db reset
step "G7 pgTAP: RLS matrix, views, safety RPCs, integrity" pnpm supabase test db
step "T-SEC-19 anon has no table grants (real roles)" anon_has_no_tables
step "G4 RPC contract matches the snapshot" pnpm rpc:check
step "P3-TYPES-01 generate packages/shared/src/db.ts" pnpm db:types
step "P3-TYPES-01 drift check passes on the fresh file" pnpm db:types:check

echo ""
echo "================ S9 summary ================"
printf '%s\n' "${SUMMARY[@]}"
[ "$FAILED" = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAILED"
