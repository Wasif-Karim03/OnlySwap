-- Mark sold from the chat (DEC 97). The app now offers the seller "Mark sold"
-- inside a chat, with that chat's buyer picked. Everything else already
-- happens in mark_sold: other chats close with "This item sold to someone
-- else", pending offers are declined with a notice, Discover only shows active
-- listings, and Saved shows it as sold. New here: the buyer's own chat gets a
-- system line too. The rest of the body is unchanged from 0016.

create or replace function public.mark_sold(id uuid, buyer_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
begin
  select * into l from public.listings x where x.id = mark_sold.id for update;
  if not found or l.seller_id is distinct from me.id or l.status = 'deleted' then
    perform private.raise('NOT_FOUND');
  end if;
  if l.status not in ('active','hold') then
    perform private.raise('INVALID', 'status');
  end if;
  if mark_sold.buyer_id is not null and not exists (
      select 1 from public.chats c
      where c.listing_id = l.id and c.buyer_id = mark_sold.buyer_id) then
    perform private.raise('INVALID', 'buyer_id');
  end if;
  update public.listings x
     set status = 'sold', sold_at = private.now(), buyer_id = mark_sold.buyer_id,
         sold_in_app = mark_sold.buyer_id is not null
   where x.id = l.id;
  perform private.wind_down_listing(l.id, 'This item sold to someone else', mark_sold.buyer_id);
  -- The buyer's own chat says so (other chats close with the line above).
  if mark_sold.buyer_id is not null then
    insert into public.messages (chat_id, sender_id, kind, body, created_at)
    select c.id, null, 'system', 'Marked as sold. You can rate each other after the swap.', private.now()
    from public.chats c
    where c.listing_id = l.id and c.buyer_id = mark_sold.buyer_id and c.status = 'open';
  end if;
end;
$$;

