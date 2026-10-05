-- 0205_r11_extras.sql · S50/S51 server parts (R11-HINT-01, P11-ACC-02, R11-ADM-01,
-- R11-ADM-02, R11-NOTIF-01 rest; API §2, §4, §5, §7; DATA_MODEL §2.7; PRD §5.1)
--   * price_hint: the R1.0 one-argument form is unchanged ({p25,p50,p75}). New
--     overload price_hint(category_id, condition) returns {median_cents,
--     p25_cents, p75_cents, n, scope} (plus p25/p50/p75): that condition's
--     numbers when >= 5 sold on the campus in 180 days (scope 'condition'),
--     else the category's from price_hints (scope 'category'), else null.
--   * Data export (P11-ACC-02): the export-data Edge Function calls, with the
--     service role, private.start_data_export (1 per day, failed runs don't
--     count) → private.export_user_data (the JSON) → private.finish_data_export
--     (row ready, data_export email with the 7-day link) or private.fail_data_export.
--     The export holds the caller's own rows. Other people appear only as what
--     the caller already sees: a display name in their chats, ratings and
--     blocks, and chat messages. Never another user's id, and never a Quad
--     author (quad_hides keeps only the excerpt).
--   * admin_metrics_* views (PRD §5.1, T-DATA-02) and the R1.1 metrics RPCs
--     (moderator, campus-scoped, read-only, not audited).
--   * Admin team (owner): admin_invite_admin, admin_remove_admin, admin_list_admins.
--   * Announcements (owner): admin_create_announcement (1 per 7 days per
--     campus), admin_list_announcements (moderator). announcement_safety goes to
--     every active member; announcement_news (news and update) only to members
--     with the tips pref on, and push_pref maps it to tips so turning tips off
--     later still drops it.
--   * Banned words: admin_upsert_banned_word / admin_delete_banned_word (owner),
--     admin_list_banned_words (moderator).
--   * rating_revealed (meetups pref): when the second side of a chat rates, both
--     people hear their rating is in; the hourly rating_reveal job covers the
--     7-day reveal of one-sided ratings. Matches ratings_visible (0009).
-- Every admin write: require_admin with its role, a 3+ character reason and
-- exactly one audit_log row (T-INT-ADMIN-02).

