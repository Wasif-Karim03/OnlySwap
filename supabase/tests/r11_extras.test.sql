-- S50/S51 (0205): price_hint by condition (R11-HINT-01), the R1.1 push prefs
-- for announcements and rating_revealed, and rating_revealed itself
-- (R11-NOTIF-01: both rated → both told once; one-sided ratings at 7 days by
-- the hourly job; blocked pairs never; T-NOTIF "fires once").
begin;
select plan(31);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

create function pg_temp.cat(n int) returns smallint language sql stable as $$
  select id from public.categories order by id offset n limit 1
$$;

-- Price hint ------------------------------------------------------------------------------------
insert into public.listings (id, campus_id, seller_id, title, status, kind, price_cents, category_id, condition, sold_at)
select gen_random_uuid(), tests.uid('OSU'), tests.uid('C'), 'Sold thing ' || v.p, 'sold', 'sale', v.p, pg_temp.cat(0),
       v.c::public.item_condition, '2027-03-01'
from (values (1000, 'good'), (2000, 'good'), (3000, 'good'), (4000, 'good'), (5000, 'good'), (9000, 'new')) v(p, c);
-- Category 2: only three sales on this campus, five more on another campus.
insert into public.listings (id, campus_id, seller_id, title, status, kind, price_cents, category_id, condition, sold_at)
select gen_random_uuid(), tests.uid('OSU'), tests.uid('C'), 'Lamp ' || g, 'sold', 'sale', 1000 * g, pg_temp.cat(1), 'good', '2027-03-01'
from generate_series(1, 3) g;
insert into public.listings (id, campus_id, seller_id, title, status, kind, price_cents, category_id, condition, sold_at)
select gen_random_uuid(), tests.uid('UMICH'), tests.uid('D'), 'Lamp ' || g, 'sold', 'sale', 1000 * g, pg_temp.cat(1), 'good', '2027-03-01'
from generate_series(1, 5) g;
-- Not comparables: unsold, free, and sold too long ago.
insert into public.listings (id, campus_id, seller_id, title, status, kind, price_cents, category_id, condition, sold_at) values
  (gen_random_uuid(), tests.uid('OSU'), tests.uid('C'), 'Active good', 'active', 'sale', 100000, pg_temp.cat(0), 'good', null),
  (gen_random_uuid(), tests.uid('OSU'), tests.uid('C'), 'Free good', 'sold', 'free', 0, pg_temp.cat(0), 'good', '2027-03-01'),
  (gen_random_uuid(), tests.uid('OSU'), tests.uid('C'), 'Old good', 'sold', 'sale', 100000, pg_temp.cat(0), 'good', '2025-01-01');
refresh materialized view public.price_hints;

select is(tests.try_text_as(tests.uid('A'), format($$select public.price_hint(%s::smallint, 'good')::text$$, pg_temp.cat(0)))::jsonb,
  '{"n": 5, "p25": 2000, "p50": 3000, "p75": 4000, "scope": "condition", "p25_cents": 2000, "p75_cents": 4000, "median_cents": 3000}'::jsonb,
  'five sales in that condition: its own quartiles and n');
select is(tests.try_text_as(tests.uid('A'), format($$select public.price_hint(%s::smallint, 'new')::text$$, pg_temp.cat(0)))::jsonb,
  '{"n": 6, "p25": 2000, "p50": 3000, "p75": 5000, "scope": "category", "p25_cents": 2000, "p75_cents": 5000, "median_cents": 3000}'::jsonb,
  'one sale in that condition: the category numbers instead');
select is(tests.try_text_as(tests.uid('A'), format($$select public.price_hint(%s::smallint, null) ->> 'scope'$$, pg_temp.cat(0))),
  'category', 'no condition: the category numbers');
select is(tests.try_text_as(tests.uid('A'), format($$select coalesce(public.price_hint(%s::smallint, 'good')::text, 'null')$$, pg_temp.cat(1))),
  'null', 'under 5 comparables on the campus: nothing (other campuses never count)');
select is(tests.try_text_as(tests.uid('A'), format($$select public.price_hint(%s::smallint, 'mint')::text$$, pg_temp.cat(0))),
  'ERROR: INVALID:condition', 'unknown condition');
select is(tests.try_text_as(tests.uid('A'), format($$select public.price_hint(%s::smallint)::text$$, pg_temp.cat(0)))::jsonb,
  '{"p25": 2000, "p50": 3000, "p75": 5000}'::jsonb, 'the R1.0 one-argument form is unchanged');
select is(tests.try_text_as(tests.uid('D'), format($$select public.price_hint(%s::smallint, 'good')::text$$, pg_temp.cat(1))),
  'ERROR: NOT_ACTIVE:waitlist', 'needs an active account');
select ok(not has_function_privilege('anon', 'public.price_hint(smallint, text)', 'execute'), 'anon cannot ask for a price hint');
select ok(has_function_privilege('authenticated', 'public.price_hint(smallint, text)', 'execute'), 'signed-in students can');

