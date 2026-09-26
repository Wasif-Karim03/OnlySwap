-- P3-DB-09: read-model views and materialized views (DATA_MODEL §2.7).
begin;
select plan(16);
select tests.create_fixtures();

-- public_profiles: public columns only --------------------------------------------
select columns_are('public', 'public_profiles',
  array['id','display_name','year','avatar_path','created_at','founding_seller_until'],
  'public_profiles exposes public columns only (no email hash, status, strikes)');
update public.profiles set status = 'banned' where id = tests.uid('NOMFA');
select is(tests.try_text_as(tests.uid('A'), format('select count(*)::text from public.public_profiles where id = %L', tests.uid('NOMFA'))),
  '0', 'public_profiles hides banned accounts');
select is(tests.try_text_as(tests.uid('A'), format('select display_name from public.public_profiles where id = %L', tests.uid('B'))),
  'Ben B.', 'public_profiles shows first name and last initial');

-- ratings_visible: revealed when both rated or after 7 days ---------------------------
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents) values
  ('00000000-0000-4000-8000-0000000003a1', tests.uid('B'), tests.uid('A'), 'Lamp', 1200, 1000),
  ('00000000-0000-4000-8000-0000000003a2', tests.uid('C'), tests.uid('A'), 'Desk', 2000, 1800);
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up) values
  ('00000000-0000-4000-8000-0000000003a1', tests.uid('B'), tests.uid('A'), true),
  ('00000000-0000-4000-8000-0000000003a2', tests.uid('C'), tests.uid('A'), false);
select is(tests.try_text_as(tests.uid('A'), 'select count(*)::text from public.ratings_visible'), '0',
  'one-sided ratings stay hidden');
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up)
values ('00000000-0000-4000-8000-0000000003a1', tests.uid('A'), tests.uid('B'), true);
select is(tests.try_text_as(tests.uid('C'), format('select count(*)::text from public.ratings_visible where ratee_id = %L', tests.uid('A'))),
  '1', 'both sides rated: revealed to everyone on campus');
select is(tests.try_text_as(tests.uid('D'), 'select count(*)::text from public.ratings_visible'), '0',
  'another campus sees none');
select tests.set_now(now() + interval '8 days');
select is(tests.try_text_as(tests.uid('A'), format('select count(*)::text from public.ratings_visible where ratee_id = %L', tests.uid('A'))),
  '2', 'after 7 days the one-sided rating is revealed too');
delete from auth.users where id = tests.uid('C');
select is(tests.try_text_as(tests.uid('A'), format('select coalesce(rater_name, ''Deleted user'') from public.ratings_visible where ratee_id = %L and not thumbs_up', tests.uid('A'))),
  'Deleted user', 'a deleted rater comes back with rater_name null (D18)');

-- campus_progress ----------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), 'select slug || '':'' || members from public.campus_progress'),
  'osu:4', 'campus_progress: own campus, members exclude banned and deleted');
select is(tests.try_text_as(tests.uid('D'), 'select slug from public.campus_progress'), 'umich',
  'campus_progress: a waitlist student sees their campus');

-- profile_stats (materialized, read through the view) -------------------------------------
refresh materialized view public.profile_stats_mv;
select is(tests.try_text_as(tests.uid('B'), format('select thumbs_up || ''/'' || thumbs_total from public.profile_stats where user_id = %L', tests.uid('A'))),
  '1/2', 'profile_stats counts every rating, including one from a deleted rater');
select is(tests.try_text_as(tests.uid('D'), format('select count(*)::text from public.profile_stats where user_id = %L', tests.uid('A'))),
  '0', 'profile_stats: other campuses see none');

-- materialized views are never readable directly ---------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.profile_stats_mv', 'select'), 'profile_stats_mv not granted');
select ok(not has_table_privilege('authenticated', 'public.price_hints', 'select'), 'price_hints not granted (read via price_hint())');
select ok(not has_table_privilege('authenticated', 'public.campus_trending_terms', 'select'), 'campus_trending_terms not granted');
select columns_are('public', 'my_reports',
  array['id','target_type','target_id','reason','status','created_at','resolved_at'],
  'my_reports: no reported person, evidence or action taken');

select * from finish();
rollback;
