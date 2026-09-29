-- 0023_inbox_realtime.sql (S23: P7-OFF-03, ADR-004)
-- Any offer change pings both parties on their private `user:{uid}` channel
-- ("inbox"), so an open Inbox refetches without polling. The payload carries
-- only ids; the app reads the details through get_inbox.

create or replace function private.offers_ping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.buyer_id is not null then
    perform realtime.send(jsonb_build_object('offer_id', new.id, 'status', new.status), 'inbox', 'user:' || new.buyer_id, true);
  end if;
  if new.seller_id is not null then
    perform realtime.send(jsonb_build_object('offer_id', new.id, 'status', new.status), 'inbox', 'user:' || new.seller_id, true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_offers_ping on public.offers;
create trigger trg_offers_ping after insert or update on public.offers
for each row execute function private.offers_ping();

revoke all on function private.offers_ping() from public, anon, authenticated;
