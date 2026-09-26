-- T-INT-RLS-* (TESTING §2.1) and T-INT-RT-01: who can see what, per table.
-- A = osu seller, B = osu buyer, C = osu third party, D = umich,
-- MOD/OWN = admins at aal2, NOMFA = owner at aal1.
begin;
select plan(54);
select tests.create_fixtures();

-- Data -------------------------------------------------------------------------
insert into public.listings (id, campus_id, seller_id, title, status) values
  ('00000000-0000-4000-8000-0000000001a1', tests.uid('OSU'), tests.uid('A'), 'Active lamp', 'active'),
  ('00000000-0000-4000-8000-0000000001a2', tests.uid('OSU'), tests.uid('A'), 'Sold desk', 'sold'),
  ('00000000-0000-4000-8000-0000000001a3', tests.uid('OSU'), tests.uid('A'), 'Held item', 'held_review'),
  ('00000000-0000-4000-8000-0000000001a4', tests.uid('OSU'), tests.uid('A'), 'Deleted chair', 'deleted'),
  ('00000000-0000-4000-8000-0000000001c1', tests.uid('OSU'), tests.uid('C'), 'C bike', 'active'),
  ('00000000-0000-4000-8000-0000000001d1', tests.uid('UMICH'), tests.uid('D'), 'D fridge', 'active');
insert into public.listing_photos (listing_id, idx, path, thumb_path) values
  ('00000000-0000-4000-8000-0000000001a1', 0, 'p1', 't1'),
  ('00000000-0000-4000-8000-0000000001a3', 0, 'p3', 't3');
insert into public.swipes (user_id, listing_id, dir) values (tests.uid('B'), '00000000-0000-4000-8000-0000000001a1', 'left');
insert into public.saves (user_id, listing_id) values (tests.uid('B'), '00000000-0000-4000-8000-0000000001c1');
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, status)
values ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000001a1', tests.uid('B'), tests.uid('A'), 1000, 'accepted');
insert into public.chats (id, listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents)
values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000001a1',
        '00000000-0000-4000-8000-0000000002a1', tests.uid('B'), tests.uid('A'), 'Active lamp', 1200, 1000);
insert into public.messages (chat_id, sender_id, body) values ('00000000-0000-4000-8000-0000000003a1', tests.uid('B'), 'hi');
insert into public.safe_spots (id, campus_id, name, lat, lng, active) values
  ('00000000-0000-4000-8000-0000000005a1', tests.uid('OSU'), 'Library lobby', 40, -83, true),
  ('00000000-0000-4000-8000-0000000005a2', tests.uid('OSU'), 'Old spot', 40, -83, false);
insert into public.meetups (chat_id, spot_id, starts_at)
values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000005a1', now() + interval '1 day');
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up)
values ('00000000-0000-4000-8000-0000000003a1', tests.uid('B'), tests.uid('A'), true);
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason)
values (tests.uid('OSU'), tests.uid('B'), 'user', tests.uid('C')::text, tests.uid('C'), 'spam');
insert into public.strikes (user_id, reason) values (tests.uid('C'), 'test');
insert into public.notifications (user_id, type, grp, title, body) values (tests.uid('A'), 'tip', 'campus', 't', 'b');
insert into public.audit_log (action) values ('test');
insert into public.announcements (campus_id, type, title, body, pinned_until) values
  (tests.uid('OSU'), 'safety', 'Pinned', 'b', now() + interval '1 day'),
  (tests.uid('OSU'), 'news', 'Old', 'b', now() - interval '1 day'),
  (tests.uid('UMICH'), 'news', 'Other campus', 'b', now() + interval '1 day');

-- profiles ---------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.profiles'), '1', 'profiles: A sees only their own row');
select is(tests.try_text_as(tests.uid('A'), format('select count(*)::text from public.profiles where id = %L', tests.uid('B'))),
  '0', 'profiles: A cannot read B''s full row');
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.public_profiles'),
  '6', 'public_profiles: A sees the 6 osu people (not D at umich)');
