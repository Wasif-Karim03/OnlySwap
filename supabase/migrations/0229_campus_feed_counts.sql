-- 0229: get_campus_feed counts only on the first page (audit E-13, DEC 116).
-- Each call counted the campus's active listings and its founding sellers,
-- linear in campus size (5.1 ms at 10.7k listings). The app reads day_one,
-- active_listings and founding from page one only (CampusFeedScreen), so pages
-- after the first return them as null. Same signature; grants are kept.

CREATE OR REPLACE FUNCTION public.get_campus_feed(kind text DEFAULT NULL::text, cursor jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  k text := lower(coalesce(nullif(btrim(get_campus_feed.kind), ''), 'all'));
  c_at timestamptz;
  c_id uuid;
  n int := 20;
  rows_ uuid[];
  items jsonb;
  last_id uuid;
  last_at timestamptz;
  active_n int;
  c public.campuses;
begin
  if k not in ('all', 'food', 'free', 'wanted', 'new', 'news') then
    perform private.raise('INVALID', 'kind');
  end if;
  perform private.hit('get_campus_feed', 120, interval '1 hour');
  begin
    c_at := nullif(get_campus_feed.cursor ->> 'bumped_at', '')::timestamptz;
    c_id := nullif(get_campus_feed.cursor ->> 'id', '')::uuid;
  exception when others then
    perform private.raise('INVALID', 'cursor');
  end;
  if (c_at is null) <> (c_id is null) then
    perform private.raise('INVALID', 'cursor');
  end if;

  select array_agg(x.id order by x.bumped_at desc, x.id desc) into rows_
  from (
    select l.id, l.bumped_at
    from public.listings l
    where l.campus_id = me.campus_id
      and l.status = 'active'
      and (l.expires_at is null or l.expires_at > private.now())
      and case k
            when 'food' then l.kind = 'food'
            when 'free' then l.kind = 'free'
            when 'wanted' then l.kind = 'wanted'
            when 'news' then l.kind = 'news'
            when 'new' then l.kind = 'sale' and l.created_at > private.now() - interval '7 days'
            else l.kind in ('food', 'free', 'wanted', 'news')
                 or (l.kind = 'sale' and l.created_at > private.now() - interval '7 days')
          end
      and not private.is_blocked(me.id, l.seller_id)
      and (c_at is null or (l.bumped_at, l.id) < (c_at, c_id))
    order by l.bumped_at desc, l.id desc
    limit n
  ) x;

  select coalesce(jsonb_agg(private.feed_item(l.id, me.id) || jsonb_build_object(
           'wanted_max_cents', l.wanted_max_cents, 'wanted_ref', l.wanted_ref,
           'place', private.listing_place(l))
         order by l.bumped_at desc, l.id desc), '[]')
    into items
  from public.listings l
  where l.id = any(coalesce(rows_, '{}'));

  if coalesce(array_length(rows_, 1), 0) = n then
    last_id := rows_[n];
    select l.bumped_at into last_at from public.listings l where l.id = last_id;
  end if;

  -- The day-one hero and founding card are read from page one only, so later
  -- pages skip both counts (E-13).
  if get_campus_feed.cursor is not null then
    return jsonb_build_object(
      'items', items,
      'next_cursor', case when last_id is null then null
                          else jsonb_build_object('bumped_at', last_at, 'id', last_id) end,
      'day_one', null, 'active_listings', null, 'founding', null);
  end if;

  select * into c from public.campuses x where x.id = me.campus_id;
  select count(*)::int into active_n from public.listings l
  where l.campus_id = me.campus_id and l.status = 'active' and l.kind in ('sale', 'free');

  return jsonb_build_object(
    'items', items,
    'next_cursor', case when last_id is null then null
                        else jsonb_build_object('bumped_at', last_at, 'id', last_id) end,
    'day_one', active_n < 10,
    'active_listings', active_n,
    'founding', jsonb_build_object(
      'limit', c.founding_seller_limit,
      'left', greatest(c.founding_seller_limit - (
                select count(*)::int from public.profiles p
                where p.campus_id = c.id and p.founding_seller_until is not null), 0),
      'mine', me.founding_seller_until is not null and me.founding_seller_until >= private.now()));
end;
$function$;
