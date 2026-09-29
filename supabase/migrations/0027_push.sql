-- 0027_push.sql (S28: P9-PUSH-03, P9-FIX-01; S29 list RPCs; API §3 Notifications, §5, §6, DEC 64)
--   register_push_token, disable_push_token, get_notifications,
--   mark_notifications_read, get_notification_prefs, update_notification_prefs,
--   the send-push claim/finish helpers (for update skip locked), receipts,
--   reset_stuck_sends and the notify_push / push_receipts / reset_stuck_sends crons.

-- Calls an internal Edge Function with the service key through pg_net; returns
-- null (and does nothing) when Vault isn't configured (local without secrets).
create or replace function private.call_function(p_name text, p_body jsonb default '{}')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid bigint;
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'functions_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    return null;
  end if;
  select net.http_post(
    url := rtrim(private.secret('functions_url'), '/') || '/' || p_name,
    body := coalesce(p_body, '{}'),
    headers := jsonb_build_object('content-type', 'application/json',
                                  'authorization', 'Bearer ' || private.secret('service_role_key')),
    timeout_milliseconds := 60000)
  into rid;
  return rid;
end;
$$;

-- Which preference switch governs a notification type (API §7); null = always.
create or replace function private.push_pref(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'offer_%' then 'offers'
    when p_type = 'message_new' then 'messages'
    when p_type like 'meetup_%' or p_type in ('deal_check', 'rate_prompt') then 'meetups'
    when p_type in ('saved_search_match', 'watch_available') then 'saved_search'
    when p_type = 'price_drop' then 'price_drop'
    when p_type = 'listing_stale' then 'tips'
    else null
  end
$$;

-- ---------------------------------------------------------------------------
-- Tokens
create or replace function public.register_push_token(token text, platform text, app_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
begin
  perform private.hit('register_push_token', 20, interval '1 day');
  if register_push_token.token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    perform private.raise('INVALID', 'token');
  end if;
  if register_push_token.platform not in ('ios', 'android') then
    perform private.raise('INVALID', 'platform');
  end if;
  -- A token belongs to the device's current user (a new sign-in takes it over).
  insert into public.push_tokens (user_id, token, platform, app_version, last_seen_at)
  values (me.id, register_push_token.token, register_push_token.platform, left(register_push_token.app_version, 20), private.now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, app_version = excluded.app_version,
        last_seen_at = excluded.last_seen_at, disabled_at = null;
end;
$$;

create or replace function public.disable_push_token(token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
begin
  update public.push_tokens t set disabled_at = private.now()
   where t.token = disable_push_token.token and t.user_id = me.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- In-app list (F09) and prefs (F11)
create or replace function public.get_notifications(cursor bigint default null, "limit" int default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  n int := least(greatest(coalesce(get_notifications."limit", 30), 1), 100);
begin
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'type', x.type, 'grp', x.grp, 'title', x.title, 'body', x.body,
                                          'data', x.data, 'read', x.read_at is not null, 'created_at', x.created_at) order by x.id desc)
      from (select * from public.notifications nn
            where nn.user_id = me.id and (get_notifications.cursor is null or nn.id < get_notifications.cursor)
            order by nn.id desc limit n) x), '[]'),
    'unread', (select count(*)::int from public.notifications nn where nn.user_id = me.id and nn.read_at is null));
end;
$$;