select ok(tests.try_ok_as(tests.uid('A'), format('update public.profiles set theme_mode = %L where id = %L', 'dark', tests.uid('A'))),
  'profiles: A can change their own theme_mode');
select alike(tests.try_text_as(tests.uid('A'), format('update public.profiles set status = %L where id = %L returning 1', 'active', tests.uid('A'))),
  'ERROR: permission denied%', 'profiles: A cannot change status directly');
select is(tests.try_text_as(tests.uid('A'), format('update public.profiles set theme_mode = %L where id = %L returning 1', 'dark', tests.uid('B'))),
  null, 'profiles: A''s update of B''s row changes nothing');
select is((select theme_mode from public.profiles where id = tests.uid('B')), 'system', 'profiles: B unchanged');

-- campus data --------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), 'select string_agg(slug, '','') from public.campuses'), 'osu', 'campuses: own campus only');
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.campus_domains'), '0', 'campus_domains: users see none');
select is(tests.try_text_as(tests.uid('MOD'), 'select count(*)::text from public.campus_domains'), '0',
  'campus_domains: MOD at aal1 sees none');
select is((select count(*)::int from public.campus_domains), 3, 'campus_domains has 3 fixture rows');
select cmp_ok(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.categories')::int, '>=', 15, 'categories: everyone signed in');
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.app_config'), '6', 'app_config: the 6 public keys');
select is(tests.try_text_as(tests.uid('A'), 'select string_agg(name, '','') from public.safe_spots'),
  'Library lobby', 'safe_spots: active spots on own campus only');
select is(tests.try_text_as(tests.uid('D'), 'select count(*)::text from public.safe_spots'), '0', 'safe_spots: other campus sees none');
select is(tests.try_text_as(tests.uid('A'), 'select string_agg(title, '','') from public.announcements'),
  'Pinned', 'announcements: pinned, own campus');

-- listings -----------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), 'select string_agg(title, '','' order by title) from public.listings where seller_id = auth.uid()'),
  'Active lamp,Held item,Sold desk', 'listings: A sees own in every status except deleted');
select is(tests.try_text_as(tests.uid('B'), 'select string_agg(title, '','' order by title) from public.listings'),
  'Active lamp,C bike,Sold desk', 'listings: B sees active/hold/sold only');
select is(tests.try_text_as(tests.uid('D'), 'select string_agg(title, '','') from public.listings'),
  'D fridge', 'listings: D sees only umich');
select is(tests.try_text_as(tests.uid('B'), 'select count(*)::text from public.listing_photos'), '1',
  'listing_photos: follow the listing (held photo hidden from B)');
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.listing_photos'), '2', 'listing_photos: owner sees both');
select alike(tests.try_text_as(tests.uid('A'), format('update public.listings set status = %L where id = %L returning 1', 'sold', '00000000-0000-4000-8000-0000000001a1')),
  'ERROR: permission denied%', 'listings: no direct updates, even by the seller');

-- swipes / saves -----------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), 'select count(*)::text from public.swipes'), '1', 'swipes: own');
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.swipes'), '0', 'swipes: others see none');
select is(tests.try_text_as(tests.uid('C'), 'select count(*)::text from public.saves'), '0', 'saves: others see none (C cannot see who saved their bike)');

-- deals --------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.offers'), '1', 'offers: seller sees');
select is(tests.try_text_as(tests.uid('B'), 'select count(*)::text from public.offers'), '1', 'offers: buyer sees');
select is(tests.try_text_as(tests.uid('C'), 'select count(*)::text from public.offers'), '0', 'offers: C cannot see the A-B offer');
select is(tests.try_text_as(tests.uid('B'), 'select count(*)::text from public.messages'), '1', 'messages: participant sees');
select is(tests.try_text_as(tests.uid('C'), 'select count(*)::text from public.chats'), '0', 'chats: C sees none');
select is(tests.try_text_as(tests.uid('MOD'), 'select count(*)::text from public.messages'), '0',
  'messages: admins do not read chats directly (only admin_read_reported_chat)');