-- Push prefs for the R1.1 types -------------------------------------------------------------------
select is(private.push_pref('announcement_news'), 'tips', 'news announcements follow the tips pref (opt-in)');
select is(private.push_pref('announcement_safety'), null, 'safety announcements always go');
select is(private.push_pref('rating_revealed'), 'meetups', 'rating_revealed follows the meetups pref');
select is(private.push_pref('listing_stale') || ',' || private.push_pref('free_food') || ',' || private.push_pref('quad_reply') || ',' || private.push_pref('wanted_match'),
  'tips,free_food,quad_replies,offers', 'earlier mappings unchanged');
select is(private.push_pref('campus_unlocked'), null, 'campus_unlocked still always on');

-- rating_revealed: both sides rated ----------------------------------------------------------------
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, buyer_outcome) values
  ('00000000-0000-4000-8000-0000000ca001', tests.uid('B'), tests.uid('A'), 'Desk', 3000, 2500, 'done'),
  ('00000000-0000-4000-8000-0000000ca002', tests.uid('C'), tests.uid('A'), 'Lamp', 1000, 900, 'done'),
  ('00000000-0000-4000-8000-0000000ca003', tests.uid('B'), tests.uid('C'), 'Fan', 1000, 900, 'done'),
  ('00000000-0000-4000-8000-0000000ca004', tests.uid('C'), tests.uid('B'), 'Mug', 500, 500, 'done');

insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up, created_at)
values ('00000000-0000-4000-8000-0000000ca001', tests.uid('B'), tests.uid('A'), true, '2027-03-10 11:00-05');
select is((select count(*)::int from public.notifications where type = 'rating_revealed'), 0, 'one side rated: nothing revealed yet');
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up, created_at)
values ('00000000-0000-4000-8000-0000000ca001', tests.uid('A'), tests.uid('B'), true, '2027-03-10 12:00-05');
select is((select count(*)::int from public.notifications where type = 'rating_revealed'), 2, 'second rating: both people told');
select is((select grp || ':' || title || ':' || body || ':' || (data ->> 'chat_id') from public.notifications
           where type = 'rating_revealed' and user_id = tests.uid('A')),
  'meetups:New rating:Your rating from Ben is in:00000000-0000-4000-8000-0000000ca001', 'the seller hears from the buyer');
select is((select body from public.notifications where type = 'rating_revealed' and user_id = tests.uid('B')),
  'Your rating from Aisha is in', 'and the buyer from the seller');
select ok(position('ca001' in (select string_agg(dedupe_key, ',') from public.notifications where type = 'rating_revealed')) = 0
          and (select bool_and(dedupe_key like 'rating_revealed:%') from public.notifications where type = 'rating_revealed'),
  'dedupe key per rating id');

-- rating_revealed: the 7-day reveal ----------------------------------------------------------------
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up, created_at) values
  ('00000000-0000-4000-8000-0000000ca002', tests.uid('C'), tests.uid('A'), false, '2027-03-03 10:00-05'),   -- 7 days ago today
  ('00000000-0000-4000-8000-0000000ca003', tests.uid('B'), tests.uid('C'), true, '2027-02-20 10:00-05'),    -- long past (already told)
  ('00000000-0000-4000-8000-0000000ca004', tests.uid('C'), tests.uid('B'), true, '2027-03-03 09:00-05');   -- blocked pair
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('B'), tests.uid('C'));
select is(private.rating_reveal(), 2, 'the job looks at ratings that turned 7 days old in the last day');
select is((select count(*)::int from public.notifications where type = 'rating_revealed' and user_id = tests.uid('A')), 2,
  'the one-sided rating is revealed to its ratee');
select is((select body from public.notifications where type = 'rating_revealed' and user_id = tests.uid('A') order by id desc limit 1),
  'Your rating from Cam is in', 'from the rater');
select is((select count(*)::int from public.notifications where type = 'rating_revealed' and user_id = tests.uid('C')), 0,
  'older ratings are not re-announced');
select is((select count(*)::int from public.notifications where type = 'rating_revealed' and user_id = tests.uid('B')), 1,
  'a blocked pair hears nothing');
select lives_ok($$select private.rating_reveal()$$, 'running the job again');
select is((select count(*)::int from public.notifications where type = 'rating_revealed'), 3, 'fires once (dedupe)');
select ok(not has_function_privilege('authenticated', 'private.rating_reveal()', 'execute'), 'the job is not callable by users');

-- A deleted rater reads as such; the job skips ratings whose ratee is gone.
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up, created_at)
values ('00000000-0000-4000-8000-0000000ca003', null, tests.uid('B'), true, '2027-03-03 11:00-05');
delete from public.blocks;
select is(private.rating_reveal(), 3, 'a rating from a deleted account counts');
select is((select count(*)::int from public.notifications where type = 'rating_revealed' and user_id = tests.uid('B')
           and body = 'Your rating from a deleted user is in'), 1, 'and says so');

-- The new functions keep to the house rules
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname in ('start_data_export', 'finish_data_export', 'fail_data_export', 'export_user_data',
                                                       'rating_reveal', 'notify_rating_revealed', 'price_hint_json', 'pct', 'export_name')
             and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))), 0,
  'no new private helper is callable by anon or authenticated');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'admin\_%' and has_function_privilege('anon', p.oid, 'execute')), 0,
  'anon can call no admin RPC');

select * from finish();
rollback;
