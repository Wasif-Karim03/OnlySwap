-- 0232 unread_count (API §2, DEC 120): the caller's unread notifications only,
-- same number as get_notifications.unread; members only.
begin;
select plan(6);
select tests.create_fixtures();

insert into public.notifications (user_id, type, grp, title, body, read_at) values
  (tests.uid('A'), 'tip', 'campus', 't', 'b', null),
  (tests.uid('A'), 'tip', 'campus', 't', 'b', null),
  (tests.uid('A'), 'tip', 'campus', 't', 'b', now()),
  (tests.uid('B'), 'tip', 'campus', 't', 'b', null);

select is(tests.try_text_as(tests.uid('A'), 'select public.unread_count()::text'), '2', 'A has 2 unread');
select is(tests.try_text_as(tests.uid('A'), $$select public.get_notifications() ->> 'unread'$$), '2', 'matches get_notifications.unread');
select is(tests.try_text_as(tests.uid('B'), 'select public.unread_count()::text'), '1', 'B counts only B''s rows');
select is(tests.try_text_as(tests.uid('C'), 'select public.unread_count()::text'), '0', 'nothing is 0');
select ok(not has_function_privilege('anon', 'public.unread_count()', 'execute'), 'anon cannot call it');
select ok(has_function_privilege('authenticated', 'public.unread_count()', 'execute'), 'signed-in users can');

select * from finish();
rollback;
