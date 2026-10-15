-- A-05 (audit): a campus moderator reads only their own campus through RLS.
-- MOD moderates OSU; D is a UMICH student. OWN (global owner) still sees both.
-- Admin RPCs were already scoped by private.require_admin(.., for_campus).
begin;
select plan(20);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, title, status, kind, category_id, price_cents) values
  ('00000000-0000-4000-8000-0000000a0501', tests.uid('OSU'), tests.uid('A'), 'OSU lamp', 'active', 'sale', 1, 2000),
  ('00000000-0000-4000-8000-0000000a0502', tests.uid('UMICH'), tests.uid('D'), 'UMICH lamp', 'active', 'sale', 1, 2000);
insert into public.offers (listing_id, buyer_id, seller_id, amount_cents) values
  ('00000000-0000-4000-8000-0000000a0501', tests.uid('B'), tests.uid('A'), 1500),
  ('00000000-0000-4000-8000-0000000a0502', tests.uid('A'), tests.uid('D'), 1500);
insert into public.swipes (user_id, listing_id, dir) values
  (tests.uid('B'), '00000000-0000-4000-8000-0000000a0501', 'left'),
  (tests.uid('D'), '00000000-0000-4000-8000-0000000a0501', 'left');
insert into public.saves (user_id, listing_id) values
  (tests.uid('B'), '00000000-0000-4000-8000-0000000a0501'),
  (tests.uid('D'), '00000000-0000-4000-8000-0000000a0502');
insert into public.blocks (blocker_id, blocked_id) values
  (tests.uid('B'), tests.uid('C')),
  (tests.uid('D'), tests.uid('A'));
insert into public.saved_searches (user_id, campus_id) values
  (tests.uid('B'), tests.uid('OSU')),
  (tests.uid('D'), tests.uid('UMICH'));
insert into public.strikes (user_id, reason) values (tests.uid('B'), 'x'), (tests.uid('D'), 'x');
insert into public.safe_spots (campus_id, name, lat, lng) values
  (tests.uid('OSU'), 'Union', 40, -83),
  (tests.uid('UMICH'), 'Diag', 42, -83);
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason) values
  (tests.uid('OSU'), tests.uid('B'), 'listing', '00000000-0000-4000-8000-0000000a0501', tests.uid('A'), 'scam'),
  (tests.uid('UMICH'), tests.uid('D'), 'user', tests.uid('A')::text, tests.uid('A'), 'scam');

-- Structure: no table policy grants moderators a bare, unscoped read.
select is((select count(*)::int from pg_policies
           where schemaname = 'public'
             and coalesce(qual, '') like '%is_admin(''moderator''%'
             and coalesce(qual, '') not like '%admin_sees%'
             and tablename not in ('admins')),
  0, 'every moderator read in RLS is campus-scoped');

-- The OSU moderator.
select tests.authenticate_as(tests.uid('MOD'), 'aal2');
select is((select count(*)::int from public.listings where campus_id = tests.uid('UMICH')), 0, 'mod: no UMICH listings');
select is((select count(*)::int from public.listings where campus_id = tests.uid('OSU')), 1, 'mod: OSU listings');
select is((select count(*)::int from public.profiles where id = tests.uid('D')), 0, 'mod: no UMICH profile');
select is((select count(*)::int from public.profiles where id = tests.uid('B')), 1, 'mod: OSU profile');
select is((select count(*)::int from public.offers), 1, 'mod: OSU offers only');
select is((select count(*)::int from public.swipes), 1, 'mod: OSU swipes only');
select is((select count(*)::int from public.saves), 1, 'mod: OSU saves only');
select is((select count(*)::int from public.blocks), 1, 'mod: OSU blocks only');
select is((select count(*)::int from public.saved_searches), 1, 'mod: OSU saved searches only');
select is((select count(*)::int from public.strikes), 1, 'mod: OSU strikes only');
select is((select count(*)::int from public.safe_spots), 1, 'mod: OSU spots only');
select is((select count(*)::int from public.reports), 1, 'mod: OSU reports only');
select is((select count(*)::int from public.campuses), 1, 'mod: own campus only');

-- The global owner still sees everything.
select tests.authenticate_as(tests.uid('OWN'), 'aal2');
select is((select count(*)::int from public.listings), 2, 'owner: both campuses');
select is((select count(*)::int from public.profiles where id = tests.uid('D')), 1, 'owner: UMICH profile');
select is((select count(*)::int from public.reports), 2, 'owner: every report');

-- Students are unchanged: their own rows, nothing of others.
select tests.authenticate_as(tests.uid('D'));
select is((select count(*)::int from public.saves), 1, 'student: own saves');
select is((select count(*)::int from public.reports), 0, 'student: no reports');

-- Without the two-step check a moderator sees no one else's rows.
select tests.authenticate_as(tests.uid('MOD'), 'aal1');
select is((select count(*)::int from public.profiles), 1, 'mod at aal1: own profile only');

select * from finish();
rollback;