-- ---------------------------------------------------------------------------
-- Notification prefs: R1.1 types (unchanged otherwise from 0203).
create or replace function private.push_pref(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'offer_%' or p_type = 'wanted_match' then 'offers'
    when p_type = 'message_new' then 'messages'
    when p_type like 'meetup_%' or p_type in ('deal_check', 'rate_prompt', 'rating_revealed') then 'meetups'
    when p_type in ('saved_search_match', 'watch_available') then 'saved_search'
    when p_type = 'price_drop' then 'price_drop'
    when p_type in ('listing_stale', 'announcement_news') then 'tips'
    when p_type in ('quad_reply', 'quad_milestone') then 'quad_replies'
    when p_type = 'free_food' then 'free_food'
    else null   -- campus_unlocked, announcement_safety, safety and account notices: always
  end
$$;

-- ---------------------------------------------------------------------------
-- Price hint (R11-HINT-01)
create or replace function private.price_hint_json(p25 int, p50 int, p75 int, n int, scope text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(n, 0) >= 5 then jsonb_build_object(
    'p25', p25, 'p50', p50, 'p75', p75, 'n', n,
    'median_cents', p50, 'p25_cents', p25, 'p75_cents', p75, 'scope', scope) end
$$;

create or replace function public.price_hint(category_id smallint, condition text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  cond public.item_condition;
  r record;
begin
  if price_hint.condition is not null then
    begin
      cond := price_hint.condition::public.item_condition;
    exception when invalid_text_representation then
      perform private.raise('INVALID', 'condition');
    end;
  end if;
  -- Same comparables as the price_hints view (sold sale listings, last 180
  -- days, price > 0), narrowed to the condition.
  select percentile_disc(0.25) within group (order by l.price_cents) as p25,
         percentile_disc(0.50) within group (order by l.price_cents) as p50,
         percentile_disc(0.75) within group (order by l.price_cents) as p75,
         count(*)::int as n
    into r
  from public.listings l
  where l.campus_id = me.campus_id and l.category_id = price_hint.category_id and l.condition = cond
    and l.status = 'sold' and l.kind = 'sale' and l.price_cents > 0
    and l.sold_at > private.now() - interval '180 days';
  if cond is not null and r.n >= 5 then
    return private.price_hint_json(r.p25, r.p50, r.p75, r.n, 'condition');
  end if;
  -- Fall back to the whole category (the daily price_hints view).
  return (select private.price_hint_json(h.p25, h.p50, h.p75, h.n, 'category')
          from public.price_hints h
          where h.campus_id = me.campus_id and h.category_id = price_hint.category_id and h.n >= 5);
end;
$$;

-- ---------------------------------------------------------------------------
-- Data export (P11-ACC-02, API §5 export-data, T-INT-EXPORT-01)
create or replace function private.start_data_export(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_at timestamptz;
  new_id uuid := gen_random_uuid();
  k text;
begin
  if not exists (select 1 from public.profiles p where p.id = p_uid) then
    perform private.raise('NOT_FOUND');
  end if;
  -- One a day. A run that failed doesn't use it up.
  select max(x.created_at) into last_at from public.data_exports x
  where x.user_id = p_uid and coalesce(x.status, '') <> 'failed' and x.created_at > private.now() - interval '24 hours';
  if last_at is not null then
    perform private.raise('RATE_LIMITED',
      'export_data:' || to_char((last_at + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;
  k := 'exports/' || p_uid || '/' || new_id || '.json';
  insert into public.data_exports (id, user_id, status, path, expires_at, created_at)
  values (new_id, p_uid, 'building', k, private.now() + interval '168 hours', private.now());
  return jsonb_build_object('id', new_id, 'key', k, 'expires_at', private.now() + interval '168 hours');
end;
$$;

create or replace function private.finish_data_export(p_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.data_exports;
  addr text;
begin
  update public.data_exports x set status = 'ready' where x.id = p_id and x.status = 'building' returning * into e;
  if e.id is null then
    perform private.raise('NOT_FOUND');
  end if;
  if p_url is null or p_url !~ '^https?://' then
    perform private.raise('INVALID', 'url');
  end if;
  select u.email into addr from auth.users u where u.id = e.user_id;
  if addr is not null then
    perform private.queue_email(addr, 'data_export', jsonb_build_object('url', p_url), 'data_export:' || e.id);
  end if;
end;
$$;

create or replace function private.fail_data_export(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.data_exports x set status = 'failed' where x.id = p_id and x.status = 'building'
$$;

-- A name the person already sees in the app (first name + initial), or "Deleted user".
create or replace function private.export_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.display_name from public.profiles p where p.id = p_uid), 'Deleted user')
$$;

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
      'saved', (select count(*)::int from public.swipes s where s.user_id = p.id and s.dir = 'save')),

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
    'admin', (select jsonb_build_object('role', a.role, 'since', a.created_at) from public.admins a where a.user_id = p.id)
  );
  return out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Metrics views (PRD §5.1, DATA_MODEL §2.7, T-DATA-02). Days and weeks are in
-- the campus time zone; weeks start on Monday. The demo campus is excluded.
-- Service role only; admins read them through the admin_metrics_* RPCs.

-- Funnel, one row per campus and day, each column counted on its own event's day:
--   signups            profiles created
--   swiped_10_24h      of those, people who swiped (pass, save or offer) 10+
--                      cards in their first 24 h
--   activated          of those, people who also made an offer or posted a
--                      listing within 7 days (Activation)
--   offers             offers made; offers_accepted: offer chats opened
--   meetups_confirmed  meetups confirmed
--   completed_swaps    listings sold to a buyer whose outcome is done (north star)
create view public.admin_metrics_funnel as
with camp as (
  select c.id, c.timezone from public.campuses c where not c.is_demo
),
signup as (
  select p.campus_id, (p.created_at at time zone c.timezone)::date as day,
         (select count(*) from (
            select s.listing_id from public.swipes s
            where s.user_id = p.id and s.created_at >= p.created_at and s.created_at < p.created_at + interval '24 hours'
            union
            select o.listing_id from public.offers o
            where o.buyer_id = p.id and o.created_at >= p.created_at and o.created_at < p.created_at + interval '24 hours'
          ) cards) as cards,
         exists (select 1 from public.offers o where o.buyer_id = p.id and o.created_at < p.created_at + interval '7 days')
           or exists (select 1 from public.listings l where l.seller_id = p.id and l.created_at < p.created_at + interval '7 days') as acted
  from public.profiles p join camp c on c.id = p.campus_id
),
events as (
  select s.campus_id, s.day, 1 as signups,
         (s.cards >= 10)::int as swiped_10_24h, (s.cards >= 10 and s.acted)::int as activated,
         0 as offers, 0 as offers_accepted, 0 as meetups_confirmed, 0 as completed_swaps
  from signup s
  union all
  select l.campus_id, (o.created_at at time zone c.timezone)::date, 0, 0, 0, 1, 0, 0, 0
  from public.offers o join public.listings l on l.id = o.listing_id join camp c on c.id = l.campus_id
  union all
  select l.campus_id, (ch.created_at at time zone c.timezone)::date, 0, 0, 0, 0, 1, 0, 0
  from public.chats ch join public.listings l on l.id = ch.listing_id join camp c on c.id = l.campus_id
  where ch.offer_id is not null
  union all
  select l.campus_id, (m.confirmed_at at time zone c.timezone)::date, 0, 0, 0, 0, 0, 1, 0
  from public.meetups m join public.chats ch on ch.id = m.chat_id join public.listings l on l.id = ch.listing_id
  join camp c on c.id = l.campus_id
  where m.confirmed_at is not null
  union all
  select l.campus_id, (l.sold_at at time zone c.timezone)::date, 0, 0, 0, 0, 0, 0, 1
  from public.listings l join camp c on c.id = l.campus_id
  where l.status = 'sold' and l.buyer_id is not null and l.sold_at is not null
    and exists (select 1 from public.chats ch where ch.listing_id = l.id and ch.buyer_id = l.buyer_id and ch.buyer_outcome = 'done')
)
select e.campus_id, e.day,
       sum(e.signups)::int as signups, sum(e.swiped_10_24h)::int as swiped_10_24h, sum(e.activated)::int as activated,
       sum(e.offers)::int as offers, sum(e.offers_accepted)::int as offers_accepted,
       sum(e.meetups_confirmed)::int as meetups_confirmed, sum(e.completed_swaps)::int as completed_swaps
from events e
group by e.campus_id, e.day;

-- Retention by signup week: active (an activity_days row) exactly 1, 7 and 30
-- days after the signup day. *_eligible counts members old enough to have
-- reached that day, the denominator for the rate.
create view public.admin_metrics_retention as
with base as (
  select p.id, p.campus_id, (p.created_at at time zone c.timezone)::date as sd,
         (private.now() at time zone c.timezone)::date as today
  from public.profiles p join public.campuses c on c.id = p.campus_id
  where not c.is_demo
)
select b.campus_id, date_trunc('week', b.sd)::date as signup_week,
       count(*)::int as cohort,
       count(*) filter (where b.sd + 1 <= b.today)::int as d1_eligible,
       count(*) filter (where b.sd + 1 <= b.today and exists (select 1 from public.activity_days a where a.user_id = b.id and a.day = b.sd + 1))::int as d1,
       count(*) filter (where b.sd + 7 <= b.today)::int as d7_eligible,
       count(*) filter (where b.sd + 7 <= b.today and exists (select 1 from public.activity_days a where a.user_id = b.id and a.day = b.sd + 7))::int as d7,
       count(*) filter (where b.sd + 30 <= b.today)::int as d30_eligible,
       count(*) filter (where b.sd + 30 <= b.today and exists (select 1 from public.activity_days a where a.user_id = b.id and a.day = b.sd + 30))::int as d30
from base b
group by b.campus_id, date_trunc('week', b.sd)::date;

-- Liquidity by week:
--   listings_created / sold_14d  sale and free listings created that week and
--                                how many sold within 14 days (sell-through;
--                                sell_through_final once the week is 14+ days old)
--   median_hours_to_first_offer  over listings created that week that got an offer
--   active_buyers                distinct people who swiped or offered that week
--   feed_exhausted               feed loads that ended with < 5 new cards (daily_counters)
create view public.admin_metrics_liquidity as
with camp as (
  select c.id, c.timezone from public.campuses c where not c.is_demo
),
lst as (
  select l.campus_id, date_trunc('week', (l.created_at at time zone c.timezone)::date)::date as week, l.id, l.created_at,
         l.kind, (l.status = 'sold' and l.sold_at < l.created_at + interval '14 days') as sold_14d,
         (select min(o.created_at) from public.offers o where o.listing_id = l.id) as first_offer_at
  from public.listings l join camp c on c.id = l.campus_id
),
buyers as (
  select x.campus_id, date_trunc('week', x.day)::date as week, count(distinct x.user_id)::int as active_buyers
  from (
    select l.campus_id, s.user_id, (s.created_at at time zone c.timezone)::date as day
    from public.swipes s join public.listings l on l.id = s.listing_id join camp c on c.id = l.campus_id
    where s.created_at <> 'infinity'
    union all
    select l.campus_id, o.buyer_id, (o.created_at at time zone c.timezone)::date
    from public.offers o join public.listings l on l.id = o.listing_id join camp c on c.id = l.campus_id
    where o.buyer_id is not null
  ) x
  group by 1, 2
),
feed as (
  select d.campus_id, date_trunc('week', d.day)::date as week, sum(d.value)::int as feed_exhausted
  from public.daily_counters d join camp c on c.id = d.campus_id
  where d.key = 'feed_exhausted'
  group by 1, 2
),
weeks as (
  select campus_id, week from lst union select campus_id, week from buyers union select campus_id, week from feed
)
select w.campus_id, w.week,
       (select count(*) from lst where lst.campus_id = w.campus_id and lst.week = w.week and lst.kind in ('sale', 'free'))::int as listings_created,
       (select count(*) from lst where lst.campus_id = w.campus_id and lst.week = w.week and lst.kind in ('sale', 'free') and lst.sold_14d)::int as sold_14d,
       (w.week + 21 <= (select (private.now() at time zone c.timezone)::date from camp c where c.id = w.campus_id)) as sell_through_final,
       (select round((percentile_cont(0.5) within group (order by extract(epoch from lst.first_offer_at - lst.created_at) / 3600))::numeric, 1)
          from lst where lst.campus_id = w.campus_id and lst.week = w.week and lst.first_offer_at is not null) as median_hours_to_first_offer,
       coalesce((select b.active_buyers from buyers b where b.campus_id = w.campus_id and b.week = w.week), 0) as active_buyers,
       coalesce((select f.feed_exhausted from feed f where f.campus_id = w.campus_id and f.week = w.week), 0) as feed_exhausted
from weeks w;

-- Safety and deal reliability by week:
--   reports, completed_swaps, reports_per_100_swaps
--   p90_hours_to_resolve      over reports created that week and resolved
--   meetups_confirmed / meetups_completed / meetups_no_show  (meetups confirmed that week)
create view public.admin_metrics_safety as
with camp as (
  select c.id, c.timezone from public.campuses c where not c.is_demo
),
rep as (
  select r.campus_id, date_trunc('week', (r.created_at at time zone c.timezone)::date)::date as week,
         case when r.resolved_at is not null then extract(epoch from r.resolved_at - r.created_at) / 3600 end as hours
  from public.reports r join camp c on c.id = r.campus_id
),
swp as (
  select f.campus_id, date_trunc('week', f.day)::date as week, sum(f.completed_swaps)::int as completed_swaps
  from public.admin_metrics_funnel f group by 1, 2 having sum(f.completed_swaps) > 0
),
mt as (
  select l.campus_id, date_trunc('week', (m.confirmed_at at time zone c.timezone)::date)::date as week, m.status
  from public.meetups m join public.chats ch on ch.id = m.chat_id join public.listings l on l.id = ch.listing_id
  join camp c on c.id = l.campus_id
  where m.confirmed_at is not null
),
weeks as (
  select campus_id, week from rep union select campus_id, week from swp union select campus_id, week from mt
)
select w.campus_id, w.week,
       (select count(*) from rep where rep.campus_id = w.campus_id and rep.week = w.week)::int as reports,
       coalesce((select s.completed_swaps from swp s where s.campus_id = w.campus_id and s.week = w.week), 0) as completed_swaps,
       (select round((percentile_cont(0.9) within group (order by rep.hours))::numeric, 1)
          from rep where rep.campus_id = w.campus_id and rep.week = w.week and rep.hours is not null) as p90_hours_to_resolve,
       (select count(*) from mt where mt.campus_id = w.campus_id and mt.week = w.week)::int as meetups_confirmed,
       (select count(*) from mt where mt.campus_id = w.campus_id and mt.week = w.week and mt.status = 'completed')::int as meetups_completed,
       (select count(*) from mt where mt.campus_id = w.campus_id and mt.week = w.week and mt.status = 'no_show')::int as meetups_no_show
from weeks w;

revoke all on public.admin_metrics_funnel, public.admin_metrics_retention, public.admin_metrics_liquidity,
  public.admin_metrics_safety from public, anon, authenticated;
grant select on public.admin_metrics_funnel, public.admin_metrics_retention, public.admin_metrics_liquidity,
  public.admin_metrics_safety to service_role;

create or replace function private.pct(num numeric, den numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(den, 0) = 0 then null else round(100.0 * coalesce(num, 0) / den, 1) end
$$;

-- ---------------------------------------------------------------------------
-- Metrics RPCs (R11-ADM-01). A campus-bound moderator always gets their campus;
-- an owner with campus_id null gets every campus added up.
create or replace function public.admin_metrics_funnel(campus_id uuid default null, from_day date default null, to_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_metrics_funnel.campus_id);
  c uuid := private.admin_campus(a, admin_metrics_funnel.campus_id);
  t date := coalesce(admin_metrics_funnel.to_day, (private.now() at time zone 'America/New_York')::date);
  f date := coalesce(admin_metrics_funnel.from_day, t - 27);
  tot record;
begin
  if f > t or t - f > 366 then
    perform private.raise('INVALID', 'range');
  end if;
  select coalesce(sum(m.signups), 0)::int as signups, coalesce(sum(m.swiped_10_24h), 0)::int as swiped_10_24h,
         coalesce(sum(m.activated), 0)::int as activated, coalesce(sum(m.offers), 0)::int as offers,
         coalesce(sum(m.offers_accepted), 0)::int as offers_accepted, coalesce(sum(m.meetups_confirmed), 0)::int as meetups_confirmed,
         coalesce(sum(m.completed_swaps), 0)::int as completed_swaps
    into tot
  from public.admin_metrics_funnel m
  where (c is null or m.campus_id = c) and m.day between f and t;
  return jsonb_build_object(
    'campus_id', c, 'from', f, 'to', t,
    'signups', tot.signups, 'swiped_10_24h', tot.swiped_10_24h, 'activated', tot.activated,
    'activation_rate', private.pct(tot.activated, tot.signups),
    'offers', tot.offers, 'offers_accepted', tot.offers_accepted, 'meetups_confirmed', tot.meetups_confirmed,
    'completed_swaps', tot.completed_swaps,
    'days', coalesce((select jsonb_agg(jsonb_build_object(
        'day', d.day, 'signups', d.signups, 'activated', d.activated, 'offers', d.offers,
        'offers_accepted', d.offers_accepted, 'meetups_confirmed', d.meetups_confirmed, 'completed_swaps', d.completed_swaps) order by d.day)
      from (select m.day, sum(m.signups)::int as signups, sum(m.activated)::int as activated, sum(m.offers)::int as offers,
                   sum(m.offers_accepted)::int as offers_accepted, sum(m.meetups_confirmed)::int as meetups_confirmed,
                   sum(m.completed_swaps)::int as completed_swaps
            from public.admin_metrics_funnel m
            where (c is null or m.campus_id = c) and m.day between f and t
            group by m.day) d), '[]'));
end;
$$;

create or replace function public.admin_metrics_retention(campus_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_metrics_retention.campus_id);
  c uuid := private.admin_campus(a, admin_metrics_retention.campus_id);
begin
  return jsonb_build_object('campus_id', c, 'weeks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'signup_week', w.signup_week, 'cohort', w.cohort,
      'd1', w.d1, 'd1_eligible', w.d1_eligible, 'd1_rate', private.pct(w.d1, w.d1_eligible),
      'd7', w.d7, 'd7_eligible', w.d7_eligible, 'd7_rate', private.pct(w.d7, w.d7_eligible),
      'd30', w.d30, 'd30_eligible', w.d30_eligible, 'd30_rate', private.pct(w.d30, w.d30_eligible)) order by w.signup_week desc)
    from (select r.signup_week, sum(r.cohort)::int as cohort, sum(r.d1)::int as d1, sum(r.d1_eligible)::int as d1_eligible,
                 sum(r.d7)::int as d7, sum(r.d7_eligible)::int as d7_eligible, sum(r.d30)::int as d30, sum(r.d30_eligible)::int as d30_eligible
          from public.admin_metrics_retention r
          where (c is null or r.campus_id = c)
          group by r.signup_week
          order by r.signup_week desc
          limit 12) w), '[]'));
end;
$$;

create or replace function public.admin_metrics_liquidity(campus_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_metrics_liquidity.campus_id);
  c uuid := private.admin_campus(a, admin_metrics_liquidity.campus_id);
  active_listings int;
  buyers_7d int;
begin
  -- Supply now: active sale and free listings ÷ people who swiped or offered in the last 7 days.
  select count(*)::int into active_listings
  from public.listings l join public.campuses cc on cc.id = l.campus_id
  where not cc.is_demo and l.status = 'active' and l.kind in ('sale', 'free') and (c is null or l.campus_id = c);
  select count(distinct x.user_id)::int into buyers_7d
  from (
    select s.user_id, l.campus_id from public.swipes s join public.listings l on l.id = s.listing_id
    where s.created_at > private.now() - interval '7 days' and s.created_at <> 'infinity'
    union all
    select o.buyer_id, l.campus_id from public.offers o join public.listings l on l.id = o.listing_id
    where o.created_at > private.now() - interval '7 days' and o.buyer_id is not null
  ) x join public.campuses cc on cc.id = x.campus_id
  where not cc.is_demo and (c is null or x.campus_id = c);
  return jsonb_build_object(
    'campus_id', c,
    'active_listings', active_listings, 'weekly_active_buyers', buyers_7d,
    'supply_ratio', case when buyers_7d = 0 then null else round(active_listings::numeric / buyers_7d, 2) end,
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week', w.week, 'listings_created', w.listings_created, 'sold_14d', w.sold_14d,
        'sell_through_14d', private.pct(w.sold_14d, w.listings_created), 'sell_through_final', w.sell_through_final,
        'median_hours_to_first_offer', w.median_hours_to_first_offer,
        'active_buyers', w.active_buyers, 'feed_exhausted', w.feed_exhausted) order by w.week desc)
      from (select l.week, sum(l.listings_created)::int as listings_created, sum(l.sold_14d)::int as sold_14d,
                   bool_and(l.sell_through_final) as sell_through_final,
                   -- Across campuses the median isn't additive; one campus gives its own.
                   case when count(*) = 1 then max(l.median_hours_to_first_offer) end as median_hours_to_first_offer,
                   sum(l.active_buyers)::int as active_buyers, sum(l.feed_exhausted)::int as feed_exhausted
            from public.admin_metrics_liquidity l
            where (c is null or l.campus_id = c)
            group by l.week
            order by l.week desc
            limit 8) w), '[]'));
