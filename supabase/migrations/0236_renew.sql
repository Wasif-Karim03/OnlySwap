-- 0236 · Renew a listing (DEC 125). The relist cooldown drops from 7 days
-- to 3 (72 h), so an active sale/free listing can be moved back to the top
-- of the deck every 3 days. my_listings adds `renew_at` (when Renew is next
-- allowed for an active sale/free listing; null otherwise) and no longer
-- offers Relist on wanted, food or news posts, which relist_listing refuses.

create or replace function public.relist_listing(id uuid, price_cents int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
  price int;
begin
  select * into l from public.listings x where x.id = relist_listing.id for update;
  if not found or l.seller_id is distinct from me.id or l.status = 'deleted' then
    perform private.raise('NOT_FOUND');
  end if;
  if l.status not in ('expired','active') or l.kind not in ('sale','free') then
    perform private.raise('INVALID', 'status');
  end if;
  if l.bumped_at > private.now() - interval '72 hours' then
    perform private.raise('RATE_LIMITED',
      'relist_listing:' || to_char((l.bumped_at + interval '72 hours') at time zone 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;
  price := case when l.kind = 'sale' then coalesce(relist_listing.price_cents, l.price_cents) else 0 end;
  if l.kind = 'sale' and (price < 100 or price > 200000) then
    perform private.raise('INVALID', 'price_cents');
  end if;
  if price <> l.price_cents then
    insert into public.listing_price_changes (listing_id, old_cents, new_cents)
    values (l.id, l.price_cents, price);
  end if;
  update public.listings x
     set status = 'active', price_cents = price, bumped_at = private.now(),
         expires_at = private.now() + interval '1440 hours'
   where x.id = l.id;
  return private.listing_json(l.id);
end;
$$;

create or replace function public.my_listings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_member();
begin
  return coalesce((
    select jsonb_agg(private.feed_item(l.id, me.id) || jsonb_build_object('can_relist',
             l.kind in ('sale','free') and (l.status = 'expired'
               or (l.status = 'active' and l.bumped_at < private.now() - interval '72 hours')),
             'renew_at', case when l.status = 'active' and l.kind in ('sale','free')
                              then l.bumped_at + interval '72 hours' end,
             'removed_reason', private.removal_reason(l.id))
           order by l.created_at desc)
    from public.listings l where l.seller_id = me.id and l.status <> 'deleted'), '[]');
end;
$$;
