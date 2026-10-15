-- More like this and recently viewed (0239, DEC 128).
begin;
select plan(6);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

insert into public.listings (id, campus_id, seller_id, title, status, price_cents, category_id) values
  ('00000000-0000-4000-8000-0000000c2001', tests.uid('OSU'), tests.uid('A'), 'Desk', 'active', 4000, 1),
  ('00000000-0000-4000-8000-0000000c2002', tests.uid('OSU'), tests.uid('C'), 'Small desk', 'active', 3500, 1),
  ('00000000-0000-4000-8000-0000000c2003', tests.uid('OSU'), tests.uid('C'), 'Big desk', 'active', 9000, 1),
  ('00000000-0000-4000-8000-0000000c2004', tests.uid('OSU'), tests.uid('C'), 'Laptop', 'active', 40000, 3),
  ('00000000-0000-4000-8000-0000000c2005', tests.uid('OSU'), tests.uid('B'), 'My desk', 'active', 4000, 1),
  ('00000000-0000-4000-8000-0000000c2006', tests.uid('OSU'), tests.uid('C'), 'Sold desk', 'sold', 4000, 1);

select is(tests.try_text_as(tests.uid('B'),
  $$select string_agg(x ->> 'title', ',') from jsonb_array_elements(public.similar_listings('00000000-0000-4000-8000-0000000c2001')) x$$),
  'Small desk,Big desk', 'same category, nearest price first, not mine, not sold, not other categories');
select tests.try_text_as(tests.uid('C'), $$select public.set_away(true)$$);
select is(tests.try_text_as(tests.uid('B'),
  $$select jsonb_array_length(public.similar_listings('00000000-0000-4000-8000-0000000c2001'))::text$$),
  '0', 'an away seller''s listings drop out');
select tests.try_text_as(tests.uid('C'), $$select public.set_away(false)$$);

select is(tests.try_text_as(tests.uid('B'),
  $$select string_agg(x ->> 'title', ',') from jsonb_array_elements(public.get_listings_by_ids(array[
    '00000000-0000-4000-8000-0000000c2004', '00000000-0000-4000-8000-0000000c2006', '00000000-0000-4000-8000-0000000c2001']::uuid[])) x$$),
  'Laptop,Desk', 'recently viewed: in the given order, sold ones dropped');
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('A'), tests.uid('B'));
select is(tests.try_text_as(tests.uid('B'),
  $$select jsonb_array_length(public.get_listings_by_ids(array['00000000-0000-4000-8000-0000000c2001']::uuid[]))::text$$),
  '0', 'blocked sellers drop out');
select is(tests.try_text_as(tests.uid('B'),
  $$select public.get_listings_by_ids(array_fill('00000000-0000-4000-8000-0000000c2001'::uuid, array[21]))::text$$),
  'ERROR: INVALID:ids', 'at most 20 ids');
select is(tests.try_text_as(tests.uid('B'),
  $$select jsonb_array_length(public.similar_listings('00000000-0000-4000-8000-0000000c2004'))::text$$),
  '0', 'nothing else in the category: empty');

select * from finish();
rollback;
