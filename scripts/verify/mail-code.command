#!/usr/bin/env bash
# Local only: prints the newest sign-in code caught by Mailpit (supabase start)
# and the address it went to. Output: mail-code.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
{
  echo "== $(date)"
  id=$(curl -s "http://127.0.0.1:54324/api/v1/messages?limit=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s).messages?.[0];if(m)console.log(m.ID)})')
  if [ -z "$id" ]; then echo "no mail"; exit 0; fi
  curl -s "http://127.0.0.1:54324/api/v1/message/$id" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s);console.log("to:",m.To.map(t=>t.Address).join(","));console.log("subject:",m.Subject);console.log("date:",m.Date);const c=(m.Text||"").match(/\b\d{6}\b/);console.log("code:",c?c[0]:"none")})'
} > mail-code.log 2>&1
