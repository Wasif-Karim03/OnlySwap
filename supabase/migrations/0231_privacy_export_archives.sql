-- 0231: privacy fixes from the audit (B-02, B-03; DEC 119).
-- B-02: the data export now includes the person's activity events (the
-- privacy policy lists them; kept 30 days) and the count of right swipes
-- (stored as 'right' since 0222). account_deletions is not exported: it only
-- exists while an account is being deleted.
-- B-03: prepare_account_deletion also returns the keys of the person's
-- archived chats (archive/chats/{chat}.json in the private bucket) so the
-- delete-account function removes them, as DATA_MODEL §5 says.
-- Both functions are copied whole (export_user_data from 0205,
-- prepare_account_deletion from 0220) with only those lines added.

create or replace function private.export_user_data(p_uid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  out jsonb;
begin
  select * into p from public.profiles x where x.id = p_uid;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;

  out := jsonb_build_object(
    'format', 'onlyswap-export-1',
    'generated_at', private.now(),
    'account', jsonb_build_object(
      'id', p.id,
      'email', (select u.email from auth.users u where u.id = p.id),
      'campus', (select jsonb_build_object('name', c.name, 'slug', c.slug) from public.campuses c where c.id = p.campus_id),
      'status', p.status, 'status_reason', p.status_reason, 'paused_until', p.paused_until,
      'created_at', p.created_at, 'verified_until', p.verified_until, 'last_active_at', p.last_active_at,
      'age_confirmed_at', p.adult_confirmed_at, 'age_method', p.age_method,
      'rules_accepted_at', p.rules_accepted_at, 'rules_version', p.rules_version,
      'quad_rules_accepted_at', p.quad_rules_accepted_at,
      'invite_code', p.invite_code, 'joined_with_invite', p.invited_by is not null,
      'founding_seller_until', p.founding_seller_until,
      'strike_count', p.strike_count, 'noshow_count', p.noshow_count),
    'profile', jsonb_build_object(
      'first_name', p.first_name, 'last_initial', p.last_initial, 'display_name', p.display_name,
      'year', p.year, 'areas', to_jsonb(p.areas), 'bio', p.bio, 'avatar_path', p.avatar_path),
    'settings', jsonb_build_object(
      'theme_mode', p.theme_mode, 'analytics_opt_in', p.analytics_opt_in, 'crash_reports_opt_in', p.crash_reports_opt_in),
    'notification_prefs', (select to_jsonb(np) - 'user_id' from public.notification_prefs np where np.user_id = p.id),
    'push_tokens', coalesce((select jsonb_agg(jsonb_build_object(
        'platform', t.platform, 'app_version', t.app_version, 'token_ending', right(t.token, 6),
        'created_at', t.created_at, 'last_seen_at', t.last_seen_at, 'disabled_at', t.disabled_at) order by t.created_at)
      from public.push_tokens t where t.user_id = p.id), '[]'),

    'listings', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'kind', l.kind, 'status', l.status, 'title', l.title, 'description', l.description,
        'category', (select c.slug from public.categories c where c.id = l.category_id),
        'condition', l.condition, 'price_cents', l.price_cents, 'open_to_offers', l.open_to_offers,
        'meet_spots', (select coalesce(jsonb_agg(s.name), '[]') from public.safe_spots s where s.id = any (l.meet_spot_ids)),
        'meet_note', l.meet_note, 'availability', to_jsonb(l.availability), 'wanted_max_cents', l.wanted_max_cents,
        'view_count', l.view_count, 'save_count', l.save_count, 'offer_count', l.offer_count,
        'sold_at', l.sold_at, 'sold_in_app', l.sold_in_app, 'expires_at', l.expires_at,
        'created_at', l.created_at, 'updated_at', l.updated_at, 'deleted_at', l.deleted_at,
        'photos', coalesce((select jsonb_agg(jsonb_build_object('idx', ph.idx, 'path', ph.path, 'thumb_path', ph.thumb_path) order by ph.idx)
                            from public.listing_photos ph where ph.listing_id = l.id), '[]'),
        'price_changes', coalesce((select jsonb_agg(jsonb_build_object('old_cents', pc.old_cents, 'new_cents', pc.new_cents, 'changed_at', pc.changed_at) order by pc.id)
                                   from public.listing_price_changes pc where pc.listing_id = l.id), '[]'))
        order by l.created_at)
      from public.listings l where l.seller_id = p.id), '[]'),

    'offers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'role', case when o.buyer_id = p.id then 'buyer' else 'seller' end,
        'listing_id', o.listing_id,
        'listing_title', coalesce((select l.title from public.listings l where l.id = o.listing_id),
                                  (select ch.listing_title from public.chats ch where ch.offer_id = o.id)),
        'other_person', private.export_name(case when o.buyer_id = p.id then o.seller_id else o.buyer_id end),
        'amount_cents', o.amount_cents, 'note', o.note, 'quick_notes', to_jsonb(o.quick_notes),
        'status', o.status, 'round', o.round, 'last_actor', o.last_actor, 'decline_reason', o.decline_reason,
        'created_at', o.created_at, 'responded_at', o.responded_at, 'expires_at', o.expires_at) order by o.created_at)
      from public.offers o where o.buyer_id = p.id or o.seller_id = p.id), '[]'),

    'chats', coalesce((select jsonb_agg(jsonb_build_object(
        'id', ch.id, 'role', case when ch.buyer_id = p.id then 'buyer' else 'seller' end,
        'other_person', private.export_name(case when ch.buyer_id = p.id then ch.seller_id else ch.buyer_id end),
        'listing_id', ch.listing_id, 'listing_title', ch.listing_title, 'listing_price_cents', ch.listing_price_cents,
        'agreed_cents', ch.agreed_cents, 'status', ch.status, 'created_at', ch.created_at, 'closed_at', ch.closed_at,
        'my_outcome', case when ch.buyer_id = p.id then ch.buyer_outcome else ch.seller_outcome end,
        'archived_at', ch.archived_at,
        'messages', coalesce((select jsonb_agg(jsonb_build_object(
            'from', case when m.kind = 'system' then 'system' when m.sender_id = p.id then 'me' else 'them' end,
            'kind', m.kind, 'body', m.body, 'photo_path', m.photo_path, 'created_at', m.created_at) order by m.id)
          from public.messages m where m.chat_id = ch.id), '[]'),
        'meetups', coalesce((select jsonb_agg(jsonb_build_object(
            'place', coalesce((select s.name from public.safe_spots s where s.id = mt.spot_id), mt.custom_place),
            'starts_at', mt.starts_at, 'status', mt.status, 'proposed_by_me', mt.proposed_by = p.id,
            'confirmed_at', mt.confirmed_at, 'created_at', mt.created_at) order by mt.created_at)
          from public.meetups mt where mt.chat_id = ch.id), '[]'))
        order by ch.created_at)
      from public.chats ch where ch.buyer_id = p.id or ch.seller_id = p.id), '[]'),

    'ratings_given', coalesce((select jsonb_agg(jsonb_build_object(
        'chat_id', r.chat_id, 'about', private.export_name(r.ratee_id), 'thumbs_up', r.thumbs_up,
        'tags', to_jsonb(r.tags), 'comment', r.comment, 'created_at', r.created_at) order by r.created_at)
      from public.ratings r where r.rater_id = p.id), '[]'),
    -- Only ratings the app already shows (both rated, or 7 days old).
    'ratings_received', coalesce((select jsonb_agg(jsonb_build_object(
        'chat_id', r.chat_id, 'from', private.export_name(r.rater_id), 'thumbs_up', r.thumbs_up,
        'tags', to_jsonb(r.tags), 'comment', r.comment, 'created_at', r.created_at) order by r.created_at)
      from public.ratings r
      where r.ratee_id = p.id
        and (r.created_at < private.now() - interval '7 days'
             or exists (select 1 from public.ratings o where o.chat_id = r.chat_id and o.rater_id = p.id))), '[]'),

    'saved', coalesce((select jsonb_agg(jsonb_build_object(
        'listing_id', s.listing_id, 'title', (select l.title from public.listings l where l.id = s.listing_id),
        'price_at_save', s.price_at_save, 'created_at', s.created_at) order by s.created_at)
      from public.saves s where s.user_id = p.id), '[]'),
    'watching', coalesce((select jsonb_agg(jsonb_build_object('listing_id', w.listing_id, 'created_at', w.created_at) order by w.created_at)
      from public.watches w where w.user_id = p.id), '[]'),
    'saved_searches', coalesce((select jsonb_agg(jsonb_build_object(
        'query', ss.query, 'filters', ss.filters, 'alerts', ss.alerts, 'created_at', ss.created_at) order by ss.created_at)
      from public.saved_searches ss where ss.user_id = p.id), '[]'),
    'swipes', jsonb_build_object(
      'passed', (select count(*)::int from public.swipes s where s.user_id = p.id and s.dir = 'left'),
      'saved', (select count(*)::int from public.swipes s where s.user_id = p.id and s.dir = 'save'),
      'liked', (select count(*)::int from public.swipes s where s.user_id = p.id and s.dir = 'right')),

    'blocks', coalesce((select jsonb_agg(jsonb_build_object('blocked', private.export_name(b.blocked_id), 'created_at', b.created_at) order by b.created_at)
      from public.blocks b where b.blocker_id = p.id), '[]'),
    -- A report on a person names them as the app does, never by id.
    'reports_made', coalesce((select jsonb_agg(jsonb_build_object(
        'target_type', r.target_type,
        'target_id', case when r.target_type = 'user' then null else r.target_id end,
        'target_name', case when r.target_type = 'user' then private.export_name(r.target_user_id) end,
        'reason', r.reason, 'details', r.details,
        'status', r.status, 'created_at', r.created_at, 'resolved_at', r.resolved_at) order by r.created_at)
      from public.reports r where r.reporter_id = p.id), '[]'),
    'strikes', coalesce((select jsonb_agg(jsonb_build_object(
        'reason', s.reason, 'created_at', s.created_at, 'expires_at', s.expires_at, 'cleared_at', s.cleared_at) order by s.created_at)
      from public.strikes s where s.user_id = p.id), '[]'),
    'appeals', coalesce((select jsonb_agg(jsonb_build_object(
        'subject_type', a.subject_type, 'reason', a.reason_choice, 'body', a.body, 'status', a.status,
        'decision_note', a.decision_note, 'created_at', a.created_at, 'decided_at', a.decided_at) order by a.created_at)
      from public.appeals a where a.user_id = p.id), '[]'),
    'noshow_reports_made', coalesce((select jsonb_agg(jsonb_build_object(
        'meetup_id', n.meetup_id, 'note', n.note, 'status', n.status, 'created_at', n.created_at) order by n.created_at)
      from public.noshow_reports n where n.reporter_id = p.id), '[]'),
    'noshow_reports_about_me', coalesce((select jsonb_agg(jsonb_build_object(
        'meetup_id', n.meetup_id, 'status', n.status, 'created_at', n.created_at) order by n.created_at)
      from public.noshow_reports n where n.reported_id = p.id), '[]'),

    -- The Quad: the caller's own posts, replies, votes, mutes and hides. Never
    -- anyone else's author id (T-INT-QUAD-ANON).
    'quad', jsonb_build_object(
      'posts', coalesce((select jsonb_agg(jsonb_build_object(
          'id', q.id, 'kind', q.kind, 'body', q.body, 'photo_path', q.photo_path, 'place', q.place,
          'score', q.score, 'reply_count', q.reply_count, 'status', q.status, 'created_at', q.created_at,
          'poll_options', (select jsonb_agg(jsonb_build_object('label', o.label, 'votes', o.votes) order by o.idx)
                           from public.quad_poll_options o where o.post_id = q.id)) order by q.created_at)
        from public.quad_posts q where q.author_id = p.id), '[]'),
      'replies', coalesce((select jsonb_agg(jsonb_build_object(
          'post_id', r.post_id, 'body', r.body, 'score', r.score, 'status', r.status, 'created_at', r.created_at) order by r.created_at)
        from public.quad_replies r where r.author_id = p.id), '[]'),
      'votes', coalesce((select jsonb_agg(jsonb_build_object('target_type', v.target_type, 'target_id', v.target_id, 'value', v.value, 'created_at', v.created_at) order by v.created_at)
        from public.quad_votes v where v.user_id = p.id), '[]'),
      'poll_votes', coalesce((select jsonb_agg(jsonb_build_object('post_id', v.post_id,
          'option', (select o.label from public.quad_poll_options o where o.id = v.option_id), 'created_at', v.created_at) order by v.created_at)
        from public.quad_poll_votes v where v.user_id = p.id), '[]'),
      'muted_keywords', coalesce((select jsonb_agg(m.keyword order by m.keyword) from public.quad_mutes m where m.user_id = p.id), '[]'),
      'hidden_authors', coalesce((select jsonb_agg(jsonb_build_object('excerpt', h.excerpt, 'created_at', h.created_at) order by h.created_at)
        from public.quad_hides h where h.user_id = p.id), '[]')),

    'notifications', coalesce((select jsonb_agg(jsonb_build_object(
        'type', n.type, 'title', n.title, 'body', n.body, 'created_at', n.created_at, 'read_at', n.read_at) order by n.id)
      from public.notifications n where n.user_id = p.id), '[]'),
    -- Activity in the app (DEC 93): what the privacy policy lists, kept 30 days.
    'activity', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', e.kind, 'listing_id', e.listing_id, 'source', e.source, 'time_on_page_ms', e.dwell_ms,
        'search', e.query, 'platform', e.platform, 'app_version', e.app_version, 'at', e.created_at) order by e.id)
      from public.activity_events e where e.user_id = p.id), '[]'),
    'admin', (select jsonb_build_object('role', a.role, 'since', a.created_at) from public.admins a where a.user_id = p.id)
  );
  return out;
