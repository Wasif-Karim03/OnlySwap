-- P3-DB-11: reference data from 0100_ref_data.sql. Re-running the migration
-- is checked by scripts/verify/s07.sh (checksums before and after).
begin;
select plan(12);

select is((select count(*)::int from public.categories), 15, '15 categories');
select is(
  (select count(*)::int from public.categories c
   where c.parent_id is not null and not exists (select 1 from public.categories p where p.id = c.parent_id and p.parent_id is null)),
  0, 'sub-categories hang off a top-level category'
);
select is(
  (select array_agg(slug order by sort) from public.categories where parent_id is null),
  array['dorm-furniture','textbooks','tech','clothes-shoes','kitchen','bikes-scooters','music','sports-outdoors','decor','other'],
  'top-level categories in board order'
);

select cmp_ok((select count(*)::int from public.banned_words), '>=', 150, 'at least 150 banned words');
select is(
  (select count(*)::int from (select pattern, match from public.banned_words group by 1, 2 having count(*) > 1) d),
  0, 'no duplicate banned words'
);
select ok(
  (select bool_and(scopes <@ array['listing','quad','profile','offer','rating'] and cardinality(scopes) > 0)
   from public.banned_words),
  'scopes are listing, quad, profile, offer or rating (chat is never scanned)'
);
select ok(
  (select bool_and(pattern = lower(pattern) and pattern = btrim(pattern)) from public.banned_words),
  'patterns are lowercase and trimmed'
);
select ok(
  exists (select 1 from public.banned_words where pattern in ('puppy','kitten') and action = 'block')
    and exists (select 1 from public.banned_words where pattern = 'gift card' and action = 'block')
    and exists (select 1 from public.banned_words where pattern = 'recalled' and action = 'block'),
  'pets, gift cards and recalled items are covered (LEG-05)'
);
select ok(
  exists (select 1 from public.banned_words where pattern = 'exam answers' and action = 'review'),
  '"exam answers" sends a listing to review (board X14)'
);

select set_eq(
  $$select key from public.app_config$$,
  array['maintenance','min_version_ios','min_version_android','rules_version','rules_changes','quad_enabled','chat_photos_enabled'],
  'app_config has the public keys'
);
select is(
  (select value from public.app_config where key = 'maintenance'),
  '{"enabled": false, "until": null}'::jsonb, 'maintenance is off by default'
);
select is(
  (select jsonb_typeof(value) from public.app_config where key = 'quad_enabled'), 'boolean',
  'the Quad kill switch is a boolean (0100 ships it off; the local seed turns it on)'
);

select * from finish();
rollback;
