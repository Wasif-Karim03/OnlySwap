-- DEC 133 moving out mode (UX pack). A seller sets "Moving out by"
-- (profiles.moving_out_by, campus today to +60 days). While it is set, buyers
-- can make one offer for several of that seller's items: make_bundle_offer
-- (a new RPC, so make_offer's signature stays as it is for the contract)
-- stores the other listing ids on the offer. Accepting holds every item; a
-- trigger carries the main listing's sold / back-to-active onto the bundle,
-- so confirm_deal, mark_sold, the handoff code and fell through all apply.

alter table public.profiles add column moving_out_by date;
alter table public.offers add column bundle_ids uuid[] not null default '{}'
  check (cardinality(bundle_ids) <= 10);

-- The date while it is still ahead (today counts), else null.
create or replace function private.moving_out_by(p_uid uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select p.moving_out_by from public.profiles p
  where p.id = p_uid and p.moving_out_by >= private.campus_today(p.campus_id)
$$;

create or replace function public.set_moving_out(by date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  today date := private.campus_today(me.campus_id);
begin
  if set_moving_out.by is not null and (set_moving_out.by < today or set_moving_out.by > today + 60) then
    perform private.raise('INVALID', 'by');
  end if;
  update public.profiles p set moving_out_by = set_moving_out.by where p.id = me.id;
  return jsonb_build_object('moving_out_by', set_moving_out.by);
end;
$$;

-- The other items of a bundle offer: id, title, price, thumb, status.
create or replace function private.bundle_json(p_offer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'title', l.title, 'price_cents', l.price_cents, 'kind', l.kind, 'status', l.status,
           'thumb_path', (select ph.thumb_path from public.listing_photos ph where ph.listing_id = l.id order by ph.idx limit 1))
         order by l.title), '[]'::jsonb)
  from public.offers o
  join public.listings l on l.id = any(o.bundle_ids)
  where o.id = p_offer
$$;

-- One offer for the main listing plus up to 10 more of the same seller's
-- active sale/free items, while the seller is moving out. The amount is for
-- everything: 0 when every item is free, else $1 to $2,000 (no firm-price
-- rule: a bundle price is a deal). The usual offer checks run through
-- make_offer's rules (pause, rate limit, block, campus).
create or replace function public.make_bundle_offer(listing_id uuid, bundle_ids uuid[], amount_cents int,
                                                    note text default null, quick_notes text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  me public.profiles;
  c public.campuses;
  l public.listings;
  o public.offers;
  ids uuid[] := coalesce(make_bundle_offer.bundle_ids, '{}');
  qn text[] := coalesce(make_bundle_offer.quick_notes, '{}');
  all_free bool;
begin
  if exists (select 1 from public.profiles p where p.id = uid and p.status = 'paused') then
    perform private.raise('OFFERS_PAUSED');
  end if;
  me := private.require_active();
  select * into c from public.campuses where id = me.campus_id;
  perform private.hit('make_offer', coalesce(c.offers_per_hour, 10), interval '1 hour');

  select * into l from public.listings x where x.id = make_bundle_offer.listing_id for no key update;
  if not found or l.campus_id <> me.campus_id or l.status = 'deleted' or private.is_blocked(me.id, l.seller_id) then
    perform private.raise('NOT_FOUND');
  end if;
  if l.seller_id = me.id then
    perform private.raise('FORBIDDEN');
  end if;
  if private.moving_out_by(l.seller_id) is null
     or cardinality(ids) < 1 or cardinality(ids) > 10
     or (select count(distinct x) from unnest(ids) x) <> cardinality(ids)
     or l.id = any(ids) then
    perform private.raise('INVALID', 'bundle_ids');
  end if;
  if l.status <> 'active' or l.kind not in ('sale', 'free')
     or (l.expires_at is not null and l.expires_at <= private.now())
     or (select count(*) from public.listings x
         where x.id = any(ids) and x.seller_id = l.seller_id and x.status = 'active'
           and x.kind in ('sale', 'free') and (x.expires_at is null or x.expires_at > private.now())) <> cardinality(ids) then
    perform private.raise('LISTING_UNAVAILABLE');
  end if;
  all_free := l.kind = 'free' and not exists (select 1 from public.listings x where x.id = any(ids) and x.kind <> 'free');
  if all_free and make_bundle_offer.amount_cents <> 0 then
    perform private.raise('INVALID', 'amount_cents');
  elsif not all_free and (make_bundle_offer.amount_cents is null
        or make_bundle_offer.amount_cents < 100 or make_bundle_offer.amount_cents > 200000) then
    perform private.raise('INVALID', 'amount_cents');
  end if;
  perform private.check_offer_note(make_bundle_offer.note);
  if cardinality(qn) > 5 or exists (select 1 from unnest(qn) q where char_length(q) > 40) then
    perform private.raise('INVALID', 'quick_notes');
  end if;

  select * into o from public.offers x
  where x.listing_id = l.id and x.buyer_id = me.id and x.status in ('pending', 'countered')
  for update;
  if found then
    -- A new bundle replaces the open offer on the main item.
    update public.offers x
       set amount_cents = make_bundle_offer.amount_cents, bundle_ids = ids,
           note = nullif(btrim(make_bundle_offer.note), ''), quick_notes = qn,
           status = 'pending', last_actor = 'buyer', expires_at = private.now() + interval '48 hours'
     where x.id = o.id returning * into o;
  else
    insert into public.offers (listing_id, buyer_id, seller_id, amount_cents, bundle_ids, note, quick_notes, expires_at, created_at)
    values (l.id, me.id, l.seller_id, make_bundle_offer.amount_cents, ids, nullif(btrim(make_bundle_offer.note), ''), qn,
            private.now() + interval '48 hours', private.now())
    returning * into o;
    update public.listings x set offer_count = offer_count + 1 where x.id = l.id;
  end if;

  perform private.queue_notification(
    l.seller_id, 'offer_new', 'offers', 'New bundle offer',
    me.display_name || ' offered ' || private.money(o.amount_cents) || ' for your ' || l.title
      || ' and ' || cardinality(ids) || ' more',
    jsonb_build_object('offer_id', o.id, 'listing_id', l.id), true,
    'offer_new:' || o.id || ':' || o.round || ':' || o.amount_cents);
  return private.offer_json(o.id, me.id);
end;
$$;

create or replace function private.offer_json(p_offer uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'listing_id', o.listing_id, 'amount_cents', o.amount_cents, 'note', o.note,
    'quick_notes', to_jsonb(o.quick_notes), 'status', o.status, 'round', o.round,
    'last_actor', o.last_actor, 'decline_reason', o.decline_reason, 'expires_at', o.expires_at,
    'responded_at', o.responded_at, 'created_at', o.created_at,
    'role', private.offer_role(o, p_viewer),
    'chat_id', (select c.id from public.chats c where c.offer_id = o.id),
    'bundle', private.bundle_json(o.id),
    'listing', case when l.id is null then null else jsonb_build_object(
      'id', l.id, 'title', l.title, 'price_cents', l.price_cents, 'kind', l.kind, 'status', l.status,
      'thumb_path', (select ph.thumb_path from public.listing_photos ph where ph.listing_id = l.id order by ph.idx limit 1)) end,
    'other', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path)
              from public.profiles p
              where p.id = case when o.buyer_id = p_viewer then o.seller_id else o.buyer_id end))
  from public.offers o
  left join public.listings l on l.id = o.listing_id
  where o.id = p_offer
