-- UX audit (2026-10-25): replies get the same Hide and Delete as posts. Since
-- DEC 150 the Quad shows real names, so a reply you can't take back stops
-- people replying, and harassment in replies needs a way to make the person
-- go away. Block reuses public.block_user from the app (blocks already hide
-- Quad posts and replies both ways). Additive.

-- Delete your own reply (status 'removed', like delete_quad_post).
create or replace function public.delete_quad_reply(reply_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(false);
  r public.quad_replies;
begin
  select * into r from public.quad_replies q
  where q.id = delete_quad_reply.reply_id and q.author_id = me.id and q.status <> 'removed'
  for update;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  update public.quad_replies set status = 'removed', hold_reason = 'author_deleted' where id = r.id;
  if r.status = 'live' then
    update public.quad_posts set reply_count = greatest(reply_count - 1, 0) where id = r.post_id;
  end if;
end;
$$;

-- Hide a reply's author everywhere in the Quad (same table as hide_quad_author;
-- Unhide works from the source post, here the reply's post).
create or replace function public.hide_quad_reply_author(reply_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(false);
  r public.quad_replies;
  p public.quad_posts;
begin
  select * into r from public.quad_replies q where q.id = hide_quad_reply_author.reply_id and q.status = 'live';
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  p := private.quad_live_post(r.post_id, me);
  if r.author_id = me.id then
    perform private.raise('INVALID', 'own');
  end if;
  insert into public.quad_hides (user_id, hidden_author_id, source_post_id, excerpt, created_at)
  values (me.id, r.author_id, p.id, left(r.body, 80), private.now())
  on conflict (user_id, hidden_author_id) do nothing;
end;
$$;

revoke all on function public.delete_quad_reply(uuid) from public, anon;
revoke all on function public.hide_quad_reply_author(uuid) from public, anon;
grant execute on function public.delete_quad_reply(uuid) to authenticated, service_role;
grant execute on function public.hide_quad_reply_author(uuid) to authenticated, service_role;
