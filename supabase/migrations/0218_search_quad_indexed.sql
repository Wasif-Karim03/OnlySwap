-- 0218_search_quad_indexed.sql · E-01 and E-02 (audit), DEC 101: search and
-- the Quad feed checked every campus row per call (200 to 350 ms each at 20k
-- listings / 3k posts, about half the DB time under load). Same results now,
-- from the indexes:
--   * search_listings / search_suggest: the text match is written inline
--     (`search @@ tsquery` OR `folded title <% q`), so the planner can use the
--     GIN full-text index and a new trigram index on the folded title. The
--     opaque private.text_matches stays for the one-row checks (saved-search
--     alerts and new counts). Filters and blocks are read once per call, not
--     per row. Paging stays {"offset": n}: matches are a small set now.
--   * get_quad_feed: keyset cursors ({"c","id"} new, {"s","c","id"} top,
--     {"t","h","c","id"} hot). Hot ranks the newest 500 and the 500 highest
--     scored posts at the time of the first page, which the cursor carries,
--     so pages never overlap. An
--     old {"offset": n} cursor still works. Hidden authors, blocks and muted
--     words are read once per call (was a function call per post). Ties now
--     break on id descending (was ascending).
--   * The trigram threshold (0.5) is set per call with set_config, not as a
--     function option: that would fail in a session where pg_trgm isn't
--     loaded yet.
--   * plan_cache_mode = force_custom_plan: one statement serves several sorts
--     and with or without text; a generic plan would lose the indexes.

create index if not exists listings_title_fold_trgm on public.listings
  using gin ((lower(private.unaccent_immutable(title))) extensions.gin_trgm_ops);

create index if not exists quad_posts_campus_new on public.quad_posts (campus_id, created_at desc, id desc)
  where status in ('live', 'held');
create index if not exists quad_posts_campus_top on public.quad_posts (campus_id, score desc, created_at desc, id desc)
  where status in ('live', 'held');

