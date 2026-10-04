#!/usr/bin/env bash
# Builds the OnlySwap Android development app (an APK) in Expo's free cloud
# (counts toward the 15 Android builds a month). If you are not logged in to
# Expo yet, it asks for your Expo password here in Terminal. Output:
# android-build.log (git-ignored). The install link is printed at the end.
cd "$(dirname "$0")/../../apps/mobile" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG=../../android-build.log
echo "== $(date)" > "$LOG"
if ! npx -y eas-cli@latest whoami >> "$LOG" 2>&1; then
  echo "Log in to Expo (account wasifkarim03):"
  npx -y eas-cli@latest login
  npx -y eas-cli@latest whoami >> "$LOG" 2>&1 || { echo "login failed" >> "$LOG"; exit 1; }
fi
npx -y eas-cli@latest build -p android --profile development --non-interactive --no-wait 2>&1 | tee -a "$LOG"
echo "build exit: ${PIPESTATUS[0]}" >> "$LOG"
