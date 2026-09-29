-- 0031_admin.sql (S34: P12-ADM-03; API §4, ADR-012, DEC 69)
-- R1.0 admin RPCs. Each checks require_admin (AAL2, role, campus scope).
-- Every write, and every sensitive read (report detail, user detail, reading a
-- reported chat), writes exactly one audit_log row (T-INT-ADMIN-02). Plain
-- lists don't.

create or replace function private.audit(
  p_actor uuid, p_action text, p_target_type text, p_target_id text, p_campus uuid, p_reason text, p_meta jsonb default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, campus_id, reason, meta, created_at)
  values (p_actor, p_action, p_target_type, p_target_id, p_campus, p_reason, p_meta, private.now())
$$;

create or replace function private.need_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    perform private.raise('INVALID', 'reason');
  end if;
  return left(btrim(p_reason), 500);
end;
$$;

-- Campus scope for list reads: a campus-bound admin sees only their campus.
create or replace function private.admin_campus(a public.admins, p_campus uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select coalesce(a.campus_id, p_campus)
$$;

-- ---------------------------------------------------------------------------
create or replace function public.admin_overview(campus_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_overview.campus_id);
  c uuid := private.admin_campus(a, admin_overview.campus_id);
  since timestamptz := private.now() - interval '24 hours';
begin
  return jsonb_build_object(
    'open_reports', (select count(*)::int from public.reports r where r.status = 'open' and (c is null or r.campus_id = c)),
    'priority_reports', (select count(*)::int from public.reports r where r.status = 'open' and r.priority = 1 and (c is null or r.campus_id = c)),
    'held_listings', (select count(*)::int from public.listings l where l.status = 'held_review' and (c is null or l.campus_id = c)),
    'open_appeals', (select count(*)::int from public.appeals ap join public.profiles p on p.id = ap.user_id
                     where ap.status = 'open' and (c is null or p.campus_id = c)),
    'today', jsonb_build_object(
      'new_users', (select count(*)::int from public.profiles p where p.created_at > since and (c is null or p.campus_id = c)),
      'new_listings', (select count(*)::int from public.listings l where l.created_at > since and (c is null or l.campus_id = c)),
      'offers', (select count(*)::int from public.offers o join public.listings l on l.id = o.listing_id
                 where o.created_at > since and (c is null or l.campus_id = c)),
      'chats', (select count(*)::int from public.chats ch join public.profiles p on p.id = ch.seller_id
                where ch.created_at > since and (c is null or p.campus_id = c)),
      'meetups', (select count(*)::int from public.meetups m join public.chats ch on ch.id = m.chat_id join public.profiles p on p.id = ch.seller_id
                  where m.confirmed_at > since and (c is null or p.campus_id = c))));
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports
create or replace function public.admin_list_reports(filters jsonb default '{}', cursor int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  st text := coalesce(filters ->> 'status', 'open');
  c uuid := private.admin_campus(a, nullif(filters ->> 'campus_id', '')::uuid);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'campus_id', r.campus_id, 'target_type', r.target_type, 'target_id', r.target_id,
      'reason', r.reason, 'priority', r.priority, 'status', r.status, 'created_at', r.created_at,
      'target_name', (select p.display_name from public.profiles p where p.id = r.target_user_id),
      'reports_on_target', (select count(*)::int from public.reports x where x.target_type = r.target_type and x.target_id = r.target_id))
      order by r.priority, r.created_at)
    from (select * from public.reports rr
          where rr.status::text = st and (c is null or rr.campus_id = c)
          order by rr.priority, rr.created_at
          offset greatest(coalesce(admin_list_reports.cursor, 0), 0) limit 50) r), '[]');
end;
$$;

create or replace function public.admin_report_detail(id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins;
  r public.reports;
begin
  select * into r from public.reports x where x.id = admin_report_detail.id;
  a := private.require_admin('moderator', r.campus_id);
  if r.id is null then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.audit(a.user_id, 'report.view', 'report', r.id::text, r.campus_id, 'review');
  return to_jsonb(r) || jsonb_build_object(
    'reporter_name', (select p.display_name from public.profiles p where p.id = r.reporter_id),
    'target', case when r.target_user_id is null then null else (
      select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'status', p.status,
                                'strike_count', p.strike_count, 'noshow_count', p.noshow_count, 'created_at', p.created_at)
      from public.profiles p where p.id = r.target_user_id) end,
    'other_reports', (select count(*)::int from public.reports x where x.target_user_id = r.target_user_id and x.id <> r.id));