end;
$$;

create or replace function public.admin_metrics_safety(campus_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_metrics_safety.campus_id);
  c uuid := private.admin_campus(a, admin_metrics_safety.campus_id);
begin
  return jsonb_build_object('campus_id', c, 'weeks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'week', w.week, 'reports', w.reports, 'completed_swaps', w.completed_swaps,
      'reports_per_100_swaps', private.pct(w.reports, w.completed_swaps),
      'p90_hours_to_resolve', w.p90_hours_to_resolve,
      'meetups_confirmed', w.meetups_confirmed, 'meetups_completed', w.meetups_completed,
      'completion_rate', private.pct(w.meetups_completed, w.meetups_confirmed),
      'meetups_no_show', w.meetups_no_show, 'no_show_rate', private.pct(w.meetups_no_show, w.meetups_confirmed)) order by w.week desc)
    from (select s.week, sum(s.reports)::int as reports, sum(s.completed_swaps)::int as completed_swaps,
                 case when count(*) = 1 then max(s.p90_hours_to_resolve) end as p90_hours_to_resolve,
                 sum(s.meetups_confirmed)::int as meetups_confirmed, sum(s.meetups_completed)::int as meetups_completed,
                 sum(s.meetups_no_show)::int as meetups_no_show
          from public.admin_metrics_safety s
          where (c is null or s.campus_id = c)
          group by s.week
          order by s.week desc
          limit 8) w), '[]'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin team (R11-ADM-02). Owner only. The person must already have an
