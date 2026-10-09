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
# Read the file first: eas/npx read stdin, so calling them inside a
# `while read ... < file` loop swallowed every line after the first (the first
# staging build shipped with only EXPO_PUBLIC_APP_ENV and crashed on launch).
# The loop reads from fd 3 so eas can't eat it (macOS bash 3.2 has no mapfile).
while IFS= read -r line <&3; do
  k="${line%%=*}"; v="${line#*=}"
  EAS env:create --environment preview --name "$k" --value "$v" --visibility plaintext \
    --type string --force --non-interactive </dev/null >/dev/null 2>&1 \
    && echo "  set $k" || { echo "  could not set $k"; exit 1; }
done 3< <(grep -E '^EXPO_PUBLIC_[A-Z_]+=' .env.staging)
echo "== Checking the preview environment has every value the app needs"
have=$(EAS env:list --environment preview </dev/null 2>/dev/null)
for k in EXPO_PUBLIC_APP_ENV EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY \
  EXPO_PUBLIC_MEDIA_URL EXPO_PUBLIC_SITE_URL; do
  echo "$have" | grep -q "$k" || { echo "  missing $k; not building"; exit 1; }
  echo "  ok $k"
done
echo "== Build ($PLATFORM, profile preview)"
EAS build -p "$PLATFORM" --profile preview
