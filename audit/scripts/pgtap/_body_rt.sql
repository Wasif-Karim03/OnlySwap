-- The prelude inserted a chat message, which broadcast on chat:{CH} and pinged user:{A}/user:{B}.
create function pg_temp.rt(who text, topic text) returns text language sql as $$
  select pg_temp.as(who, format($f$select set_config('realtime.topic', %L, true) || ':' || (select count(*) from realtime.messages where topic = %L)::text$f$, topic, topic))
$$;
select diag('broadcast rows: ' || (select string_agg(topic || '/' || event, ', ') from realtime.messages));
select is(pg_temp.rt('B', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:1', 'participant B can receive the chat topic');
select is(pg_temp.rt('A', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:1', 'participant A can receive the chat topic');
select is(pg_temp.rt('E', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:0', 'stranger E (same campus) cannot receive the chat topic');
select is(pg_temp.rt('C', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:0', 'C (blocked by A) cannot receive the chat topic');
select is(pg_temp.rt('D', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:0', 'D (other campus) cannot receive the chat topic');
select is(pg_temp.rt('E', 'user:00000000-0000-4000-8000-00000000000a'), 'user:00000000-0000-4000-8000-00000000000a:0', 'E cannot receive A''s inbox topic');
select is(pg_temp.rt('A', 'user:00000000-0000-4000-8000-00000000000a'), 'user:00000000-0000-4000-8000-00000000000a:2', 'A can receive their own inbox topic');
select is(pg_temp.rt('MOD', 'chat:00000000-0000-4000-8000-00000000cc01'), 'chat:00000000-0000-4000-8000-00000000cc01:0', 'a moderator cannot tail a private chat topic');
-- wildcard / odd topics
select is(pg_temp.rt('E', 'chat:%'), 'chat:%:0', 'E cannot receive a wildcard chat topic');
select is(pg_temp.rt('E', 'chat:00000000-0000-4000-8000-00000000cc01 '), 'chat:00000000-0000-4000-8000-00000000cc01 :0', 'trailing-space topic does not widen access');
select is(pg_temp.rt('E', 'quad:00000000-0000-4000-8000-00000000a001'), 'quad:00000000-0000-4000-8000-00000000a001:0', 'there is no readable quad topic');
-- clients cannot publish
select pg_temp.lk(pg_temp.as('E', $$insert into realtime.messages (topic, extension, payload, event, private) values ('chat:00000000-0000-4000-8000-00000000cc01', 'broadcast', '{"x":1}'::jsonb, 'message', true)::text$$ ) , 'ERROR:%', 'E cannot publish into a chat topic via realtime.messages');
select pg_temp.lk(pg_temp.as('A', $$select realtime.send('{"x":1}'::jsonb, 'message', 'chat:00000000-0000-4000-8000-00000000cc01', true)::text$$), 'ERROR:%', 'DEFENSE-IN-DEPTH: a student role cannot call realtime.send (not reachable via the Data API)');
select pg_temp.lk(pg_temp.anon($$select count(*)::text from realtime.messages$$), '%0%', 'anon sees nothing (RLS, no policy for anon)');
select is(pg_temp.anon($$select set_config('realtime.topic','chat:00000000-0000-4000-8000-00000000cc01', true) || ':' || (select count(*) from realtime.messages)::text$$), 'chat:00000000-0000-4000-8000-00000000cc01:0', 'anon cannot receive the chat topic');
