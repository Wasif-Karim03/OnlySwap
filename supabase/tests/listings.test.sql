-- S16 P5-SELL-01: listing RPCs. T-INT-LIST-01 (paths, banned words, held_review,
-- limits), T-INT-LIST-04 (idempotent create_listing), soft delete, relist,
-- mark_sold, check_text, price_hint.
begin;
select plan(55);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
-- A and B are older than a day (the first-day limit is tested with C).
update public.profiles set created_at = '2027-01-01' where id in (tests.uid('A'), tests.uid('B'));
update public.profiles set created_at = '2027-03-10 08:00:00-05' where id = tests.uid('C');

insert into public.safe_spots (id, campus_id, name, lat, lng) values
  ('00000000-0000-4000-8000-0000000005f1', tests.uid('OSU'), 'Union front desk', 40.0, -83.0);

-- Reserve as A; builds the photo JSON for a listing id.
create function pg_temp.reserve(who text) returns uuid language plpgsql as $$
declare r uuid;
begin
  perform tests.authenticate_as(tests.uid(who));
  r := public.reserve_listing_id();
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return r;
end $$;
create function pg_temp.photos(lid uuid, n int default 1) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'path', 'c/' || tests.uid('OSU') || '/l/' || lid || '/p' || g || '_full.webp',
    'thumb_path', 'c/' || tests.uid('OSU') || '/l/' || lid || '/p' || g || '_thumb.webp',
    'width', 1600, 'height', 1200, 'blurhash', 'LEHV6nWB2yk8'))
  from generate_series(1, n) g
$$;
create function pg_temp.create(who text, lid uuid, extra text default '', price text default '1200',
                                cat text default '1') returns text language sql as $$
  select tests.try_text_as(tests.uid(who), format(
    $f$select public.create_listing(id := %L, title := 'Desk lamp', category_id := %s::smallint,
         price_cents := %s, photos := %L::jsonb %s) ->> 'status'$f$, lid, cat, price, pg_temp.photos(lid), extra))
$$;

-- reserve_listing_id ---------------------------------------------------------------------------
select ok(pg_temp.reserve('A') is not null, 'reserve_listing_id returns an id');
select is((select count(*)::int from public.listing_reservations where user_id = tests.uid('A')), 1, 'the reservation is stored for the caller');
select ok(not has_function_privilege('anon', 'public.reserve_listing_id()', 'execute'), 'anon cannot reserve');
select is(tests.try_text_as(tests.uid('D'), 'select public.reserve_listing_id()::text'), 'ERROR: NOT_ACTIVE:waitlist',
  'a waitlisted account cannot sell');

-- T-INT-LIST-04: idempotent create ---------------------------------------------------------------
create temp table ids (name text primary key, id uuid);
grant all on ids to public;
insert into ids values ('lamp', pg_temp.reserve('A'));
select is(pg_temp.create('A', (select id from ids where name = 'lamp')), 'active', 'create_listing makes an active listing');
select is(pg_temp.create('A', (select id from ids where name = 'lamp')), 'active', 'the same call again returns the same listing');
select is((select count(*)::int from public.listings where id = (select id from ids where name = 'lamp')), 1,
  'T-INT-LIST-04: one row after two calls');
select is((select count(*)::int from public.rate_counters where user_id = tests.uid('A') and action = 'create_listing'), 1,
  'the retry did not spend the daily limit again');
select is((select count(*)::int from public.listing_photos where listing_id = (select id from ids where name = 'lamp')), 1,
  'photos stored');
select isnt((select used_at from public.listing_reservations where id = (select id from ids where name = 'lamp')), null,
  'the reservation is marked used');
select is(pg_temp.create('A', gen_random_uuid()), 'ERROR: FORBIDDEN', 'T-INT-LIST-04: an unreserved id is FORBIDDEN');
insert into ids values ('b1', pg_temp.reserve('B'));
select is(pg_temp.create('A', (select id from ids where name = 'b1')), 'ERROR: FORBIDDEN', 'someone else''s reservation is FORBIDDEN');
select is(pg_temp.create('B', (select id from ids where name = 'lamp')), 'ERROR: FORBIDDEN', 'another seller''s listing id is FORBIDDEN');

