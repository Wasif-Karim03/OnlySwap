-- 0247_media_lock_races.sql · IR4-02, IR4-03, IR5-01 (DEC 139 follow-up).
-- Additive: two function bodies are replaced; no signature, grant or DDL
-- change (create or replace keeps the 0200/0202 ACLs).
--
-- Lock order (RV-03, see 0246): the media advisory locks first, then rate
-- counters and row locks. Two more functions now follow it:
--   * vote_quad takes the post author's media lock (lock_report_media) as
--     its first statement. Before, it locked the quad_posts row and then
--     reached the lock through snapshot_evidence on auto-hide, while
--     create_report holds that lock and waits on the same row (IR4-02).
--     The reply path is untouched: lock_report_media has no quad_reply
--     branch, so it holds no media lock and cannot cycle. If that branch is
--     ever added, the reply path needs the same first-statement lock.
--   * send_message takes the sender's media lock before it re-checks
--     client_id and claims the photo, so a retry that lost to its own first
--     send returns that message and claims nothing (IR4-03). A key whose
--     insert lost a client_id race is detached only when no message in the
--     chat still references it: claim_upload supports reusing an attached
--     key across messages, and detaching one still shown would let the GC
--     delete it after 24 h (IR5-01).

create or replace function public.vote_quad(target_type text, target_id uuid, value smallint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_quad(true);
  p public.quad_posts;
  r public.quad_replies;
  author uuid;
  old_value smallint;
  delta int;
  new_score int;
  floor_score int;
begin
  -- The post author's media lock first (RV-03): the auto-hide below snapshots
  -- the post, and create_report takes this lock before the quad_posts row.
  if vote_quad.target_type = 'post' then
    perform private.lock_report_media('quad_post', vote_quad.target_id::text);
  end if;
  perform private.hit('quad_vote', 600, interval '1 hour');
  if vote_quad.target_type not in ('post', 'reply') then
    perform private.raise('INVALID', 'target_type');
  end if;
  if vote_quad.value not in (-1, 0, 1) then
    perform private.raise('INVALID', 'value');
  end if;

  if vote_quad.target_type = 'post' then
    p := private.quad_live_post(vote_quad.target_id, me, true);
    if p.status <> 'live' then
      perform private.raise('NOT_FOUND');
    end if;
    author := p.author_id;
  else
    select * into r from public.quad_replies q where q.id = vote_quad.target_id for update;
    if not found or r.status <> 'live' then
      perform private.raise('NOT_FOUND');
    end if;
    p := private.quad_live_post(r.post_id, me);
    if private.quad_hidden_for(me.id, r.author_id, r.body) then
      perform private.raise('NOT_FOUND');
    end if;
    author := r.author_id;
  end if;
  if author = me.id then
    perform private.raise('FORBIDDEN', 'own');
  end if;

  select v.value into old_value from public.quad_votes v
  where v.user_id = me.id and v.target_type = vote_quad.target_type and v.target_id = vote_quad.target_id;
  delta := vote_quad.value - coalesce(old_value, 0);

  if vote_quad.value = 0 then
    delete from public.quad_votes v
    where v.user_id = me.id and v.target_type = vote_quad.target_type and v.target_id = vote_quad.target_id;
  else
    insert into public.quad_votes (user_id, target_type, target_id, value, created_at)
    values (me.id, vote_quad.target_type, vote_quad.target_id, vote_quad.value, private.now())
    on conflict (user_id, target_type, target_id) do update set value = excluded.value;
  end if;

  select c.quad_autohide_score into floor_score from public.campuses c where c.id = me.campus_id;

  if vote_quad.target_type = 'post' then
    update public.quad_posts set score = score + delta where id = p.id returning score into new_score;
    if new_score <= floor_score then
      update public.quad_posts set status = 'hidden', hold_reason = 'downvoted' where id = p.id;
      insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, details,
                                  evidence, priority, created_at)
      values (p.campus_id, null, 'quad_post', p.id::text, p.author_id, 'other', 'Auto-hidden by votes',
              private.snapshot_evidence('quad_post', p.id::text), 2, private.now())
      on conflict do nothing;
    elsif delta > 0 and new_score in (50, 100) then
      perform private.queue_notification(
        p.author_id, 'quad_milestone', 'quad', 'Your post is popular',
        'Your Quad post reached ' || new_score || ' points.',
        jsonb_build_object('post_id', p.id), false, 'quad_milestone:' || p.id || ':' || new_score);
    end if;
  else
    update public.quad_replies set score = score + delta where id = r.id returning score into new_score;
    if new_score <= floor_score then
      update public.quad_replies set status = 'hidden', hold_reason = 'downvoted' where id = r.id;
      update public.quad_posts set reply_count = greatest(reply_count - 1, 0) where id = r.post_id;
      insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, details,
                                  evidence, priority, created_at)
      values (p.campus_id, null, 'quad_reply', r.id::text, r.author_id, 'other', 'Auto-hidden by votes',
              private.snapshot_evidence('quad_reply', r.id::text), 2, private.now())
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object('score', new_score, 'my_vote', vote_quad.value);
end;
$$;

