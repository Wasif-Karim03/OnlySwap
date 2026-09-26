-- P3-DB-03: listings, photos, swipes and saves (DATA_MODEL §2.2).
begin;
select plan(14);

insert into public.campuses (id, slug, name, short_name, status)
values ('00000000-0000-4000-8000-00000000c001', 'test-u', 'Test University', 'Test U', 'live');
-- The on_auth_user_created trigger (0010) needs a known school domain and
-- the email_hash pepper; it makes the profile, which this test then fills in.
select tests.set_pepper();
insert into public.campus_domains (domain, campus_id, kind)
values ('test.edu', '00000000-0000-4000-8000-00000000c001', 'student') on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'maya@test.edu');
insert into public.profiles (id, campus_id, email_hash, first_name, verified_until)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'h1', 'Maya', current_date + 365)
on conflict (id) do update set campus_id = excluded.campus_id, email_hash = excluded.email_hash, first_name = excluded.first_name, verified_until = excluded.verified_until;
insert into public.categories (id, slug, name, sort) values (900, 'test-cat', 'Test', 1)
on conflict (id) do nothing;

insert into public.listings (id, campus_id, seller_id, title, description, category_id, price_cents)
values
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-00000000c001',
   '00000000-0000-4000-8000-0000000000a1', 'Café table', 'Crème colored, fits a dorm', 900, 4000),
  ('00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-00000000c001',
   '00000000-0000-4000-8000-0000000000a1', 'Mini fridge', null, 900, 3500);

select is(
  (select status::text || kind::text from public.listings where id = '00000000-0000-4000-8000-0000000001a1'),
  'activesale', 'new listings are active sales by default'
);
select ok(
  (select search @@ to_tsquery('english', 'cafe') from public.listings where id = '00000000-0000-4000-8000-0000000001a1'),
  'search matches an unaccented query'
);
select ok(
  (select search @@ to_tsquery('english', 'creme') from public.listings where id = '00000000-0000-4000-8000-0000000001a1'),
  'search covers the description'
);
select ok(
  exists (select 1 from pg_indexes where tablename = 'listings' and indexdef like '%gin_trgm_ops%'),
  'title has a trigram index for fuzzy search'
);
select throws_ok(
  $$insert into public.listings (id, campus_id, title) values (gen_random_uuid(), '00000000-0000-4000-8000-00000000c001', 'ab')$$,
  '23514', null, 'titles are at least 3 characters'
);
select throws_ok(
  $$insert into public.listings (id, campus_id, title, price_cents) values (gen_random_uuid(), '00000000-0000-4000-8000-00000000c001', 'Car', 200001)$$,
  '23514', null, 'price is at most $2,000'
);
select throws_ok(
  $$insert into public.listings (campus_id, title) values ('00000000-0000-4000-8000-00000000c001', 'No id')$$,
  '23502', null, 'listing ids come from reserve_listing_id (no default, BE-05)'
);

insert into public.listing_photos (listing_id, idx, path, thumb_path)
values ('00000000-0000-4000-8000-0000000001a1', 0, 'c/x/l/1/a_full.webp', 'c/x/l/1/a_thumb.webp');
select throws_ok(
  $$insert into public.listing_photos (listing_id, idx, path, thumb_path)
    values ('00000000-0000-4000-8000-0000000001a1', 0, 'p', 't')$$,
  '23505', null, 'one photo per position'
);
select throws_ok(
  $$insert into public.listing_photos (listing_id, idx, path, thumb_path)
    values ('00000000-0000-4000-8000-0000000001a1', 8, 'p', 't')$$,
  '23514', null, 'at most 8 photos (idx 0 to 7)'
);

-- A Wanted post that points at a listing keeps working when that listing goes (PM-05).
insert into public.listings (id, campus_id, seller_id, kind, title, wanted_ref)
values ('00000000-0000-4000-8000-0000000001a3', '00000000-0000-4000-8000-00000000c001',
        '00000000-0000-4000-8000-0000000000a1', 'wanted', 'Looking for a fridge', '00000000-0000-4000-8000-0000000001a2');
delete from public.listings where id = '00000000-0000-4000-8000-0000000001a2';
select is(
  (select wanted_ref from public.listings where id = '00000000-0000-4000-8000-0000000001a3'),
  null::uuid, 'wanted_ref is cleared when the referenced listing is removed'
);

insert into public.swipes (user_id, listing_id, dir)
values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000001a1', 'left');
select throws_ok(
  $$insert into public.swipes (user_id, listing_id, dir)
    values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000001a1', 'save')$$,
  '23505', null, 'one swipe per user and listing'
);
select throws_ok(
  $$insert into public.saved_searches (user_id, campus_id, query)
    values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', repeat('q', 81))$$,
  '23514', null, 'saved search text is at most 80 characters'
);

select col_hasnt_default('public', 'listings', 'deleted_at', 'soft delete column starts empty (no default)');
select col_type_is('public', 'listings', 'price_cents', 'integer', 'money is integer cents');

select * from finish();
rollback;
