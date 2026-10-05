-- S51 data export (0205; P11-ACC-02, API §5 export-data):
-- T-INT-EXPORT-01 the JSON holds every data category in the privacy policy
-- (apps/site/src/content/legal/privacy.md §1) for the caller, and nothing
-- private about anyone else: no other user's id anywhere, other people only by
-- the name the app already shows, the caller's own Quad posts and replies only
-- (T-INT-QUAD-ANON). Plus the start/finish/fail steps the Edge Function runs
-- with the service role: 1 a day, failed runs don't count, the email is queued
-- once with the link.
begin;
select plan(44);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

-- Aisha (A) sells a desk to Ben (B), buys a lamp from Cam (C), posts on the Quad.
insert into public.listings (id, campus_id, seller_id, title, description, status, price_cents, category_id, condition, buyer_id, sold_at) values
  ('00000000-0000-4000-8000-0000000e1001', tests.uid('OSU'), tests.uid('A'), 'Oak desk', 'Solid, a bit scratched', 'sold', 4000,
   (select min(id) from public.categories), 'good', tests.uid('B'), '2027-03-05'),
  ('00000000-0000-4000-8000-0000000e1002', tests.uid('OSU'), tests.uid('C'), 'Cam lamp', 'Warm light', 'active', 1500, null, null, null, null),
  ('00000000-0000-4000-8000-0000000e1003', tests.uid('OSU'), tests.uid('B'), 'Ben bike secret', 'Not Aisha''s', 'active', 9000, null, null, null, null);
insert into public.listing_photos (listing_id, idx, path, thumb_path) values
  ('00000000-0000-4000-8000-0000000e1001', 0, 'c/osu/l/e1001/0.webp', 'c/osu/l/e1001/0_t.webp');
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, note, status) values
  ('00000000-0000-4000-8000-0000000e2001', '00000000-0000-4000-8000-0000000e1001', tests.uid('B'), tests.uid('A'), 3500, 'can pick up today', 'accepted'),
  ('00000000-0000-4000-8000-0000000e2002', '00000000-0000-4000-8000-0000000e1002', tests.uid('A'), tests.uid('C'), 1200, null, 'pending'),
  ('00000000-0000-4000-8000-0000000e2003', '00000000-0000-4000-8000-0000000e1003', tests.uid('C'), tests.uid('B'), 8000, 'Cam to Ben only', 'pending');
insert into public.chats (id, listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, seller_outcome) values
  ('00000000-0000-4000-8000-0000000e3001', '00000000-0000-4000-8000-0000000e1001', '00000000-0000-4000-8000-0000000e2001',
   tests.uid('B'), tests.uid('A'), 'Oak desk', 4000, 3500, 'done'),
  ('00000000-0000-4000-8000-0000000e3002', '00000000-0000-4000-8000-0000000e1003', '00000000-0000-4000-8000-0000000e2003',
   tests.uid('C'), tests.uid('B'), 'Ben bike secret', 9000, 8000, null);
insert into public.messages (chat_id, sender_id, kind, body) values
  ('00000000-0000-4000-8000-0000000e3001', tests.uid('B'), 'text', 'hi, is 4:30 ok?'),
  ('00000000-0000-4000-8000-0000000e3001', tests.uid('A'), 'text', 'yes, see you at the Union'),
  ('00000000-0000-4000-8000-0000000e3001', null, 'system', 'Deal done'),
  ('00000000-0000-4000-8000-0000000e3002', tests.uid('C'), 'text', 'a chat Aisha is not in');
insert into public.meetups (chat_id, custom_place, starts_at, status, proposed_by, confirmed_at) values
  ('00000000-0000-4000-8000-0000000e3001', 'Union lobby', '2027-03-05 16:30-05', 'completed', tests.uid('B'), '2027-03-05 10:00-05');
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up, tags, comment, created_at) values
  ('00000000-0000-4000-8000-0000000e3001', tests.uid('A'), tests.uid('B'), true, '{on_time}', 'smooth', '2027-03-06'),
  ('00000000-0000-4000-8000-0000000e3001', tests.uid('B'), tests.uid('A'), true, '{friendly}', 'great desk', '2027-03-06');
insert into public.saves (user_id, listing_id, price_at_save) values (tests.uid('A'), '00000000-0000-4000-8000-0000000e1002', 1500);
insert into public.saved_searches (user_id, campus_id, query) values (tests.uid('A'), tests.uid('OSU'), 'mini fridge');
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('A'), tests.uid('C'));
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason) values
  (tests.uid('OSU'), tests.uid('A'), 'user', tests.uid('C')::text, tests.uid('C'), 'harassment'),
  (tests.uid('OSU'), tests.uid('B'), 'user', tests.uid('A')::text, tests.uid('A'), 'spam');