-- Returned shape
select is(tests.try_text_as(tests.uid('A'), format(
  $$select (public.create_listing(id := %L, title := 'x', photos := '[]') -> 'photos' -> 0 ->> 'blurhash')$$,
  (select id from ids where name = 'lamp'))), 'LEHV6nWB2yk8', 'the listing comes back with its photos');

-- Validation (T-UNIT-SELL-02 server half) ------------------------------------------------------------
insert into ids values ('v', pg_temp.reserve('A'));
select is(tests.try_text_as(tests.uid('A'), format(
  $$select public.create_listing(id := %L, title := 'ab', category_id := 1::smallint, price_cents := 1200, photos := %L::jsonb)::text$$,
  (select id from ids where name = 'v'), pg_temp.photos((select id from ids where name = 'v')))), 'ERROR: INVALID:title', 'title under 3 characters');
select is(pg_temp.create('A', (select id from ids where name = 'v'), '', price := '450000'), 'ERROR: INVALID:price_cents',
  'price over $2,000');
select is(pg_temp.create('A', (select id from ids where name = 'v'), '', price := '0'), 'ERROR: INVALID:price_cents',
  'a sale needs a price (free is its own kind)');
select is(pg_temp.create('A', (select id from ids where name = 'v'), '', cat := 'null'), 'ERROR: INVALID:category_id',
  'a sale needs a category');
select is(pg_temp.create('A', (select id from ids where name = 'v'), '', cat := '77'), 'ERROR: INVALID:category_id',
  'unknown category');
select is(tests.try_text_as(tests.uid('A'), format(
  $$select public.create_listing(id := %L, title := 'Desk lamp', category_id := 1::smallint, price_cents := 1200, photos := '[]')::text$$,
  (select id from ids where name = 'v'))), 'ERROR: INVALID:photos', 'a sale needs at least one photo');
select is(tests.try_text_as(tests.uid('A'), format(
  $$select public.create_listing(id := %L, title := 'Desk lamp', category_id := 1::smallint, price_cents := 1200, photos := %L::jsonb)::text$$,
  (select id from ids where name = 'v'), pg_temp.photos((select id from ids where name = 'v'), 9))), 'ERROR: INVALID:photos', 'at most 8 photos');
select is(tests.try_text_as(tests.uid('A'), format(
  $$select public.create_listing(id := %L, title := 'Desk lamp', category_id := 1::smallint, price_cents := 1200, photos := %L::jsonb)::text$$,
  (select id from ids where name = 'v'), pg_temp.photos((select id from ids where name = 'lamp')))), 'ERROR: INVALID:photos',
  'T-INT-LIST-01: photos must sit under this listing''s path');
select is(pg_temp.create('A', (select id from ids where name = 'v'), ', meet_spot_ids := array[gen_random_uuid()]'),
  'ERROR: INVALID:meet_spot_ids', 'unknown meetup spot');
select is(pg_temp.create('A', (select id from ids where name = 'v'), ', pickup_by := ''2027-03-12''::date'),
  'ERROR: INVALID:pickup_by', 'pickup_by is only for give-aways');

-- Banned words (T-INT-LIST-01)
select is(tests.try_text_as(tests.uid('A'), format(
  $$select public.create_listing(id := %L, title := 'Vape + charger bundle', category_id := 3::smallint, price_cents := 1500, photos := %L::jsonb)::text$$,
  (select id from ids where name = 'v'), pg_temp.photos((select id from ids where name = 'v')))), 'ERROR: BANNED_TERM:vape',
  'a blocked word refuses the listing');
select is(tests.try_text_as(tests.uid('A'), format(
  $$select public.create_listing(id := %L, title := 'Glasses', description := 'Great for W1ne nights', category_id := 5::smallint, price_cents := 1500, photos := %L::jsonb) ->> 'status'$$,
  (select id from ids where name = 'v'), pg_temp.photos((select id from ids where name = 'v')))), 'held_review',
  'a review word in the description holds the listing (leetspeak normalized)');

