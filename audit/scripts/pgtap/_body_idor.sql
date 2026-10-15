-- Intruders: E (same campus, no relation to A) and D (other campus). Every call must be refused with a *authorization* error, not INVALID.

create function pg_temp.deny(who text, label text, q text) returns text language plpgsql as $$
declare r text;
begin
  r := pg_temp.as(who, 'select (' || q || ')::text');
  return ok(r like 'ERROR: %' and r not like 'ERROR: INVALID%' and r not like '%permission denied for function%', who || ' cannot ' || label || ' => ' || coalesce(r, 'NULL RESULT'));
end; $$;

create function pg_temp.noleak(who text, label text, q text) returns text language plpgsql as $$
declare r text;
begin
  r := pg_temp.as(who, 'select (' || q || ')::text');
  return ok(r like 'ERROR: %' or r is null or r !~* '(Mini fridge|SECRET|Library steps|HELD-LISTING|REMOVED|Aisha|Ben)', who || ' reading ' || label || ' leaks nothing => ' || left(coalesce(r, 'NULL'), 90));
end; $$;

select pg_temp.deny('E', 'accept_offer', $q$public.accept_offer('00000000-0000-4000-8000-00000000bb01')$q$);
select pg_temp.deny('E', 'decline_offer', $q$public.decline_offer('00000000-0000-4000-8000-00000000bb01', 'nope')$q$);
select pg_temp.deny('E', 'counter_offer', $q$public.counter_offer('00000000-0000-4000-8000-00000000bb01', 900, 'hi')$q$);
select pg_temp.deny('E', 'withdraw_offer', $q$public.withdraw_offer('00000000-0000-4000-8000-00000000bb01')$q$);
select pg_temp.deny('E', 'get_offer', $q$public.get_offer('00000000-0000-4000-8000-00000000bb01')$q$);
select pg_temp.deny('E', 'listing_offers', $q$public.listing_offers('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('E', 'listing_stats', $q$public.listing_stats('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('E', 'update_listing', $q$public.update_listing('00000000-0000-4000-8000-00000000aa01', 'HACKED', null, null, null, 1)$q$);
select pg_temp.deny('E', 'delete_listing', $q$public.delete_listing('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('E', 'relist_listing', $q$public.relist_listing('00000000-0000-4000-8000-00000000aa01', 1)$q$);
select pg_temp.deny('E', 'mark_sold', $q$public.mark_sold('00000000-0000-4000-8000-00000000aa01', null)$q$);
select pg_temp.deny('E', 'set_listing_share_image', $q$public.set_listing_share_image('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('E', 'get_chat', $q$public.get_chat('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('E', 'get_messages', $q$public.get_messages('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('E', 'send_message', $q$public.send_message('00000000-0000-4000-8000-00000000cc01', 'hi', gen_random_uuid())$q$);
select pg_temp.deny('E', 'mark_chat_read', $q$public.mark_chat_read('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('E', 'hide_chat', $q$public.hide_chat('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('E', 'set_chat_mute', $q$public.set_chat_mute('00000000-0000-4000-8000-00000000cc01', true)$q$);
select pg_temp.deny('E', 'get_chat_meetup', $q$public.get_chat_meetup('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('E', 'confirm_deal', $q$public.confirm_deal('00000000-0000-4000-8000-00000000cc01', 'sold')$q$);
select pg_temp.deny('E', 'submit_rating', $q$public.submit_rating('00000000-0000-4000-8000-00000000cc01', true)$q$);
select pg_temp.deny('E', 'get_my_rating', $q$public.get_my_rating('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('E', 'propose_meetup', $q$public.propose_meetup('00000000-0000-4000-8000-00000000cc01', '2027-03-12 15:00-05', null, 'Library')$q$);
select pg_temp.deny('E', 'get_meetup', $q$public.get_meetup('00000000-0000-4000-8000-00000000ee01')$q$);
select pg_temp.deny('E', 'confirm_meetup', $q$public.confirm_meetup('00000000-0000-4000-8000-00000000ee01')$q$);
select pg_temp.deny('E', 'cancel_meetup', $q$public.cancel_meetup('00000000-0000-4000-8000-00000000ee01', 'x')$q$);
select pg_temp.deny('E', 'checkin_meetup', $q$public.checkin_meetup('00000000-0000-4000-8000-00000000ee01')$q$);
select pg_temp.deny('E', 'create_meetup_share', $q$public.create_meetup_share('00000000-0000-4000-8000-00000000ee01')$q$);
select pg_temp.deny('E', 'report_noshow', $q$public.report_noshow('00000000-0000-4000-8000-00000000ee01', 'x')$q$);
select pg_temp.deny('E', 'running_late', $q$public.running_late('00000000-0000-4000-8000-00000000ee01', 10)$q$);
select pg_temp.deny('E', 'get_my_report', $q$public.get_my_report('00000000-0000-4000-8000-00000000ff01')$q$);
select pg_temp.deny('E', 'delete_saved_search', $q$public.delete_saved_search('00000000-0000-4000-8000-00000000a501')$q$);
select pg_temp.deny('E', 'update_saved_search', $q$public.update_saved_search('00000000-0000-4000-8000-00000000a501', false, true)$q$);
select pg_temp.deny('E', 'create_report chat', $q$public.create_report('chat', '00000000-0000-4000-8000-00000000cc01', 'harassment')$q$);
select pg_temp.deny('E', 'create_report message', $q$public.create_report('message', (select min(id)::text from public.messages), 'harassment')$q$);
select pg_temp.deny('E', 'delete_quad_post', $q$public.delete_quad_post('00000000-0000-4000-8000-00000000a001')$q$);
select pg_temp.deny('E', 'set_quad_replies', $q$public.set_quad_replies('00000000-0000-4000-8000-00000000a001', false)$q$);
select pg_temp.deny('E', 'get_quad_thread held', $q$public.get_quad_thread('00000000-0000-4000-8000-00000000a002')$q$);
select pg_temp.deny('E', 'create_quad_reply held', $q$public.create_quad_reply('00000000-0000-4000-8000-00000000a002', 'x')$q$);
select pg_temp.deny('E', 'vote_quad held', $q$public.vote_quad('post', '00000000-0000-4000-8000-00000000a002', 1::smallint)$q$);
select pg_temp.deny('E', 'hide_quad_author held', $q$public.hide_quad_author('00000000-0000-4000-8000-00000000a002')$q$);
select pg_temp.deny('D', 'accept_offer', $q$public.accept_offer('00000000-0000-4000-8000-00000000bb01')$q$);
select pg_temp.deny('D', 'decline_offer', $q$public.decline_offer('00000000-0000-4000-8000-00000000bb01', 'nope')$q$);
select pg_temp.deny('D', 'counter_offer', $q$public.counter_offer('00000000-0000-4000-8000-00000000bb01', 900, 'hi')$q$);
select pg_temp.deny('D', 'withdraw_offer', $q$public.withdraw_offer('00000000-0000-4000-8000-00000000bb01')$q$);
select pg_temp.deny('D', 'get_offer', $q$public.get_offer('00000000-0000-4000-8000-00000000bb01')$q$);
select pg_temp.deny('D', 'listing_offers', $q$public.listing_offers('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('D', 'listing_stats', $q$public.listing_stats('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('D', 'update_listing', $q$public.update_listing('00000000-0000-4000-8000-00000000aa01', 'HACKED', null, null, null, 1)$q$);
select pg_temp.deny('D', 'delete_listing', $q$public.delete_listing('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('D', 'relist_listing', $q$public.relist_listing('00000000-0000-4000-8000-00000000aa01', 1)$q$);
select pg_temp.deny('D', 'mark_sold', $q$public.mark_sold('00000000-0000-4000-8000-00000000aa01', null)$q$);
select pg_temp.deny('D', 'set_listing_share_image', $q$public.set_listing_share_image('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('D', 'get_chat', $q$public.get_chat('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('D', 'get_messages', $q$public.get_messages('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('D', 'send_message', $q$public.send_message('00000000-0000-4000-8000-00000000cc01', 'hi', gen_random_uuid())$q$);
select pg_temp.deny('D', 'mark_chat_read', $q$public.mark_chat_read('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('D', 'hide_chat', $q$public.hide_chat('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('D', 'set_chat_mute', $q$public.set_chat_mute('00000000-0000-4000-8000-00000000cc01', true)$q$);
select pg_temp.deny('D', 'get_chat_meetup', $q$public.get_chat_meetup('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('D', 'confirm_deal', $q$public.confirm_deal('00000000-0000-4000-8000-00000000cc01', 'sold')$q$);
select pg_temp.deny('D', 'submit_rating', $q$public.submit_rating('00000000-0000-4000-8000-00000000cc01', true)$q$);
select pg_temp.deny('D', 'get_my_rating', $q$public.get_my_rating('00000000-0000-4000-8000-00000000cc01')$q$);
select pg_temp.deny('D', 'propose_meetup', $q$public.propose_meetup('00000000-0000-4000-8000-00000000cc01', '2027-03-12 15:00-05', null, 'Library')$q$);
select pg_temp.deny('D', 'get_meetup', $q$public.get_meetup('00000000-0000-4000-8000-00000000ee01')$q$);
select pg_temp.deny('D', 'confirm_meetup', $q$public.confirm_meetup('00000000-0000-4000-8000-00000000ee01')$q$);
select pg_temp.deny('D', 'cancel_meetup', $q$public.cancel_meetup('00000000-0000-4000-8000-00000000ee01', 'x')$q$);
select pg_temp.deny('D', 'checkin_meetup', $q$public.checkin_meetup('00000000-0000-4000-8000-00000000ee01')$q$);
select pg_temp.deny('D', 'create_meetup_share', $q$public.create_meetup_share('00000000-0000-4000-8000-00000000ee01')$q$);
select pg_temp.deny('D', 'report_noshow', $q$public.report_noshow('00000000-0000-4000-8000-00000000ee01', 'x')$q$);
select pg_temp.deny('D', 'running_late', $q$public.running_late('00000000-0000-4000-8000-00000000ee01', 10)$q$);
select pg_temp.deny('D', 'get_my_report', $q$public.get_my_report('00000000-0000-4000-8000-00000000ff01')$q$);
select pg_temp.deny('D', 'delete_saved_search', $q$public.delete_saved_search('00000000-0000-4000-8000-00000000a501')$q$);
select pg_temp.deny('D', 'update_saved_search', $q$public.update_saved_search('00000000-0000-4000-8000-00000000a501', false, true)$q$);
select pg_temp.deny('D', 'create_report chat', $q$public.create_report('chat', '00000000-0000-4000-8000-00000000cc01', 'harassment')$q$);
select pg_temp.deny('D', 'create_report message', $q$public.create_report('message', (select min(id)::text from public.messages), 'harassment')$q$);
select pg_temp.deny('D', 'delete_quad_post', $q$public.delete_quad_post('00000000-0000-4000-8000-00000000a001')$q$);
select pg_temp.deny('D', 'set_quad_replies', $q$public.set_quad_replies('00000000-0000-4000-8000-00000000a001', false)$q$);
select pg_temp.deny('D', 'get_quad_thread held', $q$public.get_quad_thread('00000000-0000-4000-8000-00000000a002')$q$);
select pg_temp.deny('D', 'create_quad_reply held', $q$public.create_quad_reply('00000000-0000-4000-8000-00000000a002', 'x')$q$);
select pg_temp.deny('D', 'vote_quad held', $q$public.vote_quad('post', '00000000-0000-4000-8000-00000000a002', 1::smallint)$q$);
select pg_temp.deny('D', 'hide_quad_author held', $q$public.hide_quad_author('00000000-0000-4000-8000-00000000a002')$q$);

-- D (other campus) reading OSU rows by id: access verdict only
select is(pg_temp.as('D', $q$select public.get_profile(tests.uid('A'))::text$q$), '{"id": "00000000-0000-4000-8000-00000000000a", "access": "gone"}', 'D gets only a gone verdict for an OSU profile');
select pg_temp.deny('D', 'get_quad_thread of an OSU post', $q$public.get_quad_thread('00000000-0000-4000-8000-00000000a001')$q$);
select pg_temp.deny('D', 'save an OSU listing', $q$public.save_listing('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('D', 'watch an OSU listing', $q$public.watch_listing('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('D', 'record a view on an OSU listing', $q$public.record_view('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.deny('D', 'report an OSU listing', $q$public.create_report('listing', '00000000-0000-4000-8000-00000000aa01', 'spam')$q$);
select pg_temp.deny('D', 'report an OSU user', $q$public.create_report('user', tests.uid('A')::text, 'spam')$q$);
-- held/removed/deleted listings by id, same-campus stranger: no data
select pg_temp.noleak('E', 'a held listing', $q$public.get_listing('00000000-0000-4000-8000-00000000aa02')$q$);
select pg_temp.noleak('E', 'a removed listing', $q$public.get_listing('00000000-0000-4000-8000-00000000aa03')$q$);
select pg_temp.noleak('E', 'a deleted listing', $q$public.get_listing('00000000-0000-4000-8000-00000000aa04')$q$);
select pg_temp.noleak('D', 'an OSU live listing', $q$public.get_listing('00000000-0000-4000-8000-00000000aa01')$q$);
select pg_temp.noleak('E', 'an offer by id', $q$public.get_offer('00000000-0000-4000-8000-00000000bb01')$q$);
select pg_temp.noleak('E', 'the inbox', $q$public.get_inbox()$q$);
select pg_temp.noleak('E', 'my_listings', $q$public.my_listings()$q$);
select ok(pg_temp.as('E', $q$select public.get_feed()::text$q$) !~* '(HELD-LISTING|REMOVED-LISTING|DELETED-LISTING|UMICH-LISTING|SECRET)', 'E feed has no held, removed, deleted or other-campus listing');
select ok(pg_temp.as('E', $q$select public.search_listings('listing', '{}', null)::text$q$) !~* '(HELD-LISTING|REMOVED-LISTING|DELETED-LISTING|UMICH-LISTING|SECRET)', 'E search has no held, removed, deleted or other-campus listing');
select ok(pg_temp.as('D', $q$select public.search_listings('listing', '{}', null)::text$q$) !~* '(LIVE-LISTING|HELD-LISTING|REMOVED-LISTING)', 'D search has no OSU listing');

-- No state changed under all those attacks
select is((select status::text from public.offers where id = '00000000-0000-4000-8000-00000000bb01'), 'pending', 'the offer is still pending');
select is((select title from public.listings where id = '00000000-0000-4000-8000-00000000aa01'), 'LIVE-LISTING', 'the listing title is unchanged');
select is((select status::text from public.listings where id = '00000000-0000-4000-8000-00000000aa01'), 'active', 'the listing is still active');
select is((select count(*)::int from public.messages), 1, 'no message was injected into A and B''s chat');
select is((select count(*)::int from public.saved_searches), 1, 'A''s saved search survived');
select is((select status::text from public.meetups where id = '00000000-0000-4000-8000-00000000ee01'), 'proposed', 'the meetup is unchanged');
select is((select count(*)::int from public.reports), 1, 'no stray reports were created (evidence copies of private chats)');
select is((select count(*)::int from public.chats), 1, 'chat untouched');
