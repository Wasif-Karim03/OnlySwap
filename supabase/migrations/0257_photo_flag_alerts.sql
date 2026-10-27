-- 0257_photo_flag_alerts.sql · DEC 154: a photo the automatic check flags is a red alert.
-- Before: the flag held the post and filed a priority-2 report, so no email went out
-- (only priority 1 emails) and the console showed no photo.
-- Now:
--   * every automatic photo flag files a priority-1 (urgent) report;
--   * it queues one 'photo_flag' email per owner and per moderator of that campus
--     with who posted, what, when and why, and the photo for weapon, drugs,
--     violence, hate and other. Sexual and minor-safety photos are never put in
--     an email (the console shows them behind a click, or not at all for minor);
--   * trg_reports_ai skips its generic priority_report email for these reports.
-- Quad authors stay anonymous in the email (DEC 104): the console reveal is logged.

alter table public.email_outbox drop constraint if exists email_outbox_template_check;
alter table public.email_outbox add constraint email_outbox_template_check
  check (template in ('campus_open','account_paused','reverify_due','account_deleted','data_export',
                      'admin_reveal_receipt','support_request','priority_report','support_reply',
                      'report_queue','photo_flag'));

-- Who gets the alert: owners (all campuses) and admins of the report's campus.
create or replace function private.alert_photo_flag(p_report uuid, p_why text, p_kind text, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
  camp public.campuses;
  vars jsonb;
  poster text;
  poster_id uuid;
  what text;
  posted timestamptz;
  to_email text;
begin
  select * into r from public.reports x where x.id = p_report;
  if r.id is null then
    return;
  end if;
  select * into camp from public.campuses c where c.id = r.campus_id;

  if p_kind = 'listing' then
    select p.display_name, l.seller_id, l.title, l.created_at into poster, poster_id, what, posted
      from public.listings l left join public.profiles p on p.id = l.seller_id
     where l.id = r.target_id::uuid;
  elsif p_kind = 'quad' then
    select left(q.body, 120), q.created_at into what, posted
      from public.quad_posts q where q.id = r.target_id::uuid;
  else
    select p.display_name, p.id into poster, poster_id from public.profiles p where p.id = r.target_id::uuid;
    what := 'Profile photo';
  end if;

  vars := jsonb_build_object(
    'report_id', r.id,
    'reason', p_why,
    'kind', p_kind,
    'poster', poster,              -- null for Quad (anonymous) or a deleted account
    'poster_id', poster_id,
    'what', what,
    'campus', camp.name,
    'posted_at', to_char(coalesce(posted, r.created_at) at time zone coalesce(camp.timezone, 'America/New_York'),
                         'Mon FMDD, FMHH12:MI AM'),
    'flagged_at', to_char(r.created_at at time zone coalesce(camp.timezone, 'America/New_York'),
                          'Mon FMDD, FMHH12:MI AM'),
    -- Never email sexual or minor-safety images.
    'photo_key', case when p_why in ('sexual', 'minor') then null else p_path end);

  for to_email in
    select distinct u.email
      from public.admins a join auth.users u on u.id = a.user_id
     where u.email is not null
       and (a.role = 'owner' or a.campus_id is null or a.campus_id = r.campus_id)
  loop
    perform private.queue_email(to_email, 'photo_flag', vars,
                                'photo_flag:' || r.id::text || ':' || to_email);
  end loop;
end;
$$;
revoke all on function private.alert_photo_flag(uuid, text, text, text) from public, anon, authenticated;

create or replace function private.finish_photo_scan(p_id bigint, p_verdict text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.photo_scans;
  campus uuid;
  owner_ uuid;
  why text := case when p_reason in ('sexual', 'minor', 'violence', 'weapon', 'drugs', 'hate') then p_reason else 'other' end;
  report_reason text;
  rid uuid;
begin
  select * into s from private.photo_scans x where x.id = p_id for update;
  if not found or s.status <> 'scanning' then
    return;
  end if;
  if p_verdict = 'retry' then
    update private.photo_scans x set status = 'pending' where x.id = s.id;
    return;
  end if;
  if p_verdict <> 'flag' then
    update private.photo_scans x set status = 'ok', scanned_at = private.now() where x.id = s.id;
    return;
  end if;

  update private.photo_scans x set status = 'flagged', reason = why, scanned_at = private.now() where x.id = s.id;
  report_reason := case why when 'sexual' then 'sexual' when 'minor' then 'minor_safety'
                            when 'violence' then 'threat' when 'hate' then 'hate' else 'not_allowed' end;

  if s.kind = 'listing' then
    update public.listings l set status = 'held_review', updated_at = private.now()
     where l.id = s.target_id and l.status in ('active', 'hold')
    returning l.campus_id, l.seller_id into campus, owner_;
    if campus is null then
      select l.campus_id, l.seller_id into campus, owner_ from public.listings l where l.id = s.target_id;
    end if;
    if campus is not null then
      insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, priority)
      values (campus, null, 'listing', s.target_id::text, owner_, report_reason,
              'Automatic photo check: ' || why,
              jsonb_build_object('photo_keys', jsonb_build_array(s.path), 'auto', why), 1)
      returning id into rid;
    end if;
  elsif s.kind = 'quad' then
    update public.quad_posts q set status = 'held', hold_reason = 'photo:' || why
     where q.id = s.target_id and q.status = 'live'
    returning q.campus_id into campus;
    if campus is null then
      select q.campus_id into campus from public.quad_posts q where q.id = s.target_id;
    end if;
    if campus is not null then
      insert into public.reports (campus_id, reporter_id, target_type, target_id, reason, details, evidence, priority)
      values (campus, null, 'quad_post', s.target_id::text, report_reason,
              'Automatic photo check: ' || why,
              jsonb_build_object('photo_keys', jsonb_build_array(s.path), 'auto', why), 1)
      returning id into rid;
    end if;
  else
    update public.profiles p set avatar_path = null
     where p.id = s.target_id and p.avatar_path = s.path
    returning p.campus_id into campus;
    if campus is not null then
      insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, priority)
      values (campus, null, 'user', s.target_id::text, s.target_id, report_reason,
              'Automatic photo check (profile photo removed): ' || why,
              jsonb_build_object('photo_keys', jsonb_build_array(s.path), 'auto', why), 1)
      returning id into rid;
    end if;
  end if;

  if rid is not null then
    perform private.alert_photo_flag(rid, why, s.kind, s.path);
  end if;
