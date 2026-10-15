-- Additive load-test seed: ONE new campus (loadtest.edu), ~5k users, 20k listings, 100k swipes,
-- 50k offers, 200k messages, Quad, 100k notifications. Remove with cleanup.sql.
-- Run: psql "$PGURL" -v ON_ERROR_STOP=1 -f seed-load.sql
-- Uses session_replication_role=replica ONLY for offers/messages bulk inserts (their AFTER INSERT
-- triggers call realtime.send / queue_notification per row, which makes 250k inserts impractical).
-- Derived state those triggers would set (chats.last_message_at) is set explicitly below.
\timing on
create function pg_temp.uid(n int) returns uuid language sql immutable as
  $$ select ('50000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create function pg_temp.lid(n int) returns uuid language sql immutable as
  $$ select ('60000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into public.campuses (id, slug, name, short_name, status, quad_enabled, unlocked_at)
values ('90000000-0000-4000-8000-000000000001', 'loadtest', 'Load Test University', 'LoadTest', 'live', true, now())
on conflict do nothing;
insert into public.campus_domains (domain, campus_id, kind)
values ('loadtest.edu', '90000000-0000-4000-8000-000000000001', 'student') on conflict do nothing;
insert into public.safe_spots (campus_id, name, description, hours, lat, lng, is_default, sort)
select '90000000-0000-4000-8000-000000000001', 'LT spot ' || i, 'x', '8am to 10pm', 40.0 + i / 1000.0, -83.0, i = 1, i
from generate_series(1, 4) i where not exists (select 1 from public.safe_spots where campus_id = '90000000-0000-4000-8000-000000000001');

-- Users (trigger on_auth_user_created creates profiles + notification_prefs)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', pg_temp.uid(n), 'authenticated', 'authenticated',
  'lt' || n || '@loadtest.edu', '', now(), '{"provider":"email","providers":["email"]}', '{}',
  now() - interval '30 days', now(), '', '', '', ''
from generate_series(1, 5000) n on conflict do nothing;

update public.profiles p set first_name = 'LT' || substr(p.id::text, 31), last_initial = 'T',
  year = (array['freshman','sophomore','junior','senior','grad'])[1 + (abs(hashtext(p.id::text)) % 5)]::public.class_year,
  adult_confirmed_at = now(), age_method = 'self_declared', rules_accepted_at = now(),
  rules_version = (select value #>> '{}' from public.app_config where key = 'rules_version'),
  quad_rules_accepted_at = now(), created_at = now() - interval '30 days',
  last_active_at = now() - make_interval(hours => (random() * 100)::int)
where p.campus_id = '90000000-0000-4000-8000-000000000001';

-- Listings (20k). status mix: active 55, sold 20, expired 10, deleted 7, held_review 3, hold 3, removed 2
create temp table _titles(i int, t text);
insert into _titles values (1,'Mini fridge'),(2,'Desk lamp'),(3,'Calculus textbook'),(4,'Monitor 27 inch'),(5,'Bike with lock'),
 (6,'Winter jacket'),(7,'Rice cooker'),(8,'Guitar acoustic'),(9,'Yoga mat'),(10,'Laptop stand'),(11,'Couch cushion'),(12,'Headphones');
insert into public.listings (id, campus_id, seller_id, kind, status, title, description, category_id, condition,
  price_cents, open_to_offers, expires_at, created_at, bumped_at, updated_at, sold_at, deleted_at)
select pg_temp.lid(n), '90000000-0000-4000-8000-000000000001', pg_temp.uid(1 + (abs(hashtext('s' || n)) % 5000)),
  case when r < 0.80 then 'sale' when r < 0.92 then 'free' else 'wanted' end::public.listing_kind,
  st::public.listing_status,
  t.t || ' ' || n, 'Condition notes for ' || t.t || ' number ' || n || '. Pickup near the library.',
  (array[1,2,3,4,5,6,7,8,9,31,32,33,34,35,99])[1 + (abs(hashtext('c' || n)) % 15)]::smallint,
  (array['new','like_new','good','fair'])[1 + (abs(hashtext('d' || n)) % 4)]::public.item_condition,
  case when r >= 0.80 and r < 0.92 then 0 else 500 * (1 + (abs(hashtext('p' || n)) % 100)) end,
  true, now() + interval '30 days', ts, ts, ts,
  case when st = 'sold' then ts + interval '3 days' end, case when st = 'deleted' then ts + interval '1 day' end
from (select n, random() r, now() - make_interval(secs => random() * 60 * 86400) ts,
        case when x < 0.55 then 'active' when x < 0.75 then 'sold' when x < 0.85 then 'expired' when x < 0.92 then 'deleted'
             when x < 0.95 then 'held_review' when x < 0.98 then 'hold' else 'removed' end st
      from (select n, random() x from generate_series(1, 20000) n) q) g
join _titles t on t.i = 1 + (g.n % 12)
on conflict do nothing;

insert into public.listing_photos (listing_id, idx, path, thumb_path, width, height)
select l.id, k, 'loadtest/' || l.id || '/' || k || '.webp', 'loadtest/' || l.id || '/' || k || '_t.webp', 1080, 1080
from public.listings l, lateral generate_series(0, (abs(hashtext(l.id::text)) % 4)) k
where l.campus_id = '90000000-0000-4000-8000-000000000001' on conflict do nothing;

-- Swipes ~100k, saves
insert into public.swipes (user_id, listing_id, dir, created_at)
select pg_temp.uid(1 + (random() * 4999)::int), pg_temp.lid(1 + (random() * 19999)::int),
  (case when random() < 0.8 then 'left' else 'save' end)::public.swipe_dir, now() - make_interval(secs => random() * 30 * 86400)
from generate_series(1, 100500) on conflict do nothing;
insert into public.saves (user_id, listing_id, price_at_save, created_at)
select pg_temp.uid(1 + (random() * 4999)::int), pg_temp.lid(1 + (random() * 19999)::int), 1000, now() - make_interval(secs => random() * 30 * 86400)
from generate_series(1, 20000) on conflict do nothing;

-- Offers ~50k (replica role: skip realtime/notification trigger)
set session_replication_role = replica;
insert into public.offers (id, listing_id, buyer_id, seller_id, amount_cents, note, status, round, last_actor, expires_at, created_at)
select md5('o' || g.n)::uuid, l.id, pg_temp.uid(g.bu), l.seller_id, greatest(100, l.price_cents - (g.n % 5) * 100),
  'Can do pickup today', g.st::public.offer_status, 1, 'buyer',
  case when g.st in ('pending','countered') then now() + interval '2 days' else now() - interval '1 day' end,
  l.created_at + interval '1 hour' * (g.n % 48)
from (select n, 1 + (random() * 19999)::int li, 1 + (random() * 4999)::int bu,
        case when x < .2 then 'pending' when x < .45 then 'accepted' when x < .65 then 'declined' when x < .75 then 'withdrawn'
             when x < .90 then 'expired' else 'countered' end st
      from (select n, random() x from generate_series(1, 56000) n) q) g
join public.listings l on l.id = pg_temp.lid(g.li) and l.seller_id <> pg_temp.uid(g.bu) and l.kind = 'sale'
on conflict do nothing;

insert into public.chats (id, listing_id, offer_id, buyer_id, seller_id, listing_title, listing_price_cents, agreed_cents, status, last_message_at, created_at)
select md5('c' || o.id)::uuid, o.listing_id, o.id, o.buyer_id, o.seller_id, l.title, l.price_cents, o.amount_cents, 'open', o.created_at, o.created_at
from public.offers o join public.listings l on l.id = o.listing_id
where o.status = 'accepted' and l.campus_id = '90000000-0000-4000-8000-000000000001' on conflict do nothing;

create temp table _chats as
  select row_number() over (order by id) rn, id, buyer_id, seller_id, created_at from public.chats where seller_id in (select id from public.profiles where campus_id = '90000000-0000-4000-8000-000000000001');
insert into public.messages (chat_id, sender_id, kind, body, client_id, created_at)
select c.id, case when m.n % 2 = 0 then c.buyer_id else c.seller_id end, 'text',
  'msg ' || m.n || ' ok see you at the library at 5', gen_random_uuid(),
  c.created_at + make_interval(secs => random() * 4 * 86400)
from (select n, 1 + floor((select count(*) from _chats) * power(random(), 1.5))::int rn from generate_series(1, 200000) n) m
join _chats c on c.rn = m.rn
order by 6;
update public.chats c set last_message_at = x.mx
from (select chat_id, max(created_at) mx from public.messages group by 1) x where x.chat_id = c.id
  and c.id in (select id from _chats);
reset session_replication_role;

-- Quad
insert into public.quad_posts (id, campus_id, author_id, kind, body, place, score, reply_count, status, created_at)
select md5('q' || n)::uuid, '90000000-0000-4000-8000-000000000001', pg_temp.uid(1 + (abs(hashtext('qa' || n)) % 5000)),
  'text', 'Anyone going to the game tonight? post ' || n, 'Library', 0, 0, 'live', now() - make_interval(secs => random() * 14 * 86400)
from generate_series(1, 3000) n on conflict do nothing;
insert into public.quad_replies (id, post_id, author_id, body, alias_no, score, status, created_at)
select md5('r' || n)::uuid, md5('q' || (1 + (abs(hashtext('rp' || n)) % 3000)))::uuid, pg_temp.uid(1 + (abs(hashtext('ra' || n)) % 5000)),
  'reply ' || n, 1 + (n % 20), 0, 'live', now() - make_interval(secs => random() * 14 * 86400)
from generate_series(1, 15000) n on conflict do nothing;
insert into public.quad_votes (user_id, target_type, target_id, value, created_at)
select pg_temp.uid(1 + (random() * 4999)::int), 'post', md5('q' || (1 + (random() * 2999)::int))::uuid, (case when random() < .8 then 1 else -1 end)::smallint, now()
from generate_series(1, 40000) on conflict do nothing;
update public.quad_posts p set reply_count = x.c from (select post_id, count(*) c from public.quad_replies group by 1) x where x.post_id = p.id and p.campus_id = '90000000-0000-4000-8000-000000000001';
update public.quad_posts p set score = x.s from (select target_id, sum(value) s from public.quad_votes where target_type = 'post' group by 1) x where x.target_id = p.id and p.campus_id = '90000000-0000-4000-8000-000000000001';

-- Notifications 100k
insert into public.notifications (user_id, type, grp, title, body, data, push_state, read_at, created_at)
select pg_temp.uid(1 + (abs(hashtext('n' || n)) % 5000)), (array['message_new','offer_new','offer_accepted'])[1 + n % 3],
  (array['messages','offers','offers'])[1 + n % 3], 'Title ' || n, 'Body text for notification ' || n, '{}', 'sent',
  case when random() < .7 then now() else null end, now() - make_interval(secs => random() * 30 * 86400)
from generate_series(1, 100000) n;

reset session_replication_role;
analyze;
select 'users', count(*) from public.profiles where campus_id = '90000000-0000-4000-8000-000000000001'
union all select 'listings', count(*) from public.listings where campus_id = '90000000-0000-4000-8000-000000000001'
union all select 'photos', count(*) from public.listing_photos where path like 'loadtest/%'
union all select 'swipes', count(*) from public.swipes where user_id::text like '50000000-%'
union all select 'offers', count(*) from public.offers where seller_id::text like '50000000-%'
union all select 'chats', count(*) from public.chats where seller_id::text like '50000000-%'
union all select 'messages', count(*) from public.messages where chat_id in (select id from public.chats where seller_id::text like '50000000-%')
union all select 'quad_posts', count(*) from public.quad_posts where campus_id = '90000000-0000-4000-8000-000000000001'
union all select 'notifications', count(*) from public.notifications where user_id::text like '50000000-%';