-- Give-away with a pickup day (DEC 54)
insert into ids values ('free', pg_temp.reserve('A'));
select is(tests.try_text_as(tests.uid('A'), format(
  $$select public.create_listing(id := %L, kind := 'free', title := 'Floor mirror', price_cents := 4000, photos := %L::jsonb,
      pickup_by := '2027-03-14'::date) ->> 'price_cents'$$,
  (select id from ids where name = 'free'), pg_temp.photos((select id from ids where name = 'free')))), '0',
  'a give-away is always $0 and needs no category');
select is((select expires_at from public.listings where id = (select id from ids where name = 'free')),
  '2027-03-15 00:00:00-04'::timestamptz, 'it expires at the end of the pickup day on the campus clock');
insert into ids values ('free2', pg_temp.reserve('A'));
select is(tests.try_text_as(tests.uid('A'), format(
  $$select public.create_listing(id := %L, kind := 'free', title := 'Floor mirror', photos := %L::jsonb, pickup_by := '2027-03-09'::date)::text$$,
  (select id from ids where name = 'free2'), pg_temp.photos((select id from ids where name = 'free2')))), 'ERROR: INVALID:pickup_by',
  'a pickup day in the past is refused');
select is((select expires_at from public.listings where id = (select id from ids where name = 'lamp')),
  '2027-05-09 12:00:00-05'::timestamptz, 'other listings expire after 60 days');

-- Limits (API §3): 3 in the first 24 h
select is(pg_temp.create('C', pg_temp.reserve('C')) || pg_temp.create('C', pg_temp.reserve('C'))
          || pg_temp.create('C', pg_temp.reserve('C')), 'activeactiveactive', 'a new account lists 3 times');
select is(pg_temp.create('C', pg_temp.reserve('C')), 'ERROR: RATE_LIMITED:create_listing_new:2027-03-11T00:00:00Z',
  'a new account gets 3 listings in its first day');

-- update_listing -------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), format(
  $$select public.update_listing(id := %L, price_cents := 900) ->> 'price_cents'$$, (select id from ids where name = 'lamp'))),
  '900', 'the seller changes the price');
select is((select old_cents || '>' || new_cents from public.listing_price_changes where listing_id = (select id from ids where name = 'lamp')),
  '1200>900', 'the price change is logged');
select is(tests.try_text_as(tests.uid('A'), format(
  $$select public.update_listing(id := %L, title := 'Lamp with vape') ->> 'title'$$, (select id from ids where name = 'lamp'))),
  'ERROR: BANNED_TERM:vape', 'edits are checked for banned words too');
select is(tests.try_text_as(tests.uid('B'), format(
  $$select public.update_listing(id := %L, price_cents := 1) ->> 'price_cents'$$, (select id from ids where name = 'lamp'))),
  'ERROR: NOT_FOUND', 'only the seller can edit');
select is(tests.try_text_as(tests.uid('A'), format(
  $$select jsonb_array_length(public.update_listing(id := %L, photos := %L::jsonb) -> 'photos')::text$$,
  (select id from ids where name = 'lamp'), pg_temp.photos((select id from ids where name = 'lamp'), 3))),
  '3', 'photos can be replaced (reordered)');

-- check_text -----------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select public.check_text('juul pods', 'listing')::text$$),
  '{"term": "juul", "result": "block"}', 'check_text names the blocked term');
select is(tests.try_text_as(tests.uid('A'), $$select public.check_text('Desk lamp', 'listing')::text$$),
  '{"term": null, "result": "ok"}', 'clean text is ok');
select is(tests.try_text_as(tests.uid('A'), $$select public.check_text('x', 'chat')::text$$),
  'ERROR: INVALID:scope', 'unknown scopes are refused');

-- price_hint (n >= 5) ----------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select coalesce(public.price_hint(1::smallint)::text, 'none')$$), 'none',
  'no hint without enough sales');
