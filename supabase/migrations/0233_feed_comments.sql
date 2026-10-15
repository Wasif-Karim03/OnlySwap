-- 0233: likes and comments on Feed posts (DEC 121).
-- Every Feed post (sale, free, wanted, food, news) can be liked, and has a
-- Facebook-style comment section: comments, one level of replies, likes on
-- comments, real names. The author can turn comments off on their post.
--   * Reads and writes are RPCs only; RLS is on and nothing is granted.
--   * Text: contact details are blocked (talk in chat after an offer), banned
--     words block or hold. A held comment is seen only by its author and goes
--     to the Reports queue (a system report, no reporter).
--   * Three open reports from accounts older than 7 days hold a comment until
--     a moderator looks (same rule as the Quad, A-11).
--   * Notifications: a comment on your post and a reply to your comment push
--     (grp 'comments', new pref `comments`, on by default). Likes only land in
--     the bell (push_state 'skipped'), one row per post or comment that
--     updates to "Ben and 4 others liked ...".
--   * Counts (listings.like_count, comment_count; comment like_count and
--     reply_count) are kept by triggers, so cascades from a deleted account
--     keep them right.
-- Copied whole with only the new lines: feed_item (0215), create_report
-- (0227), admin_resolve_report (0220), claim_pushes (0203), push_pref (0205),
-- prefs_json and update_notification_prefs (0201). export_user_data is
-- wrapped (renamed to export_user_data_base), as 0200 did for snapshot_evidence.

-- ---------------------------------------------------------------------------
-- Schema
alter table public.listings
  add column like_count int not null default 0,
  add column comment_count int not null default 0,
  add column comments_enabled bool not null default true;

create table public.listing_likes (
  user_id uuid not null references public.profiles on delete cascade,
  listing_id uuid not null references public.listings on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
create index on public.listing_likes (listing_id);

create table public.listing_comments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  parent_id uuid references public.listing_comments on delete cascade,   -- null = top level
  client_id uuid,                                                        -- retry key from the app
  body text check (body is null or char_length(body) between 1 and 500), -- null once deleted
  status text not null default 'live' check (status in ('live','held','removed','deleted')),
  hold_reason text,
  like_count int not null default 0,
  reply_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.listing_comments (listing_id, parent_id, created_at);
create index on public.listing_comments (parent_id, created_at) where parent_id is not null;
create index on public.listing_comments (author_id);
create unique index listing_comments_client on public.listing_comments (author_id, client_id) where client_id is not null;

create table public.listing_comment_likes (
  user_id uuid not null references public.profiles on delete cascade,
  comment_id uuid not null references public.listing_comments on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);
create index on public.listing_comment_likes (comment_id);

alter table public.listing_likes enable row level security;
alter table public.listing_comments enable row level security;
alter table public.listing_comment_likes enable row level security;
revoke all on public.listing_likes, public.listing_comments, public.listing_comment_likes
  from public, anon, authenticated;

-- Reports can point at a comment.
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('listing','user','chat','message','quad_post','quad_reply','listing_comment'));

-- Comment and reply notifications get their own group (Android channel).
alter table public.notifications drop constraint notifications_grp_check;
alter table public.notifications add constraint notifications_grp_check
  check (grp in ('offers','messages','meetups','alerts','selling','safety','account','campus','quad','comments'));

alter table public.notification_prefs add column comments bool not null default true;

-- ---------------------------------------------------------------------------
-- Counters
create or replace function private.listing_likes_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set like_count = like_count + 1 where id = new.listing_id;
  else
    update public.listings set like_count = greatest(like_count - 1, 0) where id = old.listing_id;
  end if;
  return null;
end;
$$;
create trigger listing_likes_count after insert or delete on public.listing_likes
  for each row execute function private.listing_likes_count();

create or replace function private.comment_likes_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.listing_comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.listing_comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end;
$$;
create trigger comment_likes_count after insert or delete on public.listing_comment_likes
  for each row execute function private.comment_likes_count();

-- Live comments (and replies) are what a post counts; live replies are what a
-- comment counts. Recounted on every change, so holds, removals, deletes and
-- cascades all land right.
create or replace function private.listing_comments_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.listing_comments;
begin
  if tg_op = 'DELETE' then
    r := old;
  else
    r := new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  update public.listings l
     set comment_count = (select count(*) from public.listing_comments c
                          where c.listing_id = l.id and c.status = 'live')
   where l.id = r.listing_id;
  if r.parent_id is not null then
    update public.listing_comments p
       set reply_count = (select count(*) from public.listing_comments c
                          where c.parent_id = p.id and c.status = 'live')
     where p.id = r.parent_id;
  end if;
  return null;
end;
$$;
create trigger listing_comments_count after insert or update of status or delete on public.listing_comments
  for each row execute function private.listing_comments_count();

-- ---------------------------------------------------------------------------
-- Helpers

-- The post a viewer may read (p_write false) or comment on (p_write true).
-- Same campus, not blocked either way, and a post others can see (the author
-- also sees their own post while it is in review).
create or replace function private.comment_post(p_listing uuid, p_me public.profiles, p_write boolean)
returns public.listings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings x where x.id = p_listing;
  if not found or l.campus_id <> p_me.campus_id or l.status = 'deleted'
     or (l.seller_id <> p_me.id and l.status not in ('active', 'hold', 'sold'))
     or private.is_blocked(p_me.id, l.seller_id) then
    perform private.raise('NOT_FOUND');
  end if;
  if p_write then
    if l.status not in ('active', 'hold') or (l.expires_at is not null and l.expires_at <= private.now()) then
      perform private.raise('FORBIDDEN', 'closed');
    end if;
    if not l.comments_enabled then
      perform private.raise('FORBIDDEN', 'comments_off');
    end if;
  end if;
  return l;
