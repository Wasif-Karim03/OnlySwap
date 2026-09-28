-- S22: T-INT-OFF-01 offer state machine, T-INT-OFF-02 limits, sequential halves of
-- T-INT-OFF-RACE / RACE-02 (the concurrent versions run in scripts/verify/offer-race.mjs).
begin;
select plan(51);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
-- Fixture accounts are "created" now; age them past the new-account limit.
update public.profiles set created_at = '2027-01-01' where campus_id = tests.uid('OSU');

insert into public.listings (id, campus_id, seller_id, title, status, kind, price_cents, open_to_offers) values
  ('00000000-0000-4000-8000-000000000a01', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 'active', 'sale', 4000, true),
  ('00000000-0000-4000-8000-000000000a02', tests.uid('OSU'), tests.uid('A'), 'Firm lamp', 'active', 'sale', 1500, false),
  ('00000000-0000-4000-8000-000000000a03', tests.uid('OSU'), tests.uid('A'), 'Free chair', 'active', 'free', 0, true),
  ('00000000-0000-4000-8000-000000000a04', tests.uid('OSU'), tests.uid('A'), 'Held rug', 'hold', 'sale', 2000, true),
  ('00000000-0000-4000-8000-000000000a05', tests.uid('OSU'), tests.uid('A'), 'Desk', 'active', 'sale', 5000, true);

create function pg_temp.offer(who text, lid text, cents int, note text default null) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), format('select public.make_offer(%L, %s, %L) ->> %L', lid, cents, note, 'id'))
$$;
create function pg_temp.oid(buyer text, lid text) returns uuid language sql as $$
  select id from public.offers where buyer_id = tests.uid(buyer) and listing_id = lid::uuid
  order by (status in ('pending','countered')) desc, created_at desc, responded_at desc nulls first limit 1
$$;
create function pg_temp.st(buyer text, lid text) returns text language sql as $$
  select status::text from public.offers where buyer_id = tests.uid(buyer) and listing_id = lid::uuid
  order by (status in ('pending','countered')) desc, created_at desc, responded_at desc nulls first limit 1
$$;

-- make_offer ---------------------------------------------------------------------------------
select isnt(pg_temp.offer('B', '00000000-0000-4000-8000-000000000a01', 3500, 'Can pick up tonight'), null, 'B offers $35');
select is(pg_temp.st('B', '00000000-0000-4000-8000-000000000a01'), 'pending', 'pending');
select is((select offer_count from public.listings where id = '00000000-0000-4000-8000-000000000a01'), 1, 'offer_count counts');
select is((select body from public.notifications where user_id = tests.uid('A') and type = 'offer_new'),
  'Ben B. offered $35 on your Mini fridge', 'the seller is told');
select is(pg_temp.offer('B', '00000000-0000-4000-8000-000000000a01', 3600), pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01')::text,
  'a second offer updates the open one');
