-- LR-01 (0246, DEC 139): account deletion covers every object the person
-- uploaded, survives a retry, and blocks new media writes while it runs.
--   T-INT-DEL-04 inventory: Quad folders and recorded keys, never someone else's
--   T-INT-DEL-05 evidence by intersection, every key of the report, retry
--   T-INT-DEL-06 manifest generations and the 15-minute sweep
--   T-INT-DEL-07 a new generation is due again; a done row is still swept
--   T-INT-DEL-08 the deletion gate (and 08b: the profile already gone)
--   T-INT-DEL-09 reports withhold the media of a person who is deleting
--   IR-02 two deletions sharing a report never shrink its private set
--   IR-04 a chat is marked archived only if nobody in it is deleting
--   IR-07 chat snapshots withhold by uploader, not by who sent the key
--   RV-01 archive jobs: one writer per chat; a refused archive stays on a
--         durable cleanup list until its object is confirmed gone
--   RV-04 a report after the deletion completed drops the person's keys
--   IR3-01 archive keys are per job token (private.chat_archive_key)
begin;
select plan(73);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01' where id in (tests.uid('A'), tests.uid('B'), tests.uid('C'));
update public.app_config set value = 'true' where key = 'chat_photos_enabled';
select case when exists (select 1 from vault.decrypted_secrets where name = 'media_signing_key')
            then vault.update_secret((select id from vault.decrypted_secrets where name = 'media_signing_key'), 'test-media-key')::text
            else vault.create_secret('test-media-key', 'media_signing_key')::text end;

-- Keys: chat photos of A (sent, and recorded but never sent) and of B.
create function pg_temp.k(name text) returns text language sql immutable as $$
  select case name
    when 'KA'  then 'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_full.webp'
    when 'KAt' then 'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_thumb.webp'
    when 'KU'  then 'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/cccccccc-cccc-4ccc-8ccc-cccccccccccc_full.webp'
    when 'KUt' then 'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/cccccccc-cccc-4ccc-8ccc-cccccccccccc_thumb.webp'
    when 'KB'  then 'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_full.webp'
    when 'KB2' then 'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/dddddddd-dddd-4ddd-8ddd-dddddddddddd_full.webp'
    when 'KL'  then 'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee_full.webp'
    when 'QP'  then 'c/' || tests.uid('OSU') || '/quad/00000000-0000-4000-8000-00000000a9a1/'
    when 'LK'  then 'c/' || tests.uid('OSU') || '/l/00000000-0000-4000-8000-0000000001a1/p1_full.webp'
  end
$$;
create function pg_temp.send(who text, client text, key text) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), format($f$select public.send_message(%L, %L, %L, %L, %L) ->> 'kind'$f$,
    '00000000-0000-4000-8000-0000000000d1', '', client, 'photo', key))
$$;