end;
$$;

-- Whether a viewer sees a comment: live, or their own held one, or a deleted
-- top-level comment that still has replies (shown as "Comment deleted").
create or replace function private.comment_visible(c public.listing_comments, p_me uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (c.status = 'live'
          or (c.status = 'held' and c.author_id = p_me)
          or (c.status = 'deleted' and c.parent_id is null and c.reply_count > 0))
     and not private.is_blocked(p_me, c.author_id)
$$;

create or replace function private.comment_json(c public.listing_comments, p_me uuid, p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'listing_id', c.listing_id, 'parent_id', c.parent_id,
    'body', case when c.status = 'deleted' then null else c.body end,
    'status', c.status, 'created_at', c.created_at,
    'author', case when c.status = 'deleted' then null else jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path) end,
    'is_author_of_post', c.author_id = p_owner,
    'like_count', c.like_count,
    'liked', exists (select 1 from public.listing_comment_likes k where k.comment_id = c.id and k.user_id = p_me),
    'reply_count', c.reply_count,
    'is_own', c.author_id = p_me,
    'can_delete', c.status <> 'deleted' and (c.author_id = p_me or p_owner = p_me))
  from public.profiles p where p.id = c.author_id
$$;

-- Visible replies to a comment, oldest first, after a cursor.
create or replace function private.comment_replies(p_parent uuid, p_me uuid, p_owner uuid,
                                                   p_after_at timestamptz, p_after_id uuid, p_limit int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.comment_json(x, p_me, p_owner) order by x.created_at, x.id), '[]')
  from public.listing_comments x
  where x.id in (select c.id from public.listing_comments c
                 where c.parent_id = p_parent and private.comment_visible(c, p_me)
                   and (p_after_at is null or (c.created_at, c.id) > (p_after_at, p_after_id))
                 order by c.created_at, c.id
                 limit p_limit)
$$;

