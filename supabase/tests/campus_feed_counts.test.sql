-- E-13 (audit): get_campus_feed counts active listings and founding sellers
-- only for the first page. The app reads day_one, active_listings and founding
-- from page one; later pages skip both counts (linear in campus size).
begin;
select plan(5);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, title, status, kind, category_id, price_cents)
select gen_random_uuid(), tests.uid('OSU'), tests.uid('A'), 'Lamp ' || g, 'active', 'sale', 1, 1000 from generate_series(1, 3) g;

select tests.authenticate_as(tests.uid('B'));
select is((public.get_campus_feed() ->> 'active_listings')::int, 3, 'page one counts active listings');
select is((public.get_campus_feed() ->> 'day_one')::boolean, true, 'page one says day one');
select ok(public.get_campus_feed() -> 'founding' ? 'left', 'page one has the founding card');

select is(public.get_campus_feed(null, jsonb_build_object('bumped_at', '2027-03-10 11:00-05', 'id', gen_random_uuid())) -> 'active_listings',
  'null'::jsonb, 'later pages skip the listing count');
select is(public.get_campus_feed(null, jsonb_build_object('bumped_at', '2027-03-10 11:00-05', 'id', gen_random_uuid())) -> 'founding',
  'null'::jsonb, 'later pages skip the founding count');

select * from finish();
rollback;
