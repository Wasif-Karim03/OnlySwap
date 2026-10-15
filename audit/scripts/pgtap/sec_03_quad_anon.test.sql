-- Quad anonymity: no author id or name in any student-visible response; reveal is owner-only and audited.
-- AUDIT (read-only on app code). LOCAL DB only. Runs inside begin..rollback.
-- Run: pnpm -s supabase test db $(pwd)/audit/scripts/pgtap/sec_03_quad_anon.test.sql   (or pg_prove -h 127.0.0.1 -p 54322 -U postgres -d postgres)
begin;
select * from no_plan();
-- (shared world; pasted into each sec_*.test.sql by build.sh)
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01' where campus_id in (tests.uid('OSU'), tests.uid('UMICH'));
-- UMICH goes live with an active user D, so "other campus" is a real campus
update public.campuses set status = 'live', quad_enabled = true where id in (tests.uid('UMICH'), tests.uid('OSU'));
update public.profiles set status = 'active' where id = tests.uid('D');
update public.app_config set value = 'true' where key = 'quad_enabled';
-- S: suspended OSU student; Z: banned OSU student
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000f1', 's@osu.edu'), ('00000000-0000-4000-8000-0000000000f2', 'z@osu.edu');
insert into public.profiles (id, campus_id, email_hash, status, first_name, last_initial, verified_until,
  adult_confirmed_at, age_method, rules_accepted_at, rules_version)
select u, tests.uid('OSU'), 'fixture-' || u::text, st, nm, 'S', current_date + 365, now(), 'self_declared', now(),
  (select value #>> '{}' from public.app_config where key = 'rules_version')
from (values ('00000000-0000-4000-8000-0000000000f1'::uuid, 'suspended'::public.user_status, 'Sue'),
             ('00000000-0000-4000-8000-0000000000f2'::uuid, 'banned'::public.user_status, 'Zed')) v(u, st, nm)
on conflict (id) do update set campus_id = excluded.campus_id, status = excluded.status, first_name = excluded.first_name,
  last_initial = excluded.last_initial, verified_until = excluded.verified_until, adult_confirmed_at = excluded.adult_confirmed_at,
  age_method = excluded.age_method, rules_accepted_at = excluded.rules_accepted_at, rules_version = excluded.rules_version,
  email_hash = excluded.email_hash;

-- A's stuff (A is the victim; B is a counterparty; C is blocked by A; D is another campus)
insert into public.listings (id, campus_id, seller_id, title, description, status, price_cents) values
  ('00000000-0000-4000-8000-00000000aa01', tests.uid('OSU'), tests.uid('A'), 'LIVE-LISTING', 'd', 'active', 1000),
  ('00000000-0000-4000-8000-00000000aa02', tests.uid('OSU'), tests.uid('A'), 'HELD-LISTING', 'd', 'held_review', 1000),
  ('00000000-0000-4000-8000-00000000aa03', tests.uid('OSU'), tests.uid('A'), 'REMOVED-LISTING', 'd', 'removed', 1000),
  ('00000000-0000-4000-8000-00000000aa04', tests.uid('OSU'), tests.uid('A'), 'DELETED-LISTING', 'd', 'deleted', 1000),
  ('00000000-0000-4000-8000-00000000aa05', tests.uid('UMICH'), tests.uid('D'), 'UMICH-LISTING', 'd', 'active', 1000);
insert into public.listing_removals (listing_id, reason, removed_by) values
  ('00000000-0000-4000-8000-00000000aa03', 'SECRET-REMOVAL-REASON', tests.uid('MOD'));
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, status) values
  ('00000000-0000-4000-8000-00000000bb01', '00000000-0000-4000-8000-00000000aa01', tests.uid('B'), tests.uid('A'), 800, 'pending');
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, last_message_at) values
  ('00000000-0000-4000-8000-00000000cc01', tests.uid('B'), tests.uid('A'), 'Mini fridge', 4000, 3800, '2027-03-10 11:00-05');
