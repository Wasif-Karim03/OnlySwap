-- 0232: unread_count (API §2, listed but never built; DEC 120).
-- The bell in the app headers shows how many notifications are unread. The
-- count alone, so the badge doesn't pull a page of notifications each time.
-- Reads only the caller's rows; same count as get_notifications.unread.

create or replace function public.unread_count()
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_member();
begin
  return (select count(*)::int from public.notifications nn where nn.user_id = me.id and nn.read_at is null);
end;
$$;

revoke all on function public.unread_count() from public, anon;
grant execute on function public.unread_count() to authenticated;
