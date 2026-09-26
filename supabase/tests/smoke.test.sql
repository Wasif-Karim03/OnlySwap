-- P1-DB-01 smoke test: the local stack is up and pgTAP runs.
begin;
select plan(2);

select ok(
  current_setting('server_version_num')::int >= 170000,
  'local Postgres is version 17 or newer (matches Supabase hosted)'
);

select has_schema('auth', 'Supabase auth schema exists');

select * from finish();
rollback;
