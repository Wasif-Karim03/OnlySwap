-- 0220_quad_author_privacy.sql · A-01 and A-02 (audit), DEC 104.
-- A Quad report named the author to every moderator: reports.target_user_id
-- held the author, so the report queue, report detail, a person's reports
-- page and a direct read of reports all linked a post to a person, and the
-- reveal wrote author_id into audit_log, which every moderator can read.
-- Now (SECURITY T12, only admin_reveal_quad_author names an author):
--   * reports keeps no author for quad_post / quad_reply (a trigger drops it
--     on every path, including the vote auto-hide); old rows are cleared.
--   * admin_resolve_report looks the author up itself, so warn, strike,
--     suspend and ban still reach them; the strike keeps no report_id.
--   * the reveal audit row keeps the case ref only; audit reads strip author
--     ids from older rows, and moderators can't read those rows directly.
--   * account deletion still keeps evidence photos of open Quad reports.
-- Functions are copied from 0212, 0202, 0031, 0207 and 0208 with only those
-- lines changed.

-- The author of a reported Quad post or reply, or null for any other report.
create or replace function private.quad_report_author(p_type text, p_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'quad_post' then (select q.author_id from public.quad_posts q where q.id::text = p_id)
    when 'quad_reply' then (select r.author_id from public.quad_replies r where r.id::text = p_id)
  end
$$;

create or replace function private.reports_drop_quad_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.target_type in ('quad_post', 'quad_reply') then
    new.target_user_id := null;
  end if;
  return new;
end;
$$;

create trigger reports_drop_quad_author
  before insert or update of target_user_id, target_type on public.reports
  for each row execute function private.reports_drop_quad_author();

update public.reports set target_user_id = null
 where target_type in ('quad_post', 'quad_reply') and target_user_id is not null;
update public.strikes s set report_id = null
 where s.report_id in (select r.id from public.reports r where r.target_type in ('quad_post', 'quad_reply'));

-- Audit meta without author ids: author_id (old reveal rows) and target_user
-- on a resolved Quad report (rows written before this migration).
create or replace function private.audit_meta_safe(p_target_type text, p_target_id text, p_meta jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_meta is null then null
    when p_target_type = 'report' and exists (
           select 1 from public.reports r
           where r.id::text = p_target_id and r.target_type in ('quad_post', 'quad_reply'))
      then p_meta - 'author_id' - 'target_user'
    else p_meta - 'author_id'
  end
$$;

drop policy audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using (private.is_admin('moderator')
         and (private.is_admin('owner')
              or meta is not distinct from private.audit_meta_safe(target_type, target_id, meta)));

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
  -- A Quad report keeps no author (A-01): look the author up here, act on
  -- them, and never return or log who it is.
  select * into target from public.profiles p
   where p.id = coalesce(r.target_user_id, private.quad_report_author(r.target_type, r.target_id));

  if admin_resolve_report.action = 'remove_content' then
    if r.target_type = 'listing' then
      update public.listings l set status = 'removed' where l.id = r.target_id::uuid and l.status <> 'deleted';
      perform private.wind_down_listing(r.target_id::uuid, 'This listing was removed', null);
      perform private.tell_seller_removed(r.target_id::uuid, why, a.user_id);
    elsif r.target_type = 'message' then
      update public.messages m set body = 'This message was removed', meta = coalesce(m.meta, '{}') || '{"removed": true}'
       where m.id = r.target_id::bigint;
    end if;
  elsif admin_resolve_report.action = 'warn' and target.id is not null then
    perform private.queue_notification(target.id, 'account_notice', 'account', 'A warning from OnlySwap',
      'A report about you was reviewed. Please follow the community rules.', '{}'::jsonb, false,
      'acct:' || target.id || ':warn:' || r.id);
  elsif admin_resolve_report.action = 'strike' and target.id is not null then
    insert into public.strikes (user_id, reason, report_id, created_by) values (target.id, r.reason,
      case when r.target_type in ('quad_post', 'quad_reply') then null else r.id end, a.user_id);
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

create or replace function public.admin_reveal_quad_author(target_type text, id uuid, case_ref text, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  t record;
  why text := private.need_reason(admin_reveal_quad_author.reason);
  ref text := btrim(coalesce(admin_reveal_quad_author.case_ref, ''));
  fresh boolean;
  p public.profiles;
  email text;
begin
  if char_length(ref) < 3 then
    perform private.raise('INVALID', 'case_ref');
  end if;
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m
    where m ->> 'method' = 'totp'
      and to_timestamp((m ->> 'timestamp')::double precision) >= private.now() - interval '10 minutes'
  ) into fresh;
  if not fresh then
    perform private.raise('FORBIDDEN', 'mfa_required');
  end if;
  perform private.hit_key(a.user_id, 'quad_reveal', 5, interval '1 day');

  t := private.quad_target(admin_reveal_quad_author.target_type, admin_reveal_quad_author.id);
  select * into p from public.profiles x where x.id = t.author;
  select u.email into email from auth.users u where u.id = t.author;

  perform private.audit(a.user_id, 'quad.reveal', 'quad_' || admin_reveal_quad_author.target_type,
    admin_reveal_quad_author.id::text, t.campus, why, jsonb_build_object('case_ref', ref));
  if email is not null then
    perform private.queue_email(email, 'admin_reveal_receipt',
      jsonb_build_object('admin', 'An OnlySwap safety admin', 'what', 'who wrote a Quad post'),
      'quad_reveal:' || admin_reveal_quad_author.id || ':' || a.user_id);
  end if;

  return jsonb_build_object('user_id', t.author, 'display_name', p.display_name, 'status', p.status,
                            'case_ref', ref);
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
      'reason', l.reason, 'meta', private.audit_meta_safe(l.target_type, l.target_id, l.meta), 'created_at', l.created_at) order by l.id desc)
    from (select * from public.audit_log x
          where (admin_list_audit.cursor is null or x.id < admin_list_audit.cursor)
            and (a.campus_id is null or x.campus_id = a.campus_id)
            and (filters ->> 'action' is null or x.action like (filters ->> 'action') || '%')
            and (filters ->> 'target_id' is null or x.target_id = filters ->> 'target_id')
          order by x.id desc limit 100) l), '[]');
