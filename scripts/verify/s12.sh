#!/usr/bin/env bash
# S12 Mac verification (P4-AUTH-05, P4-AUTH-06, P4-AUTH-07). Needs Docker Desktop running.
#   bash scripts/verify/s12.sh
# Paste the summary block back to Claude.
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

anon_key() {
  local env key
  env="$(pnpm -s supabase status -o env 2>/dev/null)"
  key="$(printf '%s\n' "$env" | sed -n 's/^ANON_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' | head -1)"
  [ -n "$key" ] || key="$(printf '%s\n' "$env" | sed -n 's/^PUBLISHABLE_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' | head -1)"
  printf '%s' "$key"
}

FN_PID=""
functions_up() {
  pnpm supabase functions serve > /tmp/onlyswap-functions.log 2>&1 &
  FN_PID=$!
  for _ in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:54321/functions/v1/delete-account || true)"
    if [ "$code" = "401" ] || [ "$code" = "400" ]; then echo "delete-account is being served (HTTP $code without a token)"; return 0; fi
    sleep 1
  done
  echo "functions did not come up; last lines of the log:"; tail -20 /tmp/onlyswap-functions.log
  return 1
}
functions_down() { [ -n "$FN_PID" ] && kill "$FN_PID" >/dev/null 2>&1; pkill -f "supabase functions serve" >/dev/null 2>&1; return 0; }
trap functions_down EXIT

auth_smoke() { ANON_KEY="$(anon_key)" node scripts/verify/auth-smoke.mjs; }
delete_smoke() { ANON_KEY="$(anon_key)" node scripts/verify/delete-smoke.mjs; }
underage_smoke() { ANON_KEY="$(anon_key)" node scripts/verify/underage-smoke.mjs; }

step "install" pnpm install --frozen-lockfile
step "G1 lint" pnpm lint
step "G2 typecheck" pnpm typecheck
step "G3 unit tests (email, verify, age screens; T-UNIT-AUTH-04/05)" pnpm test
step "local Supabase up (Docker)" supabase_up
step "db reset: migrations 0001-0012, 0100 and seed.sql" pnpm supabase db reset
step "G7 pgTAP (all suites)" pnpm supabase test db
step "G4 RPC contract matches the snapshot" pnpm rpc:check
step "P3-TYPES-01 drift check" pnpm db:types:check
step "Auth smoke still passes (S10)" auth_smoke
step "Edge Functions served locally" functions_up
step "delete-account live: refuses without DELETE, deletes, old session dead" delete_smoke
step "E2E-02 API half: minor → account deleted → same email AGE_BLOCKED" underage_smoke
functions_down

echo ""
echo "================ S12 summary ================"
printf '%s\n' "${SUMMARY[@]}"
[ "$FAILED" = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAILED"
