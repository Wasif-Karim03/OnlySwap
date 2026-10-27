-- IR4-03, IR5-01 (0247, DEC 139): send_message and the client_id race.
--   IR4-03 a retry with the same client_id returns the first message and claims nothing
--   IR4-03 a send that lost the client_id race leaves its fresh key detached (quota, GC)
--   IR5-01 a lost send never detaches a key another message in the chat still shows
-- Two sessions cannot run in pgTAP, so a temporary BEFORE INSERT trigger
-- inserts the competing row (A's) inside the losing insert itself.
begin;
select plan(11);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01' where id in (tests.uid('A'), tests.uid('B'));
update public.app_config set value = 'true' where key = 'chat_photos_enabled';
select case when exists (select 1 from vault.decrypted_secrets where name = 'media_signing_key')
            then vault.update_secret((select id from vault.decrypted_secrets where name = 'media_signing_key'), 'test-media-key')::text
            else vault.create_secret('test-media-key', 'media_signing_key')::text end;

create function pg_temp.k(name text) returns text language sql immutable as $$
  select 'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/' || case name
    when 'KA'  then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    when 'KB1' then 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    when 'KB2' then 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  end || '_full.webp'
$$;
create function pg_temp.cid(n text) returns uuid language sql immutable as $$
  select ('00000000-0000-4000-8000-00000000' || n)::uuid
$$;
-- B sends a photo; returns the message json (or 'ERROR: …').
create function pg_temp.send(client text, key text) returns jsonb language sql as $$
  select tests.try_text_as(tests.uid('B'), format($f$select public.send_message(%L, %L, %L, %L, %L)::text$f$,
    '00000000-0000-4000-8000-0000000000d1', '', pg_temp.cid(client), 'photo', key))::jsonb
$$;
create function pg_temp.state(p_key text) returns text language sql as $$
  select u.state::text from public.media_uploads u where u.key = p_key
$$;

insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, last_message_at) values
  ('00000000-0000-4000-8000-0000000000d1', tests.uid('A'), tests.uid('B'), 'Mini fridge', 4000, 3800, '2027-03-10 11:00-05');
-- Chat photos have no thumbnail, so only the full-size keys are recorded
-- (tests.register_upload would add pending _thumb rows to B's quota, IR6-01).
insert into public.media_uploads (key, user_id, kind, target_id, state, state_at, created_at) values
  (pg_temp.k('KB1'), tests.uid('B'), 'chat', '00000000-0000-4000-8000-0000000000d1', 'pending', private.now(), private.now()),
  (pg_temp.k('KB2'), tests.uid('B'), 'chat', '00000000-0000-4000-8000-0000000000d1', 'pending', private.now(), private.now()),
  (pg_temp.k('KA'), tests.uid('A'), 'chat', '00000000-0000-4000-8000-0000000000d1', 'pending', private.now(), private.now());

-- Retry (IR4-03) ----------------------------------------------------------------------------------
create temp table first_send as select pg_temp.send('c201', pg_temp.k('KB1')) j;
select is((select j ->> 'kind' from first_send), 'photo', 'IR4-03 B sends a photo');
select is(pg_temp.send('c201', pg_temp.k('KB2')) ->> 'id', (select j ->> 'id' from first_send),
  'a retry with the same client_id and another key returns the first message');
select is(pg_temp.state(pg_temp.k('KB2')), 'pending', 'and claims nothing: the second key stays pending');
select is(pg_temp.state(pg_temp.k('KB1')), 'attached', 'the first key stays attached');

-- The competing send: A's row with the same client_id lands inside B's insert.
create function tests.race_insert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.messages (chat_id, sender_id, kind, body, photo_path, client_id, created_at)
  values (new.chat_id, tests.uid('A'), 'photo', null,
          'c/' || tests.uid('OSU') || '/chat/00000000-0000-4000-8000-0000000000d1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa_full.webp',
          new.client_id, private.now());
  return new;
end;
$$;
create trigger race_insert before insert on public.messages for each row
  when (pg_trigger_depth() = 0 and new.client_id in ('00000000-0000-4000-8000-00000000c202',
                                                    '00000000-0000-4000-8000-00000000c203'))
  execute function tests.race_insert();

-- Lost race, fresh key (IR4-03) -------------------------------------------------------------------
create temp table lost as select pg_temp.send('c202', pg_temp.k('KB2')) j;
select is((select (j ->> 'id', j ->> 'sender_id', j ->> 'photo_path') from lost),
          (select (m.id::text, m.sender_id::text, m.photo_path) from public.messages m
           where m.client_id = pg_temp.cid('c202') and m.sender_id = tests.uid('A') and m.photo_path = pg_temp.k('KA')),
  'IR4-03 a lost client_id race returns the winning row');
select is(pg_temp.state(pg_temp.k('KB2')), 'detached', 'and the fresh key goes back to the GC (detached)');
select is((select count(*)::int from public.media_uploads u
           where u.user_id = tests.uid('B') and u.state in ('pending', 'detached', 'collecting')), 1,
  'and counts in the upload quota again');

-- Lost race, reused key (IR5-01) ------------------------------------------------------------------
create temp table reused as select pg_temp.send('c203', pg_temp.k('KB1')) j;
select is((select (j ->> 'id', j ->> 'sender_id', j ->> 'photo_path') from reused),
          (select (m.id::text, m.sender_id::text, m.photo_path) from public.messages m
           where m.client_id = pg_temp.cid('c203') and m.sender_id = tests.uid('A') and m.photo_path = pg_temp.k('KA')),
  'IR5-01 a lost race with a reused key returns the winning row');
select is(pg_temp.state(pg_temp.k('KB1')), 'attached', 'and the key an earlier message shows stays attached');
select is((select m.photo_path from public.messages m where m.client_id = pg_temp.cid('c201')), pg_temp.k('KB1'),
  'and that message still shows it');
select is((select private.media_upload_collectable(u.key, u.state::text, private.now() - interval '25 hours', null)
           from public.media_uploads u where u.key = pg_temp.k('KB1')), false,
  'and the GC would not collect it even after 25 hours');

drop trigger race_insert on public.messages;
drop function tests.race_insert();

select * from finish();
rollback;
