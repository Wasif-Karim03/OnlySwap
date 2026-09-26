#!/usr/bin/env bash
# S2 Mac verification (docs/GOALS.md S2). Needs Docker Desktop running.
#   bash scripts/verify/s02.sh
# Paste the summary block at the end back to Claude.
set -u
cd "$(git rev-parse --show-toplevel)"

declare -a SUMMARY=()
FAILED=0
step() {
  local name="$1"; shift
  echo ""
  echo "=== $name"
  if "$@"; then SUMMARY+=("PASS  $name"); else SUMMARY+=("FAIL  $name"); FAILED=1; fi
}

gitleaks_installed() { command -v gitleaks >/dev/null && gitleaks version; }

hook_installed() { grep -q "pre-commit.sh" .git/hooks/pre-commit 2>/dev/null; }

planted_secret_blocked() {
  local f=".planted-secret-check.ts"
  printf 'const k = "sb_secret_%s";\n' "Z9kPq2LmX7rT4bNv8Wc3HyJd" > "$f"
  git add -f "$f"
  local rc=0
  bash scripts/hooks/pre-commit.sh >/dev/null 2>&1 || rc=$?
  git reset -q -- "$f"; rm -f "$f"
  [ "$rc" -ne 0 ]
}

supabase_up() {
  docker info >/dev/null 2>&1 || { echo "Docker is not running"; return 1; }
  pnpm supabase start
}

studio_opens() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54323)"
  echo "Studio http://127.0.0.1:54323 -> $code"
  [ "$code" = 200 ] || [ "$code" = 307 ] || [ "$code" = 308 ]
}

write_env_local() {
  local f=apps/mobile/.env.local
  if [ -f "$f" ]; then echo "$f exists, left as is"; return 0; fi
  local status url key
  status="$(pnpm -s supabase status -o env)" || return 1
  url="$(printf '%s\n' "$status" | sed -n 's/^API_URL="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')"
  key="$(printf '%s\n' "$status" | sed -n 's/^ANON_KEY="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p')"
  [ -n "$url" ] && [ -n "$key" ] || return 1
  sed -e "s|^EXPO_PUBLIC_SUPABASE_URL=.*|EXPO_PUBLIC_SUPABASE_URL=$url|" \
      -e "s|^EXPO_PUBLIC_SUPABASE_ANON_KEY=.*|EXPO_PUBLIC_SUPABASE_ANON_KEY=$key|" \
      apps/mobile/.env.example > "$f"
  echo "wrote $f (git-ignored)"
}

step "install (installs the pre-commit hook)" pnpm install --frozen-lockfile
step "G1 lint" pnpm lint
step "G2 typecheck" pnpm typecheck
step "G3 unit tests (incl. P1-ENV-01 missing-env crash)" pnpm test
step "P1-ENV-02 gitleaks installed (brew install gitleaks)" gitleaks_installed
step "P1-ENV-02 pre-commit hook installed" hook_installed
step "P1-ENV-02 a commit containing a fake key is blocked" planted_secret_blocked
step "P1-DB-01 supabase start" supabase_up
step "P1-DB-01 local Studio opens" studio_opens
step "G7 supabase test db" pnpm supabase test db
step "apps/mobile/.env.local from the local stack" write_env_local

echo ""
echo "================ S2 summary ================"
printf '%s\n' "${SUMMARY[@]}"
echo "On GitHub: P1-CI-01 CI green on the PR; P1-CI-02 planted checks are proven in the PR body."
[ "$FAILED" = 0 ] && echo "RESULT: PASS" || echo "RESULT: FAIL"
exit "$FAILED"
