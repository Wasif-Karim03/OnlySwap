-- Seller sees an admin removal (0212, DEC 96): removing a listing (one, in
-- bulk, or from a report) tells the seller with the admin's reason and shows
-- the reason on their own listing; other students never get the reason;
-- putting it back clears it and tells the seller it is live again.
begin;
select plan(18);
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
create function pg_temp.last_note(who text) returns text language sql as $$
  select type || '|' || title || '|' || body || '|' || (data ->> 'listing_id')
  from public.notifications where user_id = tests.uid(who) order by id desc limit 1
$$;

insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-0000000d9001', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active', 1200),
  ('00000000-0000-4000-8000-0000000d9002', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 'active', 4000),
  ('00000000-0000-4000-8000-0000000d9003', tests.uid('OSU'), tests.uid('A'), 'Bike lock', 'active', 900),
  ('00000000-0000-4000-8000-0000000d9004', tests.uid('OSU'), tests.uid('A'), 'Coffee maker', 'active', 1500);

-- One listing ---------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_set_listing_status('00000000-0000-4000-8000-0000000d9001', 'removed', 'Lamps with exposed wiring are not allowed')::text$$),
  '', 'the moderator removes one listing');
select is(pg_temp.last_note('A'),
  'listing_removed|Your listing was removed|OnlySwap removed Desk lamp. Reason: Lamps with exposed wiring are not allowed|00000000-0000-4000-8000-0000000d9001',
  'the seller is told, with the reason, and the tap opens the listing');
select is((select grp from public.notifications where user_id = tests.uid('A') order by id desc limit 1), 'selling',
  'in the selling group');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_listing('00000000-0000-4000-8000-0000000d9001') ->> 'removed_reason'$$),
  'Lamps with exposed wiring are not allowed', 'the seller sees the reason on the listing');
select is(tests.try_text_as(tests.uid('A'),
  $$select x ->> 'removed_reason' from jsonb_array_elements(public.my_listings()) x where x ->> 'id' = '00000000-0000-4000-8000-0000000d9001'$$),
  'Lamps with exposed wiring are not allowed', 'and in My listings');
select is(tests.try_text_as(tests.uid('A'),
  $$select coalesce(x ->> 'removed_reason', 'none') from jsonb_array_elements(public.my_listings()) x where x ->> 'id' = '00000000-0000-4000-8000-0000000d9002'$$),
  'none', 'a live listing has no reason');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_listing('00000000-0000-4000-8000-0000000d9001')::text$$),
  '{"id": "00000000-0000-4000-8000-0000000d9001", "access": "gone"}', 'another student never gets the reason');
select ok(tests.try_text_as(tests.uid('A'), $$select count(*)::text from public.listing_removals$$) ~ '^ERROR: permission denied',
  'the removals table is closed to the API');

-- Put back -------------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_set_listing_status('00000000-0000-4000-8000-0000000d9001', 'active', 'Checked again, the wiring is covered')::text$$),
  '', 'the moderator puts it back');
select is(pg_temp.last_note('A'), 'listing_restored|Your listing is back|Desk lamp is live again.|00000000-0000-4000-8000-0000000d9001',
  'the seller is told it is live again');
select is(tests.try_text_as(tests.uid('A'), $$select coalesce(public.get_listing('00000000-0000-4000-8000-0000000d9001') ->> 'removed_reason', 'none')$$),
  'none', 'the reason is cleared');
select is((select count(*)::int from public.listing_removals), 0, 'no removal row left');

-- Bulk -----------------------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select (public.admin_bulk_set_listing_status(array['00000000-0000-4000-8000-0000000d9002', '00000000-0000-4000-8000-0000000d9003']::uuid[], 'removed', 'Selling outside the campus rules') ->> 'changed')$$),
  '2', 'bulk removal');
select is((select count(*)::int from public.notifications where user_id = tests.uid('A') and type = 'listing_removed'
            and body like '%Reason: Selling outside the campus rules'), 2, 'one notice per removed listing, each with the reason');
select is(pg_temp.as_admin('MOD', $$select (public.admin_bulk_set_listing_status(array['00000000-0000-4000-8000-0000000d9002']::uuid[], 'active', 'Appeal accepted') ->> 'changed')$$),
  '1', 'bulk put back');
select is(pg_temp.last_note('A'), 'listing_restored|Your listing is back|Mini fridge is live again.|00000000-0000-4000-8000-0000000d9002',
  'bulk put back tells the seller');

-- From a report --------------------------------------------------------------------------------------
insert into public.reports (id, campus_id, reporter_id, target_type, target_id, target_user_id, reason, priority) values
  ('00000000-0000-4000-8000-0000000d9e01', tests.uid('OSU'), tests.uid('B'), 'listing', '00000000-0000-4000-8000-0000000d9004', tests.uid('A'), 'scam', 2);
select is(pg_temp.as_admin('MOD', $$select public.admin_resolve_report('00000000-0000-4000-8000-0000000d9e01', 'remove_content', 'Photos are from another website')::text$$), '', 'the report is resolved by removing the listing');
select is(pg_temp.last_note('A'),
  'listing_removed|Your listing was removed|OnlySwap removed Coffee maker. Reason: Photos are from another website|00000000-0000-4000-8000-0000000d9004',
  'removing it from a report tells the seller too');

select * from finish();
rollback;
