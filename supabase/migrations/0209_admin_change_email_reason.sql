-- Admin console v2 (docs/ADMIN_CHECKLIST.md §2): changing a student's email
-- needs a reason like every other staff action. Additive overload of
-- admin_change_email(user_id, new_email) with a required `reason` (3+
-- characters, else INVALID:reason) that goes to the audit row. The two-argument
-- version stays for older consoles and keeps writing `email_access_recovery`.

create or replace function public.admin_change_email(user_id uuid, new_email text, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_change_email.reason);
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

  perform private.audit(a.user_id, 'change_email', 'user', target.id::text, target.campus_id, why,
    jsonb_build_object('new_domain', dom.domain, 'request_id', request_id));
  return jsonb_build_object('ok', true, 'request_id', request_id);
end;
$$;

revoke all on function public.admin_change_email(uuid, text, text) from public, anon;
grant execute on function public.admin_change_email(uuid, text, text) to authenticated, service_role;
