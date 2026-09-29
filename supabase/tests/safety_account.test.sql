-- S30: get_account_status (X10) and list_blocked (F13).
begin;
select plan(7);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

update public.profiles set status = 'paused', status_reason = 'noshow', paused_until = '2027-03-17' where id = tests.uid('B');
insert into public.strikes (user_id, reason) values (tests.uid('B'), 'scam');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_account_status() ->> 'status'$$), 'paused', 'a paused person sees their status');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_account_status() ->> 'reason'$$), 'noshow', 'and why');
select is(tests.try_text_as(tests.uid('B'), $$select jsonb_array_length(public.get_account_status() -> 'strikes')::text$$), '1', 'with open strikes');
update public.profiles set status = 'banned' where id = tests.uid('B');
select is(tests.try_text_as(tests.uid('B'), $$select public.get_account_status() ->> 'status'$$), 'banned', 'works for banned accounts too');
update public.profiles set status = 'active' where id = tests.uid('B');

insert into public.blocks (blocker_id, blocked_id) values (tests.uid('A'), tests.uid('B')), (tests.uid('C'), tests.uid('A'));
select is(tests.try_text_as(tests.uid('A'), $$select public.list_blocked() -> 0 ->> 'display_name'$$), 'Ben B.', 'people I blocked');
select is(tests.try_text_as(tests.uid('A'), $$select jsonb_array_length(public.list_blocked())::text$$), '1', 'not people who blocked me');
select ok(not has_function_privilege('anon', 'public.get_account_status()', 'execute'), 'needs a session');

select * from finish();
rollback;
