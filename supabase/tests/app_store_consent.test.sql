-- T-INT-CONSENT (AR-04, DEC 136): link_app_transaction and
-- private.rescind_consent (RESCIND_CONSENT from the App Store).
begin;
select plan(20);
select tests.create_fixtures();
select tests.set_now('2026-09-26 12:00:00-04');

-- 1. Grants and RLS -------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.link_app_transaction(text)', 'execute'),
  'anon cannot link');
select ok(has_function_privilege('authenticated', 'public.link_app_transaction(text)', 'execute'),
  'authenticated can link');
select ok(not has_function_privilege('authenticated', 'private.rescind_consent(text)', 'execute'),
  'clients cannot rescind consent');
select ok(not has_table_privilege('authenticated', 'public.app_transactions', 'select'),
  'clients cannot read app_transactions');
select ok(not has_table_privilege('authenticated', 'public.app_transactions', 'insert'),
  'clients cannot write app_transactions directly');
select is((select relrowsecurity from pg_class where oid = 'public.app_transactions'::regclass), true,
  'RLS is on');

-- 2. Linking ----------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select public.link_app_transaction('704289572311552426')::text$$),
  '', 'A links an appTransactionId');
select is(tests.try_text_as(tests.uid('A'), $$select public.link_app_transaction('704289572311552426')::text$$),
  '', 'linking again is fine (idempotent)');
select is((select count(*)::int from public.app_transactions where user_id = tests.uid('A')), 1,
  'one row per id and user');
select is(tests.try_text_as(tests.uid('B'), $$select public.link_app_transaction('704289572311552426')::text$$),
  '', 'B on the same Apple account links too');
select is(tests.try_text_as(tests.uid('A'), $$select public.link_app_transaction('bad id; drop')::text$$),
  'ERROR: INVALID:app_transaction_id', 'odd characters refused');
select is(tests.try_text_as(tests.uid('A'), $$select public.link_app_transaction(repeat('9', 65))::text$$),
  'ERROR: INVALID:app_transaction_id', 'over 64 characters refused');

-- 3. Rescind ----------------------------------------------------------------------------------------
create temp table before_counts as
  select (select count(*) from public.listings where seller_id = tests.uid('A')) as listings,
         (select count(*) from public.offers) as offers;
select is(private.rescind_consent('704289572311552426'), 2, 'both linked accounts are locked');
select is((select status::text from public.profiles where id = tests.uid('A')), 'suspended', 'A suspended');
select is((select status_reason from public.profiles where id = tests.uid('A')), 'parental_consent',
  'reason parental_consent');
select is((select parental_consent from public.profiles where id = tests.uid('A')), 'revoked',
  'parental_consent revoked');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_feed(null, 20)::text$$),
  'ERROR: NOT_ACTIVE:suspended', 'a locked account cannot use the app');
select is(private.rescind_consent('704289572311552426'), 2, 'a repeated notification changes nothing new');
select is(private.rescind_consent('000000000000000000'), 0, 'an unknown id locks nobody');

-- 4. Deal data is kept --------------------------------------------------------------------------------
select ok((select listings from before_counts) =
            (select count(*) from public.listings where seller_id = tests.uid('A'))
          and (select offers from before_counts) = (select count(*) from public.offers),
  'listings and offers are kept');

select * from finish();
rollback;
