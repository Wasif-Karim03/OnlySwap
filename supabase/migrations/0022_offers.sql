-- 0022_offers.sql (S22: P7-OFF-01, P7-OFF-06; DATA_MODEL §4.2, API §3, DEC 60)
--   make_offer, accept_offer, counter_offer, decline_offer, withdraw_offer,
--   get_inbox, listing_offers, get_offer and the expire_offers cron.

create or replace function private.money(cents int)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when cents = 0 then 'free'
              when cents % 100 = 0 then '$' || (cents / 100)::text
              else '$' || to_char(cents / 100.0, 'FM999990.00') end
$$;

-- Which side of an offer the caller is on (null = neither).
create or replace function private.offer_role(o public.offers, me uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when o.buyer_id = me then 'buyer' when o.seller_id = me then 'seller' end
$$;

create or replace function private.offer_json(p_offer uuid, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'listing_id', o.listing_id, 'amount_cents', o.amount_cents, 'note', o.note,
    'quick_notes', to_jsonb(o.quick_notes), 'status', o.status, 'round', o.round,
    'last_actor', o.last_actor, 'decline_reason', o.decline_reason, 'expires_at', o.expires_at,
    'responded_at', o.responded_at, 'created_at', o.created_at,
    'role', private.offer_role(o, p_viewer),
    'chat_id', (select c.id from public.chats c where c.offer_id = o.id),
    'listing', case when l.id is null then null else jsonb_build_object(
      'id', l.id, 'title', l.title, 'price_cents', l.price_cents, 'kind', l.kind, 'status', l.status,
      'thumb_path', (select ph.thumb_path from public.listing_photos ph where ph.listing_id = l.id order by ph.idx limit 1)) end,
    'other', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path)
              from public.profiles p
              where p.id = case when o.buyer_id = p_viewer then o.seller_id else o.buyer_id end))
  from public.offers o
  left join public.listings l on l.id = o.listing_id
  where o.id = p_offer
$$;

-- The offer, locked, for one of its two parties.
create or replace function private.my_offer(p_offer uuid, p_me uuid)
returns public.offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.offers;
begin
  select * into o from public.offers x where x.id = p_offer for update;
  if not found or private.offer_role(o, p_me) is null then
    perform private.raise('NOT_FOUND');
  end if;
  return o;
end;
$$;

