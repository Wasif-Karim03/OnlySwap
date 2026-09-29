-- Perf-06 / Perf-08 (P14-PERF-01): feed and search latency at a 10k-listing seed,
-- and the database size it costs. Runs in one transaction and rolls back.
--   psql "$DB_URL" -f scripts/load/feed.sql      (local: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
-- Needs the local seed (aisha@osu.edu is the viewer, ben@osu.edu the seller).
begin;

-- 10k active listings from 200 sellers on the OSU campus.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'load' || g || '@osu.edu', '', now(), '{"provider":"email"}', '{}', now(), now(), '', '', '', ''
from generate_series(1, 200) g;
update public.profiles set first_name = 'Load', adult_confirmed_at = now(), rules_accepted_at = now()
 where id in (select id from auth.users where email like 'load%@osu.edu');

insert into public.listings (id, campus_id, seller_id, title, description, status, price_cents, category_id, condition, bumped_at)
select gen_random_uuid(), '10000000-0000-4000-8000-000000000001', s.id,
       (array['Mini fridge','Desk lamp','Chem textbook','27 inch monitor','Bike','Futon','Rice cooker','Calculator'])[1 + g % 8] || ' ' || g,
       'Load test listing number ' || g, 'active', 500 + (g % 200) * 100,
       (select id from public.categories order by id limit 1 offset (g % 5)),
       (array['new','like_new','good','fair'])[1 + g % 4]::public.item_condition,
       now() - (g || ' minutes')::interval
from generate_series(1, 10000) g
join lateral (select id from auth.users where email = 'load' || (1 + g % 200) || '@osu.edu') s on true;
analyze public.listings;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-00000000000a', true);
select set_config('request.jwt.claims', json_build_object('sub', '20000000-0000-4000-8000-00000000000a',
  'role', 'authenticated', 'aal', 'aal1', 'campus_id', '10000000-0000-4000-8000-000000000001',
  'status', 'active', 'adult', true)::text, true);
set local role authenticated;

create temp table timings (fn text, ms numeric) on commit drop;
do $$
declare
  t0 timestamptz;
  cur jsonb := null;
  res jsonb;
  words text[] := array['fridge','lamp','textbook','monitor','bike','futon','cooker','calculator','mini frig','desk'];
begin
  for i in 1..40 loop
    t0 := clock_timestamp();
    res := public.get_feed(cur, 20);
    insert into timings values ('get_feed', extract(epoch from clock_timestamp() - t0) * 1000);
    -- keyset cursor from the last card; start over when the feed runs out
    cur := case when jsonb_array_length(res) > 0
                then jsonb_build_object('bumped_at', res -> -1 ->> 'bumped_at', 'id', res -> -1 ->> 'id') end;
  end loop;
  for i in 1..40 loop
    t0 := clock_timestamp();
    perform public.search_listings(words[1 + i % 10], '{}'::jsonb, null);
    insert into timings values ('search_listings', extract(epoch from clock_timestamp() - t0) * 1000);
  end loop;
end;
$$;

reset role;
select fn,
       round(percentile_cont(0.5) within group (order by ms)::numeric, 1) as p50_ms,
       round(percentile_cont(0.95) within group (order by ms)::numeric, 1) as p95_ms,
       case fn when 'get_feed' then 300 else 400 end as target_p95_ms
from timings group by fn order by fn;
select pg_size_pretty(pg_database_size(current_database())) as db_size_with_10k_listings;
rollback;