end;
$$;

create or replace function private.prepare_account_deletion(p_uid uuid, p_underage boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  addr text;
  prefixes text[];
  evidence jsonb;
  archives text[];
begin
  select * into p from public.profiles x where x.id = p_uid;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.hit_key(p_uid, 'delete_account', 3, interval '1 day');

  -- Underage mode skips the confirmation and the goodbye email, so it is only
  -- for accounts the age check has just blocked.
  if p_underage and not exists (select 1 from public.age_blocks a where a.email_hash = p.email_hash) then
    perform private.raise('FORBIDDEN');
  end if;

  select u.email into addr from auth.users u where u.id = p_uid;

  -- Deal data stays for the other person (BE-01): close the chats read-only
  -- with a system message; snapshots and FKs (set null) do the rest.
  insert into public.messages (chat_id, sender_id, kind, body, created_at)
  select c.id, null, 'system', 'This account was deleted.', private.now()
  from public.chats c
  where p_uid in (c.buyer_id, c.seller_id) and c.status <> 'closed';
  update public.chats c
     set status = 'closed', closed_at = coalesce(c.closed_at, private.now())
   where p_uid in (c.buyer_id, c.seller_id) and c.status <> 'closed';

  -- A banned person can't come back with the same address.
  if p.status = 'banned' then
    insert into public.banned_hashes (email_hash, created_at) values (p.email_hash, private.now())
    on conflict do nothing;
  end if;

  -- Media the person owns (R2 prefixes), computed before the rows go away.
  prefixes := array['c/' || p.campus_id || '/u/' || p_uid || '/']
    || coalesce((select array_agg(x order by x collate "C") from (
         select 'c/' || l.campus_id || '/l/' || l.id || '/' as x
         from public.listings l where l.seller_id = p_uid
         union
         select 'share/' || l.id || '.jpg'
         from public.listings l where l.seller_id = p_uid
         union
         select 'c/' || p.campus_id || '/l/' || r.id || '/'
         from public.listing_reservations r where r.user_id = p_uid) s), '{}');

  -- Photos that open reports about this person point at (BE-02). They are
  -- moved to the private bucket before the prefixes above are deleted.
  select coalesce(jsonb_agg(jsonb_build_object('report_id', r.id, 'key', k.key) order by r.id, k.key), '[]'::jsonb)
    into evidence
  from public.reports r
  cross join lateral jsonb_array_elements_text(coalesce(r.evidence -> 'photo_keys', '[]'::jsonb)) as k(key)
  where r.status = 'open'
    and (r.target_user_id = p_uid or private.quad_report_author(r.target_type, r.target_id) = p_uid)
    and coalesce(r.evidence ->> 'photo_bucket', 'media') = 'media';

  -- Closed chats archived to the private bucket (DATA_MODEL §5): deleted with
  -- the account. Reports keep their own snapshot of the messages.
  archives := coalesce((select array_agg('archive/chats/' || c.id || '.json' order by c.id)
                        from public.chats c
                        where p_uid in (c.buyer_id, c.seller_id) and c.archived_at is not null), '{}');

  -- Rows keyed by the user id without a foreign key.
  delete from public.activity_days where user_id = p_uid;
  delete from public.listing_reservations where user_id = p_uid;
  delete from public.rate_counters where user_id = p_uid;

  if not p_underage and addr is not null then
    perform private.queue_email(addr, 'account_deleted', '{}'::jsonb, 'account_deleted:' || p_uid::text);
  end if;

  -- Admin v2 (DEC 93): a record that the deletion started (no name, no email).
  update public.account_deletions d set started_at = private.now(), underage = p_underage
   where d.user_id = p_uid and d.status = 'started';
  if not found then
    insert into public.account_deletions (user_id, campus_id, underage, status, started_at)
    values (p_uid, p.campus_id, p_underage, 'started', private.now());
  end if;

  return jsonb_build_object(
    'email', case when p_underage then null else addr end,
    'r2_prefixes', to_jsonb(prefixes),
    'archives', to_jsonb(archives),
    'evidence', evidence);
end;
$$;
