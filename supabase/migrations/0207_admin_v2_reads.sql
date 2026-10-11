-- 0207_admin_v2_reads.sql · Admin v2, part 2: what the redesigned console
-- reads (ADMIN_CHECKLIST §3, §4; approved mock design/admin-redesign-mock.html;
-- DEC 93). Every function: require_admin (AAL2), moderators scoped to their
-- campus (DEC 69), never a chat message's text, never a Quad author.
--
-- Access log (DEC 93): every read that shows one named student writes an
-- audit_log row, action 'person.view', target ('user', id), reason 'view',
-- meta {tab}. admin_person always writes one; the tab reads (timeline,
-- offers, listings, chats, meetups, reports, and the activity feed filtered to
-- one person) write one unless the same admin already has a 'person.view' row
-- for that person in the last 30 minutes. admin_listing_activity writes
-- 'listing.activity_view' (it names everyone who swiped). Lists, overview and
-- search don't log.
--
-- Deals: a deal is a listing sold in the app (status sold, sold_in_app, a
-- buyer, sold_at), the same rule the metrics use; its price is the chat's
-- agreed_cents.
--
-- New RPCs: admin_overview_v2, admin_activity_feed, admin_person,
-- admin_person_timeline, admin_person_offers, admin_person_listings,
-- admin_person_chats, admin_person_meetups, admin_person_reports,
-- admin_person_access_log, admin_listing_activity, admin_list_users_v2,
-- admin_list_audit_v2, admin_search. Shapes in API.md §4.1.

-- ---------------------------------------------------------------------------
-- Helpers
create or replace function private.mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    else left(p_email, 1) || '••••@' || split_part(p_email, '@', 2)
  end
$$;

