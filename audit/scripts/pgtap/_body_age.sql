-- Age gate (SECURITY T4): server trusts the client's os_signal / birth date. These document current behaviour.
update public.profiles set adult_confirmed_at = null, age_method = null where id = tests.uid('B');
select is(pg_temp.as('B', $$select public.confirm_age('os_signal', false)::text$$), '{"adult": false}', 'B is told they are not an adult (os_signal false)');
select is((select count(*)::int from public.age_blocks), 1, 'an age_blocks hash was written');
select is(pg_temp.as('B', $$select public.confirm_age('os_signal', true)::text$$), '{"adult": false}',
  'AGE-GATE: after a minor result the same account cannot simply retry with os_signal=true');
select is((select adult_confirmed_at is null from public.profiles where id = tests.uid('B')), true, 'AGE-GATE: the account stays unconfirmed after the retry');
update public.profiles set adult_confirmed_at = null, age_method = null where id = tests.uid('C');
select is(pg_temp.as('C', $$select public.confirm_age('os_signal', true)::text$$), '{"adult": true}', 'INFO: os_signal=true is accepted with no server-side evidence (client-asserted)');
update public.profiles set adult_confirmed_at = null, age_method = null where id = tests.uid('E') or id = '00000000-0000-4000-8000-0000000000f3';
select is(pg_temp.as('E', $$select public.confirm_age('self_declared', null, '1990-01-01')::text$$), '{"adult": true}', 'INFO: self_declared accepts any birth date typed by the client');