-- Likes only go to the bell: one unread row per post or comment, rewritten as
-- more people like it. Never pushed.
create or replace function private.note_like(p_owner uuid, p_type text, p_key text, p_title text,
                                             p_body text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing bigint;
begin
  select n.id into existing from public.notifications n
  where n.user_id = p_owner and n.type = p_type and n.read_at is null and n.data ->> 'key' = p_key
  order by n.id desc limit 1;
  if existing is not null then
    update public.notifications set title = p_title, body = p_body, data = p_data || jsonb_build_object('key', p_key),
           created_at = private.now()
     where id = existing;
  else
    insert into public.notifications (user_id, type, grp, title, body, data, push_state, created_at)
    values (p_owner, p_type, 'comments', p_title, p_body, p_data || jsonb_build_object('key', p_key),
            'skipped', private.now());
  end if;
end;
$$;

create or replace function private.likes_line(p_name text, p_count int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_count <= 1 then p_name
              when p_count = 2 then p_name || ' and 1 other'
              else p_name || ' and ' || (p_count - 1) || ' others' end
$$;

-- Comment text: contact details are blocked (they belong in chat after an
-- offer), then banned words over the listing and chat lists.
create or replace function private.comment_text_verdict(txt text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pii text := private.pii_check(txt);
  a text := private.check_text(txt, 'listing');
  b text := private.check_text(txt, 'chat');
begin
  if pii <> 'ok' then
    return 'blocked:' || pii;
  end if;
  if a like 'block:%' then
    return 'blocked:term:' || substr(a, 7);
  end if;
  if b like 'block:%' then
    return 'blocked:term:' || substr(b, 7);
  end if;
  if a like 'review:%' then
    return 'held:term:' || substr(a, 8);
  end if;
  if b like 'review:%' then
    return 'held:term:' || substr(b, 8);
  end if;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Post likes
create or replace function public.like_listing(listing_id uuid, liked boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
  added int := 0;
begin
  perform private.hit('listing_like', 300, interval '1 hour');
  l := private.comment_post(like_listing.listing_id, me, false);
  if like_listing.liked then
    insert into public.listing_likes (user_id, listing_id, created_at)
    values (me.id, l.id, private.now()) on conflict do nothing;
    get diagnostics added = row_count;
  else
    delete from public.listing_likes x where x.user_id = me.id and x.listing_id = l.id;
  end if;
  select * into l from public.listings x where x.id = l.id;
  if added > 0 and l.seller_id <> me.id then
    perform private.note_like(l.seller_id, 'listing_like', 'listing:' || l.id,
      'New likes on your post',
      private.likes_line(me.display_name, l.like_count) || ' liked "' || l.title || '".',
      jsonb_build_object('listing_id', l.id));
  end if;
  return jsonb_build_object('like_count', l.like_count, 'liked', like_listing.liked);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading comments

-- Top-level comments, 20 a page. sort 'top' (most liked, then newest; offset
-- cursor) or 'new' (newest first; keyset cursor). Each comment carries its
-- first two visible replies; get_comment_replies loads the rest.
create or replace function public.get_listing_comments(listing_id uuid, sort text default 'top', cursor jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
  s text := lower(coalesce(nullif(btrim(get_listing_comments.sort), ''), 'top'));
  page constant int := 20;
  off int := 0;
  c_at timestamptz;
  c_id uuid;
  ids uuid[];
  last public.listing_comments;
  items jsonb;
  more boolean;
  next jsonb;
begin
  perform private.hit('get_listing_comments', 600, interval '1 hour');
  l := private.comment_post(get_listing_comments.listing_id, me, false);
  if s not in ('top', 'new') then
    perform private.raise('INVALID', 'sort');
  end if;
  begin
    off := least(greatest(coalesce((get_listing_comments.cursor ->> 'offset')::int, 0), 0), 1000);
    c_at := nullif(get_listing_comments.cursor ->> 'created_at', '')::timestamptz;
    c_id := nullif(get_listing_comments.cursor ->> 'id', '')::uuid;
  exception when others then
    perform private.raise('INVALID', 'cursor');
  end;

  if s = 'top' then
    select array_agg(x.id order by x.like_count desc, x.created_at desc, x.id desc) into ids
    from (select c.id, c.like_count, c.created_at from public.listing_comments c
          where c.listing_id = l.id and c.parent_id is null and private.comment_visible(c, me.id)
          order by c.like_count desc, c.created_at desc, c.id desc
          offset off limit page + 1) x;
  else
    select array_agg(x.id order by x.created_at desc, x.id desc) into ids
    from (select c.id, c.created_at from public.listing_comments c
          where c.listing_id = l.id and c.parent_id is null and private.comment_visible(c, me.id)
            and (c_at is null or (c.created_at, c.id) < (c_at, c_id))
          order by c.created_at desc, c.id desc
          limit page + 1) x;
  end if;

  more := coalesce(array_length(ids, 1), 0) > page;
  if more then
    ids := ids[1:page];
    select * into last from public.listing_comments x where x.id = ids[page];
    next := case when s = 'top' then jsonb_build_object('offset', off + page)
                 else jsonb_build_object('created_at', last.created_at, 'id', last.id) end;
  end if;

  select coalesce(jsonb_agg(private.comment_json(r, me.id, l.seller_id)
                            || jsonb_build_object('replies',
                                 private.comment_replies(r.id, me.id, l.seller_id, null, null, 2))
                            order by u.o), '[]')
    into items
  from unnest(coalesce(ids, '{}')) with ordinality as u(id, o)
  join public.listing_comments r on r.id = u.id;

  return jsonb_build_object(
    'items', items, 'next_cursor', next,
    'comment_count', l.comment_count, 'like_count', l.like_count,
    'liked', exists (select 1 from public.listing_likes k where k.listing_id = l.id and k.user_id = me.id),
    'comments_enabled', l.comments_enabled,
    'can_comment', l.comments_enabled and l.status in ('active', 'hold')
                   and (l.expires_at is null or l.expires_at > private.now()),
    'is_owner', l.seller_id = me.id,
    'title', l.title, 'kind', l.kind);
end;
$$;

-- Replies to one comment, oldest first, 50 a page (cursor = the last reply).
create or replace function public.get_comment_replies(comment_id uuid, cursor jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  c public.listing_comments;
  l public.listings;
  c_at timestamptz;
  c_id uuid;
  items jsonb;
begin
  perform private.hit('get_listing_comments', 600, interval '1 hour');
  select * into c from public.listing_comments x where x.id = get_comment_replies.comment_id;
  if not found or c.parent_id is not null or not private.comment_visible(c, me.id) then
    perform private.raise('NOT_FOUND');
  end if;
  l := private.comment_post(c.listing_id, me, false);
  begin
    c_at := nullif(get_comment_replies.cursor ->> 'created_at', '')::timestamptz;
    c_id := nullif(get_comment_replies.cursor ->> 'id', '')::uuid;
  exception when others then
    perform private.raise('INVALID', 'cursor');
  end;
  items := private.comment_replies(c.id, me.id, l.seller_id, c_at, c_id, 51);
  return jsonb_build_object(
    'items', case when jsonb_array_length(items) > 50 then items - 50 else items end,
    'next_cursor', case when jsonb_array_length(items) > 50 then jsonb_build_object(
      'created_at', items -> 49 ->> 'created_at', 'id', items -> 49 ->> 'id') end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Writing comments

-- A comment, or a reply when parent_id is set (a reply to a reply joins the
-- same thread, Facebook style). client_id makes a retry return the first
-- result. Returns {status: live | held | blocked, reason, comment}.
create or replace function public.create_listing_comment(listing_id uuid, body text,
                                                         parent_id uuid default null, client_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
  txt text := btrim(coalesce(create_listing_comment.body, ''));
  parent public.listing_comments;
  replied_to uuid;
  verdict text;
  st text := 'live';
  reason text;
  c public.listing_comments;
begin
  if create_listing_comment.client_id is not null then
    select * into c from public.listing_comments x
    where x.author_id = me.id and x.client_id = create_listing_comment.client_id;
    if found then
      return jsonb_build_object('status', c.status, 'reason', c.hold_reason,
        'comment', private.comment_json(c, me.id, (select seller_id from public.listings where id = c.listing_id)));
    end if;
  end if;

  perform private.hit('listing_comment', 30, interval '1 hour');
  l := private.comment_post(create_listing_comment.listing_id, me, true);
  if char_length(txt) not between 1 and 500 then
    perform private.raise('INVALID', 'body');
  end if;

  if create_listing_comment.parent_id is not null then
    select * into parent from public.listing_comments x where x.id = create_listing_comment.parent_id;
    if not found or parent.listing_id <> l.id or parent.status <> 'live'
       or private.is_blocked(me.id, parent.author_id) then
      perform private.raise('NOT_FOUND');
    end if;
    replied_to := parent.author_id;
    if parent.parent_id is not null then
      select * into parent from public.listing_comments x where x.id = parent.parent_id;
      if parent.status not in ('live', 'deleted') then
        perform private.raise('NOT_FOUND');
      end if;
    end if;
  end if;

  verdict := private.comment_text_verdict(txt);
  if verdict like 'blocked:%' then
    return jsonb_build_object('status', 'blocked', 'reason', substr(verdict, 9), 'comment', null);
  end if;
  if verdict like 'held:%' then
    st := 'held';
    reason := substr(verdict, 6);
  end if;

  insert into public.listing_comments (listing_id, author_id, parent_id, client_id, body, status, hold_reason, created_at)
  values (l.id, me.id, parent.id, create_listing_comment.client_id, txt, st, reason, private.now())
  returning * into c;

  if st = 'held' then
    -- A moderator sees it in Reports (no reporter: the word filter held it).
    insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, details,
                                evidence, priority, created_at)
    values (l.campus_id, null, 'listing_comment', c.id::text, me.id, 'other',
            'Held by the word filter: ' || substr(reason, 6),
            private.snapshot_evidence('listing_comment', c.id::text), 2, private.now());
  else
    if replied_to is not null and replied_to <> me.id then
      perform private.queue_notification(replied_to, 'comment_reply', 'comments', 'New reply',
        me.display_name || ' replied to your comment on "' || l.title || '".',
        jsonb_build_object('listing_id', l.id, 'comment_id', parent.id),
        false, 'comment_reply:' || parent.id || ':' || replied_to || ':'
               || to_char(date_trunc('hour', private.now()), 'YYYYMMDDHH24'));
    end if;
    if l.seller_id <> me.id and l.seller_id is distinct from replied_to then
      perform private.queue_notification(l.seller_id, 'listing_comment', 'comments', 'New comment',
        me.display_name || ' commented on "' || l.title || '".',
        jsonb_build_object('listing_id', l.id, 'comment_id', coalesce(parent.id, c.id)),
        false, 'listing_comment:' || l.id || ':' || to_char(date_trunc('hour', private.now()), 'YYYYMMDDHH24'));
    end if;
  end if;

  return jsonb_build_object('status', st, 'reason', reason, 'comment', private.comment_json(c, me.id, l.seller_id));
end;
$$;

create or replace function public.like_listing_comment(comment_id uuid, liked boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  c public.listing_comments;
  l public.listings;
  added int := 0;
begin
  perform private.hit('listing_like', 300, interval '1 hour');
  select * into c from public.listing_comments x where x.id = like_listing_comment.comment_id;
  if not found or c.status <> 'live' or private.is_blocked(me.id, c.author_id) then
    perform private.raise('NOT_FOUND');
  end if;
  l := private.comment_post(c.listing_id, me, false);
  if like_listing_comment.liked then
    insert into public.listing_comment_likes (user_id, comment_id, created_at)
    values (me.id, c.id, private.now()) on conflict do nothing;
    get diagnostics added = row_count;
  else
    delete from public.listing_comment_likes x where x.user_id = me.id and x.comment_id = c.id;
  end if;
  select * into c from public.listing_comments x where x.id = c.id;
  if added > 0 and c.author_id <> me.id then
    perform private.note_like(c.author_id, 'comment_like', 'comment:' || c.id,
      'New likes on your comment',
      private.likes_line(me.display_name, c.like_count) || ' liked your comment on "' || l.title || '".',
      jsonb_build_object('listing_id', l.id, 'comment_id', coalesce(c.parent_id, c.id)));
  end if;
  return jsonb_build_object('like_count', c.like_count, 'liked', like_listing_comment.liked);
end;
$$;

-- The author, or the post's author, can delete a comment. The words are gone;
-- a top-level comment with replies stays as "Comment deleted".
create or replace function public.delete_listing_comment(comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  c public.listing_comments;
  owner uuid;
begin
  select * into c from public.listing_comments x where x.id = delete_listing_comment.comment_id for update;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  select l.seller_id into owner from public.listings l where l.id = c.listing_id;
  if c.author_id <> me.id and owner is distinct from me.id then
    perform private.raise('FORBIDDEN');
  end if;
  if c.status in ('deleted', 'removed') then
    return;
  end if;
  update public.listing_comments x set status = 'deleted', body = null, hold_reason = null where x.id = c.id;
  delete from public.listing_comment_likes x where x.comment_id = c.id;
end;
$$;

-- The post's author turns comments on or off. Existing comments stay.
create or replace function public.set_listing_comments(listing_id uuid, enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
begin
  select * into l from public.listings x where x.id = set_listing_comments.listing_id;
  if not found or l.status = 'deleted' then
    perform private.raise('NOT_FOUND');
  end if;
  if l.seller_id <> me.id then
    perform private.raise('FORBIDDEN');
  end if;
  update public.listings x set comments_enabled = coalesce(set_listing_comments.enabled, true) where x.id = l.id;
  return jsonb_build_object('comments_enabled', coalesce(set_listing_comments.enabled, true));
end;
$$;

-- ---------------------------------------------------------------------------
-- feed_item: unchanged from 0215 except like_count, comment_count, liked and
-- comments_enabled.
create or replace function private.feed_item(p_id uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id, 'kind', l.kind, 'status', l.status, 'title', l.title,
    'description', l.description, 'price_cents', l.price_cents,
    'condition', l.condition, 'category_id', l.category_id,
    'open_to_offers', l.open_to_offers, 'meet_spot_ids', to_jsonb(l.meet_spot_ids),
    'meet_note', l.meet_note, 'availability', to_jsonb(l.availability),
    'save_count', l.save_count, 'view_count', l.view_count, 'offer_count', l.offer_count,
    'like_count', l.like_count, 'comment_count', l.comment_count, 'comments_enabled', l.comments_enabled,
    'bumped_at', l.bumped_at, 'created_at', l.created_at, 'expires_at', l.expires_at,
    'link_url', l.link_url, 'event_at', l.event_at,
    'is_own', l.seller_id = p_viewer,
    'saved', exists (select 1 from public.saves s where s.user_id = p_viewer and s.listing_id = l.id),
    'watching', exists (select 1 from public.watches w where w.user_id = p_viewer and w.listing_id = l.id),
    'liked', exists (select 1 from public.listing_likes k where k.user_id = p_viewer and k.listing_id = l.id),
    'seller', jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path,
      'year', p.year, 'created_at', p.created_at),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'path', ph.path, 'thumb_path', ph.thumb_path, 'blurhash', ph.blurhash,
               'width', ph.width, 'height', ph.height) order by ph.idx)
      from public.listing_photos ph where ph.listing_id = l.id), '[]'::jsonb))
  from public.listings l
  left join public.profiles p on p.id = l.seller_id
  where l.id = p_id
$$;

-- ---------------------------------------------------------------------------
-- Reports: evidence for a comment, create_report and admin_resolve_report.
create or replace function private.snapshot_evidence(p_type text, p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_type in ('quad_post', 'quad_reply')
      then coalesce(private.snapshot_quad_evidence(p_type, p_id), jsonb_build_object('captured_at', private.now()))
    when p_type = 'listing_comment'
      then coalesce((select jsonb_build_object('captured_at', private.now(), 'text', c.body,
                                               'listing_id', c.listing_id, 'listing_title', l.title,
                                               'photo_keys', '[]'::jsonb)
                     from public.listing_comments c join public.listings l on l.id = c.listing_id
                     where c.id::text = p_id),
                    jsonb_build_object('captured_at', private.now()))
    else private.snapshot_evidence_base(p_type, p_id) end
$$;

CREATE OR REPLACE FUNCTION public.create_report(target_type text, target_id text, reason text, details text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me public.profiles := private.require_active();
  target_user uuid;
  target_campus uuid;
  chat uuid;
  new_id uuid;
begin
  perform private.hit('report', 20, interval '1 day');

  if target_type not in ('listing','user','chat','message','quad_post','quad_reply','listing_comment') then
    perform private.raise('INVALID', 'target_type');
  end if;
  if reason not in ('scam','not_allowed','stolen','counterfeit','misleading','harassment','threat',
                    'hate','sexual','minor_safety','calls_out_student','spam','self_harm','no_show','other') then
    perform private.raise('INVALID', 'reason');
  end if;
  if char_length(coalesce(details, '')) > 500 then
    perform private.raise('INVALID', 'details');
  end if;

  -- Resolve the reported person; the reporter must be able to see the target.
  -- Quad authors are resolved here and never returned (SECURITY T12).
  begin
    if target_type = 'listing' then
      select l.seller_id, l.campus_id into target_user, target_campus
      from public.listings l
      where l.id = target_id::uuid and l.status <> 'deleted';
    elsif target_type = 'user' then
      select p.id, p.campus_id into target_user, target_campus
      from public.profiles p where p.id = target_id::uuid;
    elsif target_type = 'chat' then
      select case when c.buyer_id = me.id then c.seller_id else c.buyer_id end, me.campus_id
        into target_user, target_campus
      from public.chats c
      where c.id = target_id::uuid and me.id in (c.buyer_id, c.seller_id);
    elsif target_type = 'message' then
      select m.sender_id, m.chat_id, me.campus_id into target_user, chat, target_campus
      from public.messages m
      join public.chats c on c.id = m.chat_id
      where m.id = target_id::bigint and me.id in (c.buyer_id, c.seller_id);
    elsif target_type = 'quad_post' then
      select q.author_id, q.campus_id into target_user, target_campus
      from public.quad_posts q
      where q.id = target_id::uuid and q.status in ('live', 'held');
    elsif target_type = 'listing_comment' then
      select c.author_id, l.campus_id into target_user, target_campus
      from public.listing_comments c join public.listings l on l.id = c.listing_id
      where c.id = target_id::uuid and c.status in ('live', 'held');
    else
      select r.author_id, q.campus_id into target_user, target_campus
      from public.quad_replies r join public.quad_posts q on q.id = r.post_id
      where r.id = target_id::uuid and r.status in ('live', 'held');
    end if;
  exception when invalid_text_representation then
    perform private.raise('NOT_FOUND');
  end;

  if target_campus is null or target_campus <> me.campus_id then
    perform private.raise('NOT_FOUND');
  end if;
  if target_user = me.id then
    perform private.raise('INVALID', 'target_id');
  end if;

  begin
    insert into public.reports
      (campus_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, priority, created_at)
    values
      (me.campus_id, me.id, target_type, target_id, target_user, reason, nullif(btrim(details), ''),
       private.snapshot_evidence(target_type, target_id),
       case when reason in ('threat','self_harm','minor_safety') then 1 else 2 end,
       private.now())
    returning id into new_id;
  exception when unique_violation then
    perform private.raise('ALREADY_REPORTED');
  end;

  -- Three open reports on a Quad post or reply, or a Feed comment, take it
  -- off until a moderator looks (DESIGN_SYSTEM Q09). Only reporters whose
  -- accounts are older than 7 days count, so fresh accounts cannot brigade (A-11).
  if target_type in ('quad_post', 'quad_reply', 'listing_comment')
     and (select count(distinct rp.reporter_id) from public.reports rp
          join public.profiles p on p.id = rp.reporter_id
          where rp.target_type = create_report.target_type and rp.target_id = create_report.target_id
            and rp.status = 'open'
            and p.created_at < private.now() - interval '7 days') >= 3 then
    if target_type = 'quad_post' then
      update public.quad_posts set status = 'held', hold_reason = 'reports'
      where id = target_id::uuid and status = 'live';
    elsif target_type = 'listing_comment' then
      update public.listing_comments set status = 'held', hold_reason = 'reports'
      where id = target_id::uuid and status = 'live';
    else
      update public.quad_replies set status = 'held', hold_reason = 'reports'
      where id = target_id::uuid and status = 'live';
    end if;
  end if;

  return jsonb_build_object('id', new_id);
end;
$function$;

create or replace function public.admin_resolve_report(id uuid, action text, note text, suspend_days int default 7)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.reports;
  a public.admins;
  why text := private.need_reason(admin_resolve_report.note);
  target public.profiles;
begin
  select * into r from public.reports x where x.id = admin_resolve_report.id for update;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  a := private.require_admin(case when admin_resolve_report.action = 'ban' then 'owner'::public.admin_role else 'moderator'::public.admin_role end, r.campus_id);
  if admin_resolve_report.action not in ('dismiss', 'remove_content', 'warn', 'strike', 'suspend', 'ban') then
    perform private.raise('INVALID', 'action');
  end if;
  if r.status <> 'open' then
    perform private.raise('INVALID', 'status');
  end if;
  -- A Quad report keeps no author (A-01): look the author up here, act on
  -- them, and never return or log who it is.
  select * into target from public.profiles p
   where p.id = coalesce(r.target_user_id, private.quad_report_author(r.target_type, r.target_id));

  -- A Feed comment: Dismiss puts a held comment back up; any other outcome
  -- takes it down for good. Other open reports on it close the same way.
  if r.target_type = 'listing_comment' then
    if admin_resolve_report.action = 'dismiss' then
      update public.listing_comments c set status = 'live', hold_reason = null
       where c.id = r.target_id::uuid and c.status = 'held';
    else
      update public.listing_comments c set status = 'removed', hold_reason = 'moderator'
       where c.id = r.target_id::uuid and c.status in ('live', 'held');
    end if;
    update public.reports x
       set status = case when admin_resolve_report.action = 'dismiss' then 'dismissed'::public.report_status else 'actioned'::public.report_status end,
           action_taken = admin_resolve_report.action, assigned_to = a.user_id, resolved_at = private.now()
     where x.target_type = 'listing_comment' and x.target_id = r.target_id and x.status = 'open' and x.id <> r.id;
  end if;

  if admin_resolve_report.action = 'remove_content' then
    if r.target_type = 'listing' then
      update public.listings l set status = 'removed' where l.id = r.target_id::uuid and l.status <> 'deleted';
      perform private.wind_down_listing(r.target_id::uuid, 'This listing was removed', null);
      perform private.tell_seller_removed(r.target_id::uuid, why, a.user_id);
    elsif r.target_type = 'message' then
      update public.messages m set body = 'This message was removed', meta = coalesce(m.meta, '{}') || '{"removed": true}'
       where m.id = r.target_id::bigint;
    end if;
  elsif admin_resolve_report.action = 'warn' and target.id is not null then
    perform private.queue_notification(target.id, 'account_notice', 'account', 'A warning from OnlySwap',
      'A report about you was reviewed. Please follow the community rules.', '{}'::jsonb, false,
      'acct:' || target.id || ':warn:' || r.id);
  elsif admin_resolve_report.action = 'strike' and target.id is not null then
    insert into public.strikes (user_id, reason, report_id, created_by) values (target.id, r.reason,
      case when r.target_type in ('quad_post', 'quad_reply') then null else r.id end, a.user_id);
    update public.profiles p set strike_count = strike_count + 1 where p.id = target.id;
    -- A first strike pauses offers and new listings for up to 7 days (DATA_MODEL §4.6).
    update public.profiles p set status = 'paused', status_reason = 'strike', paused_until = private.now() + interval '7 days'
     where p.id = target.id and p.status = 'active';
    perform private.queue_notification(target.id, 'account_notice', 'account', 'Account paused',
      'A rule was broken. Your account is paused for 7 days. You can appeal in the app.', '{}'::jsonb, false,
      'acct:' || target.id || ':strike:' || r.id);
  elsif admin_resolve_report.action = 'suspend' and target.id is not null then
    if a.role = 'moderator' and coalesce(admin_resolve_report.suspend_days, 7) > 7 then
      perform private.raise('NOT_ADMIN');
    end if;
    update public.profiles p set status = 'suspended', status_reason = 'report',
           paused_until = private.now() + make_interval(days => greatest(coalesce(admin_resolve_report.suspend_days, 7), 1))
     where p.id = target.id;
    perform private.call_function('revoke-sessions', jsonb_build_object('user_id', target.id));
  elsif admin_resolve_report.action = 'ban' and target.id is not null then
    update public.profiles p set status = 'banned', status_reason = 'report' where p.id = target.id;
    insert into public.banned_hashes (email_hash) values (target.email_hash) on conflict do nothing;
    perform private.call_function('revoke-sessions', jsonb_build_object('user_id', target.id));
  end if;

  update public.reports x
     set status = case when admin_resolve_report.action = 'dismiss' then 'dismissed'::public.report_status else 'actioned'::public.report_status end,
         action_taken = admin_resolve_report.action, assigned_to = a.user_id, resolved_at = private.now()
   where x.id = r.id;
  if r.reporter_id is not null then
    perform private.queue_notification(r.reporter_id, 'report_update', 'safety', 'Report reviewed', 'We reviewed your report',
      jsonb_build_object('report_id', r.id), false, 'report:' || r.id || ':reviewed');
  end if;
  perform private.audit(a.user_id, 'report.' || admin_resolve_report.action, 'report', r.id::text, r.campus_id, why,
    jsonb_build_object('target_user', r.target_user_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Notification prefs: "Comments and replies" (on by default).
create or replace function private.push_pref(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'offer_%' or p_type = 'wanted_match' then 'offers'
    when p_type = 'message_new' then 'messages'
    when p_type like 'meetup_%' or p_type in ('deal_check', 'rate_prompt', 'rating_revealed') then 'meetups'
    when p_type in ('saved_search_match', 'watch_available') then 'saved_search'
    when p_type = 'price_drop' then 'price_drop'
    when p_type in ('listing_stale', 'announcement_news') then 'tips'
    when p_type in ('quad_reply', 'quad_milestone') then 'quad_replies'
    when p_type = 'free_food' then 'free_food'
    when p_type in ('listing_comment', 'comment_reply', 'listing_like', 'comment_like') then 'comments'
    else null   -- campus_unlocked, announcement_safety, safety and account notices: always
  end
$$;

create or replace function private.prefs_json(p public.notification_prefs)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('offers', p.offers, 'messages', p.messages, 'meetups', p.meetups,
    'saved_search', p.saved_search, 'price_drop', p.price_drop, 'tips', p.tips,
    'message_previews', p.message_previews, 'quad_replies', p.quad_replies, 'free_food', p.free_food,
    'comments', p.comments,
    'quiet_start', to_char(p.quiet_start, 'HH24:MI'), 'quiet_end', to_char(p.quiet_end, 'HH24:MI'))
$$;

create or replace function public.update_notification_prefs(prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  k text;
  p public.notification_prefs;
begin
  if update_notification_prefs.prefs is null or jsonb_typeof(update_notification_prefs.prefs) <> 'object' then
    perform private.raise('INVALID', 'prefs');
  end if;
  for k in select jsonb_object_keys(update_notification_prefs.prefs) loop
    if k not in ('offers','messages','meetups','saved_search','price_drop','tips','message_previews',
                 'quad_replies','free_food','comments','quiet_start','quiet_end') then
      perform private.raise('INVALID', 'prefs');
    end if;
  end loop;
  insert into public.notification_prefs (user_id) values (me.id) on conflict do nothing;
  begin
    update public.notification_prefs x set
      offers = coalesce((prefs ->> 'offers')::bool, x.offers),
      messages = coalesce((prefs ->> 'messages')::bool, x.messages),
      meetups = coalesce((prefs ->> 'meetups')::bool, x.meetups),
      saved_search = coalesce((prefs ->> 'saved_search')::bool, x.saved_search),
      price_drop = coalesce((prefs ->> 'price_drop')::bool, x.price_drop),
      tips = coalesce((prefs ->> 'tips')::bool, x.tips),
      message_previews = coalesce((prefs ->> 'message_previews')::bool, x.message_previews),
      quad_replies = coalesce((prefs ->> 'quad_replies')::bool, x.quad_replies),
      free_food = coalesce((prefs ->> 'free_food')::bool, x.free_food),
      comments = coalesce((prefs ->> 'comments')::bool, x.comments),
      quiet_start = coalesce((prefs ->> 'quiet_start')::time, x.quiet_start),
      quiet_end = coalesce((prefs ->> 'quiet_end')::time, x.quiet_end)
    where x.user_id = me.id
    returning * into p;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform private.raise('INVALID', 'prefs');
  end;
  -- Tips off also drops any tip still waiting to go out (P9-NOTIF-02).
  if (prefs ->> 'tips')::bool is false then
    update public.notifications nn set push_state = 'skipped'
     where nn.user_id = me.id and nn.push_state = 'pending' and private.push_pref(nn.type) = 'tips';
  end if;
  return private.prefs_json(p);
end;
$$;

-- send-push claim (BE-03), unchanged from 0203 except the comments pref.
create or replace function private.claim_pushes(p_limit int default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n record;
  pr public.notification_prefs;
  tz text;
  local_now timestamp;
  local_t time;
  in_quiet bool;
  sent_today int;
  pref text;
  enabled bool;
  toks jsonb;
  res jsonb := '[]';
begin
  for n in
    select * from public.notifications x
    where x.push_state = 'pending' and x.push_after <= private.now()
    order by x.time_sensitive desc, x.id
    limit greatest(p_limit, 1)
    for update skip locked
  loop
    select * into pr from public.notification_prefs x where x.user_id = n.user_id;
    select c.timezone into tz from public.profiles p join public.campuses c on c.id = p.campus_id where p.id = n.user_id;
    tz := coalesce(tz, 'America/New_York');
    local_now := private.now() at time zone tz;
    local_t := local_now::time;
    pref := private.push_pref(n.type);
    enabled := case pref
      when 'offers' then coalesce(pr.offers, true) when 'messages' then coalesce(pr.messages, true)
      when 'meetups' then coalesce(pr.meetups, true) when 'saved_search' then coalesce(pr.saved_search, true)
      when 'price_drop' then coalesce(pr.price_drop, true) when 'tips' then coalesce(pr.tips, false)
      when 'quad_replies' then coalesce(pr.quad_replies, false) when 'free_food' then coalesce(pr.free_food, false)
      when 'comments' then coalesce(pr.comments, true)
      else true end;
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'token', t.token, 'platform', t.platform)), '[]') into toks
    from public.push_tokens t where t.user_id = n.user_id and t.disabled_at is null;

    if not enabled or jsonb_array_length(toks) = 0 then
      update public.notifications x set push_state = 'skipped' where x.id = n.id;
      continue;
    end if;

    if not n.time_sensitive then
      in_quiet := case
        when coalesce(pr.quiet_start, '23:00') > coalesce(pr.quiet_end, '08:00')
          then local_t >= coalesce(pr.quiet_start, '23:00') or local_t < coalesce(pr.quiet_end, '08:00')
        else local_t >= coalesce(pr.quiet_start, '23:00') and local_t < coalesce(pr.quiet_end, '08:00') end;
      if in_quiet then
        update public.notifications x
           set push_after = ((case when local_t < coalesce(pr.quiet_end, '08:00') then local_now::date else local_now::date + 1 end)
                             + coalesce(pr.quiet_end, '08:00')) at time zone tz
         where x.id = n.id;
        continue;
      end if;
      select count(*) into sent_today from public.notifications x
      where x.user_id = n.user_id and x.push_state = 'sent' and not x.time_sensitive
        and (x.claimed_at at time zone tz)::date = local_now::date;
      if sent_today >= 6 then
        update public.notifications x set push_state = 'skipped' where x.id = n.id;
        continue;
      end if;
    end if;

    update public.notifications x set push_state = 'sending', claimed_at = private.now() where x.id = n.id;
    res := res || jsonb_build_object(
      'id', n.id, 'type', n.type, 'grp', n.grp, 'title', n.title, 'body', n.body, 'data', n.data,
      'time_sensitive', n.time_sensitive, 'tokens', toks,
      'badge', (select count(*)::int from public.notifications x where x.user_id = n.user_id and x.read_at is null));
  end loop;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------
-- Export: the person's own likes and comments (export_user_data_base is the
-- 0231 function, renamed).
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'export_user_data_base') then
    alter function private.export_user_data(uuid) rename to export_user_data_base;
  end if;
end;
$$;

create or replace function private.export_user_data(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.export_user_data_base(p_uid) || jsonb_build_object('feed', jsonb_build_object(
    'liked_posts', coalesce((select jsonb_agg(jsonb_build_object('listing_id', k.listing_id, 'created_at', k.created_at)
                                              order by k.created_at)
                             from public.listing_likes k where k.user_id = p_uid), '[]'),
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
                             'listing_id', c.listing_id, 'reply', c.parent_id is not null, 'body', c.body,
                             'status', c.status, 'like_count', c.like_count, 'created_at', c.created_at)
                           order by c.created_at)
                          from public.listing_comments c where c.author_id = p_uid), '[]'),
    'liked_comments', (select count(*)::int from public.listing_comment_likes k where k.user_id = p_uid)))
$$;

-- ---------------------------------------------------------------------------
-- Grants
do $$
declare
  f text;
begin
  foreach f in array array[
    'private.listing_likes_count()', 'private.comment_likes_count()', 'private.listing_comments_count()',
    'private.comment_post(uuid, public.profiles, boolean)', 'private.comment_visible(public.listing_comments, uuid)',
    'private.comment_json(public.listing_comments, uuid, uuid)',
    'private.comment_replies(uuid, uuid, uuid, timestamptz, uuid, int)',
    'private.note_like(uuid, text, text, text, text, jsonb)', 'private.likes_line(text, int)',
    'private.comment_text_verdict(text)', 'private.export_user_data(uuid)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  execute 'grant execute on function private.export_user_data(uuid) to service_role';
  foreach f in array array[
    'public.like_listing(uuid, boolean)', 'public.get_listing_comments(uuid, text, jsonb)',
    'public.get_comment_replies(uuid, jsonb)', 'public.create_listing_comment(uuid, text, uuid, uuid)',
    'public.like_listing_comment(uuid, boolean)', 'public.delete_listing_comment(uuid)',
    'public.set_listing_comments(uuid, boolean)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
