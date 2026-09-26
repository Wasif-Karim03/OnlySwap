#!/usr/bin/env bash
# S5 Mac verification (P2-CMP-01..06, component kit).
#   bash scripts/verify/s05.sh
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
step "G3 unit tests (components, tokens)" pnpm test
step "icons match the design board" node scripts/generate-icons.mjs --check
step "G6 expo-doctor" bash -c "cd apps/mobile && npx expo-doctor"

echo ""
echo "================ S5 summary ================"
printf '%s\n' "${SUMMARY[@]}"
cat <<'MANUAL'

Simulator checks. S5 adds react-native-svg (native), so rebuild the dev client once:
  cd apps/mobile && npx eas-cli@latest build -p ios --profile development-simulator
  (yes to install on the simulator), then: cd ../.. && pnpm --filter mobile start, press i
Profile tab > "Open component kit". Check in Light and Dark (switch at the top):
  1. Buttons: 5 variants, loading keeps its width, disabled is faded      (P2-CMP-01)
  2. Inputs: tap a field for the ink ring; the name field shows the error;
     type in Description past 36 chars (amber) and 40 (red); OTP: type 6 digits,
     then "Show code error" shakes the cells                               (P2-CMP-02)
  3. Open sheet: type in "Your offer" with the keyboard up (Cmd+K for the
     on-screen keyboard), the sheet rides above it; drag down to close   (P2-CMP-04)
  4. Toasts: success, undo (5 s), error. Offline: Device Hub > More (...) >
     turn off Wi-Fi on the Mac briefly; the offline banner slides in       (P2-CMP-05)
  5. Cards, rows, tags, avatars look like the Settings screen (F10)        (P2-CMP-06)
Send screenshots of the kit in light and dark.
MANUAL
[ "$FAILED" = 0 ] && echo "RESULT: PASS (automated part)" || echo "RESULT: FAIL"
exit "$FAILED"
