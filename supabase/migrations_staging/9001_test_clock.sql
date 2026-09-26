-- 9001_test_clock.sql (P3-TEST-02). STAGING ONLY: never applied to production
-- (RELEASE.md; checked by scripts/verify/check-staging-migrations.mjs).
-- Lets E2E runs move the server clock: private.now() reads an override row.
do $$
begin
  if current_setting('app.env', true) = 'prod' then
    raise exception 'migrations_staging must never run on production';
  end if;
end;
$$;

create table if not exists private.test_clock (
  id boolean primary key default true check (id),
  now_override timestamptz
);

create or replace function private.now()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce((select now_override from private.test_clock where id), now())
$$;

-- Service role only (E2E setup scripts). Pass null to go back to real time.
create or replace function public.test_set_now(ts timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.test_clock (id, now_override) values (true, ts)
  on conflict (id) do update set now_override = excluded.now_override;
  return private.now();
end;
$$;

revoke all on function public.test_set_now(timestamptz) from public, anon, authenticated;
grant execute on function public.test_set_now(timestamptz) to service_role;
revoke all on table private.test_clock from public, anon, authenticated;
