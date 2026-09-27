-- P3-DB-06: safety and ops (DATA_MODEL §2.4) and notifications (§2.5).
begin;
select plan(16);

insert into public.campuses (id, slug, name, short_name, status)
values ('00000000-0000-4000-8000-00000000c001', 'test-u', 'Test University', 'Test U', 'live');
-- The on_auth_user_created trigger (0010) needs a known school domain and
-- the email_hash pepper; it makes the profile, which this test then fills in.
select tests.set_pepper();
insert into public.campus_domains (domain, campus_id, kind)
values ('test.edu', '00000000-0000-4000-8000-00000000c001', 'student') on conflict do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'rep@test.edu'),
  ('00000000-0000-4000-8000-0000000000b1', 'target@test.edu');
insert into public.profiles (id, campus_id, email_hash, first_name, verified_until) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c001', 'h1', 'Rae', current_date + 365),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c001', 'h2', 'Tom', current_date + 365)
on conflict (id) do update set campus_id = excluded.campus_id, email_hash = excluded.email_hash, first_name = excluded.first_name, verified_until = excluded.verified_until;

insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason, evidence)
values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'user',
        '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', 'harassment',
        '{"text":"example"}');
select throws_ok(
  $$insert into public.reports (campus_id, reporter_id, target_type, target_id, reason)
    values ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000a1', 'user',
            '00000000-0000-4000-8000-0000000000b1', 'scam')$$,
  '23505', null, 'one open report per reporter and target (ALREADY_REPORTED)'
);
select throws_ok(
  $$insert into public.reports (campus_id, target_type, target_id, reason)
    values ('00000000-0000-4000-8000-00000000c001', 'user', 'x', 'rude')$$,
  '23514', null, 'report reasons come from the fixed list'
);

-- Evidence is retained when the reported account is deleted (BE-02).
delete from auth.users where id = '00000000-0000-4000-8000-0000000000b1';
select is(
  (select evidence->>'text' from public.reports where target_id = '00000000-0000-4000-8000-0000000000b1'),
  'example', 'report and evidence survive the reported account being deleted'
);
select is(
  (select target_user_id from public.reports where target_id = '00000000-0000-4000-8000-0000000000b1'),
  null::uuid, 'target_user_id is cleared'
);

insert into public.appeals (user_id, subject_type, subject_id)
values ('00000000-0000-4000-8000-0000000000a1', 'listing', 'L1');
select throws_ok(
  $$insert into public.appeals (user_id, subject_type, subject_id)
    values ('00000000-0000-4000-8000-0000000000a1', 'listing', 'L1')$$,
  '23505', null, 'one appeal per decision (ALREADY_APPEALED)'
);

insert into public.audit_log (action, reason) values ('test_action', 'pgTAP');
select throws_ok(
  $$update public.audit_log set reason = 'edited' where action = 'test_action'$$,
  '42501', null, 'audit_log rows cannot be edited'
);
select throws_ok(
  $$delete from public.audit_log where action = 'test_action'$$,
  '42501', null, 'recent audit_log rows cannot be deleted'
);
insert into public.audit_log (action, created_at) values ('old_action', now() - interval '2 years 1 day');
select lives_ok(
  $$delete from public.audit_log where action = 'old_action'$$,
  'rows past the 2-year retention can be purged'
);

select throws_ok(
  $$insert into public.banned_words (pattern, scopes, action) values ('x', '{listing}', 'warn')$$,
  '23514', null, 'banned word action is block or review'
);

insert into public.notifications (user_id, type, grp, title, body, dedupe_key)
values ('00000000-0000-4000-8000-0000000000a1', 'offer_received', 'offers', 'New offer', '$10', 'offer:1');
select throws_ok(
  $$insert into public.notifications (user_id, type, grp, title, body, dedupe_key)
    values ('00000000-0000-4000-8000-0000000000a1', 'offer_received', 'offers', 'New offer', '$10', 'offer:1')$$,
  '23505', null, 'notifications dedupe on (user, dedupe_key) (BE-04)'
);
select lives_ok(
  $$insert into public.notifications (user_id, type, grp, title, body)
    values ('00000000-0000-4000-8000-0000000000a1', 'tip', 'campus', 'A', 'B'),
           ('00000000-0000-4000-8000-0000000000a1', 'tip', 'campus', 'A', 'B')$$,
  'notifications without a dedupe key are not deduped'
);
select is(
  (select push_state::text from public.notifications where dedupe_key = 'offer:1'),
  'pending', 'new notifications wait for the push worker'
);

-- The signup trigger already made this row (0010).
select is(
  (select tips::text || message_previews::text || offers::text from public.notification_prefs
   where user_id = '00000000-0000-4000-8000-0000000000a1'),
  'falsefalsetrue', 'promotional push and previews are off by default, offers on'
);

select throws_ok(
  $$insert into public.email_outbox (to_email, template) values ('a@b.c', 'newsletter')$$,
  '23514', null, 'email templates come from the fixed list'
);
insert into public.email_outbox (to_email, template, dedupe_key) values ('a@b.c', 'support_request', 'sr:1');
select throws_ok(
  $$insert into public.email_outbox (to_email, template, dedupe_key) values ('a@b.c', 'support_request', 'sr:1')$$,
  '23505', null, 'email outbox dedupes on dedupe_key'
);
select throws_ok(
  $$insert into public.push_tokens (user_id, token, platform) values ('00000000-0000-4000-8000-0000000000a1', 't', 'web')$$,
  '23514', null, 'push tokens are ios or android'
);

select * from finish();
rollback;
