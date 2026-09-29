-- S23: offer changes ping both parties on user:{uid} (P7-OFF-03).
begin;
select plan(3);
select tests.create_fixtures();
insert into public.listings (id, campus_id, seller_id, title, status, price_cents)
values ('00000000-0000-4000-8000-000000000b01', tests.uid('OSU'), tests.uid('A'), 'Lamp', 'active', 1500);
update public.profiles set created_at = '2020-01-01' where id = tests.uid('B');
select isnt(tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-000000000b01', 1200) ->> 'id'$$), null, 'an offer');
select is((select count(*)::int from realtime.messages where topic = 'user:' || tests.uid('A') and event = 'inbox'), 1, 'the seller is pinged');
select is((select count(*)::int from realtime.messages where topic = 'user:' || tests.uid('B') and event = 'inbox'), 1, 'the buyer is pinged');
select * from finish();
rollback;
