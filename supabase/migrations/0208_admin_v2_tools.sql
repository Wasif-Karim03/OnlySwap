-- 0208_admin_v2_tools.sql · Admin v2, part 3: the missing tools
-- (ADMIN_CHECKLIST §5; DEC 93). Shapes in API.md §4.1.
--   * Support inbox: support_requests gains status (open / answered / closed),
--     staff_note, replied_at, reply_count, updated_at, updated_by. Moderators
--     see requests whose email domain belongs to their campus. A reply goes
--     out through the email outbox (template support_reply, plain text,
--     escaped by the mailer, to the address on the request only).
--   * Waitlist demand by school and a one-click open (owner, same path as the
--     automatic unlock: private.unlock_campus → trg_campuses_open).
--   * Add a school (owner): campus + first student domain + optional first
--     meetup spot in one call.
--   * Meetups and no-shows, ratings, under-18 attempts (age_blocks gains a
--     campus_id, stamped by a trigger from the profile that hit the check).
--   * Account deletions: new account_deletions table (no name, no email):
--     prepare_account_deletion opens a 'started' row with the user id, the
--     profile's deletion closes it as 'done' and clears the id (the id never
--     outlives the account, T-INT-DEL-01); a row still 'started' after an
--     hour is a failed run.
--     Kept 365 days. Data exports come from data_exports.
--   * System health (owner): email outbox, push tickets, cron runs, database
--     size against the 500 MB free tier.
--   * Alerts: priority-1 reports (threat, self_harm, minor_safety) already
--     email every owner (trg_reports_ai, 0011). New: every 30 minutes, when the
--     oldest open report is older than 4 hours, one report_queue email to each
--     owner, at most once per 4 hours (checked against the outbox).
--   * App Review accounts, bulk listing status (one audit row with the ids),
--     banned email hashes, categories (rename, reorder, add; no hide yet).
-- Every admin write: require_admin with its role, a 3+ character reason and
-- exactly one audit_log row.

-- ---------------------------------------------------------------------------
-- Schema (additive)
alter table public.support_requests add column if not exists status text not null default 'open'
  check (status in ('open', 'answered', 'closed'));
alter table public.support_requests add column if not exists staff_note text check (char_length(staff_note) <= 1000);
alter table public.support_requests add column if not exists replied_at timestamptz;
alter table public.support_requests add column if not exists reply_count int not null default 0;
alter table public.support_requests add column if not exists updated_at timestamptz;
alter table public.support_requests add column if not exists updated_by uuid;
update public.support_requests set status = 'closed' where handled_at is not null and status = 'open';
create index if not exists support_requests_status_created on public.support_requests (status, created_at);

alter table public.email_outbox drop constraint if exists email_outbox_template_check;
alter table public.email_outbox add constraint email_outbox_template_check
  check (template in ('campus_open','account_paused','reverify_due','account_deleted','data_export','admin_reveal_receipt',
                      'support_request','priority_report','support_reply','report_queue'));

alter table public.age_blocks add column if not exists campus_id uuid;   -- a tag for counts; no FK

