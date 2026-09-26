-- P3-DB-07: require_active, require_admin, is_admin, is_blocked, email_hash, private.now.
begin;
select plan(24);
select tests.create_fixtures();

-- private.now() and time travel (P3-TEST-02)
select ok(abs(extract(epoch from private.now() - now())) < 1, 'private.now() is now() by default');
select tests.set_now('2027-03-14 09:00:00+00');
select is(private.now(), '2027-03-14 09:00:00+00'::timestamptz, 'tests.set_now moves private.now()');

-- require_active: every failure mode, in order (API §1)
select tests.set_claims(null);
select throws_ok($$select private.require_active()$$, 'P0001', 'NOT_AUTHENTICATED', 'no session');
select tests.set_claims('00000000-0000-4000-8000-00000000ffff');
select throws_ok($$select private.require_active()$$, 'P0001', 'NOT_AUTHENTICATED', 'no profile');
select tests.set_claims(tests.uid('D'));
select throws_ok($$select private.require_active()$$, 'P0001', 'NOT_ACTIVE:waitlist', 'waitlisted user');
update public.profiles set status = 'paused' where id = tests.uid('C');
select tests.set_claims(tests.uid('C'));
select throws_ok($$select private.require_active()$$, 'P0001', 'NOT_ACTIVE:paused', 'paused user');
update public.profiles set status = 'active', adult_confirmed_at = null where id = tests.uid('C');
select throws_ok($$select private.require_active()$$, 'P0001', 'AGE_REQUIRED', 'age not confirmed');
update public.profiles set adult_confirmed_at = now(), rules_version = '0' where id = tests.uid('C');
select throws_ok($$select private.require_active()$$, 'P0001', 'RULES_REQUIRED', 'old rules version');

select tests.set_claims(tests.uid('A'));
select is((private.require_active()).id, tests.uid('A'), 'active user passes and gets their live profile');
select is(
  (select day from public.activity_days where user_id = tests.uid('A')),
  date '2027-03-14', 'activity day recorded in campus time'
);
select lives_ok($$select private.require_active()$$, 'calling twice the same day is fine');
select is((select count(*)::int from public.activity_days where user_id = tests.uid('A')), 1, 'one activity row per day');

-- A late-evening UTC time is still "today" in New York.
select tests.set_now('2027-03-15 02:30:00+00');
select private.require_active();
select ok(
  exists (select 1 from public.activity_days where user_id = tests.uid('A') and day = date '2027-03-14')
    and not exists (select 1 from public.activity_days where user_id = tests.uid('A') and day = date '2027-03-15'),
  '02:30 UTC counts as the previous day in America/New_York'
);

-- require_admin / is_admin: admins row + aal2 + rank + campus scope
select tests.set_claims(tests.uid('A'), 'aal2');
select throws_ok($$select private.require_admin('moderator')$$, 'P0001', 'NOT_ADMIN', 'a regular user is not an admin');
select tests.set_claims(tests.uid('NOMFA'), 'aal1');
select throws_ok($$select private.require_admin('moderator')$$, 'P0001', 'NOT_ADMIN', 'an owner at aal1 is refused');
select ok(not private.is_admin('moderator'), 'is_admin is false at aal1');
select tests.set_claims(tests.uid('MOD'), 'aal2');
select is((private.require_admin('moderator')).user_id, tests.uid('MOD'), 'moderator at aal2 passes');
select throws_ok($$select private.require_admin('owner')$$, 'P0001', 'NOT_ADMIN', 'moderator cannot do owner actions');
select throws_ok(
  format('select private.require_admin(%L, %L)', 'moderator', tests.uid('UMICH')),
  'P0001', 'NOT_ADMIN', 'moderator is scoped to their campus'
);
select tests.set_claims(tests.uid('OWN'), 'aal2');
select lives_ok(
  format('select private.require_admin(%L, %L)', 'owner', tests.uid('UMICH')),
  'owner with no campus scope works everywhere'
);

-- is_blocked works in both directions
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('A'), tests.uid('B'));
select ok(private.is_blocked(tests.uid('A'), tests.uid('B')) and private.is_blocked(tests.uid('B'), tests.uid('A')),
  'is_blocked is true both ways');
select ok(not private.is_blocked(tests.uid('A'), tests.uid('C')) and not private.is_blocked(null, tests.uid('A')),
  'is_blocked is false otherwise, including null');

-- email_hash: stable, case-insensitive, peppered, fails closed without a pepper
select throws_ok($$select private.email_hash('a@osu.edu')$$, 'P0001', 'CONFIG_MISSING:email_hash_pepper',
  'email_hash refuses to run without a pepper');
select tests.set_pepper();
select is(private.email_hash(' Maya@OSU.edu '), private.email_hash('maya@osu.edu'), 'email_hash ignores case and spaces');

select * from finish();
rollback;
