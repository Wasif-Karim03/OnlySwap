-- T-INT-AGE-V2 (AR-01, DEC 136): confirm_age_v2, minimum age 13 with an age
-- band. v1 confirm_age stays unchanged for installed builds.
begin;
select plan(44);
select tests.create_fixtures();
select tests.set_now('2026-09-26 12:00:00-04');

-- Fresh osu students who have not confirmed their age (signup trigger makes the profile).
insert into auth.users (id, email)
select ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'agev2_' || n || '@osu.edu'
from generate_series(1, 10) n;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid $$;
create function pg_temp.band(n int) returns text language sql as $$
  select age_band from public.profiles where id = pg_temp.u(n) $$;
create function pg_temp.blocked(n int) returns boolean language sql as $$
  select exists (select 1 from public.age_blocks a join public.profiles p on p.email_hash = a.email_hash
                 where p.id = pg_temp.u(n)) $$;

-- 1. Grants -------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.confirm_age_v2(text, text, date)', 'execute'),
  'confirm_age_v2 needs a session (anon cannot execute)');
select ok(has_function_privilege('authenticated', 'public.confirm_age_v2(text, text, date)', 'execute'),
  'authenticated can execute confirm_age_v2');

-- 2. Exactly 13 today (campus time) -----------------------------------------------------------
select is(tests.try_text_as(pg_temp.u(1), $$select public.confirm_age_v2('self_declared', null, '2013-09-26') ->> 'eligible'$$),
  'true', 'exactly 13 is eligible');
select is(pg_temp.band(1), '13_17', 'exactly 13 gets band 13_17');
select is((select age_method::text from public.profiles where id = pg_temp.u(1)), 'self_declared', 'method recorded');
select isnt((select adult_confirmed_at from public.profiles where id = pg_temp.u(1)), null, 'exactly 13 is confirmed');

-- 3. 12 years 364 days ---------------------------------------------------------------------------
select is(tests.try_text_as(pg_temp.u(2), $$select public.confirm_age_v2('self_declared', null, '2013-09-27')::text$$)::jsonb,
  '{"eligible": false, "age_band": null}'::jsonb, '12 years 364 days is not eligible, no band');
select ok(pg_temp.blocked(2), 'under 13: the email hash is age-blocked');
select is((select adult_confirmed_at from public.profiles where id = pg_temp.u(2)), null, 'under 13 stays unconfirmed');

-- 4. No retry passes after an under-13 answer -----------------------------------------------------
delete from public.rate_counters;
select is(tests.try_text_as(pg_temp.u(2), $$select public.confirm_age_v2('os_signal', '18_plus') ->> 'eligible'$$),
  'false', 'retry with os_signal 18_plus is refused');
select is(tests.try_text_as(pg_temp.u(2), $$select public.confirm_age_v2('self_declared', null, '1990-01-01') ->> 'eligible'$$),
  'false', 'retry with an adult birth date is refused');
select is(tests.try_text_as(pg_temp.u(2), $$select public.confirm_age('os_signal', true) ->> 'adult'$$),
  'false', 'retry through v1 is refused');
select ok((select adult_confirmed_at is null and age_method is null and age_band is null from public.profiles where id = pg_temp.u(2)),
  'the blocked account stays unconfirmed');
select is(tests.try_text_as(pg_temp.u(2), $$select public.get_feed(null, 20)::text$$), 'ERROR: AGE_REQUIRED',
  'and still cannot use the app');
delete from public.rate_counters;

-- 5. Edges of the 13_17 band ----------------------------------------------------------------------
select is(tests.try_text_as(pg_temp.u(3), $$select public.confirm_age_v2('self_declared', null, '2008-09-27') ->> 'age_band'$$),
  '13_17', '17 years 364 days gets 13_17');
select is(pg_temp.band(3), '13_17', '17 years 364 days stored as 13_17');
select is(tests.try_text_as(pg_temp.u(4), $$select public.confirm_age_v2('self_declared', null, '2008-09-26') ->> 'age_band'$$),
  '18_plus', 'exactly 18 gets 18_plus');
select is(pg_temp.band(4), '18_plus', 'exactly 18 stored as 18_plus');

-- 6. OS signal bands ------------------------------------------------------------------------------
select is(tests.try_text_as(pg_temp.u(5), $$select public.confirm_age_v2('os_signal', '13_17') ->> 'age_band'$$),
  '13_17', 'os_signal 13_17 gets 13_17');
select is((select age_method::text || '|' || age_band from public.profiles where id = pg_temp.u(5)), 'os_signal|13_17',
  'os_signal 13_17 stored with method os_signal');