select is((select count(*)::int from public.offers where buyer_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000a01'), 1,
  'one open offer per listing and buyer');
select is(pg_temp.offer('A', '00000000-0000-4000-8000-000000000a01', 3000), 'ERROR: FORBIDDEN', 'not on my own listing');
select is(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a04', 1500), 'ERROR: LISTING_UNAVAILABLE', 'not on a listing on hold');
select is(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a02', 1000), 'ERROR: LISTING_UNAVAILABLE', 'a firm price takes no lower offer');
select isnt(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a02', 1500), null, 'a firm price can be bought at the ask');
select is(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a03', 500), 'ERROR: INVALID:amount_cents', 'free items are asked for at $0');
select isnt(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a03', 0), null, 'ask for a free item');
select is(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a01', 50), 'ERROR: INVALID:amount_cents', 'at least $1');
select is(pg_temp.offer('D', '00000000-0000-4000-8000-000000000a01', 3000), 'ERROR: NOT_ACTIVE:waitlist', 'waitlisted people cannot offer');
insert into public.banned_words (pattern, match, scopes, action) values ('venmo first', 'phrase', '{offer}', 'block');
select is(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a05', 3000, 'send venmo first pls'), 'ERROR: BANNED_TERM:venmo first',
  'notes are checked for banned words');

-- counter / accept rules -------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), format('select public.accept_offer(%L)::text', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01'))),
  'ERROR: FORBIDDEN', 'the buyer cannot accept their own offer');
select is(tests.try_text_as(tests.uid('A'), format('select public.counter_offer(%L, 3900) ->> %L', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01'), 'round')),
  '2', 'the seller counters: round 2');
select is(pg_temp.st('B', '00000000-0000-4000-8000-000000000a01'), 'countered', 'countered');
select is(tests.try_text_as(tests.uid('A'), format('select public.counter_offer(%L, 3800)::text', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01'))),
  'ERROR: FORBIDDEN', 'turns alternate');
select is(tests.try_text_as(tests.uid('B'), format('select public.counter_offer(%L, 3700) ->> %L', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01'), 'round')),
  '3', 'the buyer counters back: round 3');
select is(tests.try_text_as(tests.uid('A'), format('select public.counter_offer(%L, 3800) ->> %L', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01'), 'round')),
  '4', 'round 4');
select is(tests.try_text_as(tests.uid('B'), format('select public.counter_offer(%L, 3750)::text', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01'))),
  'ERROR: INVALID:round', 'no round 5');
select is(tests.try_text_as(tests.uid('C'), format('select public.accept_offer(%L)::text', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01'))),
  'ERROR: NOT_FOUND', 'someone else cannot see it');

-- A second buyer's offer, then B accepts the seller's last counter.
select isnt(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a01', 3000), null, 'C also offers');
select isnt(tests.try_text_as(tests.uid('B'), format('select public.accept_offer(%L) ->> %L', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01'), 'chat_id')),
  null, 'the buyer accepts the counter');
select is(pg_temp.st('B', '00000000-0000-4000-8000-000000000a01'), 'accepted', 'accepted');
select is((select status::text from public.listings where id = '00000000-0000-4000-8000-000000000a01'), 'hold', 'the listing goes on hold');
select is((select hold_offer_id from public.listings where id = '00000000-0000-4000-8000-000000000a01'),
  pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01'), 'hold_offer_id points at it');
select is((select agreed_cents || ':' || listing_title from public.chats where offer_id = pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01')),
  '3800:Mini fridge', 'a chat opens with the snapshot');
select is((select body from public.messages m join public.chats c on c.id = m.chat_id where c.offer_id = pg_temp.oid('B', '00000000-0000-4000-8000-000000000a01')),
  'Offer accepted at $38. Plan the pickup.', 'with a system message');
select is(pg_temp.st('C', '00000000-0000-4000-8000-000000000a01'), 'auto_declined', 'other open offers are auto-declined');
select is((select count(*)::int from public.notifications where user_id = tests.uid('C') and type = 'offer_declined'), 1, 'and told');
select is((select count(*)::int from public.notifications where user_id = tests.uid('A') and type = 'offer_accepted'), 1,
  'the seller hears the buyer accepted');
-- RACE (sequential half): accepting C's auto-declined offer now fails.
select is(tests.try_text_as(tests.uid('A'), format('select public.accept_offer(%L)::text', pg_temp.oid('C', '00000000-0000-4000-8000-000000000a01'))),
  'ERROR: OFFER_NOT_PENDING', 'a second accept on the same listing fails');

-- decline / withdraw / expire -----------------------------------------------------------------
select isnt(pg_temp.offer('B', '00000000-0000-4000-8000-000000000a05', 4000), null, 'B offers on the desk');
select is(tests.try_text_as(tests.uid('B'), format('select public.decline_offer(%L)::text', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a05'))),
  'ERROR: FORBIDDEN', 'the buyer cannot decline their own offer');
select is(tests.try_text_as(tests.uid('A'), format('select public.decline_offer(%L, %L)::text', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a05'), 'Too low')),
  '', 'the seller declines');
select is(pg_temp.st('B', '00000000-0000-4000-8000-000000000a05'), 'declined', 'declined');
select isnt(pg_temp.offer('B', '00000000-0000-4000-8000-000000000a05', 4500), null, 'B can offer again after a decline');
select is(tests.try_text_as(tests.uid('B'), format('select public.withdraw_offer(%L)::text', pg_temp.oid('B', '00000000-0000-4000-8000-000000000a05'))),
  '', 'the buyer withdraws');
select isnt(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a05', 4200), null, 'C offers on the desk');
select tests.set_now('2027-03-12 12:30:00-05');
select is(private.expire_offers() >= 1, true, 'the cron expires offers older than 48 h');
select is(pg_temp.st('C', '00000000-0000-4000-8000-000000000a05'), 'expired', 'expired');

-- RACE-02 (sequential half): mark_sold auto-declines a pending offer.
select tests.set_now('2027-03-12 13:00:00-05');
select isnt(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a05', 4300), null, 'C offers again');
select ok(tests.try_ok_as(tests.uid('A'), $$select public.mark_sold('00000000-0000-4000-8000-000000000a05')$$), 'the seller marks it sold elsewhere');
select is(pg_temp.st('C', '00000000-0000-4000-8000-000000000a05'), 'auto_declined', 'never pending on a sold listing');

-- inbox and listing_offers ------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select jsonb_array_length(public.get_inbox() -> 'chats')::text$$), '1', 'the seller sees the chat');
select is(tests.try_text_as(tests.uid('A'), $$select jsonb_array_length(public.listing_offers('00000000-0000-4000-8000-000000000a01'))::text$$),
  '2', 'offers on my listing in arrival order');

-- T-INT-OFF-02 limits ---------------------------------------------------------------------------
insert into public.listings (id, campus_id, seller_id, title, status, kind, price_cents) values
  ('00000000-0000-4000-8000-000000000a06', tests.uid('OSU'), tests.uid('A'), 'Toaster', 'active', 'sale', 2000);
update public.profiles set status = 'paused' where id = tests.uid('C');
select is(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a06', 1500), 'ERROR: OFFERS_PAUSED', 'paused accounts cannot make offers');
update public.profiles set status = 'active' where id = tests.uid('C');
update public.profiles set created_at = '2027-03-12 12:00:00-05' where id = tests.uid('C');
select ok((select bool_and(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a06', 1500 + g) not like 'ERROR%') from generate_series(1, 5) g),
  'a new account makes 5 offers on its first day');
select ok(pg_temp.offer('C', '00000000-0000-4000-8000-000000000a06', 1600) like 'ERROR: RATE_LIMITED:make_offer_new_account%',
  'the 6th is rate limited');

select * from finish();
rollback;