create or replace function public.mark_notifications_read(ids bigint[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
begin
  update public.notifications nn set read_at = private.now()
   where nn.user_id = me.id and nn.read_at is null
     and (mark_notifications_read.ids is null or nn.id = any (mark_notifications_read.ids));
end;
$$;

create or replace function private.prefs_json(p public.notification_prefs)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('offers', p.offers, 'messages', p.messages, 'meetups', p.meetups,
    'saved_search', p.saved_search, 'price_drop', p.price_drop, 'tips', p.tips,
    'message_previews', p.message_previews,
    'quiet_start', to_char(p.quiet_start, 'HH24:MI'), 'quiet_end', to_char(p.quiet_end, 'HH24:MI'))
$$;

create or replace function public.get_notification_prefs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_member();
  p public.notification_prefs;
begin
  insert into public.notification_prefs (user_id) values (me.id) on conflict do nothing;
  select * into p from public.notification_prefs x where x.user_id = me.id;
  return private.prefs_json(p);
end;
$$;

create or replace function public.update_notification_prefs(prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  k text;
  p public.notification_prefs;
begin
  if update_notification_prefs.prefs is null or jsonb_typeof(update_notification_prefs.prefs) <> 'object' then
    perform private.raise('INVALID', 'prefs');
  end if;
  for k in select jsonb_object_keys(update_notification_prefs.prefs) loop
    if k not in ('offers','messages','meetups','saved_search','price_drop','tips','message_previews','quiet_start','quiet_end') then
      perform private.raise('INVALID', 'prefs');
    end if;
  end loop;
  insert into public.notification_prefs (user_id) values (me.id) on conflict do nothing;
  begin
    update public.notification_prefs x set
      offers = coalesce((prefs ->> 'offers')::bool, x.offers),
      messages = coalesce((prefs ->> 'messages')::bool, x.messages),
      meetups = coalesce((prefs ->> 'meetups')::bool, x.meetups),
      saved_search = coalesce((prefs ->> 'saved_search')::bool, x.saved_search),
      price_drop = coalesce((prefs ->> 'price_drop')::bool, x.price_drop),
      tips = coalesce((prefs ->> 'tips')::bool, x.tips),
      message_previews = coalesce((prefs ->> 'message_previews')::bool, x.message_previews),
      quiet_start = coalesce((prefs ->> 'quiet_start')::time, x.quiet_start),
      quiet_end = coalesce((prefs ->> 'quiet_end')::time, x.quiet_end)
    where x.user_id = me.id
    returning * into p;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform private.raise('INVALID', 'prefs');
  end;
  -- Tips off also drops any tip still waiting to go out (P9-NOTIF-02).
  if (prefs ->> 'tips')::bool is false then
    update public.notifications nn set push_state = 'skipped'
     where nn.user_id = me.id and nn.push_state = 'pending' and private.push_pref(nn.type) = 'tips';
  end if;
  return private.prefs_json(p);
end;
$$;

-- ---------------------------------------------------------------------------
-- send-push claim (BE-03): due pending rows, locked with skip locked so two
-- runs never take the same row. Prefs off / no device / over the daily cap →
-- skipped; quiet hours → deferred to the end of quiet hours (campus zone).
-- Time-sensitive pushes skip quiet hours and the cap.
create or replace function private.claim_pushes(p_limit int default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n record;
  pr public.notification_prefs;
  tz text;
  local_now timestamp;
  local_t time;
  in_quiet bool;
  sent_today int;
  pref text;
  enabled bool;
  toks jsonb;
  res jsonb := '[]';
begin
  for n in
    select * from public.notifications x
    where x.push_state = 'pending' and x.push_after <= private.now()
    order by x.time_sensitive desc, x.id
    limit greatest(p_limit, 1)
    for update skip locked
  loop
    select * into pr from public.notification_prefs x where x.user_id = n.user_id;
    select c.timezone into tz from public.profiles p join public.campuses c on c.id = p.campus_id where p.id = n.user_id;
    tz := coalesce(tz, 'America/New_York');
    local_now := private.now() at time zone tz;
    local_t := local_now::time;
    pref := private.push_pref(n.type);
    enabled := case pref
      when 'offers' then coalesce(pr.offers, true) when 'messages' then coalesce(pr.messages, true)
      when 'meetups' then coalesce(pr.meetups, true) when 'saved_search' then coalesce(pr.saved_search, true)
      when 'price_drop' then coalesce(pr.price_drop, true) when 'tips' then coalesce(pr.tips, false)
      else true end;
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token, 'platform', t.platform)), '[]') into toks
    from public.push_tokens t where t.user_id = n.user_id and t.disabled_at is null;

    if not enabled or jsonb_array_length(toks) = 0 then
      update public.notifications x set push_state = 'skipped' where x.id = n.id;
      continue;
    end if;

    if not n.time_sensitive then
      in_quiet := case
        when coalesce(pr.quiet_start, '23:00') > coalesce(pr.quiet_end, '08:00')
          then local_t >= coalesce(pr.quiet_start, '23:00') or local_t < coalesce(pr.quiet_end, '08:00')
        else local_t >= coalesce(pr.quiet_start, '23:00') and local_t < coalesce(pr.quiet_end, '08:00') end;
      if in_quiet then
        update public.notifications x
           set push_after = ((case when local_t < coalesce(pr.quiet_end, '08:00') then local_now::date else local_now::date + 1 end)
                             + coalesce(pr.quiet_end, '08:00')) at time zone tz
         where x.id = n.id;
        continue;
      end if;
      select count(*) into sent_today from public.notifications x
      where x.user_id = n.user_id and x.push_state = 'sent' and not x.time_sensitive
        and (x.claimed_at at time zone tz)::date = local_now::date;
      if sent_today >= 6 then
        update public.notifications x set push_state = 'skipped' where x.id = n.id;
        continue;
      end if;
    end if;

    update public.notifications x set push_state = 'sending', claimed_at = private.now() where x.id = n.id;
    res := res || jsonb_build_object(
      'id', n.id, 'type', n.type, 'grp', n.grp, 'title', n.title, 'body', n.body, 'data', n.data,
      'time_sensitive', n.time_sensitive, 'tokens', toks,
      'badge', (select count(*)::int from public.notifications x where x.user_id = n.user_id and x.read_at is null));
  end loop;
  return res;
end;
$$;

-- results: [{id, tickets: [{token_id, ticket_id?, status: 'ok'|'error', error?}]}]
create or replace function private.finish_pushes(results jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  t jsonb;
  any_ok bool;
  n int := 0;
begin
  for r in select value from jsonb_array_elements(coalesce(results, '[]')) loop
    any_ok := false;
    for t in select value from jsonb_array_elements(coalesce(r -> 'tickets', '[]')) loop
      insert into public.push_tickets (token_id, notification_id, ticket_id, status, error)
      values ((t ->> 'token_id')::uuid, (r ->> 'id')::bigint, t ->> 'ticket_id', t ->> 'status', t ->> 'error');
      if t ->> 'status' = 'ok' then
        any_ok := true;
      elsif t ->> 'error' = 'DeviceNotRegistered' then
        update public.push_tokens x set disabled_at = private.now() where x.id = (t ->> 'token_id')::uuid;
      end if;
    end loop;
    update public.notifications x set push_state = case when any_ok then 'sent'::public.push_state else 'failed'::public.push_state end
     where x.id = (r ->> 'id')::bigint and x.push_state = 'sending';
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function private.pending_receipts(p_limit int default 1000)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'ticket_id', x.ticket_id, 'token_id', x.token_id)), '[]')
  from (select * from public.push_tickets t
        where t.checked_at is null and t.ticket_id is not null and t.created_at < private.now() - interval '15 minutes'
        order by t.id limit p_limit) x
