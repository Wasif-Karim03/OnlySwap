-- 0225_cron_history.sql · E-11, DEC 110.
-- pg_cron logs every run in cron.job_run_details and never prunes it: about
-- 4,800 rows a day from the per-minute jobs (about 600 MB a year on a 500 MB
-- database). Keep 7 days (the admin health page reads the last 24 h), daily.
-- Runs still in progress (no end_time) are kept.

create or replace function private.prune_cron_history()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int := 0;
begin
  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where end_time < now() - interval ''7 days''';
    get diagnostics n = row_count;
  end if;
  return jsonb_build_object('cron_runs', n);
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('prune_cron_history', '50 9 * * *', 'select private.prune_cron_history()');
  end if;
end;
$$;

revoke all on function private.prune_cron_history() from public, anon, authenticated;