create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                           -- set while running; cleared when done (T-INT-DEL-01: the id doesn't outlive the account)
  campus_id uuid,
  underage bool not null default false,
  status text not null default 'started' check (status in ('started', 'done')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index on public.account_deletions (started_at desc);
create index on public.account_deletions (user_id);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Under-18 attempts: tag the campus of the profile that hit the age check.
create or replace function private.age_blocks_bi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.campus_id is null then
    new.campus_id := (select p.campus_id from public.profiles p where p.email_hash = new.email_hash limit 1);
  end if;
  return new;
end;
$$;
drop trigger if exists age_blocks_bi on public.age_blocks;
create trigger age_blocks_bi before insert on public.age_blocks
  for each row execute function private.age_blocks_bi();

-- ---------------------------------------------------------------------------
-- Account deletions. Same as 0013 plus the 'started' row.
create or replace function private.prepare_account_deletion(p_uid uuid, p_underage boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  addr text;
  prefixes text[];
  evidence jsonb;
begin
  select * into p from public.profiles x where x.id = p_uid;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
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

  -- Media the person owns (R2 prefixes), computed before the rows go away.
  prefixes := array['c/' || p.campus_id || '/u/' || p_uid || '/']
    || coalesce((select array_agg(x order by x collate "C") from (
         select 'c/' || l.campus_id || '/l/' || l.id || '/' as x
         from public.listings l where l.seller_id = p_uid
         union
         select 'share/' || l.id || '.jpg'
         from public.listings l where l.seller_id = p_uid
         union
         select 'c/' || p.campus_id || '/l/' || r.id || '/'
         from public.listing_reservations r where r.user_id = p_uid) s), '{}');

  -- Photos that open reports about this person point at (BE-02). They are
  -- moved to the private bucket before the prefixes above are deleted.
  select coalesce(jsonb_agg(jsonb_build_object('report_id', r.id, 'key', k.key) order by r.id, k.key), '[]'::jsonb)
    into evidence
  from public.reports r
  cross join lateral jsonb_array_elements_text(coalesce(r.evidence -> 'photo_keys', '[]'::jsonb)) as k(key)
  where r.target_user_id = p_uid and r.status = 'open'
    and coalesce(r.evidence ->> 'photo_bucket', 'media') = 'media';

  -- Rows keyed by the user id without a foreign key.
  delete from public.activity_days where user_id = p_uid;
  delete from public.listing_reservations where user_id = p_uid;
  delete from public.rate_counters where user_id = p_uid;

  if not p_underage and addr is not null then
    perform private.queue_email(addr, 'account_deleted', '{}'::jsonb, 'account_deleted:' || p_uid::text);
  end if;

  -- Admin v2 (DEC 93): a record that the deletion started (no name, no email).
  update public.account_deletions d set started_at = private.now(), underage = p_underage
   where d.user_id = p_uid and d.status = 'started';
  if not found then
    insert into public.account_deletions (user_id, campus_id, underage, status, started_at)
    values (p_uid, p.campus_id, p_underage, 'started', private.now());
  end if;

  return jsonb_build_object(
    'email', case when p_underage then null else addr end,
    'r2_prefixes', to_jsonb(prefixes),
    'evidence', evidence);
end;
$$;

create or replace function private.profiles_ad_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.account_deletions d set status = 'done', finished_at = private.now(), user_id = null
   where d.user_id = old.id and d.status = 'started';
  if not found then
    insert into public.account_deletions (user_id, campus_id, underage, status, started_at, finished_at)
    values (null, old.campus_id, false, 'done', private.now(), private.now());
  end if;
  return null;
end;
$$;
drop trigger if exists profiles_ad_deletion on public.profiles;
create trigger profiles_ad_deletion after delete on public.profiles
  for each row execute function private.profiles_ad_deletion();

-- Retention: activity events 90 days (0206), deletion records 365 days.
create or replace function private.prune_activity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
  m int;
begin
  delete from public.activity_events where created_at < private.now() - interval '90 days';
  get diagnostics n = row_count;
  delete from public.account_deletions where started_at < private.now() - interval '365 days';
  get diagnostics m = row_count;
  return jsonb_build_object('activity_events', n, 'account_deletions', m);
end;
$$;

-- ---------------------------------------------------------------------------
-- Support inbox
create or replace function private.support_json(s public.support_requests, a public.admins, p_full boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'email', case when a.role = 'owner' then s.email else private.mask_email(s.email) end,
    'topic', s.topic, 'status', s.status, 'campus', private.campus_brief(private.support_campus(s.email)),
    'created_at', s.created_at, 'handled_at', s.handled_at, 'replied_at', s.replied_at, 'reply_count', s.reply_count)
  || case when p_full then jsonb_build_object(
       'body', s.body, 'staff_note', s.staff_note, 'updated_at', s.updated_at,
       'updated_by', private.person_brief(s.updated_by),
       'person', (select private.person_brief(u.id) from auth.users u where lower(u.email) = lower(s.email) limit 1))
     else jsonb_build_object('preview', left(s.body, 140)) end
$$;

create or replace function public.admin_list_support(status text default 'open', campus_id uuid default null, cursor int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_list_support.campus_id);
  c uuid := private.admin_campus(a, admin_list_support.campus_id);
  st text := nullif(admin_list_support.status, 'all');
  off int := greatest(coalesce(admin_list_support.cursor, 0), 0);
  items jsonb;
begin
  if st is not null and st not in ('open', 'answered', 'closed') then
    perform private.raise('INVALID', 'status');
  end if;
  select coalesce(jsonb_agg(private.support_json(s, a, false) order by s.created_at), '[]'::jsonb) into items
  from (select * from public.support_requests x
        where (st is null or x.status = st) and (c is null or private.support_campus(x.email) = c)
        order by x.created_at offset off limit 50) s;
  return jsonb_build_object('items', items, 'next_cursor', case when jsonb_array_length(items) = 50 then off + 50 end);
end;
$$;

-- The full message. Logged ('support.view'): it holds an email and free text.
create or replace function public.admin_support_detail(id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s public.support_requests;
  a public.admins;
begin
  select * into s from public.support_requests x where x.id = admin_support_detail.id;
  a := private.require_admin('moderator', private.support_campus(s.email));
  if s.id is null then
    perform private.raise('NOT_FOUND');
  end if;
  if a.campus_id is not null and private.support_campus(s.email) is null then
    perform private.raise('NOT_ADMIN');
  end if;
  perform private.audit(a.user_id, 'support.view', 'support', s.id::text, private.support_campus(s.email), 'view');
  return private.support_json(s, a, true);
end;
$$;

-- status: open | answered | closed. reply (optional, up to 2000 characters)
-- emails the sender (support_reply) and sets answered unless closed is asked.
create or replace function public.admin_update_support(id uuid, status text, reason text, note text default null, reply text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s public.support_requests;
  a public.admins;
  why text := private.need_reason(admin_update_support.reason);
  body text := nullif(btrim(coalesce(admin_update_support.reply, '')), '');
  st text := admin_update_support.status;
  campus uuid;
begin
  select * into s from public.support_requests x where x.id = admin_update_support.id for update;
  campus := private.support_campus(s.email);
  a := private.require_admin('moderator', campus);
  if s.id is null then
    perform private.raise('NOT_FOUND');
  end if;
  if a.campus_id is not null and campus is null then
    perform private.raise('NOT_ADMIN');
  end if;
  if st is null or st not in ('open', 'answered', 'closed') then
    perform private.raise('INVALID', 'status');
  end if;
  if char_length(coalesce(admin_update_support.note, '')) > 1000 then
    perform private.raise('INVALID', 'note');
  end if;
  if body is not null then
    if char_length(body) > 2000 then
      perform private.raise('INVALID', 'reply');
    end if;
    if s.email is null or s.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      perform private.raise('INVALID', 'email');
    end if;
    perform private.queue_email(s.email, 'support_reply',
      jsonb_build_object('topic', s.topic, 'body', body, 'ref', left(s.id::text, 8)),
      'support_reply:' || s.id || ':' || (s.reply_count + 1));
    if st = 'open' then
      st := 'answered';
    end if;
  end if;
  update public.support_requests x
     set status = st,
         staff_note = coalesce(nullif(btrim(coalesce(admin_update_support.note, '')), ''), x.staff_note),
         handled_at = case when st = 'open' then null else coalesce(x.handled_at, private.now()) end,
         replied_at = case when body is not null then private.now() else x.replied_at end,
         reply_count = x.reply_count + case when body is not null then 1 else 0 end,
         updated_at = private.now(), updated_by = a.user_id
   where x.id = s.id
  returning * into s;
  perform private.audit(a.user_id, 'support.update', 'support', s.id::text, campus, why,
    jsonb_build_object('status', st, 'replied', body is not null));
  return private.support_json(s, a, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist demand: sign-ups by email domain (waitlist_requests not yet told,
-- plus waitlisted members of a known campus), newest first by school.
create or replace function public.admin_waitlist_demand()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.admins := private.require_admin('moderator');
  items jsonb;
begin
  with req as (
    select w.domain, count(*)::int as n, max(w.created_at) as newest,
           (array_agg(w.school_guess order by w.created_at desc) filter (where w.school_guess is not null))[1] as guess
    from public.waitlist_requests w where w.notified_at is null group by w.domain
  ),
  doms as (
    select r.domain from req r
    union select d.domain from public.campus_domains d join public.campuses c on c.id = d.campus_id
          where d.kind = 'student' and c.status = 'waitlist'
  )
  select coalesce(jsonb_agg(x.j order by x.total desc, x.newest desc nulls last), '[]'::jsonb) into items
  from (
    select jsonb_build_object(
             'domain', dm.domain, 'school_guess', r.guess,
             'campus', case when cp.id is null then null else private.campus_brief(cp.id)
                            || jsonb_build_object('unlock_threshold', cp.unlock_threshold) end,
             'requests', coalesce(r.n, 0), 'members_waiting', coalesce(m.n, 0),
             'total', coalesce(r.n, 0) + coalesce(m.n, 0), 'newest_at', greatest(r.newest, m.newest)) as j,
           coalesce(r.n, 0) + coalesce(m.n, 0) as total, greatest(r.newest, m.newest) as newest
    from doms dm
    left join req r on r.domain = dm.domain
    left join public.campus_domains d on d.domain = dm.domain and d.kind = 'student'
    left join public.campuses cp on cp.id = d.campus_id
    left join lateral (select count(*)::int as n, max(p.created_at) as newest from public.profiles p
                       join auth.users u on u.id = p.id
                       where p.campus_id = cp.id and p.status = 'waitlist'
                         and lower(split_part(u.email, '@', 2)) = dm.domain) m on true
    where a.campus_id is null or cp.id = a.campus_id
  ) x;
  return jsonb_build_object('schools', items,
    'total_requests', (select count(*)::int from public.waitlist_requests w where w.notified_at is null
                       and (a.campus_id is null or exists (select 1 from public.campus_domains d
                                                           where d.domain = w.domain and d.campus_id = a.campus_id))));
end;
$$;

create or replace function public.admin_open_campus(campus_id uuid, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_open_campus.reason);
  c public.campuses;
  waiting int;
begin
  select * into c from public.campuses x where x.id = admin_open_campus.campus_id for update;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  if c.status <> 'waitlist' then
    perform private.raise('INVALID', 'status');
  end if;
  select count(*)::int into waiting from public.profiles p where p.campus_id = c.id and p.status = 'waitlist';
  perform private.unlock_campus(c.id);
  perform private.audit(a.user_id, 'campus.open', 'campus', c.id::text, c.id, why, jsonb_build_object('members', waiting));
  return jsonb_build_object('opened', true, 'members_activated', waiting);
end;
$$;

-- ---------------------------------------------------------------------------
-- Add a school (owner). spot: {name, lat, lng, description?, hours?,
-- designation? ('public' | 'police'), designated_on?}.
create or replace function public.admin_create_campus(
  name text, short_name text, slug text, timezone text, domain text,
  status text default 'waitlist', spot jsonb default null, reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_create_campus.reason);
  d text := lower(btrim(coalesce(admin_create_campus.domain, '')));
  s text := lower(btrim(coalesce(admin_create_campus.slug, '')));
  nm text := btrim(coalesce(admin_create_campus.name, ''));
  sn text := btrim(coalesce(admin_create_campus.short_name, ''));
  st text := coalesce(admin_create_campus.status, 'waitlist');
  new_id uuid;
  spot_id uuid;
begin
  if char_length(nm) < 3 or char_length(nm) > 100 then
    perform private.raise('INVALID', 'name');
  end if;
  if char_length(sn) < 2 or char_length(sn) > 40 then
    perform private.raise('INVALID', 'short_name');
  end if;
  if s !~ '^[a-z0-9-]{2,40}$' then
    perform private.raise('INVALID', 'slug');
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = admin_create_campus.timezone) then
    perform private.raise('INVALID', 'timezone');
  end if;
  if d !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$' or char_length(d) > 100 then
    perform private.raise('INVALID', 'domain');
  end if;
  if exists (select 1 from public.campus_domains x where x.domain = d) then
    perform private.raise('INVALID', 'domain_taken');
  end if;
  if exists (select 1 from public.campuses x where x.slug = s) then
    perform private.raise('INVALID', 'slug_taken');
  end if;
  if st not in ('waitlist', 'live', 'paused') then
    perform private.raise('INVALID', 'status');
  end if;

  insert into public.campuses (slug, name, short_name, timezone, status, unlocked_at, created_at)
  values (s, nm, sn, admin_create_campus.timezone, st::public.campus_status,
          case when st = 'live' then private.now() end, private.now())
  returning id into new_id;
  insert into public.campus_domains (domain, campus_id, kind, created_at) values (d, new_id, 'student', private.now());

  if admin_create_campus.spot is not null and jsonb_typeof(admin_create_campus.spot) = 'object' then
    begin
      insert into public.safe_spots (campus_id, name, description, hours, lat, lng, designation, designated_on, is_default, active, sort)
      values (new_id, nullif(btrim(spot ->> 'name'), ''), spot ->> 'description', spot ->> 'hours',
              (spot ->> 'lat')::float8, (spot ->> 'lng')::float8,
              coalesce(spot ->> 'designation', 'public')::public.spot_designation, (spot ->> 'designated_on')::date,
              true, true, 1)
      returning id into spot_id;
    exception
      when check_violation then perform private.raise('INVALID', 'designated_on');
      when not_null_violation or invalid_text_representation or numeric_value_out_of_range then
        perform private.raise('INVALID', 'spot');
    end;
  end if;

  perform private.audit(a.user_id, 'campus.create', 'campus', new_id::text, new_id, why,
    jsonb_build_object('slug', s, 'domain', d, 'status', st, 'spot_id', spot_id));
  return jsonb_build_object('id', new_id, 'slug', s, 'spot_id', spot_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Meetups. when: 'upcoming' (proposed or confirmed, from 2 hours ago on,
-- soonest first) or 'past' (newest first).
create or replace function public.admin_list_meetups(campus_id uuid default null, "when" text default 'upcoming', cursor int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_list_meetups.campus_id);
  c uuid := private.admin_campus(a, admin_list_meetups.campus_id);
  wh text := coalesce(admin_list_meetups."when", 'upcoming');
  off int := greatest(coalesce(admin_list_meetups.cursor, 0), 0);
  now_at timestamptz := private.now();
  items jsonb;
begin
  if wh not in ('upcoming', 'past') then
    perform private.raise('INVALID', 'when');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'chat_id', m.chat_id, 'starts_at', m.starts_at, 'status', m.status,
      'place', coalesce(ss.name, m.custom_place), 'spot_id', m.spot_id, 'campus_id', m.campus_id,
      'buyer', private.person_brief(m.buyer_id), 'seller', private.person_brief(m.seller_id),
      'listing', jsonb_build_object('id', m.listing_id, 'title', m.listing_title),
      'confirmed_at', m.confirmed_at, 'buyer_here_at', m.buyer_here_at, 'seller_here_at', m.seller_here_at,
      'no_show_reports', (select count(*)::int from public.noshow_reports n where n.meetup_id = m.id))
      order by m.ord), '[]'::jsonb)
    into items
  from (select x.*, ch.buyer_id, ch.seller_id, ch.listing_id, ch.listing_title,
               coalesce(l.campus_id, sp.campus_id) as campus_id,
               row_number() over (order by case when wh = 'upcoming' then x.starts_at end asc,
                                           case when wh = 'past' then x.starts_at end desc, x.id) as ord
        from public.meetups x join public.chats ch on ch.id = x.chat_id
        left join public.listings l on l.id = ch.listing_id
        left join public.profiles sp on sp.id = ch.seller_id
        where (c is null or coalesce(l.campus_id, sp.campus_id) = c)
          and case when wh = 'upcoming' then x.starts_at >= now_at - interval '2 hours' and x.status in ('proposed', 'confirmed')
                   else x.starts_at < now_at end
        order by ord offset off limit 50) m
  left join public.safe_spots ss on ss.id = m.spot_id;
  return jsonb_build_object('items', items, 'next_cursor', case when jsonb_array_length(items) = 50 then off + 50 end);
end;
$$;

-- Who keeps missing meetups: people with no-show reports in the last 180 days
-- or a no-show count, most first.
create or replace function public.admin_noshow_summary(campus_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_noshow_summary.campus_id);
  c uuid := private.admin_campus(a, admin_noshow_summary.campus_id);
  since timestamptz := private.now() - interval '180 days';
begin
  return jsonb_build_object(
    'totals', (select jsonb_build_object(
                 'open', count(*) filter (where n.status = 'open'),
                 'confirmed', count(*) filter (where n.status = 'confirmed'),
                 'rejected', count(*) filter (where n.status = 'rejected'))
               from public.noshow_reports n join public.profiles p on p.id = n.reported_id
               where n.created_at >= since and (c is null or p.campus_id = c)),
    'people', coalesce((select jsonb_agg(x.j order by x.cnt desc, x.reports desc, x.last_at desc) from (
        select private.person_brief(p.id) || jsonb_build_object(
                 'status', p.status, 'noshow_count', p.noshow_count,
                 'reports_open', count(n.id) filter (where n.status = 'open'),
                 'reports_confirmed', count(n.id) filter (where n.status = 'confirmed'),
                 'last_at', max(n.created_at)) as j,
               p.noshow_count as cnt, count(n.id) as reports, max(n.created_at) as last_at
        from public.profiles p
        left join public.noshow_reports n on n.reported_id = p.id and n.created_at >= since
        where (c is null or p.campus_id = c)
        group by p.id
        having p.noshow_count > 0 or count(n.id) > 0
        order by p.noshow_count desc, count(n.id) desc limit 50) x), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Ratings: totals, people rated down most (3+ ratings and under 70% up),
-- and the latest 20 thumbs-down.
create or replace function public.admin_ratings_summary(campus_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_ratings_summary.campus_id);
  c uuid := private.admin_campus(a, admin_ratings_summary.campus_id);
begin
  return jsonb_build_object(
    'totals', (select jsonb_build_object('up', count(*) filter (where r.thumbs_up), 'down', count(*) filter (where not r.thumbs_up))
               from public.ratings r join public.profiles p on p.id = r.ratee_id where c is null or p.campus_id = c),
    'low_rated', coalesce((select jsonb_agg(x.j order by x.pct, x.total desc) from (
        select private.person_brief(p.id) || jsonb_build_object(
                 'status', p.status, 'up', count(*) filter (where r.thumbs_up), 'down', count(*) filter (where not r.thumbs_up),
                 'total', count(*), 'pct_up', private.pct(count(*) filter (where r.thumbs_up), count(*))) as j,
               private.pct(count(*) filter (where r.thumbs_up), count(*)) as pct, count(*) as total
        from public.ratings r join public.profiles p on p.id = r.ratee_id
        where c is null or p.campus_id = c
        group by p.id
        having count(*) >= 3 and private.pct(count(*) filter (where r.thumbs_up), count(*)) < 70
        order by 2, 3 desc limit 50) x), '[]'::jsonb),
    'recent_down', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'rater', private.person_brief(r.rater_id),
        'ratee', private.person_brief(r.ratee_id), 'tags', r.tags, 'comment', r.comment, 'chat_id', r.chat_id,
        'created_at', r.created_at) order by r.created_at desc)
      from (select x.* from public.ratings x join public.profiles p on p.id = x.ratee_id
            where not x.thumbs_up and (c is null or p.campus_id = c) order by x.created_at desc limit 20) r), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Under-18 attempts per campus and day (hashes are never returned).
create or replace function public.admin_age_blocks_summary(campus_id uuid default null, days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_age_blocks_summary.campus_id);
  c uuid := private.admin_campus(a, admin_age_blocks_summary.campus_id);
  since timestamptz := private.now() - make_interval(days => least(greatest(coalesce(admin_age_blocks_summary.days, 30), 1), 365));
begin
  return jsonb_build_object(
    'total', (select count(*)::int from public.age_blocks b where b.created_at >= since and (c is null or b.campus_id = c)),
    'all_time', (select count(*)::int from public.age_blocks b where c is null or b.campus_id = c),
    'by_campus', coalesce((select jsonb_agg(jsonb_build_object('campus', private.campus_brief(x.campus_id), 'n', x.n) order by x.n desc)
      from (select b.campus_id, count(*)::int as n from public.age_blocks b
            where b.created_at >= since and (c is null or b.campus_id = c) group by b.campus_id) x), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', x.day, 'campus_id', x.campus_id, 'n', x.n) order by x.day desc, x.campus_id)
      from (select (b.created_at at time zone coalesce(cp.timezone, 'America/New_York'))::date as day, b.campus_id, count(*)::int as n
            from public.age_blocks b left join public.campuses cp on cp.id = b.campus_id
            where b.created_at >= since and (c is null or b.campus_id = c) group by 1, 2) x), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletions and data exports (owner). A deletion still 'started'
-- after an hour is shown as stuck (the Edge Function failed part way).
create or replace function public.admin_list_deletions_exports(cursor int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  off int := greatest(coalesce(admin_list_deletions_exports.cursor, 0), 0);
  now_at timestamptz := private.now();
begin
  return jsonb_build_object(
    'counts', jsonb_build_object(
      'deletions_30d', (select count(*)::int from public.account_deletions d where d.status = 'done' and d.finished_at >= now_at - interval '30 days'),
      'underage_30d', (select count(*)::int from public.account_deletions d where d.underage and d.started_at >= now_at - interval '30 days'),
      'stuck', (select count(*)::int from public.account_deletions d where d.status = 'started' and d.started_at < now_at - interval '1 hour'),
      'exports_30d', (select count(*)::int from public.data_exports e where e.created_at >= now_at - interval '30 days'),
      'exports_failed_30d', (select count(*)::int from public.data_exports e where e.status = 'failed' and e.created_at >= now_at - interval '30 days')),
    'deletions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'user_id', d.user_id,
        'person', private.person_brief(d.user_id), 'campus', private.campus_brief(d.campus_id), 'underage', d.underage,
        'status', d.status, 'stuck', d.status = 'started' and d.started_at < now_at - interval '1 hour',
        'started_at', d.started_at, 'finished_at', d.finished_at) order by d.started_at desc)
      from (select * from public.account_deletions x order by x.started_at desc offset off limit 50) d), '[]'::jsonb),
    'exports', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'person', private.person_brief(e.user_id),
        'status', e.status, 'created_at', e.created_at, 'expires_at', e.expires_at) order by e.created_at desc)
      from (select * from public.data_exports x order by x.created_at desc offset off limit 50) e), '[]'::jsonb),
    'next_cursor', off + 50);
