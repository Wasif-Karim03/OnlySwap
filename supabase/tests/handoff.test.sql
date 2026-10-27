-- DEC 132 (UX-08): the handoff code on a confirmed meetup and confirm_handoff.
begin;
select plan(16);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

insert into public.safe_spots (id, campus_id, name, lat, lng, designation, designated_on) values
  ('00000000-0000-4000-8000-0000000005a1', tests.uid('OSU'), 'Rec Center lobby', 40.0, -83.0, 'public', null);
insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-000000000d01', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 'active', 4000);
select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-000000000d01', 3800)$$);
select tests.try_text_as(tests.uid('A'), format('select public.accept_offer(%L)',
  (select id from public.offers where buyer_id = tests.uid('B'))));
create function pg_temp.chat() returns uuid language sql as $$
  select id from public.chats where buyer_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000d01'
$$;
select tests.try_text_as(tests.uid('B'), format('select public.propose_meetup(%L, %L::timestamptz, %L)',
  pg_temp.chat(), '2027-03-10 16:30-05', '00000000-0000-4000-8000-0000000005a1'));
create function pg_temp.mid() returns uuid language sql as $$
  select id from public.meetups where chat_id = pg_temp.chat()
$$;
create function pg_temp.json(who text) returns jsonb language sql as $$
  select tests.try_text_as(tests.uid(who), format('select public.get_meetup(%L)::text', pg_temp.mid()))::jsonb
$$;
create function pg_temp.handoff(who text, code text) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), format('select public.confirm_handoff(%L, %L)::text', pg_temp.mid(), code))
$$;
create function pg_temp.code() returns text language sql as $$
  select handoff_code from public.meetups where id = pg_temp.mid()
$$;
create function pg_temp.wrong() returns text language sql as $$
  select lpad(((pg_temp.code()::int + 1) % 10000)::text, 4, '0')
$$;

select is(pg_temp.code(), null, 'no code while only proposed');
select tests.try_text_as(tests.uid('A'), format('select public.confirm_meetup(%L)', pg_temp.mid()));
select matches(pg_temp.code(), '^[0-9]{4}$', 'confirming makes a 4-digit code');
select is(pg_temp.json('B') ->> 'handoff_code', pg_temp.code(), 'the buyer sees the code');
select is(pg_temp.json('A') ->> 'handoff_code', null, 'the seller never does');
select is(pg_temp.json('A') ->> 'i_am_seller', 'true', 'the seller is told it is their side');

select is(pg_temp.handoff('B', pg_temp.code()), 'ERROR: FORBIDDEN', 'only the seller enters it');
select is(pg_temp.handoff('C', pg_temp.code()), 'ERROR: NOT_FOUND', 'strangers get nothing');
select is(pg_temp.handoff('A', '12a4'), 'ERROR: INVALID:code', 'four digits');
select is(pg_temp.handoff('A', pg_temp.wrong())::jsonb, '{"ok": false, "tries_left": 4}'::jsonb,
  'a wrong code counts a try (and is not an error, so the count sticks)');
select is(pg_temp.json('A') ->> 'handoff_tries_left', '4', 'tries left are shown');

select is(pg_temp.handoff('A', pg_temp.code())::jsonb ->> 'ok', 'true', 'the right code goes through');
select is((select status::text from public.meetups where id = pg_temp.mid()), 'completed', 'the meetup completes');
select is((select buyer_outcome || ':' || seller_outcome from public.chats where id = pg_temp.chat()), 'done:done',
  'both sides are done');
select is((select status::text || ':' || (buyer_id = tests.uid('B'))::text from public.listings
  where id = '00000000-0000-4000-8000-000000000d01'), 'sold:true', 'sold to this buyer');
select is((select count(*)::int from public.notifications where type = 'rate_prompt'), 2, 'both are asked to rate');

-- Five wrong tries lock it (a fresh confirmed meetup on the closed deal is fine for the counter).
update public.meetups set status = 'confirmed', handoff_tries = 5 where id = pg_temp.mid();
select is(pg_temp.handoff('A', pg_temp.code()), 'ERROR: HANDOFF_LOCKED', 'locked after 5 wrong tries');

select * from finish();
rollback;
