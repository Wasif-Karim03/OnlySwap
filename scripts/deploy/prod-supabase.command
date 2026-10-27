#!/usr/bin/env bash
# One-shot Supabase PRODUCTION setup (LAUNCH_READINESS items 3, 4, 5, 8, 9, 11).
#   bash scripts/deploy/prod-supabase.command
# Before the first run: pause the old project so the free plan has a slot, buy
# the domain, and make the keys in docs/runbooks/production.md (Gmail app
# password, Turnstile secret). Safe to re-run: it finds the
# existing project and only fills in what's missing.
#
# What it does, all from the Supabase CLI (free plan, $0):
#   1. logs in, finds or creates the project `onlyswap-prod`
#   2. checks the staging-only migrations can never reach prod, links, applies
#      supabase/migrations only (never supabase/migrations_staging), and marks
#      the database as production (app.env = prod)
#   3. pushes auth settings (hooks, 6-digit code emails, MFA, Gmail SMTP)
#   4. creates the Vault secrets (new random values, kept in the Keychain under
#      the account onlyswap-prod; the email pepper is made once and kept forever)
#   5. sets the Edge Function secrets and deploys every function but test-inbox
#   6. writes public values (URL, publishable key) to .env.production (git-ignored)
# Nothing secret is printed, logged or committed. Then run
# scripts/deploy/cloudflare-prod.command.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
set -o pipefail
NAME=onlyswap-prod
REGION=us-east-1
STATE=.env.production
LOG=prod-supabase.log
: > "$LOG"
SB() { pnpm -s supabase "$@"; }
say() { echo; echo "== $*" | tee -a "$LOG"; }
die() { echo "STOPPED: $*" | tee -a "$LOG"; exit 1; }
kc_get() { security find-generic-password -a "$NAME" -s "$1" -w 2>/dev/null; }
kc_set() { security add-generic-password -U -a "$NAME" -s "$1" -w "$2" >/dev/null; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);$1})"; }
ask_secret() { # keychain-name prompt
  local v; v=$(kc_get "$1")
  if [ -z "$v" ]; then read -rsp "$2 (hidden): " v; echo; v=$(printf %s "$v" | tr -d ' '); [ -n "$v" ] && kc_set "$1" "$v"; fi
  printf %s "$v"
}
ask_plain() { # keychain-name prompt
  local v; v=$(kc_get "$1")
  if [ -z "$v" ]; then read -rp "$2: " v; [ -n "$v" ] && kc_set "$1" "$v"; fi
  printf %s "$v"
}

say "0/8 Production domain"
DOMAIN=$(ask_plain onlyswap-domain "Your domain on Cloudflare, no https (for example onlyswap.app)")
DOMAIN=${DOMAIN#https://}; DOMAIN=${DOMAIN%/}
case "$DOMAIN" in *.*) ;; *) die "a domain like onlyswap.app is needed (buy it first, see the runbook)";; esac
SITE_URL=https://$DOMAIN
MEDIA_URL=https://media.$DOMAIN
echo "site: $SITE_URL  media: $MEDIA_URL" | tee -a "$LOG"

say "1/8 Supabase login"
SB projects list -o json >/dev/null 2>&1 || SB login || die "login failed"

say "2/8 Find or create $NAME"
REF=$(SB projects list -o json | json "const p=(Array.isArray(j)?j:[]).find(p=>p.name==='$NAME');console.log(p?(p.ref||p.id):'')")
PW=$(kc_get onlyswap-db-password)
if [ -z "$REF" ]; then
  ORG=$(SB orgs list -o json | json "console.log((j[0]||{}).id||'')")
  [ -n "$ORG" ] || die "no Supabase organization found"
  [ -n "$PW" ] || { PW=$(openssl rand -hex 24); kc_set onlyswap-db-password "$PW"; }
  SB projects create "$NAME" --org-id "$ORG" --db-password "$PW" --region "$REGION" 2>&1 \
    | grep -v -i password | tee -a "$LOG" || die "create failed (free plan allows 2 active projects: pause intention first)"
  REF=$(SB projects list -o json | json "const p=j.find(p=>p.name==='$NAME');console.log(p?(p.ref||p.id):'')")
fi
[ -n "$REF" ] || die "could not find the project ref"
echo "project ref: $REF (not a secret)" | tee -a "$LOG"
if [ -z "$PW" ]; then
  read -rsp "Database password for $NAME (hidden; reset it in Dashboard > Database if lost): " PW; echo
  kc_set onlyswap-db-password "$PW"
