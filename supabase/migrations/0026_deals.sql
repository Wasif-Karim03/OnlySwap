-- 0026_deals.sql (S27: P8-DEAL-01, P8-DEAL-04; API §3, BE-01, BE-11, DEC 63)
--   confirm_deal, submit_rating, get_my_rating, the deal_checks cron, buyer
--   notifications when a listing winds down (T-INT-SOLD-01), and chats closing
--   read-only when an account is deleted (T-INT-DEL-02).

-- Wind-down now also tells each closed chat's buyer (BE-11). Same signature as 0016.
create or replace function private.wind_down_listing(p_listing uuid, p_message text, p_keep_buyer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  o record;
  title text := (select l.title from public.listings l where l.id = p_listing);
begin
  for o in
    update public.offers x set status = 'auto_declined', responded_at = private.now()
     where x.listing_id = p_listing and x.status in ('pending', 'countered')
    returning x.id, x.buyer_id
  loop
    perform private.queue_notification(o.buyer_id, 'offer_declined', 'offers', 'Offer declined',
      'This sold to someone else', jsonb_build_object('offer_id', o.id, 'listing_id', p_listing), false,
      'offer_declined:' || o.id);
  end loop;
  for c in
    select x.id, x.buyer_id, x.offer_id from public.chats x
    where x.listing_id = p_listing and x.status = 'open'
      and (p_keep_buyer is null or x.buyer_id is distinct from p_keep_buyer)
  loop
    insert into public.messages (chat_id, sender_id, kind, body, created_at)
    values (c.id, null, 'system', p_message, private.now());
    update public.chats set status = 'closed', closed_at = private.now() where id = c.id;
    update public.meetups set status = 'cancelled', cancel_reason = 'listing closed'
     where chat_id = c.id and status in ('proposed', 'confirmed');
    if c.buyer_id is not null then
      perform private.queue_notification(c.buyer_id, 'offer_declined', 'offers', 'Deal closed',
        p_message || coalesce(': ' || title, ''), jsonb_build_object('chat_id', c.id, 'listing_id', p_listing), false,
        'offer_declined:' || coalesce(c.offer_id::text, c.id::text));
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_deal: "Did it sell?" (E07). The seller's `done` marks the listing
-- sold to this buyer; `fell_through` puts it back on the market and closes the
-- chat; `not_yet` only records the answer.
create or replace function public.confirm_deal(chat_id uuid, outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(confirm_deal.chat_id, me.id);
  seller bool := c.seller_id = me.id;
  l public.listings;
  w record;
begin
  if confirm_deal.outcome not in ('done', 'not_yet', 'fell_through') then
    perform private.raise('INVALID', 'outcome');
  end if;
  if seller then
    update public.chats x set seller_outcome = confirm_deal.outcome where x.id = c.id;
  else
    update public.chats x set buyer_outcome = confirm_deal.outcome where x.id = c.id;
  end if;
  select * into l from public.listings x where x.id = c.listing_id for update;

  if confirm_deal.outcome = 'done' then
    update public.meetups m set status = 'completed' where m.chat_id = c.id and m.status = 'confirmed';
    if seller and l.id is not null and l.status in ('active', 'hold') then
      update public.listings x
         set status = 'sold', sold_at = private.now(), buyer_id = c.buyer_id, sold_in_app = true
       where x.id = l.id;
      perform private.wind_down_listing(l.id, 'This item sold to someone else', c.buyer_id);
    end if;
    for w in select unnest(array[c.buyer_id, c.seller_id]) as uid loop
      continue when w.uid is null;
      perform private.queue_notification(w.uid, 'rate_prompt', 'meetups', 'Rate the swap',
        'How was swapping with ' || coalesce((select p.first_name from public.profiles p
          where p.id = case when w.uid = c.buyer_id then c.seller_id else c.buyer_id end), 'them') || '?',
        jsonb_build_object('chat_id', c.id), false, 'rate_prompt:' || c.id);
    end loop;
  elsif confirm_deal.outcome = 'fell_through' then
    if c.status = 'open' then
      insert into public.messages (chat_id, sender_id, kind, body, created_at)
      values (c.id, null, 'system', 'The deal fell through. This chat is closed.', private.now());
      update public.chats x set status = 'closed', closed_at = private.now() where x.id = c.id;
    end if;
    update public.meetups m set status = 'cancelled', cancelled_by = me.id, cancel_reason = 'fell through'
     where m.chat_id = c.id and m.status in ('proposed', 'confirmed');
    if l.id is not null and l.status = 'hold' and l.hold_offer_id is not distinct from c.offer_id then
      update public.listings x set status = 'active', hold_offer_id = null where x.id = l.id;
      -- Watchers hear it's available again (watch_available).
      for w in select wa.user_id from public.watches wa where wa.listing_id = l.id loop
        perform private.queue_notification(w.user_id, 'watch_available', 'alerts', 'Available again',
          'The ' || l.title || ' is available again', jsonb_build_object('listing_id', l.id), false,
          'watch:' || l.id || ':' || to_char(private.now(), 'YYYYMMDD'));
      end loop;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_rating (E08): once per chat and rater; after a `done` answer from
-- either side, or 24 h after a confirmed meetup started. Revealed by
-- ratings_visible when both rated or after 7 days.
create or replace function public.submit_rating(chat_id uuid, thumbs_up bool, tags text[] default '{}', comment text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(submit_rating.chat_id, me.id);
  ratee uuid := case when c.buyer_id = me.id then c.seller_id else c.buyer_id end;
  v text;
  t text[] := coalesce(submit_rating.tags, '{}');
begin
  if submit_rating.thumbs_up is null then
    perform private.raise('INVALID', 'thumbs_up');
  end if;
  if cardinality(t) > 5 or exists (select 1 from unnest(t) x
      where x not in ('on_time', 'as_described', 'friendly', 'easy', 'late', 'not_as_described', 'rude', 'no_show')) then
    perform private.raise('INVALID', 'tags');
  end if;
  if not ('done' in (coalesce(c.buyer_outcome, ''), coalesce(c.seller_outcome, ''))
          or exists (select 1 from public.listings l where l.id = c.listing_id and l.status = 'sold' and l.buyer_id = c.buyer_id)
          or exists (select 1 from public.meetups m where m.chat_id = c.id and m.status in ('confirmed', 'completed')
                     and m.starts_at < private.now() - interval '24 hours')) then
    perform private.raise('MEETUP_WINDOW');
  end if;
  if char_length(coalesce(submit_rating.comment, '')) > 200 then
    perform private.raise('INVALID', 'comment');
  end if;
  v := private.check_text(submit_rating.comment, 'rating');
  if v like 'block:%' then
    perform private.raise('BANNED_TERM', substr(v, 7));
  end if;
  begin
    insert into public.ratings (chat_id, rater_id, ratee_id, thumbs_up, tags, comment, created_at)
    values (c.id, me.id, ratee, submit_rating.thumbs_up, t, nullif(btrim(submit_rating.comment), ''), private.now());
  exception when unique_violation then
    perform private.raise('INVALID', 'already_rated');
  end;
end;
$$;

-- Where the rating stands for this chat: mine, and theirs once revealed.
create or replace function public.get_my_rating(chat_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(get_my_rating.chat_id, me.id);
  mine public.ratings;
  theirs public.ratings;
begin
  select * into mine from public.ratings r where r.chat_id = c.id and r.rater_id = me.id;
  select * into theirs from public.ratings r where r.chat_id = c.id and r.ratee_id = me.id;
  return jsonb_build_object(
    'mine', case when mine.id is null then null else jsonb_build_object('thumbs_up', mine.thumbs_up, 'tags', to_jsonb(mine.tags), 'comment', mine.comment) end,
    'theirs', case when theirs.id is not null and (mine.id is not null and theirs.created_at is not null
                                                   or theirs.created_at < private.now() - interval '7 days')
                   then jsonb_build_object('thumbs_up', theirs.thumbs_up, 'tags', to_jsonb(theirs.tags), 'comment', theirs.comment) end,
    'theirs_waiting', theirs.id is not null and mine.id is null);
end;
$$;

-- ---------------------------------------------------------------------------
-- deal_checks (*/15): confirmed meetups that started 2 h ago get "Did it sell?".
create or replace function private.deal_checks()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  n int := 0;
begin
  for m in
    update public.meetups x set deal_check_sent_at = private.now()
     where x.status = 'confirmed' and x.deal_check_sent_at is null and x.starts_at <= private.now() - interval '2 hours'
    returning x.id, x.chat_id
  loop
    n := n + 1;
    perform private.queue_notification(c.seller_id, 'deal_check', 'meetups', 'Did it sell?',
      'Did the ' || c.listing_title || ' sell?', jsonb_build_object('chat_id', c.id), false, 'deal_check:' || c.id)
    from public.chats c where c.id = m.chat_id and c.seller_id is not null;
    perform private.queue_notification(c.buyer_id, 'deal_check', 'meetups', 'How did it go?',
      'Did you get the ' || c.listing_title || '?', jsonb_build_object('chat_id', c.id), false, 'deal_check:' || c.id)
    from public.chats c where c.id = m.chat_id and c.buyer_id is not null;
  end loop;
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('deal_checks', '*/15 * * * *', 'select private.deal_checks()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion (T-INT-DEL-02): before the profile goes, its open chats get
-- a system message and close read-only; the FKs then set the person to null
-- and the other side sees "Deleted user" with the listing snapshot intact.
create or replace function private.profile_deleting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  for c in select x.id from public.chats x where old.id in (x.buyer_id, x.seller_id) and x.status <> 'closed' loop
    insert into public.messages (chat_id, sender_id, kind, body, created_at)
    values (c.id, null, 'system', 'This account was deleted. The chat is closed.', private.now());
    update public.chats set status = 'closed', closed_at = private.now() where id = c.id;
    update public.meetups set status = 'cancelled', cancel_reason = 'account deleted'
     where chat_id = c.id and status in ('proposed', 'confirmed');
  end loop;
  update public.offers set status = 'withdrawn', responded_at = private.now()
   where buyer_id = old.id and status in ('pending', 'countered');
  return old;
end;
$$;

drop trigger if exists trg_profiles_deleting on public.profiles;
create trigger trg_profiles_deleting before delete on public.profiles
for each row execute function private.profile_deleting();

-- ---------------------------------------------------------------------------
revoke all on function private.deal_checks() from public, anon, authenticated;
revoke all on function private.profile_deleting() from public, anon, authenticated;

revoke all on function public.confirm_deal(uuid, text) from public, anon;
revoke all on function public.submit_rating(uuid, bool, text[], text) from public, anon;
revoke all on function public.get_my_rating(uuid) from public, anon;
grant execute on function public.confirm_deal(uuid, text) to authenticated;
grant execute on function public.submit_rating(uuid, bool, text[], text) to authenticated;
grant execute on function public.get_my_rating(uuid) to authenticated;
