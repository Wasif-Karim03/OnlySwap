#!/usr/bin/env bash
# Read-only staging database health (owner device check 2026-10-26: app stuck
# on launch, Settings screens ~40 s): connections in use vs the limit, who
# holds them, anything long-running or waiting on a lock, recent cron failures.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
NAME=onlyswap-staging
SB() { pnpm -s supabase "$@" 2> >(grep -v -i "new version\|recommend updating" >&2); }
die() { echo "STOPPED: $*"; exit 1; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);$1})"; }
REF=$(SB projects list -o json | json "const p=(Array.isArray(j)?j:[]).find(p=>p.name==='$NAME');console.log(p?(p.ref||p.id):'')")
[ -n "$REF" ] || die "could not find $NAME"
echo "status: $(SB projects list -o json | json "const p=j.find(p=>p.name==='$NAME');console.log(p.status)")"
export SUPABASE_DB_PASSWORD=$(security find-generic-password -a "$NAME" -s onlyswap-db-password -w 2>/dev/null)
SB link --project-ref "$REF" >/dev/null 2>&1 || die "link failed (the database may be refusing connections)"
run() { echo; echo "== $1"; pnpm -s supabase db query --linked "$2" 2>&1 | grep -v -i "new version\|recommend updating"; }
run "connections in use vs limit" "select count(*) as in_use, current_setting('max_connections') as max from pg_stat_activity;"
run "who holds them" "select coalesce(nullif(application_name,''),'(none)') as app, usename, state, count(*) from pg_stat_activity group by 1,2,3 order by 4 desc limit 15;"
run "running longer than 5 s" "select pid, usename, state, now() - query_start as for, left(regexp_replace(query,'\s+',' ','g'),80) as query from pg_stat_activity where state <> 'idle' and now() - query_start > interval '5 seconds' order by query_start limit 10;"
run "waiting on locks" "select count(*) as waiting from pg_stat_activity where wait_event_type = 'Lock';"
run "cron failures, last 3 h" "select j.jobname, d.status, left(d.return_message,60) as msg, count(*) from cron.job_run_details d join cron.job j using (jobid) where d.start_time > now() - interval '3 hours' and d.status <> 'succeeded' group by 1,2,3 order by 4 desc limit 10;"
run "net queue (pg_net)" "select count(*) as queued from net.http_request_queue;"
