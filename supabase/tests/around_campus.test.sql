-- S48 Around campus (P5-SELL-06, P5-SELL-08, P6-CAMP-01, R11-NOTIF-01 free_food + wanted_match):
-- T-INT-LIST-01 food/wanted cases (fields, caps), free_food fan-out (pref, cap,
-- blocks, dedupe), wanted_match ("I have this" + category, once a day),
-- get_campus_feed sections, expiry, blocks, campus scope, cursor, rate limit,
-- and Discover/search keeping to sale and free.
begin;
select plan(60);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01'
 where id in (tests.uid('A'), tests.uid('B'), tests.uid('C'), tests.uid('MOD'), tests.uid('OWN'));

insert into public.safe_spots (id, campus_id, name, lat, lng) values
  ('00000000-0000-4000-8000-0000000005f1', tests.uid('OSU'), 'Union front desk', 40.0, -83.0);
-- B and MOD want free food pushes; C leaves the default (off).
update public.notification_prefs set free_food = true where user_id in (tests.uid('B'), tests.uid('MOD'));
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('MOD'), tests.uid('A'));

create function pg_temp.reserve(who text) returns uuid language plpgsql as $$
declare r uuid;
begin
  perform tests.authenticate_as(tests.uid(who));
  r := public.reserve_listing_id();
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return r;
end $$;
create function pg_temp.photos(lid uuid, n int default 1) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'path', 'c/' || tests.uid('OSU') || '/l/' || lid || '/p' || g || '_full.webp',
    'thumb_path', 'c/' || tests.uid('OSU') || '/l/' || lid || '/p' || g || '_thumb.webp')), '[]')
  from generate_series(1, n) g
$$;
-- Posts as `who`; returns the id, or the error text.
create function pg_temp.post(who text, args text) returns text language plpgsql as $$
declare lid uuid := pg_temp.reserve(who); res text;
begin
  res := tests.try_text_as(tests.uid(who), format(
    'select public.create_listing(id := %L, %s) ->> ''id''', lid, replace(args, '$ID', lid::text)));
  return res;
end $$;
create function pg_temp.food(who text, title text default 'Pizza slices', mins int default 60) returns text
language sql as $$
  select pg_temp.post(who, format($f$kind := 'food', title := %L, food_minutes := %s,
    meet_spot_ids := array['00000000-0000-4000-8000-0000000005f1']::uuid[]$f$, title, mins))
$$;
create function pg_temp.wanted(who text, title text default 'Mini fridge', cat int default 1) returns text
language sql as $$
  select pg_temp.post(who, format($f$kind := 'wanted', title := %L, category_id := %s::smallint,
    wanted_max_cents := 5000$f$, title, cat))
$$;
create function pg_temp.sale(who text, title text, cat int, extra text default '') returns text
language plpgsql as $$
declare lid uuid := pg_temp.reserve(who);
begin
  return tests.try_text_as(tests.uid(who), format(
    $f$select public.create_listing(id := %L, title := %L, category_id := %s::smallint, price_cents := 3000,
         photos := %L::jsonb %s) ->> 'id'$f$, lid, title, cat, pg_temp.photos(lid), extra));
end $$;
create function pg_temp.feed(who text, k text default null, cur jsonb default null) returns jsonb language plpgsql as $$
declare r text;
begin
  r := tests.try_text_as(tests.uid(who), format('select public.get_campus_feed(%L, %L::jsonb)::text', k, cur));
  if r like 'ERROR:%' then return to_jsonb(r); end if;
  return r::jsonb;
end $$;
create function pg_temp.kinds(f jsonb) returns text language sql as $$
  select coalesce(string_agg(distinct i ->> 'kind', ',' order by i ->> 'kind'), '')
  from jsonb_array_elements(f -> 'items') i
$$;

-- Free food: fields and caps (T-INT-LIST-01) ---------------------------------------------------
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('food1', pg_temp.food('A')::uuid);
select is((select kind::text || ':' || status::text from public.listings where id = (select id from ids where name = 'food1')),
  'food:active', 'free food posts without a photo');
