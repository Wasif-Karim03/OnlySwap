-- S15: re-verify (P4-AUTH-14), sign-out everywhere (P4-AUTH-18, T-INT-AUTH-06 DB half),
-- help requests and email-access recovery (P4-AUTH-19, T-INT-AUTH-07 DB half).
begin;
select plan(31);
select tests.create_fixtures();

-- Run as a user whose session carries an amr list (how GoTrue records sign-in methods).
create function pg_temp.as_with_amr(who uuid, amr jsonb, sql text)
returns text
language plpgsql
as $fn$
declare
  result text;
begin
  perform tests.authenticate_as(who);
  perform set_config('request.jwt.claims',
    (current_setting('request.jwt.claims')::jsonb || jsonb_build_object('amr', amr))::text, true);
  begin
    execute sql into result;
  exception when others then
    result := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return result;
end;
$fn$;
create function pg_temp.as_aal2(who uuid, sql text)
returns text
language plpgsql
as $fn$
declare
  result text;
begin
  perform tests.authenticate_as(who, 'aal2');
  begin
    execute sql into result;
  exception when others then
    result := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return result;
end;
$fn$;
create function pg_temp.otp_at(ts timestamptz) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from ts)::bigint))
$$;

-- P4-AUTH-14: an overdue yearly check blocks writes -------------------------------------------
select tests.set_now('2027-03-01 12:00:00-05');
update public.profiles set verified_until = '2027-02-28' where id = tests.uid('A');
select is(tests.try_text_as(tests.uid('A'), format('select public.block_user(%L)::text', tests.uid('B'))),
  'ERROR: NOT_ACTIVE:reverify', 'verified_until in the past: writes are refused with NOT_ACTIVE:reverify');
update public.profiles set verified_until = '2027-03-01' where id = tests.uid('A');
select ok(tests.try_ok_as(tests.uid('A'), format('select public.block_user(%L)', tests.uid('B'))),
  'due today still counts as verified');
select tests.set_now('2027-03-02 04:30:00+00');  -- 23:30 on Mar 1 in Columbus
select ok(tests.try_ok_as(tests.uid('A'), format('select public.unblock_user(%L)', tests.uid('B'))),
  'the day ends on the campus clock, not UTC');

-- complete_reverify needs a fresh code ------------------------------------------------------------
select tests.set_now('2027-03-05 12:00:00-05');
update public.profiles set verified_until = '2027-02-28', status = 'reverify' where id = tests.uid('A');
select is(pg_temp.as_with_amr(tests.uid('A'), '[]', 'select public.complete_reverify()::text'),
  'ERROR: FORBIDDEN:code_required', 'no code in the session: refused');
select is(pg_temp.as_with_amr(tests.uid('A'), '[{"method":"password","timestamp":1804262400}]',
  'select public.complete_reverify()::text'),
  'ERROR: FORBIDDEN:code_required', 'a password sign-in does not count');
select is(pg_temp.as_with_amr(tests.uid('A'), pg_temp.otp_at('2027-03-05 11:45:00-05'),
  'select public.complete_reverify()::text'),
  'ERROR: FORBIDDEN:code_required', 'a code older than 10 minutes does not count');
select is(pg_temp.as_with_amr(tests.uid('A'), pg_temp.otp_at('2027-03-05 11:55:00-05'),
  'select public.complete_reverify()::text'),
  '{"verified_until": "2028-03-05"}', 'a fresh code renews for the campus period (12 months)');
select is((select status::text from public.profiles where id = tests.uid('A')), 'active',
  'reverify status is lifted on a live campus');
select ok(tests.try_ok_as(tests.uid('A'), format('select public.block_user(%L)', tests.uid('B'))),
  'writes work again');

update public.profiles set status = 'reverify', verified_until = '2027-01-01' where id = tests.uid('D');
select is(pg_temp.as_with_amr(tests.uid('D'), pg_temp.otp_at('2027-03-05 11:59:00-05'),
  'select public.complete_reverify() ->> ''verified_until'''), '2028-03-05', 'waitlist campus renews too');
select is((select status::text from public.profiles where id = tests.uid('D')), 'waitlist',
  'on a campus that is not live the account goes back to the waitlist');
update public.profiles set status = 'suspended' where id = tests.uid('C');
select is(pg_temp.as_with_amr(tests.uid('C'), pg_temp.otp_at('2027-03-05 11:59:00-05'),
  'select public.complete_reverify()::text'), 'ERROR: NOT_ACTIVE:suspended',
  'a suspended account cannot re-verify its way out');
select ok(not has_function_privilege('anon', 'public.complete_reverify()', 'execute'), 'complete_reverify needs a session');

