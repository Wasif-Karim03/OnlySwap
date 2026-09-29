-- 0033_offer_lock_order.sql · Fix found by the live race (scripts/verify/offer-race.mjs):
-- two accepts on different offers of one listing could deadlock. accept_offer
-- locked its own offer (my_offer ... for update), then the listing, then the
-- other offers (auto-decline). Session B held offer B and waited on the listing;
-- A held the listing and waited on offer B. Now accept_offer reads the offer
-- without a lock, locks the listing first, then the offer. Same contract.

create or replace function private.find_offer(p_offer uuid, p_me uuid)
returns public.offers
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.offers;
begin
  select * into o from public.offers x where x.id = p_offer;
  if not found or private.offer_role(o, p_me) is null then
    perform private.raise('NOT_FOUND');
  end if;
  return o;
end;
$$;
revoke all on function private.find_offer(uuid, uuid) from public, anon, authenticated;

create or replace function public.accept_offer(offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  o public.offers := private.find_offer(accept_offer.offer_id, me.id);
  role text := private.offer_role(o, me.id);
  l public.listings;
  chat uuid;
  other record;
begin
  if o.status not in ('pending', 'countered') then
    perform private.raise('OFFER_NOT_PENDING');
  end if;
  -- The party who didn't act last accepts (a fresh offer: the seller).
  if role = o.last_actor then
    perform private.raise('FORBIDDEN');
  end if;
  -- FOR UPDATE on the listing: of two accepts on one listing exactly one wins (T-INT-OFF-RACE).
  select * into l from public.listings x where x.id = o.listing_id for update;
  if not found or l.status <> 'active' then
    perform private.raise('LISTING_UNAVAILABLE');
  end if;
  if private.is_blocked(o.buyer_id, o.seller_id) then
    perform private.raise('FORBIDDEN');
  end if;
  -- Lock the offer only after the listing (listing, then offers: the same order
  -- as the auto-decline below, so two accepts can't deadlock). Re-read it too:
  -- another session may have auto-declined it.
  select * into o from public.offers x where x.id = o.id for update;
  if o.status not in ('pending', 'countered') then
    perform private.raise('OFFER_NOT_PENDING');
  end if;

  update public.offers x set status = 'accepted', responded_at = private.now() where x.id = o.id;
  update public.listings x set status = 'hold', hold_offer_id = o.id where x.id = l.id;

  insert into public.chats (listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents,
                            listing_thumb_path, agreed_cents, last_message_at, created_at)
  values (l.id, o.id, o.buyer_id, o.seller_id, l.title, l.price_cents,
          (select ph.thumb_path from public.listing_photos ph where ph.listing_id = l.id order by ph.idx limit 1),
          o.amount_cents, private.now(), private.now())
  returning id into chat;
  insert into public.messages (chat_id, sender_id, kind, body, meta, created_at)
  values (chat, null, 'system',
          case when l.kind = 'free' then 'Request accepted. Plan the pickup.'
               else 'Offer accepted at ' || private.money(o.amount_cents) || '. Plan the pickup.' end,
          jsonb_build_object('event', 'offer_accepted', 'amount_cents', o.amount_cents), private.now());

  -- Everyone else's open offer on this listing is auto-declined and told.
  for other in
    update public.offers x set status = 'auto_declined', responded_at = private.now()
     where x.listing_id = l.id and x.id <> o.id and x.status in ('pending', 'countered')
    returning x.id, x.buyer_id
  loop
    perform private.queue_notification(other.buyer_id, 'offer_declined', 'offers', 'Offer declined',
      'Your offer on the ' || l.title || ' wasn''t accepted',
      jsonb_build_object('offer_id', other.id, 'listing_id', l.id), false, 'offer_declined:' || other.id);
  end loop;

  perform private.queue_notification(
    case when role = 'seller' then o.buyer_id else o.seller_id end, 'offer_accepted', 'offers', 'Offer accepted',
    me.display_name || ' accepted your offer. Say hi and plan the pickup.',
    jsonb_build_object('offer_id', o.id, 'chat_id', chat), true, 'offer_accepted:' || o.id);
  return jsonb_build_object('chat_id', chat);
end;
$$;
