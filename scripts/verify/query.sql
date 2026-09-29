select jobname, schedule, active from cron.job order by jobname;
select j.jobname, d.status, left(d.return_message, 200) as msg, d.start_time
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 where j.jobname in ('demo_autoplay') order by d.start_time desc limit 5;
select o.status, o.last_actor, o.created_at, p.first_name as seller
  from public.offers o join public.profiles p on p.id = o.seller_id order by o.created_at desc limit 5;
select private.demo_autoplay();
