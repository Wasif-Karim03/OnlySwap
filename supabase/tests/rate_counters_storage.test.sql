-- E-12 (audit): rate_counters is updated on nearly every RPC call. It keeps
-- free space on each page (fillfactor 70) so a counter bump is a HOT update,
-- and autovacuum runs on a fixed row count instead of 20% of the table.
begin;
select plan(3);

select ok('fillfactor=70' = any(coalesce((select reloptions from pg_class where oid = 'public.rate_counters'::regclass), '{}'::text[])),
  'rate_counters leaves room for HOT updates');
select ok('autovacuum_vacuum_scale_factor=0' = any(coalesce((select reloptions from pg_class where oid = 'public.rate_counters'::regclass), '{}'::text[])),
  'autovacuum does not wait for 20% dead rows');
select ok('autovacuum_vacuum_threshold=1000' = any(coalesce((select reloptions from pg_class where oid = 'public.rate_counters'::regclass), '{}'::text[])),
  'autovacuum runs every 1000 dead rows');

select * from finish();
rollback;