-- Full address for the owner, masked for moderators (DEC 69(c), DEC 93).
create or replace function private.admin_email(a public.admins, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when a.role = 'owner' then u.email::text else private.mask_email(u.email::text) end
  from auth.users u where u.id = p_user
$$;

create or replace function private.person_brief(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'initial', upper(left(coalesce(p.first_name, '?'), 1)))
  from public.profiles p where p.id = p_user
$$;

create or replace function private.listing_brief(p_listing uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', l.id, 'title', l.title, 'price_cents', l.price_cents, 'status', l.status,
    'photo', (select ph.thumb_path from public.listing_photos ph where ph.listing_id = l.id order by ph.idx limit 1))
  from public.listings l where l.id = p_listing
$$;

create or replace function private.campus_brief(p_campus uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'short_name', c.short_name, 'slug', c.slug, 'status', c.status)
  from public.campuses c where c.id = p_campus
$$;

-- Support requests have no campus; the sender's email domain decides it.
create or replace function private.support_campus(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.campus_id from public.campus_domains d
  where d.domain = lower(split_part(coalesce(p_email, ''), '@', 2)) and d.kind = 'student'
$$;

-- The person a read is about, with the campus check (NOT_FOUND / NOT_ADMIN).
create or replace function private.admin_for_person(p_user uuid)
returns public.admins
language plpgsql
security definer
set search_path = ''
as $$
declare
  campus uuid;
  a public.admins;
begin
  a := private.require_admin('moderator');
  select p.campus_id into campus from public.profiles p where p.id = p_user;
  if campus is null then
    perform private.raise('NOT_FOUND');
  end if;
  return private.require_admin('moderator', campus);
end;
$$;

-- One 'person.view' row per look (see header).
create or replace function private.log_person_view(a public.admins, p_user uuid, p_tab text, p_always boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_always or not exists (
      select 1 from public.audit_log x
      where x.actor_id = a.user_id and x.action = 'person.view' and x.target_type = 'user'
        and x.target_id = p_user::text and x.created_at > private.now() - interval '30 minutes') then
    perform private.audit(a.user_id, 'person.view', 'user', p_user::text,
      (select p.campus_id from public.profiles p where p.id = p_user), 'view', jsonb_build_object('tab', p_tab));
  end if;
end;
$$;

-- Deals (see header).
create or replace function private.admin_deals(p_campus uuid, p_since timestamptz)
returns table (listing_id uuid, campus_id uuid, seller_id uuid, buyer_id uuid, sold_at timestamptz,
               agreed_cents int, asking_cents int, chat_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.campus_id, l.seller_id, l.buyer_id, l.sold_at,
         coalesce(ch.agreed_cents, l.price_cents), l.price_cents, ch.id
  from public.listings l
  left join lateral (
    select c.id, c.agreed_cents from public.chats c
    where c.listing_id = l.id and c.buyer_id = l.buyer_id order by c.created_at desc limit 1) ch on true
  where l.status = 'sold' and l.sold_in_app and l.buyer_id is not null and l.sold_at is not null
    and (p_campus is null or l.campus_id = p_campus)
    and (p_since is null or l.sold_at >= p_since)
$$;

-- ---------------------------------------------------------------------------
-- The unified event stream (admin_activity_feed, admin_person_timeline).
-- Kinds: signup, listing_posted, swiped_left, saved, unsaved, offer_made,
-- offer_countered, offer_accepted, offer_declined, chat_opened, message_sent,
-- meetup_set, meetup_confirmed, meetup_checked_in, meetup_no_show, deal_done,
-- listing_viewed, searched, opened_from, app_open, deck_shown. No kinds =
-- everything except deck_shown. p_user matches the person who acted or the
-- other side. Offers keep one row per offer, so a counter shows the latest
-- amount. Message events carry no text.
create or replace function private.admin_events(
  p_campus uuid, p_kinds text[], p_user uuid, p_listing uuid,
  p_since timestamptz, p_until timestamptz, p_cur_at timestamptz, p_cur_id text, p_limit int)
returns table (id text, kind text, at timestamptz, person_id uuid, other_id uuid, listing_id uuid,
               campus_id uuid, details jsonb, platform text)
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select coalesce(p_since, '-infinity'::timestamptz) as lo,
           least(coalesce(p_until, 'infinity'::timestamptz), coalesce(p_cur_at + interval '1 microsecond', 'infinity'::timestamptz)) as hi
  ),
  ev as (
    -- sign-ups
    select 'signup:' || p.id as id, 'signup' as kind, p.created_at as at, p.id as person_id, null::uuid as other_id,
           null::uuid as listing_id, p.campus_id, jsonb_build_object('year', p.year) as details, null::text as platform
    from public.profiles p, w
    where (p_kinds is null or 'signup' = any (p_kinds)) and p_listing is null
      and (p_campus is null or p.campus_id = p_campus) and (p_user is null or p.id = p_user)
      and p.created_at >= w.lo and p.created_at < w.hi
    union all
    -- listings posted
    select 'listing_posted:' || l.id, 'listing_posted', l.created_at, l.seller_id, null, l.id, l.campus_id,
           jsonb_build_object('price_cents', l.price_cents, 'kind', l.kind, 'status', l.status), null
    from public.listings l, w
    where (p_kinds is null or 'listing_posted' = any (p_kinds)) and l.seller_id is not null
      and (p_campus is null or l.campus_id = p_campus) and (p_user is null or l.seller_id = p_user)
      and (p_listing is null or l.id = p_listing)
      and l.created_at >= w.lo and l.created_at < w.hi
    union all
    -- left swipes (kept 30 days; "Not interested" hides are not events)
    select 'swiped_left:' || s.user_id || ':' || s.listing_id, 'swiped_left', s.created_at, s.user_id, l.seller_id, l.id,
           l.campus_id, '{}'::jsonb, null
    from public.swipes s join public.listings l on l.id = s.listing_id, w
    where (p_kinds is null or 'swiped_left' = any (p_kinds)) and s.dir = 'left' and s.created_at <> 'infinity'
      and (p_campus is null or l.campus_id = p_campus) and (p_user is null or s.user_id = p_user or l.seller_id = p_user)
      and (p_listing is null or l.id = p_listing)
      and s.created_at >= w.lo and s.created_at < w.hi
    union all
    -- saves
    select 'saved:' || s.user_id || ':' || s.listing_id, 'saved', s.created_at, s.user_id, l.seller_id, l.id, l.campus_id,
           jsonb_build_object('price_at_save', s.price_at_save), null
    from public.saves s join public.listings l on l.id = s.listing_id, w
    where (p_kinds is null or 'saved' = any (p_kinds))
      and (p_campus is null or l.campus_id = p_campus) and (p_user is null or s.user_id = p_user or l.seller_id = p_user)
      and (p_listing is null or l.id = p_listing)
      and s.created_at >= w.lo and s.created_at < w.hi
    union all
    -- offers made
    select 'offer_made:' || o.id, 'offer_made', o.created_at, o.buyer_id, o.seller_id, o.listing_id,
           coalesce(l.campus_id, bp.campus_id),
           jsonb_build_object('offer_id', o.id, 'amount_cents', o.amount_cents, 'asking_cents', l.price_cents,
                              'round', o.round, 'status', o.status), null
    from public.offers o left join public.listings l on l.id = o.listing_id
    left join public.profiles bp on bp.id = o.buyer_id, w
    where (p_kinds is null or 'offer_made' = any (p_kinds))
      and (p_campus is null or coalesce(l.campus_id, bp.campus_id) = p_campus)
      and (p_user is null or o.buyer_id = p_user or o.seller_id = p_user)
      and (p_listing is null or o.listing_id = p_listing)
      and o.created_at >= w.lo and o.created_at < w.hi
    union all
    -- offer answers (latest state of each offer)
    select 'offer_' || o.status || ':' || o.id, 'offer_' || o.status::text, o.responded_at,
           case when (o.status = 'countered') = (o.last_actor = 'seller') then o.seller_id else o.buyer_id end,
           case when (o.status = 'countered') = (o.last_actor = 'seller') then o.buyer_id else o.seller_id end,
           o.listing_id, coalesce(l.campus_id, bp.campus_id),
           jsonb_build_object('offer_id', o.id, 'amount_cents', o.amount_cents, 'asking_cents', l.price_cents, 'round', o.round),
           null
    from public.offers o left join public.listings l on l.id = o.listing_id
    left join public.profiles bp on bp.id = o.buyer_id, w
    where o.status in ('accepted', 'declined', 'countered') and o.responded_at is not null
      and (p_kinds is null or ('offer_' || o.status::text) = any (p_kinds))
      and (p_campus is null or coalesce(l.campus_id, bp.campus_id) = p_campus)
      and (p_user is null or o.buyer_id = p_user or o.seller_id = p_user)
      and (p_listing is null or o.listing_id = p_listing)
      and o.responded_at >= w.lo and o.responded_at < w.hi
    union all
    -- chats opened
    select 'chat_opened:' || c.id, 'chat_opened', c.created_at, c.buyer_id, c.seller_id, c.listing_id,
           coalesce(l.campus_id, sp.campus_id), jsonb_build_object('chat_id', c.id, 'agreed_cents', c.agreed_cents), null
    from public.chats c left join public.listings l on l.id = c.listing_id
    left join public.profiles sp on sp.id = c.seller_id, w
    where (p_kinds is null or 'chat_opened' = any (p_kinds))
      and (p_campus is null or coalesce(l.campus_id, sp.campus_id) = p_campus)
      and (p_user is null or c.buyer_id = p_user or c.seller_id = p_user)
      and (p_listing is null or c.listing_id = p_listing)
      and c.created_at >= w.lo and c.created_at < w.hi
    union all
    -- messages sent: metadata only, never the text
    select 'message_sent:' || m.id, 'message_sent', m.created_at, m.sender_id,
           case when m.sender_id = c.buyer_id then c.seller_id else c.buyer_id end, c.listing_id,
           coalesce(l.campus_id, sp.campus_id), jsonb_build_object('chat_id', c.id, 'message_kind', m.kind), null
    from public.messages m join public.chats c on c.id = m.chat_id
    left join public.listings l on l.id = c.listing_id
    left join public.profiles sp on sp.id = c.seller_id, w
    where (p_kinds is null or 'message_sent' = any (p_kinds)) and m.sender_id is not null and m.kind <> 'system'
      and (p_campus is null or coalesce(l.campus_id, sp.campus_id) = p_campus)
      and (p_user is null or m.sender_id = p_user or c.buyer_id = p_user or c.seller_id = p_user)
      and (p_listing is null or c.listing_id = p_listing)
      and m.created_at >= w.lo and m.created_at < w.hi
    union all
    -- meetups set
    select 'meetup_set:' || mt.id, 'meetup_set', mt.created_at, coalesce(mt.proposed_by, c.buyer_id),
           case when mt.proposed_by = c.seller_id then c.buyer_id else c.seller_id end, c.listing_id,
           coalesce(l.campus_id, sp.campus_id),
           jsonb_build_object('meetup_id', mt.id, 'starts_at', mt.starts_at, 'status', mt.status,
                              'place', coalesce(ss.name, mt.custom_place)), null
    from public.meetups mt join public.chats c on c.id = mt.chat_id
    left join public.safe_spots ss on ss.id = mt.spot_id
    left join public.listings l on l.id = c.listing_id
    left join public.profiles sp on sp.id = c.seller_id, w
    where (p_kinds is null or 'meetup_set' = any (p_kinds))
      and (p_campus is null or coalesce(l.campus_id, sp.campus_id) = p_campus)
      and (p_user is null or c.buyer_id = p_user or c.seller_id = p_user)
      and (p_listing is null or c.listing_id = p_listing)
      and mt.created_at >= w.lo and mt.created_at < w.hi
    union all
    -- meetups confirmed (by the side that didn't propose)
    select 'meetup_confirmed:' || mt.id, 'meetup_confirmed', mt.confirmed_at,
           case when mt.proposed_by = c.seller_id then c.buyer_id else c.seller_id end,
           coalesce(mt.proposed_by, c.buyer_id), c.listing_id, coalesce(l.campus_id, sp.campus_id),
           jsonb_build_object('meetup_id', mt.id, 'starts_at', mt.starts_at, 'place', coalesce(ss.name, mt.custom_place)), null
    from public.meetups mt join public.chats c on c.id = mt.chat_id
    left join public.safe_spots ss on ss.id = mt.spot_id
    left join public.listings l on l.id = c.listing_id
    left join public.profiles sp on sp.id = c.seller_id, w
    where (p_kinds is null or 'meetup_confirmed' = any (p_kinds)) and mt.confirmed_at is not null
      and (p_campus is null or coalesce(l.campus_id, sp.campus_id) = p_campus)
      and (p_user is null or c.buyer_id = p_user or c.seller_id = p_user)
      and (p_listing is null or c.listing_id = p_listing)
      and mt.confirmed_at >= w.lo and mt.confirmed_at < w.hi
    union all
    -- check-ins ("I'm here"), one per side
    select 'meetup_checked_in:' || mt.id || ':' || x.who, 'meetup_checked_in', x.at, x.uid,
           case when x.uid = c.buyer_id then c.seller_id else c.buyer_id end, c.listing_id,
           coalesce(l.campus_id, sp.campus_id),
           jsonb_build_object('meetup_id', mt.id, 'starts_at', mt.starts_at, 'place', coalesce(ss.name, mt.custom_place)), null
    from public.meetups mt join public.chats c on c.id = mt.chat_id
    cross join lateral (values ('buyer', c.buyer_id, mt.buyer_here_at), ('seller', c.seller_id, mt.seller_here_at)) as x(who, uid, at)
    left join public.safe_spots ss on ss.id = mt.spot_id
    left join public.listings l on l.id = c.listing_id
    left join public.profiles sp on sp.id = c.seller_id, w
    where (p_kinds is null or 'meetup_checked_in' = any (p_kinds)) and x.at is not null
      and (p_campus is null or coalesce(l.campus_id, sp.campus_id) = p_campus)
      and (p_user is null or c.buyer_id = p_user or c.seller_id = p_user)
      and (p_listing is null or c.listing_id = p_listing)
      and x.at >= w.lo and x.at < w.hi
    union all
    -- no-show reports
    select 'meetup_no_show:' || n.id, 'meetup_no_show', n.created_at, n.reporter_id, n.reported_id, c.listing_id,
           coalesce(l.campus_id, sp.campus_id), jsonb_build_object('meetup_id', mt.id, 'status', n.status), null
    from public.noshow_reports n join public.meetups mt on mt.id = n.meetup_id
    join public.chats c on c.id = mt.chat_id
    left join public.listings l on l.id = c.listing_id
    left join public.profiles sp on sp.id = c.seller_id, w
    where (p_kinds is null or 'meetup_no_show' = any (p_kinds))
      and (p_campus is null or coalesce(l.campus_id, sp.campus_id) = p_campus)
      and (p_user is null or n.reporter_id = p_user or n.reported_id = p_user)
      and (p_listing is null or c.listing_id = p_listing)
      and n.created_at >= w.lo and n.created_at < w.hi
    union all
    -- deals done
    select 'deal_done:' || d.listing_id, 'deal_done', d.sold_at, d.seller_id, d.buyer_id, d.listing_id, d.campus_id,
           jsonb_build_object('agreed_cents', d.agreed_cents, 'asking_cents', d.asking_cents, 'chat_id', d.chat_id), null
    from private.admin_deals(p_campus, p_since) d, w
    where (p_kinds is null or 'deal_done' = any (p_kinds))
      and (p_user is null or d.seller_id = p_user or d.buyer_id = p_user)
      and (p_listing is null or d.listing_id = p_listing)
      and d.sold_at >= w.lo and d.sold_at < w.hi
    union all
    -- browsing events from the app (activity_events)
    select 'event:' || e.id, e.kind, e.created_at, e.user_id, null, e.listing_id, e.campus_id,
           jsonb_strip_nulls(jsonb_build_object('source', e.source, 'dwell_ms', e.dwell_ms, 'query', e.query,
                                                'app_version', e.app_version)), e.platform
    from public.activity_events e, w
    where e.kind in ('app_open', 'deck_shown', 'listing_viewed', 'searched', 'opened_from', 'unsaved')
      and ((p_kinds is null and e.kind <> 'deck_shown') or e.kind = any (p_kinds))
      and (p_campus is null or e.campus_id = p_campus) and (p_user is null or e.user_id = p_user)
      and (p_listing is null or e.listing_id = p_listing)
      and e.created_at >= w.lo and e.created_at < w.hi
  )
  select ev.id, ev.kind, ev.at, ev.person_id, ev.other_id, ev.listing_id, ev.campus_id, ev.details, ev.platform
  from ev
  where p_cur_at is null or (ev.at, ev.id) < (p_cur_at, coalesce(p_cur_id, ''))
  order by ev.at desc, ev.id desc
  limit greatest(least(coalesce(p_limit, 50), 200), 1)
$$;

-- Items as the console shows them, plus the keyset cursor {at, id}.
create or replace function private.admin_events_page(
  p_campus uuid, p_kinds text[], p_user uuid, p_listing uuid,
  p_since timestamptz, p_until timestamptz, p_cursor jsonb, p_limit int)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lim int := greatest(least(coalesce(p_limit, 50), 200), 1);
  cur_at timestamptz;
  cur_id text;
  items jsonb;
  last jsonb;
begin
  begin
    cur_at := nullif(p_cursor ->> 'at', '')::timestamptz;
    cur_id := p_cursor ->> 'id';
  exception when others then
    perform private.raise('INVALID', 'cursor');
  end;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'kind', e.kind, 'at', e.at,
           'person', private.person_brief(e.person_id), 'other', private.person_brief(e.other_id),
           'listing', private.listing_brief(e.listing_id), 'campus_id', e.campus_id,
           'details', e.details, 'platform', e.platform) order by e.at desc, e.id desc), '[]'::jsonb)
    into items
  from private.admin_events(p_campus, p_kinds, p_user, p_listing, p_since, p_until, cur_at, cur_id, lim) e;
  last := items -> -1;
  return jsonb_build_object('items', items,
    'next_cursor', case when jsonb_array_length(items) = lim then jsonb_build_object('at', last -> 'at', 'id', last -> 'id') end);
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_overview_v2: the Overview page. Days are the campus's local days (the
-- selected campus, else America/New_York). Series are 14 days, oldest first.
create or replace function public.admin_overview_v2(campus_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_overview_v2.campus_id);
  c uuid := private.admin_campus(a, admin_overview_v2.campus_id);
  tz text := coalesce((select x.timezone from public.campuses x where x.id = c), 'America/New_York');
  now_at timestamptz := private.now();
  today date := (now_at at time zone tz)::date;
  day0 timestamptz := (today::timestamp at time zone tz);
  days date[] := array(select generate_series(today - 13, today, interval '1 day')::date);
  wk timestamptz := now_at - interval '7 days';
  kpis jsonb;
  attention jsonb;
  campuses jsonb;
