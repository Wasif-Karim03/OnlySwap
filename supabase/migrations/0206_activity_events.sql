-- 0206_activity_events.sql · Admin v2, part 1 (ADMIN_CHECKLIST §4; DEC 93)
--   * public.activity_events: how students browse (cards shown in the deck,
--     listing views with time on page and where they were opened from,
--     searches, app opens, and the swipe, save and offer taps with time on
--     card). Offers, saves, left swipes, chats, meetups and deals already live
--     in their own tables; admin timelines read those and use this table only
--     for what nothing else records. Not a PostHog event: it never leaves our
--     database, and PostHog keeps its 18 anonymous events (PRD §5.4).
--   * public.track_events(events, platform, app_version): the app sends
--     batches (<= 50). Unknown kinds and listings the caller can't see are
--     dropped, user and campus come from the session, dwell is clamped, the
--     search text is cut to 80 characters. Stamps profiles.last_active_at,
--     last_platform and last_app_version (new columns).
--   * Retention: 90 days (daily prune_activity job). Left swipes keep their
--     30 days in public.swipes (unchanged).
-- RLS on, no grants to anon or authenticated: only security definer RPCs
-- read or write it.

alter table public.profiles add column if not exists last_platform text
  check (last_platform in ('ios', 'android', 'web'));
alter table public.profiles add column if not exists last_app_version text
  check (char_length(last_app_version) <= 20);

create table public.activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  campus_id uuid not null references public.campuses on delete cascade,
  kind text not null check (kind in ('app_open', 'deck_shown', 'listing_viewed', 'swiped_left', 'saved',
                                     'unsaved', 'offer_made', 'searched', 'opened_from')),
  listing_id uuid references public.listings on delete set null,
  source text check (source in ('discover', 'search', 'campus', 'profile', 'saved', 'link', 'notification')),
  dwell_ms int check (dwell_ms between 0 and 600000),
  query text check (char_length(query) <= 80),
  platform text check (platform in ('ios', 'android', 'web')),
  app_version text check (char_length(app_version) <= 20),
  created_at timestamptz not null default now()
);
create index on public.activity_events (user_id, created_at desc);
create index on public.activity_events (listing_id, created_at desc) where listing_id is not null;
create index on public.activity_events (campus_id, created_at desc);
create index on public.activity_events (created_at);   -- 90 d purge
alter table public.activity_events enable row level security;
revoke all on public.activity_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- track_events. Each item: {kind, listing_id?, source?, dwell_ms?, query?, at?}.
-- `at` is the device time of the event, kept within the last 24 hours and
-- never in the future. A card shown in the deck counts once per listing per
-- person per 24 hours. Kinds about a listing need a listing on the caller's
-- campus that isn't deleted; `searched` needs a query. Returns {accepted}.
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
    continue when v_kind is null or v_kind not in ('app_open', 'deck_shown', 'listing_viewed', 'swiped_left', 'saved',
                                                   'unsaved', 'offer_made', 'searched', 'opened_from');
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

    if v_kind in ('deck_shown', 'listing_viewed', 'swiped_left', 'saved', 'unsaved', 'offer_made', 'opened_from') then
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
    continue when v_kind = 'deck_shown' and exists (
      select 1 from public.activity_events e
      where e.user_id = me.id and e.listing_id = v_listing and e.kind = 'deck_shown'
        and e.created_at > now_at - interval '24 hours');

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
-- Retention (DATA_MODEL §5): activity events 90 days. Runs daily after prune.
create or replace function private.prune_activity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  delete from public.activity_events where created_at < private.now() - interval '90 days';
  get diagnostics n = row_count;
  return jsonb_build_object('activity_events', n);
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('prune_activity', '45 9 * * *', 'select private.prune_activity()');
  end if;
end;
$$;

revoke all on function private.prune_activity() from public, anon, authenticated;
grant execute on function private.prune_activity() to service_role;
revoke all on function public.track_events(jsonb, text, text) from public, anon;
grant execute on function public.track_events(jsonb, text, text) to authenticated;
