-- S51 admin extras (0205; R11-ADM-02, API §4): the admin team (owner only,
-- not self, the person must have an account), announcements (T-INT-ANN-01:
-- 1 per 7 days per campus; safety to every active member, news and updates
-- only to the tips pref, also at send time), banned words, and
-- T-INT-ADMIN-01/02 for each: students, moderators and an owner without MFA
-- are refused; every write leaves exactly one audit_log row.
begin;
select plan(72);
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

-- Team ------------------------------------------------------------------------------------------
select is(pg_temp.as_admin('A', $$select public.admin_invite_admin('b@osu.edu', 'moderator', null, 'help with reports')::text$$),
  'ERROR: NOT_ADMIN', 'a student cannot invite');
select is(pg_temp.as_admin('MOD', $$select public.admin_invite_admin('b@osu.edu', 'moderator', null, 'help with reports')::text$$),
  'ERROR: NOT_ADMIN', 'a moderator cannot invite');
select is(pg_temp.as_admin('NOMFA', $$select public.admin_invite_admin('b@osu.edu', 'moderator', null, 'help with reports')::text$$, 'aal1'),
  'ERROR: NOT_ADMIN', 'an owner without MFA cannot invite');
select is(pg_temp.as_admin('OWN', $$select public.admin_invite_admin('nobody@osu.edu', 'moderator', null, 'help with reports')::text$$),
  'ERROR: INVALID:email', 'the person must already have an account');
select is(pg_temp.as_admin('OWN', $$select public.admin_invite_admin('b@osu.edu', 'superadmin', null, 'help with reports')::text$$),
  'ERROR: INVALID:role', 'only owner or moderator');
select is(pg_temp.as_admin('OWN', $$select public.admin_invite_admin('own@osu.edu', 'moderator', null, 'step down')::text$$),
  'ERROR: INVALID:self', 'not yourself');
select is(pg_temp.as_admin('OWN', $$select public.admin_invite_admin('b@osu.edu', 'moderator', null, 'x')::text$$),
  'ERROR: INVALID:reason', 'needs a reason');
select is(pg_temp.audits(), 0, 'refused calls write nothing');

select is(pg_temp.as_admin('OWN', $$select (r ->> 'role') || ':' || (r ->> 'display_name') || ':' || (r ->> 'updated')
                                    from public.admin_invite_admin(' B@OSU.edu ', 'moderator', null, 'help with reports') r$$),
  'moderator:Ben B.:false', 'the owner adds a moderator by school email');
select is((select role::text || ':' || (campus_id = tests.uid('OSU'))::text || ':' || (invited_by = tests.uid('OWN'))::text
           from public.admins where user_id = tests.uid('B')),
  'moderator:true:true', 'bound to their own campus, invited_by recorded');
select is(pg_temp.audits(), 1, 'one audit row');
select is((select action || ':' || target_id || ':' || reason || ':' || (meta ->> 'role') from public.audit_log order by id desc limit 1),
  'admin.invite:' || tests.uid('B') || ':help with reports:moderator', 'with the action, target, reason and role');
select is(pg_temp.as_admin('B', $$select public.admin_overview() ->> 'open_reports'$$), '0', 'the new moderator can open the console');
select is(pg_temp.as_admin('OWN', format($$select (r ->> 'campus_id') || ':' || (r ->> 'updated') from public.admin_invite_admin('b@osu.edu', 'moderator', %L, 'cover michigan') r$$, tests.uid('UMICH'))),
  tests.uid('UMICH') || ':true', 'inviting again changes the campus');
select is(pg_temp.as_admin('OWN', $$select public.admin_invite_admin('b@osu.edu', 'moderator', '00000000-0000-4000-8000-00000000ffff', 'cover nowhere')::text$$),
  'ERROR: INVALID:campus_id', 'the campus must exist');
select is(pg_temp.as_admin('OWN', $$select (r ->> 'role') || ':' || coalesce(r ->> 'campus_id', 'all') from public.admin_invite_admin('nomfa@osu.edu', 'moderator', null, 'step down to moderator') r$$),
  'moderator:' || tests.uid('OSU'), 'another owner can be moved to moderator');
