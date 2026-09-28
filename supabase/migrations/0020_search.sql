-- 0020_search.sql (S20: P6-SRCH-01, API §3, DEC 58)
--   search_listings, search_suggest, saved-search CRUD, saved_search_new_counts,
--   the saved-search cap and the hourly campus_trending_terms refresh.
--
-- Filters (jsonb, all optional): category_ids int[], min_cents int, max_cents int,
-- conditions text[] (item_condition), free_only bool, sort text
-- ('relevance' | 'new' | 'price_asc' | 'price_desc'), hide_swiped bool.
-- Unknown keys or bad values raise INVALID:filters.

create or replace function private.check_search_filters(f jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
begin
  f := coalesce(f, '{}'::jsonb);
  if jsonb_typeof(f) <> 'object' then
    perform private.raise('INVALID', 'filters');
  end if;
  for k in select jsonb_object_keys(f) loop
    if k not in ('category_ids','min_cents','max_cents','conditions','free_only','sort','hide_swiped') then
      perform private.raise('INVALID', 'filters');
    end if;
  end loop;
  begin
    perform (select array_agg(x::smallint) from jsonb_array_elements_text(coalesce(f -> 'category_ids', '[]')) x);
    perform (select array_agg(x::public.item_condition) from jsonb_array_elements_text(coalesce(f -> 'conditions', '[]')) x);
    perform (f ->> 'min_cents')::int, (f ->> 'max_cents')::int, (f ->> 'free_only')::bool, (f ->> 'hide_swiped')::bool;
  exception when others then
    perform private.raise('INVALID', 'filters');
  end;
  if coalesce(f ->> 'sort', 'relevance') not in ('relevance','new','price_asc','price_desc') then
    perform private.raise('INVALID', 'filters');
  end if;
  return f;
end;
$$;

-- Text match: full text (stemmed, any order) or a close trigram match on the
-- title, so "mini frig" finds "Mini fridge".
create or replace function private.text_matches(l public.listings, q text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(btrim(q), '') = ''
    or l.search @@ websearch_to_tsquery('english', private.unaccent_immutable(q))
    or extensions.word_similarity(lower(private.unaccent_immutable(q)), lower(private.unaccent_immutable(l.title))) >= 0.5
$$;

create or replace function private.filters_match(l public.listings, f jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    (not (f ? 'category_ids') or jsonb_array_length(f -> 'category_ids') = 0
      or l.category_id in (select x::smallint from jsonb_array_elements_text(f -> 'category_ids') x)
      or l.category_id in (select c.id from public.categories c
                           where c.parent_id in (select x::smallint from jsonb_array_elements_text(f -> 'category_ids') x)))
    and (f ->> 'min_cents' is null or l.price_cents >= (f ->> 'min_cents')::int)
    and (f ->> 'max_cents' is null or l.price_cents <= (f ->> 'max_cents')::int)
    and (not (f ? 'conditions') or jsonb_array_length(f -> 'conditions') = 0
      or l.condition::text in (select jsonb_array_elements_text(f -> 'conditions')))
    and (not coalesce((f ->> 'free_only')::bool, false) or l.kind = 'free' or l.price_cents = 0)
$$;

-- ---------------------------------------------------------------------------
create or replace function public.search_listings(q text default null, filters jsonb default '{}', cursor jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  f jsonb := private.check_search_filters(search_listings.filters);
  qq text := nullif(btrim(coalesce(search_listings.q, '')), '');
  v_sort text := coalesce(f ->> 'sort', case when qq is null then 'new' else 'relevance' end);
  off int := 0;
  items jsonb;
begin
  perform private.hit('search_listings', 120, interval '1 hour');
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

  select coalesce(jsonb_agg(private.feed_item(x.id, me.id) order by x.ord), '[]') into items
  from (
    select l.id,
           row_number() over (order by
             case when v_sort = 'price_asc' then l.price_cents end asc,
             case when v_sort = 'price_desc' then l.price_cents end desc,
             case when v_sort = 'relevance' then
               ts_rank(l.search, websearch_to_tsquery('english', private.unaccent_immutable(qq)))
               + extensions.word_similarity(lower(private.unaccent_immutable(qq)), lower(private.unaccent_immutable(l.title)))
             end desc nulls last,
             l.bumped_at desc, l.id desc) as ord
    from public.listings l
    where l.campus_id = me.campus_id
      and l.status in ('active', 'hold')
      and l.kind in ('sale', 'free')
      and l.seller_id <> me.id
      and (l.expires_at is null or l.expires_at > private.now())
      and not private.is_blocked(me.id, l.seller_id)
      and private.text_matches(l, qq)
      and private.filters_match(l, f)
      and not (coalesce((f ->> 'hide_swiped')::bool, false) and exists (
        select 1 from public.swipes s where s.user_id = me.id and s.listing_id = l.id))
    order by ord
    offset off limit 20
  ) x;
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
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  qq text := lower(private.unaccent_immutable(btrim(coalesce(search_suggest.q, ''))));
  res jsonb;
begin
  perform private.hit('search_suggest', 600, interval '1 hour');
  if char_length(qq) < 2 then
    select coalesce(jsonb_agg(jsonb_build_object('type', 'trending', 'label', t.term, 'count', t.saves) order by t.rank), '[]')
      into res
    from public.campus_trending_terms t where t.campus_id = me.campus_id;
    return res;
  end if;

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
    select 4, 'title', l.title, null::int, l.title
    from public.listings l
    where l.campus_id = me.campus_id and l.status = 'active' and l.seller_id <> me.id
      and not private.is_blocked(me.id, l.seller_id)
      and private.text_matches(l, qq)
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
-- Saved searches (max 20 per person, API §3).
create or replace function private.saved_search_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_searches s where s.user_id = new.user_id) >= 20 then
    perform private.raise('INVALID', 'saved_search_limit');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_saved_search_cap on public.saved_searches;
create trigger trg_saved_search_cap before insert on public.saved_searches
for each row execute function private.saved_search_cap();

create or replace function private.saved_search_json(s public.saved_searches)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('id', s.id, 'query', s.query, 'filters', s.filters, 'alerts', s.alerts,
                            'last_seen_at', s.last_seen_at, 'created_at', s.created_at)
$$;

create or replace function public.create_saved_search(query text default null, filters jsonb default '{}', alerts bool default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  f jsonb := private.check_search_filters(create_saved_search.filters);
  qq text := nullif(btrim(coalesce(create_saved_search.query, '')), '');
  r public.saved_searches;
begin
  perform private.hit('saved_search', 30, interval '1 day');
  if qq is null and f = '{}'::jsonb then
    perform private.raise('INVALID', 'query');
  end if;
  if char_length(coalesce(qq, '')) > 80 then
    perform private.raise('INVALID', 'query');
  end if;
  -- The same search saved twice is one search.
  select * into r from public.saved_searches s
  where s.user_id = me.id and s.query is not distinct from qq and s.filters = f;
  if found then
    return private.saved_search_json(r);
  end if;
  insert into public.saved_searches (user_id, campus_id, query, filters, alerts, last_seen_at, created_at)
  values (me.id, me.campus_id, qq, f, coalesce(create_saved_search.alerts, true), private.now(), private.now())
  returning * into r;
  return private.saved_search_json(r);
end;
$$;

create or replace function public.update_saved_search(id uuid, alerts bool default null, seen bool default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  r public.saved_searches;
begin
  update public.saved_searches s
     set alerts = coalesce(update_saved_search.alerts, s.alerts),
         last_seen_at = case when update_saved_search.seen then private.now() else s.last_seen_at end
   where s.id = update_saved_search.id and s.user_id = me.id
  returning * into r;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  return private.saved_search_json(r);
end;
$$;

create or replace function public.delete_saved_search(id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
begin
  delete from public.saved_searches s where s.id = delete_saved_search.id and s.user_id = me.id;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
end;
$$;

create or replace function public.list_saved_searches()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
begin
  return coalesce((select jsonb_agg(private.saved_search_json(s) order by s.created_at desc)
                   from public.saved_searches s where s.user_id = me.id), '[]');
end;
$$;

-- New listings since each search was last opened.
create or replace function public.saved_search_new_counts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'new_count', (
      select count(*)::int from public.listings l
      where l.campus_id = me.campus_id and l.status = 'active' and l.kind in ('sale','free')
        and l.seller_id <> me.id and l.created_at > s.last_seen_at
        and not private.is_blocked(me.id, l.seller_id)
        and private.text_matches(l, s.query) and private.filters_match(l, s.filters))) order by s.created_at desc)
    from public.saved_searches s where s.user_id = me.id), '[]');
end;
$$;

-- ---------------------------------------------------------------------------
-- Trending terms refresh (hourly).
create or replace function private.refresh_trending()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.campus_trending_terms;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('trending', '7 * * * *', 'select private.refresh_trending()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
revoke all on function private.check_search_filters(jsonb) from public, anon, authenticated;
revoke all on function private.text_matches(public.listings, text) from public, anon, authenticated;
revoke all on function private.filters_match(public.listings, jsonb) from public, anon, authenticated;
revoke all on function private.saved_search_json(public.saved_searches) from public, anon, authenticated;
revoke all on function private.refresh_trending() from public, anon, authenticated;

revoke all on function public.search_listings(text, jsonb, jsonb) from public, anon;
revoke all on function public.search_suggest(text) from public, anon;
revoke all on function public.create_saved_search(text, jsonb, bool) from public, anon;
revoke all on function public.update_saved_search(uuid, bool, bool) from public, anon;
revoke all on function public.delete_saved_search(uuid) from public, anon;
revoke all on function public.list_saved_searches() from public, anon;
revoke all on function public.saved_search_new_counts() from public, anon;

grant execute on function public.search_listings(text, jsonb, jsonb) to authenticated;
grant execute on function public.search_suggest(text) to authenticated;
grant execute on function public.create_saved_search(text, jsonb, bool) to authenticated;
grant execute on function public.update_saved_search(uuid, bool, bool) to authenticated;
grant execute on function public.delete_saved_search(uuid) to authenticated;
grant execute on function public.list_saved_searches() to authenticated;
grant execute on function public.saved_search_new_counts() to authenticated;
