-- S45: The Quad backend (P10-QUAD-01). T-INT-QUAD-ANON, T-INT-QUAD-01,
-- T-INT-QUAD-02, T-SEC-04 (database half), rate limits (T-SEC-10 quad).
begin;
select plan(52);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01' where campus_id = tests.uid('OSU');
update public.app_config set value = 'false' where key = 'quad_enabled';

create function pg_temp.q(who text, sql text) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), sql)
$$;
create function pg_temp.post(who text, body text) returns text language sql as $$
  select pg_temp.q(who, format('select public.create_quad_post(%L, %L)::text', 'text', body))
$$;
create function pg_temp.pid(body text) returns uuid language sql as $$
  select id from public.quad_posts where body = $1 order by created_at desc limit 1
$$;

-- Switch and rules ----------------------------------------------------------------------------
select is(pg_temp.q('A', $$select public.get_quad_feed()::text$$), 'ERROR: FEATURE_OFF',
  'the Quad answers FEATURE_OFF until the campus switches it on');
select is(pg_temp.q('A', $$select public.get_quad_status()::text$$), '{"enabled": false, "rules_accepted": false}',
  'status says off and not agreed');
update public.campuses set quad_enabled = true where id = tests.uid('OSU');
select is(pg_temp.q('A', $$select public.get_quad_feed()::text$$), 'ERROR: FEATURE_OFF',
  'the global switch (app_config quad_enabled) must be on too');
update public.app_config set value = 'true' where key = 'quad_enabled';
select is(pg_temp.post('A', 'best study spot?'), 'ERROR: RULES_REQUIRED:quad', 'posting needs the Quad rules (Q01)');
select is(pg_temp.q('A', $$select public.accept_quad_rules()::text$$), '', 'A agrees');
select pg_temp.q(u, $$select public.accept_quad_rules()::text$$) from unnest(array['B','C']) u;
select is(pg_temp.q('A', $$select public.get_quad_status() ->> 'rules_accepted'$$), 'true', 'status remembers it');

-- Posting and the text checks (T-INT-QUAD-01) -------------------------------------------------
select is(pg_temp.post('A', 'best study spot?') ::jsonb ->> 'status', 'live', 'a plain post goes live');
select is(
  concat_ws('|',
    pg_temp.post('A', 'text me 614-555-0182') ::jsonb ->> 'reason',
    pg_temp.post('A', 'mail me at jo@osu.edu') ::jsonb ->> 'reason',
    pg_temp.post('A', 'see www.example.com') ::jsonb ->> 'reason',
    pg_temp.post('A', 'dm @jo_ann on insta') ::jsonb ->> 'reason',
    pg_temp.post('A', 'party in room 412 tonight') ::jsonb ->> 'reason'),
  'pii:phone|pii:email|pii:url|pii:handle|pii:room', 'phone, email, link, handle and room are blocked');
select is((select count(*)::int from public.quad_posts where author_id = tests.uid('A')), 1,
  'blocked posts are never saved');
select is(pg_temp.post('A', 'selling a vape cheap') ::jsonb ->> 'status', 'blocked', 'banned items are blocked');
select is(
  concat_ws('|',
    pg_temp.post('A', 'rate jake r') ::jsonb ->> 'reason',
    pg_temp.post('A', 'Madison from my class is so rude') ::jsonb ->> 'reason'),
  'names_student|names_student', 'naming a student holds the post for review (E2E-12)');
select is(pg_temp.post('A', 'anyone want to grab food') ::jsonb ->> 'status', 'live',
  'everyday words are fine');

-- Blocked attempts count toward the hourly limit; start this part fresh.
delete from public.rate_counters;

-- Polls and photos ----------------------------------------------------------------------------
select is(
  concat_ws('|',
    pg_temp.q('A', $$select public.create_quad_post('poll', 'Best dining hall?', null, '{"options":["Kennedy"]}')::text$$),
    pg_temp.q('A', $$select public.create_quad_post('poll', 'Best dining hall?', null, '{"options":["a","b","c","d","e"]}')::text$$)),
  'ERROR: INVALID:poll|ERROR: INVALID:poll', 'polls need 2 to 4 options');
select is(pg_temp.q('A', $$select public.create_quad_post('poll', 'Best dining hall?', null, '{"options":["Kennedy","Traditions","Scott"]}') ->> 'status'$$),
  'live', 'a poll posts');
