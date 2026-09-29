-- 0025_meetups.sql (S26: P8-MEET-01; DATA_MODEL §4.4, API §3, BE-06/07/12, DEC 62)
--   propose_meetup, confirm_meetup, checkin_meetup, running_late, cancel_meetup,
--   create_meetup_share, get_meetup_share (anon), report_noshow, get_meetup,
--   and the crons meetup_reminders and noshow_autoconfirm.
-- Every change posts a `meetup` row in the chat (meta.meetup_id) so the chat's
-- MeetupCard stays current, and notifies the other side.

create or replace function private.local_time(ts timestamptz, campus uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(ts at time zone coalesce((select c.timezone from public.campuses c where c.id = campus), 'America/New_York'),
                 'Dy FMHH12:MI AM')
$$;

create or replace function private.meetup_json(p_meetup uuid, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'chat_id', m.chat_id, 'status', m.status, 'starts_at', m.starts_at,
    'spot', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'name', s.name, 'lat', s.lat, 'lng', s.lng, 'police', s.designation = 'police', 'hours', s.hours) end,
    'custom_place', m.custom_place,
    'proposed_by_me', m.proposed_by = p_me,
    'confirmed_at', m.confirmed_at,
    'my_here_at', case when c.buyer_id = p_me then m.buyer_here_at else m.seller_here_at end,
    'other_here_at', case when c.buyer_id = p_me then m.seller_here_at else m.buyer_here_at end,
    'late_minutes', m.late_minutes, 'late_is_me', m.late_user = p_me,
    'cancelled_by_me', m.cancelled_by = p_me, 'cancel_reason', m.cancel_reason,
    'previous_starts_at', m.previous_starts_at,
    'share_token', case when m.share_created_by = p_me and m.share_expires_at > private.now() then m.share_token end,
    'my_noshow_report', (select r.status from public.noshow_reports r where r.meetup_id = m.id and r.reporter_id = p_me))
  from public.meetups m
  join public.chats c on c.id = m.chat_id
  left join public.safe_spots s on s.id = m.spot_id
  where m.id = p_meetup
$$;

-- The meetup, locked, for a participant of its chat; returns the chat too.
create or replace function private.my_meetup(p_meetup uuid, p_me uuid, out m public.meetups, out c public.chats)
language plpgsql
security definer
set search_path = ''
as $$
begin
  select * into m from public.meetups x where x.id = p_meetup for update;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  select * into c from public.chats x where x.id = m.chat_id;
  if p_me is null or p_me not in (c.buyer_id, c.seller_id) then
    perform private.raise('NOT_FOUND');
  end if;
end;
$$;

-- A `meetup` chat row plus a notification for the other side.
create or replace function private.meetup_event(
  p_meetup uuid, p_actor uuid, p_event text, p_text text, p_type text, p_push text, p_dedupe text, p_time_sensitive bool default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.chats;
  other uuid;
begin
  select ch.* into c from public.chats ch join public.meetups m on m.chat_id = ch.id where m.id = p_meetup;
  insert into public.messages (chat_id, sender_id, kind, body, meta, created_at)
  values (c.id, null, 'meetup', p_text, jsonb_build_object('meetup_id', p_meetup, 'event', p_event, 'actor', p_actor), private.now());
  other := case when p_actor = c.buyer_id then c.seller_id else c.buyer_id end;
  if other is not null and p_type is not null then
    perform private.queue_notification(other, p_type, 'meetups',
      case p_type when 'meetup_proposed' then 'Meetup suggested' when 'meetup_confirmed' then 'Meetup set'
                  when 'meetup_status' then 'Meetup update' else 'Meetup changed' end,
      p_push, jsonb_build_object('meetup_id', p_meetup, 'chat_id', c.id), p_time_sensitive, p_dedupe);
  end if;
end;
$$;

create or replace function private.place_name(m public.meetups)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select s.name from public.safe_spots s where s.id = m.spot_id), m.custom_place, 'the spot')
$$;