begin
  kpis := jsonb_build_object(
    'students', jsonb_build_object(
      'value', (select count(*)::int from public.profiles p where (c is null or p.campus_id = c) and p.status <> 'banned'),
      'new_7d', (select count(*)::int from public.profiles p where (c is null or p.campus_id = c) and p.created_at >= wk),
      'series', (select jsonb_agg((select count(*) from public.profiles p
                                   where (c is null or p.campus_id = c) and (p.created_at at time zone tz)::date = d) order by d)
                 from unnest(days) d)),
    'active_today', jsonb_build_object(
      'value', (select count(*)::int from public.activity_days ad join public.profiles p on p.id = ad.user_id
                where (c is null or p.campus_id = c) and ad.day = today),
      'same_day_last_week', (select count(*)::int from public.activity_days ad join public.profiles p on p.id = ad.user_id
                             where (c is null or p.campus_id = c) and ad.day = today - 7),
      'series', (select jsonb_agg((select count(*) from public.activity_days ad join public.profiles p on p.id = ad.user_id
                                   where (c is null or p.campus_id = c) and ad.day = d) order by d)
                 from unnest(days) d)),
    'listings_live', jsonb_build_object(
      'value', (select count(*)::int from public.listings l where (c is null or l.campus_id = c) and l.status in ('active', 'hold')),
      'new_7d', (select count(*)::int from public.listings l where (c is null or l.campus_id = c) and l.created_at >= wk
                 and l.status <> 'deleted'),
      'series', (select jsonb_agg((select count(*) from public.listings l
                                   where (c is null or l.campus_id = c) and (l.created_at at time zone tz)::date = d) order by d)
                 from unnest(days) d)),
    'offers_today', jsonb_build_object(
      'value', (select count(*)::int from public.offers o join public.listings l on l.id = o.listing_id
                where (c is null or l.campus_id = c) and o.created_at >= day0),
      'same_day_last_week', (select count(*)::int from public.offers o join public.listings l on l.id = o.listing_id
                             where (c is null or l.campus_id = c) and o.created_at >= day0 - interval '7 days'
                               and o.created_at < now_at - interval '7 days'),
      'series', (select jsonb_agg((select count(*) from public.offers o join public.listings l on l.id = o.listing_id
                                   where (c is null or l.campus_id = c) and (o.created_at at time zone tz)::date = d) order by d)
                 from unnest(days) d)),
    'deals_7d', jsonb_build_object(
      'value', (select count(*)::int from private.admin_deals(c, wk)),
      'agreed_cents', (select coalesce(sum(d.agreed_cents), 0)::bigint from private.admin_deals(c, wk) d),
      'prev_7d', (select count(*)::int from private.admin_deals(c, wk - interval '7 days') d where d.sold_at < wk),
      'series', (select jsonb_agg((select count(*) from private.admin_deals(c, day0 - interval '14 days') x
                                   where (x.sold_at at time zone tz)::date = d) order by d)
                 from unnest(days) d)),
    'open_reports', jsonb_build_object(
      'value', (select count(*)::int from public.reports r where r.status = 'open' and (c is null or r.campus_id = c)),
      'priority', (select count(*)::int from public.reports r where r.status = 'open' and r.priority = 1 and (c is null or r.campus_id = c)),
      'oldest_at', (select min(r.created_at) from public.reports r where r.status = 'open' and (c is null or r.campus_id = c))));

  attention := jsonb_build_object(
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'priority', r.priority, 'target_type', r.target_type,
                                          'campus', private.campus_brief(r.campus_id), 'created_at', r.created_at)
                       order by r.created_at)
      from (select * from public.reports x where x.status = 'open' and (c is null or x.campus_id = c)
            order by x.created_at limit 10) r), '[]'::jsonb),
    'held_listings', (select count(*)::int from public.listings l where l.status = 'held_review' and (c is null or l.campus_id = c)),
    'quad_held', (select count(*)::int from public.quad_posts q where q.status = 'held' and (c is null or q.campus_id = c))
                 + (select count(*)::int from public.quad_replies q join public.quad_posts qp on qp.id = q.post_id
                    where q.status = 'held' and (c is null or qp.campus_id = c)),
    'support_open', (select count(*)::int from public.support_requests s
                     where s.handled_at is null and (c is null or private.support_campus(s.email) = c)),
    'appeals_open', (select count(*)::int from public.appeals ap join public.profiles p on p.id = ap.user_id
                     where ap.status = 'open' and (c is null or p.campus_id = c)));

  campuses := coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'name', x.name, 'short_name', x.short_name, 'slug', x.slug, 'status', x.status, 'is_demo', x.is_demo,
      'students', (select count(*)::int from public.profiles p where p.campus_id = x.id and p.status not in ('banned', 'waitlist')),
      'waitlist', (select count(*)::int from public.profiles p where p.campus_id = x.id and p.status = 'waitlist')
                  + (select count(*)::int from public.waitlist_requests w join public.campus_domains d on d.domain = w.domain
                     where d.campus_id = x.id and w.notified_at is null),
      'unlock_threshold', x.unlock_threshold,
      'live_listings', (select count(*)::int from public.listings l where l.campus_id = x.id and l.status in ('active', 'hold')),
      'deals_7d', (select count(*)::int from private.admin_deals(x.id, wk))) order by x.is_demo, x.name)
    from public.campuses x where c is null or x.id = c), '[]'::jsonb);

  return jsonb_build_object('campus_id', c, 'timezone', tz, 'generated_at', now_at,
    'kpis', kpis, 'needs_attention', attention, 'campuses', campuses);
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_activity_feed: every action by every student, newest first.
create or replace function public.admin_activity_feed(
  campus_id uuid default null, kinds text[] default null, user_id uuid default null, listing_id uuid default null,
  since timestamptz default null, until timestamptz default null, cursor jsonb default null, "limit" int default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_activity_feed.campus_id);
  c uuid := private.admin_campus(a, admin_activity_feed.campus_id);
