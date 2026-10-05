-- Local seed data (P3-SEED-01, DATA_MODEL §9). Runs after the migrations on
-- `supabase db reset`. LOCAL ONLY: never run against staging or production.
-- Production reference data (categories, banned words, app_config) is in
-- migration 0100.
--
-- Sign in locally with any seeded address; the code shows up in Mailpit
-- (http://127.0.0.1:54324). The reviewer account also has a local password:
-- appreview@review.onlyswap.test / local-review-only

-- Local Vault secrets: the email_hash pepper and the waitlist encryption key.
-- Staging and production set their own.
select vault.create_secret('local-dev-pepper-not-a-secret', 'email_hash_pepper')
where not exists (select 1 from vault.decrypted_secrets where name = 'email_hash_pepper');
select vault.create_secret('local-dev-waitlist-key-not-a-secret', 'waitlist_email_key')
where not exists (select 1 from vault.decrypted_secrets where name = 'waitlist_email_key');
-- Chat photo signatures (R1.1). The local media Worker (wrangler dev) uses the
-- same value as MEDIA_SIGNING_KEY; local Storage ignores the signature.
select vault.create_secret('local-dev-media-key-not-a-secret', 'media_signing_key')
where not exists (select 1 from vault.decrypted_secrets where name = 'media_signing_key');

-- Campuses: a live launch campus, the reviewer campus, and a waitlist campus.
insert into public.campuses (id, slug, name, short_name, status, timezone, is_demo, unlock_threshold) values
  ('10000000-0000-4000-8000-000000000001', 'osu',   'The Ohio State University', 'Ohio State', 'live',     'America/New_York', false, 500),
  ('10000000-0000-4000-8000-000000000002', 'demo',  'Demo University',           'Demo U',     'live',     'America/New_York', true,  500),
  ('10000000-0000-4000-8000-000000000003', 'umich', 'University of Michigan',    'Michigan',   'waitlist', 'America/Detroit',  false, 500);

insert into public.campus_domains (domain, campus_id, kind) values
  ('osu.edu',              '10000000-0000-4000-8000-000000000001', 'student'),
  ('buckeyemail.osu.edu',  '10000000-0000-4000-8000-000000000001', 'student'),
  ('alumni.osu.edu',       '10000000-0000-4000-8000-000000000001', 'blocked'),
  ('review.onlyswap.test', '10000000-0000-4000-8000-000000000002', 'student'),
  ('umich.edu',            '10000000-0000-4000-8000-000000000003', 'student');

insert into public.review_accounts (email, note) values
  ('appreview@review.onlyswap.test', 'App Store / Play reviewer (password login)'),
  ('sam@review.onlyswap.test', 'Demo University seller');

insert into public.safe_spots (campus_id, name, description, hours, lat, lng, is_default, sort) values
  ('10000000-0000-4000-8000-000000000001', 'Thompson Library lobby', 'Inside the main entrance', '7am to midnight', 39.9991, -83.0149, true, 1),
  ('10000000-0000-4000-8000-000000000001', 'Ohio Union front desk', 'By the information desk', '7am to 11pm', 39.9977, -83.0086, false, 2),
  ('10000000-0000-4000-8000-000000000001', 'RPAC entrance', 'Main doors on Annie and John Glenn', '6am to 11pm', 39.9994, -83.0183, false, 3),
  ('10000000-0000-4000-8000-000000000002', 'Demo Library lobby', 'Inside the main entrance', '8am to 10pm', 40.0000, -83.0000, true, 1),
  ('10000000-0000-4000-8000-000000000002', 'Demo Student Center', 'Next to the cafe', '8am to 10pm', 40.0010, -83.0010, false, 2);

-- Users. The on_auth_user_created trigger makes each profile; the update below
-- finishes onboarding (name, 18+ check, rules) so the app opens straight to the feed.
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       case when u.email = 'appreview@review.onlyswap.test'
            then extensions.crypt('local-review-only', extensions.gen_salt('bf')) else '' end,
       now(), '{"provider":"email","providers":["email"]}', '{}', now() - interval '30 days', now(),
       '', '', '', ''
from (values
  ('20000000-0000-4000-8000-00000000000a'::uuid, 'aisha@osu.edu'),
  ('20000000-0000-4000-8000-00000000000b'::uuid, 'ben@osu.edu'),
  ('20000000-0000-4000-8000-00000000000c'::uuid, 'cam@buckeyemail.osu.edu'),
  ('20000000-0000-4000-8000-00000000000d'::uuid, 'dana@umich.edu'),
  ('20000000-0000-4000-8000-0000000000f1'::uuid, 'appreview@review.onlyswap.test'),
  ('20000000-0000-4000-8000-0000000000f2'::uuid, 'sam@review.onlyswap.test')
) as u(id, email);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id::text like '20000000-%';

update public.profiles p set
  first_name = s.first_name, last_initial = s.last_initial, year = s.year::public.class_year,
  adult_confirmed_at = now(), age_method = 'self_declared',
  rules_accepted_at = now(),
  rules_version = (select value #>> '{}' from public.app_config where key = 'rules_version'),
  created_at = now() - interval '30 days'
from (values
  ('20000000-0000-4000-8000-00000000000a'::uuid, 'Aisha', 'K', 'junior'),
  ('20000000-0000-4000-8000-00000000000b'::uuid, 'Ben',   'O', 'sophomore'),
  ('20000000-0000-4000-8000-00000000000c'::uuid, 'Cam',   'R', 'senior'),
  ('20000000-0000-4000-8000-00000000000d'::uuid, 'Dana',  'L', 'freshman'),
  ('20000000-0000-4000-8000-0000000000f1'::uuid, 'Riley', 'A', 'other'),
  ('20000000-0000-4000-8000-0000000000f2'::uuid, 'Sam',   'D', 'grad')
) as s(id, first_name, last_initial, year)
where p.id = s.id;

-- 40 demo listings: 28 at Ohio State, 12 at Demo University. No photos yet
-- (media arrives with the R2 Worker, P5-MEDIA).
insert into public.listings
  (id, campus_id, seller_id, kind, title, description, category_id, condition, price_cents, open_to_offers,
   meet_spot_ids, expires_at, created_at, bumped_at, updated_at)
select
  ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  case when n <= 28 then '10000000-0000-4000-8000-000000000001'::uuid else '10000000-0000-4000-8000-000000000002'::uuid end,
  case when n > 28 then '20000000-0000-4000-8000-0000000000f2'::uuid
       when n % 3 = 0 then '20000000-0000-4000-8000-00000000000a'::uuid
       when n % 3 = 1 then '20000000-0000-4000-8000-00000000000b'::uuid
       else '20000000-0000-4000-8000-00000000000c'::uuid end,
  case when t.price = 0 then 'free' else 'sale' end::public.listing_kind,
  t.title, t.description, t.category_id, t.condition::public.item_condition, t.price, true,
  '{}', now() + interval '60 days',
  now() - make_interval(hours => (n * 5)::int), now() - make_interval(hours => (n * 5)::int), now() - make_interval(hours => (n * 5)::int)
from (
  select row_number() over () as n, * from (values
    ('Mini fridge, 3.2 cu ft',          'Works great, moving out. Freezer shelf included.', 1, 'good',     6000),
    ('IKEA desk lamp',                  'Warm light, bulb included.',                        9, 'like_new', 1200),
    ('Twin XL mattress topper',         'Memory foam, 3 inch. Washed cover.',               1, 'good',     2500),
    ('Calculus: Early Transcendentals', '9th edition. Some highlighting in ch. 3.',         2, 'fair',     3000),
    ('Intro to Psychology textbook',    'Clean copy, no access code.',                      2, 'good',     2000),
    ('27 inch monitor',                 '1440p, HDMI and DisplayPort. Stand included.',     31, 'good',    9000),
    ('MacBook Air charger',             '30W USB-C, original.',                              3, 'like_new', 1500),
    ('Wireless earbuds',                'Case charges fine. New tips.',                      34, 'good',   2500),
    ('Nintendo Switch games bundle',    'Three games, all cartridges tested.',               35, 'good',   5000),
    ('Winter coat, size M',             'Warm, worn one season.',                            4, 'like_new', 4000),
    ('Running shoes, size 10',          'Light wear on the soles.',                          4, 'good',     2500),
    ('Rice cooker',                     '6 cup, nonstick pot.',                              5, 'good',     1800),
    ('Pots and pans set',               'Four pieces, lids included.',                       5, 'fair',     1500),
    ('Electric kettle',                 '1.7 L, auto shutoff.',                              5, 'like_new', 1200),
    ('Road bike, 54 cm',                'Tuned last month. Lock included.',                  6, 'good',    18000),
    ('Bike helmet',                     'Size M, no crashes.',                               6, 'like_new', 2000),
    ('Acoustic guitar',                 'Beginner guitar with soft case.',                   7, 'good',     7000),
    ('Yoga mat',                        'Thick mat, easy to clean.',                         8, 'good',     1000),
    ('Dumbbell pair, 15 lb',            'Rubber coated.',                                    8, 'good',     2500),
    ('String lights',                   '10 m, warm white, USB.',                            9, 'new',       800),
    ('Poster frames, set of 3',         '18 by 24 inch, black.',                             9, 'good',     1500),
    ('Desk chair',                      'Adjustable height, mesh back.',                     1, 'good',     3500),
    ('Bookshelf, 5 tier',               'Easy to take apart for moving.',                    1, 'fair',     2000),
    ('Graphing calculator',             'TI-84 Plus, new batteries.',                        3, 'good',     4500),
    ('Moving boxes',                    'About 10 boxes, free to a good home.',              99, 'fair',       0),
    ('Laundry hamper',                  'Collapsible.',                                      1, 'good',      500),
    ('Laptop stand',                    'Aluminum, folds flat.',                             3, 'like_new', 1500),
    ('Board game: Catan',               'All pieces there.',                                 99, 'good',    2000),
    ('Microwave',                       '700W, clean inside.',                               5, 'good',     3000),
    ('Chemistry lab goggles',           'Required for CHEM 1210.',                           2, 'good',      500),
    ('Bluetooth speaker',               'Loud, 10 hour battery.',                            34, 'good',   3000),
    ('Desk organizer',                  'Bamboo, three drawers.',                            9, 'like_new',  800),
    ('Rain jacket, size S',             'Packable.',                                         4, 'good',     2000),
    ('Futon',                           'Folds into a bed. Pickup only.',                    1, 'fair',     6000),
    ('Keyboard and mouse',              'Wireless combo.',                                   3, 'good',     2000),
    ('Tennis racket',                   'Grip replaced this year.',                          8, 'good',     2500),
    ('Plant with pot',                  'Pothos, easy to keep alive.',                       9, 'good',      600),
    ('Coffee maker',                    '12 cup drip.',                                      5, 'good',     1500),
    ('Scooter',                         'Kick scooter, folds.',                              6, 'good',     4000),
    ('Free notebooks',                  'Five unused spiral notebooks.',                     99, 'new',        0)
  ) as v(title, description, category_id, condition, price)
) as t;

-- Seed data is local, so the stats views have something to show right away.
refresh materialized view public.profile_stats_mv;

-- The Quad (R1.1, DEC 76). On at both local campuses so it can be tried here,
-- and on at the reviewer campus (store review must see every feature). Bots
-- have agreed to the Quad rules; posts come from them, never the reviewer.
update public.app_config set value = 'true' where key = 'quad_enabled';
update public.campuses set quad_enabled = true
where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
update public.profiles set quad_rules_accepted_at = now() - interval '29 days'
where id in ('20000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-00000000000b',
             '20000000-0000-4000-8000-00000000000c', '20000000-0000-4000-8000-0000000000f2');

insert into public.quad_posts (campus_id, author_id, kind, body, score, created_at)
select c, a, 'text', b, s, now() - (h || ' hours')::interval
from (values
  ('10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-00000000000a'::uuid, 'Best quiet study spot that isn''t the library?', 12, 3),
  ('10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-00000000000b'::uuid, 'The line at the union coffee place is wild today', 7, 1),
  ('10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-00000000000c'::uuid, 'Anyone else hear the marching band practicing at 7am', 21, 9),
  ('10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-00000000000a'::uuid, 'Free pizza in the engineering lobby until it''s gone', 30, 2),
  ('10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-00000000000b'::uuid, 'What''s the easiest gen ed you''ve taken', 15, 20),
  ('10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-00000000000c'::uuid, 'Lost a blue water bottle near the oval, turned in anywhere?', 4, 5),
  ('10000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-0000000000f2'::uuid, 'Where do people study late on campus?', 9, 2),
  ('10000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-0000000000f2'::uuid, 'The dining hall waffles are back', 14, 6),
  ('10000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-0000000000f2'::uuid, 'Tips for a first-year moving in next week?', 6, 30)
) as v(c, a, b, s, h);

insert into public.quad_posts (id, campus_id, author_id, kind, body, score, created_at) values
  ('30000000-0000-4000-8000-00000000a001', '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-00000000000b', 'poll', 'Best dining hall?', 18, now() - interval '4 hours');
insert into public.quad_poll_options (post_id, label, idx, votes) values
  ('30000000-0000-4000-8000-00000000a001', 'Traditions', 1, 12),
  ('30000000-0000-4000-8000-00000000a001', 'Kennedy', 2, 7),
  ('30000000-0000-4000-8000-00000000a001', 'Scott', 3, 9);

insert into public.quad_replies (post_id, author_id, body, alias_no, created_at)
select q.id, r.a, r.b, r.n, now() - interval '1 hour'
from public.quad_posts q
cross join (values
  ('20000000-0000-4000-8000-00000000000b'::uuid, '4th floor of the union, nobody knows about it', 1::smallint),
  ('20000000-0000-4000-8000-00000000000c'::uuid, 'Science library basement', 2::smallint),
  ('20000000-0000-4000-8000-00000000000a'::uuid, 'Thanks, trying the union tomorrow', 0::smallint)
) as r(a, b, n)
where q.body = 'Best quiet study spot that isn''t the library?';
update public.quad_posts set reply_count = 3 where body = 'Best quiet study spot that isn''t the library?';

-- Around campus (R1.1, S48): a free food post (live for 3 hours after a reset)
-- and Wanted posts at Ohio State and the reviewer campus, so the campus feed
-- and "I have this" can be tried right away.
insert into public.listings
  (id, campus_id, seller_id, kind, title, description, category_id, price_cents, wanted_max_cents,
   meet_spot_ids, meet_note, expires_at, created_at, bumped_at, updated_at)
values
  ('31000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000b',
   'food', 'Leftover pizza from club meeting', 'Cheese and pepperoni, about 10 slices.', null, 0, null,
   coalesce((select array[s.id] from public.safe_spots s where s.campus_id = '10000000-0000-4000-8000-000000000001' and s.sort = 2), '{}'),
   null, now() + interval '3 hours', now() - interval '10 minutes', now() - interval '10 minutes', now()),
  ('31000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a',
   'wanted', 'Mini fridge', 'For a dorm room, small is fine.', 1, 0, 5000,
   '{}', null, now() + interval '60 days', now() - interval '2 hours', now() - interval '2 hours', now()),
  ('31000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000c',
   'wanted', 'TI-84 calculator', 'Need it before the midterm.', 3, 0, 4000,
   '{}', null, now() + interval '60 days', now() - interval '1 day', now() - interval '1 day', now()),
  ('31000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-0000000000f2',
   'food', 'Free bagels', 'Plain and everything.', null, 0, null,
   '{}', 'Demo Student Center, by the cafe', now() + interval '3 hours', now() - interval '5 minutes', now() - interval '5 minutes', now()),
  ('31000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-0000000000f2',
   'wanted', 'Desk lamp', 'Anything that clamps to a desk.', 9, 0, 1500,
   '{}', null, now() + interval '60 days', now() - interval '3 hours', now() - interval '3 hours', now());
