-- DEC 151: meetups only at a campus Meetup spot.
begin;
select plan(3);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

insert into public.listings (id, campus_id, seller_id, kind, title, status, price_cents) values
  ('00000000-0000-4000-8000-0000000c0001', tests.uid('OSU'), tests.uid('A'), 'sale', 'Lamp', 'active', 1500);
insert into public.chats (id, listing_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents)
values ('00000000-0000-4000-8000-0000000c0002', '00000000-0000-4000-8000-0000000c0001', tests.uid('B'), tests.uid('A'), 'Lamp', 1500, 1500);
insert into public.safe_spots (id, campus_id, name, lat, lng) values
  ('00000000-0000-4000-8000-0000000c0003', tests.uid('OSU'), 'Library lobby', 40, -83);

select is(tests.try_text_as(tests.uid('B'),
  $$select public.propose_meetup('00000000-0000-4000-8000-0000000c0002', '2027-03-11 15:00-05', null, 'My dorm room')::text$$),
  'ERROR: INVALID:place', 'a custom place is refused');
select is(tests.try_text_as(tests.uid('B'),
  $$select public.propose_meetup('00000000-0000-4000-8000-0000000c0002', '2027-03-11 15:00-05', '00000000-0000-4000-8000-0000000c0003') ->> 'status'$$),
  'proposed', 'a campus Meetup spot works');
select is(tests.try_text_as(tests.uid('B'),
  $$select ((public.propose_meetup('00000000-0000-4000-8000-0000000c0002', '2027-03-11 16:00-05', '00000000-0000-4000-8000-0000000c0003', 'ignored') ->> 'custom_place') is null)::text$$),
  'true', 'a custom place sent with a spot is ignored');

select * from finish();
rollback;
