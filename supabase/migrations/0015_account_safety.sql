-- 0015_account_safety.sql (S15: P4-AUTH-14, P4-AUTH-18, P4-AUTH-19)
--   * require_active also refuses an account whose yearly check is overdue
--     (verified_until before today on the campus clock), before the nightly
--     reverify_enforce job has flipped its status (DATA_MODEL §4 reverify).
--   * complete_reverify: a fresh email code renews verified_until (X9).
--   * private.revoke_sessions: the database half of revoke-sessions (ARC-01).
--   * private.record_support_request: the database half of support-request.
--   * admin_change_email + on_auth_user_email_changed: email-access recovery
--     (PM-03). The owner changes the address; the campus follows the domain.

-- ---------------------------------------------------------------------------
-- Campus-local "today" for a user.
create or replace function private.campus_today(p_campus uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (private.now() at time zone coalesce(
            (select c.timezone from public.campuses c where c.id = p_campus),
            'America/New_York'))::date
$$;

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
  today date;
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
  today := private.campus_today(p.campus_id);
  if p.verified_until < today then
    perform private.raise('NOT_ACTIVE', 'reverify');
  end if;
  if p.adult_confirmed_at is null then
    perform private.raise('AGE_REQUIRED');
  end if;
  select value #>> '{}' into current_rules from public.app_config where key = 'rules_version';
  if p.rules_accepted_at is null or p.rules_version is distinct from current_rules then
    perform private.raise('RULES_REQUIRED');
  end if;
  insert into public.activity_days (user_id, day)
  values (uid, today)
  on conflict do nothing;
  return p;
end;
$$;

-- ---------------------------------------------------------------------------
-- X9 Re-verify (P4-AUTH-14). The caller must have signed in with an emailed
-- code in the last 10 minutes (the session's amr), which proves the school
-- inbox still works. Renews verified_until by the campus's reverify_months
-- and lifts the reverify status.
create or replace function public.complete_reverify()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_onboarding();
  fresh boolean;
  c public.campuses;
  until date;
begin
  perform private.hit('complete_reverify', 10, interval '1 hour');
  select exists (
    select 1
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' = 'otp'
      and to_timestamp((a ->> 'timestamp')::double precision) >= private.now() - interval '10 minutes'
  ) into fresh;
  if not fresh then
    perform private.raise('FORBIDDEN', 'code_required');
  end if;

  select * into c from public.campuses where id = me.campus_id;
  until := (private.campus_today(me.campus_id) + make_interval(months => c.reverify_months))::date;
  update public.profiles p
     set verified_until = until,
         status = case
                    when p.status = 'reverify' and c.status = 'live' then 'active'::public.user_status
                    when p.status = 'reverify' then 'waitlist'::public.user_status
                    else p.status
                  end
   where p.id = me.id;
  return jsonb_build_object('verified_until', until);
end;
$$;

revoke all on function public.complete_reverify() from public, anon;
grant execute on function public.complete_reverify() to authenticated;

-- ---------------------------------------------------------------------------
-- Sign a user out everywhere (P4-AUTH-18, ARC-01): deleting the sessions
-- removes their refresh tokens, so no device can renew its access token.
-- Writes already fail right away because require_active reads the live row.
create or replace function private.revoke_sessions(p_user uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  delete from auth.sessions s where s.user_id = p_user;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Help form (F20, P4-AUTH-19). Stored for the owner and emailed to the
-- support inbox (Vault `support_inbox`); 3 per hour per IP.
create or replace function private.record_support_request(
  p_email text, p_topic text, p_body text, p_ip text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  email text := lower(btrim(coalesce(p_email, '')));
  msg text := btrim(coalesce(p_body, ''));
  inbox text;
  new_id uuid;
begin
  if email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(email) > 254 then
    perform private.raise('INVALID', 'email');
  end if;
  if p_topic is null or p_topic not in ('general', 'cant_access_email', 'safety', 'bug', 'other') then
    perform private.raise('INVALID', 'topic');
  end if;
  if char_length(msg) < 1 or char_length(msg) > 2000 then
    perform private.raise('INVALID', 'body');
  end if;
  perform private.hit_key(private.ip_key(p_ip), 'ip:support', 3, interval '1 hour');

  insert into public.support_requests (email, topic, body, created_at)
  values (email, p_topic, msg, private.now())
  returning id into new_id;

  select decrypted_secret into inbox from vault.decrypted_secrets
  where name = 'support_inbox' order by created_at desc limit 1;
  if inbox is not null and inbox <> '' then
    perform private.queue_email(
      inbox, 'support_request',
      jsonb_build_object('id', new_id, 'topic', p_topic, 'reply_to', email, 'body', msg),
      'support_request:' || new_id::text);
  end if;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Email-access recovery (PM-03, T-INT-AUTH-07). Owner only, after checking
-- the person's identity by hand. The new address must be a student address of
-- a school we support. The Auth change itself happens in the
-- admin-change-email function (service key), reached through pg_net.
create or replace function public.admin_change_email(user_id uuid, new_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.admins := private.require_admin('owner');
  target public.profiles;
  v_email text := lower(btrim(coalesce(new_email, '')));
  dom public.campus_domains;
  base_url text;
  request_id bigint;
begin
  select * into target from public.profiles p where p.id = admin_change_email.user_id;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    perform private.raise('INVALID', 'new_email');
  end if;
  select * into dom from public.campus_domains d
  where d.domain = split_part(v_email, '@', 2) and d.kind = 'student';
  if dom.domain is null then
    perform private.raise('INVALID', 'new_email');
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email and u.id <> target.id) then
    perform private.raise('INVALID', 'new_email');
  end if;

  base_url := rtrim(private.secret('functions_url'), '/');
  select net.http_post(
    url := base_url || '/admin-change-email',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || private.secret('service_role_key')),
    body := jsonb_build_object('user_id', target.id, 'new_email', v_email)
  ) into request_id;

  insert into public.audit_log (actor_id, action, target_type, target_id, campus_id, reason, meta)
  values (a.user_id, 'change_email', 'user', target.id::text, target.campus_id, 'email_access_recovery',
          jsonb_build_object('new_domain', dom.domain, 'request_id', request_id));
  return jsonb_build_object('ok', true, 'request_id', request_id);
end;
$$;

revoke all on function public.admin_change_email(uuid, text) from public, anon;
grant execute on function public.admin_change_email(uuid, text) to authenticated;

-- When the address changes (email-access recovery, or a later "change
-- school"), the campus follows the new domain and the email hash is updated.
create or replace function private.handle_user_email_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(new.email));
  c public.campuses;
begin
  select cp.* into c
  from public.campus_domains d
  join public.campuses cp on cp.id = d.campus_id
  where d.domain = split_part(v_email, '@', 2) and d.kind = 'student';

  update public.profiles p
     set email_hash = private.email_hash(v_email),
         campus_id = coalesce(c.id, p.campus_id),
         status = case
                    when c.id is null or c.id = p.campus_id then p.status
                    when p.status in ('active', 'waitlist') and c.status = 'live' then 'active'::public.user_status
                    when p.status in ('active', 'waitlist') then 'waitlist'::public.user_status
                    else p.status
                  end
   where p.id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_changed();

revoke all on function private.campus_today(uuid) from public, anon, authenticated;
revoke all on function private.revoke_sessions(uuid) from public, anon, authenticated;
revoke all on function private.record_support_request(text, text, text, text) from public, anon, authenticated;
revoke all on function private.handle_user_email_changed() from public, anon, authenticated;
grant execute on function private.revoke_sessions(uuid) to service_role;
grant execute on function private.record_support_request(text, text, text, text) to service_role;
