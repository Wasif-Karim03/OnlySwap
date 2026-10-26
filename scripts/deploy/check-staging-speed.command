#!/usr/bin/env bash
# Read-only staging speed check (owner device check 2026-10-25: Inbox and
# Profile slow). Links to onlyswap-staging by name (never prod), then:
#   1. times the main screen RPCs inside the database as the most active
#      test account (3 runs each; nothing is written: the transaction is
#      never committed)
#   2. lists the slowest statements Postgres has seen (pg_stat_statements)
# Output also goes to staging-speed.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
NAME=onlyswap-staging
LOG=staging-speed.log
: > "$LOG"
SB() { pnpm -s supabase "$@" 2> >(grep -v -i "new version\|recommend updating" >&2); }
die() { echo "STOPPED: $*" | tee -a "$LOG"; exit 1; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);$1})"; }

SB projects list -o json >/dev/null 2>&1 || SB login || die "login failed"
REF=$(SB projects list -o json | json "const p=(Array.isArray(j)?j:[]).find(p=>p.name==='$NAME');console.log(p?(p.ref||p.id):'')")
[ -n "$REF" ] || die "could not find $NAME"
PW=$(security find-generic-password -a "$NAME" -s onlyswap-db-password -w 2>/dev/null)
[ -n "$PW" ] || die "staging DB password not in Keychain"
export SUPABASE_DB_PASSWORD="$PW"
SB link --project-ref "$REF" >/dev/null 2>&1 || die "link failed"
echo "staging ref: $REF" | tee -a "$LOG"

SQLF=$(mktemp)
cat > "$SQLF" <<'SQL'
begin;
create function pg_temp.ms(q text) returns numeric language plpgsql as $$
declare s timestamptz := clock_timestamp();
begin
  execute q;
  return round(extract(epoch from clock_timestamp() - s) * 1000, 1);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', u.id::text, true)
from (select sender_id as id from public.messages where sender_id is not null
      group by sender_id order by count(*) desc limit 1) u;
with calls(rpc, q) as (values
  ('get_inbox',         'select public.get_inbox()'),
  ('get_me',            'select public.get_me()'),
  ('my_listings',       'select public.my_listings()'),
  ('get_feed',          'select public.get_feed(null, 20)'),
  ('get_campus_feed',   'select public.get_campus_feed(null, null)'),
  ('unread_count',      'select public.unread_count()'),
  ('get_notifications', 'select public.get_notifications(null, 30)')
)
select rpc, pg_temp.ms(q) as run1_ms, pg_temp.ms(q) as run2_ms, pg_temp.ms(q) as run3_ms from calls;
SQL
echo; echo "== screen RPCs (ms inside the database)" | tee -a "$LOG"
SB db query --linked -f "$SQLF" 2>&1 | tee -a "$LOG"
rm -f "$SQLF"

echo; echo "== slowest statements seen (mean ms)" | tee -a "$LOG"
SB db query --linked "select calls, round(mean_exec_time::numeric, 1) as mean_ms, round(max_exec_time::numeric) as max_ms, left(regexp_replace(query, '\s+', ' ', 'g'), 90) as query from extensions.pg_stat_statements where query ilike '%public.%' order by mean_exec_time desc limit 15;" 2>&1 | tee -a "$LOG"
echo; echo "Saved to $LOG"
