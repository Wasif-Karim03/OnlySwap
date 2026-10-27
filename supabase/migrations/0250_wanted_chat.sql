-- DEC 149 (owner device review, 2026-10-24): "I have this" on someone's ask
-- opens a chat with them right away instead of a Sell form. The chat is tied
-- to the Wanted post (no offer): the asker is the buyer, the person answering
-- is the seller, the post's photo and title are the chat's pinned item, and
-- the first message ("I have this") goes through send_message, so blocks,
-- rate limits, push and realtime behave like any other message.
-- Additive: a new RPC; the old answer-with-a-listing path still works.

create or replace function public.start_wanted_chat(wanted_id uuid, body text default null, client_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
  chat uuid;
begin
  perform private.hit('start_wanted_chat', 30, interval '1 hour');
  select * into l from public.listings x where x.id = start_wanted_chat.wanted_id;
  if not found or l.kind <> 'wanted' or l.campus_id is distinct from me.campus_id
     or l.status = 'deleted' or private.is_blocked(me.id, l.seller_id) then
    perform private.raise('NOT_FOUND');
  end if;
  if l.seller_id = me.id then
    perform private.raise('FORBIDDEN');
  end if;
  if l.status <> 'active' or (l.expires_at is not null and l.expires_at <= private.now()) then
    perform private.raise('INVALID', 'status');
  end if;

  -- Answering the same ask twice opens the chat you already have.
  select x.id into chat from public.chats x
   where x.listing_id = l.id and x.offer_id is null and x.seller_id = me.id and x.buyer_id = l.seller_id
     and x.status = 'open'
   limit 1;
  if chat is not null then
    return jsonb_build_object('chat_id', chat, 'existing', true);
  end if;

  insert into public.chats (listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents,
                            listing_thumb_path, agreed_cents, last_message_at, created_at)
  values (l.id, null, l.seller_id, me.id, l.title, coalesce(l.wanted_max_cents, 0),
          (select ph.thumb_path from public.listing_photos ph where ph.listing_id = l.id order by ph.idx limit 1),
          coalesce(l.wanted_max_cents, 0), private.now(), private.now())
  returning id into chat;
  insert into public.messages (chat_id, sender_id, kind, body, meta, created_at)
  values (chat, null, 'system', me.display_name || ' has what you asked for. Agree on a price and plan the pickup.',
          jsonb_build_object('event', 'wanted_answered', 'wanted_id', l.id), private.now());

  perform public.send_message(chat, coalesce(nullif(btrim(start_wanted_chat.body), ''), 'I have this'),
                              coalesce(start_wanted_chat.client_id, gen_random_uuid()));
  return jsonb_build_object('chat_id', chat, 'existing', false);
end;
$$;
revoke all on function public.start_wanted_chat(uuid, text, uuid) from public, anon;
grant execute on function public.start_wanted_chat(uuid, text, uuid) to authenticated;
