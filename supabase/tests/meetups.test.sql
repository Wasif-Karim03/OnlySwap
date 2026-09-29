-- S26: T-INT-MEET-01/02/03 and T-INT-TZ-01 (P8-MEET-01).
begin;
select plan(34);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.safe_spots (id, campus_id, name, lat, lng, designation, designated_on) values
  ('00000000-0000-4000-8000-0000000005a1', tests.uid('OSU'), 'Rec Center lobby', 40.0, -83.0, 'public', null);
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents) values
  ('00000000-0000-4000-8000-0000000000e1', tests.uid('B'), tests.uid('A'), 'Mini fridge', 4000, 3800);

create function pg_temp.propose(who text, at text) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), format(
    'select public.propose_meetup(%L, %L::timestamptz, %L) ->> %L',
    '00000000-0000-4000-8000-0000000000e1', at, '00000000-0000-4000-8000-0000000005a1', 'id'))
$$;
create function pg_temp.active() returns uuid language sql as $$
  select id from public.meetups where chat_id = '00000000-0000-4000-8000-0000000000e1' and status in ('proposed','confirmed')
$$;
create function pg_temp.call(who text, fn text, extra text default '') returns text language sql as $$
  select tests.try_text_as(tests.uid(who), format('select public.%s(%L%s)::text', fn, pg_temp.active(), extra))
$$;

-- propose / windows (T-INT-MEET-01) ------------------------------------------------------------
select is(pg_temp.propose('B', '2027-03-10 12:10-05'), 'ERROR: MEETUP_WINDOW', 'not sooner than 15 minutes');
select is(pg_temp.propose('B', '2027-03-25 12:00-05'), 'ERROR: MEETUP_WINDOW', 'not later than 14 days');
select is(tests.try_text_as(tests.uid('B'), $$select public.propose_meetup('00000000-0000-4000-8000-0000000000e1', '2027-03-10 16:30-05')::text$$),
  'ERROR: INVALID:place', 'a spot or a place is needed');
select isnt(pg_temp.propose('B', '2027-03-10 16:30-05'), null, 'the buyer suggests 4:30 PM at the Rec Center');
select is((select body from public.messages where chat_id = '00000000-0000-4000-8000-0000000000e1' and kind = 'meetup' order by id desc limit 1),
  'Ben B. suggested Wed 4:30 PM at Rec Center lobby', 'a meetup row in the chat, in campus time');
select is((select count(*)::int from public.notifications where user_id = tests.uid('A') and type = 'meetup_proposed'), 1, 'the seller is told');

-- one active meetup per chat (T-INT-MEET-02)
select isnt(pg_temp.propose('A', '2027-03-10 17:00-05'), null, 'the seller suggests another time');
select is((select count(*)::int from public.meetups where chat_id = '00000000-0000-4000-8000-0000000000e1' and status in ('proposed','confirmed')), 1,
  'the previous proposal is cancelled in the same transaction');
select is((select previous_starts_at from public.meetups where id = pg_temp.active()), '2027-03-10 16:30-05'::timestamptz,
  'the new one remembers the old time');

-- confirm
select is(pg_temp.call('A', 'confirm_meetup'), 'ERROR: FORBIDDEN', 'the proposer cannot confirm');
select is(pg_temp.call('B', 'confirm_meetup'), '', 'the other side confirms');
select is((select status::text from public.meetups where id = pg_temp.active()), 'confirmed', 'confirmed');
select is(pg_temp.call('C', 'confirm_meetup'), 'ERROR: NOT_FOUND', 'outsiders cannot touch it');

-- check-in window: start -60 ... +60
select is(pg_temp.call('B', 'checkin_meetup'), 'ERROR: MEETUP_WINDOW', 'too early to check in');
select is(pg_temp.call('B', 'running_late', ', 7'), 'ERROR: INVALID:minutes', 'late is 5, 10, 15 or 30');
select is(pg_temp.call('B', 'running_late', ', 10'), '', 'running 10 min late');

-- share (T-INT-MEET-01)
select ok(tests.try_text_as(tests.uid('B'), format('select public.create_meetup_share(%L) ->> %L', pg_temp.active(), 'token')) ~ '^[0-9a-f]{22}$',
  'a 22-character share token');
select is(tests.try_text_as(null, format('select public.get_meetup_share(%L) ->> %L', (select share_token from public.meetups where id = pg_temp.active()), 'a_first')),
  'Ben', 'anyone with the link sees first names');
select is(tests.try_text_as(null, format('select (public.get_meetup_share(%L) ?| array[%L, %L, %L])::text',
  (select share_token from public.meetups where id = pg_temp.active()), 'price', 'phone', 'email')), 'false', 'but no price, phone or email');

-- reminders (T-INT-TZ-01 half): 30 minutes before, once
select tests.set_now('2027-03-10 16:30:00-05');
select is(private.meetup_reminders(), 1, 'the reminder goes 30 minutes before');
select is(private.meetup_reminders(), 0, 'only once');
select is((select body from public.notifications where user_id = tests.uid('B') and type = 'meetup_reminder'),
  'Meet Aisha at Rec Center lobby at 5:00 PM', 'in campus time');

-- no-show (T-INT-MEET-03)
select tests.set_now('2027-03-10 17:05:00-05');
select is(pg_temp.call('A', 'checkin_meetup'), '', 'the seller checks in');
select is(pg_temp.call('A', 'report_noshow'), 'ERROR: MEETUP_WINDOW', 'not before start + 20 min');
select tests.set_now('2027-03-10 17:25:00-05');
select is(pg_temp.call('B', 'report_noshow'), 'ERROR: MEETUP_WINDOW', 'not if the reporter did not check in');
select is(pg_temp.call('A', 'report_noshow', ', ''waited 20 min'''), '', 'the seller reports a no-show');
select tests.set_now('2027-03-11 18:00:00-05');
select is(private.noshow_autoconfirm(), 1, 'auto-confirmed after 24 h without an appeal');
select is((select noshow_count from public.profiles where id = tests.uid('B')), 1, 'the count goes up');
select is((select status::text from public.meetups where chat_id = '00000000-0000-4000-8000-0000000000e1' and status <> 'cancelled'), 'no_show',
  'the meetup is a no-show');

-- a second confirmed no-show pauses
select tests.set_now('2027-03-12 12:00:00-05');
select isnt(pg_temp.propose('A', '2027-03-12 15:00-05'), null, 'another meetup');
select is(pg_temp.call('B', 'confirm_meetup'), '', 'confirmed');
select tests.set_now('2027-03-12 15:30:00-05');
update public.meetups set seller_here_at = '2027-03-12 15:00-05' where id = pg_temp.active();
select is(pg_temp.call('A', 'report_noshow'), '', 'reported again');
select tests.set_now('2027-03-13 16:00:00-05');
select is(private.noshow_autoconfirm(), 1, 'confirmed');
select is((select status::text from public.profiles where id = tests.uid('B')), 'paused', 'two no-shows pause the account (offers paused)');

select * from finish();
rollback;