-- An archive job of this run (RV-01): a fresh token, as claim_chat_archives
-- hands out (the chat's earlier rows are dropped: one live row per chat).
create function pg_temp.job(chat text) returns uuid language sql as $$
  delete from private.chat_archive_jobs where chat_id = chat::uuid;
  insert into private.chat_archive_jobs (chat_id, token, state, lease_until)
  values (chat::uuid, gen_random_uuid(), 'writing', private.now() + interval '30 minutes')
  returning token
$$;

-- A's Quad post with a photo, A's listing with a photo, a chat A-B.
insert into public.quad_posts (id, campus_id, author_id, kind, body, photo_path, status) values
  ('00000000-0000-4000-8000-00000000a9a1', tests.uid('OSU'), tests.uid('A'), 'photo', 'sunset',
   pg_temp.k('QP') || '11111111-1111-4111-8111-111111111111_full.webp', 'live');
insert into public.listings (id, campus_id, seller_id, title, status) values
  ('00000000-0000-4000-8000-0000000001a1', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active');
insert into public.listing_photos (listing_id, idx, path, thumb_path) values
  ('00000000-0000-4000-8000-0000000001a1', 0, pg_temp.k('LK'), replace(pg_temp.k('LK'), '_full', '_thumb'));
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, last_message_at) values
  ('00000000-0000-4000-8000-0000000000d1', tests.uid('A'), tests.uid('B'), 'Mini fridge', 4000, 3800, '2027-03-10 11:00-05');
select tests.register_upload(tests.uid('A'), 'chat', '00000000-0000-4000-8000-0000000000d1', pg_temp.k('KA'));
select tests.register_upload(tests.uid('A'), 'chat', '00000000-0000-4000-8000-0000000000d1', pg_temp.k('KU'));
select tests.register_upload(tests.uid('B'), 'chat', '00000000-0000-4000-8000-0000000000d1', pg_temp.k('KB'));
select tests.register_upload(tests.uid('B'), 'chat', '00000000-0000-4000-8000-0000000000d1', pg_temp.k('KB2'));

-- T-INT-DEL-04 ------------------------------------------------------------------------------------
select is(pg_temp.send('A', '00000000-0000-4000-8000-00000000c101', pg_temp.k('KB')), 'ERROR: FORBIDDEN:upload',
  'T-INT-DEL-04 A cannot send B''s recorded upload');
select is(pg_temp.send('A', '00000000-0000-4000-8000-00000000c102', pg_temp.k('KA')), 'photo', 'A sends their own photo');
select is(pg_temp.send('B', '00000000-0000-4000-8000-00000000c103', pg_temp.k('KB')), 'photo', 'B sends theirs');
select tests.try_text_as(tests.uid('A'), $$select public.send_message('00000000-0000-4000-8000-0000000000d1', 'just text', '00000000-0000-4000-8000-00000000c104') ->> 'kind'$$);

-- A's own report against B holds both chat photos; C reports A's listing (before prepare).
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, evidence) values
  (tests.uid('OSU'), tests.uid('A'), 'chat', '00000000-0000-4000-8000-0000000000d1', tests.uid('B'), 'harassment',
   jsonb_build_object('text', 'x', 'photo_keys', jsonb_build_array(pg_temp.k('KA'), pg_temp.k('KB'))));
select tests.try_text_as(tests.uid('C'), $$select public.create_report('listing', '00000000-0000-4000-8000-0000000001a1', 'stolen') ->> 'id'$$);

-- IR-07: a legacy key A sent first and B resent. The backfill gives it to A,
-- the earliest sender (T-INT-MEDIA-GC-09); the row is inserted as it would.
insert into public.messages (chat_id, sender_id, kind, photo_path) values
  ('00000000-0000-4000-8000-0000000000d1', tests.uid('A'), 'photo', pg_temp.k('KL')),
  ('00000000-0000-4000-8000-0000000000d1', tests.uid('B'), 'photo', pg_temp.k('KL'));
insert into public.media_uploads (key, user_id, kind, target_id, state)
values (pg_temp.k('KL'), tests.uid('A'), 'chat', '00000000-0000-4000-8000-0000000000d1', 'attached');

-- IR-04: a closed chat C-A whose archive is finished before the deletion.
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, status, closed_at) values
  ('00000000-0000-4000-8000-0000000000e1', tests.uid('C'), tests.uid('A'), 'Old lamp', 100, 100, 'closed', '2026-11-01'),
  ('00000000-0000-4000-8000-0000000000e2', tests.uid('B'), tests.uid('C'), 'Old desk', 100, 100, 'closed', '2026-11-01');
select is(private.finish_chat_archive_checked('00000000-0000-4000-8000-0000000000e1', array[tests.uid('C'), tests.uid('A')], pg_temp.job('00000000-0000-4000-8000-0000000000e1')), 'archived',
  'IR-04 nobody in the chat is deleting: it is marked archived');

create temp table p1 as select private.prepare_account_deletion(tests.uid('A')) as r;
create function pg_temp.sorted(a text[]) returns jsonb language sql immutable as $$
  select jsonb_agg(x order by x collate "C") from unnest(a) x
