-- Removes the Ohio Wesleyan MOCK data and the mock seller bot (DEC 92).
-- STAGING ONLY. Run with: bash scripts/deploy/mock-data.command owu --remove
-- Safe to run again.
--
-- What it touches: only mock rows (users b0000000-..., listings b1000000-...,
-- the console read public.admin_mock_status,
-- schema mock, cron job mock_bot, domain mock.onlyswap.test).
--
-- Real people's deal data is never deleted or changed. A mock user with deal
-- data shared with a real person (an offer, a chat, a rating, a report, a
-- block, a no-show report or an invite) is KEPT and only switched off
-- (status suspended): deleting it would cascade into that person's rows
-- (FKs set null, open chats closed with a system message by
-- trg_profiles_deleting, pending offers withdrawn). The same goes for a mock
-- listing a real person made an offer on, chatted about, or answered with
-- "I have this": it is soft-deleted (status deleted, like delete_listing, but
-- without the wind-down, so the person's chat and offer stay exactly as they
-- are) instead of deleted, because a delete would null their offer's,
-- chat's or listing's reference to it.
-- One exception, on purpose: saves, swipes and watches of mock listings that
-- are deleted go with them (FK on delete cascade). They only point at mock data.

do $$
begin
  if current_setting('app.env', true) = 'prod' then
    raise exception 'mock data must never run on production';
  end if;
end;
$$;

-- 1. Stop the bot.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mock_bot') then
    perform cron.unschedule('mock_bot');
  end if;
end;
$$;
-- The console's Staging tools read (admin_mock_status) goes with the bot.
drop function if exists public.admin_mock_status();
drop schema if exists mock cascade;

-- 2. Listings and users.
do $$
declare
  keep_l uuid[];
  keep_u uuid[];
begin
  -- Mock listings a real person has deal data on.
  select coalesce(array_agg(l.id), '{}') into keep_l
  from public.listings l
  where (l.id::text like 'b1000000-%' or l.seller_id::text like 'b0000000-%')
    and (
      exists (select 1 from public.offers o
              where o.listing_id = l.id and (o.buyer_id is null or o.buyer_id::text not like 'b0000000-%'))
      or exists (select 1 from public.chats c
                 where c.listing_id = l.id and (c.buyer_id is null or c.buyer_id::text not like 'b0000000-%'))
      or exists (select 1 from public.listings r
                 where r.wanted_ref = l.id and (r.seller_id is null or r.seller_id::text not like 'b0000000-%'))
    );

  -- Mock users who share anything with a real person.
  select coalesce(array_agg(p.id), '{}') into keep_u
  from public.profiles p
  where p.id::text like 'b0000000-%'
    and (
      exists (select 1 from public.listings l where l.seller_id = p.id and l.id = any (keep_l))
      or exists (select 1 from public.offers o
                 where (o.buyer_id = p.id and (o.seller_id is null or o.seller_id::text not like 'b0000000-%'))
                    or (o.seller_id = p.id and (o.buyer_id is null or o.buyer_id::text not like 'b0000000-%')))
      or exists (select 1 from public.chats c
                 where (c.buyer_id = p.id and (c.seller_id is null or c.seller_id::text not like 'b0000000-%'))
                    or (c.seller_id = p.id and (c.buyer_id is null or c.buyer_id::text not like 'b0000000-%')))
      or exists (select 1 from public.ratings r where r.rater_id = p.id or r.ratee_id = p.id)
      or exists (select 1 from public.reports r where r.reporter_id = p.id or r.target_user_id = p.id)
      or exists (select 1 from public.blocks b where b.blocker_id = p.id or b.blocked_id = p.id)
      or exists (select 1 from public.noshow_reports r where r.reporter_id = p.id or r.reported_id = p.id)
      or exists (select 1 from public.profiles q where q.invited_by = p.id)
    );

  -- Kept listings: soft delete, no wind-down.
  update public.listings l
     set status = 'deleted', deleted_at = coalesce(l.deleted_at, now()), updated_at = now()
   where l.id = any (keep_l) and l.status <> 'deleted';

  -- Everything else that is mock goes (photos, swipes, saves, watches cascade).
  delete from public.listings l
   where (l.id::text like 'b1000000-%' or l.seller_id::text like 'b0000000-%')
     and not (l.id = any (keep_l));

  -- Kept users: switched off, no founding seller slot.
  update public.profiles p
     set status = 'suspended', status_reason = 'staging mock data removed', founding_seller_until = null
   where p.id = any (keep_u);

  -- Activity and rate-limit rows (no FKs) so the metrics forget the bots.
  delete from public.activity_days a where a.user_id::text like 'b0000000-%';
  delete from public.rate_counters r where r.user_id::text like 'b0000000-%';

  -- The other mock accounts: auth.users cascades to auth.identities and the
  -- profile (and from there to their notifications, prefs and listings).
  delete from auth.users u
   where u.id::text like 'b0000000-%' and not (u.id = any (keep_u));
end;
$$;

-- 3. The test domain (kept users keep their profile; nobody can sign up with it).
delete from public.campus_domains where domain = 'mock.onlyswap.test';

-- Summary. MOCK_PHOTOS_IN_USE tells the command whether the R2 photos can go
-- (they stay while a kept listing or a real person's chat snapshot uses them).
select
  (select count(*) from public.profiles p where p.id::text like 'b0000000-%') as mock_users_kept,
  (select count(*) from public.listings l where l.id::text like 'b1000000-%') as mock_listings_kept_soft_deleted,
  (select count(*) from cron.job j where j.jobname = 'mock_bot') as bot_jobs,
  (select count(*) from pg_namespace n where n.nspname = 'mock') as mock_schema,
  'MOCK_PHOTOS_IN_USE=' || (
    (select count(*) from public.listing_photos ph where ph.path like 'c/mock/%')
    + (select count(*) from public.chats c where c.listing_thumb_path like 'c/mock/%')) as photos;
