-- Wanted: need it by and alert me (0238, DEC 127).
begin;
select plan(9);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

-- B wants a mini fridge (no category); C wants anything in Tech.
insert into public.listings (id, campus_id, seller_id, kind, title, status, price_cents, category_id) values
  ('00000000-0000-4000-8000-0000000b1001', tests.uid('OSU'), tests.uid('B'), 'wanted', 'Mini fridge', 'active', 0, null),
  ('00000000-0000-4000-8000-0000000b1002', tests.uid('OSU'), tests.uid('C'), 'wanted', 'Monitor', 'active', 0, 3);

select is(tests.try_text_as(tests.uid('B'),
  $$select public.set_wanted_prefs('00000000-0000-4000-8000-0000000b1001', '2027-03-20', true) ->> 'need_by'$$),
  '2027-03-20', 'B needs it by the 20th');
select is((select expires_at from public.listings where id = '00000000-0000-4000-8000-0000000b1001'),
  '2027-03-21 00:00:00-04'::timestamptz, 'the post ends at the end of that campus day');
select is(tests.try_text_as(tests.uid('B'),
  $$select public.set_wanted_prefs('00000000-0000-4000-8000-0000000b1001', '2027-06-20', true)::text$$),
  'ERROR: INVALID:need_by', 'no more than 60 days ahead');
select is(tests.try_text_as(tests.uid('A'),
  $$select public.set_wanted_prefs('00000000-0000-4000-8000-0000000b1001', null, true)::text$$),
  'ERROR: NOT_FOUND', 'only the poster can change it');
select is(tests.try_text_as(tests.uid('B'),
  $$select public.get_listing('00000000-0000-4000-8000-0000000b1001') ->> 'need_by'$$),
  '2027-03-20', 'the post shows the date');

-- A lists a mini fridge in Dorm: B matches on the title.
insert into public.listings (id, campus_id, seller_id, title, status, price_cents, category_id) values
  ('00000000-0000-4000-8000-0000000b1003', tests.uid('OSU'), tests.uid('A'), 'Mini fridge, black', 'active', 5000, 1);
select is((select count(*)::int from public.notifications where user_id = tests.uid('B') and type = 'wanted_match'), 1,
  'a title match alerts the Wanted poster');
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'wanted_match'), 0,
  'no match, no alert');

-- C turns alerts off; a monitor in Tech does not alert them.
select tests.try_text_as(tests.uid('C'),
  $$select public.set_wanted_prefs('00000000-0000-4000-8000-0000000b1002', null, false)$$);
insert into public.listings (id, campus_id, seller_id, title, status, price_cents, category_id) values
  ('00000000-0000-4000-8000-0000000b1004', tests.uid('OSU'), tests.uid('A'), '27 inch monitor', 'active', 9000, 3);
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'wanted_match'), 0,
  'alerts off: no wanted_match');
select is((select wanted_alerts from public.listings where id = '00000000-0000-4000-8000-0000000b1002'), false,
  'and the switch is saved');

select * from finish();
rollback;
