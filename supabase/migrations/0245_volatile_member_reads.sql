-- 0245_volatile_member_reads.sql · WEB-E2E. unread_count and price_hint were
-- STABLE, but they call private.require_member()/require_active(), which
-- records the day in activity_days (an INSERT). PostgREST runs STABLE
-- functions in a read-only transaction, so every call failed with 405
-- (SQLSTATE 25006) for signed-in users: no bell count, no price hint, on the
-- web and on phones. Marking them VOLATILE runs them read-write. Same
-- signatures and results (additive, no client change).
alter function public.unread_count() volatile;
alter function public.price_hint(smallint) volatile;
alter function public.price_hint(smallint, text) volatile;
