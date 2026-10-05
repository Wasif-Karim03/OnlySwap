-- S47: R11-ADM-03 Quad moderation (T-INT-ADMIN-03 reveal) and P8-CHAT-04 chat
-- photos behind chat_photos_enabled (R11-PHOTO-GATE), signed reads.
begin;
select plan(20);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01', quad_rules_accepted_at = '2027-02-01'
where campus_id = tests.uid('OSU');
update public.app_config set value = 'true' where key = 'quad_enabled';
update public.campuses set quad_enabled = true where id = tests.uid('OSU');

create function pg_temp.as_admin(who text, q text, amr jsonb default '[]', aal text default 'aal2')
returns text language plpgsql as $$
declare
  res text;
begin
  perform tests.authenticate_as(tests.uid(who), aal);
  perform set_config('request.jwt.claims',
    (current_setting('request.jwt.claims')::jsonb || jsonb_build_object('amr', amr))::text, true);
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;
create function pg_temp.totp_now() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from private.now())))
$$;

insert into public.quad_posts (id, campus_id, author_id, body, status, hold_reason) values
  ('00000000-0000-4000-8000-00000000f001', tests.uid('OSU'), tests.uid('A'), 'rate jake r', 'held', 'names_student'),
  ('00000000-0000-4000-8000-00000000f002', tests.uid('OSU'), tests.uid('A'), 'hot take about parking', 'hidden', 'downvoted'),
  ('00000000-0000-4000-8000-00000000f003', tests.uid('OSU'), tests.uid('B'), 'the union is closed today', 'live', null);
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason) values
  (tests.uid('OSU'), tests.uid('C'), 'quad_post', '00000000-0000-4000-8000-00000000f003', tests.uid('B'), 'spam');

-- Queue -------------------------------------------------------------------------------------------
select is(pg_temp.as_admin('A', $$select public.admin_list_quad()::text$$), 'ERROR: NOT_ADMIN', 'students have no queue');
select is(pg_temp.as_admin('MOD', $$select string_agg(i ->> 'body', ',') from jsonb_array_elements(public.admin_list_quad('{"view":"held"}')) i$$),
  'rate jake r', 'held view');
select is(pg_temp.as_admin('MOD', $$select string_agg(i ->> 'body' || ':' || (i ->> 'open_reports'), ',') from jsonb_array_elements(public.admin_list_quad('{"view":"reported"}')) i$$),
  'the union is closed today:1', 'reported view with its open report count');
select is(pg_temp.as_admin('MOD', format($f$select (public.admin_list_quad('{"view":"hidden"}')::text like '%%%s%%' or public.admin_list_quad('{"view":"hidden"}')::text like '%%author%%')::text$f$, tests.uid('A'))),
  'false', 'the queue never shows who wrote anything');

-- Approve / remove --------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_moderate_quad('post', '00000000-0000-4000-8000-00000000f001', 'approve', 'not about a student')::text$$),
  '', 'a moderator approves a held post');
select is((select status from public.quad_posts where id = '00000000-0000-4000-8000-00000000f001'), 'live', 'it goes live');
select is(pg_temp.as_admin('MOD', $$select public.admin_moderate_quad('post', '00000000-0000-4000-8000-00000000f003', 'remove', 'spam')::text$$),
  '', 'and removes a reported one');
select is((select status::text || '/' || action_taken from public.reports where target_id = '00000000-0000-4000-8000-00000000f003'),
  'actioned/remove_content', 'its open report is resolved');
select is((select count(*)::int from public.audit_log where action like 'quad.%'), 2, 'one audit row per action (T-INT-ADMIN-02)');
select is(pg_temp.as_admin('MOD', $$select public.admin_moderate_quad('post', '00000000-0000-4000-8000-00000000f003', 'approve', 'oops')::text$$),
  'ERROR: INVALID:status', 'removed stays removed');

-- Reveal (T-INT-ADMIN-03) -------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_reveal_quad_author('post', '00000000-0000-4000-8000-00000000f002', 'CASE-1', 'threat report')::text$$, pg_temp.totp_now()),
  'ERROR: NOT_ADMIN', 'moderators cannot reveal');
