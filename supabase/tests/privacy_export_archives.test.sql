-- 0231 (audit B-02, B-03; DEC 119).
-- B-02: the data export holds the caller's activity events (only theirs) and
-- the count of right swipes.
-- B-03: prepare_account_deletion returns the private-bucket keys of every
-- archived chat the person was in (buyer or seller), and no others.
begin;
select plan(9);
select tests.create_fixtures();

insert into public.listings (id, campus_id, seller_id, title, status) values
  ('00000000-0000-4000-8000-0000000b0001', tests.uid('OSU'), tests.uid('B'), 'Desk', 'active'),
  ('00000000-0000-4000-8000-0000000b0002', tests.uid('OSU'), tests.uid('A'), 'Lamp', 'active'),
  ('00000000-0000-4000-8000-0000000b0003', tests.uid('OSU'), tests.uid('C'), 'Bike', 'active');
insert into public.swipes (user_id, listing_id, dir) values
  (tests.uid('A'), '00000000-0000-4000-8000-0000000b0001', 'right'),
  (tests.uid('A'), '00000000-0000-4000-8000-0000000b0003', 'left');
insert into public.activity_events (user_id, campus_id, kind, listing_id, source, dwell_ms, query, platform, app_version) values
  (tests.uid('A'), tests.uid('OSU'), 'listing_viewed', '00000000-0000-4000-8000-0000000b0001', 'search', 4200, null, 'ios', '1.0.0'),
  (tests.uid('A'), tests.uid('OSU'), 'searched', null, null, null, 'mini fridge', 'ios', '1.0.0'),
  (tests.uid('B'), tests.uid('OSU'), 'searched', null, null, null, 'ben secret search', 'android', '1.0.0');

create temp table ex as select private.export_user_data(tests.uid('A')) as j;

select is(jsonb_array_length((select j -> 'activity' from ex)), 2, 'B-02: export has the caller''s 2 activity events');
select is((select j -> 'activity' -> 0 ->> 'time_on_page_ms' from ex), '4200', 'B-02: time on a listing is exported');
select is((select j -> 'activity' -> 1 ->> 'search' from ex), 'mini fridge', 'B-02: search text is exported');
select ok(position('ben secret search' in (select j::text from ex)) = 0, 'B-02: nobody else''s activity');
select is((select (j -> 'swipes' ->> 'liked')::int from ex), 1, 'B-02: right swipes are counted');
select is((select (j -> 'swipes' ->> 'passed')::int from ex), 1, 'left swipes still counted as passed');

-- A bought from B (archived), sold to C (archived), and B-C have their own archived chat.
insert into public.chats (id, listing_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, status, closed_at, archived_at) values
  ('00000000-0000-4000-8000-0000000c0001', '00000000-0000-4000-8000-0000000b0001', tests.uid('A'), tests.uid('B'), 'Desk', 1000, 900, 'closed', now() - interval '100 days', now()),
  ('00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000b0002', tests.uid('C'), tests.uid('A'), 'Lamp', 1000, 900, 'closed', now() - interval '100 days', now()),
  ('00000000-0000-4000-8000-0000000c0003', '00000000-0000-4000-8000-0000000b0003', tests.uid('B'), tests.uid('C'), 'Bike', 1000, 900, 'closed', now() - interval '100 days', now()),
  ('00000000-0000-4000-8000-0000000c0004', '00000000-0000-4000-8000-0000000b0003', tests.uid('A'), tests.uid('C'), 'Bike', 1000, 900, 'closed', now() - interval '10 days', null);

create temp table prep as select private.prepare_account_deletion(tests.uid('A')) as r;

select is((select r -> 'archives' from prep),
  '["archive/chats/00000000-0000-4000-8000-0000000c0001.json", "archive/chats/00000000-0000-4000-8000-0000000c0002.json"]'::jsonb,
  'B-03: both archived chats A was in, as buyer and as seller');
select ok(position('0000000c0003' in (select r::text from prep)) = 0, 'B-03: another pair''s archive is not touched');
select ok(position('0000000c0004' in (select r::text from prep)) = 0, 'B-03: a chat not archived yet has no archive key');

select * from finish();
rollback;