$$;
select is((select r -> 'r2_prefixes' from p1),
  pg_temp.sorted(array['c/' || tests.uid('OSU') || '/u/' || tests.uid('A') || '/',
                       'c/' || tests.uid('OSU') || '/l/00000000-0000-4000-8000-0000000001a1/',
                       'share/00000000-0000-4000-8000-0000000001a1.jpg',
                       pg_temp.k('QP'), pg_temp.k('KA'), pg_temp.k('KAt'), pg_temp.k('KU'), pg_temp.k('KUt'), pg_temp.k('KL')]),
  'T-INT-DEL-04 prefixes: avatar, listing, share, Quad folder, sent and unsent chat keys (full and thumb), A''s legacy key');
select is((select r -> 'archives' from p1),
  jsonb_build_array(private.chat_archive_key('00000000-0000-4000-8000-0000000000e1',
    (select token from private.chat_archive_jobs where chat_id = '00000000-0000-4000-8000-0000000000e1' and state = 'done'))),
  'IR-04 an archive marked before prepare is listed for deletion, under its job''s key');
select ok(not ((select r -> 'r2_prefixes' from p1) ? pg_temp.k('KB')) and not ((select r -> 'r2_prefixes' from p1) ? pg_temp.k('KB2')),
  'T-INT-DEL-04 never B''s keys, though A is in the chat');

-- T-INT-DEL-05 ------------------------------------------------------------------------------------
select is((select jsonb_agg(e ->> 'key' order by e ->> 'key') from p1, jsonb_array_elements(r -> 'evidence') e
           where e ->> 'report_id' = (select id::text from public.reports where reason = 'harassment' and reporter_id = tests.uid('A'))),
  pg_temp.sorted(array[pg_temp.k('KA'), pg_temp.k('KB')]),
  'T-INT-DEL-05 A''s own report holds A''s photo: every key of it is listed');
select ok(exists (select 1 from p1, jsonb_array_elements(r -> 'evidence') e
                  where e ->> 'report_id' = (select id::text from public.reports where reason = 'stolen')
                    and e ->> 'key' = pg_temp.k('LK')),
  'T-INT-DEL-09 a report created before prepare is in the evidence');
select is((select count(*)::int from public.media_uploads where user_id = tests.uid('A')), 0, 'A''s inventory rows are gone');
select is((select count(*)::int from public.media_uploads where user_id = tests.uid('B')), 4, 'B''s are kept');
select is((select pg_temp.sorted(media_prefixes) from public.account_deletions where user_id = tests.uid('A')),
  (select r -> 'r2_prefixes' from p1), 'the manifest holds the merged set');
select is((select media_gen from public.account_deletions where user_id = tests.uid('A')), 1, 'generation 1');

-- T-INT-DEL-08 gate ---------------------------------------------------------------------------------
select throws_ok(format($$select private.authorize_upload(%L, 'avatar', %L, 1)$$, tests.uid('A'), tests.uid('A')),
  'P0001', 'FORBIDDEN:deleting', 'T-INT-DEL-08 authorize_upload refused while A is deleting');
select throws_ok(format($$select private.record_uploads(%L, 'avatar', %L, '[{"key":"c/x/u/a/avatar_1.webp","size":1}]')$$, tests.uid('A'), tests.uid('A')),
  'P0001', 'FORBIDDEN:deleting', 'record_uploads refused');
select throws_ok(format($$select private.claim_upload(%L, 'quad', %L)$$, tests.uid('A'), pg_temp.k('QP') || '11111111-1111-4111-8111-111111111111_full.webp'),
  'P0001', 'FORBIDDEN:deleting', 'claim for a Quad post refused');
select throws_ok(format($$select private.claim_upload(%L, 'listing', %L, false)$$, tests.uid('A'), pg_temp.k('LK')),
  'P0001', 'FORBIDDEN:deleting', 'claim for a listing refused');
select throws_ok(format($$select private.claim_upload(%L, 'chat', %L, false)$$, tests.uid('A'), pg_temp.k('KU')),
  'P0001', 'FORBIDDEN:deleting', 'claim for a chat photo refused');
select is(private.authorize_upload(tests.uid('B'), 'avatar', tests.uid('B'), 1), tests.uid('OSU'), 'B is admitted');
select is(private.record_uploads(tests.uid('B'), 'avatar', tests.uid('B'),
  jsonb_build_array(jsonb_build_object('key', 'c/' || tests.uid('OSU') || '/u/' || tests.uid('B') || '/avatar_1.webp', 'size', 10))),
  1, 'B records an upload');
