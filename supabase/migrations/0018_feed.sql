-- 0018_feed.sql (S18: P6-FEED-01, API §3 "Feed, listings, search")
--   get_feed, record_swipes, undo_swipe, save_listing, unsave_listing,
--   hide_listing, watch_listing, record_view.
--   A hidden listing is a left swipe that never expires (created_at =
--   'infinity'), so the 30-day swipe window keeps it out for good.

-- The card as the deck and the listing screen see it (no seller email, no ids
-- of other people besides the seller).
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

-- A listing the caller may act on: same campus, visible, not blocked.
create or replace function private.visible_listing(p_id uuid, p_me public.profiles)
returns public.listings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings x where x.id = p_id;
  if not found or l.campus_id <> p_me.campus_id or l.status not in ('active','hold','sold')
     or private.is_blocked(p_me.id, l.seller_id) then
    perform private.raise('NOT_FOUND');
  end if;
  return l;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_feed: newest bumps first, keyset cursor {bumped_at, id}.
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

-- ---------------------------------------------------------------------------
-- Saves (keep save_count in step).
create or replace function private.save(p_me public.profiles, p_listing uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := private.visible_listing(p_listing, p_me);
  added int;
begin
  if l.seller_id = p_me.id then
    perform private.raise('FORBIDDEN');
  end if;
  insert into public.saves (user_id, listing_id, price_at_save)
  values (p_me.id, l.id, l.price_cents)
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    update public.listings set save_count = save_count + 1 where id = l.id;
  end if;
  return (select save_count from public.listings where id = l.id);
end;
$$;

create or replace function public.save_listing(listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
begin
  perform private.hit('save_listing', 200, interval '1 day');
  return jsonb_build_object('save_count', private.save(me, save_listing.listing_id));
end;
$$;

create or replace function public.unsave_listing(listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
  removed int;
begin
  delete from public.saves s where s.user_id = me.id and s.listing_id = unsave_listing.listing_id;
  get diagnostics removed = row_count;
  if removed > 0 then
    update public.listings set save_count = greatest(save_count - 1, 0) where id = unsave_listing.listing_id;
  end if;
  return jsonb_build_object('save_count',
    coalesce((select save_count from public.listings where id = unsave_listing.listing_id), 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- record_swipes: a batch from the deck (≤50). Unknown or invisible ids are
-- ignored; a save swipe also saves the listing.
create or replace function public.record_swipes(items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
  it record;
  v_dir public.swipe_dir;
  v_at timestamptz;
begin
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 50 then
    perform private.raise('INVALID', 'items');
  end if;
  perform private.hit('record_swipes', 60, interval '1 hour');
  for it in select value as v from jsonb_array_elements(items) loop
    begin
      v_dir := (it.v ->> 'dir')::public.swipe_dir;
      v_at := least(coalesce(nullif(it.v ->> 'at', '')::timestamptz, private.now()), private.now());
    exception when others then
      continue;
    end;
    if not exists (
      select 1 from public.listings l
      where l.id = nullif(it.v ->> 'listing_id', '')::uuid
        and l.campus_id = me.campus_id and l.seller_id <> me.id
        and l.status in ('active','hold') and not private.is_blocked(me.id, l.seller_id)) then
      continue;
    end if;
    insert into public.swipes as s (user_id, listing_id, dir, created_at)
    values (me.id, (it.v ->> 'listing_id')::uuid, v_dir, v_at)
    on conflict (user_id, listing_id) do update
      set dir = excluded.dir, created_at = excluded.created_at
      where s.created_at <> 'infinity';
    if v_dir = 'save' then
      perform private.save(me, (it.v ->> 'listing_id')::uuid);
    end if;
  end loop;
end;
$$;

-- undo_swipe: within 60 s of the swipe; a save swipe also unsaves.
create or replace function public.undo_swipe(listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
  s public.swipes;
begin
  select * into s from public.swipes x where x.user_id = me.id and x.listing_id = undo_swipe.listing_id;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  if s.created_at = 'infinity' or s.created_at < private.now() - interval '60 seconds' then
    perform private.raise('INVALID', 'too_late');
  end if;
  delete from public.swipes x where x.user_id = me.id and x.listing_id = undo_swipe.listing_id;
  if s.dir = 'save' then
    perform public.unsave_listing(undo_swipe.listing_id);
  end if;
end;
$$;

-- hide_listing: "Not interested" for good.
create or replace function public.hide_listing(listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings := private.visible_listing(hide_listing.listing_id, me);
begin
  if l.seller_id = me.id then
    perform private.raise('FORBIDDEN');
  end if;
  insert into public.swipes as s (user_id, listing_id, dir, created_at)
  values (me.id, l.id, 'left', 'infinity')
  on conflict (user_id, listing_id) do update set dir = 'left', created_at = 'infinity';
end;
$$;

-- watch_listing: tell me when a listing on hold is available again.
create or replace function public.watch_listing(listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
  l public.listings := private.visible_listing(watch_listing.listing_id, me);
begin
  if l.status <> 'hold' or l.seller_id = me.id then
    perform private.raise('INVALID', 'status');
  end if;
  insert into public.watches (user_id, listing_id) values (me.id, l.id) on conflict do nothing;
end;
$$;

-- record_view: counts once per person per campus day; the seller's own views don't count.
create or replace function public.record_view(listing_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
  l public.listings := private.visible_listing(record_view.listing_id, me);
  added int;
begin
  if l.seller_id = me.id then
    return;
  end if;
  insert into public.rate_counters (user_id, action, window_start, count)
  values (me.id, 'view:' || l.id, private.campus_today(me.campus_id)::timestamptz, 1)
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    update public.listings set view_count = view_count + 1 where id = l.id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
revoke all on function private.feed_item(uuid, uuid) from public, anon, authenticated;
revoke all on function private.visible_listing(uuid, public.profiles) from public, anon, authenticated;
revoke all on function private.save(public.profiles, uuid) from public, anon, authenticated;

revoke all on function public.get_feed(jsonb, int) from public, anon;
revoke all on function public.record_swipes(jsonb) from public, anon;
revoke all on function public.undo_swipe(uuid) from public, anon;
revoke all on function public.save_listing(uuid) from public, anon;
revoke all on function public.unsave_listing(uuid) from public, anon;
revoke all on function public.hide_listing(uuid) from public, anon;
revoke all on function public.watch_listing(uuid) from public, anon;
revoke all on function public.record_view(uuid) from public, anon;

grant execute on function public.get_feed(jsonb, int) to authenticated;
grant execute on function public.record_swipes(jsonb) to authenticated;
grant execute on function public.undo_swipe(uuid) to authenticated;
grant execute on function public.save_listing(uuid) to authenticated;
grant execute on function public.unsave_listing(uuid) to authenticated;
grant execute on function public.hide_listing(uuid) to authenticated;
grant execute on function public.watch_listing(uuid) to authenticated;
grant execute on function public.record_view(uuid) to authenticated;
