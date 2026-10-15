-- Away mode (0237, DEC 126): an away seller's sale/free listings leave the
-- deck, search and campus feed; new offers fail; coming back extends expiry.
begin;
select plan(12);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

insert into public.listings (id, campus_id, seller_id, title, status, price_cents, expires_at) values
  ('00000000-0000-4000-8000-0000000a9001', tests.uid('OSU'), tests.uid('A'), 'Floor lamp', 'active', 2000, '2027-04-01 12:00:00-05');
insert into public.listings (id, campus_id, seller_id, kind, title, status, price_cents) values
  ('00000000-0000-4000-8000-0000000a9002', tests.uid('OSU'), tests.uid('A'), 'wanted', 'Need a mini fridge', 'active', 0);

create function pg_temp.in_feed(who text) returns text language sql as $$
  select tests.try_text_as(tests.uid(who),
    $q$select count(*)::text from jsonb_array_elements(public.get_feed()) x where x ->> 'id' = '00000000-0000-4000-8000-0000000a9001'$q$)
$$;

select is(pg_temp.in_feed('B'), '1', 'before: the listing is in the deck');
select is(tests.try_text_as(tests.uid('A'), $$select public.set_away(true) ->> 'away_since'$$),
  to_jsonb('2027-03-10 12:00:00-05'::timestamptz) #>> '{}', 'the seller goes away');
select is(pg_temp.in_feed('B'), '0', 'the listing leaves the deck');
select is(tests.try_text_as(tests.uid('B'),
  $$select count(*)::text from jsonb_array_elements(public.search_listings('lamp') -> 'items') x
    where x ->> 'id' = '00000000-0000-4000-8000-0000000a9001'$$),
  '0', 'and search');
select is(tests.try_text_as(tests.uid('B'),
  $$select string_agg(x ->> 'kind', ',') from jsonb_array_elements(public.get_campus_feed('all') -> 'items') x
    where x -> 'seller' ->> 'id' = tests.uid('A')::text$$),
  'wanted', 'the campus feed keeps their wanted post but not the sale');
select is(tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-0000000a9001', 2000)::text$$),
  'ERROR: SELLER_AWAY', 'new offers fail');
select is(tests.try_text_as(tests.uid('B'),
  $$select public.get_listing('00000000-0000-4000-8000-0000000a9001') -> 'seller' ->> 'away'$$),
  'true', 'the listing says the seller is away');
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ->> %L', tests.uid('A'), 'away')),
  'true', 'and so does the profile');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_me() ->> 'away_since'$$) is not null,
  true, 'get_me tells the seller');

select tests.set_now('2027-03-15 12:00:00-05');
select is(tests.try_text_as(tests.uid('A'), $$select public.set_away(false) ->> 'away_since'$$),
  null, 'five days later they come back');
select is((select expires_at from public.listings where id = '00000000-0000-4000-8000-0000000a9001'),
  '2027-04-06 12:00:00-05'::timestamptz, 'the listing gets the five days back');
select is(pg_temp.in_feed('B'), '1', 'and is in the deck again');

select * from finish();
rollback;
