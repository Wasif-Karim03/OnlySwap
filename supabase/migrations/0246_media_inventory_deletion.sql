-- 0246_media_inventory_deletion.sql · LR-01..LR-04 (DEC 139, proposed).
--   * public.media_uploads: every object upload-url hands out is recorded
--     for its uploader (pending → attached → detached → collecting →
--     collected). Attaching a photo anywhere (listing, news, avatar, Quad,
--     chat) requires the caller's own row; the row is the ownership proof.
--   * One per-user advisory lock (private.media_lock) serialises upload
--     admission, registration, attach and prepare_account_deletion; once a
--     deletion has started (or the profile is gone) no media write for that
--     person succeeds (FORBIDDEN:deleting).
--   * Upload quota: at most 160 objects that are not attached, checked with
--     the incoming batch before any URL is signed; 120 upload requests a day.
--   * Upload GC with 10-minute leases (claim_stale_uploads / ack_collected),
--     run by gc_uploads every 6 hours through cleanup-drafts. It replaces the
--     draft-folder delete: draft photos are collected key by key, so a
--     listing posted at the same moment either claims first or gets
--     UPLOAD_EXPIRED; prune() only retires reservation rows now.
--   * prepare_account_deletion: merged, versioned manifest on
--     account_deletions (prior manifest + listing, draft, share, avatar and
--     Quad folders + the person's recorded keys); evidence is every open
--     report whose keys intersect it; confirm_media_deletion then a sweep 15
--     minutes later (media_sweeps_due / finish_media_sweeps).
--   * Reports take the same lock for the uploaders they snapshot (before the
--     reporter's rate counter) and withhold the media of a person whose
--     deletion has started; chat photos are kept only with a live uploader
--     row. Every function takes media locks before counters and row locks.
--   * record_evidence_moves merges per locked report (two deletions sharing
--     a report cannot shrink its private set); archive-chats claims each chat
--     (one writer per chat), marks it archived only under the same lock and
--     only if nobody in it is deleting (finish_chat_archive_checked), and a
--     refused archive stays on a durable cleanup list until its object is
--     gone (chat_archive_jobs, swept by cleanup-drafts).
--   * inventory_legacy_media(): live references from before this migration
--     become attached rows (earliest sender for chat photos; no owner, no row).
-- Additive: public RPC signatures are unchanged; only the private 5-argument
-- set_listing_photos overload is replaced by a 6-argument one.

-- ---------------------------------------------------------------------------
-- Inventory
create table public.media_uploads (
  key text primary key,
  user_id uuid not null,                  -- the uploader; no FK, rows go with prepare_account_deletion
  kind text not null check (kind in ('listing', 'avatar', 'quad', 'chat')),
  target_id uuid not null,
  size_bytes int not null default 0,
  state text not null default 'pending'
    check (state in ('pending', 'attached', 'detached', 'collecting', 'collected')),
  attempts int not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  state_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index media_uploads_user_state_idx on public.media_uploads (user_id, state);
create index media_uploads_state_at_idx on public.media_uploads (state, state_at);
alter table public.media_uploads enable row level security;
revoke all on public.media_uploads from anon, authenticated;

-- Deletion manifest (no uuid columns: T-INT-DEL-01 is unaffected).
alter table public.account_deletions
  add column media_prefixes text[],
  add column media_gen int not null default 0,
  add column media_confirmed_gen int,
  add column media_confirmed_at timestamptz,
  add column media_swept_gen int;

-- ---------------------------------------------------------------------------
-- Lock and gate. Re-entrant within one transaction.
create or replace function private.media_lock(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('media:' || p_uid::text));
  if not exists (select 1 from public.profiles p where p.id = p_uid)
     or exists (select 1 from public.account_deletions d where d.user_id = p_uid and d.status = 'started') then
    perform private.raise('FORBIDDEN', 'deleting');
  end if;
end;
$$;

-- upload-url step 1: limits (60/h, 120/day) and ownership; returns the campus.
create or replace function private.authorize_upload(p_uid uuid, p_kind text, p_target uuid, p_count int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.media_lock(p_uid);
  if p_count is null or p_count < 1 or p_count > 16 then
    perform private.raise('INVALID', 'files');
  end if;
  perform private.hit_key(p_uid, 'upload', 60, interval '1 hour');
  perform private.hit_key(p_uid, 'upload_day', 120, interval '1 day');
  return private.can_upload(p_uid, p_kind, p_target);
end;
$$;

-- upload-url step 2, before any URL is signed: the quota (160 objects that
-- are not attached, counting the batch) and one pending row per key.
-- p_items: [{key, size}]. Share cards are not recorded (one fixed key).
create or replace function private.record_uploads(p_uid uuid, p_kind text, p_target uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
  oldest timestamptz;
  added int;
begin
  perform private.media_lock(p_uid);
  if p_kind is null or p_kind not in ('listing', 'avatar', 'quad', 'chat') then
    perform private.raise('INVALID', 'kind');
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or exists (select 1 from jsonb_array_elements(p_items) e
                where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'key', '') = '') then
    perform private.raise('INVALID', 'files');
  end if;
  select count(*)::int, min(u.state_at) into n, oldest
  from public.media_uploads u
  where u.user_id = p_uid and u.state in ('pending', 'detached', 'collecting');
  if n + jsonb_array_length(p_items) > 160 then
    perform private.raise('RATE_LIMITED', 'upload_pending:'
      || to_char((coalesce(oldest, private.now()) + interval '24 hours') at time zone 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;
  insert into public.media_uploads (key, user_id, kind, target_id, size_bytes, state, state_at, created_at)
  select e ->> 'key', p_uid, p_kind, p_target, coalesce(nullif(e ->> 'size', '')::int, 0),
         'pending', private.now(), private.now()
  from jsonb_array_elements(p_items) e
  on conflict (key) do nothing;
  get diagnostics added = row_count;
  return added;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    perform private.raise('INVALID', 'files');
end;
$$;

-- Attach: the key (and, by default, its _thumb.webp sibling) must be the
-- caller's recorded upload of that kind. Missing or someone else's →
-- FORBIDDEN:upload; being collected or gone → UPLOAD_EXPIRED.
create or replace function private.claim_upload(p_uid uuid, p_kind text, p_key text, p_with_thumb boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  keys text[] := array[p_key];
  k text;
  r public.media_uploads;
begin
  perform private.media_lock(p_uid);
  if p_with_thumb and p_key ~ '_full\.webp$' then
    keys := keys || regexp_replace(p_key, '_full\.webp$', '_thumb.webp');
  end if;
  foreach k in array keys loop
    select * into r from public.media_uploads u where u.key = k for update;
    if not found or r.user_id <> p_uid or r.kind <> p_kind then
      perform private.raise('FORBIDDEN', 'upload');
    end if;
    if r.state in ('collecting', 'collected') then
      perform private.raise('UPLOAD_EXPIRED');
    end if;
    update public.media_uploads u set state = 'attached', state_at = private.now() where u.key = k;
  end loop;
end;
$$;

-- Keys the owner dropped (an edit, a new avatar) go to the GC after 24 h.
create or replace function private.detach_uploads(p_uid uuid, p_keys text[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.media_uploads u set state = 'detached', state_at = private.now()
   where u.user_id = p_uid and u.state = 'attached' and u.key = any (coalesce(p_keys, '{}'));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Upload GC. A key is collectable when it has been pending or detached for
-- 24 h, or its lease ran out, and no open report holds it as evidence.
create or replace function private.media_upload_collectable(p_key text, p_state text, p_state_at timestamptz, p_lease_until timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ((p_state in ('pending', 'detached') and p_state_at < private.now() - interval '24 hours')
          or (p_state = 'collecting' and p_lease_until < private.now()))
     and not exists (
       select 1 from public.reports r
       where r.status = 'open'
         and coalesce(r.evidence ->> 'photo_bucket', 'media') = 'media'
         and (coalesce(r.evidence -> 'photo_keys', '[]'::jsonb) ? p_key
              or coalesce(r.evidence -> 'photo_keys', '[]'::jsonb) ? regexp_replace(p_key, '_thumb\.webp$', '_full.webp')))
$$;

-- Claims up to p_limit keys under a 10-minute lease (fresh keys first).
create or replace function private.claim_stale_uploads(p_limit int default 200)
returns table (key text, token uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select u.key from public.media_uploads u
    where private.media_upload_collectable(u.key, u.state, u.state_at, u.lease_until)
    order by u.attempts, u.state_at
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
    for update skip locked)
  update public.media_uploads m
     set state = 'collecting', lease_token = gen_random_uuid(),
         lease_until = private.now() + interval '10 minutes',
         attempts = m.attempts + 1, state_at = private.now()
    from picked
   where m.key = picked.key
  returning m.key, m.lease_token;
end;
$$;

-- p_items: [{key, token}]. Only the live lease can mark a key collected.
create or replace function private.ack_collected(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.media_uploads m
     set state = 'collected', lease_token = null, lease_until = null, state_at = private.now()
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
   where m.key = e ->> 'key' and m.state = 'collecting' and m.lease_token = (e ->> 'token')::uuid;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deletion manifest
create or replace function private.confirm_media_deletion(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.account_deletions d
     set media_confirmed_gen = d.media_gen, media_confirmed_at = private.now()
   where d.user_id = p_uid and d.status = 'started';
end;
$$;

-- Manifests confirmed over 15 minutes ago whose generation is not swept yet:
-- [{id, gen, prefixes}].
create or replace function private.media_sweeps_due(p_limit int default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'gen', d.media_gen, 'prefixes', to_jsonb(d.media_prefixes))
                            order by d.media_confirmed_at), '[]'::jsonb)
  from (select * from public.account_deletions x
        where x.media_confirmed_gen = x.media_gen
          and x.media_swept_gen is distinct from x.media_gen
          and x.media_confirmed_at < private.now() - interval '15 minutes'
          and x.media_prefixes is not null
        order by x.media_confirmed_at
        limit greatest(1, least(coalesce(p_limit, 20), 100))) d
$$;

-- p_items: [{id, gen}]. Completes only the generation that was swept.
create or replace function private.finish_media_sweeps(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.account_deletions d
     set media_swept_gen = (e ->> 'gen')::int, media_prefixes = null
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
   where d.id = (e ->> 'id')::uuid and d.media_gen = (e ->> 'gen')::int;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Every 6 hours: prune 30-day tombstones, then call cleanup-drafts only
-- when there is work: stale uploads, due manifest sweeps or chat archives to
-- delete (ARC-05 exists-guard). Returns the pg_net id or null.
create or replace function private.gc_uploads()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.media_uploads u
   where u.state = 'collected' and u.state_at < private.now() - interval '30 days';
  if exists (select 1 from public.media_uploads u
             where private.media_upload_collectable(u.key, u.state, u.state_at, u.lease_until) limit 1)
     or jsonb_array_length(private.media_sweeps_due(1)) > 0
     or exists (select 1 from private.chat_archive_jobs j where j.state = 'cleanup') then
    return private.call_function('cleanup-drafts');
  end if;
  return null;
end;
$$;

-- Daily prune (API §6): used reservations, and orphan ones after 24 h (their
-- photos are inventory rows the upload GC collects key by key).
create or replace function private.prune()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.listing_reservations r
  where r.used_at is not null and r.created_at < private.now() - interval '24 hours';
  delete from public.listing_reservations r
  where r.used_at is null and r.created_at < private.now() - interval '24 hours'
    and not exists (select 1 from public.listings l where l.id = r.id);
  return null;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'gc_uploads') then
    perform cron.unschedule('gc_uploads');
  end if;
  perform cron.schedule('gc_uploads', '20 */6 * * *', 'select private.gc_uploads()');
end;
$$;

-- ---------------------------------------------------------------------------
-- prepare_account_deletion (0231) with the media lock, the merged manifest
-- and evidence by intersection.
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
  -- the account. Reports keep their own snapshot of the messages. A chat whose
  -- archive job is in flight or waiting for cleanup (RV-01) is listed too: an
  -- object it wrote before this point goes now, one written after is refused
  -- by finish_chat_archive_checked and deleted by its cleanup.
  archives := coalesce((select array_agg('archive/chats/' || c.id || '.json' order by c.id)
                        from public.chats c
                        where p_uid in (c.buyer_id, c.seller_id)
                          and (c.archived_at is not null
                               or exists (select 1 from private.chat_archive_jobs j
                                          where j.chat_id = c.id and j.state in ('writing', 'cleanup')))), '{}');

  -- Rows keyed by the user id without a foreign key.
  delete from public.activity_days where user_id = p_uid;
  delete from public.listing_reservations where user_id = p_uid;
  delete from public.rate_counters where user_id = p_uid;
  delete from public.media_uploads where user_id = p_uid;

  if not p_underage and addr is not null then
    perform private.queue_email(addr, 'account_deleted', '{}'::jsonb, 'account_deleted:' || p_uid::text);
  end if;

  -- Admin v2 (DEC 93): a record that the deletion started (no name, no email),
  -- with the media manifest; every attempt is a new generation.
  update public.account_deletions d
     set started_at = private.now(), underage = p_underage,
         media_prefixes = merged, media_gen = d.media_gen + 1
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

-- ---------------------------------------------------------------------------
-- Evidence moves (0013) made safe for two deletions sharing a report (IR-02).
-- p_moves = [{report_id, from, to, missing?}]: `to` is the private copy;
-- `missing` means the source was gone and no private copy exists. Each
-- report row is locked (report id order, no deadlock) and its set merged:
-- once a report is private, its keys only grow, so a second deletion whose
-- sources the first already removed cannot shrink it. Keys that could not
-- be kept are listed in photo_keys_missing (private-bucket names, no ids).
create or replace function private.record_evidence_moves(p_moves jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  cur jsonb;
  kept jsonb;
  missing jsonb;
  n int := 0;
begin
  for m in
    select (x ->> 'report_id')::uuid as report_id,
           coalesce(jsonb_agg(x -> 'to') filter (where not coalesce((x ->> 'missing')::boolean, false)), '[]'::jsonb) as moved,
           coalesce(jsonb_agg(x -> 'to') filter (where coalesce((x ->> 'missing')::boolean, false)), '[]'::jsonb) as gone,
           array_agg(x ->> 'from') as froms
    from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb)) as x
    group by (x ->> 'report_id')::uuid
    order by (x ->> 'report_id')::uuid
  loop
    select r.evidence into cur from public.reports r where r.id = m.report_id for update;
    if not found then
      continue;
    end if;
    if coalesce(cur ->> 'photo_bucket', 'media') = 'private' then
      -- Already moved by another deletion: keep its set and add to it.
      kept := coalesce(cur -> 'photo_keys', '[]'::jsonb) || m.moved;
      missing := coalesce(cur -> 'photo_keys_missing', '[]'::jsonb) || m.gone;
    else
      -- Still in the media bucket: a key the moves do not mention is missing,
      -- since the bucket flips for the whole set.
      kept := m.moved;
      missing := m.gone || coalesce((
        select jsonb_agg('evidence/' || m.report_id || '/' || regexp_replace(k.key, '^.*/', ''))
        from jsonb_array_elements_text(coalesce(cur -> 'photo_keys', '[]'::jsonb)) k(key)
        where k.key <> all (m.froms)), '[]'::jsonb);
    end if;
    kept := coalesce((select jsonb_agg(distinct k.key order by k.key)
                      from jsonb_array_elements_text(kept) k(key)), '[]'::jsonb);
    missing := (select jsonb_agg(distinct k.key order by k.key)
                from jsonb_array_elements_text(missing) k(key)
                where not kept ? k.key);
    update public.reports r
       set evidence = (r.evidence - 'photo_keys_missing')
                      || jsonb_build_object('photo_keys', kept, 'photo_bucket', 'private')
                      || case when missing is null then '{}'::jsonb
                              else jsonb_build_object('photo_keys_missing', missing) end
     where r.id = m.report_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat archives (IR-04, RV-01). Each archive is a claimed job, so two
-- archive-chats runs never write the same chat: claim_chat_archives hands
-- out a chat with a token and a 30-minute lease (longer than an Edge
-- Function may run); a second run skips it while the lease lives, and a chat
-- whose job is done or waiting for cleanup is never handed out again.
-- archive-chats writes the JSON to the private bucket, then calls
-- finish_chat_archive_checked: under the media lock of every person in that
-- JSON and of the chat's current participants (uuid order, the lock
-- prepare_account_deletion takes) it marks the chat archived only if none of
-- them is deleting or deleted. Otherwise the job becomes `cleanup`, which is
-- durable: archive-chats deletes the object at once, and if that fails the
-- upload GC (cleanup-drafts, via gc_uploads) deletes it later
-- (archive_cleanups_due / finish_archive_cleanups). Only then can the chat be
-- claimed again, from the data left after the deletion.
create table private.chat_archive_jobs (
  chat_id uuid primary key,
  token uuid not null,
  state text not null default 'writing' check (state in ('writing', 'cleanup', 'done')),
  lease_until timestamptz not null,
  state_at timestamptz not null default now()
);
revoke all on private.chat_archive_jobs from public, anon, authenticated;

-- [{id, token, chat, messages}] (chats_to_archive plus the job token).
create or replace function private.claim_chat_archives(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  res jsonb;
begin
  with cand as (
    select x.id from public.chats x
    where x.status = 'closed' and x.archived_at is null and x.closed_at < private.now() - interval '90 days'
      and not exists (select 1 from private.chat_archive_jobs j
                      where j.chat_id = x.id and (j.state <> 'writing' or j.lease_until >= private.now()))
    order by x.closed_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), claimed as (
    -- A row another run claimed, finished or flagged since `cand` was read
    -- is not taken over (the conflict check sees the latest row).
    insert into private.chat_archive_jobs as j (chat_id, token, state, lease_until, state_at)
    select cand.id, gen_random_uuid(), 'writing', private.now() + interval '30 minutes', private.now() from cand
    on conflict (chat_id) do update
      set token = excluded.token, lease_until = excluded.lease_until, state_at = excluded.state_at
      where j.state = 'writing' and j.lease_until < private.now()
    returning j.chat_id, j.token
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'token', cl.token,
    'chat', to_jsonb(c) - 'buyer_hidden' - 'seller_hidden',
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.messages m where m.chat_id = c.id), '[]'))
    order by c.closed_at), '[]')
    into res
  from claimed cl join public.chats c on c.id = cl.chat_id;
  return res;
end;
$$;

-- 'archived' | 'withheld' (someone in it is deleting: the object must go,
-- the job is now `cleanup`) | 'lost' (the token is no longer this run's: the
-- object belongs to whoever holds the job, so it is left alone).
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
    update private.chat_archive_jobs set state = 'done', state_at = private.now() where chat_id = p_chat;
    return 'archived';
  end if;
  update private.chat_archive_jobs set state = 'cleanup', state_at = private.now() where chat_id = p_chat;
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
                                               'key', 'archive/chats/' || j.chat_id || '.json')
                            order by j.state_at), '[]'::jsonb)
  from (select * from private.chat_archive_jobs x where x.state = 'cleanup'
        order by x.state_at limit greatest(1, least(coalesce(p_limit, 100), 1000))) j
$$;

-- p_items: [{id, token}] whose objects are gone. The chat can be claimed again.
create or replace function private.finish_archive_cleanups(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  delete from private.chat_archive_jobs j
   using jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
   where j.chat_id = (e ->> 'id')::uuid and j.token = (e ->> 'token')::uuid and j.state = 'cleanup';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The daily trigger asks for the function only when a chat can be claimed.
create or replace function private.archive_chats()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.chats x where x.status = 'closed' and x.archived_at is null
             and x.closed_at < private.now() - interval '90 days'
             and not exists (select 1 from private.chat_archive_jobs j
                             where j.chat_id = x.id and (j.state <> 'writing' or j.lease_until >= private.now()))) then
    return private.call_function('archive-chats');
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports: lock the uploaders whose media a snapshot would store (uuid order,
-- no deadlock), and withhold the media of anyone whose deletion has started.
-- Because prepare_account_deletion takes the same lock, a report either
-- commits first (and prepare finds it by intersection) or sees the started row.
--
-- Lock order (RV-03), the same in every function that takes a media lock:
-- the media advisory locks first, then rate counters (private.hit) and row
-- locks. create_report takes the uploaders' locks before its rate counter
-- and before its trigger updates the listing; update_listing, create_listing,
-- create_news, update_profile and create_quad_post take the caller's lock as
-- their first statement; send_message claims before its counters;
-- prepare_account_deletion locks before it deletes counters or closes chats.
-- So no transaction holds a row another one needs while waiting for a lock
-- that one holds. media_lock_order.test.sql checks the source order.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'private' and p.proname = 'snapshot_evidence_unguarded') then
    alter function private.snapshot_evidence(text, text) rename to snapshot_evidence_unguarded;
  end if;
end;
$$;

-- Takes the media lock of everyone whose photos a report on the target would
-- store; returns the ones whose deletion has started (or whose profile is gone).
create or replace function private.lock_report_media(p_type text, p_id text)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  owners uuid[];
  withheld uuid[] := '{}';
  o uuid;
begin
  begin
    if p_type = 'listing' then
      select array[l.seller_id] into owners from public.listings l where l.id::text = p_id;
    elsif p_type = 'user' then
      owners := array[p_id::uuid];
    elsif p_type = 'chat' then
      select array[c.buyer_id, c.seller_id] into owners from public.chats c where c.id::text = p_id;
    elsif p_type = 'message' then
      select array[c.buyer_id, c.seller_id] into owners
      from public.messages m join public.chats c on c.id = m.chat_id where m.id::text = p_id;
    elsif p_type = 'quad_post' then
      select array[q.author_id] into owners from public.quad_posts q where q.id::text = p_id;
    end if;
  exception when invalid_text_representation then
    owners := null;
  end;

  for o in select distinct x from unnest(coalesce(owners, '{}')) x where x is not null order by x loop
    perform pg_advisory_xact_lock(hashtext('media:' || o::text));
    if not exists (select 1 from public.profiles pr where pr.id = o)
       or exists (select 1 from public.account_deletions d where d.user_id = o and d.status = 'started') then
      withheld := withheld || o;
    end if;
  end loop;
  return withheld;
end;
$$;

create or replace function private.snapshot_evidence(p_type text, p_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  withheld uuid[];
  ev jsonb;
  kept jsonb;
begin
  -- Re-entrant: create_report already took these locks before its counter.
  withheld := private.lock_report_media(p_type, p_id);
  ev := private.snapshot_evidence_unguarded(p_type, p_id);
  if ev is null then
    return ev;
  end if;
  if p_type in ('chat', 'message') then
    -- A chat photo is kept only while its uploader's inventory row lives and
    -- that person is not deleting (IR-07, RV-04). Ownership is the row, not
    -- who sent the key (a key A uploaded and B resent is still A's), and the
    -- check runs on every chat report: after a deletion has completed, the
    -- participant is null and nothing is withheld by person, but the keys
    -- have no row any more (prepare removed them), so they are dropped.
    kept := coalesce((
      select jsonb_agg(k.key order by k.ord)
      from jsonb_array_elements_text(coalesce(ev -> 'photo_keys', '[]'::jsonb)) with ordinality as k(key, ord)
      where exists (select 1 from public.media_uploads u
                    join public.profiles pr on pr.id = u.user_id
                    where u.key = k.key
                      and not exists (select 1 from public.account_deletions d
                                      where d.user_id = u.user_id and d.status = 'started'))), '[]'::jsonb);
    if kept = coalesce(ev -> 'photo_keys', '[]'::jsonb) and cardinality(withheld) = 0 then
      return ev;
    end if;
    ev := ev || jsonb_build_object('photo_keys', kept);
  elsif cardinality(withheld) = 0 then
    return ev;
  else
    ev := ev || jsonb_build_object('photo_keys', '[]'::jsonb);
  end if;
  return ev || jsonb_build_object('media_withheld', 'deleting');
end;
$$;

-- create_report (0233) with one new first statement: the uploaders' media
-- locks before the reporter's rate counter and before the third-report
-- trigger updates the listing (RV-03). Body otherwise unchanged.
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
  perform private.lock_report_media(target_type, target_id);
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

-- ---------------------------------------------------------------------------
-- Listing photos (0016) with ownership: every new path and thumb_path must be
-- the caller's recorded listing upload (each checked on its own); keys the
-- listing no longer uses are detached.
create or replace function private.set_listing_photos(
  p_uid uuid, p_listing uuid, p_campus uuid, p_photos jsonb, p_min int, p_max int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefix text := 'c/' || p_campus || '/l/' || p_listing || '/';
  n int;
  k text;
  wanted text[];
begin
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then
    perform private.raise('INVALID', 'photos');
  end if;
  n := jsonb_array_length(p_photos);
  if n < p_min or n > p_max then
    perform private.raise('INVALID', 'photos');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_photos) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'path', '') !~ ('^' || prefix || '[A-Za-z0-9_-]+\.webp$')
       or coalesce(e ->> 'thumb_path', '') !~ ('^' || prefix || '[A-Za-z0-9_-]+\.webp$')
       or char_length(coalesce(e ->> 'blurhash', '')) > 100
  ) then
    perform private.raise('INVALID', 'photos');
  end if;

  wanted := coalesce((select array_agg(distinct x) from (
              select e ->> 'path' as x from jsonb_array_elements(p_photos) e
              union all
              select e ->> 'thumb_path' from jsonb_array_elements(p_photos) e) s), '{}');
  for k in
    select x from unnest(wanted) x
    where not exists (select 1 from public.listing_photos ph
                      where ph.listing_id = p_listing and x in (ph.path, ph.thumb_path))
    order by x
  loop
    perform private.claim_upload(p_uid, 'listing', k, false);
  end loop;
  perform private.detach_uploads(p_uid, array(
    select x from public.listing_photos ph, unnest(array[ph.path, ph.thumb_path]) x
    where ph.listing_id = p_listing and x is not null and not (x = any (wanted))));

  delete from public.listing_photos where listing_id = p_listing;
  insert into public.listing_photos (listing_id, idx, path, thumb_path, width, height, blurhash)
  select p_listing, (e.ord - 1)::smallint, e.v ->> 'path', e.v ->> 'thumb_path',
         nullif(e.v ->> 'width', '')::int, nullif(e.v ->> 'height', '')::int,
         nullif(e.v ->> 'blurhash', '')
  from jsonb_array_elements(p_photos) with ordinality as e(v, ord);
exception
  when invalid_text_representation or numeric_value_out_of_range then
    perform private.raise('INVALID', 'photos');
end;
$$;

-- The three callers pass the caller's id and take the caller's media lock
-- first (RV-03); create_listing and update_listing from 0016, create_news
-- from 0215, bodies otherwise unchanged.

create or replace function public.create_listing(
  id uuid,
  kind public.listing_kind default 'sale',
  title text default null,
  description text default null,
  category_id smallint default null,
  condition public.item_condition default null,
  price_cents int default 0,
  open_to_offers boolean default true,
  photos jsonb default '[]',
  meet_spot_ids uuid[] default '{}',
  meet_note text default null,
  availability text[] default '{}',
  wanted_max_cents int default null,
  wanted_ref uuid default null,
  food_minutes int default null,
  pickup_by date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  lid uuid := create_listing.id;
  k public.listing_kind := coalesce(create_listing.kind, 'sale');
  t text := btrim(coalesce(create_listing.title, ''));
  d text := nullif(btrim(coalesce(create_listing.description, '')), '');
  note text := nullif(btrim(coalesce(create_listing.meet_note, '')), '');
  price int := coalesce(create_listing.price_cents, 0);
  today date;
  tz text;
  expires timestamptz;
  held boolean;
  existing public.listings;
begin
  -- Media lock first (RV-03 lock order: before counters and row locks).
  perform pg_advisory_xact_lock(hashtext('media:' || me.id::text));
  -- Idempotent: a retry with the same reserved id returns the first result
  -- without spending the daily limit again (BE-05, T-INT-LIST-04).
  select * into existing from public.listings l where l.id = lid;
  if found then
    if existing.seller_id is distinct from me.id then
      perform private.raise('FORBIDDEN');
    end if;
    return private.listing_json(lid);
  end if;
  if lid is null or not exists (
      select 1 from public.listing_reservations r where r.id = lid and r.user_id = me.id) then
    perform private.raise('FORBIDDEN');
  end if;

  -- Fields
  if char_length(t) < 3 or char_length(t) > 80 then
    perform private.raise('INVALID', 'title');
  end if;
  if char_length(coalesce(d, '')) > 1000 then
    perform private.raise('INVALID', 'description');
  end if;
  if char_length(coalesce(note, '')) > 60 then
    perform private.raise('INVALID', 'meet_note');
  end if;
  if k = 'sale' then
    if price < 100 or price > 200000 then
      perform private.raise('INVALID', 'price_cents');
    end if;
    if create_listing.category_id is null then
      perform private.raise('INVALID', 'category_id');
    end if;
  else
    price := 0;
  end if;
  if create_listing.category_id is not null
     and not exists (select 1 from public.categories c where c.id = create_listing.category_id) then
    perform private.raise('INVALID', 'category_id');
  end if;
  if k = 'wanted' and create_listing.wanted_max_cents is not null
     and create_listing.wanted_max_cents not between 0 and 200000 then
    perform private.raise('INVALID', 'wanted_max_cents');
  end if;
  if create_listing.wanted_ref is not null and (k not in ('sale','free') or not exists (
      select 1 from public.listings w
      where w.id = create_listing.wanted_ref and w.kind = 'wanted'
        and w.campus_id = me.campus_id and w.status = 'active')) then
    perform private.raise('INVALID', 'wanted_ref');
  end if;

  -- Expiry: food by minutes, give-aways by the pickup day, others after 60 days.
  select c.timezone into tz from public.campuses c where c.id = me.campus_id;
  today := private.campus_today(me.campus_id);
  if k = 'food' then
    if create_listing.food_minutes is null or create_listing.food_minutes not between 15 and 180 then
      perform private.raise('INVALID', 'food_minutes');
    end if;
    expires := private.now() + make_interval(mins => create_listing.food_minutes);
  elsif create_listing.pickup_by is not null then
    if k <> 'free' or create_listing.pickup_by < today or create_listing.pickup_by > today + 14 then
      perform private.raise('INVALID', 'pickup_by');
    end if;
    expires := ((create_listing.pickup_by + 1)::timestamp at time zone coalesce(tz, 'America/New_York'));
  else
    expires := private.now() + interval '1440 hours';
  end if;

  held := private.listing_text_held(t, d, note);

  -- Limits (API §3): 20/day, 3 in the first 24 h; wanted 5/day; food 3/day.
  perform private.hit('create_listing', 20, interval '1 day');
  if me.created_at > private.now() - interval '24 hours' then
    perform private.hit('create_listing_new', 3, interval '1 day');
  end if;
  if k = 'wanted' then
    perform private.hit('create_wanted', 5, interval '1 day');
  elsif k = 'food' then
    perform private.hit('create_food', 3, interval '1 day');
  end if;

  insert into public.listings (
    id, campus_id, seller_id, kind, status, title, description, category_id, condition,
    price_cents, open_to_offers, meet_spot_ids, meet_note, availability,
    wanted_max_cents, wanted_ref, expires_at)
  values (
    lid, me.campus_id, me.id, k, case when held then 'held_review' else 'active' end::public.listing_status,
    t, d, create_listing.category_id, create_listing.condition,
    price, coalesce(create_listing.open_to_offers, true),
    private.check_meet_spots(me.campus_id, create_listing.meet_spot_ids), note,
    private.check_availability(create_listing.availability),
    case when k = 'wanted' then create_listing.wanted_max_cents end,
    create_listing.wanted_ref, expires);

  perform private.set_listing_photos(me.id, lid, me.campus_id, create_listing.photos,
    case when k in ('sale','free') then 1 else 0 end,
    case when k in ('sale','free') then 8 else 1 end);

  update public.listing_reservations set used_at = private.now() where id = lid;
  return private.listing_json(lid);
end;
$$;

create or replace function public.update_listing(
  id uuid,
  title text default null,
  description text default null,
  category_id smallint default null,
  condition public.item_condition default null,
  price_cents int default null,
  open_to_offers boolean default null,
  photos jsonb default null,
  meet_spot_ids uuid[] default null,
  meet_note text default null,
  availability text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  l public.listings;
  t text;
  d text;
  note text;
  price int;
  held boolean;
begin
  -- Media lock first (RV-03 lock order: before counters and row locks).
  perform pg_advisory_xact_lock(hashtext('media:' || me.id::text));
  select * into l from public.listings x where x.id = update_listing.id for update;
  if not found or l.seller_id is distinct from me.id then
    perform private.raise('NOT_FOUND');
  end if;
  if l.status in ('sold','deleted','removed') then
    perform private.raise('INVALID', 'status');
  end if;
  perform private.hit('update_listing', 50, interval '1 day');

  t := coalesce(btrim(update_listing.title), l.title);
  d := case when update_listing.description is null then l.description
            else nullif(btrim(update_listing.description), '') end;
  note := case when update_listing.meet_note is null then l.meet_note
               else nullif(btrim(update_listing.meet_note), '') end;
  price := case when l.kind = 'sale' then coalesce(update_listing.price_cents, l.price_cents) else 0 end;

  if char_length(t) < 3 or char_length(t) > 80 then
    perform private.raise('INVALID', 'title');
  end if;
  if char_length(coalesce(d, '')) > 1000 then
    perform private.raise('INVALID', 'description');
  end if;
  if char_length(coalesce(note, '')) > 60 then
    perform private.raise('INVALID', 'meet_note');
  end if;
  if l.kind = 'sale' and (price < 100 or price > 200000) then
    perform private.raise('INVALID', 'price_cents');
  end if;
  if update_listing.category_id is not null
     and not exists (select 1 from public.categories c where c.id = update_listing.category_id) then
    perform private.raise('INVALID', 'category_id');
  end if;

  held := private.listing_text_held(t, d, note);

  if price <> l.price_cents then
    insert into public.listing_price_changes (listing_id, old_cents, new_cents)
    values (l.id, l.price_cents, price);
  end if;

  update public.listings x set
    title = t, description = d, meet_note = note, price_cents = price,
    category_id = coalesce(update_listing.category_id, x.category_id),
    condition = coalesce(update_listing.condition, x.condition),
    open_to_offers = coalesce(update_listing.open_to_offers, x.open_to_offers),
    meet_spot_ids = case when update_listing.meet_spot_ids is null then x.meet_spot_ids
                         else private.check_meet_spots(l.campus_id, update_listing.meet_spot_ids) end,
    availability = case when update_listing.availability is null then x.availability
                        else private.check_availability(update_listing.availability) end,
    status = case when held and x.status = 'active' then 'held_review'::public.listing_status else x.status end
  where x.id = l.id;

  if update_listing.photos is not null then
    perform private.set_listing_photos(me.id, l.id, l.campus_id, update_listing.photos,
      case when l.kind in ('sale','free') then 1 else 0 end,
      case when l.kind in ('sale','free') then 8 else 1 end);
  end if;
  return private.listing_json(l.id);
end;
$$;

create or replace function public.create_news(
  id uuid,
  title text,
  description text default null,
  photos jsonb default '[]',
  link_url text default null,
  event_at timestamptz default null,
  place text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  lid uuid := create_news.id;
  t text := btrim(coalesce(create_news.title, ''));
  d text := nullif(btrim(coalesce(create_news.description, '')), '');
  note text := nullif(btrim(coalesce(create_news.place, '')), '');
  link text := nullif(btrim(coalesce(create_news.link_url, '')), '');
  tz text;
  expires timestamptz;
  held boolean;
  existing public.listings;
begin
  -- Media lock first (RV-03 lock order: before counters and row locks).
  perform pg_advisory_xact_lock(hashtext('media:' || me.id::text));
  -- Idempotent: a retry with the same reserved id returns the first result.
  select * into existing from public.listings l where l.id = lid;
  if found then
    if existing.seller_id is distinct from me.id then
      perform private.raise('FORBIDDEN');
    end if;
    return private.listing_json(lid);
  end if;
  if lid is null or not exists (
      select 1 from public.listing_reservations r where r.id = lid and r.user_id = me.id) then
    perform private.raise('FORBIDDEN');
  end if;

  if char_length(t) < 3 or char_length(t) > 80 then
    perform private.raise('INVALID', 'title');
  end if;
  if char_length(coalesce(d, '')) > 1000 then
    perform private.raise('INVALID', 'description');
  end if;
  if char_length(coalesce(note, '')) > 60 then
    perform private.raise('INVALID', 'place');
  end if;
  if link is not null and (char_length(link) > 300 or link !~* '^https?://[^[:space:]]+\.[^[:space:]]+$') then
    perform private.raise('INVALID', 'link_url');
  end if;

  select c.timezone into tz from public.campuses c where c.id = me.campus_id;
  tz := coalesce(tz, 'America/New_York');
  if create_news.event_at is not null then
    if create_news.event_at <= private.now() or create_news.event_at > private.now() + interval '90 days' then
      perform private.raise('INVALID', 'event_at');
    end if;
    -- Gone after the event's day ends on campus.
    expires := (((create_news.event_at at time zone tz)::date + 1)::timestamp at time zone tz);
  else
    expires := private.now() + interval '14 days';
  end if;

  -- The link goes through the same filter as the text.
  held := private.listing_text_held(t, concat_ws(' ', d, link), note);

  perform private.hit('create_listing', 20, interval '1 day');
  if me.created_at > private.now() - interval '24 hours' then
    perform private.hit('create_listing_new', 3, interval '1 day');
  end if;
  perform private.hit('create_news', 3, interval '1 day');

  insert into public.listings (
    id, campus_id, seller_id, kind, status, title, description, price_cents,
    open_to_offers, meet_note, link_url, event_at, expires_at)
  values (
    lid, me.campus_id, me.id, 'news', case when held then 'held_review' else 'active' end::public.listing_status,
    t, d, 0, false, note, link, create_news.event_at, expires);

  perform private.set_listing_photos(me.id, lid, me.campus_id, create_news.photos, 0, 4);

  update public.listing_reservations set used_at = private.now() where id = lid;
  return private.listing_json(lid);
end;
$$;

-- The 5-argument helper has no callers left.
drop function private.set_listing_photos(uuid, uuid, jsonb, int, int);

-- ---------------------------------------------------------------------------
-- Other attach writers claim the caller's upload (bodies otherwise unchanged:
-- update_profile 0012, create_quad_post 0200, send_message 0202).
-- update_profile and create_quad_post take the media lock first (RV-03);
-- send_message claims (and so locks) before its rate counters.
create or replace function public.update_profile(
  first_name text,
  last_initial text default null,
  year public.class_year default null,
  areas text[] default '{}',
  bio text default null,
  avatar_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_onboarding();
  fname text := btrim(coalesce(first_name, ''));
  initial text := upper(nullif(btrim(coalesce(last_initial, '')), ''));
  clean_bio text := nullif(btrim(coalesce(bio, '')), '');
  clean_areas text[];
  verdict text;
  p public.profiles;
  cur_avatar text;
begin
  -- Media lock first (RV-03 lock order: before counters and row locks).
  perform pg_advisory_xact_lock(hashtext('media:' || me.id::text));
  perform private.hit('update_profile', 20, interval '1 day');

  if fname !~ '^[[:alpha:]]([[:alpha:] ''’-]{0,28}[[:alpha:]])?$' then
    perform private.raise('INVALID', 'first_name');
  end if;
  if initial is not null and initial !~ '^[[:alpha:]]$' then
    perform private.raise('INVALID', 'last_initial');
  end if;
  if char_length(coalesce(clean_bio, '')) > 80 then
    perform private.raise('INVALID', 'bio');
  end if;
  verdict := private.check_text(clean_bio, 'profile');
  if verdict like 'block:%' then
    perform private.raise('BANNED_TERM', split_part(verdict, ':', 2));
  end if;

  -- Trimmed, empties dropped, duplicates removed ignoring case (first one
  -- wins), original order kept. Independent of the database collation.
  select coalesce(array_agg(t.a order by t.ord), '{}') into clean_areas
  from (
    select distinct on (lower(btrim(u.raw))) btrim(u.raw) as a, u.ord
    from unnest(coalesce(areas, '{}')) with ordinality as u(raw, ord)
    where nullif(btrim(u.raw), '') is not null
    order by lower(btrim(u.raw)), u.ord
  ) t;
  if cardinality(clean_areas) > 5 or exists (select 1 from unnest(clean_areas) a where char_length(a) > 30) then
    perform private.raise('INVALID', 'areas');
  end if;

  if avatar_path is not null
     and left(avatar_path, char_length('c/' || me.campus_id || '/u/' || me.id || '/'))
         <> 'c/' || me.campus_id || '/u/' || me.id || '/' then
    perform private.raise('INVALID', 'avatar_path');
  end if;
  -- A new avatar must be the caller's recorded upload (0246); the old one is
  -- handed to the upload GC. The current avatar is read again under the
  -- media lock taken at the top (IR-01): a save that waited behind another
  -- avatar change compares against that change, so restoring an older avatar
  -- claims it again instead of leaving it detached for the GC. The lock
  -- alone, not the deletion gate: text-only edits are not media writes
  -- (claim_upload gates).
  select x.avatar_path into cur_avatar from public.profiles x where x.id = me.id;
  if update_profile.avatar_path is distinct from cur_avatar then
    if update_profile.avatar_path is not null then
      perform private.claim_upload(me.id, 'avatar', update_profile.avatar_path);
    end if;
    if cur_avatar is not null then
      perform private.detach_uploads(me.id, array[cur_avatar]);
    end if;
  end if;

  update public.profiles x
     set first_name = fname, last_initial = initial, year = update_profile.year,
         areas = clean_areas, bio = clean_bio, avatar_path = update_profile.avatar_path
   where x.id = me.id
  returning * into p;

  return jsonb_build_object(
    'id', p.id, 'first_name', p.first_name, 'last_initial', p.last_initial,
    'display_name', p.display_name, 'year', p.year, 'areas', to_jsonb(p.areas),
    'bio', p.bio, 'avatar_path', p.avatar_path);
end;
$$;

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
  -- Media lock first (RV-03 lock order: before counters and row locks).
  perform pg_advisory_xact_lock(hashtext('media:' || me.id::text));
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

  -- The photo must be the caller's recorded upload (0246).
  if kind = 'photo' then
    perform private.claim_upload(me.id, 'quad', create_quad_post.photo_path);
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
  end if;
  return private.message_json(m, me.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Live references from before 0246 become attached rows of their owner.
-- Chat photos go to the earliest sender of the key; a key whose owner is
-- null or has no profile gets no row (it stays an orphan, DEC 139).
-- Idempotent; archived chats (messages already gone) are not covered.
create or replace function private.inventory_legacy_media()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  with candidates (key, user_id, kind, target_id) as (
    select x.key, l.seller_id, 'listing', l.id
    from public.listing_photos ph
    join public.listings l on l.id = ph.listing_id
    cross join lateral unnest(array[ph.path, ph.thumb_path]) as x(key)
    union all
    select p.avatar_path, p.id, 'avatar', p.id
    from public.profiles p where p.avatar_path is not null
    union all
    select x.key, q.author_id, 'quad', q.id
    from public.quad_posts q
    cross join lateral unnest(array[q.photo_path, regexp_replace(q.photo_path, '_full\.webp$', '_thumb.webp')]) as x(key)
    where q.photo_path is not null
    union all
    select x.key, f.sender_id, 'chat', f.chat_id
    from (select distinct on (m.photo_path) m.photo_path, m.sender_id, m.chat_id
          from public.messages m where m.photo_path is not null
          order by m.photo_path, m.id) f
    cross join lateral unnest(array[f.photo_path, regexp_replace(f.photo_path, '_full\.webp$', '_thumb.webp')]) as x(key)
  )
  insert into public.media_uploads (key, user_id, kind, target_id, state, state_at, created_at)
  select distinct on (c.key) c.key, c.user_id, c.kind, c.target_id, 'attached', private.now(), private.now()
  from candidates c
  where c.key is not null and c.user_id is not null
    and exists (select 1 from public.profiles p where p.id = c.user_id)
  order by c.key
  on conflict (key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: private helpers for the service role only.
revoke all on function private.media_lock(uuid) from public, anon, authenticated;
revoke all on function private.authorize_upload(uuid, text, uuid, int) from public, anon, authenticated;
revoke all on function private.record_uploads(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.claim_upload(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function private.detach_uploads(uuid, text[]) from public, anon, authenticated;
revoke all on function private.media_upload_collectable(text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.claim_stale_uploads(int) from public, anon, authenticated;
revoke all on function private.ack_collected(jsonb) from public, anon, authenticated;
revoke all on function private.confirm_media_deletion(uuid) from public, anon, authenticated;
revoke all on function private.media_sweeps_due(int) from public, anon, authenticated;
revoke all on function private.finish_media_sweeps(jsonb) from public, anon, authenticated;
revoke all on function private.gc_uploads() from public, anon, authenticated;
revoke all on function private.snapshot_evidence(text, text) from public, anon, authenticated;
revoke all on function private.lock_report_media(text, text) from public, anon, authenticated;
revoke all on function private.snapshot_evidence_unguarded(text, text) from public, anon, authenticated;
revoke all on function private.set_listing_photos(uuid, uuid, uuid, jsonb, int, int) from public, anon, authenticated;
revoke all on function private.inventory_legacy_media() from public, anon, authenticated;
revoke all on function private.record_evidence_moves(jsonb) from public, anon, authenticated;
revoke all on function private.finish_chat_archive_checked(uuid, uuid[], uuid) from public, anon, authenticated;
revoke all on function private.claim_chat_archives(int) from public, anon, authenticated;
revoke all on function private.archive_cleanups_due(int) from public, anon, authenticated;
revoke all on function private.finish_archive_cleanups(jsonb) from public, anon, authenticated;

grant execute on function private.authorize_upload(uuid, text, uuid, int) to service_role;
grant execute on function private.record_uploads(uuid, text, uuid, jsonb) to service_role;
grant execute on function private.claim_stale_uploads(int) to service_role;
grant execute on function private.ack_collected(jsonb) to service_role;
grant execute on function private.confirm_media_deletion(uuid) to service_role;
grant execute on function private.media_sweeps_due(int) to service_role;
grant execute on function private.finish_media_sweeps(jsonb) to service_role;
grant execute on function private.record_evidence_moves(jsonb) to service_role;
grant execute on function private.finish_chat_archive_checked(uuid, uuid[], uuid) to service_role;
grant execute on function private.claim_chat_archives(int) to service_role;
grant execute on function private.archive_cleanups_due(int) to service_role;
grant execute on function private.finish_archive_cleanups(jsonb) to service_role;

select private.inventory_legacy_media();
