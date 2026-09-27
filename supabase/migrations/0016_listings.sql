-- 0016_listings.sql (S16: P5-SELL-01, API §3 "Feed, listings, search")
--   reserve_listing_id, create_listing (idempotent on the reserved id, BE-05),
--   update_listing, delete_listing (soft), relist_listing, mark_sold,
--   check_text (inline UX), price_hint (UI in R1.1).
--   DEC 54: create_listing takes an optional pickup_by date for give-aways
--   (board D4 "Pick up by"); the free listing expires at the end of that day.

-- ---------------------------------------------------------------------------
-- Helpers

-- The listing as the client sees it, photos in order.
create or replace function private.listing_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'campus_id', l.campus_id, 'seller_id', l.seller_id,
    'kind', l.kind, 'status', l.status, 'title', l.title, 'description', l.description,
    'category_id', l.category_id, 'condition', l.condition, 'price_cents', l.price_cents,
    'open_to_offers', l.open_to_offers, 'meet_spot_ids', to_jsonb(l.meet_spot_ids),
    'meet_note', l.meet_note, 'availability', to_jsonb(l.availability),
    'wanted_max_cents', l.wanted_max_cents, 'wanted_ref', l.wanted_ref,
    'expires_at', l.expires_at, 'bumped_at', l.bumped_at, 'sold_at', l.sold_at,
    'buyer_id', l.buyer_id, 'created_at', l.created_at, 'updated_at', l.updated_at,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'idx', p.idx, 'path', p.path, 'thumb_path', p.thumb_path,
               'width', p.width, 'height', p.height, 'blurhash', p.blurhash) order by p.idx)
      from public.listing_photos p where p.listing_id = l.id), '[]'::jsonb))
  from public.listings l
  where l.id = p_id
$$;

-- Banned words over every text field of a listing. Raises BANNED_TERM on a
-- block; returns true when a review word means the listing is held (X14).
create or replace function private.listing_text_held(p_title text, p_description text, p_note text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  verdict text;
  held boolean := false;
  t text;
begin
  foreach t in array array[p_title, p_description, p_note] loop
    verdict := private.check_text(t, 'listing');
    if verdict like 'block:%' then
      perform private.raise('BANNED_TERM', substr(verdict, 7));
    elsif verdict like 'review:%' then
      held := true;
    end if;
  end loop;
  return held;
end;
$$;

-- Validates the photos array and replaces the listing's photo rows.
-- Each item: {path, thumb_path, width?, height?, blurhash?}; order = idx.
-- Paths must sit under c/{campus}/l/{listing}/ (T-INT-LIST-01).
create or replace function private.set_listing_photos(
  p_listing uuid, p_campus uuid, p_photos jsonb, p_min int, p_max int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefix text := 'c/' || p_campus || '/l/' || p_listing || '/';
  n int;
begin
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then
    perform private.raise('INVALID', 'photos');
  end if;
  n := jsonb_array_length(p_photos);
  if n < p_min or n > p_max then
    perform private.raise('INVALID', 'photos');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_photos) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'path', '') !~ ('^' || prefix || '[A-Za-z0-9_-]+\.webp$')
       or coalesce(e ->> 'thumb_path', '') !~ ('^' || prefix || '[A-Za-z0-9_-]+\.webp$')
       or char_length(coalesce(e ->> 'blurhash', '')) > 100
  ) then
    perform private.raise('INVALID', 'photos');
  end if;
  delete from public.listing_photos where listing_id = p_listing;
  insert into public.listing_photos (listing_id, idx, path, thumb_path, width, height, blurhash)
  select p_listing, (e.ord - 1)::smallint, e.v ->> 'path', e.v ->> 'thumb_path',
         nullif(e.v ->> 'width', '')::int, nullif(e.v ->> 'height', '')::int,
         nullif(e.v ->> 'blurhash', '')
  from jsonb_array_elements(p_photos) with ordinality as e(v, ord);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    perform private.raise('INVALID', 'photos');
end;
$$;

-- Meetup spots must be active spots of the seller's campus (at most 5).
create or replace function private.check_meet_spots(p_campus uuid, p_ids uuid[])
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ids uuid[] := coalesce(p_ids, '{}');
begin
  if cardinality(ids) > 5 or exists (
    select 1 from unnest(ids) i
    where not exists (select 1 from public.safe_spots s
                      where s.id = i and s.campus_id = p_campus and s.active)) then
    perform private.raise('INVALID', 'meet_spot_ids');
  end if;
  return (select coalesce(array_agg(distinct i), '{}') from unnest(ids) i);
end;
$$;

