CREATE OR REPLACE FUNCTION public.get_my_quad_hides()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me public.profiles := private.require_quad(false);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('source_post_id', h.source_post_id, 'excerpt', h.excerpt,
                                        'created_at', h.created_at) order by h.created_at desc)
    from public.quad_hides h where h.user_id = me.id
  ), '[]'::jsonb);
end;
$function$

(1 row)
