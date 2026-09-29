#!/usr/bin/env bash
# Runs the live Realtime smoke against the local stack; output realtime.log.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
env="$(pnpm -s supabase status -o env 2>/dev/null)"
v() { printf '%s\n' "$env" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}\$/\1/p" | head -1; }
ANON_KEY="$(v ANON_KEY)"; [ -n "$ANON_KEY" ] || ANON_KEY="$(v PUBLISHABLE_KEY)"
ANON_KEY="$ANON_KEY" SERVICE_KEY="$(v SERVICE_ROLE_KEY)" node scripts/verify/realtime-smoke.mjs > realtime.log 2>&1
echo "exit $? $(date)" >> realtime.log
