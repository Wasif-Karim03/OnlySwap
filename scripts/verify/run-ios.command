#!/usr/bin/env bash
# Double-click: builds the dev app into the booted iOS Simulator (first time
# only), starts Metro against the local stack and opens the app. Output: ios-run.log.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
export CI=1 EXPO_NO_TELEMETRY=1
caffeinate -dimsu -w $$ &
git push -u origin build/s17-onward --tags >/dev/null 2>&1
cd apps/mobile
{
  xcrun simctl list devices booted | grep -q Booted || xcrun simctl boot "iPhone 18 Pro"
  open -a Simulator 2>/dev/null
  if ! xcrun simctl get_app_container booted app.onlyswap >/dev/null 2>&1; then
    npx expo run:ios --no-bundler
  fi
  npx expo start --dev-client --port 8081 &
  for _ in $(seq 1 60); do curl -fs http://localhost:8081/status >/dev/null && break; sleep 1; done
  xcrun simctl terminate booted app.onlyswap >/dev/null 2>&1
  xcrun simctl openurl booted "exp+onlyswap://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"
  echo "app opened $(date)"
  wait
} 2>&1 | tee ../../ios-run.log
