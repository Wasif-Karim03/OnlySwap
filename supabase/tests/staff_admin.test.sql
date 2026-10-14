-- Staff admin accounts (0210, DEC 94, SECURITY T21): the main admin email is a
-- Gmail address, not a school email. It passes the sign-up hook, becomes an
-- owner with no profile, is named by its email in the console and audit log,
-- still needs the two-step check, and the staff list is closed to the API.
begin;
select plan(16);
select tests.create_fixtures();
select tests.set_pepper();

create function pg_temp.as_user(who uuid, q text, aal text default 'aal2') returns text language plpgsql as $$
declare
  res text;
begin
  perform tests.authenticate_as(who, aal);
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;

-- Sign-up hook ---------------------------------------------------------------------------------
select is(private.hook_before_user_created('{"user":{"email":"MdWasifKarim2003@Gmail.com "}}'), '{}'::jsonb,
  'the main admin email passes the sign-up hook (any case, trimmed)');
select is(private.hook_before_user_created('{"user":{"email":"someone.else@gmail.com"}}') #>> '{error,message}', 'SCHOOL_UNKNOWN',
  'another Gmail address is still refused');
select is(private.hook_before_user_created('{"user":{"email":"a@osu.edu"}}'), '{}'::jsonb,
  'school emails still pass');

insert into public.banned_hashes (email_hash) values (private.email_hash('mdwasifkarim2003@gmail.com'));
select is(private.hook_before_user_created('{"user":{"email":"mdwasifkarim2003@gmail.com"}}') #>> '{error,message}', 'BANNED',
  'a ban still blocks a staff email');
delete from public.banned_hashes where email_hash = private.email_hash('mdwasifkarim2003@gmail.com');

-- New account ----------------------------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f1', 'mdwasifkarim2003@gmail.com');
select is((select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-0000000000f1'), 0,
  'the staff account gets no profile (never in the app, lists or metrics)');
select is((select role::text from public.admins where user_id = '00000000-0000-4000-8000-0000000000f1'), 'owner',
  'the staff account is an owner');
select is((select campus_id from public.admins where user_id = '00000000-0000-4000-8000-0000000000f1'), null::uuid,
  'the owner covers every campus');
select is((select count(*)::int from public.notification_prefs where user_id = '00000000-0000-4000-8000-0000000000f1'), 0,
  'no notification preferences (no pushes or emails as a student)');

-- Console ----------------------------------------------------------------------------------------
select is(pg_temp.as_user('00000000-0000-4000-8000-0000000000f1', 'select public.admin_whoami() ->> ''name'''),
  'mdwasifkarim2003@gmail.com', 'whoami names the staff admin by email');
select is(pg_temp.as_user('00000000-0000-4000-8000-0000000000f1', 'select public.admin_whoami() ->> ''role'''),
  'owner', 'whoami returns the owner role');
select ok(pg_temp.as_user('00000000-0000-4000-8000-0000000000f1', 'select private.person_brief(''00000000-0000-4000-8000-0000000000f1'') ->> ''display_name''', 'aal2') ~ '^ERROR: permission denied',
  'private helpers stay closed to the API');
select is(private.person_brief('00000000-0000-4000-8000-0000000000f1') ->> 'display_name', 'mdwasifkarim2003@gmail.com',
  'the audit log names staff actions by email');
select ok(pg_temp.as_user('00000000-0000-4000-8000-0000000000f1', 'select count(*)::text from public.admin_list_admins()') !~ '^ERROR',
  'with the two-step check the staff owner can use owner tools');
select is(pg_temp.as_user('00000000-0000-4000-8000-0000000000f1', 'select count(*)::text from public.admin_list_admins()', 'aal1'),
  'ERROR: NOT_ADMIN', 'without the two-step check the staff owner is refused');

select ok(pg_temp.as_user(tests.uid('A'), 'select count(*)::text from private.staff_emails') ~ '^ERROR: permission denied',
  'students cannot read the staff list');

delete from auth.users where id = '00000000-0000-4000-8000-0000000000f1';
select is((select count(*)::int from public.admins where user_id = '00000000-0000-4000-8000-0000000000f1'), 0,
  'deleting the staff account removes its admin row');

select * from finish();
rollback;
