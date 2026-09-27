#!/usr/bin/env bash
# P3-TYPES-01: packages/shared/src/db.ts must match `supabase gen types` for the
# local database (migrations applied). Fails on drift; fix with `pnpm db:types`.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
file=packages/shared/src/db.ts
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
supabase gen types typescript --local --schema public > "$tmp"
if [ ! -f "$file" ]; then
  echo "db-types: $file is missing; run pnpm db:types and commit it"
  exit 1
fi
if ! diff -u "$file" "$tmp"; then
  echo "db-types: $file is out of date; run pnpm db:types and commit it"
  exit 1
fi
echo "db-types: $file matches the database"
