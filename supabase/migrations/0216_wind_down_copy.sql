-- 0216_wind_down_copy.sql (DEC 99)
--   Buyers with an open offer on a listing that winds down got "This sold to
--   someone else" even when the seller or an admin removed it. The push now
--   uses the same wind-down message as the closed chats ("This listing was
--   removed", "The seller removed this listing", "This item sold to someone
--   else"). Same signature as 0026.

create or replace function private.wind_down_listing(p_listing uuid, p_message text, p_keep_buyer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  o record;
  title text := (select l.title from public.listings l where l.id = p_listing);
begin
  for o in
    update public.offers x set status = 'auto_declined', responded_at = private.now()
     where x.listing_id = p_listing and x.status in ('pending', 'countered')
    returning x.id, x.buyer_id
  loop
    perform private.queue_notification(o.buyer_id, 'offer_declined', 'offers', 'Offer declined',
      p_message, jsonb_build_object('offer_id', o.id, 'listing_id', p_listing), false,
      'offer_declined:' || o.id);
  end loop;
  for c in
    select x.id, x.buyer_id, x.offer_id from public.chats x
    where x.listing_id = p_listing and x.status = 'open'
      and (p_keep_buyer is null or x.buyer_id is distinct from p_keep_buyer)
  loop
    insert into public.messages (chat_id, sender_id, kind, body, created_at)
    values (c.id, null, 'system', p_message, private.now());
    update public.chats set status = 'closed', closed_at = private.now() where id = c.id;
    update public.meetups set status = 'cancelled', cancel_reason = 'listing closed'
     where chat_id = c.id and status in ('proposed', 'confirmed');
    if c.buyer_id is not null then
      perform private.queue_notification(c.buyer_id, 'offer_declined', 'offers', 'Deal closed',
        p_message || coalesce(': ' || title, ''), jsonb_build_object('chat_id', c.id, 'listing_id', p_listing), false,
        'offer_declined:' || coalesce(c.offer_id::text, c.id::text));
    end if;
  end loop;
end;
$$;

revoke all on function private.wind_down_listing(uuid, text, uuid) from public, anon, authenticated;
