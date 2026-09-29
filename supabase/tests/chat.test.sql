-- S24: T-INT-CHAT-01 chat RPCs, trg_messages_ai, and the realtime topic policy (T-INT-RT-01, SQL half).
begin;
select plan(26);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, last_message_at) values
  ('00000000-0000-4000-8000-0000000000d1', tests.uid('B'), tests.uid('A'), 'Mini fridge', 4000, 3800, '2027-03-10 11:00-05'),
  ('00000000-0000-4000-8000-0000000000d2', tests.uid('C'), tests.uid('A'), 'Desk', 5000, 5000, '2027-03-10 11:00-05');
update public.chats set status = 'closed' where id = '00000000-0000-4000-8000-0000000000d2';

create function pg_temp.send(who text, chat text, body text, cid text) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), format('select public.send_message(%L, %L, %L) ->> %L', chat, body, cid, 'id'))
$$;

-- send_message --------------------------------------------------------------------------------
select isnt(pg_temp.send('B', '00000000-0000-4000-8000-0000000000d1', 'Hi, still free at 4?', '00000000-0000-4000-8000-00000000c001'), null, 'the buyer sends');
select is(pg_temp.send('B', '00000000-0000-4000-8000-0000000000d1', 'Hi, still free at 4?', '00000000-0000-4000-8000-00000000c001'),
  (select id::text from public.messages where client_id = '00000000-0000-4000-8000-00000000c001'), 'the same client_id returns the same message');
select is((select count(*)::int from public.messages where chat_id = '00000000-0000-4000-8000-0000000000d1'), 1, 'stored once');
select is((select last_message_at from public.chats where id = '00000000-0000-4000-8000-0000000000d1'), '2027-03-10 12:00-05'::timestamptz,
  'last_message_at moves');
select is((select count(*)::int from realtime.messages where topic = 'chat:00000000-0000-4000-8000-0000000000d1' and event = 'message'), 1,
  'broadcast on chat:{id}');
select is((select count(*)::int from realtime.messages where topic = 'user:' || tests.uid('A') and event = 'inbox'), 1, 'the seller''s inbox is pinged');
select is((select body from public.notifications where user_id = tests.uid('A') and type = 'message_new'), 'New message from Ben B.',
  'message_new without a preview by default');
update public.notification_prefs set message_previews = true where user_id = tests.uid('B');
select isnt(pg_temp.send('A', '00000000-0000-4000-8000-0000000000d1', 'Yes, see you then', '00000000-0000-4000-8000-00000000c002'), null, 'the seller replies');
select is((select body from public.notifications where user_id = tests.uid('B') and type = 'message_new'), 'Yes, see you then', 'previews when turned on');
select is(pg_temp.send('C', '00000000-0000-4000-8000-0000000000d1', 'hello', '00000000-0000-4000-8000-00000000c003'), 'ERROR: NOT_FOUND',
  'a non-participant cannot send');
select is(pg_temp.send('C', '00000000-0000-4000-8000-0000000000d2', 'hello?', '00000000-0000-4000-8000-00000000c004'), 'ERROR: CHAT_CLOSED',
  'a closed chat is read-only');
select is(tests.try_text_as(tests.uid('B'), $$select public.send_message('00000000-0000-4000-8000-0000000000d1', 'x', '00000000-0000-4000-8000-00000000c005', 'photo')::text$$),
  'ERROR: FEATURE_OFF', 'photos are off in R1.0');
select is(pg_temp.send('B', '00000000-0000-4000-8000-0000000000d1', '   ', '00000000-0000-4000-8000-00000000c006'), 'ERROR: INVALID:body', 'no empty messages');
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('A'), tests.uid('B'));
select is(pg_temp.send('B', '00000000-0000-4000-8000-0000000000d1', 'hello?', '00000000-0000-4000-8000-00000000c007'), 'ERROR: CHAT_BLOCKED',
  'blocked either way: no sending');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_chat('00000000-0000-4000-8000-0000000000d1') ->> 'blocked'$$), 'true', 'get_chat says blocked');
delete from public.blocks;

-- a paused account can still finish its chat
update public.profiles set status = 'paused' where id = tests.uid('B');
select isnt(pg_temp.send('B', '00000000-0000-4000-8000-0000000000d1', 'Running late', '00000000-0000-4000-8000-00000000c008'), null,
  'paused people can still message in open chats');
update public.profiles set status = 'active' where id = tests.uid('B');

-- get_messages / read / mute / hide --------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select jsonb_array_length(public.get_messages('00000000-0000-4000-8000-0000000000d1'))::text$$), '3',
  'get_messages returns the chat');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_messages('00000000-0000-4000-8000-0000000000d1', null, 1) -> 0 ->> 'body'$$),
  'Running late', 'newest page first, in order');
select is(tests.try_text_as(tests.uid('A'), format($$select jsonb_array_length(public.get_messages('00000000-0000-4000-8000-0000000000d1', null, 50, %s))::text$$,
  (select min(id) from public.messages))), '2', 'after: messages since an id (reconnect)');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_inbox() -> 'chats' -> 0 ->> 'unread'$$), 'true', 'unread before reading');
select ok(tests.try_ok_as(tests.uid('A'), $$select public.mark_chat_read('00000000-0000-4000-8000-0000000000d1')$$), 'mark read');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_inbox() -> 'chats' -> 0 ->> 'unread'$$), 'false', 'read after');
select ok(tests.try_ok_as(tests.uid('A'), $$select public.hide_chat('00000000-0000-4000-8000-0000000000d1'); select public.set_chat_mute('00000000-0000-4000-8000-0000000000d1', true)$$),
  'hide and mute');
select isnt(pg_temp.send('B', '00000000-0000-4000-8000-0000000000d1', 'Here now', '00000000-0000-4000-8000-00000000c009'), null, 'a new message');
select is((select seller_hidden from public.chats where id = '00000000-0000-4000-8000-0000000000d1'), false, 'brings a hidden chat back');
select is((select count(*)::int from public.notifications where user_id = tests.uid('A') and type = 'message_new' and body = 'New message from Ben B.'
  and created_at > '2027-03-10 12:00:30-05'), 0, 'muted chats send no message push');

select * from finish();
rollback;
