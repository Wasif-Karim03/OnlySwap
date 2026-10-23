-- 0248_archive_keys_sweep_progress.sql · IR3-01, IR3-02 (DEC 139 follow-up).
-- Additive: no public signature changes. The chat_archive_jobs primary-key
-- change is safe only because 0246 is not deployed yet.
--   * IR3-01: a chat archive's key is immutable per job token
--     (archive/chats/{chat}/{token}.json, built only by
--     private.chat_archive_key). A takeover of an expired `writing` job moves
--     the old row to `cleanup` (its object is deleted under its own key) and
--     claims a new row, so a stale cleaner can never delete or unmark a
--     replacement archive. At most one `writing` or `done` row per chat.
--   * IR3-02: manifest sweeps resume where the last run stopped
--     (account_deletions.media_sweep_pos, reset by every new generation).
--     cleanup-drafts saves progress every 25 prefixes and at every stop with
--     save_media_sweep_progress.
--   * IR3-REVIEW-02: no RPC cleanup-drafts calls waits on a row lock. Each
--     one that writes locks its rows with `for update skip locked` and
--     changes only the rows it got; a skipped row stays due for the next
--     run. lock_timeout = 2s is only a backstop for other locks.

alter table public.account_deletions add column media_sweep_pos int not null default 0;

-- The only place the archive key format exists.
create or replace function private.chat_archive_key(p_chat uuid, p_token uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'archive/chats/' || p_chat || '/' || p_token || '.json'
$$;

-- One row per (chat, token): a takeover leaves the old row as `cleanup`.
alter table private.chat_archive_jobs drop constraint chat_archive_jobs_pkey;
alter table private.chat_archive_jobs add primary key (chat_id, token);
create unique index chat_archive_jobs_one_live_idx on private.chat_archive_jobs (chat_id)
  where state in ('writing', 'done');

-- [{id, token, key, chat, messages}] (chats_to_archive plus the job token and
-- its key). Sequential statements: the takeover must be visible to the insert.
create or replace function private.claim_chat_archives(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  toks uuid[];
  res jsonb;
begin
  ids := array(
    select x.id from public.chats x
    where x.status = 'closed' and x.archived_at is null and x.closed_at < private.now() - interval '90 days'
      and not exists (select 1 from private.chat_archive_jobs j
                      where j.chat_id = x.id and (j.state <> 'writing' or j.lease_until >= private.now()))
    order by x.closed_at
    limit greatest(1, least(coalesce(p_limit, 50), 200)));
  -- An expired run's object stays under its own key: it goes on the cleanup list.
  update private.chat_archive_jobs j
     set state = 'cleanup', state_at = private.now()
   where j.chat_id = any(ids) and j.state = 'writing' and j.lease_until < private.now();
  -- A row another run claimed or finished since `ids` was read wins (do nothing).
  toks := array(select gen_random_uuid() from unnest(ids));
  insert into private.chat_archive_jobs (chat_id, token, state, lease_until, state_at)
  select t.id, t.token, 'writing', private.now() + interval '30 minutes', private.now()
  from unnest(ids, toks) as t(id, token)
  on conflict (chat_id) where state in ('writing', 'done') do nothing;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'token', j.token,
    'key', private.chat_archive_key(j.chat_id, j.token),
    'chat', to_jsonb(c) - 'buyer_hidden' - 'seller_hidden',
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.messages m where m.chat_id = c.id), '[]'))
    order by c.closed_at), '[]')
    into res
  from unnest(ids, toks) as t(id, token)
  join private.chat_archive_jobs j on j.chat_id = t.id and j.token = t.token
  join public.chats c on c.id = j.chat_id;
  return res;
end;
$$;

