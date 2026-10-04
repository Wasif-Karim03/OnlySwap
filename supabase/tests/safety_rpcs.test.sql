-- P3-SAFE-01: create_report, get_my_report, block_user, unblock_user,
-- create_appeal and trg_reports_ai (T-INT-SAFE-01/02/03, API §3 Safety).
begin;
select plan(35);
select tests.create_fixtures();

insert into public.listings (id, campus_id, seller_id, title, description, status) values
  ('00000000-0000-4000-8000-0000000001a1', tests.uid('OSU'), tests.uid('A'), 'Lamp', 'Warm light', 'active'),
  ('00000000-0000-4000-8000-0000000001a2', tests.uid('OSU'), tests.uid('A'), 'Desk', null, 'active'),
  ('00000000-0000-4000-8000-0000000001a3', tests.uid('OSU'), tests.uid('A'), 'Chair', null, 'active');
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, status)
values ('00000000-0000-4000-8000-0000000002a1', '00000000-0000-4000-8000-0000000001a1', tests.uid('B'), tests.uid('A'), 1000, 'accepted');
insert into public.chats (id, listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents)
values ('00000000-0000-4000-8000-0000000003a1', '00000000-0000-4000-8000-0000000001a1',
        '00000000-0000-4000-8000-0000000002a1', tests.uid('B'), tests.uid('A'), 'Lamp', 1200, 1000);

-- create_report ------------------------------------------------------------------
select matches(
  tests.try_text_as(tests.uid('B'), $$select public.create_report('listing', '00000000-0000-4000-8000-0000000001a1', 'scam', ' looks fake ')::text$$),
  '^\{"id": "[0-9a-f-]{36}"\}$', 'T-INT-SAFE-01 create_report returns only {id}');
select is(
  (select row(target_user_id, priority, details, evidence ->> 'text', status::text)::text
   from public.reports where reporter_id = tests.uid('B')),
  row(tests.uid('A'), 2::smallint, 'looks fake', E'Lamp\nWarm light', 'open')::text,
  'report resolves the seller, trims details, snapshots evidence, priority 2');
select is(
  tests.try_text_as(tests.uid('B'), $$select public.create_report('listing', '00000000-0000-4000-8000-0000000001a1', 'spam')::text$$),
  'ERROR: ALREADY_REPORTED', 'a second open report on the same target is refused');
select is(
  tests.try_text_as(tests.uid('B'), format('select public.create_report(%L, %L, %L)::text', 'user', tests.uid('B'), 'spam')),
  'ERROR: INVALID:target_id', 'cannot report yourself');
select is(
  tests.try_text_as(tests.uid('B'), $$select public.create_report('listing', '00000000-0000-4000-8000-0000000001a2', 'rude')::text$$),
  'ERROR: INVALID:reason', 'unknown reason refused');
select is(
  tests.try_text_as(tests.uid('B'), $$select public.create_report('listing', 'not-a-uuid', 'spam')::text$$),
  'ERROR: NOT_FOUND', 'malformed id is NOT_FOUND');
select is(
  tests.try_text_as(tests.uid('B'), $$select public.create_report('quad_post', '1', 'spam')::text$$),
  'ERROR: NOT_FOUND', 'quad targets are reportable (DEC 76); a missing post is NOT_FOUND');
select is(
  tests.try_text_as(tests.uid('B'), format('select public.create_report(%L, %L, %L, %L)::text', 'user', tests.uid('C'), 'spam', repeat('x', 501))),
  'ERROR: INVALID:details', 'details over 500 chars refused');
update public.profiles set status = 'active' where id = tests.uid('D');
select is(
  tests.try_text_as(tests.uid('D'), $$select public.create_report('listing', '00000000-0000-4000-8000-0000000001a2', 'spam')::text$$),
  'ERROR: NOT_FOUND', 'another campus''s listing is NOT_FOUND');
select is(
  tests.try_text_as(tests.uid('C'), $$select public.create_report('chat', '00000000-0000-4000-8000-0000000003a1', 'harassment')::text$$),
  'ERROR: NOT_FOUND', 'a chat you are not in is NOT_FOUND');
select matches(
  tests.try_text_as(tests.uid('A'), $$select public.create_report('chat', '00000000-0000-4000-8000-0000000003a1', 'harassment')::text$$),
  '^\{"id"', 'a participant can report the chat');
select is((select target_user_id from public.reports where reporter_id = tests.uid('A')), tests.uid('B'),
  'chat report targets the other participant');

-- Priority-1: every owner gets an email right away (T-INT-SAFE-02) --------------------
select matches(
  tests.try_text_as(tests.uid('B'), format('select public.create_report(%L, %L, %L)::text', 'user', tests.uid('C'), 'threat')),
  '^\{"id"', 'threat report accepted');
select is((select priority from public.reports where reporter_id = tests.uid('B') and reason = 'threat'), 1::smallint,
  'threat is priority 1');
select is(
  (select string_agg(to_email, ',' order by to_email) from public.email_outbox where template = 'priority_report'),
  'nomfa@osu.edu,own@osu.edu', 'every owner is emailed once; moderators are not');
select ok(
  not exists (select 1 from public.email_outbox where template = 'priority_report'
              and vars::text ~ ('Cam|Ben|' || tests.uid('C')::text)),
  'the email carries no names or the reported person''s id');