select lives_ok(format($$select private.claim_upload(%L, 'chat', %L, false)$$, tests.uid('B'), pg_temp.k('KB2')), 'B claims an upload');

-- T-INT-DEL-09 reports after prepare ------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), $$select (public.create_report('listing', '00000000-0000-4000-8000-0000000001a1', 'stolen') ->> 'id') is not null$$),
  'true', 'T-INT-DEL-09 B can still report A''s listing');
select is((select (evidence -> 'photo_keys')::text || '|' || (evidence ->> 'media_withheld') || '|' || (evidence ->> 'text')
           from public.reports where reporter_id = tests.uid('B') and target_type = 'listing'),
  '[]|deleting|Desk lamp', 'no A keys in the snapshot, media withheld, text kept');
select is(tests.try_text_as(tests.uid('B'), $$select (public.create_report('chat', '00000000-0000-4000-8000-0000000000d1', 'harassment') ->> 'id') is not null$$),
  'true', 'B reports the chat');
select is((select evidence -> 'photo_keys' from public.reports where reporter_id = tests.uid('B') and target_type = 'chat'),
  jsonb_build_array(pg_temp.k('KB')), 'a chat snapshot keeps B''s photo and drops A''s');
select ok(not ((select evidence -> 'photo_keys' from public.reports where reporter_id = tests.uid('B') and target_type = 'chat') ? pg_temp.k('KL')),
  'IR-07 A''s legacy key stays withheld although B resent it');

-- IR-04 archives while A is deleting ------------------------------------------------------------------
select is(private.finish_chat_archive_checked('00000000-0000-4000-8000-0000000000d1', array[tests.uid('A'), tests.uid('B')], pg_temp.job('00000000-0000-4000-8000-0000000000d1')), 'withheld',
  'IR-04 a chat with a deleting person is not marked archived');
select is((select (c.archived_at is null)::text || '|' || (select count(*) > 0 from public.messages m where m.chat_id = c.id)::text
           from public.chats c where c.id = '00000000-0000-4000-8000-0000000000d1'),
  'true|true', 'its messages stay for the next run');
select is(private.finish_chat_archive_checked('00000000-0000-4000-8000-0000000000e2', array[tests.uid('B'), tests.uid('C'), tests.uid('A')], pg_temp.job('00000000-0000-4000-8000-0000000000e2')), 'withheld',
  'a JSON naming the deleting person is refused, whoever the chat is between');
select is(private.finish_chat_archive_checked('00000000-0000-4000-8000-0000000000e2', array[tests.uid('B'), tests.uid('C')], pg_temp.job('00000000-0000-4000-8000-0000000000e2')), 'archived',
  'the same chat without them is archived');

-- Retry (T-INT-DEL-05): the evidence copy failed, the person tries again -----------------------------
create temp table p2 as select private.prepare_account_deletion(tests.uid('A')) as r;
select is((select jsonb_agg(e order by e ->> 'report_id', e ->> 'key') from p2, jsonb_array_elements(r -> 'evidence') e
           where e ->> 'report_id' in (select id::text from public.reports where reporter_id is distinct from tests.uid('B'))),
  (select jsonb_agg(e order by e ->> 'report_id', e ->> 'key') from p1, jsonb_array_elements(r -> 'evidence') e),
  'T-INT-DEL-05 a retry selects the same evidence again');
select is((select r -> 'r2_prefixes' from p2), (select r -> 'r2_prefixes' from p1),
  'and returns the same keys, although the inventory rows are gone');
select is((select media_gen from public.account_deletions where user_id = tests.uid('A')), 2, 'generation 2');
select is(private.record_evidence_moves((
    select jsonb_agg(jsonb_build_object('report_id', e ->> 'report_id', 'from', e ->> 'key',
                                        'to', 'evidence/' || (e ->> 'report_id') || '/' || regexp_replace(e ->> 'key', '^.*/', '')))
    from p2, jsonb_array_elements(r -> 'evidence') e
    where e ->> 'report_id' = (select id::text from public.reports where reason = 'harassment' and reporter_id = tests.uid('A')))), 1,
  'the moves are recorded');
