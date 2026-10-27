-- 0242_min_age_13.sql · AR-01, DEC 136. The minimum account age is 13 (was 18).
--   * profiles.age_band records 13_17 or 18_plus. adult_confirmed_at keeps its
--     name and now means "met the minimum age". Never a birth date.
--   * A default trigger fills 18_plus whenever adult_confirmed_at is set without
--     a band (confirm_age v1, seeds, fixtures, scripts) and clears the band
--     when adult_confirmed_at is cleared.
--   * confirm_age_v2 (additive): bands from the OS signal or a birth date in
--     campus time; under 13 is blocked exactly like a minor answer in v1.
--     confirm_age (v1, 18+) is unchanged so installed builds keep working.
--   * admin_person: copied from 0207 with one added key, age_band.

alter table public.profiles add column if not exists age_band text;
alter table public.profiles add constraint profiles_age_band_valid
  check (age_band is null or age_band in ('13_17', '18_plus'));
alter table public.profiles add constraint profiles_age_band_needs_confirm
  check (age_band is null or adult_confirmed_at is not null);
comment on column public.profiles.adult_confirmed_at is
  'When the account met the minimum age (13 since DEC 136, 18 before). Name kept for compatibility.';
comment on column public.profiles.age_band is
  '13_17 or 18_plus, set by confirm_age_v2. Accounts confirmed through confirm_age (v1, 18+) are 18_plus. Never a birth date.';
update public.profiles set age_band = '18_plus'
 where adult_confirmed_at is not null and age_band is null;

-- v1 only ever confirms people who are 18+, and v2 always sets age_band in the
-- same UPDATE, so this default never overrides a band v2 chose.
create or replace function private.profiles_age_band_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.adult_confirmed_at is null then
    new.age_band := null;              -- a reset clears the band too (tests and admin resets)
  elsif new.age_band is null then
    new.age_band := '18_plus';
  end if;
  return new;
end;
$$;

create trigger profiles_age_band_default
  before insert or update of adult_confirmed_at, age_band on public.profiles
  for each row execute function private.profiles_age_band_default();
revoke all on function private.profiles_age_band_default() from public, anon, authenticated;

