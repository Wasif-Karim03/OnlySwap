-- 0217_activity_volume.sql · E-03 (audit), DEC 100: activity_events was on
-- track to fill the 500 MB free database at about 250 daily users (~64 rows a
-- day per person, kept 90 days). Now:
--   * deck_shown, swiped_left, saved and offer_made are no longer stored.
--     Swipes, saves and offers already record them; time on card moves to a
--     new swipes.dwell_ms column that record_swipes fills from an optional
--     `dwell_ms` per item (additive; older builds just send none). track_events
--     drops those kinds without an error, so older builds keep working.
--   * Existing rows of those kinds are deleted and the kind check no longer
--     takes them.
--   * Activity events are kept 30 days (was 90).
--   * admin_listing_activity: "shown" is the number of people who swiped the
--     card (any way, hides included) and time on card comes from swipes. Left
--     swipes are pruned after 30 days, so "shown" can drop on older listings.
-- Indexes on activity_events stay: each backs an admin read (person, listing,
-- campus feed, owner feed and the purge).

alter table public.swipes add column if not exists dwell_ms int check (dwell_ms between 0 and 600000);

delete from public.activity_events where kind in ('deck_shown', 'swiped_left', 'saved', 'offer_made');
alter table public.activity_events drop constraint activity_events_kind_check;
alter table public.activity_events add constraint activity_events_kind_check
  check (kind in ('app_open', 'listing_viewed', 'unsaved', 'searched', 'opened_from'));

-- ---------------------------------------------------------------------------
-- record_swipes: each item may carry dwell_ms (time on card, clamped to
-- 0..600000, anything else stored as unknown).
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
  v_dwell int;
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
    begin
      v_dwell := round((nullif(it.v ->> 'dwell_ms', ''))::numeric)::int;
    exception when others then
      v_dwell := null;
    end;
    v_dwell := case when v_dwell is null or v_dwell < 0 then null else least(v_dwell, 600000) end;
    if not exists (
      select 1 from public.listings l
      where l.id = nullif(it.v ->> 'listing_id', '')::uuid
        and l.campus_id = me.campus_id and l.seller_id <> me.id
        and l.status in ('active','hold') and not private.is_blocked(me.id, l.seller_id)) then
      continue;
    end if;
    insert into public.swipes as s (user_id, listing_id, dir, created_at, dwell_ms)
    values (me.id, (it.v ->> 'listing_id')::uuid, v_dir, v_at, v_dwell)
    on conflict (user_id, listing_id) do update
      set dir = excluded.dir, created_at = excluded.created_at, dwell_ms = excluded.dwell_ms
      where s.created_at <> 'infinity';
    if v_dir = 'save' then
      perform private.save(me, (it.v ->> 'listing_id')::uuid);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- track_events: deck cards, left swipes, saves and offers are dropped.
create or replace function public.track_events(events jsonb, platform text default null, app_version text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  plat text := case when track_events.platform in ('ios', 'android', 'web') then track_events.platform end;
  ver text := case when track_events.app_version ~ '^[0-9A-Za-z.+-]{1,20}$' then track_events.app_version end;
  now_at timestamptz := private.now();
  it record;
  v_kind text;
  v_listing uuid;
  v_source text;
  v_dwell int;
  v_query text;
  v_at timestamptz;
  n int := 0;
begin
  if events is null or jsonb_typeof(events) <> 'array' or jsonb_array_length(events) > 50 then
    perform private.raise('INVALID', 'events');
  end if;
  perform private.hit('track_events', 120, interval '1 hour');

  for it in select value as v from jsonb_array_elements(events) loop
    continue when jsonb_typeof(it.v) <> 'object';
    v_kind := it.v ->> 'kind';
    continue when v_kind is null or v_kind not in ('app_open', 'listing_viewed', 'unsaved', 'searched', 'opened_from');
    begin
      v_listing := nullif(it.v ->> 'listing_id', '')::uuid;
      v_at := nullif(it.v ->> 'at', '')::timestamptz;
      v_dwell := round((nullif(it.v ->> 'dwell_ms', ''))::numeric)::int;
    exception when others then
      continue;
    end;
    v_at := greatest(least(coalesce(v_at, now_at), now_at), now_at - interval '24 hours');
    v_dwell := case when v_dwell is null or v_dwell < 0 then null else least(v_dwell, 600000) end;
    v_source := case when it.v ->> 'source' in ('discover', 'search', 'campus', 'profile', 'saved', 'link', 'notification')
                     then it.v ->> 'source' end;
    v_query := nullif(left(btrim(regexp_replace(coalesce(it.v ->> 'query', ''), '\s+', ' ', 'g')), 80), '');

    if v_kind in ('listing_viewed', 'unsaved', 'opened_from') then
      continue when v_listing is null or not exists (
        select 1 from public.listings l
        where l.id = v_listing and l.campus_id = me.campus_id and l.status <> 'deleted');
    else
      v_listing := null;
    end if;
    continue when v_kind = 'searched' and v_query is null;
    if v_kind <> 'searched' then
      v_query := null;
    end if;

    insert into public.activity_events (user_id, campus_id, kind, listing_id, source, dwell_ms, query, platform, app_version, created_at)
    values (me.id, me.campus_id, v_kind, v_listing, v_source, v_dwell, v_query, plat, ver, v_at);
    n := n + 1;
  end loop;

  update public.profiles p
     set last_active_at = now_at,
         last_platform = coalesce(plat, p.last_platform),
         last_app_version = coalesce(ver, p.last_app_version)
   where p.id = me.id;
  return jsonb_build_object('accepted', n);
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention: activity events 30 days, deletion records 365 days.
create or replace function private.prune_activity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
  m int;
begin
  delete from public.activity_events where created_at < private.now() - interval '30 days';
  get diagnostics n = row_count;
  delete from public.account_deletions where started_at < private.now() - interval '365 days';
  get diagnostics m = row_count;
  return jsonb_build_object('activity_events', n, 'account_deletions', m);
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_listing_activity (body from 0207 with the two changes above).
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
      'shown', (select count(*)::int from public.swipes s where s.listing_id = l.id),
      'viewed', greatest(l.view_count, (select count(distinct e.user_id)::int from public.activity_events e
                                        where e.listing_id = l.id and e.kind = 'listing_viewed')),
      'saved', (select count(*)::int from public.saves s where s.listing_id = l.id),
      'offered', (select count(distinct o.buyer_id)::int from public.offers o where o.listing_id = l.id),
      'sold', l.status = 'sold'),
    'swipes', jsonb_build_object('right', right_n, 'left', left_n,
      'hidden', (select count(*)::int from public.swipes s where s.listing_id = l.id and s.created_at = 'infinity')),
    'who_swiped', coalesce((
      select jsonb_agg(jsonb_build_object('person', private.person_brief(w.uid), 'direction', w.dir, 'at', w.at,
        'dwell_ms', (select s.dwell_ms from public.swipes s where s.user_id = w.uid and s.listing_id = l.id),
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
