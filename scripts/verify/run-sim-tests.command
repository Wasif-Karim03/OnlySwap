#!/usr/bin/env bash
# Double-click after run-ios.command has the app open in the Simulator.
# Keeps the Mac awake, runs the Maestro screenshot tour and the reviewer flows
# against the local stack, and writes sim-tests.log + sim-shots/*.png.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.maestro/bin:$HOME/.local/bin:$PATH"
caffeinate -dimsu -w $$ &
{
  echo "started $(date)"
  command -v maestro >/dev/null || curl -fsSL "https://get.maestro.mobile.dev" | bash
  export PATH="$HOME/.maestro/bin:$PATH"
  rm -rf sim-shots && mkdir -p sim-shots
  E="-e REVIEW_PASSWORD=local-review-only -e SITE_URL=https://onlyswap.pages.dev"
  maestro test apps/mobile/.maestro/tour/screens.yaml $E; echo "tour exit: $?"
  for f in e2e-04-reviewer e2e-05-swipe-offer e2e-11-search e2e-18-deeplinks; do
    maestro test "apps/mobile/.maestro/flows/$f.yaml" $E; echo "$f exit: $?"
    xcrun simctl io booted screenshot "sim-shots/after-$f.png" >/dev/null 2>&1
  done
  echo "finished $(date)"
} 2>&1 | tee sim-tests.log