-- account; inviting someone who is already an admin changes their role or
-- campus. Moderators are bound to one campus (DEC 69); owners to none.
create or replace function public.admin_invite_admin(email text, role text, campus_id uuid default null, reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_invite_admin.reason);
  r public.admin_role;
  target public.profiles;
  prev public.admins;
  scope uuid;
begin
  if admin_invite_admin.role not in ('owner', 'moderator') then
    perform private.raise('INVALID', 'role');
  end if;
  r := admin_invite_admin.role::public.admin_role;
  select p.* into target from auth.users u join public.profiles p on p.id = u.id
  where lower(u.email) = lower(btrim(coalesce(admin_invite_admin.email, '')))
  limit 1;
  if target.id is null then
    perform private.raise('INVALID', 'email');
  end if;
  if target.id = a.user_id then
    perform private.raise('INVALID', 'self');
  end if;
  if target.status in ('banned', 'suspended') then
    perform private.raise('INVALID', 'status');
  end if;
  if r = 'moderator' then
    scope := coalesce(admin_invite_admin.campus_id, target.campus_id);
    if not exists (select 1 from public.campuses c where c.id = scope) then
      perform private.raise('INVALID', 'campus_id');
    end if;
  end if;
  select * into prev from public.admins x where x.user_id = target.id;
  if prev.role = 'owner' and r <> 'owner'
     and (select count(*) from public.admins x where x.role = 'owner') <= 1 then
    perform private.raise('INVALID', 'last_owner');
  end if;
  insert into public.admins (user_id, role, campus_id, invited_by, created_at)
  values (target.id, r, scope, a.user_id, private.now())
  on conflict (user_id) do update set role = excluded.role, campus_id = excluded.campus_id;
  perform private.audit(a.user_id, 'admin.invite', 'user', target.id::text, scope, why,
    jsonb_build_object('role', r, 'previous_role', prev.role));
  return jsonb_build_object('user_id', target.id, 'display_name', target.display_name, 'role', r, 'campus_id', scope,
    'updated', prev.user_id is not null);