select is((select evidence -> 'photo_keys' from public.reports where reason = 'harassment' and reporter_id = tests.uid('A')),
  (select jsonb_agg('evidence/' || id || '/' || f order by 'evidence/' || id || '/' || f)
   from public.reports, unnest(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_full.webp', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_full.webp']) f
   where reason = 'harassment' and reporter_id = tests.uid('A')),
  'the report keeps its complete set, now in the private bucket');

-- T-INT-DEL-06 sweeps ---------------------------------------------------------------------------------
select tests.set_now('2027-03-10 12:30:00-05');
select is(private.media_sweeps_due(), '[]'::jsonb, 'T-INT-DEL-06 an unconfirmed manifest is never due');
select private.confirm_media_deletion(tests.uid('A'));
select is(private.media_sweeps_due(), '[]'::jsonb, 'not within 15 minutes of the confirmation');
select tests.set_now('2027-03-10 12:46:00-05');
select is((select jsonb_agg((e ->> 'gen') || ':' || (e -> 'prefixes')::text) from jsonb_array_elements(private.media_sweeps_due()) e),
  jsonb_build_array('2:' || (select (r -> 'r2_prefixes')::text from p2)), 'due 16 minutes later with generation 2 and its prefixes');
select is(private.finish_media_sweeps(jsonb_build_array(jsonb_build_object(
    'id', (select id from public.account_deletions where user_id = tests.uid('A')), 'gen', 1))), 0,
  'finishing a stale generation changes nothing');
select is(private.finish_media_sweeps(jsonb_build_array(jsonb_build_object(
    'id', (select id from public.account_deletions where user_id = tests.uid('A')), 'gen', 2))), 1,
  'finishing generation 2 completes it');
select is((select coalesce(media_prefixes::text, 'null') || '|' || media_swept_gen from public.account_deletions where user_id = tests.uid('A')),
  'null|2', 'the prefixes are cleared and the generation recorded');

-- T-INT-DEL-07 -----------------------------------------------------------------------------------------
select private.prepare_account_deletion(tests.uid('A'));
select is((select media_gen from public.account_deletions where user_id = tests.uid('A')), 3, 'T-INT-DEL-07 a third attempt is generation 3');
select tests.set_now('2027-03-10 13:10:00-05');
select is(private.media_sweeps_due(), '[]'::jsonb, 'not due before its own confirmation');
select private.confirm_media_deletion(tests.uid('A'));
select tests.set_now('2027-03-10 13:30:00-05');
select is((select jsonb_agg((e ->> 'gen')::int) from jsonb_array_elements(private.media_sweeps_due()) e), '[3]'::jsonb,
  'generation 3 becomes due after its confirmation');
delete from auth.users where id = tests.uid('A');
select is((select jsonb_agg((e ->> 'gen')::int) from jsonb_array_elements(private.media_sweeps_due()) e), '[3]'::jsonb,
  'the done row (no user id) is still swept');
-- RV-04: a report created after A's deletion completed (A is null in the chat
-- now, so nothing is withheld by person) still drops A's keys: they have no
-- inventory row any more.
select is(tests.try_text_as(tests.uid('B'), format($$select (public.create_report('message', %L, 'harassment') ->> 'id') is not null$$,
    (select max(m.id)::text from public.messages m where m.chat_id = '00000000-0000-4000-8000-0000000000d1' and m.photo_path is not null and m.sender_id is null))),
  'true', 'RV-04 B reports A''s last photo message after A''s deletion completed');
select is((select (evidence -> 'photo_keys')::text || '|' || coalesce(evidence ->> 'media_withheld', '-')
           from public.reports where reporter_id = tests.uid('B') and target_type = 'message'),
  jsonb_build_array(pg_temp.k('KB'))::text || '|deleting',
  'RV-04 only B''s photo is kept (none of A''s keys) and the media is marked withheld');
select is(private.finish_chat_archive_checked('00000000-0000-4000-8000-0000000000d1', array[tests.uid('A'), tests.uid('B')], pg_temp.job('00000000-0000-4000-8000-0000000000d1')), 'withheld',
  'IR-04 a JSON read before the deletion (it names A) is refused after it');
