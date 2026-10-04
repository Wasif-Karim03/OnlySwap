-- 0200_quad.sql (S45: P3-DB-05, P10-QUAD-01, R11-NOTIF-01 quad types; DEC 76)
-- The Quad: an anonymous-to-peers campus board (DATA_MODEL §2.6, API Quad RPCs,
-- SECURITY T12). Authors are never exposed: users have no select on posts,
-- replies or hides, and no RPC returns an author id, even for your own posts
-- (T-INT-QUAD-ANON). Ranking is computed at read (no hot_rank column, BE-08).
-- Every RPC answers FEATURE_OFF unless the campus has quad_enabled (SEC-13).
-- Check-ins (kind 'checkin', expires after 3 h) are R2 (R2-QUAD-CHECKIN) and
-- are accepted here so the app can add them without a schema change.

-- ---------------------------------------------------------------------------
-- Columns on existing tables
alter table public.profiles add column if not exists quad_rules_accepted_at timestamptz;
alter table public.campuses add column if not exists quad_autohide_score int not null default -5;

-- ---------------------------------------------------------------------------
-- Tables
create table public.quad_posts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  kind text not null default 'text' check (kind in ('text','photo','poll','checkin')),
  body text not null check (char_length(body) between 1 and 500),
  photo_path text,
  place text check (char_length(place) between 1 and 60),
  score int not null default 0,
  reply_count int not null default 0,
  status text not null default 'live' check (status in ('live','held','hidden','removed')),
  hold_reason text,
  replies_enabled bool not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.quad_posts (campus_id, status, created_at desc);
create index on public.quad_posts (campus_id, status, score desc);
create index on public.quad_posts (author_id);

create table public.quad_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.quad_posts on delete cascade,
  author_id uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  alias_no smallint not null,              -- 0 = the original poster (UX-11)
  score int not null default 0,
  status text not null default 'live' check (status in ('live','held','hidden','removed')),
  hold_reason text,
  created_at timestamptz not null default now()
);
create index on public.quad_replies (post_id, created_at);
create index on public.quad_replies (author_id);

create table public.quad_votes (
  user_id uuid not null references public.profiles on delete cascade,
  target_type text not null check (target_type in ('post','reply')),
  target_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index on public.quad_votes (target_type, target_id);

create table public.quad_poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.quad_posts on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  idx smallint not null,
  votes int not null default 0,
  unique (post_id, idx)
);

