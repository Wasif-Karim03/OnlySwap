-- 0030_profile_settings.sql (S31: P11-SET-01, P11-SET-02; DEC 67)
--   get_me (F01 header, counts and settings flags), my_listings (F03 by
--   status), listing_stats (F04 views, saves, offers, price history).

create or replace function public.get_me()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_member();
  st record;
begin
  select s.swaps_count, s.thumbs_up, s.thumbs_total into st from public.profile_stats_mv s where s.user_id = me.id;
  return jsonb_build_object(
    'id', me.id, 'first_name', me.first_name, 'last_initial', me.last_initial, 'display_name', me.display_name,
    'year', me.year, 'bio', me.bio, 'avatar_path', me.avatar_path, 'status', me.status,
    'verified_until', me.verified_until, 'created_at', me.created_at,
    'founding_seller', me.founding_seller_until is not null and me.founding_seller_until >= private.now(),
    'campus', (select jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name, 'timezone', c.timezone)
               from public.campuses c where c.id = me.campus_id),
    'analytics_opt_in', me.analytics_opt_in, 'crash_reports_opt_in', me.crash_reports_opt_in, 'theme_mode', me.theme_mode,
    'counts', jsonb_build_object(
      'active', (select count(*)::int from public.listings l where l.seller_id = me.id and l.status in ('active', 'hold')),
      'sold', (select count(*)::int from public.listings l where l.seller_id = me.id and l.status = 'sold'),
      'saved', (select count(*)::int from public.saves s where s.user_id = me.id),
      'swaps', coalesce(st.swaps_count, 0),
      'thumbs_up', coalesce(st.thumbs_up, 0),
      'thumbs_total', coalesce(st.thumbs_total, 0)));
end;
$$;

-- My listings, every state but deleted, newest first (F03; X37 empty).
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
             l.status = 'expired' or (l.status = 'active' and l.bumped_at < private.now() - interval '168 hours'))
           order by l.created_at desc)
    from public.listings l where l.seller_id = me.id and l.status <> 'deleted'), '[]');
end;
$$;

-- listing_stats (F04): the seller's numbers for one listing.
create or replace function public.listing_stats(id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  l public.listings;
begin
  select * into l from public.listings x where x.id = listing_stats.id;
  if not found or l.seller_id is distinct from me.id or l.status = 'deleted' then
    perform private.raise('NOT_FOUND');
  end if;
  return jsonb_build_object(
    'views', l.view_count, 'saves', l.save_count, 'offers', l.offer_count,
    'open_offers', (select count(*)::int from public.offers o where o.listing_id = l.id and o.status in ('pending', 'countered')),
    'best_offer_cents', (select max(o.amount_cents) from public.offers o where o.listing_id = l.id and o.status in ('pending', 'countered')),
    'created_at', l.created_at, 'bumped_at', l.bumped_at, 'expires_at', l.expires_at,
    'price_changes', coalesce((select jsonb_agg(jsonb_build_object('old', pc.old_cents, 'new', pc.new_cents, 'at', pc.changed_at)
                                                order by pc.changed_at)
                               from public.listing_price_changes pc where pc.listing_id = l.id), '[]'));
end;
$$;

revoke all on function public.get_me() from public, anon;
revoke all on function public.my_listings() from public, anon;
revoke all on function public.listing_stats(uuid) from public, anon;
grant execute on function public.get_me() to authenticated;
grant execute on function public.my_listings() to authenticated;
grant execute on function public.listing_stats(uuid) to authenticated;
