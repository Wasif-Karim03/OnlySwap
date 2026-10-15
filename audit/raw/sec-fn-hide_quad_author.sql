CREATE OR REPLACE FUNCTION public.hide_quad_author(post_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me public.profiles := private.require_quad(false);
  p public.quad_posts := private.quad_live_post(hide_quad_author.post_id, me);
begin
  if p.author_id = me.id then
    perform private.raise('INVALID', 'own');
  end if;
  insert into public.quad_hides (user_id, hidden_author_id, source_post_id, excerpt, created_at)
  values (me.id, p.author_id, p.id, left(p.body, 80), private.now())
  on conflict (user_id, hidden_author_id) do nothing;
end;
$function$

(1 row)
