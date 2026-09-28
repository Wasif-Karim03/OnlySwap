-- S20: T-INT-SRCH-01 search, suggestions and saved searches (P6-SRCH-01).
begin;
select plan(24);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, title, description, status, kind, category_id, condition, price_cents, bumped_at, created_at) values
  ('00000000-0000-4000-8000-000000000e01', tests.uid('OSU'), tests.uid('A'), 'Mini fridge 3.1 cu ft', 'Keeps drinks cold', 'active', 'sale', 1, 'good', 4000, '2027-03-10 11:00-05', '2027-03-10 11:00-05'),
  ('00000000-0000-4000-8000-000000000e02', tests.uid('OSU'), tests.uid('A'), 'Calculus textbook', 'Stewart, 8th edition, lightly used', 'active', 'sale', 2, 'fair', 2500, '2027-03-10 10:00-05', '2027-03-10 10:00-05'),
  ('00000000-0000-4000-8000-000000000e03', tests.uid('OSU'), tests.uid('C'), 'Gaming monitor 27 inch', null, 'active', 'sale', 31, 'like_new', 12000, '2027-03-10 09:00-05', '2027-03-10 09:00-05'),
  ('00000000-0000-4000-8000-000000000e04', tests.uid('OSU'), tests.uid('C'), 'Free desk chair', null, 'active', 'free', 1, 'fair', 0, '2027-03-10 08:00-05', '2027-03-10 08:00-05'),
  ('00000000-0000-4000-8000-000000000e05', tests.uid('OSU'), tests.uid('B'), 'My own fridge', null, 'active', 'sale', 1, 'good', 3000, '2027-03-10 07:00-05', '2027-03-10 07:00-05'),
  ('00000000-0000-4000-8000-000000000e06', tests.uid('OSU'), tests.uid('A'), 'Sold fridge', null, 'sold', 'sale', 1, 'good', 3000, '2027-03-10 06:00-05', '2027-03-10 06:00-05');

create function pg_temp.titles(q text, f text default '{}') returns text language sql as $$
  select tests.try_text_as(tests.uid('B'),
    format($s$select string_agg(x ->> 'title', ',') from jsonb_array_elements(public.search_listings(%L, %L::jsonb)) x$s$, q, f))
$$;

-- search_listings ---------------------------------------------------------------------------
select is(pg_temp.titles('fridge'), 'Mini fridge 3.1 cu ft', 'finds by title, not own or sold');
select is(pg_temp.titles('mini frig'), 'Mini fridge 3.1 cu ft', 'a typo still finds it (trigram)');
select is(pg_temp.titles('textbooks'), 'Calculus textbook', 'stemming: textbooks finds textbook');
select is(pg_temp.titles('stewart edition'), 'Calculus textbook', 'the description counts');
select is(pg_temp.titles(null), 'Mini fridge 3.1 cu ft,Calculus textbook,Gaming monitor 27 inch,Free desk chair',
  'no text: newest first');
select is(pg_temp.titles(null, '{"category_ids":[3]}'), 'Gaming monitor 27 inch', 'a parent category includes its children');
select is(pg_temp.titles(null, '{"min_cents":2000,"max_cents":5000,"sort":"price_asc"}'), 'Calculus textbook,Mini fridge 3.1 cu ft',
  'price range and price sort');
select is(pg_temp.titles(null, '{"conditions":["like_new","fair"],"sort":"price_desc"}'), 'Gaming monitor 27 inch,Calculus textbook,Free desk chair',
  'conditions filter');
select is(pg_temp.titles(null, '{"free_only":true}'), 'Free desk chair', 'free only');
select is(pg_temp.titles(null, '{"colour":"red"}'), 'ERROR: INVALID:filters', 'unknown filter keys are rejected');
select is(pg_temp.titles(null, '{"sort":"random"}'), 'ERROR: INVALID:filters', 'unknown sorts are rejected');
insert into public.swipes (user_id, listing_id, dir) values (tests.uid('B'), '00000000-0000-4000-8000-000000000e01', 'left');
select is(pg_temp.titles('fridge', '{"hide_swiped":true}'), null, 'hide things I skipped');
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('B'), tests.uid('C'));
select is(pg_temp.titles(null, '{"sort":"new"}'), 'Mini fridge 3.1 cu ft,Calculus textbook', 'blocked sellers are hidden');
delete from public.blocks;

-- search_suggest -----------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), $$select public.search_suggest('te') -> 0 ->> 'type'$$), 'category',
  'categories come first ("Textbooks", "Tech")');
select ok(tests.try_text_as(tests.uid('B'), $$select public.search_suggest('fri')::text$$) like '%Mini fridge%', 'titles are suggested');
select is(tests.try_text_as(tests.uid('B'), $$select jsonb_typeof(public.search_suggest(''))$$), 'array', 'empty input returns trending');

-- saved searches -------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), $$select public.create_saved_search('fridge', '{"max_cents":5000}') ->> 'query'$$), 'fridge', 'save a search');
select is(tests.try_text_as(tests.uid('B'), $$select jsonb_array_length(public.list_saved_searches())::text$$), '1', 'listed');
select is(tests.try_text_as(tests.uid('B'), $$select (public.create_saved_search('fridge', '{"max_cents":5000}') ->> 'id') = (public.list_saved_searches() -> 0 ->> 'id')$$),
  'true', 'saving the same search twice keeps one');
select ok(tests.try_text_as(tests.uid('B'), $$select public.search_suggest('fr')::text$$) like '%"saved"%', 'saved searches are suggested');

insert into public.listings (id, campus_id, seller_id, title, status, kind, category_id, price_cents, created_at)
values ('00000000-0000-4000-8000-000000000e07', tests.uid('OSU'), tests.uid('A'), 'Another fridge', 'active', 'sale', 1, 4500, '2027-03-10 12:30-05');
select is(tests.try_text_as(tests.uid('B'), $$select public.saved_search_new_counts() -> 0 ->> 'new_count'$$), '1', 'one new match since saving');
select is(tests.try_text_as(tests.uid('B'),
  $$select public.update_saved_search((public.list_saved_searches() -> 0 ->> 'id')::uuid, false, true) ->> 'alerts'$$),
  'false', 'alerts off, marked seen');
select is(tests.try_text_as(tests.uid('A'),
  $$select public.delete_saved_search((select id from public.saved_searches limit 1))::text$$), 'ERROR: NOT_FOUND',
  'someone else cannot delete it');

insert into public.saved_searches (user_id, campus_id, query)
select tests.uid('C'), tests.uid('OSU'), 'q' || g from generate_series(1, 20) g;
select is(tests.try_text_as(tests.uid('C'), $$select public.create_saved_search('one more')::text$$), 'ERROR: INVALID:saved_search_limit',
  'at most 20 saved searches');

select * from finish();
rollback;
