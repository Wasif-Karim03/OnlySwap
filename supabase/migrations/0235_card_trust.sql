-- 0235 · Trust on the swipe card (DEC 124). Additive: feed_item.seller gains
-- swaps_count, thumbs_up and thumbs_total from profile_stats_mv (0 when the
-- seller has no rated swaps yet). Every caller of feed_item (get_feed,
-- get_listing, search, campus feed, saved) picks it up.

create or replace function private.feed_item(p_id uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'kind', l.kind, 'status', l.status, 'title', l.title,
    'description', l.description, 'price_cents', l.price_cents,
    'condition', l.condition, 'category_id', l.category_id,
    'open_to_offers', l.open_to_offers, 'meet_spot_ids', to_jsonb(l.meet_spot_ids),
    'meet_note', l.meet_note, 'availability', to_jsonb(l.availability),
    'save_count', l.save_count, 'view_count', l.view_count, 'offer_count', l.offer_count,
    'like_count', l.like_count, 'comment_count', l.comment_count, 'comments_enabled', l.comments_enabled,
    'bumped_at', l.bumped_at, 'created_at', l.created_at, 'expires_at', l.expires_at,
    'link_url', l.link_url, 'event_at', l.event_at,
    'is_own', l.seller_id = p_viewer,
    'saved', exists (select 1 from public.saves s where s.user_id = p_viewer and s.listing_id = l.id),
    'watching', exists (select 1 from public.watches w where w.user_id = p_viewer and w.listing_id = l.id),
    'liked', exists (select 1 from public.listing_likes k where k.user_id = p_viewer and k.listing_id = l.id),
    'seller', jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path,
      'year', p.year, 'created_at', p.created_at,
      'swaps_count', coalesce(st.swaps_count, 0),
      'thumbs_up', coalesce(st.thumbs_up, 0),
      'thumbs_total', coalesce(st.thumbs_total, 0)),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'path', ph.path, 'thumb_path', ph.thumb_path, 'blurhash', ph.blurhash,
               'width', ph.width, 'height', ph.height) order by ph.idx)
      from public.listing_photos ph where ph.listing_id = l.id), '[]'::jsonb))
  from public.listings l
  left join public.profiles p on p.id = l.seller_id
  left join public.profile_stats_mv st on st.user_id = l.seller_id
  where l.id = p_id
$$;

revoke all on function private.feed_item(uuid, uuid) from public, anon, authenticated;
