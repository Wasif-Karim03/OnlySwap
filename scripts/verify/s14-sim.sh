#!/usr/bin/env bash
# S14 Simulator helpers (local Supabase must be running; run from anywhere).
#   bash scripts/verify/s14-sim.sh serve    keep open in its own terminal: Edge Functions for the app
#   bash scripts/verify/s14-sim.sh redo     clears the newest profile's name and photo (redo Set up your profile)
#   bash scripts/verify/s14-sim.sh avatar   checks the newest profile photo has no EXIF
#   bash scripts/verify/s14-sim.sh overdue  S15: the yearly check is overdue (X9)
#   bash scripts/verify/s14-sim.sh signout  S15: signs the Simulator account out everywhere (X7)
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
  avatar|redo|overdue|signout|bump|reset)
    key="$(status_var SERVICE_ROLE_KEY)"
    [ -n "$key" ] || key="$(status_var SECRET_KEY)"
    [ -n "$key" ] || { echo "Local Supabase is not running: pnpm supabase start"; exit 1; }
    SERVICE_KEY="$key" node --no-warnings --experimental-strip-types scripts/verify/sim-onboarding.mjs "$1"
    ;;
  *)
    echo "usage: bash scripts/verify/s14-sim.sh serve | redo | avatar | overdue | signout | bump | reset"; exit 2 ;;
esac
