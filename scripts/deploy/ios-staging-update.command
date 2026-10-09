#!/usr/bin/env bash
# Sends the current JavaScript and images to the staging app already on your
# phone (EAS Update, free), so screen changes show up without a 20 minute build.
#   bash scripts/deploy/ios-staging-update.command "what changed"
# Only works when no native code changed since the last staging build; if the
# app doesn't pick it up, run scripts/deploy/ios-staging-build.command instead.
# On the phone: close OnlySwap fully and open it twice (the first open downloads).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
MSG="${1:-staging update $(date '+%Y-%m-%d %H:%M')}"
(cd apps/mobile && APP_VARIANT=preview npx -y eas-cli@latest update \
  --channel preview --environment preview --platform ios --message "$MSG" --non-interactive) 2>&1 | tee update.log
