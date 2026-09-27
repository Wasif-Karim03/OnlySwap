-- 0008_rls_grants.sql (P3-DB-08; DATA_MODEL §3, TESTING §2.1)
-- Row-level security policies and the only direct table privileges the API
-- roles get. Everything else stays deny-all (RLS on, no grant, 0001-0006).
-- Writes go through security definer RPCs; the one direct write is the three
-- preference columns on the caller's own profile.
-- anon gets no table privileges at all (T-SEC-19); its reads are RPCs.

-- ---------------------------------------------------------------------------
-- Policy helpers (stable, security definer so they can read past RLS).

-- The caller's campus: the access-token claim when present (ADR-013: claims
-- for reads), else the live profile.
create or replace function private.my_campus()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'campus_id', '')::uuid,
    (select p.campus_id from public.profiles p where p.id = auth.uid())
  )
$$;

create or replace function private.is_chat_participant(p_chat uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat and auth.uid() in (c.buyer_id, c.seller_id)
  )
$$;

-- Public app_config keys (DATA_MODEL §2.1).
create or replace function private.is_public_config_key(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_key in ('maintenance','min_version_ios','min_version_android','rules_version',
                   'quad_enabled','chat_photos_enabled')
$$;

revoke all on function private.my_campus() from public, anon, authenticated;
revoke all on function private.is_chat_participant(uuid) from public, anon, authenticated;
revoke all on function private.is_public_config_key(text) from public, anon, authenticated;
grant execute on function private.my_campus() to service_role;
grant execute on function private.is_chat_participant(uuid) to service_role;
grant execute on function private.is_public_config_key(text) to service_role;

-- Policies call private helpers while running as the querying role, so the
-- API roles need USAGE on the schema and EXECUTE on these three helpers and on
-- the helpers from 0007 that policies use (is_blocked, is_admin, admin_rank, now). Every other private function stays closed.
grant usage on schema private to authenticated;
grant execute on function private.my_campus() to authenticated;
grant execute on function private.is_chat_participant(uuid) to authenticated;
grant execute on function private.is_public_config_key(text) to authenticated;
grant execute on function private.is_blocked(uuid, uuid) to authenticated;
grant execute on function private.is_admin(public.admin_role) to authenticated;
grant execute on function private.admin_rank(public.admin_role) to authenticated;
grant execute on function private.now() to authenticated;

-- ---------------------------------------------------------------------------
-- Campus and identity

create policy campuses_select_own on public.campuses
  for select to authenticated
  using (id = private.my_campus() or private.is_admin('moderator'));

create policy campus_domains_select_admin on public.campus_domains
  for select to authenticated
  using (private.is_admin('moderator'));

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or private.is_admin('moderator'));

-- Only these three columns; status, strikes, campus etc. change through RPCs.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy admins_select_admin on public.admins
  for select to authenticated
  using (private.is_admin('moderator'));

create policy app_config_select_public on public.app_config
  for select to authenticated
  using (private.is_public_config_key(key) or private.is_admin('owner'));

-- ---------------------------------------------------------------------------
-- Listings

create policy categories_select_all on public.categories
  for select to authenticated
  using (true);

create policy listings_select on public.listings
  for select to authenticated
  using (
    private.is_admin('moderator')
    or (
      campus_id = private.my_campus()
      and (
        (seller_id = auth.uid() and status <> 'deleted')
        or (status in ('active','hold','sold') and not private.is_blocked(auth.uid(), seller_id))
      )
    )
  );

-- Photos follow their listing (the listings policy applies inside the subquery).
create policy listing_photos_select on public.listing_photos
  for select to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id));

create policy swipes_select_self on public.swipes
  for select to authenticated using (user_id = auth.uid() or private.is_admin('moderator'));
create policy saves_select_self on public.saves
  for select to authenticated using (user_id = auth.uid() or private.is_admin('moderator'));
create policy watches_select_self on public.watches
  for select to authenticated using (user_id = auth.uid() or private.is_admin('moderator'));
create policy saved_searches_select_self on public.saved_searches
  for select to authenticated using (user_id = auth.uid() or private.is_admin('moderator'));

-- ---------------------------------------------------------------------------
-- Deals. Admins read chats only through admin_read_reported_chat (DATA_MODEL §3).

create policy offers_select_participants on public.offers
  for select to authenticated
  using (auth.uid() in (buyer_id, seller_id) or private.is_admin('moderator'));

create policy chats_select_participants on public.chats
  for select to authenticated
  using (auth.uid() in (buyer_id, seller_id));

create policy messages_select_participants on public.messages
  for select to authenticated
  using (private.is_chat_participant(chat_id));

create policy meetups_select_participants on public.meetups
  for select to authenticated
  using (private.is_chat_participant(chat_id));

create policy noshow_reports_select_own on public.noshow_reports
  for select to authenticated
  using (reporter_id = auth.uid() or private.is_admin('moderator'));

create policy safe_spots_select_campus on public.safe_spots
  for select to authenticated
  using ((campus_id = private.my_campus() and active) or private.is_admin('moderator'));

create policy ratings_select_own_given on public.ratings
  for select to authenticated
  using (rater_id = auth.uid() or private.is_admin('moderator'));

create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid() or private.is_admin('moderator'));

-- ---------------------------------------------------------------------------
-- Safety and ops. Reporters read their reports through the my_reports view.

create policy reports_select_admin on public.reports
  for select to authenticated
  using (private.is_admin('moderator'));

create policy strikes_select_own on public.strikes
  for select to authenticated
  using (user_id = auth.uid() or private.is_admin('moderator'));

create policy appeals_select_own on public.appeals
  for select to authenticated
  using (user_id = auth.uid() or private.is_admin('moderator'));

create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using (private.is_admin('moderator'));

-- ---------------------------------------------------------------------------
-- Notifications

create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notification_prefs_select_own on public.notification_prefs
  for select to authenticated using (user_id = auth.uid());
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = auth.uid());
create policy data_exports_select_own on public.data_exports
  for select to authenticated using (user_id = auth.uid());

create policy announcements_select_campus on public.announcements
  for select to authenticated
  using (
    (campus_id is null or campus_id = private.my_campus())
    and pinned_until is not null and pinned_until > private.now()
  );

-- ---------------------------------------------------------------------------
-- Grants: SELECT only where a policy exists; no INSERT/DELETE anywhere.

grant select on
  public.campuses, public.campus_domains, public.profiles, public.admins, public.app_config,
  public.categories, public.listings, public.listing_photos,
  public.swipes, public.saves, public.watches, public.saved_searches,
  public.offers, public.chats, public.messages, public.meetups, public.noshow_reports,
  public.safe_spots, public.ratings, public.blocks,
  public.reports, public.strikes, public.appeals, public.audit_log,
  public.notifications, public.notification_prefs, public.push_tokens, public.data_exports,
  public.announcements
to authenticated;

grant update (theme_mode, analytics_opt_in, crash_reports_opt_in) on public.profiles to authenticated;

-- The service role (Edge Functions, cron) works on everything.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Realtime private channels (ADR-004): `user:{uid}` for the owner and
-- `chat:{id}` for its two participants. Anything else is refused.
create policy realtime_receive_own_topics on realtime.messages
  for select to authenticated
  using (
    realtime.topic() = 'user:' || auth.uid()::text
    or (
      realtime.topic() ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and private.is_chat_participant(substr(realtime.topic(), 6)::uuid)
    )
  );
