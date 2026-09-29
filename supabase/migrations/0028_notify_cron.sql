-- 0028_notify_cron.sql (S29: P9-PUSH-04, P9-CRON-01, P9-MAIL-02, P4-AUTH-16; API §2, §6, §7, DATA_MODEL §5, DEC 65)
--   Listing triggers: saved_search_match, price_drop, watch_available, founding sellers.
--   Crons: expire_listings, stale_listings, reverify_reminders, reverify_enforce,
--   pause_lift, refresh_stats, refresh_hints, prune (retention), archive_chats,
--   strike_expiry, email_drain, demo_autoplay.
--   Email outbox claim/finish for send-email (400/day cap, skip locked).

-- ---------------------------------------------------------------------------
-- New listing: saved-search alerts (≤1 per search per 2 h) and founding sellers.
create or replace function private.listings_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  c public.campuses;
begin
  if new.status <> 'active' or new.kind not in ('sale', 'free') then
    return null;
  end if;
  for s in
    select ss.* from public.saved_searches ss
    join public.profiles p on p.id = ss.user_id
    where ss.campus_id = new.campus_id and ss.alerts and ss.user_id is distinct from new.seller_id
      and p.status = 'active'
      and (ss.last_notified_at is null or ss.last_notified_at < private.now() - interval '2 hours')
      and not private.is_blocked(ss.user_id, new.seller_id)
      and private.text_matches(new, ss.query) and private.filters_match(new, ss.filters)
  loop
    perform private.queue_notification(s.user_id, 'saved_search_match', 'alerts', 'New match',
      'New: ' || new.title || ' for ' || private.money(new.price_cents)
        || case when s.query is not null then ' (matches ''' || s.query || ''')' else '' end,
      jsonb_build_object('listing_id', new.id, 'saved_search_id', s.id), false, 'ssm:' || s.id || ':' || new.id);
    update public.saved_searches x set last_notified_at = private.now() where x.id = s.id;
  end loop;

  -- Founding sellers: the first people to list on a campus, up to its limit (PRD F29).
  select * into c from public.campuses where id = new.campus_id;
  if c.founding_seller_limit > 0
     and exists (select 1 from public.profiles p where p.id = new.seller_id and p.founding_seller_until is null)
     and (select count(*) from public.profiles p where p.campus_id = c.id and p.founding_seller_until is not null) < c.founding_seller_limit then
    update public.profiles p set founding_seller_until = private.now() + interval '365 days' where p.id = new.seller_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_listings_ai on public.listings;
create trigger trg_listings_ai after insert on public.listings
for each row execute function private.listings_ai();

-- A price drop of 5% or more tells the people who saved it.
create or replace function private.listings_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  if new.status in ('active', 'hold') and new.price_cents <= old.price_cents * 0.95 then
    for s in select sv.user_id from public.saves sv where sv.listing_id = new.id loop
      perform private.queue_notification(s.user_id, 'price_drop', 'alerts', 'Price drop',
        new.title || ' you saved is now ' || private.money(new.price_cents),
        jsonb_build_object('listing_id', new.id), false, 'price_drop:' || new.id || ':' || new.price_cents);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_listings_price on public.listings;
create trigger trg_listings_price after update of price_cents on public.listings
for each row when (new.price_cents is distinct from old.price_cents)
execute function private.listings_price();

-- Back from hold: watchers hear it's available again.
create or replace function private.listings_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
begin
  if old.status = 'hold' and new.status = 'active' then
    for w in select wa.user_id from public.watches wa where wa.listing_id = new.id loop
      perform private.queue_notification(w.user_id, 'watch_available', 'alerts', 'Available again',
        'The ' || new.title || ' is available again', jsonb_build_object('listing_id', new.id), false,
        'watch:' || new.id || ':' || to_char(private.now(), 'YYYYMMDD'));
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_listings_status on public.listings;
create trigger trg_listings_status after update of status on public.listings
for each row when (new.status is distinct from old.status)
execute function private.listings_status();

-- ---------------------------------------------------------------------------
-- expire_listings (*/10): past expires_at → expired; open offers auto-declined, chats kept.
create or replace function private.expire_listings()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  n int := 0;
begin
  for l in
    update public.listings x set status = 'expired'
     where x.status = 'active' and x.expires_at is not null and x.expires_at <= private.now()
    returning x.id
  loop
    n := n + 1;
    update public.offers o set status = 'auto_declined', responded_at = private.now()
     where o.listing_id = l.id and o.status in ('pending', 'countered');
  end loop;
  return n;
end;
$$;

-- stale_listings (daily): a week up, no offers → one nudge (tips pref decides at send time).
create or replace function private.stale_listings()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  n int := 0;
begin
  for l in
    select x.* from public.listings x
    where x.status = 'active' and x.kind = 'sale' and x.offer_count = 0 and x.seller_id is not null
      and x.created_at < private.now() - interval '7 days'
      and x.created_at > private.now() - interval '30 days'
  loop
    if private.queue_notification(l.seller_id, 'listing_stale', 'selling', 'No offers yet',
         'No offers on your ' || l.title || ' yet. Drop the price?', jsonb_build_object('listing_id', l.id), false,
         'stale:' || l.id) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- reverify_reminders (daily): 14 days and 1 day before verified_until (push + email).
create or replace function private.reverify_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  n int := 0;
begin
  for p in
    select pr.id, pr.verified_until, u.email, private.campus_today(pr.campus_id) as today
    from public.profiles pr join auth.users u on u.id = pr.id
    where pr.status = 'active'
      and pr.verified_until in (private.campus_today(pr.campus_id) + 14, private.campus_today(pr.campus_id) + 1)
  loop
    n := n + 1;
    perform private.queue_notification(p.id, 'reverify_due', 'account', 'Confirm you''re still a student',
      'Confirm your school email by ' || to_char(p.verified_until, 'FMMon FMDD') || ' to keep using OnlySwap.',
      '{}'::jsonb, false, 'reverify:' || p.id || ':' || p.verified_until || ':' || (p.verified_until - p.today));
    if p.email is not null then
      perform private.queue_email(p.email, 'reverify_due', jsonb_build_object('due', p.verified_until),
        'reverify_due:' || p.id || ':' || p.verified_until || ':' || (p.verified_until - p.today));
    end if;
  end loop;
  return n;
end;
$$;

-- reverify_enforce (daily): past verified_until → status reverify.
create or replace function private.reverify_enforce()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.profiles p set status = 'reverify'
   where p.status = 'active' and p.verified_until < private.campus_today(p.campus_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- pause_lift (*/10): paused_until passed → active again.
create or replace function private.pause_lift()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  n int := 0;
begin
  for p in
    update public.profiles x set status = 'active', paused_until = null, status_reason = null
     where x.status = 'paused' and x.paused_until is not null and x.paused_until <= private.now()
    returning x.id
  loop
    n := n + 1;
    perform private.queue_notification(p.id, 'account_notice', 'account', 'You''re back',
      'Your account is active again. Offers are back on.', '{}'::jsonb, false,
      'acct:' || p.id || ':unpaused:' || to_char(private.now(), 'YYYYMMDD'));
  end loop;
  return n;
end;
$$;

create or replace function private.refresh_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.profile_stats_mv;
end;
$$;

create or replace function private.refresh_hints()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently public.price_hints;
end;
$$;

-- strike_expiry (daily): expired strikes stop counting.
create or replace function private.strike_expiry()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  n int := 0;
begin
  for s in
    update public.strikes x set cleared_at = private.now()
     where x.cleared_at is null and x.expires_at <= private.now()
    returning x.user_id
  loop
    n := n + 1;
    update public.profiles p set strike_count = greatest(strike_count - 1, 0) where p.id = s.user_id;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- prune (daily): the retention table (DATA_MODEL §5) plus the draft cleanup from 0017.
create or replace function private.prune_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  res jsonb := '{}';
  n int;
begin
  delete from public.notifications where created_at < private.now() - interval '60 days';
  get diagnostics n = row_count; res := res || jsonb_build_object('notifications', n);
  delete from public.swipes where dir = 'left' and created_at <> 'infinity' and created_at < private.now() - interval '30 days';
  get diagnostics n = row_count; res := res || jsonb_build_object('swipes', n);
  delete from public.rate_counters where window_start < private.now() - interval '2 days';
  get diagnostics n = row_count; res := res || jsonb_build_object('rate_counters', n);
  delete from public.activity_days where day < (private.now() - interval '400 days')::date;
  get diagnostics n = row_count; res := res || jsonb_build_object('activity_days', n);
  delete from public.age_blocks where created_at < private.now() - interval '365 days';
  get diagnostics n = row_count; res := res || jsonb_build_object('age_blocks', n);
  delete from public.waitlist_requests where notified_at is not null or created_at < private.now() - interval '12 months';
  get diagnostics n = row_count; res := res || jsonb_build_object('waitlist_requests', n);
  delete from public.reports where status <> 'open' and resolved_at < private.now() - interval '180 days';
  get diagnostics n = row_count; res := res || jsonb_build_object('reports', n);
  delete from public.push_tickets where created_at < private.now() - interval '30 days';
  delete from public.email_outbox where state in ('sent', 'failed') and coalesce(sent_at, send_after) < private.now() - interval '30 days';
  delete from public.data_exports where expires_at < private.now() - interval '1 day';
  return res;
end;
$$;

create or replace function private.prune_all()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.prune_retention();
  return private.prune();
end;
$$;

-- archive_chats (daily): closed more than 90 days → the archive-chats function
-- writes the JSON to R2 and then calls private.finish_chat_archive.
create or replace function private.chats_to_archive(p_limit int default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'chat', to_jsonb(c) - 'buyer_hidden' - 'seller_hidden',
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.messages m where m.chat_id = c.id), '[]'))), '[]')
  from (select * from public.chats x
        where x.status = 'closed' and x.archived_at is null and x.closed_at < private.now() - interval '90 days'
        order by x.closed_at limit p_limit) c
$$;

create or replace function private.finish_chat_archive(p_chat uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.messages where chat_id = p_chat;
  update public.chats set archived_at = private.now() where id = p_chat;
end;
$$;

create or replace function private.archive_chats()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.chats where status = 'closed' and archived_at is null
             and closed_at < private.now() - interval '90 days') then
    return private.call_function('archive-chats');
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Email outbox (P9-MAIL-02): claim with skip locked, 400 sent per day across the project.
create or replace function private.claim_emails(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sent_today int := (select count(*) from public.email_outbox where state = 'sent' and sent_at > private.now() - interval '24 hours');
  room int := greatest(400 - sent_today, 0);
  res jsonb := '[]';
  e record;
begin
  if room = 0 then
    return res;
  end if;
  for e in
    select * from public.email_outbox x
    where x.state = 'pending' and x.send_after <= private.now()
    order by (x.template = 'priority_report') desc, x.id
    limit least(p_limit, room)
    for update skip locked
  loop
    update public.email_outbox x set state = 'sending', claimed_at = private.now(), attempts = attempts + 1 where x.id = e.id;
    res := res || jsonb_build_object('id', e.id, 'to', e.to_email, 'template', e.template, 'vars', e.vars);
  end loop;
  return res;
end;
$$;

-- results: [{id, ok, error?}]; a failure retries later (3 attempts), then fails.
create or replace function private.finish_emails(results jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  n int := 0;
begin
  for r in select value from jsonb_array_elements(coalesce(results, '[]')) loop
    if (r ->> 'ok')::bool then
      update public.email_outbox x set state = 'sent', sent_at = private.now(), error = null where x.id = (r ->> 'id')::bigint;
    else
      update public.email_outbox x
         set state = case when x.attempts >= 3 then 'failed' else 'pending' end,
             send_after = private.now() + interval '30 minutes', error = left(r ->> 'error', 200)
       where x.id = (r ->> 'id')::bigint;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function private.email_drain()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.email_outbox where state = 'pending' and send_after <= private.now()) then
    return private.call_function('send-email');
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- demo_autoplay (P4-AUTH-16): on Demo University only, the seeded sellers act
-- like a patient counterpart so a reviewer can finish a swap alone: accept
-- offers, answer messages, confirm or propose a meetup, check in, and say it
-- sold. It acts through the same RPCs a person would use.
create or replace function private.demo_act(p_actor uuid, p_sql text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  execute p_sql;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function private.demo_autoplay()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo uuid := (select id from public.campuses where is_demo limit 1);
  x record;
  n int := 0;
  spot uuid;
begin
  if demo is null then
    return 0;
  end if;
  spot := (select s.id from public.safe_spots s where s.campus_id = demo and s.active order by s.sort limit 1);

  -- Bots are the demo campus's non-reviewer accounts.
  for x in
    select o.id, o.seller_id from public.offers o
    join public.profiles p on p.id = o.seller_id and p.campus_id = demo
    join auth.users u on u.id = p.id and u.email not in (select email from public.review_accounts where note ilike '%reviewer%')
    where o.status in ('pending', 'countered') and o.last_actor = 'buyer' and o.created_at < private.now() - interval '30 seconds'
  loop
    if private.demo_act(x.seller_id, format('select public.accept_offer(%L)', x.id)) then n := n + 1; end if;
  end loop;

  for x in
    select c.id, case when bu.email in (select email from public.review_accounts where note ilike '%reviewer%') then c.seller_id else c.buyer_id end as bot,
           (select m.sender_id from public.messages m where m.chat_id = c.id and m.kind = 'text' order by m.id desc limit 1) as last_sender,
           (select mt.id from public.meetups mt where mt.chat_id = c.id and mt.status in ('proposed', 'confirmed') limit 1) as meetup
    from public.chats c
    join public.profiles bp on bp.id = c.buyer_id and bp.campus_id = demo
    join auth.users bu on bu.id = c.buyer_id
    where c.status = 'open'
  loop
    -- Answer the reviewer's last message once.
    if x.last_sender is not null and x.last_sender <> x.bot then
      if private.demo_act(x.bot, format('select public.send_message(%L, %L, %L)', x.id,
           'Sounds good. The Demo Library lobby works for me.', gen_random_uuid())) then n := n + 1; end if;
    end if;
    if x.meetup is null and spot is not null then
      perform private.demo_act(x.bot, format('select public.propose_meetup(%L, %L::timestamptz, %L)',
        x.id, date_trunc('hour', private.now()) + interval '2 hours', spot));
    else
      perform private.demo_act(x.bot, format('select public.confirm_meetup(%L)', x.meetup));
      perform private.demo_act(x.bot, format('select public.checkin_meetup(%L)', x.meetup));
    end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('expire_listings', '*/10 * * * *', 'select private.expire_listings()');
    perform cron.schedule('stale_listings', '0 21 * * *', 'select private.stale_listings()');
    perform cron.schedule('reverify_reminders', '0 14 * * *', 'select private.reverify_reminders()');
    perform cron.schedule('reverify_enforce', '30 14 * * *', 'select private.reverify_enforce()');
    perform cron.schedule('pause_lift', '*/10 * * * *', 'select private.pause_lift()');
    perform cron.schedule('refresh_stats', '*/10 * * * *', 'select private.refresh_stats()');
    perform cron.schedule('refresh_hints', '0 9 * * *', 'select private.refresh_hints()');
    perform cron.schedule('prune', '30 9 * * *', 'select private.prune_all()');
    perform cron.schedule('archive_chats', '0 10 * * *', 'select private.archive_chats()');
    perform cron.schedule('strike_expiry', '0 11 * * *', 'select private.strike_expiry()');
    perform cron.schedule('email_drain', '*/5 * * * *', 'select private.email_drain()');
    perform cron.schedule('demo_autoplay', '* * * * *', 'select private.demo_autoplay()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'private.listings_ai()', 'private.listings_price()', 'private.listings_status()',
    'private.expire_listings()', 'private.stale_listings()', 'private.reverify_reminders()',
    'private.reverify_enforce()', 'private.pause_lift()', 'private.refresh_stats()', 'private.refresh_hints()',
    'private.strike_expiry()', 'private.prune_retention()', 'private.prune_all()', 'private.chats_to_archive(int)',
    'private.finish_chat_archive(uuid)', 'private.archive_chats()', 'private.claim_emails(int)',
    'private.finish_emails(jsonb)', 'private.email_drain()', 'private.demo_act(uuid, text)', 'private.demo_autoplay()']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
grant execute on function private.claim_emails(int) to service_role;
grant execute on function private.finish_emails(jsonb) to service_role;
grant execute on function private.chats_to_archive(int) to service_role;
grant execute on function private.finish_chat_archive(uuid) to service_role;