fi
printf 'waiting for the project to be ready'
for _ in $(seq 1 90); do
  ST=$(SB projects list -o json | json "const p=j.find(p=>(p.ref||p.id)==='$REF');console.log(p?p.status:'')")
  [ "$ST" = "ACTIVE_HEALTHY" ] && break
  printf '.'; sleep 10
done
echo " $ST" | tee -a "$LOG"
[ "$ST" = "ACTIVE_HEALTHY" ] || die "project not healthy yet; run this again in a few minutes"
export SUPABASE_DB_PASSWORD="$PW"

say "3/8 Link, apply migrations, mark the database as production"
node scripts/verify/check-staging-migrations.mjs 2>&1 | tee -a "$LOG" || die "staging migration guard check failed"
SB link --project-ref "$REF" 2>&1 | tee -a "$LOG" || die "link failed"
SB db push --include-all --yes 2>&1 | tee -a "$LOG" || die "db push failed"
ENVF=$(mktemp)
echo "alter database postgres set app.env = 'prod';" > "$ENVF"
SB db query --linked -f "$ENVF" >>"$LOG" 2>&1 \
  && echo "app.env = prod" | tee -a "$LOG" \
  || echo "WARNING: could not set app.env (see $LOG). Run in the SQL editor: alter database postgres set app.env = 'prod';" | tee -a "$LOG"
rm -f "$ENVF"

say "4/8 Email sender (Gmail) for login codes"
GMAIL_USER=$(ask_plain onlyswap-gmail-user "Production sender Gmail address")
GMAIL_PASS=$(ask_secret onlyswap-gmail-app-password "Gmail app password, 16 letters")
[ -n "$GMAIL_USER" ] && [ -n "$GMAIL_PASS" ] || die "production needs a sender (login codes are emailed)"
SUPPORT=$(kc_get onlyswap-support-inbox)
case "$SUPPORT" in *@*) ;; *) SUPPORT="" ;; esac
if [ -z "$SUPPORT" ]; then
  read -rp "Support inbox (where help requests go, Enter = sender Gmail): " SUPPORT
  case "$SUPPORT" in *@*) ;; *) SUPPORT=$GMAIL_USER ;; esac
  kc_set onlyswap-support-inbox "$SUPPORT"
fi

say "5/8 Auth settings (hooks, code emails, MFA)"
node - "$REF" "$SITE_URL" <<'NODE'
const fs = require('fs');
const [ref, site] = process.argv.slice(2);
const file = 'supabase/config.toml';
const start = '# >>> remotes.prod (generated by scripts/deploy/prod-supabase.command)';
const end = '# <<< remotes.prod';
let toml = fs.readFileSync(file, 'utf8');
const i = toml.indexOf(start);
if (i >= 0) toml = toml.slice(0, i).trimEnd() + '\n' + toml.slice(toml.indexOf(end) + end.length).trimStart();
const block = [
  start,
  '[remotes.prod]',
  `project_id = "${ref}"`,
  '',
  '[remotes.prod.auth]',
  `site_url = "${site}"`,
  `additional_redirect_urls = ["${site}", "https://app.${site.replace('https://', '')}"]`,
  '',
  '[remotes.prod.auth.email.smtp]',
  'enabled = true',
  'host = "smtp.gmail.com"',
  'port = 465',
  'user = "env(PROD_SMTP_USER)"',
  'pass = "env(PROD_SMTP_PASS)"',
  'admin_email = "env(PROD_SMTP_USER)"',
  'sender_name = "OnlySwap"',
  end,
].join('\n');
fs.writeFileSync(file, `${toml.trimEnd()}\n\n${block}\n`);
NODE
PROD_SMTP_USER="$GMAIL_USER" PROD_SMTP_PASS="$GMAIL_PASS" SB config push --project-ref "$REF" --yes 2>&1 | tee -a "$LOG" || die "config push failed"

say "6/8 Vault secrets"
KEYS=$(SB projects api-keys --project-ref "$REF" --reveal -o json) || die "could not read API keys"
PUBLISHABLE=$(printf %s "$KEYS" | json "const k=j.find(k=>(k.api_key||'').startsWith('sb_publishable_'))||j.find(k=>k.name==='anon');console.log(k?k.api_key:'')")
[ -n "$PUBLISHABLE" ] || die "publishable key missing"
for k in email_hash_pepper waitlist_email_key media_signing_key internal_function_key; do
  [ -n "$(kc_get "onlyswap-vault-$k")" ] || kc_set "onlyswap-vault-$k" "$(openssl rand -hex 32)"