-- ---------------------------------------------------------------------------
create or replace function public.search_listings(q text default null, filters jsonb default '{}', cursor jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  f jsonb := private.check_search_filters(search_listings.filters);
  qq text := nullif(btrim(coalesce(search_listings.q, '')), '');
  v_sort text := coalesce(f ->> 'sort', case when qq is null then 'new' else 'relevance' end);
  v_now timestamptz := private.now();
  off int := 0;
  tsq tsquery;
  nq text;
  cats smallint[];
  conds public.item_condition[];
  v_min int := (f ->> 'min_cents')::int;
  v_max int := (f ->> 'max_cents')::int;
  v_free bool := coalesce((f ->> 'free_only')::bool, false);
  v_hide bool := coalesce((f ->> 'hide_swiped')::bool, false);
  hidden uuid[];
  items jsonb;
begin
  perform private.hit('search_listings', 120, interval '1 hour');
  -- The title match keeps the 0.5 threshold of the one-row check. pg_trgm is
  -- loaded first: a role can't set the option before the module defines it.
  perform extensions.word_similarity('', '');
  perform set_config('pg_trgm.word_similarity_threshold', '0.5', true);
  if char_length(coalesce(qq, '')) > 80 then
    perform private.raise('INVALID', 'q');
  end if;
  begin
    off := greatest(coalesce((search_listings.cursor ->> 'offset')::int, 0), 0);
  exception when others then
    perform private.raise('INVALID', 'cursor');
  end;
  if v_sort = 'relevance' and qq is null then
    v_sort := 'new';
  end if;
  if qq is not null then
    tsq := websearch_to_tsquery('english', private.unaccent_immutable(qq));
    if numnode(tsq) = 0 then
      tsq := null;  -- stop words only: the title match alone
    end if;
    nq := lower(private.unaccent_immutable(qq));
  end if;

  -- A parent category includes its children.
  select array_agg(x) into cats from (
    select x::smallint as x from jsonb_array_elements_text(coalesce(f -> 'category_ids', '[]')) x
    union
    select c.id from public.categories c
    where c.parent_id in (select x::smallint from jsonb_array_elements_text(coalesce(f -> 'category_ids', '[]')) x)
  ) s;
  select array_agg(x::public.item_condition) into conds
  from jsonb_array_elements_text(coalesce(f -> 'conditions', '[]')) x;
  select coalesce(array_agg(case when b.blocker_id = me.id then b.blocked_id else b.blocker_id end), '{}') into hidden
  from public.blocks b where b.blocker_id = me.id or b.blocked_id = me.id;

  select coalesce(jsonb_agg(private.feed_item(x.id, me.id) order by x.n), '[]') into items
  from unnest(array(
    select l.id
    from public.listings l
    where l.campus_id = me.campus_id
      and l.status in ('active', 'hold')
      and l.kind in ('sale', 'free')
      and l.seller_id <> me.id
      and (l.expires_at is null or l.expires_at > v_now)
      and l.seller_id <> all (hidden)
      and (qq is null
           or l.search @@ tsq
           or nq operator(extensions.<%) lower(private.unaccent_immutable(l.title)))
      and (cats is null or l.category_id = any (cats))
      and (v_min is null or l.price_cents >= v_min)
      and (v_max is null or l.price_cents <= v_max)
      and (conds is null or l.condition = any (conds))
      and (not v_free or l.kind = 'free' or l.price_cents = 0)
      and not (v_hide and exists (
        select 1 from public.swipes s where s.user_id = me.id and s.listing_id = l.id))
    order by
      case when v_sort = 'price_asc' then l.price_cents end asc,
      case when v_sort = 'price_desc' then l.price_cents end desc,
      case when v_sort = 'relevance' then
        coalesce(ts_rank(l.search, tsq), 0)
        + extensions.word_similarity(nq, lower(private.unaccent_immutable(l.title)))
      end desc nulls last,
      l.bumped_at desc, l.id desc
    offset off limit 20
  )) with ordinality x(id, n);
  return items;
end;
$$;

-- search_suggest: saved searches, categories, trending terms and matching
-- titles for what's typed. Under 2 characters it returns the trending terms
-- alone (the empty search screen, B14; DEC 58).
create or replace function public.search_suggest(q text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  qq text := lower(private.unaccent_immutable(btrim(coalesce(search_suggest.q, ''))));
  tsq tsquery;
  hidden uuid[];
  res jsonb;
begin
  perform private.hit('search_suggest', 600, interval '1 hour');
  if char_length(qq) < 2 then
    select coalesce(jsonb_agg(jsonb_build_object('type', 'trending', 'label', t.term, 'count', t.saves) order by t.rank), '[]')
      into res
    from public.campus_trending_terms t where t.campus_id = me.campus_id;
    return res;
  end if;
  -- The title match keeps the 0.5 threshold of the one-row check. pg_trgm is
  -- loaded first: a role can't set the option before the module defines it.
  perform extensions.word_similarity('', '');
  perform set_config('pg_trgm.word_similarity_threshold', '0.5', true);
  tsq := websearch_to_tsquery('english', qq);
  if numnode(tsq) = 0 then
    tsq := null;
  end if;
  select coalesce(array_agg(case when b.blocker_id = me.id then b.blocked_id else b.blocker_id end), '{}') into hidden
  from public.blocks b where b.blocker_id = me.id or b.blocked_id = me.id;

  with s as (
    select 1 as grp, 'saved' as type, ss.query as label, null::int as count, ss.created_at::text as k
    from public.saved_searches ss
    where ss.user_id = me.id and ss.query is not null and lower(ss.query) like qq || '%'
    union all
    select 2, 'category', c.name, (
             select count(*)::int from public.listings l
             where l.campus_id = me.campus_id and l.status = 'active' and l.category_id = c.id), c.name
    from public.categories c
    where lower(c.name) like qq || '%' or lower(c.name) like '% ' || qq || '%'
    union all
    select 3, 'trending', t.term, t.saves, lpad(t.rank::text, 3, '0')
    from public.campus_trending_terms t
    where t.campus_id = me.campus_id and t.term like qq || '%'
    union all
    -- Only the first 8 titles (by title) can make the list.
    (select distinct on (lower(l.title)) 4, 'title', l.title, null::int, l.title
     from public.listings l
     where l.campus_id = me.campus_id and l.status = 'active' and l.seller_id <> me.id
       and l.seller_id <> all (hidden)
       and (l.search @@ tsq or qq operator(extensions.<%) lower(private.unaccent_immutable(l.title)))
     order by lower(l.title), l.title
     limit 8)
  )
  select coalesce(jsonb_agg(jsonb_build_object('type', d.type, 'label', d.label, 'count', d.count) order by d.grp, d.k), '[]')
    into res
  from (
    select * from (select distinct on (lower(label)) * from s order by lower(label), grp) u
    order by grp, k
    limit 8
  ) d;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- Feed (Q02). sort: 'hot' (default), 'new', 'top' (last 7 days).
-- cursor: the next_cursor of the page before (or the old {"offset": n}).
-- Returns {items, next_cursor, pinned}.
create or replace function public.get_quad_feed(sort text default 'hot', cursor jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
declare
  me public.profiles := private.require_quad(false);
  v_sort text := coalesce(get_quad_feed.sort, 'hot');
  page int := 20;
  hot_window int := 500;
  v_now timestamptz := private.now();
  t timestamptz;
  off int := 0;
  k_h double precision;
  k_s int;
  k_c timestamptz;
  k_id uuid;
  bad bool := false;
  hidden uuid[];
  mutes text[];
  ids uuid[];
  keys jsonb;
  total int;
  items jsonb;
  pinned jsonb;
begin
  perform private.hit('quad_feed', 240, interval '1 hour');
  if v_sort not in ('hot', 'new', 'top') then
    perform private.raise('INVALID', 'sort');
  end if;
  begin
    off := greatest(coalesce((get_quad_feed.cursor ->> 'offset')::int, 0), 0);
    t := coalesce((get_quad_feed.cursor ->> 't')::timestamptz, v_now);
    k_h := (get_quad_feed.cursor ->> 'h')::double precision;
    k_s := (get_quad_feed.cursor ->> 's')::int;
    k_c := (get_quad_feed.cursor ->> 'c')::timestamptz;
    k_id := (get_quad_feed.cursor ->> 'id')::uuid;
  exception when others then
    bad := true;
  end;
  if bad or (get_quad_feed.cursor is not null and not (get_quad_feed.cursor ? 'offset')
             and (k_c is null or k_id is null
                  or (v_sort = 'hot' and k_h is null) or (v_sort = 'top' and k_s is null))) then
    perform private.raise('INVALID', 'cursor');
  end if;

  -- Hidden from this reader: authors they hid, people they blocked (either
  -- way) and posts with a muted word. Their own posts always show.
  select coalesce(array_agg(x), '{}') into hidden from (
    select h.hidden_author_id as x from public.quad_hides h where h.user_id = me.id
    union select b.blocked_id from public.blocks b where b.blocker_id = me.id
    union select b.blocker_id from public.blocks b where b.blocked_id = me.id
  ) s;
  select coalesce(array_agg('%' || lower(m.keyword) || '%'), '{}') into mutes
  from public.quad_mutes m where m.user_id = me.id;

  with base as not materialized (
    select p.id, p.created_at, p.score,
           (p.score + 1)::double precision
             / power(greatest(extract(epoch from (t - p.created_at)) / 3600.0, 0) + 2, 1.5) as h
    from public.quad_posts p
    where p.campus_id = me.campus_id
      and p.status in ('live', 'held')
      and (p.status = 'live' or p.author_id = me.id)
      and (p.expires_at is null or p.expires_at > v_now)
      and (p.author_id = me.id or (p.author_id <> all (hidden) and not (lower(p.body) like any (mutes))))
      and (v_sort <> 'top' or p.created_at > v_now - interval '7 days')
      and (v_sort <> 'hot' or p.created_at <= t)
      and (v_sort <> 'new' or k_c is null or (p.created_at, p.id) < (k_c, k_id))
      and (v_sort <> 'top' or k_s is null or (p.score, p.created_at, p.id) < (k_s, k_c, k_id))
  ), pool as (
    select * from base where v_sort <> 'hot'
    union all
    -- Hot ranks the newest posts and the highest scored ones. A post in
    -- neither is older and lower scored than both sets, so it can't reach
    -- the first pages.
    select * from (
      (select * from base where v_sort = 'hot' order by created_at desc, id desc limit hot_window)
      union
      (select * from base where v_sort = 'hot' order by score desc, created_at desc, id desc limit hot_window)
    ) hh
  ), pick as (
    select b.* from pool b
    where v_sort <> 'hot' or k_h is null or (b.h, b.created_at, b.id) < (k_h, k_c, k_id)
    order by case when v_sort = 'hot' then b.h end desc,
             case when v_sort = 'top' then b.score end desc,
             b.created_at desc, b.id desc
    offset off limit page + 1
  )
  select array_agg(id order by n) filter (where n <= page), (array_agg(k) filter (where n = page))[1], count(*)
    into ids, keys, total
  from (
    select pk.id, row_number() over (order by
             case when v_sort = 'hot' then pk.h end desc,
             case when v_sort = 'top' then pk.score end desc,
             pk.created_at desc, pk.id desc) as n,
           jsonb_strip_nulls(jsonb_build_object(
             't', case when v_sort = 'hot' then t end,
             'h', case when v_sort = 'hot' then pk.h::text end,
             's', case when v_sort = 'top' then pk.score end,
             'c', pk.created_at, 'id', pk.id)) as k
    from pick pk
  ) r;

  select coalesce(jsonb_agg(private.quad_post_json(p, me.id) order by x.n), '[]'::jsonb) into items
  from unnest(ids) with ordinality x(id, n)
  join public.quad_posts p on p.id = x.id;

  if k_c is null and off = 0 then
    select jsonb_build_object('id', a.id, 'type', a.type, 'title', a.title, 'body', a.body)
      into pinned
    from public.announcements a
    where (a.campus_id = me.campus_id or a.campus_id is null)
      and a.pinned_until > v_now
    order by a.created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'items', items,
    -- A next page only when one more row exists past this one.
    'next_cursor', case when total > page then keys end,
    'pinned', pinned
  );
end;
$$;
