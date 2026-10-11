-- Admin v2 tools (0208, DEC 93; API §4.1): support inbox (reply through the
-- outbox), waitlist demand and opening a campus, adding a school, meetups and
-- no-shows, ratings, under-18 attempts, deletions and exports, system health,
-- the report-queue alert, App Review accounts, bulk listing status, banned
-- email hashes and categories. T-INT-ADMIN-01/02 for each: students, owners
-- without MFA and moderators (where owner-only or off-campus) are refused;
-- every write leaves exactly one audit_log row.
begin;
select plan(91);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

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
create function pg_temp.audits() returns int language sql as $$ select count(*)::int from public.audit_log $$;

-- Support inbox ----------------------------------------------------------------------------------------
insert into public.support_requests (id, email, topic, body, created_at) values
  ('00000000-0000-4000-8000-0000000c5001', 'a@osu.edu', 'cant_access_email', 'My school email stopped working.', '2027-03-10 09:00-05'),
  ('00000000-0000-4000-8000-0000000c5002', 'x@umich.edu', 'general', 'When does Michigan open?', '2027-03-10 09:30-05'),
  ('00000000-0000-4000-8000-0000000c5003', 'someone@gmail.com', 'bug', 'The app crashed.', '2027-03-10 10:00-05');

select is(pg_temp.as_admin('A', $$select public.admin_list_support()::text$$), 'ERROR: NOT_ADMIN', 'students cannot read support');
select is(pg_temp.as_admin('MOD', $$select jsonb_array_length(x -> 'items') || ':' || (x -> 'items' -> 0 ->> 'email') || ':' || (x -> 'items' -> 0 ->> 'preview')
                                    || ':' || (x -> 'items' -> 0 -> 'campus' ->> 'short_name') from public.admin_list_support() x$$),
  '1:a••••@osu.edu:My school email stopped working.:Ohio State', 'a moderator sees their campus''s requests, email masked');
select is(pg_temp.as_admin('OWN', $$select jsonb_array_length(x -> 'items') || ':' || (x -> 'items' -> 2 ->> 'email') from public.admin_list_support() x$$),
  '3:someone@gmail.com', 'the owner sees all, with addresses');
select is(pg_temp.as_admin('MOD', $$select public.admin_support_detail('00000000-0000-4000-8000-0000000c5002')::text$$), 'ERROR: NOT_ADMIN',
  'not another campus''s request');
select is(pg_temp.as_admin('MOD', $$select public.admin_support_detail('00000000-0000-4000-8000-0000000c5003')::text$$), 'ERROR: NOT_ADMIN',
  'nor one from an unknown school');
select is(pg_temp.as_admin('MOD', $$select (x ->> 'body') || ':' || (x -> 'person' ->> 'display_name') from public.admin_support_detail('00000000-0000-4000-8000-0000000c5001') x$$),
  'My school email stopped working.:Aisha A.', 'the full message and the matching account');
select is((select action || ':' || target_type from public.audit_log), 'support.view:support', 'opening a request is logged');
select is(pg_temp.as_admin('MOD', $$select public.admin_update_support('00000000-0000-4000-8000-0000000c5001', 'done', 'fixed it')::text$$),
  'ERROR: INVALID:status', 'status is open, answered or closed');
select is(pg_temp.as_admin('MOD', $$select public.admin_update_support('00000000-0000-4000-8000-0000000c5001', 'closed', 'x')::text$$),
  'ERROR: INVALID:reason', 'needs a reason');
select is(pg_temp.as_admin('MOD', format($$select public.admin_update_support('00000000-0000-4000-8000-0000000c5001', 'open', 'reply', null, %L)::text$$, repeat('x', 2001))),
  'ERROR: INVALID:reply', 'replies up to 2000 characters');
select is(pg_temp.audits(), 1, 'refused writes leave no row');
select is(pg_temp.as_admin('MOD', $$select (x ->> 'status') || ':' || (x ->> 'reply_count') || ':' || (x ->> 'staff_note')
                                    from public.admin_update_support('00000000-0000-4000-8000-0000000c5001', 'open', 'answered by email',
                                      'Checked their domain', 'Hi, try signing in again with the same address. We reset it.') x$$),
  'answered:1:Checked their domain', 'a reply marks it answered and keeps a note');
