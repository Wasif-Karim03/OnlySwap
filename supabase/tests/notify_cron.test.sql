-- S29: listing notification triggers, the remaining crons, the email outbox and the demo bot
-- (P9-PUSH-04, P9-CRON-01, P9-MAIL-02, P4-AUTH-16, T-INT-NOTIF-DEDUPE).
begin;
select plan(32);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

-- saved_search_match (≤1 per search per 2 h) -------------------------------------------------------
insert into public.saved_searches (id, user_id, campus_id, query, filters, alerts) values
  ('00000000-0000-4000-8000-00000000ab01', tests.uid('B'), tests.uid('OSU'), 'fridge', '{"max_cents": 5000}', true),
  ('00000000-0000-4000-8000-00000000ab02', tests.uid('C'), tests.uid('OSU'), 'fridge', '{}', false);
insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-00000000f001', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 'active', 4000);
select is((select body from public.notifications where user_id = tests.uid('B') and type = 'saved_search_match'),
  'New: Mini fridge for $40 (matches ''fridge'')', 'a matching new listing alerts the saver');
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'saved_search_match'), 0, 'alerts off: nothing');
insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-00000000f002', tests.uid('OSU'), tests.uid('A'), 'Another fridge', 'active', 3000);
select is((select count(*)::int from public.notifications where user_id = tests.uid('B') and type = 'saved_search_match'), 1,
  'at most one alert per search every 2 hours');
insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-00000000f003', tests.uid('OSU'), tests.uid('A'), 'Pricey fridge', 'active', 9000);
select is((select count(*)::int from public.notifications where type = 'saved_search_match' and data ->> 'listing_id' = '00000000-0000-4000-8000-00000000f003'), 0,
  'filters apply (over the max price)');
select isnt((select founding_seller_until from public.profiles where id = tests.uid('A')), null, 'the first sellers on a campus become founding sellers');

-- price_drop and watch_available -----------------------------------------------------------------------------
insert into public.saves (user_id, listing_id, price_at_save) values (tests.uid('C'), '00000000-0000-4000-8000-00000000f001', 4000);
update public.listings set price_cents = 3900 where id = '00000000-0000-4000-8000-00000000f001';
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'price_drop'), 0, 'under 5% is not a drop');
update public.listings set price_cents = 3500 where id = '00000000-0000-4000-8000-00000000f001';
select is((select body from public.notifications where user_id = tests.uid('C') and type = 'price_drop'), 'Mini fridge you saved is now $35',
  'a 5% or bigger drop tells savers');
update public.listings set status = 'hold' where id = '00000000-0000-4000-8000-00000000f001';
insert into public.watches (user_id, listing_id) values (tests.uid('B'), '00000000-0000-4000-8000-00000000f001');
update public.listings set status = 'active' where id = '00000000-0000-4000-8000-00000000f001';
select is((select count(*)::int from public.notifications where user_id = tests.uid('B') and type = 'watch_available'), 1, 'back from hold tells watchers');

-- T-INT-NOTIF-DEDUPE
select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-00000000f002', 2500)$$);
select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-00000000f002', 2500)$$);
select is((select count(*)::int from public.notifications where user_id = tests.uid('A') and type = 'offer_new'), 1,
  'the same offer round notifies once');

-- expire / stale -------------------------------------------------------------------------------------------------
update public.listings set expires_at = '2027-03-10 11:00-05' where id = '00000000-0000-4000-8000-00000000f002';
select is(private.expire_listings(), 1, 'past expires_at expires');
select is((select status::text from public.offers where listing_id = '00000000-0000-4000-8000-00000000f002'), 'auto_declined', 'its offers close');
update public.listings set created_at = '2027-03-01' where id = '00000000-0000-4000-8000-00000000f003';
select is(private.stale_listings(), 1, 'a week with no offers: one nudge');
select is(private.stale_listings(), 0, 'only once');