-- 'archived' | 'withheld' | 'lost' (0246). Only this run's (chat, token) row changes.
create or replace function private.finish_chat_archive_checked(p_chat uuid, p_people uuid[], p_token uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o uuid;
  ok boolean := true;
begin
  for o in
    select distinct x from (
      select unnest(coalesce(p_people, '{}')) as x
      union all
      select unnest(array[c.buyer_id, c.seller_id]) from public.chats c where c.id = p_chat) s
    where x is not null
    order by x
  loop
    perform pg_advisory_xact_lock(hashtext('media:' || o::text));
    if not exists (select 1 from public.profiles pr where pr.id = o)
       or exists (select 1 from public.account_deletions d where d.user_id = o and d.status = 'started') then
      ok := false;
    end if;
  end loop;
  perform 1 from private.chat_archive_jobs j
   where j.chat_id = p_chat and j.token = p_token and j.state = 'writing'
   for update;
  if not found then
    return 'lost';
  end if;
  if ok then
    perform private.finish_chat_archive(p_chat);
    update private.chat_archive_jobs set state = 'done', state_at = private.now()
     where chat_id = p_chat and token = p_token;
    return 'archived';
  end if;
  update private.chat_archive_jobs set state = 'cleanup', state_at = private.now()
   where chat_id = p_chat and token = p_token;
  return 'withheld';
end;
$$;

-- Archives that must be deleted: [{id, token, key}].
create or replace function private.archive_cleanups_due(p_limit int default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', j.chat_id, 'token', j.token,
                                               'key', private.chat_archive_key(j.chat_id, j.token))
                            order by j.state_at), '[]'::jsonb)
  from (select * from private.chat_archive_jobs x where x.state = 'cleanup'
        order by x.state_at limit greatest(1, least(coalesce(p_limit, 100), 1000))) j
$$;

-- Manifests confirmed over 15 minutes ago whose generation is not swept yet:
-- [{id, gen, prefixes, pos}]; `pos` is the first prefix not yet swept.
create or replace function private.media_sweeps_due(p_limit int default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'gen', d.media_gen, 'prefixes', to_jsonb(d.media_prefixes),
                                               'pos', d.media_sweep_pos)
                            order by d.media_confirmed_at), '[]'::jsonb)
  from (select * from public.account_deletions x
        where x.media_confirmed_gen = x.media_gen
          and x.media_swept_gen is distinct from x.media_gen
          and x.media_confirmed_at < private.now() - interval '15 minutes'
          and x.media_prefixes is not null
        order by x.media_confirmed_at
        limit greatest(1, least(coalesce(p_limit, 20), 100))) d
$$;

-- Saves how far a sweep of generation p_gen got. Never waits: a row locked by
-- another transaction (a prepare_account_deletion retry), a stale or finished
-- generation, or a position not past the saved one changes nothing (0).
create or replace function private.save_media_sweep_progress(p_id uuid, p_gen int, p_pos int)
returns int
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  n int;
begin
  update public.account_deletions d set media_sweep_pos = p_pos
    from (select x.id from public.account_deletions x
           where x.id = p_id and x.media_gen = p_gen
             and x.media_swept_gen is distinct from x.media_gen and p_pos > x.media_sweep_pos
           for update skip locked) l
   where d.id = l.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- prepare_account_deletion (0246) with two changes: every archive job's key
