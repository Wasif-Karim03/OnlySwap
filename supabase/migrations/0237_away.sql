-- 0237 · Away mode (DEC 126). A seller can pause their listings:
-- profiles.away_since hides their sale/free listings from the deck, search
-- and the campus feed, and new offers on them fail with SELLER_AWAY. Turning
-- it off adds the time away to each active sale/free listing's expiry. Open
-- offers and chats are untouched. feed_item.seller, get_profile and get_me
-- say whether the person is away (additive).

alter table public.profiles add column away_since timestamptz;
create index profiles_away on public.profiles (id) where away_since is not null;

create or replace function private.is_away(p_uid uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = p_uid and p.away_since is not null)
$$;

create or replace function public.set_away(away boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
begin
  if set_away.away and me.away_since is null then
    update public.profiles p set away_since = private.now() where p.id = me.id;
  elsif not set_away.away and me.away_since is not null then
    update public.listings l
       set expires_at = l.expires_at + (private.now() - me.away_since)
     where l.seller_id = me.id and l.status = 'active' and l.kind in ('sale', 'free')
       and l.expires_at is not null;
    update public.profiles p set away_since = null where p.id = me.id;
  end if;
  return jsonb_build_object('away_since',
    (select p.away_since from public.profiles p where p.id = me.id));
end;
$$;

-- New offers on an away seller's listing (make_offer and any later path).
create or replace function private.offers_seller_away()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_away(new.seller_id) then
    perform private.raise('SELLER_AWAY');
  end if;
  return new;
end;
$$;
create trigger trg_offers_seller_away before insert on public.offers
  for each row execute function private.offers_seller_away();

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

create or replace function public.get_feed(cursor jsonb default null, "limit" int default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  c_at timestamptz;
  c_id uuid;
  n int := least(greatest(coalesce(get_feed."limit", 20), 1), 50);
  items jsonb;
begin
  perform private.hit('get_feed', 120, interval '1 hour');
  begin
    c_at := nullif(get_feed.cursor ->> 'bumped_at', '')::timestamptz;
    c_id := nullif(get_feed.cursor ->> 'id', '')::uuid;
  exception when others then
    perform private.raise('INVALID', 'cursor');
  end;
  if (c_at is null) <> (c_id is null) then
    perform private.raise('INVALID', 'cursor');
  end if;
  select coalesce(jsonb_agg(private.feed_item(x.id, me.id) order by x.bumped_at desc, x.id desc), '[]')
    into items
  from (
    select l.id, l.bumped_at
    from public.listings l
    where l.campus_id = me.campus_id
      and l.status = 'active'
      and l.kind in ('sale', 'free')
      and l.seller_id <> me.id
      and (l.expires_at is null or l.expires_at > private.now())
      and not private.is_blocked(me.id, l.seller_id)
      and not private.is_away(l.seller_id)
      and not exists (
        select 1 from public.swipes s
        where s.user_id = me.id and s.listing_id = l.id
          and s.created_at > private.now() - interval '30 days')
      and (c_at is null or (l.bumped_at, l.id) < (c_at, c_id))
    order by l.bumped_at desc, l.id desc
    limit n
  ) x;

  if c_at is null and jsonb_array_length(items) < 5 then
    insert into public.daily_counters as d (campus_id, day, key, value)
    values (me.campus_id, private.campus_today(me.campus_id), 'feed_exhausted', 1)
    on conflict (campus_id, day, key) do update set value = d.value + 1;
  end if;
  return items;
end;
$$;

create or replace function public.search_listings(q text default null, filters jsonb default '{}', cursor jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  f jsonb := private.check_search_filters(search_listings.filters);
  qq text := nullif(btrim(coalesce(search_listings.q, '')), '');
  v_sort text := coalesce(f ->> 'sort', case when qq is null then 'new' else 'relevance' end);
  v_now timestamptz := private.now();
  off int := 0;
  tsq tsquery;
  nq text;
  cats smallint[];
  conds public.item_condition[];
  v_min int := (f ->> 'min_cents')::int;
  v_max int := (f ->> 'max_cents')::int;
  v_free bool := coalesce((f ->> 'free_only')::bool, false);
  v_hide bool := coalesce((f ->> 'hide_swiped')::bool, false);
  hidden uuid[];
  items jsonb;
begin
  perform private.hit('search_listings', 120, interval '1 hour');
  -- The title match keeps the 0.5 threshold of the one-row check. pg_trgm is
  -- loaded first: a role can't set the option before the module defines it.
  perform extensions.word_similarity('', '');
  perform set_config('pg_trgm.word_similarity_threshold', '0.5', true);
  if char_length(coalesce(qq, '')) > 80 then
    perform private.raise('INVALID', 'q');
  end if;
  begin
    off := greatest(coalesce((search_listings.cursor ->> 'offset')::int, 0), 0);
  exception when others then
    perform private.raise('INVALID', 'cursor');
  end;
  if v_sort = 'relevance' and qq is null then
    v_sort := 'new';
  end if;
  if qq is not null then
    tsq := websearch_to_tsquery('english', private.unaccent_immutable(qq));
    if numnode(tsq) = 0 then
      tsq := null;  -- stop words only: the title match alone
    end if;
    nq := lower(private.unaccent_immutable(qq));
  end if;

  -- A parent category includes its children.
  select array_agg(x) into cats from (
    select x::smallint as x from jsonb_array_elements_text(coalesce(f -> 'category_ids', '[]')) x
    union
    select c.id from public.categories c
    where c.parent_id in (select x::smallint from jsonb_array_elements_text(coalesce(f -> 'category_ids', '[]')) x)
  ) s;
  select array_agg(x::public.item_condition) into conds
  from jsonb_array_elements_text(coalesce(f -> 'conditions', '[]')) x;
  select coalesce(array_agg(case when b.blocker_id = me.id then b.blocked_id else b.blocker_id end), '{}') into hidden
  from public.blocks b where b.blocker_id = me.id or b.blocked_id = me.id;

  select coalesce(jsonb_agg(private.feed_item(x.id, me.id) order by x.n), '[]') into items
  from unnest(array(
    select l.id
    from public.listings l
    where l.campus_id = me.campus_id
      and l.status in ('active', 'hold')
      and l.kind in ('sale', 'free')
      and l.seller_id <> me.id
      and (l.expires_at is null or l.expires_at > v_now)
      and l.seller_id <> all (hidden)
      and not private.is_away(l.seller_id)
      and (qq is null
           or l.search @@ tsq
           or nq operator(extensions.<%) lower(private.unaccent_immutable(l.title)))
      and (cats is null or l.category_id = any (cats))
      and (v_min is null or l.price_cents >= v_min)
      and (v_max is null or l.price_cents <= v_max)
      and (conds is null or l.condition = any (conds))
      and (not v_free or l.kind = 'free' or l.price_cents = 0)
      and not (v_hide and exists (
        select 1 from public.swipes s where s.user_id = me.id and s.listing_id = l.id))
    order by
      case when v_sort = 'price_asc' then l.price_cents end asc,
      case when v_sort = 'price_desc' then l.price_cents end desc,
      case when v_sort = 'relevance' then
        coalesce(ts_rank(l.search, tsq), 0)
        + extensions.word_similarity(nq, lower(private.unaccent_immutable(l.title)))
      end desc nulls last,
      l.bumped_at desc, l.id desc
    offset off limit 20
  )) with ordinality x(id, n);
  return items;
end;
$$;

create or replace function public.get_campus_feed(kind text default null, cursor jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  k text := lower(coalesce(nullif(btrim(get_campus_feed.kind), ''), 'all'));
  c_at timestamptz;
  c_id uuid;
  n int := 20;
  rows_ uuid[];
  items jsonb;
  last_id uuid;
  last_at timestamptz;
  active_n int;
  c public.campuses;
begin
  if k not in ('all', 'food', 'free', 'wanted', 'new', 'news') then
    perform private.raise('INVALID', 'kind');
  end if;
  perform private.hit('get_campus_feed', 120, interval '1 hour');
  begin
    c_at := nullif(get_campus_feed.cursor ->> 'bumped_at', '')::timestamptz;
    c_id := nullif(get_campus_feed.cursor ->> 'id', '')::uuid;
  exception when others then
    perform private.raise('INVALID', 'cursor');
  end;
  if (c_at is null) <> (c_id is null) then
    perform private.raise('INVALID', 'cursor');
  end if;

  select array_agg(x.id order by x.bumped_at desc, x.id desc) into rows_
  from (
    select l.id, l.bumped_at
    from public.listings l
    where l.campus_id = me.campus_id
      and l.status = 'active'
      and (l.expires_at is null or l.expires_at > private.now())
      and case k
            when 'food' then l.kind = 'food'
            when 'free' then l.kind = 'free'
            when 'wanted' then l.kind = 'wanted'
            when 'news' then l.kind = 'news'
            when 'new' then l.kind = 'sale' and l.created_at > private.now() - interval '7 days'
            else l.kind in ('food', 'free', 'wanted', 'news')
                 or (l.kind = 'sale' and l.created_at > private.now() - interval '7 days')
          end
      and not private.is_blocked(me.id, l.seller_id)
      and (l.kind not in ('sale', 'free') or not private.is_away(l.seller_id))
      and (c_at is null or (l.bumped_at, l.id) < (c_at, c_id))
    order by l.bumped_at desc, l.id desc
    limit n
  ) x;

  select coalesce(jsonb_agg(private.feed_item(l.id, me.id) || jsonb_build_object(
           'wanted_max_cents', l.wanted_max_cents, 'wanted_ref', l.wanted_ref,
           'place', private.listing_place(l))
         order by l.bumped_at desc, l.id desc), '[]')
    into items
  from public.listings l
  where l.id = any(coalesce(rows_, '{}'));

  if coalesce(array_length(rows_, 1), 0) = n then
    last_id := rows_[n];
    select l.bumped_at into last_at from public.listings l where l.id = last_id;
  end if;

  -- The day-one hero and founding card are read from page one only, so later
  -- pages skip both counts (E-13).
  if get_campus_feed.cursor is not null then
    return jsonb_build_object(
      'items', items,
      'next_cursor', case when last_id is null then null
                          else jsonb_build_object('bumped_at', last_at, 'id', last_id) end,
      'day_one', null, 'active_listings', null, 'founding', null);
  end if;

  select * into c from public.campuses x where x.id = me.campus_id;
  select count(*)::int into active_n from public.listings l
  where l.campus_id = me.campus_id and l.status = 'active' and l.kind in ('sale', 'free');

  return jsonb_build_object(
    'items', items,
    'next_cursor', case when last_id is null then null
                        else jsonb_build_object('bumped_at', last_at, 'id', last_id) end,
    'day_one', active_n < 10,
    'active_listings', active_n,
    'founding', jsonb_build_object(
      'limit', c.founding_seller_limit,
      'left', greatest(c.founding_seller_limit - (
                select count(*)::int from public.profiles p
                where p.campus_id = c.id and p.founding_seller_until is not null), 0),
      'mine', me.founding_seller_until is not null and me.founding_seller_until >= private.now()));
end;
$$;

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
    'away_since', me.away_since,
    'counts', jsonb_build_object(
      'active', (select count(*)::int from public.listings l where l.seller_id = me.id and l.status in ('active', 'hold')),
      'sold', (select count(*)::int from public.listings l where l.seller_id = me.id and l.status = 'sold'),
      'saved', (select count(*)::int from public.saves s where s.user_id = me.id),
      'swaps', coalesce(st.swaps_count, 0),
      'thumbs_up', coalesce(st.thumbs_up, 0),
      'thumbs_total', coalesce(st.thumbs_total, 0)));
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
    'away', p.away_since is not null,
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

revoke all on function private.is_away(uuid) from public, anon, authenticated;
revoke all on function private.offers_seller_away() from public, anon, authenticated;
revoke all on function private.feed_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_away(boolean) from public, anon;
grant execute on function public.set_away(boolean) to authenticated;
