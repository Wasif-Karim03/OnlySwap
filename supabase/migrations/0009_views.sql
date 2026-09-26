-- 0009_views.sql (P3-DB-09, DATA_MODEL §2.7)
-- Read models. The user-facing views run as their owner (so they can read
-- past the owner-only RLS on profiles, ratings and reports) and filter
-- explicitly: same campus, not blocked, the caller's own rows. security_barrier
-- keeps a caller's WHERE clause from seeing rows before those filters run.
-- The materialized views are refreshed by cron (P9-CRON-01) and are never
-- granted to the API roles directly.

-- Other students' public columns only (DATA_MODEL §2.1 profiles note).
create view public.public_profiles
with (security_barrier = true)
as
select p.id, p.display_name, p.year, p.avatar_path, p.created_at, p.founding_seller_until
from public.profiles p
where p.campus_id = private.my_campus()
  and p.status <> 'banned'
  and not private.is_blocked(auth.uid(), p.id);

-- ---------------------------------------------------------------------------
-- profile_stats (materialized, every 10 min, refreshed concurrently)
create materialized view public.profile_stats_mv as
with rated as (
  select ratee_id as user_id,
         count(*) filter (where thumbs_up) as thumbs_up,
         count(*) as thumbs_total
  from public.ratings where ratee_id is not null
  group by ratee_id
),
swaps as (
  select u.user_id, count(*) as swaps_count
  from public.chats c
  cross join lateral (values (c.buyer_id), (c.seller_id)) as u(user_id)
  where u.user_id is not null and 'done' in (c.buyer_outcome, c.seller_outcome)
  group by u.user_id
),
replies as (
  -- Minutes from a message by the other person to this person's next message,
  -- over the last 90 days of chats.
  select m.sender_id as user_id,
         percentile_cont(0.5) within group (
           order by extract(epoch from m.created_at - prev.created_at) / 60) as median_reply_minutes
  from public.messages m
  join lateral (
    select p.created_at, p.sender_id from public.messages p
    where p.chat_id = m.chat_id and p.id < m.id
    order by p.id desc limit 1
  ) prev on prev.sender_id is distinct from m.sender_id
  where m.sender_id is not null and m.kind = 'text' and m.created_at > now() - interval '90 days'
  group by m.sender_id
),
active as (
  select seller_id as user_id, count(*) as active_listings
  from public.listings where status = 'active' and seller_id is not null
  group by seller_id
)
select p.id as user_id, p.campus_id,
       coalesce(s.swaps_count, 0)::int as swaps_count,
       coalesce(r.thumbs_up, 0)::int as thumbs_up,
       coalesce(r.thumbs_total, 0)::int as thumbs_total,
       rp.median_reply_minutes::numeric(10,1) as median_reply_minutes,
       coalesce(a.active_listings, 0)::int as active_listings
from public.profiles p
left join swaps s on s.user_id = p.id
left join rated r on r.user_id = p.id
left join replies rp on rp.user_id = p.id
left join active a on a.user_id = p.id;
create unique index profile_stats_mv_user on public.profile_stats_mv (user_id);

create view public.profile_stats
with (security_barrier = true)
as
select s.user_id, s.swaps_count, s.thumbs_up, s.thumbs_total, s.median_reply_minutes, s.active_listings
from public.profile_stats_mv s
where s.campus_id = private.my_campus()
  and not private.is_blocked(auth.uid(), s.user_id);

-- ---------------------------------------------------------------------------
-- Ratings are revealed once both sides rated or after 7 days. A deleted rater
-- comes back as rater_id null; the app shows "Deleted user" (D18).
create view public.ratings_visible
with (security_barrier = true)
as
select r.id, r.chat_id, r.ratee_id, r.rater_id,
       rp.display_name as rater_name,
       r.thumbs_up, r.tags, r.comment, r.created_at
from public.ratings r
join public.profiles ratee on ratee.id = r.ratee_id
left join public.profiles rp on rp.id = r.rater_id
where ratee.campus_id = private.my_campus()
  and not private.is_blocked(auth.uid(), r.ratee_id)
  and (
    r.created_at < private.now() - interval '7 days'
    or exists (
      select 1 from public.ratings other
      where other.chat_id = r.chat_id and other.rater_id is not distinct from r.ratee_id
    )
  );

-- ---------------------------------------------------------------------------
-- The caller's campus: members, unlock threshold, founding-seller spots left.
create view public.campus_progress
with (security_barrier = true)
as
select c.id, c.slug, c.name, c.status,
       (select count(*) from public.profiles p where p.campus_id = c.id and p.status <> 'banned')::int as members,
       c.unlock_threshold as threshold,
       greatest(c.founding_seller_limit - (
         select count(*) from public.profiles p
         where p.campus_id = c.id and p.founding_seller_until is not null)::int, 0) as founding_left
from public.campuses c
where c.id = private.my_campus();

-- ---------------------------------------------------------------------------
-- price_hints (materialized, daily): percentiles of items sold in the last
-- 180 days, per campus and category; hidden below 5 sales. Read via price_hint().
create materialized view public.price_hints as
select l.campus_id, l.category_id,
       percentile_disc(0.25) within group (order by l.price_cents) as p25,
       percentile_disc(0.50) within group (order by l.price_cents) as p50,
       percentile_disc(0.75) within group (order by l.price_cents) as p75,
       count(*)::int as n
from public.listings l
where l.status = 'sold' and l.kind = 'sale' and l.category_id is not null
  and l.sold_at > now() - interval '180 days' and l.price_cents > 0
group by l.campus_id, l.category_id
having count(*) >= 5;
create unique index price_hints_key on public.price_hints (campus_id, category_id);

-- campus_trending_terms (materialized, hourly): top 8 title words from the
-- most-saved listings of the last 7 days, per campus. Read via search_suggest().
create materialized view public.campus_trending_terms as
with words as (
  select l.campus_id, w.term, count(*) as saves
  from public.saves s
  join public.listings l on l.id = s.listing_id
  cross join lateral regexp_split_to_table(lower(private.unaccent_immutable(l.title)), '[^a-z0-9]+') as w(term)
  where s.created_at > now() - interval '7 days'
    and l.status in ('active','hold')
    and length(w.term) >= 3
    and w.term not in ('the','and','for','with','new','used','like','good','fair','great','only','from','set','pack')
  group by l.campus_id, w.term
),
ranked as (
  select campus_id, term, saves,
         row_number() over (partition by campus_id order by saves desc, term) as rank
  from words
)
select campus_id, term, saves::int as saves, rank::int as rank
from ranked where rank <= 8;
create unique index campus_trending_terms_key on public.campus_trending_terms (campus_id, term);

-- ---------------------------------------------------------------------------
-- A reporter's own reports, without who was reported or the evidence.
create view public.my_reports
with (security_barrier = true)
as
select r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at, r.resolved_at
from public.reports r
where r.reporter_id = auth.uid();

-- ---------------------------------------------------------------------------
revoke all on public.profile_stats_mv, public.price_hints, public.campus_trending_terms
  from anon, authenticated;
grant select on public.profile_stats_mv, public.price_hints, public.campus_trending_terms to service_role;

revoke all on public.public_profiles, public.profile_stats, public.ratings_visible,
  public.campus_progress, public.my_reports from anon;
grant select on public.public_profiles, public.profile_stats, public.ratings_visible,
  public.campus_progress, public.my_reports to authenticated, service_role;
