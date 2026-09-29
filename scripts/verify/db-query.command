#!/usr/bin/env bash
# Runs scripts/verify/query.sql against the LOCAL Supabase database (read-only
# diagnostics) and writes query.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
docker exec -i supabase_db_onlyswap psql -U postgres -d postgres -X -v ON_ERROR_STOP=0 \
  < scripts/verify/query.sql > query.log 2>&1
echo "done $(date)" >> query.log