select is((select expires_at from public.listings where id = (select id from ids where name = 'food1')),
  '2027-03-10 13:00:00-05'::timestamptz, 'food expires after its minutes');
select is(pg_temp.food('A', 'Bagels', 200), 'ERROR: INVALID:food_minutes', 'food lasts at most 3 hours');
select is(pg_temp.food('A', 'Bagels', 10), 'ERROR: INVALID:food_minutes', 'and at least 15 minutes');
select is(pg_temp.post('A', $$kind := 'food', title := 'Bagels'$$), 'ERROR: INVALID:food_minutes',
  'food needs a time');
select is(pg_temp.post('A', $$kind := 'food', title := 'Bagels', food_minutes := 30, photos := '[{"path":"c/x/1.webp","thumb_path":"c/x/1t.webp"},{"path":"c/x/2.webp","thumb_path":"c/x/2t.webp"}]'::jsonb$$),
  'ERROR: INVALID:photos', 'food takes at most one photo');
insert into ids values ('food2', pg_temp.food('A', 'Cookies', 30)::uuid);
insert into ids values ('food3', pg_temp.food('A', 'Donuts', 90)::uuid);
select matches(pg_temp.food('A', 'Fruit'), '^ERROR: RATE_LIMITED:create_food:',
  'the fourth food post in a day is limited (3/day)');

-- free_food notifications
select is((select count(*)::int from public.notifications where user_id = tests.uid('B') and type = 'free_food'), 3,
  'B (pref on) hears about each food post');
select is((select body from public.notifications
           where user_id = tests.uid('B') and type = 'free_food' and data ->> 'listing_id' = (select id::text from ids where name = 'food1')),
  'Free Pizza slices at Union front desk until 1:00 PM', 'what, where and until when (campus time)');
select is((select grp || ':' || dedupe_key from public.notifications
           where user_id = tests.uid('B') and data ->> 'listing_id' = (select id::text from ids where name = 'food1')),
  'campus:free_food:' || (select id::text from ids where name = 'food1'), 'campus group, dedupe per post');
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'free_food'), 0,
  'C (pref off, the default) gets none');
select is((select count(*)::int from public.notifications where user_id = tests.uid('A') and type = 'free_food'), 0,
  'not the poster');
select is((select count(*)::int from public.notifications where user_id = tests.uid('MOD') and type = 'free_food'), 0,
  'not someone who blocked the poster');
update public.notification_prefs set free_food = true where user_id = tests.uid('D');
select is((select count(*)::int from public.notifications where user_id = tests.uid('D') and type = 'free_food'), 0,
  'not another campus');
insert into ids values ('food4', pg_temp.food('C', 'Tacos')::uuid);
select is((select count(*)::int from public.notifications where user_id = tests.uid('B') and type = 'free_food'), 3,
  'at most 3 free food notifications a person a day');
select is((select count(*)::int from public.notifications where user_id = tests.uid('MOD') and type = 'free_food'), 1,
  'MOD hears about C''s post');
select is(private.notify_free_food((select l from public.listings l where id = (select id from ids where name = 'food4'))),
  1, 're-running the fan-out finds MOD again');
select is((select count(*)::int from public.notifications where user_id = tests.uid('MOD') and type = 'free_food'), 1,
  'but the dedupe key keeps it to one');

-- push prefs
select is(private.push_pref('free_food'), 'free_food', 'free_food push follows the free_food pref');
select is(private.push_pref('wanted_match'), 'offers', 'wanted_match push follows the offers pref');
select is(private.push_pref('campus_unlocked'), null, 'campus_unlocked always pushes');
insert into public.push_tokens (user_id, token, platform) values (tests.uid('MOD'), 'ExponentPushToken[mod]', 'ios');
update public.notification_prefs set free_food = false where user_id = tests.uid('MOD');
select is(jsonb_array_length(private.claim_pushes(500)), 0, 'turning free_food off before the send skips the push');
select is((select push_state::text from public.notifications where user_id = tests.uid('MOD') and type = 'free_food'), 'skipped',
  'and it stays in the in-app list');

