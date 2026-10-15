CREATE OR REPLACE FUNCTION public.get_quad_thread(post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me public.profiles := private.require_quad(false);
  p public.quad_posts := private.quad_live_post(get_quad_thread.post_id, me);
begin
  return jsonb_build_object(
    'post', private.quad_post_json(p, me.id),
    'replies', coalesce((
      select jsonb_agg(private.quad_reply_json(r, me.id) order by r.created_at, r.id)
      from public.quad_replies r
      where r.post_id = p.id
        and (r.status = 'live' or (r.author_id = me.id and r.status = 'held'))
        and not private.quad_hidden_for(me.id, r.author_id, r.body)
    ), '[]'::jsonb)
  );
end;
$function$

(1 row)
