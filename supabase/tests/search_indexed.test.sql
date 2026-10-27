-- E-01 (audit): search_listings and search_suggest use the full-text and
-- trigram indexes instead of checking every campus listing. T-INT-SRCH-01.
-- Same results as before: stemmed words, typos, accents, filters, paging.
begin;
select plan(17);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

-- 25 desks by A (one an hour), plus a few to test ranking and visibility.
insert into public.listings (id, campus_id, seller_id, title, status, kind, category_id, condition, price_cents, bumped_at, created_at)
select ('00000000-0000-4000-8000-0000000f' || lpad(g::text, 4, '0'))::uuid, tests.uid('OSU'), tests.uid('A'),
       'Study desk ' || g, 'active', 'sale', 1, 'good', 1000 + g, '2027-03-10 12:00-05'::timestamptz - make_interval(hours => g),
       '2027-03-10 12:00-05'::timestamptz - make_interval(hours => g)
from generate_series(1, 25) g;
insert into public.listings (id, campus_id, seller_id, title, description, status, kind, category_id, price_cents, bumped_at, expires_at) values
  ('00000000-0000-4000-8000-0000000e1001', tests.uid('OSU'), tests.uid('A'), 'Lamp', 'Goes great on a desk', 'active', 'sale', 1, 500, '2027-03-10 11:30-05', null),
  ('00000000-0000-4000-8000-0000000e1002', tests.uid('OSU'), tests.uid('C'), 'Café table', null, 'hold', 'sale', 1, 900, '2027-03-10 11:00-05', null),
  ('00000000-0000-4000-8000-0000000e1003', tests.uid('OSU'), tests.uid('C'), 'Old cafe chair', null, 'active', 'sale', 1, 900, '2027-03-10 10:00-05', '2027-03-10 11:00-05'),
  ('00000000-0000-4000-8000-0000000e1004', tests.uid('OSU'), tests.uid('C'), 'Wanted: cafe chair', null, 'active', 'wanted', 1, 0, '2027-03-10 10:00-05', null);

create function pg_temp.page(q text, f text default '{}', cur text default null) returns jsonb language sql as $$
  select tests.try_text_as(tests.uid('B'),
    format($s$select public.search_listings(%L, %L::jsonb, %L::jsonb)::text$s$, q, f, cur))::jsonb
$$;
create function pg_temp.titles(p jsonb) returns text language sql as $$
  select string_agg(i ->> 'title', ',' order by n) from jsonb_array_elements(p) with ordinality t(i, n)
$$;

-- The indexes the rewritten search needs ---------------------------------------------------------
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'listings'
  and indexdef like '%gin%lower(private.unaccent_immutable(title))%gin_trgm_ops%'), 'a trigram index on the folded title');
select ok((select prosrc from pg_proc where oid = 'public.search_listings(text,jsonb,jsonb)'::regprocedure) not like '%text_matches%',
  'search_listings no longer filters with the opaque text_matches');
select ok((select prosrc from pg_proc where oid = 'public.search_suggest(text)'::regprocedure) not like '%text_matches%',
  'search_suggest no longer filters with the opaque text_matches');

-- Paging and order ---------------------------------------------------------------------------
select is(jsonb_array_length(pg_temp.page('desk')), 20, 'a full first page');
select is(pg_temp.page('desk') -> 0 ->> 'title', 'Study desk 1', 'a title match ranks above a description match, then newest');
select is(jsonb_array_length(pg_temp.page('desk', '{}', '{"offset":20}')), 6, 'the second page has the rest (25 desks and the lamp)');
select is((select count(distinct i ->> 'id') from (
    select jsonb_array_elements(pg_temp.page('desk')) i
    union all select jsonb_array_elements(pg_temp.page('desk', '{}', '{"offset":20}'))) x)::int, 26,
  'pages do not overlap');
select is(pg_temp.page('desk', '{}', '{"offset":20}') -> 5 ->> 'title', 'Lamp', 'the description match comes last');
select is(pg_temp.titles(pg_temp.page('desk', '{"sort":"price_desc"}', '{"offset":20}')), 'Study desk 5,Study desk 4,Study desk 3,Study desk 2,Study desk 1,Lamp',
  'price sort pages too');
select is(pg_temp.titles(pg_temp.page('lampp')), 'Lamp', 'a typo still finds the title (trigram)');
select is(pg_temp.titles(pg_temp.page('lammp')), 'Lamp', 'the title match keeps the 0.5 threshold (0.57 here; the pg_trgm default is 0.6)');

-- What a match is ---------------------------------------------------------------------------
select is(pg_temp.titles(pg_temp.page('cafe')), 'Café table', 'accents fold; held listings show; expired and wanted do not');
select is(pg_temp.titles(pg_temp.page('CAFÉ TABL')), 'Café table', 'a close title match ignores case and accents');
select is(pg_temp.page('the'), '[]'::jsonb, 'a stop word alone finds nothing and does not fail');
select is(jsonb_array_length(pg_temp.page(null, '{"sort":"price_asc"}')), 20, 'no text: filters and sort still page');

-- Suggestions ---------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), $$select jsonb_array_length(public.search_suggest('desk'))::text$$), '8',
  'at most 8 suggestions');
select is(tests.try_text_as(tests.uid('B'), $$select count(*)::text from jsonb_array_elements(public.search_suggest('table')) s where s ->> 'type' = 'title'$$),
  '0', 'title suggestions are active listings only (a held one is not suggested)');

select * from finish();
rollback;
