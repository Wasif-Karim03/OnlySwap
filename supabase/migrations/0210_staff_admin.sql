-- Staff admin accounts (DEC 94, SECURITY T21 "separate admin email").
-- A staff email is not a school email: it may sign in to the admin console
-- and nothing else. It passes the sign-up hook, gets no profile (so it never
-- shows in the app, the deck, lists, metrics or crons) and becomes an owner.
-- The main admin email is fixed here; more staff come later with their own row.

create table private.staff_emails (
  email text primary key check (email = lower(btrim(email))),
  role public.admin_role not null default 'owner',
  created_at timestamptz not null default now()
);
revoke all on private.staff_emails from public, anon, authenticated;

insert into private.staff_emails (email, role) values ('mdwasifkarim2003@gmail.com', 'owner');

create or replace function private.is_staff_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.staff_emails s where s.email = lower(btrim(coalesce(p_email, ''))))
$$;
revoke all on function private.is_staff_email(text) from public, anon, authenticated;
grant execute on function private.is_staff_email(text) to supabase_auth_admin;

-- Admins may now be staff (no profile), so the row points at the auth user.
alter table public.admins drop constraint admins_user_id_fkey;
alter table public.admins add constraint admins_user_id_fkey
  foreign key (user_id) references auth.users on delete cascade;

-- Sign-up hook: staff emails pass (age and ban blocks still apply first).
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
    elsif private.is_staff_email(v_email) then
      code := null;
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

-- New account: staff get an admins row and no profile; students as before.
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
  staff public.admin_role;
begin
  select s.role into staff from private.staff_emails s where s.email = v_email;
  if staff is not null then
    insert into public.admins (user_id, role, campus_id) values (new.id, staff, null)
    on conflict (user_id) do nothing;
    return new;
  end if;

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

-- Staff have no profile: name them by their email in the console header and
-- the audit log instead of showing "Admin" or "System".
create or replace function private.staff_brief(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', u.id, 'display_name', u.email, 'initial', upper(left(u.email, 1)))
  from auth.users u
  join private.staff_emails s on s.email = lower(u.email)
  where u.id = p_user
$$;

create or replace function private.person_brief(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'initial', upper(left(coalesce(p.first_name, '?'), 1)))
     from public.profiles p where p.id = p_user),
    private.staff_brief(p_user))
$$;

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
    'name', coalesce((select p.display_name from public.profiles p where p.id = a.user_id),
                     private.staff_brief(a.user_id) ->> 'display_name'));
end;
$$;

-- The staff account may already exist (created before this migration ran).
insert into public.admins (user_id, role, campus_id)
select u.id, s.role, null from auth.users u join private.staff_emails s on s.email = lower(u.email)
on conflict (user_id) do nothing;
