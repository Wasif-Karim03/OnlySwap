CREATE OR REPLACE FUNCTION public.get_quad_feed(sort text DEFAULT 'hot'::text, cursor jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me public.profiles := private.require_quad(false);
  page int := 20;
  off int := greatest(coalesce((cursor ->> 'offset')::int, 0), 0);
  items jsonb;
  n int;
  pinned jsonb;
begin
  perform private.hit('quad_feed', 240, interval '1 hour');
  if coalesce(sort, 'hot') not in ('hot', 'new', 'top') then
    perform private.raise('INVALID', 'sort');
  end if;

  select coalesce(jsonb_agg(private.quad_post_json(x.post, me.id) order by x.ord), '[]'::jsonb), count(*)
    into items, n
  from (
    select p as post, row_number() over (order by
             case coalesce(sort, 'hot')
               when 'new' then extract(epoch from p.created_at)
               when 'top' then p.score::double precision
               else private.quad_hot(p.score, p.created_at)
             end desc, p.created_at desc, p.id) as ord
    from public.quad_posts p
    where p.campus_id = me.campus_id
      and (p.status = 'live' or (p.author_id = me.id and p.status = 'held'))
      and (p.expires_at is null or p.expires_at > private.now())
      and (coalesce(sort, 'hot') <> 'top' or p.created_at > private.now() - interval '7 days')
      and not private.quad_hidden_for(me.id, p.author_id, p.body)
    order by ord
    offset off limit page
  ) x;

  if off = 0 then
    select jsonb_build_object('id', a.id, 'type', a.type, 'title', a.title, 'body', a.body)
      into pinned
    from public.announcements a
    where (a.campus_id = me.campus_id or a.campus_id is null)
      and a.pinned_until > private.now()
    order by a.created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'items', items,
    'next_cursor', case when n = page then jsonb_build_object('offset', off + page) end,
    'pinned', pinned
  );
end;
$function$

(1 row)
