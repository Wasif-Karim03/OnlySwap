-- 0204_waitlist_invites.sql · S49 (P4-AUTH-12, P4-AUTH-13, R11-INVITE-01; DATA_MODEL §4.7)
--   * Campus opening is one path for both ways a campus goes waitlist → live:
--     private.unlock_campus (automatic, at the threshold) and an owner flip in
--     admin_update_campus. trg_campuses_open sets unlocked_at and
--     private.open_campus moves waitlisted members to active, queues one
--     campus_unlocked notification each (dedupe campus_unlocked:{campus}) and
--     the campus_open emails to matching waitlist requests (dedupe per address).
--   * trg_profiles_waitlist: a new member on a waitlist campus that brings it to
--     its threshold unlocks it (not the demo campus, not campuses the owner
--     keeps under manual control: app_config.manual_unlock_campuses, a JSON
--     list of slugs; no row means none).
--   * my_waitlist_position() grows (additive keys): campus, invite code, how
--     many people signed up with it, and the A10 "campus unlocked" flag.
--   * mark_unlock_seen(): A10 shown once (profiles.seen_unlock_at).
--   * get_invite(code): public, 60/min per IP, for /i/:code. The inviter's
--     first name and the campus progress only; null for unknown codes.
-- Signup credit (invited_by from raw_user_meta_data.invite_code, same campus
-- only) is already in on_auth_user_created (0010).