end;
$$;

-- ---------------------------------------------------------------------------
-- System health (owner).
create or replace function public.admin_system_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.admins := private.require_admin('owner');
  now_at timestamptz := private.now();
  cron_jobs jsonb := '[]'::jsonb;
begin
  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
          'jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
          'last_run', (select jsonb_build_object('status', d.status, 'start_time', d.start_time, 'end_time', d.end_time,
                                                 'message', left(d.return_message, 200))
                       from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc nulls last limit 1),
          'failures_24h', (select count(*)::int from cron.job_run_details d
                           where d.jobid = j.jobid and d.status = 'failed' and d.start_time >= $1 - interval '24 hours'))
          order by j.jobname), '[]'::jsonb)
      from cron.job j
    $q$ into cron_jobs using now_at;
  end if;

  return jsonb_build_object(
    'generated_at', now_at,
    'email', jsonb_build_object(
      'pending', (select count(*)::int from public.email_outbox e where e.state in ('pending', 'sending')),
      'oldest_pending_at', (select min(e.send_after) from public.email_outbox e where e.state = 'pending'),
      'sent_24h', (select count(*)::int from public.email_outbox e where e.state = 'sent' and e.sent_at >= now_at - interval '24 hours'),
      'failed_24h', (select count(*)::int from public.email_outbox e where e.state = 'failed' and e.send_after >= now_at - interval '24 hours'),
      'failed_total', (select count(*)::int from public.email_outbox e where e.state = 'failed'),
      'recent_errors', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'template', e.template,
          'to', private.mask_email(e.to_email), 'state', e.state, 'attempts', e.attempts, 'error', e.error, 'at', e.send_after)
          order by e.id desc)
        from (select * from public.email_outbox x where x.error is not null order by x.id desc limit 10) e), '[]'::jsonb)),
    'push', jsonb_build_object(
      'tickets_24h', (select count(*)::int from public.push_tickets t where t.created_at >= now_at - interval '24 hours'),
      'errors_24h', (select count(*)::int from public.push_tickets t
                     where t.created_at >= now_at - interval '24 hours' and (t.error is not null or t.status = 'error')),
      'pending', (select count(*)::int from public.notifications n where n.push_state = 'pending' and n.push_after <= now_at),
      'recent_errors', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'status', t.status, 'error', left(t.error, 200),
          'at', t.created_at) order by t.id desc)
        from (select * from public.push_tickets x where x.error is not null or x.status = 'error' order by x.id desc limit 10) t), '[]'::jsonb)),
    'cron', cron_jobs,
    'storage', jsonb_build_object(
      'db_bytes', pg_catalog.pg_database_size(current_database()),
      'db_limit_bytes', 524288000,
      'tables', coalesce((select jsonb_agg(jsonb_build_object('name', t.relname, 'bytes', t.bytes, 'rows_estimate', t.est)
                                           order by t.bytes desc)
        from (select c.relname::text as relname, pg_catalog.pg_total_relation_size(c.oid) as bytes, c.reltuples::bigint as est
              from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind in ('r', 'm')
              order by pg_catalog.pg_total_relation_size(c.oid) desc limit 12) t), '[]'::jsonb)),
    'reports', jsonb_build_object(
      'open', (select count(*)::int from public.reports r where r.status = 'open'),
      'oldest_open_at', (select min(r.created_at) from public.reports r where r.status = 'open')),
    'deletions_stuck', (select count(*)::int from public.account_deletions d
                        where d.status = 'started' and d.started_at < now_at - interval '1 hour'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Alert: the report queue is older than 4 hours. Every 30 minutes; one email
-- per owner at most once per 4 hours. Returns the number queued.
create or replace function private.report_queue_check()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  oldest timestamptz;
  open_n int;
  owner_email text;
  n int := 0;
  slot text := to_char(private.now() at time zone 'UTC', 'YYYYMMDDHH24MI');
begin
  select min(r.created_at), count(*)::int into oldest, open_n from public.reports r where r.status = 'open';
  if oldest is null or oldest > private.now() - interval '4 hours' then
    return 0;
  end if;
  if exists (select 1 from public.email_outbox e
             where e.template = 'report_queue' and e.send_after > private.now() - interval '4 hours') then
    return 0;
  end if;
  for owner_email in
    select u.email from public.admins a join auth.users u on u.id = a.user_id
    where a.role = 'owner' and u.email is not null
  loop
    if private.queue_email(owner_email, 'report_queue',
         jsonb_build_object('open', open_n, 'oldest_hours', floor(extract(epoch from private.now() - oldest) / 3600)::int),
         'report_queue:' || slot || ':' || owner_email) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('report_queue_check', '*/30 * * * *', 'select private.report_queue_check()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- App Review accounts (owner). The before_user_created hook lets these
-- addresses in; demo_autoplay treats a note containing "reviewer" as the
-- reviewer (the other Demo University accounts are the bots).
create or replace function public.admin_list_review_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.admins := private.require_admin('owner');
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'email', r.email, 'note', r.note, 'user_id', u.id, 'has_account', u.id is not null,
      'last_sign_in_at', u.last_sign_in_at, 'campus', private.campus_brief(p.campus_id)) order by r.email)
    from public.review_accounts r
    left join auth.users u on lower(u.email) = lower(r.email)
    left join public.profiles p on p.id = u.id), '[]'::jsonb);