select is(private.finish_chat_archive_checked('00000000-0000-4000-8000-0000000000d1', array[tests.uid('B')], pg_temp.job('00000000-0000-4000-8000-0000000000d1')), 'archived',
  'a JSON read after the deletion is archived');

-- T-INT-DEL-08b: admitted before the deletion, registered after the profile is gone ------------------
select is(private.authorize_upload(tests.uid('C'), 'avatar', tests.uid('C'), 1), tests.uid('OSU'), 'T-INT-DEL-08b C is admitted');
select private.prepare_account_deletion(tests.uid('C'));
delete from auth.users where id = tests.uid('C');
select throws_ok(format($$select private.record_uploads(%L, 'avatar', %L, '[{"key":"c/x/u/c/avatar_1.webp","size":1}]')$$, tests.uid('C'), tests.uid('C')),
  'P0001', 'FORBIDDEN:deleting', 'record_uploads refused once the profile is gone');
select is((select count(*)::int from public.media_uploads where user_id = tests.uid('C')), 0, 'and nothing is recorded');

-- IR-02: two deletions prepared the same reports before either moved them --------------------------
insert into public.reports (campus_id, reporter_id, target_type, target_id, reason, details, evidence)
select tests.uid('OSU'), null, 'user', gen_random_uuid()::text, 'harassment', t,
       jsonb_build_object('text', 'x', 'photo_keys', jsonb_build_array(pg_temp.k('KA'), pg_temp.k('KB')))
from unnest(array['ir02-a', 'ir02-b', 'ir02-c']) t;
create function pg_temp.rid(tag text) returns uuid language sql as $$
  select id from public.reports where details = tag
$$;
create function pg_temp.mv(tag text, key text, missing boolean default false) returns jsonb language sql as $$
  select jsonb_build_object('report_id', pg_temp.rid(tag), 'from', key,
                            'to', 'evidence/' || pg_temp.rid(tag) || '/' || regexp_replace(key, '^.*/', ''))
         || case when missing then '{"missing": true}'::jsonb else '{}'::jsonb end
$$;
create function pg_temp.ev(tag text) returns text language sql as $$
  select (select string_agg(regexp_replace(k, '^.*/', ''), ',' order by k) from jsonb_array_elements_text(evidence -> 'photo_keys') k)
         || '|' || (evidence ->> 'photo_bucket')
         || '|' || coalesce((select string_agg(regexp_replace(k, '^.*/', ''), ',' order by k)
                             from jsonb_array_elements_text(evidence -> 'photo_keys_missing') k), '-')
  from public.reports where details = tag
$$;
select is(private.record_evidence_moves(jsonb_build_array(pg_temp.mv('ir02-a', pg_temp.k('KA')), pg_temp.mv('ir02-a', pg_temp.k('KB')))), 1,
  'IR-02 the first deletion moves the whole report');
