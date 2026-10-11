-- Admin v2 reads (0207, DEC 93; API §4.1): overview, activity feed, one
-- student (header and tabs), one listing's activity, people list, audit log
-- and search. Checks: students, owners without MFA and moderators of another
-- campus are refused (T-INT-ADMIN-01); moderators only see their campus and a
-- masked email; every read about one named student writes a 'person.view'
-- audit row (tabs at most once per 30 minutes per admin and person), the
-- listing page writes 'listing.activity_view', lists and search write nothing;
-- no read ever returns a chat message's text.
begin;
select plan(68);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

create function pg_temp.as_admin(who text, q text, aal text default 'aal2') returns text language plpgsql as $$
declare
  res text;
begin
  perform tests.authenticate_as(tests.uid(who), aal);
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;
create function pg_temp.audits() returns int language sql as $$ select count(*)::int from public.audit_log $$;

-- A small campus world ---------------------------------------------------------------------------
insert into public.listings (id, campus_id, seller_id, title, status, price_cents, category_id, created_at, sold_at, sold_in_app, buyer_id) values
  ('00000000-0000-4000-8000-0000000b0001', tests.uid('OSU'), tests.uid('B'), 'Desk lamp', 'active', 1200, 1, '2027-03-08 09:00-05', null, null, null),
  ('00000000-0000-4000-8000-0000000b0002', tests.uid('OSU'), tests.uid('B'), 'City bike', 'hold', 12000, 6, '2027-03-09 09:00-05', null, null, null),
  ('00000000-0000-4000-8000-0000000b0003', tests.uid('UMICH'), tests.uid('D'), 'Michigan mug', 'active', 500, 5, '2027-03-09 10:00-05', null, null, null),
  ('00000000-0000-4000-8000-0000000b0004', tests.uid('OSU'), tests.uid('B'), 'Bio textbooks', 'sold', 3500, 2, '2027-03-01 09:00-05', '2027-03-09 15:00-05', true, tests.uid('C')),
  ('00000000-0000-4000-8000-0000000b0005', tests.uid('OSU'), tests.uid('C'), 'Road bike', 'active', 20000, 6, '2027-03-05 09:00-05', null, null, null);
insert into public.listing_price_changes (listing_id, old_cents, new_cents, changed_at) values
  ('00000000-0000-4000-8000-0000000b0002', 15000, 12000, '2027-03-09 18:00-05');
insert into public.swipes (user_id, listing_id, dir, created_at) values
  (tests.uid('A'), '00000000-0000-4000-8000-0000000b0001', 'left', '2027-03-10 10:41-05'),
  (tests.uid('C'), '00000000-0000-4000-8000-0000000b0002', 'save', '2027-03-10 10:42-05'),
  (tests.uid('A'), '00000000-0000-4000-8000-0000000b0005', 'left', '2027-03-10 10:43-05');
insert into public.saves (user_id, listing_id, price_at_save, created_at) values
  (tests.uid('C'), '00000000-0000-4000-8000-0000000b0002', 12000, '2027-03-10 10:42-05');
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, status, round, last_actor, created_at, responded_at) values
  ('00000000-0000-4000-8000-0000000b0f01', '00000000-0000-4000-8000-0000000b0002', tests.uid('A'), tests.uid('B'), 11000,
   'accepted', 2, 'seller', '2027-03-10 10:35-05', '2027-03-10 10:50-05');
insert into public.chats (id, listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, created_at, last_message_at) values
  ('00000000-0000-4000-8000-0000000b0c01', '00000000-0000-4000-8000-0000000b0002', '00000000-0000-4000-8000-0000000b0f01',
   tests.uid('A'), tests.uid('B'), 'City bike', 12000, 11000, '2027-03-10 10:50-05', '2027-03-10 11:00-05'),
  ('00000000-0000-4000-8000-0000000b0c02', '00000000-0000-4000-8000-0000000b0004', null,
   tests.uid('C'), tests.uid('B'), 'Bio textbooks', 3500, 3000, '2027-03-08 10:00-05', '2027-03-09 15:00-05');
