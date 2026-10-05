-- S49 Waitlist, unlock, invites (P4-AUTH-12, P4-AUTH-13, R11-INVITE-01):
-- T-INT-UNLOCK-01 (the member at the threshold opens the campus; everyone is
-- notified once; waitlist emails queued once), manual and demo campuses, the
-- owner's flip, invite credit, my_waitlist_position, mark_unlock_seen and
-- get_invite (public, no PII beyond a first name, IP limit; T-SEC-11).
begin;
select plan(42);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01' where id = tests.uid('D');
update public.campuses set unlock_threshold = 3 where id = tests.uid('UMICH');

select vault.create_secret('test-waitlist-key-not-a-secret', 'waitlist_email_key')
where not exists (select 1 from vault.decrypted_secrets where name = 'waitlist_email_key');
select private.record_waitlist_request('early@umich.edu', '203.0.113.1');
select private.record_waitlist_request('someone@msu.edu', '203.0.113.1');

create function pg_temp.signup(n int, email text, code text default null) returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, email,
          case when code is null then '{}'::jsonb else jsonb_build_object('invite_code', code) end)
$$;
create function pg_temp.u(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid
$$;

-- Invites and the waitlist screen (A09) ----------------------------------------------------------
select pg_temp.signup(1, 'second@umich.edu', lower(' ' || (select invite_code from public.profiles where id = tests.uid('D')) || ' '));
select is((select invited_by from public.profiles where id = pg_temp.u(1)), tests.uid('D'),
  'a signup with an invite code credits the inviter');
select is((select status::text from public.campuses where id = tests.uid('UMICH')), 'waitlist', 'two of three: still waiting');
select is(tests.try_text_as(pg_temp.u(1), $$select (r ->> 'position') || '/' || (r ->> 'members') || '/' || (r ->> 'threshold')
                                            from public.my_waitlist_position() r$$),
  '2/2/3', 'position, members and threshold');
select is(tests.try_text_as(tests.uid('D'), $$select public.my_waitlist_position() ->> 'invited'$$), '1',
  'the inviter sees one signup');
select is(tests.try_text_as(tests.uid('D'), $$select public.my_waitlist_position() ->> 'invite_code'$$),
  (select invite_code from public.profiles where id = tests.uid('D')), 'and their invite code for the share link');
select is(tests.try_text_as(tests.uid('D'), $$select (r -> 'campus' ->> 'slug') || ':' || (r -> 'campus' ->> 'status') || ':' || (r ->> 'show_unlocked')
                                             from public.my_waitlist_position() r$$),
  'umich:waitlist:false', 'campus and no unlocked screen yet');
select is(tests.try_text_as(tests.uid('D'), $$select public.mark_unlock_seen()::text$$), 'ERROR: NOT_ACTIVE:waitlist',
  'mark_unlock_seen needs an open campus');
select ok(not has_function_privilege('anon', 'public.my_waitlist_position()', 'execute'), 'anon cannot read a waitlist position');
select ok(not has_function_privilege('anon', 'public.mark_unlock_seen()', 'execute'), 'anon cannot mark A10 seen');

-- T-INT-UNLOCK-01 -----------------------------------------------------------------------------
select pg_temp.signup(2, 'third@umich.edu');
select is((select status::text from public.campuses where id = tests.uid('UMICH')), 'live', 'the member at the threshold opens the campus');
select is((select unlocked_at from public.campuses where id = tests.uid('UMICH')), '2027-03-10 12:00:00-05'::timestamptz,
  'unlocked_at is stamped');
select is((select string_agg(status::text, ',') from (select distinct status from public.profiles where campus_id = tests.uid('UMICH')) s),
  'active', 'every member is active, the newest included');
select is((select count(*)::int from public.notifications where type = 'campus_unlocked'), 3, 'campus_unlocked queued for all three');
select is((select count(distinct dedupe_key)::int from public.notifications where type = 'campus_unlocked'), 1,
  'one dedupe key for the campus');
select is((select grp || ':' || title || ':' || (data ->> 'url') from public.notifications where user_id = tests.uid('D') and type = 'campus_unlocked'),
  'campus:OnlySwap is open at Michigan:/unlocked', 'the push opens the unlocked screen');
select is(private.push_pref('campus_unlocked'), null, 'campus_unlocked is always on');
select is((select count(*)::int from public.email_outbox where template = 'campus_open'), 1, 'campus_open email queued for the waitlist request');
select is((select to_email || ':' || (vars ->> 'campus') from public.email_outbox where template = 'campus_open'), 'early@umich.edu:Michigan',
  'to the matching school only');
select ok((select notified_at is not null from public.waitlist_requests where domain = 'umich.edu'), 'the request is marked notified');
select ok((select notified_at is null from public.waitlist_requests where domain = 'msu.edu'), 'other schools wait');

-- Idempotent
select ok(not private.unlock_campus(tests.uid('UMICH')), 'unlocking again is a no-op');
select lives_ok($$select private.open_campus('00000000-0000-4000-8000-0000000c0002')$$, 'opening again runs');
select is((select count(*)::int from public.notifications where type = 'campus_unlocked'), 3, 'no duplicate notifications');
select is((select count(*)::int from public.email_outbox where template = 'campus_open'), 1, 'no duplicate emails');
select pg_temp.signup(3, 'fourth@umich.edu');
select is((select status::text from public.profiles where id = pg_temp.u(3)), 'active', 'later signups are active right away');
select is((select count(*)::int from public.notifications where user_id = pg_temp.u(3)), 0, 'and get no unlock notification');

-- A10: shown once to the people who waited
select is(tests.try_text_as(tests.uid('D'), $$select public.my_waitlist_position() ->> 'show_unlocked'$$), 'true',
  'members who waited see the unlocked screen');
select is(tests.try_text_as(pg_temp.u(3), $$select public.my_waitlist_position() ->> 'show_unlocked'$$), 'false',
  'people who joined after do not');
select ok(tests.try_ok_as(tests.uid('D'), $$select public.mark_unlock_seen()$$), 'mark_unlock_seen');
select tests.set_now('2027-03-11 09:00:00-05');
select ok(tests.try_ok_as(tests.uid('D'), $$select public.mark_unlock_seen()$$), 'again');
select is((select seen_unlock_at from public.profiles where id = tests.uid('D')), '2027-03-10 12:00:00-05'::timestamptz,
  'the first time is kept');
select is(tests.try_text_as(tests.uid('D'), $$select public.my_waitlist_position() ->> 'show_unlocked'$$), 'false',
  'and the screen does not come back');

-- Campuses that do not open by count ------------------------------------------------------------
insert into public.campuses (id, slug, name, short_name, status, unlock_threshold) values
  ('00000000-0000-4000-8000-0000000c0003', 'wsu', 'Wayne State University', 'Wayne State', 'waitlist', 1),
  ('00000000-0000-4000-8000-0000000c0004', 'demo2', 'Demo Two', 'Demo Two', 'waitlist', 1);
update public.campuses set is_demo = true where slug = 'demo2';
insert into public.campus_domains (domain, campus_id, kind) values
  ('wayne.edu', '00000000-0000-4000-8000-0000000c0003', 'student'),
  ('demo2.test', '00000000-0000-4000-8000-0000000c0004', 'student');
insert into public.app_config (key, value) values ('manual_unlock_campuses', '["wsu"]')
on conflict (key) do update set value = excluded.value;
select pg_temp.signup(4, 'first@wayne.edu');
select pg_temp.signup(5, 'first@demo2.test');
select is((select string_agg(slug || ':' || status, ',' order by slug) from public.campuses where slug in ('wsu', 'demo2')),
  'demo2:waitlist,wsu:waitlist', 'the demo campus and manual campuses stay on the waitlist');
-- The owner flips a manual campus (admin_update_campus sets status): same opening.
update public.campuses set status = 'live' where slug = 'wsu';
select is((select status::text from public.profiles where id = pg_temp.u(4)), 'active', 'an owner flip activates the members');
select is((select count(*)::int from public.notifications where user_id = pg_temp.u(4) and type = 'campus_unlocked'), 1,
  'and notifies them');

-- get_invite (/i/:code) ---------------------------------------------------------------------------
create function pg_temp.anon(q text) returns text language plpgsql as $$
declare
  res text;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.headers', '{"x-forwarded-for": "203.0.113.9"}', true);
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end $$;
select is(pg_temp.anon(format($$select public.get_invite(%L)::text$$, lower((select invite_code from public.profiles where id = tests.uid('A')))))::jsonb,
  jsonb_build_object('first_name', 'Aisha', 'campus_name', 'Ohio State', 'campus_slug', 'osu', 'campus_status', 'live',
                     'members', (select count(*)::int from public.profiles where campus_id = tests.uid('OSU') and status <> 'banned'),
                     'threshold', 500),
  'anon gets the inviter''s first name and the campus progress, nothing else');
select is(pg_temp.anon($$select public.get_invite('ZZZZZZZZ')::text$$), null, 'unknown code: null');
select is(pg_temp.anon($$select public.get_invite('<script>')::text$$), null, 'junk: null');
update public.profiles set status = 'banned' where id = tests.uid('B');
select is(pg_temp.anon(format($$select public.get_invite(%L)::text$$, (select invite_code from public.profiles where id = tests.uid('B')))),
  null, 'a banned inviter: null');
select is(pg_temp.anon(format($$select public.get_invite(%L)::text$$, (select invite_code from public.profiles where id = pg_temp.u(5)))),
  null, 'the demo campus: null');
select matches(pg_temp.anon($$select count(public.get_invite('ABCDEFGH'))::text from generate_series(1, 60)$$),
  '^ERROR: RATE_LIMITED:ip:get_invite:', '60 a minute per IP');
select ok(has_function_privilege('anon', 'public.get_invite(text)', 'execute'), 'get_invite is public');

select * from finish();
rollback;