end;
$$;

-- Actions: dismiss, remove_content, warn, strike, suspend (≤7 days for moderators), ban (owner).
create or replace function public.admin_resolve_report(id uuid, action text, note text, suspend_days int default 7)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.reports;
  a public.admins;
  why text := private.need_reason(admin_resolve_report.note);
  target public.profiles;
begin
  select * into r from public.reports x where x.id = admin_resolve_report.id for update;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  a := private.require_admin(case when admin_resolve_report.action = 'ban' then 'owner'::public.admin_role else 'moderator'::public.admin_role end, r.campus_id);
  if admin_resolve_report.action not in ('dismiss', 'remove_content', 'warn', 'strike', 'suspend', 'ban') then
    perform private.raise('INVALID', 'action');
  end if;
  if r.status <> 'open' then
    perform private.raise('INVALID', 'status');
  end if;
  select * into target from public.profiles p where p.id = r.target_user_id;

  if admin_resolve_report.action = 'remove_content' then
    if r.target_type = 'listing' then
      update public.listings l set status = 'removed' where l.id = r.target_id::uuid and l.status <> 'deleted';
      perform private.wind_down_listing(r.target_id::uuid, 'This listing was removed', null);
    elsif r.target_type = 'message' then
      update public.messages m set body = 'This message was removed', meta = coalesce(m.meta, '{}') || '{"removed": true}'
       where m.id = r.target_id::bigint;
    end if;
  elsif admin_resolve_report.action = 'warn' and target.id is not null then
    perform private.queue_notification(target.id, 'account_notice', 'account', 'A warning from OnlySwap',
      'A report about you was reviewed. Please follow the community rules.', '{}'::jsonb, false,
      'acct:' || target.id || ':warn:' || r.id);
  elsif admin_resolve_report.action = 'strike' and target.id is not null then
    insert into public.strikes (user_id, reason, report_id, created_by) values (target.id, r.reason, r.id, a.user_id);
    update public.profiles p set strike_count = strike_count + 1 where p.id = target.id;
    -- A first strike pauses offers and new listings for up to 7 days (DATA_MODEL §4.6).
    update public.profiles p set status = 'paused', status_reason = 'strike', paused_until = private.now() + interval '7 days'
     where p.id = target.id and p.status = 'active';
    perform private.queue_notification(target.id, 'account_notice', 'account', 'Account paused',
      'A rule was broken. Your account is paused for 7 days. You can appeal in the app.', '{}'::jsonb, false,
      'acct:' || target.id || ':strike:' || r.id);
  elsif admin_resolve_report.action = 'suspend' and target.id is not null then
    if a.role = 'moderator' and coalesce(admin_resolve_report.suspend_days, 7) > 7 then
      perform private.raise('NOT_ADMIN');
    end if;
    update public.profiles p set status = 'suspended', status_reason = 'report',
           paused_until = private.now() + make_interval(days => greatest(coalesce(admin_resolve_report.suspend_days, 7), 1))
     where p.id = target.id;
    perform private.call_function('revoke-sessions', jsonb_build_object('user_id', target.id));
  elsif admin_resolve_report.action = 'ban' and target.id is not null then
    update public.profiles p set status = 'banned', status_reason = 'report' where p.id = target.id;
    insert into public.banned_hashes (email_hash) values (target.email_hash) on conflict do nothing;
    perform private.call_function('revoke-sessions', jsonb_build_object('user_id', target.id));
  end if;

  update public.reports x
     set status = case when admin_resolve_report.action = 'dismiss' then 'dismissed'::public.report_status else 'actioned'::public.report_status end,
         action_taken = admin_resolve_report.action, assigned_to = a.user_id, resolved_at = private.now()
   where x.id = r.id;
  if r.reporter_id is not null then
    perform private.queue_notification(r.reporter_id, 'report_update', 'safety', 'Report reviewed', 'We reviewed your report',
      jsonb_build_object('report_id', r.id), false, 'report:' || r.id || ':reviewed');
  end if;
  perform private.audit(a.user_id, 'report.' || admin_resolve_report.action, 'report', r.id::text, r.campus_id, why,
    jsonb_build_object('target_user', r.target_user_id));
