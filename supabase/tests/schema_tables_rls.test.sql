-- P3-DB-02..06: every R1.0 table exists; RLS is on everywhere and the API
-- roles have no direct privileges until 0008 grants them (deny by default).
begin;
select plan(6);

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
    'announcements','data_exports'
  ],
  'public has exactly the R1.0 tables from DATA_MODEL §2.1 to §2.5'
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
   where table_schema = 'public' and grantee in ('anon','authenticated')),
  0,
  'anon and authenticated have no table privileges yet (0008 grants them)'
);

select is(
  (select count(*)::int from information_schema.role_usage_grants
   where object_schema = 'public' and object_type = 'SEQUENCE' and grantee in ('anon','authenticated')),
  0,
  'anon and authenticated have no sequence privileges'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'select')
    and not has_table_privilege('anon', 'public.listings', 'select')
    and not has_table_privilege('authenticated', 'public.messages', 'insert'),
  'spot check: direct reads and writes are denied'
);

select is(
  (select relpersistence from pg_class where oid = 'public.rate_counters'::regclass),
  'u'::"char",
  'rate_counters is unlogged (BE-16)'
);

select * from finish();
rollback;
