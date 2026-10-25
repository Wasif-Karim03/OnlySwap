-- DEC 152 (owner, 2026-10-24): automatic photo screening (Apple 1.2: "a method
-- for filtering objectionable material from being posted").
--
-- Every new listing photo, Quad photo and profile photo joins a queue. The
-- scan_photos job (every minute) calls the scan-photos Edge Function, which
-- asks a vision model (Cloudflare Workers AI, free daily allowance) whether
-- the photo shows nudity or sexual content, a sexualized minor, gore or
-- graphic violence, weapons, drugs or hate symbols. A flagged photo:
--   * listing  -> status held_review (off Discover, Feed and search)
--   * quad     -> status held
--   * avatar   -> removed from the profile
-- and files a system report (no reporter) so moderators see it with the
-- reason and the photo key. Photos stay visible while they wait (about a
-- minute); a scan that keeps failing is left for moderators, never blocks
-- posting. CSAM matching is separate (Cloudflare CSAM Scanning Tool, DEC 137).

create table private.photo_scans (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('listing', 'quad', 'avatar')),
  target_id uuid not null,
  path text not null,
  status text not null default 'pending' check (status in ('pending', 'scanning', 'ok', 'flagged', 'failed')),
  attempts smallint not null default 0,
  reason text,
  claimed_at timestamptz,
  scanned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, path)
);
create index on private.photo_scans (status, id);
alter table private.photo_scans enable row level security;
revoke all on private.photo_scans from public, anon, authenticated;

-- Queue -------------------------------------------------------------------------------------------
create or replace function private.queue_photo_scan(p_kind text, p_target uuid, p_path text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.photo_scans (kind, target_id, path, created_at)
  select p_kind, p_target, p_path, private.now()
  where p_path is not null and btrim(p_path) <> ''
  on conflict (kind, path) do nothing;
$$;

create or replace function private.trg_scan_listing_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.queue_photo_scan('listing', new.listing_id, new.path);
  return new;
end;
$$;
create trigger trg_scan_listing_photo
  after insert on public.listing_photos
  for each row execute function private.trg_scan_listing_photo();

create or replace function private.trg_scan_quad_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_path is not null and (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path) then
    perform private.queue_photo_scan('quad', new.id, new.photo_path);
  end if;
  return new;
end;
$$;
create trigger trg_scan_quad_photo
  after insert or update of photo_path on public.quad_posts
  for each row execute function private.trg_scan_quad_photo();

create or replace function private.trg_scan_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.avatar_path is not null and new.avatar_path is distinct from old.avatar_path then
    perform private.queue_photo_scan('avatar', new.id, new.avatar_path);
  end if;
  return new;
end;
$$;
create trigger trg_scan_avatar
  after update of avatar_path on public.profiles
  for each row execute function private.trg_scan_avatar();

-- Worker side (scan-photos Edge Function, service key) --------------------------------------------
-- Claims up to n photos: new ones, and ones a crashed run left in scanning
-- for 10 minutes. Three tries, then 'failed' (moderators can look).
create or replace function private.claim_photo_scans(n int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  out_ jsonb;
begin
  update private.photo_scans s set status = 'failed'
   where s.status in ('pending', 'scanning') and s.attempts >= 3
     and (s.status = 'pending' or s.claimed_at < private.now() - interval '10 minutes');
  with picked as (
    select s.id from private.photo_scans s
     where (s.status = 'pending' or (s.status = 'scanning' and s.claimed_at < private.now() - interval '10 minutes'))
       and s.attempts < 3
     order by s.id
     limit greatest(1, least(coalesce(n, 10), 50))
     for update skip locked
  ), claimed as (
    update private.photo_scans s
       set status = 'scanning', attempts = s.attempts + 1, claimed_at = private.now()
      from picked where s.id = picked.id
    returning s.id, s.kind, s.target_id, s.path
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'target_id', target_id, 'path', path)
                            order by id), '[]')
    into out_ from claimed;
  return out_;
end;
$$;

