-- P4-DEL-01: database half of delete-account (T-INT-DEL-01).
-- The Edge Function calls private.prepare_account_deletion(uid) with the
-- service role and then auth.admin.deleteUser(uid); here the second step is a
-- plain delete from auth.users.
begin;
select plan(17);
select tests.create_fixtures();

-- A leaves a footprint everywhere.
insert into public.listings (id, campus_id, seller_id, title, status) values
  ('00000000-0000-4000-8000-0000000001a1', tests.uid('OSU'), tests.uid('A'), 'Lamp', 'active'),
  ('00000000-0000-4000-8000-0000000001b1', tests.uid('OSU'), tests.uid('B'), 'Desk', 'active');
insert into public.listing_reservations (id, user_id) values (gen_random_uuid(), tests.uid('A'));
insert into public.swipes (user_id, listing_id, dir) values (tests.uid('A'), '00000000-0000-4000-8000-0000000001b1', 'left');
insert into public.saves (user_id, listing_id) values (tests.uid('A'), '00000000-0000-4000-8000-0000000001b1');
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, status)
values ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000001b1', tests.uid('A'), tests.uid('B'), 900, 'accepted');
insert into public.chats (id, listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents)
values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000001b1',
        '00000000-0000-4000-8000-0000000002a1', tests.uid('A'), tests.uid('B'), 'Desk', 1000, 900);
insert into public.messages (chat_id, sender_id, body) values ('00000000-0000-4000-8000-0000000003a1', tests.uid('A'), 'hi');
insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up)
values ('00000000-0000-4000-8000-0000000003a1', tests.uid('A'), tests.uid('B'), true);
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, evidence)
values (tests.uid('OSU'), tests.uid('A'), 'user', tests.uid('C')::text, tests.uid('C'), 'spam', '{"text":"x"}'),
       (tests.uid('OSU'), tests.uid('B'), 'user', tests.uid('A')::text, tests.uid('A'), 'scam', '{"text":"evidence"}');
insert into public.blocks (blocker_id, blocked_id) values (tests.uid('A'), tests.uid('C'));
insert into public.notifications (user_id, type, grp, title, body) values (tests.uid('A'), 'tip', 'campus', 't', 'b');
insert into public.activity_days (user_id, day) values (tests.uid('A'), current_date);
insert into public.strikes (user_id, reason) values (tests.uid('A'), 'x');

-- Only the service role may run it -------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'private.prepare_account_deletion(uuid, boolean)', 'execute'),
  'users cannot call the deletion helper');
select ok(has_function_privilege('service_role', 'private.prepare_account_deletion(uuid, boolean)', 'execute'),
  'the Edge Function (service role) can');

-- Underage mode is only for age-blocked accounts ------------------------------------------------
select throws_ok(format('select private.prepare_account_deletion(%L, true)', tests.uid('A')), 'P0001', 'FORBIDDEN',
  'underage mode refused for an account the age check did not block');

select is(
  (select private.prepare_account_deletion(tests.uid('A')) -> 'r2_prefixes'),
  jsonb_build_array('c/' || tests.uid('OSU') || '/u/' || tests.uid('A') || '/',
                    'c/' || tests.uid('OSU') || '/l/00000000-0000-4000-8000-0000000001a1/'),
  'returns the R2 prefixes to delete (own folder and own listings)');
select is((select status::text from public.chats where id = '00000000-0000-4000-8000-0000000003a1'), 'closed',
  'open chats are closed read-only');
select is((select body from public.messages where chat_id = '00000000-0000-4000-8000-0000000003a1' and kind = 'system'),
  'This account was deleted.', 'with a system message for the other person');
select is((select count(*)::int from public.email_outbox where template = 'account_deleted' and to_email = 'a@osu.edu'), 1,
  'the goodbye email is queued');

delete from auth.users where id = tests.uid('A');

-- T-INT-DEL-01: nothing left that points at A, except the documented retention.
create function pg_temp.refs(target uuid) returns table (tbl text, col text, n bigint) language plpgsql as $$
declare r record;
begin
  for r in
    select c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.data_type = 'uuid' and t.table_type = 'BASE TABLE'
  loop
    execute format('select count(*) from public.%I where %I = $1', r.table_name, r.column_name) into n using target;
    if n > 0 then tbl := r.table_name; col := r.column_name; return next; end if;
  end loop;
end $$;
select is((select string_agg(tbl || '.' || col, ',' order by tbl, col) from pg_temp.refs(tests.uid('A'))), null,
  'T-INT-DEL-01 no uuid column in public still holds the deleted id');
select is((select count(*)::int from public.reports where reporter_id is null and target_id = tests.uid('C')::text), 1,
  'their report stays, reporter cleared');
select is((select evidence ->> 'text' from public.reports where target_id = tests.uid('A')::text), 'evidence',
  'a report about them keeps its evidence (BE-02)');
select is((select count(*)::int from public.ratings where rater_id is null and ratee_id = tests.uid('B')), 1,
  'the rating they gave stays, anonymized');
select is((select listing_title || ':' || coalesce(buyer_id::text, 'deleted') from public.chats
           where id = '00000000-0000-4000-8000-0000000003a1'), 'Desk:deleted', 'the other person''s chat keeps its snapshot');
select is((select count(*)::int from public.listings where id = '00000000-0000-4000-8000-0000000001a1'), 0,
  'their listings are gone');
select is((select count(*)::int from auth.users where id = tests.uid('A')), 0, 'auth user gone');

-- Banned and underage accounts ----------------------------------------------------------------------
update public.profiles set status = 'banned' where id = tests.uid('C');
select private.prepare_account_deletion(tests.uid('C'));
select ok(exists (select 1 from public.banned_hashes where email_hash = 'fixture-c'), 'a banned account''s hash is kept');

insert into public.age_blocks (email_hash) values ('fixture-d');
select is(
  (select private.prepare_account_deletion(tests.uid('D'), true) ->> 'email') || '|'
    || (select count(*) from public.email_outbox where to_email = 'd@umich.edu'),
  null, 'underage mode: no email address returned');
select is((select count(*)::int from public.email_outbox where to_email = 'd@umich.edu'), 0, 'underage mode: no goodbye email');

select * from finish();
rollback;
