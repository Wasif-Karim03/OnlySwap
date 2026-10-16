-- Trust on the swipe card (0235, DEC 124): feed_item.seller carries the
-- seller's swaps and thumbs, 0 before any rated swap.
begin;
select plan(4);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-0000000c7001', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active', 1500),
  ('00000000-0000-4000-8000-0000000c7002', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 'active', 6000);
refresh materialized view public.profile_stats_mv;

select is(tests.try_text_as(tests.uid('B'),
  $$select (public.get_listing('00000000-0000-4000-8000-0000000c7001') -> 'seller' ->> 'thumbs_total')$$),
  '0', 'a seller with no rated swaps shows 0');

-- B buys the lamp, the deal is done, B rates A thumbs up.
select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-0000000c7001', 1500)$$);
select tests.try_text_as(tests.uid('A'), format('select public.accept_offer(%L)',
  (select id from public.offers where buyer_id = tests.uid('B'))));
update public.chats set buyer_outcome = 'done', seller_outcome = 'done' where buyer_id = tests.uid('B');
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up)
  select id, tests.uid('B'), tests.uid('A'), true from public.chats where buyer_id = tests.uid('B');
refresh materialized view public.profile_stats_mv;

select is(tests.try_text_as(tests.uid('C'),
  $$select (public.get_listing('00000000-0000-4000-8000-0000000c7002') -> 'seller' ->> 'thumbs_up')
        || '/' || (public.get_listing('00000000-0000-4000-8000-0000000c7002') -> 'seller' ->> 'thumbs_total')$$),
  '1/1', 'the listing shows the seller''s thumbs');
select is(tests.try_text_as(tests.uid('C'),
  $$select (public.get_listing('00000000-0000-4000-8000-0000000c7002') -> 'seller' ->> 'swaps_count')$$),
  '1', 'and the swaps count');
select is(tests.try_text_as(tests.uid('C'),
  $$select x -> 'seller' ->> 'thumbs_up' from jsonb_array_elements(public.get_feed()) x
    where x ->> 'id' = '00000000-0000-4000-8000-0000000c7002'$$),
  '1', 'the swipe deck card carries the same stats');

select * from finish();
rollback;
