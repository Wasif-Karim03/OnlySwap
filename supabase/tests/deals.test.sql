-- S27: T-INT-SOLD-01, T-INT-DEL-02, T-INT-DEAL-01 and deal RPCs (P8-DEAL-01, P8-DEAL-04).
begin;
select plan(27);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-000000000c01', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 'active', 4000),
  ('00000000-0000-4000-8000-000000000c02', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active', 1500),
  ('00000000-0000-4000-8000-000000000c03', tests.uid('OSU'), tests.uid('A'), 'Rug', 'active', 2000);

-- B and C both get accepted chats on the fridge: first accept B, then (as if relisted) C has an open offer.
select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-000000000c01', 3800)$$);
select tests.try_text_as(tests.uid('C'), $$select public.make_offer('00000000-0000-4000-8000-000000000c01', 3500)$$);
select tests.try_text_as(tests.uid('A'), format('select public.accept_offer(%L)',
  (select id from public.offers where buyer_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000c01')));
create function pg_temp.chat(buyer text, lid text) returns uuid language sql as $$
  select id from public.chats where buyer_id = tests.uid(buyer) and listing_id = lid::uuid
$$;

-- confirm_deal ------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), format('select public.confirm_deal(%L, %L)::text', pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01'), 'maybe')),
  'ERROR: INVALID:outcome', 'outcomes are done, not_yet or fell_through');
select is(tests.try_text_as(tests.uid('B'), format('select public.confirm_deal(%L, %L)::text', pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01'), 'not_yet')),
  '', 'not yet is recorded');
select is((select buyer_outcome from public.chats where id = pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01')), 'not_yet', 'buyer_outcome');
select is(tests.try_text_as(tests.uid('A'), format('select public.confirm_deal(%L, %L)::text', pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01'), 'done')),
  '', 'the seller says it sold');
select is((select status::text || ':' || (buyer_id = tests.uid('B'))::text || ':' || sold_in_app::text from public.listings where id = '00000000-0000-4000-8000-000000000c01'),
  'sold:true:true', 'sold to this buyer, in the app');
select is((select count(*)::int from public.notifications where type = 'rate_prompt'), 2, 'both are asked to rate');

-- fell_through puts it back and tells watchers ---------------------------------------------------------
select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-000000000c02', 1500)$$);
select tests.try_text_as(tests.uid('A'), format('select public.accept_offer(%L)',
  (select id from public.offers where buyer_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000c02')));
insert into public.watches (user_id, listing_id) values (tests.uid('C'), '00000000-0000-4000-8000-000000000c02');
select is(tests.try_text_as(tests.uid('B'), format('select public.confirm_deal(%L, %L)::text', pg_temp.chat('B', '00000000-0000-4000-8000-000000000c02'), 'fell_through')),
  '', 'the buyer says it fell through');
select is((select status::text from public.listings where id = '00000000-0000-4000-8000-000000000c02'), 'active', 'the listing is back');
select is((select status::text from public.chats where id = pg_temp.chat('B', '00000000-0000-4000-8000-000000000c02')), 'closed', 'the chat closes');
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'watch_available'), 1, 'watchers are told');

-- T-INT-SOLD-01: mark_sold closes other chats with a system message and notifies those buyers ----------
select tests.try_text_as(tests.uid('C'), $$select public.make_offer('00000000-0000-4000-8000-000000000c03', 2000)$$);
select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-000000000c03', 1800)$$);
-- C's chat opens; then the listing is set back to active so B's offer is open again when it sells.
select tests.try_text_as(tests.uid('A'), format('select public.accept_offer(%L)',
  (select id from public.offers where buyer_id = tests.uid('C') and listing_id = '00000000-0000-4000-8000-000000000c03')));
update public.offers set status = 'pending' where buyer_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000c03';
select ok(tests.try_ok_as(tests.uid('A'), $$select public.mark_sold('00000000-0000-4000-8000-000000000c03')$$), 'sold to someone off the app');
select is((select status::text from public.chats where id = pg_temp.chat('C', '00000000-0000-4000-8000-000000000c03')), 'closed', 'the chat closes');
select is((select body from public.messages where chat_id = pg_temp.chat('C', '00000000-0000-4000-8000-000000000c03') order by id desc limit 1),
  'This item sold to someone else', 'with a system message');
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'offer_declined' and title = 'Deal closed'), 1,
  'the chat''s buyer is told');
select is((select status::text from public.offers where buyer_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000c03'),
  'auto_declined', 'open offers are auto-declined (and told once, deduped per offer)');

-- ratings (T-INT-DEAL-01) --------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('C'), format('select public.submit_rating(%L, true)::text', pg_temp.chat('C', '00000000-0000-4000-8000-000000000c03'))),
  'ERROR: MEETUP_WINDOW', 'no rating without a done deal or a past meetup');
select is(tests.try_text_as(tests.uid('B'), format('select public.submit_rating(%L, true, %L::text[], %L)::text',
  pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01'), '{on_time,friendly}', 'Easy pickup')), '', 'the buyer rates');
select is(tests.try_text_as(tests.uid('B'), format('select public.submit_rating(%L, true)::text', pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01'))),
  'ERROR: INVALID:already_rated', 'once');
select is(tests.try_text_as(tests.uid('B'), format('select public.submit_rating(%L, true, %L::text[])::text',
  pg_temp.chat('B', '00000000-0000-4000-8000-000000000c02'), '{bogus}')), 'ERROR: INVALID:tags', 'known tags only');
select is(tests.try_text_as(tests.uid('A'), format('select (public.get_my_rating(%L) ->> %L)', pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01'), 'theirs_waiting')),
  'true', 'the seller sees a rating waiting, not its content');
select is(tests.try_text_as(tests.uid('A'), format('select public.get_my_rating(%L) -> %L', pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01'), 'theirs')),
  'null', 'hidden until they rate too');
select is(tests.try_text_as(tests.uid('A'), format('select public.submit_rating(%L, true)::text', pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01'))), '', 'the seller rates');
select is(tests.try_text_as(tests.uid('A'), format('select public.get_my_rating(%L) -> %L ->> %L', pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01'), 'theirs', 'comment')),
  'Easy pickup', 'revealed once both rated');

-- T-INT-DEL-02: the seller deletes the listing mid-chat, then the account ----------------------------------
insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-000000000c04', tests.uid('OSU'), tests.uid('C'), 'Bike', 'active', 9000);
select tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-000000000c04', 8000)$$);
select tests.try_text_as(tests.uid('C'), format('select public.accept_offer(%L)',
  (select id from public.offers where buyer_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000c04')));
select ok(tests.try_ok_as(tests.uid('C'), $$select public.delete_listing('00000000-0000-4000-8000-000000000c04')$$), 'the seller deletes the listing');
select is((select status::text || ':' || listing_title from public.chats where id = pg_temp.chat('B', '00000000-0000-4000-8000-000000000c04')),
  'closed:Bike', 'the chat survives read-only with its snapshot');
create temp table fridge_chat as select pg_temp.chat('B', '00000000-0000-4000-8000-000000000c01') as id;
delete from auth.users where id = tests.uid('A');
select is((select seller_id from public.chats where id = (select id from fridge_chat)), null,
  'after the account is deleted the chat shows Deleted user');
select is((select listing_title from public.chats where id = (select id from fridge_chat)), 'Mini fridge',
  'the snapshot is intact');

select * from finish();
rollback;