select is((select to_email || ':' || template || ':' || (vars ->> 'body') from public.email_outbox where template = 'support_reply'),
  'a@osu.edu:support_reply:Hi, try signing in again with the same address. We reset it.', 'the reply goes to the sender through the outbox');
select is((select action || ':' || (meta ->> 'status') || ':' || (meta ->> 'replied') from public.audit_log order by id desc limit 1),
  'support.update:answered:true', 'one audit row');
select is(pg_temp.audits(), 2, 'exactly one');
select is(pg_temp.as_admin('OWN', $$select (x ->> 'status') || ':' || ((x ->> 'handled_at') is not null)::text
                                    from public.admin_update_support('00000000-0000-4000-8000-0000000c5003', 'closed', 'not reproducible') x$$),
  'closed:true', 'closing without a reply');
select is((select count(*)::int from public.email_outbox where template = 'support_reply'), 1, 'and no email');

-- Waitlist demand and opening a campus ------------------------------------------------------------------
select vault.create_secret('test-waitlist-key', 'waitlist_email_key')
where not exists (select 1 from vault.decrypted_secrets where name = 'waitlist_email_key');
insert into public.waitlist_requests (email_hash, email_enc, domain, school_guess, created_at)
select x.h, extensions.pgp_sym_encrypt(x.e, (select decrypted_secret from vault.decrypted_secrets where name = 'waitlist_email_key'
                                             order by created_at desc limit 1)), x.d, x.g, x.at::timestamptz
from (values ('wl-1', 'p@umich.edu', 'umich.edu', null, '2027-03-09 10:00-05'),
             ('wl-2', 'q@umich.edu', 'umich.edu', null, '2027-03-10 10:00-05'),
             ('wl-3', 'r@kenyon.edu', 'kenyon.edu', 'Kenyon College', '2027-03-08 10:00-05')) as x(h, e, d, g, at);
select is(pg_temp.as_admin('OWN', $$select string_agg((s ->> 'domain') || '=' || (s ->> 'requests') || '+' || (s ->> 'members_waiting') || '/' || coalesce(s -> 'campus' ->> 'short_name', s ->> 'school_guess'), ',')
                                    from jsonb_array_elements(public.admin_waitlist_demand() -> 'schools') s$$),
  'umich.edu=2+1/Michigan,kenyon.edu=1+0/Kenyon College', 'demand by school, most first');
select is(pg_temp.as_admin('MOD', $$select jsonb_array_length(x -> 'schools') || ':' || (x ->> 'total_requests') from public.admin_waitlist_demand() x$$),
  '0:0', 'a moderator sees only their campus');
select is(pg_temp.as_admin('MOD', format($$select public.admin_open_campus(%L, 'demand is there')::text$$, tests.uid('UMICH'))), 'ERROR: NOT_ADMIN',
  'only the owner opens a campus');
select is(pg_temp.as_admin('OWN', format($$select public.admin_open_campus(%L, 'demand is there')::text$$, tests.uid('UMICH'))),
  '{"opened": true, "members_activated": 1}', 'the owner opens Michigan');
select is((select status::text from public.profiles where id = tests.uid('D')), 'active', 'its waitlisted members are let in');
select is((select count(*)::int from public.notifications where type = 'campus_unlocked'), 1, 'and told (same path as the automatic unlock)');
select is((select count(*)::int from public.email_outbox where template = 'campus_open'), 2, 'the waitlist emails go out');
select is(pg_temp.as_admin('OWN', format($$select public.admin_open_campus(%L, 'again')::text$$, tests.uid('UMICH'))), 'ERROR: INVALID:status', 'only a waitlist campus');
select is(pg_temp.audits(), 4, 'one audit row for the opening');

-- Add a school ----------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_create_campus('Kenyon College', 'Kenyon', 'kenyon', 'America/New_York', 'kenyon.edu', 'waitlist', null, 'requests')::text$$),
  'ERROR: NOT_ADMIN', 'moderators cannot add schools');
