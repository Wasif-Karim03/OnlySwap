-- WEB-E2E (0245): RPCs that pass the member gate write activity_days, so they
-- must not be STABLE or IMMUTABLE (PostgREST would run them read-only: 405).
begin;
select plan(4);
select tests.create_fixtures();

select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.provolatile in ('s', 'i')
      and p.prosrc ~ 'private\.require_(member|active)\('),
  '', 'no STABLE or IMMUTABLE public function calls require_member or require_active');

-- The way PostgREST calls them: a read-only transaction is not allowed to write,
-- so these run read-write now and return for an active member.
select is(tests.try_text_as(tests.uid('A'), $$select public.unread_count()::text$$) ~ '^[0-9]+$', true,
  'unread_count answers for a member');
select is((select provolatile from pg_proc where oid = 'public.unread_count()'::regprocedure), 'v',
  'unread_count is volatile');
select is((select count(*)::int from pg_proc where proname = 'price_hint' and provolatile <> 'v'), 0,
  'every price_hint is volatile');

select * from finish();
rollback;
