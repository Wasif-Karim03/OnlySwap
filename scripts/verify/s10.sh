#!/usr/bin/env bash
# S10 Mac verification (P3-AUTH-01, P3-AUTH-02, P3-AUTH-03 local part, P3-SEED-01). Needs Docker Desktop running.
#   bash scripts/verify/s10.sh
# Restarts local Supabase so the new Auth config (hooks, templates) loads.
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

supabase_restart() {
  command -v docker >/dev/null || { echo "Docker is not installed"; return 1; }
  docker info >/dev/null 2>&1 || { echo "Docker is not running: open Docker Desktop and wait until it says Running"; return 1; }
  pnpm supabase stop >/dev/null 2>&1
  pnpm supabase start
}

auth_smoke() {
  local env anon
  env="$(pnpm -s supabase status -o env 2>/dev/null)"
  anon="$(printf '%s\n' "$env" | sed -n 's/^ANON_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' | head -1)"
  [ -n "$anon" ] || anon="$(printf '%s\n' "$env" | sed -n 's/^PUBLISHABLE_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' | head -1)"
  [ -n "$anon" ] || { echo "could not read ANON_KEY from supabase status"; return 1; }
  ANON_KEY="$anon" node scripts/verify/auth-smoke.mjs
}

step "install" pnpm install --frozen-lockfile
step "G1 lint" pnpm lint
step "G2 typecheck" pnpm typecheck
step "G3 unit tests + contract logic + staging guard" pnpm test
step "local Supabase restarted with the S10 Auth config" supabase_restart
step "db reset: migrations 0001-0011, 0100 and seed.sql" pnpm supabase db reset
step "G7 pgTAP: auth hooks, signup trigger, seed, RLS, integrity" pnpm supabase test db
step "G4 RPC contract matches the snapshot" pnpm rpc:check
step "P3-TYPES-01 generated types still match" pnpm db:types:check
step "Auth smoke: hook refuses, code by email, claims, reviewer password" auth_smoke

echo ""
echo "================ S10 summary ================"
printf '%s\n' "${SUMMARY[@]}"
[ "$FAILED" = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAILED"
