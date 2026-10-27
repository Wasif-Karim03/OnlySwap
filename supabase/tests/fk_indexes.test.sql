-- E-15 (audit): every foreign key on a table that grows has an index on its
-- column, so account deletion (ON DELETE SET NULL / CASCADE into profiles) and
-- offer clean-up never seq-scan messages, meetups, ratings and the like.
-- Allowed: FKs into small reference tables nobody deletes from at runtime.
begin;
select plan(1);

select is(
  array(
    select c.conrelid::regclass::text || '.' || a.attname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and cardinality(c.conkey) = 1
      and c.confrelid not in ('public.campuses'::regclass, 'public.categories'::regclass)
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
    order by 1),
  array[]::text[],
  'every foreign key outside reference tables is indexed');

select * from finish();
rollback;
