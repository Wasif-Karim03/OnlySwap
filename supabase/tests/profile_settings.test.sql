-- S31: get_me, my_listings, listing_stats (P11-SET-01).
begin;
select plan(9);
select tests.create_fixtures();
select tests.set_now('2027-03-20 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, title, status, price_cents, created_at, bumped_at) values
  ('00000000-0000-4000-8000-000000000501', tests.uid('OSU'), tests.uid('A'), 'Lamp', 'active', 1500, '2027-03-01', '2027-03-01'),
  ('00000000-0000-4000-8000-000000000502', tests.uid('OSU'), tests.uid('A'), 'Rug', 'sold', 2000, '2027-03-02', '2027-03-02'),
  ('00000000-0000-4000-8000-000000000503', tests.uid('OSU'), tests.uid('A'), 'Chair', 'deleted', 2000, '2027-03-03', '2027-03-03'),
  ('00000000-0000-4000-8000-000000000504', tests.uid('OSU'), tests.uid('A'), 'Desk', 'expired', 2000, '2027-03-04', '2027-03-04');
insert into public.listing_price_changes (listing_id, old_cents, new_cents) values ('00000000-0000-4000-8000-000000000501', 2000, 1500);

select is(tests.try_text_as(tests.uid('A'), $$select public.get_me() ->> 'display_name'$$), 'Aisha A.', 'get_me');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_me() -> 'counts' ->> 'active'$$), '1', 'active count');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_me() -> 'campus' ->> 'short_name'$$), 'Ohio State', 'campus');
select is(tests.try_text_as(tests.uid('A'), $$select string_agg(x ->> 'title', ',') from jsonb_array_elements(public.my_listings()) x$$),
  'Desk,Rug,Lamp', 'all my listings but deleted, newest first');
select is(tests.try_text_as(tests.uid('A'), $$select string_agg(x ->> 'title', ',') from jsonb_array_elements(public.my_listings()) x where (x ->> 'can_relist')::bool$$),
  'Desk,Lamp', 'expired, or active and bumped over 7 days ago, can relist');
select is(tests.try_text_as(tests.uid('A'), $$select public.listing_stats('00000000-0000-4000-8000-000000000501') -> 'price_changes' -> 0 ->> 'new'$$),
  '1500', 'stats include price history');
select is(tests.try_text_as(tests.uid('B'), $$select public.listing_stats('00000000-0000-4000-8000-000000000501')::text$$), 'ERROR: NOT_FOUND',
  'only the seller');
select is(tests.try_text_as(tests.uid('A'), $$select public.listing_stats('00000000-0000-4000-8000-000000000503')::text$$), 'ERROR: NOT_FOUND',
  'not a deleted listing');
select ok(not has_function_privilege('anon', 'public.get_me()', 'execute'), 'needs a session');

select * from finish();
rollback;
