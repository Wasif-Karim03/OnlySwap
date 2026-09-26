#!/usr/bin/env bash
# S1 Mac verification (docs/GOALS.md S1). Run from the repo root:
#   bash scripts/verify/s01.sh            automated checks only
#   bash scripts/verify/s01.sh --run      also builds and launches on the iOS simulator and Android emulator
# Paste the summary block at the end back to Claude.
set -u
cd "$(git rev-parse --show-toplevel)"

RUN_APPS=0
[ "${1:-}" = "--run" ] && RUN_APPS=1

# Android Studio ships a JDK; use it when JAVA_HOME isn't set.
AS_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
if [ -z "${JAVA_HOME:-}" ] && [ -d "$AS_JBR" ]; then export JAVA_HOME="$AS_JBR"; fi
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then export ANDROID_HOME="$HOME/Library/Android/sdk"; fi
if [ -n "${ANDROID_HOME:-}" ]; then export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"; fi

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

xcode_ok() {
  xcodebuild -version 2>/dev/null | head -1 || { echo "Xcode not found: install it from the App Store, open it once, then run: sudo xcode-select -s /Applications/Xcode.app"; return 1; }
  ios_sim_udid >/dev/null || { echo "No iPhone simulator: Xcode > Settings > Components > install an iOS simulator runtime"; return 1; }
  echo "simulator: $(ios_sim_udid)"
  pod --version >/dev/null 2>&1 || { echo "CocoaPods missing: brew install cocoapods"; return 1; }
}

android_ok() {
  [ -n "${JAVA_HOME:-}" ] && "$JAVA_HOME/bin/java" -version 2>&1 | head -1 || { echo "No JDK: install Android Studio (it bundles one)"; return 1; }
  [ -n "${ANDROID_HOME:-}" ] && [ -x "$ANDROID_HOME/platform-tools/adb" ] || { echo "No Android SDK: open Android Studio once and finish the setup wizard (SDK + emulator)"; return 1; }
  echo "ANDROID_HOME=$ANDROID_HOME"
}

# First booted iPhone simulator, else the first available one.
ios_sim_udid() {
  local line
  line="$(xcrun simctl list devices available 2>/dev/null | grep -E '^ +iPhone' | grep Booted | head -1)"
  [ -z "$line" ] && line="$(xcrun simctl list devices available 2>/dev/null | grep -E '^ +iPhone' | head -1)"
  [ -n "$line" ] || return 1
  printf '%s\n' "$line" | sed -E 's/.*\(([0-9A-F-]{36})\).*/\1/'
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
  local udid
  udid="$(ios_sim_udid)" || return 1
  xcrun simctl boot "$udid" 2>/dev/null || true
  open -a Simulator
  (cd apps/mobile && APP_VARIANT=development npx expo prebuild --clean -p ios >/dev/null && npx expo run:ios --no-bundler --configuration Debug --device "$udid")
}

run_android() {
  local avd
  if ! adb devices | grep -qE 'emulator-[0-9]+[[:space:]]+device'; then
    avd="$(emulator -list-avds | head -1)"
    [ -n "$avd" ] || { echo "No emulator: Android Studio > Device Manager > create a Pixel device"; return 1; }
    (emulator -avd "$avd" >/dev/null 2>&1 &)
    adb wait-for-device
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
  fi
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
step "Android toolchain (JDK + SDK)" android_ok
step "P1-SETUP-04 T-STORE merged Android manifest (release)" merged_manifest_check

if [ "$RUN_APPS" = 1 ]; then
  echo ""
  echo "Starting Metro in the background for the simulator runs..."
  (cd apps/mobile && npx expo start --dev-client >/tmp/onlyswap-metro.log 2>&1 &)
  step "Xcode + iPhone simulator" xcode_ok
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
