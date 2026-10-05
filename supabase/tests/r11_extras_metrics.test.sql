-- S51 metrics (0205; R11-ADM-01, DATA_MODEL §2.7): T-DATA-02, the
-- admin_metrics_* views and RPCs match the PRD §5.1 definitions on fixture
-- data. Activation (10+ cards in 24 h and an offer or listing in 7 days),
-- retention D1/D7/D30 by signup week (activity_days), liquidity (supply,
-- time to first offer, 14-day sell-through, feed exhaustion), deal
-- reliability and safety. Demo campus excluded; moderators campus-scoped.
begin;
select plan(30);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

create function pg_temp.as_admin(who text, q text, aal text default 'aal2') returns text language plpgsql as $$
declare
  res text;
begin
  perform tests.authenticate_as(tests.uid(who), aal);
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;
create function pg_temp.l(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-000000f0' || lpad(n::text, 4, '0'))::uuid
$$;

update public.profiles set created_at = '2027-03-01 10:00-05' where id = tests.uid('A');
update public.profiles set created_at = '2027-03-01 11:00-05' where id = tests.uid('B');
update public.profiles set created_at = '2027-03-02 09:00-05' where id = tests.uid('C');
update public.profiles set created_at = '2027-01-01 12:00-05' where id in (tests.uid('MOD'), tests.uid('OWN'), tests.uid('NOMFA'));

-- Twelve listings by the owner, a week and a half before the cohort.
insert into public.listings (id, campus_id, seller_id, title, status, kind, price_cents, created_at)
select pg_temp.l(g), tests.uid('OSU'), tests.uid('OWN'), 'Thing ' || g, 'active', 'sale', 1000, '2027-02-20 12:00-05'
from generate_series(1, 12) g;

-- Aisha: 8 passes + 2 offers in her first hour (10 cards), so activated.
insert into public.swipes (user_id, listing_id, dir, created_at)
select tests.uid('A'), pg_temp.l(g), 'left', '2027-03-01 10:10-05'::timestamptz + make_interval(mins => g) from generate_series(3, 10) g;
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, status, created_at) values
  ('00000000-0000-4000-8000-000000f10001', pg_temp.l(1), tests.uid('A'), tests.uid('OWN'), 900, 'accepted', '2027-03-01 10:30-05'),
  ('00000000-0000-4000-8000-000000f10002', pg_temp.l(11), tests.uid('A'), tests.uid('OWN'), 900, 'pending', '2027-03-01 11:00-05');
-- Ben: 10 swipes but only after his first 24 h; an offer and a listing in week one.
insert into public.swipes (user_id, listing_id, dir, created_at)
select tests.uid('B'), pg_temp.l(g), 'left', '2027-03-02 12:00-05'::timestamptz + make_interval(mins => g) from generate_series(3, 12) g;
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, status, created_at) values
  ('00000000-0000-4000-8000-000000f10003', pg_temp.l(2), tests.uid('B'), tests.uid('OWN'), 1000, 'accepted', '2027-03-02 13:00-05');
insert into public.listings (id, campus_id, seller_id, title, status, kind, price_cents, created_at)
values (pg_temp.l(99), tests.uid('OSU'), tests.uid('B'), 'Ben desk', 'active', 'sale', 3000, '2027-03-03 09:00-05');
-- Cam: 10 swipes in his first 24 h, but his first offer comes after 7 days.
insert into public.swipes (user_id, listing_id, dir, created_at)
select tests.uid('C'), pg_temp.l(g), 'left', '2027-03-02 09:05-05'::timestamptz + make_interval(mins => g) from generate_series(1, 10) g;
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, status, created_at) values
  ('00000000-0000-4000-8000-000000f10004', pg_temp.l(1), tests.uid('C'), tests.uid('OWN'), 800, 'pending', '2027-03-10 08:00-05');

-- Deals: Aisha's desk sells (her outcome done: a completed swap); Ben's sells
-- after 14 days and he never answered (not a completed swap).
insert into public.chats (id, listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, buyer_outcome, created_at) values
  ('00000000-0000-4000-8000-000000f20001', pg_temp.l(1), '00000000-0000-4000-8000-000000f10001', tests.uid('A'), tests.uid('OWN'), 'Thing 1', 1000, 900, 'done', '2027-03-02 10:00-05'),
  ('00000000-0000-4000-8000-000000f20002', pg_temp.l(2), '00000000-0000-4000-8000-000000f10003', tests.uid('B'), tests.uid('OWN'), 'Thing 2', 1000, 1000, null, '2027-03-02 14:00-05');
update public.listings set status = 'sold', buyer_id = tests.uid('A'), sold_at = '2027-03-04 15:00-05' where id = pg_temp.l(1);
update public.listings set status = 'sold', buyer_id = tests.uid('B'), sold_at = '2027-03-08 15:00-05' where id = pg_temp.l(2);
insert into public.meetups (chat_id, custom_place, starts_at, status, confirmed_at) values
  ('00000000-0000-4000-8000-000000f20001', 'Union', '2027-03-04 14:00-05', 'completed', '2027-03-03 10:00-05'),
  ('00000000-0000-4000-8000-000000f20002', 'Library', '2027-03-05 14:00-05', 'no_show', '2027-03-04 10:00-05');

