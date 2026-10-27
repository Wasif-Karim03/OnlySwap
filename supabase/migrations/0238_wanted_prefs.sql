-- 0238 · Wanted: need it by and alert me (DEC 127). Wanted posts gain an
-- optional need_by date (the post ends at the end of that campus day) and a
-- wanted_alerts switch (default on). With alerts on, a new sale/free listing
-- whose title matches the Wanted title alerts too, besides the category
-- match; with alerts off, no wanted_match notices at all. Set after creating
-- the post (or later) with set_wanted_prefs; create_listing is unchanged.

alter table public.listings
  add column need_by date,
  add column wanted_alerts boolean not null default true;

create or replace function public.set_wanted_prefs(id uuid, need_by date, alerts boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
  today date;
  tz text;
begin
  select * into l from public.listings x where x.id = set_wanted_prefs.id for update;
  if not found or l.seller_id is distinct from me.id or l.status in ('deleted', 'removed') then
    perform private.raise('NOT_FOUND');
  end if;
  if l.kind <> 'wanted' then
    perform private.raise('INVALID', 'kind');
  end if;
  select c.timezone into tz from public.campuses c where c.id = l.campus_id;
  today := private.campus_today(l.campus_id);
  if set_wanted_prefs.need_by is not null
     and (set_wanted_prefs.need_by < today or set_wanted_prefs.need_by > today + 60) then
    perform private.raise('INVALID', 'need_by');
  end if;
  update public.listings x
     set need_by = set_wanted_prefs.need_by,
         wanted_alerts = coalesce(set_wanted_prefs.alerts, true),
         expires_at = case
           when set_wanted_prefs.need_by is not null
             then ((set_wanted_prefs.need_by + 1)::timestamp at time zone coalesce(tz, 'America/New_York'))
           else x.created_at + interval '1440 hours' end
   where x.id = l.id;
  return jsonb_build_object('need_by', set_wanted_prefs.need_by,
                            'wanted_alerts', coalesce(set_wanted_prefs.alerts, true));
end;
$$;

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
    'need_by', l.need_by, 'wanted_alerts', l.wanted_alerts,
    'is_own', l.seller_id = p_viewer,
    'saved', exists (select 1 from public.saves s where s.user_id = p_viewer and s.listing_id = l.id),
    'watching', exists (select 1 from public.watches w where w.user_id = p_viewer and w.listing_id = l.id),
    'liked', exists (select 1 from public.listing_likes k where k.user_id = p_viewer and k.listing_id = l.id),
    'seller', jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path,
      'year', p.year, 'created_at', p.created_at,
      'swaps_count', coalesce(st.swaps_count, 0),
      'thumbs_up', coalesce(st.thumbs_up, 0),
      'thumbs_total', coalesce(st.thumbs_total, 0),
      'away', p.away_since is not null),
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

create or replace function private.notify_wanted_match(l public.listings)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
  direct uuid;
  day date := private.campus_today(l.campus_id);
  n int := 0;
begin
  -- "I have this": the Wanted it answers.
  if l.wanted_ref is not null then
    select x.seller_id into direct
    from public.listings x
    join public.profiles p on p.id = x.seller_id
    where x.id = l.wanted_ref and x.kind = 'wanted' and x.campus_id = l.campus_id
      and p.status = 'active' and x.wanted_alerts
      and x.seller_id is distinct from l.seller_id
      and not private.is_blocked(x.seller_id, l.seller_id);
    if direct is not null then
      perform private.queue_notification(direct, 'wanted_match', 'alerts', 'Someone has what you want',
        left(coalesce((select p.first_name from public.profiles p where p.id = l.seller_id), 'Someone')
          || ' listed ' || l.title || ' for ' || private.money(l.price_cents) || '. Take a look.', 200),
        jsonb_build_object('listing_id', l.id, 'wanted_id', l.wanted_ref, 'url', '/listing/' || l.id),
        false, 'wanted_match:' || l.wanted_ref || ':' || l.id);
      n := n + 1;
    end if;
  end if;

  -- Same category, or the Wanted title matches the listing (DEC 127): open
  -- Wanted posts with alerts on, once per poster per day.
  for w in
    select distinct on (x.seller_id) x.id, x.seller_id, x.title
    from public.listings x
    join public.profiles p on p.id = x.seller_id
    where x.campus_id = l.campus_id and x.kind = 'wanted' and x.status = 'active'
      and x.wanted_alerts
      and (x.category_id = l.category_id or private.text_matches(l, x.title))
      and (x.expires_at is null or x.expires_at > private.now())
      and p.status = 'active'
      and x.seller_id is distinct from l.seller_id
      and x.seller_id is distinct from direct
      and not private.is_blocked(x.seller_id, l.seller_id)
    order by x.seller_id, x.created_at desc
  loop
    perform private.queue_notification(w.seller_id, 'wanted_match', 'alerts', 'New match for your Wanted',
      left('New: ' || l.title || ' for ' || private.money(l.price_cents) || ' (you wanted ' || w.title || ')', 200),
      jsonb_build_object('listing_id', l.id, 'wanted_id', w.id, 'url', '/listing/' || l.id),
      false, 'wanted_match:' || w.seller_id || ':' || day);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function private.feed_item(uuid, uuid) from public, anon, authenticated;
revoke all on function private.notify_wanted_match(public.listings) from public, anon, authenticated;
revoke all on function public.set_wanted_prefs(uuid, date, boolean) from public, anon;
grant execute on function public.set_wanted_prefs(uuid, date, boolean) to authenticated;
