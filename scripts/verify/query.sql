-- Simulator pass 3: a demo-campus bot makes an offer on the reviewer's newest listing.
do $$
declare
  rv uuid; lst uuid; bot uuid; res jsonb;
begin
  select u.id into rv from auth.users u where u.email = 'appreview@review.onlyswap.test';
  select id into lst from public.listings where seller_id = rv and status = 'active' and deleted_at is null order by created_at desc limit 1;
  select p.id into bot from public.profiles p
    where p.campus_id = (select campus_id from public.profiles where id = rv)
      and p.id <> rv and not exists (select 1 from public.offers o where o.listing_id = lst and o.buyer_id = p.id)
    order by p.created_at limit 1;
  raise notice 'reviewer % listing % bot %', rv, lst, bot;
  perform set_config('request.jwt.claim.sub', bot::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', bot, 'role', 'authenticated')::text, true);
  select to_jsonb(public.make_offer(lst, 1200, 'Can pick up today', '{}')) into res;
  raise notice 'offer %', res;
exception when others then
  raise notice 'error % %', sqlstate, sqlerrm;
end $$;
