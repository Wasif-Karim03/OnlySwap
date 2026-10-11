-- Staging tools read (admin_mock_status, owu-mock.sql, DEC 92). Not in
-- supabase/tests on purpose: the mock data is staging only, so CI never loads
-- it. Run it on a local database with the migrations and
-- supabase/tests/000_setup.test.sql applied; it loads owu.sql and
-- owu-mock.sql itself and rolls everything back (supabase/campuses/README.md).
-- Checks: owner with the two-step check only; counts of mock users and
-- listings; the bot job, its last run and failures; the action log; read only
-- (no audit row); owu-mock-remove.sql drops the function.
begin;
select plan(17);
select tests.create_fixtures();
\o /dev/null
\ir ../owu.sql
\ir ../owu-mock.sql
\o

create function pg_temp.as_admin(who text, q text, aal text default 'aal2') returns text language plpgsql as $$
declare
  res text;
begin
  perform tests.authenticate_as(tests.uid(who), aal);
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;
create function pg_temp.status() returns jsonb language plpgsql as $$
declare
  res jsonb;
begin
  perform tests.authenticate_as(tests.uid('OWN'), 'aal2');
  res := public.admin_mock_status();
  perform set_config('role', 'none', true);
  return res;
end;
$$;

select ok((select p.prosecdef from pg_proc p where p.oid = 'public.admin_mock_status()'::regprocedure),
  'admin_mock_status is security definer');
select ok(not has_function_privilege('anon', 'public.admin_mock_status()', 'execute')
          and has_function_privilege('authenticated', 'public.admin_mock_status()', 'execute'),
  'signed-in callers may call it, anon may not');
select is(pg_temp.as_admin('A', $$select public.admin_mock_status()::text$$), 'ERROR: NOT_ADMIN', 'students are refused');
select is(pg_temp.as_admin('MOD', $$select public.admin_mock_status()::text$$), 'ERROR: NOT_ADMIN', 'moderators are refused');
select is(pg_temp.as_admin('OWN', $$select public.admin_mock_status()::text$$, 'aal1'), 'ERROR: NOT_ADMIN',
  'the owner without the two-step check is refused');

select is(pg_temp.status() -> 'users', '{"active": 6, "total": 6}'::jsonb, 'six mock students, all active');
select is(pg_temp.status() -> 'listings',
  '{"discover": 24, "food_live": 2, "wanted": 2, "sold": 0, "total": 28}'::jsonb, 'mock listings by place in the app');
select is((pg_temp.status() ->> 'photos')::int, 26, 'one photo per sale, free and food listing');
select is((pg_temp.status() -> 'bot') - 'last_run'::text,
  '{"jobname": "mock_bot", "schedule": "* * * * *", "active": true, "runs_24h": 0, "failures_24h": 0}'::jsonb,
  'the bot job is scheduled every minute');
select ok(pg_temp.status() -> 'bot' -> 'last_run' = 'null'::jsonb, 'no run yet');

-- Two runs (the latest failed) and three actions (one failed).
insert into cron.job_run_details (jobid, status, return_message, start_time, end_time)
select j.jobid, x.status, x.msg, now() - x.ago, now() - x.ago + interval '1 second'
from cron.job j
cross join (values ('succeeded', '1 row', interval '3 minutes'), ('failed', 'ERROR: boom', interval '1 minute'),
                   ('succeeded', '1 row', interval '2 days')) as x(status, msg, ago)
where j.jobname = 'mock_bot';
insert into mock.log (at, actor, action, ref, ok, detail) values
  (now() - interval '3 minutes', 'b0000000-0000-4000-8000-000000000001', 'accept_offer', gen_random_uuid(), true, null),
  (now() - interval '2 minutes', 'b0000000-0000-4000-8000-000000000002', 'reply', gen_random_uuid(), false, 'CHAT_CLOSED'),
  (now() - interval '1 minute', 'b0000000-0000-4000-8000-000000000005', 'make_offer', gen_random_uuid(), true, null),
  (now() - interval '3 days', 'b0000000-0000-4000-8000-000000000001', 'hello', gen_random_uuid(), true, null);

select is(pg_temp.status() -> 'bot' -> 'last_run' ->> 'status', 'failed', 'the last run is the latest one');
select is((pg_temp.status() -> 'bot' ->> 'runs_24h') || ':' || (pg_temp.status() -> 'bot' ->> 'failures_24h'), '2:1',
  'runs and failures in the last 24 hours');
select is(pg_temp.status() -> 'actions', '{"ok_24h": 2, "failed_24h": 1, "ok_total": 3, "failed_total": 1}'::jsonb,
  'bot actions, last 24 hours and all');
select is((select string_agg(e ->> 'action', ',' order by ord) from jsonb_array_elements(pg_temp.status() -> 'recent') with ordinality as t(e, ord)),
  'make_offer,reply,accept_offer,hello', 'recent actions, newest first');
select is((select string_agg((e ->> 'action') || '/' || (e ->> 'detail') || '/' || (e ->> 'actor_name'), ',')
           from jsonb_array_elements(pg_temp.status() -> 'recent_failures') e),
  'reply/CHAT_CLOSED/' || (select display_name from public.profiles where id = 'b0000000-0000-4000-8000-000000000002'),
  'failures only, with the mock student''s name');

select is((select count(*)::int from public.audit_log), 0, 'reading the status writes no audit row');

\o /dev/null
\ir ../owu-mock-remove.sql
\o
select hasnt_function('public', 'admin_mock_status', 'owu-mock-remove.sql drops the console read');

select * from finish();
rollback;
