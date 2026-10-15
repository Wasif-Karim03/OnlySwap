-- DEC 122: a new or refreshed unread notification pings user:{uid} 'bell'; reading does not;
-- messages and offers don't (they ping 'inbox').
begin;
select plan(5);
select tests.create_fixtures();
insert into public.notifications (user_id, type, grp, title, body, data, push_state)
values (tests.uid('A'), 'listing_like', 'comments', 'Sam liked your post', 'Lamp', '{}', 'skipped');
select is((select count(*)::int from realtime.messages where topic = 'user:' || tests.uid('A') and event = 'bell'), 1, 'a new notification pings the bell');
select is((select count(*)::int from realtime.messages where topic = 'user:' || tests.uid('B') and event = 'bell'), 0, 'nobody else is pinged');
update public.notifications set title = 'Sam and 1 other liked your post' where user_id = tests.uid('A') and type = 'listing_like';
select is((select count(*)::int from realtime.messages where topic = 'user:' || tests.uid('A') and event = 'bell'), 2, 'a refreshed like row pings again');
update public.notifications set read_at = now() where user_id = tests.uid('A') and type = 'listing_like';
select is((select count(*)::int from realtime.messages where topic = 'user:' || tests.uid('A') and event = 'bell'), 2, 'marking read sends nothing');
insert into public.notifications (user_id, type, grp, title, body, data)
values (tests.uid('B'), 'new_message', 'messages', 'Sam', 'hi', '{}');
select is((select count(*)::int from realtime.messages where topic = 'user:' || tests.uid('B') and event = 'bell'), 0,
  'messages already ping the inbox, so no bell ping');
select * from finish();
rollback;