insert into public.messages (chat_id, sender_id, body, created_at) values
  ('00000000-0000-4000-8000-0000000b0c01', tests.uid('A'), 'SECRET-TEXT-123 meet at the library?', '2027-03-10 10:55-05'),
  ('00000000-0000-4000-8000-0000000b0c01', tests.uid('B'), 'SECRET-TEXT-456 sure', '2027-03-10 11:00-05');
insert into public.meetups (id, chat_id, custom_place, starts_at, status, proposed_by, confirmed_at, buyer_here_at, created_at) values
  ('00000000-0000-4000-8000-0000000b0e01', '00000000-0000-4000-8000-0000000b0c01', 'Library steps', '2027-03-10 15:00-05',
   'confirmed', tests.uid('A'), '2027-03-10 11:05-05', '2027-03-10 11:58-05', '2027-03-10 11:01-05');
insert into public.reports (id, campus_id, reporter_id, target_type, target_id, target_user_id, reason, priority, created_at) values
  ('00000000-0000-4000-8000-0000000b0a01', tests.uid('OSU'), tests.uid('C'), 'user', tests.uid('A')::text, tests.uid('A'),
   'harassment', 2, '2027-03-10 07:00-05');
insert into public.blocks (blocker_id, blocked_id, created_at) values (tests.uid('A'), tests.uid('C'), '2027-03-09 20:00-05');
insert into public.activity_events (user_id, campus_id, kind, listing_id, source, dwell_ms, query, platform, created_at) values
  (tests.uid('A'), tests.uid('OSU'), 'deck_shown', '00000000-0000-4000-8000-0000000b0002', 'discover', null, null, 'ios', '2027-03-10 10:20-05'),
  (tests.uid('A'), tests.uid('OSU'), 'listing_viewed', '00000000-0000-4000-8000-0000000b0002', 'search', 41000, null, 'ios', '2027-03-10 10:30-05'),
  (tests.uid('A'), tests.uid('OSU'), 'offer_made', '00000000-0000-4000-8000-0000000b0002', null, 9000, null, 'ios', '2027-03-10 10:35-05'),
  (tests.uid('A'), tests.uid('OSU'), 'searched', null, null, null, 'bike', 'ios', '2027-03-10 10:25-05'),
  (tests.uid('D'), tests.uid('UMICH'), 'app_open', null, null, null, null, 'android', '2027-03-10 10:00-05');
update public.profiles set last_active_at = '2027-03-10 11:58-05', last_platform = 'ios', last_app_version = '1.4.0', year = 'junior'
 where id = tests.uid('A');
insert into public.activity_days (user_id, day) values (tests.uid('A'), '2027-03-10'), (tests.uid('B'), '2027-03-10'), (tests.uid('A'), '2027-03-03');

-- T-INT-ADMIN-01 for the new reads ------------------------------------------------------------------
select is(pg_temp.as_admin('A', $$select public.admin_overview_v2()::text$$), 'ERROR: NOT_ADMIN', 'students are refused');
select is(pg_temp.as_admin('NOMFA', $$select public.admin_overview_v2()::text$$, 'aal1'), 'ERROR: NOT_ADMIN', 'an owner without MFA is refused');
select is(pg_temp.as_admin('MOD', format($$select public.admin_overview_v2(%L)::text$$, tests.uid('UMICH'))), 'ERROR: NOT_ADMIN',
  'a moderator cannot ask for another campus');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('admin_overview_v2', 'admin_activity_feed', 'admin_person', 'admin_person_timeline',
             'admin_person_offers', 'admin_person_listings', 'admin_person_chats', 'admin_person_meetups', 'admin_person_reports',
             'admin_person_access_log', 'admin_listing_activity', 'admin_list_users_v2', 'admin_list_audit_v2', 'admin_search')
             and has_function_privilege('anon', p.oid, 'execute')), 0, 'anon can run none of them');

