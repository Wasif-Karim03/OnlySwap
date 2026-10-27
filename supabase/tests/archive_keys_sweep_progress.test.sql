-- 0248 (IR3-01, IR3-02).
--   IR3-01 an archive key is per job token (private.chat_archive_key): a
--          stale cleaner cannot delete or unmark a replacement archive; a
--          takeover moves the old row to `cleanup`; prepare_account_deletion
--          lists every job key plus legacy keys; one live row per chat.
--   IR3-02 manifest sweeps resume at a saved position that only moves
--          forward within a generation and restarts with a new one.
--   IR3-R3 the cleanup RPCs never wait on a row lock (skip locked,
--          IR3-REVIEW-02); lock_timeout is a backstop. A row locked by another session cannot be produced
--          here (one transaction, no dblink): the TS tests cover the client.
begin;
select plan(37);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

create function pg_temp.c(name text) returns uuid language sql immutable as $$
  select case name
    when 'K1' then '00000000-0000-4000-8000-00000000f001'::uuid
    when 'K2' then '00000000-0000-4000-8000-00000000f002'::uuid
    when 'L1' then '00000000-0000-4000-8000-00000000f003'::uuid
  end
$$;
create function pg_temp.row_of(chat text, tok uuid) returns text language sql as $$
  select coalesce((select j.state from private.chat_archive_jobs j where j.chat_id = pg_temp.c(chat) and j.token = tok), 'none')
$$;

-- K1 A-B and K2 B-C closed long ago; L1 B-C archived before 0246 (no job row).
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, status, closed_at, archived_at) values
  (pg_temp.c('K1'), tests.uid('A'), tests.uid('B'), 'Old lamp', 100, 100, 'closed', '2026-11-01', null),
  (pg_temp.c('K2'), tests.uid('B'), tests.uid('C'), 'Old desk', 100, 100, 'closed', '2026-11-02', null),
  (pg_temp.c('L1'), tests.uid('B'), tests.uid('C'), 'Old bike', 100, 100, 'closed', '2026-06-01', '2026-09-01');

-- IR3-01 claim -----------------------------------------------------------------------------------------
create temp table cl1 as select e from jsonb_array_elements(private.claim_chat_archives()) e;
select is((select count(*)::int from cl1 where e ->> 'key' = private.chat_archive_key((e ->> 'id')::uuid, (e ->> 'token')::uuid)
           and e ->> 'key' = 'archive/chats/' || (e ->> 'id') || '/' || (e ->> 'token') || '.json'), 2,
  'IR3-01 every claimed chat comes with archive/chats/{chat}/{token}.json');
create temp table tok as
  select (select (e ->> 'token')::uuid from cl1 where (e ->> 'id')::uuid = pg_temp.c('K1')) as t1,
         (select (e ->> 'token')::uuid from cl1 where (e ->> 'id')::uuid = pg_temp.c('K2')) as u1;

-- IR3-01 interleaving: K1's write was refused, two cleaners read (K1, t1) ------------------------------
update private.chat_archive_jobs set state = 'cleanup' where chat_id = pg_temp.c('K1');
create temp table due1 as select private.archive_cleanups_due() as d;
create temp table due2 as select private.archive_cleanups_due() as d;
select is(private.finish_archive_cleanups((select jsonb_agg(e - 'key') from due1, jsonb_array_elements(d) e)), 1,
  'the first cleaner confirms (K1, t1) gone');
create temp table cl2 as select e from jsonb_array_elements(private.claim_chat_archives()) e;
select ok((select count(*) = 1 and bool_and((e ->> 'id')::uuid = pg_temp.c('K1') and (e ->> 'token')::uuid <> (select t1 from tok)
                                            and e ->> 'key' <> private.chat_archive_key(pg_temp.c('K1'), (select t1 from tok)))
           from cl2),
  'K1 is claimed again under a new token and a new key');
select is(private.finish_chat_archive_checked(pg_temp.c('K1'), array[tests.uid('A'), tests.uid('B')],
                                              (select (e ->> 'token')::uuid from cl2)),
  'archived', 'the replacement run archives K1');
select is(private.finish_archive_cleanups((select jsonb_agg(e - 'key') from due2, jsonb_array_elements(d) e)), 0,
  'the stale cleaner confirms nothing');
select is(pg_temp.row_of('K1', (select (e ->> 'token')::uuid from cl2)), 'done',
  'and the replacement''s done row remains (its key was never on the stale list)');

-- IR3-01 takeover after the lease ran out ----------------------------------------------------------------
select tests.set_now('2027-03-10 12:31:00-05');
create temp table cl3 as select e from jsonb_array_elements(private.claim_chat_archives()) e;
create temp table tok2 as select (select (e ->> 'token')::uuid from cl3 where (e ->> 'id')::uuid = pg_temp.c('K2')) as u2;
select is(pg_temp.row_of('K2', (select u1 from tok)), 'cleanup', 'IR3-01 a takeover moves the expired row to cleanup');
select ok(private.archive_cleanups_due() @> jsonb_build_array(jsonb_build_object(
    'id', pg_temp.c('K2'), 'token', (select u1 from tok), 'key', private.chat_archive_key(pg_temp.c('K2'), (select u1 from tok)))),
  'where it is listed under its own key');
select is(pg_temp.row_of('K2', (select u2 from tok2)), 'writing', 'and a new writing row holds the chat');
select is(private.finish_chat_archive_checked(pg_temp.c('K2'), array[tests.uid('B'), tests.uid('C')], (select u1 from tok)),
  'lost', 'the old run finishes as lost');
