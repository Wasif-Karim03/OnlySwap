#!/usr/bin/env bash
# Rebuilds and redeploys only the public website (onlyswap.pages.dev) with the
# staging values. Run after cloudflare-staging.command has run once.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -f .env.staging ] || { echo "run scripts/deploy/staging-supabase.command first"; exit 1; }
set -a; . ./.env.staging; set +a
( cd apps/site && SITE_URL=https://onlyswap.pages.dev APPLE_TEAM_ID=L3DN7Y4X67 \
    PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY \
    PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm -s build ) || exit 1
cd apps/site && npx -y wrangler@4 pages deploy dist --project-name onlyswap --branch main --commit-dirty=true | grep -E 'https://|rror'