end;
$$;

create or replace function public.admin_upsert_review_account(email text, note text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_upsert_review_account.reason);
  e text := lower(btrim(coalesce(admin_upsert_review_account.email, '')));
  prev text;
begin
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(e) > 254 then
    perform private.raise('INVALID', 'email');
  end if;
  if char_length(coalesce(admin_upsert_review_account.note, '')) > 200 then
    perform private.raise('INVALID', 'note');
  end if;
  select r.note into prev from public.review_accounts r where r.email = e;
  insert into public.review_accounts (email, note) values (e, nullif(btrim(coalesce(admin_upsert_review_account.note, '')), ''))
  on conflict (email) do update set note = excluded.note;
  perform private.audit(a.user_id, 'review_account.upsert', 'review_account', e, null, why,
    jsonb_build_object('note', admin_upsert_review_account.note, 'previous_note', prev));
end;
$$;

create or replace function public.admin_delete_review_account(email text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_delete_review_account.reason);
  e text := lower(btrim(coalesce(admin_delete_review_account.email, '')));
begin
  delete from public.review_accounts r where r.email = e;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.audit(a.user_id, 'review_account.delete', 'review_account', e, null, why);
end;
$$;

-- ---------------------------------------------------------------------------
-- Bulk listing status (spam waves). status: removed (winds down offers and
-- chats), held_review (from active or hold) or active (from held_review or
-- removed). Up to 200 ids; a moderator only on their campus. Listings that
-- can't take the change are skipped. One audit row with the ids.
create or replace function public.admin_bulk_set_listing_status(ids uuid[], status text, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  why text := private.need_reason(admin_bulk_set_listing_status.reason);
  st text := admin_bulk_set_listing_status.status;
  wanted uuid[] := array(select distinct x from unnest(coalesce(admin_bulk_set_listing_status.ids, '{}')) x where x is not null);
  l public.listings;
  changed uuid[] := '{}';
  skipped uuid[] := '{}';
begin
  if cardinality(wanted) = 0 or cardinality(wanted) > 200 then
    perform private.raise('INVALID', 'ids');
  end if;
  if st is null or st not in ('removed', 'held_review', 'active') then
    perform private.raise('INVALID', 'status');
  end if;
  if a.campus_id is not null and exists (select 1 from public.listings x where x.id = any (wanted) and x.campus_id <> a.campus_id) then
    perform private.raise('NOT_ADMIN');
  end if;

  for l in select * from public.listings x where x.id = any (wanted) order by x.id for update loop
    if (st = 'removed' and l.status not in ('deleted', 'removed'))
       or (st = 'held_review' and l.status in ('active', 'hold'))
       or (st = 'active' and l.status in ('held_review', 'removed')) then
      update public.listings x set status = st::public.listing_status,
             bumped_at = case when st = 'active' then private.now() else x.bumped_at end,
             updated_at = private.now()
       where x.id = l.id;
      if st = 'removed' then
        perform private.wind_down_listing(l.id, 'This listing was removed', null);
      end if;
      changed := changed || l.id;
    else
      skipped := skipped || l.id;
    end if;
  end loop;
  skipped := skipped || array(select x from unnest(wanted) x where x <> all (changed) and x <> all (skipped));

  perform private.audit(a.user_id, 'listing.bulk_' || st, 'listing', null, a.campus_id, why,
    jsonb_build_object('ids', to_jsonb(changed), 'skipped', to_jsonb(skipped), 'count', cardinality(changed)));
  return jsonb_build_object('changed', cardinality(changed), 'changed_ids', to_jsonb(changed), 'skipped_ids', to_jsonb(skipped));
end;
$$;

-- ---------------------------------------------------------------------------
-- Banned email hashes (owner). Added by email (hashed here, never stored
-- plain); shown as hashes with the matching account if one still exists.
create or replace function public.admin_list_banned_hashes(cursor int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  off int := greatest(coalesce(admin_list_banned_hashes.cursor, 0), 0);
  items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('email_hash', b.email_hash, 'created_at', b.created_at,
      'person', (select private.person_brief(p.id) || jsonb_build_object('status', p.status)
                 from public.profiles p where p.email_hash = b.email_hash limit 1)) order by b.created_at desc), '[]'::jsonb)
    into items
  from (select * from public.banned_hashes x order by x.created_at desc nulls last offset off limit 50) b;
  return jsonb_build_object('items', items, 'total', (select count(*)::int from public.banned_hashes),
    'next_cursor', case when jsonb_array_length(items) = 50 then off + 50 end);
