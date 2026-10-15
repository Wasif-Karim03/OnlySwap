-- 0224_email_budget.sql · E-08, DEC 109.
-- Sign-in codes (Supabase Auth custom SMTP) and the email outbox share one
-- Gmail account, which stops sending for 24 h after 500 recipients a day. The
-- outbox used to take up to 400 of those, leaving about 100 codes on the day a
-- campus opens. Now the outbox sends at most 150 a day, so codes keep at least
-- 350. Urgent mail goes first and campus_open (the waitlist blast) goes last,
-- so a big waitlist drains over several days and spaces out sign-ups.
-- Rows being sent count toward the cap too (a second claim in the same window
-- could go over before). claim_emails is copied from 0028 with only the cap,
-- the count and the order changed.

create or replace function private.claim_emails(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent_today int := (
    select count(*) from public.email_outbox
    where (state = 'sent' and sent_at > private.now() - interval '24 hours')
       or (state = 'sending' and claimed_at > private.now() - interval '24 hours'));
  room int := greatest(150 - sent_today, 0);
  res jsonb := '[]';
  e record;
begin
  if room = 0 then
    return res;
  end if;
  for e in
    select * from public.email_outbox x
    where x.state = 'pending' and x.send_after <= private.now()
    order by (x.template = 'priority_report') desc, (x.template = 'campus_open'), x.id
    limit least(p_limit, room)
    for update skip locked
  loop
    update public.email_outbox x set state = 'sending', claimed_at = private.now(), attempts = attempts + 1 where x.id = e.id;
    res := res || jsonb_build_object('id', e.id, 'to', e.to_email, 'template', e.template, 'vars', e.vars);
  end loop;
  return res;
end;
$$;

revoke all on function private.claim_emails(int) from public, anon, authenticated;