select is(tests.try_text_as(pg_temp.u(6), $$select public.confirm_age_v2('os_signal', '18_plus') ->> 'age_band'$$),
  '18_plus', 'os_signal 18_plus gets 18_plus');
select is(tests.try_text_as(pg_temp.u(7), $$select public.confirm_age_v2('os_signal', 'under_13') ->> 'eligible'$$),
  'false', 'os_signal under_13 is not eligible');
select ok(pg_temp.blocked(7), 'os_signal under_13: the email hash is age-blocked');
select is((select adult_confirmed_at from public.profiles where id = pg_temp.u(7)), null, 'os_signal under_13 stays unconfirmed');

-- 7. Errors -----------------------------------------------------------------------------------------
select is(tests.try_text_as(pg_temp.u(8), $$select public.confirm_age_v2('os_signal')::text$$),
  'ERROR: INVALID:band', 'os_signal needs a band');
select is(tests.try_text_as(pg_temp.u(8), $$select public.confirm_age_v2('os_signal', 'adult')::text$$),
  'ERROR: INVALID:band', 'os_signal refuses an unknown band');
delete from public.rate_counters;
select is(tests.try_text_as(pg_temp.u(8), $$select public.confirm_age_v2('guess', '18_plus')::text$$),
  'ERROR: INVALID:method', 'unknown method');
select is(tests.try_text_as(pg_temp.u(8), $$select public.confirm_age_v2('self_declared', null, '2030-01-01')::text$$),
  'ERROR: INVALID:birth_date', 'future date refused');
select is((select adult_confirmed_at from public.profiles where id = pg_temp.u(8)), null, 'errors leave the account unconfirmed');
delete from public.rate_counters;

-- 8. Idempotent; a confirmed band is never overwritten ---------------------------------------------
select is(tests.try_text_as(pg_temp.u(1), $$select public.confirm_age_v2('os_signal', '18_plus')::text$$)::jsonb,
  '{"eligible": true, "age_band": "13_17"}'::jsonb, 'calling again after 13_17 returns 13_17');
select is(pg_temp.band(1), '13_17', 'the stored band stays 13_17');

-- 9. v1 is unchanged ----------------------------------------------------------------------------------
select is(tests.try_text_as(pg_temp.u(9), $$select public.confirm_age('self_declared', null, '2008-09-27')::text$$),
  '{"adult": false}', 'v1 still treats 17 years 364 days as a minor');
select ok(pg_temp.blocked(9), 'v1 minor answer still blocks the email hash');
select is(tests.try_text_as(pg_temp.u(10), $$select public.confirm_age('os_signal', true)::text$$),
  '{"adult": true}', 'v1 adult answer');
select is(pg_temp.band(10), '18_plus', 'a v1 adult gets band 18_plus (trigger default)');

-- 10. A reset clears the band ---------------------------------------------------------------------------
select lives_ok($$update public.profiles set adult_confirmed_at = null where id = '00000000-0000-4000-8000-000000000210'$$,
  'clearing adult_confirmed_at on a confirmed row raises nothing');
select is(pg_temp.band(10), null, 'clearing adult_confirmed_at clears age_band');

-- 11. Constraints ----------------------------------------------------------------------------------------
select throws_ok($$update public.profiles set age_band = 'bogus' where id = '00000000-0000-4000-8000-000000000203'$$,
  '23514', null, 'a confirmed row refuses an unknown band');
select lives_ok($$update public.profiles set age_band = '13_17' where id = '00000000-0000-4000-8000-000000000210'$$,
  'setting a band on an unconfirmed row does not raise');
select is(pg_temp.band(10), null, 'an unconfirmed row keeps age_band null (trigger)');
select is((select count(*)::int from public.profiles where adult_confirmed_at is not null and age_band is null), 0,
  'every confirmed profile has a band (v1, seeds, fixtures included)');

-- 12. Still no birth date anywhere ------------------------------------------------------------------------
select is(
  (select count(*)::int from information_schema.columns c
   where c.table_schema in ('public', 'private') and c.data_type = 'date'
     and c.column_name ~ '(birth|dob)'),
  0, 'no birth-date column exists anywhere');

-- 13. Underage deletion still works after a v2 block -------------------------------------------------------
select lives_ok($$select private.prepare_account_deletion('00000000-0000-4000-8000-000000000202', true)$$,
  'underage deletion runs for a v2-blocked account');
select is(private.prepare_account_deletion(pg_temp.u(7), true) ->> 'email', null,
  'underage deletion returns no email (no goodbye email)');

select * from finish();
rollback;
