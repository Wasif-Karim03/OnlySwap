-- S19: get_listing access states (P6-LIST-01) and reporting a listing (P6-LIST-02).
begin;
select plan(12);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-000000000d01', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active', 1500),
  ('00000000-0000-4000-8000-000000000d02', tests.uid('OSU'), tests.uid('A'), 'Old chair', 'deleted', 500),
  ('00000000-0000-4000-8000-000000000d03', tests.uid('UMICH'), tests.uid('D'), 'Far chair', 'active', 500),
  ('00000000-0000-4000-8000-000000000d04', tests.uid('OSU'), tests.uid('A'), 'Held rug', 'held_review', 500);

create function pg_temp.access(who text, lid text) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), format($q$select public.get_listing(%L) ->> 'access'$q$, lid))
$$;

select is(pg_temp.access('B', '00000000-0000-4000-8000-000000000d01'), 'buyer', 'a buyer sees an active listing');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_listing('00000000-0000-4000-8000-000000000d01') ->> 'title'$$),
  'Desk lamp', 'with the card fields');
select is(pg_temp.access('A', '00000000-0000-4000-8000-000000000d01'), 'owner', 'the seller gets the owner view');
select is(pg_temp.access('A', '00000000-0000-4000-8000-000000000d04'), 'owner', 'the seller still sees a listing under review');
select is(pg_temp.access('B', '00000000-0000-4000-8000-000000000d04'), 'gone', 'others do not');
select is(pg_temp.access('B', '00000000-0000-4000-8000-000000000d02'), 'gone', 'deleted is gone');
select is(pg_temp.access('B', '00000000-0000-4000-8000-00000000dddd'), 'gone', 'unknown is gone');
select is(pg_temp.access('B', '00000000-0000-4000-8000-000000000d03'), 'other_campus', 'another campus says so');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_listing('00000000-0000-4000-8000-000000000d03') ? 'title'$$),
  'false', 'without any listing details');
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('A'), tests.uid('B'));
select is(pg_temp.access('B', '00000000-0000-4000-8000-000000000d01'), 'blocked', 'blocked either way hides it');
delete from public.blocks;

select is(tests.try_text_as(tests.uid('B'),
  $$select (public.create_report('listing', '00000000-0000-4000-8000-000000000d01', 'scam', 'asks for a deposit') ? 'id')::text$$),
  'true', 'a buyer reports the listing');
select is((select target_user_id from public.reports where target_id = '00000000-0000-4000-8000-000000000d01'), tests.uid('A'),
  'the report points at the seller');

select * from finish();
rollback;