end;
$$;

create or replace function public.admin_list_audit_v2(filters jsonb default '{}', cursor bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  f_actor uuid;
  f_since timestamptz;
  f_until timestamptz;
  f_action text := nullif(filters ->> 'action', '');
  f_ttype text := nullif(filters ->> 'target_type', '');
  f_tid text := nullif(filters ->> 'target_id', '');
  items jsonb;
begin
  begin
    f_actor := nullif(filters ->> 'actor_id', '')::uuid;
    f_since := nullif(filters ->> 'since', '')::timestamptz;
    f_until := nullif(filters ->> 'until', '')::timestamptz;
  exception when others then
    perform private.raise('INVALID', 'filters');
  end;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'at', l.created_at, 'actor', private.person_brief(l.actor_id),
      'action', l.action, 'target_type', l.target_type, 'target_id', l.target_id,
      'target_label', case l.target_type
          when 'user' then (select p.display_name from public.profiles p where p.id::text = l.target_id)
          when 'listing' then (select x.title from public.listings x where x.id::text = l.target_id)
          when 'campus' then (select x.short_name from public.campuses x where x.id::text = l.target_id)
          else null end,
      'campus_id', l.campus_id, 'reason', l.reason, 'case_ref', l.case_ref, 'meta', private.audit_meta_safe(l.target_type, l.target_id, l.meta)) order by l.id desc), '[]'::jsonb)
    into items
  from (select * from public.audit_log x
        where (admin_list_audit_v2.cursor is null or x.id < admin_list_audit_v2.cursor)
          and (a.campus_id is null or x.campus_id = a.campus_id)
          and (f_actor is null or x.actor_id = f_actor)
          and (f_action is null or x.action like f_action || '%')
          and (f_ttype is null or x.target_type = f_ttype)
          and (f_tid is null or x.target_id = f_tid)
          and (f_since is null or x.created_at >= f_since)
          and (f_until is null or x.created_at < f_until)
        order by x.id desc limit 100) l;
  return jsonb_build_object('items', items,
    'next_cursor', case when jsonb_array_length(items) = 100 then (items -> -1 ->> 'id')::bigint end);