end;
$$;
revoke all on function private.finish_photo_scan(bigint, text, text) from public, anon, authenticated;

-- The generic priority email, minus automatic photo flags (they send photo_flag).
create or replace function private.trg_reports_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
  aged_reporters int;
begin
  if new.priority = 1 and not (new.reporter_id is null and coalesce(new.evidence, '{}'::jsonb) ? 'auto') then
    for owner_email in
      select u.email from public.admins a join auth.users u on u.id = a.user_id
      where a.role = 'owner' and u.email is not null
    loop
      perform private.queue_email(
        owner_email, 'priority_report',
        jsonb_build_object('report_id', new.id, 'reason', new.reason, 'target_type', new.target_type),
        'priority_report:' || new.id::text || ':' || owner_email);
    end loop;
  end if;

  if new.target_type = 'listing' then
    select count(distinct r.reporter_id) into aged_reporters
    from public.reports r
    join public.profiles p on p.id = r.reporter_id
    where r.target_type = 'listing' and r.target_id = new.target_id
      and r.status = 'open'
      and r.created_at > private.now() - interval '24 hours'
      and p.created_at < private.now() - interval '7 days';
    if aged_reporters >= 3 then
      update public.listings set status = 'held_review', updated_at = private.now()
      where id = new.target_id::uuid and status in ('active','hold');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.trg_reports_ai() from public, anon, authenticated;
