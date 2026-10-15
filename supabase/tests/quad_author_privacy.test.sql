-- A-01, A-02 (DEC 104): a Quad report never names the author to a moderator.
-- Report rows keep no author, admin reads and the audit log show none, and a
-- strike still reaches the author without anyone seeing who it is. Only
-- admin_reveal_quad_author names the author (SECURITY T12, T-INT-QUAD-ANON-02).
begin;
select plan(18);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');
update public.profiles set created_at = '2027-01-01', quad_rules_accepted_at = '2027-02-01'
where campus_id = tests.uid('OSU');
update public.app_config set value = 'true' where key = 'quad_enabled';
update public.campuses set quad_enabled = true where id = tests.uid('OSU');

create function pg_temp.as_admin(who text, q text, amr jsonb default '[]', aal text default 'aal2')
returns text language plpgsql as $$
declare
  res text;
begin
  perform tests.authenticate_as(tests.uid(who), aal);
  perform set_config('request.jwt.claims',
    (current_setting('request.jwt.claims')::jsonb || jsonb_build_object('amr', amr))::text, true);
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;
create function pg_temp.totp_now() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from private.now())))
$$;
-- True when the text names A (the author) by id or display name.
create function pg_temp.names_a(t text) returns boolean language sql as $$
  select coalesce(t, '') like '%' || tests.uid('A') || '%'
      or coalesce(t, '') like '%' || (select display_name from public.profiles where id = tests.uid('A')) || '%'
$$;

insert into public.quad_posts (id, campus_id, author_id, body, status) values
  ('00000000-0000-4000-8000-00000000f101', tests.uid('OSU'), tests.uid('A'), 'parking is a scam here', 'live'),
  ('00000000-0000-4000-8000-00000000f102', tests.uid('OSU'), tests.uid('A'), 'second post', 'live');

-- Report rows ---------------------------------------------------------------------------------------
select is(tests.try_text_as(tests.uid('C'),
  $$select (public.create_report('quad_post', '00000000-0000-4000-8000-00000000f101', 'harassment') ? 'id')::text$$),
  'true', 'a student reports a Quad post');
select is((select count(*)::int from public.reports
           where target_id = '00000000-0000-4000-8000-00000000f101' and target_user_id is null), 1,
  'the report row keeps no author');
insert into public.reports (campus_id, reporter_id, target_type, target_id, target_user_id, reason) values
  (tests.uid('OSU'), null, 'quad_post', '00000000-0000-4000-8000-00000000f102', tests.uid('A'), 'other');
select is((select target_user_id from public.reports where target_id = '00000000-0000-4000-8000-00000000f102'), null,
  'an author passed in by any path (the vote auto-hide) is dropped');

-- Moderator reads -----------------------------------------------------------------------------------
select ok(not pg_temp.names_a(pg_temp.as_admin('MOD', $$select public.admin_list_reports()::text$$)),
  'the report queue does not name the author');
select ok(not pg_temp.names_a(pg_temp.as_admin('MOD', format($$select public.admin_report_detail(%L)::text$$,
  (select id from public.reports where target_id = '00000000-0000-4000-8000-00000000f101')))),
  'report detail does not name the author');
select is(pg_temp.as_admin('MOD', format($$select count(*)::text from public.reports where target_user_id = %L$$, tests.uid('A'))),
  '0', 'a direct read of reports links no report to the author');
select is(pg_temp.as_admin('MOD', format($$select jsonb_array_length(public.admin_person_reports(%L) -> 'against')::text$$, tests.uid('A'))),
  '0', 'the author''s person page lists no Quad reports against them');

-- Acting without knowing who ------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', format($$select public.admin_resolve_report(%L, 'strike', 'harassment on the Quad')::text$$,
  (select id from public.reports where target_id = '00000000-0000-4000-8000-00000000f101'))),
  '', 'a moderator strikes the author of a reported post');
select is((select count(*)::int from public.strikes where user_id = tests.uid('A')), 1, 'the strike lands on the author');
select is((select report_id from public.strikes where user_id = tests.uid('A')), null,
  'the strike does not point back at the Quad report');
select is((select status::text from public.profiles where id = tests.uid('A')), 'paused', 'a first strike pauses the author');
select is((select count(*)::int from public.notifications where user_id = tests.uid('A') and type = 'account_notice'), 1,
  'the author is told');
select ok(not pg_temp.names_a((select string_agg(meta::text, ',') from public.audit_log where action like 'report.%')),
  'the report audit row does not name the author');

-- Reveal (A-02) -------------------------------------------------------------------------------------
select ok(pg_temp.names_a(pg_temp.as_admin('OWN', $$select public.admin_reveal_quad_author('post', '00000000-0000-4000-8000-00000000f102', 'CASE-9', 'threat report')::text$$, pg_temp.totp_now())),
  'the owner reveal still names the author');
select ok(not pg_temp.names_a((select meta::text from public.audit_log where action = 'quad.reveal')),
  'the reveal audit row keeps the case ref, not the author');

-- An older audit row that still carries author_id (written before 0220).
insert into public.audit_log (actor_id, action, target_type, target_id, campus_id, reason, meta) values
  (tests.uid('OWN'), 'quad.reveal', 'quad_post', '00000000-0000-4000-8000-00000000f101', tests.uid('OSU'), 'old case',
   jsonb_build_object('case_ref', 'CASE-1', 'author_id', tests.uid('A')));
select is(pg_temp.as_admin('MOD', format($$select count(*)::text from public.audit_log where meta::text like '%%%s%%'$$, tests.uid('A'))),
  '0', 'a moderator cannot read an old audit row that names the author');
select ok(not pg_temp.names_a(pg_temp.as_admin('MOD', $$select public.admin_list_audit_v2('{"action":"quad."}')::text$$)),
  'the audit page strips author ids');
select ok(not pg_temp.names_a(pg_temp.as_admin('MOD', $$select public.admin_list_audit('{"action":"quad."}')::text$$)),
  'and so does the older audit read');

select * from finish();
rollback;