begin
  if admin_activity_feed.user_id is not null then
    a := private.admin_for_person(admin_activity_feed.user_id);
    perform private.log_person_view(a, admin_activity_feed.user_id, 'activity');
  end if;
  return private.admin_events_page(c, admin_activity_feed.kinds, admin_activity_feed.user_id, admin_activity_feed.listing_id,
    admin_activity_feed.since, admin_activity_feed.until, admin_activity_feed.cursor, admin_activity_feed."limit");
end;
$$;

-- ---------------------------------------------------------------------------
-- One student
create or replace function public.admin_person(user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.admin_for_person(admin_person.user_id);
  p public.profiles;
  uid uuid := admin_person.user_id;
  tz text;
  since timestamptz := private.now() - interval '30 days';
  res jsonb;
begin
  select * into p from public.profiles x where x.id = uid;
  select x.timezone into tz from public.campuses x where x.id = p.campus_id;
  perform private.log_person_view(a, uid, 'overview', true);

  res := jsonb_build_object(
    'person', jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'first_name', p.first_name,
      'initial', upper(left(coalesce(p.first_name, '?'), 1)),
      'status', p.status, 'status_reason', p.status_reason, 'paused_until', p.paused_until, 'year', p.year,
      'avatar_path', p.avatar_path, 'campus', private.campus_brief(p.campus_id),
      'email', private.admin_email(a, p.id), 'email_masked', a.role <> 'owner',
      'joined_at', p.created_at, 'last_active_at', p.last_active_at, 'last_platform', p.last_platform,
      'last_app_version', p.last_app_version, 'age_method', p.age_method, 'adult_confirmed_at', p.adult_confirmed_at,
      'verified_until', p.verified_until, 'invited_by', private.person_brief(p.invited_by),
      'strikes', p.strike_count, 'no_shows', p.noshow_count,
      'admin_role', (select ad.role from public.admins ad where ad.user_id = p.id),
      'push_on', exists (select 1 from public.push_tokens t where t.user_id = p.id and t.disabled_at is null),
      'tips_on', coalesce((select np.tips from public.notification_prefs np where np.user_id = p.id), false)),
    'counts', jsonb_build_object(
      'swipes', (select count(*)::int from public.swipes s where s.user_id = uid and s.created_at <> 'infinity'),
      'left', (select count(*)::int from public.swipes s where s.user_id = uid and s.dir = 'left' and s.created_at <> 'infinity'),
      'saves', (select count(*)::int from public.saves s where s.user_id = uid),
      'offers_made', (select count(*)::int from public.offers o where o.buyer_id = uid),
      'offers_received', (select count(*)::int from public.offers o where o.seller_id = uid),
      'deals', (select count(*)::int from private.admin_deals(null, null) d where d.seller_id = uid or d.buyer_id = uid),
      'listings', (select count(*)::int from public.listings l where l.seller_id = uid and l.status <> 'deleted'),
      'chats', (select count(*)::int from public.chats ch where uid in (ch.buyer_id, ch.seller_id)),
      'meetups', (select count(*)::int from public.meetups m join public.chats ch on ch.id = m.chat_id
                  where uid in (ch.buyer_id, ch.seller_id)),
      'rating', (select jsonb_build_object('up', count(*) filter (where r.thumbs_up), 'down', count(*) filter (where not r.thumbs_up))
                 from public.ratings r where r.ratee_id = uid),
      'reports_on_them', (select count(*)::int from public.reports r where r.target_user_id = uid),
      'reports_by_them', (select count(*)::int from public.reports r where r.reporter_id = uid),
      'blocks_made', (select count(*)::int from public.blocks b where b.blocker_id = uid),
      'blocks_received', (select count(*)::int from public.blocks b where b.blocked_id = uid)),
    -- What they like: right swipes (saves and offers) by category, in percent.
    'affinity', coalesce((
      select jsonb_agg(jsonb_build_object('category_id', x.category_id, 'slug', cat.slug, 'name', cat.name, 'n', x.n,
                                          'share', x.share) order by x.n desc, cat.sort)
      from (select y.category_id, y.n, round(100.0 * y.n / sum(y.n) over ())::int as share
            from (select l.category_id, count(*)::int as n
                  from (select s.listing_id from public.saves s where s.user_id = uid
                        union select o.listing_id from public.offers o where o.buyer_id = uid) r
                  join public.listings l on l.id = r.listing_id
                  where l.category_id is not null
                  group by l.category_id) y) x
      join public.categories cat on cat.id = x.category_id), '[]'::jsonb),
    -- When they're active: 24 counts (campus local hour), last 30 days.
    'hourly', (select jsonb_agg(coalesce(h.n, 0) order by g.hr)
               from generate_series(0, 23) g(hr)
               left join (select extract(hour from t.at at time zone coalesce(tz, 'America/New_York'))::int as hr, count(*)::int as n
                          from (select e.created_at as at from public.activity_events e where e.user_id = uid and e.created_at >= since
                                union all select s.created_at from public.swipes s where s.user_id = uid and s.created_at >= since and s.created_at <> 'infinity'
                                union all select s.created_at from public.saves s where s.user_id = uid and s.created_at >= since
                                union all select o.created_at from public.offers o where o.buyer_id = uid and o.created_at >= since
                                union all select m.created_at from public.messages m where m.sender_id = uid and m.created_at >= since) t
                          group by 1) h on h.hr = g.hr),
    'blocks', jsonb_build_object(
      'made', coalesce((select jsonb_agg(private.person_brief(b.blocked_id) || jsonb_build_object('at', b.created_at) order by b.created_at desc)
                        from public.blocks b where b.blocker_id = uid), '[]'::jsonb),
      'received', coalesce((select jsonb_agg(private.person_brief(b.blocker_id) || jsonb_build_object('at', b.created_at) order by b.created_at desc)
                            from public.blocks b where b.blocked_id = uid), '[]'::jsonb)));
  return res;
