#!/usr/bin/env bash
# iPhone test build that talks to STAGING over the internet (no Mac, no Metro).
#   bash scripts/deploy/ios-staging-build.command [ios|android|all]
# Copies the public staging values from .env.staging into the EAS "preview"
# environment, then starts `eas build --profile preview` (internal install link).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PLATFORM="${1:-ios}"
[ -f .env.staging ] || { echo "run scripts/deploy/staging-supabase.command first"; exit 1; }
EAS() { (cd apps/mobile && npx -y eas-cli@latest "$@"); }
echo "== Public staging values -> EAS preview environment"
while IFS='=' read -r k v; do
  case "$k" in EXPO_PUBLIC_*) ;; *) continue ;; esac
  EAS env:create --environment preview --name "$k" --value "$v" --visibility plaintext \
    --type string --force --non-interactive >/dev/null 2>&1 \
    && echo "  $k" || { echo "  could not set $k"; exit 1; }
done < .env.staging
echo "== Build ($PLATFORM, profile preview)"
EAS build -p "$PLATFORM" --profile preview
