-- Per-role RLS and grant matrix: anon, same campus, blocked, other campus, suspended, banned, moderator.
-- AUDIT (read-only on app code). LOCAL DB only. Runs inside begin..rollback.
-- Run: pnpm -s supabase test db $(pwd)/audit/scripts/pgtap/sec_01_rls_roles.test.sql   (or pg_prove -h 127.0.0.1 -p 54322 -U postgres -d postgres)
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
-- ===== anon: no table reads at all ==========================================================
select pg_temp.lk(pg_temp.anon('select count(*)::text from public.listings'), 'ERROR: permission denied%', 'anon cannot read listings');
select pg_temp.lk(pg_temp.anon('select count(*)::text from public.profiles'), 'ERROR: permission denied%', 'anon cannot read profiles');
select pg_temp.lk(pg_temp.anon('select count(*)::text from public.messages'), 'ERROR: permission denied%', 'anon cannot read messages');
select pg_temp.lk(pg_temp.anon('select count(*)::text from public.quad_posts'), 'ERROR: permission denied%', 'anon cannot read quad_posts');
select pg_temp.lk(pg_temp.anon('select count(*)::text from public.reports'), 'ERROR: permission denied%', 'anon cannot read reports');
select pg_temp.lk(pg_temp.anon('select count(*)::text from public.public_profiles'), 'ERROR: permission denied%', 'anon cannot read public_profiles view');
select pg_temp.lk(pg_temp.anon('select public.get_feed()::text'), 'ERROR: permission denied%', 'anon cannot call get_feed');
select pg_temp.lk(pg_temp.anon($$select public.get_quad_feed()::text$$), 'ERROR: permission denied%', 'anon cannot call get_quad_feed');
select pg_temp.lk(pg_temp.anon($$select public.get_listing('00000000-0000-4000-8000-00000000aa01')::text$$), 'ERROR: permission denied%', 'anon cannot call get_listing');

-- ===== authenticated, same campus (B): listings ====================================================
select is(pg_temp.as('B', $$select string_agg(title, ',' order by title) from public.listings$$), 'LIVE-LISTING',
  'B (same campus) sees only the active listing: not held, removed, deleted or UMICH');
select is(pg_temp.as('C', $$select count(*)::text from public.listings where seller_id = tests.uid('A')$$), '0',
  'C (blocked by A) sees none of A''s listings');
select is(pg_temp.as('D', $$select string_agg(title, ',') from public.listings$$), 'UMICH-LISTING',
  'D (other campus) sees only its own campus');
select is(pg_temp.as('A', $$select string_agg(title, ',' order by title) from public.listings$$), 'HELD-LISTING,LIVE-LISTING,REMOVED-LISTING',
  'the seller sees own held and removed, never the deleted one');
select is(pg_temp.as_uuid('00000000-0000-4000-8000-0000000000f1', $$select count(*)::text from public.listings where seller_id = tests.uid('A')$$), '1',
  'S (suspended) reads like a member (read-only)');
select is(pg_temp.as('B', $$select count(*)::text from public.listing_removals$$), 'ERROR: permission denied for table listing_removals',
  'removal reasons table is closed to students');
select is(pg_temp.as('B', $$select public.get_listing('00000000-0000-4000-8000-00000000aa03')::text$$),
  '{"id": "00000000-0000-4000-8000-00000000aa03", "access": "gone"}', 'B gets no reason for a removed listing');
select is(pg_temp.as('B', $$select public.get_listing('00000000-0000-4000-8000-00000000aa02')::text$$),
  '{"id": "00000000-0000-4000-8000-00000000aa02", "access": "gone"}', 'B gets nothing for a held listing');
select pg_temp.lk(pg_temp.as('D', $$select public.get_listing('00000000-0000-4000-8000-00000000aa01')::text$$), '%"access": "%',
  'D asking for an OSU listing gets an access verdict, not the listing');
select pg_temp.ulk(pg_temp.as('D', $$select public.get_listing('00000000-0000-4000-8000-00000000aa01')::text$$), '%LIVE-LISTING%',
  'D never receives the OSU listing title');
select pg_temp.ulk(pg_temp.as('B', $$select public.get_listing('00000000-0000-4000-8000-00000000aa03')::text$$), '%SECRET%', 'no removal text for B');