create or replace function public.send_message(
  chat_id uuid,
  body text,
  client_id uuid,
  kind text default 'text',
  photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(send_message.chat_id, me.id);
  other uuid := case when c.buyer_id = me.id then c.seller_id else c.buyer_id end;
  m public.messages;
  txt text := btrim(coalesce(send_message.body, ''));
  v text;
  is_photo boolean := send_message.kind = 'photo';
begin
  -- Idempotent: the same client_id returns the message already sent (T-INT-CHAT-01).
  select * into m from public.messages x where x.chat_id = c.id and x.client_id = send_message.client_id;
  if found then
    return private.message_json(m, me.id);
  end if;
  if is_photo and not coalesce((select (x.value #>> '{}')::boolean from public.app_config x
                                where x.key = 'chat_photos_enabled'), false) then
    perform private.raise('FEATURE_OFF');
  end if;
  if send_message.kind not in ('text', 'photo') then
    perform private.raise('INVALID', 'kind');
  end if;
  if c.status = 'closed' then
    perform private.raise('CHAT_CLOSED');
  end if;
  if c.status = 'blocked' or other is null or private.is_blocked(me.id, other) then
    perform private.raise('CHAT_BLOCKED');
  end if;
  if send_message.client_id is null then
    perform private.raise('INVALID', 'client_id');
  end if;
  if is_photo then
    if send_message.photo_path is null
       or send_message.photo_path !~ ('^c/' || me.campus_id::text || '/chat/' || c.id::text
                                      || '/[0-9a-f-]{36}_full\.webp$') then
      perform private.raise('INVALID', 'photo_path');
    end if;
    -- The photo must be the caller's recorded upload (0246); chat photos have no thumbnail.
    perform private.media_lock(me.id);  -- the lock claim_upload takes; a losing retry now sees the winner
    select * into m from public.messages x where x.chat_id = c.id and x.client_id = send_message.client_id;
    if found then
      return private.message_json(m, me.id);
    end if;
    perform private.claim_upload(me.id, 'chat', send_message.photo_path, false);
    if char_length(txt) > 1000 then
      perform private.raise('INVALID', 'body');
    end if;
    perform private.hit('send_photo', 30, interval '1 day');
  else
    if send_message.photo_path is not null then
      perform private.raise('INVALID', 'photo_path');
    end if;
    if txt = '' or char_length(txt) > 1000 then
      perform private.raise('INVALID', 'body');
    end if;
  end if;
  perform private.hit('send_message', 60, interval '1 minute');
  perform private.hit('send_message_day', 1000, interval '1 day');
  v := private.check_text(txt, 'chat');
  if v like 'block:%' then
    perform private.raise('BANNED_TERM', substr(v, 7));
  end if;

  insert into public.messages (chat_id, sender_id, kind, body, photo_path, client_id, created_at)
  values (c.id, me.id, case when is_photo then 'photo' else 'text' end::public.message_kind,
          nullif(txt, ''), send_message.photo_path, send_message.client_id, private.now())
  on conflict (chat_id, client_id) do nothing
  returning * into m;
  if not found then
    select * into m from public.messages x where x.chat_id = c.id and x.client_id = send_message.client_id;
    -- Lost the client_id race: give the key back to the GC unless a message
    -- in this chat still shows it (claim_upload re-attaches reused keys). The
    -- media lock above is still held, so no send of ours can attach it now.
    if is_photo and m.photo_path is distinct from send_message.photo_path
       and not exists (select 1 from public.messages x
                       where x.chat_id = c.id and x.photo_path = send_message.photo_path) then
      perform private.detach_uploads(me.id, array[send_message.photo_path]);
    end if;
  end if;
  return private.message_json(m, me.id);
end;
$$;
