-- 0219_age_retry_offer_lock.sql · A-03 and E-05 (audit), DEC 102.
--   * confirm_age: after a minor answer the email hash is in age_blocks; a
--     second call (os_signal true or an adult birth date) now answers
--     adult:false and leaves the account unconfirmed (require_active keeps
--     it out with AGE_REQUIRED). Before, a retry passed the 18+ gate.
--   * make_offer: the listing lock is FOR NO KEY UPDATE (was FOR SHARE then
--     an UPDATE of offer_count, which deadlocked concurrent first offers on
--     one listing: 23 of 24 failed). accept_offer and mark_sold take FOR
--     UPDATE, so they still wait for an offer in flight (BE-10); the offer
--     insert's foreign key takes KEY SHARE, which NO KEY UPDATE allows.
-- Both functions are copied from 0012 and 0022 with only those lines changed.

create or replace function public.confirm_age(
  method text,
  is_adult boolean default null,
  birth_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_onboarding();
  tz text;
  today date;
  adult boolean;
begin
  if me.adult_confirmed_at is not null then
    return jsonb_build_object('adult', true);
  end if;
  perform private.hit('confirm_age', 3, interval '1 day');
  -- Once this email answered minor, no retry passes (A-03). The app deletes
  -- the account after a minor answer; this covers a client that doesn't.
  if exists (select 1 from public.age_blocks a where a.email_hash = me.email_hash) then
    return jsonb_build_object('adult', false);
  end if;

  if method = 'os_signal' then
    if is_adult is null then
      perform private.raise('INVALID', 'is_adult');
    end if;
    adult := is_adult;
  elsif method = 'self_declared' then
    select c.timezone into tz from public.campuses c where c.id = me.campus_id;
    today := (private.now() at time zone coalesce(tz, 'America/New_York'))::date;
    if birth_date is null or birth_date > today or birth_date < today - interval '120 years' then
      perform private.raise('INVALID', 'birth_date');
    end if;
    adult := birth_date <= (today - interval '18 years')::date;
  else
    perform private.raise('INVALID', 'method');
  end if;

  if adult then
    update public.profiles
       set adult_confirmed_at = private.now(), age_method = method::public.age_method
     where id = me.id;
  else
    insert into public.age_blocks (email_hash, created_at) values (me.email_hash, private.now())
    on conflict do nothing;
  end if;
  return jsonb_build_object('adult', adult);
end;
$$;

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

  -- FOR NO KEY UPDATE: a concurrent accept_offer / mark_sold waits for us or
  -- we see its result (BE-10), and two first offers queue instead of both
  -- holding SHARE and deadlocking on the offer_count update (E-05).
  select * into l from public.listings x where x.id = make_offer.listing_id for no key update;
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
