-- A-11 (audit): Quad auto-hide counts only reporters whose accounts are older
-- than 7 days (SECURITY abuse table: report brigading), like listings already do
-- (trg_reports_ai). Three fresh accounts can no longer take a post down.
begin;
select plan(5);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.quad_posts (id, campus_id, author_id, body, status) values
  ('00000000-0000-4000-8000-00000000fa01', tests.uid('OSU'), tests.uid('A'), 'parking is a mess', 'live'),
  ('00000000-0000-4000-8000-00000000fa02', tests.uid('OSU'), tests.uid('A'), 'best coffee on campus', 'live');
insert into public.quad_replies (id, post_id, author_id, body, alias_no) values
  ('00000000-0000-4000-8000-00000000fb01', '00000000-0000-4000-8000-00000000fa02', tests.uid('A'), 'try the union', 1);

-- MOD joined two days ago; everyone else has been here for months.
update public.profiles set created_at = '2027-03-08 12:00-05' where id = tests.uid('MOD');

create function pg_temp.report(who text, kind text, target text) returns text language sql as $$
  select tests.try_text_as(tests.uid(who),
    format($q$select public.create_report(%L, %L, 'harassment')::text$q$, kind, target))
$$;
create function pg_temp.post_status(p text) returns text language sql as $$
  select status::text from public.quad_posts where id = p::uuid
$$;

select pg_temp.report('B', 'quad_post', '00000000-0000-4000-8000-00000000fa01');
select pg_temp.report('C', 'quad_post', '00000000-0000-4000-8000-00000000fa01');
select pg_temp.report('MOD', 'quad_post', '00000000-0000-4000-8000-00000000fa01');
select is(pg_temp.post_status('00000000-0000-4000-8000-00000000fa01'), 'live',
  'two settled reporters and one new account do not hide a post');

select pg_temp.report('OWN', 'quad_post', '00000000-0000-4000-8000-00000000fa01');
select is(pg_temp.post_status('00000000-0000-4000-8000-00000000fa01'), 'held',
  'the third reporter older than 7 days hides it');
select is((select hold_reason from public.quad_posts where id = '00000000-0000-4000-8000-00000000fa01'), 'reports',
  'held for reports');

-- Three brand-new accounts.
update public.profiles set created_at = '2027-03-09 12:00-05' where id in (tests.uid('B'), tests.uid('C'));
select pg_temp.report('B', 'quad_post', '00000000-0000-4000-8000-00000000fa02');
select pg_temp.report('C', 'quad_post', '00000000-0000-4000-8000-00000000fa02');
select pg_temp.report('MOD', 'quad_post', '00000000-0000-4000-8000-00000000fa02');
select is(pg_temp.post_status('00000000-0000-4000-8000-00000000fa02'), 'live',
  'three new accounts cannot hide a post');

select pg_temp.report('B', 'quad_reply', '00000000-0000-4000-8000-00000000fb01');
select pg_temp.report('C', 'quad_reply', '00000000-0000-4000-8000-00000000fb01');
select pg_temp.report('OWN', 'quad_reply', '00000000-0000-4000-8000-00000000fb01');
select is((select status::text from public.quad_replies where id = '00000000-0000-4000-8000-00000000fb01'), 'live',
  'or a reply');

select * from finish();
rollback;
