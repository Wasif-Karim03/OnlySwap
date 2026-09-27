-- 0011_rpcs_safety.sql (P3-SAFE-01; API.md §3 Safety, DATA_MODEL §4.5)
-- create_report, get_my_report, block_user, unblock_user, create_appeal and the
-- reports trigger (priority-1 email, auto-hide). Errors: P0001 'CODE[:detail]'.

create or replace function public.create_report(
  target_type text,
  target_id text,
  reason text,
  details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
  target_user uuid;
  target_campus uuid;
  chat uuid;
  new_id uuid;
begin
  perform private.hit('report', 20, interval '1 day');

  if target_type not in ('listing','user','chat','message') then
    perform private.raise('INVALID', 'target_type');
  end if;
  if reason not in ('scam','not_allowed','stolen','counterfeit','misleading','harassment','threat',
                    'hate','sexual','minor_safety','calls_out_student','spam','self_harm','no_show','other') then
    perform private.raise('INVALID', 'reason');
  end if;
  if char_length(coalesce(details, '')) > 500 then
    perform private.raise('INVALID', 'details');
  end if;

  -- Resolve the reported person; the reporter must be able to see the target.
  begin
    if target_type = 'listing' then
      select l.seller_id, l.campus_id into target_user, target_campus
      from public.listings l
      where l.id = target_id::uuid and l.status <> 'deleted';
    elsif target_type = 'user' then
      select p.id, p.campus_id into target_user, target_campus
      from public.profiles p where p.id = target_id::uuid;
    elsif target_type = 'chat' then
      select case when c.buyer_id = me.id then c.seller_id else c.buyer_id end, me.campus_id
        into target_user, target_campus
      from public.chats c
      where c.id = target_id::uuid and me.id in (c.buyer_id, c.seller_id);
    else
      select m.sender_id, m.chat_id, me.campus_id into target_user, chat, target_campus
      from public.messages m
      join public.chats c on c.id = m.chat_id
      where m.id = target_id::bigint and me.id in (c.buyer_id, c.seller_id);
    end if;
  exception when invalid_text_representation then
    perform private.raise('NOT_FOUND');
  end;

  if target_campus is null or target_campus <> me.campus_id then
    perform private.raise('NOT_FOUND');
  end if;
  if target_user = me.id then
    perform private.raise('INVALID', 'target_id');
  end if;

  begin
    insert into public.reports
      (campus_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, priority, created_at)
    values
      (me.campus_id, me.id, target_type, target_id, target_user, reason, nullif(btrim(details), ''),
       private.snapshot_evidence(target_type, target_id),
       case when reason in ('threat','self_harm','minor_safety') then 1 else 2 end,
       private.now())
    returning id into new_id;
  exception when unique_violation then
    perform private.raise('ALREADY_REPORTED');
  end;

  return jsonb_build_object('id', new_id);
end;
$$;

-- Generic outcome only: the reporter never learns what happened to the other
-- person (DESIGN_SYSTEM E21).
create or replace function public.get_my_report(id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.reports;
begin
  if auth.uid() is null then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  select * into r from public.reports x where x.id = get_my_report.id and x.reporter_id = auth.uid();
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  return jsonb_build_object(
    'id', r.id,
    'status', case when r.status = 'open' then 'received' else 'reviewed' end,
    'timeline', jsonb_build_array(jsonb_build_object('event', 'received', 'at', r.created_at))
      || case when r.resolved_at is not null
              then jsonb_build_array(jsonb_build_object('event', 'reviewed', 'at', r.resolved_at))
              else '[]'::jsonb end
  );
end;
$$;

-- Blocking closes open chats between the two for both sides (DATA_MODEL §4.3).
create or replace function public.block_user(user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
begin
  perform private.hit('block', 50, interval '1 day');
  if user_id = me.id then
    perform private.raise('INVALID', 'user_id');
  end if;
  if not exists (select 1 from public.profiles p where p.id = block_user.user_id) then
    perform private.raise('NOT_FOUND');
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (me.id, block_user.user_id)
  on conflict do nothing;
  update public.chats c set status = 'blocked'
  where c.status = 'open'
    and ((c.buyer_id = me.id and c.seller_id = block_user.user_id)
      or (c.seller_id = me.id and c.buyer_id = block_user.user_id));
end;
$$;

-- Unblocking reopens chats only if neither side still blocks the other and the
-- deal is still going (not closed).
create or replace function public.unblock_user(user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
begin
  delete from public.blocks b where b.blocker_id = me.id and b.blocked_id = unblock_user.user_id;
  if not private.is_blocked(me.id, unblock_user.user_id) then
    update public.chats c set status = 'open'
    where c.status = 'blocked' and c.closed_at is null
      and ((c.buyer_id = me.id and c.seller_id = unblock_user.user_id)
        or (c.seller_id = me.id and c.buyer_id = unblock_user.user_id));
  end if;
end;
$$;

-- Appeals work for paused, suspended and banned accounts too, so this checks
-- the session and profile but not require_active (DATA_MODEL §4.6).
create or replace function public.create_appeal(
  subject_type text,
  subject_id text,
  reason_choice text default null,
  body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  own boolean;
  new_id uuid;
begin
  if uid is null or not exists (select 1 from public.profiles p where p.id = uid) then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  perform private.hit('appeal', 5, interval '1 day');
  if char_length(coalesce(body, '')) > 500 then
    perform private.raise('INVALID', 'body');
  end if;

  begin
    own := case subject_type
      when 'strike' then exists (
        select 1 from public.strikes s where s.id = subject_id::uuid and s.user_id = uid)
      when 'listing' then exists (
        select 1 from public.listings l
        where l.id = subject_id::uuid and l.seller_id = uid and l.status in ('removed','held_review'))
      when 'suspension' then subject_id = uid::text and exists (
        select 1 from public.profiles p
        where p.id = uid and p.status in ('paused','suspended','banned'))
      when 'noshow' then exists (
        select 1 from public.noshow_reports n where n.id = subject_id::uuid and n.reported_id = uid)
      when 'quad_post' then null
      else false
    end;
  exception when invalid_text_representation then
    own := false;
  end;
  if own is null then
    perform private.raise('FEATURE_OFF');
  end if;
  if not own then
    perform private.raise('NOT_FOUND');
  end if;

  begin
    insert into public.appeals (user_id, subject_type, subject_id, reason_choice, body, created_at)
    values (uid, subject_type, subject_id, reason_choice, nullif(btrim(body), ''), private.now())
    returning id into new_id;
  exception when unique_violation then
    perform private.raise('ALREADY_APPEALED');
  end;
  return jsonb_build_object('id', new_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- trg_reports_ai (API §2): priority-1 reports email every owner right away;
-- 3 distinct reporters whose accounts are older than 7 days, within 24 h,
-- auto-hide a listing (held_review). The reports stay open (BE-09).
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
  if new.priority = 1 then
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

create trigger trg_reports_ai
  after insert on public.reports
  for each row execute function private.trg_reports_ai();

-- ---------------------------------------------------------------------------
revoke all on function private.trg_reports_ai() from public, anon, authenticated;
revoke all on function public.create_report(text, text, text, text) from public, anon;
revoke all on function public.get_my_report(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.create_appeal(text, text, text, text) from public, anon;
grant execute on function public.create_report(text, text, text, text) to authenticated, service_role;
grant execute on function public.get_my_report(uuid) to authenticated, service_role;
grant execute on function public.block_user(uuid) to authenticated, service_role;
grant execute on function public.unblock_user(uuid) to authenticated, service_role;
grant execute on function public.create_appeal(text, text, text, text) to authenticated, service_role;
