-- T-INT-CRON-02 (E-11, DEC 110): pg_cron's run history keeps 7 days, pruned daily.
begin;
select plan(4);
insert into cron.job_run_details (jobid, runid, status, start_time, end_time) values
  (1, 900001, 'succeeded', now() - interval '8 days', now() - interval '8 days'),
  (1, 900002, 'succeeded', now() - interval '6 days', now() - interval '6 days'),
  (1, 900003, 'running', now() - interval '9 days', null);
select is((private.prune_cron_history() ->> 'cron_runs')::int >= 1, true, 'old runs go');
select is((select array_agg(runid order by runid) from cron.job_run_details where runid >= 900001),
  array[900002, 900003]::bigint[], 'the last 7 days and unfinished runs stay');
select is((select schedule from cron.job where jobname = 'prune_cron_history'), '50 9 * * *', 'runs daily');
select is((select command from cron.job where jobname = 'prune_cron_history'), 'select private.prune_cron_history()', 'and calls the prune');
select * from finish();
rollback;
