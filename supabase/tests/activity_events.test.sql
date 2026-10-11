-- Admin v2 (0206, DEC 93): activity_events and track_events. The table is
-- closed to the API roles; track_events takes batches of up to 50 from active
-- members, drops unknown kinds and listings the caller can't see, stamps the
-- user and campus from the session, clamps dwell and time, cuts the search
-- text to 80, counts a deck card once per 24 h, is rate limited, and updates
-- last active / platform / app version. Retention: 90 days (prune_activity).
begin;
select plan(35);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-0000000ac001', tests.uid('OSU'), tests.uid('B'), 'Desk lamp', 'active', 1200),
  ('00000000-0000-4000-8000-0000000ac002', tests.uid('UMICH'), tests.uid('D'), 'Michigan mug', 'active', 500),
  ('00000000-0000-4000-8000-0000000ac003', tests.uid('OSU'), tests.uid('B'), 'Gone chair', 'deleted', 900),
  ('00000000-0000-4000-8000-0000000ac004', tests.uid('OSU'), tests.uid('C'), 'Sold bike', 'sold', 9000);

-- The table ------------------------------------------------------------------------------------------
select has_table('public', 'activity_events', 'activity_events exists');
select ok((select relrowsecurity from pg_class where oid = 'public.activity_events'::regclass), 'RLS is on');
select is((select count(*)::int from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'activity_events' and grantee in ('anon', 'authenticated')), 0,
  'no table grants to anon or authenticated');
select is(tests.try_text_as(tests.uid('A'), $$select count(*)::text from public.activity_events$$),
  'ERROR: permission denied for table activity_events', 'members cannot read it directly');
select has_column('public', 'profiles', 'last_platform', 'profiles.last_platform');
select has_column('public', 'profiles', 'last_app_version', 'profiles.last_app_version');
select ok(not has_function_privilege('anon', 'public.track_events(jsonb, text, text)', 'execute'), 'anon cannot track');
select ok(has_function_privilege('authenticated', 'public.track_events(jsonb, text, text)', 'execute'), 'members can');

-- Refusals -------------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('D'), $$select public.track_events('[{"kind":"app_open"}]')::text$$),
  'ERROR: NOT_ACTIVE:waitlist', 'waitlisted members are not tracked');
select is(tests.try_text_as(tests.uid('A'), $$select public.track_events('{"kind":"app_open"}')::text$$),
  'ERROR: INVALID:events', 'events must be an array');
select is(tests.try_text_as(tests.uid('A'), format($$select public.track_events(%L)::text$$,
            (select jsonb_agg(jsonb_build_object('kind', 'app_open')) from generate_series(1, 51)))),
  'ERROR: INVALID:events', 'at most 50 per batch');

-- A mixed batch --------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), format($$select public.track_events(%L, 'ios', '1.2.3') ->> 'accepted'$$, jsonb_build_array(
    jsonb_build_object('kind', 'deck_shown', 'listing_id', '00000000-0000-4000-8000-0000000ac001', 'source', 'discover'),
    jsonb_build_object('kind', 'deck_shown', 'listing_id', '00000000-0000-4000-8000-0000000ac001'),
    jsonb_build_object('kind', 'listing_viewed', 'listing_id', '00000000-0000-4000-8000-0000000ac001', 'source', 'search', 'dwell_ms', 999999),
    jsonb_build_object('kind', 'listing_viewed', 'listing_id', '00000000-0000-4000-8000-0000000ac004', 'source', 'evil', 'dwell_ms', -5),
    jsonb_build_object('kind', 'listing_viewed', 'listing_id', '00000000-0000-4000-8000-0000000ac002'),
    jsonb_build_object('kind', 'saved', 'listing_id', '00000000-0000-4000-8000-0000000ac003'),
    jsonb_build_object('kind', 'offer_made', 'listing_id', 'not-a-uuid'),
    jsonb_build_object('kind', 'swiped_left'),
    jsonb_build_object('kind', 'hack', 'listing_id', '00000000-0000-4000-8000-0000000ac001'),
    jsonb_build_object('kind', 'searched', 'query', '  mini    fridge  ' || repeat('x', 100)),
    jsonb_build_object('kind', 'searched', 'query', '   '),
    jsonb_build_object('kind', 'app_open', 'listing_id', '00000000-0000-4000-8000-0000000ac001', 'at', '2027-03-12T00:00:00Z'),
    jsonb_build_object('kind', 'opened_from', 'listing_id', '00000000-0000-4000-8000-0000000ac001', 'source', 'link', 'at', '2027-03-01T00:00:00Z'),
    'not an object'))),
  '6', 'six of fourteen are kept');