-- ===== offers / chats / messages / meetups / saves ============================================
select is(pg_temp.as('B', $$select count(*)::text from public.offers$$), '1', 'B sees own offer');
select is(pg_temp.as('C', $$select count(*)::text from public.offers$$), '0', 'C sees no offers');
select is(pg_temp.as('D', $$select count(*)::text from public.offers$$), '0', 'D sees no offers');
select is(pg_temp.as('C', $$select count(*)::text from public.chats$$), '0', 'C sees no chats');
select is(pg_temp.as('D', $$select count(*)::text from public.chats$$), '0', 'D sees no chats');
select is(pg_temp.as('C', $$select count(*)::text from public.messages$$), '0', 'C sees no messages');
select is(pg_temp.as('D', $$select count(*)::text from public.messages$$), '0', 'D sees no messages');
select is(pg_temp.as('A', $$select count(*)::text from public.messages$$), '1', 'a participant sees the chat message');
select is(pg_temp.as('C', $$select count(*)::text from public.meetups$$), '0', 'C sees no meetups');
select is(pg_temp.as('C', $$select count(*)::text from public.notifications$$), '0', 'C sees no one else''s notifications');
select is(pg_temp.as('C', $$select count(*)::text from public.saved_searches$$), '0', 'C sees no one else''s saved searches');
select is(pg_temp.as('C', $$select count(*)::text from public.blocks$$), '0', 'C cannot see that A blocked them');
select is(pg_temp.as('B', $$select count(*)::text from public.profiles$$), '1', 'a student reads only their own profile row');
select is(pg_temp.as('B', $$select count(*)::text from public.public_profiles where id = tests.uid('D')$$), '0', 'public_profiles is campus scoped');
select is(pg_temp.as('B', $$select count(*)::text from public.public_profiles where id = tests.uid('A')$$), '1', 'public_profiles lists campus peers');
select pg_temp.ulk(pg_temp.as('B', $$select jsonb_agg(to_jsonb(p))::text from public.public_profiles p$$), '%email%', 'public_profiles has no email column');
select pg_temp.ulk(pg_temp.as('B', $$select public.get_profile(tests.uid('A'))::text$$), '%email%', 'get_profile has no email');
select pg_temp.ulk(pg_temp.as('B', $$select public.get_profile(tests.uid('A'))::text$$), '%status_reason%', 'get_profile has no status_reason');

-- ===== admin-only data ============================================================================
select is(pg_temp.as('B', $$select count(*)::text from public.reports$$), '0', 'reporter cannot read reports table (even own)');
select is(pg_temp.as('B', $$select count(*)::text from public.audit_log$$), '0', 'student sees no audit_log');
select is(pg_temp.as('B', $$select count(*)::text from public.admins$$), '0', 'student sees no admins');
select is(pg_temp.as('B', $$select count(*)::text from public.campus_domains$$), '0', 'student sees no campus_domains');
select is(pg_temp.as('B', $$select count(*)::text from public.strikes$$), '0', 'student sees no strikes of others');
select pg_temp.lk(pg_temp.as('B', $$select count(*)::text from public.email_outbox$$), 'ERROR: permission denied%', 'email_outbox closed');
select pg_temp.lk(pg_temp.as('B', $$select count(*)::text from public.support_requests$$), 'ERROR: permission denied%', 'support_requests closed');
select pg_temp.lk(pg_temp.as('B', $$select count(*)::text from public.waitlist_requests$$), 'ERROR: permission denied%', 'waitlist_requests closed');
select pg_temp.lk(pg_temp.as('B', $$select count(*)::text from public.admin_metrics_funnel$$), 'ERROR: permission denied%', 'admin_metrics_funnel closed to students');
select pg_temp.lk(pg_temp.as('B', $$select count(*)::text from public.profile_stats_mv$$), 'ERROR: permission denied%', 'materialized view closed');
select pg_temp.lk(pg_temp.as('B', $$select count(*)::text from private.staff_emails$$), 'ERROR: permission denied%', 'private schema tables closed');
select pg_temp.lk(pg_temp.as('B', $$select public.admin_overview(null)::text$$), 'ERROR: NOT_ADMIN%', 'student cannot call admin_overview');
select pg_temp.lk(pg_temp.as('B', $$select public.admin_list_reports('{}'::jsonb, 0)::text$$), 'ERROR: NOT_ADMIN%', 'student cannot call admin_list_reports');
select pg_temp.lk(pg_temp.as('B', $$select public.admin_read_reported_chat('00000000-0000-4000-8000-00000000ff01')::text$$), 'ERROR: NOT_ADMIN%', 'student cannot read a reported chat');
select pg_temp.lk(pg_temp.as('B', $$select public.admin_reveal_quad_author('post','00000000-0000-4000-8000-00000000a001','case-1','because')::text$$), 'ERROR: NOT_ADMIN%', 'student cannot reveal Quad author');
select pg_temp.lk(pg_temp.as('B', $$select public.admin_change_email(tests.uid('A'), 'x@osu.edu')::text$$), 'ERROR: NOT_ADMIN%', 'student cannot change someone''s email');

