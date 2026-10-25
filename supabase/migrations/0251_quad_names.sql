-- DEC 150 (owner, 2026-10-24): the Quad is no longer anonymous. Apple's rule
-- 1.2 bars apps used for "random or anonymous chat", so posts and replies
-- now carry their author's display name and photo. Additive: alias_no and
-- is_op stay for builds already installed.

create or replace function private.quad_post_json(p public.quad_posts, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    -- DEC 150: the Quad shows who wrote it (first name and last initial),
    -- like the rest of the app. Null once the account is gone.
    'author', (select jsonb_build_object('id', a.id, 'display_name', a.display_name,
                                         'avatar_path', a.avatar_path)
               from public.profiles a where a.id = p.author_id),
    'kind', p.kind,
    'body', p.body,
    'photo_path', p.photo_path,
    'place', p.place,
    'score', p.score,
    'reply_count', p.reply_count,
    'status', p.status,
    'replies_enabled', p.replies_enabled,
    'expires_at', p.expires_at,
    'created_at', p.created_at,
    'is_mine', p.author_id = p_me,
    'my_vote', coalesce((select v.value from public.quad_votes v
                         where v.user_id = p_me and v.target_type = 'post' and v.target_id = p.id), 0),
    'poll', case when p.kind = 'poll' then jsonb_build_object(
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'votes', o.votes)
                                            order by o.idx)
                           from public.quad_poll_options o where o.post_id = p.id), '[]'::jsonb),
      'total', coalesce((select sum(o.votes)::int from public.quad_poll_options o where o.post_id = p.id), 0),
      'my_option', (select pv.option_id from public.quad_poll_votes pv where pv.post_id = p.id and pv.user_id = p_me)
    ) end
  )
$$;

create or replace function private.quad_reply_json(r public.quad_replies, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    -- DEC 150: the Quad shows who wrote it (first name and last initial),
    -- like the rest of the app. Null once the account is gone.
    'author', (select jsonb_build_object('id', a.id, 'display_name', a.display_name,
                                         'avatar_path', a.avatar_path)
               from public.profiles a where a.id = r.author_id),
    'body', r.body,
    'alias_no', r.alias_no,
    'is_op', r.alias_no = 0,
    'is_mine', r.author_id = p_me,
    'score', r.score,
    'status', r.status,
    'created_at', r.created_at,
    'my_vote', coalesce((select v.value from public.quad_votes v
                         where v.user_id = p_me and v.target_type = 'reply' and v.target_id = r.id), 0)
  )
$$;
