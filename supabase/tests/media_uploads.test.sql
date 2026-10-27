-- LR-03 (0246, DEC 139): the upload inventory, quota, claims and lease-based GC.
--   T-INT-MEDIA-GC-01 RLS and privileges
--   T-INT-MEDIA-GC-02 authorize_upload: 60 an hour, 120 a day
--   T-INT-MEDIA-GC-03 record_uploads: quota of 160 objects that are not attached
--   T-INT-MEDIA-GC-04 claim_upload states and ownership
--   T-INT-MEDIA-GC-05 claim_stale_uploads: eligibility, leases, ordering, evidence
--   T-INT-MEDIA-GC-06 ack_collected, tombstones, gc_uploads
--   T-INT-MEDIA-GC-07 posting versus GC; listing photos claimed one by one
--   T-INT-MEDIA-GC-08 news, edits and avatars
--   T-INT-MEDIA-GC-09 archived chats, the legacy backfill, prune
begin;
select plan(74);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01' where id in (tests.uid('A'), tests.uid('B'), tests.uid('C'));

-- A row of `who` in `state`, `age` old.
create function pg_temp.row(who text, key text, state text, age interval default '0',
                            kind text default 'listing') returns void language sql as $$
  insert into public.media_uploads (key, user_id, kind, target_id, state, state_at, created_at)
  values (key, tests.uid(who), kind, gen_random_uuid(), state, private.now() - age, private.now() - age)
$$;
create function pg_temp.state(key text) returns text language sql as $$
  select coalesce((select state from public.media_uploads where media_uploads.key = $1), 'none')
$$;
create function pg_temp.claim(who text, key text, kind text default 'listing') returns text language sql as $$
  select tests.try_text(format('select private.claim_upload(%L, %L, %L, false)::text', tests.uid(who), kind, key))
$$;
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
create function pg_temp.lkey(lid uuid, name text) returns text language sql as $$
  select 'c/' || tests.uid('OSU') || '/l/' || lid || '/' || name || '.webp'
$$;
create function pg_temp.photos(lid uuid, variadic names text[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('path', pg_temp.lkey(lid, n || '_full'), 'thumb_path', pg_temp.lkey(lid, n || '_thumb')))
  from unnest(names) n
$$;
create function pg_temp.post(who text, lid uuid, photos jsonb) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), format(
    $f$select public.create_listing(id := %L, title := 'Desk lamp', category_id := 1::smallint, price_cents := 1200, photos := %L::jsonb) ->> 'status'$f$,
    lid, photos))
$$;

-- T-INT-MEDIA-GC-01 -------------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.media_uploads'::regclass), 'T-INT-MEDIA-GC-01 RLS is on');
select ok(not has_table_privilege('authenticated', 'public.media_uploads', 'select')
          and not has_table_privilege('anon', 'public.media_uploads', 'select')
          and not has_table_privilege('authenticated', 'public.media_uploads', 'insert'), 'no API access to the table');