end;
$$;

create or replace function private.prepare_account_deletion(p_uid uuid, p_underage boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  addr text;
  prefixes text[];
  evidence jsonb;
begin
  select * into p from public.profiles x where x.id = p_uid;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.hit_key(p_uid, 'delete_account', 3, interval '1 day');

  -- Underage mode skips the confirmation and the goodbye email, so it is only
  -- for accounts the age check has just blocked.
  if p_underage and not exists (select 1 from public.age_blocks a where a.email_hash = p.email_hash) then
    perform private.raise('FORBIDDEN');
  end if;

  select u.email into addr from auth.users u where u.id = p_uid;

  -- Deal data stays for the other person (BE-01): close the chats read-only
  -- with a system message; snapshots and FKs (set null) do the rest.
  insert into public.messages (chat_id, sender_id, kind, body, created_at)
  select c.id, null, 'system', 'This account was deleted.', private.now()
  from public.chats c
  where p_uid in (c.buyer_id, c.seller_id) and c.status <> 'closed';
  update public.chats c
     set status = 'closed', closed_at = coalesce(c.closed_at, private.now())
   where p_uid in (c.buyer_id, c.seller_id) and c.status <> 'closed';

  -- A banned person can't come back with the same address.
  if p.status = 'banned' then
    insert into public.banned_hashes (email_hash, created_at) values (p.email_hash, private.now())
    on conflict do nothing;
  end if;

  -- Media the person owns (R2 prefixes), computed before the rows go away.
  prefixes := array['c/' || p.campus_id || '/u/' || p_uid || '/']
    || coalesce((select array_agg(x order by x collate "C") from (
         select 'c/' || l.campus_id || '/l/' || l.id || '/' as x
         from public.listings l where l.seller_id = p_uid
         union
         select 'share/' || l.id || '.jpg'
         from public.listings l where l.seller_id = p_uid
         union
         select 'c/' || p.campus_id || '/l/' || r.id || '/'
         from public.listing_reservations r where r.user_id = p_uid) s), '{}');

  -- Photos that open reports about this person point at (BE-02). They are
  -- moved to the private bucket before the prefixes above are deleted.
  select coalesce(jsonb_agg(jsonb_build_object('report_id', r.id, 'key', k.key) order by r.id, k.key), '[]'::jsonb)
    into evidence
  from public.reports r
  cross join lateral jsonb_array_elements_text(coalesce(r.evidence -> 'photo_keys', '[]'::jsonb)) as k(key)
  where r.status = 'open'
    and (r.target_user_id = p_uid or private.quad_report_author(r.target_type, r.target_id) = p_uid)
    and coalesce(r.evidence ->> 'photo_bucket', 'media') = 'media';

  -- Rows keyed by the user id without a foreign key.
  delete from public.activity_days where user_id = p_uid;
  delete from public.listing_reservations where user_id = p_uid;
  delete from public.rate_counters where user_id = p_uid;

  if not p_underage and addr is not null then
    perform private.queue_email(addr, 'account_deleted', '{}'::jsonb, 'account_deleted:' || p_uid::text);
  end if;

  -- Admin v2 (DEC 93): a record that the deletion started (no name, no email).
  update public.account_deletions d set started_at = private.now(), underage = p_underage
   where d.user_id = p_uid and d.status = 'started';
  if not found then
    insert into public.account_deletions (user_id, campus_id, underage, status, started_at)
    values (p_uid, p.campus_id, p_underage, 'started', private.now());
  end if;

  return jsonb_build_object(
    'email', case when p_underage then null else addr end,
    'r2_prefixes', to_jsonb(prefixes),
    'evidence', evidence);
end;
$$;


revoke all on function private.quad_report_author(text, text) from public, anon, authenticated;
revoke all on function private.reports_drop_quad_author() from public, anon, authenticated;
revoke all on function private.audit_meta_safe(text, text, jsonb) from public, anon, authenticated;
-- The audit_log policy calls it as the reader (like private.is_admin).
grant execute on function private.audit_meta_safe(text, text, jsonb) to authenticated;
