-- P4-AUTH-01: onboarding RPCs (T-INT-AUTH-04 and API §3 Account & onboarding).
begin;
select plan(36);
select tests.create_fixtures();

-- A fresh osu student who has not onboarded yet (signup trigger makes the profile).
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f1', 'fresh@osu.edu');
create function pg_temp.f() returns uuid language sql as $$ select '00000000-0000-4000-8000-0000000000f1'::uuid $$;

-- lookup_school -------------------------------------------------------------------------
select is(public.lookup_school(' OSU.edu ') ->> 'name', 'The Ohio State University', 'lookup_school: case and spaces ignored');
select is(public.lookup_school('alumni.osu.edu'), null, 'lookup_school: blocked domains look unknown');
select is(public.lookup_school('gmail.com'), null, 'lookup_school: unknown is null');
select is(public.lookup_school('umich.edu') ->> 'status', 'waitlist', 'lookup_school: returns campus status');
select is(public.lookup_school('osu.edu') ->> 'is_review', 'false', 'lookup_school: is_review flag');
select throws_ok($$select public.lookup_school(repeat('a', 101))$$, 'P0001', 'INVALID:domain', 'lookup_school: over 100 chars');
select ok(has_function_privilege('anon', 'public.lookup_school(text)', 'execute'), 'lookup_school is public (anon)');
select ok(not has_function_privilege('anon', 'public.confirm_age(text, boolean, date)', 'execute'), 'confirm_age needs a session');

select is((select string_agg(k, ',' order by k) from jsonb_object_keys(public.get_app_config()) k),
  'chat_photos_enabled,maintenance,min_version_android,min_version_ios,quad_enabled,rules_version',
  'get_app_config: the public keys only');
select ok(has_function_privilege('anon', 'public.get_app_config()', 'execute'), 'get_app_config is public (anon)');

-- confirm_age (T-INT-AUTH-04) ----------------------------------------------------------------
select tests.set_now('2026-09-26 12:00:00-04');
select is(tests.try_text_as(pg_temp.f(), $$select public.confirm_age('self_declared', null, '2008-09-27')::text$$),
  '{"adult": false}', 'AUTH-04 17 years 364 days is not adult');
select ok(exists (select 1 from public.age_blocks a join public.profiles p on p.email_hash = a.email_hash where p.id = pg_temp.f()),
  'AUTH-04 a minor''s email hash is age-blocked');
select is((select adult_confirmed_at from public.profiles where id = pg_temp.f()), null, 'AUTH-04 minor stays unconfirmed');
delete from public.age_blocks;
select is(tests.try_text_as(pg_temp.f(), $$select public.confirm_age('self_declared', null, '2008-09-26')::text$$),
  '{"adult": true}', 'AUTH-04 exactly 18 today (campus time) is adult');
select is((select age_method::text from public.profiles where id = pg_temp.f()), 'self_declared', 'AUTH-04 method recorded');
select is(
  (select count(*)::int from information_schema.columns c
   where c.table_schema in ('public', 'private') and c.data_type = 'date'
     and c.column_name ~ '(birth|dob)'),
  0, 'AUTH-04 no birth-date column exists anywhere');
select is(tests.try_text_as(pg_temp.f(), $$select public.confirm_age('self_declared', null, '2020-01-01')::text$$),
  '{"adult": true}', 'confirm_age: once adult, stays adult (idempotent)');
update public.profiles set adult_confirmed_at = null where id = tests.uid('D');
select is(tests.try_text_as(tests.uid('D'), $$select public.confirm_age('os_signal')::text$$),
  'ERROR: INVALID:is_adult', 'confirm_age: os_signal needs is_adult');
select is(tests.try_text_as(tests.uid('D'), $$select public.confirm_age('guess', true)::text$$),
  'ERROR: INVALID:method', 'confirm_age: unknown method');
select is(tests.try_text_as(tests.uid('D'), $$select public.confirm_age('self_declared', null, '2030-01-01')::text$$),
  'ERROR: INVALID:birth_date', 'confirm_age: future date refused');