end;
$$;

create or replace function public.admin_upsert_banned_hash(email text, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_upsert_banned_hash.reason);
  e text := lower(btrim(coalesce(admin_upsert_banned_hash.email, '')));
  h text;
  added int;
begin
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(e) > 254 then
    perform private.raise('INVALID', 'email');
  end if;
  h := private.email_hash(e);
  insert into public.banned_hashes (email_hash, created_at) values (h, private.now()) on conflict do nothing;
  get diagnostics added = row_count;
  perform private.audit(a.user_id, 'banned_hash.add', 'banned_hash', h, null, why, jsonb_build_object('new', added > 0));
  return jsonb_build_object('email_hash', h, 'added', added > 0);
end;
$$;

create or replace function public.admin_delete_banned_hash(email_hash text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_delete_banned_hash.reason);
begin
  delete from public.banned_hashes b where b.email_hash = admin_delete_banned_hash.email_hash;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.audit(a.user_id, 'banned_hash.delete', 'banned_hash', admin_delete_banned_hash.email_hash, null, why);
end;
$$;

-- ---------------------------------------------------------------------------
-- Categories (owner): rename, reorder, move under a parent, or add (slug
-- needed for a new one; an existing slug never changes, the app keys icons on
-- it). Hiding is not offered yet: the app reads categories directly.
create or replace function public.admin_upsert_category(id smallint, name text, sort smallint, reason text,
                                                        slug text default null, parent_id smallint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_upsert_category.reason);
  nm text := btrim(coalesce(admin_upsert_category.name, ''));
  prev public.categories;
  res public.categories;
