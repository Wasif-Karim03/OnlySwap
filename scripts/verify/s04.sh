#!/usr/bin/env bash
# S4 Mac verification (P2-TOK-01..03, P2-FONT-01, P2-MOT-01), plus the S3 part A
# Simulator checks, since both use one dev-client build.
#   bash scripts/verify/s04.sh
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
step "G3 unit tests (incl. T-UNIT-TOK-01, tokens match DESIGN_SYSTEM)" pnpm test
step "P2-TOK-01 generated token files up to date" node packages/tokens/scripts/generate.mjs --check
step "G6 expo-doctor" bash -c "cd apps/mobile && npx expo-doctor"

echo ""
echo "================ S4 summary ================"
printf '%s\n' "${SUMMARY[@]}"
cat <<'MANUAL'

Simulator checks. Rebuild the dev client once (S3 added expo-crypto):
  cd apps/mobile && npx eas-cli@latest build -p ios --profile development-simulator
  (yes to "Install and run on a simulator"), then: cd ../.. && pnpm --filter mobile start, press i
Profile tab > "Open developer spikes":
  S3  1. MMKV: tap "Add one", press r to reload, the number stays                  (P1-SPIKE-04)
  S3  2. Keyboard: tap the field, it stays above the keyboard                        (P1-SPIKE-04)
  S3  3. Age: tap "Ask for age range", paste the text it shows                        (P1-SPIKE-03)
  S4  4. Appearance: tap System / Light / Dark, the whole app flips at once, no flash  (P2-TOK-03)
         then quit the app (swipe it away) and reopen: it starts in the chosen mode with no flash
  S4  5. Type scale: all 8 rows readable; Settings app > Accessibility > Display & Text Size >
         Larger Text, drag to max: rows grow, the "Photo overlay" line stops growing  (P2-FONT-01)
  S4  6. Motion: tap "Show success", the check draws; Settings > Accessibility > Motion >
         Reduce Motion ON, back in the app the label says "reduced" and the check fades in  (P2-MOT-01)
Screenshot light + dark + max text size (Cmd+S) and send them.
MANUAL
[ "$FAILED" = 0 ] && echo "RESULT: PASS (automated part)" || echo "RESULT: FAIL"
exit "$FAILED"