select ok(not has_function_privilege('authenticated', 'private.record_uploads(uuid, text, uuid, jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'private.claim_upload(uuid, text, text, boolean)', 'execute')
          and not has_function_privilege('authenticated', 'private.claim_stale_uploads(int)', 'execute'), 'users cannot call the helpers');
select ok(has_function_privilege('service_role', 'private.authorize_upload(uuid, text, uuid, int)', 'execute')
          and has_function_privilege('service_role', 'private.record_uploads(uuid, text, uuid, jsonb)', 'execute')
          and has_function_privilege('service_role', 'private.ack_collected(jsonb)', 'execute'), 'the Edge Functions can');
select is((select schedule from cron.job where jobname = 'gc_uploads'), '20 */6 * * *', 'gc_uploads runs every 6 hours');

-- T-INT-MEDIA-GC-02 -------------------------------------------------------------------------------
select tests.set_now('2027-03-10 01:05:00+00');
select is((select count(*)::int from generate_series(1, 60) g
           where private.authorize_upload(tests.uid('A'), 'avatar', tests.uid('A'), 2) = tests.uid('OSU')), 60, 'T-INT-MEDIA-GC-02 60 requests in an hour pass');
select throws_like(format($$select private.authorize_upload(%L, 'avatar', %L, 2)$$, tests.uid('A'), tests.uid('A')),
  'RATE_LIMITED:upload:%', 'the 61st in the hour is limited');
select tests.set_now('2027-03-10 02:05:00+00');
select is((select count(private.authorize_upload(tests.uid('A'), 'avatar', tests.uid('A'), 2))::int from generate_series(1, 60) g),
  60, 'the next hour passes again (120 today)');
select tests.set_now('2027-03-10 03:05:00+00');
select throws_like(format($$select private.authorize_upload(%L, 'avatar', %L, 2)$$, tests.uid('A'), tests.uid('A')),
  'RATE_LIMITED:upload_day:%', 'the 121st in a day is limited');
select throws_ok(format($$select private.authorize_upload(%L, 'avatar', %L, 17)$$, tests.uid('B'), tests.uid('B')),
  'P0001', 'INVALID:files', 'more than 16 files is invalid');
select throws_ok(format($$select private.authorize_upload(%L, 'avatar', %L, 1)$$, tests.uid('B'), tests.uid('A')),
  'P0001', 'FORBIDDEN', 'can_upload still checks the target');
select tests.set_now('2027-03-10 12:00:00-05');

-- T-INT-MEDIA-GC-03 -------------------------------------------------------------------------------
create function pg_temp.batch(prefix text, n int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('key', prefix || g, 'size', 100)) from generate_series(1, n) g
$$;
select is(private.record_uploads(tests.uid('B'), 'listing', tests.uid('B'), pg_temp.batch('b/', 2)), 2,
  'T-INT-MEDIA-GC-03 two keys recorded');
select is(private.record_uploads(tests.uid('B'), 'listing', tests.uid('B'), pg_temp.batch('b/', 2)), 0, 'recording them again adds nothing');
select is((select string_agg(state || ':' || size_bytes || ':' || kind, ',') from public.media_uploads where user_id = tests.uid('B')),
  'pending:100:listing,pending:100:listing', 'as pending rows with their size');
select throws_ok(format($$select private.record_uploads(%L, 'share', %L, '[{"key":"share/x.jpg","size":1}]')$$, tests.uid('B'), tests.uid('B')),
  'P0001', 'INVALID:kind', 'share cards are not recorded');
select pg_temp.row('C', 'q/' || g, 'pending', interval '1 hour') from generate_series(1, 150) g;
select throws_ok(format($$select private.record_uploads(%L, 'listing', %L, %L)$$, tests.uid('C'), tests.uid('C'), pg_temp.batch('n/', 16)),
  'P0001', 'RATE_LIMITED:upload_pending:' || to_char((private.now() - interval '1 hour' + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  '150 + 16 is over the quota, retry when the oldest is collectable');
select is((select count(*)::int from public.media_uploads where key like 'n/%'), 0, 'nothing of the batch is recorded');
delete from public.media_uploads where key in ('q/1', 'q/2', 'q/3', 'q/4', 'q/5', 'q/6');
select is(private.record_uploads(tests.uid('C'), 'listing', tests.uid('C'), pg_temp.batch('n/', 16)), 16, '144 + 16 fits');
update public.media_uploads set state = 'collecting' where key in (select 'q/' || g from generate_series(7, 16) g);
select throws_like(format($$select private.record_uploads(%L, 'listing', %L, '[{"key":"m/1","size":1}]')$$, tests.uid('C'), tests.uid('C')),
  'RATE_LIMITED:upload_pending:%', 'collecting rows count toward the quota');
update public.media_uploads set state = 'collected' where state = 'collecting';
update public.media_uploads set state = 'attached' where key like 'n/%';
select is(private.record_uploads(tests.uid('C'), 'listing', tests.uid('C'), pg_temp.batch('m/', 26)), 26,
  'collected and attached rows do not');
delete from public.media_uploads where user_id = tests.uid('C');

-- T-INT-MEDIA-GC-04 -------------------------------------------------------------------------------
select pg_temp.row('A', 's/pending', 'pending');
select pg_temp.row('A', 's/attached', 'attached');
select pg_temp.row('A', 's/detached', 'detached');
select pg_temp.row('A', 's/collecting', 'collecting');
select pg_temp.row('A', 's/collected', 'collected');
select pg_temp.row('B', 's/other', 'pending');
select pg_temp.row('A', 's/avatar', 'pending', '0', 'avatar');
select pg_temp.row('A', 's/x_full.webp', 'pending');
select is(pg_temp.claim('A', 's/pending') || pg_temp.claim('A', 's/attached') || pg_temp.claim('A', 's/detached'), '',
  'T-INT-MEDIA-GC-04 pending, attached and detached keys can be attached');
select is(pg_temp.state('s/pending') || pg_temp.state('s/detached'), 'attachedattached', 'and are attached');
select is(pg_temp.claim('A', 's/collecting'), 'ERROR: UPLOAD_EXPIRED', 'a key being collected has expired');
select is(pg_temp.claim('A', 's/collected'), 'ERROR: UPLOAD_EXPIRED', 'a collected key has expired');
select is(pg_temp.claim('A', 's/none'), 'ERROR: FORBIDDEN:upload', 'a key without a row is refused');
select is(pg_temp.claim('A', 's/other'), 'ERROR: FORBIDDEN:upload', 'someone else''s key is refused');
select is(pg_temp.claim('A', 's/avatar'), 'ERROR: FORBIDDEN:upload', 'a key recorded for another kind is refused');
select is(tests.try_text(format('select private.claim_upload(%L, %L, %L)::text', tests.uid('A'), 'listing', 's/x_full.webp')),
  'ERROR: FORBIDDEN:upload', 'by default the _thumb.webp sibling must be recorded too');
delete from public.media_uploads where key like 's/%';

-- T-INT-MEDIA-GC-05 -------------------------------------------------------------------------------
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, evidence) values
  (tests.uid('OSU'), tests.uid('B'), 'user', tests.uid('A')::text, tests.uid('A'), 'scam',
   jsonb_build_object('photo_keys', jsonb_build_array('g/evidence_full.webp')));
select pg_temp.row('A', 'g/p_old', 'pending', interval '25 hours');
select pg_temp.row('A', 'g/p_new', 'pending', interval '1 hour');
select pg_temp.row('A', 'g/d_old', 'detached', interval '26 hours');
select pg_temp.row('A', 'g/a_old', 'attached', interval '40 hours');
select pg_temp.row('A', 'g/evidence_full.webp', 'pending', interval '30 hours');
select pg_temp.row('A', 'g/evidence_thumb.webp', 'pending', interval '30 hours');
select pg_temp.row('A', 'g/r_old', 'collecting', interval '50 hours');
update public.media_uploads set attempts = 1, lease_token = gen_random_uuid(), lease_until = private.now() - interval '1 minute' where key = 'g/r_old';
select pg_temp.row('A', 'g/l_live', 'collecting', interval '50 hours');
update public.media_uploads set attempts = 1, lease_token = gen_random_uuid(), lease_until = private.now() + interval '5 minutes' where key = 'g/l_live';

create temp table c1 as select * from private.claim_stale_uploads(2);
select is((select string_agg(key, ',' order by key) from c1), 'g/d_old,g/p_old',
  'T-INT-MEDIA-GC-05 fresh stale keys first; a reclaim (attempts 1) waits behind them');
select is((select string_agg(state || ':' || attempts || ':' || (lease_until = private.now() + interval '10 minutes') || ':' || (lease_token = c1.token), ',' order by u.key)
           from public.media_uploads u join c1 on c1.key = u.key),
  'collecting:1:true:true,collecting:1:true:true', 'claimed under a 10-minute lease with its token');
create temp table c2 as select * from private.claim_stale_uploads(50);
select is((select string_agg(key, ',' order by key) from c2), 'g/r_old',
  'an expired lease is reclaimed; live leases, recent, attached and evidence keys are not');
select is((select attempts from public.media_uploads where key = 'g/r_old'), 2, 'with attempts + 1');
select tests.set_now('2027-03-10 12:11:00-05');
create temp table c3 as select * from private.claim_stale_uploads(50);
select is((select string_agg(key, ',' order by key) from c3), 'g/d_old,g/l_live,g/p_old,g/r_old',
  'after 11 minutes every lease has run out and is reclaimed');

-- T-INT-MEDIA-GC-06 -------------------------------------------------------------------------------
select is(private.ack_collected((select jsonb_agg(jsonb_build_object('key', key, 'token', token)) from c1)), 0,
  'T-INT-MEDIA-GC-06 an ack with a stale token changes nothing');
select is(pg_temp.state('g/p_old'), 'collecting', 'the key is still collecting');
select is(private.ack_collected((select jsonb_agg(jsonb_build_object('key', key, 'token', token)) from c3 where key = 'g/p_old')), 1,
  'the live token marks it collected');
select is((select state || ':' || coalesce(lease_token::text, 'null') from public.media_uploads where key = 'g/p_old'), 'collected:null',
  'collected, lease cleared');
select is(pg_temp.claim('A', 'g/p_old'), 'ERROR: UPLOAD_EXPIRED', 'a tombstone cannot be attached');
select is((select count(*)::int from private.claim_stale_uploads(50) where key = 'g/p_old'), 0, 'and is never claimed again');
select tests.set_now('2027-04-12 12:00:00-05');
select private.gc_uploads();
select is(pg_temp.state('g/p_old'), 'none', 'gc_uploads prunes tombstones after 30 days');
select is(pg_temp.claim('A', 'g/p_old'), 'ERROR: FORBIDDEN:upload', 'after which the key is refused outright');
select vault.create_secret('http://functions.test/functions/v1', 'functions_url');
select vault.create_secret('test-service-key', 'service_role_key');
select isnt(private.gc_uploads(), null::bigint, 'with collectable keys gc_uploads calls cleanup-drafts');
delete from public.media_uploads where key not like 'g/evidence%';
select is(private.gc_uploads(), null::bigint, 'idle (only evidence keys left): no call');
insert into private.chat_archive_jobs (chat_id, token, state, lease_until)
values (gen_random_uuid(), gen_random_uuid(), 'cleanup', private.now());
select isnt(private.gc_uploads(), null::bigint, 'RV-01 a refused chat archive waiting for cleanup also calls cleanup-drafts');
delete from private.chat_archive_jobs;
delete from public.media_uploads;
delete from public.reports;
select tests.set_now('2027-03-10 12:00:00-05');

-- T-INT-MEDIA-GC-07 -------------------------------------------------------------------------------
create temp table ids (name text primary key, id uuid);
insert into ids values ('race1', pg_temp.reserve('A')), ('race2', pg_temp.reserve('A')), ('mix', pg_temp.reserve('A')), ('edit', pg_temp.reserve('A'));
select tests.register_upload(tests.uid('A'), 'listing', id, pg_temp.lkey(id, 'p1_full')) from ids where name in ('race1', 'race2', 'edit');
update public.media_uploads set state_at = private.now() - interval '25 hours'
 where target_id in (select id from ids where name in ('race1', 'race2'));
select is((select count(*)::int from private.claim_stale_uploads(50)), 4, 'T-INT-MEDIA-GC-07 GC claims two abandoned drafts');
update public.media_uploads set state = 'pending', lease_token = null, lease_until = null
 where target_id = (select id from ids where name = 'race2');
select is(pg_temp.post('A', (select id from ids where name = 'race1'), pg_temp.photos((select id from ids where name = 'race1'), 'p1')),
  'ERROR: UPLOAD_EXPIRED', 'posting after the GC claimed the photo: UPLOAD_EXPIRED, no lost photo');
select is(pg_temp.post('A', (select id from ids where name = 'race2'), pg_temp.photos((select id from ids where name = 'race2'), 'p1')),
  'active', 'posting first wins');
select is((select string_agg(state, ',') from public.media_uploads where target_id = (select id from ids where name = 'race2')),
  'attached,attached', 'its photo and thumbnail are attached');
select tests.set_now('2027-03-11 13:00:00-05');
select is((select count(*)::int from public.media_uploads u where u.target_id = (select id from ids where name = 'race2')
           and private.media_upload_collectable(u.key, u.state, u.state_at, u.lease_until)), 0,
  'and the GC never claims them');
select tests.set_now('2027-03-10 12:00:00-05');
-- R3-04: path and thumb_path are checked one by one.
select tests.register_upload(tests.uid('A'), 'listing', (select id from ids where name = 'mix'), pg_temp.lkey((select id from ids where name = 'mix'), 'x_full'));
select tests.register_upload(tests.uid('A'), 'listing', (select id from ids where name = 'mix'), pg_temp.lkey((select id from ids where name = 'mix'), 'y_full'));
select tests.register_upload(tests.uid('B'), 'listing', (select id from ids where name = 'mix'), pg_temp.lkey((select id from ids where name = 'mix'), 'b_full'));
delete from public.media_uploads where key = pg_temp.lkey((select id from ids where name = 'mix'), 'b_thumb');
select is(pg_temp.post('A', (select id from ids where name = 'mix'), jsonb_build_array(jsonb_build_object(
    'path', pg_temp.lkey((select id from ids where name = 'mix'), 'x_full'),
    'thumb_path', pg_temp.lkey((select id from ids where name = 'mix'), 'b_thumb')))),
  'ERROR: FORBIDDEN:upload', 'R3-04 a thumbnail without a recorded upload is refused');
select is(pg_temp.post('A', (select id from ids where name = 'mix'), jsonb_build_array(jsonb_build_object(
    'path', pg_temp.lkey((select id from ids where name = 'mix'), 'x_full'),
    'thumb_path', pg_temp.lkey((select id from ids where name = 'mix'), 'y_thumb')))),
  'active', 'a recorded mismatched pair is accepted');
select is((select string_agg(regexp_replace(key, '^.*/', '') || '=' || state, ',' order by key) from public.media_uploads
           where user_id = tests.uid('A') and target_id = (select id from ids where name = 'mix')),
  'x_full.webp=attached,x_thumb.webp=pending,y_full.webp=pending,y_thumb.webp=attached', 'exactly the two keys used are attached');

-- T-INT-MEDIA-GC-08 -------------------------------------------------------------------------------
select is(pg_temp.post('A', (select id from ids where name = 'edit'), pg_temp.photos((select id from ids where name = 'edit'), 'p1')),
  'active', 'T-INT-MEDIA-GC-08 a listing with one photo');
select tests.register_upload(tests.uid('A'), 'listing', (select id from ids where name = 'edit'), pg_temp.lkey((select id from ids where name = 'edit'), 'p2_full'));
select is(tests.try_text_as(tests.uid('A'), format($$select jsonb_array_length(public.update_listing(id := %L, photos := %L::jsonb) -> 'photos')::text$$,
    (select id from ids where name = 'edit'), pg_temp.photos((select id from ids where name = 'edit'), 'p2'))),
  '1', 'the edit swaps the photo');
select is((select string_agg(regexp_replace(key, '^.*/', '') || '=' || state, ',' order by key) from public.media_uploads
           where target_id = (select id from ids where name = 'edit')),
  'p1_full.webp=detached,p1_thumb.webp=detached,p2_full.webp=attached,p2_thumb.webp=attached', 'update_listing detaches the dropped keys');
select is(tests.try_text_as(tests.uid('A'), format($$select jsonb_array_length(public.update_listing(id := %L, photos := %L::jsonb) -> 'photos')::text$$,
    (select id from ids where name = 'edit'), pg_temp.photos((select id from ids where name = 'edit'), 'p2'))),
  '1', 'saving the same photos again needs no new claim');

insert into ids values ('news', pg_temp.reserve('B'));
select tests.register_upload(tests.uid('B'), 'listing', (select id from ids where name = 'news'), pg_temp.lkey((select id from ids where name = 'news'), 'n1_full'));
select is(tests.try_text_as(tests.uid('B'), format($$select public.create_news(id := %L, title := 'Club fair Friday', photos := %L::jsonb) ->> 'id'$$,
    (select id from ids where name = 'news'), pg_temp.photos((select id from ids where name = 'news'), 'n1'))),
  (select id::text from ids where name = 'news'), 'create_news with a photo');
select tests.set_now('2027-03-11 13:00:00-05');
select is((select count(*)::int from public.media_uploads u where u.target_id = (select id from ids where name = 'news')
           and private.media_upload_collectable(u.key, u.state, u.state_at, u.lease_until)), 0,
  'R2-01 news photos are attached and never collected');
select tests.set_now('2027-03-10 12:00:00-05');

select tests.register_upload(tests.uid('C'), 'avatar', tests.uid('C'), 'c/' || tests.uid('OSU') || '/u/' || tests.uid('C') || '/avatar_1.webp');
select tests.register_upload(tests.uid('C'), 'avatar', tests.uid('C'), 'c/' || tests.uid('OSU') || '/u/' || tests.uid('C') || '/avatar_2.webp');
select is(tests.try_text_as(tests.uid('C'), format($$select public.update_profile('Cam', null, null, '{}', null, %L) ->> 'avatar_path'$$,
    'c/' || tests.uid('OSU') || '/u/' || tests.uid('C') || '/avatar_1.webp')),
  'c/' || tests.uid('OSU') || '/u/' || tests.uid('C') || '/avatar_1.webp', 'an avatar is set');
select is(tests.try_text_as(tests.uid('C'), format($$select public.update_profile('Cam', null, null, '{}', null, %L) ->> 'avatar_path'$$,
    'c/' || tests.uid('OSU') || '/u/' || tests.uid('C') || '/avatar_2.webp')),
  'c/' || tests.uid('OSU') || '/u/' || tests.uid('C') || '/avatar_2.webp', 'and replaced');
select is((select string_agg(regexp_replace(key, '^.*/', '') || '=' || state, ',' order by key) from public.media_uploads where user_id = tests.uid('C')),
  'avatar_1.webp=detached,avatar_2.webp=attached', 'update_profile detaches the old avatar');
-- IR-01: a save from a screen still showing avatar_1 (P -> Q, then a stale P).
select is(tests.try_text_as(tests.uid('C'), format($$select public.update_profile('Cam', null, null, '{}', null, %L) ->> 'avatar_path'$$,
    'c/' || tests.uid('OSU') || '/u/' || tests.uid('C') || '/avatar_1.webp')),
  'c/' || tests.uid('OSU') || '/u/' || tests.uid('C') || '/avatar_1.webp', 'IR-01 a stale save restoring the old avatar is accepted');
select is((select string_agg(regexp_replace(key, '^.*/', '') || '=' || state, ',' order by key) from public.media_uploads where user_id = tests.uid('C')),
  'avatar_1.webp=attached,avatar_2.webp=detached', 'it claims the restored avatar again and detaches the replaced one');
select tests.set_now('2027-03-11 13:00:00-05');
select is((select count(*)::int from public.media_uploads u where u.key = 'c/' || tests.uid('OSU') || '/u/' || tests.uid('C') || '/avatar_1.webp'
           and private.media_upload_collectable(u.key, u.state, u.state_at, u.lease_until)), 0,
  'so the GC never collects the current avatar');
select tests.set_now('2027-03-10 12:00:00-05');
select ok((select position('pg_advisory_xact_lock(hashtext(''media:''' in p.prosrc) between 1 and position('into cur_avatar' in p.prosrc)
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'update_profile'),
  'update_profile reads the current avatar only after taking the media lock');
select is(tests.try_text_as(tests.uid('C'), format($$select public.update_profile('Cam', null, null, '{}', null, %L) ->> 'avatar_path'$$,
    'c/' || tests.uid('OSU') || '/u/' || tests.uid('B') || '/avatar_9.webp')),
  'ERROR: INVALID:avatar_path', 'someone else''s folder is still refused first');

-- T-INT-MEDIA-GC-09 -------------------------------------------------------------------------------
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, status, closed_at) values
  ('00000000-0000-4000-8000-0000000000aa', tests.uid('B'), tests.uid('A'), 'Old lamp', 100, 100, 'closed', '2026-11-01');
insert into public.messages (chat_id, sender_id, kind, body, photo_path) values
  ('00000000-0000-4000-8000-0000000000aa', tests.uid('A'), 'photo', null, 'c/osu/chat/aa/k_full.webp');
insert into public.media_uploads (key, user_id, kind, target_id, state, state_at)
values ('c/osu/chat/aa/k_full.webp', tests.uid('A'), 'chat', '00000000-0000-4000-8000-0000000000aa', 'attached', '2026-10-01');
select private.finish_chat_archive('00000000-0000-4000-8000-0000000000aa');
select is((select count(*)::int from private.claim_stale_uploads(50) where key = 'c/osu/chat/aa/k_full.webp'), 0,
  'T-INT-MEDIA-GC-09 an archived chat''s photo stays attached and unclaimable');

insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents) values
  ('00000000-0000-4000-8000-0000000000ab', tests.uid('B'), tests.uid('A'), 'Desk', 100, 100);