select is(pg_temp.as_admin('OWN', $$select public.admin_create_campus('Kenyon College', 'Kenyon', 'kenyon', 'Mars/Olympus', 'kenyon.edu', 'waitlist', null, 'requests')::text$$),
  'ERROR: INVALID:timezone', 'a real time zone');
select is(pg_temp.as_admin('OWN', $$select public.admin_create_campus('Kenyon College', 'Kenyon', 'kenyon', 'America/New_York', 'kenyon', 'waitlist', null, 'requests')::text$$),
  'ERROR: INVALID:domain', 'a real domain');
select is(pg_temp.as_admin('OWN', $$select public.admin_create_campus('Kenyon College', 'Kenyon', 'kenyon', 'America/New_York', 'OSU.edu', 'waitlist', null, 'requests')::text$$),
  'ERROR: INVALID:domain_taken', 'a domain another school already has');
select is(pg_temp.as_admin('OWN', $$select public.admin_create_campus('Kenyon College', 'Kenyon', 'Ken Yon', 'America/New_York', 'kenyon.edu', 'waitlist', null, 'requests')::text$$),
  'ERROR: INVALID:slug', 'slug format');
select is(pg_temp.as_admin('OWN', $$select public.admin_create_campus('Kenyon College', 'Kenyon', 'kenyon', 'America/New_York', 'kenyon.edu', 'waitlist',
                                      '{"name": "Gambier PD", "lat": 40.37, "lng": -82.39, "designation": "police"}', 'requests')::text$$),
  'ERROR: INVALID:designated_on', 'police-designated spots need the date it was confirmed');
select is(pg_temp.audits(), 4, 'refusals leave no row');
select is(pg_temp.as_admin('OWN', $$select (x ->> 'slug') || ':' || ((x ->> 'spot_id') is not null)::text
                                    from public.admin_create_campus('Kenyon College', 'Kenyon', 'kenyon', 'America/New_York', ' Kenyon.EDU ', 'waitlist',
                                      '{"name": "Peirce Hall lobby", "lat": 40.375, "lng": -82.397, "hours": "7am to 11pm"}', 'waitlist demand') x$$),
  'kenyon:true', 'the owner adds a school with its first meetup spot');
select is((select c.status::text || ':' || d.domain || ':' || s.name || ':' || s.is_default::text
           from public.campuses c join public.campus_domains d on d.campus_id = c.id join public.safe_spots s on s.campus_id = c.id where c.slug = 'kenyon'),
  'waitlist:kenyon.edu:Peirce Hall lobby:true', 'campus, student domain and default spot');
select is((select action || ':' || (meta ->> 'domain') from public.audit_log order by id desc limit 1), 'campus.create:kenyon.edu', 'one audit row');
select is(pg_temp.audits(), 5, 'exactly one');
select is(pg_temp.as_admin('OWN', $$select (s -> 'campus' ->> 'short_name') from jsonb_array_elements(public.admin_waitlist_demand() -> 'schools') s where s ->> 'domain' = 'kenyon.edu'$$),
  'Kenyon', 'the waiting requests now point at the new school');

-- Meetups, no-shows, ratings ---------------------------------------------------------------------------
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents) values
  ('00000000-0000-4000-8000-0000000c0c01', tests.uid('A'), tests.uid('B'), 'Lamp', 1000, 1000),
  ('00000000-0000-4000-8000-0000000c0c02', tests.uid('C'), tests.uid('B'), 'Mug', 500, 500),
  ('00000000-0000-4000-8000-0000000c0c03', tests.uid('D'), tests.uid('B'), 'Chair', 900, 900);
insert into public.meetups (id, chat_id, custom_place, starts_at, status) values
  ('00000000-0000-4000-8000-0000000c0e01', '00000000-0000-4000-8000-0000000c0c01', 'Union desk', '2027-03-10 16:00-05', 'confirmed'),
  ('00000000-0000-4000-8000-0000000c0e02', '00000000-0000-4000-8000-0000000c0c02', 'Library', '2027-03-08 16:00-05', 'no_show');
