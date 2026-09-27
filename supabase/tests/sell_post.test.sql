-- S17: set_listing_share_image (P5-SELL-05) and the draft cleanup behind the
-- `prune` cron job (P5-SELL-07).
begin;
select plan(16);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, title, status) values
  ('00000000-0000-4000-8000-0000000001a1', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active'),
  ('00000000-0000-4000-8000-0000000001a2', tests.uid('OSU'), tests.uid('A'), 'Old chair', 'deleted');

-- set_listing_share_image ---------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select public.set_listing_share_image('00000000-0000-4000-8000-0000000001a1') ->> 'share_image_path'$$),
  'share/00000000-0000-4000-8000-0000000001a1.jpg', 'the seller records the share card');
select is((select share_image_path from public.listings where id = '00000000-0000-4000-8000-0000000001a1'),
  'share/00000000-0000-4000-8000-0000000001a1.jpg', 'share_image_path is set');
select is(tests.try_text_as(tests.uid('B'), $$select public.set_listing_share_image('00000000-0000-4000-8000-0000000001a1')::text$$),
  'ERROR: NOT_FOUND', 'someone else cannot');
select is(tests.try_text_as(tests.uid('A'), $$select public.set_listing_share_image('00000000-0000-4000-8000-0000000001a2')::text$$),
  'ERROR: NOT_FOUND', 'not on a deleted listing');
select ok(not has_function_privilege('anon', 'public.set_listing_share_image(uuid)', 'execute'), 'needs a session');

-- Draft cleanup ------------------------------------------------------------------------------------
insert into public.listing_reservations (id, user_id, created_at, used_at) values
  ('00000000-0000-4000-8000-0000000002b1', tests.uid('A'), '2027-03-08 10:00:00-05', null),   -- orphan, 2 days old
  ('00000000-0000-4000-8000-0000000002b2', tests.uid('A'), '2027-03-10 09:00:00-05', null),   -- orphan, 3 h old
  ('00000000-0000-4000-8000-0000000001a1', tests.uid('A'), '2027-03-08 10:00:00-05', '2027-03-08 10:05:00-05'), -- posted
  ('00000000-0000-4000-8000-0000000002b3', gen_random_uuid(), '2027-03-07 10:00:00-05', null); -- account gone

select is((select string_agg(id::text, ',' order by id) from private.stale_draft_reservations()),
  '00000000-0000-4000-8000-0000000002b1,00000000-0000-4000-8000-0000000002b3',
  'only never-posted reservations older than 24 h are stale');
select is((select campus_ids::text from private.stale_draft_reservations() where id = '00000000-0000-4000-8000-0000000002b1'),
  '{' || tests.uid('OSU') || '}', 'the folder is under the seller''s campus');
select is((select cardinality(campus_ids) from private.stale_draft_reservations() where id = '00000000-0000-4000-8000-0000000002b3'),
  2, 'without a profile every campus is tried');

-- prune: no Vault config in a fresh database → only the used reservation is forgotten, no call
select is(private.prune(), null::bigint, 'without functions_url prune does not call anything');
select is((select count(*)::int from public.listing_reservations where id = '00000000-0000-4000-8000-0000000001a1'), 0,
  'a used reservation older than 24 h is forgotten');
select is((select count(*)::int from public.listing_reservations), 3, 'orphans stay until their photos are gone');

select vault.create_secret('http://functions.test/functions/v1', 'functions_url');
select vault.create_secret('test-service-key', 'service_role_key');
select isnt(private.prune(), null::bigint, 'with work to do, prune calls cleanup-drafts');

select is(private.forget_reservations(array['00000000-0000-4000-8000-0000000002b1', '00000000-0000-4000-8000-0000000002b2']::uuid[]), 2,
  'forget_reservations drops the given orphans');
select is((select string_agg(id::text, ',' order by id) from public.listing_reservations), '00000000-0000-4000-8000-0000000002b3',
  'others are kept');
select ok(not has_function_privilege('authenticated', 'private.forget_reservations(uuid[])', 'execute'),
  'only the service role may forget reservations');
select is((select schedule from cron.job where jobname = 'prune'), '30 9 * * *', 'the prune job runs daily at 09:30 UTC');

select * from finish();
rollback;
