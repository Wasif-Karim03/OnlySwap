#!/usr/bin/env bash
# Applies new migrations to the LOCAL Supabase database; output migrate.log.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
pnpm supabase migration up --include-all > migrate.log 2>&1
echo "exit $? $(date)" >> migrate.log
