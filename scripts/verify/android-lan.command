#!/usr/bin/env bash
# Lets an Android phone on the same Wi-Fi use this Mac's local stack: points the
# app, Metro and photo uploads at the Mac's network address instead of
# 127.0.0.1 (the Simulator keeps working), restarts functions and Metro, and
# checks both are reachable. Output: android-lan.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
caffeinate -dimsu -t 10800 &
{
  echo "== $(date)"
  IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
  [ -z "$IP" ] && { echo "no Wi-Fi address found"; exit 1; }
  echo "mac ip: $IP"
  sed -i '' -E "s#^EXPO_PUBLIC_SUPABASE_URL=.*#EXPO_PUBLIC_SUPABASE_URL=http://$IP:54321#; s#^EXPO_PUBLIC_MEDIA_URL=.*#EXPO_PUBLIC_MEDIA_URL=http://$IP:54321/storage/v1/object/public/onlyswap-media#" apps/mobile/.env.local
  sed -i '' -E "s#^R2_PUBLIC_ENDPOINT=.*#R2_PUBLIC_ENDPOINT=http://$IP:54321/storage/v1/s3#" supabase/functions/.env
  grep -E "SUPABASE_URL|MEDIA_URL" apps/mobile/.env.local
  pkill -f "supabase functions serve" >/dev/null 2>&1
  (pnpm supabase functions serve > /tmp/onlyswap-functions.log 2>&1 &)
  for p in $(lsof -tiTCP:8081 -sTCP:LISTEN 2>/dev/null); do kill "$p"; done
  sleep 2
  (cd apps/mobile && CI=1 npx expo start --dev-client --host lan --port 8081 -c > /tmp/onlyswap-metro.log 2>&1 &)
  for _ in $(seq 1 90); do curl -fs "http://$IP:8081/status" >/dev/null && break; sleep 1; done
  echo "metro on lan: $(curl -s "http://$IP:8081/status")"
  echo "supabase on lan: $(curl -s -o /dev/null -w '%{http_code}' "http://$IP:54321/auth/v1/health")"
  echo "phone url: http://$IP:8081"
} > android-lan.log 2>&1
