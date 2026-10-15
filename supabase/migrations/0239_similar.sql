-- 0239 · Recently viewed and More like this (DEC 128).
-- similar_listings: up to 10 other active sale/free listings on the campus in
-- the same category, nearest price first; not the viewer's, not blocked
-- either way, not from an away seller. get_listings_by_ids: the phone keeps
-- its recently viewed ids (never sent anywhere else); this returns the ones
-- still active or on hold, in the order given, at most 20.

create or replace function public.similar_listings(id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
begin
  perform private.hit('similar_listings', 600, interval '1 hour');
  select * into l from public.listings x where x.id = similar_listings.id;
  if not found or l.campus_id <> me.campus_id or l.category_id is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(private.feed_item(s.id, me.id) order by s.dist, s.bumped_at desc)
    from (
      select x.id, x.bumped_at, abs(x.price_cents - l.price_cents) as dist
      from public.listings x
      where x.campus_id = l.campus_id
        and x.category_id = l.category_id
        and x.id <> l.id
        and x.status = 'active'
        and x.kind in ('sale', 'free')
        and x.seller_id <> me.id
        and (x.expires_at is null or x.expires_at > private.now())
        and not private.is_blocked(me.id, x.seller_id)
        and not private.is_away(x.seller_id)
      order by abs(x.price_cents - l.price_cents), x.bumped_at desc
      limit 10
    ) s), '[]'::jsonb);
end;
$$;

create or replace function public.get_listings_by_ids(ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
begin
  perform private.hit('get_listings_by_ids', 300, interval '1 hour');
  if coalesce(array_length(get_listings_by_ids.ids, 1), 0) > 20 then
    perform private.raise('INVALID', 'ids');
  end if;
  return coalesce((
    select jsonb_agg(private.feed_item(x.id, me.id) order by w.ord)
    from unnest(get_listings_by_ids.ids) with ordinality as w(id, ord)
    join public.listings x on x.id = w.id
    where x.campus_id = me.campus_id
      and x.status in ('active', 'hold')
      and x.kind in ('sale', 'free')
      and not private.is_blocked(me.id, x.seller_id)), '[]'::jsonb);
end;
$$;

revoke all on function public.similar_listings(uuid) from public, anon;
revoke all on function public.get_listings_by_ids(uuid[]) from public, anon;
grant execute on function public.similar_listings(uuid) to authenticated;
grant execute on function public.get_listings_by_ids(uuid[]) to authenticated;
