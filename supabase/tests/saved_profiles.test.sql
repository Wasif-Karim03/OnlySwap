-- S21: get_saved (P6-SAVE-01) and get_profile (P6-USER-01).
begin;
select plan(14);
select tests.create_fixtures();
select tests.set_now('2027-03-20 12:00:00-05');

insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-000000000f11', tests.uid('OSU'), tests.uid('A'), 'Desk lamp', 'active', 1200),
  ('00000000-0000-4000-8000-000000000f12', tests.uid('OSU'), tests.uid('A'), 'Old rug', 'sold', 2000),
  ('00000000-0000-4000-8000-000000000f13', tests.uid('OSU'), tests.uid('A'), 'Gone chair', 'deleted', 2000),
  ('00000000-0000-4000-8000-000000000f14', tests.uid('OSU'), tests.uid('C'), 'Bike', 'active', 9000);
insert into public.saves (user_id, listing_id, price_at_save, created_at) values
  (tests.uid('B'), '00000000-0000-4000-8000-000000000f11', 1500, '2027-03-19'),
  (tests.uid('B'), '00000000-0000-4000-8000-000000000f12', 2000, '2027-03-18'),
  (tests.uid('B'), '00000000-0000-4000-8000-000000000f13', 2000, '2027-03-17'),
  (tests.uid('B'), '00000000-0000-4000-8000-000000000f14', 9000, '2027-03-16');

-- get_saved ----------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), $$select string_agg(x ->> 'title', ',') from jsonb_array_elements(public.get_saved()) x$$),
  'Desk lamp,Old rug,Bike', 'saved items newest first, sold kept, deleted dropped');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_saved() -> 0 ->> 'price_at_save'$$), '1500',
  'the price when saved comes along (price dropped to 1200)');
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('C'), tests.uid('B'));
select is(tests.try_text_as(tests.uid('B'), $$select jsonb_array_length(public.get_saved())::text$$), '2', 'blocked sellers drop out');

-- get_profile --------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ->> %L', tests.uid('A'), 'access')), 'ok', 'a seller on my campus');
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ->> %L', tests.uid('A'), 'display_name')), 'Aisha A.', 'name');
select is(tests.try_text_as(tests.uid('B'), format('select jsonb_array_length(public.get_profile(%L) -> %L)::text', tests.uid('A'), 'listings')), '1',
  'only active and on-hold listings');
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ->> %L', tests.uid('A'), 'new_seller')), 'true',
  'no swaps yet: new seller');
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ->> %L', tests.uid('B'), 'access')), 'me', 'my own profile');
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ->> %L', tests.uid('C'), 'access')), 'gone',
  'someone who blocked me is not there');
delete from public.blocks;
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('B'), tests.uid('C'));
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ->> %L', tests.uid('C'), 'access')), 'blocked',
  'someone I blocked shows the blocked state');
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ? %L', tests.uid('C'), 'listings')), 'false',
  'without their listings');
delete from public.blocks;
select is(tests.try_text_as(tests.uid('B'), format('select public.get_profile(%L) ->> %L', tests.uid('D'), 'access')), 'gone',
  'another campus is not visible');

-- Reviews show once both rated or after 7 days
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents)
values ('00000000-0000-4000-8000-0000000000c1', tests.uid('B'), tests.uid('A'), 'Lamp', 1200, 1000);
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up, comment, created_at)
values ('00000000-0000-4000-8000-0000000000c1', tests.uid('B'), tests.uid('A'), true, 'On time', '2027-03-19');
select is(tests.try_text_as(tests.uid('C'), format('select jsonb_array_length(public.get_profile(%L) -> %L)::text', tests.uid('A'), 'reviews')), '0',
  'a one-sided fresh rating stays hidden');
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up, created_at)
values ('00000000-0000-4000-8000-0000000000c1', tests.uid('A'), tests.uid('B'), true, '2027-03-19');
select is(tests.try_text_as(tests.uid('C'), format('select public.get_profile(%L) -> %L -> 0 ->> %L', tests.uid('A'), 'reviews', 'comment')), 'On time',
  'shown once both rated');

select * from finish();
rollback;
