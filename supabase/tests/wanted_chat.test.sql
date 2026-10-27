-- DEC 149: "I have this" opens a chat with the asker (start_wanted_chat).
begin;
select plan(11);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

insert into public.listings (id, campus_id, seller_id, kind, title, status, price_cents, wanted_max_cents) values
  ('00000000-0000-4000-8000-0000000b0001', tests.uid('OSU'), tests.uid('A'), 'wanted', 'Mini fridge', 'active', 0, 5000),
  ('00000000-0000-4000-8000-0000000b0002', tests.uid('OSU'), tests.uid('A'), 'sale', 'Lamp', 'active', 1500, null);
insert into public.listing_photos (listing_id, idx, path, thumb_path, width, height)
values ('00000000-0000-4000-8000-0000000b0001', 0, 'c/x/l/f_full.webp', 'c/x/l/f_thumb.webp', 900, 900);

select ok(not has_function_privilege('anon', 'public.start_wanted_chat(uuid, text, uuid)', 'execute'), 'anon cannot call it');
select is(tests.try_text_as(tests.uid('A'), $$select public.start_wanted_chat('00000000-0000-4000-8000-0000000b0001')::text$$),
  'ERROR: FORBIDDEN', 'you cannot answer your own ask');
select is(tests.try_text_as(tests.uid('B'), $$select public.start_wanted_chat('00000000-0000-4000-8000-0000000b0002')::text$$),
  'ERROR: NOT_FOUND', 'only Wanted posts');

select is(tests.try_text_as(tests.uid('B'),
  $$select public.start_wanted_chat('00000000-0000-4000-8000-0000000b0001', 'I have this') ->> 'existing'$$),
  'false', 'B answers: a new chat');
select is((select count(*)::int from public.chats c where c.listing_id = '00000000-0000-4000-8000-0000000b0001'
             and c.buyer_id = tests.uid('A') and c.seller_id = tests.uid('B') and c.offer_id is null), 1,
  'asker is the buyer, the person answering is the seller, no offer');
select is((select listing_thumb_path from public.chats where listing_id = '00000000-0000-4000-8000-0000000b0001'),
  'c/x/l/f_thumb.webp', 'the ask''s photo is the chat''s pinned item');
select is((select string_agg(coalesce(m.body, ''), '|' order by m.id) from public.messages m
           join public.chats c on c.id = m.chat_id where c.listing_id = '00000000-0000-4000-8000-0000000b0001' and m.kind = 'text'),
  'I have this', 'first message is I have this, from B');
select is(tests.try_text_as(tests.uid('B'),
  $$select public.start_wanted_chat('00000000-0000-4000-8000-0000000b0001') ->> 'existing'$$),
  'true', 'answering again opens the same chat');
select is(tests.try_text_as(tests.uid('A'),
  format('select public.get_chat(%L) ->> %L',
    (select id from public.chats where listing_id = '00000000-0000-4000-8000-0000000b0001'), 'listing_title')),
  'Mini fridge', 'the asker can open it');

insert into public.blocks (blocker_id, blocked_id) values (tests.uid('A'), tests.uid('C'));
select is(tests.try_text_as(tests.uid('C'), $$select public.start_wanted_chat('00000000-0000-4000-8000-0000000b0001')::text$$),
  'ERROR: NOT_FOUND', 'blocked people cannot answer');
update public.listings set status = 'expired' where id = '00000000-0000-4000-8000-0000000b0001';
select is(tests.try_text_as(tests.uid('MOD'), $$select public.start_wanted_chat('00000000-0000-4000-8000-0000000b0001')::text$$),
  'ERROR: INVALID:status', 'a closed ask cannot be answered');

select * from finish();
rollback;