begin
  if admin_upsert_category.id is null or admin_upsert_category.id < 1 then
    perform private.raise('INVALID', 'id');
  end if;
  if char_length(nm) < 2 or char_length(nm) > 40 then
    perform private.raise('INVALID', 'name');
  end if;
  if admin_upsert_category.parent_id is not null and (admin_upsert_category.parent_id = admin_upsert_category.id
     or not exists (select 1 from public.categories x where x.id = admin_upsert_category.parent_id)) then
    perform private.raise('INVALID', 'parent_id');
  end if;
  select * into prev from public.categories x where x.id = admin_upsert_category.id for update;
  if prev.id is null then
    if coalesce(admin_upsert_category.slug, '') !~ '^[a-z0-9-]{2,40}$'
       or exists (select 1 from public.categories x where x.slug = admin_upsert_category.slug) then
      perform private.raise('INVALID', 'slug');
    end if;
    insert into public.categories (id, slug, name, parent_id, sort)
    values (admin_upsert_category.id, admin_upsert_category.slug, nm, admin_upsert_category.parent_id,
            coalesce(admin_upsert_category.sort, 0))
    returning * into res;
  else
    update public.categories x
       set name = nm, sort = coalesce(admin_upsert_category.sort, x.sort), parent_id = admin_upsert_category.parent_id
     where x.id = prev.id
    returning * into res;
  end if;
  perform private.audit(a.user_id, case when prev.id is null then 'category.create' else 'category.update' end,
    'category', res.id::text, null, why,
    jsonb_build_object('old', case when prev.id is null then null else to_jsonb(prev) end, 'new', to_jsonb(res)));
  return to_jsonb(res);
