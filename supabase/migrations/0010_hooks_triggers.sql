-- 0010_hooks_triggers.sql (P3-AUTH-01, P3-AUTH-02; API.md §2)
-- The two Postgres Auth hooks and the new-user trigger. The remaining §2
-- triggers ship with the features that need them (later migrations).
--
-- Hooks run as supabase_auth_admin (GoTrue). They are security definer so they
-- can read the owner-only tables, and nothing else may execute them.

-- ---------------------------------------------------------------------------
-- before_user_created: only verified students (and listed reviewer accounts)
-- can create an account. Errors are codes the app maps to copy (API §0).
create or replace function private.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(event #>> '{user,email}', '')));
  v_domain text;
  hash text;
  dom public.campus_domains;
  demo boolean;
  code text;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    code := 'SCHOOL_UNKNOWN';
  else
    v_domain := split_part(v_email, '@', 2);
    hash := private.email_hash(v_email);
    if exists (select 1 from public.age_blocks a where a.email_hash = hash) then
      code := 'AGE_BLOCKED';
    elsif exists (select 1 from public.banned_hashes b where b.email_hash = hash) then
      code := 'BANNED';
    elsif exists (select 1 from public.review_accounts r where lower(r.email) = v_email) then
      code := null;
    else
      select * into dom from public.campus_domains d where d.domain = v_domain;
      select c.is_demo into demo from public.campuses c where c.id = dom.campus_id;
      if dom.domain is null then
        code := 'SCHOOL_UNKNOWN';
      elsif dom.kind = 'blocked' then
        code := 'DOMAIN_BLOCKED';
      elsif demo then
        -- The reviewer campus only admits the accounts listed in review_accounts.
        code := 'SCHOOL_UNKNOWN';
      end if;
    end if;
  end if;

  if code is null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', code));
end;
$$;

-- ---------------------------------------------------------------------------
-- custom_access_token: campus_id, status, adult, admin_role (DATA_MODEL §2.1).
-- Reads use these claims (ADR-013); writes re-check the live row.
create or replace function private.hook_custom_access_token(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (event ->> 'user_id')::uuid;
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  p public.profiles;
  v_role public.admin_role;
begin
  select * into p from public.profiles x where x.id = uid;
  select a.role into v_role from public.admins a where a.user_id = uid;
  claims := claims
    || jsonb_build_object(
         'campus_id', p.campus_id,
         'status', p.status,
         'adult', p.adult_confirmed_at is not null,
         'admin_role', v_role);
  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- ---------------------------------------------------------------------------
-- on_auth_user_created: the profile and its notification preferences. The
-- campus comes from the email domain (reviewer accounts are listed on the demo
-- campus's domain). Waitlist when the campus isn't live yet.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(new.email));
  c public.campuses;
  inviter uuid;
begin
  select cp.* into c
  from public.campus_domains d
  join public.campuses cp on cp.id = d.campus_id
  where d.domain = split_part(v_email, '@', 2) and d.kind = 'student';
  if c.id is null then
    -- The before_user_created hook already refused these; never create a
    -- campus-less profile.
    raise exception using errcode = 'P0001', message = 'SCHOOL_UNKNOWN';
  end if;

  select p.id into inviter
  from public.profiles p
  where p.invite_code = upper(btrim(new.raw_user_meta_data ->> 'invite_code'))
    and p.campus_id = c.id;

  insert into public.profiles (id, campus_id, email_hash, status, verified_until, invited_by, created_at)
  values (
    new.id, c.id, private.email_hash(v_email),
    case when c.status = 'live' then 'active' else 'waitlist' end::public.user_status,
    (private.now() + make_interval(months => c.reverify_months))::date,
    inviter, private.now())
  on conflict (id) do nothing;

  insert into public.notification_prefs (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
revoke all on function private.hook_before_user_created(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.hook_custom_access_token(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.handle_new_user() from public, anon, authenticated, service_role;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.hook_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function private.hook_custom_access_token(jsonb) to supabase_auth_admin;
