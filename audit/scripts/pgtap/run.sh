#!/bin/bash
# Run one audit pgTAP file against the scratch clone DB (audit_sec), never the shared local DB.
# Create the clone once with: bash audit/scripts/pgtap/clone-db.sh
cd "$(dirname "$0")/../../.."
f=${1:?file}
pnpm -s supabase test db --db-url "postgresql://postgres:postgres@127.0.0.1:54322/audit_sec" "$(pwd)/audit/scripts/pgtap/$f"
