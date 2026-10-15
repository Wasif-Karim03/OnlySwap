-- 0233 (DEC 121): likes and comments on Feed posts. T-INT-COMMENTS-01..06.
-- Likes (idempotent, bell only, grouped), comments and one level of replies,
-- retries by client_id, contact details blocked, review words held for a
-- moderator, blocks both ways, comments off, deletes, reports and auto-hold,
-- moderator removal, other campuses, counts after an account is deleted,
-- the export and the comments notification pref.
begin;
select plan(50);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set status = 'active' where id = tests.uid('D');

insert into public.listings (id, campus_id, seller_id, title, status) values
  ('00000000-0000-4000-8000-00000000d001', tests.uid('OSU'), tests.uid('B'), 'Desk', 'active'),
  ('00000000-0000-4000-8000-00000000d002', tests.uid('OSU'), tests.uid('B'), 'Old lamp', 'sold');

create function pg_temp.q(who text, sql text) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), sql)
$$;
create function pg_temp.comment(who text, body text, parent uuid default null, client uuid default null)
returns text language sql as $$
  select pg_temp.q(who, format('select public.create_listing_comment(%L, %L, %L, %L)::text',
    '00000000-0000-4000-8000-00000000d001', body, parent, client))
$$;
create function pg_temp.cid(body text) returns uuid language sql as $$
  select id from public.listing_comments where body = $1 order by created_at desc limit 1
$$;
create function pg_temp.desk() returns public.listings language sql as $$
  select * from public.listings where id = '00000000-0000-4000-8000-00000000d001'
$$;

-- Post likes ----------------------------------------------------------------------------------
select is(pg_temp.q('A', $$select public.like_listing('00000000-0000-4000-8000-00000000d001', true)::text$$),
  '{"liked": true, "like_count": 1}', 'A likes the desk');
select is(pg_temp.q('A', $$select public.like_listing('00000000-0000-4000-8000-00000000d001', true) ->> 'like_count'$$),
  '1', 'liking twice still counts once');
select is((select push_state::text || '|' || grp || '|' || body from public.notifications
           where user_id = tests.uid('B') and type = 'listing_like'),
  'skipped|comments|Aisha A. liked "Desk".', 'a like lands in the bell only, never as a push');
select pg_temp.q('C', $$select public.like_listing('00000000-0000-4000-8000-00000000d001', true)::text$$);
select is((select count(*)::int || '|' || max(body) from public.notifications
           where user_id = tests.uid('B') and type = 'listing_like'),
  '1|Cam C. and 1 other liked "Desk".', 'the next like updates the same bell row');
select is(private.feed_item('00000000-0000-4000-8000-00000000d001', tests.uid('A')) ->> 'liked',
  'true', 'the feed card says A liked it');
select is(pg_temp.q('C', $$select public.like_listing('00000000-0000-4000-8000-00000000d001', false) ->> 'like_count'$$),
  '1', 'unliking takes the count back down');
select is(pg_temp.q('D', $$select public.like_listing('00000000-0000-4000-8000-00000000d001', true)::text$$),
  'ERROR: NOT_FOUND', 'another campus cannot see or like the post');

-- Comments --------------------------------------------------------------------------------------
select is(pg_temp.comment('A', 'Is this still available?', null, '00000000-0000-4000-8000-0000000c1001')::jsonb ->> 'status',
  'live', 'A comments');
select is(pg_temp.comment('A', 'Is this still available?', null, '00000000-0000-4000-8000-0000000c1001')::jsonb #>> '{comment,id}',
  pg_temp.cid('Is this still available?')::text, 'a retry with the same client_id returns the same comment');
select is((pg_temp.desk()).comment_count, 1, 'the retry did not add a second comment');
select is((select push_state::text || '|' || grp || '|' || body from public.notifications
           where user_id = tests.uid('B') and type = 'listing_comment'),
  'pending|comments|Aisha A. commented on "Desk".', 'the post''s author gets a comment push');
