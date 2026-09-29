-- P3-DB-04: offers, chats, meetups and ratings (DATA_MODEL §2.3).
-- Deal data survives deletions: FKs into deals are `set null` and chats keep
-- a snapshot (CLAUDE.md rule 6, BE-01).
begin;
select plan(17);

insert into public.campuses (id, slug, name, short_name, status)
values ('00000000-0000-4000-8000-00000000c001', 'test-u', 'Test University', 'Test U', 'live');
-- The on_auth_user_created trigger (0010) needs a known school domain and
-- the email_hash pepper; it makes the profile, which this test then fills in.
select tests.set_pepper();
insert into public.campus_domains (domain, campus_id, kind)
values ('test.edu', '00000000-0000-4000-8000-00000000c001', 'student') on conflict do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'seller@test.edu'),
  ('00000000-0000-4000-8000-0000000000b1', 'buyer@test.edu');
insert into public.profiles (id, campus_id, email_hash, first_name, verified_until) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'h1', 'Sella', current_date + 365),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001', 'h2', 'Bea', current_date + 365)
on conflict (id) do update set campus_id = excluded.campus_id, email_hash = excluded.email_hash, first_name = excluded.first_name, verified_until = excluded.verified_until;
insert into public.listings (id, campus_id, seller_id, title, price_cents)
values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-00000000c001',
        '00000000-0000-4000-8000-0000000000a1', 'Desk lamp', 1200);

insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents)
values ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000001a1',
        '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 1000);

select ok(
  (select expires_at between now() + interval '47 hours 59 minutes' and now() + interval '48 hours 1 minute'
   from public.offers where id = '00000000-0000-4000-8000-0000000002a1'),
  'offers expire 48 hours after creation'
);
select throws_ok(
  $$insert into public.offers (listing_id, buyer_id, seller_id, amount_cents)
    values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000000b1',
            '00000000-0000-4000-8000-0000000000a1', 900)$$,
  '23505', null, 'one open offer per listing and buyer (offers_one_open)'
);
update public.offers set status = 'declined' where id = '00000000-0000-4000-8000-0000000002a1';
select lives_ok(
  $$insert into public.offers (listing_id, buyer_id, seller_id, amount_cents)
    values ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000000b1',
            '00000000-0000-4000-8000-0000000000a1', 1100)$$,
  'a buyer can offer again after a decline'
);
select throws_ok(
  $$update public.offers set round = 5 where id = '00000000-0000-4000-8000-0000000002a1'$$,
  '23514', null, 'at most 4 counter rounds'
);
select throws_ok(
  $$update public.offers set amount_cents = -1 where id = '00000000-0000-4000-8000-0000000002a1'$$,
  '23514', null, 'offer amount cannot be negative ($0 is "Ask for it")'
);

update public.offers set status = 'accepted' where id = '00000000-0000-4000-8000-0000000002a1';
update public.listings set status = 'hold', hold_offer_id = '00000000-0000-4000-8000-0000000002a1'
where id = '00000000-0000-4000-8000-0000000001a1';
select throws_ok(
  $$update public.listings set hold_offer_id = gen_random_uuid() where id = '00000000-0000-4000-8000-0000000001a1'$$,
  '23503', null, 'hold_offer_id must point at a real offer'
);

insert into public.chats (id, listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents)
values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000001a1',
        '00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000000b1',
        '00000000-0000-4000-8000-0000000000a1', 'Desk lamp', 1200, 1000);
insert into public.messages (chat_id, sender_id, body, client_id)
values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000000b1', 'Hi', '00000000-0000-4000-8000-0000000004a1');
select throws_ok(
  $$insert into public.messages (chat_id, sender_id, body, client_id)
    values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000000b1', 'Hi', '00000000-0000-4000-8000-0000000004a1')$$,
  '23505', null, 'a resent message with the same client_id is rejected (idempotent send)'
);

insert into public.safe_spots (id, campus_id, name, lat, lng)
values ('00000000-0000-4000-8000-0000000005a1', '00000000-0000-4000-8000-00000000c001', 'Library lobby', 40.0, -83.0);
select throws_ok(
  $$insert into public.safe_spots (campus_id, name, lat, lng, designation)
    values ('00000000-0000-4000-8000-00000000c001', 'Police lobby', 40.0, -83.0, 'police')$$,
  '23514', null, 'a police-designated spot needs the date it was designated'
);

insert into public.meetups (chat_id, spot_id, starts_at)
values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000005a1', now() + interval '1 day');
select throws_ok(
  $$insert into public.meetups (chat_id, custom_place, starts_at)
    values ('00000000-0000-4000-8000-0000000003a1', 'Front steps', now() + interval '2 days')$$,
  '23505', null, 'one active meetup per chat (meetups_one_active, BE-06)'
);
select throws_ok(
  $$insert into public.meetups (chat_id, starts_at, status) values ('00000000-0000-4000-8000-0000000003a1', now(), 'cancelled')$$,
  '23514', null, 'a meetup needs a spot or a custom place'
);
select throws_ok(
  $$update public.meetups set late_minutes = 7 where chat_id = '00000000-0000-4000-8000-0000000003a1'$$,
  '23514', null, 'late minutes are 5, 10, 15 or 30'
);

insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up)
values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', true);
select throws_ok(
  $$insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up)
    values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', false)$$,
  '23505', null, 'one rating per person per chat'
);

-- Deleting the listing row keeps the deal: chat snapshot stays, links go null.
delete from public.listings where id = '00000000-0000-4000-8000-0000000001a1';
select is(
  (select listing_id from public.chats where id = '00000000-0000-4000-8000-0000000003a1'),
  null::uuid, 'chat survives the listing row; listing_id is cleared'
);
select is(
  (select listing_title || ' ' || listing_price_cents from public.chats where id = '00000000-0000-4000-8000-0000000003a1'),
  'Desk lamp 1200', 'chat keeps its listing snapshot'
);
select is(
  (select count(*)::int from public.offers where listing_id is null), 2, 'offers survive with listing_id cleared'
);

-- Deleting the buyer's account keeps the chat for the seller ("Deleted user", D18).
delete from auth.users where id = '00000000-0000-4000-8000-0000000000b1';
select is(
  (select buyer_id from public.chats where id = '00000000-0000-4000-8000-0000000003a1'),
  null::uuid, 'chat survives a deleted buyer'
);
select is(
  (select count(*)::int from public.messages where chat_id = '00000000-0000-4000-8000-0000000003a1' and sender_id is null and kind <> 'system'),
  1, 'their messages stay, sender cleared (plus the closing system row, S27)'
);

select * from finish();
rollback;