-- require_onboarding, not require_active: require_active raises AGE_REQUIRED
-- until this call succeeds (same deliberate exception as v1, see 0012).
create or replace function public.confirm_age_v2(
  method text,
  band text default null,
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
  v_band text;
  v_stored text;
begin
  -- Already confirmed: idempotent, changes nothing.
  if me.adult_confirmed_at is not null then
    return jsonb_build_object('eligible', true, 'age_band', coalesce(me.age_band, '18_plus'));
  end if;
  -- Same bucket as v1, so switching versions doesn't double the allowance.
  -- hit (rate-counter row lock) then the profile row lock is the same order
  -- as v1, so mixed v1/v2 calls can't deadlock.
  perform private.hit('confirm_age', 3, interval '1 day');
  select * into me from public.profiles p where p.id = me.id for update;
  if me.adult_confirmed_at is not null then
    return jsonb_build_object('eligible', true, 'age_band', coalesce(me.age_band, '18_plus'));
  end if;
  -- Once this email answered under the minimum, no retry passes (A-03).
  if exists (select 1 from public.age_blocks a where a.email_hash = me.email_hash) then
    return jsonb_build_object('eligible', false, 'age_band', null);
  end if;

  if confirm_age_v2.method = 'os_signal' then
    if confirm_age_v2.band is null or confirm_age_v2.band not in ('under_13', '13_17', '18_plus') then
      perform private.raise('INVALID', 'band');
    end if;
    v_band := confirm_age_v2.band;
  elsif confirm_age_v2.method = 'self_declared' then
    select c.timezone into tz from public.campuses c where c.id = me.campus_id;
    today := (private.now() at time zone coalesce(tz, 'America/New_York'))::date;
    if confirm_age_v2.birth_date is null or confirm_age_v2.birth_date > today
       or confirm_age_v2.birth_date < today - interval '120 years' then
      perform private.raise('INVALID', 'birth_date');
    end if;
    v_band := case
      when confirm_age_v2.birth_date <= (today - interval '18 years')::date then '18_plus'
      when confirm_age_v2.birth_date <= (today - interval '13 years')::date then '13_17'
      else 'under_13'
    end;
  else
    perform private.raise('INVALID', 'method');
  end if;

  if v_band = 'under_13' then
    insert into public.age_blocks (email_hash, created_at) values (me.email_hash, private.now())
    on conflict do nothing;
    return jsonb_build_object('eligible', false, 'age_band', null);
  end if;

  -- A first committed confirmation's band is never overwritten.
  update public.profiles p
     set adult_confirmed_at = private.now(),
         age_method = confirm_age_v2.method::public.age_method,
         age_band = v_band
   where p.id = me.id and p.adult_confirmed_at is null
  returning p.age_band into v_stored;
  if v_stored is null then
    select p.age_band into v_stored from public.profiles p where p.id = me.id;
  end if;
  return jsonb_build_object('eligible', true, 'age_band', coalesce(v_stored, '18_plus'));
end;
$$;

revoke all on function public.confirm_age_v2(text, text, date) from public, anon;
grant execute on function public.confirm_age_v2(text, text, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One student (copied from 0207; adds age_band)
create or replace function public.admin_person(user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.admin_for_person(admin_person.user_id);
  p public.profiles;
  uid uuid := admin_person.user_id;
  tz text;
  since timestamptz := private.now() - interval '30 days';
  res jsonb;
begin
  select * into p from public.profiles x where x.id = uid;
  select x.timezone into tz from public.campuses x where x.id = p.campus_id;
  perform private.log_person_view(a, uid, 'overview', true);

  res := jsonb_build_object(
    'person', jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'first_name', p.first_name,
      'initial', upper(left(coalesce(p.first_name, '?'), 1)),
      'status', p.status, 'status_reason', p.status_reason, 'paused_until', p.paused_until, 'year', p.year,
      'avatar_path', p.avatar_path, 'campus', private.campus_brief(p.campus_id),
      'email', private.admin_email(a, p.id), 'email_masked', a.role <> 'owner',
      'joined_at', p.created_at, 'last_active_at', p.last_active_at, 'last_platform', p.last_platform,
      'last_app_version', p.last_app_version, 'age_method', p.age_method, 'adult_confirmed_at', p.adult_confirmed_at,
      'age_band', p.age_band,
      'verified_until', p.verified_until, 'invited_by', private.person_brief(p.invited_by),
      'strikes', p.strike_count, 'no_shows', p.noshow_count,
      'admin_role', (select ad.role from public.admins ad where ad.user_id = p.id),
      'push_on', exists (select 1 from public.push_tokens t where t.user_id = p.id and t.disabled_at is null),
      'tips_on', coalesce((select np.tips from public.notification_prefs np where np.user_id = p.id), false)),
    'counts', jsonb_build_object(
      'swipes', (select count(*)::int from public.swipes s where s.user_id = uid and s.created_at <> 'infinity'),
      'left', (select count(*)::int from public.swipes s where s.user_id = uid and s.dir = 'left' and s.created_at <> 'infinity'),
      'saves', (select count(*)::int from public.saves s where s.user_id = uid),
      'offers_made', (select count(*)::int from public.offers o where o.buyer_id = uid),
      'offers_received', (select count(*)::int from public.offers o where o.seller_id = uid),
      'deals', (select count(*)::int from private.admin_deals(null, null) d where d.seller_id = uid or d.buyer_id = uid),
      'listings', (select count(*)::int from public.listings l where l.seller_id = uid and l.status <> 'deleted'),
      'chats', (select count(*)::int from public.chats ch where uid in (ch.buyer_id, ch.seller_id)),
      'meetups', (select count(*)::int from public.meetups m join public.chats ch on ch.id = m.chat_id
                  where uid in (ch.buyer_id, ch.seller_id)),
      'rating', (select jsonb_build_object('up', count(*) filter (where r.thumbs_up), 'down', count(*) filter (where not r.thumbs_up))
                 from public.ratings r where r.ratee_id = uid),
      'reports_on_them', (select count(*)::int from public.reports r where r.target_user_id = uid),
      'reports_by_them', (select count(*)::int from public.reports r where r.reporter_id = uid),
      'blocks_made', (select count(*)::int from public.blocks b where b.blocker_id = uid),
      'blocks_received', (select count(*)::int from public.blocks b where b.blocked_id = uid)),
    -- What they like: right swipes (saves and offers) by category, in percent.
    'affinity', coalesce((
      select jsonb_agg(jsonb_build_object('category_id', x.category_id, 'slug', cat.slug, 'name', cat.name, 'n', x.n,
                                          'share', x.share) order by x.n desc, cat.sort)
      from (select y.category_id, y.n, round(100.0 * y.n / sum(y.n) over ())::int as share
            from (select l.category_id, count(*)::int as n
                  from (select s.listing_id from public.saves s where s.user_id = uid
                        union select o.listing_id from public.offers o where o.buyer_id = uid) r
                  join public.listings l on l.id = r.listing_id
                  where l.category_id is not null
                  group by l.category_id) y) x
      join public.categories cat on cat.id = x.category_id), '[]'::jsonb),
    -- When they're active: 24 counts (campus local hour), last 30 days.
    'hourly', (select jsonb_agg(coalesce(h.n, 0) order by g.hr)
               from generate_series(0, 23) g(hr)
               left join (select extract(hour from t.at at time zone coalesce(tz, 'America/New_York'))::int as hr, count(*)::int as n
                          from (select e.created_at as at from public.activity_events e where e.user_id = uid and e.created_at >= since
                                union all select s.created_at from public.swipes s where s.user_id = uid and s.created_at >= since and s.created_at <> 'infinity'
                                union all select s.created_at from public.saves s where s.user_id = uid and s.created_at >= since
                                union all select o.created_at from public.offers o where o.buyer_id = uid and o.created_at >= since
                                union all select m.created_at from public.messages m where m.sender_id = uid and m.created_at >= since) t
                          group by 1) h on h.hr = g.hr),
    'blocks', jsonb_build_object(
      'made', coalesce((select jsonb_agg(private.person_brief(b.blocked_id) || jsonb_build_object('at', b.created_at) order by b.created_at desc)
                        from public.blocks b where b.blocker_id = uid), '[]'::jsonb),
      'received', coalesce((select jsonb_agg(private.person_brief(b.blocker_id) || jsonb_build_object('at', b.created_at) order by b.created_at desc)
                            from public.blocks b where b.blocked_id = uid), '[]'::jsonb)));
  return res;
end;
$$;

comment on function private.hook_custom_access_token(jsonb) is 'Claim adult means met the minimum age (13 since DEC 136).';

-- Inspection AR01-R1: v1 (old builds, 18 threshold, same response shape) now
-- also locks and re-reads the profile after private.hit, so it can't write an
-- age_blocks row for an account v2 just confirmed. Body otherwise as 0219.
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
  -- Lock and re-read after the rate-counter lock (same order as v2), so a v1
  -- call that waited behind a v2 confirmation can't block that account.
  select * into me from public.profiles p where p.id = me.id for update;
  if me.adult_confirmed_at is not null then
    return jsonb_build_object('adult', true);
  end if;
  -- Once this email answered minor, no retry passes (A-03). The app deletes
  -- the account after a minor answer; this covers a client that doesn't.
  if exists (select 1 from public.age_blocks a where a.email_hash = me.email_hash) then
    return jsonb_build_object('adult', false);
  end if;

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
     where id = me.id and adult_confirmed_at is null;
  else
    insert into public.age_blocks (email_hash, created_at) values (me.email_hash, private.now())
    on conflict do nothing;
  end if;
  return jsonb_build_object('adult', adult);
end;
$$;
