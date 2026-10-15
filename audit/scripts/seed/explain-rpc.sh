#!/usr/bin/env bash
# usage: explain-rpc.sh <user_uuid> "<select ...rpc call...>"  -> auto_explain nested plans (analyze, buffers) for the RPC as that user
PGURL=${PGURL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
U=$1; SQL=$2
psql "$PGURL" -X -q <<SQL2 2>&1
set auto_explain.log_min_duration = 5;
set auto_explain.log_analyze = on;
set auto_explain.log_buffers = on;
set auto_explain.log_nested_statements = on;
set auto_explain.log_timing = on;
set auto_explain.log_format = text;
set client_min_messages = log;
select set_config('request.jwt.claims', '{"sub":"$U","role":"authenticated"}', false);
set role authenticated;
$SQL;
SQL2