-- Overview ---------------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select (x ->> 'campus_id') || ':' || (x -> 'kpis' -> 'students' ->> 'value') || ':' || jsonb_array_length(x -> 'campuses')
                                    from public.admin_overview_v2() x$$),
  tests.uid('OSU') || ':6:1', 'a moderator gets their campus: 6 students, one campus row');
select is(pg_temp.as_admin('OWN', $$select (x -> 'kpis' -> 'students' ->> 'value') || ':' || jsonb_array_length(x -> 'campuses') from public.admin_overview_v2() x$$),
  '7:2', 'the owner sees every campus');
select is(pg_temp.as_admin('MOD', $$select jsonb_array_length(x -> 'kpis' -> 'active_today' -> 'series') || ':' || (x -> 'kpis' -> 'active_today' ->> 'value')
                                    || ':' || (x -> 'kpis' -> 'active_today' ->> 'same_day_last_week') from public.admin_overview_v2() x$$),
  '14:2:1', 'active today, the same day last week, and a 14-day series');
select is(pg_temp.as_admin('MOD', $$select (x -> 'kpis' -> 'offers_today' ->> 'value') || ':' || (x -> 'kpis' -> 'listings_live' ->> 'value')
                                    || ':' || (x -> 'kpis' -> 'listings_live' ->> 'new_7d') from public.admin_overview_v2() x$$),
  '1:3:3', 'offers today; live listings (active or on hold) and new this week');
select is(pg_temp.as_admin('MOD', $$select (x -> 'kpis' -> 'deals_7d' ->> 'value') || ':' || (x -> 'kpis' -> 'deals_7d' ->> 'agreed_cents')
                                    from public.admin_overview_v2() x$$),
  '1:3000', 'deals done in 7 days and the agreed total');
select is(pg_temp.as_admin('MOD', $$select (x -> 'kpis' -> 'open_reports' ->> 'value') || ':' || ((x -> 'kpis' -> 'open_reports' ->> 'oldest_at')::timestamptz = '2027-03-10 07:00-05')::text
                                    || ':' || (x -> 'needs_attention' -> 'reports' -> 0 ->> 'reason') from public.admin_overview_v2() x$$),
  '1:true:harassment', 'open reports with the oldest age, listed under needs attention');
select is(pg_temp.as_admin('OWN', $$select string_agg((c ->> 'short_name') || '=' || (c ->> 'waitlist') || '/' || (c ->> 'unlock_threshold'), ',')
                                    from public.admin_overview_v2() x, jsonb_array_elements(x -> 'campuses') c$$),
  'Ohio State=0/500,Michigan=1/500', 'campuses with their waitlist and threshold');
select is(pg_temp.audits(), 0, 'the overview is not logged');

-- Activity feed ----------------------------------------------------------------------------------------
select ok(pg_temp.as_admin('OWN', $$select public.admin_activity_feed()::text$$) not like '%SECRET-TEXT%', 'the feed never carries message text');
select is(pg_temp.as_admin('OWN', $$select string_agg(i ->> 'kind', ',' order by i ->> 'kind') from jsonb_array_elements(public.admin_activity_feed(
                                      since => '2027-03-10 00:00-05') -> 'items') i$$),
  'app_open,chat_opened,listing_viewed,meetup_checked_in,meetup_confirmed,meetup_set,message_sent,message_sent,offer_accepted,offer_made,saved,searched,swiped_left,swiped_left',
  'today: every kind from the real tables and the app events, deck cards left out');
select is(pg_temp.as_admin('OWN', $$select (i -> 'person' ->> 'display_name') || ' saved ' || (i -> 'listing' ->> 'title') || ' for ' || (i -> 'listing' ->> 'price_cents')
                                    from jsonb_array_elements(public.admin_activity_feed(kinds => array['saved']) -> 'items') i$$),
  'Cam C. saved City bike for 12000', 'a kind filter, with the person and the listing');
