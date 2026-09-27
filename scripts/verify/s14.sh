#!/usr/bin/env bash
# S14 Mac verification (P4-AUTH-08, 09, 10, 11, 17). Needs Docker Desktop running.
#   bash scripts/verify/s14.sh
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
  pnpm supabase stop >/dev/null 2>&1
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
# On a failure, show what the functions logged (no user ids or emails are logged).
fn_log_on_fail() { "$@" || { echo "--- last lines of the functions log ---"; tail -40 /tmp/onlyswap-functions.log; return 1; }; }
delete_smoke() { fn_log_on_fail env ANON_KEY="$(anon_key)" node scripts/verify/delete-smoke.mjs; }
underage_smoke() { ANON_KEY="$(anon_key)" node scripts/verify/underage-smoke.mjs; }

status_var() { pnpm -s supabase status -o env 2>/dev/null | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}\$/\1/p" | head -1; }

# Local Storage S3 stands in for R2. The functions reach it from inside
# Docker through host.docker.internal (same gateway path the phone uses);
# the phone and scripts use 127.0.0.1:54321. Written to the
# git-ignored supabase/functions/.env, which `functions serve` loads.
write_functions_env() {
  local id secret region
  id="$(status_var S3_PROTOCOL_ACCESS_KEY_ID)"
  secret="$(status_var S3_PROTOCOL_ACCESS_KEY_SECRET)"
  region="$(status_var S3_PROTOCOL_REGION)"
  if [ -z "$id" ] || [ -z "$secret" ]; then
    echo "could not read the local S3 keys from supabase status; variables available:"
    pnpm -s supabase status -o env 2>/dev/null | sed 's/=.*//'
    return 1
  fi
  cat > supabase/functions/.env <<ENV
R2_ENDPOINT=http://host.docker.internal:54321/storage/v1/s3
R2_PUBLIC_ENDPOINT=http://127.0.0.1:54321/storage/v1/s3
R2_REGION=${region:-local}
R2_ACCESS_KEY_ID=$id
R2_SECRET_ACCESS_KEY=$secret
R2_BUCKET_MEDIA=onlyswap-media
R2_BUCKET_PRIVATE=onlyswap-private
# Cloudflare's published always-pass Turnstile test secret (not a real secret).
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
ENV
  echo "wrote supabase/functions/.env (local only, git-ignored)"
}

onboarding_smoke() {
  fn_log_on_fail env ANON_KEY="$(anon_key)" SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" \
    node --experimental-strip-types scripts/verify/onboarding-smoke.mjs
}

media_smoke() {
  fn_log_on_fail env ANON_KEY="$(anon_key)" SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" \
    node --experimental-strip-types scripts/verify/media-smoke.mjs
}

step "install" pnpm install --frozen-lockfile
step "G1 lint" pnpm lint
step "G2 typecheck" pnpm typecheck
step "G3 unit tests (onboarding screens, T-UNIT-AUTH-06, T-FN-06)" pnpm test
step "local Supabase restarted (new function config)" supabase_up
step "db reset: migrations 0001-0014, 0100, seed and local buckets" pnpm supabase db reset
step "G7 pgTAP (all suites)" pnpm supabase test db
step "G4 RPC contract matches the snapshot" pnpm rpc:check
step "P3-TYPES-01 drift check" pnpm db:types:check
step "Auth smoke still passes (S10)" auth_smoke
step "functions env (local storage as R2, Turnstile test secret)" write_functions_env
step "Edge Functions served locally" functions_up
step "delete-account live still passes (S11)" delete_smoke
step "E2E-02 API half still passes (S12)" underage_smoke
step "Media live still passes (S13)" media_smoke
step "Onboarding live: waitlist-request, profile row, rules re-accept (E2E-22 API half)" onboarding_smoke
functions_down

echo ""
echo "================ S14 summary ================"
printf '%s\n' "${SUMMARY[@]}"
[ "$FAILED" = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAILED"