select is(pg_temp.q('B', format('select public.vote_poll(%L, %L) ->> %L', pg_temp.pid('Best dining hall?'),
  (select id from public.quad_poll_options where label = 'Scott'), 'total')), '1', 'B votes in the poll');
select is(pg_temp.q('B', format('select public.vote_poll(%L, %L)::text', pg_temp.pid('Best dining hall?'),
  (select id from public.quad_poll_options where label = 'Kennedy'))), 'ERROR: INVALID:already_voted',
  'one vote per person');
select is(
  pg_temp.q('A', format('select public.create_quad_post(%L, %L, %L)::text', 'photo', 'sunset', 'c/elsewhere/x.webp')),
  'ERROR: INVALID:photo_path', 'a photo must live in this post''s folder');
select is(
  pg_temp.q('A', format('select public.create_quad_post(%L, %L, %L, null, null, %L) ->> %L', 'photo', 'sunset from the oval',
    'c/' || tests.uid('OSU') || '/quad/00000000-0000-4000-8000-00000000a9a1/11111111-1111-4111-8111-111111111111_full.webp',
    '00000000-0000-4000-8000-00000000a9a1', 'status')),
  'live', 'a photo post with its own folder goes live');
select is(
  pg_temp.q('A', format('select public.create_quad_post(%L, %L, %L, null, null, %L) ->> %L', 'photo', 'sunset again',
    'c/' || tests.uid('OSU') || '/quad/00000000-0000-4000-8000-00000000a9a1/11111111-1111-4111-8111-111111111111_full.webp',
    '00000000-0000-4000-8000-00000000a9a1', 'id')),
  '00000000-0000-4000-8000-00000000a9a1', 'a retry with the same post id returns the same post');
update public.profiles set created_at = '2027-03-08' where id = tests.uid('C');
select is(
  pg_temp.q('C', format('select public.create_quad_post(%L, %L, %L, null, null, %L) ->> %L', 'photo', 'my new desk',
    'c/' || tests.uid('OSU') || '/quad/00000000-0000-4000-8000-00000000a9a2/22222222-2222-4222-8222-222222222222_full.webp',
    '00000000-0000-4000-8000-00000000a9a2', 'reason')),
  'new_account_photo', 'photos from accounts under a week old wait for review');
update public.profiles set created_at = '2027-01-01' where id = tests.uid('C');

-- Feed: held posts only for their author; nothing about authors (T-INT-QUAD-ANON) -------------
select is(pg_temp.q('B', $$select count(*)::text from jsonb_array_elements(public.get_quad_feed('new') -> 'items') i where i ->> 'body' = 'rate jake r'$$),
  '0', 'others never see a held post');
select is(pg_temp.q('A', $$select (select i ->> 'status' from jsonb_array_elements(public.get_quad_feed('new') -> 'items') i where i ->> 'body' = 'rate jake r')$$),
  'held', 'the author sees it as under review');
select is(pg_temp.q('B', $$select (select i ->> 'is_mine' from jsonb_array_elements(public.get_quad_feed('new') -> 'items') i where i ->> 'body' = 'best study spot?')$$),
  'false', 'B sees A''s post as not theirs');

-- Replies and aliases ---------------------------------------------------------------------------
select is(
  concat_ws('|',
    pg_temp.q('B', format('select public.create_quad_reply(%L, %L) ->> %L', pg_temp.pid('best study spot?'), 'library 4th floor', 'alias_no')),
    pg_temp.q('C', format('select public.create_quad_reply(%L, %L) ->> %L', pg_temp.pid('best study spot?'), 'the union', 'alias_no')),
    pg_temp.q('B', format('select public.create_quad_reply(%L, %L) ->> %L', pg_temp.pid('best study spot?'), 'or thompson', 'alias_no')),
    pg_temp.q('A', format('select public.create_quad_reply(%L, %L) ->> %L', pg_temp.pid('best study spot?'), 'thanks all', 'alias_no'))),
  '1|2|1|0', 'aliases: first replier 1, next 2, same person keeps theirs, the poster is 0');
select is((select reply_count from public.quad_posts where body = 'best study spot?'), 4, 'reply count');
select is((select count(*)::int from public.notifications where user_id = tests.uid('A') and type = 'quad_reply'), 1,
  'the poster gets one reply notification an hour, never for their own reply');
