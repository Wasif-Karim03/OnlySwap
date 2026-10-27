-- Seller sees an admin removal (DEC 96). When an admin removes a listing
-- (one, in bulk, or from a report) the seller gets a notification with the
-- admin's reason, and their own listing shows it. Putting it back clears the
-- reason and tells the seller it is live again. The reason is only ever read
-- through the seller's own calls (my_listings, get_listing owner branch), never
-- by other students. Only the removal lines and the two read fields change in
-- the functions below; the rest is their current body.

create table public.listing_removals (
  listing_id uuid primary key references public.listings on delete cascade,
  reason text not null,
  removed_by uuid,
  removed_at timestamptz not null default now()
);
alter table public.listing_removals enable row level security;
revoke all on public.listing_removals from public, anon, authenticated;

create or replace function private.removal_reason(p_listing uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.reason from public.listing_removals r
  join public.listings l on l.id = r.listing_id
  where r.listing_id = p_listing and l.status = 'removed'
$$;

create or replace function private.tell_seller_removed(p_listing uuid, p_reason text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings x where x.id = p_listing;
  if not found or l.status <> 'removed' then
    return;
  end if;
  insert into public.listing_removals (listing_id, reason, removed_by, removed_at)
  values (l.id, p_reason, p_actor, private.now())
  on conflict (listing_id) do update
    set reason = excluded.reason, removed_by = excluded.removed_by, removed_at = excluded.removed_at;
  perform private.queue_notification(l.seller_id, 'listing_removed', 'selling', 'Your listing was removed',
    'OnlySwap removed ' || l.title || '. Reason: ' || p_reason,
    jsonb_build_object('listing_id', l.id), false,
    'listing_removed:' || l.id || ':' || txid_current());
end;
$$;

create or replace function private.tell_seller_restored(p_listing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings;
begin
  select * into l from public.listings x where x.id = p_listing;
  delete from public.listing_removals r where r.listing_id = p_listing;
  if found and l.status = 'active' then
    perform private.queue_notification(l.seller_id, 'listing_restored', 'selling', 'Your listing is back',
      l.title || ' is live again.', jsonb_build_object('listing_id', l.id), false,
      'listing_restored:' || l.id || ':' || txid_current());
  end if;
end;
$$;

revoke all on function private.removal_reason(uuid) from public, anon, authenticated;
revoke all on function private.tell_seller_removed(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.tell_seller_restored(uuid) from public, anon, authenticated;

-- Admin: one listing.
create or replace function public.admin_set_listing_status(id uuid, status text, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  l public.listings;
  a public.admins;
  why text := private.need_reason(admin_set_listing_status.reason);
begin
  select * into l from public.listings x where x.id = admin_set_listing_status.id for update;
  if not found or l.status = 'deleted' then
    perform private.raise('NOT_FOUND');
  end if;
  a := private.require_admin('moderator', l.campus_id);
  if admin_set_listing_status.status not in ('active', 'removed') then
    perform private.raise('INVALID', 'status');
  end if;
  if admin_set_listing_status.status = 'active' and l.status not in ('held_review', 'removed') then
    perform private.raise('INVALID', 'status');
  end if;
  update public.listings x set status = admin_set_listing_status.status::public.listing_status,
         bumped_at = case when admin_set_listing_status.status = 'active' then private.now() else x.bumped_at end
   where x.id = l.id;
  if admin_set_listing_status.status = 'removed' then
    perform private.wind_down_listing(l.id, 'This listing was removed', null);
    perform private.tell_seller_removed(l.id, why, a.user_id);
  elsif l.status = 'removed' then
    perform private.tell_seller_restored(l.id);
  end if;
  perform private.audit(a.user_id, 'listing.' || admin_set_listing_status.status, 'listing', l.id::text, l.campus_id, why,
    jsonb_build_object('from', l.status));
end;
$$;


-- Admin: many listings.
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
        perform private.tell_seller_removed(l.id, why, a.user_id);
      elsif st = 'active' and l.status = 'removed' then
        perform private.tell_seller_restored(l.id);
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


-- Admin: resolving a report with remove_content.
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
  select * into target from public.profiles p where p.id = r.target_user_id;

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
    insert into public.strikes (user_id, reason, report_id, created_by) values (target.id, r.reason, r.id, a.user_id);
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


-- Seller reads: the reason on their own removed listings.
create or replace function public.my_listings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_member();
begin
  return coalesce((
    select jsonb_agg(private.feed_item(l.id, me.id) || jsonb_build_object('can_relist',
             l.status = 'expired' or (l.status = 'active' and l.bumped_at < private.now() - interval '168 hours'),
             'removed_reason', private.removal_reason(l.id))
           order by l.created_at desc)
    from public.listings l where l.seller_id = me.id and l.status <> 'deleted'), '[]');
end;
$$;


create or replace function public.get_listing(id uuid)
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
  perform private.hit('get_listing', 600, interval '1 hour');
  select * into l from public.listings x where x.id = get_listing.id;
  if not found or l.status = 'deleted' then
    return jsonb_build_object('id', get_listing.id, 'access', 'gone');
  end if;
  if l.seller_id = me.id then
    return private.feed_item(l.id, me.id) || jsonb_build_object('access', 'owner',
      'removed_reason', private.removal_reason(l.id));
  end if;
  if l.campus_id <> me.campus_id then
    return jsonb_build_object('id', l.id, 'access', 'other_campus');
  end if;
  if private.is_blocked(me.id, l.seller_id) then
    return jsonb_build_object('id', l.id, 'access', 'blocked');
  end if;
  if l.status not in ('active', 'hold', 'sold') then
    return jsonb_build_object('id', l.id, 'access', 'gone');
  end if;
  return private.feed_item(l.id, me.id) || jsonb_build_object('access', 'buyer');
end;
$$;

