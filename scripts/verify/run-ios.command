#!/usr/bin/env bash
# Double-click: builds the dev app into the booted iOS Simulator and starts Metro
# against the local stack (run run-all.command first). Output: ios-run.log.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
export CI=1 EXPO_NO_TELEMETRY=1
git push -u origin build/s17-onward --tags >/dev/null 2>&1
cd apps/mobile
DEVICE="$(xcrun simctl list devices booted | sed -n 's/^ *\(iPhone[^(]*\) (.*Booted.*/\1/p' | head -1 | sed 's/ *$//')"
echo "booted: ${DEVICE:-none}" | tee ../../ios-run.log
npx expo run:ios ${DEVICE:+--device "$DEVICE"} 2>&1 | tee -a ../../ios-run.log