insert into public.messages (chat_id, sender_id, kind, body, client_id) values
  ('00000000-0000-4000-8000-00000000cc01', tests.uid('B'), 'text', 'SECRET-MESSAGE-BODY', '00000000-0000-4000-8000-00000000dd01');
insert into public.meetups (id, chat_id, custom_place, starts_at, status, proposed_by) values
  ('00000000-0000-4000-8000-00000000ee01', '00000000-0000-4000-8000-00000000cc01', 'Library steps', '2027-03-11 15:00-05', 'proposed', tests.uid('B'));
insert into public.reports (id, campus_id, reporter_id, target_type, target_id, target_user_id, reason, details) values
  ('00000000-0000-4000-8000-00000000ff01', tests.uid('OSU'), tests.uid('B'), 'listing', '00000000-0000-4000-8000-00000000aa01', tests.uid('A'), 'scam', 'SECRET-REPORT-DETAILS');
insert into public.notifications (user_id, type, grp, title, body) values
  (tests.uid('A'), 'offer_new', 'selling', 'SECRET-NOTE-TITLE', 'body');
insert into public.saved_searches (id, user_id, campus_id, query) values
  ('00000000-0000-4000-8000-00000000a501', tests.uid('A'), tests.uid('OSU'), 'secret-query');
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('A'), tests.uid('C'));
-- Quad: A posts a live, a held and a removed post; a reply
insert into public.quad_posts (id, campus_id, author_id, body, status, hold_reason) values
  ('00000000-0000-4000-8000-00000000a001', tests.uid('OSU'), tests.uid('A'), 'QUAD-LIVE', 'live', null),
  ('00000000-0000-4000-8000-00000000a002', tests.uid('OSU'), tests.uid('A'), 'QUAD-HELD', 'held', 'pii:phone'),
  ('00000000-0000-4000-8000-00000000a003', tests.uid('OSU'), tests.uid('A'), 'QUAD-REMOVED', 'removed', null);
insert into public.quad_replies (id, post_id, author_id, body, alias_no, status) values
  ('00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a001', tests.uid('A'), 'QUAD-REPLY', 0, 'live');

create function pg_temp.as(who text, q text) returns text language sql as $$
  select tests.try_text_as(case when who = 'E' then '00000000-0000-4000-8000-0000000000f3'::uuid else tests.uid(who) end, q)
$$;
create function pg_temp.as_uuid(who uuid, q text) returns text language sql as $$
  select tests.try_text_as(who, q)
$$;
create function pg_temp.anon(q text) returns text language plpgsql as $$
declare res text;
begin
  perform tests.clear_authentication();
  begin execute q into res; exception when others then res := 'ERROR: ' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);
  return res;
end; $$;
create function pg_temp.admin(who text, q text) returns text language plpgsql as $$
declare res text;
begin
  perform tests.authenticate_as(tests.uid(who), 'aal2');
  begin execute q into res; exception when others then res := 'ERROR: ' || sqlerrm; end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);
  return res;
end; $$;
create function pg_temp.lk(a text, pat text, d text) returns text language sql as $$ select alike(a, pat, d) $$;
create function pg_temp.ulk(a text, pat text, d text) returns text language sql as $$ select unalike(a, pat, d) $$;
-- E: a clean same-campus intruder with no relation to A (no block, no chat, no offer)
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f3', 'e@osu.edu');
insert into public.profiles (id, campus_id, email_hash, status, first_name, last_initial, verified_until,
  adult_confirmed_at, age_method, rules_accepted_at, rules_version)