-- Wanted: fields and caps ----------------------------------------------------------------------
insert into ids values ('wantB', pg_temp.wanted('B')::uuid);
select is((select kind::text || ':' || wanted_max_cents || ':' || price_cents from public.listings
           where id = (select id from ids where name = 'wantB')), 'wanted:5000:0', 'a Wanted keeps its max price');
select is(pg_temp.post('B', $$kind := 'wanted', title := 'Desk', wanted_max_cents := 300000$$),
  'ERROR: INVALID:wanted_max_cents', 'max price up to $2,000');
select is(pg_temp.post('B', $$kind := 'wanted', title := 'Desk', photos := '[{"path":"c/x/1.webp","thumb_path":"c/x/1t.webp"},{"path":"c/x/2.webp","thumb_path":"c/x/2t.webp"}]'::jsonb$$),
  'ERROR: INVALID:photos', 'a Wanted takes at most one photo');
select lives_ok($$select pg_temp.wanted('B', 'Wanted ' || g) from generate_series(1, 4) g$$, 'four more Wanted posts');
select matches(pg_temp.wanted('B', 'One too many'), '^ERROR: RATE_LIMITED:create_wanted:',
  'the sixth Wanted in a day is limited (5/day)');

-- Wanted -> "I have this" (P5-SELL-08)
insert into ids values ('have', pg_temp.sale('A', 'Mini fridge 3 cu ft', 9,
  format(', wanted_ref := %L', (select id from ids where name = 'wantB')))::uuid);
select is((select wanted_ref from public.listings where id = (select id from ids where name = 'have')),
  (select id from ids where name = 'wantB'), 'the listing links to the Wanted');
select is((select title || '|' || dedupe_key || '|' || (data ->> 'listing_id') from public.notifications
           where user_id = tests.uid('B') and type = 'wanted_match'),
  'Someone has what you want|wanted_match:' || (select id::text from ids where name = 'wantB') || ':'
    || (select id::text from ids where name = 'have') || '|' || (select id::text from ids where name = 'have'),
  'the Wanted poster gets wanted_match pointing at the new listing');
select is(pg_temp.sale('A', 'Not a reply', 9, format(', wanted_ref := %L', (select id from ids where name = 'food1'))),
  'ERROR: INVALID:wanted_ref', 'wanted_ref must point at a Wanted');
select is(pg_temp.post('A', format($$kind := 'wanted', title := 'Me too', wanted_ref := %L$$, (select id from ids where name = 'wantB'))),
  'ERROR: INVALID:wanted_ref', 'only a sale or give-away can answer a Wanted');
select ok(tests.try_ok_as(tests.uid('B'), format(
  $$select public.make_offer(listing_id := %L, amount_cents := 2500)$$, (select id from ids where name = 'have'))),
  'and the poster can offer on it');

-- Same category: open Wanted posters, once a day
insert into ids values ('wantC', pg_temp.wanted('C', 'Rice cooker', 5)::uuid);
select pg_temp.sale('A', 'Rice cooker 6 cup', 5);
select is((select dedupe_key from public.notifications where user_id = tests.uid('C') and type = 'wanted_match'),
  'wanted_match:' || tests.uid('C') || ':2027-03-10', 'a new listing in the category tells the Wanted poster');
select pg_temp.sale('A', 'Kettle', 5);
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'wanted_match'), 1,
  'at most once per poster per day');
select is((select count(*)::int from public.notifications where user_id = tests.uid('A') and type = 'wanted_match'), 0,
  'never for your own listing');
select pg_temp.sale('C', 'My own rice cooker', 5);
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'wanted_match'), 1,
  'your own listing does not match your Wanted');

-- create_listing stamps created_at with the real clock; line it up with the test clock.
update public.listings set created_at = '2027-03-10 11:00:00-05' where kind = 'sale';

-- Discover and search keep to sale and free -----------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), $$select count(*)::text from jsonb_array_elements(public.get_feed()) i
                                              where i ->> 'kind' in ('food', 'wanted')$$), '0',
  'get_feed shows no food or Wanted');
select is(tests.try_text_as(tests.uid('B'), $$select count(*)::text from jsonb_array_elements(public.search_listings('pizza')) i$$), '0',
  'search does not find food posts');

