#!/usr/bin/env bash
# Creates the reviewer accounts on a Supabase project (P4-AUTH-15).
#   bash scripts/seed-review.sh https://<project-ref>.supabase.co
# Asks for the service key and the reviewer password at hidden prompts, so
# neither ends up in your shell history, a file or a chat.
set -euo pipefail
cd "$(dirname "$0")/.."
url="${1:?usage: bash scripts/seed-review.sh https://<project-ref>.supabase.co}"
read -rsp "Service role key (hidden): " service_key; echo
read -rsp "Reviewer password, 12+ characters (hidden): " password; echo
SUPABASE_URL="$url" SERVICE_KEY="$service_key" REVIEW_PASSWORD="$password" \
  node --no-warnings --experimental-strip-types scripts/seed-review.ts
