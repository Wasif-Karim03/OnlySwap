-- S18: T-INT-FEED-01 get_feed exclusions + the swipe, save, hide, watch and view RPCs (P6-FEED-01).
begin;
select plan(34);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, title, status, bumped_at, expires_at, price_cents) values
  ('00000000-0000-4000-8000-000000000f01', tests.uid('OSU'), tests.uid('A'), 'Desk lamp',   'active',  '2027-03-10 11:00-05', '2027-05-01', 1500),
  ('00000000-0000-4000-8000-000000000f02', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 'active',  '2027-03-10 10:00-05', '2027-05-01', 6000),
  ('00000000-0000-4000-8000-000000000f03', tests.uid('OSU'), tests.uid('C'), 'Bike lock',   'active',  '2027-03-10 09:00-05', '2027-05-01', 1000),
  ('00000000-0000-4000-8000-000000000f04', tests.uid('OSU'), tests.uid('B'), 'My own mug',  'active',  '2027-03-10 08:00-05', '2027-05-01', 500),
  ('00000000-0000-4000-8000-000000000f05', tests.uid('UMICH'), tests.uid('D'), 'Far chair', 'active',  '2027-03-10 07:00-05', '2027-05-01', 500),
  ('00000000-0000-4000-8000-000000000f06', tests.uid('OSU'), tests.uid('A'), 'Gone desk',   'deleted', '2027-03-10 06:00-05', '2027-05-01', 500),
  ('00000000-0000-4000-8000-000000000f07', tests.uid('OSU'), tests.uid('A'), 'Held rug',    'hold',    '2027-03-10 05:00-05', '2027-05-01', 500),
  ('00000000-0000-4000-8000-000000000f08', tests.uid('OSU'), tests.uid('A'), 'Old poster',  'active',  '2027-03-10 04:00-05', '2027-03-09', 500),
  ('00000000-0000-4000-8000-000000000f09', tests.uid('OSU'), tests.uid('A'), 'Lamp shade',  'active',  '2027-03-10 03:00-05', '2027-05-01', 500);
insert into public.listing_photos (listing_id, idx, path, thumb_path, width, height) values
  ('00000000-0000-4000-8000-000000000f01', 1, 'c/x/l/f01/b.webp', 'c/x/l/f01/b_t.webp', 800, 600),
  ('00000000-0000-4000-8000-000000000f01', 0, 'c/x/l/f01/a.webp', 'c/x/l/f01/a_t.webp', 800, 600);

create function pg_temp.feed_ids(who text, cur text default null) returns text language sql as $$
  select tests.try_text_as(tests.uid(who),
    format($q$select string_agg(x ->> 'title', ',') from jsonb_array_elements(public.get_feed(%L::jsonb)) x$q$, cur))
$$;

-- get_feed ----------------------------------------------------------------------------------------
select is(pg_temp.feed_ids('B'), 'Desk lamp,Mini fridge,Bike lock,Lamp shade',
  'newest first; no own, other campus, deleted, held or expired listings');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_feed() -> 0 -> 'photos' -> 0 ->> 'path'$$),
  'c/x/l/f01/a.webp', 'photos come in order');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_feed() -> 0 -> 'seller' ->> 'display_name'$$),
  'Aisha A.', 'the seller card is attached');
select is(tests.try_text_as(tests.uid('B'), $$select (public.get_feed() -> 0) ? 'email_hash'$$), 'false', 'no private seller fields');
select is(pg_temp.feed_ids('B', '{"bumped_at":"2027-03-10 10:00-05","id":"00000000-0000-4000-8000-000000000f02"}'),
  'Bike lock,Lamp shade', 'the cursor continues after the last card');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_feed('{"bumped_at":"nope"}')::text$$), 'ERROR: INVALID:cursor', 'a bad cursor is rejected');
select is((select value from public.daily_counters where key = 'feed_exhausted'), 4,
  'a first page with fewer than 5 cards counts as feed exhausted');

insert into public.blocks (blocker_id, blocked_id) values (tests.uid('B'), tests.uid('C'));
select is(pg_temp.feed_ids('B'), 'Desk lamp,Mini fridge,Lamp shade', 'people I blocked are hidden');
delete from public.blocks;
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('C'), tests.uid('B'));
select is(pg_temp.feed_ids('B'), 'Desk lamp,Mini fridge,Lamp shade', 'people who blocked me are hidden');
delete from public.blocks;