select is((select count(*)::int from public.activity_events where user_id = tests.uid('A') and campus_id = tests.uid('OSU')), 6,
  'stamped with the caller and their campus');
select is((select count(*)::int from public.activity_events where kind = 'deck_shown'), 1, 'a deck card counts once');
select is((select dwell_ms || ':' || source from public.activity_events where kind = 'listing_viewed' and source = 'search'),
  '600000:search', 'dwell is capped at 10 minutes');
select is((select coalesce(dwell_ms::text, 'null') || ':' || coalesce(source, 'null') from public.activity_events
           where kind = 'listing_viewed' and listing_id = '00000000-0000-4000-8000-0000000ac004'),
  'null:null', 'a negative dwell and an unknown source are dropped, a sold listing is fine');
select is((select count(*)::int from public.activity_events where listing_id in
           ('00000000-0000-4000-8000-0000000ac002', '00000000-0000-4000-8000-0000000ac003')), 0,
  'other campuses and deleted listings are dropped');
select is((select query from public.activity_events where kind = 'searched'), left('mini fridge ' || repeat('x', 100), 80),
  'search text is trimmed, spaces squashed, cut to 80');
select is((select coalesce(listing_id::text, 'none') from public.activity_events where kind = 'app_open'), 'none',
  'app_open carries no listing');
select is((select created_at from public.activity_events where kind = 'app_open'), '2027-03-10 12:00:00-05'::timestamptz,
  'a future time becomes now');
select is((select created_at from public.activity_events where kind = 'opened_from'), '2027-03-09 12:00:00-05'::timestamptz,
  'an old time is kept within the last 24 hours');
select is((select string_agg(distinct platform || '/' || app_version, ',') from public.activity_events), 'ios/1.2.3',
  'platform and app version on every row');
select is((select last_platform || ':' || last_app_version || ':' || (last_active_at = '2027-03-10 12:00:00-05'::timestamptz)::text
           from public.profiles where id = tests.uid('A')), 'ios:1.2.3:true', 'the profile records last active, platform and version');
select is(tests.try_text_as(tests.uid('A'), $$select public.track_events('[]', 'windows', '1.0; drop table x') ->> 'accepted'$$), '0',
  'an empty batch is fine');
select is((select last_platform || ':' || last_app_version from public.profiles where id = tests.uid('A')), 'ios:1.2.3',
  'bad platform or version values are ignored');

-- A day later the card counts again.
select tests.set_now('2027-03-11 12:30:00-05');
select is(tests.try_text_as(tests.uid('A'), $$select public.track_events('[{"kind":"deck_shown","listing_id":"00000000-0000-4000-8000-0000000ac001"}]') ->> 'accepted'$$),
  '1', 'a deck card counts again after 24 hours');

-- Rate limit: 120 batches an hour.
insert into public.rate_counters (user_id, action, window_start, count)
values (tests.uid('A'), 'track_events', date_bin('1 hour', '2027-03-11 12:30:00-05'::timestamptz, timestamptz '2000-01-01 00:00:00+00'), 120)
on conflict (user_id, action, window_start) do update set count = 120;
select is(tests.try_text_as(tests.uid('A'), $$select public.track_events('[{"kind":"app_open"}]')::text$$),
  'ERROR: RATE_LIMITED:track_events:2027-03-11T18:00:00Z', 'rate limited at 120 batches an hour');

-- Retention ------------------------------------------------------------------------------------------
insert into public.activity_events (user_id, campus_id, kind, created_at) values
  (tests.uid('B'), tests.uid('OSU'), 'app_open', '2026-12-01 12:00:00-05'),
  (tests.uid('B'), tests.uid('OSU'), 'app_open', '2027-01-01 12:00:00-05');
select is((select private.prune_activity() ->> 'activity_events'), '1', 'events older than 90 days are deleted');
select is((select count(*)::int from public.activity_events where user_id = tests.uid('B')), 1, 'newer ones stay');
select is((select schedule from cron.job where jobname = 'prune_activity'), '45 9 * * *', 'the prune_activity job runs daily');
select is((select command from cron.job where jobname = 'prune_activity'), 'select private.prune_activity()', 'and calls prune_activity');
select is((select schedule from cron.job where jobname = 'prune'), '30 9 * * *', 'the main prune job is unchanged (left swipes stay 30 days)');

-- Deleting the account deletes the events (FK cascade).
delete from auth.users where id = tests.uid('B');
select is((select count(*)::int from public.activity_events where user_id = tests.uid('B')), 0, 'events go with the account');
select is((select count(*)::int from public.activity_events where user_id = tests.uid('A')), 7, 'others keep theirs');
select ok(not has_function_privilege('authenticated', 'private.prune_activity()', 'execute'), 'members cannot run the prune');

select * from finish();
rollback;