insert into public.listings (id, campus_id, seller_id, title, category_id, price_cents, status, sold_at)
select gen_random_uuid(), tests.uid('OSU'), tests.uid('B'), 'Desk ' || g, 1, g * 1000, 'sold', now() - interval '1 day'
from generate_series(1, 5) g;
refresh materialized view public.price_hints;
select is(tests.try_text_as(tests.uid('A'), $$select public.price_hint(1::smallint)::text$$),
  '{"p25": 2000, "p50": 3000, "p75": 4000}', 'with 5 sales the quartiles show');

-- mark_sold and delete_listing ---------------------------------------------------------------------
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents)
values ('00000000-0000-4000-8000-0000000006f1', (select id from ids where name = 'lamp'), tests.uid('C'), tests.uid('A'), 800);
insert into public.chats (id, listing_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents)
values ('00000000-0000-4000-8000-0000000007b1', (select id from ids where name = 'lamp'), tests.uid('B'), tests.uid('A'), 'Desk lamp', 900, 900),
       ('00000000-0000-4000-8000-0000000007c1', (select id from ids where name = 'lamp'), tests.uid('C'), tests.uid('A'), 'Desk lamp', 900, 850);
select is(tests.try_text_as(tests.uid('A'), format($$select public.mark_sold(%L, %L)::text$$,
  (select id from ids where name = 'lamp'), tests.uid('D'))), 'ERROR: INVALID:buyer_id', 'the buyer must have a chat about it');
select ok(tests.try_ok_as(tests.uid('A'), format($$select public.mark_sold(%L, %L)$$,
  (select id from ids where name = 'lamp'), tests.uid('B'))), 'the seller marks it sold to B');
select is((select status::text || '|' || buyer_id::text || '|' || sold_in_app::text from public.listings where id = (select id from ids where name = 'lamp')),
  'sold|' || tests.uid('B') || '|true', 'sold, with the buyer');
select is((select status::text from public.chats where id = '00000000-0000-4000-8000-0000000007b1'), 'open', 'the buyer''s chat stays open');
select is((select status::text from public.chats where id = '00000000-0000-4000-8000-0000000007c1'), 'closed', 'the other chat closes');
select is((select body from public.messages where chat_id = '00000000-0000-4000-8000-0000000007c1'), 'This item sold to someone else',
  'with a system message');
select is((select status::text from public.offers where id = '00000000-0000-4000-8000-0000000006f1'), 'auto_declined', 'open offers are declined');
select is(tests.try_text_as(tests.uid('A'), format($$select public.delete_listing(%L)::text$$, (select id from ids where name = 'lamp'))),
  'ERROR: INVALID:status', 'a sold listing stays (deal data is kept)');

select ok(tests.try_ok_as(tests.uid('A'), format($$select public.delete_listing(%L)$$, (select id from ids where name = 'free'))),
  'the seller deletes a listing');
select is((select status::text || '|' || (deleted_at is not null)::text from public.listings where id = (select id from ids where name = 'free')),
  'deleted|true', 'soft delete: the row stays, marked deleted');
select is(tests.try_text_as(tests.uid('B'), format($$select count(*)::text from public.listings where id = %L$$, (select id from ids where name = 'free'))),
  '0', 'others no longer see it');

-- relist ----------------------------------------------------------------------------------------
update public.listings set status = 'expired', bumped_at = '2027-01-01' where id = (select id from ids where name = 'v');
select is(tests.try_text_as(tests.uid('A'), format($$select public.relist_listing(%L, 1000) ->> 'status'$$, (select id from ids where name = 'v'))),
  'active', 'an expired listing comes back');
select is(tests.try_text_as(tests.uid('A'), format($$select public.relist_listing(%L)::text$$, (select id from ids where name = 'v'))),
  'ERROR: RATE_LIMITED:relist_listing:2027-03-17T17:00:00Z', 'bumping again within 7 days is refused');

select * from finish();
rollback;
