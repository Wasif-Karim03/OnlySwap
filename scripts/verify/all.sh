#!/usr/bin/env bash
# Whole-build Mac verification (S18 to S44 in one run, DEC 56). Needs Docker Desktop.
#   bash scripts/verify/all.sh
# Paste the summary block back to Claude. Device checks come after, in the
# testing phase (docs/TESTING.md §3 and §4).
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
  # A `functions serve` left running (e.g. s14-sim.sh serve) holds the edge
  # runtime container and makes `supabase start` fail; clear it first.
  pkill -f "supabase functions serve" >/dev/null 2>&1
  docker rm -f supabase_edge_runtime_onlyswap >/dev/null 2>&1
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

account_smoke() {
  fn_log_on_fail env ANON_KEY="$(anon_key)" SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" \
    node scripts/verify/account-smoke.mjs
}

# The local seed's reviewer password; seed-review sets the same one so the
# other smokes keep working. Staging uses its own (scripts/seed-review.sh).
review_smoke() {
  SUPABASE_URL=http://127.0.0.1:54321 SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" REVIEW_PASSWORD=local-review-only \
    node --no-warnings --experimental-strip-types scripts/seed-review.ts &&
  ANON_KEY="$(anon_key)" SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" REVIEW_PASSWORD=local-review-only \
    node scripts/verify/review-smoke.mjs
}

post_smoke() {
  fn_log_on_fail env ANON_KEY="$(anon_key)" SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" \
    node scripts/verify/post-smoke.mjs
}

sell_smoke() {
  fn_log_on_fail env ANON_KEY="$(anon_key)" SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" \
    node scripts/verify/sell-smoke.mjs
}

media_smoke() {
  fn_log_on_fail env ANON_KEY="$(anon_key)" SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" \
    node --experimental-strip-types scripts/verify/media-smoke.mjs
}

step "install" pnpm install --frozen-lockfile
step "G1 lint" pnpm lint
step "G2 typecheck" pnpm typecheck
step "G3 unit tests (meetup step, posted + share card, cleanup-drafts)" pnpm test
step "local Supabase restarted (new function config)" supabase_up
step "db reset: migrations 0001-0017, 0100, seed and local buckets" pnpm supabase db reset
step "G7 pgTAP (all suites)" pnpm supabase test db
step "G4 RPC contract matches the snapshot" pnpm rpc:check
step "P3-TYPES-01 drift check" pnpm db:types:check
step "Auth smoke still passes (S10)" auth_smoke
step "functions env (local storage as R2, Turnstile test secret)" write_functions_env
step "Edge Functions served locally" functions_up
step "delete-account live still passes (S11)" delete_smoke
step "E2E-02 API half still passes (S12)" underage_smoke
step "Media live still passes (S13)" media_smoke
step "Onboarding live still passes (S14)" onboarding_smoke
step "Account safety live still passes (S15)" account_smoke
step "P4-AUTH-15 reviewers still sign in (S15)" review_smoke
step "Sell live still passes (S16)" sell_smoke
offer_race() { ANON_KEY="$(anon_key)" SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" node scripts/verify/offer-race.mjs; }
security_live() { fn_log_on_fail env ANON_KEY="$(anon_key)" SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" node scripts/verify/security.mjs; }
fire_all() { ANON_KEY="$(anon_key)" SERVICE_KEY="$(status_var SERVICE_ROLE_KEY)" node --experimental-strip-types scripts/fire-all-notifications.ts; }
load_feed() {
  if command -v psql >/dev/null; then psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f scripts/load/feed.sql
  else docker exec -i supabase_db_onlyswap psql -U postgres -d postgres < scripts/load/feed.sql; fi
}
site_build() {
  PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 PUBLIC_SUPABASE_ANON_KEY="$(anon_key)" SITE_URL=http://localhost:4321 \
    pnpm --filter site build
}
admin_build() {
  VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY="$(anon_key)" pnpm --filter admin build
}
web_e2e() {
  pnpm --filter e2e-web exec playwright install chromium >/dev/null || return 1
  (cd apps/site && npx astro preview --force --port 4321 >/tmp/onlyswap-site.log 2>&1 &)
  (cd apps/admin && npx vite preview --port 5173 >/tmp/onlyswap-admin.log 2>&1 &)
  sleep 5
  SITE_URL=http://localhost:4321 ADMIN_URL=http://localhost:5173 pnpm --filter e2e-web e2e
  local rc=$?
  pkill -f "astro preview" >/dev/null 2>&1; pkill -f "vite preview" >/dev/null 2>&1
  return $rc
}
prebuild_check() {
  (cd apps/mobile && APP_VARIANT=production npx expo prebuild --clean --no-install) &&
    node scripts/verify/check-prebuild.mjs --variant production
}

step "install" pnpm install --frozen-lockfile
step "G1 lint" pnpm lint
step "G2 typecheck (mobile, admin, site, e2e)" pnpm typecheck
step "G3 unit tests (Jest, node tests, legal copy check)" pnpm test
step "local Supabase restarted" supabase_up
step "db reset: migrations 0001-0032, 0100, seed" pnpm supabase db reset
step "G7 pgTAP (all suites, incl. admin, public_site, security)" pnpm supabase test db
step "G4 RPC contract matches the snapshot" pnpm rpc:check
step "P3-TYPES-01 drift check" pnpm db:types:check
step "functions env (local storage as R2, Turnstile test secret)" write_functions_env
step "Edge Functions served locally" functions_up
step "Auth smoke (S10)" auth_smoke
step "delete-account live (S11)" delete_smoke
step "E2E-02 API half (S12)" underage_smoke
step "Media live (S13)" media_smoke
step "Onboarding live (S14)" onboarding_smoke
step "Account safety live (S15)" account_smoke
step "Reviewers sign in (S15)" review_smoke
step "Sell live (S16)" sell_smoke
step "Post live (S17)" post_smoke
step "Offer race: one accept wins (S22)" offer_race
step "Every notification type fires (S28, S29)" fire_all
step "Security suite, live half (S41 T-SEC)" security_live
step "Load: feed and search p95 at 10k listings (S41 Perf-06/08)" load_feed
step "Site builds (S37, S38)" site_build
step "Admin builds (S34-S36)" admin_build
step "Playwright site + admin with axe (S40)" web_e2e
step "Production prebuild: permissions and plugins (T-STORE)" prebuild_check
functions_down

echo ""
echo "================ Whole-build summary ================"
printf '%s\n' "${SUMMARY[@]}"
[ "$FAILED" = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
cat <<'MSG'

Ready to test on the Simulator (local stack is still running):
  pnpm --filter mobile start            # then: npx expo run:ios
  Sign in as aisha@osu.edu (or ben@osu.edu); the code arrives at http://127.0.0.1:54324 (Mailpit).
  Reviewer: I already have an account → appreview@review.onlyswap.test / local-review-only
  Admin console: pnpm --filter admin dev (make yourself admin first, OWNER_TODO 13).
MSG
exit "$FAILED"
