-- P3-DB-02..06, P3-DB-08, T-SEC-19: every R1.0 table exists; RLS is on
-- everywhere; anon has no table privileges; authenticated only SELECT where a
-- policy exists, plus UPDATE of three preference columns on profiles.
begin;
select plan(9);

select tables_are(
  'public',
  array[
    -- 0002 campus and identity
    'campuses','campus_domains','profiles','review_accounts','age_blocks','banned_hashes',
    'waitlist_requests','admins','app_config','activity_days','common_first_names',
    -- 0003 listings
    'categories','listings','listing_photos','listing_reservations','listing_price_changes',
    'swipes','saves','watches','saved_searches',
    -- 0004 deals
    'offers','chats','messages','safe_spots','meetups','noshow_reports','ratings','blocks',
    -- 0005 safety and ops
    'reports','strikes','appeals','banned_words','audit_log','rate_counters',
    'support_requests','daily_counters',
    -- 0006 notifications and email
    'notifications','notification_prefs','push_tokens','push_tickets','email_outbox',
    'announcements','data_exports',
    -- 0200 Quad (R1.1, DEC 76)
    'quad_posts','quad_replies','quad_votes','quad_poll_options','quad_poll_votes','quad_hides','quad_mutes'
  ],
  'public has exactly the tables from DATA_MODEL §2.1 to §2.6'
);

-- T-SEC-19 (early form): no public table without RLS.
select is(
  array(
    select c.relname::text from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
    order by 1
  ),
  array[]::text[],
  'RLS is enabled on every public table'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'),
  0,
  'T-SEC-19: anon has no table privileges (its reads are RPCs)'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated' and privilege_type <> 'SELECT'),
  0,
  'authenticated has no INSERT, UPDATE or DELETE on any whole table'
);

select is(
  array(select column_name::text from information_schema.column_privileges
        where table_schema = 'public' and table_name = 'profiles'
          and grantee = 'authenticated' and privilege_type = 'UPDATE'
        order by 1),
  array['analytics_opt_in','crash_reports_opt_in','theme_mode'],
  'the only direct write is the three preference columns on profiles'
);

select is(
  array(select g.table_name::text from information_schema.role_table_grants g
        where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type = 'SELECT'
          and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relname = g.table_name and c.relkind = 'r')
          and not exists (select 1 from pg_policies p
                          where p.schemaname = 'public' and p.tablename = g.table_name)
        order by 1),
  array[]::text[],
  'every table authenticated can SELECT has a policy'
);

select is(
  (select count(*)::int from information_schema.role_usage_grants
   where object_schema = 'public' and object_type = 'SEQUENCE' and grantee in ('anon','authenticated')),
  0,
  'anon and authenticated have no sequence privileges'
);

select ok(
  not has_table_privilege('authenticated', 'public.messages', 'insert')
    and not has_table_privilege('authenticated', 'public.listings', 'update')
    and not has_table_privilege('authenticated', 'public.reports', 'insert')
    and not has_table_privilege('anon', 'public.listings', 'select'),
  'spot check: direct writes are denied'
);

select is(
  (select relpersistence from pg_class where oid = 'public.rate_counters'::regclass),
  'u'::"char",
  'rate_counters is unlogged (BE-16)'
);

select * from finish();
rollback;