end;
$$;

create or replace function public.admin_remove_admin(user_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_remove_admin.reason);
  x public.admins;
begin
  if admin_remove_admin.user_id = a.user_id then
    perform private.raise('INVALID', 'self');
  end if;
  select * into x from public.admins ad where ad.user_id = admin_remove_admin.user_id for update;
  if x.user_id is null then
    perform private.raise('NOT_FOUND');
  end if;
  if x.role = 'owner' and (select count(*) from public.admins ad where ad.role = 'owner') <= 1 then
    perform private.raise('INVALID', 'last_owner');
  end if;
  delete from public.admins ad where ad.user_id = x.user_id;
  perform private.audit(a.user_id, 'admin.remove', 'user', x.user_id::text, x.campus_id, why,
    jsonb_build_object('role', x.role));
end;
$$;

create or replace function public.admin_list_admins()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.admins := private.require_admin('owner');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', x.user_id, 'role', x.role, 'campus_id', x.campus_id,
      'display_name', p.display_name, 'email', u.email, 'created_at', x.created_at,
      'invited_by', (select ip.display_name from public.profiles ip where ip.id = x.invited_by),
      'me', x.user_id = a.user_id) order by x.role, x.created_at)
    from public.admins x
    left join public.profiles p on p.id = x.user_id
    left join auth.users u on u.id = x.user_id), '[]');