values ('00000000-0000-4000-8000-0000000000f3', tests.uid('OSU'), 'fixture-e', 'active', 'Eve', 'E', current_date + 365, now(), 'self_declared', now(),
  (select value #>> '{}' from public.app_config where key = 'rules_version'))
on conflict (id) do update set campus_id = excluded.campus_id, status = excluded.status, first_name = excluded.first_name,
  last_initial = excluded.last_initial, verified_until = excluded.verified_until, adult_confirmed_at = excluded.adult_confirmed_at,
  age_method = excluded.age_method, rules_accepted_at = excluded.rules_accepted_at, rules_version = excluded.rules_version;
update public.profiles set quad_rules_accepted_at = now() where campus_id in (tests.uid('OSU'), tests.uid('UMICH'));
create function pg_temp.e() returns uuid language sql as $$ select '00000000-0000-4000-8000-0000000000f3'::uuid $$;
-- Setup via the real RPCs: B replies to A's live post; E replies; A replies.
select tests.try_text_as(tests.uid('B'), $$select public.create_quad_reply('00000000-0000-4000-8000-00000000a001', 'reply from B')::text$$) as b_reply \gset
select tests.try_text_as(pg_temp.e(), $$select public.create_quad_reply('00000000-0000-4000-8000-00000000a001', 'reply from E')::text$$) as e_reply \gset
select diag('B reply result: ' || :'b_reply');
select tests.try_text_as(tests.uid('B'), $$select public.create_quad_post('text', 'a post by B')::text$$) as b_post \gset
select diag('B post result: ' || :'b_post');

-- 1. every student-visible Quad response, for a non-author, must not carry any author identity
create function pg_temp.leaks(txt text) returns boolean language sql as $$
  select txt ~* '(author_id|"user_id"|display_name|first_name|last_initial|"email"|8000-0{11}[abcd]|8000-0{10}f3|Aisha|Ben B|Eve)'
$$;
select ok(not pg_temp.leaks(pg_temp.as('E', $$select public.get_quad_feed()::text$$)), 'get_quad_feed (E): no author identity');
select ok(not pg_temp.leaks(pg_temp.as('E', $$select public.get_quad_feed('new')::text$$)), 'get_quad_feed new (E): no author identity');
select ok(not pg_temp.leaks(pg_temp.as('E', $$select public.get_quad_feed('top')::text$$)), 'get_quad_feed top (E): no author identity');
select ok(not pg_temp.leaks(pg_temp.as('E', $$select public.get_quad_thread('00000000-0000-4000-8000-00000000a001')::text$$)), 'get_quad_thread (E): no author identity');
select ok(not pg_temp.leaks(pg_temp.as('B', $$select public.get_quad_thread('00000000-0000-4000-8000-00000000a001')::text$$)), 'get_quad_thread (B): no author identity');
select ok(not pg_temp.leaks(pg_temp.as('A', $$select public.get_my_quad()::text$$)), 'get_my_quad (A): no identity fields');
select ok(not pg_temp.leaks(pg_temp.as('E', $$select public.get_quad_status()::text$$)), 'get_quad_status: no identity');
select is(pg_temp.as('E', $$select count(*)::text from jsonb_array_elements(public.get_quad_thread('00000000-0000-4000-8000-00000000a001') -> 'replies') r where (r->>'is_mine')::boolean$$), '1',
  'E sees exactly their own reply flagged is_mine');
select is(pg_temp.as('E', $$select count(distinct r->>'alias_no')::text from jsonb_array_elements(public.get_quad_thread('00000000-0000-4000-8000-00000000a001') -> 'replies') r$$), '3',
  'three authors in the thread = three distinct aliases (OP is 0)');
-- aliases are per thread: B has a different alias in another thread than here (linkability across threads)
select diag('alias_no of B in thread a001 = ' || coalesce(pg_temp.as('B', $$select r->>'alias_no' from jsonb_array_elements(public.get_quad_thread('00000000-0000-4000-8000-00000000a001') -> 'replies') r where (r->>'is_mine')::boolean$$), 'null'));

-- 2. held / removed posts never reach another student
select is(pg_temp.as('E', $$select public.get_quad_thread('00000000-0000-4000-8000-00000000a002')::text$$), 'ERROR: NOT_FOUND', 'held post: thread is NOT_FOUND for E');
select is(pg_temp.as('E', $$select public.get_quad_thread('00000000-0000-4000-8000-00000000a003')::text$$), 'ERROR: NOT_FOUND', 'removed post: thread is NOT_FOUND for E');
select is(pg_temp.as('E', $$select count(*)::text from jsonb_array_elements(public.get_quad_feed() -> 'items') i where i->>'body' in ('QUAD-HELD','QUAD-REMOVED')$$), '0', 'held and removed posts are not in E''s feed');
select is(pg_temp.as('D', $$select public.get_quad_thread('00000000-0000-4000-8000-00000000a001')::text$$), 'ERROR: NOT_FOUND', 'other campus: thread is NOT_FOUND');
select ok(pg_temp.as('D', $$select count(*)::text from jsonb_array_elements(public.get_quad_feed() -> 'items')$$) = '0', 'other campus: feed has no OSU posts');
select pg_temp.lk(pg_temp.as('E', $$select public.vote_quad('post','00000000-0000-4000-8000-00000000a002', 1::smallint)::text$$), 'ERROR:%', 'E cannot vote on a held post');
select pg_temp.lk(pg_temp.as('E', $$select public.create_quad_reply('00000000-0000-4000-8000-00000000a003', 'x')::text$$), 'ERROR:%', 'E cannot reply to a removed post');
select pg_temp.lk(pg_temp.as('E', $$select public.delete_quad_post('00000000-0000-4000-8000-00000000a001')::text$$), 'ERROR:%', 'E cannot delete A''s post');
select pg_temp.lk(pg_temp.as('E', $$select public.set_quad_replies('00000000-0000-4000-8000-00000000a001', false)::text$$), 'ERROR:%', 'E cannot close A''s replies');
select is(pg_temp.as('A', $$select (select status from public.quad_posts where id='00000000-0000-4000-8000-00000000a001')$$), 'ERROR: permission denied for table quad_posts', 'quad_posts closed to direct select');
select is((select status::text from public.quad_posts where id = '00000000-0000-4000-8000-00000000a001'), 'live', 'A''s post is untouched after the attacks');
select pg_temp.lk(pg_temp.as('E', $$select count(*)::text from public.quad_replies$$), 'ERROR: permission denied%', 'quad_replies closed to direct select');
select pg_temp.lk(pg_temp.as('E', $$select count(*)::text from public.quad_hides$$), 'ERROR: permission denied%', 'quad_hides closed to direct select');
select pg_temp.lk(pg_temp.as('E', $$select count(*)::text from public.quad_poll_votes$$), 'ERROR: permission denied%', 'quad_poll_votes closed to direct select');

-- 3. notifications and Realtime payloads produced by Quad activity carry no replier identity
select ok(not exists (select 1 from public.notifications n where n.user_id = tests.uid('A') and n.type like 'quad%' and (n.data::text ~* '8000-0{11}b|8000-0{10}f3|Ben|Eve' or n.title ~* 'Ben|Eve' or n.body ~* 'Ben|Eve')),
  'notifications to the Quad author do not name the repliers');
select diag('notifications to A: ' || coalesce((select string_agg(type || ':' || title || ':' || coalesce(data::text,''), ' ; ') from public.notifications where user_id = tests.uid('A')), 'none'));
select ok(not exists (select 1 from realtime.messages m where m.topic like '%quad%' and m.payload::text ~* '8000-0{11}[abc]|8000-0{10}f3|author'),
  'Realtime payloads on quad topics carry no ids or authors');
select diag('realtime topics after Quad activity: ' || coalesce((select string_agg(distinct topic || '/' || event, ', ') from realtime.messages), 'none'));

-- 4. reports on Quad content: the reporter path and the moderator path
select tests.try_text_as(pg_temp.e(), $$select public.create_report('quad_post','00000000-0000-4000-8000-00000000a001','spam','x')::text$$) as qrep \gset
select diag('report on quad post: ' || :'qrep');
select ok(not pg_temp.leaks(:'qrep'), 'create_report result for a Quad post returns no author');
select ok(not pg_temp.leaks(pg_temp.as('E', $$select coalesce(jsonb_agg(to_jsonb(r)),'[]')::text from public.my_reports r$$)), 'my_reports for a Quad report: no author');
select is(pg_temp.admin('MOD', $$select count(*)::text from public.reports where target_type = 'quad_post' and target_user_id is not null$$), '0',
  'MODERATOR direct select of reports: Quad reports must not expose target_user_id (owner-only reveal)');
select ok(not pg_temp.leaks(pg_temp.admin('MOD', $$select public.admin_list_reports('{}'::jsonb, 0)::text$$)), 'admin_list_reports (moderator): no Quad author identity');
select ok(not pg_temp.leaks(pg_temp.admin('MOD', $$select public.admin_report_detail((select id from public.reports where target_type='quad_post' limit 1))::text$$)), 'admin_report_detail (moderator): no Quad author identity');
select ok(not pg_temp.leaks(pg_temp.admin('MOD', $$select public.admin_list_quad('{}'::jsonb, 0)::text$$)), 'admin_list_quad (moderator): no author identity');

-- 5. reveal: owner only, fresh TOTP, audited, receipt queued; and the audit row must not hand the author to moderators
select pg_temp.lk(pg_temp.as('B', $$select public.admin_reveal_quad_author('post','00000000-0000-4000-8000-00000000a001','case-77','harassment report')::text$$), 'ERROR: NOT_ADMIN%', 'student cannot reveal');
select pg_temp.lk(pg_temp.admin('MOD', $$select public.admin_reveal_quad_author('post','00000000-0000-4000-8000-00000000a001','case-77','harassment report')::text$$), 'ERROR: NOT_ADMIN%', 'moderator cannot reveal');
select pg_temp.lk(pg_temp.admin('OWN', $$select public.admin_reveal_quad_author('post','00000000-0000-4000-8000-00000000a001','case-77','harassment report')::text$$), 'ERROR: FORBIDDEN:mfa_required%', 'owner at aal2 without a fresh TOTP step is refused');
create function pg_temp.reveal_fresh() returns text language plpgsql as $$
declare res text;
begin
  perform tests.authenticate_as(tests.uid('OWN'), 'aal2');
  perform set_config('request.jwt.claims', json_build_object('sub', tests.uid('OWN'), 'role', 'authenticated', 'aal', 'aal2',
    'campus_id', tests.uid('OSU'), 'admin_role', 'owner',
    'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from private.now())::bigint)))::text, true);
  begin execute $q$select public.admin_reveal_quad_author('post','00000000-0000-4000-8000-00000000a001','case-77','harassment report')::text$q$ into res;
  exception when others then res := 'ERROR: ' || sqlerrm; end;
  perform set_config('role', 'none', true); perform set_config('request.jwt.claims', '{}', true);
  return res;
end; $$;
select alike(pg_temp.reveal_fresh(), '%Aisha%', 'owner with fresh TOTP reveals the author');
select is((select count(*)::int from public.audit_log where action = 'quad.reveal'), 1, 'the reveal wrote exactly one audit_log row');
select ok(exists (select 1 from public.email_outbox where template = 'admin_reveal_receipt'), 'a receipt email was queued to the revealed user');
select is(pg_temp.admin('MOD', $$select count(*)::text from public.audit_log where action = 'quad.reveal' and meta::text ~ '8000-0{11}a'$$), '0',
  'a moderator reading audit_log cannot see the revealed author_id');
select diag('admin_list_reports (moderator) = ' || left(pg_temp.admin('MOD', $$select (public.admin_list_reports('{}'::jsonb, 0) -> 'items' -> 0)::text$$), 700));
select diag('admin_report_detail (moderator) = ' || left(pg_temp.admin('MOD', $$select public.admin_report_detail((select id from public.reports where target_type='quad_post' limit 1))::text$$), 900));
select diag('reports.target_user_id (moderator) = ' || pg_temp.admin('MOD', $$select string_agg(target_user_id::text, ',') from public.reports where target_type='quad_post'$$));
select * from finish();
rollback;
