-- 0021_saved_profiles.sql (S21: P6-SAVE-01, P6-USER-01, DEC 59)
--   get_saved: the Saved tab's items with the price when saved (price-drop tag).
--   get_profile: a seller profile in one call (B10: listings, reviews, stats,
--   new seller, blocked).

create or replace function public.get_saved()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
begin
  return coalesce((
    select jsonb_agg(private.feed_item(l.id, me.id)
                     || jsonb_build_object('price_at_save', s.price_at_save, 'saved_at', s.created_at)
                     order by s.created_at desc)
    from public.saves s
    join public.listings l on l.id = s.listing_id
    where s.user_id = me.id
      and l.status in ('active', 'hold', 'sold')
      and not private.is_blocked(me.id, l.seller_id)), '[]');
end;
$$;

create or replace function public.get_profile(user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  p public.profiles;
  st record;
  i_blocked bool;
begin
  perform private.hit('get_profile', 600, interval '1 hour');
  select * into p from public.profiles x where x.id = get_profile.user_id;
  if not found or p.campus_id <> me.campus_id or p.status = 'banned' then
    return jsonb_build_object('id', get_profile.user_id, 'access', 'gone');
  end if;
  i_blocked := exists (select 1 from public.blocks b where b.blocker_id = me.id and b.blocked_id = p.id);
  if i_blocked then
    return jsonb_build_object('id', p.id, 'access', 'blocked', 'display_name', p.display_name);
  end if;
  if private.is_blocked(me.id, p.id) then
    return jsonb_build_object('id', p.id, 'access', 'gone');
  end if;

  select s.swaps_count, s.thumbs_up, s.thumbs_total, s.median_reply_minutes into st
  from public.profile_stats_mv s where s.user_id = p.id;

  return jsonb_build_object(
    'id', p.id,
    'access', case when p.id = me.id then 'me' else 'ok' end,
    'display_name', p.display_name,
    'year', p.year,
    'avatar_path', p.avatar_path,
    'created_at', p.created_at,
    'founding_seller', p.founding_seller_until is not null and p.founding_seller_until >= private.campus_today(p.campus_id),
    'swaps_count', coalesce(st.swaps_count, 0),
    'thumbs_up', coalesce(st.thumbs_up, 0),
    'thumbs_total', coalesce(st.thumbs_total, 0),
    'median_reply_minutes', st.median_reply_minutes,
    'new_seller', coalesce(st.swaps_count, 0) = 0,
    'listings', coalesce((
      select jsonb_agg(private.feed_item(l.id, me.id) order by l.bumped_at desc)
      from public.listings l
      where l.seller_id = p.id and l.status in ('active', 'hold') and l.kind in ('sale', 'free')), '[]'),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'thumbs_up', r.thumbs_up, 'tags', to_jsonb(r.tags), 'comment', r.comment,
               'rater_name', rp.display_name, 'created_at', r.created_at) order by r.created_at desc)
      from public.ratings r
      left join public.profiles rp on rp.id = r.rater_id
      where r.ratee_id = p.id
        and (r.created_at < private.now() - interval '7 days'
             or exists (select 1 from public.ratings o where o.chat_id = r.chat_id and o.rater_id is not distinct from r.ratee_id))
      ), '[]'));
end;
$$;

revoke all on function public.get_saved() from public, anon;
revoke all on function public.get_profile(uuid) from public, anon;
grant execute on function public.get_saved() to authenticated;
grant execute on function public.get_profile(uuid) to authenticated;
