-- Renew a listing (0236, DEC 125): an active sale/free listing can be moved
-- back to the top every 3 days; my_listings says when.
begin;
select plan(6);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

insert into public.listings (id, campus_id, seller_id, title, status, price_cents, bumped_at) values
  ('00000000-0000-4000-8000-0000000d8001', tests.uid('OSU'), tests.uid('A'), 'Bike lock', 'active', 1500, '2027-03-09 12:00:00-05'),
  ('00000000-0000-4000-8000-0000000d8002', tests.uid('OSU'), tests.uid('A'), 'Desk', 'active', 4000, '2027-03-06 12:00:00-05');
insert into public.listings (id, campus_id, seller_id, kind, title, status, price_cents, bumped_at) values
  ('00000000-0000-4000-8000-0000000d8003', tests.uid('OSU'), tests.uid('A'), 'wanted', 'Need a lamp', 'active', 0, '2027-03-01 12:00:00-05');

select is(tests.try_text_as(tests.uid('A'), $$select public.relist_listing('00000000-0000-4000-8000-0000000d8001')::text$$),
  'ERROR: RATE_LIMITED:relist_listing:2027-03-12T17:00:00Z', 'renewed a day ago: too soon, with the next time');
select is(tests.try_text_as(tests.uid('A'), $$select public.relist_listing('00000000-0000-4000-8000-0000000d8002') ->> 'status'$$),
  'active', 'four days on: renew works');
select is((select bumped_at from public.listings where id = '00000000-0000-4000-8000-0000000d8002'),
  '2027-03-10 12:00:00-05'::timestamptz, 'and it goes back to the top of the deck');
select is(tests.try_text_as(tests.uid('A'),
  $$select x ->> 'renew_at' from jsonb_array_elements(public.my_listings()) x where x ->> 'id' = '00000000-0000-4000-8000-0000000d8001'$$),
  to_jsonb('2027-03-12 12:00:00-05'::timestamptz) #>> '{}', 'my_listings says when renew is next allowed');
select is(tests.try_text_as(tests.uid('A'),
  $$select x ->> 'can_relist' from jsonb_array_elements(public.my_listings()) x where x ->> 'id' = '00000000-0000-4000-8000-0000000d8001'$$),
  'false', 'and does not offer it yet');
select is(tests.try_text_as(tests.uid('A'),
  $$select x ->> 'can_relist' from jsonb_array_elements(public.my_listings()) x where x ->> 'id' = '00000000-0000-4000-8000-0000000d8003'$$),
  'false', 'never on a wanted post');

select * from finish();
rollback;