end;
$$;

-- Messages of a chat only when a report points at that chat or one of its messages (T-INT-ADMIN-04).
create or replace function public.admin_read_reported_chat(report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.reports;
  a public.admins;
  chat uuid;
begin
  select * into r from public.reports x where x.id = admin_read_reported_chat.report_id;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  a := private.require_admin('moderator', r.campus_id);
  chat := case r.target_type
            when 'chat' then r.target_id::uuid
            when 'message' then (select m.chat_id from public.messages m where m.id = r.target_id::bigint)
          end;
  if chat is null then
    perform private.raise('FORBIDDEN');
  end if;
  perform private.audit(a.user_id, 'chat.read', 'chat', chat::text, r.campus_id, 'report ' || r.id);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'sender', p.display_name, 'kind', m.kind, 'body', m.body, 'created_at', m.created_at)
                     order by m.id)
    from public.messages m left join public.profiles p on p.id = m.sender_id where m.chat_id = chat), '[]');
end;
$$;

-- ---------------------------------------------------------------------------
-- Users
create or replace function public.admin_list_users(filters jsonb default '{}', cursor int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  q text := nullif(btrim(coalesce(filters ->> 'q', '')), '');
  st text := nullif(filters ->> 'status', '');
  c uuid := private.admin_campus(a, nullif(filters ->> 'campus_id', '')::uuid);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'status', p.status,
      'campus_id', p.campus_id, 'strike_count', p.strike_count, 'noshow_count', p.noshow_count, 'created_at', p.created_at)
      order by p.created_at desc)
    from (select pp.* from public.profiles pp
          left join auth.users u on u.id = pp.id
          where (c is null or pp.campus_id = c)
            and (st is null or pp.status::text = st)
            and (q is null or pp.display_name ilike '%' || q || '%'
                 -- Email lookup is exact, and only for the owner (email-access recovery).
                 or (a.role = 'owner' and lower(u.email) = lower(q)))
          order by pp.created_at desc
          offset greatest(coalesce(admin_list_users.cursor, 0), 0) limit 50) p), '[]');
end;
$$;

create or replace function public.admin_user_detail(id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  p public.profiles;
  a public.admins;
begin
  select * into p from public.profiles x where x.id = admin_user_detail.id;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  a := private.require_admin('moderator', p.campus_id);
  perform private.audit(a.user_id, 'user.view', 'user', p.id::text, p.campus_id, 'review');
  return jsonb_build_object(
    'id', p.id, 'display_name', p.display_name, 'status', p.status, 'status_reason', p.status_reason,
    'paused_until', p.paused_until, 'campus_id', p.campus_id, 'created_at', p.created_at, 'verified_until', p.verified_until,
    'strike_count', p.strike_count, 'noshow_count', p.noshow_count, 'year', p.year,
    'email', case when a.role = 'owner' then (select u.email from auth.users u where u.id = p.id) end,
    'strikes', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.strikes s where s.user_id = p.id), '[]'),
    'reports_against', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'status', r.status, 'created_at', r.created_at)
                                                  order by r.created_at desc)
                                 from public.reports r where r.target_user_id = p.id), '[]'),
    'appeals', coalesce((select jsonb_agg(to_jsonb(ap) order by ap.created_at desc) from public.appeals ap where ap.user_id = p.id), '[]'),
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'status', l.status, 'created_at', l.created_at)
                                           order by l.created_at desc)
                          from (select * from public.listings l2 where l2.seller_id = p.id order by l2.created_at desc limit 20) l), '[]'));
end;
$$;

