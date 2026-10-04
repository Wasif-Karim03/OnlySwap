-- P3-DB-10: queue_notification, queue_email, unlock_campus, can_upload,
-- snapshot_evidence, names_student; and no API role can call private.*.
begin;
select plan(26);
select tests.create_fixtures();

-- queue_notification dedupes on (user, dedupe_key) (BE-04, T-INT-NOTIF-DEDUPE helper part)
select isnt(
  private.queue_notification(tests.uid('A'), 'offer_new', 'offers', 'New offer', 'Ben offered $10',
    '{"url":"/offer/1"}', true, 'offer_new:1:1'),
  null, 'first notification is queued'
);
select is(
  private.queue_notification(tests.uid('A'), 'offer_new', 'offers', 'New offer', 'Ben offered $10',
    '{}', true, 'offer_new:1:1'),
  null, 'the same dedupe key is dropped'
);
select is((select count(*)::int from public.notifications where user_id = tests.uid('A')), 1, 'one row');
select isnt(
  private.queue_notification(tests.uid('A'), 'offer_new', 'offers', 'New offer', 'Round 2', '{}', true, 'offer_new:1:2'),
  null, 'a new round is a new key'
);
select tests.set_now('2027-01-01 12:00:00+00');
select private.queue_notification(tests.uid('B'), 'message_new', 'messages', 'Ben', 'New message');
select is(
  (select push_after from public.notifications where user_id = tests.uid('B')),
  '2027-01-01 12:00:00+00'::timestamptz, 'push_after defaults to private.now()'
);

-- queue_email dedupes on dedupe_key
select isnt(private.queue_email('a@osu.edu', 'support_request', '{}', 'sr:1'), null, 'email queued');
select is(private.queue_email('a@osu.edu', 'support_request', '{}', 'sr:1'), null, 'duplicate email dropped');

-- unlock_campus: idempotent (DATA_MODEL §4.7)
select ok(private.unlock_campus(tests.uid('UMICH')), 'first unlock flips the campus');
select is((select status::text from public.campuses where id = tests.uid('UMICH')), 'live', 'campus is live');
select is((select status::text from public.profiles where id = tests.uid('D')), 'active', 'waitlisted member is now active');
select is(
  (select count(*)::int from public.notifications where user_id = tests.uid('D') and type = 'campus_unlocked'),
  1, 'member gets one campus_unlocked notification'
);
select ok(not private.unlock_campus(tests.uid('UMICH')), 'second unlock is a no-op');
select is(
  (select count(*)::int from public.notifications where type = 'campus_unlocked'), 1, 'no duplicate notifications'
);

-- can_upload (called by the upload-url function with the service role)
insert into public.listing_reservations (id, user_id) values ('00000000-0000-4000-8000-0000000001f1', tests.uid('A'));
select is(private.can_upload(tests.uid('A'), 'avatar', tests.uid('A')), tests.uid('OSU'), 'own avatar -> campus id');
select is(private.can_upload(tests.uid('A'), 'listing', '00000000-0000-4000-8000-0000000001f1'), tests.uid('OSU'),
  'a listing id the user reserved');
select throws_ok(
  format('select private.can_upload(%L, %L, %L)', tests.uid('B'), 'listing', '00000000-0000-4000-8000-0000000001f1'),
  'P0001', 'FORBIDDEN', 'someone else''s reservation is refused'
);
select throws_ok(
  format('select private.can_upload(%L, %L, %L)', tests.uid('B'), 'avatar', tests.uid('A')),
  'P0001', 'FORBIDDEN', 'someone else''s avatar is refused'
);
update public.profiles set status = 'paused' where id = tests.uid('C');
select throws_ok(
  format('select private.can_upload(%L, %L, %L)', tests.uid('C'), 'avatar', tests.uid('C')),
  'P0001', 'FORBIDDEN', 'inactive accounts cannot upload'
);

-- snapshot_evidence (BE-02)
insert into public.listings (id, campus_id, seller_id, title, description)
values ('00000000-0000-4000-8000-0000000001a1', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'Works fine');
insert into public.listing_photos (listing_id, idx, path, thumb_path)
values ('00000000-0000-4000-8000-0000000001a1', 0, 'c/osu/l/1/a_full.webp', 'c/osu/l/1/a_thumb.webp');
select is(
  private.snapshot_evidence('listing', '00000000-0000-4000-8000-0000000001a1') -> 'photo_keys',
  '["c/osu/l/1/a_full.webp"]'::jsonb, 'listing evidence keeps photo keys'
);
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents)
values ('00000000-0000-4000-8000-0000000003a1', tests.uid('B'), tests.uid('A'), 'Desk lamp', 1200, 1000);
insert into public.messages (chat_id, sender_id, body)
select '00000000-0000-4000-8000-0000000003a1', tests.uid('B'), 'msg ' || g from generate_series(1, 25) g;
select is(
  jsonb_array_length(private.snapshot_evidence('chat', '00000000-0000-4000-8000-0000000003a1') -> 'excerpts'),
  20, 'chat evidence keeps the last 20 messages'
);
select is(
  (private.snapshot_evidence('message', (select max(id)::text from public.messages)) ->> 'text'),
  'msg 25', 'message evidence keeps the reported text'
);

-- names_student reads common_first_names (seeded by 0200_quad.sql)
insert into public.common_first_names (name) values ('maya') on conflict do nothing;
select ok(private.names_student('I saw Maya at the rec'), 'a capitalized common first name is flagged');
select ok(not private.names_student('maya is a word here'), 'lowercase words are not names');

-- anon can call nothing in private; authenticated only the read-only helpers
-- that RLS policies use (0008).
select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1),
  array['admin_rank','is_admin','is_blocked','is_chat_participant','is_public_config_key','my_campus','now'],
  'authenticated can execute only the policy helpers in private'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')),
  0, 'anon cannot execute anything in private'
);

-- New public functions start with no EXECUTE for the API roles (explicit grants only).
create function public.tmp_rpc_probe() returns int language sql as 'select 1';
select ok(
  not has_function_privilege('anon', 'public.tmp_rpc_probe()', 'execute')
    and not has_function_privilege('authenticated', 'public.tmp_rpc_probe()', 'execute'),
  'new RPCs are not callable until granted'
);

select * from finish();
rollback;