end;
$$;

-- ---------------------------------------------------------------------------
-- Announcements (R11-ADM-02, T-INT-ANN-01). Owner only, one per campus per
-- 7 days. Pinned at the top of the Quad feed until pinned_until.
create or replace function public.admin_create_announcement(
  campus_id uuid, type text, title text, body text, send_push boolean default false,
  pinned_hours int default 24, reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner', admin_create_announcement.campus_id);
  why text := private.need_reason(admin_create_announcement.reason);
  t text := btrim(coalesce(admin_create_announcement.title, ''));
  b text := btrim(coalesce(admin_create_announcement.body, ''));
  hrs int := coalesce(admin_create_announcement.pinned_hours, 24);
  last_at timestamptz;
  ann public.announcements;
  ntype text;
  sent int := 0;
begin
  if admin_create_announcement.campus_id is null
     or not exists (select 1 from public.campuses c where c.id = admin_create_announcement.campus_id) then
    perform private.raise('INVALID', 'campus_id');
  end if;
  if admin_create_announcement.type is null or admin_create_announcement.type not in ('safety', 'news', 'update') then
    perform private.raise('INVALID', 'type');
  end if;
  if char_length(t) not between 1 and 60 then
    perform private.raise('INVALID', 'title');
  end if;
  if char_length(b) not between 1 and 200 then
    perform private.raise('INVALID', 'body');
  end if;
  if hrs not between 0 and 168 then
    perform private.raise('INVALID', 'pinned_hours');
  end if;
  -- One per campus per 7 days (serialized per campus so two owners can't race).
  perform pg_advisory_xact_lock(hashtext('announcement:' || admin_create_announcement.campus_id::text));
  select max(x.created_at) into last_at from public.announcements x
  where x.campus_id = admin_create_announcement.campus_id and x.created_at > private.now() - interval '168 hours';
  if last_at is not null then
    perform private.raise('RATE_LIMITED',
      'announcement:' || to_char((last_at + interval '168 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  end if;

  insert into public.announcements (campus_id, type, title, body, send_push, created_by, created_at, sent_at, pinned_until)
  values (admin_create_announcement.campus_id, admin_create_announcement.type, t, b, coalesce(admin_create_announcement.send_push, false),
          a.user_id, private.now(),
          case when coalesce(admin_create_announcement.send_push, false) then private.now() end,
          case when hrs > 0 then private.now() + make_interval(hours => hrs) end)
  returning * into ann;

  if ann.send_push then
    -- Safety goes to every active member; news and updates only to people who
    -- turned on tips (promotional push is opt-in, Apple 4.5.4).
    ntype := case when ann.type = 'safety' then 'announcement_safety' else 'announcement_news' end;
    insert into public.notifications (user_id, type, grp, title, body, data, time_sensitive, dedupe_key, push_after, created_at)
    select p.id, ntype, case when ann.type = 'safety' then 'safety' else 'campus' end, ann.title, ann.body,
           jsonb_build_object('announcement_id', ann.id, 'kind', ann.type), false, 'ann:' || ann.id, private.now(), private.now()
    from public.profiles p
    left join public.notification_prefs np on np.user_id = p.id
    where p.campus_id = ann.campus_id and p.status = 'active'
      and (ann.type = 'safety' or coalesce(np.tips, false))
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics sent = row_count;
  end if;

  perform private.audit(a.user_id, 'announcement.create', 'announcement', ann.id::text, ann.campus_id, why,
    jsonb_build_object('type', ann.type, 'title', ann.title, 'send_push', ann.send_push, 'recipients', sent));
  return jsonb_build_object('id', ann.id, 'campus_id', ann.campus_id, 'type', ann.type, 'title', ann.title, 'body', ann.body,
    'send_push', ann.send_push, 'recipients', sent, 'created_at', ann.created_at, 'pinned_until', ann.pinned_until,
    'next_allowed_at', ann.created_at + interval '168 hours');
end;
$$;

create or replace function public.admin_list_announcements(campus_id uuid default null, cursor int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator', admin_list_announcements.campus_id);
  c uuid := private.admin_campus(a, admin_list_announcements.campus_id);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'campus_id', x.campus_id, 'type', x.type, 'title', x.title, 'body', x.body,
      'send_push', x.send_push, 'created_at', x.created_at, 'sent_at', x.sent_at, 'pinned_until', x.pinned_until,
      'pinned', x.pinned_until is not null and x.pinned_until > private.now(),
      'created_by', (select p.display_name from public.profiles p where p.id = x.created_by),
      'recipients', (select count(*)::int from public.notifications n where n.dedupe_key = 'ann:' || x.id),
      'next_allowed_at', x.created_at + interval '168 hours') order by x.created_at desc)
    from (select * from public.announcements y
          where (c is null or y.campus_id = c)
          order by y.created_at desc
          offset greatest(coalesce(admin_list_announcements.cursor, 0), 0) limit 50) x), '[]');
end;
$$;

-- ---------------------------------------------------------------------------
-- Banned words (R11-ADM-02). Scopes match private.check_text callers.
create or replace function public.admin_upsert_banned_word(pattern text, match text, scopes text[], action text, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_upsert_banned_word.reason);
  m text := coalesce(admin_upsert_banned_word.match, 'word');
  pat text := btrim(coalesce(admin_upsert_banned_word.pattern, ''));
  sc text[];
  w public.banned_words;
  existed bool;
begin
  if m not in ('word', 'phrase', 'regex') then
    perform private.raise('INVALID', 'match');
  end if;
  if admin_upsert_banned_word.action is null or admin_upsert_banned_word.action not in ('block', 'review') then
    perform private.raise('INVALID', 'action');
  end if;
  if m <> 'regex' then
    pat := lower(pat);
  end if;
  if char_length(pat) not between 2 and 100 then
    perform private.raise('INVALID', 'pattern');
  end if;
  if m = 'regex' then
    begin
      perform '' ~ pat;
    exception when invalid_regular_expression then
      perform private.raise('INVALID', 'pattern');
    end;
  end if;
  select array_agg(distinct s order by s) into sc from unnest(admin_upsert_banned_word.scopes) s;
  if sc is null or cardinality(sc) = 0
     or exists (select 1 from unnest(sc) s where s is null or s not in ('listing', 'quad', 'profile', 'offer', 'rating', 'chat', 'chat_on_report')) then
    perform private.raise('INVALID', 'scopes');
  end if;

  select * into w from public.banned_words x where x.match = m and x.pattern = pat order by x.created_at limit 1;
  existed := w.id is not null;
  if existed then
    update public.banned_words x set scopes = sc, action = admin_upsert_banned_word.action where x.id = w.id returning * into w;
  else
    insert into public.banned_words (pattern, match, scopes, action, created_by, created_at)
    values (pat, m, sc, admin_upsert_banned_word.action, a.user_id, private.now())
    returning * into w;
  end if;
  perform private.audit(a.user_id, case when existed then 'banned_word.update' else 'banned_word.create' end,
    'banned_word', w.id::text, null, why,
    jsonb_build_object('pattern', w.pattern, 'match', w.match, 'scopes', to_jsonb(w.scopes), 'action', w.action));
  return jsonb_build_object('id', w.id, 'pattern', w.pattern, 'match', w.match, 'scopes', to_jsonb(w.scopes),
    'action', w.action, 'fired_count', w.fired_count, 'created', not existed);
end;
$$;

create or replace function public.admin_delete_banned_word(id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('owner');
  why text := private.need_reason(admin_delete_banned_word.reason);
  w public.banned_words;
begin
  delete from public.banned_words x where x.id = admin_delete_banned_word.id returning * into w;
  if w.id is null then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.audit(a.user_id, 'banned_word.delete', 'banned_word', w.id::text, null, why,
    jsonb_build_object('pattern', w.pattern, 'match', w.match, 'scopes', to_jsonb(w.scopes), 'action', w.action));
end;
$$;

create or replace function public.admin_list_banned_words(filters jsonb default '{}', cursor int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.admins := private.require_admin('moderator');
  q text := nullif(btrim(coalesce(filters ->> 'q', '')), '');
  sc text := nullif(filters ->> 'scope', '');
  act text := nullif(filters ->> 'action', '');
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'pattern', w.pattern, 'match', w.match, 'scopes', to_jsonb(w.scopes), 'action', w.action,
      'fired_count', w.fired_count, 'overturned_count', w.overturned_count, 'created_at', w.created_at,
      'created_by', (select p.display_name from public.profiles p where p.id = w.created_by)) order by w.pattern, w.match)
    from (select * from public.banned_words x
          where (q is null or strpos(lower(x.pattern), lower(q)) > 0)
            and (sc is null or sc = any (x.scopes))
            and (act is null or x.action = act)
          order by x.pattern, x.match
          offset greatest(coalesce(admin_list_banned_words.cursor, 0), 0) limit 100) w), '[]');