select is(pg_temp.row_of('K2', (select u2 from tok2)), 'writing', 'and leaves the new row untouched');
select throws_ok(format($$insert into private.chat_archive_jobs (chat_id, token, state, lease_until)
                          values (%L, gen_random_uuid(), 'writing', now())$$, pg_temp.c('K2')),
  '23505', null, 'a second writing row for a chat with a live one is refused');

-- IR3-01 prepare_account_deletion lists every job key and legacy keys -------------------------------------
create temp table p1 as select private.prepare_account_deletion(tests.uid('B')) as r;
select is((select r -> 'archives' from p1),
  (select jsonb_agg(x order by x collate "C") from unnest(array[
     private.chat_archive_key(pg_temp.c('K1'), (select (e ->> 'token')::uuid from cl2)),
     private.chat_archive_key(pg_temp.c('K2'), (select u1 from tok)),
     private.chat_archive_key(pg_temp.c('K2'), (select u2 from tok2)),
     'archive/chats/' || pg_temp.c('L1') || '.json']) x),
  'done, cleanup and writing job keys, and the legacy key only for the chat archived without a done job');
select ok(not ((select r -> 'archives' from p1) ? ('archive/chats/' || pg_temp.c('K1') || '.json')),
  'no legacy key for a chat whose archive has a done job');

-- IR3-02 sweep progress ----------------------------------------------------------------------------------
create function pg_temp.del() returns uuid language sql as $$
  select id from public.account_deletions where user_id = tests.uid('B')
$$;
create function pg_temp.gen() returns int language sql as $$
  select media_gen from public.account_deletions where user_id = tests.uid('B')
$$;
create function pg_temp.pos() returns int language sql as $$
  select media_sweep_pos from public.account_deletions where user_id = tests.uid('B')
$$;
select private.confirm_media_deletion(tests.uid('B'));
select tests.set_now('2027-03-10 12:47:00-05');
select is((select (e ->> 'pos')::int from jsonb_array_elements(private.media_sweeps_due()) e where (e ->> 'id')::uuid = pg_temp.del()), 0,
  'IR3-02 a due manifest starts at pos 0');
create temp table prefixes as select media_prefixes as p from public.account_deletions where id = pg_temp.del();
select is(private.save_media_sweep_progress(pg_temp.del(), pg_temp.gen(), 3), 1, 'progress is saved');
select is(pg_temp.pos(), 3, 'pos 3');
select is((select media_prefixes from public.account_deletions where id = pg_temp.del()), (select p from prefixes),
  'the manifest itself is never shrunk by progress');
select is((select (e ->> 'pos')::int from jsonb_array_elements(private.media_sweeps_due()) e where (e ->> 'id')::uuid = pg_temp.del()), 3,
  'the next sweep resumes at it');
select is(private.save_media_sweep_progress(pg_temp.del(), pg_temp.gen(), 2), 0, 'a smaller position changes nothing');
select is(private.save_media_sweep_progress(pg_temp.del(), pg_temp.gen() - 1, 9), 0, 'a stale generation changes nothing');
select private.prepare_account_deletion(tests.uid('B'));
select is(pg_temp.gen() || '|' || pg_temp.pos(), '2|0', 'a new generation starts again at pos 0');
select is(private.finish_media_sweeps(jsonb_build_array(jsonb_build_object('id', pg_temp.del(), 'gen', pg_temp.gen()))), 1,
  'the generation is finished');
select is(private.save_media_sweep_progress(pg_temp.del(), pg_temp.gen(), 5), 0, 'a finished generation saves nothing');

-- IR3-R3 no cleanup call waits on a lock for long --------------------------------------------------------
select ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'private' and p.proname = f and 'lock_timeout=2s' = any(p.proconfig)),
          'IR3-R3 lock_timeout = 2s on private.' || f)
from unnest(array['save_media_sweep_progress', 'claim_stale_uploads', 'ack_collected',
                  'finish_media_sweeps', 'finish_archive_cleanups']) f;
select ok(pg_get_functiondef('private.save_media_sweep_progress(uuid, int, int)'::regprocedure) ~* 'for update skip locked',
  'the progress save skips a locked row instead of waiting');
select ok(pg_get_functiondef(f::regprocedure) ~* 'for update (of x )?skip locked',
          'IR3-REVIEW-02 ' || f || ' skips a locked row instead of waiting')
from unnest(array['private.claim_stale_uploads(int)', 'private.ack_collected(jsonb)',
                  'private.finish_media_sweeps(jsonb)', 'private.finish_archive_cleanups(jsonb)']) f;
-- Same checks and counts as 0246: duplicates count once, a stale generation
-- or a row not in `cleanup` is left alone.
select is(private.finish_media_sweeps(jsonb_build_array(
            jsonb_build_object('id', pg_temp.del(), 'gen', pg_temp.gen()),
            jsonb_build_object('id', pg_temp.del(), 'gen', pg_temp.gen()),
            jsonb_build_object('id', pg_temp.del(), 'gen', pg_temp.gen() - 1))), 1,
  'IR3-REVIEW-02 finish_media_sweeps counts only the current generation, once');
select is(private.finish_archive_cleanups(jsonb_build_array(
            jsonb_build_object('id', pg_temp.c('K2'), 'token', (select u1 from tok)),
            jsonb_build_object('id', pg_temp.c('K2'), 'token', (select u1 from tok)),
            jsonb_build_object('id', pg_temp.c('K2'), 'token', (select u2 from tok2)))), 1,
  'IR3-REVIEW-02 finish_archive_cleanups deletes only the cleanup row, once');
select is(pg_temp.row_of('K2', (select u1 from tok)) || '|' || pg_temp.row_of('K2', (select u2 from tok2)), 'none|writing',
  'and the writing row is left alone');

select * from finish();
rollback;