-- (any state) plus the legacy key of a chat archived before 0246 is listed,
-- and a new generation starts its sweep at the first prefix.
create or replace function private.prepare_account_deletion(p_uid uuid, p_underage boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  addr text;
  prior text[];
  fresh text[];
  merged text[];
  evidence jsonb;
  archives text[];
begin
  select * into p from public.profiles x where x.id = p_uid;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  -- Same lock as upload admission, registration and attach (0246): anything
  -- admitted before this point is in the inventory, nothing after it passes.
  perform pg_advisory_xact_lock(hashtext('media:' || p_uid::text));
  perform private.hit_key(p_uid, 'delete_account', 3, interval '1 day');

  -- Underage mode skips the confirmation and the goodbye email, so it is only
  -- for accounts the age check has just blocked.
  if p_underage and not exists (select 1 from public.age_blocks a where a.email_hash = p.email_hash) then
    perform private.raise('FORBIDDEN');
  end if;

  select u.email into addr from auth.users u where u.id = p_uid;

  -- Deal data stays for the other person (BE-01): close the chats read-only
  -- with a system message; snapshots and FKs (set null) do the rest.
  insert into public.messages (chat_id, sender_id, kind, body, created_at)
  select c.id, null, 'system', 'This account was deleted.', private.now()
  from public.chats c
  where p_uid in (c.buyer_id, c.seller_id) and c.status <> 'closed';
  update public.chats c
     set status = 'closed', closed_at = coalesce(c.closed_at, private.now())
   where p_uid in (c.buyer_id, c.seller_id) and c.status <> 'closed';

  -- A banned person can't come back with the same address.
  if p.status = 'banned' then
    insert into public.banned_hashes (email_hash, created_at) values (p.email_hash, private.now())
    on conflict do nothing;
  end if;

  -- Media the person owns (R2 prefixes and keys), computed before the rows go
  -- away and merged with the manifest of an earlier attempt (retry safety).
  prior := coalesce((select d.media_prefixes from public.account_deletions d
                     where d.user_id = p_uid and d.status = 'started'), '{}');
  fresh := array['c/' || p.campus_id || '/u/' || p_uid || '/']
    || coalesce((select array_agg(x) from (
         select 'c/' || l.campus_id || '/l/' || l.id || '/' as x
         from public.listings l where l.seller_id = p_uid
         union
         select 'share/' || l.id || '.jpg'
         from public.listings l where l.seller_id = p_uid
         union
         select 'c/' || p.campus_id || '/l/' || r.id || '/'
         from public.listing_reservations r where r.user_id = p_uid
         union
         select 'c/' || q.campus_id || '/quad/' || q.id || '/'
         from public.quad_posts q where q.author_id = p_uid
         union
         select u.key
         from public.media_uploads u where u.user_id = p_uid and u.state <> 'collected') s), '{}');
  merged := (select array_agg(x order by x collate "C")
             from (select distinct x from unnest(prior || fresh) x) d);

  -- Photos that open reports point at (BE-02): every report about this person,
  -- and every report holding one of their keys, whoever it targets. All keys
  -- of such a report move together (record_evidence_moves merges per report).
  select coalesce(jsonb_agg(jsonb_build_object('report_id', r.id, 'key', k.key) order by r.id, k.key), '[]'::jsonb)
    into evidence
  from public.reports r
  cross join lateral jsonb_array_elements_text(coalesce(r.evidence -> 'photo_keys', '[]'::jsonb)) as k(key)
  where r.status = 'open'
    and coalesce(r.evidence ->> 'photo_bucket', 'media') = 'media'
    and (r.target_user_id = p_uid
         or private.quad_report_author(r.target_type, r.target_id) = p_uid
         or exists (select 1
                    from jsonb_array_elements_text(coalesce(r.evidence -> 'photo_keys', '[]'::jsonb)) as k2(key)
                    where exists (select 1 from unnest(merged) pf where left(k2.key, length(pf)) = pf)));

  -- Closed chats archived to the private bucket (DATA_MODEL §5): deleted with
  -- the account. Reports keep their own snapshot of the messages. Every
  -- archive job of the person's chats is listed under its own key (IR3-01),
  -- whatever its state: an object it wrote before this point goes now, one
  -- written after is refused by finish_chat_archive_checked and deleted by
  -- its cleanup. A chat archived before 0246 has no `done` job: its legacy
  -- key archive/chats/{chat}.json is listed instead.
  archives := coalesce((select array_agg(x order by x collate "C") from (
                          select private.chat_archive_key(j.chat_id, j.token) as x
                          from private.chat_archive_jobs j
                          join public.chats c on c.id = j.chat_id
                          where p_uid in (c.buyer_id, c.seller_id)
                          union
                          select 'archive/chats/' || c.id || '.json'
                          from public.chats c
                          where p_uid in (c.buyer_id, c.seller_id)
                            and c.archived_at is not null
                            and not exists (select 1 from private.chat_archive_jobs j
                                            where j.chat_id = c.id and j.state = 'done')) s), '{}');

  -- Rows keyed by the user id without a foreign key.
  delete from public.activity_days where user_id = p_uid;
  delete from public.listing_reservations where user_id = p_uid;
  delete from public.rate_counters where user_id = p_uid;
  delete from public.media_uploads where user_id = p_uid;

  if not p_underage and addr is not null then
    perform private.queue_email(addr, 'account_deleted', '{}'::jsonb, 'account_deleted:' || p_uid::text);
  end if;

  -- Admin v2 (DEC 93): a record that the deletion started (no name, no email),
  -- with the media manifest; every attempt is a new generation, swept from
  -- its first prefix.
  update public.account_deletions d
     set started_at = private.now(), underage = p_underage,
         media_prefixes = merged, media_gen = d.media_gen + 1, media_sweep_pos = 0
   where d.user_id = p_uid and d.status = 'started';
  if not found then
    insert into public.account_deletions (user_id, campus_id, underage, status, started_at, media_prefixes, media_gen)
    values (p_uid, p.campus_id, p_underage, 'started', private.now(), merged, 1);
  end if;

  return jsonb_build_object(
    'email', case when p_underage then null else addr end,
    'r2_prefixes', to_jsonb(merged),
    'archives', to_jsonb(archives),
    'evidence', evidence);
end;
$$;

-- No cleanup-drafts call waits on a row lock (IR3-REVIEW-02). The due lists
-- are stable reads and take no row locks; claim_stale_uploads (0246) already
-- claims with skip locked; the three finishers below are 0246's with the
-- same checks and results, except that a row another transaction holds is
-- skipped (not counted, still due). The 2 s backstop here and in
-- save_media_sweep_progress must match DB_LOCK_TIMEOUT_MS in
-- supabase/functions/_shared/cleanupDrafts.ts (a call is only issued with at
-- least that much time plus a margin). create or replace keeps the ACLs.
alter function private.claim_stale_uploads(int) set lock_timeout = '2s';

-- p_items: [{key, token}]. Only the live lease can mark a key collected.
create or replace function private.ack_collected(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  n int;
begin
  update public.media_uploads m
     set state = 'collected', lease_token = null, lease_until = null, state_at = private.now()
    from (select x.key from public.media_uploads x
            join jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
              on x.key = e ->> 'key' and x.state = 'collecting' and x.lease_token = (e ->> 'token')::uuid
          for update of x skip locked) l
   where m.key = l.key;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- p_items: [{id, gen}]. Completes only the generation that was swept.
create or replace function private.finish_media_sweeps(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  n int;
begin
  update public.account_deletions d
     set media_swept_gen = l.gen, media_prefixes = null
    from (select x.id, x.media_gen as gen from public.account_deletions x
            join jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
              on x.id = (e ->> 'id')::uuid and x.media_gen = (e ->> 'gen')::int
          for update of x skip locked) l
   where d.id = l.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- p_items: [{id, token}] whose objects are gone. The chat can be claimed again.
create or replace function private.finish_archive_cleanups(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  n int;
begin
  delete from private.chat_archive_jobs j
   using (select x.chat_id, x.token from private.chat_archive_jobs x
            join jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
              on x.chat_id = (e ->> 'id')::uuid and x.token = (e ->> 'token')::uuid and x.state = 'cleanup'
          for update of x skip locked) l
   where j.chat_id = l.chat_id and j.token = l.token;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Grants: private helpers for the service role only.
revoke all on function private.chat_archive_key(uuid, uuid) from public, anon, authenticated;
revoke all on function private.save_media_sweep_progress(uuid, int, int) from public, anon, authenticated;

grant execute on function private.chat_archive_key(uuid, uuid) to service_role;
grant execute on function private.save_media_sweep_progress(uuid, int, int) to service_role;
