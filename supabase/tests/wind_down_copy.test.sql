-- Wind-down copy and listing appeals (0216, DEC 99): a buyer with an open
-- offer hears why the listing closed (removed by OnlySwap, removed by the
-- seller, or sold), not always "sold to someone else"; the seller can appeal
-- an admin removal once, and nobody else can.
begin;
select plan(9);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

create function pg_temp.as_admin(who text, q text) returns text language plpgsql as $$
declare
  res text;
begin
  perform tests.authenticate_as(tests.uid(who), 'aal2');
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;
create function pg_temp.offer_note(offer text) returns text language sql as $$
  select title || '|' || body from public.notifications
  where type = 'offer_declined' and data ->> 'offer_id' = offer
$$;

insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-0000000e9001', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active', 1200),
  ('00000000-0000-4000-8000-0000000e9002', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 'active', 4000),
  ('00000000-0000-4000-8000-0000000e9003', tests.uid('OSU'), tests.uid('A'), 'Bike lock', 'active', 900);
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents) values
  ('00000000-0000-4000-8000-0000000e9101', '00000000-0000-4000-8000-0000000e9001', tests.uid('B'), tests.uid('A'), 1000),
  ('00000000-0000-4000-8000-0000000e9102', '00000000-0000-4000-8000-0000000e9002', tests.uid('B'), tests.uid('A'), 3500),
  ('00000000-0000-4000-8000-0000000e9103', '00000000-0000-4000-8000-0000000e9003', tests.uid('B'), tests.uid('A'), 800);

-- Why it closed ---------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_set_listing_status('00000000-0000-4000-8000-0000000e9001', 'removed', 'Exposed wiring')::text$$),
  '', 'the moderator removes the lamp');
select is(pg_temp.offer_note('00000000-0000-4000-8000-0000000e9101'), 'Offer declined|This listing was removed',
  'an admin removal says removed, not sold');
select ok(tests.try_ok_as(tests.uid('A'), $$select public.delete_listing('00000000-0000-4000-8000-0000000e9002')$$),
  'the seller deletes the fridge');
select is(pg_temp.offer_note('00000000-0000-4000-8000-0000000e9102'), 'Offer declined|The seller removed this listing',
  'a seller removal says so');
select ok(tests.try_ok_as(tests.uid('A'), $$select public.mark_sold('00000000-0000-4000-8000-0000000e9003', null)$$),
  'the seller marks the bike lock sold');
select is(pg_temp.offer_note('00000000-0000-4000-8000-0000000e9103'), 'Offer declined|This item sold to someone else',
  'a sale still says sold');

-- Appeal ------------------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'),
  $$select public.create_appeal('listing', '00000000-0000-4000-8000-0000000e9001', 'mistake', null)::text$$),
  'ERROR: NOT_FOUND', 'another student cannot appeal the removal');
select matches(tests.try_text_as(tests.uid('A'),
  $$select public.create_appeal('listing', '00000000-0000-4000-8000-0000000e9001', 'context', 'It is a new lamp')::text$$),
  '^\{"id": "[0-9a-f-]{36}"\}$', 'the seller appeals the removal');
select is(tests.try_text_as(tests.uid('A'),
  $$select public.create_appeal('listing', '00000000-0000-4000-8000-0000000e9001', 'context', null)::text$$),
  'ERROR: ALREADY_APPEALED', 'a second appeal is refused');

select * from finish();
rollback;
