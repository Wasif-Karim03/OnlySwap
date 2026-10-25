-- DEC 152: automatic photo screening queue (private.photo_scans).
begin;
select plan(12);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, kind, title, status, price_cents) values
  ('00000000-0000-4000-8000-0000000d0001', tests.uid('OSU'), tests.uid('A'), 'sale', 'Lamp', 'active', 1500),
  ('00000000-0000-4000-8000-0000000d0002', tests.uid('OSU'), tests.uid('A'), 'sale', 'Desk', 'active', 4000);
insert into public.listing_photos (listing_id, idx, path, thumb_path, width, height) values
  ('00000000-0000-4000-8000-0000000d0001', 0, 'c/x/l/lamp_full.webp', 'c/x/l/lamp_thumb.webp', 900, 900),
  ('00000000-0000-4000-8000-0000000d0002', 0, 'c/x/l/desk_full.webp', 'c/x/l/desk_thumb.webp', 900, 900);

select is((select count(*)::int from private.photo_scans where kind = 'listing' and status = 'pending'), 2,
  'new listing photos join the queue');
select ok(not has_function_privilege('authenticated', 'private.claim_photo_scans(int)', 'execute'),
  'students cannot claim scans');

select is(jsonb_array_length(private.claim_photo_scans(10)), 2, 'the worker claims both');
select is((select count(*)::int from private.photo_scans where status = 'scanning'), 2, 'claimed rows are scanning');
select is(jsonb_array_length(private.claim_photo_scans(10)), 0, 'a claimed row is not handed out twice');

select private.finish_photo_scan((select id from private.photo_scans where path = 'c/x/l/lamp_full.webp'), 'ok');
select is((select status from public.listings where id = '00000000-0000-4000-8000-0000000d0001')::text, 'active',
  'a clean photo leaves the listing alone');

select private.finish_photo_scan((select id from private.photo_scans where path = 'c/x/l/desk_full.webp'), 'flag', 'sexual');
select is((select status from public.listings where id = '00000000-0000-4000-8000-0000000d0002')::text, 'held_review',
  'a flagged photo holds the listing for review');
select is((select reason || ':' || coalesce(reporter_id::text, 'system') from public.reports
           where target_id = '00000000-0000-4000-8000-0000000d0002'), 'sexual:system',
  'and files a system report for moderators');

-- Retry puts it back in the queue.
insert into public.listing_photos (listing_id, idx, path, thumb_path, width, height)
values ('00000000-0000-4000-8000-0000000d0001', 1, 'c/x/l/lamp2_full.webp', 'c/x/l/lamp2_thumb.webp', 900, 900);
select private.claim_photo_scans(10);
select private.finish_photo_scan((select id from private.photo_scans where path = 'c/x/l/lamp2_full.webp'), 'retry');
select is((select status from private.photo_scans where path = 'c/x/l/lamp2_full.webp'), 'pending',
  'a retry goes back to pending');

-- Profile photo: flagged means removed.
update public.profiles set avatar_path = 'c/x/a/b_full.webp' where id = tests.uid('B');
select is((select count(*)::int from private.photo_scans where kind = 'avatar'), 1, 'a new profile photo is queued');
select private.claim_photo_scans(10);
select private.finish_photo_scan((select id from private.photo_scans where kind = 'avatar'), 'flag', 'hate');
select is((select avatar_path from public.profiles where id = tests.uid('B')), null,
  'a flagged profile photo is removed');

-- Three failed tries end as failed.
update private.photo_scans set status = 'pending', attempts = 3 where path = 'c/x/l/lamp2_full.webp';
select private.claim_photo_scans(10);
select is((select status from private.photo_scans where path = 'c/x/l/lamp2_full.webp'), 'failed',
  'after three tries the photo is left for moderators');

select * from finish();
rollback;
