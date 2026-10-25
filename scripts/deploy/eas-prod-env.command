#!/usr/bin/env bash
# EAS production environment variables (LAUNCH_READINESS item 13).
#   bash scripts/deploy/eas-prod-env.command
# Run after prod-supabase.command and cloudflare-prod.command (reads .env.production).
# Public EXPO_PUBLIC_* values are plaintext; the Sentry auth token is a secret.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
STATE=.env.production
[ -f "$STATE" ] || { echo "run scripts/deploy/prod-supabase.command first"; exit 1; }
# shellcheck disable=SC1090
set -a; . "./$STATE"; set +a
cd apps/mobile || exit 1
EAS() { npx -y eas-cli@latest "$@"; }
put() { # name value visibility
  [ -n "$2" ] || { echo "skip $1 (empty)"; return; }
  EAS env:create --environment production --name "$1" --value "$2" --visibility "$3" --force --non-interactive >/dev/null \
    && echo "set $1" || echo "FAILED $1"
}
put EXPO_PUBLIC_APP_ENV production plaintext
put EXPO_PUBLIC_SUPABASE_URL "$EXPO_PUBLIC_SUPABASE_URL" plaintext
put EXPO_PUBLIC_SUPABASE_ANON_KEY "$EXPO_PUBLIC_SUPABASE_ANON_KEY" plaintext
put EXPO_PUBLIC_MEDIA_URL "$EXPO_PUBLIC_MEDIA_URL" plaintext
put EXPO_PUBLIC_SITE_URL "$EXPO_PUBLIC_SITE_URL" plaintext
put EXPO_PUBLIC_TURNSTILE_SITE_KEY "$EXPO_PUBLIC_TURNSTILE_SITE_KEY" plaintext
read -rp "Sentry DSN for onlyswap-mobile (Enter to skip): " v; put EXPO_PUBLIC_SENTRY_DSN "$v" plaintext
read -rp "PostHog project key (phc_..., Enter to skip): " v; put EXPO_PUBLIC_POSTHOG_KEY "$v" plaintext
put EXPO_PUBLIC_POSTHOG_HOST https://us.i.posthog.com plaintext
read -rp "Sentry org slug (Enter to skip): " v; put SENTRY_ORG "$v" plaintext
[ -n "$v" ] && put SENTRY_PROJECT onlyswap-mobile plaintext
read -rsp "Sentry auth token for source maps (hidden, Enter to skip): " v; echo; put SENTRY_AUTH_TOKEN "$v" secret
echo; EAS env:list --environment production