select is(pg_temp.as_admin('OWN', $$select (i -> 'person' ->> 'display_name') || ':' || (i -> 'other' ->> 'display_name') || ':' || (i -> 'details' ->> 'agreed_cents')
                                    from jsonb_array_elements(public.admin_activity_feed(kinds => array['deal_done']) -> 'items') i$$),
  'Ben B.:Cam C.:3000', 'deals done show the seller, the buyer and the agreed price');
select is(pg_temp.as_admin('OWN', $$select (i ->> 'platform') || ':' || (i -> 'details' ->> 'dwell_ms') || ':' || (i -> 'details' ->> 'source')
                                    from jsonb_array_elements(public.admin_activity_feed(kinds => array['listing_viewed']) -> 'items') i$$),
  'ios:41000:search', 'views carry time on page, where they came from and the device');
select is(pg_temp.as_admin('OWN', $$select jsonb_array_length(public.admin_activity_feed(kinds => array['deck_shown']) -> 'items')::text$$),
  '1', 'deck cards when asked for');
select is(pg_temp.as_admin('OWN', $$select (i ->> 'kind') || ':' || (i -> 'person' ->> 'display_name')
                                    from jsonb_array_elements(public.admin_activity_feed(kinds => array['offer_accepted']) -> 'items') i$$),
  'offer_accepted:Aisha A.', 'accepting a counter is the buyer''s action');
select is(pg_temp.as_admin('OWN', $$
  with p1 as (select public.admin_activity_feed(since => '2027-03-10 00:00-05', "limit" => 5) as r),
       p2 as (select public.admin_activity_feed(since => '2027-03-10 00:00-05', "limit" => 50, cursor => (select r -> 'next_cursor' from p1)) as r)
  select jsonb_array_length((select r -> 'items' from p1)) || '+' || jsonb_array_length((select r -> 'items' from p2)) || ':'
         || (select count(*) from jsonb_array_elements((select r -> 'items' from p1)) a join jsonb_array_elements((select r -> 'items' from p2)) b on a ->> 'id' = b ->> 'id')
         || ':' || coalesce((select r ->> 'next_cursor' from p2), 'end')$$),
  '5+9:0:end', 'cursor paging: no overlap, no gap, then the end');
select is(pg_temp.as_admin('MOD', $$select count(*)::text from jsonb_array_elements(public.admin_activity_feed() -> 'items') i
                                    where i ->> 'campus_id' <> (select campus_id::text from public.admins where user_id = auth.uid())$$),
  '0', 'a moderator''s feed has only their campus');
select is(pg_temp.as_admin('MOD', format($$select public.admin_activity_feed(%L)::text$$, tests.uid('UMICH'))), 'ERROR: NOT_ADMIN',
  'and cannot ask for another');
select is(pg_temp.audits(), 0, 'the unfiltered feed is not logged');
select is(pg_temp.as_admin('MOD', format($$select jsonb_array_length(public.admin_activity_feed(user_id => %L) -> 'items')::text$$, tests.uid('A'))),
  '13', 'the feed for one person (their actions and deals they are in)');
select is((select action || ':' || target_type || ':' || target_id || ':' || reason || ':' || (meta ->> 'tab') from public.audit_log),
  'person.view:user:' || tests.uid('A') || ':view:activity', 'filtering to one person logs a look');
select is(pg_temp.as_admin('MOD', format($$select public.admin_activity_feed(user_id => %L)::text$$, tests.uid('D'))), 'ERROR: NOT_ADMIN',
  'not a person on another campus');

-- One student ----------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', format($$select (x -> 'person' ->> 'email') || ':' || (x -> 'person' ->> 'email_masked') from public.admin_person(%L) x$$, tests.uid('A'))),
  'a••••@osu.edu:true', 'moderators see a masked email');
select is(pg_temp.as_admin('OWN', format($$select (x -> 'person' ->> 'email') || ':' || (x -> 'person' ->> 'email_masked') from public.admin_person(%L) x$$, tests.uid('A'))),
  'a@osu.edu:false', 'the owner sees the address');
