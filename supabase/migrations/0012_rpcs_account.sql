-- 0012_rpcs_account.sql (P4-AUTH-01, P4-DEL-01; API.md §3 Account & onboarding)
-- get_app_config, lookup_school, confirm_age, update_profile, update_profile_flags,
-- accept_rules, my_waitlist_position, and the database half of delete-account.

-- ---------------------------------------------------------------------------
-- Onboarding runs before require_active() can pass (no age or rules yet), so
-- these RPCs use this lighter check: signed in, has a profile, and the account
-- is not paused, suspended or banned.
create or replace function private.require_onboarding()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  if auth.uid() is null then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  select * into p from public.profiles x where x.id = auth.uid();
  if not found then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  if p.status not in ('active', 'waitlist', 'reverify') then
    perform private.raise('NOT_ACTIVE', p.status::text);
  end if;
  return p;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public. Only supported student domains are revealed (T16); blocked and
-- unknown domains look the same (null).
create or replace function public.lookup_school(domain text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d text := lower(btrim(coalesce(domain, '')));
  result jsonb;
begin
  perform private.hit_ip('lookup_school', 30, interval '1 minute');
  if d = '' or char_length(d) > 100 then
    perform private.raise('INVALID', 'domain');
  end if;
  select jsonb_build_object('campus_id', c.id, 'name', c.name, 'short_name', c.short_name,
                            'status', c.status, 'is_review', c.is_demo)
    into result
  from public.campus_domains cd
  join public.campuses c on c.id = cd.campus_id
  where cd.domain = d and cd.kind = 'student';
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public app config for the launch gate (A01): maintenance, minimum versions,
-- rules version and feature flags. Only the public keys (DATA_MODEL §2.1).
create or replace function public.get_app_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb)
  from public.app_config c
  where private.is_public_config_key(c.key)
$$;