create or replace function public.admin_set_user_status(user_id uuid, status text, until timestamptz, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  p public.profiles;
  a public.admins;
  why text := private.need_reason(admin_set_user_status.reason);
begin
  select * into p from public.profiles x where x.id = admin_set_user_status.user_id;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  a := private.require_admin(case when admin_set_user_status.status = 'banned' then 'owner'::public.admin_role else 'moderator'::public.admin_role end, p.campus_id);
  if admin_set_user_status.status not in ('active', 'paused', 'suspended', 'banned') then
    perform private.raise('INVALID', 'status');
  end if;
  if admin_set_user_status.status in ('paused', 'suspended') then
    if admin_set_user_status.until is null or admin_set_user_status.until <= private.now() then
      perform private.raise('INVALID', 'until');
    end if;
    if a.role = 'moderator' and admin_set_user_status.until > private.now() + interval '7 days' then
      perform private.raise('NOT_ADMIN');
    end if;
  end if;
  update public.profiles x
     set status = admin_set_user_status.status::public.user_status,
         paused_until = case when admin_set_user_status.status in ('paused', 'suspended') then admin_set_user_status.until end,
         status_reason = case when admin_set_user_status.status = 'active' then null else 'admin' end
   where x.id = p.id;
  if admin_set_user_status.status = 'banned' then
    insert into public.banned_hashes (email_hash) values (p.email_hash) on conflict do nothing;
  end if;
  if admin_set_user_status.status in ('suspended', 'banned') then
    perform private.call_function('revoke-sessions', jsonb_build_object('user_id', p.id));
  end if;
  perform private.audit(a.user_id, 'user.status.' || admin_set_user_status.status, 'user', p.id::text, p.campus_id, why,
    jsonb_build_object('until', admin_set_user_status.until));
end;
$$;

create or replace function public.admin_clear_strike(id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s public.strikes;
  a public.admins;
  campus uuid;
  why text := private.need_reason(admin_clear_strike.reason);
begin
  select * into s from public.strikes x where x.id = admin_clear_strike.id;
  if not found or s.cleared_at is not null then
    perform private.raise('NOT_FOUND');
  end if;
  select p.campus_id into campus from public.profiles p where p.id = s.user_id;
  a := private.require_admin('moderator', campus);
  update public.strikes x set cleared_at = private.now() where x.id = s.id;
  update public.profiles p set strike_count = greatest(strike_count - 1, 0) where p.id = s.user_id;
  perform private.audit(a.user_id, 'strike.clear', 'strike', s.id::text, campus, why);
end;
$$;

create or replace function public.admin_force_reverify(user_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  p public.profiles;
  a public.admins;
  why text := private.need_reason(admin_force_reverify.reason);
begin
  select * into p from public.profiles x where x.id = admin_force_reverify.user_id;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  a := private.require_admin('moderator', p.campus_id);
  update public.profiles x set status = 'reverify', verified_until = private.campus_today(p.campus_id) - 1
   where x.id = p.id and x.status in ('active', 'paused');
  perform private.audit(a.user_id, 'user.force_reverify', 'user', p.id::text, p.campus_id, why);
end;
$$;

-- ---------------------------------------------------------------------------
-- Listings
create or replace function public.admin_list_listings(filters jsonb default '{}', cursor int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  st text := coalesce(filters ->> 'status', 'held_review');
  c uuid := private.admin_campus(a, nullif(filters ->> 'campus_id', '')::uuid);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'description', l.description, 'status', l.status,
      'price_cents', l.price_cents, 'campus_id', l.campus_id, 'seller', (select p.display_name from public.profiles p where p.id = l.seller_id),
      'thumb_path', (select ph.thumb_path from public.listing_photos ph where ph.listing_id = l.id order by ph.idx limit 1),
      'created_at', l.created_at) order by l.created_at)
    from (select * from public.listings x where x.status::text = st and (c is null or x.campus_id = c)
          order by x.created_at offset greatest(coalesce(admin_list_listings.cursor, 0), 0) limit 50) l), '[]');
end;
$$;

