-- 0024_chat.sql (S24: P8-CHAT-01; API §3 Chat, DATA_MODEL §4.3, ADR-004, DEC 61)
--   get_chat, get_messages, send_message (idempotent on client_id),
--   mark_chat_read, set_chat_mute, hide_chat and trg_messages_ai
--   (last_message_at, chat:{id} broadcast, user:{uid} inbox ping, message_new).

-- Active or paused: a paused account can still read and finish its open chats (DATA_MODEL §5).
create or replace function private.require_member()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if found and p.status = 'paused' then
    return p;
  end if;
  return private.require_active();
end;
$$;

create or replace function private.my_chat(p_chat uuid, p_me uuid)
returns public.chats
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.chats;
begin
  select * into c from public.chats x where x.id = p_chat;
  if not found or p_me not in (c.buyer_id, c.seller_id) or p_me is null then
    perform private.raise('NOT_FOUND');
  end if;
  return c;
end;
$$;

create or replace function private.message_json(m public.messages, p_me uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'chat_id', m.chat_id, 'sender_id', m.sender_id, 'kind', m.kind,
                            'body', m.body, 'meta', m.meta, 'client_id', m.client_id,
                            'created_at', m.created_at, 'mine', m.sender_id = p_me)
$$;

-- ---------------------------------------------------------------------------
create or replace function public.get_chat(chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(get_chat.chat_id, me.id);
  other uuid := case when c.buyer_id = me.id then c.seller_id else c.buyer_id end;
begin
  return private.chat_summary(c.id, me.id) || jsonb_build_object(
    'blocked', c.status = 'blocked' or private.is_blocked(me.id, other),
    'i_blocked', exists (select 1 from public.blocks b where b.blocker_id = me.id and b.blocked_id = other),
    'other_deleted', other is null,
    'listing_status', (select l.status from public.listings l where l.id = c.listing_id),
    'buyer_outcome', c.buyer_outcome, 'seller_outcome', c.seller_outcome,
    'my_first_message', not exists (select 1 from public.messages m where m.chat_id = c.id and m.sender_id = me.id));
end;
$$;

create or replace function public.get_messages(chat_id uuid, before bigint default null, "limit" int default 50, after bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(get_messages.chat_id, me.id);
  n int := least(greatest(coalesce(get_messages."limit", 50), 1), 100);
begin
  return coalesce((
    select jsonb_agg(private.message_json(x, me.id) order by x.id)
    from (
      select * from public.messages m
      where m.chat_id = c.id
        and (get_messages.before is null or m.id < get_messages.before)
        and (get_messages.after is null or m.id > get_messages.after)
      order by case when get_messages.after is null then -m.id else m.id end
      limit n
    ) x), '[]');
end;
$$;

create or replace function public.send_message(chat_id uuid, body text, client_id uuid, kind text default 'text')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(send_message.chat_id, me.id);
  other uuid := case when c.buyer_id = me.id then c.seller_id else c.buyer_id end;
  m public.messages;
  txt text := btrim(coalesce(send_message.body, ''));
  v text;
begin
  -- Idempotent: the same client_id returns the message already sent (T-INT-CHAT-01).
  select * into m from public.messages x where x.chat_id = c.id and x.client_id = send_message.client_id;
  if found then
    return private.message_json(m, me.id);
  end if;
  if send_message.kind = 'photo' then
    perform private.raise('FEATURE_OFF');
  end if;
  if send_message.kind <> 'text' then
    perform private.raise('INVALID', 'kind');
  end if;
  if c.status = 'closed' then
    perform private.raise('CHAT_CLOSED');
  end if;
  if c.status = 'blocked' or other is null or private.is_blocked(me.id, other) then
    perform private.raise('CHAT_BLOCKED');
  end if;
  if send_message.client_id is null then
    perform private.raise('INVALID', 'client_id');
  end if;
  if txt = '' or char_length(txt) > 1000 then
    perform private.raise('INVALID', 'body');
  end if;
  perform private.hit('send_message', 60, interval '1 minute');
  perform private.hit('send_message_day', 1000, interval '1 day');
  v := private.check_text(txt, 'chat');
  if v like 'block:%' then
    perform private.raise('BANNED_TERM', substr(v, 7));
  end if;

  insert into public.messages (chat_id, sender_id, kind, body, client_id, created_at)
  values (c.id, me.id, 'text', txt, send_message.client_id, private.now())
  on conflict (chat_id, client_id) do nothing
  returning * into m;
  if not found then
    select * into m from public.messages x where x.chat_id = c.id and x.client_id = send_message.client_id;
  end if;
  return private.message_json(m, me.id);
end;
$$;

create or replace function public.mark_chat_read(chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(mark_chat_read.chat_id, me.id);
begin
  if c.buyer_id = me.id then
    update public.chats x set buyer_read_at = private.now() where x.id = c.id;
  else
    update public.chats x set seller_read_at = private.now() where x.id = c.id;
  end if;
end;
$$;

create or replace function public.set_chat_mute(chat_id uuid, muted bool)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(set_chat_mute.chat_id, me.id);
begin
  if c.buyer_id = me.id then
    update public.chats x set buyer_muted = coalesce(set_chat_mute.muted, true) where x.id = c.id;
  else
    update public.chats x set seller_muted = coalesce(set_chat_mute.muted, true) where x.id = c.id;
  end if;
end;
$$;

-- Hide from my inbox; a new message from the other side brings it back.
create or replace function public.hide_chat(chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(hide_chat.chat_id, me.id);
begin
  if c.buyer_id = me.id then
    update public.chats x set buyer_hidden = true where x.id = c.id;
  else
    update public.chats x set seller_hidden = true where x.id = c.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function private.messages_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.chats;
  recipient uuid;
  sender_name text;
  previews bool;
  muted bool;
begin
  update public.chats x
     set last_message_at = new.created_at,
         buyer_hidden = case when new.sender_id is distinct from x.buyer_id then false else x.buyer_hidden end,
         seller_hidden = case when new.sender_id is distinct from x.seller_id then false else x.seller_hidden end
   where x.id = new.chat_id
  returning * into c;

  perform realtime.send(private.message_json(new, null) - 'mine', 'message', 'chat:' || new.chat_id, true);
  if c.buyer_id is not null then
    perform realtime.send(jsonb_build_object('chat_id', c.id), 'inbox', 'user:' || c.buyer_id, true);
  end if;
  if c.seller_id is not null then
    perform realtime.send(jsonb_build_object('chat_id', c.id), 'inbox', 'user:' || c.seller_id, true);
  end if;

  if new.sender_id is not null and new.kind = 'text' then
    recipient := case when new.sender_id = c.buyer_id then c.seller_id else c.buyer_id end;
    muted := case when recipient = c.buyer_id then c.buyer_muted else c.seller_muted end;
    if recipient is not null and not muted then
      select p.display_name into sender_name from public.profiles p where p.id = new.sender_id;
      select coalesce(np.message_previews, false) into previews from public.notification_prefs np where np.user_id = recipient;
      perform private.queue_notification(recipient, 'message_new', 'messages', coalesce(sender_name, 'OnlySwap'),
        case when coalesce(previews, false) then left(new.body, 120) else 'New message from ' || coalesce(sender_name, 'someone') end,
        jsonb_build_object('chat_id', c.id), false,
        'message_new:' || c.id || ':' || to_char(date_trunc('minute', new.created_at) at time zone 'UTC', 'YYYYMMDDHH24MI'));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_messages_ai on public.messages;
create trigger trg_messages_ai after insert on public.messages
for each row execute function private.messages_ai();

-- ---------------------------------------------------------------------------
revoke all on function private.require_member() from public, anon, authenticated;
revoke all on function private.my_chat(uuid, uuid) from public, anon, authenticated;
revoke all on function private.message_json(public.messages, uuid) from public, anon, authenticated;
revoke all on function private.messages_ai() from public, anon, authenticated;

revoke all on function public.get_chat(uuid) from public, anon;
revoke all on function public.get_messages(uuid, bigint, int, bigint) from public, anon;
revoke all on function public.send_message(uuid, text, uuid, text) from public, anon;
revoke all on function public.mark_chat_read(uuid) from public, anon;
revoke all on function public.set_chat_mute(uuid, bool) from public, anon;
revoke all on function public.hide_chat(uuid) from public, anon;

grant execute on function public.get_chat(uuid) to authenticated;
grant execute on function public.get_messages(uuid, bigint, int, bigint) to authenticated;
grant execute on function public.send_message(uuid, text, uuid, text) to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;
grant execute on function public.set_chat_mute(uuid, bool) to authenticated;
grant execute on function public.hide_chat(uuid) to authenticated;