-- P4-AUTH-18: revoke_sessions ------------------------------------------------------------------
insert into auth.sessions (user_id) values (tests.uid('B')), (tests.uid('B')), (tests.uid('C'));
select is(private.revoke_sessions(tests.uid('B')), 2, 'every session of the user is removed');
select is((select count(*)::int from auth.sessions where user_id = tests.uid('C')), 1, 'other users keep theirs');
select ok(not has_function_privilege('authenticated', 'private.revoke_sessions(uuid)', 'execute'),
  'only the service role may revoke');
update public.profiles set status = 'suspended' where id = tests.uid('B');
select is(tests.try_text_as(tests.uid('B'), format('select public.block_user(%L)::text', tests.uid('A'))),
  'ERROR: NOT_ACTIVE:suspended', 'T-INT-AUTH-06: a suspended user''s unexpired JWT cannot write');

-- P4-AUTH-19: help requests --------------------------------------------------------------------
select vault.create_secret('owner-inbox@example.com', 'support_inbox')
where not exists (select 1 from vault.decrypted_secrets where name = 'support_inbox');
select isnt(private.record_support_request(' Me@Gmail.com ', 'cant_access_email', 'I graduated from my old email.', '203.0.113.9'),
  null, 'a help request is stored');
select is((select email || '|' || topic from public.support_requests), 'me@gmail.com|cant_access_email',
  'email normalized, topic kept');
select is((select count(*)::int from public.email_outbox where template = 'support_request'), 1,
  'the owner is emailed');
select throws_ok($$select private.record_support_request('me@gmail.com', 'refund', 'x', '203.0.113.9')$$,
  'P0001', 'INVALID:topic', 'unknown topics are refused');
select throws_ok($$select private.record_support_request('me@gmail.com', 'general', '  ', '203.0.113.9')$$,
  'P0001', 'INVALID:body', 'an empty message is refused');
select lives_ok($$select private.record_support_request('x' || g || '@gmail.com', 'general', 'hi', '203.0.113.9') from generate_series(1, 2) g$$,
  'three per hour from one IP');
select throws_like($$select private.record_support_request('y@gmail.com', 'general', 'hi', '203.0.113.9')$$,
  'RATE_LIMITED:ip:support:%', 'the fourth is rate limited');

-- P4-AUTH-19: admin_change_email -------------------------------------------------------------------
select vault.create_secret('http://functions.test/functions/v1', 'functions_url')
where not exists (select 1 from vault.decrypted_secrets where name = 'functions_url');
select vault.create_secret('test-service-key', 'service_role_key')
where not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key');
insert into public.campus_domains (domain, campus_id, kind) values ('buckeyemail.osu.edu', tests.uid('OSU'), 'student');

select is(tests.try_text_as(tests.uid('MOD'), format($$select public.admin_change_email(%L, 'a2@buckeyemail.osu.edu')::text$$, tests.uid('A'))),
  'ERROR: NOT_ADMIN', 'moderators cannot change emails');
select is(pg_temp.as_aal2(tests.uid('OWN'), format($$select public.admin_change_email(%L, 'A2@BuckeyeMail.osu.edu') ->> 'ok'$$, tests.uid('A'))),
  'true', 'the owner (with MFA) changes the address; the request goes to admin-change-email');
select is(pg_temp.as_aal2(tests.uid('OWN'), format($$select public.admin_change_email(%L, 'x@gmail.com')::text$$, tests.uid('A'))),
  'ERROR: INVALID:new_email', 'only a student address of a supported school');
select is(pg_temp.as_aal2(tests.uid('OWN'), format($$select public.admin_change_email(%L, 'b@osu.edu')::text$$, tests.uid('A'))),
  'ERROR: INVALID:new_email', 'an address another account uses is refused');
select is((select action || '|' || target_id || '|' || (meta ->> 'new_domain') from public.audit_log where action = 'change_email'),
  'change_email|' || tests.uid('A') || '|buckeyemail.osu.edu', 'one audit_log row, domain only');
select is(tests.try_text_as(tests.uid('OWN'), format($$select public.admin_change_email(%L, 'x@gmail.com')::text$$, tests.uid('A'))),
  'ERROR: NOT_ADMIN', 'owner without MFA (aal1) is refused');

-- on_auth_user_email_changed: the campus follows the domain (T-INT-AUTH-07 DB half)
update auth.users set email = 'dana@osu.edu' where id = tests.uid('D');
select is((select campus_id::text || '|' || status::text || '|' || (email_hash = private.email_hash('dana@osu.edu'))::text
           from public.profiles where id = tests.uid('D')),
  tests.uid('OSU')::text || '|active|true', 'moving to a live campus: campus, status and email hash follow');

select * from finish();
rollback;