-- Records one result. verdict: 'ok' | 'flag' | 'retry'. reason (flag): one of
-- sexual, minor, violence, weapon, drugs, hate, other.
create or replace function private.finish_photo_scan(p_id bigint, p_verdict text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s private.photo_scans;
  campus uuid;
  owner_ uuid;
  why text := case when p_reason in ('sexual', 'minor', 'violence', 'weapon', 'drugs', 'hate') then p_reason else 'other' end;
  report_reason text;
begin
  select * into s from private.photo_scans x where x.id = p_id for update;
  if not found or s.status <> 'scanning' then
    return;
  end if;
  if p_verdict = 'retry' then
    update private.photo_scans x set status = 'pending' where x.id = s.id;
    return;
  end if;
  if p_verdict <> 'flag' then
    update private.photo_scans x set status = 'ok', scanned_at = private.now() where x.id = s.id;
    return;
  end if;

  update private.photo_scans x set status = 'flagged', reason = why, scanned_at = private.now() where x.id = s.id;
  report_reason := case why when 'sexual' then 'sexual' when 'minor' then 'minor_safety'
                            when 'violence' then 'threat' when 'hate' then 'hate' else 'not_allowed' end;

  if s.kind = 'listing' then
    update public.listings l set status = 'held_review', updated_at = private.now()
     where l.id = s.target_id and l.status in ('active', 'hold')
    returning l.campus_id, l.seller_id into campus, owner_;
    if campus is null then
      select l.campus_id, l.seller_id into campus, owner_ from public.listings l where l.id = s.target_id;
    end if;
    if campus is not null then
      insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, priority)
      values (campus, null, 'listing', s.target_id::text, owner_, report_reason,
              'Automatic photo check: ' || why, jsonb_build_object('photo_keys', jsonb_build_array(s.path)),
              case when why = 'minor' then 1 else 2 end);
    end if;
  elsif s.kind = 'quad' then
    update public.quad_posts q set status = 'held', hold_reason = 'photo:' || why
     where q.id = s.target_id and q.status = 'live'
    returning q.campus_id into campus;
    if campus is null then
      select q.campus_id into campus from public.quad_posts q where q.id = s.target_id;
    end if;
    if campus is not null then
      insert into public.reports (campus_id, reporter_id, target_type, target_id, reason, details, evidence, priority)
      values (campus, null, 'quad_post', s.target_id::text, report_reason,
              'Automatic photo check: ' || why, jsonb_build_object('photo_keys', jsonb_build_array(s.path)),
              case when why = 'minor' then 1 else 2 end);
    end if;
  else
    update public.profiles p set avatar_path = null
     where p.id = s.target_id and p.avatar_path = s.path
    returning p.campus_id into campus;
    if campus is not null then
      insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, priority)
      values (campus, null, 'user', s.target_id::text, s.target_id, report_reason,
              'Automatic photo check (profile photo removed): ' || why,
              jsonb_build_object('photo_keys', jsonb_build_array(s.path)),
              case when why = 'minor' then 1 else 2 end);
    end if;
  end if;
end;
$$;

-- Job ---------------------------------------------------------------------------------------------
create or replace function private.scan_photos()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.photo_scans where status = 'pending' and attempts < 3) then
    return private.call_function('scan-photos');
  end if;
  return null;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'scan_photos') then
    perform cron.unschedule('scan_photos');
  end if;
  perform cron.schedule('scan_photos', '* * * * *', 'select private.scan_photos()');
end;
$$;

revoke all on function private.queue_photo_scan(text, uuid, text) from public, anon, authenticated;
revoke all on function private.trg_scan_listing_photo() from public, anon, authenticated;
revoke all on function private.trg_scan_quad_photo() from public, anon, authenticated;
revoke all on function private.trg_scan_avatar() from public, anon, authenticated;
revoke all on function private.claim_photo_scans(int) from public, anon, authenticated;
revoke all on function private.finish_photo_scan(bigint, text, text) from public, anon, authenticated;
revoke all on function private.scan_photos() from public, anon, authenticated;
grant execute on function private.claim_photo_scans(int) to service_role;
grant execute on function private.finish_photo_scan(bigint, text, text) to service_role;
