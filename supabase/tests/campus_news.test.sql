-- DEC 98 campus news posts: create_news fields, photos, link, event time,
-- expiry (event day or 14 days), banned words, limits, idempotency, reserved
-- id, and get_campus_feed 'news' / 'all'; offers, Discover and search keep to
-- sale and free.
begin;
select plan(29);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01'
 where id in (tests.uid('A'), tests.uid('B'), tests.uid('C'));

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
create function pg_temp.photos(lid uuid, n int) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'path', 'c/' || tests.uid('OSU') || '/l/' || lid || '/p' || g || '_full.webp',
    'thumb_path', 'c/' || tests.uid('OSU') || '/l/' || lid || '/p' || g || '_thumb.webp')), '[]')
  from generate_series(1, n) g
$$;
-- Posts news as `who` on a new reserved id with n photos; returns the id or the error text.
create function pg_temp.news(who text, args text default '', n_photos int default 0) returns text language plpgsql as $$
declare lid uuid := pg_temp.reserve(who);
begin
  return tests.try_text_as(tests.uid(who), format(
    'select public.create_news(id := %L, title := %L, photos := %L::jsonb %s) ->> ''id''',
    lid, 'Club fair Friday', pg_temp.photos(lid, n_photos), args));
end $$;
create function pg_temp.feed(who text, k text default null) returns jsonb language plpgsql as $$
declare r text;
begin
  r := tests.try_text_as(tests.uid(who), format('select public.get_campus_feed(%L)::text', k));
  if r like 'ERROR:%' then return to_jsonb(r); end if;
  return r::jsonb;
end $$;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

-- Fields -------------------------------------------------------------------------------------------
insert into ids values ('plain', pg_temp.news('A', $$, description := 'Come say hi'$$)::uuid);
select is((select kind::text || ':' || status::text || ':' || price_cents || ':' || open_to_offers::text
           from public.listings where id = (select id from ids where name = 'plain')),
  'news:active:0:false', 'news posts go live right away, free and not open to offers');
select is((select expires_at from public.listings where id = (select id from ids where name = 'plain')),
  '2027-03-24 12:00:00-05'::timestamptz, 'without a date it lasts 14 days');

insert into ids values ('event', pg_temp.news('A', $$, event_at := '2027-03-12 19:00:00-05', place := 'Hamilton-Williams',
  link_url := 'https://forms.example.com/signup'$$, 4)::uuid);
select is((select event_at || '|' || meet_note || '|' || link_url from public.listings where id = (select id from ids where name = 'event')),
  '2027-03-13 00:00:00+00|Hamilton-Williams|https://forms.example.com/signup', 'event time, place and link are kept');
select is((select expires_at from public.listings where id = (select id from ids where name = 'event')),
  '2027-03-13 00:00:00-05'::timestamptz, 'an event post is gone after the event''s day on campus');
select is((select count(*)::int from public.listing_photos where listing_id = (select id from ids where name = 'event')),
  4, 'up to 4 photos');

select is(pg_temp.news('B', '', 5), 'ERROR: INVALID:photos', 'at most 4 photos');
select is(tests.try_text_as(tests.uid('B'), format('select public.create_news(id := %L, title := %L)', pg_temp.reserve('B'), 'Hi')),
  'ERROR: INVALID:title', 'title at least 3 characters');
