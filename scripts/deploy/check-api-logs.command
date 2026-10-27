#!/usr/bin/env bash
# Staging API request log for the last hour (read-only): every app call with
# its status code and how long Supabase took (owner device check 2026-10-26:
# Settings > Notifications, Safety spots and Blocked took ~40 s).
# Uses the Supabase CLI's own login token (never printed).
#   bash scripts/deploy/check-api-logs.command [minutes]   # default 60
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
MIN=${1:-60}
LOG=api-logs.log
die() { echo "STOPPED: $*"; exit 1; }

TOKEN=${SUPABASE_ACCESS_TOKEN:-}
[ -z "$TOKEN" ] && [ -f "$HOME/.supabase/access-token" ] && TOKEN=$(cat "$HOME/.supabase/access-token")
if [ -z "$TOKEN" ]; then
  raw=$(security find-generic-password -s "Supabase CLI" -w 2>/dev/null)
  case "$raw" in go-keyring-base64:*) TOKEN=$(printf %s "${raw#go-keyring-base64:}" | base64 -d) ;; *) TOKEN=$raw ;; esac
fi
[ -n "$TOKEN" ] || die "no Supabase CLI login found (run: pnpm supabase login)"

REF=$(pnpm -s supabase projects list -o json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const p=j.find(p=>p.name==='onlyswap-staging');console.log(p?(p.ref||p.id):'')})")
[ -n "$REF" ] || die "could not find onlyswap-staging"

END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
START=$(date -u -v-"${MIN}"M +%Y-%m-%dT%H:%M:%SZ)
q() {
  curl -sS -G "https://api.supabase.com/v1/projects/$REF/analytics/endpoints/logs.all" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "iso_timestamp_start=$START" --data-urlencode "iso_timestamp_end=$END" \
    --data-urlencode "sql=$1"
}
SQL1="select datetime(timestamp) as t, req.method, req.path, res.status_code, res.origin_time from edge_logs cross join unnest(metadata) as m cross join unnest(m.request) as req cross join unnest(m.response) as res where req.path like '/rest/v1/%' order by timestamp desc limit 200"
SQL2="select datetime(timestamp) as t, event_message from edge_logs where event_message like '%/rest/v1/%' order by timestamp desc limit 200"

SQL3="select timestamp, event_message from edge_logs order by timestamp desc limit 5"
empty() { printf %s "$1" | grep -q '"error"' || printf %s "$1" | grep -q '"result":\[\]'; }
OUT=$(q "$SQL1")
if empty "$OUT"; then OUT=$(q "$SQL2"); fi
if empty "$OUT"; then
  echo "(no matches; raw sample of the newest log lines, and the window used: $START to $END)"
  q "$SQL3" | head -c 1500; echo
  exit 0
fi
printf %s "$OUT" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  let j; try { j=JSON.parse(s) } catch { console.log(s.slice(0,800)); return; }
  if (j.error) { console.log('error:', JSON.stringify(j.error).slice(0,600)); return; }
  const rows=j.result||[];
  if (!rows.length) { console.log('no API requests in the last $MIN min'); return; }
  const by={};
  for (const r of rows) {
    const path=(r.path||String(r.event_message||'').split('|').find(x=>x.includes('/rest/v1/'))||'?').trim().replace(/^.*\/rest\/v1\//,'').split('?')[0];
    const code=r.status_code ?? (String(r.event_message||'').split('|')[1]||'').trim();
    const ms=Number(r.origin_time); const k=path;
    (by[k] ||= {n:0,codes:{},ms:[]}); by[k].n++; by[k].codes[code]=(by[k].codes[code]||0)+1; if(!isNaN(ms)) by[k].ms.push(ms);
  }
  console.log('call'.padEnd(34),'count','status codes'.padEnd(22),'ms (median / max)');
  for (const [k,v] of Object.entries(by).sort((a,b)=>b[1].n-a[1].n)) {
    const ms=v.ms.sort((a,b)=>a-b); const med=ms.length?ms[Math.floor(ms.length/2)]:'-'; const max=ms.length?ms[ms.length-1]:'-';
    console.log(k.slice(0,33).padEnd(34),String(v.n).padEnd(5),JSON.stringify(v.codes).padEnd(22),med+' / '+max);
  }
});" | tee "$LOG"
echo; echo "Saved to $LOG"