end;
$$;

create or replace function public.admin_person_timeline(user_id uuid, kinds text[] default null, cursor jsonb default null, "limit" int default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.admin_for_person(admin_person_timeline.user_id);
begin
  perform private.log_person_view(a, admin_person_timeline.user_id, 'timeline');
  return private.admin_events_page(null, admin_person_timeline.kinds, admin_person_timeline.user_id, null, null, null,
    admin_person_timeline.cursor, admin_person_timeline."limit");
end;
$$;

create or replace function public.admin_person_offers(user_id uuid, cursor int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.admin_for_person(admin_person_offers.user_id);
  uid uuid := admin_person_offers.user_id;
  off int := greatest(coalesce(admin_person_offers.cursor, 0), 0);
  items jsonb;
begin
  perform private.log_person_view(a, uid, 'offers');
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'role', case when o.buyer_id = uid then 'buyer' else 'seller' end,
      'other', private.person_brief(case when o.buyer_id = uid then o.seller_id else o.buyer_id end),
      'listing', private.listing_brief(o.listing_id), 'amount_cents', o.amount_cents,
      'asking_cents', (select l.price_cents from public.listings l where l.id = o.listing_id),
      'status', o.status, 'round', o.round, 'last_actor', o.last_actor, 'created_at', o.created_at,
      'responded_at', o.responded_at, 'expires_at', o.expires_at) order by o.created_at desc), '[]'::jsonb)
    into items
  from (select * from public.offers x where uid in (x.buyer_id, x.seller_id)
        order by x.created_at desc offset off limit 50) o;
  return jsonb_build_object('items', items, 'next_cursor', case when jsonb_array_length(items) = 50 then off + 50 end);
end;
$$;