select is(pg_temp.comment('C', '   ')::text, 'ERROR: INVALID:body', 'an empty comment is refused');
select is(pg_temp.comment('C', repeat('a', 501))::text, 'ERROR: INVALID:body', 'more than 500 characters is refused');

-- Replies
select tests.set_now('2027-03-10 12:01:00-05');
select is(pg_temp.comment('B', 'Yes it is', pg_temp.cid('Is this still available?'))::jsonb ->> 'status',
  'live', 'the seller replies');
select is((select body from public.notifications where user_id = tests.uid('A') and type = 'comment_reply'),
  'Ben B. replied to your comment on "Desk".', 'the comment''s author hears about the reply');
select is((select count(*)::int from public.notifications where user_id = tests.uid('B') and type = 'listing_comment'),
  1, 'the seller is not told about their own reply');
select tests.set_now('2027-03-10 12:02:00-05');
select is(pg_temp.comment('C', 'Can I see it today?', pg_temp.cid('Yes it is'))::jsonb #>> '{comment,parent_id}',
  pg_temp.cid('Is this still available?')::text, 'a reply to a reply joins the same thread');
select is((select parent_id from public.listing_comments where body = 'Can I see it today?'),
  pg_temp.cid('Is this still available?'), 'stored under the top comment');
select is((select reply_count from public.listing_comments where id = pg_temp.cid('Is this still available?')),
  2, 'the top comment counts its two replies');
select is((pg_temp.desk()).comment_count, 3, 'the post counts comments and replies');
select is((select count(*)::int from public.notifications where user_id = tests.uid('B') and type = 'comment_reply'),
  1, 'B hears that C replied to B''s reply');

-- Reading
select tests.set_now('2027-03-10 12:03:00-05');
select pg_temp.comment('C', 'Nice desk');
select is(pg_temp.q('A', $$select jsonb_array_length(public.get_listing_comments('00000000-0000-4000-8000-00000000d001') -> 'items')::text$$),
  '2', 'two top-level comments');