-- Retention: Aisha back on day 1 and day 7, Ben on day 1, Cam on day 7.
insert into public.activity_days (user_id, day) values
  (tests.uid('A'), '2027-03-02'), (tests.uid('A'), '2027-03-08'), (tests.uid('B'), '2027-03-02'), (tests.uid('C'), '2027-03-09');
-- Feed exhaustion counters.
insert into public.daily_counters (campus_id, day, key, value) values
  (tests.uid('OSU'), '2027-03-02', 'feed_exhausted', 4), (tests.uid('OSU'), '2027-03-03', 'feed_exhausted', 2);
-- Reports: two resolved (10 h and 24 h), one open.
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, status, created_at, resolved_at) values
  (tests.uid('OSU'), tests.uid('A'), 'user', tests.uid('B')::text, tests.uid('B'), 'spam', 'dismissed', '2027-03-02 10:00-05', '2027-03-02 20:00-05'),
  (tests.uid('OSU'), tests.uid('B'), 'user', tests.uid('C')::text, tests.uid('C'), 'spam', 'actioned', '2027-03-03 08:00-05', '2027-03-04 08:00-05'),
  (tests.uid('OSU'), tests.uid('C'), 'user', tests.uid('A')::text, tests.uid('A'), 'spam', 'open', '2027-03-04 08:00-05', null);

-- A demo campus with a completed swap that must never count.
insert into public.campuses (id, slug, name, short_name, status, is_demo) values
  ('00000000-0000-4000-8000-0000000c0dee', 'demo', 'Demo University', 'Demo', 'live', true);
insert into public.listings (id, campus_id, seller_id, title, status, kind, price_cents, buyer_id, sold_at, created_at)
values (pg_temp.l(500), '00000000-0000-4000-8000-0000000c0dee', tests.uid('OWN'), 'Demo lamp', 'sold', 'sale', 100, tests.uid('A'), '2027-03-04 10:00-05', '2027-03-01 09:00-05');
insert into public.chats (listing_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, buyer_outcome)
values (pg_temp.l(500), tests.uid('A'), tests.uid('OWN'), 'Demo lamp', 100, 100, 'done');

-- Access ------------------------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.admin_metrics_funnel', 'select')
          and not has_table_privilege('anon', 'public.admin_metrics_retention', 'select')
          and not has_table_privilege('authenticated', 'public.admin_metrics_liquidity', 'select')
          and not has_table_privilege('authenticated', 'public.admin_metrics_safety', 'select'),
  'the views are not readable through the API');
select is(pg_temp.as_admin('A', $$select public.admin_metrics_funnel()::text$$), 'ERROR: NOT_ADMIN', 'students get nothing');
select is(pg_temp.as_admin('NOMFA', $$select public.admin_metrics_retention()::text$$, 'aal1'), 'ERROR: NOT_ADMIN', 'MFA required');
select is(pg_temp.as_admin('MOD', format($$select public.admin_metrics_liquidity(%L)::text$$, tests.uid('UMICH'))), 'ERROR: NOT_ADMIN',
  'a moderator cannot read another campus');
select is(pg_temp.as_admin('MOD', $$select public.admin_metrics_safety() ->> 'campus_id'$$), tests.uid('OSU')::text, 'and gets their own by default');

-- Funnel and activation ---------------------------------------------------------------------------
create temp table f as select pg_temp.as_admin('OWN', $$select public.admin_metrics_funnel(null, '2027-03-01', '2027-03-07')::text$$)::jsonb as j;
select is((select (j ->> 'signups') || '/' || (j ->> 'swiped_10_24h') || '/' || (j ->> 'activated') from f), '3/2/1',
  'signups, 10+ cards in 24 h, activated');
select is((select j ->> 'activation_rate' from f), '33.3', 'activation rate');
select is((select (j ->> 'offers') || '/' || (j ->> 'offers_accepted') || '/' || (j ->> 'meetups_confirmed') || '/' || (j ->> 'completed_swaps') from f),
  '3/2/2/1', 'offers, accepted, meetups, completed swaps (the demo campus and the unanswered deal do not count)');
select is((select (d ->> 'signups') || '/' || (d ->> 'offers') from f, jsonb_array_elements(j -> 'days') d where d ->> 'day' = '2027-03-01'),
  '2/2', 'per day in the campus time zone');
select is(pg_temp.as_admin('MOD', $$select (j ->> 'signups') || '/' || (j ->> 'offers') from public.admin_metrics_funnel(null, '2027-03-08', '2027-03-10') j$$),
  '0/1', 'a later range');
select is(pg_temp.as_admin('MOD', $$select (j ->> 'from') || '..' || (j ->> 'to') || ':' || (j ->> 'offers') from public.admin_metrics_funnel() j$$),
  '2027-02-11..2027-03-10:4', 'the default is the last 28 days');
select is(pg_temp.as_admin('MOD', $$select public.admin_metrics_funnel(null, '2027-03-08', '2027-03-01')::text$$), 'ERROR: INVALID:range', 'from after to');
select is((select sum(completed_swaps)::int from public.admin_metrics_funnel), 1, 'the view itself leaves out the demo campus');

