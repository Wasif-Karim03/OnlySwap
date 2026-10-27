-- T-INT-RT-02 (E-09, DEC 108): a chat message is one broadcast, to the other party's user:{uid}
-- channel, carrying the message. System messages go to both parties. Nothing goes on chat:{id}.
begin;
select plan(9);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, last_message_at) values
  ('00000000-0000-4000-8000-0000000000e1', tests.uid('B'), tests.uid('A'), 'Mini fridge', 4000, 3800, '2027-03-10 11:00-05');
delete from realtime.messages;

select isnt(tests.try_text_as(tests.uid('B'),
  $$select public.send_message('00000000-0000-4000-8000-0000000000e1', 'Still free at 4?', '00000000-0000-4000-8000-00000000e001') ->> 'id'$$),
  null, 'the buyer sends');
select is((select count(*)::int from realtime.messages), 1, 'one broadcast per message');
select is((select topic from realtime.messages), 'user:' || tests.uid('A'), 'to the seller''s user channel');
select is((select event from realtime.messages), 'inbox', 'as an inbox event');
select is((select payload -> 'message' ->> 'body' from realtime.messages), 'Still free at 4?', 'carrying the message');
select is((select payload ->> 'chat_id' from realtime.messages), '00000000-0000-4000-8000-0000000000e1', 'and the chat id');
select is((select (payload -> 'message' ->> 'mine')::bool from realtime.messages), false, 'not marked as mine for the reader');

delete from realtime.messages;
insert into public.messages (chat_id, sender_id, kind, body)
values ('00000000-0000-4000-8000-0000000000e1', null, 'system', 'Meetup confirmed');
select is((select array_agg(topic order by topic) from realtime.messages),
  (select array_agg(t order by t) from unnest(array['user:' || tests.uid('A'), 'user:' || tests.uid('B')]) t),
  'a system message reaches both parties');
select is((select count(*)::int from realtime.messages where topic like 'chat:%'), 0, 'nothing on chat:{id}');

select * from finish();
rollback;