end;
$$;

-- ---------------------------------------------------------------------------
-- rating_revealed (R11-NOTIF-01). Ratings become visible when both sides
-- rated or after 7 days (ratings_visible, 0009). Blocked pairs hear nothing.
create or replace function private.notify_rating_revealed(r public.ratings)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if r.ratee_id is null or private.is_blocked(r.ratee_id, r.rater_id) then
    return;
  end if;
  perform private.queue_notification(r.ratee_id, 'rating_revealed', 'meetups', 'New rating',
    'Your rating from ' || coalesce((select p.first_name from public.profiles p where p.id = r.rater_id), 'a deleted user') || ' is in',
    jsonb_build_object('chat_id', r.chat_id), false, 'rating_revealed:' || r.id);
end;
$$;

create or replace function private.ratings_reveal_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  other public.ratings;
begin
  select * into other from public.ratings x
  where x.chat_id = new.chat_id and x.rater_id is not distinct from new.ratee_id and x.id <> new.id
  limit 1;
  if other.id is not null then
    perform private.notify_rating_revealed(new);
    perform private.notify_rating_revealed(other);
  end if;
  return null;
end;
$$;

drop trigger if exists ratings_reveal_ai on public.ratings;
create trigger ratings_reveal_ai after insert on public.ratings
  for each row execute function private.ratings_reveal_ai();