-- ---------------------------------------------------------------------------
-- 18+ check (F02). The birth date is used for this one calculation and never
-- stored; a minor's email hash goes to age_blocks and the app then deletes the
-- account (delete-account, underage mode).
create or replace function public.confirm_age(
  method text,
  is_adult boolean default null,
  birth_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_onboarding();
  tz text;
  today date;
  adult boolean;
begin
  if me.adult_confirmed_at is not null then
    return jsonb_build_object('adult', true);
  end if;
  perform private.hit('confirm_age', 3, interval '1 day');

  if method = 'os_signal' then
    if is_adult is null then
      perform private.raise('INVALID', 'is_adult');
    end if;
    adult := is_adult;
  elsif method = 'self_declared' then
    select c.timezone into tz from public.campuses c where c.id = me.campus_id;
    today := (private.now() at time zone coalesce(tz, 'America/New_York'))::date;
    if birth_date is null or birth_date > today or birth_date < today - interval '120 years' then
      perform private.raise('INVALID', 'birth_date');
    end if;
    adult := birth_date <= (today - interval '18 years')::date;
  else
    perform private.raise('INVALID', 'method');
  end if;

  if adult then
    update public.profiles
       set adult_confirmed_at = private.now(), age_method = method::public.age_method
     where id = me.id;
  else
    insert into public.age_blocks (email_hash, created_at) values (me.email_hash, private.now())
    on conflict do nothing;
  end if;
  return jsonb_build_object('adult', adult);
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile basics (F03). Names: letters (any script), spaces, hyphen and
-- apostrophe, 1 to 30 characters (T-UNIT-AUTH-01 mirrors this).
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
begin
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

  select coalesce(array_agg(distinct a order by a), '{}') into clean_areas
  from unnest(coalesce(areas, '{}')) as u(raw)
  cross join lateral (select nullif(btrim(u.raw), '') as a) t
  where t.a is not null;
  if cardinality(clean_areas) > 5 or exists (select 1 from unnest(clean_areas) a where char_length(a) > 30) then
    perform private.raise('INVALID', 'areas');
  end if;

  if avatar_path is not null
     and left(avatar_path, char_length('c/' || me.campus_id || '/u/' || me.id || '/'))
         <> 'c/' || me.campus_id || '/u/' || me.id || '/' then
    perform private.raise('INVALID', 'avatar_path');
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

-- ---------------------------------------------------------------------------
-- Settings toggles; allowed for any signed-in account, even paused ones.
create or replace function public.update_profile_flags(
  analytics_opt_in boolean default null,
  crash_reports_opt_in boolean default null,
  theme_mode text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = auth.uid()) then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  if theme_mode is not null and theme_mode not in ('system', 'light', 'dark') then
    perform private.raise('INVALID', 'theme_mode');
  end if;
  update public.profiles p
     set analytics_opt_in = coalesce(update_profile_flags.analytics_opt_in, p.analytics_opt_in),
         crash_reports_opt_in = coalesce(update_profile_flags.crash_reports_opt_in, p.crash_reports_opt_in),
         theme_mode = coalesce(update_profile_flags.theme_mode, p.theme_mode)
   where p.id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Community rules (F04). Needs the 18+ check first; the version must be the
-- current one so an old app build can't accept outdated rules.
create or replace function public.accept_rules(version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_onboarding();
  current_rules text;
begin
  if me.adult_confirmed_at is null then
    perform private.raise('AGE_REQUIRED');
  end if;
  select value #>> '{}' into current_rules from public.app_config where key = 'rules_version';
  if version is distinct from current_rules then
    perform private.raise('INVALID', 'version');
  end if;
  update public.profiles
     set rules_accepted_at = private.now(), rules_version = current_rules
   where id = me.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist screen (A09): place in line on a campus that isn't live yet.
create or replace function public.my_waitlist_position()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  c public.campuses;
  members int;
  pos int;
begin
  if auth.uid() is null then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  select * into me from public.profiles p where p.id = auth.uid();
  if not found then
    perform private.raise('NOT_AUTHENTICATED');
  end if;
  select * into c from public.campuses x where x.id = me.campus_id;
  select count(*) into members from public.profiles p
  where p.campus_id = me.campus_id and p.status <> 'banned';
  if me.status = 'waitlist' then
    select count(*) + 1 into pos from public.profiles p
    where p.campus_id = me.campus_id and p.status = 'waitlist'
      and (p.created_at, p.id) < (me.created_at, me.id);
  end if;
  return jsonb_build_object('position', pos, 'members', members, 'threshold', c.unlock_threshold);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete-account, database half (called by the Edge Function with the
-- service role, then auth.admin.deleteUser removes the auth row and the
-- cascades/set-nulls take the rest). Returns what the function still needs:
-- the email for the goodbye message (null in underage mode) and the R2
-- prefixes to remove (P5-MEDIA-04).
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

  -- Rows keyed by the user id without a foreign key.
  delete from public.activity_days where user_id = p_uid;
  delete from public.listing_reservations where user_id = p_uid;
  delete from public.rate_counters where user_id = p_uid;

  prefixes := array['c/' || p.campus_id || '/u/' || p_uid || '/']
    || coalesce((select array_agg('c/' || l.campus_id || '/l/' || l.id || '/' order by l.id)
                 from public.listings l where l.seller_id = p_uid), '{}');

  if not p_underage and addr is not null then
    perform private.queue_email(addr, 'account_deleted', '{}'::jsonb, 'account_deleted:' || p_uid::text);
  end if;

  return jsonb_build_object('email', case when p_underage then null else addr end, 'r2_prefixes', to_jsonb(prefixes));
end;
$$;

-- ---------------------------------------------------------------------------
revoke all on function private.require_onboarding() from public, anon, authenticated;
revoke all on function private.prepare_account_deletion(uuid, boolean) from public, anon, authenticated;
grant execute on function private.prepare_account_deletion(uuid, boolean) to service_role;

revoke all on function public.lookup_school(text) from public;
revoke all on function public.get_app_config() from public;
revoke all on function public.confirm_age(text, boolean, date) from public, anon;
revoke all on function public.update_profile(text, text, public.class_year, text[], text, text) from public, anon;
revoke all on function public.update_profile_flags(boolean, boolean, text) from public, anon;
revoke all on function public.accept_rules(text) from public, anon;
revoke all on function public.my_waitlist_position() from public, anon;

grant execute on function public.lookup_school(text) to anon, authenticated, service_role;
grant execute on function public.get_app_config() to anon, authenticated, service_role;
grant execute on function public.confirm_age(text, boolean, date) to authenticated, service_role;
grant execute on function public.update_profile(text, text, public.class_year, text[], text, text) to authenticated, service_role;
grant execute on function public.update_profile_flags(boolean, boolean, text) to authenticated, service_role;
grant execute on function public.accept_rules(text) to authenticated, service_role;
grant execute on function public.my_waitlist_position() to authenticated, service_role;
