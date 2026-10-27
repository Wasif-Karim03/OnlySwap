-- 0226: moderators read only their own campus through RLS (audit A-05, DEC 113).
-- A moderator with admins.campus_id set could select every campus's listings,
-- profiles, offers, swipes, saves, blocks, reports and so on via PostgREST:
-- the policies called private.is_admin('moderator') with no campus check. The
-- admin RPCs were already scoped (require_admin(.., for_campus)); this brings
-- the table policies in line. Global admins (campus_id null) still see all.
--
-- `(select private.is_admin('moderator'))` runs once per query (an initPlan),
-- so a student's reads never pay the per-row campus lookup.

create or replace function private.admin_sees(p_campus uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1 from public.admins a
    where a.user_id = auth.uid()
      and private.admin_rank(a.role) >= private.admin_rank('moderator')
      and (a.campus_id is null or a.campus_id = p_campus)
      and private.admin_mfa_ok()
  );
end;
$$;

-- Rows keyed by a person: their campus decides.
create or replace function private.admin_sees_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.admin_sees((select p.campus_id from public.profiles p where p.id = p_user))
$$;

revoke all on function private.admin_sees(uuid) from public, anon;
revoke all on function private.admin_sees_user(uuid) from public, anon;
grant execute on function private.admin_sees(uuid) to authenticated, service_role;
grant execute on function private.admin_sees_user(uuid) to authenticated, service_role;

alter policy listings_select on public.listings
  using (
    ((select private.is_admin('moderator')) and private.admin_sees(campus_id))
    or (
      campus_id = private.my_campus()
      and (
        (seller_id = auth.uid() and status <> 'deleted')
        or (status in ('active', 'hold', 'sold') and not private.is_blocked(auth.uid(), seller_id))
      )
    )
  );

alter policy audit_log_select_admin on public.audit_log
  using (
    (select private.is_admin('moderator'))
    and private.admin_sees(campus_id)
    and (
      private.is_admin('owner')
      or not (meta is distinct from private.audit_meta_safe(target_type, target_id, meta))
    )
  );

alter policy campus_domains_select_admin on public.campus_domains
  using (
    ((select private.is_admin('moderator')) and private.admin_sees(campus_id))
  );

alter policy campuses_select_own on public.campuses
  using (
    id = private.my_campus()
    or ((select private.is_admin('moderator')) and private.admin_sees(id))
  );

alter policy profiles_select_self on public.profiles
  using (
    id = auth.uid()
    or ((select private.is_admin('moderator')) and private.admin_sees(campus_id))
  );

alter policy reports_select_admin on public.reports
  using (
    ((select private.is_admin('moderator')) and private.admin_sees(campus_id))
  );

alter policy safe_spots_select_campus on public.safe_spots
  using (
    (campus_id = private.my_campus() and active)
    or ((select private.is_admin('moderator')) and private.admin_sees(campus_id))
  );

alter policy saved_searches_select_self on public.saved_searches
  using (
    user_id = auth.uid()
    or ((select private.is_admin('moderator')) and private.admin_sees(campus_id))
  );

alter policy appeals_select_own on public.appeals
  using (
    user_id = auth.uid()
    or ((select private.is_admin('moderator')) and private.admin_sees_user(user_id))
  );

alter policy blocks_select_own on public.blocks
  using (
    blocker_id = auth.uid()
    or ((select private.is_admin('moderator')) and private.admin_sees_user(blocker_id))
  );

alter policy noshow_reports_select_own on public.noshow_reports
  using (
    reporter_id = auth.uid()
    or ((select private.is_admin('moderator')) and private.admin_sees_user(reporter_id))
  );

alter policy offers_select_participants on public.offers
  using (
    (auth.uid() = buyer_id or auth.uid() = seller_id)
    or ((select private.is_admin('moderator')) and private.admin_sees_user(seller_id))
  );

alter policy ratings_select_own_given on public.ratings
  using (
    rater_id = auth.uid()
    or ((select private.is_admin('moderator')) and private.admin_sees_user(rater_id))
  );

alter policy saves_select_self on public.saves
  using (
    user_id = auth.uid()
    or ((select private.is_admin('moderator')) and private.admin_sees_user(user_id))
  );

alter policy strikes_select_own on public.strikes
  using (
    user_id = auth.uid()
    or ((select private.is_admin('moderator')) and private.admin_sees_user(user_id))
  );

alter policy swipes_select_self on public.swipes
  using (
    user_id = auth.uid()
    or ((select private.is_admin('moderator')) and private.admin_sees_user(user_id))
  );

alter policy watches_select_self on public.watches
  using (
    user_id = auth.uid()
    or ((select private.is_admin('moderator')) and private.admin_sees_user(user_id))
  );
