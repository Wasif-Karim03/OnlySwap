#!/usr/bin/env bash
# Sets up the Supabase STAGING project from this repo (OWNER_TODO item 1).
# Usage: bash scripts/verify/staging-setup.command <project-ref>
# Interactive on purpose: the Supabase login opens a browser and the database
# password is typed at a hidden prompt (never pasted in chat, never saved in
# git). Output is also copied to staging-setup.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
REF="${1:?usage: staging-setup.command <project-ref>}"
case "$REF" in *[!a-z0-9]*) echo "project ref looks wrong: $REF"; exit 1 ;; esac
LOG=staging-setup.log
: > "$LOG"
step() { echo; echo "== $*" | tee -a "$LOG"; }
run() { "$@" 2>&1 | tee -a "$LOG"; return "${PIPESTATUS[0]}"; }

step "1/5 Supabase login (a browser window may open)"
pnpm supabase projects list >/dev/null 2>&1 || run pnpm supabase login || exit 1

step "2/5 Link this repo to $REF (type the database password when asked)"
run pnpm supabase link --project-ref "$REF" || exit 1

step "3/5 Apply all migrations to staging (answer Y)"
run pnpm supabase db push --include-all || exit 1

step "4/5 Push auth settings (hooks, code emails, MFA)"
if grep -q "project_id = \"$REF\"" supabase/config.toml; then
  run pnpm supabase config push --project-ref "$REF" || exit 1
else
  echo "skipped: supabase/config.toml has no [remotes.staging] block for $REF yet" | tee -a "$LOG"
fi

step "5/5 Deploy Edge Functions (test-inbox stays off until E2E setup)"
for dir in supabase/functions/*/; do
  fn=$(basename "$dir")
  case "$fn" in _shared|test-inbox) continue ;; esac
  run pnpm supabase functions deploy "$fn" --project-ref "$REF" || exit 1
done

step "Check"
code=$(curl -s -o /dev/null -w '%{http_code}' "https://$REF.supabase.co/functions/v1/health")
echo "health function: $code" | tee -a "$LOG"
echo "exit 0 $(date)" | tee -a "$LOG"
