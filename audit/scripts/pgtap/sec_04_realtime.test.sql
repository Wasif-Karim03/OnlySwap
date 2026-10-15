-- Realtime Broadcast authorization: who can receive chat:{id} and user:{id}; clients cannot publish.
-- AUDIT (read-only on app code). LOCAL DB only. Runs inside begin..rollback.
-- Run: pnpm -s supabase test db $(pwd)/audit/scripts/pgtap/sec_04_realtime.test.sql   (or pg_prove -h 127.0.0.1 -p 54322 -U postgres -d postgres)
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
-- The prelude inserted a chat message, which broadcast on chat:{CH} and pinged user:{A}/user:{B}.
create function pg_temp.rt(who text, topic text) returns text language sql as $$
  select pg_temp.as(who, format($f$select set_config('realtime.topic', %L, true) || ':' || (select count(*) from realtime.messages where topic = %L)::text$f$, topic, topic))
$$;
select diag('broadcast rows: ' || (select string_agg(topic || '/' || event, ', ') from realtime.messages));
select is(pg_temp.rt('B', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:1', 'participant B can receive the chat topic');
select is(pg_temp.rt('A', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:1', 'participant A can receive the chat topic');
select is(pg_temp.rt('E', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:0', 'stranger E (same campus) cannot receive the chat topic');
select is(pg_temp.rt('C', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:0', 'C (blocked by A) cannot receive the chat topic');
select is(pg_temp.rt('D', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:0', 'D (other campus) cannot receive the chat topic');
select is(pg_temp.rt('E', 'user:00000000-0000-4000-8000-00000000000a'), 'user:00000000-0000-4000-8000-00000000000a:0', 'E cannot receive A''s inbox topic');
select is(pg_temp.rt('A', 'user:00000000-0000-4000-8000-00000000000a'), 'user:00000000-0000-4000-8000-00000000000a:2', 'A can receive their own inbox topic');
select is(pg_temp.rt('MOD', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:0', 'a moderator cannot tail a private chat topic');
-- wildcard / odd topics
select is(pg_temp.rt('E', 'chat:%'), 'chat:%:0', 'E cannot receive a wildcard chat topic');
select is(pg_temp.rt('E', 'chat:00000000-0000-4000-8000-00000000cc01 '), 'chat:00000000-0000-4000-8000-00000000cc01 :0', 'trailing-space topic does not widen access');
select is(pg_temp.rt('E', 'quad:00000000-0000-4000-8000-00000000a001'), 'quad:00000000-0000-4000-8000-00000000a001:0', 'there is no readable quad topic');
-- clients cannot publish
select pg_temp.lk(pg_temp.as('E', $$insert into realtime.messages (topic, extension, payload, event, private) values ('chat:00000000-0000-4000-8000-00000000cc01', 'broadcast', '{"x":1}'::jsonb, 'message', true)::text$$ ) , 'ERROR:%', 'E cannot publish into a chat topic via realtime.messages');
select pg_temp.lk(pg_temp.as('A', $$select realtime.send('{"x":1}'::jsonb, 'message', 'chat:00000000-0000-4000-8000-00000000cc01', true)::text$$), 'ERROR:%', 'DEFENSE-IN-DEPTH: a student role cannot call realtime.send (not reachable via the Data API)');
select pg_temp.lk(pg_temp.anon($$select count(*)::text from realtime.messages$$), '%0%', 'anon sees nothing (RLS, no policy for anon)');
select is(pg_temp.anon($$select set_config('realtime.topic','chat:00000000-0000-4000-8000-00000000cc01', true) || ':' || (select count(*) from realtime.messages)::text$$), 'chat:00000000-0000-4000-8000-00000000cc01:0', 'anon cannot receive the chat topic');
select * from finish();
rollback;
