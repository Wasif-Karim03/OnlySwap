#!/usr/bin/env bash
# S3 Mac verification, part A (P1-LIB-01, P1-SPIKE-03, P1-SPIKE-04).
#   bash scripts/verify/s03.sh
# P1-LIB-02 (Sentry) and P1-SPIKE-01 (email) need accounts and come in part B.
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

step "install" pnpm install --frozen-lockfile
step "G1 lint" pnpm lint
step "G2 typecheck" pnpm typecheck
step "G3 unit tests (T-UNIT-LIB-01/02/03/08, spikes)" pnpm test
step "G6 expo-doctor" bash -c "cd apps/mobile && npx expo-doctor"

echo ""
echo "================ S3 (part A) summary ================"
printf '%s\n' "${SUMMARY[@]}"
cat <<'MANUAL'

Simulator checks (new native module expo-crypto, so rebuild the dev client once):
  cd apps/mobile
  npx eas-cli@latest build -p ios --profile development-simulator
  (answer yes to "Install and run on a simulator")
  cd ../.. && pnpm --filter mobile start      then press i
In the app: Profile tab > "Open developer spikes"
  1. MMKV: tap "Add one" a few times, press r in the terminal to reload, the number stays   (P1-SPIKE-04)
  2. Unistyles: tap "Switch theme", the screen flips light/dark instantly                   (P1-SPIKE-04)
  3. Keyboard: tap the field, it stays above the keyboard                                    (P1-SPIKE-04)
  4. Age: tap "Ask for age range", paste the text it shows                                    (P1-SPIKE-03)
MANUAL
[ "$FAILED" = 0 ] && echo "RESULT: PASS (automated part)" || echo "RESULT: FAIL"
exit "$FAILED"