-- get_campus_feed -------------------------------------------------------------------------------
select is(pg_temp.kinds(pg_temp.feed('B')), 'food,sale,wanted', 'all: food, Wanted and new listings (free stuff below)');
select is(pg_temp.kinds(pg_temp.feed('B', 'food')), 'food', 'food filter');
select is(pg_temp.kinds(pg_temp.feed('B', 'wanted')), 'wanted', 'wanted filter');
select is(pg_temp.kinds(pg_temp.feed('B', 'new')), 'sale', 'new listings filter');
select is(pg_temp.feed('B', 'cars') #>> '{}', 'ERROR: INVALID:kind', 'unknown kind');
select is(pg_temp.feed('B', null, '{"bumped_at":"x"}') #>> '{}', 'ERROR: INVALID:cursor', 'bad cursor');
select is((select i ->> 'place' from jsonb_array_elements(pg_temp.feed('B', 'food') -> 'items') i
           where i ->> 'id' = (select id::text from ids where name = 'food1')),
  'Union front desk', 'food items carry the place and expires_at for the countdown');
select is((select (i ->> 'is_own') || ':' || (i ->> 'wanted_max_cents') from jsonb_array_elements(pg_temp.feed('B', 'wanted') -> 'items') i
           where i ->> 'id' = (select id::text from ids where name = 'wantB')),
  'true:5000', 'own Wanted posts show, flagged is_own, with the max price');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.feed('MOD') -> 'items') i
                      where i -> 'seller' ->> 'id' = tests.uid('A')::text), 'blocked people are left out');
insert into public.listings (id, campus_id, seller_id, kind, title, expires_at)
values ('00000000-0000-4000-8000-00000000f00d', tests.uid('UMICH'), tests.uid('D'), 'food', 'Michigan bagels', now() + interval '1 day');
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.feed('B') -> 'items') i
                      where i ->> 'id' = '00000000-0000-4000-8000-00000000f00d'), 'other campuses never show');
select is(pg_temp.feed('D') #>> '{}', 'ERROR: NOT_ACTIVE:waitlist', 'waitlisted members cannot read it');
select ok(not has_function_privilege('anon', 'public.get_campus_feed(text, jsonb)', 'execute'), 'anon cannot call it');
select is((pg_temp.feed('B') ->> 'day_one')::bool, true, 'day one while fewer than 10 listings');
select is(pg_temp.feed('B') -> 'founding', '{"left": 48, "mine": false, "limit": 50}'::jsonb,
  'founding sellers: spots left and whether I am one');

-- Pages
insert into public.listings (id, campus_id, seller_id, kind, title, expires_at, bumped_at)
select gen_random_uuid(), tests.uid('OSU'), tests.uid('C'), 'free', 'Free thing ' || g, '2027-04-30'::timestamptz,
       '2027-03-09 12:00:00-05'::timestamptz - make_interval(mins => g)
from generate_series(1, 25) g;
select is(jsonb_array_length(pg_temp.feed('B', 'free') -> 'items'), 20, 'twenty a page');
select is(jsonb_array_length(pg_temp.feed('B', 'free', pg_temp.feed('B', 'free') -> 'next_cursor') -> 'items'), 5,
  'the cursor brings the rest');
select is((pg_temp.feed('B') ->> 'day_one')::bool, false, 'no longer day one');
select is(pg_temp.kinds(pg_temp.feed('B', 'free')), 'free', 'free stuff filter');
select ok(pg_temp.kinds(pg_temp.feed('B')) like '%free%', 'free stuff is in all');

-- Expiry: the countdown hits zero and the post is gone
select tests.set_now('2027-03-10 12:45:00-05');
select is((select string_agg(i ->> 'title', ',' order by i ->> 'title') from jsonb_array_elements(pg_temp.feed('B', 'food') -> 'items') i),
  'Donuts,Pizza slices,Tacos', 'expired food drops out (the 30-minute cookies are gone)');

-- Rate limit (120/h)
select matches(tests.try_text_as(tests.uid('C'),
  $$select count(public.get_campus_feed())::text from generate_series(1, 125) g$$),
  '^ERROR: RATE_LIMITED:get_campus_feed:', '120 an hour');

select * from finish();
rollback;
