-- 0223_realtime_fanout.sql · E-09, DEC 108.
-- A chat message used to cost three broadcasts: chat:{id} for the open chat
-- screen plus an inbox ping on both parties' user:{uid}. Now it is one: the
-- other party's user:{uid} gets an 'inbox' event that carries the message, and
-- the chat screen listens on that same channel (it already exists for the
-- inbox, so no extra join). The sender's own device has the send_message
-- result, so the sender gets nothing. System and meetup messages (no sender)
-- still reach both parties. chat:{id} stays authorized by the realtime policy
-- for older builds, which fall back to catching up when the screen refocuses
-- or the network comes back.
-- messages_ai is copied from 0024 with only the broadcast lines changed.

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
  reader uuid;
begin
  update public.chats x
     set last_message_at = new.created_at,
         buyer_hidden = case when new.sender_id is distinct from x.buyer_id then false else x.buyer_hidden end,
         seller_hidden = case when new.sender_id is distinct from x.seller_id then false else x.seller_hidden end
   where x.id = new.chat_id
  returning * into c;

  foreach reader in array array[c.buyer_id, c.seller_id] loop
    if reader is not null and reader is distinct from new.sender_id then
      perform realtime.send(
        jsonb_build_object('chat_id', c.id, 'message', private.message_json(new, reader)),
        'inbox', 'user:' || reader, true);
    end if;
  end loop;

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

revoke all on function private.messages_ai() from public, anon, authenticated;
