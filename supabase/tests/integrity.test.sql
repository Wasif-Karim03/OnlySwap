-- P3-DB-12: integrity suite (TESTING §2.4). Written now and tracked in CI; the
-- parts that need RPCs from later sessions run as TODO (they may fail without
-- failing the run) and name the task that turns them green. When that task
-- lands, delete its todo_start/todo_end so a regression fails CI.
begin;
select plan(27);
select tests.create_fixtures();

insert into public.listings (id, campus_id, seller_id, title, price_cents)
values ('00000000-0000-4000-8000-0000000001a1', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 1200),
       ('00000000-0000-4000-8000-0000000001a2', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 4000);

-- ---------------------------------------------------------------------------
-- T-INT-NOTIF-DEDUPE (BE-04): helper part is live now (S8).
select isnt(private.queue_notification(tests.uid('A'), 'offer_new', 'offers', 't', 'b', '{}', true, 'offer_new:x:1'),
  null, 'NOTIF-DEDUPE: first queue_notification inserts');
select is(private.queue_notification(tests.uid('A'), 'offer_new', 'offers', 't', 'b', '{}', true, 'offer_new:x:1'),
  null, 'NOTIF-DEDUPE: the same key twice gives one notification');

select todo_start('P9-PUSH-04: trg_offers_notify fires offer_new with dedupe offer_new:{offer}:{round}');
select ok(tests.try_ok_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-0000000001a1', 1000, null, '{}')$$),
  'NOTIF-DEDUPE: B makes an offer');
select is(tests.try_text($$select count(*)::text from public.notifications where type = 'offer_new' and user_id = '00000000-0000-4000-8000-00000000000a'$$),
  '1', 'NOTIF-DEDUPE: the seller gets exactly one offer_new for that round');
select todo_end();

-- ---------------------------------------------------------------------------
-- T-INT-LIST-04 (BE-05): idempotent create_listing on a reserved id.
select todo_start('P5-SELL-01: reserve_listing_id + create_listing');
select ok(tests.try_ok_as(tests.uid('A'), $$create temp table if not exists r as select public.reserve_listing_id() as id$$),
  'LIST-04: A reserves a listing id');
select is(tests.try_text_as(tests.uid('A'), $$select (public.create_listing(id => (select id from r), kind => 'sale', title => 'Chair', price_cents => 1000)).id::text = (select id::text from r)::text from r$$),
  'true', 'LIST-04: first create_listing returns the listing');
select is(tests.try_text_as(tests.uid('A'), $$select (public.create_listing(id => (select id from r), kind => 'sale', title => 'Chair', price_cents => 1000)).id::text = (select id::text from r)::text from r$$),
  'true', 'LIST-04: second call returns the same row');
select is(tests.try_text_as(tests.uid('A'), $$select count(*)::text from public.listings where id = (select id from r)$$),
  '1', 'LIST-04: one row');
select is(tests.try_text_as(tests.uid('A'), $$select public.create_listing(id => gen_random_uuid(), kind => 'sale', title => 'Chair', price_cents => 1000)::text$$),
  'ERROR: FORBIDDEN', 'LIST-04: an unreserved id is FORBIDDEN');
select todo_end();

-- ---------------------------------------------------------------------------
-- T-INT-DEL-02 (BE-01): schema part is live now (S7: set null + snapshot).
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, status)
values ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000001a2', tests.uid('B'), tests.uid('A'), 3500, 'accepted');
insert into public.chats (id, listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents)
values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-0000000002a1',
        tests.uid('B'), tests.uid('A'), 'Mini fridge', 4000, 3500);
delete from auth.users where id = tests.uid('A');
select is((select listing_title from public.chats where id = '00000000-0000-4000-8000-0000000003a1'),
  'Mini fridge', 'DEL-02: seller account deleted, the buyer''s chat keeps its snapshot');
select is((select seller_id from public.chats where id = '00000000-0000-4000-8000-0000000003a1'),
  null::uuid, 'DEL-02: the seller shows as "Deleted user" (seller_id null)');

select todo_start('P8-DEAL-04: delete_listing closes chats read-only with a system message');
select is(tests.try_text($$select status::text from public.chats where id = '00000000-0000-4000-8000-0000000003a1'$$),
  'closed', 'DEL-02: the chat is closed (read-only) after the counterpart is deleted');
select ok(exists (select 1 from public.messages where chat_id = '00000000-0000-4000-8000-0000000003a1' and kind = 'system'),
  'DEL-02: a system message explains why');
select todo_end();

-- ---------------------------------------------------------------------------
-- T-INT-SOLD-01 (BE-11)
select todo_start('P8-DEAL-04: mark_sold closes other chats and notifies those buyers');
select ok(tests.try_ok_as(tests.uid('C'), $$select public.mark_sold('00000000-0000-4000-8000-0000000001a1', null)$$),
  'SOLD-01: mark_sold succeeds for the seller');
select todo_end();
select todo_start('P8-DEAL-04: other buyers get offer_declined "This sold to someone else"');
select ok(exists (select 1 from public.notifications where type = 'offer_declined'),
  'SOLD-01: other buyers are notified');
select todo_end();