-- update_profile ------------------------------------------------------------------------------
select is(tests.try_text_as(pg_temp.f(),
  $$select public.update_profile('Zoë', 'k', 'junior', array[' Dorms ', 'dorms', 'North'], ' hi ', null) ->> 'display_name'$$),
  'Zoë K.', 'update_profile: unicode name, initial uppercased');
select is((select areas::text || '|' || bio from public.profiles where id = pg_temp.f()), '{Dorms,North,dorms}|hi',
  'update_profile: areas trimmed and de-duplicated, bio trimmed');
select is(tests.try_text_as(pg_temp.f(), $$select public.update_profile('O''Neil-Ray')::text$$) ~ '"first_name": "O''Neil-Ray"',
  true, 'update_profile: hyphen and apostrophe allowed');
select is(tests.try_text_as(pg_temp.f(), $$select public.update_profile('R2D2')::text$$),
  'ERROR: INVALID:first_name', 'update_profile: digits refused');
select is(tests.try_text_as(pg_temp.f(), $$select public.update_profile('')::text$$),
  'ERROR: INVALID:first_name', 'update_profile: name required');
select is(tests.try_text_as(pg_temp.f(), $$select public.update_profile('Ana', null, null, '{}', repeat('x', 81))::text$$),
  'ERROR: INVALID:bio', 'update_profile: bio up to 80');
select is(tests.try_text_as(pg_temp.f(), $$select public.update_profile('Ana', null, null, '{}', null, 'c/x/u/y/a.webp')::text$$),
  'ERROR: INVALID:avatar_path', 'update_profile: avatar must be under your own prefix');
select ok(tests.try_ok_as(pg_temp.f(), format($$select public.update_profile('Ana', null, null, '{}', null, %L)$$,
  'c/' || tests.uid('OSU') || '/u/' || pg_temp.f() || '/avatar.webp')), 'update_profile: own avatar path accepted');

-- accept_rules ---------------------------------------------------------------------------------
select is(tests.try_text_as(pg_temp.f(), $$select public.accept_rules('0')::text$$),
  'ERROR: INVALID:version', 'accept_rules: must be the current version');
select ok(tests.try_ok_as(pg_temp.f(), format('select public.accept_rules(%L)',
  (select value #>> '{}' from public.app_config where key = 'rules_version'))), 'accept_rules: current version accepted');
select alike(tests.try_text_as(pg_temp.f(), $$select (private.require_active()).id::text$$), 'ERROR: permission denied%',
  'require_active is closed to users (checked inside RPCs only)');
update public.profiles set adult_confirmed_at = null where id = tests.uid('B');
select is(tests.try_text_as(tests.uid('B'), $$select public.accept_rules('1')::text$$), 'ERROR: AGE_REQUIRED',
  'accept_rules: age check comes first');

-- update_profile_flags ----------------------------------------------------------------------------
update public.profiles set status = 'paused' where id = tests.uid('C');
select ok(tests.try_ok_as(tests.uid('C'), $$select public.update_profile_flags(false, null, 'dark')$$),
  'update_profile_flags works while paused');
select is((select analytics_opt_in::text || crash_reports_opt_in::text || theme_mode from public.profiles where id = tests.uid('C')),
  'falsetruedark', 'update_profile_flags: only the given flags change');

-- my_waitlist_position ------------------------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f2', 'second@umich.edu');
update public.profiles set created_at = now() + interval '1 minute' where id = '00000000-0000-4000-8000-0000000000f2';
select is(tests.try_text_as('00000000-0000-4000-8000-0000000000f2', $$select public.my_waitlist_position()::text$$),
  '{"members": 2, "position": 2, "threshold": 500}', 'my_waitlist_position: second in line');
select is(tests.try_text_as(tests.uid('A'), $$select public.my_waitlist_position() ->> 'position'$$), null,
  'my_waitlist_position: no position on a live campus');

select * from finish();
rollback;
