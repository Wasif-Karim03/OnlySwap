-- Campus news posts and the Feed tab (DEC 98). Any verified student can post
-- news (an event, club news, a lost item) to their campus Feed: a title, an
-- optional description, 0 to 4 photos, an optional link and an optional event
-- time and place. Posts go live at once (the listing text filter still holds
-- bad ones for review) and are reported and removed like listings.
--   * listings gains link_url and event_at (news only).
--   * create_news(...): new RPC, idempotent on the reserved id like
--     create_listing; 3 a day, counted with the 20 listings a day.
--   * Expiry: the end of the event's day on campus, or 14 days without a date
--     (expire_listings already handles every kind, with no notification).
--   * feed_item returns link_url and event_at (additive), so get_listing and
--     get_campus_feed carry them.
--   * get_campus_feed: kind 'news', and 'all' includes news.
-- Discover, search, offers, renew and seller alerts stay sale and free only,
-- as before.

alter table public.listings
  add column link_url text
    check (link_url is null or (char_length(link_url) <= 300 and link_url ~ '^https?://[^[:space:]]+$')),
  add column event_at timestamptz;

-- ---------------------------------------------------------------------------
-- feed_item: unchanged from 0018 except link_url and event_at.
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
    'bumped_at', l.bumped_at, 'created_at', l.created_at, 'expires_at', l.expires_at,
    'link_url', l.link_url, 'event_at', l.event_at,
    'is_own', l.seller_id = p_viewer,
    'saved', exists (select 1 from public.saves s where s.user_id = p_viewer and s.listing_id = l.id),
    'watching', exists (select 1 from public.watches w where w.user_id = p_viewer and w.listing_id = l.id),
    'seller', jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path,
      'year', p.year, 'created_at', p.created_at),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'path', ph.path, 'thumb_path', ph.thumb_path, 'blurhash', ph.blurhash,
               'width', ph.width, 'height', ph.height) order by ph.idx)
      from public.listing_photos ph where ph.listing_id = l.id), '[]'::jsonb))
  from public.listings l
  left join public.profiles p on p.id = l.seller_id
  where l.id = p_id
$$;

-- ---------------------------------------------------------------------------
-- create_news: a campus news post on a reserved id (reserve_listing_id).
--   title 3-80, description up to 1000, place up to 60 (stored in meet_note,
--   so it shows like a food post's place), link http(s) up to 300, event_at
--   in the future and at most 90 days out, photos 0-4.
create or replace function public.create_news(
  id uuid,
  title text,
  description text default null,
  photos jsonb default '[]',
  link_url text default null,
  event_at timestamptz default null,
  place text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  lid uuid := create_news.id;
  t text := btrim(coalesce(create_news.title, ''));
  d text := nullif(btrim(coalesce(create_news.description, '')), '');
  note text := nullif(btrim(coalesce(create_news.place, '')), '');
  link text := nullif(btrim(coalesce(create_news.link_url, '')), '');
  tz text;
  expires timestamptz;
  held boolean;
  existing public.listings;
begin
  -- Idempotent: a retry with the same reserved id returns the first result.
  select * into existing from public.listings l where l.id = lid;
  if found then
    if existing.seller_id is distinct from me.id then
      perform private.raise('FORBIDDEN');
    end if;
    return private.listing_json(lid);
  end if;
  if lid is null or not exists (
      select 1 from public.listing_reservations r where r.id = lid and r.user_id = me.id) then
    perform private.raise('FORBIDDEN');
  end if;

  if char_length(t) < 3 or char_length(t) > 80 then
    perform private.raise('INVALID', 'title');
  end if;
  if char_length(coalesce(d, '')) > 1000 then
    perform private.raise('INVALID', 'description');
  end if;
  if char_length(coalesce(note, '')) > 60 then
    perform private.raise('INVALID', 'place');
  end if;
  if link is not null and (char_length(link) > 300 or link !~* '^https?://[^[:space:]]+\.[^[:space:]]+$') then
    perform private.raise('INVALID', 'link_url');
  end if;

  select c.timezone into tz from public.campuses c where c.id = me.campus_id;
  tz := coalesce(tz, 'America/New_York');
  if create_news.event_at is not null then
    if create_news.event_at <= private.now() or create_news.event_at > private.now() + interval '90 days' then
      perform private.raise('INVALID', 'event_at');
    end if;
    -- Gone after the event's day ends on campus.
    expires := (((create_news.event_at at time zone tz)::date + 1)::timestamp at time zone tz);
  else
    expires := private.now() + interval '14 days';
  end if;

  -- The link goes through the same filter as the text.
  held := private.listing_text_held(t, concat_ws(' ', d, link), note);

  perform private.hit('create_listing', 20, interval '1 day');
  if me.created_at > private.now() - interval '24 hours' then
    perform private.hit('create_listing_new', 3, interval '1 day');
  end if;
  perform private.hit('create_news', 3, interval '1 day');

  insert into public.listings (
    id, campus_id, seller_id, kind, status, title, description, price_cents,
    open_to_offers, meet_note, link_url, event_at, expires_at)
  values (
    lid, me.campus_id, me.id, 'news', case when held then 'held_review' else 'active' end::public.listing_status,
    t, d, 0, false, note, link, create_news.event_at, expires);

  perform private.set_listing_photos(lid, me.campus_id, create_news.photos, 0, 4);

  update public.listing_reservations set used_at = private.now() where id = lid;
  return private.listing_json(lid);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_campus_feed: unchanged from 0203 except kind 'news' and news in 'all'.
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

-- ---------------------------------------------------------------------------
revoke all on function private.feed_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_news(uuid, text, text, jsonb, text, timestamptz, text) from public, anon;
grant execute on function public.create_news(uuid, text, text, jsonb, text, timestamptz, text) to authenticated, service_role;
revoke all on function public.get_campus_feed(text, jsonb) from public, anon;
grant execute on function public.get_campus_feed(text, jsonb) to authenticated, service_role;
