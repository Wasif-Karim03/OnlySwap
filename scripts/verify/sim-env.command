#!/usr/bin/env bash
# Local Simulator test environment: Edge Functions served (uploads), Metro
# restarted with a clean cache (picks up .env.local), test photos added to the
# booted Simulator's library, the app reopened. Output: sim-env.log.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
caffeinate -dimsu -t 7200 &
{
  echo "== $(date)"
  pkill -f "supabase functions serve" >/dev/null 2>&1
  (pnpm supabase functions serve > /tmp/onlyswap-functions.log 2>&1 &)
  for p in $(lsof -tiTCP:8081 -sTCP:LISTEN 2>/dev/null); do kill "$p"; done
  sleep 2
  (cd apps/mobile && CI=1 npx expo start --dev-client --port 8081 -c > /tmp/onlyswap-metro.log 2>&1 &)
  for _ in $(seq 1 90); do curl -fs http://localhost:8081/status >/dev/null && break; sleep 1; done
  echo "metro: $(curl -s http://localhost:8081/status)"
  xcrun simctl addmedia booted apps/mobile/.maestro/fixtures/item1.jpg apps/mobile/.maestro/fixtures/item2.jpg apps/mobile/.maestro/fixtures/item3.jpg && echo "photos added"
  xcrun simctl terminate booted app.onlyswap >/dev/null 2>&1
  xcrun simctl openurl booted "exp+onlyswap://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" && echo "app opened"
  for _ in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:54321/functions/v1/upload-url | grep -qE '401|400' && { echo "functions up"; break; }; sleep 2; done
} > sim-env.log 2>&1
