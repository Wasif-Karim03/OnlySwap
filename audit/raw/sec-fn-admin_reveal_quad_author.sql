CREATE OR REPLACE FUNCTION public.admin_reveal_quad_author(target_type text, id uuid, case_ref text, reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  t record;
  why text := private.need_reason(admin_reveal_quad_author.reason);
  ref text := btrim(coalesce(admin_reveal_quad_author.case_ref, ''));
  fresh boolean;
  p public.profiles;
  email text;
begin
  if char_length(ref) < 3 then
    perform private.raise('INVALID', 'case_ref');
  end if;
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m
    where m ->> 'method' = 'totp'
      and to_timestamp((m ->> 'timestamp')::double precision) >= private.now() - interval '10 minutes'
  ) into fresh;
  if not fresh then
    perform private.raise('FORBIDDEN', 'mfa_required');
  end if;
  perform private.hit_key(a.user_id, 'quad_reveal', 5, interval '1 day');

  t := private.quad_target(admin_reveal_quad_author.target_type, admin_reveal_quad_author.id);
  select * into p from public.profiles x where x.id = t.author;
  select u.email into email from auth.users u where u.id = t.author;

  perform private.audit(a.user_id, 'quad.reveal', 'quad_' || admin_reveal_quad_author.target_type,
    admin_reveal_quad_author.id::text, t.campus, why, jsonb_build_object('case_ref', ref, 'author_id', t.author));
  if email is not null then
    perform private.queue_email(email, 'admin_reveal_receipt',
      jsonb_build_object('admin', 'An OnlySwap safety admin', 'what', 'who wrote a Quad post'),
      'quad_reveal:' || admin_reveal_quad_author.id || ':' || a.user_id);
  end if;

  return jsonb_build_object('user_id', t.author, 'display_name', p.display_name, 'status', p.status,
                            'case_ref', ref);
end;
$function$

(1 row)
