#!/usr/bin/env bash
# Sends the newest queued photo straight to the staging media Worker's scan
# route and prints its answer, including the error text when the AI call fails
# (DEC 152 follow-up: why every try came back "retry"). Changes nothing.
#   bash scripts/deploy/test-photo-scan.command            # newest photo
#   bash scripts/deploy/test-photo-scan.command c/x/l/...  # a given key
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
NAME=onlyswap-staging
SB() { pnpm -s supabase "$@" 2> >(grep -v -i "new version\|recommend updating" >&2); }
die() { echo "STOPPED: $*"; exit 1; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);$1})"; }

MEDIA=$(grep -E '^EXPO_PUBLIC_MEDIA_URL=' .env.staging | cut -d= -f2-)
[ -n "$MEDIA" ] || die "no EXPO_PUBLIC_MEDIA_URL in .env.staging (run cloudflare-staging.command)"
KEY=$(security find-generic-password -a "$NAME" -s onlyswap-vault-scan_key -w 2>/dev/null)
[ -n "$KEY" ] || die "scan key not in Keychain (run staging-supabase.command)"

P="$1"
if [ -z "$P" ]; then
  REF=$(SB projects list -o json | json "const p=(Array.isArray(j)?j:[]).find(p=>p.name==='$NAME');console.log(p?(p.ref||p.id):'')")
  export SUPABASE_DB_PASSWORD=$(security find-generic-password -a "$NAME" -s onlyswap-db-password -w 2>/dev/null)
  SB link --project-ref "$REF" >/dev/null 2>&1 || die "link failed"
  P=$(SB db query --linked -o json "select path from private.photo_scans order by id desc limit 1;" | json "const r=Array.isArray(j)?j:(j.rows||[]);console.log(r[0]?r[0].path:'')")
fi
[ -n "$P" ] || die "no photo in the scan queue yet"
echo "photo: $P"
echo "worker: $MEDIA/internal/scan"
echo
curl -sS -X POST "$MEDIA/internal/scan" \
  -H "authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d "{\"path\":\"$P\"}" -w '\nHTTP %{http_code}\n'
