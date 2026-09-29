-- S34: T-INT-ADMIN-01 (roles and MFA), T-INT-ADMIN-02 (one audit row per action),
-- T-INT-ADMIN-04 (reported chats only) and the R1.0 admin RPCs (P12-ADM-03).
begin;
select plan(34);
select tests.create_fixtures();
select tests.set_now('2027-03-10 12:00:00-05');

create function pg_temp.as_admin(who text, q text, aal text default 'aal2') returns text language plpgsql as $$
declare
  res text;
begin
  perform tests.authenticate_as(tests.uid(who), aal);
  begin
    execute q into res;
  exception when others then
    res := 'ERROR: ' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  return res;
end;
$$;
create function pg_temp.audits() returns int language sql as $$ select count(*)::int from public.audit_log $$;

insert into public.listings (id, campus_id, seller_id, title, status, price_cents) values
  ('00000000-0000-4000-8000-00000000ad01', tests.uid('OSU'), tests.uid('A'), 'Sketchy watch', 'active', 5000),
  ('00000000-0000-4000-8000-00000000ad02', tests.uid('OSU'), tests.uid('A'), 'Held lamp', 'held_review', 1000);
insert into public.chats (id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents) values
  ('00000000-0000-4000-8000-00000000cc01', tests.uid('B'), tests.uid('A'), 'Watch', 5000, 4000),
  ('00000000-0000-4000-8000-00000000cc02', tests.uid('C'), tests.uid('A'), 'Other', 100, 100);
insert into public.messages (chat_id, sender_id, body) values ('00000000-0000-4000-8000-00000000cc01', tests.uid('A'), 'send a deposit first');
insert into public.reports (id, campus_id, reporter_id, target_type, target_id, target_user_id, reason, priority) values
  ('00000000-0000-4000-8000-00000000ee01', tests.uid('OSU'), tests.uid('B'), 'listing', '00000000-0000-4000-8000-00000000ad01', tests.uid('A'), 'scam', 2),
  ('00000000-0000-4000-8000-00000000ee02', tests.uid('OSU'), tests.uid('B'), 'chat', '00000000-0000-4000-8000-00000000cc01', tests.uid('A'), 'scam', 2),
  ('00000000-0000-4000-8000-00000000ee03', tests.uid('OSU'), tests.uid('C'), 'user', tests.uid('A')::text, tests.uid('A'), 'threat', 1);

-- T-INT-ADMIN-01: roles and MFA ---------------------------------------------------------------------------
select is(pg_temp.as_admin('A', $$select public.admin_overview()::text$$), 'ERROR: NOT_ADMIN', 'students are not admins');
select is(pg_temp.as_admin('NOMFA', $$select public.admin_overview()::text$$, 'aal1'), 'ERROR: NOT_ADMIN', 'an owner without MFA can do nothing');
select is(pg_temp.as_admin('MOD', $$select public.admin_overview() ->> 'open_reports'$$), '3', 'a moderator sees the overview');
select is(pg_temp.as_admin('MOD', $$select public.admin_overview() ->> 'held_listings'$$), '1', 'held listings count');
select is(pg_temp.as_admin('MOD', $$select public.admin_list_reports() -> 0 ->> 'reason'$$), 'threat', 'priority reports first');
select is(pg_temp.as_admin('MOD', format($$select public.admin_set_user_status(%L, 'suspended', '2027-03-15', 'repeat scams')::text$$, tests.uid('C'))),
  '', 'a moderator suspends for up to 7 days');
select is(pg_temp.as_admin('MOD', format($$select public.admin_set_user_status(%L, 'suspended', '2027-03-30', 'repeat scams')::text$$, tests.uid('C'))),
  'ERROR: NOT_ADMIN', 'but not longer');
select is(pg_temp.as_admin('MOD', format($$select public.admin_set_user_status(%L, 'banned', null, 'repeat scams')::text$$, tests.uid('C'))),
  'ERROR: NOT_ADMIN', 'a moderator cannot ban');
select is(pg_temp.as_admin('MOD', $$select public.admin_set_config('maintenance', '{"enabled": true}', 'deploy')::text$$),
  'ERROR: NOT_ADMIN', 'a moderator cannot change config');
select is(pg_temp.as_admin('MOD', format($$select public.admin_set_user_status(%L, 'active', null, 'x')::text$$, tests.uid('C'))),
  'ERROR: INVALID:reason', 'actions need a reason');