create or replace function public.admin_person_listings(user_id uuid, cursor int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.admin_for_person(admin_person_listings.user_id);
  uid uuid := admin_person_listings.user_id;
  off int := greatest(coalesce(admin_person_listings.cursor, 0), 0);
  items jsonb;
begin
  perform private.log_person_view(a, uid, 'listings');
  select coalesce(jsonb_agg(private.listing_brief(l.id) || jsonb_build_object(
      'kind', l.kind, 'created_at', l.created_at, 'sold_at', l.sold_at, 'views', l.view_count, 'saves', l.save_count,
      'offers', l.offer_count,
      'left', (select count(*)::int from public.swipes s where s.listing_id = l.id and s.dir = 'left' and s.created_at <> 'infinity'),
      'reports', (select count(*)::int from public.reports r where r.target_type = 'listing' and r.target_id = l.id::text))
      order by l.created_at desc), '[]'::jsonb)
    into items
  from (select * from public.listings x where x.seller_id = uid and x.status <> 'deleted'
        order by x.created_at desc offset off limit 50) l;
  return jsonb_build_object('items', items, 'next_cursor', case when jsonb_array_length(items) = 50 then off + 50 end);
end;
$$;

-- Chats: who, which item, how many messages and when. Never the text.
create or replace function public.admin_person_chats(user_id uuid, cursor int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.admin_for_person(admin_person_chats.user_id);
  uid uuid := admin_person_chats.user_id;
  off int := greatest(coalesce(admin_person_chats.cursor, 0), 0);
  items jsonb;
begin
  perform private.log_person_view(a, uid, 'chats');
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ch.id, 'role', case when ch.buyer_id = uid then 'buyer' else 'seller' end,
      'other', private.person_brief(case when ch.buyer_id = uid then ch.seller_id else ch.buyer_id end),
      'listing', jsonb_build_object('id', ch.listing_id, 'title', ch.listing_title, 'price_cents', ch.listing_price_cents),
      'agreed_cents', ch.agreed_cents, 'status', ch.status,
      'message_count', (select count(*)::int from public.messages m where m.chat_id = ch.id and m.kind <> 'system'),
      'their_message_count', (select count(*)::int from public.messages m where m.chat_id = ch.id and m.sender_id = uid),
      'archived', ch.archived_at is not null,
      'last_message_at', ch.last_message_at, 'created_at', ch.created_at, 'closed_at', ch.closed_at,
      'buyer_outcome', ch.buyer_outcome, 'seller_outcome', ch.seller_outcome,
      'reported', exists (select 1 from public.reports r
                          where (r.target_type = 'chat' and r.target_id = ch.id::text)
                             or (r.target_type = 'message' and r.target_id in (
                                   select m.id::text from public.messages m where m.chat_id = ch.id))))
      order by ch.last_message_at desc), '[]'::jsonb)
    into items
  from (select * from public.chats x where uid in (x.buyer_id, x.seller_id)
        order by x.last_message_at desc offset off limit 50) ch;
  return jsonb_build_object('items', items, 'next_cursor', case when jsonb_array_length(items) = 50 then off + 50 end);
end;
$$;

create or replace function public.admin_person_meetups(user_id uuid, cursor int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.admin_for_person(admin_person_meetups.user_id);
  uid uuid := admin_person_meetups.user_id;
  off int := greatest(coalesce(admin_person_meetups.cursor, 0), 0);
  items jsonb;
begin
  perform private.log_person_view(a, uid, 'meetups');
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'chat_id', ch.id, 'role', case when ch.buyer_id = uid then 'buyer' else 'seller' end,
      'other', private.person_brief(case when ch.buyer_id = uid then ch.seller_id else ch.buyer_id end),
      'listing', jsonb_build_object('id', ch.listing_id, 'title', ch.listing_title),
      'starts_at', m.starts_at, 'status', m.status, 'place', coalesce(ss.name, m.custom_place), 'spot_id', m.spot_id,
      'proposed_by_them', m.proposed_by = uid, 'confirmed_at', m.confirmed_at,
      'their_check_in', case when ch.buyer_id = uid then m.buyer_here_at else m.seller_here_at end,
      'other_check_in', case when ch.buyer_id = uid then m.seller_here_at else m.buyer_here_at end,
      'no_shows', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'by_them', n.reporter_id = uid, 'status', n.status,
                                                                'created_at', n.created_at) order by n.created_at)
                            from public.noshow_reports n where n.meetup_id = m.id), '[]'::jsonb),
      'created_at', m.created_at) order by m.starts_at desc), '[]'::jsonb)
    into items
  from (select x.* from public.meetups x join public.chats c2 on c2.id = x.chat_id
        where uid in (c2.buyer_id, c2.seller_id) order by x.starts_at desc offset off limit 50) m
  join public.chats ch on ch.id = m.chat_id
  left join public.safe_spots ss on ss.id = m.spot_id;
  return jsonb_build_object('items', items, 'next_cursor', case when jsonb_array_length(items) = 50 then off + 50 end);
end;
$$;

create or replace function public.admin_person_reports(user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.admin_for_person(admin_person_reports.user_id);
  uid uuid := admin_person_reports.user_id;
begin
  perform private.log_person_view(a, uid, 'reports');
  return jsonb_build_object(
    'against', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reason', r.reason, 'status', r.status, 'priority', r.priority, 'target_type', r.target_type,
        'target_id', r.target_id, 'reporter', private.person_brief(r.reporter_id), 'action_taken', r.action_taken,
        'created_at', r.created_at, 'resolved_at', r.resolved_at) order by r.created_at desc)
      from public.reports r where r.target_user_id = uid), '[]'::jsonb),
    'by_them', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reason', r.reason, 'status', r.status, 'target_type', r.target_type, 'target_id', r.target_id,
        'about', private.person_brief(r.target_user_id), 'created_at', r.created_at, 'resolved_at', r.resolved_at)
        order by r.created_at desc)
      from public.reports r where r.reporter_id = uid), '[]'::jsonb),
    'strikes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'reason', s.reason, 'report_id', s.report_id,
        'created_at', s.created_at, 'expires_at', s.expires_at, 'cleared_at', s.cleared_at) order by s.created_at desc)
      from public.strikes s where s.user_id = uid), '[]'::jsonb),
    'appeals', coalesce((select jsonb_agg(jsonb_build_object('id', ap.id, 'subject_type', ap.subject_type, 'status', ap.status,
        'created_at', ap.created_at, 'decided_at', ap.decided_at) order by ap.created_at desc)
      from public.appeals ap where ap.user_id = uid), '[]'::jsonb),
    'no_shows', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'meetup_id', n.meetup_id, 'status', n.status,
        'by_them', n.reporter_id = uid, 'other', private.person_brief(case when n.reporter_id = uid then n.reported_id else n.reporter_id end),
        'created_at', n.created_at) order by n.created_at desc)
      from public.noshow_reports n where uid in (n.reporter_id, n.reported_id)), '[]'::jsonb));
end;
$$;

-- Who on the team looked at or acted on this person, newest first. Not logged.
create or replace function public.admin_person_access_log(user_id uuid, cursor bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.admin_for_person(admin_person_access_log.user_id);
  items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'at', x.created_at, 'actor', private.person_brief(x.actor_id),
      'action', x.action, 'reason', x.reason, 'case_ref', x.case_ref, 'meta', x.meta) order by x.id desc), '[]'::jsonb)
    into items
  from (select * from public.audit_log l
        where l.target_type = 'user' and l.target_id = admin_person_access_log.user_id::text
          and (admin_person_access_log.cursor is null or l.id < admin_person_access_log.cursor)
        order by l.id desc limit 100) x;
  return jsonb_build_object('items', items,
    'next_cursor', case when jsonb_array_length(items) = 100 then (items -> -1 ->> 'id')::bigint end);
end;
$$;