end;
$$;

-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'private.age_blocks_bi()', 'private.profiles_ad_deletion()', 'private.prune_activity()',
    'private.support_json(public.support_requests, public.admins, boolean)', 'private.report_queue_check()',
    'private.prepare_account_deletion(uuid, boolean)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['private.prune_activity()', 'private.report_queue_check()', 'private.prepare_account_deletion(uuid, boolean)']
  loop
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.admin_list_support(text, uuid, int)', 'public.admin_support_detail(uuid)',
    'public.admin_update_support(uuid, text, text, text, text)', 'public.admin_waitlist_demand()',
    'public.admin_open_campus(uuid, text)', 'public.admin_create_campus(text, text, text, text, text, text, jsonb, text)',
    'public.admin_list_meetups(uuid, text, int)', 'public.admin_noshow_summary(uuid)', 'public.admin_ratings_summary(uuid)',
    'public.admin_age_blocks_summary(uuid, int)', 'public.admin_list_deletions_exports(int)', 'public.admin_system_health()',
    'public.admin_list_review_accounts()', 'public.admin_upsert_review_account(text, text, text)',
    'public.admin_delete_review_account(text, text)', 'public.admin_bulk_set_listing_status(uuid[], text, text)',
    'public.admin_list_banned_hashes(int)', 'public.admin_upsert_banned_hash(text, text)',
    'public.admin_delete_banned_hash(text, text)',
    'public.admin_upsert_category(smallint, text, smallint, text, text, smallint)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