-- approve a held listing (→ active), remove (→ removed, winds down), restore a removed one (→ active).
create or replace function public.admin_set_listing_status(id uuid, status text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  l public.listings;
  a public.admins;
  why text := private.need_reason(admin_set_listing_status.reason);
begin
  select * into l from public.listings x where x.id = admin_set_listing_status.id for update;
  if not found or l.status = 'deleted' then
    perform private.raise('NOT_FOUND');
  end if;
  a := private.require_admin('moderator', l.campus_id);
  if admin_set_listing_status.status not in ('active', 'removed') then
    perform private.raise('INVALID', 'status');
  end if;
  if admin_set_listing_status.status = 'active' and l.status not in ('held_review', 'removed') then
    perform private.raise('INVALID', 'status');
  end if;
  update public.listings x set status = admin_set_listing_status.status::public.listing_status,
         bumped_at = case when admin_set_listing_status.status = 'active' then private.now() else x.bumped_at end
   where x.id = l.id;
  if admin_set_listing_status.status = 'removed' then
    perform private.wind_down_listing(l.id, 'This listing was removed', null);
  end if;
  perform private.audit(a.user_id, 'listing.' || admin_set_listing_status.status, 'listing', l.id::text, l.campus_id, why,
    jsonb_build_object('from', l.status));
end;
$$;

-- ---------------------------------------------------------------------------
-- Appeals
create or replace function public.admin_list_appeals(filters jsonb default '{}', cursor int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  st text := coalesce(filters ->> 'status', 'open');
begin
  return coalesce((
    select jsonb_agg(to_jsonb(ap) || jsonb_build_object('user_name', p.display_name) order by ap.created_at)
    from (select * from public.appeals x where x.status = st order by x.created_at
          offset greatest(coalesce(admin_list_appeals.cursor, 0), 0) limit 50) ap
    join public.profiles p on p.id = ap.user_id
    where a.campus_id is null or p.campus_id = a.campus_id), '[]');
end;
$$;

create or replace function public.admin_decide_appeal(id uuid, decision text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  ap public.appeals;
  p public.profiles;
  a public.admins;
  why text := private.need_reason(admin_decide_appeal.note);
begin
  select * into ap from public.appeals x where x.id = admin_decide_appeal.id for update;
  if not found or ap.status <> 'open' then
    perform private.raise('NOT_FOUND');
  end if;
  select * into p from public.profiles x where x.id = ap.user_id;
  a := private.require_admin('moderator', p.campus_id);
  if admin_decide_appeal.decision not in ('upheld', 'overturned') then
    perform private.raise('INVALID', 'decision');
  end if;
  if admin_decide_appeal.decision = 'overturned' then
    if ap.subject_type = 'strike' then
      update public.strikes s set cleared_at = private.now() where s.id = ap.subject_id::uuid and s.cleared_at is null;
      update public.profiles x set strike_count = greatest(strike_count - 1, 0) where x.id = p.id;
    elsif ap.subject_type = 'noshow' then
      update public.noshow_reports n set status = 'rejected' where n.id = ap.subject_id::uuid;
      update public.profiles x set noshow_count = greatest(noshow_count - 1, 0) where x.id = p.id;
    end if;
    -- Lift a pause or suspension that came from this.
    update public.profiles x set status = 'active', paused_until = null, status_reason = null
     where x.id = p.id and x.status in ('paused', 'suspended');
  end if;
  update public.appeals x set status = admin_decide_appeal.decision, decided_by = a.user_id,
         decision_note = left(why, 500), decided_at = private.now()
   where x.id = ap.id;
  perform private.queue_notification(p.id, 'appeal_decided', 'account', 'Appeal reviewed', 'Your appeal was reviewed',
    jsonb_build_object('appeal_id', ap.id), false, 'appeal:' || ap.id);
  perform private.audit(a.user_id, 'appeal.' || admin_decide_appeal.decision, 'appeal', ap.id::text, p.campus_id, why);
end;
$$;

-- ---------------------------------------------------------------------------
-- Campus, domains, Meetup spots, config (owner)
create or replace function public.admin_list_campuses()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.admins := private.require_admin('moderator');
begin
  return coalesce((
    select jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'members', (select count(*)::int from public.profiles p where p.campus_id = c.id and p.status <> 'banned'),
      'domains', coalesce((select jsonb_agg(jsonb_build_object('domain', d.domain, 'kind', d.kind) order by d.domain)
                           from public.campus_domains d where d.campus_id = c.id), '[]'),
      'spots', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort, s.name) from public.safe_spots s where s.campus_id = c.id), '[]'))
      order by c.name)
    from public.campuses c where a.campus_id is null or c.id = a.campus_id), '[]');
end;
$$;

create or replace function public.admin_update_campus(id uuid, patch jsonb, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_update_campus.reason);
  k text;
