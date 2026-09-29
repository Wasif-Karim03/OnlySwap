-- 9002_e2e_domain.sql (P14-E2E-00). STAGING ONLY. E2E sign-ups use
-- e2e+<n>@e2e.onlyswap.test on the OSU test campus; codes come from the
-- staging-only test-inbox function.
do $$
begin
  if current_setting('app.env', true) = 'prod' then
    raise exception 'migrations_staging must never run on production';
  end if;
end;
$$;

insert into public.campus_domains (domain, campus_id, kind)
select 'e2e.onlyswap.test', c.id, 'student' from public.campuses c where c.slug = 'osu'
on conflict (domain) do nothing;
