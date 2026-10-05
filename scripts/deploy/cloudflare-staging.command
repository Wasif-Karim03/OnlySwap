#!/usr/bin/env bash
# Cloudflare for STAGING (OWNER_TODO 7, 11, 13, 16, 17, 24), all free.
#   bash scripts/deploy/cloudflare-staging.command
# Run after scripts/deploy/staging-supabase.command (needs .env.staging).
# Before the first run, in the Cloudflare dashboard (see docs/deploy/CHROME_PROMPTS.md):
#   R2 enabled on the account, and an R2 API token for the two staging buckets.
# Safe to re-run. Secrets are typed at hidden prompts or read from the Keychain.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
set -o pipefail
NAME=onlyswap-staging
STATE=.env.staging
LOG=cloudflare-staging.log
MEDIA_BUCKET=onlyswap-media-staging
PRIVATE_BUCKET=onlyswap-private-staging
SITE_PROJECT=onlyswap
ADMIN_PROJECT=onlyswap-admin
WEB_PROJECT=onlyswap-web
APPLE_TEAM_ID=L3DN7Y4X67
: > "$LOG"
WR() { npx -y wrangler@4 "$@"; }
SB() { pnpm -s supabase "$@"; }
say() { echo; echo "== $*" | tee -a "$LOG"; }
die() { echo "STOPPED: $*" | tee -a "$LOG"; exit 1; }
kc_get() { security find-generic-password -a "$NAME" -s "$1" -w 2>/dev/null; }
kc_set() { security add-generic-password -U -a "$NAME" -s "$1" -w "$2" >/dev/null; }
[ -f "$STATE" ] || die "run scripts/deploy/staging-supabase.command first"
# shellcheck disable=SC1090
set -a; . "./$STATE"; set +a
REF=$STAGING_REF

say "1/6 Cloudflare login"
WR whoami >/dev/null 2>&1 || WR login || die "login failed"
ACCOUNT_ID=$(WR whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)
[ -n "$ACCOUNT_ID" ] || die "no Cloudflare account id"
echo "account: $ACCOUNT_ID (not a secret)" | tee -a "$LOG"

say "2/6 R2 buckets, CORS and the exports lifecycle rule"
for b in "$MEDIA_BUCKET" "$PRIVATE_BUCKET"; do
  out=$(WR r2 bucket create "$b" 2>&1); echo "$out" >> "$LOG"
  echo "$out" | grep -qiE 'created|already exists|already own' || die "bucket $b: R2 not enabled? (see CHROME_PROMPTS.md step A)"
  echo "bucket $b ok"
done
CORS=$(mktemp)
cat > "$CORS" <<EOF
{"rules":[{"allowed":{"origins":["https://$WEB_PROJECT.pages.dev","https://$SITE_PROJECT.pages.dev","http://localhost:8081"],"methods":["PUT","GET","HEAD"],"headers":["content-type"]},"maxAgeSeconds":3600}]}
EOF
WR r2 bucket cors set "$MEDIA_BUCKET" --file "$CORS" --force >>"$LOG" 2>&1 && echo "cors ok" || echo "cors: set it in the dashboard (CHROME_PROMPTS.md step D)" | tee -a "$LOG"
rm -f "$CORS"
WR r2 bucket lifecycle add "$PRIVATE_BUCKET" exports-8-days exports/ --expire-days 8 --force >>"$LOG" 2>&1 \
  && echo "lifecycle ok" || echo "lifecycle: may already exist (check $LOG)" | tee -a "$LOG"

say "3/6 Media Worker (photos)"
printf %s "$(kc_get onlyswap-vault-media_signing_key)" | WR secret put MEDIA_SIGNING_KEY -c workers/media/wrangler.toml --env staging >>"$LOG" 2>&1 \
  || die "worker secret failed (see $LOG)"
WR deploy -c workers/media/wrangler.toml --env staging 2>&1 | tee -a "$LOG" > /tmp/onlyswap-wrangler-deploy.txt || die "worker deploy failed"
MEDIA_URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' /tmp/onlyswap-wrangler-deploy.txt | head -1)
[ -n "$MEDIA_URL" ] || die "no workers.dev URL (enable your workers.dev subdomain: CHROME_PROMPTS.md step C)"
echo "media url: $MEDIA_URL" | tee -a "$LOG"

