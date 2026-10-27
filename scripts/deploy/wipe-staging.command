#!/usr/bin/env bash
# Wipes STAGING test data (owner, 2026-10-27): every account (yours too), every
# listing, offer, chat, Quad post, report, notification, email and log, plus all
# photos in the two staging R2 buckets. Keeps campuses, campus domains, school
# meetup spots, categories, banned words and hashes, app settings, the admin
# two-factor switch and the staff email list (so your admin email becomes
# owner again when you sign in to the console).
#   bash scripts/deploy/wipe-staging.command
# Shows counts first and asks you to type WIPE STAGING. Staging only: it finds
# the project by the name onlyswap-staging and the buckets must end in -staging.
# Can't be undone.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
set -o pipefail
NAME=onlyswap-staging
LOG=wipe-staging.log
: > "$LOG"
SB() { pnpm -s supabase "$@"; }
WR() { npx -y wrangler@4 "$@"; }
die() { echo "STOPPED: $*" | tee -a "$LOG"; exit 1; }
say() { echo; echo "== $*" | tee -a "$LOG"; }
kc_get() { security find-generic-password -a "$NAME" -s "$1" -w 2>/dev/null; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);$1})"; }

say "1/5 Find onlyswap-staging"
SB projects list -o json >/dev/null 2>&1 || SB login || die "login failed"
REF=$(SB projects list -o json | json "const p=(Array.isArray(j)?j:[]).find(p=>p.name==='$NAME');console.log(p?(p.ref||p.id):'')")
[ -n "$REF" ] || die "could not find $NAME"
PW=$(kc_get onlyswap-db-password); [ -n "$PW" ] || die "staging DB password not in Keychain"
export SUPABASE_DB_PASSWORD="$PW"
SB link --project-ref "$REF" >/dev/null 2>&1 || die "link failed"
echo "staging ref: $REF" | tee -a "$LOG"

WR whoami >/dev/null 2>&1 || WR login || die "wrangler login failed"
ACCOUNT_ID=$(WR whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)
[ -n "$ACCOUNT_ID" ] || die "no Cloudflare account id"
export R2_ENDPOINT="https://$ACCOUNT_ID.r2.cloudflarestorage.com"
export R2_ACCESS_KEY_ID=$(kc_get onlyswap-r2-access-key-id)
export R2_SECRET_ACCESS_KEY=$(kc_get onlyswap-r2-secret)
[ -n "$R2_SECRET_ACCESS_KEY" ] || die "R2 keys not in Keychain (run cloudflare-staging.command once)"
R2W() { node --no-warnings --experimental-strip-types scripts/deploy/wipe-r2-staging.ts "$1" 2>&1 | tee -a "$LOG"; }

KEEP="'public.campuses','public.campus_domains','public.safe_spots','public.categories','public.banned_words','public.banned_hashes','public.common_first_names','public.app_config','private.admin_settings','private.staff_emails'"

say "2/5 What's there now"
SB db query --linked "select (select count(*) from auth.users) as accounts,
  (select count(*) from public.listings) as listings, (select count(*) from public.offers) as offers,
  (select count(*) from public.chats) as chats, (select count(*) from public.quad_posts) as quad_posts,
  (select count(*) from public.reports) as reports, (select count(*) from public.campuses) as campuses_kept;" 2>&1 | tee -a "$LOG"
echo "Tables that will be emptied:" | tee -a "$LOG"
SB db query --linked "select string_agg(schemaname||'.'||tablename, ', ' order by 1) as tables from pg_tables
  where schemaname in ('public','private') and schemaname||'.'||tablename not in ($KEEP);" 2>&1 | tee -a "$LOG"
R2W count || die "could not list R2"

echo
echo "This deletes ALL of the above on STAGING ($REF), including your own account."
read -rp "Type WIPE STAGING to go on: " ok
[ "$ok" = "WIPE STAGING" ] || die "cancelled, nothing changed"

say "3/5 Empty the database (one transaction: all or nothing)"
SB db query --linked "do \$\$
declare list text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ') into list from pg_tables
   where schemaname in ('public','private') and schemaname||'.'||tablename not in ($KEEP);
  -- audit_log refuses TRUNCATE (0005); lift that guard for this one wipe only.
  alter table public.audit_log disable trigger audit_log_no_truncate;
  execute 'truncate table ' || list || ' restart identity';
  alter table public.audit_log enable trigger audit_log_no_truncate;
  delete from auth.users;
end \$\$;" 2>&1 | tee -a "$LOG" || die "database wipe failed, nothing changed (see $LOG)"

say "4/5 Delete the staging photos"
R2W delete || die "R2 delete failed (database is already empty; re-run to finish photos)"

say "5/5 Check"
SB db query --linked "select (select count(*) from auth.users) as accounts, (select count(*) from public.listings) as listings,
  (select count(*) from public.campuses) as campuses, (select count(*) from private.staff_emails) as staff_emails;" 2>&1 | tee -a "$LOG"
R2W count
echo
echo "DONE $(date). Delete the app on your phone and reinstall from TestFlight, then sign up again."
echo "Admin: sign in at onlyswap-admin.pages.dev with your staff email; you're owner again."
