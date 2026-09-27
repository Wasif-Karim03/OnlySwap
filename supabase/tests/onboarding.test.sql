-- S14: T-FN-06 (database half of waitlist-request) and the rules re-accept
-- gate (P4-AUTH-17, PM-04): a new rules_version blocks writes until accepted.
begin;
select plan(18);
select tests.create_fixtures();
select tests.set_pepper();
select vault.create_secret('test-waitlist-key-not-a-secret', 'waitlist_email_key')
where not exists (select 1 from vault.decrypted_secrets where name = 'waitlist_email_key');

-- waitlist: stored encrypted, hashed, de-duplicated -------------------------------------------
select lives_ok($$select private.record_waitlist_request(' New.Student@Unknown.EDU ', '203.0.113.5')$$,
  'a request is recorded');
select is((select count(*)::int from public.waitlist_requests), 1, 'one row');
select is((select domain from public.waitlist_requests), 'unknown.edu', 'the domain is kept for matching');
select is(
  (select extensions.pgp_sym_decrypt(email_enc, (select decrypted_secret from vault.decrypted_secrets
     where name = 'waitlist_email_key' order by created_at desc limit 1)) from public.waitlist_requests),
  'new.student@unknown.edu', 'the address is only stored encrypted (normalized)');
select is((select email_hash from public.waitlist_requests), private.email_hash('new.student@unknown.edu'),
  'the hash is the peppered email hash');
select lives_ok($$select private.record_waitlist_request('NEW.STUDENT@unknown.edu', '203.0.113.6')$$,
  'a duplicate is a silent success');
select is((select count(*)::int from public.waitlist_requests), 1, 'still one row');
select throws_ok($$select private.record_waitlist_request('not-an-email', '203.0.113.7')$$,
  'P0001', 'INVALID:email', 'a malformed address is refused');

-- IP limit: 5 per hour per address; another address is unaffected
select tests.set_now('2027-02-01 10:05:00+00');
select lives_ok($$select private.record_waitlist_request('s' || g || '@a.edu', '198.51.100.9')
                  from generate_series(1, 5) g$$, 'five requests from one IP');
select throws_like($$select private.record_waitlist_request('s6@a.edu', '198.51.100.9')$$,
  'RATE_LIMITED:ip:waitlist:%', 'the sixth in the hour is rate limited');
select lives_ok($$select private.record_waitlist_request('s6@a.edu', '198.51.100.10')$$,
  'another IP is not affected');
select is(private.ip_key('198.51.100.9'), private.ip_key(' 198.51.100.9 '), 'the IP key ignores spaces');

-- only the service role may call it
select ok(not has_function_privilege('anon', 'private.record_waitlist_request(text, text)', 'execute'),
  'anon cannot call it directly');
select ok(not has_function_privilege('authenticated', 'private.record_waitlist_request(text, text)', 'execute'),
  'signed-in users cannot call it directly');

-- rules_changes is public config ----------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select public.get_app_config() -> 'rules_changes'$$), '[]',
  'rules_changes is public and empty by default');

-- P4-AUTH-17: a new rules version blocks writes until accepted ----------------------------------
update public.app_config set value = '"2"' where key = 'rules_version';
update public.app_config set value = '["Fakes are now on the banned list."]' where key = 'rules_changes';
select is(tests.try_text_as(tests.uid('A'), format('select public.block_user(%L)::text', tests.uid('B'))),
  'ERROR: RULES_REQUIRED', 'an old acceptance no longer passes require_active (a write is refused)');
select ok(tests.try_ok_as(tests.uid('A'), $$select public.accept_rules('2')$$), 'the new version is accepted');
select ok(tests.try_ok_as(tests.uid('A'), format('select public.block_user(%L)', tests.uid('B'))),
  'after accepting, writes are allowed again');

select * from finish();
rollback;
