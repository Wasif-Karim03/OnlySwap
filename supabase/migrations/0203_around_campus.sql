-- 0203_around_campus.sql · S48 (P5-SELL-06, P5-SELL-08, P6-CAMP-01, R11-NOTIF-01 free_food + wanted_match)
--   * create_listing already takes kind food (15–180 min, 3/day) and wanted
--     (5/day, max price, 0–1 photo) and wanted_ref (0016). Nothing changes there.
--   * private.listings_ai (trg_listings_ai) learns two R1.1 notifications:
--       - wanted_match: a sale/free listing posted with wanted_ref tells that
--         Wanted's poster (dedupe wanted_match:{wanted}:{listing}); any other new
--         sale/free listing in the same category tells open Wanted posters, at
--         most once per poster per campus day (dedupe wanted_match:{poster}:{day}).
--       - free_food: a live food post goes to campus members who turned the
--         free_food pref on (off by default), at most 3 per person per campus
--         day (data.day) (dedupe free_food:{listing}). Quiet hours and the daily push cap
--         stay with the push pipeline.
--   * push prefs: free_food → 'free_food', wanted_match → 'offers' (blueprint
--     catalog), campus_unlocked always. claim_pushes now honours the R1.1 prefs
--     (free_food, quad_replies), both off by default.
--   * get_campus_feed(kind, cursor): the Around campus feed (C01) plus the
--     Day one / Founding sellers data (C6, C7).
-- Discover (get_feed), search and saved-search alerts keep to sale and free.

-- ---------------------------------------------------------------------------
-- Push preference per notification type (latest version; was 0200).
create or replace function private.push_pref(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'offer_%' or p_type = 'wanted_match' then 'offers'
    when p_type = 'message_new' then 'messages'
    when p_type like 'meetup_%' or p_type in ('deal_check', 'rate_prompt') then 'meetups'
    when p_type in ('saved_search_match', 'watch_available') then 'saved_search'
    when p_type = 'price_drop' then 'price_drop'
    when p_type = 'listing_stale' then 'tips'
    when p_type in ('quad_reply', 'quad_milestone') then 'quad_replies'
    when p_type = 'free_food' then 'free_food'
    else null   -- campus_unlocked, safety and account notices: always
  end
$$;

-- send-push claim (BE-03), unchanged from 0027 except the R1.1 prefs.
create or replace function private.claim_pushes(p_limit int default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n record;
  pr public.notification_prefs;
  tz text;
  local_now timestamp;
  local_t time;
  in_quiet bool;
  sent_today int;
  pref text;
  enabled bool;
  toks jsonb;
  res jsonb := '[]';
begin
  for n in
    select * from public.notifications x
    where x.push_state = 'pending' and x.push_after <= private.now()
    order by x.time_sensitive desc, x.id
    limit greatest(p_limit, 1)
    for update skip locked
  loop
    select * into pr from public.notification_prefs x where x.user_id = n.user_id;
    select c.timezone into tz from public.profiles p join public.campuses c on c.id = p.campus_id where p.id = n.user_id;
    tz := coalesce(tz, 'America/New_York');
    local_now := private.now() at time zone tz;
    local_t := local_now::time;
    pref := private.push_pref(n.type);
    enabled := case pref
      when 'offers' then coalesce(pr.offers, true) when 'messages' then coalesce(pr.messages, true)
      when 'meetups' then coalesce(pr.meetups, true) when 'saved_search' then coalesce(pr.saved_search, true)
      when 'price_drop' then coalesce(pr.price_drop, true) when 'tips' then coalesce(pr.tips, false)
      when 'quad_replies' then coalesce(pr.quad_replies, false) when 'free_food' then coalesce(pr.free_food, false)
      else true end;
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token, 'platform', t.platform)), '[]') into toks
    from public.push_tokens t where t.user_id = n.user_id and t.disabled_at is null;

    if not enabled or jsonb_array_length(toks) = 0 then
      update public.notifications x set push_state = 'skipped' where x.id = n.id;
      continue;
    end if;

    if not n.time_sensitive then
      in_quiet := case
        when coalesce(pr.quiet_start, '23:00') > coalesce(pr.quiet_end, '08:00')
          then local_t >= coalesce(pr.quiet_start, '23:00') or local_t < coalesce(pr.quiet_end, '08:00')
        else local_t >= coalesce(pr.quiet_start, '23:00') and local_t < coalesce(pr.quiet_end, '08:00') end;
      if in_quiet then
        update public.notifications x
           set push_after = ((case when local_t < coalesce(pr.quiet_end, '08:00') then local_now::date else local_now::date + 1 end)
                             + coalesce(pr.quiet_end, '08:00')) at time zone tz
         where x.id = n.id;
        continue;
      end if;
      select count(*) into sent_today from public.notifications x
      where x.user_id = n.user_id and x.push_state = 'sent' and not x.time_sensitive
        and (x.claimed_at at time zone tz)::date = local_now::date;
      if sent_today >= 6 then
        update public.notifications x set push_state = 'skipped' where x.id = n.id;
        continue;
      end if;
    end if;

    update public.notifications x set push_state = 'sending', claimed_at = private.now() where x.id = n.id;
    res := res || jsonb_build_object(
      'id', n.id, 'type', n.type, 'grp', n.grp, 'title', n.title, 'body', n.body, 'data', n.data,
      'time_sensitive', n.time_sensitive, 'tokens', toks,
      'badge', (select count(*)::int from public.notifications x where x.user_id = n.user_id and x.read_at is null));
  end loop;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- Where a food post is: the first meetup spot's name, else the free-text note.