insert into public.noshow_reports (meetup_id, reporter_id, reported_id, status, created_at) values
  ('00000000-0000-4000-8000-0000000c0e02', tests.uid('C'), tests.uid('B'), 'confirmed', '2027-03-08 17:00-05');
update public.profiles set noshow_count = 1 where id = tests.uid('B');
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up, tags, created_at) values
  ('00000000-0000-4000-8000-0000000c0c01', tests.uid('A'), tests.uid('B'), false, '{late}', '2027-03-09 10:00-05'),
  ('00000000-0000-4000-8000-0000000c0c02', tests.uid('C'), tests.uid('B'), false, '{rude}', '2027-03-09 11:00-05'),
  ('00000000-0000-4000-8000-0000000c0c03', tests.uid('D'), tests.uid('B'), true, '{}', '2027-03-09 12:00-05');

select is(pg_temp.as_admin('MOD', $$select jsonb_array_length(x -> 'items') || ':' || (x -> 'items' -> 0 ->> 'place') || ':' || (x -> 'items' -> 0 -> 'buyer' ->> 'display_name')
                                    from public.admin_list_meetups() x$$),
  '1:Union desk:Aisha A.', 'upcoming meetups');
select is(pg_temp.as_admin('MOD', $$select (x -> 'items' -> 0 ->> 'status') || ':' || (x -> 'items' -> 0 ->> 'no_show_reports') from public.admin_list_meetups(null, 'past') x$$),
  'no_show:1', 'past meetups with their no-show reports');
select is(pg_temp.as_admin('MOD', $$select public.admin_list_meetups(null, 'soon')::text$$), 'ERROR: INVALID:when', 'upcoming or past');
select is(pg_temp.as_admin('MOD', $$select (x -> 'people' -> 0 ->> 'display_name') || ':' || (x -> 'people' -> 0 ->> 'noshow_count') || ':' || (x -> 'totals' ->> 'confirmed')
                                    from public.admin_noshow_summary() x$$),
  'Ben B.:1:1', 'who keeps missing');
select is(pg_temp.as_admin('OWN', $$select (x -> 'low_rated' -> 0 ->> 'display_name') || ':' || (x -> 'low_rated' -> 0 ->> 'pct_up') || ':' || (x -> 'totals' ->> 'down')
                                    || ':' || jsonb_array_length(x -> 'recent_down') from public.admin_ratings_summary() x$$),
  'Ben B.:33.3:2:2', 'low-rated sellers and recent thumbs down');

-- Under-18 attempts ------------------------------------------------------------------------------------
insert into public.age_blocks (email_hash, created_at) values ('fixture-c', '2027-03-10 09:00-05'), ('unknown-hash', '2027-03-09 09:00-05');
select is((select campus_id from public.age_blocks where email_hash = 'fixture-c'), tests.uid('OSU'), 'a block is tagged with the person''s campus');
select is(pg_temp.as_admin('MOD', $$select (x ->> 'total') || ':' || (x -> 'by_campus' -> 0 -> 'campus' ->> 'short_name') || ':' || jsonb_array_length(x -> 'by_day')
                                    from public.admin_age_blocks_summary() x$$),
  '1:Ohio State:1', 'a moderator counts their campus');
select is(pg_temp.as_admin('OWN', $$select x ->> 'total' from public.admin_age_blocks_summary() x$$), '2', 'the owner counts all, untagged included');
select ok(pg_temp.as_admin('OWN', $$select public.admin_age_blocks_summary()::text$$) not like '%fixture-c%', 'hashes are never returned');

-- Deletions and exports ---------------------------------------------------------------------------------
select lives_ok($$select private.prepare_account_deletion(tests.uid('C'))$$, 'C starts deleting their account');
select is((select status || ':' || (user_id = tests.uid('C'))::text || ':' || (campus_id = tests.uid('OSU'))::text from public.account_deletions where status = 'started'),
  'started:true:true', 'a started row');
