-- Mark sold from the chat (0213, DEC 97): the seller marks the item sold to
-- this chat's buyer. That chat stays open with a system line for both; other
-- open offers are declined and told; the listing leaves Discover; marking it
-- sold to someone else closes this chat instead.
begin;
select plan(9);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-0000000e5001', tests.uid('OSU'), tests.uid('A'), 'Floor fan', 'active', 2000),
  ('00000000-0000-4000-8000-0000000e5002', tests.uid('OSU'), tests.uid('A'), 'Toaster', 'active', 1500);
create function pg_temp.chat(buyer text, lid text) returns uuid language sql as $$
  select id from public.chats where buyer_id = tests.uid(buyer) and listing_id = lid::uuid
$$;

select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-0000000e5001', 2000)$$);
select tests.try_text_as(tests.uid('C'), $$select public.make_offer('00000000-0000-4000-8000-0000000e5001', 1800)$$);
select tests.try_text_as(tests.uid('A'), format('select public.accept_offer(%L)',
  (select id from public.offers where buyer_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-0000000e5001')));
-- As if the seller kept C's offer open while chatting with B.
update public.offers set status = 'pending' where buyer_id = tests.uid('C') and listing_id = '00000000-0000-4000-8000-0000000e5001';

select is(tests.try_text_as(tests.uid('B'), format('select public.mark_sold(%L, %L)::text', '00000000-0000-4000-8000-0000000e5001', tests.uid('B'))),
  'ERROR: NOT_FOUND', 'only the seller can mark it sold');
select is(tests.try_text_as(tests.uid('A'), format('select public.mark_sold(%L, %L)::text', '00000000-0000-4000-8000-0000000e5001', tests.uid('B'))),
  '', 'the seller marks it sold to the chat''s buyer');
select is((select status::text || ':' || (buyer_id = tests.uid('B'))::text from public.listings where id = '00000000-0000-4000-8000-0000000e5001'),
  'sold:true', 'sold to that buyer');
select is((select status::text from public.chats where id = pg_temp.chat('B', '00000000-0000-4000-8000-0000000e5001')), 'open',
  'the buyer''s chat stays open');
select is((select kind || ':' || body from public.messages where chat_id = pg_temp.chat('B', '00000000-0000-4000-8000-0000000e5001') order by id desc limit 1),
  'system:Marked as sold. You can rate each other after the swap.', 'with a system line both of them see');
select is((select status::text from public.offers where buyer_id = tests.uid('C') and listing_id = '00000000-0000-4000-8000-0000000e5001'),
  'auto_declined', 'the other buyer''s offer is declined');
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'offer_declined'), 1,
  'and the other buyer is told');
select is(tests.try_text_as(tests.uid('C'),
  $$select count(*)::text from jsonb_array_elements(public.get_feed()) x where x ->> 'id' = '00000000-0000-4000-8000-0000000e5001'$$),
  '0', 'it is gone from Discover');

-- Sold to someone else: this chat closes, no "sold to you" line.
select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-0000000e5002', 1500)$$);
select tests.try_text_as(tests.uid('A'), format('select public.accept_offer(%L)',
  (select id from public.offers where buyer_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-0000000e5002')));
select tests.try_text_as(tests.uid('A'), $$select public.mark_sold('00000000-0000-4000-8000-0000000e5002')::text$$);
select is((select status::text || ':' || (select body from public.messages m where m.chat_id = c.id order by m.id desc limit 1)
           from public.chats c where c.id = pg_temp.chat('B', '00000000-0000-4000-8000-0000000e5002')),
  'closed:This item sold to someone else', 'sold to someone else closes the chat instead');

select * from finish();
rollback;
