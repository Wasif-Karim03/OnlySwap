#!/usr/bin/env bash
# LOCAL ONLY: get the local stack ready for a real iPhone (or Android phone) on
# the same Wi-Fi as this Mac.
#
#   bash scripts/dev/phone-lan.sh
#
# 1. Points the app (apps/mobile/.env.local) and photo uploads
#    (supabase/functions/.env) at this Mac's Wi-Fi address, so the phone can
#    reach Supabase. 127.0.0.1 on a phone is the phone itself.
# 2. Stores the two Vault values the scheduled jobs need to call Edge
#    Functions locally (functions_url, service_role_key). Without them the
#    jobs that send push notifications and emails do nothing.
# Then start Edge Functions and restart Metro (printed at the end).
#
# Needs `pnpm supabase start` running. Safe to run again, e.g. on a new network.
set -euo pipefail
cd "$(dirname "$0")/../.."

IP="${PHONE_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
[ -n "$IP" ] || { echo "No Wi-Fi address found. Set PHONE_IP=... and run again."; exit 1; }
DB=supabase_db_onlyswap
docker ps --format '{{.Names}}' | grep -qx "$DB" \
  || { echo "Local Supabase isn't running. Start Docker, then: pnpm supabase start"; exit 1; }

APP_ENV=apps/mobile/.env.local
FN_ENV=supabase/functions/.env
[ -f "$APP_ENV" ] || cp apps/mobile/.env.example "$APP_ENV"
sed -i '' -E \
  -e "s#^EXPO_PUBLIC_SUPABASE_URL=.*#EXPO_PUBLIC_SUPABASE_URL=http://$IP:54321#" \
  -e "s#^EXPO_PUBLIC_MEDIA_URL=.*#EXPO_PUBLIC_MEDIA_URL=http://$IP:54321/storage/v1/object/public/onlyswap-media#" \
  "$APP_ENV"
# The web build needs a Turnstile key; this is Cloudflare's published test key.
grep -q '^EXPO_PUBLIC_TURNSTILE_SITE_KEY=' "$APP_ENV" \
  || echo 'EXPO_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA' >> "$APP_ENV"
echo "app      -> http://$IP:54321"

if [ -f "$FN_ENV" ]; then
  sed -i '' -E "s#^R2_PUBLIC_ENDPOINT=.*#R2_PUBLIC_ENDPOINT=http://$IP:54321/storage/v1/s3#" "$FN_ENV"
  echo "uploads  -> http://$IP:54321/storage/v1/s3"
else
  echo "No $FN_ENV yet: run bash scripts/verify/all.sh once to write it, then run this again."
fi

KEY=$(pnpm -s supabase status -o env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')
[ -n "$KEY" ] || { echo "Could not read the local service role key from supabase status."; exit 1; }
docker exec -i "$DB" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -v url='http://host.docker.internal:54321/functions/v1' -v key="$KEY" <<'SQL'
select set_config('onlyswap.fn_url', :'url', false), set_config('onlyswap.fn_key', :'key', false) \gset
do $$
declare
  v record;
begin
  for v in select * from (values
    ('functions_url', current_setting('onlyswap.fn_url')),
    ('service_role_key', current_setting('onlyswap.fn_key'))) as t(name, val)
  loop
    if exists (select 1 from vault.secrets s where s.name = v.name) then
      perform vault.update_secret((select s.id from vault.secrets s where s.name = v.name), v.val);
    else
      perform vault.create_secret(v.val, v.name);
    end if;
  end loop;
end;
$$;
SQL
echo "jobs     -> scheduled push and email jobs can reach Edge Functions"

cat <<EOF

Next, in separate Terminal tabs:
  pnpm supabase functions serve
  cd apps/mobile && npx expo start --dev-client --clear
EOF