-- ---------------------------------------------------------------------------
-- T-INT-OFF-RACE-02 (BE-10). pgTAP has one session, so this checks the
-- ordering rule; the two-session race runs in the integration suite (P7-OFF-01).
select todo_start('P7-OFF-01: make_offer on a sold listing is LISTING_UNAVAILABLE');
update public.listings set status = 'sold', sold_at = now() where id = '00000000-0000-4000-8000-0000000001a1';
select is(tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-0000000001a1', 900, null, '{}')::text$$),
  'ERROR: LISTING_UNAVAILABLE', 'OFF-RACE-02: never a pending offer on a sold listing');
select todo_end();

-- ---------------------------------------------------------------------------
-- T-INT-MEET-02 (BE-06): the unique index is live now; the RPC comes later.
insert into public.safe_spots (id, campus_id, name, lat, lng)
values ('00000000-0000-4000-8000-0000000005a1', tests.uid('OSU'), 'Library lobby', 40.0, -83.0);
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents)
values ('00000000-0000-4000-8000-0000000003a2', tests.uid('B'), tests.uid('C'), 'Lamp', 1000, 900);
insert into public.meetups (id, chat_id, spot_id, starts_at, status)
values ('00000000-0000-4000-8000-0000000006a1', '00000000-0000-4000-8000-0000000003a2',
        '00000000-0000-4000-8000-0000000005a1', now() + interval '1 day', 'proposed');
select throws_ok(
  $$insert into public.meetups (chat_id, spot_id, starts_at) values ('00000000-0000-4000-8000-0000000003a2', '00000000-0000-4000-8000-0000000005a1', now() + interval '2 days')$$,
  '23505', null, 'MEET-02: two active meetups in one chat are impossible');

select todo_start('P8-MEET-01: propose_meetup cancels the previous active one');
select ok(tests.try_ok_as(tests.uid('B'), $$select public.propose_meetup('00000000-0000-4000-8000-0000000003a2', '00000000-0000-4000-8000-0000000005a1', null, now() + interval '2 days')$$),
  'MEET-02: a second proposal succeeds');
select todo_end();
select todo_start('P8-MEET-01: the first proposal is cancelled');
select is((select status::text from public.meetups where id = '00000000-0000-4000-8000-0000000006a1'),
  'cancelled', 'MEET-02: the first proposal is cancelled');
select todo_end();

-- ---------------------------------------------------------------------------
-- T-INT-MEET-03 (BE-07): no-show rules
select todo_start('P8-MEET-01: report_noshow rules');
update public.meetups set status = 'confirmed', starts_at = now() - interval '10 minutes'
 where id = '00000000-0000-4000-8000-0000000006a1';
select is(tests.try_text_as(tests.uid('B'), $$select public.report_noshow('00000000-0000-4000-8000-0000000006a1', null)::text$$),
  'ERROR: MEETUP_WINDOW', 'MEET-03: rejected when the reporter did not check in');
select todo_end();
select todo_start('P8-MEET-01: report_noshow before start + 20 min');
update public.meetups set buyer_here_at = now() where id = '00000000-0000-4000-8000-0000000006a1';
select is(tests.try_text_as(tests.uid('B'), $$select public.report_noshow('00000000-0000-4000-8000-0000000006a1', null)::text$$),
  'ERROR: MEETUP_WINDOW', 'MEET-03: rejected before start + 20 min');
select todo_end();

-- ---------------------------------------------------------------------------
-- T-INT-SAFE-03 (BE-09): auto-hide needs 3 distinct reporters older than 7 days.
select todo_start('P3-SAFE-01: create_report and the auto-hide trigger');
insert into public.listings (id, campus_id, seller_id, title)
values ('00000000-0000-4000-8000-0000000001a3', tests.uid('OSU'), tests.uid('C'), 'Sketchy item');
select ok(tests.try_ok_as(tests.uid('B'), $$select public.create_report('listing', '00000000-0000-4000-8000-0000000001a3', 'scam', null)$$),
  'SAFE-03: a young account can report');
select todo_end();
select todo_start('P3-SAFE-01: young accounts never trigger auto-hide');
select is((select status::text from public.listings where id = '00000000-0000-4000-8000-0000000001a3'),
  'active', 'SAFE-03: reports from new accounts do not hide the listing');
select ok(exists (select 1 from public.reports where target_id = '00000000-0000-4000-8000-0000000001a3' and status = 'open'),
  'SAFE-03: the report stays open');
select todo_end();

-- ---------------------------------------------------------------------------
-- T-INT-TZ-01 (BE-12): campus time zone across the DST change.
-- The helper side is live now: activity days follow the campus clock.
select tests.set_now('2027-03-14 06:30:00+00');   -- 01:30 EST, just before the spring-forward
select tests.set_claims(tests.uid('B'));
select private.require_active();
select ok(exists (select 1 from public.activity_days where user_id = tests.uid('B') and day = date '2027-03-14'),
  'TZ-01: 06:30 UTC on the DST day is March 14 in Ohio');
select todo_start('P8-MEET-01: meetup_reminders fire 30 min before local time on DST days');
select ok(tests.try_ok($$select private.meetup_reminders()$$), 'TZ-01: reminder job exists');
select ok(exists (select 1 from public.notifications where type = 'meetup_reminder'),
  'TZ-01: reminder queued at local start - 30 min');
select todo_end();

select * from finish();
rollback;