begin
  for k in select jsonb_object_keys(coalesce(patch, '{}')) loop
    if k not in ('status', 'unlock_threshold', 'founding_seller_limit', 'offers_per_hour', 'noshow_pause_threshold',
                 'reverify_months', 'name', 'short_name', 'timezone') then
      perform private.raise('INVALID', 'patch');
    end if;
  end loop;
  begin
    update public.campuses c set
      status = coalesce((patch ->> 'status')::public.campus_status, c.status),
      unlock_threshold = coalesce((patch ->> 'unlock_threshold')::int, c.unlock_threshold),
      founding_seller_limit = coalesce((patch ->> 'founding_seller_limit')::int, c.founding_seller_limit),
      offers_per_hour = coalesce((patch ->> 'offers_per_hour')::int, c.offers_per_hour),
      noshow_pause_threshold = coalesce((patch ->> 'noshow_pause_threshold')::int, c.noshow_pause_threshold),
      reverify_months = coalesce((patch ->> 'reverify_months')::int, c.reverify_months),
      name = coalesce(patch ->> 'name', c.name),
      short_name = coalesce(patch ->> 'short_name', c.short_name),
      timezone = coalesce(patch ->> 'timezone', c.timezone)
    where c.id = admin_update_campus.id;
  exception when invalid_text_representation then
    perform private.raise('INVALID', 'patch');
  end;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.audit(a.user_id, 'campus.update', 'campus', admin_update_campus.id::text, admin_update_campus.id, why, patch);
end;
$$;

create or replace function public.admin_upsert_domain(domain text, campus_id uuid, kind text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_upsert_domain.reason);
  d text := lower(btrim(coalesce(admin_upsert_domain.domain, '')));
begin
  if d !~ '^[a-z0-9.-]+\.[a-z]{2,}$' or admin_upsert_domain.kind not in ('student', 'blocked') then
    perform private.raise('INVALID', 'domain');
  end if;
  insert into public.campus_domains (domain, campus_id, kind) values (d, admin_upsert_domain.campus_id, admin_upsert_domain.kind)
  on conflict (domain) do update set campus_id = excluded.campus_id, kind = excluded.kind;
  perform private.audit(a.user_id, 'domain.upsert', 'domain', d, admin_upsert_domain.campus_id, why,
    jsonb_build_object('kind', admin_upsert_domain.kind));
end;
$$;

create or replace function public.admin_delete_domain(domain text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_delete_domain.reason);
  c uuid;
begin
  delete from public.campus_domains x where x.domain = lower(admin_delete_domain.domain) returning x.campus_id into c;
  if c is null then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.audit(a.user_id, 'domain.delete', 'domain', lower(admin_delete_domain.domain), c, why);
end;
$$;

-- Meetup spots: "Police-designated" only with the date it was confirmed (LEG-04, P15-BETA-05).
create or replace function public.admin_upsert_safe_spot(spot jsonb, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_upsert_safe_spot.reason);
  s public.safe_spots;
  sid uuid := nullif(spot ->> 'id', '')::uuid;
begin
  begin
    if sid is null then
      insert into public.safe_spots (campus_id, name, description, hours, lat, lng, designation, designated_on, is_default, active, sort)
      values ((spot ->> 'campus_id')::uuid, spot ->> 'name', spot ->> 'description', spot ->> 'hours',
              (spot ->> 'lat')::float8, (spot ->> 'lng')::float8,
              coalesce(spot ->> 'designation', 'public')::public.spot_designation, (spot ->> 'designated_on')::date,
              coalesce((spot ->> 'is_default')::bool, false), coalesce((spot ->> 'active')::bool, true),
              coalesce((spot ->> 'sort')::smallint, 0))
      returning * into s;
    else
      update public.safe_spots x set
        name = coalesce(spot ->> 'name', x.name), description = coalesce(spot ->> 'description', x.description),
        hours = coalesce(spot ->> 'hours', x.hours), lat = coalesce((spot ->> 'lat')::float8, x.lat),
        lng = coalesce((spot ->> 'lng')::float8, x.lng),
        designation = coalesce((spot ->> 'designation')::public.spot_designation, x.designation),
        designated_on = case when spot ? 'designated_on' then (spot ->> 'designated_on')::date else x.designated_on end,
        is_default = coalesce((spot ->> 'is_default')::bool, x.is_default), active = coalesce((spot ->> 'active')::bool, x.active),
        sort = coalesce((spot ->> 'sort')::smallint, x.sort)
      where x.id = sid returning * into s;
      if not found then
        perform private.raise('NOT_FOUND');
      end if;
    end if;
  exception
    when check_violation then perform private.raise('INVALID', 'designated_on');
    when not_null_violation or invalid_text_representation or foreign_key_violation then perform private.raise('INVALID', 'spot');
  end;
  perform private.audit(a.user_id, 'spot.upsert', 'safe_spot', s.id::text, s.campus_id, why,
    jsonb_build_object('designation', s.designation));
  return to_jsonb(s);