-- ---------------------------------------------------------------------------
create or replace function public.propose_meetup(chat_id uuid, starts_at timestamptz, spot_id uuid default null, custom_place text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(propose_meetup.chat_id, me.id);
  prev public.meetups;
  m public.meetups;
  place text := nullif(btrim(coalesce(propose_meetup.custom_place, '')), '');
begin
  perform private.hit('propose_meetup', 20, interval '1 day');
  if c.status <> 'open' or private.is_blocked(c.buyer_id, c.seller_id) then
    perform private.raise('CHAT_CLOSED');
  end if;
  if propose_meetup.starts_at is null or propose_meetup.starts_at < private.now() + interval '15 minutes'
     or propose_meetup.starts_at > private.now() + interval '14 days' then
    perform private.raise('MEETUP_WINDOW');
  end if;
  if propose_meetup.spot_id is null and place is null then
    perform private.raise('INVALID', 'place');
  end if;
  if char_length(coalesce(place, '')) > 60 then
    perform private.raise('INVALID', 'custom_place');
  end if;
  if propose_meetup.spot_id is not null and not exists (
      select 1 from public.safe_spots s where s.id = propose_meetup.spot_id and s.campus_id = me.campus_id and s.active) then
    perform private.raise('INVALID', 'spot_id');
  end if;

  -- One active meetup per chat (BE-06): the new proposal replaces the old one in this transaction.
  select * into prev from public.meetups x
  where x.chat_id = c.id and x.status in ('proposed', 'confirmed')
  for update;
  if found then
    update public.meetups x set status = 'cancelled', cancelled_by = me.id, cancel_reason = 'replaced'
     where x.id = prev.id;
  end if;

  insert into public.meetups (chat_id, spot_id, custom_place, starts_at, proposed_by, previous_starts_at, created_at)
  values (c.id, propose_meetup.spot_id, place, propose_meetup.starts_at, me.id,
          case when prev.id is not null then prev.starts_at end, private.now())
  returning * into m;

  perform private.meetup_event(m.id, me.id, case when prev.id is null then 'proposed' else 'reproposed' end,
    me.display_name || ' suggested ' || private.local_time(m.starts_at, me.campus_id) || ' at ' || private.place_name(m),
    'meetup_proposed',
    me.display_name || ' suggested ' || private.local_time(m.starts_at, me.campus_id) || ' at ' || private.place_name(m),
    'meetup_proposed:' || m.id);
  return private.meetup_json(m.id, me.id);
end;
$$;

create or replace function public.confirm_meetup(meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  r record := private.my_meetup(confirm_meetup.meetup_id, me.id);
begin
  if (r.m).status <> 'proposed' then
    perform private.raise('MEETUP_WINDOW');
  end if;
  if (r.m).proposed_by = me.id then
    perform private.raise('FORBIDDEN');
  end if;
  if (r.m).starts_at < private.now() then
    perform private.raise('MEETUP_WINDOW');
  end if;
  update public.meetups x set status = 'confirmed', confirmed_at = private.now() where x.id = (r.m).id;
  perform private.meetup_event((r.m).id, me.id, 'confirmed',
    'Meetup set: ' || private.local_time((r.m).starts_at, me.campus_id) || ' at ' || private.place_name(r.m),
    'meetup_confirmed', 'Meetup set: ' || private.local_time((r.m).starts_at, me.campus_id),
    'meetup_confirmed:' || (r.m).id);
end;
$$;

create or replace function public.checkin_meetup(meetup_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  r record := private.my_meetup(checkin_meetup.meetup_id, me.id);
begin
  if (r.m).status <> 'confirmed'
     or private.now() < (r.m).starts_at - interval '60 minutes'
     or private.now() > (r.m).starts_at + interval '60 minutes' then
    perform private.raise('MEETUP_WINDOW');
  end if;
  if (r.c).buyer_id = me.id then
    update public.meetups x set buyer_here_at = coalesce(buyer_here_at, private.now()) where x.id = (r.m).id;
  else
    update public.meetups x set seller_here_at = coalesce(seller_here_at, private.now()) where x.id = (r.m).id;
  end if;
  perform private.meetup_event((r.m).id, me.id, 'here', me.display_name || ' is here',
    'meetup_status', me.display_name || ' is here', 'meetup_status:' || (r.m).id || ':here:' || me.id);
end;
$$;

create or replace function public.running_late(meetup_id uuid, minutes int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  r record := private.my_meetup(running_late.meetup_id, me.id);
begin
  if running_late.minutes not in (5, 10, 15, 30) then
    perform private.raise('INVALID', 'minutes');
  end if;
  if (r.m).status <> 'confirmed' or private.now() > (r.m).starts_at + interval '60 minutes' then
    perform private.raise('MEETUP_WINDOW');
  end if;
  update public.meetups x set late_user = me.id, late_minutes = running_late.minutes where x.id = (r.m).id;
  perform private.meetup_event((r.m).id, me.id, 'late',
    me.display_name || ' is running ' || running_late.minutes || ' min late',
    'meetup_status', me.display_name || ' is running ' || running_late.minutes || ' min late',
    'meetup_status:' || (r.m).id || ':late:' || running_late.minutes);
end;
$$;

create or replace function public.cancel_meetup(meetup_id uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  r record := private.my_meetup(cancel_meetup.meetup_id, me.id);
begin
  if (r.m).status not in ('proposed', 'confirmed') then
    perform private.raise('MEETUP_WINDOW');
  end if;
  if char_length(coalesce(cancel_meetup.reason, '')) > 80 then
    perform private.raise('INVALID', 'reason');
  end if;
  update public.meetups x
     set status = 'cancelled', cancelled_by = me.id, cancel_reason = nullif(btrim(cancel_meetup.reason), '')
   where x.id = (r.m).id;
  perform private.meetup_event((r.m).id, me.id, 'cancelled', me.display_name || ' cancelled the meetup',
    'meetup_changed', me.display_name || ' cancelled the meetup', 'meetup_changed:' || (r.m).id || ':cancel');
end;
$$;

create or replace function public.get_meetup(meetup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats;
begin
  select ch.* into c from public.chats ch join public.meetups m on m.chat_id = ch.id where m.id = get_meetup.meetup_id;
  if not found or me.id not in (c.buyer_id, c.seller_id) then
    perform private.raise('NOT_FOUND');
  end if;
  return private.meetup_json(get_meetup.meetup_id, me.id);
end;
$$;

-- The chat's current meetup (proposed or confirmed), else the latest one, or null.
create or replace function public.get_chat_meetup(chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(get_chat_meetup.chat_id, me.id);
  mid uuid;
begin
  select m.id into mid from public.meetups m
  where m.chat_id = c.id
  order by (m.status in ('proposed', 'confirmed')) desc, m.created_at desc
  limit 1;
  return case when mid is null then null else private.meetup_json(mid, me.id) end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Share with a friend (E13, /m/:token): a status page with first names, place and time only.
create or replace function public.create_meetup_share(meetup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  r record := private.my_meetup(create_meetup_share.meetup_id, me.id);
  token text := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 22);
begin
  perform private.hit('create_meetup_share', 10, interval '1 day');
  if (r.m).status not in ('proposed', 'confirmed') then
    perform private.raise('MEETUP_WINDOW');
  end if;
  update public.meetups x
     set share_token = token, share_created_by = me.id, share_expires_at = (r.m).starts_at + interval '24 hours'
   where x.id = (r.m).id;
  return jsonb_build_object('token', token, 'expires_at', (r.m).starts_at + interval '24 hours');
end;
$$;

create or replace function public.get_meetup_share(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  m public.meetups;
  c public.chats;
  s public.safe_spots;
begin
  perform private.hit_ip('get_meetup_share', 60, interval '1 minute');
  select * into m from public.meetups x
  where x.share_token = get_meetup_share.token and x.share_expires_at > private.now();
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  select * into c from public.chats x where x.id = m.chat_id;
  select * into s from public.safe_spots x where x.id = m.spot_id;
  -- First names only; no price, phone, email or last initial (T-INT-MEET-01).
  return jsonb_build_object(
    'a_first', (select p.first_name from public.profiles p where p.id = m.share_created_by),
    'b_first', (select p.first_name from public.profiles p
                where p.id = case when m.share_created_by = c.buyer_id then c.seller_id else c.buyer_id end),
    'spot_name', coalesce(s.name, m.custom_place), 'spot_lat', s.lat, 'spot_lng', s.lng,
    'starts_at', m.starts_at,
    'a_here', case when m.share_created_by = c.buyer_id then m.buyer_here_at else m.seller_here_at end is not null,
    'b_here', case when m.share_created_by = c.buyer_id then m.seller_here_at else m.buyer_here_at end is not null,
    'late_minutes', m.late_minutes, 'status', m.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- No-shows (BE-07): reporter checked in, at least 20 min after the start, the other didn't check in.
create or replace function public.report_noshow(meetup_id uuid, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  r record := private.my_meetup(report_noshow.meetup_id, me.id);
  mine timestamptz;
  theirs timestamptz;
  other uuid;
begin
  if (r.c).buyer_id = me.id then
    mine := (r.m).buyer_here_at; theirs := (r.m).seller_here_at; other := (r.c).seller_id;
  else
    mine := (r.m).seller_here_at; theirs := (r.m).buyer_here_at; other := (r.c).buyer_id;
  end if;
  if (r.m).status <> 'confirmed' or mine is null or theirs is not null
     or private.now() < (r.m).starts_at + interval '20 minutes' then
    perform private.raise('MEETUP_WINDOW');
  end if;
  if char_length(coalesce(report_noshow.note, '')) > 300 then
    perform private.raise('INVALID', 'note');
  end if;
  insert into public.noshow_reports (meetup_id, reporter_id, reported_id, note, created_at)
  values ((r.m).id, me.id, other, nullif(btrim(report_noshow.note), ''), private.now())
  on conflict (meetup_id, reporter_id) do nothing;
  perform private.queue_notification(other, 'account_notice', 'account', 'No-show reported',
    'Your meetup partner said you did not show up. If that is wrong, appeal within 24 hours.',
    jsonb_build_object('meetup_id', (r.m).id), false, 'acct:' || other || ':noshow:' || (r.m).id);
end;
$$;

-- ---------------------------------------------------------------------------
-- meetup_reminders (*/5): confirmed meetups starting in 25-35 minutes, once.
-- Absolute times, so DST days need nothing special; the text is in the campus zone (BE-12).
create or replace function private.meetup_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  n int := 0;
  who uuid;
  other_name text;
begin
  for m in
    update public.meetups x set reminder_sent_at = private.now()
     where x.status = 'confirmed' and x.reminder_sent_at is null
       and x.starts_at between private.now() + interval '25 minutes' and private.now() + interval '35 minutes'
    returning x.*
  loop
    n := n + 1;
    for who in select unnest(array[c.buyer_id, c.seller_id]) from public.chats c where c.id = m.chat_id loop
      continue when who is null;
      select p.first_name into other_name from public.profiles p
      join public.chats c on c.id = m.chat_id
      where p.id = case when who = c.buyer_id then c.seller_id else c.buyer_id end;
      perform private.queue_notification(who, 'meetup_reminder', 'meetups', 'Meetup in 30 minutes',
        'Meet ' || coalesce(other_name, 'them') || ' at '
          || coalesce((select s.name from public.safe_spots s where s.id = m.spot_id), m.custom_place, 'the spot')
          || ' at ' || to_char(m.starts_at at time zone coalesce(
               (select ca.timezone from public.campuses ca join public.profiles p on p.campus_id = ca.id where p.id = who),
               'America/New_York'), 'FMHH12:MI AM'),
        jsonb_build_object('meetup_id', m.id, 'chat_id', m.chat_id), true, 'meetup_reminder:' || m.id);
    end loop;
  end loop;
  return n;
end;
$$;

-- noshow_autoconfirm (hourly): open reports older than 24 h without an appeal
-- are confirmed; the meetup becomes no_show; the reported count goes up; at the
-- campus threshold the account is paused for 7 days (offers paused).
create or replace function private.noshow_autoconfirm()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
  cnt int;
  threshold int;
begin
  for r in
    update public.noshow_reports x set status = 'confirmed'
     where x.status = 'open' and x.created_at < private.now() - interval '24 hours'
       and not exists (select 1 from public.appeals a where a.subject_type = 'noshow' and a.subject_id = x.id::text)
    returning x.*
  loop
    n := n + 1;
    update public.meetups m set status = 'no_show' where m.id = r.meetup_id and m.status = 'confirmed';
    if r.reported_id is null then
      continue;
    end if;
    update public.profiles p set noshow_count = noshow_count + 1 where p.id = r.reported_id
    returning p.noshow_count, (select c.noshow_pause_threshold from public.campuses c where c.id = p.campus_id)
      into cnt, threshold;
    if cnt >= coalesce(threshold, 2) then
      update public.profiles p
         set status = 'paused', status_reason = 'noshow', paused_until = private.now() + interval '7 days'
       where p.id = r.reported_id and p.status = 'active';
      perform private.queue_notification(r.reported_id, 'account_notice', 'account', 'Offers paused',
        'Your account is paused for 7 days after missed meetups. You can still finish open chats.',
        '{}'::jsonb, false, 'acct:' || r.reported_id || ':paused:' || to_char(private.now(), 'YYYYMMDD'));
    end if;
  end loop;
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('meetup_reminders', '*/5 * * * *', 'select private.meetup_reminders()');
    perform cron.schedule('noshow_autoconfirm', '0 * * * *', 'select private.noshow_autoconfirm()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
revoke all on function private.local_time(timestamptz, uuid) from public, anon, authenticated;
revoke all on function private.meetup_json(uuid, uuid) from public, anon, authenticated;
revoke all on function private.my_meetup(uuid, uuid) from public, anon, authenticated;
revoke all on function private.meetup_event(uuid, uuid, text, text, text, text, text, bool) from public, anon, authenticated;
revoke all on function private.place_name(public.meetups) from public, anon, authenticated;
revoke all on function private.meetup_reminders() from public, anon, authenticated;
revoke all on function private.noshow_autoconfirm() from public, anon, authenticated;

revoke all on function public.propose_meetup(uuid, timestamptz, uuid, text) from public, anon;
revoke all on function public.confirm_meetup(uuid) from public, anon;
revoke all on function public.checkin_meetup(uuid) from public, anon;
revoke all on function public.running_late(uuid, int) from public, anon;
revoke all on function public.cancel_meetup(uuid, text) from public, anon;
revoke all on function public.get_meetup(uuid) from public, anon;
revoke all on function public.get_chat_meetup(uuid) from public, anon;
revoke all on function public.create_meetup_share(uuid) from public, anon;
revoke all on function public.report_noshow(uuid, text) from public, anon;
revoke all on function public.get_meetup_share(text) from public;

grant execute on function public.propose_meetup(uuid, timestamptz, uuid, text) to authenticated;
grant execute on function public.confirm_meetup(uuid) to authenticated;
grant execute on function public.checkin_meetup(uuid) to authenticated;
grant execute on function public.running_late(uuid, int) to authenticated;
grant execute on function public.cancel_meetup(uuid, text) to authenticated;
grant execute on function public.get_meetup(uuid) to authenticated;
grant execute on function public.get_chat_meetup(uuid) to authenticated;
grant execute on function public.create_meetup_share(uuid) to authenticated;
grant execute on function public.report_noshow(uuid, text) to authenticated;
grant execute on function public.get_meetup_share(text) to anon, authenticated;