-- ---------------------------------------------------------------------------
-- The opening itself. Idempotent: members already active are not touched and
-- every notification and email carries a dedupe key.
create or replace function private.open_campus(p_campus uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.campuses;
  member record;
  wl record;
  email_key text;
begin
  select * into c from public.campuses x where x.id = p_campus;
  if not found or c.status <> 'live' then
    return;
  end if;

  for member in
    update public.profiles set status = 'active'
     where campus_id = p_campus and status = 'waitlist'
    returning id
  loop
    perform private.queue_notification(
      member.id, 'campus_unlocked', 'campus',
      'OnlySwap is open at ' || c.short_name,
      'Start swiping, or list something to sell.',
      jsonb_build_object('url', '/unlocked', 'campus_id', p_campus), false,
      'campus_unlocked:' || p_campus::text);
  end loop;

  -- Waitlist emails need the Vault key; without it the campus still opens and
  -- the emails can be sent later from the admin panel.
  select decrypted_secret into email_key
  from vault.decrypted_secrets where name = 'waitlist_email_key'
  order by created_at desc limit 1;
  if email_key is not null then
    for wl in
      select w.id, w.email_hash, extensions.pgp_sym_decrypt(w.email_enc, email_key) as email
      from public.waitlist_requests w
      join public.campus_domains d on d.domain = w.domain and d.kind = 'student'
      where d.campus_id = p_campus and w.notified_at is null
    loop
      perform private.queue_email(
        wl.email, 'campus_open',
        jsonb_build_object('campus', c.short_name),
        'campus_open:' || p_campus::text || ':' || wl.email_hash);
      update public.waitlist_requests set notified_at = private.now() where id = wl.id;
    end loop;
  end if;
end;
$$;

-- Campus unlock (DATA_MODEL §4.7). Only the first call flips the campus; the
-- status trigger below does the rest. Returns whether this call opened it.
create or replace function private.unlock_campus(p_campus uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.campuses
     set status = 'live'
   where id = p_campus and status = 'waitlist';
  return found;
end;
$$;

create or replace function private.campuses_bu_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.unlocked_at := coalesce(new.unlocked_at, private.now());
  return new;
end;
$$;

create or replace function private.campuses_au_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.open_campus(new.id);
  return null;
end;
$$;

drop trigger if exists trg_campuses_open_stamp on public.campuses;
create trigger trg_campuses_open_stamp before update of status on public.campuses
for each row when (old.status = 'waitlist' and new.status = 'live')
execute function private.campuses_bu_open();

drop trigger if exists trg_campuses_open on public.campuses;
create trigger trg_campuses_open after update of status on public.campuses
for each row when (old.status = 'waitlist' and new.status = 'live')
execute function private.campuses_au_open();

-- ---------------------------------------------------------------------------
-- trg_profiles_waitlist (API §2): the member that reaches the threshold opens
-- the campus. Members = profiles not banned (same count as campus_progress).
create or replace function private.profiles_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.campuses;
  members int;
begin
  select * into c from public.campuses x where x.id = new.campus_id;
  if c.status <> 'waitlist' or c.is_demo
     or exists (select 1 from public.app_config a
                where a.key = 'manual_unlock_campuses'
                  and jsonb_typeof(a.value) = 'array'
                  and a.value ? c.slug) then
    return null;
  end if;
  select count(*) into members from public.profiles p
  where p.campus_id = c.id and p.status <> 'banned';
  if members >= c.unlock_threshold then
    perform private.unlock_campus(c.id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_profiles_waitlist on public.profiles;
create trigger trg_profiles_waitlist after insert on public.profiles
for each row when (new.status = 'waitlist')
execute function private.profiles_waitlist();

-- ---------------------------------------------------------------------------
-- Waitlist screen (A09) and the unlocked screen (A10). Same keys as before plus:
--   campus {id, name, short_name, slug, status, unlocked_at}, invite_code,
--   invited (signups with my code), seen_unlock_at, show_unlocked (my campus
--   opened after I joined and I haven't seen A10 yet).
create or replace function public.my_waitlist_position()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  c public.campuses;
  members int;
  pos int;
begin
  if auth.uid() is null then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  select * into me from public.profiles p where p.id = auth.uid();
  if not found then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  select * into c from public.campuses x where x.id = me.campus_id;
  select count(*) into members from public.profiles p
  where p.campus_id = me.campus_id and p.status <> 'banned';
  if me.status = 'waitlist' then
    select count(*) + 1 into pos from public.profiles p
    where p.campus_id = me.campus_id and p.status = 'waitlist'
      and (p.created_at, p.id) < (me.created_at, me.id);
  end if;
  return jsonb_build_object(
    'position', pos, 'members', members, 'threshold', c.unlock_threshold,
    'campus', jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name, 'slug', c.slug,
                                 'status', c.status, 'unlocked_at', c.unlocked_at),
    'invite_code', me.invite_code,
    'invited', (select count(*)::int from public.profiles p where p.invited_by = me.id),
    'seen_unlock_at', me.seen_unlock_at,
    'show_unlocked', c.status = 'live' and c.unlocked_at is not null
                     and me.created_at < c.unlocked_at and me.seen_unlock_at is null);
end;
$$;

-- A10 seen. Idempotent: the first time is kept.
create or replace function public.mark_unlock_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
begin
  update public.profiles p set seen_unlock_at = coalesce(p.seen_unlock_at, private.now()) where p.id = me.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- /i/:code (W05). Public; 60/min per IP (T-SEC-11). Codes are matched the way
-- signup matches them (trimmed, upper case). Null when the code is unknown,
-- the inviter can't be shown (banned, suspended) or the campus is the demo or
-- paused one; the page then falls back to the landing.
create or replace function public.get_invite(code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  k text := upper(btrim(coalesce(get_invite.code, '')));
  res jsonb;
begin
  perform private.hit_ip('get_invite', 60, interval '1 minute');
  if k !~ '^[A-Z0-9]{4,16}$' then
    return null;
  end if;
  select jsonb_build_object(
           'first_name', p.first_name,
           'campus_name', c.short_name,
           'campus_slug', c.slug,
           'campus_status', c.status,
           'members', (select count(*)::int from public.profiles x where x.campus_id = c.id and x.status <> 'banned'),
           'threshold', c.unlock_threshold)
    into res
  from public.profiles p
  join public.campuses c on c.id = p.campus_id
  where p.invite_code = k
    and p.status in ('active', 'waitlist', 'reverify', 'paused')
    and not c.is_demo and c.status in ('live', 'waitlist');
  return res;
end;
$$;

-- ---------------------------------------------------------------------------
revoke all on function private.open_campus(uuid) from public, anon, authenticated;
revoke all on function private.unlock_campus(uuid) from public, anon, authenticated;
revoke all on function private.campuses_bu_open() from public, anon, authenticated;
revoke all on function private.campuses_au_open() from public, anon, authenticated;
revoke all on function private.profiles_waitlist() from public, anon, authenticated;
revoke all on function public.my_waitlist_position() from public, anon;
revoke all on function public.mark_unlock_seen() from public, anon;
revoke all on function public.get_invite(text) from public;
grant execute on function public.my_waitlist_position() to authenticated, service_role;
grant execute on function public.mark_unlock_seen() to authenticated, service_role;
grant execute on function public.get_invite(text) to anon, authenticated, service_role;