select is(pg_temp.as_admin('MOD', format($$select public.admin_person(%L)::text$$, tests.uid('D'))), 'ERROR: NOT_ADMIN', 'not another campus');
select is(pg_temp.as_admin('OWN', $$select public.admin_person('00000000-0000-4000-8000-00000000ffff')::text$$), 'ERROR: NOT_FOUND', 'unknown person');
select is(pg_temp.as_admin('MOD', format($$select (x -> 'person' ->> 'last_platform') || ':' || (x -> 'person' ->> 'last_app_version') || ':' || (x -> 'person' ->> 'year')
                                           || ':' || (x -> 'person' -> 'campus' ->> 'short_name') from public.admin_person(%L) x$$, tests.uid('A'))),
  'ios:1.4.0:junior:Ohio State', 'header facts');
select is(pg_temp.as_admin('MOD', format($$select x -> 'counts' ->> 'swipes' || ':' || (x -> 'counts' ->> 'left') || ':' || (x -> 'counts' ->> 'offers_made')
                                           || ':' || (x -> 'counts' ->> 'chats') || ':' || (x -> 'counts' ->> 'meetups') || ':' || (x -> 'counts' ->> 'reports_on_them')
                                           || ':' || (x -> 'counts' ->> 'blocks_made') || ':' || (x -> 'counts' ->> 'blocks_received') from public.admin_person(%L) x$$, tests.uid('A'))),
  '2:2:1:1:1:1:1:0', 'counts: swipes, left, offers, chats, meetups, reports on them, blocks');
select is(pg_temp.as_admin('MOD', format($$select (x -> 'affinity' -> 0 ->> 'slug') || ':' || (x -> 'affinity' -> 0 ->> 'share') || ':' || jsonb_array_length(x -> 'hourly')
                                           || ':' || (x -> 'hourly' ->> 10) from public.admin_person(%L) x$$, tests.uid('A'))),
  'bikes-scooters:100:24:8', 'what they like (right swipes by category) and when they''re active (campus hours)');
select is(pg_temp.as_admin('MOD', format($$select (x -> 'blocks' -> 'made' -> 0 ->> 'display_name') || ':' || jsonb_array_length(x -> 'blocks' -> 'received')
                                           from public.admin_person(%L) x$$, tests.uid('A'))),
  'Cam C.:0', 'blocks made and received');
select is((select count(*)::int from public.audit_log where action = 'person.view' and meta ->> 'tab' = 'overview' and target_id = tests.uid('A')::text), 6,
  'every opening of the page is logged (5 by the moderator, 1 by the owner)');

-- Tabs: one row per admin and person per 30 minutes.
select is(pg_temp.audits(), 7, 'seven rows so far');
select ok(pg_temp.as_admin('OWN', format($$select public.admin_person_timeline(%L)::text$$, tests.uid('A'))) not like '%SECRET%', 'the timeline has no message text');
select is(pg_temp.audits(), 7, 'the owner looked at A less than 30 minutes ago: no new row');
select is(pg_temp.as_admin('OWN', format($$select public.admin_person_timeline(%L)::text$$, tests.uid('B'))) like '%deal_done%', true, 'B''s timeline has the deal');
select is(pg_temp.audits(), 8, 'a first look at B is logged');
select is((select meta ->> 'tab' from public.audit_log order by id desc limit 1), 'timeline', 'with the tab');
select tests.set_now('2027-03-10 12:45:00-05');
select is(pg_temp.as_admin('OWN', format($$select (x -> 'items' -> 0 ->> 'role') || ':' || (x -> 'items' -> 0 ->> 'status') || ':' || (x -> 'items' -> 0 ->> 'asking_cents')
                                           from public.admin_person_offers(%L) x$$, tests.uid('A'))),
  'buyer:accepted:12000', 'offers tab');
select is(pg_temp.audits(), 9, 'after 30 minutes a tab logs again');
select is(pg_temp.as_admin('OWN', format($$select (x -> 'items' -> 0 ->> 'message_count') || ':' || (x -> 'items' -> 0 ->> 'their_message_count') || ':'
                                           || (x -> 'items' -> 0 ->> 'reported') || ':' || (x -> 'items' -> 0 -> 'other' ->> 'display_name') from public.admin_person_chats(%L) x$$, tests.uid('A'))),
  '2:1:false:Ben B.', 'chats tab: counts and who, not words');
