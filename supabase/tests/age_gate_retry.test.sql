-- A-03 (audit): after confirm_age says minor, the same account (or a new
-- account on the same email) can't retry and pass. SECURITY T4, F02.
begin;
select plan(8);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set adult_confirmed_at = null, age_method = null where id in (tests.uid('B'), tests.uid('C'));

select is(tests.try_text_as(tests.uid('B'), $$select public.confirm_age('os_signal', false)::text$$), '{"adult": false}',
  'B answers minor');
select is((select count(*)::int from public.age_blocks where email_hash = (select email_hash from public.profiles where id = tests.uid('B'))), 1,
  'the email hash is blocked');
select is(tests.try_text_as(tests.uid('B'), $$select public.confirm_age('os_signal', true)::text$$), '{"adult": false}',
  'a retry with os_signal true is refused');
select is(tests.try_text_as(tests.uid('B'), $$select public.confirm_age('self_declared', null, '1990-01-01')::text$$), '{"adult": false}',
  'a retry with an adult birth date is refused');
select ok((select adult_confirmed_at is null and age_method is null from public.profiles where id = tests.uid('B')),
  'the account stays unconfirmed');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_feed(null, 20)::text$$), 'ERROR: AGE_REQUIRED',
  'and still cannot use the app');

-- Someone else is not affected.
select is(tests.try_text_as(tests.uid('C'), $$select public.confirm_age('os_signal', true)::text$$), '{"adult": true}',
  'another student still passes');
select is(tests.try_text_as(tests.uid('A'), $$select public.confirm_age('os_signal', false)::text$$), '{"adult": true}',
  'an already confirmed adult stays confirmed (answer ignored)');

select * from finish();
rollback;