create or replace function private.check_availability(p_items text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  items text[];
begin
  select coalesce(array_agg(btrim(a)), '{}') into items
  from unnest(coalesce(p_items, '{}')) a where nullif(btrim(a), '') is not null;
  if cardinality(items) > 7 or exists (select 1 from unnest(items) a where char_length(a) > 30) then
    perform private.raise('INVALID', 'availability');
  end if;
  return items;
end;
$$;

-- Closes the open chats of a listing with a system message and declines its
-- open offers (BE-11). p_keep_buyer keeps that buyer's chat open (mark_sold).
create or replace function private.wind_down_listing(p_listing uuid, p_message text, p_keep_buyer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  update public.offers
     set status = 'auto_declined', responded_at = private.now()
   where listing_id = p_listing and status in ('pending','countered');
  for c in
    select id from public.chats
    where listing_id = p_listing and status = 'open'
      and (p_keep_buyer is null or buyer_id is distinct from p_keep_buyer)
  loop
    insert into public.messages (chat_id, sender_id, kind, body)
    values (c.id, null, 'system', p_message);
    update public.chats set status = 'closed', closed_at = private.now() where id = c.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- reserve_listing_id: the id the photos upload under before the row exists.
create or replace function public.reserve_listing_id()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
  rid uuid := gen_random_uuid();
begin
  perform private.hit('reserve_listing_id', 30, interval '1 day');
  insert into public.listing_reservations (id, user_id) values (rid, me.id);
  return rid;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_listing
create or replace function public.create_listing(
  id uuid,
  kind public.listing_kind default 'sale',
  title text default null,
  description text default null,
  category_id smallint default null,
  condition public.item_condition default null,
  price_cents int default 0,
  open_to_offers boolean default true,
  photos jsonb default '[]',
  meet_spot_ids uuid[] default '{}',
  meet_note text default null,
  availability text[] default '{}',
  wanted_max_cents int default null,
  wanted_ref uuid default null,
  food_minutes int default null,
  pickup_by date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  lid uuid := create_listing.id;
  k public.listing_kind := coalesce(create_listing.kind, 'sale');
  t text := btrim(coalesce(create_listing.title, ''));
  d text := nullif(btrim(coalesce(create_listing.description, '')), '');
  note text := nullif(btrim(coalesce(create_listing.meet_note, '')), '');
  price int := coalesce(create_listing.price_cents, 0);
  today date;
  tz text;
  expires timestamptz;
  held boolean;
  existing public.listings;
begin
  -- Idempotent: a retry with the same reserved id returns the first result
  -- without spending the daily limit again (BE-05, T-INT-LIST-04).
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

  -- Fields
  if char_length(t) < 3 or char_length(t) > 80 then
    perform private.raise('INVALID', 'title');
  end if;
  if char_length(coalesce(d, '')) > 1000 then
    perform private.raise('INVALID', 'description');
  end if;
  if char_length(coalesce(note, '')) > 60 then
    perform private.raise('INVALID', 'meet_note');
  end if;
  if k = 'sale' then
    if price < 100 or price > 200000 then
      perform private.raise('INVALID', 'price_cents');
    end if;
    if create_listing.category_id is null then
      perform private.raise('INVALID', 'category_id');
    end if;
  else
    price := 0;
  end if;
  if create_listing.category_id is not null
     and not exists (select 1 from public.categories c where c.id = create_listing.category_id) then
    perform private.raise('INVALID', 'category_id');
  end if;
  if k = 'wanted' and create_listing.wanted_max_cents is not null
     and create_listing.wanted_max_cents not between 0 and 200000 then
    perform private.raise('INVALID', 'wanted_max_cents');
  end if;
  if create_listing.wanted_ref is not null and (k not in ('sale','free') or not exists (
      select 1 from public.listings w
      where w.id = create_listing.wanted_ref and w.kind = 'wanted'
        and w.campus_id = me.campus_id and w.status = 'active')) then
    perform private.raise('INVALID', 'wanted_ref');
  end if;

  -- Expiry: food by minutes, give-aways by the pickup day, others after 60 days.
  select c.timezone into tz from public.campuses c where c.id = me.campus_id;
  today := private.campus_today(me.campus_id);
  if k = 'food' then
    if create_listing.food_minutes is null or create_listing.food_minutes not between 15 and 180 then
      perform private.raise('INVALID', 'food_minutes');
    end if;
    expires := private.now() + make_interval(mins => create_listing.food_minutes);
  elsif create_listing.pickup_by is not null then
    if k <> 'free' or create_listing.pickup_by < today or create_listing.pickup_by > today + 14 then
      perform private.raise('INVALID', 'pickup_by');
    end if;
    expires := ((create_listing.pickup_by + 1)::timestamp at time zone coalesce(tz, 'America/New_York'));
  else
    expires := private.now() + interval '1440 hours';
  end if;

  held := private.listing_text_held(t, d, note);

  -- Limits (API §3): 20/day, 3 in the first 24 h; wanted 5/day; food 3/day.
  perform private.hit('create_listing', 20, interval '1 day');
  if me.created_at > private.now() - interval '24 hours' then
    perform private.hit('create_listing_new', 3, interval '1 day');
  end if;
  if k = 'wanted' then
    perform private.hit('create_wanted', 5, interval '1 day');
  elsif k = 'food' then
    perform private.hit('create_food', 3, interval '1 day');
  end if;

  insert into public.listings (
    id, campus_id, seller_id, kind, status, title, description, category_id, condition,
    price_cents, open_to_offers, meet_spot_ids, meet_note, availability,
    wanted_max_cents, wanted_ref, expires_at)
  values (
    lid, me.campus_id, me.id, k, case when held then 'held_review' else 'active' end::public.listing_status,
    t, d, create_listing.category_id, create_listing.condition,
    price, coalesce(create_listing.open_to_offers, true),
    private.check_meet_spots(me.campus_id, create_listing.meet_spot_ids), note,
    private.check_availability(create_listing.availability),
    case when k = 'wanted' then create_listing.wanted_max_cents end,
    create_listing.wanted_ref, expires);

  perform private.set_listing_photos(lid, me.campus_id, create_listing.photos,
    case when k in ('sale','free') then 1 else 0 end,
    case when k in ('sale','free') then 8 else 1 end);

  update public.listing_reservations set used_at = private.now() where id = lid;
  return private.listing_json(lid);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_listing: null arguments keep the current value.
create or replace function public.update_listing(
  id uuid,
  title text default null,
  description text default null,
  category_id smallint default null,
  condition public.item_condition default null,
  price_cents int default null,
  open_to_offers boolean default null,
  photos jsonb default null,
  meet_spot_ids uuid[] default null,
  meet_note text default null,
  availability text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
  t text;
  d text;
  note text;
  price int;
  held boolean;
begin
  select * into l from public.listings x where x.id = update_listing.id for update;
  if not found or l.seller_id is distinct from me.id then
    perform private.raise('NOT_FOUND');
  end if;
  if l.status in ('sold','deleted','removed') then
    perform private.raise('INVALID', 'status');
  end if;
  perform private.hit('update_listing', 50, interval '1 day');

  t := coalesce(btrim(update_listing.title), l.title);
  d := case when update_listing.description is null then l.description
            else nullif(btrim(update_listing.description), '') end;
  note := case when update_listing.meet_note is null then l.meet_note
               else nullif(btrim(update_listing.meet_note), '') end;
  price := case when l.kind = 'sale' then coalesce(update_listing.price_cents, l.price_cents) else 0 end;

  if char_length(t) < 3 or char_length(t) > 80 then
    perform private.raise('INVALID', 'title');
  end if;
  if char_length(coalesce(d, '')) > 1000 then
    perform private.raise('INVALID', 'description');
  end if;
  if char_length(coalesce(note, '')) > 60 then
    perform private.raise('INVALID', 'meet_note');
  end if;
  if l.kind = 'sale' and (price < 100 or price > 200000) then
    perform private.raise('INVALID', 'price_cents');
  end if;
  if update_listing.category_id is not null
     and not exists (select 1 from public.categories c where c.id = update_listing.category_id) then
    perform private.raise('INVALID', 'category_id');
  end if;

  held := private.listing_text_held(t, d, note);

  if price <> l.price_cents then
    insert into public.listing_price_changes (listing_id, old_cents, new_cents)
    values (l.id, l.price_cents, price);
  end if;

  update public.listings x set
    title = t, description = d, meet_note = note, price_cents = price,
    category_id = coalesce(update_listing.category_id, x.category_id),
    condition = coalesce(update_listing.condition, x.condition),
    open_to_offers = coalesce(update_listing.open_to_offers, x.open_to_offers),
    meet_spot_ids = case when update_listing.meet_spot_ids is null then x.meet_spot_ids
                         else private.check_meet_spots(l.campus_id, update_listing.meet_spot_ids) end,
    availability = case when update_listing.availability is null then x.availability
                        else private.check_availability(update_listing.availability) end,
    status = case when held and x.status = 'active' then 'held_review'::public.listing_status else x.status end
  where x.id = l.id;

  if update_listing.photos is not null then
    perform private.set_listing_photos(l.id, l.campus_id, update_listing.photos,
      case when l.kind in ('sale','free') then 1 else 0 end,
      case when l.kind in ('sale','free') then 8 else 1 end);
  end if;
  return private.listing_json(l.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_listing: soft (rule 6). Open offers are declined and open chats
-- close read-only with a system message (DATA_MODEL §4.1).
create or replace function public.delete_listing(id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
begin
  select * into l from public.listings x where x.id = delete_listing.id for update;
  if not found or l.seller_id is distinct from me.id or l.status = 'deleted' then
    perform private.raise('NOT_FOUND');
  end if;
  if l.status not in ('active','hold','expired','held_review') then
    perform private.raise('INVALID', 'status');
  end if;
  update public.listings x
     set status = 'deleted', deleted_at = private.now(), hold_offer_id = null
   where x.id = l.id;
  perform private.wind_down_listing(l.id, 'The seller removed this listing', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- relist_listing: an expired listing comes back for 60 days; an active one
-- (e.g. after a deal fell through) can be bumped to the top once every 7 days.
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
  if l.bumped_at > private.now() - interval '168 hours' then
    perform private.raise('RATE_LIMITED',
      'relist_listing:' || to_char((l.bumped_at + interval '168 hours') at time zone 'UTC',
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

-- ---------------------------------------------------------------------------
-- mark_sold: the buyer, if given, must have a chat about this listing.
-- Everyone else's chat closes and open offers are declined.
create or replace function public.mark_sold(id uuid, buyer_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
begin
  select * into l from public.listings x where x.id = mark_sold.id for update;
  if not found or l.seller_id is distinct from me.id or l.status = 'deleted' then
    perform private.raise('NOT_FOUND');
  end if;
  if l.status not in ('active','hold') then
    perform private.raise('INVALID', 'status');
  end if;
  if mark_sold.buyer_id is not null and not exists (
      select 1 from public.chats c
      where c.listing_id = l.id and c.buyer_id = mark_sold.buyer_id) then
    perform private.raise('INVALID', 'buyer_id');
  end if;
  update public.listings x
     set status = 'sold', sold_at = private.now(), buyer_id = mark_sold.buyer_id,
         sold_in_app = mark_sold.buyer_id is not null
   where x.id = l.id;
  perform private.wind_down_listing(l.id, 'This item sold to someone else', mark_sold.buyer_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- check_text: inline hints while typing. The server check at save is the rule.
create or replace function public.check_text(text text, scope text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  verdict text;
begin
  perform private.require_active();
  if check_text.scope not in ('listing','offer','profile','rating') then
    perform private.raise('INVALID', 'scope');
  end if;
  if char_length(coalesce(check_text.text, '')) > 2000 then
    perform private.raise('INVALID', 'text');
  end if;
  perform private.hit('check_text', 600, interval '1 hour');
  verdict := private.check_text(check_text.text, check_text.scope);
  return jsonb_build_object(
    'result', split_part(verdict, ':', 1),
    'term', nullif(substr(verdict, position(':' in verdict) + 1), verdict));
end;
$$;

-- ---------------------------------------------------------------------------
-- price_hint: what similar things sold for on the caller's campus (n >= 5).
create or replace function public.price_hint(category_id smallint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
begin
  return (select jsonb_build_object('p25', h.p25, 'p50', h.p50, 'p75', h.p75)
          from public.price_hints h
          where h.campus_id = me.campus_id and h.category_id = price_hint.category_id and h.n >= 5);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
revoke all on function private.listing_json(uuid) from public, anon, authenticated;
revoke all on function private.listing_text_held(text, text, text) from public, anon, authenticated;
revoke all on function private.set_listing_photos(uuid, uuid, jsonb, int, int) from public, anon, authenticated;
revoke all on function private.check_meet_spots(uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.check_availability(text[]) from public, anon, authenticated;
revoke all on function private.wind_down_listing(uuid, text, uuid) from public, anon, authenticated;

revoke all on function public.reserve_listing_id() from public, anon;
revoke all on function public.create_listing(uuid, public.listing_kind, text, text, smallint, public.item_condition, int, boolean, jsonb, uuid[], text, text[], int, uuid, int, date) from public, anon;
revoke all on function public.update_listing(uuid, text, text, smallint, public.item_condition, int, boolean, jsonb, uuid[], text, text[]) from public, anon;
revoke all on function public.delete_listing(uuid) from public, anon;
revoke all on function public.relist_listing(uuid, int) from public, anon;
revoke all on function public.mark_sold(uuid, uuid) from public, anon;
revoke all on function public.check_text(text, text) from public, anon;
revoke all on function public.price_hint(smallint) from public, anon;

grant execute on function public.reserve_listing_id() to authenticated;
grant execute on function public.create_listing(uuid, public.listing_kind, text, text, smallint, public.item_condition, int, boolean, jsonb, uuid[], text, text[], int, uuid, int, date) to authenticated;
grant execute on function public.update_listing(uuid, text, text, smallint, public.item_condition, int, boolean, jsonb, uuid[], text, text[]) to authenticated;
grant execute on function public.delete_listing(uuid) to authenticated;
grant execute on function public.relist_listing(uuid, int) to authenticated;
grant execute on function public.mark_sold(uuid, uuid) to authenticated;
grant execute on function public.check_text(text, text) to authenticated;
grant execute on function public.price_hint(smallint) to authenticated;
