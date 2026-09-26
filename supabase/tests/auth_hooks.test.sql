-- P3-AUTH-01/02: Auth hooks and the signup trigger (T-INT-AUTH-01/02/03).
begin;
select plan(27);
select tests.create_fixtures();

-- The reviewer campus and one listed reviewer (RELEASE §store review).
insert into public.campuses (id, slug, name, short_name, status, is_demo)
values ('00000000-0000-4000-8000-0000000c0003', 'demo', 'Demo University', 'Demo U', 'live', true);
insert into public.campus_domains (domain, campus_id, kind)
values ('review.onlyswap.test', '00000000-0000-4000-8000-0000000c0003', 'student');
insert into public.review_accounts (email) values ('appreview@review.onlyswap.test') on conflict do nothing;
insert into public.age_blocks (email_hash) values (private.email_hash('kid@osu.edu'));
insert into public.banned_hashes (email_hash) values (private.email_hash('gone@osu.edu'));

create function pg_temp.before(email text) returns text language sql as $$
  select coalesce(private.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', email)))
                  #>> '{error,message}', 'allow')
$$;

-- T-INT-AUTH-01 ---------------------------------------------------------------------
select is(pg_temp.before('new@osu.edu'), 'allow', 'AUTH-01 a student domain is allowed');
select is(pg_temp.before('  New@OSU.edu '), 'allow', 'AUTH-01 case and spaces do not matter');
select is(pg_temp.before('someone@gmail.com'), 'SCHOOL_UNKNOWN', 'AUTH-01 an unknown domain is SCHOOL_UNKNOWN');
select is(pg_temp.before('old@alumni.osu.edu'), 'DOMAIN_BLOCKED', 'AUTH-01 a blocked domain is DOMAIN_BLOCKED');
select is(pg_temp.before('kid@osu.edu'), 'AGE_BLOCKED', 'AUTH-01 an age-blocked email is AGE_BLOCKED');
select is(pg_temp.before('Gone@osu.edu'), 'BANNED', 'AUTH-01 a banned email is BANNED');
select is(pg_temp.before('random@review.onlyswap.test'), 'SCHOOL_UNKNOWN',
  'AUTH-01 the reviewer domain admits only listed accounts');
select is(pg_temp.before('appreview@review.onlyswap.test'), 'allow', 'AUTH-01 a listed reviewer is allowed');
select is(pg_temp.before('not-an-email'), 'SCHOOL_UNKNOWN', 'AUTH-01 a malformed address is refused');
select is(pg_temp.before(null), 'SCHOOL_UNKNOWN', 'AUTH-01 a missing address is refused');
select is(
  private.hook_before_user_created('{"user":{"email":"x@gmail.com"}}') -> 'error' ->> 'http_code', '403',
  'AUTH-01 rejections use http_code 403');

-- T-INT-AUTH-02: access-token claims -------------------------------------------------
create function pg_temp.claims(who uuid) returns jsonb language sql as $$
  select private.hook_custom_access_token(jsonb_build_object(
    'user_id', who, 'authentication_method', 'otp',
    'claims', jsonb_build_object('sub', who, 'role', 'authenticated', 'aal', 'aal1'))) -> 'claims'
$$;
select is(
  (select c ->> 'campus_id' || ':' || (c ->> 'status') || ':' || (c ->> 'adult') || ':' || coalesce(c ->> 'admin_role', 'none')
   from pg_temp.claims(tests.uid('A')) c),
  tests.uid('OSU')::text || ':active:true:none', 'AUTH-02 a student gets campus, status and adult');
select is(pg_temp.claims(tests.uid('MOD')) ->> 'admin_role', 'moderator', 'AUTH-02 moderator role claim');
select is(pg_temp.claims(tests.uid('OWN')) ->> 'admin_role', 'owner', 'AUTH-02 owner role claim');
select is(pg_temp.claims(tests.uid('D')) ->> 'status', 'waitlist', 'AUTH-02 waitlist status claim');
update public.profiles set status = 'suspended', adult_confirmed_at = null where id = tests.uid('C');
select is((select (c ->> 'status') || ':' || (c ->> 'adult') from pg_temp.claims(tests.uid('C')) c),
  'suspended:false', 'AUTH-02 claims follow the live profile');
select is((select (c ->> 'aal') || ':' || (c ->> 'role') from pg_temp.claims(tests.uid('A')) c),
  'aal1:authenticated', 'AUTH-02 the standard claims are kept');

-- T-INT-AUTH-03: the signup trigger ----------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000f1', 'Newbie@osu.edu',
   jsonb_build_object('invite_code', lower((select invite_code from public.profiles where id = tests.uid('A'))))),
  ('00000000-0000-4000-8000-0000000000f2', 'wait@umich.edu',
   jsonb_build_object('invite_code', (select invite_code from public.profiles where id = tests.uid('A'))));
select is(
  (select campus_id::text || ':' || status::text from public.profiles where id = '00000000-0000-4000-8000-0000000000f1'),
  tests.uid('OSU')::text || ':active', 'AUTH-03 profile on the live campus is active');
select is((select invited_by from public.profiles where id = '00000000-0000-4000-8000-0000000000f1'), tests.uid('A'),
  'AUTH-03 invite link recorded');
select is((select email_hash from public.profiles where id = '00000000-0000-4000-8000-0000000000f1'),
  private.email_hash('newbie@osu.edu'), 'AUTH-03 email is stored only as the peppered hash');
select is((select verified_until from public.profiles where id = '00000000-0000-4000-8000-0000000000f1'),
  (current_date + interval '12 months')::date, 'AUTH-03 verified for the campus re-verify period');
select ok(exists (select 1 from public.notification_prefs where user_id = '00000000-0000-4000-8000-0000000000f1'),
  'AUTH-03 notification preferences created');
select is(
  (select status::text || ':' || coalesce(invited_by::text, 'none') from public.profiles where id = '00000000-0000-4000-8000-0000000000f2'),
  'waitlist:none', 'AUTH-03 a campus that is not live gives waitlist; a cross-campus invite is ignored');
select throws_ok(
  $$insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f3', 'x@gmail.com')$$,
  'P0001', 'SCHOOL_UNKNOWN', 'AUTH-03 no profile without a school (the hook refuses these first)');

-- Only Auth can run the hooks ---------------------------------------------------------------
select ok(has_function_privilege('supabase_auth_admin', 'private.hook_before_user_created(jsonb)', 'execute')
  and has_function_privilege('supabase_auth_admin', 'private.hook_custom_access_token(jsonb)', 'execute'),
  'supabase_auth_admin can run both hooks');
select ok(not has_function_privilege('authenticated', 'private.hook_custom_access_token(jsonb)', 'execute')
  and not has_function_privilege('anon', 'private.hook_before_user_created(jsonb)', 'execute')
  and not has_function_privilege('service_role', 'private.hook_before_user_created(jsonb)', 'execute'),
  'API roles cannot call the hooks');
select ok(not has_function_privilege('authenticated', 'private.handle_new_user()', 'execute'),
  'API roles cannot call the signup trigger function');

select * from finish();
rollback;
