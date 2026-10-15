#!/usr/bin/env bash
# Exports ids of the seeded loadtest data for the k6 scripts (data/*.json).
PGURL=${PGURL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
cd "$(dirname "$0")"; mkdir -p data
q() { psql "$PGURL" -Atc "$1" > "data/$2"; }
q "select json_agg(json_build_array(l.id, substr(l.seller_id::text,25)::int)) from (select id, seller_id from listings where campus_id='90000000-0000-4000-8000-000000000001' and status='active' and kind='sale' order by id limit 8000) l" listings.json
q "select json_agg(json_build_array(c.id, substr(c.buyer_id::text,25)::int, substr(c.seller_id::text,25)::int)) from (select id,buyer_id,seller_id from chats where seller_id::text like '50000000%' and buyer_id::text like '50000000%' and status='open' order by id limit 6000) c" chats.json
q "select json_agg(id) from (select id from quad_posts where campus_id='90000000-0000-4000-8000-000000000001' order by id limit 1500) q" quad.json