create table public.quad_poll_votes (
  post_id uuid not null references public.quad_posts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  option_id uuid not null references public.quad_poll_options on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.quad_hides (
  user_id uuid not null references public.profiles on delete cascade,
  hidden_author_id uuid not null references public.profiles on delete cascade,
  source_post_id uuid references public.quad_posts on delete set null,
  excerpt text,
  created_at timestamptz not null default now(),
  primary key (user_id, hidden_author_id)
);

create table public.quad_mutes (
  user_id uuid not null references public.profiles on delete cascade,
  keyword text not null check (char_length(keyword) between 2 and 30),
  created_at timestamptz not null default now(),
  primary key (user_id, keyword)
);

alter table public.quad_posts enable row level security;
alter table public.quad_replies enable row level security;
alter table public.quad_votes enable row level security;
alter table public.quad_poll_options enable row level security;
alter table public.quad_poll_votes enable row level security;
alter table public.quad_hides enable row level security;
alter table public.quad_mutes enable row level security;

revoke all on public.quad_posts, public.quad_replies, public.quad_votes, public.quad_poll_options,
  public.quad_poll_votes, public.quad_hides, public.quad_mutes from public, anon, authenticated;

-- Own votes and mutes only (TESTING §2.1). Posts, replies, polls and hides
-- have no policy at all: reading them would expose authors.
grant select on public.quad_votes, public.quad_mutes to authenticated;
create policy quad_votes_self on public.quad_votes for select to authenticated using (user_id = auth.uid());
create policy quad_mutes_self on public.quad_mutes for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reference data: common first names for the names-a-student check
-- (private.names_student, T-INT-QUAD-01). Lowercase.
insert into public.common_first_names (name)
select unnest(string_to_array(
  'aaron adam adrian aidan aiden alex alexa alexander alexis alice alicia alison allison alyssa amanda amber amelia amy ' ||
  'andrea andrew angel angela anna anthony ariana ashley austin ava bailey benjamin blake brandon brayden brian brianna ' ||
  'brittany brooke bryan caleb cameron carlos caroline carter catherine charles charlie chase chloe chris christian ' ||
  'christina christopher claire cody colin connor cooper courtney daniel danielle david derek destiny devin diana diego ' ||
  'dominic dylan elena eli elijah elizabeth ella ellie emily emma eric erica erin ethan evan evelyn faith gabriel ' ||
  'gabriella gavin grace grant hailey hannah harper hayden henry hunter ian isaac isabel isabella isaiah jack jackson ' ||
  'jacob jada jaden jake james jasmine jason jayden jenna jennifer jeremiah jeremy jesse jessica joe john jonathan ' ||
  'jordan jose joseph joshua josh juan julia julian justin kaitlyn kate katherine kayla kaylee kevin kyle laila lauren ' ||
  'layla leah leo liam lily logan lucas lucy luis luke madeline madison maria mariah mark mason matthew maya megan ' ||
  'melissa mia michael michelle miguel mike morgan natalie nathan nicholas nick nicole noah nora oliver olivia owen ' ||
  'paige parker patrick paul peyton rachel rebecca riley robert ryan sabrina samantha samuel sara sarah savannah ' ||
  'scarlett sean sebastian seth sophia sophie stephanie steven sydney taylor thomas tristan tyler valeria victoria ' ||
  'vincent william wyatt xavier zachary zoe aisha omar ali fatima priya raj arjun wei mei jin minh lin',
  ' '))
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helpers

-- The Quad is on for a campus when the global switch (app_config
-- quad_enabled, the kill switch) and the campus switch are both on.
create or replace function private.quad_on(p_campus uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (c.value #>> '{}')::boolean from public.app_config c where c.key = 'quad_enabled'), false)
     and exists (select 1 from public.campuses c where c.id = p_campus and c.quad_enabled)
$$;

-- The caller for a Quad call: the campus must have the Quad switched on.
-- Writes also need an active account and the Quad rules accepted (Q01).
create or replace function private.require_quad(p_write boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  if p_write then
    me := private.require_active();
  else
    me := private.require_member();
  end if;
  if not private.quad_on(me.campus_id) then
    perform private.raise('FEATURE_OFF');
  end if;
  if p_write and me.quad_rules_accepted_at is null then
    perform private.raise('RULES_REQUIRED', 'quad');
  end if;
  return me;
end;
$$;

-- Names a student in a way that reads like calling them out (T-INT-QUAD-01,
-- E2E-12 "rate jake r"): a capitalised common first name, or any common first
-- name next to a rating or call-out word.
create or replace function private.quad_names_student(txt text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.names_student(txt)
    or (
      exists (
        select 1
        from regexp_split_to_table(lower(coalesce(txt, '')), '[^a-z]+') as word
        join public.common_first_names n on n.name = word
      )
      and lower(coalesce(txt, '')) ~ '\m(rate|rating|rank|exposed|expose|snitch|cheater|cheated|ugly|hot|smash|creep|creepy|loser|slut|thoughts on|anyone know|who is|is dating|hooked up)\M'
    )
$$;

-- One verdict for Quad text: 'ok', 'blocked:<reason>' (nothing is saved, Q9)
-- or 'held:<reason>' (saved, waits for a moderator, Q10).
create or replace function private.quad_text_verdict(txt text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pii text := private.pii_check(txt);
  term text;
begin
  if pii <> 'ok' then
    return 'blocked:' || pii;
  end if;
  term := private.check_text(txt, 'quad');
  if term like 'block:%' then
    return 'blocked:term:' || substr(term, 7);
  end if;
  if private.quad_names_student(txt) then
    return 'held:names_student';
  end if;
  if term like 'review:%' then
    return 'held:term:' || substr(term, 8);
  end if;
  return 'ok';
end;
$$;

-- "Hot" ordering, computed at read (BE-08): score / (hours since + 2)^1.5.
create or replace function private.quad_hot(p_score int, p_created timestamptz)
returns double precision
language sql
stable
set search_path = ''
as $$
  select (p_score + 1)::double precision
         / power(greatest(extract(epoch from (private.now() - p_created)) / 3600.0, 0) + 2, 1.5)
$$;

-- Hidden from this reader: authors they hid, people they blocked (either way)
-- and posts matching a muted keyword.
create or replace function private.quad_hidden_for(p_me uuid, p_author uuid, p_body text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_author <> p_me and (
    exists (select 1 from public.quad_hides h where h.user_id = p_me and h.hidden_author_id = p_author)
    or private.is_blocked(p_me, p_author)
    or exists (select 1 from public.quad_mutes m
               where m.user_id = p_me and lower(p_body) like '%' || lower(m.keyword) || '%')
  )
$$;

-- A post as the app sees it. No author fields (T-INT-QUAD-ANON).
create or replace function private.quad_post_json(p public.quad_posts, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
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

-- A live post the caller may act on (same campus, not hidden from them).
create or replace function private.quad_live_post(p_post uuid, p_me public.profiles, p_lock boolean default false)
returns public.quad_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.quad_posts;
begin
  if p_lock then
    select * into p from public.quad_posts where id = p_post for update;
  else
    select * into p from public.quad_posts where id = p_post;
  end if;
  if not found or p.campus_id <> p_me.campus_id
     or (p.status <> 'live' and p.author_id <> p_me.id)
     or (p.expires_at is not null and p.expires_at <= private.now())
     or private.quad_hidden_for(p_me.id, p.author_id, p.body) then
    perform private.raise('NOT_FOUND');
  end if;
  return p;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs

create or replace function public.accept_quad_rules()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
begin
  if not private.quad_on(me.campus_id) then
    perform private.raise('FEATURE_OFF');
  end if;
  update public.profiles set quad_rules_accepted_at = coalesce(quad_rules_accepted_at, private.now())
  where id = me.id;
end;
$$;

-- Is the Quad on for me, and have I agreed to its rules? (Q01 gate.)
create or replace function public.get_quad_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_member();
begin
  return jsonb_build_object(
    'enabled', private.quad_on(me.campus_id),
    'rules_accepted', me.quad_rules_accepted_at is not null
  );
end;
$$;

-- Feed (Q02). sort: 'hot' (default), 'new', 'top' (last 7 days).
-- cursor: {"offset": n}. Returns {items, next_cursor, pinned}.
create or replace function public.get_quad_feed(sort text default 'hot', cursor jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Thread (Q05): the post and its replies with per-thread aliases.
create or replace function public.get_quad_thread(post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- New post (Q07). Returns {id, status, reason}: status 'live', 'held' (Q10) or
-- 'blocked' (Q9, nothing saved). post_id lets a photo upload use the post's id
-- as its folder, and makes a retry return the same post.
create or replace function public.create_quad_post(
  kind text,
  body text,
  photo_path text default null,
  poll jsonb default null,
  place text default null,
  post_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(true);
  existing public.quad_posts;
  verdict text;
  status text := 'live';
  reason text;
  new_id uuid := coalesce(create_quad_post.post_id, gen_random_uuid());
  opts text[];
  i int;
begin
  if create_quad_post.post_id is not null then
    select * into existing from public.quad_posts q where q.id = create_quad_post.post_id;
    if found then
      if existing.author_id <> me.id then
        perform private.raise('FORBIDDEN');
      end if;
      return jsonb_build_object('id', existing.id, 'status', existing.status, 'reason', existing.hold_reason);
    end if;
  end if;

  perform private.hit('quad_post', 10, interval '1 hour');
  perform private.hit('quad_post_day', 30, interval '1 day');

  if kind not in ('text', 'photo', 'poll', 'checkin') then
    perform private.raise('INVALID', 'kind');
  end if;
  if char_length(btrim(coalesce(body, ''))) not between 1 and 500 then
    perform private.raise('INVALID', 'body');
  end if;
  if kind = 'photo' then
    if create_quad_post.photo_path is null
       or create_quad_post.photo_path !~ ('^c/' || me.campus_id::text || '/quad/' || new_id::text
                                         || '/[0-9a-f-]{36}_full\.webp$') then
      perform private.raise('INVALID', 'photo_path');
    end if;
  elsif create_quad_post.photo_path is not null then
    perform private.raise('INVALID', 'photo_path');
  end if;
  if kind = 'poll' then
    select array_agg(btrim(v) order by ord) into opts
    from jsonb_array_elements_text(coalesce(poll -> 'options', '[]'::jsonb)) with ordinality as t(v, ord);
    if coalesce(array_length(opts, 1), 0) not between 2 and 4
       or exists (select 1 from unnest(opts) o where char_length(o) not between 1 and 40) then
      perform private.raise('INVALID', 'poll');
    end if;
  end if;
  if kind = 'checkin' and char_length(btrim(coalesce(place, ''))) not between 1 and 60 then
    perform private.raise('INVALID', 'place');
  end if;

  verdict := private.quad_text_verdict(body || coalesce(' ' || array_to_string(opts, ' '), '')
                                       || coalesce(' ' || place, ''));
  if verdict like 'blocked:%' then
    return jsonb_build_object('id', null, 'status', 'blocked', 'reason', substr(verdict, 9));
  end if;
  if verdict like 'held:%' then
    status := 'held';
    reason := substr(verdict, 6);
  elsif kind = 'photo' and me.created_at > private.now() - interval '7 days' then
    status := 'held';
    reason := 'new_account_photo';
  end if;

  insert into public.quad_posts
    (id, campus_id, author_id, kind, body, photo_path, place, status, hold_reason, expires_at, created_at)
  values
    (new_id, me.campus_id, me.id, kind, btrim(body), create_quad_post.photo_path,
     case when kind = 'checkin' then btrim(place) end, status, reason,
     case when kind = 'checkin' then private.now() + interval '3 hours' end, private.now());

  if kind = 'poll' then
    for i in 1 .. array_length(opts, 1) loop
      insert into public.quad_poll_options (post_id, label, idx) values (new_id, opts[i], i);
    end loop;
  end if;

  return jsonb_build_object('id', new_id, 'status', status, 'reason', reason);
end;
$$;

-- Reply (Q05). Aliases: the poster is 0; anyone else keeps the number they got
-- on their first reply in this thread; a new replier gets the next number.
create or replace function public.create_quad_reply(post_id uuid, body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(true);
  p public.quad_posts;
  verdict text;
  status text := 'live';
  reason text;
  alias smallint;
  new_id uuid;
begin
  perform private.hit('quad_reply', 60, interval '1 hour');
  p := private.quad_live_post(create_quad_reply.post_id, me, true);
  if p.status <> 'live' then
    perform private.raise('NOT_FOUND');
  end if;
  if not p.replies_enabled then
    perform private.raise('FORBIDDEN', 'replies_off');
  end if;
  if char_length(btrim(coalesce(body, ''))) not between 1 and 300 then
    perform private.raise('INVALID', 'body');
  end if;

  verdict := private.quad_text_verdict(body);
  if verdict like 'blocked:%' then
    return jsonb_build_object('id', null, 'status', 'blocked', 'reason', substr(verdict, 9));
  end if;
  if verdict like 'held:%' then
    status := 'held';
    reason := substr(verdict, 6);
  end if;

  if p.author_id = me.id then
    alias := 0;
  else
    select r.alias_no into alias from public.quad_replies r
    where r.post_id = p.id and r.author_id = me.id limit 1;
    if alias is null then
      select coalesce(max(r.alias_no), 0) + 1 into alias from public.quad_replies r where r.post_id = p.id;
    end if;
  end if;

  insert into public.quad_replies (post_id, author_id, body, alias_no, status, hold_reason, created_at)
  values (p.id, me.id, btrim(body), alias, status, reason, private.now())
  returning id into new_id;

  if status = 'live' then
    update public.quad_posts set reply_count = reply_count + 1 where id = p.id;
    if p.author_id <> me.id then
      perform private.queue_notification(
        p.author_id, 'quad_reply', 'quad', 'New reply on the Quad',
        'Someone replied to your post.',
        jsonb_build_object('post_id', p.id),
        false,
        'quad_reply:' || p.id || ':' || to_char(date_trunc('hour', private.now()), 'YYYYMMDDHH24'));
    end if;
  end if;

  return jsonb_build_object('id', new_id, 'status', status, 'reason', reason, 'alias_no', alias);
end;
$$;

-- Vote (value -1, 0 = remove, 1). Not on your own content. A post (or reply)
-- that falls to the campus auto-hide score is hidden and a report is filed;
-- posts that reach 50 and 100 points tell their author (quad_milestone).
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

create or replace function public.vote_poll(post_id uuid, option_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(true);
  p public.quad_posts := private.quad_live_post(vote_poll.post_id, me, true);
begin
  if p.kind <> 'poll' or p.status <> 'live' then
    perform private.raise('NOT_FOUND');
  end if;
  if not exists (select 1 from public.quad_poll_options o where o.id = vote_poll.option_id and o.post_id = p.id) then
    perform private.raise('INVALID', 'option_id');
  end if;
  begin
    insert into public.quad_poll_votes (post_id, user_id, option_id, created_at)
    values (p.id, me.id, vote_poll.option_id, private.now());
  exception when unique_violation then
    perform private.raise('INVALID', 'already_voted');
  end;
  update public.quad_poll_options set votes = votes + 1 where id = vote_poll.option_id;
  return private.quad_post_json(p, me.id) -> 'poll';
end;
$$;

-- Hide everything from the author of this post, for me only (T-INT-QUAD-02).
create or replace function public.hide_quad_author(post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.unhide_quad(source_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(false);
begin
  delete from public.quad_hides h where h.user_id = me.id and h.source_post_id = unhide_quad.source_post_id;
end;
$$;

-- Muted screen (Q14): what you hid, by the post you hid it from. No authors.
create or replace function public.get_my_quad_hides()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(false);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('source_post_id', h.source_post_id, 'excerpt', h.excerpt,
                                        'created_at', h.created_at) order by h.created_at desc)
    from public.quad_hides h where h.user_id = me.id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.mute_keyword(keyword text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(false);
  kw text := lower(btrim(coalesce(keyword, '')));
begin
  if char_length(kw) not between 2 and 30 then
    perform private.raise('INVALID', 'keyword');
  end if;
  if (select count(*) from public.quad_mutes m where m.user_id = me.id) >= 50 then
    perform private.raise('INVALID', 'too_many');
  end if;
  insert into public.quad_mutes (user_id, keyword, created_at) values (me.id, kw, private.now())
  on conflict do nothing;
end;
$$;

create or replace function public.unmute_keyword(keyword text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(false);
begin
  delete from public.quad_mutes m where m.user_id = me.id and m.keyword = lower(btrim(coalesce(unmute_keyword.keyword, '')));
end;
$$;

create or replace function public.get_my_quad_mutes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(false);
begin
  return coalesce((select jsonb_agg(m.keyword order by m.keyword) from public.quad_mutes m where m.user_id = me.id),
                  '[]'::jsonb);
end;
$$;

create or replace function public.set_quad_replies(post_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(true);
begin
  update public.quad_posts q set replies_enabled = coalesce(enabled, true)
  where q.id = set_quad_replies.post_id and q.author_id = me.id and q.status <> 'removed';
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
end;
$$;

-- The author takes their post down. Kept as 'removed' so open reports keep
-- their target (reports also snapshot the text).
create or replace function public.delete_quad_post(post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(false);
begin
  update public.quad_posts q set status = 'removed', hold_reason = 'author_deleted'
  where q.id = delete_quad_post.post_id and q.author_id = me.id and q.status <> 'removed';
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
end;
$$;

-- Your Quad (Q12): your posts and replies with their status.
create or replace function public.get_my_quad()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_quad(false);
begin
  return jsonb_build_object(
    'posts', coalesce((
      select jsonb_agg(private.quad_post_json(p, me.id) order by p.created_at desc)
      from (select * from public.quad_posts q
            where q.author_id = me.id and not (q.status = 'removed' and q.hold_reason = 'author_deleted')
            order by q.created_at desc limit 100) p), '[]'::jsonb),
    'replies', coalesce((
      select jsonb_agg(private.quad_reply_json(r, me.id)
                       || jsonb_build_object('post_id', r.post_id, 'post_excerpt', left(qp.body, 80))
                       order by r.created_at desc)
      from (select * from public.quad_replies q where q.author_id = me.id
            order by q.created_at desc limit 100) r
      join public.quad_posts qp on qp.id = r.post_id), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports, appeals and evidence learn the Quad targets.

create or replace function public.create_report(
  target_type text,
  target_id text,
  reason text,
  details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
  target_user uuid;
  target_campus uuid;
  chat uuid;
  new_id uuid;
begin
  perform private.hit('report', 20, interval '1 day');

  if target_type not in ('listing','user','chat','message','quad_post','quad_reply') then
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

  -- Three open reports on a Quad post or reply take it off the board until a
  -- moderator looks (DESIGN_SYSTEM Q09).
  if target_type in ('quad_post', 'quad_reply')
     and (select count(*) from public.reports rp
          where rp.target_type = create_report.target_type and rp.target_id = create_report.target_id
            and rp.status = 'open') >= 3 then
    if target_type = 'quad_post' then
      update public.quad_posts set status = 'held', hold_reason = 'reports'
      where id = target_id::uuid and status = 'live';
    else
      update public.quad_replies set status = 'held', hold_reason = 'reports'
      where id = target_id::uuid and status = 'live';
    end if;
  end if;

  return jsonb_build_object('id', new_id);
end;
$$;

-- Appeals can now name a Quad post that was held, hidden or removed.
create or replace function public.create_appeal(
  subject_type text,
  subject_id text,
  reason_choice text default null,
  body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  own boolean;
  new_id uuid;
begin
  if uid is null or not exists (select 1 from public.profiles p where p.id = uid) then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  perform private.hit('appeal', 5, interval '1 day');
  if char_length(coalesce(body, '')) > 500 then
    perform private.raise('INVALID', 'body');
  end if;

  begin
    own := case subject_type
      when 'strike' then exists (
        select 1 from public.strikes s where s.id = subject_id::uuid and s.user_id = uid)
      when 'listing' then exists (
        select 1 from public.listings l
        where l.id = subject_id::uuid and l.seller_id = uid and l.status in ('removed','held_review'))
      when 'suspension' then subject_id = uid::text and exists (
        select 1 from public.profiles p
        where p.id = uid and p.status in ('paused','suspended','banned'))
      when 'noshow' then exists (
        select 1 from public.noshow_reports n where n.id = subject_id::uuid and n.reported_id = uid)
      when 'quad_post' then exists (
        select 1 from public.quad_posts q
        where q.id = subject_id::uuid and q.author_id = uid and q.status in ('held','hidden','removed')
          and q.hold_reason is distinct from 'author_deleted')
      else false
    end;
  exception when invalid_text_representation then
    own := false;
  end;
  if own is null then
    perform private.raise('FEATURE_OFF');
  end if;
  if not own then
    perform private.raise('NOT_FOUND');
  end if;

  begin
    insert into public.appeals (user_id, subject_type, subject_id, reason_choice, body, created_at)
    values (uid, subject_type, subject_id, reason_choice, nullif(btrim(body), ''), private.now())
    returning id into new_id;
  exception when unique_violation then
    perform private.raise('ALREADY_APPEALED');
  end;
  return jsonb_build_object('id', new_id);
end;
$$;

-- Evidence for Quad targets; the other types keep their 0007 behaviour.
create or replace function private.snapshot_quad_evidence(p_type text, p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'quad_post' then (
      select jsonb_build_object('captured_at', private.now(), 'text', q.body,
                                'photo_keys', case when q.photo_path is null then '[]'::jsonb
                                                   else jsonb_build_array(q.photo_path) end)
      from public.quad_posts q where q.id::text = p_id)
    when 'quad_reply' then (
      select jsonb_build_object('captured_at', private.now(), 'text', r.body, 'post_id', r.post_id,
                                'post_text', q.body, 'photo_keys', '[]'::jsonb)
      from public.quad_replies r join public.quad_posts q on q.id = r.post_id where r.id::text = p_id)
  end
$$;

do $$
declare
  src text;
begin
  -- Wrap the 0007 snapshot so Quad targets are captured too, without
  -- copying its body here: rename the original and dispatch.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'snapshot_evidence_base') then
    alter function private.snapshot_evidence(text, text) rename to snapshot_evidence_base;
  end if;
end;
$$;

create or replace function private.snapshot_evidence(p_type text, p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_type in ('quad_post', 'quad_reply')
              then coalesce(private.snapshot_quad_evidence(p_type, p_id),
                            jsonb_build_object('captured_at', private.now()))
              else private.snapshot_evidence_base(p_type, p_id) end
$$;

-- Quad pushes follow the opt-in "Quad replies" preference (off by default).
create or replace function private.push_pref(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'offer_%' then 'offers'
    when p_type = 'message_new' then 'messages'
    when p_type like 'meetup_%' or p_type in ('deal_check', 'rate_prompt') then 'meetups'
    when p_type in ('saved_search_match', 'watch_available') then 'saved_search'
    when p_type = 'price_drop' then 'price_drop'
    when p_type = 'listing_stale' then 'tips'
    when p_type in ('quad_reply', 'quad_milestone') then 'quad_replies'
    else null
  end
$$;

-- ---------------------------------------------------------------------------
-- Grants
revoke all on function private.require_quad(boolean) from public, anon, authenticated;
revoke all on function private.quad_on(uuid) from public, anon, authenticated;
revoke all on function private.quad_names_student(text) from public, anon, authenticated;
revoke all on function private.quad_text_verdict(text) from public, anon, authenticated;
revoke all on function private.quad_hot(int, timestamptz) from public, anon, authenticated;
revoke all on function private.quad_hidden_for(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.quad_post_json(public.quad_posts, uuid) from public, anon, authenticated;
revoke all on function private.quad_reply_json(public.quad_replies, uuid) from public, anon, authenticated;
revoke all on function private.quad_live_post(uuid, public.profiles, boolean) from public, anon, authenticated;
revoke all on function private.snapshot_quad_evidence(text, text) from public, anon, authenticated;
revoke all on function private.snapshot_evidence(text, text) from public, anon, authenticated;
revoke all on function private.snapshot_evidence_base(text, text) from public, anon, authenticated;
revoke all on function private.push_pref(text) from public, anon, authenticated;

revoke all on function public.accept_quad_rules() from public, anon;
revoke all on function public.get_quad_status() from public, anon;
revoke all on function public.get_quad_feed(text, jsonb) from public, anon;
revoke all on function public.get_quad_thread(uuid) from public, anon;
revoke all on function public.create_quad_post(text, text, text, jsonb, text, uuid) from public, anon;
revoke all on function public.create_quad_reply(uuid, text) from public, anon;
revoke all on function public.vote_quad(text, uuid, smallint) from public, anon;
revoke all on function public.vote_poll(uuid, uuid) from public, anon;
revoke all on function public.hide_quad_author(uuid) from public, anon;
revoke all on function public.unhide_quad(uuid) from public, anon;
revoke all on function public.get_my_quad_hides() from public, anon;
revoke all on function public.mute_keyword(text) from public, anon;
revoke all on function public.unmute_keyword(text) from public, anon;
revoke all on function public.get_my_quad_mutes() from public, anon;
revoke all on function public.set_quad_replies(uuid, boolean) from public, anon;
revoke all on function public.delete_quad_post(uuid) from public, anon;
revoke all on function public.get_my_quad() from public, anon;
revoke all on function public.create_report(text, text, text, text) from public, anon;
revoke all on function public.create_appeal(text, text, text, text) from public, anon;

grant execute on function public.accept_quad_rules() to authenticated, service_role;
grant execute on function public.get_quad_status() to authenticated, service_role;
grant execute on function public.get_quad_feed(text, jsonb) to authenticated, service_role;
grant execute on function public.get_quad_thread(uuid) to authenticated, service_role;
grant execute on function public.create_quad_post(text, text, text, jsonb, text, uuid) to authenticated, service_role;
grant execute on function public.create_quad_reply(uuid, text) to authenticated, service_role;
grant execute on function public.vote_quad(text, uuid, smallint) to authenticated, service_role;
grant execute on function public.vote_poll(uuid, uuid) to authenticated, service_role;
grant execute on function public.hide_quad_author(uuid) to authenticated, service_role;
grant execute on function public.unhide_quad(uuid) to authenticated, service_role;
grant execute on function public.get_my_quad_hides() to authenticated, service_role;
grant execute on function public.mute_keyword(text) to authenticated, service_role;
grant execute on function public.unmute_keyword(text) to authenticated, service_role;
grant execute on function public.get_my_quad_mutes() to authenticated, service_role;
grant execute on function public.set_quad_replies(uuid, boolean) to authenticated, service_role;
grant execute on function public.delete_quad_post(uuid) to authenticated, service_role;
grant execute on function public.get_my_quad() to authenticated, service_role;
grant execute on function public.create_report(text, text, text, text) to authenticated, service_role;
grant execute on function public.create_appeal(text, text, text, text) to authenticated, service_role;