select is(pg_temp.ev('ir02-a'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_full.webp,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_full.webp|private|-',
  'both keys are private');
select private.record_evidence_moves(jsonb_build_array(pg_temp.mv('ir02-a', pg_temp.k('KA'), true), pg_temp.mv('ir02-a', pg_temp.k('KB'))));
select is(pg_temp.ev('ir02-a'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_full.webp,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_full.webp|private|-',
  'a second, stale deletion whose source is gone cannot shrink the private set');
select is(private.record_evidence_moves(jsonb_build_array(pg_temp.mv('ir02-b', pg_temp.k('KA'), true), pg_temp.mv('ir02-b', pg_temp.k('KB')))), 1,
  'a report whose source is gone with no private copy is still moved');
select is(pg_temp.ev('ir02-b'), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_full.webp|private|aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_full.webp',
  'and the lost key is listed as missing');
select private.record_evidence_moves(jsonb_build_array(pg_temp.mv('ir02-b', pg_temp.k('KA'))));
select is(pg_temp.ev('ir02-b'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_full.webp,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_full.webp|private|-',
  'a later copy of it is merged in and leaves the missing list');
select private.record_evidence_moves(jsonb_build_array(pg_temp.mv('ir02-c', pg_temp.k('KB'))));
select is(pg_temp.ev('ir02-c'), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb_full.webp|private|aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_full.webp',
  'a media key the moves do not mention is listed as missing, not dropped silently');

-- RV-01 archive jobs: one writer per chat, a durable cleanup list ------------------------------------
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, status, closed_at) values
  ('00000000-0000-4000-8000-0000000000e3', tests.uid('B'), tests.uid('OWN'), 'Old chair', 100, 100, 'closed', '2026-11-01');
insert into public.messages (chat_id, sender_id, kind, body) values
  ('00000000-0000-4000-8000-0000000000e3', tests.uid('B'), 'text', 'still there?');
create temp table j1 as select private.claim_chat_archives() as r;
select is((select jsonb_agg((e ->> 'id') || ':' || (e ? 'token')::text || ':' || jsonb_array_length(e -> 'messages')) from j1, jsonb_array_elements(r) e),
  '["00000000-0000-4000-8000-0000000000e3:true:1"]'::jsonb, 'RV-01 the first run claims the chat with a token and its JSON');
select is((select r -> 0 ->> 'key' from j1),
  private.chat_archive_key('00000000-0000-4000-8000-0000000000e3', (select (r -> 0 ->> 'token')::uuid from j1)),
  'IR3-01 and the key of that token');
select is(private.claim_chat_archives(), '[]'::jsonb, 'an overlapping run gets nothing while the lease lives');
select is(private.finish_chat_archive_checked('00000000-0000-4000-8000-0000000000e3', array[tests.uid('B'), tests.uid('OWN')], gen_random_uuid()),
  'lost', 'a token that is not the job''s finishes nothing (and archive-chats leaves the object alone)');
create temp table p3 as select private.prepare_account_deletion(tests.uid('B')) as r;
select ok((select r -> 'archives' from p3) ? (select r -> 0 ->> 'key' from j1),
  'B starts deleting while the first run writes: the archive of the job in flight is listed for deletion');
select is(private.finish_chat_archive_checked('00000000-0000-4000-8000-0000000000e3', array[tests.uid('B'), tests.uid('OWN')],
                                              (select (r -> 0 ->> 'token')::uuid from j1)),
  'withheld', 'the first run is refused after the deletion started');
select is((select (c.archived_at is null)::text || '|' || (select count(*) from public.messages m where m.chat_id = c.id)::text
           from public.chats c where c.id = '00000000-0000-4000-8000-0000000000e3'),
  'true|1', 'the chat is not archived and keeps its messages');
select tests.set_now('2027-03-10 15:00:00-05');
select is(private.claim_chat_archives(), '[]'::jsonb, 'a chat waiting for its cleanup is not claimed again, even after the lease ran out');
select is((select jsonb_agg(e ->> 'key') from jsonb_array_elements(private.archive_cleanups_due()) e),
  (select jsonb_build_array(r -> 0 ->> 'key') from j1),
  'the refused archive stays on the cleanup list (the immediate delete failed and was never confirmed)');
select is(private.finish_archive_cleanups(jsonb_build_array(jsonb_build_object('id', '00000000-0000-4000-8000-0000000000e3', 'token', gen_random_uuid()))),
  0, 'a stale token confirms nothing');
select is(private.finish_archive_cleanups((select jsonb_agg(e - 'key') from jsonb_array_elements(private.archive_cleanups_due()) e)),
  1, 'the sweep confirms the object gone');
select is(private.archive_cleanups_due(), '[]'::jsonb, 'nothing left to clean up');
select is((select jsonb_agg(e ->> 'id') from jsonb_array_elements(private.claim_chat_archives()) e),
  '["00000000-0000-4000-8000-0000000000e3"]'::jsonb, 'only then is the chat claimed again, from the data left after the deletion');
update public.chats set archived_at = null where id = '00000000-0000-4000-8000-0000000000e1';
select is(private.claim_chat_archives(), '[]'::jsonb,
  'a finished job is never handed out again, so a run that read the chat before it was archived cannot rewrite it');

select * from finish();
rollback;
