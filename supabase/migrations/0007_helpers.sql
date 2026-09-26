-- 0007_helpers.sql (P3-DB-07, P3-DB-10, P3-TEST-02; API.md §1)
-- private.* helpers used by every RPC, trigger and cron job. None of them is
-- callable by anon or authenticated directly; RPCs (security definer) call them.
-- Errors are raised as P0001 with MESSAGE 'CODE[:detail[:retry_at]]' (API §0).

-- ---------------------------------------------------------------------------
-- Time. Every time-based function and cron job uses private.now(), never now().
-- Tests travel in time by redefining it inside their own transaction
-- (tests.set_now); staging gets a persistent override from
-- supabase/migrations_staging, which production never runs (P3-TEST-02).
create or replace function private.now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now()
$$;

-- ---------------------------------------------------------------------------
-- Errors
create or replace function private.raise(code text, detail text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = case when detail is null then code else code || ':' || detail end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Secrets from Vault (peppers). Missing secrets fail closed.
create or replace function private.secret(secret_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  value text;
begin
  select decrypted_secret into value
  from vault.decrypted_secrets
  where name = secret_name
  order by created_at desc
  limit 1;
  if value is null or value = '' then
    raise exception using errcode = 'P0001', message = 'CONFIG_MISSING:' || secret_name;
  end if;
  return value;
end;
$$;

-- sha256(lower(trim(email)) || pepper), hex (API §1). The pepper lives in
-- Vault as `email_hash_pepper` and is never rotated (SECURITY §secrets).
create or replace function private.email_hash(email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    sha256(convert_to(lower(btrim(email)) || private.secret('email_hash_pepper'), 'UTF8')),
    'hex'
  )
$$;

-- ---------------------------------------------------------------------------
-- Identity checks (ADR-013: read the live profile on every write).
create or replace function private.require_active()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
  current_rules text;
  campus_tz text;
begin
  if uid is null then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  select * into p from public.profiles where id = uid;
  if not found then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  if p.status <> 'active' then
    perform private.raise('NOT_ACTIVE', p.status::text);
  end if;
  if p.adult_confirmed_at is null then
    perform private.raise('AGE_REQUIRED');
  end if;
  select value #>> '{}' into current_rules from public.app_config where key = 'rules_version';
  if p.rules_accepted_at is null or p.rules_version is distinct from current_rules then
    perform private.raise('RULES_REQUIRED');
  end if;
  select timezone into campus_tz from public.campuses where id = p.campus_id;
  insert into public.activity_days (user_id, day)
  values (uid, (private.now() at time zone coalesce(campus_tz, 'America/New_York'))::date)
  on conflict do nothing;
  return p;
end;
$$;

-- Owner outranks moderator. The admins row, AAL2 and the campus scope are all
-- required; any miss is NOT_ADMIN (API §1).
create or replace function private.admin_rank(role public.admin_role)
returns int
language sql
immutable
set search_path = ''
as $$
  select case role when 'owner' then 2 when 'moderator' then 1 else 0 end
$$;

create or replace function private.require_admin(
  min_role public.admin_role default 'moderator',
  for_campus uuid default null
)
returns public.admins
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.admins;
begin
  select * into a from public.admins where user_id = auth.uid();
  if not found
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2'
     or private.admin_rank(a.role) < private.admin_rank(min_role)
     or (for_campus is not null and a.campus_id is not null and a.campus_id <> for_campus) then
    perform private.raise('NOT_ADMIN');
  end if;
  return a;
end;
$$;

create or replace function private.is_admin(min_role public.admin_role default 'moderator')
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.admins a
    where a.user_id = auth.uid()
      and private.admin_rank(a.role) >= private.admin_rank(min_role)
      and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  );
end;
$$;

create or replace function private.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

-- ---------------------------------------------------------------------------
-- Rate limits (BE-16). Fixed windows aligned to the interval; the error carries
-- the time the window resets so the client can say "try again after 6:00 PM".
create or replace function private.hit_key(p_key uuid, p_action text, p_lim int, p_win interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket timestamptz := date_bin(p_win, private.now(), timestamptz '2000-01-01 00:00:00+00');
  used int;
begin
  insert into public.rate_counters as rc (user_id, action, window_start, count)
  values (p_key, p_action, bucket, 1)
  on conflict (user_id, action, window_start)
  do update set count = rc.count + 1
  returning rc.count into used;
  if used > p_lim then
    perform private.raise(
      'RATE_LIMITED',
      p_action || ':' || to_char((bucket + p_win) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  end if;
end;
$$;

create or replace function private.hit(p_action text, p_lim int, p_win interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  perform private.hit_key(uid, p_action, p_lim, p_win);
end;
$$;

-- For anon endpoints (waitlist, lookup_school): keyed by a hash of the first
-- x-forwarded-for address, so the IP itself is never stored.
create or replace function private.client_ip_key()
returns uuid
language sql
stable
set search_path = ''
as $$
  select md5(
    'ip:' || coalesce(
      nullif(btrim(split_part(
        coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-forwarded-for',
        ',', 1)), ''),
      'unknown'
    )
  )::uuid
$$;

create or replace function private.hit_ip(p_action text, p_lim int, p_win interval)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.hit_key(private.client_ip_key(), 'ip:' || p_action, p_lim, p_win);
end;
$$;

-- ---------------------------------------------------------------------------
-- Text checks
-- Lowercase, strip accents, undo common leetspeak, squash long letter runs
-- ("weeeed" -> "weed", "beer" stays) and turn punctuation into single spaces.
create or replace function private.normalize_text(txt text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      translate(lower(private.unaccent_immutable(coalesce(txt, ''))), '013457@$!|', 'oieastasii'),
      '(.)\1{2,}', '\1\1', 'g'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- 'ok', 'block:<term>' or 'review:<term>' (API §1). Block wins over review;
-- longer terms win within an action. Counts each firing for the admin list.
create or replace function private.check_text(txt text, scope text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  norm text := ' ' || private.normalize_text(txt) || ' ';
  hit record;
begin
  if coalesce(btrim(txt), '') = '' then
    return 'ok';
  end if;
  select w.id, w.pattern, w.action into hit
  from public.banned_words w
  where scope = any (w.scopes)
    and case w.match
          when 'regex' then norm ~ w.pattern
          else norm like '% ' || private.normalize_text(w.pattern) || ' %'
        end
  order by (w.action = 'block') desc, length(w.pattern) desc, w.pattern
  limit 1;
  if not found then
    return 'ok';
  end if;
  update public.banned_words set fired_count = fired_count + 1 where id = hit.id;
  return hit.action || ':' || hit.pattern;
end;
$$;

-- Personal info that must not appear in anonymous posts (T-INT-QUAD-01):
-- phone, email, URL, @handle, room number. Returns 'ok' or 'pii:<kind>'.
create or replace function private.pii_check(txt text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when txt is null or btrim(txt) = '' then 'ok'
    when txt ~ '(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}' then 'pii:phone'
    when txt ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then 'pii:email'
    when txt ~* '(https?://|www\.)\S+|\m[a-z0-9-]+\.(com|net|org|io|me|co|app|edu|gg|ly)\M' then 'pii:url'
    when txt ~* '(^|\s)@[a-z0-9_.]{2,}' then 'pii:handle'
    when txt ~* '\m(room|rm|apt|dorm|suite)\s*#?\s*\d{2,4}[a-z]?\M' then 'pii:room'
    else 'ok'
  end
$$;

-- True when the text names someone by a common first name (R1.1 Quad rule:
-- posts that name a student are held for review).
create or replace function private.names_student(txt text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from regexp_split_to_table(coalesce(txt, ''), '[^A-Za-z]+') as word
    join public.common_first_names n on n.name = lower(word)
    where word ~ '^[A-Z][a-z]+$'
  )
$$;

-- ---------------------------------------------------------------------------
-- Outboxes (BE-04). Duplicates are dropped silently; the id of a new row is
-- returned, null when it was a duplicate.
create or replace function private.queue_notification(
  p_user uuid,
  p_type text,
  p_grp text,
  p_title text,
  p_body text,
  p_data jsonb default '{}',
  p_time_sensitive boolean default false,
  p_dedupe_key text default null,
  p_push_after timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  insert into public.notifications
    (user_id, type, grp, title, body, data, time_sensitive, dedupe_key, push_after)
  values
    (p_user, p_type, p_grp, p_title, p_body, coalesce(p_data, '{}'), coalesce(p_time_sensitive, false),
     p_dedupe_key, coalesce(p_push_after, private.now()))
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function private.queue_email(
  p_to text,
  p_template text,
  p_vars jsonb default '{}',
  p_dedupe_key text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  insert into public.email_outbox (to_email, template, vars, dedupe_key, send_after)
  values (p_to, p_template, coalesce(p_vars, '{}'), p_dedupe_key, private.now())
  on conflict (dedupe_key) do nothing
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Campus unlock (DATA_MODEL §4.7). Idempotent: only the first call flips the
-- campus and moves its waitlisted members to active; notifications and emails
-- carry dedupe keys, so a retry queues nothing new.
create or replace function private.unlock_campus(p_campus uuid)
returns boolean
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
  update public.campuses
     set status = 'live', unlocked_at = coalesce(unlocked_at, private.now())
   where id = p_campus and status = 'waitlist'
  returning * into c;
  if not found then
    return false;
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
      jsonb_build_object('url', '/discover'), false,
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
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Uploads (called by the upload-url Edge Function with the service role).
-- Returns the campus id used in the object path, or raises FORBIDDEN.
create or replace function private.can_upload(p_uid uuid, p_kind text, p_target uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  campus uuid;
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
  end if;
  perform private.raise('FORBIDDEN');
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Report evidence (BE-02): a copy of what was reported, kept even if the
-- original is edited or deleted. {text, excerpts[], photo_keys[], captured_at}
create or replace function private.snapshot_evidence(p_type text, p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ev jsonb := jsonb_build_object('captured_at', private.now());
  chat uuid;
  upto bigint;
begin
  if p_type = 'listing' then
    select ev || jsonb_build_object(
             'text', l.title || coalesce(E'\n' || l.description, ''),
             'photo_keys', coalesce((select jsonb_agg(p.path order by p.idx)
                                     from public.listing_photos p where p.listing_id = l.id), '[]'::jsonb))
      into ev
      from public.listings l where l.id::text = p_id;
  elsif p_type = 'user' then
    select ev || jsonb_build_object(
             'text', coalesce(p.display_name, '') || coalesce(E'\n' || p.bio, ''),
             'photo_keys', case when p.avatar_path is null then '[]'::jsonb
                                else jsonb_build_array(p.avatar_path) end)
      into ev
      from public.profiles p where p.id::text = p_id;
  elsif p_type in ('chat', 'message') then
    if p_type = 'chat' then
      chat := p_id::uuid;
      upto := null;
    else
      select m.chat_id, m.id into chat, upto from public.messages m where m.id::text = p_id;
      select ev || jsonb_build_object('text', m.body) into ev from public.messages m where m.id = upto;
    end if;
    select ev || jsonb_build_object(
             'excerpts', coalesce(jsonb_agg(jsonb_build_object(
                           'id', x.id, 'sender_id', x.sender_id, 'kind', x.kind,
                           'body', x.body, 'created_at', x.created_at) order by x.id), '[]'::jsonb),
             'photo_keys', coalesce(jsonb_agg(x.photo_path order by x.id)
                                    filter (where x.photo_path is not null), '[]'::jsonb))
      into ev
      from (select m.* from public.messages m
             where m.chat_id = chat and (upto is null or m.id <= upto)
             order by m.id desc limit 20) x;
  end if;
  return ev;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nothing in private is callable by the API roles; RPCs (security definer)
-- and the service role use these.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;

-- RPCs in public are granted explicitly, one by one (API.md: authenticated,
-- or anon for the public ones). New functions start with no EXECUTE for
-- PUBLIC, anon or authenticated; the contract snapshot records every grant.
-- PUBLIC's EXECUTE comes from the global default, so it is revoked globally.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