-- moderator at aal1 (no second step): nothing; at aal2: ok but see scope check below
select is(pg_temp.as('MOD', $$select count(*)::text from public.reports$$), '0', 'MOD at aal1 sees no reports (mfa_required)');
select is(pg_temp.admin('MOD', $$select count(*)::text from public.reports$$), '1', 'MOD at aal2 sees the report');
select pg_temp.lk(pg_temp.admin('MOD', $$select public.admin_reveal_quad_author('post','00000000-0000-4000-8000-00000000a001','case-1','because')::text$$), 'ERROR: NOT_ADMIN%',
  'a moderator (not owner) cannot reveal Quad authors');
-- Scope: a moderator is bound to a campus (admins.campus_id). Secure expectation: no UMICH rows.
select is(pg_temp.admin('MOD', $$select count(*)::text from public.listings where campus_id = tests.uid('UMICH')$$), '0',
  'SCOPE: OSU moderator reads no UMICH listings via direct select');
select is(pg_temp.admin('MOD', $$select count(*)::text from public.profiles where campus_id = tests.uid('UMICH')$$), '0',
  'SCOPE: OSU moderator reads no UMICH profiles via direct select');
select is(pg_temp.admin('MOD', $$select count(*)::text from public.swipes s join public.profiles p on p.id = s.user_id where p.campus_id = tests.uid('UMICH')$$), '0',
  'SCOPE: OSU moderator reads no UMICH swipes');

-- ===== direct writes are not granted ================================================================
select pg_temp.lk(pg_temp.as('A', $$insert into public.listings (id, campus_id, seller_id, title, price_cents) values (gen_random_uuid(), tests.uid('OSU'), tests.uid('A'), 'x', 1)$$ ), 'ERROR: permission denied%', 'no direct INSERT on listings');
select pg_temp.lk(pg_temp.as('A', $$update public.listings set price_cents = 1 where seller_id = tests.uid('A')$$), 'ERROR: permission denied%', 'no direct UPDATE on listings');
select pg_temp.lk(pg_temp.as('A', $$update public.profiles set status = 'active', strike_count = 0 where id = tests.uid('A')$$), 'ERROR: permission denied%', 'no direct UPDATE on profiles (status, strikes)');
select pg_temp.lk(pg_temp.as('A', $$delete from public.messages$$), 'ERROR: permission denied%', 'no direct DELETE on messages');
select pg_temp.lk(pg_temp.as('A', $$insert into public.admins (user_id, role) values (tests.uid('A'), 'owner')$$), 'ERROR: permission denied%', 'cannot self-grant admin');
select pg_temp.lk(pg_temp.as('A', $$delete from public.audit_log$$), 'ERROR: permission denied%', 'cannot delete audit_log');
select pg_temp.lk(pg_temp.as('A', $$update public.app_config set value = 'false' where key = 'quad_enabled'$$), 'ERROR: permission denied%', 'cannot edit app_config');
select pg_temp.lk(pg_temp.as('A', $$insert into public.reports (campus_id, target_type, target_id, reason) values (tests.uid('OSU'), 'listing', gen_random_uuid(), 'scam')$$), 'ERROR: permission denied%', 'cannot insert reports directly');

-- ===== suspended / banned cannot write through RPCs ===================================================
select pg_temp.lk(pg_temp.as_uuid('00000000-0000-4000-8000-0000000000f1', $$select public.make_offer('00000000-0000-4000-8000-00000000aa01', 500)::text$$), 'ERROR: %', 'S (suspended) cannot make an offer');
select pg_temp.lk(pg_temp.as_uuid('00000000-0000-4000-8000-0000000000f1', $$select public.save_listing('00000000-0000-4000-8000-00000000aa01')::text$$), 'ERROR: %', 'S (suspended) cannot save');
select pg_temp.lk(pg_temp.as_uuid('00000000-0000-4000-8000-0000000000f1', $$select public.create_quad_post('text','hello there')::text$$), 'ERROR: %', 'S (suspended) cannot post to the Quad');
select pg_temp.lk(pg_temp.as_uuid('00000000-0000-4000-8000-0000000000f2', $$select public.get_feed()::text$$), 'ERROR: %', 'Z (banned) cannot read the feed');
select pg_temp.lk(pg_temp.as_uuid('00000000-0000-4000-8000-0000000000f2', $$select public.make_offer('00000000-0000-4000-8000-00000000aa01', 500)::text$$), 'ERROR: %', 'Z (banned) cannot make an offer');
select pg_temp.lk(pg_temp.as('C', $$select public.make_offer('00000000-0000-4000-8000-00000000aa01', 500)::text$$), 'ERROR: %', 'C (blocked by seller) cannot offer on A''s listing');
select pg_temp.lk(pg_temp.as('D', $$select public.make_offer('00000000-0000-4000-8000-00000000aa01', 500)::text$$), 'ERROR: %', 'D (other campus) cannot offer on an OSU listing');
select * from finish();
rollback;
