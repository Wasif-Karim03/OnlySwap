-- E-02 (audit): get_quad_feed keyset paging and the inline hidden filter.
-- T-INT-QUAD-01 (hot_rank ordering). Pages must not overlap or skip, every sort
-- must keep its order across pages, and an old {"offset": n} cursor still works.
begin;
select plan(22);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01' where campus_id = tests.uid('OSU');
update public.campuses set quad_enabled = true where id = tests.uid('OSU');
update public.app_config set value = 'true' where key = 'quad_enabled';

-- 25 live posts by A, an hour apart, with scores that make hot differ from new and top.
insert into public.quad_posts (id, campus_id, author_id, body, score, created_at)
select ('00000000-0000-4000-8000-0000000a' || lpad(g::text, 4, '0'))::uuid, tests.uid('OSU'), tests.uid('A'),
       'post ' || g, (g * 7) % 23, '2027-03-10 12:00-05'::timestamptz - make_interval(hours => g)
from generate_series(1, 25) g;
-- Two posts at the same minute and score: the id breaks the tie.
update public.quad_posts set created_at = '2027-03-10 02:00-05', score = 5
where body in ('post 10', 'post 11');

create function pg_temp.q(who text, sql text) returns text language sql as $$
  select tests.try_text_as(tests.uid(who), sql)
$$;
-- Bodies of one page, in order, and the next cursor.
create function pg_temp.page(who text, s text, cur text default null) returns jsonb language sql as $$
  select pg_temp.q(who, format($f$select public.get_quad_feed(%L, %L::jsonb)::text$f$, s, cur))::jsonb
$$;
create function pg_temp.bodies(p jsonb) returns text language sql as $$
  select string_agg(i ->> 'body', ',' order by n) from jsonb_array_elements(p -> 'items') with ordinality t(i, n)
$$;
-- Both pages joined, for comparing with the full expected order.
create function pg_temp.two_pages(who text, s text) returns text language plpgsql as $$
declare p1 jsonb := pg_temp.page(who, s); p2 jsonb;
begin
  p2 := pg_temp.page(who, s, (p1 -> 'next_cursor')::text);
  if p2 -> 'next_cursor' <> 'null'::jsonb then return 'more than two pages'; end if;
  return pg_temp.bodies(p1) || ',' || pg_temp.bodies(p2);
end;
$$;
create function pg_temp.expected(s text, viewer text) returns text language sql as $$
  select string_agg(body, ',' order by
    case s when 'new' then extract(epoch from created_at)
           when 'top' then score::double precision
           else (score + 1)::double precision / power(extract(epoch from ('2027-03-10 12:00-05'::timestamptz - created_at)) / 3600.0 + 2, 1.5)
    end desc, created_at desc, id desc)
  from public.quad_posts
  where status = 'live' or (status = 'held' and author_id = tests.uid(viewer))
$$;

-- Paging, per sort -------------------------------------------------------------------------------
select is(jsonb_array_length(pg_temp.page('B', 'new') -> 'items'), 20, 'new: a full first page');
select isnt(pg_temp.page('B', 'new') -> 'next_cursor', 'null'::jsonb, 'new: a next cursor');
select is(pg_temp.two_pages('B', 'new'), pg_temp.expected('new', 'B'), 'new: two pages, newest first, nothing skipped or repeated');
select is(pg_temp.two_pages('B', 'hot'), pg_temp.expected('hot', 'B'), 'hot: two pages in hot order');
select is(pg_temp.two_pages('B', 'top'), pg_temp.expected('top', 'B'), 'top: two pages by score');
select is(pg_temp.bodies(pg_temp.page('B', 'new', '{"offset":20}')),
  pg_temp.bodies(pg_temp.page('B', 'new', (pg_temp.page('B', 'new') -> 'next_cursor')::text)),
  'an old offset cursor still returns the second page');
select is(pg_temp.page('B', 'new', (pg_temp.page('B', 'new') -> 'next_cursor')::text) -> 'pinned', 'null'::jsonb,
  'no pinned item after the first page');