create or replace function private.listing_place(l public.listings)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.name from public.safe_spots s where s.id = l.meet_spot_ids[1]),
    nullif(btrim(coalesce(l.meet_note, '')), ''))
$$;

-- Free food: tell opted-in members on the campus (not the poster, not blocked
-- either way), at most 3 a day each.
create or replace function private.notify_free_food(l public.listings)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  today date := private.campus_today(l.campus_id);
  place text := private.listing_place(l);
  body text;
  r record;
  n int := 0;
begin
  select c.timezone into tz from public.campuses c where c.id = l.campus_id;
  tz := coalesce(tz, 'America/New_York');
  body := 'Free ' || l.title
    || coalesce(' at ' || place, '')
    || coalesce(' until ' || btrim(to_char(l.expires_at at time zone tz, 'FMHH12:MI AM')), '');
  for r in
    select p.id from public.profiles p
    join public.notification_prefs np on np.user_id = p.id
    where p.campus_id = l.campus_id and p.status = 'active' and np.free_food
      and p.id is distinct from l.seller_id
      and not private.is_blocked(p.id, l.seller_id)
      and (select count(*) from public.notifications x
           where x.user_id = p.id and x.type = 'free_food' and x.data ->> 'day' = today::text) < 3
  loop
    perform private.queue_notification(r.id, 'free_food', 'campus', 'Free food', left(body, 200),
      jsonb_build_object('listing_id', l.id, 'url', '/listing/' || l.id, 'expires_at', l.expires_at,
                         'day', today),
      false, 'free_food:' || l.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Wanted matches for a new sale/free listing.
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
      and p.status = 'active'
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

  -- Same category: open Wanted posts on the campus, once per poster per day.
  if l.category_id is not null then
    for w in
      select distinct on (x.seller_id) x.id, x.seller_id, x.title
      from public.listings x
      join public.profiles p on p.id = x.seller_id
      where x.campus_id = l.campus_id and x.kind = 'wanted' and x.status = 'active'
        and x.category_id = l.category_id
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
  end if;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- New listing (trg_listings_ai): saved-search alerts, wanted matches, founding
-- sellers (sale/free), free food fan-out (food). Supersedes 0028.
create or replace function private.listings_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  c public.campuses;
begin
  if new.status <> 'active' then
    return null;
  end if;
  if new.kind = 'food' then
    perform private.notify_free_food(new);
    return null;
  end if;
  if new.kind not in ('sale', 'free') then
    return null;
  end if;
  for s in
    select ss.* from public.saved_searches ss
    join public.profiles p on p.id = ss.user_id
    where ss.campus_id = new.campus_id and ss.alerts and ss.user_id is distinct from new.seller_id
      and p.status = 'active'
      and (ss.last_notified_at is null or ss.last_notified_at < private.now() - interval '2 hours')
      and not private.is_blocked(ss.user_id, new.seller_id)
      and private.text_matches(new, ss.query) and private.filters_match(new, ss.filters)
  loop
    perform private.queue_notification(s.user_id, 'saved_search_match', 'alerts', 'New match',
      'New: ' || new.title || ' for ' || private.money(new.price_cents)
        || case when s.query is not null then ' (matches ''' || s.query || ''')' else '' end,
      jsonb_build_object('listing_id', new.id, 'saved_search_id', s.id), false, 'ssm:' || s.id || ':' || new.id);
    update public.saved_searches x set last_notified_at = private.now() where x.id = s.id;
  end loop;

  perform private.notify_wanted_match(new);

  -- Founding sellers: the first people to list on a campus, up to its limit (PRD F29).
  select * into c from public.campuses where id = new.campus_id;
  if c.founding_seller_limit > 0
     and exists (select 1 from public.profiles p where p.id = new.seller_id and p.founding_seller_until is null)
     and (select count(*) from public.profiles p where p.campus_id = c.id and p.founding_seller_until is not null) < c.founding_seller_limit then
    update public.profiles p set founding_seller_until = private.now() + interval '365 days' where p.id = new.seller_id;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_campus_feed (C01). kind: null/'all' | 'food' | 'free' | 'wanted' | 'new'.
--   all    = live free food + free stuff + Wanted + sale listings from the last 7 days
--   new    = sale listings from the last 7 days
-- Newest first, keyset cursor {bumped_at, id}; 20 per page. Expired food never
-- shows (the countdown hits zero and the post is gone). Own posts are included
-- with is_own (the app hides "I have this" on them); blocked people both ways
-- are not. Returns:
--   {items: FeedItem & {wanted_max_cents, wanted_ref, place}[], next_cursor,
--    day_one, active_listings, founding: {limit, left, mine}}
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
  if k not in ('all', 'food', 'free', 'wanted', 'new') then
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
            when 'new' then l.kind = 'sale' and l.created_at > private.now() - interval '7 days'
            else l.kind in ('food', 'free', 'wanted')
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
revoke all on function private.listing_place(public.listings) from public, anon, authenticated;
revoke all on function private.notify_free_food(public.listings) from public, anon, authenticated;
revoke all on function private.notify_wanted_match(public.listings) from public, anon, authenticated;
revoke all on function private.push_pref(text) from public, anon, authenticated;
revoke all on function private.claim_pushes(int) from public, anon, authenticated;
revoke all on function public.get_campus_feed(text, jsonb) from public, anon;
grant execute on function public.get_campus_feed(text, jsonb) to authenticated, service_role;