-- ---------------------------------------------------------------------------
-- One listing: who swiped which way, the funnel, offers, views and prices.
create or replace function public.admin_listing_activity(listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  l public.listings;
  a public.admins;
  lid uuid := admin_listing_activity.listing_id;
  right_n int;
  left_n int;
  cat_rate numeric;
  cat_n int;
begin
  select * into l from public.listings x where x.id = lid;
  a := private.require_admin('moderator', l.campus_id);
  if l.id is null then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.audit(a.user_id, 'listing.activity_view', 'listing', l.id::text, l.campus_id, 'view');

  select count(distinct r.uid)::int into right_n
  from (select s.user_id as uid from public.saves s where s.listing_id = l.id
        union select o.buyer_id from public.offers o where o.listing_id = l.id) r;
  select count(*)::int into left_n from public.swipes s where s.listing_id = l.id and s.dir = 'left' and s.created_at <> 'infinity';

  -- Same category on the same campus, listings posted in the last 90 days.
  select private.pct(sum(x.r), sum(x.r) + sum(x.lft)), (sum(x.r) + sum(x.lft))::int into cat_rate, cat_n
  from (select (select count(*) from (select s.user_id from public.saves s where s.listing_id = o.id
                                      union select b.buyer_id from public.offers b where b.listing_id = o.id) q) as r,
               (select count(*) from public.swipes s where s.listing_id = o.id and s.dir = 'left' and s.created_at <> 'infinity') as lft
        from public.listings o
        where o.campus_id = l.campus_id and o.category_id is not distinct from l.category_id and o.id <> l.id
          and o.status <> 'deleted' and o.created_at > private.now() - interval '90 days') x;

  return jsonb_build_object(
    'listing', private.listing_brief(l.id) || jsonb_build_object(
      'kind', l.kind, 'condition', l.condition, 'description', l.description,
      'category', (select jsonb_build_object('id', cat.id, 'slug', cat.slug, 'name', cat.name) from public.categories cat where cat.id = l.category_id),
      'seller', private.person_brief(l.seller_id), 'campus', private.campus_brief(l.campus_id),
      'created_at', l.created_at, 'bumped_at', l.bumped_at, 'sold_at', l.sold_at, 'buyer', private.person_brief(l.buyer_id),
      'expires_at', l.expires_at, 'views', l.view_count, 'saves', l.save_count, 'offers', l.offer_count,
      'spots', coalesce((select jsonb_agg(ss.name order by ss.sort) from public.safe_spots ss where ss.id = any (l.meet_spot_ids)), '[]'::jsonb),
      'reports', (select count(*)::int from public.reports r where r.target_type = 'listing' and r.target_id = l.id::text)),
    'funnel', jsonb_build_object(
      'shown', (select count(distinct e.user_id)::int from public.activity_events e where e.listing_id = l.id and e.kind = 'deck_shown'),
      'viewed', greatest(l.view_count, (select count(distinct e.user_id)::int from public.activity_events e
                                        where e.listing_id = l.id and e.kind = 'listing_viewed')),
      'saved', (select count(*)::int from public.saves s where s.listing_id = l.id),
      'offered', (select count(distinct o.buyer_id)::int from public.offers o where o.listing_id = l.id),
      'sold', l.status = 'sold'),
    'swipes', jsonb_build_object('right', right_n, 'left', left_n,
      'hidden', (select count(*)::int from public.swipes s where s.listing_id = l.id and s.created_at = 'infinity')),
    'who_swiped', coalesce((
      select jsonb_agg(jsonb_build_object('person', private.person_brief(w.uid), 'direction', w.dir, 'at', w.at,
        'dwell_ms', (select e.dwell_ms from public.activity_events e
                     where e.user_id = w.uid and e.listing_id = l.id and e.dwell_ms is not null
                       and e.kind = case w.dir when 'left' then 'swiped_left' when 'saved' then 'saved' else 'offer_made' end
                     order by e.created_at desc limit 1),
        'viewed_first', exists (select 1 from public.activity_events e where e.user_id = w.uid and e.listing_id = l.id
                                and e.kind = 'listing_viewed' and e.created_at <= w.at),
        'offer', (select jsonb_build_object('id', o.id, 'amount_cents', o.amount_cents, 'status', o.status, 'round', o.round)
                  from public.offers o where o.listing_id = l.id and o.buyer_id = w.uid order by o.created_at desc limit 1),
        'saved', exists (select 1 from public.saves s where s.listing_id = l.id and s.user_id = w.uid))
        order by w.at desc)
      from (select distinct on (z.uid) z.uid, z.dir, z.at
            from (select o.buyer_id as uid, 'offered' as dir, o.created_at as at, 1 as rk from public.offers o where o.listing_id = l.id
                  union all select s.user_id, 'saved', s.created_at, 2 from public.saves s where s.listing_id = l.id
                  union all select s.user_id, 'left', s.created_at, 3 from public.swipes s
                            where s.listing_id = l.id and s.dir = 'left' and s.created_at <> 'infinity') z
            where z.uid is not null
            order by z.uid, z.rk, z.at desc) w
      ), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'buyer', private.person_brief(o.buyer_id),
        'amount_cents', o.amount_cents, 'status', o.status, 'round', o.round, 'last_actor', o.last_actor,
        'created_at', o.created_at, 'responded_at', o.responded_at) order by o.created_at desc)
      from public.offers o where o.listing_id = l.id), '[]'::jsonb),
    'views', coalesce((select jsonb_agg(jsonb_build_object('person', private.person_brief(e.user_id), 'at', e.created_at,
        'dwell_ms', e.dwell_ms, 'source', e.source, 'platform', e.platform) order by e.created_at desc)
      from (select * from public.activity_events x where x.listing_id = l.id and x.kind in ('listing_viewed', 'opened_from')
            order by x.created_at desc limit 100) e), '[]'::jsonb),
    'price_history', coalesce((select jsonb_agg(jsonb_build_object('old_cents', pc.old_cents, 'new_cents', pc.new_cents,
        'at', pc.changed_at) order by pc.changed_at)
      from public.listing_price_changes pc where pc.listing_id = l.id), '[]'::jsonb),
    'comparison', jsonb_build_object(
      'right_rate', private.pct(right_n, right_n + left_n),
      'category_right_rate', cat_rate,
      'category_swipes', coalesce(cat_n, 0)));
end;
$$;

