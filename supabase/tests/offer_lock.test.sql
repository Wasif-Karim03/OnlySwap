-- E-05 (audit): make_offer locks the listing FOR NO KEY UPDATE, not FOR SHARE.
-- FOR SHARE then `update listings set offer_count` deadlocked two first offers
-- on one listing (each held SHARE and waited for the other). The concurrent
-- half is T-INT-OFF-RACE-03 in scripts/verify/offer-race.mjs and
-- audit-style parallel sessions; this pins the lock and the behaviour.
begin;
select plan(5);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

select ok((select prosrc from pg_proc where oid = 'public.make_offer(uuid,int,text,text[])'::regprocedure) like '%for no key update%',
  'make_offer takes the listing FOR NO KEY UPDATE');
select ok((select prosrc from pg_proc where oid = 'public.make_offer(uuid,int,text,text[])'::regprocedure) not like '%for share%',
  'make_offer no longer takes FOR SHARE');

insert into public.listings (id, campus_id, seller_id, title, status, kind, category_id, price_cents)
values ('00000000-0000-4000-8000-0000000c0501', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active', 'sale', 1, 2000);
select ok(tests.try_text_as(tests.uid('B'), $$select public.make_offer('00000000-0000-4000-8000-0000000c0501', 1500)::text$$) like '%"pending"%',
  'B offers');
select ok(tests.try_text_as(tests.uid('C'), $$select public.make_offer('00000000-0000-4000-8000-0000000c0501', 1600)::text$$) like '%"pending"%',
  'C offers on the same listing');
select is((select offer_count from public.listings where id = '00000000-0000-4000-8000-0000000c0501'), 2, 'offer_count counts both');

select * from finish();
rollback;
