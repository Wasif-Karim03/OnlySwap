-- S41 P14-SEC-01: the database half of the security suite (TESTING §5).
-- The HTTP half (JWT tampering, OTP lockout, uploads, realtime, function auth)
-- is scripts/verify/security.mjs against a running stack.
begin;
select plan(20);
select tests.create_fixtures();

insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-00000000fa01', tests.uid('OSU'), tests.uid('B'), 'Bike', 'active', 5000),
  ('00000000-0000-4000-8000-00000000fa02', tests.uid('OSU'), tests.uid('A'), 'Desk', 'active', 3000);

-- T-SEC-01: no direct table writes, even on your own rows ---------------------------------
select is(tests.try_text_as(tests.uid('A'),
  $$with u as (update public.listings set price_cents = 1 where id = '00000000-0000-4000-8000-00000000fa01' returning 1) select count(*)::text from u$$),
  'ERROR: permission denied for table listings', 'A cannot update B''s listing directly');
select is(tests.try_text_as(tests.uid('A'),
  $$with u as (update public.listings set status = 'sold' where id = '00000000-0000-4000-8000-00000000fa02' returning 1) select count(*)::text from u$$),
  'ERROR: permission denied for table listings', 'nor its own status');
select is(tests.try_text_as(tests.uid('A'), $$insert into public.offers (listing_id, buyer_id, amount_cents) values ('00000000-0000-4000-8000-00000000fa01', auth.uid(), 1) returning 'x'$$),
  'ERROR: permission denied for table offers', 'no direct offer inserts');
select is(tests.try_text_as(tests.uid('A'), $$delete from public.messages returning 'x'$$),
  'ERROR: permission denied for table messages', 'no direct message deletes');
select is(tests.try_text_as(tests.uid('A'), $$update public.profiles set strike_count = 0 where id = auth.uid() returning 'x'$$),
  'ERROR: permission denied for table profiles', 'no self-service strike reset');
select is(tests.try_text_as(tests.uid('A'), $$insert into public.admins (user_id, role) values (auth.uid(), 'owner') returning 'x'$$),
  'ERROR: permission denied for table admins', 'no self-promotion to admin');
select is(tests.try_text_as(tests.uid('A'), $$select count(*)::text from public.audit_log$$),
  '0', 'students see no audit log rows (RLS)');
select is(tests.try_text_as(tests.uid('A'), $$select count(*)::text from public.email_outbox$$),
  'ERROR: permission denied for table email_outbox', 'nor the email outbox');

-- T-SEC-03: admin RPCs need AAL2 ----------------------------------------------------------
select is((select tests.try_text_as(tests.uid('NOMFA'), 'select public.admin_list_users()::text')),
  'ERROR: NOT_ADMIN', 'an owner without MFA is refused');

-- T-SEC-05: injection-shaped input is data, not SQL -----------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select jsonb_typeof(public.search_listings($q$'); drop table listings;--$q$))$$),
  'array', 'a quote-and-drop query is just a search');
select is(tests.try_text_as(tests.uid('A'), $$select jsonb_typeof(public.search_listings('!!&& | :* <-> (((')) $$),
  'array', 'tsquery operators do not break the parser');
select is((select count(*)::int from pg_tables where schemaname = 'public' and tablename = 'listings'), 1, 'listings is still there');
select is(tests.try_text_as(tests.uid('A'), $$select public.search_listings('lamp', '{"sort": "new", "role": "admin"}')::text$$),
  'ERROR: INVALID:filters', 'unknown filter keys are rejected');
select is(tests.try_text_as(tests.uid('A'), $$select public.search_listings('lamp', '{"min_cents": "1; select 1"}')::text$$),
  'ERROR: INVALID:filters', 'mistyped filter values are rejected');
select is(tests.try_text_as(tests.uid('A'), $$select public.search_listings('lamp', '{"sort": "price_asc; drop table x"}')::text$$),
  'ERROR: INVALID:filters', 'sort is an allow-list');

-- T-SEC-11: share tokens can't be guessed or listed -------------------------------------------
select is(tests.try_text_as(tests.uid('A'), $$select public.get_meetup_share('0123456789abcdef012345')::text$$),
  'ERROR: NOT_FOUND', 'a random token finds nothing');
select is((select count(*)::int from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'meetups' and grantee = 'anon'), 0,
  'anon has no grant on meetups (tokens only through get_meetup_share)');

-- T-SEC-16: realtime topics are private to their members -------------------------------------
select ok((select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages') >= 1
          or not exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages'),
  'realtime.messages has membership policies (checked live by security.mjs)');

-- Every public function is security definer with a fixed search_path -----------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0, 'no security definer function without search_path');
select is((select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')), null,
  'anon can execute nothing in private');

select * from finish();
rollback;