-- T-INT-ADMIN-02: one audit row each ----------------------------------------------------------------------------
select is(pg_temp.audits(), 1, 'the suspension wrote one audit row');
select is((select action || ':' || reason from public.audit_log order by id desc limit 1), 'user.status.suspended:repeat scams', 'with action and reason');
select is((select actor_id from public.audit_log order by id desc limit 1), tests.uid('MOD'), 'and the actor');
select is(pg_temp.as_admin('MOD', $$select public.admin_report_detail('00000000-0000-4000-8000-00000000ee01') ->> 'reason'$$), 'scam', 'report detail');
select is(pg_temp.audits(), 2, 'reading a report is logged');
select is(pg_temp.as_admin('MOD', $$select public.admin_resolve_report('00000000-0000-4000-8000-00000000ee01', 'remove_content', 'counterfeit watch')::text$$),
  '', 'remove the listing');
select is((select status::text from public.listings where id = '00000000-0000-4000-8000-00000000ad01'), 'removed', 'removed');
select is((select status::text from public.reports where id = '00000000-0000-4000-8000-00000000ee01'), 'actioned', 'report actioned');
select is((select count(*)::int from public.notifications where user_id = tests.uid('B') and type = 'report_update'), 1, 'the reporter hears back');
select is(pg_temp.audits(), 3, 'one more audit row');
select is(pg_temp.as_admin('MOD', $$select public.admin_resolve_report('00000000-0000-4000-8000-00000000ee03', 'strike', 'threats in chat')::text$$), '', 'strike');
select is((select status::text || ':' || strike_count from public.profiles where id = tests.uid('A')), 'paused:1', 'a first strike pauses');
select is(pg_temp.as_admin('MOD', $$select public.admin_resolve_report('00000000-0000-4000-8000-00000000ee02', 'ban', 'scammer')::text$$),
  'ERROR: NOT_ADMIN', 'ban is owner only');

-- T-INT-ADMIN-04: reading chats ----------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_read_reported_chat('00000000-0000-4000-8000-00000000ee02') -> 0 ->> 'body'$$),
  'send a deposit first', 'a reported chat can be read');
select is(pg_temp.as_admin('MOD', $$select public.admin_read_reported_chat('00000000-0000-4000-8000-00000000ee03')::text$$),
  'ERROR: FORBIDDEN', 'a report on a person does not open their chats');

-- listings, appeals, owner tools ----------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_set_listing_status('00000000-0000-4000-8000-00000000ad02', 'active', 'looks fine')::text$$), '', 'approve a held listing');
insert into public.appeals (id, user_id, subject_type, subject_id, body)
values ('00000000-0000-4000-8000-00000000af01', tests.uid('A'), 'strike', (select id::text from public.strikes where user_id = tests.uid('A')), 'was a joke');
select is(pg_temp.as_admin('MOD', $$select public.admin_decide_appeal('00000000-0000-4000-8000-00000000af01', 'overturned', 'context checked')::text$$), '', 'overturn');
select is((select status::text || ':' || strike_count from public.profiles where id = tests.uid('A')), 'active:0', 'strike cleared and pause lifted');
select is(pg_temp.as_admin('OWN', $$select public.admin_set_config('min_version_ios', '"1.2.0"', 'force update')::text$$), '', 'the owner sets config');
select is((select value #>> '{}' from public.app_config where key = 'min_version_ios'), '1.2.0', 'config saved');
select is(pg_temp.as_admin('OWN', format($$select public.admin_upsert_safe_spot('{"campus_id": "%s", "name": "Police lobby", "lat": 40, "lng": -83, "designation": "police"}', 'walked it')::text$$, tests.uid('OSU'))),
  'ERROR: INVALID:designated_on', 'police-designated needs a date');
select isnt(pg_temp.as_admin('OWN', format($$select public.admin_upsert_safe_spot('{"campus_id": "%s", "name": "Police lobby", "lat": 40, "lng": -83, "designation": "police", "designated_on": "2027-03-01"}', 'walked it with campus police') ->> 'id'$$, tests.uid('OSU'))),
  null, 'with the date it saves');
select is(pg_temp.as_admin('OWN', format($$select public.admin_upsert_domain('alumni.osu.edu', %L, 'blocked', 'alumni not allowed')::text$$, tests.uid('OSU'))), '', 'domains');
select ok(pg_temp.as_admin('MOD', $$select jsonb_array_length(public.admin_list_audit())::text$$)::int >= 9, 'the audit log lists every action');

select * from finish();
rollback;