create or replace function private.check_offer_note(note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
begin
  if note is null or btrim(note) = '' then
    return;
  end if;
  if char_length(note) > 140 then
    perform private.raise('INVALID', 'note');
  end if;
  v := private.check_text(note, 'offer');
  if v like 'block:%' then
    perform private.raise('BANNED_TERM', substr(v, 7));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.make_offer(listing_id uuid, amount_cents int, note text default null, quick_notes text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  me public.profiles;
  l public.listings;
  c public.campuses;
  o public.offers;
  qn text[] := coalesce(make_offer.quick_notes, '{}');
begin
  -- Paused accounts (2 confirmed no-shows or a first strike) can't make offers.
  if exists (select 1 from public.profiles p where p.id = uid and p.status = 'paused') then
    perform private.raise('OFFERS_PAUSED');
  end if;
  me := private.require_active();
  select * into c from public.campuses where id = me.campus_id;
  perform private.hit('make_offer', coalesce(c.offers_per_hour, 10), interval '1 hour');
  if me.created_at > private.now() - interval '24 hours' then
    perform private.hit('make_offer_new_account', 5, interval '1 day');
  end if;

  -- FOR SHARE: a concurrent accept_offer / mark_sold waits for us or we see its result (BE-10).
  select * into l from public.listings x where x.id = make_offer.listing_id for share;
  if not found or l.campus_id <> me.campus_id or l.status = 'deleted' or private.is_blocked(me.id, l.seller_id) then
    perform private.raise('NOT_FOUND');
  end if;
  if l.seller_id = me.id then
    perform private.raise('FORBIDDEN');
  end if;
  if l.status <> 'active' or l.kind not in ('sale', 'free')
     or (l.expires_at is not null and l.expires_at <= private.now()) then
    perform private.raise('LISTING_UNAVAILABLE');
  end if;
  if l.kind = 'free' then
    if make_offer.amount_cents <> 0 then
      perform private.raise('INVALID', 'amount_cents');
    end if;
  elsif make_offer.amount_cents is null or make_offer.amount_cents < 100 or make_offer.amount_cents > 200000 then
    perform private.raise('INVALID', 'amount_cents');
  elsif not l.open_to_offers and make_offer.amount_cents <> l.price_cents then
    -- A firm price can still be bought at the asking price.
    perform private.raise('LISTING_UNAVAILABLE');
  end if;
  perform private.check_offer_note(make_offer.note);
  if cardinality(qn) > 5 or exists (select 1 from unnest(qn) q where char_length(q) > 40) then
    perform private.raise('INVALID', 'quick_notes');
  end if;

  select * into o from public.offers x
  where x.listing_id = l.id and x.buyer_id = me.id and x.status in ('pending', 'countered')
  for update;
  if found then
    if o.status = 'countered' and o.last_actor = 'seller' then
      -- Answering the seller's counter with a new amount is a counter back.
      if o.round >= 4 then
        perform private.raise('INVALID', 'round');
      end if;
      update public.offers x
         set amount_cents = make_offer.amount_cents, note = nullif(btrim(make_offer.note), ''), quick_notes = qn,
             round = o.round + 1, last_actor = 'buyer', status = 'countered',
             expires_at = private.now() + interval '48 hours', responded_at = private.now()
       where x.id = o.id returning * into o;
    else
      update public.offers x
         set amount_cents = make_offer.amount_cents, note = nullif(btrim(make_offer.note), ''), quick_notes = qn,
             expires_at = private.now() + interval '48 hours'
       where x.id = o.id returning * into o;
    end if;
  else
    insert into public.offers (listing_id, buyer_id, seller_id, amount_cents, note, quick_notes, expires_at, created_at)
    values (l.id, me.id, l.seller_id, make_offer.amount_cents, nullif(btrim(make_offer.note), ''), qn,
            private.now() + interval '48 hours', private.now())
    returning * into o;
    update public.listings x set offer_count = offer_count + 1 where x.id = l.id;
  end if;

  perform private.queue_notification(
    l.seller_id, 'offer_new', 'offers', 'New offer',
    case when l.kind = 'free' then me.display_name || ' asked for your ' || l.title
         else me.display_name || ' offered ' || private.money(o.amount_cents) || ' on your ' || l.title end,
    jsonb_build_object('offer_id', o.id, 'listing_id', l.id), true,
    'offer_new:' || o.id || ':' || o.round || ':' || o.amount_cents);
  return private.offer_json(o.id, me.id);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.accept_offer(offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  o public.offers := private.my_offer(accept_offer.offer_id, me.id);
  role text := private.offer_role(o, me.id);
  l public.listings;
  chat uuid;
  other record;
begin
  if o.status not in ('pending', 'countered') then
    perform private.raise('OFFER_NOT_PENDING');
  end if;
  -- The party who didn't act last accepts (a fresh offer: the seller).
  if role = o.last_actor then
    perform private.raise('FORBIDDEN');
  end if;
  -- FOR UPDATE on the listing: of two accepts on one listing exactly one wins (T-INT-OFF-RACE).
  select * into l from public.listings x where x.id = o.listing_id for update;
  if not found or l.status <> 'active' then
    perform private.raise('LISTING_UNAVAILABLE');
  end if;
  if private.is_blocked(o.buyer_id, o.seller_id) then
    perform private.raise('FORBIDDEN');
  end if;
  -- Re-read under the lock: another session may have auto-declined this offer.
  select * into o from public.offers x where x.id = o.id;
  if o.status not in ('pending', 'countered') then
    perform private.raise('OFFER_NOT_PENDING');
  end if;

  update public.offers x set status = 'accepted', responded_at = private.now() where x.id = o.id;
  update public.listings x set status = 'hold', hold_offer_id = o.id where x.id = l.id;

  insert into public.chats (listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents,
                            listing_thumb_path, agreed_cents, last_message_at, created_at)
  values (l.id, o.id, o.buyer_id, o.seller_id, l.title, l.price_cents,
          (select ph.thumb_path from public.listing_photos ph where ph.listing_id = l.id order by ph.idx limit 1),
          o.amount_cents, private.now(), private.now())
  returning id into chat;
  insert into public.messages (chat_id, sender_id, kind, body, meta, created_at)
  values (chat, null, 'system',
          case when l.kind = 'free' then 'Request accepted. Plan the pickup.'
               else 'Offer accepted at ' || private.money(o.amount_cents) || '. Plan the pickup.' end,
          jsonb_build_object('event', 'offer_accepted', 'amount_cents', o.amount_cents), private.now());

  -- Everyone else's open offer on this listing is auto-declined and told.
  for other in
    update public.offers x set status = 'auto_declined', responded_at = private.now()
     where x.listing_id = l.id and x.id <> o.id and x.status in ('pending', 'countered')
    returning x.id, x.buyer_id
  loop
    perform private.queue_notification(other.buyer_id, 'offer_declined', 'offers', 'Offer declined',
      'Your offer on the ' || l.title || ' wasn''t accepted',
      jsonb_build_object('offer_id', other.id, 'listing_id', l.id), false, 'offer_declined:' || other.id);
  end loop;

  perform private.queue_notification(
    case when role = 'seller' then o.buyer_id else o.seller_id end, 'offer_accepted', 'offers', 'Offer accepted',
    me.display_name || ' accepted your offer. Say hi and plan the pickup.',
    jsonb_build_object('offer_id', o.id, 'chat_id', chat), true, 'offer_accepted:' || o.id);
  return jsonb_build_object('chat_id', chat);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.counter_offer(offer_id uuid, amount_cents int, note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  o public.offers := private.my_offer(counter_offer.offer_id, me.id);
  role text := private.offer_role(o, me.id);
  l public.listings;
begin
  perform private.hit('counter_offer', 30, interval '1 day');
  if o.status not in ('pending', 'countered') then
    perform private.raise('OFFER_NOT_PENDING');
  end if;
  if role = o.last_actor then
    perform private.raise('FORBIDDEN');
  end if;
  if o.round >= 4 then
    perform private.raise('INVALID', 'round');
  end if;
  select * into l from public.listings x where x.id = o.listing_id for share;
  if not found or l.status <> 'active' then
    perform private.raise('LISTING_UNAVAILABLE');
  end if;
  if l.kind = 'free' or counter_offer.amount_cents is null
     or counter_offer.amount_cents < 100 or counter_offer.amount_cents > 200000
     or counter_offer.amount_cents = o.amount_cents then
    perform private.raise('INVALID', 'amount_cents');
  end if;
  perform private.check_offer_note(counter_offer.note);

  update public.offers x
     set amount_cents = counter_offer.amount_cents, note = nullif(btrim(counter_offer.note), ''),
         status = 'countered', round = o.round + 1, last_actor = role,
         expires_at = private.now() + interval '48 hours', responded_at = private.now()
   where x.id = o.id returning * into o;

  perform private.queue_notification(
    case when role = 'seller' then o.buyer_id else o.seller_id end, 'offer_countered', 'offers', 'Counter offer',
    me.display_name || ' countered at ' || private.money(o.amount_cents) || ' on the ' || l.title,
    jsonb_build_object('offer_id', o.id, 'listing_id', l.id), true, 'offer_countered:' || o.id || ':' || o.round);
  return private.offer_json(o.id, me.id);
end;
$$;

create or replace function public.decline_offer(offer_id uuid, reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  o public.offers := private.my_offer(decline_offer.offer_id, me.id);
  role text := private.offer_role(o, me.id);
  title text;
begin
  if o.status not in ('pending', 'countered') then
    perform private.raise('OFFER_NOT_PENDING');
  end if;
  if role = o.last_actor then
    perform private.raise('FORBIDDEN');
  end if;
  if char_length(coalesce(decline_offer.reason, '')) > 80 then
    perform private.raise('INVALID', 'reason');
  end if;
  update public.offers x
     set status = 'declined', decline_reason = nullif(btrim(decline_offer.reason), ''), responded_at = private.now()
   where x.id = o.id;
  select l.title into title from public.listings l where l.id = o.listing_id;
  perform private.queue_notification(
    case when role = 'seller' then o.buyer_id else o.seller_id end, 'offer_declined', 'offers', 'Offer declined',
    case when role = 'seller' then 'Your offer on the ' || coalesce(title, 'item') || ' wasn''t accepted'
         else 'Your counter on the ' || coalesce(title, 'item') || ' wasn''t accepted' end,
    jsonb_build_object('offer_id', o.id, 'listing_id', o.listing_id), false, 'offer_declined:' || o.id);
end;
$$;

create or replace function public.withdraw_offer(offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  o public.offers := private.my_offer(withdraw_offer.offer_id, me.id);
begin
  if o.buyer_id is distinct from me.id then
    perform private.raise('FORBIDDEN');
  end if;
  if o.status not in ('pending', 'countered') then
    perform private.raise('OFFER_NOT_PENDING');
  end if;
  update public.offers x set status = 'withdrawn', responded_at = private.now() where x.id = o.id;
end;
$$;

create or replace function public.get_offer(offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  o public.offers;
begin
  select * into o from public.offers x where x.id = get_offer.offer_id;
  if not found or private.offer_role(o, me.id) is null then
    perform private.raise('NOT_FOUND');
  end if;
  return private.offer_json(o.id, me.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Inbox: offers to me and from me (open, plus the last 7 days of closed ones),
-- and my chats (visible, newest first).
create or replace function private.chat_summary(p_chat uuid, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'listing_id', c.listing_id, 'offer_id', c.offer_id, 'status', c.status,
    'listing_title', c.listing_title, 'listing_price_cents', c.listing_price_cents,
    'listing_thumb_path', c.listing_thumb_path, 'agreed_cents', c.agreed_cents,
    'role', case when c.buyer_id = p_me then 'buyer' else 'seller' end,
    'last_message_at', c.last_message_at,
    'muted', case when c.buyer_id = p_me then c.buyer_muted else c.seller_muted end,
    'unread', exists (
      select 1 from public.messages m
      where m.chat_id = c.id and m.sender_id is distinct from p_me
        and m.created_at > coalesce(case when c.buyer_id = p_me then c.buyer_read_at else c.seller_read_at end, '-infinity')),
    'last_message', (select jsonb_build_object('kind', m.kind, 'body', m.body, 'mine', m.sender_id = p_me, 'created_at', m.created_at)
                     from public.messages m where m.chat_id = c.id order by m.id desc limit 1),
    'other', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_path', p.avatar_path)
              from public.profiles p
              where p.id = case when c.buyer_id = p_me then c.seller_id else c.buyer_id end))
  from public.chats c where c.id = p_chat
$$;

create or replace function public.get_inbox()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_active();
  recent timestamptz := private.now() - interval '7 days';
begin
  return jsonb_build_object(
    'incoming', coalesce((
      select jsonb_agg(private.offer_json(o.id, me.id) order by o.created_at desc)
      from public.offers o
      where o.seller_id = me.id and o.status <> 'accepted'
        and (o.status in ('pending', 'countered') or coalesce(o.responded_at, o.expires_at) > recent)
        and not private.is_blocked(me.id, o.buyer_id)), '[]'),
    'outgoing', coalesce((
      select jsonb_agg(private.offer_json(o.id, me.id) order by o.created_at desc)
      from public.offers o
      where o.buyer_id = me.id and o.status <> 'accepted'
        and (o.status in ('pending', 'countered') or coalesce(o.responded_at, o.expires_at) > recent)
        and not private.is_blocked(me.id, o.seller_id)), '[]'),
    'chats', coalesce((
      select jsonb_agg(private.chat_summary(c.id, me.id) order by c.last_message_at desc)
      from public.chats c
      where (c.buyer_id = me.id and not c.buyer_hidden) or (c.seller_id = me.id and not c.seller_hidden)), '[]'));
end;
$$;

-- Offers on one of my listings, in arrival order (P7-OFF-05, P7-OFF-07).
create or replace function public.listing_offers(id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
begin
  if not exists (select 1 from public.listings l where l.id = listing_offers.id and l.seller_id = me.id) then
    perform private.raise('NOT_FOUND');
  end if;
  return coalesce((
    select jsonb_agg(private.offer_json(o.id, me.id) order by o.created_at)
    from public.offers o where o.listing_id = listing_offers.id), '[]');
end;
$$;

-- ---------------------------------------------------------------------------
-- expire_offers (*/5): open offers past expires_at expire; the buyer is told.
create or replace function private.expire_offers()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  n int := 0;
begin
  for o in
    update public.offers x set status = 'expired', responded_at = private.now()
     where x.status in ('pending', 'countered') and x.expires_at <= private.now()
    returning x.id, x.buyer_id, x.amount_cents, x.listing_id
  loop
    n := n + 1;
    perform private.queue_notification(o.buyer_id, 'offer_expired', 'offers', 'Offer expired',
      'Your ' || private.money(o.amount_cents) || ' offer on the '
        || coalesce((select l.title from public.listings l where l.id = o.listing_id), 'item') || ' expired',
      jsonb_build_object('offer_id', o.id, 'listing_id', o.listing_id), false, 'offer_expired:' || o.id);
  end loop;
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('expire_offers', '*/5 * * * *', 'select private.expire_offers()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
revoke all on function private.money(int) from public, anon, authenticated;
revoke all on function private.offer_role(public.offers, uuid) from public, anon, authenticated;
revoke all on function private.offer_json(uuid, uuid) from public, anon, authenticated;
revoke all on function private.my_offer(uuid, uuid) from public, anon, authenticated;
revoke all on function private.check_offer_note(text) from public, anon, authenticated;
revoke all on function private.chat_summary(uuid, uuid) from public, anon, authenticated;
revoke all on function private.expire_offers() from public, anon, authenticated;

revoke all on function public.make_offer(uuid, int, text, text[]) from public, anon;
revoke all on function public.accept_offer(uuid) from public, anon;
revoke all on function public.counter_offer(uuid, int, text) from public, anon;
revoke all on function public.decline_offer(uuid, text) from public, anon;
revoke all on function public.withdraw_offer(uuid) from public, anon;
revoke all on function public.get_offer(uuid) from public, anon;
revoke all on function public.get_inbox() from public, anon;
revoke all on function public.listing_offers(uuid) from public, anon;

grant execute on function public.make_offer(uuid, int, text, text[]) to authenticated;
grant execute on function public.accept_offer(uuid) to authenticated;
grant execute on function public.counter_offer(uuid, int, text) to authenticated;
grant execute on function public.decline_offer(uuid, text) to authenticated;
grant execute on function public.withdraw_offer(uuid) to authenticated;
grant execute on function public.get_offer(uuid) to authenticated;
grant execute on function public.get_inbox() to authenticated;
grant execute on function public.listing_offers(uuid) to authenticated;
