#!/usr/bin/env bash
# S14 Simulator helpers (local Supabase must be running; run from anywhere).
#   bash scripts/verify/s14-sim.sh serve    keep open in its own terminal: Edge Functions for the app
#   bash scripts/verify/s14-sim.sh avatar   checks the newest profile photo has no EXIF
#   bash scripts/verify/s14-sim.sh bump     raises rules_version (then press r in Metro)
#   bash scripts/verify/s14-sim.sh reset    puts rules_version back to 1
set -u
cd "$(dirname "$0")/../.."

status_var() { pnpm -s supabase status -o env 2>/dev/null | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}\$/\1/p" | head -1; }

case "${1:-}" in
  serve)
    [ -f supabase/functions/.env ] || { echo "Run bash scripts/verify/s14.sh once first (it writes supabase/functions/.env)."; exit 1; }
    echo "Serving Edge Functions for the Simulator. Leave this open; Ctrl+C to stop."
    exec pnpm supabase functions serve
    ;;
  avatar|bump|reset)
    key="$(status_var SERVICE_ROLE_KEY)"
    [ -n "$key" ] || key="$(status_var SECRET_KEY)"
    [ -n "$key" ] || { echo "Local Supabase is not running: pnpm supabase start"; exit 1; }
    SERVICE_KEY="$key" node --no-warnings --experimental-strip-types scripts/verify/sim-onboarding.mjs "$1"
    ;;
  *)
    echo "usage: bash scripts/verify/s14-sim.sh serve | avatar | bump | reset"; exit 2 ;;
esac