-- Hourly: one-sided ratings reaching 7 days. The one-day window plus the dedupe
-- key make a missed or repeated run harmless.
create or replace function private.rating_reveal()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ratings;
  n int := 0;
begin
  for r in
    select * from public.ratings x
    where x.created_at <= private.now() - interval '7 days'
      and x.created_at > private.now() - interval '8 days'
      and x.ratee_id is not null
  loop
    perform private.notify_rating_revealed(r);
    n := n + 1;
  end loop;
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rating_reveal', '0 * * * *', 'select private.rating_reveal()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
do $$
declare
  f text;
begin
  foreach f in array array[
    'private.push_pref(text)', 'private.price_hint_json(int, int, int, int, text)',
    'private.start_data_export(uuid)', 'private.finish_data_export(uuid, text)', 'private.fail_data_export(uuid)',
    'private.export_name(uuid)', 'private.export_user_data(uuid)', 'private.pct(numeric, numeric)',
    'private.notify_rating_revealed(public.ratings)', 'private.ratings_reveal_ai()', 'private.rating_reveal()']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'private.start_data_export(uuid)', 'private.finish_data_export(uuid, text)', 'private.fail_data_export(uuid)',
    'private.export_user_data(uuid)']
  loop
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.price_hint(smallint, text)',
    'public.admin_metrics_funnel(uuid, date, date)', 'public.admin_metrics_retention(uuid)',
    'public.admin_metrics_liquidity(uuid)', 'public.admin_metrics_safety(uuid)',
    'public.admin_invite_admin(text, text, uuid, text)', 'public.admin_remove_admin(uuid, text)', 'public.admin_list_admins()',
    'public.admin_create_announcement(uuid, text, text, text, boolean, int, text)', 'public.admin_list_announcements(uuid, int)',
    'public.admin_upsert_banned_word(text, text, text[], text, text)', 'public.admin_delete_banned_word(uuid, text)',
    'public.admin_list_banned_words(jsonb, int)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
