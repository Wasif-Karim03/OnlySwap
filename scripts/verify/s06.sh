#!/usr/bin/env bash
# S6 Mac verification (P2-CMP-07..11, P2-KIT-01/02).
#   bash scripts/verify/s06.sh
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
step "G3 unit tests (components 2, kit, states gallery, tokens)" pnpm test
step "tokens dist up to date" node packages/tokens/scripts/generate.mjs --check
step "G6 expo-doctor" bash -c "cd apps/mobile && npx expo-doctor"

echo ""
echo "================ S6 summary ================"
printf '%s\n' "${SUMMARY[@]}"
cat <<'MANUAL'

Simulator checks. S6 adds no native modules, so the current dev client works:
  pnpm --filter mobile start, then press i
Profile tab > "Open component kit" (check Light and Dark, and a few accents):
  1. Photos: swipe the 4-photo carousel (count goes 1 / 4 to 4 / 4); tap a
     photo, pinch and double-tap to zoom, swipe down to close             (P2-CMP-07)
  2. Empty, error and loading: empty state matches board X36; Try again
     spins, then shows the offline error; skeletons pulse (static with
     Reduce Motion)                                                       (P2-CMP-08)
  3. Navigation: iOS and Android (pill, board N1) tab bars, step bars,
     progress bar                                                         (P2-CMP-09)
  4. Permission primers: camera, photos, notifications; primer and denied (P2-CMP-10)
  5. Dialogs: Delete a listing (spinner, then toast); Report a person
     (harassment turns block on; second report shows "Already reported") (P2-CMP-11)
  6. "Open states gallery": every X frame opens                          (P2-KIT-02)
MANUAL
[ "$FAILED" = 0 ] && echo "RESULT: PASS (automated part)" || echo "RESULT: FAIL"
exit "$FAILED"