-- reverify / pause / strikes ---------------------------------------------------------------------------------------
update public.profiles set verified_until = '2027-03-24' where id = tests.uid('B');
update public.profiles set verified_until = '2027-03-09' where id = tests.uid('C');
select is(private.reverify_reminders(), 1, 'a reminder 14 days ahead');
select is((select count(*)::int from public.email_outbox where template = 'reverify_due'), 1, 'with an email');
select is(private.reverify_enforce(), 1, 'past the date → reverify');
select is((select status::text from public.profiles where id = tests.uid('C')), 'reverify', 'C must reverify');
update public.profiles set status = 'paused', paused_until = '2027-03-10 11:00-05' where id = tests.uid('A');
select is(private.pause_lift(), 1, 'a finished pause lifts');
select is((select status::text from public.profiles where id = tests.uid('A')), 'active', 'active again');
insert into public.strikes (user_id, reason, expires_at) values (tests.uid('B'), 'x', '2027-03-01');
update public.profiles set strike_count = 1 where id = tests.uid('B');
select is(private.strike_expiry(), 1, 'an expired strike clears');
select is((select strike_count from public.profiles where id = tests.uid('B')), 0, 'and stops counting');

-- prune (retention) ----------------------------------------------------------------------------------------------------
insert into public.notifications (user_id, type, grp, title, body, created_at) values (tests.uid('B'), 'x', 'account', 't', 'b', '2026-12-01');
insert into public.swipes (user_id, listing_id, dir, created_at) values (tests.uid('C'), '00000000-0000-4000-8000-00000000f003', 'left', '2027-01-01');
select ok((private.prune_retention() ->> 'notifications')::int >= 1, 'notifications older than 60 days go');
select is((select count(*)::int from public.swipes where user_id = tests.uid('C')), 0, 'left swipes older than 30 days go');

-- email outbox ---------------------------------------------------------------------------------------------------------
select private.queue_email('a@osu.edu', 'account_deleted', '{}', 'e1');
select private.queue_email('owner@example.com', 'priority_report', '{}', 'e2');
select is(jsonb_array_length(private.claim_emails(50)), 3, 'claim the due emails');
select is(private.claim_emails(50), '[]'::jsonb, 'nothing claimed twice');
select is(private.finish_emails(format('[{"id": %s, "ok": true}, {"id": %s, "ok": false, "error": "smtp 421"}]',
  (select id from public.email_outbox where dedupe_key = 'e1'), (select id from public.email_outbox where dedupe_key = 'e2'))::jsonb), 2, 'finish');
select is((select state from public.email_outbox where dedupe_key = 'e2'), 'pending', 'a failure retries later');
insert into public.email_outbox (to_email, template, state, sent_at)
select 'x@osu.edu', 'account_deleted', 'sent', '2027-03-10 11:00-05' from generate_series(1, 400);
select tests.set_now('2027-03-10 13:00:00-05');
select is(jsonb_array_length(private.claim_emails(50)), 0, '400 a day, then it waits');

-- archive ---------------------------------------------------------------------------------------------------------------
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, status, closed_at)
values ('00000000-0000-4000-8000-0000000000aa', tests.uid('B'), tests.uid('A'), 'Old lamp', 100, 100, 'closed', '2026-11-01');
insert into public.messages (chat_id, sender_id, body) values ('00000000-0000-4000-8000-0000000000aa', tests.uid('B'), 'old');
select is(jsonb_array_length(private.chats_to_archive()), 1, 'closed over 90 days: ready to archive');
select private.finish_chat_archive('00000000-0000-4000-8000-0000000000aa');
select is((select count(*)::int from public.messages where chat_id = '00000000-0000-4000-8000-0000000000aa'), 0, 'messages leave the database after the archive');

-- demo bot (P4-AUTH-16) --------------------------------------------------------------------------------------------------
insert into public.campuses (id, slug, name, short_name, status, timezone, is_demo)
values ('10000000-0000-4000-8000-0000000000de', 'demo-t', 'Demo T', 'Demo T', 'live', 'America/New_York', true);
update public.profiles set campus_id = '10000000-0000-4000-8000-0000000000de' where id in (tests.uid('A'), tests.uid('B'));
insert into public.review_accounts (email, note) values ('b@osu.edu', 'App Store reviewer (password login)') on conflict do nothing;
insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-00000000f0de', '10000000-0000-4000-8000-0000000000de', tests.uid('A'), 'Demo lamp', 'active', 1000);
select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-00000000f0de', 900)$$);
select tests.set_now('2027-03-10 13:05:00-05');
select ok(private.demo_autoplay() >= 1, 'the bot acts');
select is((select status::text from public.offers where listing_id = '00000000-0000-4000-8000-00000000f0de'), 'accepted',
  'it accepts the reviewer''s offer so the swap can go on');

select * from finish();
rollback;
