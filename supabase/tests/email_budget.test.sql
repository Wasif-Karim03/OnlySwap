-- T-INT-MAIL-02 (E-08, DEC 109): the outbox sends at most 150 a day so sign-in codes keep most of
-- Gmail's 500; urgent mail goes first and campus_open (waitlist blasts) goes last.
begin;
select plan(4);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
delete from public.email_outbox;

insert into public.email_outbox (to_email, template, state, sent_at)
select 'x@osu.edu', 'account_deleted', 'sent', '2027-03-10 08:00-05' from generate_series(1, 147);
select private.queue_email('w1@osu.edu', 'campus_open', '{}', 'b1');
select private.queue_email('w2@osu.edu', 'campus_open', '{}', 'b2');
select private.queue_email('a@osu.edu', 'support_reply', '{}', 'b3');
select private.queue_email('owner@example.com', 'priority_report', '{}', 'b4');

select is((select jsonb_agg(e ->> 'template') from jsonb_array_elements(private.claim_emails(50)) e),
  '["priority_report", "support_reply", "campus_open"]'::jsonb, 'three left today: urgent first, the waitlist blast last');
select is((select count(*)::int from public.email_outbox where state = 'pending'), 1, 'the rest waits');
select is(private.claim_emails(50), '[]'::jsonb, '150 a day, then it waits');
select tests.set_now('2027-03-11 09:00:00-05');
select is(jsonb_array_length(private.claim_emails(50)), 1, 'a day later it goes');

select * from finish();
rollback;
