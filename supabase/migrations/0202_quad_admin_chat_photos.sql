-- 0202_quad_admin_chat_photos.sql (S47: R11-ADM-03, P8-CHAT-04, R11-PHOTO-GATE; DEC 76)
-- 1. Quad moderation for admins: the queue (held, hidden by votes, reported),
--    approve, remove, and revealing an author (owner only, fresh MFA, a case
--    reference, 5 a day, an audit row and a receipt email to that person).
--    Queue rows never carry author ids; only the reveal does (SECURITY T12).
-- 2. Photos in chat, behind app_config.chat_photos_enabled. The owner turns it
--    on only with CSAM scanning in place or a logged risk acceptance
--    (R11-PHOTO-GATE): admin_set_config already writes the audit row with the
--    owner's reason. Chat photos are never public: messages carry a short-lived
--    signed path that the media Worker checks (MEDIA_SIGNING_KEY).

-- ---------------------------------------------------------------------------
-- Quad moderation

create or replace function public.admin_list_quad(filters jsonb default '{}', cursor int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  view text := coalesce(filters ->> 'view', 'held');
  campus uuid := private.admin_campus(a, nullif(filters ->> 'campus_id', '')::uuid);
begin
  if view not in ('held', 'hidden', 'reported') then
    perform private.raise('INVALID', 'view');
  end if;
  return coalesce((
    select jsonb_agg(x.item order by x.created_at desc)
    from (
      select t.created_at, jsonb_build_object(
               'target_type', t.target_type, 'id', t.id, 'post_id', t.post_id, 'campus_id', t.campus_id,
               'kind', t.kind, 'body', t.body, 'photo_path', t.photo_path, 'status', t.status,
               'hold_reason', t.hold_reason, 'score', t.score, 'created_at', t.created_at,
               'open_reports', (select count(*) from public.reports r
                                where r.target_type = 'quad_' || t.target_type and r.target_id = t.id::text
                                  and r.status = 'open')) as item
      from (
        select 'post' as target_type, q.id, q.id as post_id, q.campus_id, q.kind, q.body, q.photo_path,
               q.status, q.hold_reason, q.score, q.created_at
        from public.quad_posts q
        union all
        select 'reply', r.id, r.post_id, q.campus_id, 'reply', r.body, null, r.status, r.hold_reason, r.score,
               r.created_at
        from public.quad_replies r join public.quad_posts q on q.id = r.post_id
      ) t
      where (campus is null or t.campus_id = campus)
        and case view
              when 'held' then t.status = 'held'
              when 'hidden' then t.status = 'hidden'
              else t.status in ('live', 'held') and exists (
                select 1 from public.reports r
                where r.target_type = 'quad_' || t.target_type and r.target_id = t.id::text and r.status = 'open')
            end
      order by t.created_at desc
      offset greatest(coalesce(admin_list_quad.cursor, 0), 0) limit 50
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Shared lookup: the campus and current status of a post or reply.
create or replace function private.quad_target(p_type text, p_id uuid, out campus uuid, out status text, out author uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_type = 'post' then
    select q.campus_id, q.status, q.author_id into campus, status, author
    from public.quad_posts q where q.id = p_id for update;
  elsif p_type = 'reply' then
    select q.campus_id, r.status, r.author_id into campus, status, author
    from public.quad_replies r join public.quad_posts q on q.id = r.post_id where r.id = p_id for update of r;
  else
    perform private.raise('INVALID', 'target_type');
  end if;
  if campus is null then
    perform private.raise('NOT_FOUND');
  end if;
end;
$$;

create or replace function public.admin_moderate_quad(target_type text, id uuid, action text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  t record := private.quad_target(admin_moderate_quad.target_type, admin_moderate_quad.id);
  a public.admins := private.require_admin('moderator', t.campus);
  why text := private.need_reason(admin_moderate_quad.reason);
  new_status text;
begin
  if admin_moderate_quad.action not in ('approve', 'remove') then
    perform private.raise('INVALID', 'action');
  end if;
  if admin_moderate_quad.action = 'approve' and t.status not in ('held', 'hidden') then
    perform private.raise('INVALID', 'status');
  end if;
  if t.status = 'removed' then
    perform private.raise('INVALID', 'status');
  end if;
  new_status := case admin_moderate_quad.action when 'approve' then 'live' else 'removed' end;

  if admin_moderate_quad.target_type = 'post' then
    update public.quad_posts q
       set status = new_status,
           hold_reason = case when new_status = 'removed' then 'moderator' end,
           score = case when t.status = 'hidden' and new_status = 'live' then greatest(q.score, 0) else q.score end
     where q.id = admin_moderate_quad.id;
  else
    update public.quad_replies r
       set status = new_status,
           hold_reason = case when new_status = 'removed' then 'moderator' end,
           score = case when t.status = 'hidden' and new_status = 'live' then greatest(r.score, 0) else r.score end
     where r.id = admin_moderate_quad.id;
    -- Live replies are what the post counts.
    update public.quad_posts q
       set reply_count = (select count(*) from public.quad_replies x where x.post_id = q.id and x.status = 'live')
     where q.id = (select post_id from public.quad_replies where id = admin_moderate_quad.id);
  end if;

  update public.reports r
     set status = case when admin_moderate_quad.action = 'remove' then 'actioned' else 'dismissed' end::public.report_status,
         action_taken = case when admin_moderate_quad.action = 'remove' then 'remove_content' else 'dismiss' end,
         resolved_at = private.now(), assigned_to = a.user_id
   where r.target_type = 'quad_' || admin_moderate_quad.target_type
     and r.target_id = admin_moderate_quad.id::text and r.status = 'open';

  perform private.audit(a.user_id, 'quad.' || admin_moderate_quad.action, 'quad_' || admin_moderate_quad.target_type,
    admin_moderate_quad.id::text, t.campus, why, jsonb_build_object('from', t.status));
end;
$$;

-- Reveal who wrote a Quad post or reply (T-INT-ADMIN-03). Owner only, with
-- an MFA check in the last 10 minutes, a case reference, at most 5 a day.
-- The person gets a receipt email (they always learn it happened).
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
    admin_reveal_quad_author.id::text, t.campus, why, jsonb_build_object('case_ref', ref, 'author_id', t.author));
  if email is not null then
    perform private.queue_email(email, 'admin_reveal_receipt',
      jsonb_build_object('admin', 'An OnlySwap safety admin', 'what', 'who wrote a Quad post'),
      'quad_reveal:' || admin_reveal_quad_author.id || ':' || a.user_id);
  end if;

  return jsonb_build_object('user_id', t.author, 'display_name', p.display_name, 'status', p.status,
                            'case_ref', ref);
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat photos

-- A path the media Worker will serve for one hour: key?exp=&sig= where sig is
-- an HMAC-SHA256 of "key:exp" with the media signing key (Vault
-- media_signing_key; the same value is the Worker's MEDIA_SIGNING_KEY). The
-- expiry is the end of the next hour, so the same URL is reused (and cached)
-- for a while. Null when no key is configured.
create or replace function private.media_signed_path(p_key text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  secret text := private.secret('media_signing_key');
  exp bigint := extract(epoch from date_trunc('hour', private.now()) + interval '2 hours')::bigint;
begin
  if p_key is null or secret is null then
    return null;
  end if;
  return p_key || '?exp=' || exp || '&sig='
         || encode(extensions.hmac(p_key || ':' || exp, secret, 'sha256'), 'hex');
end;
$$;

create or replace function private.message_json(m public.messages, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'chat_id', m.chat_id, 'sender_id', m.sender_id, 'kind', m.kind,
                            'body', m.body, 'meta', m.meta, 'client_id', m.client_id,
                            'created_at', m.created_at, 'mine', m.sender_id = p_me,
                            'photo_path', m.photo_path,
                            'photo_url', case when m.kind = 'photo' then private.media_signed_path(m.photo_path) end)
$$;

-- Additive: send_message takes an optional photo_path (kind 'photo').
drop function if exists public.send_message(uuid, text, uuid, text);
create or replace function public.send_message(
  chat_id uuid,
  body text,
  client_id uuid,
  kind text default 'text',
  photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(send_message.chat_id, me.id);
  other uuid := case when c.buyer_id = me.id then c.seller_id else c.buyer_id end;
  m public.messages;
  txt text := btrim(coalesce(send_message.body, ''));
  v text;
  is_photo boolean := send_message.kind = 'photo';
begin
  -- Idempotent: the same client_id returns the message already sent (T-INT-CHAT-01).
  select * into m from public.messages x where x.chat_id = c.id and x.client_id = send_message.client_id;
  if found then
    return private.message_json(m, me.id);
  end if;
  if is_photo and not coalesce((select (x.value #>> '{}')::boolean from public.app_config x
                                where x.key = 'chat_photos_enabled'), false) then
    perform private.raise('FEATURE_OFF');
  end if;
  if send_message.kind not in ('text', 'photo') then
    perform private.raise('INVALID', 'kind');
  end if;
  if c.status = 'closed' then
    perform private.raise('CHAT_CLOSED');
  end if;
  if c.status = 'blocked' or other is null or private.is_blocked(me.id, other) then
    perform private.raise('CHAT_BLOCKED');
  end if;
  if send_message.client_id is null then
    perform private.raise('INVALID', 'client_id');
  end if;
  if is_photo then
    if send_message.photo_path is null
       or send_message.photo_path !~ ('^c/' || me.campus_id::text || '/chat/' || c.id::text
                                      || '/[0-9a-f-]{36}_full\.webp$') then
      perform private.raise('INVALID', 'photo_path');
    end if;
    if char_length(txt) > 1000 then
      perform private.raise('INVALID', 'body');
    end if;
    perform private.hit('send_photo', 30, interval '1 day');
  else
    if send_message.photo_path is not null then
      perform private.raise('INVALID', 'photo_path');
    end if;
    if txt = '' or char_length(txt) > 1000 then
      perform private.raise('INVALID', 'body');
    end if;
  end if;
  perform private.hit('send_message', 60, interval '1 minute');
  perform private.hit('send_message_day', 1000, interval '1 day');
  v := private.check_text(txt, 'chat');
  if v like 'block:%' then
    perform private.raise('BANNED_TERM', substr(v, 7));
  end if;

  insert into public.messages (chat_id, sender_id, kind, body, photo_path, client_id, created_at)
  values (c.id, me.id, case when is_photo then 'photo' else 'text' end::public.message_kind,
          nullif(txt, ''), send_message.photo_path, send_message.client_id, private.now())
  on conflict (chat_id, client_id) do nothing
  returning * into m;
  if not found then
    select * into m from public.messages x where x.chat_id = c.id and x.client_id = send_message.client_id;
  end if;
  return private.message_json(m, me.id);
end;
$$;

-- Uploads learn the 'chat' kind: a participant of an open, unblocked chat,
-- with chat photos switched on.
create or replace function private.can_upload(p_uid uuid, p_kind text, p_target uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  campus uuid;
  owner uuid;
begin
  select campus_id into campus from public.profiles where id = p_uid and status = 'active';
  if campus is null then
    perform private.raise('FORBIDDEN');
  end if;
  if p_kind = 'avatar' and p_target = p_uid then
    return campus;
  elsif p_kind = 'listing' and (
      exists (select 1 from public.listings l
              where l.id = p_target and l.seller_id = p_uid and l.status <> 'deleted')
      or exists (select 1 from public.listing_reservations r
                 where r.id = p_target and r.user_id = p_uid)) then
    return campus;
  elsif p_kind = 'share' and exists (
      select 1 from public.listings l
      where l.id = p_target and l.seller_id = p_uid and l.status <> 'deleted') then
    return campus;
  elsif p_kind = 'quad' and private.quad_on(campus)
        and exists (select 1 from public.profiles p where p.id = p_uid and p.quad_rules_accepted_at is not null) then
    select q.author_id into owner from public.quad_posts q where q.id = p_target;
    if owner is null or owner = p_uid then
      return campus;
    end if;
  elsif p_kind = 'chat'
        and coalesce((select (x.value #>> '{}')::boolean from public.app_config x
                      where x.key = 'chat_photos_enabled'), false)
        and exists (select 1 from public.chats c
                    where c.id = p_target and p_uid in (c.buyer_id, c.seller_id) and c.status not in ('closed', 'blocked')
                      and not private.is_blocked(c.buyer_id, c.seller_id)) then
    return campus;
  end if;
  perform private.raise('FORBIDDEN');
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
revoke all on function private.quad_target(text, uuid) from public, anon, authenticated;
revoke all on function private.media_signed_path(text) from public, anon, authenticated;
revoke all on function private.message_json(public.messages, uuid) from public, anon, authenticated;
revoke all on function private.can_upload(uuid, text, uuid) from public, anon, authenticated;
grant execute on function private.can_upload(uuid, text, uuid) to service_role;

revoke all on function public.admin_list_quad(jsonb, int) from public, anon;
revoke all on function public.admin_moderate_quad(text, uuid, text, text) from public, anon;
revoke all on function public.admin_reveal_quad_author(text, uuid, text, text) from public, anon;
revoke all on function public.send_message(uuid, text, uuid, text, text) from public, anon;
grant execute on function public.admin_list_quad(jsonb, int) to authenticated, service_role;
grant execute on function public.admin_moderate_quad(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_reveal_quad_author(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.send_message(uuid, text, uuid, text, text) to authenticated, service_role;