-- get_my_report / my_reports -------------------------------------------------------
select is(
  tests.try_text_as(tests.uid('B'), format(
    $$select public.get_my_report(%L) ->> 'status'$$,
    (select id from public.reports where reporter_id = tests.uid('B') and reason = 'scam'))),
  'received', 'get_my_report: open reads as received');
select is(
  tests.try_text_as(tests.uid('C'), format(
    $$select public.get_my_report(%L)::text$$,
    (select id from public.reports where reporter_id = tests.uid('B') and reason = 'scam'))),
  'ERROR: NOT_FOUND', 'get_my_report: someone else''s report is NOT_FOUND');
update public.reports set status = 'actioned', resolved_at = now() where reporter_id = tests.uid('B') and reason = 'scam';
select is(
  tests.try_text_as(tests.uid('B'), format(
    $$select (public.get_my_report(%L) -> 'timeline')::text$$,
    (select id from public.reports where reporter_id = tests.uid('B') and reason = 'scam'))) ~ '"reviewed"',
  true, 'get_my_report: resolved shows reviewed, never the action taken');
select hasnt_column('public', 'my_reports', 'target_user_id', 'my_reports never exposes who was reported');

-- Auto-hide: 3 distinct reporters with accounts older than 7 days, within 24 h ----------
select tests.try_text_as(tests.uid(u), $$select public.create_report('listing', '00000000-0000-4000-8000-0000000001a3', 'scam')::text$$)
from unnest(array['B','C','MOD']) u;
select is((select status::text from public.listings where id = '00000000-0000-4000-8000-0000000001a3'), 'active',
  'T-INT-SAFE-03 new accounts do not trigger auto-hide');

select tests.set_now(now() + interval '8 days');
select tests.try_text_as(tests.uid(u), $$select public.create_report('listing', '00000000-0000-4000-8000-0000000001a2', 'scam')::text$$)
from unnest(array['C','MOD']) u;
select is((select status::text from public.listings where id = '00000000-0000-4000-8000-0000000001a2'), 'active',
  'two aged reporters: still active');
select tests.try_text_as(tests.uid('OWN'), $$select public.create_report('listing', '00000000-0000-4000-8000-0000000001a2', 'scam')::text$$);
select is((select status::text from public.listings where id = '00000000-0000-4000-8000-0000000001a2'), 'held_review',
  'third aged reporter: listing held for review');
select is((select count(*)::int from public.reports where target_id = '00000000-0000-4000-8000-0000000001a2' and status = 'open'), 3,
  'the reports stay open for a moderator');

-- block_user / unblock_user ------------------------------------------------------------
select is(tests.try_text_as(tests.uid('B'), format('select public.block_user(%L)::text', tests.uid('B'))),
  'ERROR: INVALID:user_id', 'cannot block yourself');
select ok(tests.try_ok_as(tests.uid('B'), format('select public.block_user(%L)', tests.uid('A'))), 'B blocks A');
select is((select status::text from public.chats where id = '00000000-0000-4000-8000-0000000003a1'), 'blocked',
  'blocking closes the open chat for both sides');
select ok(tests.try_ok_as(tests.uid('B'), format('select public.block_user(%L)', tests.uid('A'))), 'blocking twice is a no-op');
select ok(tests.try_ok_as(tests.uid('A'), format('select public.block_user(%L)', tests.uid('B'))), 'A blocks B back');
select ok(tests.try_ok_as(tests.uid('B'), format('select public.unblock_user(%L)', tests.uid('A'))), 'B unblocks A');
select is((select status::text from public.chats where id = '00000000-0000-4000-8000-0000000003a1'), 'blocked',
  'chat stays blocked while A still blocks B');
select ok(tests.try_ok_as(tests.uid('A'), format('select public.unblock_user(%L)', tests.uid('B'))), 'A unblocks B');
select is((select status::text from public.chats where id = '00000000-0000-4000-8000-0000000003a1'), 'open',
  'chat reopens once neither side blocks');

-- create_appeal --------------------------------------------------------------------------
insert into public.strikes (id, user_id, reason) values ('00000000-0000-4000-8000-0000000007a1', tests.uid('C'), 'spam');
update public.profiles set status = 'suspended' where id = tests.uid('C');
select matches(
  tests.try_text_as(tests.uid('C'), $$select public.create_appeal('strike', '00000000-0000-4000-8000-0000000007a1', 'mistake', 'It was a mixup')::text$$),
  '^\{"id"', 'T-INT-SAFE-04 a suspended student can appeal their strike');
select is(
  concat_ws('|',
    tests.try_text_as(tests.uid('C'), $$select public.create_appeal('strike', '00000000-0000-4000-8000-0000000007a1')::text$$),
    tests.try_text_as(tests.uid('B'), $$select public.create_appeal('strike', '00000000-0000-4000-8000-0000000007a1')::text$$),
    tests.try_text_as(tests.uid('C'), $$select public.create_appeal('quad_post', '1')::text$$),
    tests.try_text_as(tests.uid('C'), $$select public.create_report('listing', '00000000-0000-4000-8000-0000000001a1', 'spam')::text$$)),
  'ERROR: ALREADY_APPEALED|ERROR: NOT_FOUND|ERROR: NOT_FOUND|ERROR: NOT_ACTIVE:suspended',
  'appeal once per subject, own subjects only (a missing quad post too); suspended cannot report');

select * from finish();
rollback;
