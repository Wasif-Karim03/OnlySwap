#!/bin/bash
# Scratch clone of the LOCAL db (docker supabase_db_onlyswap) so pgTAP fixtures (which delete auth.users and truncate
# campuses) never block or disturb another session that is seeding the shared local DB. Local only.
docker exec supabase_db_onlyswap psql -U postgres -q -c "drop database if exists audit_sec" -c "create database audit_sec"
docker exec supabase_db_onlyswap sh -c "pg_dump -U postgres -d postgres --no-owner --exclude-schema=cron --exclude-schema=_realtime --exclude-schema=supabase_functions | psql -U postgres -d audit_sec -q" >/dev/null 2>&1
docker exec supabase_db_onlyswap psql -U postgres -d audit_sec -q -c "set session_replication_role = replica; truncate public.campuses cascade; delete from auth.users;" >/dev/null 2>&1
echo cloned