$$;

create or replace function public.accept_offer(offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  o public.offers := private.find_offer(accept_offer.offer_id, me.id);
  role text := private.offer_role(o, me.id);
  l public.listings;
  chat uuid;
  other record;
  b public.listings;
  n int := 0;
begin
  if o.status not in ('pending', 'countered') then
    perform private.raise('OFFER_NOT_PENDING');
  end if;
  -- The party who didn't act last accepts (a fresh offer: the seller).
  if role = o.last_actor then
    perform private.raise('FORBIDDEN');
  end if;
  -- FOR UPDATE on the listing: of two accepts on one listing exactly one wins (T-INT-OFF-RACE).
  select * into l from public.listings x where x.id = o.listing_id for update;
  if not found or l.status <> 'active' then
    perform private.raise('LISTING_UNAVAILABLE');
  end if;
  if private.is_blocked(o.buyer_id, o.seller_id) then
    perform private.raise('FORBIDDEN');
  end if;
  -- Lock the offer only after the listing (listing, then offers: the same order
  -- as the auto-decline below, so two accepts can't deadlock). Re-read it too:
  -- another session may have auto-declined it.
  select * into o from public.offers x where x.id = o.id for update;
  if o.status not in ('pending', 'countered') then
    perform private.raise('OFFER_NOT_PENDING');
  end if;

  update public.offers x set status = 'accepted', responded_at = private.now() where x.id = o.id;
  update public.listings x set status = 'hold', hold_offer_id = o.id where x.id = l.id;
  -- DEC 133: a bundle holds every item, or the accept fails as a whole.
  for b in
    select x.* from public.listings x where x.id = any(o.bundle_ids) order by x.id for update
  loop
    if b.status <> 'active' or b.seller_id is distinct from l.seller_id then
      perform private.raise('LISTING_UNAVAILABLE');
    end if;
    update public.listings x set status = 'hold', hold_offer_id = o.id where x.id = b.id;
    n := n + 1;
  end loop;
  if n <> cardinality(o.bundle_ids) then
    perform private.raise('LISTING_UNAVAILABLE');
  end if;

  insert into public.chats (listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents,
                            listing_thumb_path, agreed_cents, last_message_at, created_at)
  values (l.id, o.id, o.buyer_id, o.seller_id,
          case when n > 0 then left(l.title, 60) || ' + ' || n || ' more' else l.title end, l.price_cents,
          (select ph.thumb_path from public.listing_photos ph where ph.listing_id = l.id order by ph.idx limit 1),
          o.amount_cents, private.now(), private.now())
  returning id into chat;
  insert into public.messages (chat_id, sender_id, kind, body, meta, created_at)
  values (chat, null, 'system',
          case when n > 0 then 'Bundle accepted at ' || private.money(o.amount_cents) || ': '
                 || (select string_agg(x.title, ', ' order by x.title) from public.listings x
                     where x.id = l.id or x.id = any(o.bundle_ids)) || '. Plan the pickup.'
               when l.kind = 'free' then 'Request accepted. Plan the pickup.'
               else 'Offer accepted at ' || private.money(o.amount_cents) || '. Plan the pickup.' end,
          jsonb_build_object('event', 'offer_accepted', 'amount_cents', o.amount_cents), private.now());

  -- Everyone else's open offer on this listing is auto-declined and told.
  for other in
    update public.offers x set status = 'auto_declined', responded_at = private.now()
     where (x.listing_id = l.id or x.listing_id = any(o.bundle_ids)) and x.id <> o.id
       and x.status in ('pending', 'countered')
    returning x.id, x.buyer_id
  loop
    perform private.queue_notification(other.buyer_id, 'offer_declined', 'offers', 'Offer declined',
      'Your offer on the ' || l.title || ' wasn''t accepted',
      jsonb_build_object('offer_id', other.id, 'listing_id', l.id), false, 'offer_declined:' || other.id);
  end loop;

  perform private.queue_notification(
    case when role = 'seller' then o.buyer_id else o.seller_id end, 'offer_accepted', 'offers', 'Offer accepted',
    me.display_name || ' accepted your offer. Say hi and plan the pickup.',
    jsonb_build_object('offer_id', o.id, 'chat_id', chat), true, 'offer_accepted:' || o.id);
  return jsonb_build_object('chat_id', chat);
end;
$$;

-- The main listing of an accepted bundle leaves hold: sold carries the
-- bundle with it (same buyer), back to active frees the bundle too.
create or replace function private.listings_bundle_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  b uuid;
begin
  select o.bundle_ids into ids from public.offers o
  where o.id = old.hold_offer_id and o.listing_id = new.id and cardinality(o.bundle_ids) > 0;
  if ids is null then
    return null;
  end if;
  if new.status = 'sold' then
    for b in
      update public.listings x
         set status = 'sold', sold_at = new.sold_at, buyer_id = new.buyer_id, sold_in_app = new.sold_in_app
       where x.id = any(ids) and x.hold_offer_id = old.hold_offer_id and x.status = 'hold'
      returning x.id
    loop
      perform private.wind_down_listing(b, 'This item sold to someone else', new.buyer_id);
    end loop;
  elsif new.status = 'active' then
    update public.listings x set status = 'active', hold_offer_id = null
     where x.id = any(ids) and x.hold_offer_id = old.hold_offer_id and x.status = 'hold';
  end if;
  return null;
end;
$$;
create trigger trg_listings_bundle_follow after update of status on public.listings
  for each row when (old.status = 'hold' and new.status in ('sold', 'active') and old.hold_offer_id is not null)
  execute function private.listings_bundle_follow();

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
      'away', p.away_since is not null,
      'moving_out_by', private.moving_out_by(p.id)),
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
    'moving_out_by', private.moving_out_by(me.id),
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
    'moving_out_by', private.moving_out_by(p.id),
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

create or replace function public.get_chat(chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(get_chat.chat_id, me.id);
  other uuid := case when c.buyer_id = me.id then c.seller_id else c.buyer_id end;
begin
  return private.chat_summary(c.id, me.id) || jsonb_build_object(
    'blocked', c.status = 'blocked' or private.is_blocked(me.id, other),
    'i_blocked', exists (select 1 from public.blocks b where b.blocker_id = me.id and b.blocked_id = other),
    'other_deleted', other is null,
    'listing_status', (select l.status from public.listings l where l.id = c.listing_id),
    'buyer_outcome', c.buyer_outcome, 'seller_outcome', c.seller_outcome,
    'bundle', private.bundle_json(c.offer_id),
    'my_first_message', not exists (select 1 from public.messages m where m.chat_id = c.id and m.sender_id = me.id));
end;
$$;

revoke all on function private.moving_out_by(uuid) from public, anon, authenticated;
revoke all on function private.bundle_json(uuid) from public, anon, authenticated;
revoke all on function private.listings_bundle_follow() from public, anon, authenticated;
revoke all on function public.set_moving_out(date) from public, anon;
revoke all on function public.make_bundle_offer(uuid, uuid[], int, text, text[]) from public, anon;
grant execute on function public.set_moving_out(date) to authenticated;
grant execute on function public.make_bundle_offer(uuid, uuid[], int, text, text[]) to authenticated;
