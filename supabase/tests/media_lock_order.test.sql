-- RV-03 (0246, DEC 139): one lock order for media writes, so a report and a
-- photo edit (or a deletion) cannot deadlock. The media advisory lock comes
-- before rate counters (private.hit) and row locks in every function that
-- takes it; create_report takes the uploaders' locks before its counter and
-- before its trigger updates the listing. Two sessions cannot run in pgTAP,
-- so the order is checked in the function source.
begin;
select plan(16);

-- Position of a fragment in a function's definition (0 when absent).
create function pg_temp.at(fn text, fragment text) returns int language sql as $$
  select strpos(pg_get_functiondef(fn::regprocedure), fragment)
$$;
create function pg_temp.before(fn text, first text, later text) returns boolean language sql as $$
  select pg_temp.at(fn, first) > 0 and pg_temp.at(fn, later) > 0 and pg_temp.at(fn, first) < pg_temp.at(fn, later)
$$;

select ok(pg_temp.before('public.create_report(text,text,text,text)', 'private.lock_report_media(', 'private.hit(''report'''),
  'RV-03 create_report locks the uploaders before its rate counter');
select ok(pg_temp.before('public.create_report(text,text,text,text)', 'private.lock_report_media(', 'insert into public.reports'),
  'and before the insert whose trigger updates the listing');
select ok(pg_temp.before('private.snapshot_evidence(text,text)', 'private.lock_report_media(', 'private.snapshot_evidence_unguarded('),
  'snapshot_evidence locks before it reads');
select ok(pg_temp.before('public.update_listing(uuid,text,text,smallint,public.item_condition,integer,boolean,jsonb,uuid[],text,text[])',
                         'hashtext(''media:''', 'for update'),
  'update_listing takes the media lock before the listing row lock');
select ok(pg_temp.before('public.update_listing(uuid,text,text,smallint,public.item_condition,integer,boolean,jsonb,uuid[],text,text[])',
                         'hashtext(''media:''', 'private.hit('),
  'and before its rate counter');
select ok(pg_temp.before((select oid::regprocedure::text from pg_proc where proname = 'create_listing' and pronamespace = 'public'::regnamespace),
                         'hashtext(''media:''', 'private.hit('),
  'create_listing locks before its rate counters');
select ok(pg_temp.before((select oid::regprocedure::text from pg_proc where proname = 'create_news' and pronamespace = 'public'::regnamespace),
                         'hashtext(''media:''', 'private.hit('),
  'create_news locks before its rate counters');
select ok(pg_temp.before((select oid::regprocedure::text from pg_proc where proname = 'update_profile' and pronamespace = 'public'::regnamespace),
                         'hashtext(''media:''', 'private.hit('),
  'update_profile locks before its rate counter');
select ok(pg_temp.before((select oid::regprocedure::text from pg_proc where proname = 'create_quad_post' and pronamespace = 'public'::regnamespace),
                         'hashtext(''media:''', 'private.hit('),
  'create_quad_post locks before its rate counters');
select ok(pg_temp.before((select oid::regprocedure::text from pg_proc where proname = 'send_message' and pronamespace = 'public'::regnamespace),
                         'private.claim_upload(', 'private.hit('),
  'send_message claims (and locks) before its rate counters');
-- 0247 (IR4-02): vote_quad takes the post author's lock before its counter and the post row.
select ok(pg_temp.before('public.vote_quad(text,uuid,smallint)', 'private.lock_report_media(', 'private.hit(''quad_vote'''),
  'IR4-02 vote_quad locks the post author before its rate counter');
select ok(pg_temp.before('public.vote_quad(text,uuid,smallint)', 'private.lock_report_media(', 'private.quad_live_post('),
  'and before it locks the post row');
select ok(pg_temp.before('public.vote_quad(text,uuid,smallint)', 'private.lock_report_media(', 'update public.quad_posts'),
  'and before it updates the post');
-- 0247 (IR4-03): send_message locks, then re-checks client_id, then claims.
select ok(pg_temp.before((select oid::regprocedure::text from pg_proc where proname = 'send_message' and pronamespace = 'public'::regnamespace),
                         'private.media_lock(', 'private.claim_upload('),
  'IR4-03 send_message takes the sender''s media lock before it claims');
select ok((select strpos(substr(d, strpos(d, 'private.media_lock(')), 'x.client_id = send_message.client_id') > 0
           and strpos(d, 'private.media_lock(') > 0
           from (select pg_get_functiondef(p.oid) d from pg_proc p
                 where p.proname = 'send_message' and p.pronamespace = 'public'::regnamespace) f),
  'and re-checks client_id under that lock');
select ok(pg_temp.before('private.prepare_account_deletion(uuid,boolean)', 'hashtext(''media:''', 'private.hit_key(')
          and pg_temp.before('private.prepare_account_deletion(uuid,boolean)', 'hashtext(''media:''', 'update public.chats')
          and pg_temp.before('private.prepare_account_deletion(uuid,boolean)', 'hashtext(''media:''', 'delete from public.rate_counters'),
  'prepare_account_deletion locks before its counter, the chats and the counter rows it deletes');

select * from finish();
rollback;