select alike(tests.try_text_as(tests.uid('A'), format('insert into public.messages (chat_id, sender_id, body) values (%L, %L, %L) returning 1', '00000000-0000-4000-8000-0000000003a1', tests.uid('A'), 'x')),
  'ERROR: permission denied%', 'messages: direct insert denied (only send_message)');
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.meetups'), '1', 'meetups: participants');
select is(tests.try_text_as(tests.uid('C'), 'select count(*)::text from public.meetups'), '0', 'meetups: others none');
select is(tests.try_text_as(tests.uid('B'), 'select count(*)::text from public.ratings'), '1', 'ratings: rater sees own given');
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.ratings'), '0', 'ratings: ratee reads only via ratings_visible');

-- blocks hide listings both ways -------------------------------------------------
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('C'), tests.uid('B'));
select is(tests.try_text_as(tests.uid('B'), $$select count(*)::text from public.listings where title = 'C bike'$$), '0',
  'blocks: B no longer sees the listings of C, who blocked B');
select is(tests.try_text_as(tests.uid('C'), 'select count(*)::text from public.blocks'), '1', 'blocks: blocker sees own');
select is(tests.try_text_as(tests.uid('B'), 'select count(*)::text from public.blocks'), '0', 'blocks: the blocked person does not');
select is(tests.try_text_as(tests.uid('B'), format('select count(*)::text from public.public_profiles where id = %L', tests.uid('C'))),
  '0', 'public_profiles: hidden both ways when blocked');

-- safety -------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), 'select count(*)::text from public.reports'), '0', 'reports: reporter has no direct access');
select is(tests.try_text_as(tests.uid('B'), 'select count(*)::text from public.my_reports'), '1', 'my_reports: reporter sees theirs');
select is(tests.try_text_as(tests.uid('C'), 'select count(*)::text from public.my_reports'), '0', 'my_reports: the reported person sees nothing');
select is(tests.try_text_as(tests.uid('MOD'), 'select count(*)::text from public.reports'), '0', 'reports: MOD at aal1 sees none');
select is(tests.try_text_as(tests.uid('C'), 'select count(*)::text from public.strikes'), '1', 'strikes: own');
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.audit_log'), '0', 'audit_log: users none');
select is(tests.try_text_as(tests.uid('NOMFA'), 'select count(*)::text from public.admins'), '0', 'admins: owner at aal1 sees none');

-- notifications ------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.notifications'), '1', 'notifications: own');
select is(tests.try_text_as(tests.uid('B'), 'select count(*)::text from public.notification_prefs'), '1', 'notification_prefs: own row only (made at signup)');

-- anon ---------------------------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.listings', 'select')
  and not has_table_privilege('anon', 'public.public_profiles', 'select'),
  'anon: no table or view access (reads are RPCs)');

-- Realtime private channels (T-INT-RT-01). Realtime evaluates the policy with
-- realtime.topic() set to the channel being joined; message rows live in daily
-- partitions the Realtime server creates, so this checks the policy and its
-- helper directly instead of inserting rows.
select policies_are('realtime', 'messages', array['realtime_receive_own_topics'],
  'realtime.messages has exactly our receive policy');
select is(
  (select roles::text || ':' || cmd from pg_policies where schemaname = 'realtime' and policyname = 'realtime_receive_own_topics'),
  '{authenticated}:SELECT', 'the policy is SELECT for authenticated only');
select is(tests.try_text_as(tests.uid('A'), $$select private.is_chat_participant('00000000-0000-4000-8000-0000000003a1')::text$$),
  'true', 'realtime: participant may join chat:{id}');
select is(tests.try_text_as(tests.uid('C'), $$select private.is_chat_participant('00000000-0000-4000-8000-0000000003a1')::text$$),
  'false', 'realtime: C may not join chat:{A-B}');

select * from finish();
rollback;