insert into public.strikes (user_id, reason) values (tests.uid('A'), 'spam');
insert into public.appeals (user_id, subject_type, subject_id, body) values (tests.uid('A'), 'strike', 'x1', 'it was a mistake');
insert into public.push_tokens (user_id, token, platform) values (tests.uid('A'), 'ExponentPushToken[abcdef123456]', 'ios');
select private.queue_notification(tests.uid('A'), 'offer_new', 'offers', 'New offer', 'Ben offered $35', '{}'::jsonb, true, 'x:1');
insert into public.quad_posts (id, campus_id, author_id, body) values
  ('00000000-0000-4000-8000-0000000e4001', tests.uid('OSU'), tests.uid('A'), 'Aisha asks: best study spot?'),
  ('00000000-0000-4000-8000-0000000e4002', tests.uid('OSU'), tests.uid('B'), 'Ben anonymous rant');
insert into public.quad_replies (post_id, author_id, body, alias_no) values
  ('00000000-0000-4000-8000-0000000e4001', tests.uid('B'), 'Ben reply on Aisha post', 1),
  ('00000000-0000-4000-8000-0000000e4002', tests.uid('A'), 'Aisha reply on Ben post', 1);
insert into public.quad_votes (user_id, target_type, target_id, value) values (tests.uid('A'), 'post', '00000000-0000-4000-8000-0000000e4002', -1);
insert into public.quad_hides (user_id, hidden_author_id, source_post_id, excerpt) values
  (tests.uid('A'), tests.uid('B'), '00000000-0000-4000-8000-0000000e4002', 'Ben anonymous rant');
insert into public.quad_mutes (user_id, keyword) values (tests.uid('A'), 'finals');

create temp table x as select private.export_user_data(tests.uid('A')) as j;