select is(pg_temp.q('A', $$select public.get_listing_comments('00000000-0000-4000-8000-00000000d001', 'new') #>> '{items,0,body}'$$),
  'Nice desk', 'newest first with sort new');
select is(pg_temp.q('A', $$select jsonb_array_length(public.get_listing_comments('00000000-0000-4000-8000-00000000d001', 'new') #> '{items,1,replies}')::text$$),
  '2', 'each comment carries its first replies');
select is(pg_temp.q('A', format('select jsonb_array_length(public.get_comment_replies(%L) -> %L)::text',
    pg_temp.cid('Is this still available?'), 'items')),
  '2', 'get_comment_replies lists the thread');
select is(pg_temp.q('A', $$select public.get_listing_comments('00000000-0000-4000-8000-00000000d001', 'new') #>> '{items,1,replies,0,is_author_of_post}'$$),
  'true', 'the seller''s reply is marked as the post''s author');

-- Comment likes
select is(pg_temp.q('B', format('select public.like_listing_comment(%L, true) ->> %L', pg_temp.cid('Nice desk'), 'like_count')),
  '1', 'the seller likes a comment');
select is((select push_state::text from public.notifications where user_id = tests.uid('C') and type = 'comment_like'),
  'skipped', 'comment likes are bell only too');
select is(pg_temp.q('A', $$select public.get_listing_comments('00000000-0000-4000-8000-00000000d001') #>> '{items,0,body}'$$),
  'Nice desk', 'top sort puts the liked comment first');

-- Text checks
insert into public.banned_words (pattern, match, scopes, action) values ('cash only today', 'phrase', '{listing}', 'review');
select is(pg_temp.comment('C', 'text me 614-555-0182')::jsonb ->> 'reason', 'pii:phone',
  'phone numbers are blocked (use chat after an offer)');
select is((select count(*)::int from public.listing_comments where body like 'text me%'), 0, 'a blocked comment is not saved');
select is(pg_temp.comment('C', 'cash only today please')::jsonb ->> 'status', 'held', 'a review word holds the comment');
select is((select reporter_id is null and status = 'open' from public.reports
           where target_type = 'listing_comment' and target_id = pg_temp.cid('cash only today please')::text),
  true, 'a held comment goes to the Reports queue with no reporter');
select ok(position('cash only' in pg_temp.q('A', $$select public.get_listing_comments('00000000-0000-4000-8000-00000000d001')::text$$)) = 0,
  'others do not see a held comment');
select ok(position('cash only' in pg_temp.q('C', $$select public.get_listing_comments('00000000-0000-4000-8000-00000000d001')::text$$)) > 0,
  'its author does');

-- Blocks
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('A'), tests.uid('C'));
select ok(position('Nice desk' in pg_temp.q('A', $$select public.get_listing_comments('00000000-0000-4000-8000-00000000d001')::text$$)) = 0,
  'A does not see comments from someone A blocked');
select is(pg_temp.q('C', format('select public.like_listing_comment(%L, true)::text', pg_temp.cid('Is this still available?'))),
  'ERROR: NOT_FOUND', 'nor can they like A''s comment');
delete from public.blocks;

-- Deleting and comments off
select is(pg_temp.q('C', format('select public.delete_listing_comment(%L)::text', pg_temp.cid('Is this still available?'))),
  'ERROR: FORBIDDEN', 'only the author or the post''s author can delete');
select is(pg_temp.q('A', format('select public.delete_listing_comment(%L)::text', pg_temp.cid('Is this still available?'))),
  '', 'A deletes their comment');
select is(pg_temp.q('B', $$select public.get_listing_comments('00000000-0000-4000-8000-00000000d001', 'new') #>> '{items,1}'$$)::jsonb ->> 'body',
  null, 'with replies it stays as a deleted comment with no words');
select is((pg_temp.desk()).comment_count, 3, 'the deleted comment no longer counts');
select is(pg_temp.q('A', $$select public.set_listing_comments('00000000-0000-4000-8000-00000000d001', false)::text$$),
  'ERROR: FORBIDDEN', 'only the post''s author turns comments off');
select pg_temp.q('B', $$select public.set_listing_comments('00000000-0000-4000-8000-00000000d001', false)::text$$);
select is(pg_temp.comment('A', 'one more'), 'ERROR: FORBIDDEN:comments_off', 'no new comments once they are off');
select is(pg_temp.q('A', $$select public.create_listing_comment('00000000-0000-4000-8000-00000000d002', 'still here?')::text$$),
  'ERROR: FORBIDDEN:closed', 'a sold post takes no new comments');

-- Reports and moderators
select pg_temp.q(u, format($f$select public.create_report('listing_comment', %L, 'harassment')::text$f$, pg_temp.cid('Nice desk')))
from unnest(array['A','B','MOD']) u;
select is((select status from public.listing_comments where id = pg_temp.cid('Nice desk')), 'held',
  'three settled reporters hold a comment');
create temp table rep as select id from public.reports where target_type = 'listing_comment'
  and target_id = pg_temp.cid('Nice desk')::text and reporter_id = tests.uid('A');
grant select on rep to authenticated;
select tests.authenticate_as(tests.uid('MOD'), 'aal2');
select is(public.admin_resolve_report((select id from rep), 'remove_content', 'harassing the seller')::text,
  '', 'a moderator removes it from Reports');
select set_config('role', 'none', true);
select is((select c.status || '|' || (select count(*) from public.reports r
                                       where r.target_id = c.id::text and r.status = 'open')
           from public.listing_comments c where c.id = pg_temp.cid('Nice desk')),
  'removed|0', 'removing it closes every open report on it');

-- Account deletion, export, prefs
select is((private.export_user_data(tests.uid('C')) #>> '{feed,comments,0,body}'), 'Can I see it today?',
  'the export has the person''s own comments');
delete from auth.users where id = tests.uid('C');
select is((pg_temp.desk()).comment_count, 1, 'a deleted account''s comments leave the count');
select is(pg_temp.q('A', $$select public.update_notification_prefs('{"comments": false}') ->> 'comments'$$),
  'false', 'comments and replies pushes can be turned off');

select * from finish();
rollback;