select is(pg_temp.as_admin('OWN', $$select (r ->> 'role') || ':' || coalesce(r ->> 'campus_id', 'all') from public.admin_invite_admin('nomfa@osu.edu', 'owner', null, 'back to owner') r$$),
  'owner:all', 'and back to owner, unscoped');
select is(pg_temp.audits(), 4, 'each change is one audit row');
update public.profiles set status = 'suspended' where id = tests.uid('C');
select is(pg_temp.as_admin('OWN', $$select public.admin_invite_admin('c@osu.edu', 'moderator', null, 'help with reports')::text$$),
  'ERROR: INVALID:status', 'not a suspended account');
update public.profiles set status = 'active' where id = tests.uid('C');

select is(pg_temp.as_admin('OWN', $$select jsonb_array_length(public.admin_list_admins())::text$$), '4', 'the team list');
select is(pg_temp.as_admin('OWN', format($$select x ->> 'email' from jsonb_array_elements(public.admin_list_admins()) x where x ->> 'user_id' = %L$$, tests.uid('B'))),
  'b@osu.edu', 'the owner sees emails');
select is(pg_temp.as_admin('MOD', $$select public.admin_list_admins()::text$$), 'ERROR: NOT_ADMIN', 'moderators cannot list the team');

select is(pg_temp.as_admin('MOD', format($$select public.admin_remove_admin(%L, 'too many mods')::text$$, tests.uid('B'))),
  'ERROR: NOT_ADMIN', 'a moderator cannot remove');
select is(pg_temp.as_admin('OWN', format($$select public.admin_remove_admin(%L, 'leaving')::text$$, tests.uid('OWN'))),
  'ERROR: INVALID:self', 'an owner cannot remove themselves');
select is(pg_temp.as_admin('OWN', format($$select public.admin_remove_admin(%L, 'not an admin')::text$$, tests.uid('C'))),
  'ERROR: NOT_FOUND', 'removing someone who is not an admin');
select is(pg_temp.as_admin('OWN', format($$select public.admin_remove_admin(%L, 'semester over')::text$$, tests.uid('B'))),
  '', 'the owner removes a moderator');
select ok(not exists (select 1 from public.admins where user_id = tests.uid('B')), 'gone from admins');
select is((select action || ':' || (meta ->> 'role') from public.audit_log order by id desc limit 1), 'admin.remove:moderator', 'logged once');
select is(pg_temp.audits(), 5, 'one row for the removal');
select is(pg_temp.as_admin('B', $$select public.admin_overview()::text$$), 'ERROR: NOT_ADMIN', 'and the console is closed to them');

-- Announcements (T-INT-ANN-01) ------------------------------------------------------------------
insert into public.notification_prefs (user_id, tips) values (tests.uid('B'), true)
on conflict (user_id) do update set tips = true;
insert into public.notification_prefs (user_id, tips) values (tests.uid('C'), false)
on conflict (user_id) do update set tips = false;

select is(pg_temp.as_admin('MOD', format($$select public.admin_create_announcement(%L, 'safety', 'Bike thefts', 'Lock your bike.', true, 24, 'campus police note')::text$$, tests.uid('OSU'))),
  'ERROR: NOT_ADMIN', 'moderators cannot announce');
select is(pg_temp.as_admin('OWN', format($$select public.admin_create_announcement(%L, 'promo', 'Hi', 'Body', true, 24, 'weekly news')::text$$, tests.uid('OSU'))),
  'ERROR: INVALID:type', 'type is safety, news or update');
select is(pg_temp.as_admin('OWN', format($$select public.admin_create_announcement(%L, 'news', %L, 'Body', true, 24, 'weekly news')::text$$, tests.uid('OSU'), repeat('x', 61))),
  'ERROR: INVALID:title', 'title up to 60');
select is(pg_temp.as_admin('OWN', format($$select public.admin_create_announcement(%L, 'news', 'Hi', %L, true, 24, 'weekly news')::text$$, tests.uid('OSU'), repeat('x', 201))),
  'ERROR: INVALID:body', 'body up to 200');
