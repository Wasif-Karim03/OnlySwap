-- 0017_sell_post.sql (S17: P5-SELL-05, P5-SELL-07)
--   set_listing_share_image: the seller records the share card uploaded to
--     share/{listing}.jpg (DATA_MODEL §6), so /l/{id} can show it (DEC 55).
--   private.prune + the `prune` cron job (API §6): used reservations older
--     than 24 h are forgotten; orphan ones (no listing was ever posted) go to
--     the cleanup-drafts function, which deletes their photo folder in R2 and
--     then forgets them (DATA_MODEL §6 cleanup, P5-SELL-07).

-- ---------------------------------------------------------------------------
create or replace function public.set_listing_share_image(id uuid)
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
  select * into l from public.listings x where x.id = set_listing_share_image.id for update;
  if not found or l.seller_id is distinct from me.id or l.status = 'deleted' then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.hit('set_listing_share_image', 30, interval '1 day');
  update public.listings x set share_image_path = 'share/' || l.id || '.jpg' where x.id = l.id;
  return jsonb_build_object('share_image_path', 'share/' || l.id || '.jpg');
end;
$$;

-- ---------------------------------------------------------------------------
-- Orphan draft reservations: never posted and older than 24 h. The photo
-- folder sits under the campus the seller had then; a deleted account has no
-- profile, so every campus prefix is returned and the function tries each.
create or replace function private.stale_draft_reservations(p_limit int default 200)
returns table (id uuid, campus_ids uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         coalesce(
           (select array[p.campus_id] from public.profiles p where p.id = r.user_id),
           (select coalesce(array_agg(c.id order by c.id), '{}') from public.campuses c))
  from public.listing_reservations r
  where r.used_at is null
    and r.created_at < private.now() - interval '24 hours'
    and not exists (select 1 from public.listings l where l.id = r.id)
  order by r.created_at
  limit greatest(1, least(coalesce(p_limit, 200), 1000))
$$;

-- Called by cleanup-drafts once the folders are gone. Only orphan rows go.
create or replace function private.forget_reservations(p_ids uuid[])
returns int
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from public.listing_reservations r
    where r.id = any (coalesce(p_ids, '{}'))
      and r.used_at is null
      and not exists (select 1 from public.listings l where l.id = r.id)
    returning 1)
  select count(*)::int from gone
$$;

-- Daily prune (API §6 `prune`). Retention rules for other tables join this
-- function in S29 (P9-CRON-01). Calls the function only when there is work
-- (ARC-05 exists-guard). Returns the pg_net request id, or null.
create or replace function private.prune()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  request_id bigint;
begin
  delete from public.listing_reservations r
  where r.used_at is not null and r.created_at < private.now() - interval '24 hours';

  if not exists (select 1 from private.stale_draft_reservations(1)) then
    return null;
  end if;
  -- Not configured (a fresh local database): nothing to call, and a cron run must not fail.
  if not exists (select 1 from vault.decrypted_secrets where name = 'functions_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'service_role_key') then
    return null;
  end if;
  base_url := rtrim(private.secret('functions_url'), '/');
  select net.http_post(
    url := base_url || '/cleanup-drafts',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || private.secret('service_role_key')),
    body := '{}'::jsonb
  ) into request_id;
  return request_id;
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune') then
    perform cron.unschedule('prune');
  end if;
  perform cron.schedule('prune', '30 9 * * *', 'select private.prune()');
end;
$$;

-- ---------------------------------------------------------------------------
revoke all on function public.set_listing_share_image(uuid) from public, anon;
grant execute on function public.set_listing_share_image(uuid) to authenticated;
revoke all on function private.stale_draft_reservations(int) from public, anon, authenticated;
revoke all on function private.forget_reservations(uuid[]) from public, anon, authenticated;
revoke all on function private.prune() from public, anon, authenticated;
grant execute on function private.stale_draft_reservations(int) to service_role;
grant execute on function private.forget_reservations(uuid[]) to service_role;
