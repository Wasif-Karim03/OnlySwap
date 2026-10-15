#!/usr/bin/env bash
# usage: ./run.sh <scenario> [extra k6 args]   e.g. ./run.sh mixed ; SCALE=0.5 ./run.sh feed
# Needs: local supabase running, loadtest seed applied, ./export-data.sh run once, k6 installed.
set -euo pipefail
cd "$(dirname "$0")"
S=$1; shift || true
ROOT=$(cd ../../.. && pwd); RAW=$ROOT/audit/raw
PGURL=${PGURL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
eval "$(cd "$ROOT" && pnpm -s supabase status -o env 2>/dev/null | grep -E '^(ANON_KEY|JWT_SECRET)=')"
export ANON_KEY JWT_SECRET
# fresh rate-limit counters + stats for this run
psql "$PGURL" -qAtc "delete from public.rate_counters where user_id::text like '50000000-%'; select pg_stat_statements_reset();" >/dev/null
( while true; do
    echo "$(date +%T) $(docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}' supabase_db_onlyswap supabase_rest_onlyswap supabase_kong_onlyswap supabase_realtime_onlyswap supabase_auth_onlyswap | sed 's/supabase_//; s/_onlyswap//' | tr '\n' ' ') conns=$(psql "$PGURL" -Atc 'select count(*) from pg_stat_activity' 2>/dev/null)"
    sleep 5; done ) > "$RAW/load-$S-docker.txt" &
MON=$!
trap 'kill $MON 2>/dev/null || true' EXIT
k6 run --summary-export "$RAW/load-$S-summary.json" "$@" "$S.js" > "$RAW/load-$S.log" 2>&1 || true
kill $MON 2>/dev/null || true
psql "$PGURL" -X -f "$(dirname "$0")/pgss-top.sql" > "$RAW/load-$S-pgss.txt"
tail -40 "$RAW/load-$S.log" | grep -E "http_req_duration|http_req_failed|http_reqs|server_errors|rate_limited|business_errors|deadlocks|statement_timeouts|vus_max|iterations|ws_|otp_" || true