insert into public.messages (chat_id, sender_id, kind, photo_path) values
  ('00000000-0000-4000-8000-0000000000ab', tests.uid('A'), 'photo', 'c/osu/chat/ab/first_full.webp'),
  ('00000000-0000-4000-8000-0000000000ab', tests.uid('B'), 'photo', 'c/osu/chat/ab/first_full.webp'),
  ('00000000-0000-4000-8000-0000000000ab', null, 'photo', 'c/osu/chat/ab/orphan_full.webp'),
  ('00000000-0000-4000-8000-0000000000ab', tests.uid('B'), 'photo', 'c/osu/chat/ab/orphan_full.webp');
select lives_ok('select private.inventory_legacy_media()', 'the legacy backfill runs');
select is((select user_id || ':' || state from public.media_uploads where key = 'c/osu/chat/ab/first_full.webp'),
  tests.uid('A') || ':attached', 'a key sent by A then B belongs to A, the earliest sender');
select is(pg_temp.state('c/osu/chat/ab/orphan_full.webp'), 'none', 'a key whose earliest sender is gone gets no row');
select lives_ok('select private.inventory_legacy_media()', 'and it is idempotent');

insert into public.listing_reservations (id, user_id, created_at, used_at) values
  ('00000000-0000-4000-8000-0000000002b1', tests.uid('A'), '2027-03-08 10:00:00-05', null),
  ('00000000-0000-4000-8000-0000000002b2', tests.uid('A'), '2027-03-10 09:00:00-05', null);
update public.listing_reservations set created_at = private.now() - interval '1 hour'
 where id in (select id from ids where name in ('race2', 'edit'));
select is(private.prune(), null::bigint, 'prune calls nothing');
select is((select count(*)::int from public.listing_reservations where id in ('00000000-0000-4000-8000-0000000002b1', '00000000-0000-4000-8000-0000000002b2')),
  1, 'prune retires orphan reservations older than 24 h and keeps recent ones');
select is((select count(*)::int from public.listing_reservations where id in (select id from ids where name in ('race2', 'edit'))), 2,
  'and keeps used ones under 24 h');

select * from finish();
rollback;