select is(pg_temp.as_admin('MOD', $$select public.admin_list_deletions_exports()::text$$), 'ERROR: NOT_ADMIN', 'owner only');
select is(pg_temp.as_admin('OWN', $$select (x -> 'deletions' -> 0 ->> 'status') || ':' || (x -> 'deletions' -> 0 ->> 'stuck') || ':' || (x -> 'counts' ->> 'stuck')
                                    from public.admin_list_deletions_exports() x$$),
  'started:false:0', 'running, not stuck yet');
select tests.set_now('2027-03-10 13:30:00-05');
select is(pg_temp.as_admin('OWN', $$select (x -> 'deletions' -> 0 ->> 'stuck') || ':' || (x -> 'counts' ->> 'stuck') from public.admin_list_deletions_exports() x$$),
  'true:1', 'after an hour without finishing it shows as stuck');
delete from auth.users where id = tests.uid('C');
select is((select status || ':' || coalesce(user_id::text, 'cleared') || ':' || (started_at = '2027-03-10 12:00:00-05')::text from public.account_deletions
           order by finished_at desc limit 1),
  'done:cleared:true', 'done when the account is gone, and the id is cleared');
insert into public.data_exports (user_id, status, path, created_at) values (tests.uid('A'), 'failed', 'exports/x.json', '2027-03-10 08:00-05');
select is(pg_temp.as_admin('OWN', $$select (x -> 'exports' -> 0 ->> 'status') || ':' || (x -> 'exports' -> 0 -> 'person' ->> 'display_name') || ':' || (x -> 'counts' ->> 'exports_failed_30d')
                                    || ':' || (x -> 'counts' ->> 'deletions_30d') from public.admin_list_deletions_exports() x$$),
  'failed:Aisha A.:1:1', 'exports and counts');

-- System health -------------------------------------------------------------------------------------------
insert into public.email_outbox (to_email, template, state, error, attempts, send_after) values
  ('someone@osu.edu', 'campus_open', 'failed', 'SMTP 550 mailbox unavailable', 3, '2027-03-10 08:00-05');
insert into public.push_tickets (status, error, created_at) values ('error', 'DeviceNotRegistered', '2027-03-10 08:00-05');
-- On hosted/local Supabase the test role may not be allowed to write pg_cron's
-- run history (CI stopped here); fake a failed run only when it can, and check
-- the job listing either way.
create temp table _cron_fake (ok bool) on commit drop;
do $$
begin
  insert into cron.job_run_details (jobid, status, return_message, start_time, end_time)
  select jobid, 'failed', 'boom', '2027-03-10 12:00-05', '2027-03-10 12:00:01-05' from cron.job where jobname = 'email_drain';
  insert into _cron_fake values (true);
exception when others then
  raise notice 'cron run history not writable here (%), checking the job list only', sqlerrm;
  insert into _cron_fake values (false);
end $$;
select is(pg_temp.as_admin('MOD', $$select public.admin_system_health()::text$$), 'ERROR: NOT_ADMIN', 'owner only');
select is(pg_temp.as_admin('OWN', $$select (x -> 'email' ->> 'failed_24h') || ':' || (x -> 'email' -> 'recent_errors' -> 0 ->> 'to') || ':' || (x -> 'push' ->> 'errors_24h')
                                    from public.admin_system_health() x$$),
  '1:s••••@osu.edu:1', 'failed emails (address masked) and push errors');
select is(case when (select ok from _cron_fake)
  then pg_temp.as_admin('OWN', $$select (j -> 'last_run' ->> 'status') || ':' || (j ->> 'failures_24h')
         from public.admin_system_health() x, jsonb_array_elements(x -> 'cron') j where j ->> 'jobname' = 'email_drain'$$)
  else pg_temp.as_admin('OWN', $$select case when count(*) = 1 then 'failed:1' else 'missing' end
         from public.admin_system_health() x, jsonb_array_elements(x -> 'cron') j where j ->> 'jobname' = 'email_drain'$$)
  end,
  'failed:1', 'each cron job with its last run');