-- Retention ----------------------------------------------------------------------------------------
create temp table r as select pg_temp.as_admin('MOD', format($$select public.admin_metrics_retention(%L)::text$$, tests.uid('OSU')))::jsonb as j;
select is((select (w ->> 'signup_week') || ':' || (w ->> 'cohort') from r, jsonb_array_elements(j -> 'weeks') with ordinality w(w, i) where i = 1),
  '2027-03-01:3', 'newest signup week first (weeks start Monday)');
select is((select (w ->> 'd1') || '/' || (w ->> 'd1_eligible') || ':' || (w ->> 'd1_rate') from r, jsonb_array_elements(j -> 'weeks') with ordinality w(w, i) where i = 1),
  '2/3:66.7', 'D1: active the day after signing up');
select is((select (w ->> 'd7') || '/' || (w ->> 'd7_eligible') || ':' || (w ->> 'd7_rate') from r, jsonb_array_elements(j -> 'weeks') with ordinality w(w, i) where i = 1),
  '2/3:66.7', 'D7: active exactly 7 days after');
select is((select (w ->> 'd30') || '/' || (w ->> 'd30_eligible') || ':' || coalesce(w ->> 'd30_rate', 'n/a') from r, jsonb_array_elements(j -> 'weeks') with ordinality w(w, i) where i = 1),
  '0/0:n/a', 'D30 waits until the cohort is old enough');
select is((select (w ->> 'signup_week') || ':' || (w ->> 'cohort') || ':' || (w ->> 'd30_eligible') from r, jsonb_array_elements(j -> 'weeks') with ordinality w(w, i) where i = 2),
  '2026-12-28:3:3', 'an older cohort is eligible for D30');

-- Liquidity ----------------------------------------------------------------------------------------
create temp table q as select pg_temp.as_admin('MOD', $$select public.admin_metrics_liquidity()::text$$)::jsonb as j;
select is((select (j ->> 'active_listings') || '/' || (j ->> 'weekly_active_buyers') || '=' || (j ->> 'supply_ratio') from q), '11/1=11.00',
  'supply: active listings per weekly active buyer');
select is((select (w ->> 'week') || ':' || (w ->> 'listings_created') || ':' || (w ->> 'active_buyers') || ':' || (w ->> 'feed_exhausted')
           from q, jsonb_array_elements(j -> 'weeks') w where w ->> 'week' = '2027-03-01'),
  '2027-03-01:1:3:6', 'week of Mar 1: one new listing, three active buyers, six exhausted feeds');
select is((select (w ->> 'listings_created') || ':' || (w ->> 'sold_14d') || ':' || (w ->> 'sell_through_14d') || ':' || (w ->> 'sell_through_final')
           from q, jsonb_array_elements(j -> 'weeks') w where w ->> 'week' = '2027-02-15'),
  '12:1:8.3:true', 'sell-through: 1 of 12 sold within 14 days (the late sale does not count)');
select is((select w ->> 'median_hours_to_first_offer' from q, jsonb_array_elements(j -> 'weeks') w where w ->> 'week' = '2027-02-15'),
  '215.0', 'median hours from listing to first offer (214.5, 215, 241)');
select is((select (w ->> 'week') || ':' || (w ->> 'listings_created') || ':' || (w ->> 'active_buyers') from q, jsonb_array_elements(j -> 'weeks') with ordinality w(w, i) where i = 1),
  '2027-03-08:0:1', 'newest week first');

-- Safety and deal reliability ------------------------------------------------------------------------
create temp table s as select pg_temp.as_admin('MOD', $$select public.admin_metrics_safety()::text$$)::jsonb as j;
select is((select jsonb_array_length(j -> 'weeks') from s), 1, 'one week with activity');
select is((select (j #>> '{weeks,0,reports}') || '/' || (j #>> '{weeks,0,completed_swaps}') || ':' || (j #>> '{weeks,0,reports_per_100_swaps}') from s),
  '3/1:300.0', 'reports per 100 completed swaps');
select is((select j #>> '{weeks,0,p90_hours_to_resolve}' from s), '22.6', 'p90 hours to resolve (resolved reports only)');
select is((select (j #>> '{weeks,0,meetups_confirmed}') || ':' || (j #>> '{weeks,0,completion_rate}') || ':' || (j #>> '{weeks,0,no_show_rate}') from s),
  '2:50.0:50.0', 'confirmed meetups completed and the no-show rate');

-- Owners see all campuses added up
select is(pg_temp.as_admin('OWN', $$select (j ->> 'signups') from public.admin_metrics_funnel(null, '2027-03-01', '2027-03-07') j$$), '3',
  'an owner with no campus gets every real campus');
select is(pg_temp.as_admin('OWN', format($$select (j ->> 'signups') from public.admin_metrics_funnel(%L, '2027-03-01', '2027-03-07') j$$, tests.uid('UMICH'))), '0',
  'or one campus');
select is((select count(*)::int from public.audit_log), 0, 'metrics reads are not audited');

select * from finish();
rollback;