select is(pg_temp.as_admin('OWN', $$select public.admin_reveal_quad_author('post', '00000000-0000-4000-8000-00000000f002', 'CASE-1', 'threat report')::text$$),
  'ERROR: FORBIDDEN:mfa_required', 'the owner needs a fresh MFA check');
select is(pg_temp.as_admin('OWN', $$select public.admin_reveal_quad_author('post', '00000000-0000-4000-8000-00000000f002', '', 'threat report')::text$$, pg_temp.totp_now()),
  'ERROR: INVALID:case_ref', 'and a case reference');
select is(pg_temp.as_admin('OWN', $$select public.admin_reveal_quad_author('post', '00000000-0000-4000-8000-00000000f002', 'CASE-1', 'threat report') ->> 'user_id'$$, pg_temp.totp_now()),
  tests.uid('A')::text, 'then sees the author');
select is((select count(*)::int from public.email_outbox where template = 'admin_reveal_receipt' and to_email = 'a@osu.edu'), 1,
  'the author gets a receipt email');
select is(
  (select max(r) from (select pg_temp.as_admin('OWN', $$select public.admin_reveal_quad_author('post', '00000000-0000-4000-8000-00000000f002', 'CASE-1', 'threat report') ->> 'user_id'$$, pg_temp.totp_now()) as r
                       from generate_series(1, 5)) x where r like 'ERROR%'),
  'ERROR: RATE_LIMITED:quad_reveal:2027-03-11T00:00:00Z', 'the 6th reveal in a day is refused');

-- Chat photos (P8-CHAT-04) -----------------------------------------------------------------------
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, last_message_at) values
  ('00000000-0000-4000-8000-0000000000d1', tests.uid('B'), tests.uid('A'), 'Mini fridge', 4000, 3800, '2027-03-10 11:00-05');
select is(tests.try_text_as(tests.uid('B'), format('select public.send_message(%L, %L, %L, %L, %L)::text',
    '00000000-0000-4000-8000-0000000000d1', '', '00000000-0000-4000-8000-00000000c101', 'photo',
    'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/33333333-3333-4333-8333-333333333333_full.webp')),
  'ERROR: FEATURE_OFF', 'chat photos are off until the owner turns them on (R11-PHOTO-GATE)');
update public.app_config set value = 'true' where key = 'chat_photos_enabled';
update vault.secrets set secret = 'test-media-key' where name = 'media_signing_key';
select vault.create_secret('test-media-key', 'media_signing_key') where not exists (select 1 from vault.secrets where name = 'media_signing_key');
select is(tests.try_text_as(tests.uid('B'), format('select public.send_message(%L, %L, %L, %L, %L)::text',
    '00000000-0000-4000-8000-0000000000d1', '', '00000000-0000-4000-8000-00000000c102', 'photo', 'c/x/chat/y/z_full.webp')),
  'ERROR: INVALID:photo_path', 'the photo must be in this chat''s folder');
select is(
  tests.try_text_as(tests.uid('B'), format($f$select (r ->> 'kind') || '|' || (r ->> 'photo_url' ~ '^c/.+_full\.webp\?exp=\d+&sig=[0-9a-f]{64}$')::text
    from (select public.send_message(%L, %L, %L, %L, %L) as r) x$f$,
    '00000000-0000-4000-8000-0000000000d1', 'this one?', '00000000-0000-4000-8000-00000000c103', 'photo',
    'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/33333333-3333-4333-8333-333333333333_full.webp')),
  'photo|true', 'a photo message carries a signed, expiring path');
select is(
  concat_ws('|',
    tests.try_text(format('select private.can_upload(%L, %L, %L)::text', tests.uid('B'), 'chat', '00000000-0000-4000-8000-0000000000d1')),
    tests.try_text(format('select private.can_upload(%L, %L, %L)::text', tests.uid('C'), 'chat', '00000000-0000-4000-8000-0000000000d1'))),
  tests.uid('OSU') || '|ERROR: FORBIDDEN', 'only chat participants can upload chat photos');

select * from finish();
rollback;