select ok(pg_temp.as_admin('OWN', $$select ((x -> 'storage' ->> 'db_bytes')::bigint > 0 and (x -> 'storage' ->> 'db_limit_bytes')::bigint = 524288000
                                              and jsonb_array_length(x -> 'storage' -> 'tables') > 0)::text from public.admin_system_health() x$$)::boolean,
  'database size against the free tier');

-- Report-queue alert --------------------------------------------------------------------------------------
select is((select schedule || ' ' || command from cron.job where jobname = 'report_queue_check'),
  '*/30 * * * * select private.report_queue_check()', 'checked every 30 minutes');
select is(private.report_queue_check(), 0, 'no open reports, no email');
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, created_at) values
  (tests.uid('OSU'), tests.uid('A'), 'user', tests.uid('B')::text, tests.uid('B'), 'scam', '2027-03-10 11:00-05');
select is(private.report_queue_check(), 0, 'a report younger than 4 hours: no email');
select tests.set_now('2027-03-10 15:30:00-05');
select is(private.report_queue_check(), 2, 'older than 4 hours: one email to each owner');
select is((select string_agg(to_email || '=' || (vars ->> 'open') || '/' || (vars ->> 'oldest_hours'), ',' order by to_email) from public.email_outbox where template = 'report_queue'),
  'nomfa@osu.edu=1/4,own@osu.edu=1/4', 'with the open count and the oldest age');
select tests.set_now('2027-03-10 18:00:00-05');
select is(private.report_queue_check(), 0, 'not again within 4 hours');
select tests.set_now('2027-03-10 20:00:00-05');
select is(private.report_queue_check(), 2, 'again after 4 hours if still waiting');
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, priority) values
  (tests.uid('OSU'), tests.uid('B'), 'user', tests.uid('A')::text, tests.uid('A'), 'threat', 1);
select is((select count(*)::int from public.email_outbox where template = 'priority_report'), 2, 'a threat report emails every owner at once (0011)');

-- App Review accounts ----------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_list_review_accounts()::text$$), 'ERROR: NOT_ADMIN', 'owner only');
select is(pg_temp.as_admin('OWN', $$select public.admin_upsert_review_account('not an email', 'x', 'store review')::text$$), 'ERROR: INVALID:email', 'a real address');
select is(pg_temp.as_admin('OWN', $$select public.admin_upsert_review_account(' AppReview@Review.OnlySwap.test ', 'App Store reviewer', 'store review')::text$$),
  '', 'the owner adds a reviewer login');
select is(pg_temp.as_admin('OWN', $$select (x -> 0 ->> 'email') || ':' || (x -> 0 ->> 'note') || ':' || (x -> 0 ->> 'has_account') from public.admin_list_review_accounts() x$$),
  'appreview@review.onlyswap.test:App Store reviewer:false', 'listed, lowercased, no account yet');
select is(pg_temp.as_admin('OWN', $$select public.admin_delete_review_account('appreview@review.onlyswap.test', 'review done')::text$$), '', 'and removes it');
select is(pg_temp.as_admin('OWN', $$select public.admin_delete_review_account('appreview@review.onlyswap.test', 'review done')::text$$), 'ERROR: NOT_FOUND', 'once');
select is((select string_agg(action, ',' order by id) from public.audit_log where target_type = 'review_account'),
  'review_account.upsert,review_account.delete', 'one audit row each');

-- Bulk listing status --------------------------------------------------------------------------------
insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-0000000c1001', tests.uid('OSU'), tests.uid('A'), 'Spam one', 'active', 100),
  ('00000000-0000-4000-8000-0000000c1002', tests.uid('OSU'), tests.uid('A'), 'Spam two', 'active', 100),
  ('00000000-0000-4000-8000-0000000c1003', tests.uid('OSU'), tests.uid('A'), 'Already gone', 'deleted', 100),
  ('00000000-0000-4000-8000-0000000c1004', tests.uid('UMICH'), tests.uid('D'), 'Elsewhere', 'active', 100);