select ok(pg_temp.as_admin('OWN', format($$select public.admin_person_chats(%L)::text$$, tests.uid('A'))) not like '%SECRET%', 'no message text in the chats tab');
select is(pg_temp.as_admin('OWN', format($$select jsonb_array_length(x -> 'items') || ':' || (x -> 'items' -> 0 ->> 'title') from public.admin_person_listings(%L) x$$, tests.uid('B'))),
  '3:City bike', 'listings tab');
select is(pg_temp.as_admin('OWN', format($$select (x -> 'items' -> 0 ->> 'status') || ':' || (x -> 'items' -> 0 ->> 'place') || ':' || ((x -> 'items' -> 0 ->> 'their_check_in') is not null)::text
                                           || ':' || coalesce(x -> 'items' -> 0 ->> 'other_check_in', 'none') from public.admin_person_meetups(%L) x$$, tests.uid('A'))),
  'confirmed:Library steps:true:none', 'meetups tab with check-ins');
select is(pg_temp.as_admin('OWN', format($$select (x -> 'against' -> 0 ->> 'reason') || ':' || (x -> 'against' -> 0 -> 'reporter' ->> 'display_name') || ':' || jsonb_array_length(x -> 'by_them')
                                           from public.admin_person_reports(%L) x$$, tests.uid('A'))),
  'harassment:Cam C.:0', 'reports tab');
select is(pg_temp.audits(), 10, 'B''s listings tab logs (B''s last look was 45 minutes ago); A''s other tabs within 30 minutes add nothing');
select is(pg_temp.as_admin('MOD', format($$select jsonb_array_length(x -> 'items') || ':' || (x -> 'items' -> 0 -> 'actor' ->> 'display_name') || ':' || (x -> 'items' -> 0 ->> 'action')
                                           from public.admin_person_access_log(%L) x$$, tests.uid('A'))),
  '8:Olive O.:person.view', 'the access log lists every look, newest first');
select is(pg_temp.audits(), 10, 'reading the access log is not itself logged');

-- One listing ------------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select string_agg((w -> 'person' ->> 'display_name') || '=' || (w ->> 'direction') || '/' || coalesce(w ->> 'dwell_ms', '-')
                                                       || '/' || (w ->> 'viewed_first'), ',' order by w ->> 'direction')
                                    from jsonb_array_elements(public.admin_listing_activity('00000000-0000-4000-8000-0000000b0002') -> 'who_swiped') w$$),
  'Aisha A.=offered/9000/true,Cam C.=saved/-/false', 'who swiped: direction, time on card, whether they opened it first');
select is((select action || ':' || target_type || ':' || target_id from public.audit_log order by id desc limit 1),
  'listing.activity_view:listing:00000000-0000-4000-8000-0000000b0002', 'the listing page is logged');
select is(pg_temp.as_admin('MOD', $$select (x -> 'funnel' ->> 'shown') || ':' || (x -> 'funnel' ->> 'viewed') || ':' || (x -> 'funnel' ->> 'saved') || ':'
                                    || (x -> 'funnel' ->> 'offered') || ':' || (x -> 'funnel' ->> 'sold') || ':' || (x -> 'swipes' ->> 'right') || ':' || (x -> 'swipes' ->> 'left')
                                    || ':' || (x -> 'price_history' -> 0 ->> 'old_cents') || ':' || (x -> 'comparison' ->> 'right_rate')
                                    from public.admin_listing_activity('00000000-0000-4000-8000-0000000b0002') x$$),
  '1:1:1:1:false:2:0:15000:100.0', 'funnel, right vs left, price history, right-swipe rate');