select is(pg_temp.q('B', format('select public.create_quad_reply(%L, %L) ->> %L', pg_temp.pid('best study spot?'), 'call 614 555 0182', 'reason')),
  'pii:phone', 'replies get the same checks');

-- T-INT-QUAD-ANON / T-SEC-04 (database half): no author ids anywhere ----------------------------
select is(
  concat_ws('|',
    pg_temp.q('B', format($f$select (public.get_quad_feed('new')::text like '%%%s%%')::text$f$, tests.uid('A'))),
    pg_temp.q('B', format($f$select (public.get_quad_thread(%L)::text like '%%%s%%')::text$f$, pg_temp.pid('best study spot?'), tests.uid('A'))),
    pg_temp.q('A', format($f$select (public.get_quad_feed('new')::text like '%%%s%%')::text$f$, tests.uid('A'))),
    pg_temp.q('A', format($f$select (public.get_my_quad()::text like '%%%s%%')::text$f$, tests.uid('A'))),
    pg_temp.q('B', format($f$select (public.get_quad_thread(%L)::text ~ 'author|user_id')::text$f$, pg_temp.pid('best study spot?')))),
  'false|false|false|false|false', 'no Quad response carries an author id or field, even for your own posts');
select is(pg_temp.q('B', $$select count(*)::text from public.quad_posts$$),
  'ERROR: permission denied for table quad_posts', 'no direct reads of posts');
select is(pg_temp.q('B', $$select count(*)::text from public.quad_replies$$),
  'ERROR: permission denied for table quad_replies', 'nor of replies');
select is(pg_temp.q('B', $$select count(*)::text from public.quad_hides$$),
  'ERROR: permission denied for table quad_hides', 'nor of hides');

-- Votes -----------------------------------------------------------------------------------------
select is(pg_temp.q('A', format('select public.vote_quad(%L, %L, 1::smallint)::text', 'post', pg_temp.pid('best study spot?'))),
  'ERROR: FORBIDDEN:own', 'no voting on your own post');
select is(pg_temp.q('B', format('select public.vote_quad(%L, %L, 1::smallint) ->> %L', 'post', pg_temp.pid('best study spot?'), 'score')),
  '1', 'an upvote');
select is(pg_temp.q('B', format('select public.vote_quad(%L, %L, -1::smallint) ->> %L', 'post', pg_temp.pid('best study spot?'), 'score')),
  '-1', 'switching to a downvote moves by two');
select is(pg_temp.q('B', format('select public.vote_quad(%L, %L, 0::smallint) ->> %L', 'post', pg_temp.pid('best study spot?'), 'score')),
  '0', '0 removes the vote');
select is(pg_temp.q('B', $$select count(*)::text from public.quad_votes$$), '0', 'votes table: own rows only, none now');
update public.quad_posts set score = 49 where body = 'anyone want to grab food';
select pg_temp.q('B', format('select public.vote_quad(%L, %L, 1::smallint)::text', 'post', pg_temp.pid('anyone want to grab food')));
select is((select count(*)::int from public.notifications where user_id = tests.uid('A') and type = 'quad_milestone'), 1,
  'reaching 50 points tells the author');
update public.campuses set quad_autohide_score = -2 where id = tests.uid('OSU');
select pg_temp.q(u, format('select public.vote_quad(%L, %L, -1::smallint)::text', 'post', pg_temp.pid('sunset from the oval')))
from unnest(array['B','C']) u;
select is(
  (select status || ':' || (select count(*) from public.reports r where r.target_id = q.id::text and r.reporter_id is null)
   from public.quad_posts q where body = 'sunset from the oval'),
  'hidden:1', 'falling to the auto-hide score hides the post and files a report');

-- Hides, mutes and blocks (T-INT-QUAD-02) --------------------------------------------------------
select is(pg_temp.q('B', format('select public.hide_quad_author(%L)::text', pg_temp.pid('best study spot?'))), '', 'B hides that author');
select is(
  concat_ws('|',
    pg_temp.q('B', $$select count(*)::text from jsonb_array_elements(public.get_quad_feed('new') -> 'items') i where i ->> 'body' in ('best study spot?','anyone want to grab food')$$),
    pg_temp.q('C', $$select count(*)::text from jsonb_array_elements(public.get_quad_feed('new') -> 'items') i where i ->> 'body' in ('best study spot?','anyone want to grab food')$$)),
  '0|2', 'every post by that author is gone for B only');