-- Hot keeps its order when time moves between pages: the cursor carries the
-- time of the first page.
create temp table hot_p2 as
  select c.cur, pg_temp.bodies(pg_temp.page('B', 'hot', c.cur)) as bodies
  from (select (pg_temp.page('B', 'hot') -> 'next_cursor')::text as cur) c;
select tests.set_now('2027-03-10 18:00:00-05');
select is(pg_temp.bodies(pg_temp.page('B', 'hot', (select cur from hot_p2))), (select bodies from hot_p2),
  'hot: a later page ranks with the time of the first page');
select tests.set_now('2027-03-10 12:00:00-05');

-- A cursor from another sort or a broken one is rejected.
select is(pg_temp.q('B', $$select public.get_quad_feed('new', '{"h":"x"}')::text$$), 'ERROR: INVALID:cursor', 'a broken cursor is rejected');
select is(pg_temp.q('B', $$select public.get_quad_feed('lol')::text$$), 'ERROR: INVALID:sort', 'unknown sorts are rejected');

-- Top is the last 7 days only.
update public.quad_posts set created_at = '2027-03-01 12:00-05' where body = 'post 25';
select is(pg_temp.q('B', $$select count(*)::text from jsonb_array_elements(public.get_quad_feed('top') -> 'items') i where i ->> 'body' = 'post 25'$$),
  '0', 'top skips posts older than 7 days');
select is(pg_temp.q('B', $$select count(*)::text from jsonb_array_elements(public.get_quad_feed('new', '{"offset":20}') -> 'items') i where i ->> 'body' = 'post 25'$$),
  '1', 'new still has them');
update public.quad_posts set created_at = '2027-03-09 11:00-05' where body = 'post 25';

-- Who sees what -----------------------------------------------------------------------------------
insert into public.quad_posts (campus_id, author_id, body, status, created_at) values
  (tests.uid('OSU'), tests.uid('B'), 'held for review', 'held', '2027-03-10 11:59-05'),
  (tests.uid('OSU'), tests.uid('C'), 'by C', 'live', '2027-03-10 11:58-05'),
  (tests.uid('OSU'), tests.uid('A'), 'about the dining hall', 'live', '2027-03-10 11:57-05'),
  (tests.uid('OSU'), tests.uid('A'), 'removed one', 'removed', '2027-03-10 11:56-05'),
  (tests.uid('OSU'), tests.uid('A'), 'expired one', 'live', '2027-03-10 11:55-05');
update public.quad_posts set expires_at = '2027-03-10 11:59-05' where body = 'expired one';
insert into public.quad_hides (user_id, hidden_author_id) values (tests.uid('C'), tests.uid('A'));
insert into public.quad_mutes (user_id, keyword) values (tests.uid('B'), 'Dining');
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('C'), tests.uid('B'));

create function pg_temp.sees(who text, body text) returns bool language sql as $$
  select pg_temp.q(who, format($f$select exists (select 1 from jsonb_array_elements(public.get_quad_feed('new') -> 'items') i where i ->> 'body' = %L)::text$f$, body))::bool
$$;
select ok(pg_temp.sees('B', 'held for review'), 'my held post shows to me');
select ok(not pg_temp.sees('A', 'held for review'), 'a held post is hidden from others');
select ok(not pg_temp.sees('B', 'about the dining hall'), 'a muted keyword hides the post (any case)');
select ok(pg_temp.sees('A', 'about the dining hall'), 'others still see it');
select ok(not pg_temp.sees('C', 'post 1'), 'a hidden author is hidden');
select ok(pg_temp.sees('A', 'post 1'), 'my own posts show even if someone hid me');
select ok(not pg_temp.sees('B', 'by C'), 'a block hides posts both ways (blocked side)');
select ok(not pg_temp.sees('C', 'held for review'), 'a block hides posts both ways (blocker side)');
select ok(not pg_temp.sees('A', 'removed one'), 'removed posts are gone');
select ok(not pg_temp.sees('A', 'expired one'), 'expired posts are gone');

select * from finish();
rollback;