end;
$$;

create or replace function public.admin_get_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.admins := private.require_admin('moderator');
begin
  return coalesce((select jsonb_object_agg(c.key, c.value) from public.app_config c), '{}');
end;
$$;

create or replace function public.admin_set_config(key text, value jsonb, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_set_config.reason);
  old jsonb;
begin
  if admin_set_config.key !~ '^[a-z0-9_]{2,40}$' or admin_set_config.value is null then
    perform private.raise('INVALID', 'key');
  end if;
  select c.value into old from public.app_config c where c.key = admin_set_config.key;
  insert into public.app_config (key, value, updated_at) values (admin_set_config.key, admin_set_config.value, private.now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  perform private.audit(a.user_id, 'config.set', 'config', admin_set_config.key, null, why,
    jsonb_build_object('old', old, 'new', admin_set_config.value));
end;
$$;

create or replace function public.admin_list_audit(filters jsonb default '{}', cursor bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', l.id, 'actor', (select p.display_name from public.profiles p where p.id = l.actor_id),
      'action', l.action, 'target_type', l.target_type, 'target_id', l.target_id, 'campus_id', l.campus_id,
      'reason', l.reason, 'meta', l.meta, 'created_at', l.created_at) order by l.id desc)
    from (select * from public.audit_log x
          where (admin_list_audit.cursor is null or x.id < admin_list_audit.cursor)
            and (a.campus_id is null or x.campus_id = a.campus_id)
            and (filters ->> 'action' is null or x.action like (filters ->> 'action') || '%')
            and (filters ->> 'target_id' is null or x.target_id = filters ->> 'target_id')
          order by x.id desc limit 100) l), '[]');
end;
$$;

-- The admin console's own session: role, scope, and whether MFA is done.
create or replace function public.admin_whoami()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.admins;
begin
  select * into a from public.admins where user_id = auth.uid();
  if not found then
    return jsonb_build_object('admin', false);
  end if;
  return jsonb_build_object('admin', true, 'role', a.role, 'campus_id', a.campus_id,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'name', (select p.display_name from public.profiles p where p.id = a.user_id));
end;
$$;

-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array['private.audit(uuid, text, text, text, uuid, text, jsonb)', 'private.need_reason(text)',
                           'private.admin_campus(public.admins, uuid)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.admin_overview(uuid)', 'public.admin_list_reports(jsonb, int)', 'public.admin_report_detail(uuid)',
    'public.admin_resolve_report(uuid, text, text, int)', 'public.admin_read_reported_chat(uuid)',
    'public.admin_list_users(jsonb, int)', 'public.admin_user_detail(uuid)',
    'public.admin_set_user_status(uuid, text, timestamptz, text)', 'public.admin_clear_strike(uuid, text)',
    'public.admin_force_reverify(uuid, text)', 'public.admin_list_listings(jsonb, int)',
    'public.admin_set_listing_status(uuid, text, text)', 'public.admin_list_appeals(jsonb, int)',
    'public.admin_decide_appeal(uuid, text, text)', 'public.admin_list_campuses()',
    'public.admin_update_campus(uuid, jsonb, text)', 'public.admin_upsert_domain(text, uuid, text, text)',
    'public.admin_delete_domain(text, text)', 'public.admin_upsert_safe_spot(jsonb, text)', 'public.admin_get_config()',
    'public.admin_set_config(text, jsonb, text)', 'public.admin_list_audit(jsonb, bigint)', 'public.admin_whoami()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