-- T-INT-EXPORT-01: every category in the privacy policy -------------------------------------------
select is((select j #>> '{account,email}' from x), 'a@osu.edu', 'school email');
select is((select (j #>> '{profile,first_name}') || ' ' || (j #>> '{profile,display_name}') from x), 'Aisha Aisha A.', 'profile');
select ok((select j #> '{profile}' ?& array['year', 'areas', 'bio', 'avatar_path'] from x), 'class year, interests, bio, photo');
select ok((select (j #>> '{account,age_confirmed_at}') is not null and j #>> '{account,age_method}' = 'self_declared' from x), 'age confirmation');
select is((select j #>> '{account,campus,slug}' from x), 'osu', 'campus');
select is((select jsonb_array_length(j -> 'listings') from x), 1, 'own listings only');
select is((select j #>> '{listings,0,photos,0,path}' from x), 'c/osu/l/e1001/0.webp', 'with photo paths');
select is((select (j #>> '{listings,0,price_cents}') || ':' || (j #>> '{listings,0,status}') from x), '4000:sold', 'prices and status');
select is((select string_agg((o ->> 'role') || ':' || (o ->> 'amount_cents') || ':' || (o ->> 'other_person'), ',' order by o ->> 'role')
           from x, jsonb_array_elements(j -> 'offers') o),
  'buyer:1200:Cam C.,seller:3500:Ben B.', 'offers made and received, the other person by name');
select is((select jsonb_array_length(j -> 'chats') from x), 1, 'only the chats Aisha is in');
select is((select string_agg((m ->> 'from') || ':' || (m ->> 'body'), '|') from x, jsonb_array_elements(j #> '{chats,0,messages}') m),
  'them:hi, is 4:30 ok?|me:yes, see you at the Union|system:Deal done', 'messages as she sees them');
select is((select (j #>> '{chats,0,other_person}') || ':' || (j #>> '{chats,0,my_outcome}') from x), 'Ben B.:done', 'chat partner by name, her outcome');
select is((select (j #>> '{chats,0,meetups,0,place}') || ':' || (j #>> '{chats,0,meetups,0,status}') || ':' || (j #>> '{chats,0,meetups,0,proposed_by_me}') from x),
  'Union lobby:completed:false', 'meetup plans');
select is((select (j #>> '{ratings_given,0,comment}') || ':' || (j #>> '{ratings_received,0,comment}') || ':' || (j #>> '{ratings_received,0,from}') from x),
  'smooth:great desk:Ben B.', 'ratings given and received');
select is((select (j #>> '{saved,0,title}') || ':' || (j #>> '{saved_searches,0,query}') from x), 'Cam lamp:mini fridge', 'saved items and searches');
select is((select j #>> '{blocks,0,blocked}' from x), 'Cam C.', 'blocks');
select is((select (j #>> '{reports_made,0,target_name}') || ':' || (j #>> '{reports_made,0,reason}') || ':' || coalesce(j #>> '{reports_made,0,target_id}', 'no id') from x),
  'Cam C.:harassment:no id', 'reports she made, the person by name');
select is((select jsonb_array_length(j -> 'reports_made') from x), 1, 'not reports others made about her');
select is((select (j #>> '{strikes,0,reason}') || ':' || (j #>> '{appeals,0,body}') from x), 'spam:it was a mistake', 'strikes and appeals');
select is((select (j #>> '{push_tokens,0,platform}') || ':' || (j #>> '{push_tokens,0,token_ending}') from x), 'ios:23456]', 'push tokens, only the ending');
select ok((select position('abcdef123456' in j::text) = 0 from x), 'never the full push token');
select ok((select j -> 'notification_prefs' ?& array['offers', 'messages', 'tips', 'quiet_start'] and not (j -> 'notification_prefs' ? 'user_id') from x),
  'notification settings');
select is((select (j #>> '{settings,analytics_opt_in}') || ':' || (j #>> '{settings,crash_reports_opt_in}') from x), 'true:true',
  'usage and crash report choices');
select ok((select bool_or(n ->> 'body' = 'Ben offered $35') from x, jsonb_array_elements(j -> 'notifications') n), 'her notifications');
select ok((select j ?& array['account', 'profile', 'settings', 'notification_prefs', 'push_tokens', 'listings', 'offers', 'chats',
                             'ratings_given', 'ratings_received', 'saved', 'watching', 'saved_searches', 'swipes', 'blocks',
                             'reports_made', 'strikes', 'appeals', 'noshow_reports_made', 'noshow_reports_about_me', 'quad', 'notifications'] from x),
  'every section present');

-- Anonymity and other people's data ---------------------------------------------------------------
select ok((select position(tests.uid('B')::text in j::text) = 0 from x), 'Ben''s user id appears nowhere');
select ok((select position(tests.uid('C')::text in j::text) = 0 from x), 'Cam''s user id appears nowhere');
select is((select string_agg(p ->> 'body', ',') from x, jsonb_array_elements(j #> '{quad,posts}') p), 'Aisha asks: best study spot?',
  'only her own Quad posts');
select is((select string_agg(r ->> 'body', ',') from x, jsonb_array_elements(j #> '{quad,replies}') r), 'Aisha reply on Ben post',
  'only her own replies');
select ok((select position('Ben reply on Aisha post' in j::text) = 0 from x), 'not the replies others left on her post');
select is((select (j #>> '{quad,hidden_authors,0,excerpt}') || ':' || (j #> '{quad,hidden_authors,0}' ? 'hidden_author_id')::text from x),
  'Ben anonymous rant:false', 'hidden authors: the excerpt only, never who');
select is((select (j #>> '{quad,votes,0,value}') || ':' || (j #>> '{quad,muted_keywords,0}') from x), '-1:finals', 'votes and mutes');
select ok((select position('Ben bike secret' in j::text) = 0 and position('Cam to Ben only' in j::text) = 0
                  and position('a chat Aisha is not in' in j::text) = 0 from x),
  'nothing from listings, offers or chats she is not part of');
select is(private.export_user_data(tests.uid('B')) #>> '{chats,0,messages,0,from}', 'me', 'the other side sees the same chat from their view');

-- Start, finish, fail (the Edge Function's SQL steps) ------------------------------------------------
select ok(not has_function_privilege('authenticated', 'private.export_user_data(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.start_data_export(uuid)', 'execute')
          and has_function_privilege('service_role', 'private.start_data_export(uuid)', 'execute'),
  'service role only');
select is(tests.try_text('select private.export_user_data(''00000000-0000-4000-8000-0000000fffff'')::text'), 'ERROR: NOT_FOUND', 'unknown user');

create temp table s as select private.start_data_export(tests.uid('A')) as r;
select is((select r ->> 'key' from s), 'exports/' || tests.uid('A') || '/' || (select r ->> 'id' from s) || '.json',
  'the key is exports/{uid}/{id}.json');
select is((select status || ':' || (expires_at = '2027-03-17 17:00Z'::timestamptz)::text from public.data_exports where id = (select (r ->> 'id')::uuid from s)),
  'building:true', 'a data_exports row that expires with the link');
select is(tests.try_text(format('select private.start_data_export(%L)::text', tests.uid('A'))),
  'ERROR: RATE_LIMITED:export_data:2027-03-11T17:00:00Z', 'one a day');
select private.fail_data_export((select (r ->> 'id')::uuid from s));
select ok(tests.try_ok(format('select private.start_data_export(%L)', tests.uid('A'))), 'a failed run does not use up the day');

select is(tests.try_text(format('select private.finish_data_export(%L, %L)::text',
            (select id from public.data_exports where user_id = tests.uid('A') and status = 'building'), 'ftp://nope')),
  'ERROR: INVALID:url', 'the link must be https');
select private.finish_data_export((select id from public.data_exports where user_id = tests.uid('A') and status = 'building'),
  'https://acct.r2.test/onlyswap-private/exports/a.json?X-Amz-Signature=x');
select is((select to_email || ':' || template || ':' || (vars ->> 'url') from public.email_outbox where template = 'data_export'),
  'a@osu.edu:data_export:https://acct.r2.test/onlyswap-private/exports/a.json?X-Amz-Signature=x', 'the link is emailed to her');
select is(tests.try_text_as(tests.uid('A'), $$select string_agg(status, ',' order by created_at) from public.data_exports$$),
  'failed,ready', 'she can see her own exports (F17 status)');
select is(tests.try_text_as(tests.uid('B'), $$select count(*)::text from public.data_exports$$), '0', 'nobody else can');

select * from finish();
rollback;