select is(pg_temp.as_admin('OWN', format($$select public.admin_create_announcement(%L, 'news', 'Hi', 'Body', true, 200, 'weekly news')::text$$, tests.uid('OSU'))),
  'ERROR: INVALID:pinned_hours', 'pinned for at most a week');
select is(pg_temp.as_admin('OWN', $$select public.admin_create_announcement(null, 'news', 'Hi', 'Body', true, 24, 'weekly news')::text$$),
  'ERROR: INVALID:campus_id', 'one campus at a time');

select is(pg_temp.as_admin('OWN', format($$select (r ->> 'recipients') || ':' || (r ->> 'pinned_until')::timestamptz::text
                                           from public.admin_create_announcement(%L, 'safety', 'Bike thefts near the Union', 'Lock your bike with a U-lock.', true, 48, 'campus police note') r$$, tests.uid('OSU'))),
  '6:' || ('2027-03-12 12:00:00-05'::timestamptz)::text, 'a safety announcement reaches every active member and pins for 48 h');
select is((select count(*)::int from public.notifications where type = 'announcement_safety'), 6, 'six announcement_safety notifications');
select is((select grp || ':' || title || ':' || body || ':' || (data ->> 'kind') from public.notifications
           where type = 'announcement_safety' and user_id = tests.uid('C')),
  'safety:Bike thefts near the Union:Lock your bike with a U-lock.:safety', 'grouped under safety, even with tips off');
select is((select count(*)::int from public.notifications where type = 'announcement_safety' and user_id = tests.uid('D')), 0,
  'other campuses hear nothing');
select ok((select sent_at is not null and send_push from public.announcements where campus_id = tests.uid('OSU')), 'sent_at stamped');
select is((select action || ':' || (meta ->> 'recipients') from public.audit_log order by id desc limit 1), 'announcement.create:6', 'one audit row with the reach');
select is(pg_temp.audits(), 6, 'exactly one');
select is(tests.try_text_as(tests.uid('A'), $$select title from public.announcements$$), 'Bike thefts near the Union',
  'members can read the pinned announcement (Quad feed)');

select is(pg_temp.as_admin('OWN', format($$select public.admin_create_announcement(%L, 'news', 'Swap week', 'Post your stuff.', true, 24, 'weekly news')::text$$, tests.uid('OSU'))),
  'ERROR: RATE_LIMITED:announcement:2027-03-17T17:00:00Z', 'a second one within 7 days is refused, with the time it opens');
select is(pg_temp.audits(), 6, 'refused: no audit row');
select is(pg_temp.as_admin('OWN', format($$select (r ->> 'recipients') || ':' || coalesce(r ->> 'pinned_until', 'none')
                                           from public.admin_create_announcement(%L, 'update', 'We are live', 'Michigan is next.', false, 0, 'launch note') r$$, tests.uid('UMICH'))),
  '0:none', 'the limit is per campus; no push and no pin is fine');
select ok((select sent_at is null from public.announcements where campus_id = tests.uid('UMICH')), 'not sent');

select tests.set_now('2027-03-17 12:30:00-05');
select is(pg_temp.as_admin('OWN', format($$select (r ->> 'recipients') from public.admin_create_announcement(%L, 'news', 'Swap week', 'Post your stuff.', true, 24, 'weekly news') r$$, tests.uid('OSU'))),
  '1', 'after 7 days: news goes only to members with tips on');
select is((select string_agg(p.first_name, ',') from public.notifications n join public.profiles p on p.id = n.user_id where n.type = 'announcement_news'),
  'Ben', 'Ben has tips on');
select is((select grp from public.notifications where type = 'announcement_news'), 'campus', 'grouped under campus');
select ok(tests.try_ok_as(tests.uid('B'), $$select public.update_notification_prefs('{"tips": false}')$$), 'Ben turns tips off before it sends');
select is((select push_state::text from public.notifications where type = 'announcement_news'), 'skipped', 'the waiting news push is dropped');
select is(pg_temp.as_admin('MOD', $$select (x -> 0 ->> 'title') || ':' || (x -> 0 ->> 'recipients') || ':' || jsonb_array_length(x)
                                    from public.admin_list_announcements() x$$),
  'Swap week:1:2', 'moderators list their campus only, newest first');