-- ---------------------------------------------------------------------------
-- People list. filters: q (name; the owner can also match an exact email,
-- DEC 69(c)), status, campus_id, year, sort (last_active | joined | name |
-- reports; default last_active). Email: full for the owner, masked otherwise.
create or replace function public.admin_list_users_v2(filters jsonb default '{}', cursor int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  q text := nullif(btrim(coalesce(filters ->> 'q', '')), '');
  st text := nullif(filters ->> 'status', '');
  yr text := nullif(filters ->> 'year', '');
  srt text := coalesce(nullif(filters ->> 'sort', ''), 'last_active');
  c uuid;
  off int := greatest(coalesce(admin_list_users_v2.cursor, 0), 0);
  total int;
  items jsonb;
begin
  begin
    c := private.admin_campus(a, nullif(filters ->> 'campus_id', '')::uuid);
  exception when invalid_text_representation then
    perform private.raise('INVALID', 'campus_id');
  end;
  if srt not in ('last_active', 'joined', 'name', 'reports') then
    perform private.raise('INVALID', 'sort');
  end if;

  with base as (
    select pp.id, pp.created_at, pp.last_active_at, pp.display_name,
           case when srt = 'reports' then (select count(*) from public.reports r where r.target_user_id = pp.id) else 0 end as nrep
    from public.profiles pp
    left join auth.users u on u.id = pp.id
    where (c is null or pp.campus_id = c)
      and (st is null or pp.status::text = st)
      and (yr is null or pp.year::text = yr)
      and (q is null or pp.display_name ilike '%' || q || '%'
           or (a.role = 'owner' and lower(u.email) = lower(q)))
  ),
  ranked as (
    select b.id, count(*) over () as n,
           row_number() over (order by
             case when srt = 'last_active' then coalesce(b.last_active_at, b.created_at) end desc nulls last,
             case when srt = 'joined' then b.created_at end desc,
             case when srt = 'name' then lower(b.display_name) end asc,
             case when srt = 'reports' then b.nrep end desc,
             b.created_at desc, b.id) as ord
    from base b
  )
  select coalesce(max(r.n), 0)::int,
         coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'initial', upper(left(coalesce(p.first_name, '?'), 1)),
      'status', p.status, 'campus', private.campus_brief(p.campus_id), 'email', private.admin_email(a, p.id),
      'year', p.year, 'avatar_path', p.avatar_path,
      'swipes', (select count(*)::int from public.swipes s where s.user_id = p.id and s.created_at <> 'infinity'),
      'offers', (select count(*)::int from public.offers o where o.buyer_id = p.id),
      'deals', (select count(*)::int from private.admin_deals(null, null) d where d.seller_id = p.id or d.buyer_id = p.id),
      'reports', (select count(*)::int from public.reports x where x.target_user_id = p.id),
      'strike_count', p.strike_count, 'noshow_count', p.noshow_count,
      'joined_at', p.created_at, 'last_active_at', p.last_active_at, 'last_platform', p.last_platform)
      order by r.ord) filter (where r.ord > off and r.ord <= off + 50), '[]'::jsonb)
    into total, items
  from ranked r join public.profiles p on p.id = r.id;
  return jsonb_build_object('items', items, 'total', total,
    'next_cursor', case when off + 50 < total then off + 50 end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log with filters: actor_id, action (prefix), target_type, target_id,
-- since, until (ISO times). Id cursor, 100 per page, newest first.
create or replace function public.admin_list_audit_v2(filters jsonb default '{}', cursor bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  f_actor uuid;
  f_since timestamptz;
  f_until timestamptz;
  f_action text := nullif(filters ->> 'action', '');
  f_ttype text := nullif(filters ->> 'target_type', '');
  f_tid text := nullif(filters ->> 'target_id', '');
  items jsonb;
begin
  begin
    f_actor := nullif(filters ->> 'actor_id', '')::uuid;
    f_since := nullif(filters ->> 'since', '')::timestamptz;
    f_until := nullif(filters ->> 'until', '')::timestamptz;
  exception when others then
    perform private.raise('INVALID', 'filters');
  end;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'at', l.created_at, 'actor', private.person_brief(l.actor_id),
      'action', l.action, 'target_type', l.target_type, 'target_id', l.target_id,
      'target_label', case l.target_type
          when 'user' then (select p.display_name from public.profiles p where p.id::text = l.target_id)
          when 'listing' then (select x.title from public.listings x where x.id::text = l.target_id)
          when 'campus' then (select x.short_name from public.campuses x where x.id::text = l.target_id)
          else null end,
      'campus_id', l.campus_id, 'reason', l.reason, 'case_ref', l.case_ref, 'meta', l.meta) order by l.id desc), '[]'::jsonb)
    into items
  from (select * from public.audit_log x
        where (admin_list_audit_v2.cursor is null or x.id < admin_list_audit_v2.cursor)
          and (a.campus_id is null or x.campus_id = a.campus_id)
          and (f_actor is null or x.actor_id = f_actor)
          and (f_action is null or x.action like f_action || '%')
          and (f_ttype is null or x.target_type = f_ttype)
          and (f_tid is null or x.target_id = f_tid)
          and (f_since is null or x.created_at >= f_since)
          and (f_until is null or x.created_at < f_until)
        order by x.id desc limit 100) l;
  return jsonb_build_object('items', items,
    'next_cursor', case when jsonb_array_length(items) = 100 then (items -> -1 ->> 'id')::bigint end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Global search (⌘K): people by name (the owner also by exact email),
-- listings by title, reports by id prefix. 8 of each, campus-scoped.
create or replace function public.admin_search(q text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  term text := btrim(coalesce(admin_search.q, ''));
  c uuid := a.campus_id;
begin
  if char_length(term) < 2 or char_length(term) > 80 then
    perform private.raise('INVALID', 'q');
  end if;
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(x.j order by x.ord) from (
        select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'initial', upper(left(coalesce(p.first_name, '?'), 1)),
                                  'status', p.status, 'campus', private.campus_brief(p.campus_id), 'email', private.admin_email(a, p.id)) as j,
               row_number() over (order by p.display_name) as ord
        from public.profiles p left join auth.users u on u.id = p.id
        where (c is null or p.campus_id = c)
          and (p.display_name ilike '%' || term || '%' or (a.role = 'owner' and lower(u.email) = lower(term)))
        order by p.display_name limit 8) x), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(x.j order by x.ord) from (
        select private.listing_brief(l.id) || jsonb_build_object('campus', private.campus_brief(l.campus_id)) as j,
               row_number() over (order by l.created_at desc) as ord
        from public.listings l
        where (c is null or l.campus_id = c) and l.status <> 'deleted' and l.title ilike '%' || term || '%'
        order by l.created_at desc limit 8) x), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(x.j order by x.ord) from (
        select jsonb_build_object('id', r.id, 'reason', r.reason, 'status', r.status, 'target_type', r.target_type,
                                  'created_at', r.created_at) as j,
               row_number() over (order by r.created_at desc) as ord
        from public.reports r
        where (c is null or r.campus_id = c) and r.id::text like lower(term) || '%'
        order by r.created_at desc limit 8) x), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'private.mask_email(text)', 'private.admin_email(public.admins, uuid)', 'private.person_brief(uuid)',
    'private.listing_brief(uuid)', 'private.campus_brief(uuid)', 'private.support_campus(text)', 'private.admin_for_person(uuid)',
    'private.log_person_view(public.admins, uuid, text, boolean)', 'private.admin_deals(uuid, timestamptz)',
    'private.admin_events(uuid, text[], uuid, uuid, timestamptz, timestamptz, timestamptz, text, int)',
    'private.admin_events_page(uuid, text[], uuid, uuid, timestamptz, timestamptz, jsonb, int)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.admin_overview_v2(uuid)',
    'public.admin_activity_feed(uuid, text[], uuid, uuid, timestamptz, timestamptz, jsonb, int)',
    'public.admin_person(uuid)', 'public.admin_person_timeline(uuid, text[], jsonb, int)',
    'public.admin_person_offers(uuid, int)', 'public.admin_person_listings(uuid, int)',
    'public.admin_person_chats(uuid, int)', 'public.admin_person_meetups(uuid, int)',
    'public.admin_person_reports(uuid)', 'public.admin_person_access_log(uuid, bigint)',
    'public.admin_listing_activity(uuid)', 'public.admin_list_users_v2(jsonb, int)',
    'public.admin_list_audit_v2(jsonb, bigint)', 'public.admin_search(text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