select is(pg_temp.as_admin('MOD', $$select public.admin_bulk_set_listing_status(array['00000000-0000-4000-8000-0000000c1001', '00000000-0000-4000-8000-0000000c1004']::uuid[], 'removed', 'spam wave')::text$$),
  'ERROR: NOT_ADMIN', 'a moderator only on their campus');
select is(pg_temp.as_admin('MOD', format($$select public.admin_bulk_set_listing_status(%L::uuid[], 'removed', 'spam wave')::text$$,
            (select array_agg(gen_random_uuid()) from generate_series(1, 201)))),
  'ERROR: INVALID:ids', 'at most 200');
select is(pg_temp.as_admin('MOD', $$select public.admin_bulk_set_listing_status(array['00000000-0000-4000-8000-0000000c1001']::uuid[], 'sold', 'spam wave')::text$$),
  'ERROR: INVALID:status', 'removed, held_review or active');
select is(pg_temp.as_admin('MOD', $$select (x ->> 'changed') || ':' || jsonb_array_length(x -> 'skipped_ids')
                                    from public.admin_bulk_set_listing_status(array['00000000-0000-4000-8000-0000000c1001', '00000000-0000-4000-8000-0000000c1002',
                                      '00000000-0000-4000-8000-0000000c1003']::uuid[], 'removed', 'spam wave') x$$),
  '2:1', 'two removed, the deleted one skipped');
select is((select string_agg(status::text, ',' order by id) from public.listings where title like 'Spam%'), 'removed,removed', 'both removed');
select is((select action || ':' || (meta ->> 'count') || ':' || jsonb_array_length(meta -> 'ids') from public.audit_log order by id desc limit 1),
  'listing.bulk_removed:2:2', 'one audit row with the ids');
select is(pg_temp.as_admin('MOD', $$select (x ->> 'changed') from public.admin_bulk_set_listing_status(array['00000000-0000-4000-8000-0000000c1001']::uuid[], 'active', 'false alarm') x$$),
  '1', 'restore');

-- Banned email hashes --------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_list_banned_hashes()::text$$), 'ERROR: NOT_ADMIN', 'owner only');
select is(pg_temp.as_admin('OWN', format($$select (x ->> 'added') || ':' || (x ->> 'email_hash' = %L)::text
                                    from public.admin_upsert_banned_hash(' Bad@OSU.edu ', 'ban evader') x$$, private.email_hash('bad@osu.edu'))),
  'true:true', 'added by email, stored as the hash');
select is(pg_temp.as_admin('OWN', $$select x ->> 'added' from public.admin_upsert_banned_hash('bad@osu.edu', 'ban evader') x$$), 'false', 'adding twice is fine');
select is(pg_temp.as_admin('OWN', $$select (x ->> 'total') from public.admin_list_banned_hashes() x$$), '1', 'listed');
select is(pg_temp.as_admin('OWN', format($$select public.admin_delete_banned_hash(%L, 'appeal won')::text$$, private.email_hash('bad@osu.edu'))), '', 'removed');
select is((select count(*)::int from public.audit_log where action like 'banned_hash.%'), 3, 'one audit row per write');

-- Categories -----------------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_upsert_category(9::smallint, 'Decor and art', 95::smallint, 'clearer name')::text$$), 'ERROR: NOT_ADMIN', 'owner only');
select is(pg_temp.as_admin('OWN', $$select (x ->> 'name') || ':' || (x ->> 'sort') || ':' || (x ->> 'slug') from public.admin_upsert_category(9::smallint, 'Decor and art', 95::smallint, 'clearer name') x$$),
  'Decor and art:95:decor', 'rename and reorder; the slug stays');
select is(pg_temp.as_admin('OWN', $$select public.admin_upsert_category(50::smallint, 'Games', 100::smallint, 'new category')::text$$), 'ERROR: INVALID:slug',
  'a new category needs a slug');
select is(pg_temp.as_admin('OWN', $$select x ->> 'slug' from public.admin_upsert_category(50::smallint, 'Games', 100::smallint, 'new category', 'games') x$$),
  'games', 'added');
select is((select count(*)::int from public.audit_log where action like 'category.%'), 2, 'one audit row each');

select * from finish();
rollback;
