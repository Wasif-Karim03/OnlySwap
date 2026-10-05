#!/usr/bin/env bash
# After the R1.1 + R2 build (DEC 76-85): rebuilds the LOCAL database with the
# new migrations and seed (local test data is wiped and reseeded), regenerates
# packages/shared/src/db.ts from it, runs the database tests, then restarts the
# phone-on-Wi-Fi setup. Output: after-r2.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
{
  echo "== $(date)"
  open -ga Docker 2>/dev/null
  for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 3; done
  pnpm install --frozen-lockfile 2>&1 | tail -3
  echo "== db reset"
  pnpm supabase db reset 2>&1 | tail -15
  echo "db reset exit: ${PIPESTATUS[0]}"
  echo "== db types"
  pnpm db:types && echo "db.ts regenerated"
  git diff --stat packages/shared/src/db.ts
  echo "== pgTAP"
  pnpm supabase test db 2>&1 | tail -25
  echo "== phone setup"
  bash scripts/verify/android-lan.command
  tail -3 android-lan.log
  echo "finished $(date)"
} > after-r2.log 2>&1
