-- T-INT-AGE-ASSURE (AR-03, DEC 136): record_age_assurance stores Apple age
-- assurance (regulated, declaration, parental consent) after confirm_age_v2.
begin;
select plan(22);
select tests.create_fixtures();
select tests.set_now('2026-09-26 12:00:00-04');

insert into auth.users (id, email)
select ('00000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid, 'assure_' || n || '@osu.edu'
from generate_series(1, 6) n;
create function pg_temp.u(n int) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid $$;
create function pg_temp.col(n int, c text) returns text language plpgsql as $$
declare r text;
begin
  execute format('select %I::text from public.profiles where id = $1', c) into r using pg_temp.u(n);
  return r;
end $$;

-- 1. Grants and privacy ----------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.record_age_assurance(boolean, text)', 'execute'),
  'anon cannot execute record_age_assurance');
select ok(has_function_privilege('authenticated', 'public.record_age_assurance(boolean, text)', 'execute'),
  'authenticated can execute record_age_assurance');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'parental_consent', 'UPDATE'),
  'clients cannot write parental_consent directly');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'age_regulated', 'UPDATE'),
  'clients cannot write age_regulated directly');
select hasnt_column('public', 'public_profiles', 'parental_consent', 'public_profiles does not show parental_consent');
select hasnt_column('public', 'public_profiles', 'age_declaration', 'public_profiles does not show age_declaration');

-- 2. Only after the age is confirmed; inputs checked -------------------------------------------------
select is(tests.try_text_as(pg_temp.u(1), $$select public.record_age_assurance(true, 'self_declared')::text$$),
  'ERROR: AGE_REQUIRED', 'before confirm_age_v2: AGE_REQUIRED');
select tests.try_text_as(pg_temp.u(1), $$select public.confirm_age_v2('os_signal', '13_17')::text$$);
select is(tests.try_text_as(pg_temp.u(1), $$select public.record_age_assurance(null, 'self_declared')::text$$),
  'ERROR: INVALID:regulated', 'regulated is required');
select is(tests.try_text_as(pg_temp.u(1), $$select public.record_age_assurance(true, 'birthday')::text$$),
  'ERROR: INVALID:declaration', 'unknown declaration refused');

-- 3. Teen in a regulated state: consent granted -------------------------------------------------------
select is(tests.try_text_as(pg_temp.u(1), $$select public.record_age_assurance(true, 'guardian_declared')::text$$)::jsonb,
  '{"regulated": true, "parental_consent": "granted"}'::jsonb, 'regulated teen: consent granted');
select is(pg_temp.col(1, 'age_regulated'), 'true', 'age_regulated stored');
select is(pg_temp.col(1, 'age_declaration'), 'guardian_declared', 'declaration stored');
select is(pg_temp.col(1, 'parental_consent'), 'granted', 'parental_consent stored');

-- 4. Adult in a regulated state: no consent needed ---------------------------------------------------
select tests.try_text_as(pg_temp.u(2), $$select public.confirm_age_v2('os_signal', '18_plus')::text$$);
select is(tests.try_text_as(pg_temp.u(2), $$select public.record_age_assurance(true, 'confirmed')::text$$)::jsonb,
  '{"regulated": true, "parental_consent": null}'::jsonb, 'regulated adult: no consent row');
select is(pg_temp.col(2, 'age_declaration'), 'confirmed', 'adult declaration stored');

-- 5. Teen where the law does not apply ----------------------------------------------------------------
select tests.try_text_as(pg_temp.u(3), $$select public.confirm_age_v2('self_declared', null, '2011-01-01')::text$$);
select is(tests.try_text_as(pg_temp.u(3), $$select public.record_age_assurance(false)::text$$)::jsonb,
  '{"regulated": false, "parental_consent": null}'::jsonb, 'not regulated: no consent');
select is(pg_temp.col(3, 'age_regulated'), 'false', 'age_regulated false stored');
select is(pg_temp.col(3, 'age_declaration'), null, 'no declaration without the OS');

-- 6. Revoked is never overwritten from the client ------------------------------------------------------
update public.profiles set parental_consent = 'revoked' where id = pg_temp.u(1);
select is(tests.try_text_as(pg_temp.u(1), $$select public.record_age_assurance(true, 'guardian_declared')::text$$)::jsonb,
  '{"regulated": true, "parental_consent": "revoked"}'::jsonb, 'revoked stays revoked');
select is(pg_temp.col(1, 'parental_consent'), 'revoked', 'parental_consent still revoked');

-- 7. A later call without a declaration keeps the stored one -------------------------------------------
select tests.try_text_as(pg_temp.u(2), $$select public.record_age_assurance(true)::text$$);
select is(pg_temp.col(2, 'age_declaration'), 'confirmed', 'null declaration keeps the stored one');

-- 8. Constraint: only known consent values -------------------------------------------------------------
select throws_ok($$update public.profiles set parental_consent = 'maybe' where id = pg_temp.u(2)$$,
  '23514', null, 'parental_consent check constraint');

select * from finish();
rollback;