select is(pg_temp.q('B', format($f$select (public.get_my_quad_hides()::text like '%%%s%%')::text$f$, tests.uid('A'))), 'false',
  'the Muted list names the post, never the author');
select is(pg_temp.q('B', format('select public.unhide_quad(%L)::text', pg_temp.pid('best study spot?'))), '', 'B undoes it');
select pg_temp.q('C', $$select public.mute_keyword('Dining')::text$$);
select is(pg_temp.q('C', $$select count(*)::text from jsonb_array_elements(public.get_quad_feed('new') -> 'items') i where i ->> 'body' ilike '%dining%'$$),
  '0', 'a muted keyword hides matching posts');

-- Replies off, delete, Your Quad ------------------------------------------------------------------
select pg_temp.q('A', format('select public.set_quad_replies(%L, false)::text', pg_temp.pid('anyone want to grab food')));
select is(pg_temp.q('B', format('select public.create_quad_reply(%L, %L)::text', pg_temp.pid('anyone want to grab food'), 'me!')),
  'ERROR: FORBIDDEN:replies_off', 'replies can be turned off by the poster');
select is(pg_temp.q('B', format('select public.set_quad_replies(%L, true)::text', pg_temp.pid('anyone want to grab food'))),
  'ERROR: NOT_FOUND', 'only the poster can');
select is(pg_temp.q('A', format('select public.delete_quad_post(%L)::text', pg_temp.pid('anyone want to grab food'))), '',
  'the poster deletes it');
select is(
  pg_temp.q('A', $$select string_agg(p ->> 'body' || '=' || (p ->> 'status'), ',' order by p ->> 'body' collate "C") from jsonb_array_elements(public.get_my_quad() -> 'posts') p$$),
  'Best dining hall?=live,Madison from my class is so rude=held,best study spot?=live,rate jake r=held,sunset from the oval=hidden',
  'Your Quad lists own posts with their status, not the deleted one');

-- Reports and appeals -----------------------------------------------------------------------------
select matches(pg_temp.q('B', format('select public.create_report(%L, %L, %L)::text', 'quad_post', pg_temp.pid('best study spot?'), 'harassment')),
  '^\{"id"', 'a Quad post can be reported');
select is((select target_user_id from public.reports where reporter_id = tests.uid('B') and target_type = 'quad_post'),
  tests.uid('A'), 'the author is resolved on the server (and never returned)');
select matches(pg_temp.q('A', format('select public.create_appeal(%L, %L, %L)::text', 'quad_post', pg_temp.pid('sunset from the oval'), 'mistake')),
  '^\{"id"', 'the author can appeal a hidden post');

-- Rate limit (T-SEC-10): 10 posts an hour -------------------------------------------------------------
select is(
  (select string_agg(coalesce(pg_temp.post('C', 'question number ' || i) ::jsonb ->> 'status', 'err'), ',')
   from generate_series(1, 2) i)
  || '|' ||
  (select bool_or(r like 'ERROR: RATE_LIMITED:quad_post%')::text
   from (select pg_temp.post('C', 'more ' || i) as r from generate_series(1, 10) i) x),
  'live,live|true', 'the 11th post in an hour is refused');

-- Uploads (P5-MEDIA-02 quad kind) ------------------------------------------------------------------
select is(
  concat_ws('|',
    tests.try_text($$select private.can_upload('00000000-0000-4000-8000-00000000000b', 'quad', '00000000-0000-4000-8000-00000000b001')::text$$),
    tests.try_text(format('select private.can_upload(%L, %L, %L)::text', tests.uid('B'), 'quad', pg_temp.pid('best study spot?'))),
    tests.try_text(format('select private.can_upload(%L, %L, %L)::text', tests.uid('D'), 'quad', '00000000-0000-4000-8000-00000000b002'))),
  tests.uid('OSU') || '|ERROR: FORBIDDEN|ERROR: FORBIDDEN', 'quad photos: a fresh post id is fine, someone else''s post or an inactive account is not');

select * from finish();
rollback;
