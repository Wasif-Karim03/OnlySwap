-- S28: push tokens, claim/finish (BE-03, T-FN-07 SQL half), prefs, quiet hours, cap,
-- receipts, reset_stuck_sends, and the notification list (P9-PUSH-03, P9-FIX-01, P9-NOTIF-01/02).
begin;
select plan(30);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');   -- noon on campus (America/New_York)

-- tokens ---------------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select public.register_push_token('not-a-token', 'ios')::text$$), 'ERROR: INVALID:token',
  'only Expo push tokens');
select is(tests.try_text_as(tests.uid('A'), $$select public.register_push_token('ExponentPushToken[aaa]', 'ios', '1.0.0')::text$$), '', 'A registers');
select is(tests.try_text_as(tests.uid('B'), $$select public.register_push_token('ExponentPushToken[bbb]', 'android')::text$$), '', 'B registers');
select is(tests.try_text_as(tests.uid('B'), $$select public.register_push_token('ExponentPushToken[aaa]', 'ios')::text$$), '',
  'the same device signing in as someone else takes the token over');
select is((select user_id from public.push_tokens where token = 'ExponentPushToken[aaa]'), tests.uid('B'), 'now B''s');
select tests.try_text_as(tests.uid('A'), $$select public.register_push_token('ExponentPushToken[aaa2]', 'ios')$$);

-- claim --------------------------------------------------------------------------------------------------
select private.queue_notification(tests.uid('A'), 'offer_new', 'offers', 'New offer', 'Ben offered $35', '{}', true, 'k1');
select private.queue_notification(tests.uid('A'), 'price_drop', 'alerts', 'Price drop', 'Lamp is now $10', '{}', false, 'k2');
select private.queue_notification(tests.uid('C'), 'offer_new', 'offers', 'New offer', 'no device', '{}', false, 'k3');
update public.notification_prefs set price_drop = false where user_id = tests.uid('A');

select is(jsonb_array_length(private.claim_pushes(500)), 1, 'one push to send');
select is((select push_state::text from public.notifications where dedupe_key = 'k1'), 'sending', 'claimed rows move to sending');
select is((select push_state::text from public.notifications where dedupe_key = 'k2'), 'skipped', 'a turned-off type is skipped');
select is((select push_state::text from public.notifications where dedupe_key = 'k3'), 'skipped', 'no device: skipped');
select is(jsonb_array_length(private.claim_pushes(500)), 0, 'a second run finds nothing to take (no double sends)');

-- finish
select is(private.finish_pushes(format('[{"id": %s, "tickets": [{"token_id": "%s", "ticket_id": "t-1", "status": "ok"}]}]',
  (select id from public.notifications where dedupe_key = 'k1'),
  (select id from public.push_tokens where token = 'ExponentPushToken[aaa2]'))::jsonb), 1, 'finish records the tickets');
select is((select push_state::text from public.notifications where dedupe_key = 'k1'), 'sent', 'sent');

-- quiet hours and time-sensitive
select tests.set_now('2027-03-10 23:30:00-05');
select private.queue_notification(tests.uid('A'), 'saved_search_match', 'alerts', 'New match', 'Bike $95', '{}', false, 'k4');
select private.queue_notification(tests.uid('A'), 'meetup_reminder', 'meetups', 'Meetup in 30', 'Meet Ben', '{}', true, 'k5');
select is(jsonb_array_length(private.claim_pushes(500)), 1, 'at 11:30 PM only the time-sensitive one goes');
select is((select push_after from public.notifications where dedupe_key = 'k4'), '2027-03-11 08:00:00-05'::timestamptz,
  'the rest waits for the end of quiet hours in campus time');

-- daily cap: 6 non-urgent sent pushes a day
select tests.set_now('2027-03-11 12:00:00-05');
update public.notifications set push_state = 'sent', claimed_at = '2027-03-11 11:00-05', time_sensitive = false
 where user_id = tests.uid('A') and dedupe_key in ('k1');
insert into public.notifications (user_id, type, grp, title, body, push_state, claimed_at)
select tests.uid('A'), 'offer_new', 'offers', 't', 'b', 'sent', '2027-03-11 11:00-05' from generate_series(1, 5);
select is(jsonb_array_length(private.claim_pushes(500)), 0, 'the 7th non-urgent push today is not sent');
select is((select push_state::text from public.notifications where dedupe_key = 'k4'), 'skipped', 'it is skipped (still in the list)');

-- failures and receipts
select private.queue_notification(tests.uid('B'), 'offer_new', 'offers', 'New offer', 'x', '{}', true, 'k6');
select is(jsonb_array_length(private.claim_pushes(500)), 1, 'claim B''s');
select is(private.finish_pushes(format('[{"id": %s, "tickets": [{"token_id": "%s", "status": "error", "error": "DeviceNotRegistered"}]}]',
  (select id from public.notifications where dedupe_key = 'k6'),
  (select id from public.push_tokens where token = 'ExponentPushToken[bbb]'))::jsonb), 1, 'a dead token');
select isnt((select disabled_at from public.push_tokens where token = 'ExponentPushToken[bbb]'), null, 'is disabled');
select is((select push_state::text from public.notifications where dedupe_key = 'k6'), 'failed', 'no device took it: failed');
select tests.set_now('2027-03-11 12:30:00-05');
select is(jsonb_array_length(private.pending_receipts()), 1, 'tickets older than 15 minutes wait for receipts');
select is(private.finish_receipts(format('[{"id": %s, "status": "error", "error": "DeviceNotRegistered"}]',
  (select id from public.push_tickets where ticket_id = 't-1'))::jsonb), 1, 'a receipt error');
select isnt((select disabled_at from public.push_tokens where token = 'ExponentPushToken[aaa2]'), null, 'disables that token too');

-- stuck sends
update public.notifications set push_state = 'sending', claimed_at = '2027-03-11 12:10-05' where dedupe_key = 'k5';
select is(private.reset_stuck_sends(), 1, 'sending for over 10 minutes goes back to pending');

-- list and prefs ------------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select public.get_notifications() ->> 'unread'$$), '9', 'unread count');
select ok(tests.try_ok_as(tests.uid('A'), $$select public.mark_notifications_read()$$), 'mark all read');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_notifications() ->> 'unread'$$), '0', 'none unread');
select private.queue_notification(tests.uid('A'), 'listing_stale', 'selling', 'No offers yet', 'Drop the price?', '{}', false, 'k7');
select is(tests.try_text_as(tests.uid('A'), $$select public.update_notification_prefs('{"tips": false, "quiet_start": "22:00"}') ->> 'quiet_start'$$),
  '22:00', 'prefs update');
select is((select push_state::text from public.notifications where dedupe_key = 'k7'), 'skipped', 'turning tips off drops a waiting tip');

-- R1.1 preferences (0201): Quad replies and free food, both off until turned on.
select is(
  concat_ws('|',
    tests.try_text_as(tests.uid('C'), $$select (public.get_notification_prefs() ->> 'quad_replies') || ',' || (public.get_notification_prefs() ->> 'free_food')$$),
    tests.try_text_as(tests.uid('C'), $$select (public.update_notification_prefs('{"quad_replies": true}') ->> 'quad_replies')$$),
    tests.try_text_as(tests.uid('C'), $$select private.push_pref('quad_reply')$$)),
  'false,false|true|ERROR: permission denied for function push_pref',
  'R11-NOTIF-01: quad_replies and free_food are readable and writable; quad pushes follow quad_replies');

select * from finish();
rollback;
