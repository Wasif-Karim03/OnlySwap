-- 0234: live bell count (DEC 122).
-- A new or refreshed unread notification pings its owner on the private
-- `user:{uid}` channel (event 'bell'), so an open screen's bell badge
-- refetches unread_count at once. Likes are bell only (no push, DEC 121), so
-- before this the badge waited for a screen change. The payload is empty;
-- the app reads the count through unread_count. Marking read sends nothing.
-- Messages and offers already ping the same channel ('inbox', 0023/0223) and
-- the bell listens to that too, so they send nothing extra (one broadcast per
-- chat message, DEC 108; Realtime is on the free tier).

create or replace function private.notifications_ping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.read_at is null and new.grp not in ('messages', 'offers') then
    perform realtime.send('{}'::jsonb, 'bell', 'user:' || new.user_id, true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifications_ping on public.notifications;
create trigger trg_notifications_ping after insert or update of title, body, created_at on public.notifications
for each row execute function private.notifications_ping();

revoke all on function private.notifications_ping() from public, anon, authenticated;