select is(pg_temp.news('B', $$, description := repeat('x', 1001)$$), 'ERROR: INVALID:description', 'description up to 1000');
select is(pg_temp.news('B', $$, place := repeat('x', 61)$$), 'ERROR: INVALID:place', 'place up to 60');
select is(pg_temp.news('B', $$, link_url := 'javascript:alert(1)'$$), 'ERROR: INVALID:link_url', 'links must be http or https');
select is(pg_temp.news('B', $$, link_url := 'https://nodot'$$), 'ERROR: INVALID:link_url', 'links need a domain');
select is(pg_temp.news('B', $$, link_url := 'https://x.com/' || repeat('a', 300)$$), 'ERROR: INVALID:link_url', 'links up to 300');
select is(pg_temp.news('B', $$, event_at := '2027-03-10 11:00:00-05'$$), 'ERROR: INVALID:event_at', 'the event must be in the future');
select is(pg_temp.news('B', $$, event_at := '2027-07-01 12:00:00-05'$$), 'ERROR: INVALID:event_at', 'and at most 90 days out');
select matches(pg_temp.news('B', $$, description := 'juul pods for sale'$$), '^ERROR: BANNED_TERM:',
  'banned words are blocked like listings');
select matches(pg_temp.news('B', $$, link_url := 'https://juul.example.com/pods'$$), '^ERROR: BANNED_TERM:',
  'and the link is checked too');

-- Reserved id and idempotency ---------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), format('select public.create_news(id := %L, title := %L)',
  gen_random_uuid(), 'Club fair')), 'ERROR: FORBIDDEN', 'needs a reserved id');
select is(tests.try_text_as(tests.uid('A'), format('select public.create_news(id := %L, title := %L) ->> ''id''',
  (select id from ids where name = 'plain'), 'Something else')),
  (select id::text from ids where name = 'plain'), 'a retry with the same id returns the first post');
select is(tests.try_text_as(tests.uid('B'), format('select public.create_news(id := %L, title := %L)',
  (select id from ids where name = 'plain'), 'Club fair')), 'ERROR: FORBIDDEN', 'someone else''s id is refused');

-- Limit: 3 a day ----------------------------------------------------------------------------------
select lives_ok($$select pg_temp.news('A')$$, 'a third post');
select matches(pg_temp.news('A'), '^ERROR: RATE_LIMITED:create_news:', 'three news posts a day');

-- Feed ---------------------------------------------------------------------------------------------
select is(pg_temp.feed('B', 'news') -> 'items' -> 0 ->> 'kind', 'news', 'news filter');
select ok(exists (select 1 from jsonb_array_elements(pg_temp.feed('B') -> 'items') i where i ->> 'kind' = 'news'),
  'all includes news');
select is((select (i ->> 'link_url') || '|' || (i ->> 'place') || '|' || jsonb_array_length(i -> 'photos')
           from jsonb_array_elements(pg_temp.feed('B', 'news') -> 'items') i
           where i ->> 'id' = (select id::text from ids where name = 'event')),
  'https://forms.example.com/signup|Hamilton-Williams|4', 'feed items carry the link, place and photos');
select ok((select (i ->> 'event_at') is not null from jsonb_array_elements(pg_temp.feed('B', 'news') -> 'items') i
           where i ->> 'id' = (select id::text from ids where name = 'event')), 'and the event time');
select is(tests.try_text_as(tests.uid('B'), format($$select public.get_listing(%L) ->> 'link_url'$$,
  (select id from ids where name = 'event'))), 'https://forms.example.com/signup', 'get_listing carries the link');

-- Elsewhere: no offers, not in Discover or search ---------------------------------------------------
select matches(tests.try_text_as(tests.uid('B'), format('select public.make_offer(listing_id := %L, amount_cents := 500)',
  (select id from ids where name = 'plain'))), '^ERROR: ', 'news posts take no offers');
select is(tests.try_text_as(tests.uid('B'), $$select count(*)::text from jsonb_array_elements(public.get_feed()) i
  where i ->> 'kind' = 'news'$$), '0', 'Discover keeps to sale and free');

-- Expiry
select tests.set_now('2027-03-13 00:00:01-05');
select private.expire_listings();
select ok(not exists (select 1 from jsonb_array_elements(pg_temp.feed('B', 'news') -> 'items') i
                      where i ->> 'id' = (select id::text from ids where name = 'event')), 'the event post is gone after its day');

select * from finish();
rollback;