-- record_swipes -------------------------------------------------------------------------------------
select ok(tests.try_ok_as(tests.uid('B'), $$select public.record_swipes('[
  {"listing_id":"00000000-0000-4000-8000-000000000f02","dir":"left","at":"2027-03-10 11:59-05"},
  {"listing_id":"00000000-0000-4000-8000-000000000f03","dir":"save","at":"2027-03-10 11:59:30-05"},
  {"listing_id":"00000000-0000-4000-8000-00000000ffff","dir":"left"},
  {"listing_id":"00000000-0000-4000-8000-000000000f04","dir":"left"},
  {"listing_id":"00000000-0000-4000-8000-000000000f01","dir":"sideways"}]')$$), 'a batch is recorded');
select is((select count(*)::int from public.swipes where user_id = tests.uid('B')), 2, 'unknown, own and malformed items are skipped');
select is((select save_count from public.listings where id = '00000000-0000-4000-8000-000000000f03'), 1, 'a save swipe saves');
select is(pg_temp.feed_ids('B'), 'Desk lamp,Lamp shade', 'swiped cards leave the feed');
select tests.set_now('2027-04-10 12:00:00-05');
update public.listings set expires_at = '2027-06-01' where id <> '00000000-0000-4000-8000-000000000f08';
select is(pg_temp.feed_ids('B'), 'Desk lamp,Mini fridge,Bike lock,Lamp shade', 'after 30 days swiped cards come back');
select tests.set_now('2027-03-10 12:00:00-05');
select is(tests.try_text_as(tests.uid('B'), $$select public.record_swipes((select jsonb_agg(jsonb_build_object('listing_id', gen_random_uuid(), 'dir', 'left')) from generate_series(1, 51)))::text$$),
  'ERROR: INVALID:items', 'at most 50 swipes per batch');

-- undo_swipe ----------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), $$select public.undo_swipe('00000000-0000-4000-8000-000000000f03')::text$$), '',
  'undo within 60 s');
select is((select save_count from public.listings where id = '00000000-0000-4000-8000-000000000f03'), 0, 'undoing a save unsaves');
select tests.set_now('2027-03-10 12:05:00-05');
select is(tests.try_text_as(tests.uid('B'), $$select public.undo_swipe('00000000-0000-4000-8000-000000000f02')::text$$), 'ERROR: INVALID:too_late',
  'too late after 60 s');
select is(tests.try_text_as(tests.uid('B'), $$select public.undo_swipe('00000000-0000-4000-8000-000000000f09')::text$$), 'ERROR: NOT_FOUND',
  'nothing to undo');

-- save / unsave ----------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), $$select public.save_listing('00000000-0000-4000-8000-000000000f01') ->> 'save_count'$$), '1', 'save');
select is(tests.try_text_as(tests.uid('B'), $$select public.save_listing('00000000-0000-4000-8000-000000000f01') ->> 'save_count'$$), '1',
  'saving twice counts once');
select is((select price_at_save from public.saves where user_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000f01'), 1500,
  'the price at save is kept for price-drop alerts');
select is(tests.try_text_as(tests.uid('A'), $$select public.save_listing('00000000-0000-4000-8000-000000000f01')::text$$), 'ERROR: FORBIDDEN',
  'not my own listing');
select is(tests.try_text_as(tests.uid('B'), $$select public.save_listing('00000000-0000-4000-8000-000000000f05')::text$$), 'ERROR: NOT_FOUND',
  'not another campus');
select is(tests.try_text_as(tests.uid('B'), $$select public.unsave_listing('00000000-0000-4000-8000-000000000f01') ->> 'save_count'$$), '0', 'unsave');
select is(tests.try_text_as(tests.uid('B'), $$select public.unsave_listing('00000000-0000-4000-8000-000000000f01') ->> 'save_count'$$), '0',
  'unsave twice stays at 0');

-- hide_listing ----------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), $$select public.hide_listing('00000000-0000-4000-8000-000000000f09')::text$$), '', 'hide');
select tests.set_now('2027-06-10 12:00:00-05');
update public.listings set expires_at = '2027-08-01' where id <> '00000000-0000-4000-8000-000000000f08';
select is(pg_temp.feed_ids('B'), 'Desk lamp,Mini fridge,Bike lock', 'a hidden listing never comes back');
select tests.set_now('2027-03-10 12:05:00-05');

-- watch_listing ----------------------------------------------------------------------------------------
select ok(tests.try_ok_as(tests.uid('B'), $$select public.watch_listing('00000000-0000-4000-8000-000000000f07')$$), 'watch a held listing');
select is(tests.try_text_as(tests.uid('B'), $$select public.watch_listing('00000000-0000-4000-8000-000000000f01')::text$$), 'ERROR: INVALID:status',
  'only listings on hold can be watched');

-- record_view ----------------------------------------------------------------------------------------
select ok(tests.try_ok_as(tests.uid('B'), $$select public.record_view('00000000-0000-4000-8000-000000000f01'); select public.record_view('00000000-0000-4000-8000-000000000f01')$$),
  'record a view twice');
select ok(tests.try_ok_as(tests.uid('A'), $$select public.record_view('00000000-0000-4000-8000-000000000f01')$$), 'the seller views');
select is((select view_count from public.listings where id = '00000000-0000-4000-8000-000000000f01'), 1,
  'once per person per day, the seller does not count');

select ok(not has_function_privilege('anon', 'public.get_feed(jsonb, int)', 'execute'), 'the feed needs a session');

select * from finish();
rollback;
