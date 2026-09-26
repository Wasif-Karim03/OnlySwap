#!/usr/bin/env bash
# S1 Mac verification (docs/GOALS.md S1). Run from the repo root:
#   bash scripts/verify/s01.sh            automated checks only
#   bash scripts/verify/s01.sh --run      also builds and launches on the iOS simulator and Android emulator
# Paste the summary block at the end back to Claude.
set -u
cd "$(git rev-parse --show-toplevel)"

RUN_APPS=0
[ "${1:-}" = "--run" ] && RUN_APPS=1

declare -a SUMMARY=()
FAILED=0
step() {
  local name="$1"; shift
  echo ""
  echo "=== $name"
  if "$@"; then
    SUMMARY+=("PASS  $name")
  else
    SUMMARY+=("FAIL  $name")
    FAILED=1
  fi
}

node_ok() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  echo "node $(node -v), pnpm $(pnpm -v 2>/dev/null || echo missing)"
  [ "$major" -ge 22 ] && command -v pnpm >/dev/null
}

prebuild_check() {
  local variant="$1"
  (cd apps/mobile && APP_VARIANT="$variant" CI=1 npx expo prebuild --clean --no-install >/dev/null) &&
    node scripts/verify/check-prebuild.mjs --variant "$variant"
}

merged_manifest_check() {
  (cd apps/mobile && APP_VARIANT=production CI=1 npx expo prebuild --clean --no-install -p android >/dev/null) || return 1
  (cd apps/mobile/android && ./gradlew -q :app:processReleaseMainManifest) || return 1
  local merged
  merged="$(find apps/mobile/android/app/build/intermediates -path '*release*' -name AndroidManifest.xml | grep -i merged | head -1)"
  echo "merged manifest: $merged"
  [ -n "$merged" ] && node scripts/verify/check-prebuild.mjs --merged "$merged"
}

run_ios() {
  (cd apps/mobile && APP_VARIANT=development npx expo prebuild --clean -p ios >/dev/null && npx expo run:ios --no-bundler --configuration Debug)
}

run_android() {
  (cd apps/mobile && APP_VARIANT=development npx expo prebuild --clean -p android >/dev/null && npx expo run:android --no-bundler --variant debug)
}

step "toolchain (Node >= 22, pnpm)" node_ok
step "P1-SETUP-01 pnpm install (frozen lockfile)" pnpm install --frozen-lockfile
step "G1 lint + prettier" pnpm lint
step "G2 typecheck" pnpm typecheck
step "G3 unit tests" pnpm test
step "G5 dependency audit (high)" pnpm audit --audit-level high
step "P1-SETUP-03 / G6 expo-doctor" bash -c "cd apps/mobile && npx expo-doctor"
step "P1-SETUP-04 T-STORE prebuild (development)" prebuild_check development
step "P1-SETUP-04 T-STORE prebuild (production)" prebuild_check production
step "P1-SETUP-04 T-STORE merged Android manifest (release)" merged_manifest_check

if [ "$RUN_APPS" = 1 ]; then
  echo ""
  echo "Starting Metro in the background for the simulator runs..."
  (cd apps/mobile && npx expo start --dev-client >/tmp/onlyswap-metro.log 2>&1 &)
  step "P1-SETUP-02 build + launch on iOS simulator" run_ios
  step "P1-SETUP-02 build + launch on Android emulator" run_android
  echo "Check on each: app opens on Discover; tabs read Discover, Sell, Inbox, Profile; portrait only."
fi

echo ""
echo "================ S1 summary ================"
printf '%s\n' "${SUMMARY[@]}"
echo "Manual (EAS + phones, see PR body): P1-SETUP-05 eas build -p ios --profile development; P1-SETUP-06 launch on both phones"
[ "$FAILED" = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAILED"