select is(pg_temp.as_admin('A', $$select public.admin_list_announcements()::text$$), 'ERROR: NOT_ADMIN', 'students cannot list');

-- Banned words ----------------------------------------------------------------------------------
select is(pg_temp.as_admin('MOD', $$select public.admin_upsert_banned_word('fake ticket', 'phrase', '{listing}', 'block', 'ticket scams')::text$$),
  'ERROR: NOT_ADMIN', 'moderators cannot edit banned words');
select is(pg_temp.as_admin('OWN', $$select public.admin_upsert_banned_word('fake ticket', 'fuzzy', '{listing}', 'block', 'ticket scams')::text$$),
  'ERROR: INVALID:match', 'match is word, phrase or regex');
select is(pg_temp.as_admin('OWN', $$select public.admin_upsert_banned_word('fake ticket', 'phrase', '{email}', 'block', 'ticket scams')::text$$),
  'ERROR: INVALID:scopes', 'known scopes only');
select is(pg_temp.as_admin('OWN', $$select public.admin_upsert_banned_word('fake ticket', 'phrase', '{}', 'block', 'ticket scams')::text$$),
  'ERROR: INVALID:scopes', 'at least one scope');
select is(pg_temp.as_admin('OWN', $$select public.admin_upsert_banned_word('(unclosed', 'regex', '{listing}', 'block', 'ticket scams')::text$$),
  'ERROR: INVALID:pattern', 'a regex must compile');
select is(pg_temp.as_admin('OWN', $$select public.admin_upsert_banned_word('fake ticket', 'phrase', '{listing}', 'ban', 'ticket scams')::text$$),
  'ERROR: INVALID:action', 'action is block or review');
select is(pg_temp.audits(), 8, 'refused edits write nothing');

select is(pg_temp.as_admin('OWN', $$select (r ->> 'pattern') || ':' || (r ->> 'created') from public.admin_upsert_banned_word(' Fake Ticket ', 'phrase', '{quad,listing,listing}', 'block', 'ticket scams') r$$),
  'fake ticket:true', 'the owner adds a phrase (lowercased, trimmed)');
select is(private.check_text('selling a FAKE ticket cheap', 'listing'), 'block:fake ticket', 'and it blocks right away');
select is(pg_temp.as_admin('OWN', $$select (r ->> 'action') || ':' || (r ->> 'created') || ':' || (r -> 'scopes')::text
                                    from public.admin_upsert_banned_word('fake ticket', 'phrase', '{listing}', 'review', 'hold for review instead') r$$),
  'review:false:["listing"]', 'the same pattern again updates it');
select is((select count(*)::int from public.banned_words where pattern = 'fake ticket'), 1, 'one row');
select is((select string_agg(action, ',' order by id) from public.audit_log where action like 'banned_word.%'), 'banned_word.create,banned_word.update',
  'create then update, one audit row each');
select is(pg_temp.as_admin('MOD', $$select x -> 0 ->> 'pattern' from public.admin_list_banned_words('{"q": "fake tick", "scope": "listing"}') x$$),
  'fake ticket', 'moderators can search the list');
select is(pg_temp.as_admin('OWN', format($$select public.admin_delete_banned_word(%L, 'no longer needed')::text$$,
                                          (select id from public.banned_words where pattern = 'fake ticket'))),
  '', 'the owner deletes it');
select is(private.check_text('selling a fake ticket cheap', 'listing'), 'ok', 'and the text passes again');
select is(pg_temp.as_admin('OWN', $$select public.admin_delete_banned_word('00000000-0000-4000-8000-00000000ffff', 'no longer needed')::text$$),
  'ERROR: NOT_FOUND', 'unknown id');
select is(pg_temp.audits(), 11, 'every successful admin write in this file left exactly one audit row');

select * from finish();
rollback;