$$;

-- results: [{id, status: 'ok'|'error', error?}]
create or replace function private.finish_receipts(results jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  n int := 0;
begin
  for r in select value from jsonb_array_elements(coalesce(results, '[]')) loop
    update public.push_tickets x set checked_at = private.now(), status = r ->> 'status', error = r ->> 'error'
     where x.id = (r ->> 'id')::bigint;
    if r ->> 'error' = 'DeviceNotRegistered' then
      update public.push_tokens k set disabled_at = private.now()
       where k.id = (select t.token_id from public.push_tickets t where t.id = (r ->> 'id')::bigint);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Crashed sends: `sending` longer than 10 minutes goes back to pending (push and email).
create or replace function private.reset_stuck_sends()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  a int;
  b int;
begin
  update public.notifications set push_state = 'pending', claimed_at = null
   where push_state = 'sending' and claimed_at < private.now() - interval '10 minutes';
  get diagnostics a = row_count;
  update public.email_outbox set state = 'pending', claimed_at = null
   where state = 'sending' and claimed_at < private.now() - interval '10 minutes';
  get diagnostics b = row_count;
  return a + b;
end;
$$;

-- Minute cron: only calls send-push when something is due (exists-guard, P9-FIX-01).
create or replace function private.notify_push()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notifications where push_state = 'pending' and push_after <= private.now()) then
    return private.call_function('send-push');
  end if;
  return null;
end;
$$;

create or replace function private.push_receipts()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.push_tickets where checked_at is null and ticket_id is not null
             and created_at < private.now() - interval '15 minutes') then
    return private.call_function('push-receipts');
  end if;
  return null;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('notify_push', '* * * * *', 'select private.notify_push()');
    perform cron.schedule('push_receipts', '*/15 * * * *', 'select private.push_receipts()');
    perform cron.schedule('reset_stuck_sends', '*/5 * * * *', 'select private.reset_stuck_sends()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
revoke all on function private.call_function(text, jsonb) from public, anon, authenticated;
revoke all on function private.push_pref(text) from public, anon, authenticated;
revoke all on function private.prefs_json(public.notification_prefs) from public, anon, authenticated;
revoke all on function private.claim_pushes(int) from public, anon, authenticated;
revoke all on function private.finish_pushes(jsonb) from public, anon, authenticated;
revoke all on function private.pending_receipts(int) from public, anon, authenticated;
revoke all on function private.finish_receipts(jsonb) from public, anon, authenticated;
revoke all on function private.reset_stuck_sends() from public, anon, authenticated;
revoke all on function private.notify_push() from public, anon, authenticated;
revoke all on function private.push_receipts() from public, anon, authenticated;
grant execute on function private.claim_pushes(int) to service_role;
grant execute on function private.finish_pushes(jsonb) to service_role;
grant execute on function private.pending_receipts(int) to service_role;
grant execute on function private.finish_receipts(jsonb) to service_role;

revoke all on function public.register_push_token(text, text, text) from public, anon;
revoke all on function public.disable_push_token(text) from public, anon;
revoke all on function public.get_notifications(bigint, int) from public, anon;
revoke all on function public.mark_notifications_read(bigint[]) from public, anon;
revoke all on function public.get_notification_prefs() from public, anon;
revoke all on function public.update_notification_prefs(jsonb) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.disable_push_token(text) to authenticated;
grant execute on function public.get_notifications(bigint, int) to authenticated;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
grant execute on function public.get_notification_prefs() to authenticated;
grant execute on function public.update_notification_prefs(jsonb) to authenticated;
