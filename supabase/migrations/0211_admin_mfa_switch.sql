-- Admin two-step switch (DEC 95). The owner turned the console's two-step
-- check off for now: the email code alone signs an admin in. It is a private
-- switch (not app_config, so no admin can flip it from the console); turn it
-- back on before launch with
--   update private.admin_settings set mfa_required = true;
-- require_admin and is_admin then demand aal2 again, and the console shows the
-- authenticator step.

create table private.admin_settings (
  id boolean primary key default true check (id),
  mfa_required boolean not null
);
revoke all on private.admin_settings from public, anon, authenticated;
insert into private.admin_settings (mfa_required) values (false);

create or replace function private.admin_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not coalesce((select s.mfa_required from private.admin_settings s), true)
$$;
revoke all on function private.admin_mfa_ok() from public, anon, authenticated;

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
     or not private.admin_mfa_ok()
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
      and private.admin_mfa_ok()
  );
end;
$$;

-- whoami tells the console whether to show the authenticator step.
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
    'mfa_required', coalesce((select s.mfa_required from private.admin_settings s), true),
    'name', coalesce((select p.display_name from public.profiles p where p.id = a.user_id),
                     private.staff_brief(a.user_id) ->> 'display_name'));
end;
$$;
