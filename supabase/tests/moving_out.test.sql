-- DEC 133 (UX-09): moving out mode and bundle offers.
begin;
select plan(25);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2020-01-01';

insert into public.listings (id, campus_id, seller_id, title, status, price_cents, kind) values
  ('00000000-0000-4000-8000-000000000e01', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 'active', 4000, 'sale'),
  ('00000000-0000-4000-8000-000000000e02', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active', 1500, 'sale'),
  ('00000000-0000-4000-8000-000000000e03', tests.uid('OSU'), tests.uid('A'), 'Rug', 'active', 0, 'free'),
  ('00000000-0000-4000-8000-000000000e04', tests.uid('OSU'), tests.uid('C'), 'Bike', 'active', 9000, 'sale');

create function pg_temp.bundle(who text, main text, ids text, amount int) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), format(
    'select public.make_bundle_offer(%L, %L::uuid[], %s) ->> %L', main::uuid, ids, amount, 'id'))
$$;
create function pg_temp.st(lid text) returns text language sql as $$
  select status::text from public.listings x where x.id = lid::uuid
$$;

-- set_moving_out --------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select public.set_moving_out('2027-03-09')::text$$),
  'ERROR: INVALID:by', 'not in the past');
select is(tests.try_text_as(tests.uid('A'), $$select public.set_moving_out('2027-05-20')::text$$),
  'ERROR: INVALID:by', 'at most 60 days out');
select is(pg_temp.bundle('B', '00000000-0000-4000-8000-000000000e01', '{00000000-0000-4000-8000-000000000e02}', 5000),
  'ERROR: INVALID:bundle_ids', 'no bundles until the seller is moving out');
select is(tests.try_text_as(tests.uid('A'), $$select public.set_moving_out('2027-03-30') ->> 'moving_out_by'$$),
  '2027-03-30', 'set');
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ->> %L', tests.uid('A'), 'moving_out_by')),
  '2027-03-30', 'the profile shows it');
select is(private.feed_item('00000000-0000-4000-8000-000000000e01', tests.uid('B')) -> 'seller' ->> 'moving_out_by',
  '2027-03-30', 'the card shows it');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_me() ->> 'moving_out_by'$$), '2027-03-30', 'get_me too');

-- make_bundle_offer checks ---------------------------------------------------------------------------
select is(pg_temp.bundle('B', '00000000-0000-4000-8000-000000000e01', '{00000000-0000-4000-8000-000000000e01}', 5000),
  'ERROR: INVALID:bundle_ids', 'the main item is not in its own bundle');
select is(pg_temp.bundle('B', '00000000-0000-4000-8000-000000000e01', '{}', 5000),
  'ERROR: INVALID:bundle_ids', 'at least one more item');
select is(pg_temp.bundle('B', '00000000-0000-4000-8000-000000000e01', '{00000000-0000-4000-8000-000000000e04}', 5000),
  'ERROR: LISTING_UNAVAILABLE', 'only the same seller''s items');
select is(pg_temp.bundle('B', '00000000-0000-4000-8000-000000000e01', '{00000000-0000-4000-8000-000000000e02}', 50),
  'ERROR: INVALID:amount_cents', 'at least $1 when anything is for sale');
select is(pg_temp.bundle('A', '00000000-0000-4000-8000-000000000e01', '{00000000-0000-4000-8000-000000000e02}', 5000),
  'ERROR: FORBIDDEN', 'not on your own items');

-- C's single offer on the lamp is auto-declined when the bundle is accepted.
select tests.try_text_as(tests.uid('C'), $$select public.make_offer('00000000-0000-4000-8000-000000000e02', 1400)$$);
select matches(pg_temp.bundle('B', '00000000-0000-4000-8000-000000000e01',
  '{00000000-0000-4000-8000-000000000e02,00000000-0000-4000-8000-000000000e03}', 5000), '^[0-9a-f-]{36}$', 'the bundle offer goes in');
create function pg_temp.offer() returns uuid language sql as $$
  select id from public.offers where buyer_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000e01'
$$;
select is(tests.try_text_as(tests.uid('A'), format('select jsonb_array_length(public.get_offer(%L) -> %L)::text', pg_temp.offer(), 'bundle')),
  '2', 'the seller sees both other items');

-- accept holds everything --------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), format('select public.accept_offer(%L) ? %L', pg_temp.offer(), 'chat_id')), 'true', 'the seller accepts');
select is(pg_temp.st('00000000-0000-4000-8000-000000000e01') || pg_temp.st('00000000-0000-4000-8000-000000000e02')
  || pg_temp.st('00000000-0000-4000-8000-000000000e03'), 'holdholdhold', 'accepting holds every item');
select is((select status::text from public.offers where buyer_id = tests.uid('C')), 'auto_declined', 'other offers on bundle items close');
create function pg_temp.chat() returns uuid language sql as $$
  select id from public.chats where offer_id = pg_temp.offer()
$$;
select is((select listing_title from public.chats where id = pg_temp.chat()), 'Mini fridge + 2 more', 'the chat title says so');
select is(tests.try_text_as(tests.uid('B'), format('select jsonb_array_length(public.get_chat(%L) -> %L)::text', pg_temp.chat(), 'bundle')),
  '2', 'the chat lists the other items');
select matches((select body from public.messages where chat_id = pg_temp.chat() order by id limit 1),
  '^Bundle accepted at \$50: Desk lamp, Mini fridge, Rug', 'the first message names them all');

-- fell through frees the bundle -----------------------------------------------------------------------
savepoint fell;
select tests.try_text_as(tests.uid('B'), format('select public.confirm_deal(%L, %L)', pg_temp.chat(), 'fell_through'));
select is(pg_temp.st('00000000-0000-4000-8000-000000000e01') || pg_temp.st('00000000-0000-4000-8000-000000000e02')
  || pg_temp.st('00000000-0000-4000-8000-000000000e03'), 'activeactiveactive', 'fell through puts every item back');
rollback to savepoint fell;

-- done sells the bundle to this buyer -----------------------------------------------------------------
select tests.try_text_as(tests.uid('A'), format('select public.confirm_deal(%L, %L)', pg_temp.chat(), 'done'));
select is(pg_temp.st('00000000-0000-4000-8000-000000000e01') || pg_temp.st('00000000-0000-4000-8000-000000000e02')
  || pg_temp.st('00000000-0000-4000-8000-000000000e03'), 'soldsoldsold', 'done sells every item');
select is((select count(*)::int from public.listings where buyer_id = tests.uid('B') and sold_in_app), 3, 'all to this buyer');

-- clearing it, and the date passing ------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select public.set_moving_out(null) ->> 'moving_out_by'$$), null, 'cleared');
update public.profiles set moving_out_by = '2027-03-09' where id = tests.uid('A');
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ->> %L', tests.uid('A'), 'moving_out_by')),
  null, 'a past date shows nothing');

select * from finish();
rollback;
