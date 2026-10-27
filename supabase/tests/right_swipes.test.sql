-- DEC 106: a right swipe is stored as 'right', not 'left', so the admin
-- "passed" counts only count real passes (T-INT-FEED-RIGHT).
begin;
select plan(9);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, title, status, bumped_at, expires_at, price_cents) values
  ('00000000-0000-4000-8000-000000000e01', tests.uid('OSU'), tests.uid('A'), 'Desk lamp',   'active', '2027-03-10 11:00-05', '2027-05-01', 1500),
  ('00000000-0000-4000-8000-000000000e02', tests.uid('OSU'), tests.uid('A'), 'Mini fridge', 'active', '2027-03-10 10:00-05', '2027-05-01', 6000);

create function pg_temp.as_mod(q text) returns text language plpgsql as $$
declare
  res text;
begin
  perform tests.authenticate_as(tests.uid('MOD'), 'aal2');
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;

select ok(tests.try_ok_as(tests.uid('B'), $$select public.record_swipes('[
  {"listing_id": "00000000-0000-4000-8000-000000000e01", "dir": "right", "at": "2027-03-10T16:00:00Z", "dwell_ms": 4000},
  {"listing_id": "00000000-0000-4000-8000-000000000e02", "dir": "left",  "at": "2027-03-10T16:01:00Z"}]'::jsonb)$$),
  'a batch with a right and a left swipe is accepted');
select is((select dir::text from public.swipes where user_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000e01'),
  'right', 'the right swipe is stored as right');
select is((select dwell_ms from public.swipes where user_id = tests.uid('B') and listing_id = '00000000-0000-4000-8000-000000000e01'),
  4000, 'with its time on card');
select is(tests.try_text_as(tests.uid('B'), $$select count(*)::text from jsonb_array_elements(public.get_feed()) i
  where i ->> 'id' in ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000e02')$$),
  '0', 'neither card comes back on the deck');

-- Admin counts ------------------------------------------------------------------------------------
select is(pg_temp.as_mod(format($$select public.admin_person(%L) -> 'counts' ->> 'left'$$, tests.uid('B'))),
  '1', 'the person page counts one pass, not two');
select is(pg_temp.as_mod($$select public.admin_listing_activity('00000000-0000-4000-8000-000000000e01') -> 'swipes' ->> 'left'$$),
  '0', 'the listing a person swiped right on shows no pass');
select is(pg_temp.as_mod($$select public.admin_listing_activity('00000000-0000-4000-8000-000000000e02') -> 'swipes' ->> 'left'$$),
  '1', 'the other listing shows its pass');

-- Retention ---------------------------------------------------------------------------------------
update public.swipes set created_at = '2027-01-01' where user_id = tests.uid('B');
insert into public.swipes (user_id, listing_id, dir, created_at) values
  (tests.uid('C'), '00000000-0000-4000-8000-000000000e01', 'save', '2027-01-01');
select lives_ok($$select private.prune_retention()$$, 'the retention job runs');
select is((select string_agg(dir::text, ',' order by dir::text) from public.swipes
           where listing_id in ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000e02')),
  'save', 'right and left swipes go after 30 days, saves stay');

select * from finish();
rollback;
