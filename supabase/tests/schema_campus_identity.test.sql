-- P3-DB-02: campus and identity tables behave as DATA_MODEL §2.1 says.
begin;
select plan(14);

insert into public.campuses (id, slug, name, short_name, status)
values ('00000000-0000-4000-8000-00000000c001', 'test-u', 'Test University', 'Test U', 'live');

select throws_ok(
  $$insert into public.campuses (slug, name, short_name) values ('Bad Slug!', 'X', 'X')$$,
  '23514', null, 'campus slug must be lowercase letters, digits and dashes'
);
select is(
  (select status::text from public.campuses where slug = 'test-u'), 'live', 'campus status stored'
);
select is(
  (select unlock_threshold from public.campuses where slug = 'test-u'), 500, 'unlock threshold defaults to 500'
);

select throws_ok(
  $$insert into public.campus_domains (domain, campus_id, kind)
    values ('Test.EDU', '00000000-0000-4000-8000-00000000c001', 'student')$$,
  '23514', null, 'school domains are stored lowercase'
);
select throws_ok(
  $$insert into public.campus_domains (domain, campus_id, kind)
    values ('test.edu', '00000000-0000-4000-8000-00000000c001', 'faculty')$$,
  '23514', null, 'domain kind is student or blocked'
);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'maya@test.edu'),
  ('00000000-0000-4000-8000-0000000000a2', 'sam@test.edu');
insert into public.profiles (id, campus_id, email_hash, first_name, last_initial, verified_until)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'h1', 'Maya', 'C', current_date + 365),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000c001', 'h2', 'Sam', null, current_date + 365);

select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'),
  'Maya C.', 'display_name is first name and initial'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000a2'),
  'Sam', 'display_name without an initial is just the first name'
);
select matches(
  (select invite_code from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'),
  '^[A-HJKMNP-Z2-9]{8}$', 'invite_code is filled in by default'
);
select is(
  (select theme_mode || analytics_opt_in::text || crash_reports_opt_in::text
   from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'),
  'systemtruetrue', 'theme_mode system; analytics and crash reports on by default'
);
select throws_ok(
  $$update public.profiles set theme_mode = 'sepia' where id = '00000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'theme_mode is system, light or dark'
);
select throws_ok(
  $$update public.profiles set bio = repeat('x', 81) where id = '00000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'bio is at most 80 characters'
);
select throws_ok(
  $$update public.profiles set first_name = '' where id = '00000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'first name cannot be empty'
);

update public.profiles set invited_by = '00000000-0000-4000-8000-0000000000a1'
where id = '00000000-0000-4000-8000-0000000000a2';
delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';

select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'),
  0, 'deleting the auth user deletes the profile'
);
select is(
  (select invited_by from public.profiles where id = '00000000-0000-4000-8000-0000000000a2'),
  null::uuid, 'invited_by is cleared, the invitee stays'
);

select * from finish();
rollback;
