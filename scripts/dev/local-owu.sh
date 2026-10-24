#!/usr/bin/env bash
# LOCAL ONLY: put Ohio Wesleyan and its mock data (DEC 91, 92) on the local
# Supabase stack, so the owner can sign in with an @owu.edu address on a phone
# and have listings to swipe, a seller bot that accepts offers, and chats.
#
#   bash scripts/dev/local-owu.sh            # add or refresh (safe to re-run)
#   bash scripts/dev/local-owu.sh --remove   # stop the bot, remove the mock data
#
# Needs `pnpm supabase start` running (Docker). Staging uses
# scripts/deploy/mock-data.command instead.
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=supabase_db_onlyswap
DIR=supabase/campuses

docker ps --format '{{.Names}}' | grep -qx "$DB" \
  || { echo "Local Supabase isn't running. Start Docker, then: pnpm supabase start"; exit 1; }

sql() { docker exec -i "$DB" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"; }

if [ "${1:-}" = "--remove" ]; then
  sql "$DIR/owu-mock-remove.sql"
  echo "Mock data removed. The OWU campus stays, so @owu.edu sign-in still works."
  exit 0
fi

echo "1/3 OWU campus and owu.edu domain"
sql "$DIR/owu.sql" >/dev/null

echo "2/3 Mock users, listings and the seller bot"
sql "$DIR/owu-mock.sql" >/dev/null

echo "3/3 Listing photos to local Storage"
eval "$(pnpm -s supabase status -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
n=0
for f in "$DIR"/mock-photos/*.webp; do
  curl -sf -o /dev/null -X POST \
    "$API_URL/storage/v1/object/onlyswap-media/c/mock/l/$(basename "$f")" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "x-upsert: true" \
    -H "Content-Type: image/webp" --data-binary "@$f" && n=$((n + 1))
done
echo "   $n photos uploaded"

echo
echo "Done. Sign in on the phone with your @owu.edu address; the code is in"
echo "Mailpit at http://127.0.0.1:54324. Make an offer on a mock listing and the"
echo "seller accepts within about 2 minutes, then replies in chat."
