-- 0029_safety_account.sql (S30: P11-SAFE-03, P11-SAFE-04; DEC 66)
--   get_account_status: what X10 shows a paused, suspended or banned person
--   (it works for any status, so it can't use require_active).
--   list_blocked: F13 Blocked accounts.

create or replace function public.get_account_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
begin
  if uid is null then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  select * into p from public.profiles where id = uid;
  if not found then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  return jsonb_build_object(
    'status', p.status,
    'reason', p.status_reason,
    'paused_until', p.paused_until,
    'strikes', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'reason', s.reason, 'expires_at', s.expires_at, 'created_at', s.created_at)
                       order by s.created_at desc)
      from public.strikes s where s.user_id = uid and s.cleared_at is null), '[]'),
    'noshows', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'status', n.status, 'created_at', n.created_at) order by n.created_at desc)
      from public.noshow_reports n where n.reported_id = uid and n.status in ('open', 'confirmed')), '[]'),
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'subject_type', a.subject_type, 'subject_id', a.subject_id,
                                          'status', a.status, 'created_at', a.created_at) order by a.created_at desc)
      from public.appeals a where a.user_id = uid), '[]'));
end;
$$;

create or replace function public.list_blocked()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_member();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', b.blocked_id, 'display_name', p.display_name,
                                        'avatar_path', p.avatar_path, 'blocked_at', b.created_at) order by b.created_at desc)
    from public.blocks b
    join public.profiles p on p.id = b.blocked_id
    where b.blocker_id = me.id), '[]');
end;
$$;

revoke all on function public.get_account_status() from public, anon;
revoke all on function public.list_blocked() from public, anon;
grant execute on function public.get_account_status() to authenticated;
grant execute on function public.list_blocked() to authenticated;