done
vault_sql() { # name value mode(keep|replace)
  if [ "$3" = keep ]; then
    echo "select vault.create_secret('$2', '$1') where not exists (select 1 from vault.secrets where name = '$1');"
  else
    echo "select case when exists (select 1 from vault.secrets where name = '$1') then vault.update_secret((select id from vault.secrets where name = '$1'), '$2')::text else vault.create_secret('$2', '$1')::text end;"
  fi
}
SQLF=$(mktemp); chmod 600 "$SQLF"
{
  vault_sql email_hash_pepper "$(kc_get onlyswap-vault-email_hash_pepper)" keep
  vault_sql waitlist_email_key "$(kc_get onlyswap-vault-waitlist_email_key)" keep
  vault_sql media_signing_key "$(kc_get onlyswap-vault-media_signing_key)" keep
  vault_sql functions_url "https://$REF.supabase.co/functions/v1" replace
  vault_sql service_role_key "$(kc_get onlyswap-vault-internal_function_key)" replace
  vault_sql support_inbox "$SUPPORT" replace
} > "$SQLF"
SB db query --linked -f "$SQLF" >/dev/null 2>>"$LOG"; rc=$?; rm -f "$SQLF"
[ $rc -eq 0 ] || die "vault setup failed (see $LOG)"
echo "vault: 6 secrets in place" | tee -a "$LOG"

say "7/8 Function secrets"
TURNSTILE=$(ask_secret onlyswap-turnstile-secret "Turnstile SECRET key for $DOMAIN (Cloudflare > Turnstile)")
case "$TURNSTILE" in 1x0000*|2x0000*|3x0000*) die "that is a Cloudflare test key; production needs the real secret";; '') die "Turnstile secret needed";; esac
# Photo scanning (DEC 152): shared with the media Worker by cloudflare-prod.command.
[ -n "$(kc_get onlyswap-vault-scan_key)" ] || kc_set onlyswap-vault-scan_key "$(openssl rand -hex 32)"
SENTRY=$(ask_plain onlyswap-sentry-functions-dsn "Sentry DSN for onlyswap-functions (Enter to skip for now)")
SECF=$(mktemp); chmod 600 "$SECF"
{
  echo "APP_ENV=production"
  echo "SITE_URL=$SITE_URL"
  echo "MEDIA_URL=$MEDIA_URL"
  echo "EMAIL_PROVIDER=gmail"
  echo "GMAIL_USER=$GMAIL_USER"
  echo "GMAIL_APP_PASSWORD=$GMAIL_PASS"
  echo "EMAIL_FROM=OnlySwap <$GMAIL_USER>"
  echo "INTERNAL_FUNCTION_KEY=$(kc_get onlyswap-vault-internal_function_key)"
  echo "TURNSTILE_SECRET_KEY=$TURNSTILE"
  echo "SCAN_KEY=$(kc_get onlyswap-vault-scan_key)"
  [ -n "$SENTRY" ] && echo "SENTRY_DSN=$SENTRY"
} > "$SECF"
SB secrets set --project-ref "$REF" --env-file "$SECF" >/dev/null 2>>"$LOG"; rc=$?; rm -f "$SECF"
[ $rc -eq 0 ] || die "function secrets failed (see $LOG)"
# Test-only secrets must never be on prod.
SB secrets unset E2E_SECRET --project-ref "$REF" --yes >/dev/null 2>&1 || true
echo "function secrets set" | tee -a "$LOG"

say "8/8 Deploy Edge Functions (all but test-inbox)"
FNS=$(ls -d supabase/functions/*/ | xargs -n1 basename | grep -v -e '^_shared$' -e '^test-inbox$' | tr '\n' ' ')
# shellcheck disable=SC2086
SB functions deploy $FNS --project-ref "$REF" --use-api 2>&1 | tee -a "$LOG" || die "functions deploy failed"
SB functions delete test-inbox --project-ref "$REF" >/dev/null 2>&1 || true

cat > "$STATE" <<EOF
# Public production values (written by scripts/deploy/prod-supabase.command). Not secrets.
PROD_REF=$REF
PROD_DOMAIN=$DOMAIN
EXPO_PUBLIC_APP_ENV=production
EXPO_PUBLIC_SUPABASE_URL=https://$REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=$PUBLISHABLE
EXPO_PUBLIC_SITE_URL=$SITE_URL
EXPO_PUBLIC_MEDIA_URL=$MEDIA_URL
EOF
say "Check"
echo "health: $(curl -s "https://$REF.supabase.co/functions/v1/health")" | tee -a "$LOG"
echo "auth:   $(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $PUBLISHABLE" "https://$REF.supabase.co/auth/v1/settings")" | tee -a "$LOG"
echo "Next: bash scripts/deploy/cloudflare-prod.command" | tee -a "$LOG"
echo "DONE $(date)" | tee -a "$LOG"
