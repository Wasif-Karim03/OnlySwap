-- P3-TEST-01: pgTAP harness. Runs first (file name sorts first) and commits a
-- `tests` schema with helpers that every other test file uses inside its own
-- rolled-back transaction. Local and CI databases only; never a migration.
--
--   tests.create_fixtures()          campuses osu (live) + umich (waitlist);
--                                    users A, B, C (osu), D (umich),
--                                    MOD (moderator), OWN (owner), NOMFA (owner, aal1)
--   tests.uid('A')                   fixed ids for the fixtures
--   tests.authenticate_as(uid, aal)  act as a signed-in user (role authenticated)
--   tests.set_claims(uid, aal)       same claims, role unchanged (for private helpers)
--   tests.authenticate_service()     act as the service role
--   tests.clear_authentication()     act as anon
--   tests.set_now(ts)                time travel: private.now() returns ts until rollback
--   tests.try_ok(sql)                true if the SQL runs without an error
--   tests.try_text(sql)              first value as text, or 'ERROR: <message>'
--   tests.try_text_as(uid, sql)      same, run as that user; role restored after
--   tests.try_ok_as(uid, sql)        true if it runs without an error as that user
--   tests.set_pepper()               a test email_hash pepper in Vault
begin;
select plan(1);

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.uid(who text)
returns uuid
language sql
immutable
as $$
  select case upper(who)
    when 'A'     then '00000000-0000-4000-8000-00000000000a'
    when 'B'     then '00000000-0000-4000-8000-00000000000b'
    when 'C'     then '00000000-0000-4000-8000-00000000000c'
    when 'D'     then '00000000-0000-4000-8000-00000000000d'
    when 'MOD'   then '00000000-0000-4000-8000-0000000000e1'
    when 'OWN'   then '00000000-0000-4000-8000-0000000000e2'
    when 'NOMFA' then '00000000-0000-4000-8000-0000000000e3'
    when 'OSU'   then '00000000-0000-4000-8000-0000000c0001'
    when 'UMICH' then '00000000-0000-4000-8000-0000000c0002'
  end::uuid
$$;

create or replace function tests.create_fixtures()
returns void
language plpgsql
as $$
declare
  rules text := (select value #>> '{}' from public.app_config where key = 'rules_version');
begin
  -- Start from an empty campus world: seed.sql data (local demo campuses and
  -- users) would collide with the fixtures. Each test file rolls this back.
  delete from auth.users;
  truncate public.campuses cascade;
  perform tests.set_pepper();

  insert into public.campuses (id, slug, name, short_name, status, timezone) values
    (tests.uid('OSU'), 'osu', 'The Ohio State University', 'Ohio State', 'live', 'America/New_York'),
    (tests.uid('UMICH'), 'umich', 'University of Michigan', 'Michigan', 'waitlist', 'America/Detroit');
  insert into public.campus_domains (domain, campus_id, kind) values
    ('osu.edu', tests.uid('OSU'), 'student'),
    ('alumni.osu.edu', tests.uid('OSU'), 'blocked'),
    ('umich.edu', tests.uid('UMICH'), 'student');

  insert into auth.users (id, email)
  select tests.uid(u), lower(u) || '@' || case when u = 'D' then 'umich.edu' else 'osu.edu' end
  from unnest(array['A','B','C','D','MOD','OWN','NOMFA']) as u;

  insert into public.profiles
    (id, campus_id, email_hash, status, first_name, last_initial, verified_until,
     adult_confirmed_at, age_method, rules_accepted_at, rules_version)
  select tests.uid(u),
         case when u = 'D' then tests.uid('UMICH') else tests.uid('OSU') end,
         'fixture-' || lower(u),
         case when u = 'D' then 'waitlist'::public.user_status else 'active' end,
         case u when 'A' then 'Aisha' when 'B' then 'Ben' when 'C' then 'Cam' when 'D' then 'Dana'
                when 'MOD' then 'Mo' when 'OWN' then 'Olive' else 'Nora' end,
         left(u, 1), current_date + 365,
         now(), 'self_declared', now(), rules
  from unnest(array['A','B','C','D','MOD','OWN','NOMFA']) as u
  on conflict (id) do update set
    campus_id = excluded.campus_id, email_hash = excluded.email_hash, status = excluded.status,
    first_name = excluded.first_name, last_initial = excluded.last_initial,
    verified_until = excluded.verified_until, adult_confirmed_at = excluded.adult_confirmed_at,
    age_method = excluded.age_method, rules_accepted_at = excluded.rules_accepted_at,
    rules_version = excluded.rules_version;

  insert into public.admins (user_id, role, campus_id) values
    (tests.uid('MOD'), 'moderator', tests.uid('OSU')),
    (tests.uid('OWN'), 'owner', null),
    (tests.uid('NOMFA'), 'owner', null);
end;
$$;

-- Claims only (role unchanged): for testing private helpers that read auth.uid().
create or replace function tests.set_claims(who uuid, aal text default 'aal1')
returns void
language plpgsql
as $$
declare
  p public.profiles;
  admin_role text;
begin
  select * into p from public.profiles where id = who;
  select role::text into admin_role from public.admins where user_id = who;
  perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub', who, 'role', 'authenticated', 'aal', aal,
    'campus_id', p.campus_id, 'status', p.status,
    'adult', p.adult_confirmed_at is not null, 'admin_role', admin_role)::text, true);
end;
$$;

create or replace function tests.authenticate_as(who uuid, aal text default 'aal1')
returns void
language plpgsql
as $$
begin
  perform tests.set_claims(who, aal);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.authenticate_service()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;

create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Time travel for one transaction (P3-TEST-02). Call before authenticate_as.
create or replace function tests.set_now(ts timestamptz)
returns void
language plpgsql
as $fn$
begin
  execute format(
    'create or replace function private.now() returns timestamptz '
      || 'language sql stable set search_path = '''' as %L',
    format('select %L::timestamptz', ts));
end;
$fn$;

create or replace function tests.try_ok(sql text)
returns boolean
language plpgsql
as $$
begin
  execute sql;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function tests.try_text(sql text)
returns text
language plpgsql
as $$
declare
  result text;
begin
  execute sql into result;
  return result;
exception when others then
  return 'ERROR: ' || sqlerrm;
end;
$$;

-- Run SQL as a signed-in user and come back as the test owner, so pgTAP
-- assertions never run under the API roles.
create or replace function tests.try_text_as(who uuid, sql text)
returns text
language plpgsql
as $fn$
declare
  result text;
begin
  perform tests.authenticate_as(who);
  begin
    execute sql into result;
  exception when others then
    result := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  return result;
end;
$fn$;

create or replace function tests.try_ok_as(who uuid, sql text)
returns boolean
language plpgsql
as $fn$
declare
  succeeded boolean := true;
begin
  perform tests.authenticate_as(who);
  begin
    execute sql;
  exception when others then
    succeeded := false;
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  return succeeded;
end;
$fn$;

create or replace function tests.set_pepper()
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'email_hash_pepper') then
    perform vault.create_secret('test-pepper-not-a-real-secret', 'email_hash_pepper');
  end if;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

select ok(true, 'test helpers installed in schema tests');
select * from finish();
commit;
