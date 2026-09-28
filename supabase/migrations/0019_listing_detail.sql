-- 0019_listing_detail.sql (S19: P6-LIST-01, DEC 57)
-- get_listing: one call for the listing screen (B02) with the same card shape
-- as get_feed, plus which state to show. A listing the caller may not see
-- returns only {id, access} so the screen can say why (gone, blocked, other
-- campus) without leaking anything about it.

create or replace function public.get_listing(id uuid)
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
  perform private.hit('get_listing', 600, interval '1 hour');
  select * into l from public.listings x where x.id = get_listing.id;
  if not found or l.status = 'deleted' then
    return jsonb_build_object('id', get_listing.id, 'access', 'gone');
  end if;
  if l.seller_id = me.id then
    return private.feed_item(l.id, me.id) || jsonb_build_object('access', 'owner');
  end if;
  if l.campus_id <> me.campus_id then
    return jsonb_build_object('id', l.id, 'access', 'other_campus');
  end if;
  if private.is_blocked(me.id, l.seller_id) then
    return jsonb_build_object('id', l.id, 'access', 'blocked');
  end if;
  if l.status not in ('active', 'hold', 'sold') then
    return jsonb_build_object('id', l.id, 'access', 'gone');
  end if;
  return private.feed_item(l.id, me.id) || jsonb_build_object('access', 'buyer');
end;
$$;

revoke all on function public.get_listing(uuid) from public, anon;
grant execute on function public.get_listing(uuid) to authenticated;