say "4/6 R2 upload keys for the Edge Functions"
AK=$(kc_get onlyswap-r2-access-key-id); SK=$(kc_get onlyswap-r2-secret)
if [ -z "$SK" ]; then
  echo "Paste the R2 token values from the dashboard (CHROME_PROMPTS.md step B)."
  read -rsp "R2 Access Key ID (hidden): " AK; echo
  read -rsp "R2 Secret Access Key (hidden): " SK; echo
  [ -n "$AK" ] && [ -n "$SK" ] || die "both values are needed"
  kc_set onlyswap-r2-access-key-id "$AK"; kc_set onlyswap-r2-secret "$SK"
fi
SECF=$(mktemp); chmod 600 "$SECF"
cat > "$SECF" <<EOF
R2_ENDPOINT=https://$ACCOUNT_ID.r2.cloudflarestorage.com
R2_PUBLIC_ENDPOINT=https://$ACCOUNT_ID.r2.cloudflarestorage.com
R2_REGION=auto
R2_ACCESS_KEY_ID=$AK
R2_SECRET_ACCESS_KEY=$SK
R2_BUCKET_MEDIA=$MEDIA_BUCKET
R2_BUCKET_PRIVATE=$PRIVATE_BUCKET
MEDIA_URL=$MEDIA_URL
EOF
SB secrets set --project-ref "$REF" --env-file "$SECF" >/dev/null 2>>"$LOG"; rc=$?; rm -f "$SECF"
[ $rc -eq 0 ] || die "supabase secrets failed (see $LOG)"
grep -q '^EXPO_PUBLIC_MEDIA_URL=' "$STATE" && sed -i '' "s#^EXPO_PUBLIC_MEDIA_URL=.*#EXPO_PUBLIC_MEDIA_URL=$MEDIA_URL#" "$STATE" \
  || echo "EXPO_PUBLIC_MEDIA_URL=$MEDIA_URL" >> "$STATE"
echo "upload keys stored in Supabase secrets"

pages() { # project dir
  WR pages project create "$1" --production-branch main >>"$LOG" 2>&1 || true
  WR pages deploy "$2" --project-name "$1" --branch main --commit-dirty=true 2>&1 | tee -a "$LOG" | grep -E 'https://|Success|rror' || return 1
}

say "5/6 Website ($SITE_PROJECT.pages.dev)"
SITE_URL=https://$SITE_PROJECT.pages.dev
( cd apps/site && SITE_URL=$SITE_URL APPLE_TEAM_ID=$APPLE_TEAM_ID \
    PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY \
    PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm -s build ) >>"$LOG" 2>&1 || die "site build failed (see $LOG)"
# Runtime variables for the share/invite Pages Functions (public values).
cat > apps/site/wrangler.toml <<EOF
# Generated by scripts/deploy/cloudflare-staging.command (git-ignored).
name = "$SITE_PROJECT"
pages_build_output_dir = "dist"
compatibility_date = "2026-09-01"
[vars]
SUPABASE_URL = "$EXPO_PUBLIC_SUPABASE_URL"
SUPABASE_ANON_KEY = "$EXPO_PUBLIC_SUPABASE_ANON_KEY"
MEDIA_URL = "$MEDIA_URL"
TURNSTILE_SITE_KEY = "1x00000000000000000000AA"
EOF
( cd apps/site && pages "$SITE_PROJECT" dist ) || die "site deploy failed (name taken? see $LOG)"

say "6/6 Admin ($ADMIN_PROJECT.pages.dev) and web app ($WEB_PROJECT.pages.dev)"
( cd apps/admin && VITE_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY \
    VITE_MEDIA_URL=$MEDIA_URL pnpm -s build ) >>"$LOG" 2>&1 || die "admin build failed (see $LOG)"
pages "$ADMIN_PROJECT" apps/admin/dist || die "admin deploy failed"
( cd apps/mobile && EXPO_PUBLIC_APP_ENV=staging EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY EXPO_PUBLIC_MEDIA_URL=$MEDIA_URL \
    EXPO_PUBLIC_SITE_URL=$SITE_URL pnpm -s export:web ) >>"$LOG" 2>&1 || die "web app build failed (see $LOG)"
pages "$WEB_PROJECT" apps/mobile/dist || die "web app deploy failed"

say "Check"
for u in "$SITE_URL" "https://$ADMIN_PROJECT.pages.dev" "https://$WEB_PROJECT.pages.dev" "$MEDIA_URL/health"; do
  echo "$u -> $(curl -s -o /dev/null -w '%{http_code}' "$u")" | tee -a "$LOG"
done
echo "DONE $(date)" | tee -a "$LOG"