select is(pg_temp.as_admin('MOD', $$select (x -> 'comparison' ->> 'category_right_rate') || ':' || (x -> 'comparison' ->> 'category_swipes')
                                    from public.admin_listing_activity('00000000-0000-4000-8000-0000000b0002') x$$),
  '0.0:1', 'and the same category on the campus (the road bike: one left swipe)');
select is(pg_temp.as_admin('MOD', $$select public.admin_listing_activity('00000000-0000-4000-8000-0000000b0003')::text$$), 'ERROR: NOT_ADMIN',
  'not a listing on another campus');

-- People list ------------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select (x ->> 'total') || ':' || (x -> 'items' -> 0 ->> 'display_name') || ':' || (x -> 'items' -> 0 ->> 'email')
                                    || ':' || (x -> 'items' -> 0 -> 'campus' ->> 'short_name') || ':' || (x -> 'items' -> 0 ->> 'swipes') || ':' || (x -> 'items' -> 0 ->> 'reports')
                                    from public.admin_list_users_v2() x$$),
  '6:Aisha A.:a••••@osu.edu:Ohio State:2:1', 'a moderator''s people list: their campus, last active first, masked emails, counts');
select is(pg_temp.as_admin('OWN', $$select (x ->> 'total') || ':' || (x -> 'items' -> 0 ->> 'email') from public.admin_list_users_v2('{"q": "C@osu.edu"}') x$$),
  '1:c@osu.edu', 'the owner finds someone by exact email');
select is(pg_temp.as_admin('MOD', $$select x ->> 'total' from public.admin_list_users_v2('{"q": "c@osu.edu"}') x$$), '0', 'moderators cannot search by email');
select is(pg_temp.as_admin('OWN', $$select (x ->> 'total') || ':' || (x -> 'items' -> 0 ->> 'deals') from public.admin_list_users_v2('{"sort": "name", "q": "Ben"}') x$$),
  '1:1', 'name search and deal count');
select is(pg_temp.as_admin('OWN', $$select public.admin_list_users_v2('{"sort": "age"}')::text$$), 'ERROR: INVALID:sort', 'known sorts only');
select is(pg_temp.as_admin('OWN', $$select string_agg(i ->> 'display_name', ',') from jsonb_array_elements(public.admin_list_users_v2('{"status": "waitlist"}') -> 'items') i$$),
  'Dana D.', 'status filter');

-- Audit log v2 -----------------------------------------------------------------------------------------
select is(pg_temp.as_admin('OWN', format($$select (x -> 'items' -> 0 ->> 'target_label') || ':' || jsonb_array_length(x -> 'items') || ':' || coalesce(x ->> 'next_cursor', 'end')
                                           from public.admin_list_audit_v2(jsonb_build_object('action', 'person.', 'target_id', %L)) x$$, tests.uid('B'))),
  'Ben B.:2:end', 'filters by action and target, with a readable label');
select is(pg_temp.as_admin('OWN', $$select jsonb_array_length(public.admin_list_audit_v2('{"since": "2027-03-11T00:00:00Z"}') -> 'items')::text$$),
  '0', 'time filter');

-- Search -----------------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select (x -> 'listings' -> 0 ->> 'title') || ':' || jsonb_array_length(x -> 'listings') || ':' || jsonb_array_length(x -> 'people')
                                    from public.admin_search('bike') x$$),
  'City bike:2:0', 'search finds listings by title');
select is(pg_temp.as_admin('MOD', $$select jsonb_array_length(x -> 'listings') || ':' || jsonb_array_length(x -> 'people') from public.admin_search('Michigan') x$$),
  '0:0', 'moderators don''t find other campuses');
select is(pg_temp.as_admin('OWN', $$select (x -> 'reports' -> 0 ->> 'reason') || ':' || jsonb_array_length(x -> 'people') from public.admin_search('00000000-0000-4000-8000-0000000b0a') x$$),
  'harassment:0', 'a report id prefix finds the report');
select is(pg_temp.as_admin('OWN', $$select public.admin_search('x')::text$$), 'ERROR: INVALID:q', 'two characters at least');

select * from finish();
rollback;
