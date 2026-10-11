-- Ohio Wesleyan MOCK data and the mock seller bot (DEC 92). STAGING ONLY.
-- Never put this in supabase/migrations: production must never get it.
-- Apply:  bash scripts/deploy/mock-data.command owu
-- Remove: bash scripts/deploy/mock-data.command owu --remove   (owu-mock-remove.sql)
-- Safe to run again. A re-run refreshes the two free food posts (they expire
-- after a few hours) and reactivates mock users a previous remove kept.
--
-- Everything here is identifiable by a fixed uuid prefix:
--   mock users     b0000000-0000-4000-8000-0000000000NN  (emails on mock.onlyswap.test)
--   mock listings  b1000000-0000-4000-8000-0000000000NN
--   photos         R2 keys c/mock/l/<name>_full.webp and _thumb.webp (public via the media Worker)
--   bot            schema mock (mock.tick) + pg_cron job mock_bot, every minute

do $$
begin
  if current_setting('app.env', true) = 'prod' then
    raise exception 'mock data must never run on production';
  end if;
  if not exists (select 1 from public.campuses where slug = 'owu') then
    raise exception 'campus owu is missing: run scripts/deploy/add-campus.command owu first';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. A test domain on the OWU campus. Never a real @owu.edu address: those
--    could belong to real people. Nobody can receive mail here.
insert into public.campus_domains (domain, campus_id, kind)
select 'mock.onlyswap.test', c.id, 'student' from public.campuses c where c.slug = 'owu'
on conflict (domain) do update set campus_id = excluded.campus_id, kind = 'student';

-- ---------------------------------------------------------------------------
-- 2. Mock users, the same way supabase/seed.sql makes them: auth.users +
--    auth.identities; the on_auth_user_created trigger (0010) makes the
--    profile on the campus of the email domain (active, the campus is live).
--    01 to 04 sell, 05 and 06 are the mock buyers (they also post Wanted).
insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), '{"provider":"email","providers":["email"]}', '{}', now() - make_interval(days => u.age_d), now(),
       '', '', '', ''
from (values
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'maya@mock.onlyswap.test',   75),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'jordan@mock.onlyswap.test', 60),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'priya@mock.onlyswap.test',  90),
  ('b0000000-0000-4000-8000-000000000004'::uuid, 'eli@mock.onlyswap.test',    45),
  ('b0000000-0000-4000-8000-000000000005'::uuid, 'theo@mock.onlyswap.test',   50),
  ('b0000000-0000-4000-8000-000000000006'::uuid, 'nora@mock.onlyswap.test',   40)
) as u(id, email, age_d)
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id::text like 'b0000000-%'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- Onboarding finished (name, 18+ check, current rules), older accounts so the
-- new-account limits never apply. Also undoes a previous remove that kept them.
update public.profiles p set
  first_name = s.first_name, last_initial = s.last_initial, year = s.year::public.class_year, bio = s.bio,
  status = 'active', status_reason = null,
  adult_confirmed_at = coalesce(p.adult_confirmed_at, now()), age_method = 'self_declared',
  rules_accepted_at = now(),
  rules_version = (select value #>> '{}' from public.app_config where key = 'rules_version'),
  verified_until = greatest(p.verified_until, current_date + 300),
  created_at = now() - make_interval(days => s.age_d)
from (values
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'Maya',   'R', 'junior',    'Econ major. Clearing out my room before I move off campus.', 75),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'Jordan', 'T', 'sophomore', 'Bikes, tech and whatever else I do not need anymore.',      60),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'Priya',  'S', 'senior',    'Graduating in May, everything must go.',                    90),
  ('b0000000-0000-4000-8000-000000000004'::uuid, 'Eli',    'W', 'freshman',  'Usually around the library in the afternoons.',             45),
  ('b0000000-0000-4000-8000-000000000005'::uuid, 'Theo',   'M', 'junior',    'Always looking for dorm stuff.',                            50),
  ('b0000000-0000-4000-8000-000000000006'::uuid, 'Nora',   'B', 'sophomore', 'Bio major, bikes everywhere.',                              40)
) as s(id, first_name, last_initial, year, bio, age_d)
where p.id = s.id;

-- ---------------------------------------------------------------------------
-- 3. Listings. Inserted directly (like seed.sql) so created_at can be spread
--    over the last few days; get_feed shows them to anyone else on the campus
--    (active, sale/free, not expired, not swiped in the last 30 days, not blocked).
--    Prices in cents. The meetup spot is the campus's first active spot.
insert into public.listings
  (id, campus_id, seller_id, kind, status, title, description, category_id, condition, price_cents,
   open_to_offers, meet_spot_ids, meet_note, availability, view_count,
   expires_at, created_at, bumped_at, updated_at)
select v.id::uuid, c.id, v.seller::uuid, v.kind::public.listing_kind, 'active', v.title, v.descr,
       v.cat::smallint, v.cond::public.item_condition, v.price, v.offers,
       case when v.spot then coalesce((select array[s.id] from public.safe_spots s
                                       where s.campus_id = c.id and s.active
                                       order by s.is_default desc, s.sort limit 1), '{}')
            else '{}' end,
       v.note, v.avail::text[], v.views,
       now() - make_interval(mins => v.age_m) + interval '1440 hours',
       now() - make_interval(mins => v.age_m), now() - make_interval(mins => v.age_m), now()
from public.campuses c
cross join (values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'sale', 'Yamaha acoustic guitar',
   'Full size acoustic, plays well and stays in tune. Comes with a capo and a few picks. Selling because I never practice.',
   7, 'good', 9000, true, true, null, '{afternoons,evenings}', 41, 4300),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'sale', 'Floral backpack',
   'Lots of pockets and fits a 13 inch laptop. Used for one semester, no rips.',
   4, 'like_new', 1500, true, true, null, '{weekdays}', 18, 3900),
  ('b1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'sale', 'Bonsai tree',
   'Juniper bonsai, about 3 years old. Needs water twice a week and a sunny window. Pot included.',
   9, 'good', 2000, true, true, null, '{weekends}', 27, 1500),
  ('b1000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'sale', 'Yoga mat, teal',
   '6 mm thick and non slip. Cleaned and rolled up. Strap not included.',
   8, 'like_new', 800, true, true, null, '{mornings,weekends}', 9, 600),
  ('b1000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'sale', 'Coffee maker, 12 cup',
   'Drip coffee maker with a glass carafe. Works great, I just switched to a French press.',
   5, 'good', 1500, true, true, null, '{afternoons}', 33, 5200),
  ('b1000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'sale', 'Desk lamp',
   'Adjustable arm, LED bulb included. Bright enough for late night reading.',
   1, 'like_new', 1000, true, true, null, '{weekdays,evenings}', 6, 260),
  ('b1000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000002', 'sale', 'Red cruiser bike',
   'Single speed cruiser, new tires this fall. Great for getting to class or downtown Delaware. Lock not included.',
   6, 'good', 12000, true, true, null, '{afternoons,weekends}', 64, 5600),
  ('b1000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000002', 'sale', 'Penny board',
   '22 inch cruiser board, smooth wheels. A few scuffs on the deck.',
   6, 'good', 2500, true, true, null, '{afternoons}', 22, 2400),
  ('b1000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000002', 'sale', 'Two 24 inch monitors',
   '1080p, HDMI cables included. Selling them as a pair, perfect for a dual screen setup.',
   31, 'good', 11000, true, true, null, '{weekdays,evenings}', 48, 1100),
  ('b1000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000002', 'sale', 'MacBook Air 13 inch',
   '2020 model, 8 GB RAM, 256 GB. Battery is fine, small dent on one corner. Charger included, wiped and ready.',
   32, 'good', 42000, true, true, null, '{afternoons,evenings}', 87, 180),
  ('b1000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000002', 'free', 'Basketball',
   'Indoor and outdoor ball, holds air. Free, just come grab it.',
   8, 'fair', 0, true, true, null, '{}', 12, 90),
  ('b1000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000002', 'sale', 'Tennis racket',
   'Adult size with a new grip. Two balls included.',
   8, 'good', 2000, true, true, null, '{weekends}', 15, 3300),
  ('b1000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000003', 'sale', 'Web programming and history textbooks',
   'Internet and World Wide Web: How to Program plus a history reader. Some highlighting, no missing pages. Price is for both.',
   2, 'good', 3000, true, true, null, '{weekdays}', 29, 4700),
  ('b1000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000003', 'sale', 'Casio graphing calculator',
   'Works for calc and stats. New batteries. Check with your prof before using it on an exam.',
   3, 'good', 3500, true, true, null, '{weekdays,afternoons}', 38, 2000),
  ('b1000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000003', 'sale', 'Microwave',
   '700 W, clean inside. Fits on a dorm shelf.',
   5, 'good', 3000, true, true, null, '{evenings}', 44, 800),
  ('b1000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000003', 'sale', 'Rice cooker',
   '3 cup rice cooker with a steamer tray. Only used a few times.',
   5, 'like_new', 1500, true, true, null, '{afternoons}', 21, 2900),
  ('b1000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000003', 'sale', 'Tea kettle',
   'Stovetop kettle, whistles when it boils. Works on electric or gas.',
   5, 'good', 1000, false, true, null, '{weekends}', 8, 3600),
  ('b1000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000003', 'free', 'Toaster',
   'Two slice toaster, works fine. Free to whoever picks it up first.',
   5, 'good', 0, true, true, null, '{}', 19, 450),
  ('b1000000-0000-4000-8000-000000000019', 'b0000000-0000-4000-8000-000000000004', 'sale', 'Yashica twin lens film camera',
   'Medium format camera, the shutter works at every speed. Great for a photo class.',
   3, 'good', 8500, true, true, null, '{afternoons}', 52, 1300),
  ('b1000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-000000000004', 'sale', 'Koss on ear headphones',
   'Light and comfy with a 3.5 mm plug. Both sides work.',
   34, 'good', 2000, true, true, null, '{weekdays}', 24, 5000),
  ('b1000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000004', 'sale', 'Bluetooth speaker',
   'Loud for its size, about 8 hours of battery. USB charging cable included.',
   34, 'good', 1800, true, true, null, '{evenings}', 31, 2100),
  ('b1000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000004', 'sale', 'New Balance sneakers, size 10',
   'Worn but comfy. Good for the gym or walking around campus.',
   4, 'fair', 1500, true, true, null, '{afternoons}', 14, 4100),
  ('b1000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-000000000004', 'sale', 'L shaped desk',
   'Room for two monitors. Comes apart with an Allen key. Bring a car or a friend.',
   1, 'good', 4000, true, false, 'Pickup only, I can help carry it', '{weekends}', 36, 1700),
  ('b1000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000004', 'sale', 'Floor fan',
   'Metal floor fan with three speeds. Saved me in the August heat.',
   1, 'like_new', 1500, true, true, null, '{weekdays,weekends}', 17, 950)
) as v(id, seller, kind, title, descr, cat, cond, price, offers, spot, note, avail, views, age_m)
where c.slug = 'owu'
on conflict (id) do nothing;

-- Around campus: two free food posts (they expire, so every run makes them
-- fresh again) and two Wanted posts from the mock buyers.
insert into public.listings
  (id, campus_id, seller_id, kind, status, title, description, category_id, price_cents, wanted_max_cents,
   meet_spot_ids, meet_note, expires_at, created_at, bumped_at, updated_at)
select v.id::uuid, c.id, v.seller::uuid, v.kind::public.listing_kind, 'active', v.title, v.descr,
       v.cat::smallint, 0, v.max_cents,
       case when v.spot then coalesce((select array[s.id] from public.safe_spots s
                                       where s.campus_id = c.id and s.active
                                       order by s.is_default desc, s.sort limit 1), '{}')
            else '{}' end,
       v.note, now() + make_interval(mins => v.ttl_m),
       now() - make_interval(mins => v.age_m), now() - make_interval(mins => v.age_m), now()
from public.campuses c
cross join (values
  ('b1000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000003', 'food', 'Leftover pizza from club meeting',
   'Cheese and veggie, about 10 slices. Come grab some.', null, null, true, null, 180, 15),
  ('b1000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000002', 'food', 'Free bagels',
   'Extra bagels from a club breakfast. Plain and everything, cream cheese too.', null, null, false,
   'Beeghly Library front steps', 120, 25),
  ('b1000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000005', 'wanted', 'Mini fridge',
   'For my dorm room. Small is fine, it just needs to keep drinks cold.', 1, 6000, false, null, 86400, 300),
  ('b1000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000006', 'wanted', 'Bike lock',
   'U lock or a heavy cable lock. Need it before fall break.', 6, 2000, false, null, 86400, 1400)
) as v(id, seller, kind, title, descr, cat, max_cents, spot, note, ttl_m, age_m)
where c.slug = 'owu'
on conflict (id) do update
  set expires_at = excluded.expires_at, created_at = excluded.created_at,
      bumped_at = excluded.bumped_at, updated_at = now(), status = 'active'
  where public.listings.kind = 'food' and public.listings.status in ('active', 'expired');

-- One photo per listing (full 900 px max, thumb 400 px, WebP like the app's
-- pipeline). Files: supabase/campuses/mock-photos, uploaded to R2 by the command.
insert into public.listing_photos (listing_id, idx, path, thumb_path, width, height, blurhash)
select v.id::uuid, 0, 'c/mock/l/' || v.photo || '_full.webp', 'c/mock/l/' || v.photo || '_thumb.webp', v.w, v.w, v.bh
from (values
  ('b1000000-0000-4000-8000-000000000001', 'acoustic-guitar', 400, 'LRKA]3_2R*oJ~qofR*oL_NrrR+t7'),
  ('b1000000-0000-4000-8000-000000000002', 'backpack',        400, 'LWBrA#IUQlVsDgngobOtVpX9W?xW'),
  ('b1000000-0000-4000-8000-000000000003', 'bonsai',          683, 'LVKe4LNF~XxuyWWAIVj[~Dof%2j]'),
  ('b1000000-0000-4000-8000-000000000004', 'yoga-mat',        683, 'LoP@trbbxGt7=yjZR+so}ts:j[R*'),
  ('b1000000-0000-4000-8000-000000000005', 'coffee-maker',    400, 'LJEVBC$L%KtRH;XSi^rqW?IoXTkD'),
  ('b1000000-0000-4000-8000-000000000006', 'desk-lamp',       400, 'L9P~~O?c%3-=~qRQR*t6xts;RjNF'),
  ('b1000000-0000-4000-8000-000000000007', 'bicycle',         400, 'LACZ:#rNpG-piVtS$|xb0h%^MMo|'),
  ('b1000000-0000-4000-8000-000000000008', 'skateboard',      400, 'LWH-3.OYS#R-};NHS4a}Fy$zV[ay'),
  ('b1000000-0000-4000-8000-000000000009', 'monitor',         683, 'LKCPhdmkNIS$PB9toLX9DNtS$$jF'),
  ('b1000000-0000-4000-8000-000000000010', 'laptop',          683, 'LQGSDeyE$%VrpyyER4MxRQ%gMxRj'),
  ('b1000000-0000-4000-8000-000000000011', 'basketball',      683, 'LbOd:sS5~Uw]^js:E2WB?Gs:IWR*'),
  ('b1000000-0000-4000-8000-000000000012', 'tennis-racket',   720, 'LQEwq3oJM}oe1foJjZa}0$NIt6f7'),
  ('b1000000-0000-4000-8000-000000000013', 'textbooks',       400, 'LgF=UI=wR5Io?^xtivi_u4Szi_sS'),
  ('b1000000-0000-4000-8000-000000000014', 'calculator',      768, 'LDG*~Axb8wkq56IA-VjrMdx[xuni'),
  ('b1000000-0000-4000-8000-000000000015', 'microwave',       576, 'LVHeqMD%RkRj?Eo#a#WB~qWARjog'),
  ('b1000000-0000-4000-8000-000000000016', 'rice-cooker',     375, 'LVHn+=-;MxWB_NtRaefkM{M|ozof'),
  ('b1000000-0000-4000-8000-000000000017', 'tea-kettle',      900, 'LIH2J:X8_2WC~pjsj[f6?Ht6WBof'),
  ('b1000000-0000-4000-8000-000000000018', 'toaster',         640, 'LEPsw|$%9~tl^jxaxtt6ysW=Q,i^'),
  ('b1000000-0000-4000-8000-000000000019', 'film-camera',     400, 'L~M%~0of~qt7ofayj[j[ofayayj['),
  ('b1000000-0000-4000-8000-000000000020', 'headphones',      400, 'LTJR5CM{?aM|^+ofNGRj~WRkoe%2'),
  ('b1000000-0000-4000-8000-000000000021', 'speaker',         500, 'L$ODqRs:%Moft7M{WBof~qkBM{ay'),
  ('b1000000-0000-4000-8000-000000000022', 'sneakers',        400, 'LkLg|hD%oft7tRM{a}t7_4t7a}of'),
  ('b1000000-0000-4000-8000-000000000023', 'desk',            554, 'LVHLSTIU_3M{~pM{t5R+n2MxIUWC'),
  ('b1000000-0000-4000-8000-000000000024', 'floor-fan',       683, 'LbQcr4_3-:a{f8ofofRj~qIUM{j['),
  ('b1000000-0000-4000-8000-000000000031', 'pizza',           900, 'LEKcb401PUR$$%ROx^M{3ExBDiM|'),
  ('b1000000-0000-4000-8000-000000000032', 'bagels',          375, 'LAF=Ho}*OtW99G%2kCR+F3xt%0R.')
) as v(id, photo, w, bh)
where exists (select 1 from public.listings l where l.id = v.id::uuid)
on conflict (listing_id, idx) do update
  set path = excluded.path, thumb_path = excluded.thumb_path,
      width = excluded.width, height = excluded.height, blurhash = excluded.blurhash;

-- ---------------------------------------------------------------------------
-- 4. The mock seller bot. It plays the other side of a deal so one person can
--    test the whole flow alone. It acts as the mock user through the same RPCs
--    the app calls (accept_offer, counter_offer, make_offer, send_message,
--    confirm_meetup, propose_meetup, confirm_deal, submit_rating): mock.act sets
--    the request JWT claims for the transaction, so auth.uid() and
--    private.require_active() see the mock user exactly like a signed-in phone
--    (same pattern as private.demo_act in 0028). It only touches deals where
--    one side is a mock user and the other side is not.
create schema if not exists mock;
revoke all on schema mock from public;
revoke all on schema mock from anon, authenticated;

-- What the bot already did per chat (its guards against acting twice).
create table if not exists mock.chat_state (
  chat_id uuid primary key,
  hello_at timestamptz,
  proposed_at timestamptz,
  replied_upto bigint not null default 0,
  replies int not null default 0,
  last_reply_at timestamptz
);

-- Every action and its result; failed actions are retried at most 3 times.
create table if not exists mock.log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  ref uuid,
  ok boolean not null,
  detail text
);
create index if not exists log_ref_idx on mock.log (ref, action);
revoke all on all tables in schema mock from public, anon, authenticated;

create or replace function mock.is_mock(p uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p::text like 'b0000000-%', false)
$$;

-- A stable pseudo-random wait between lo and hi seconds for one row, so the
-- bot doesn't answer instantly and a re-run of a tick gives the same answer.
create or replace function mock.delay(p uuid, lo int, hi int)
returns interval
language sql
immutable
set search_path = ''
as $$
  select make_interval(secs => lo + mod(hashtext(p::text)::bigint + 2147483648, hi - lo + 1))
$$;

create or replace function mock.fails(p_ref uuid, p_action text default null)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from mock.log g
  where g.ref = p_ref and not g.ok and (p_action is null or g.action = p_action)
$$;

-- The next daytime slot on the campus clock: two hours ahead when that lands
-- between 9:00 and 20:00, otherwise 10:00 the next morning (as 0034 does).
create or replace function mock.slot(p_at timestamptz, tz text)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(hour from (date_trunc('hour', p_at) + interval '2 hours') at time zone coalesce(tz, 'America/New_York')) between 9 and 20
      then date_trunc('hour', p_at) + interval '2 hours'
    else ((date_trunc('day', (p_at + interval '14 hours') at time zone coalesce(tz, 'America/New_York')) + interval '10 hours')
          at time zone coalesce(tz, 'America/New_York'))
  end
$$;

-- Runs one RPC call as p_actor. Errors are caught (the sub-block rolls back)
-- and written to mock.log; returns true when the call went through.
create or replace function mock.act(p_actor uuid, p_action text, p_ref uuid, p_sql text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform set_config('request.jwt.claim.sub', p_actor::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', p_actor::text, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    execute p_sql;
  exception when others then
    insert into mock.log (actor, action, ref, ok, detail) values (p_actor, p_action, p_ref, false, left(sqlerrm, 300));
    return false;
  end;
  insert into mock.log (actor, action, ref, ok) values (p_actor, p_action, p_ref, true);
  return true;
end;
$$;

-- One bot pass (pg_cron, every minute). Returns the number of actions taken.
create or replace function mock.tick()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  owu uuid;
  tz text;
  spot uuid;
  spot_name text;
  buyers uuid[] := array['b0000000-0000-4000-8000-000000000005',
                         'b0000000-0000-4000-8000-000000000006']::uuid[];
  lines text[] := array['Sounds good.', 'That works for me.', 'Ok, see you then.',
                        'Sure, just send me a time.', 'Got it, thanks.', 'Perfect.'];
  x record;
  st mock.chat_state;
  mt public.meetups;
  n int := 0;
  amt int;
  who uuid;
  last_id bigint;
  last_at timestamptz;
  last_by uuid;
begin
  -- One pass at a time.
  if not pg_try_advisory_xact_lock(hashtext('mock.tick')) then
    return 0;
  end if;
  select c.id, c.timezone into owu, tz from public.campuses c where c.slug = 'owu';
  if owu is null then
    return 0;
  end if;
  select s.id, s.name into spot, spot_name
  from public.safe_spots s where s.campus_id = owu and s.active
  order by s.is_default desc, s.sort limit 1;

  -- a) A mock seller answers a real buyer's offer 20 to 50 s after it arrives:
  --    a first lowball (under 60% of the price) gets one counter halfway,
  --    anything else is accepted (accept_offer opens the chat).
  for x in
    select o.id, o.seller_id, o.amount_cents, o.round, l.price_cents, l.kind
    from public.offers o
    join public.listings l on l.id = o.listing_id
    where mock.is_mock(o.seller_id) and o.buyer_id is not null and not mock.is_mock(o.buyer_id)
      and o.status in ('pending', 'countered') and o.last_actor = 'buyer'
      and coalesce(o.responded_at, o.created_at) < private.now() - mock.delay(o.id, 20, 50)
      and mock.fails(o.id) < 3
    order by o.created_at
    limit 20
  loop
    amt := (round((x.amount_cents + x.price_cents) / 200.0) * 100)::int;
    if x.kind = 'sale' and x.round = 1 and x.amount_cents < x.price_cents * 0.6
       and amt <> x.amount_cents and amt between 100 and 200000 then
      if mock.act(x.seller_id, 'counter_offer', x.id,
           format('select public.counter_offer(%L::uuid, %s, %L)', x.id, amt, 'Could we meet in the middle?')) then
        n := n + 1;
      end if;
    elsif mock.act(x.seller_id, 'accept_offer', x.id, format('select public.accept_offer(%L::uuid)', x.id)) then
      n := n + 1;
    end if;
  end loop;

  -- b) A mock buyer accepts a real seller's counter 20 to 50 s later.
  for x in
    select o.id, o.buyer_id
    from public.offers o
    where mock.is_mock(o.buyer_id) and o.seller_id is not null and not mock.is_mock(o.seller_id)
      and o.status = 'countered' and o.last_actor = 'seller'
      and o.responded_at < private.now() - mock.delay(o.id, 20, 50)
      and mock.fails(o.id) < 3
    order by o.responded_at
    limit 20
  loop
    if mock.act(x.buyer_id, 'accept_offer', x.id, format('select public.accept_offer(%L::uuid)', x.id)) then
      n := n + 1;
    end if;
  end loop;

  -- c) Mock buyers: 2 to 5 min after a real person posts a sale or free item
  --    on the campus (in the last 3 days), one mock buyer offers about 85% of
  --    the price (the asking price when it's firm, 0 for free). At most one
  --    mock offer per listing, ever. "I have this" on a mock Wanted post gets
  --    the offer from that Wanted's poster, up to their max price.
  for x in
    select l.id, l.seller_id, l.kind, l.price_cents, l.open_to_offers,
           w.seller_id as wanted_by, w.wanted_max_cents
    from public.listings l
    left join public.listings w on w.id = l.wanted_ref and w.kind = 'wanted' and mock.is_mock(w.seller_id)
    where l.campus_id = owu and l.status = 'active' and l.kind in ('sale', 'free')
      and l.seller_id is not null and not mock.is_mock(l.seller_id)
      and l.created_at > private.now() - interval '3 days'
      and l.created_at < private.now() - mock.delay(l.id, 120, 300)
      and (l.expires_at is null or l.expires_at > private.now())
      and not exists (select 1 from public.offers o where o.listing_id = l.id and mock.is_mock(o.buyer_id))
      and mock.fails(l.id) < 3
    order by l.created_at
    limit 10
  loop
    who := coalesce(x.wanted_by, (
      select b from unnest(buyers) as b
      where not private.is_blocked(b, x.seller_id)
        and exists (select 1 from public.profiles p where p.id = b and p.status = 'active')
      order by mod(hashtext(b::text || x.id::text)::bigint + 2147483648, 1000)
      limit 1));
    continue when who is null;
    amt := case when x.kind = 'free' then 0
                when not x.open_to_offers then x.price_cents
                when x.wanted_by is not null then least(x.price_cents, coalesce(x.wanted_max_cents, x.price_cents))
                else (round(x.price_cents * 0.85 / 100.0) * 100)::int end;
    if x.kind = 'sale' then
      amt := least(greatest(amt, 100), 200000);
    end if;
    if mock.act(who, 'make_offer', x.id,
         format('select public.make_offer(%L::uuid, %s, %L)', x.id, amt,
           case when x.kind = 'free' then 'Hi, could I grab this? I can pick it up on campus.'
                else 'Hi, is this still available? I can meet on campus.' end)) then
      n := n + 1;
    end if;
  end loop;

  -- d) Open chats between a mock user and a real person.
  for x in
    select c.id, c.created_at, c.buyer_outcome, c.seller_outcome,
           mock.is_mock(c.seller_id) as bot_sells,
           case when mock.is_mock(c.seller_id) then c.seller_id else c.buyer_id end as bot,
           case when mock.is_mock(c.seller_id) then c.buyer_id else c.seller_id end as human
    from public.chats c
    where c.status = 'open' and c.buyer_id is not null and c.seller_id is not null
      and mock.is_mock(c.seller_id) <> mock.is_mock(c.buyer_id)
    order by c.last_message_at desc
    limit 50
  loop
    insert into mock.chat_state (chat_id) values (x.id) on conflict (chat_id) do nothing;
    select * into st from mock.chat_state s where s.chat_id = x.id;

    -- Hello, once (the client_id makes send_message idempotent too).
    if st.hello_at is null then
      if mock.act(x.bot, 'hello', x.id,
           format('select public.send_message(%L::uuid, %L, %L::uuid)', x.id,
             case when x.bot_sells
                  then 'Hey, thanks for the offer, it''s yours. I can meet at ' || coalesce(spot_name, 'the campus center')
                       || ' most afternoons. What works for you?'
                  else 'Great, thanks. I can meet at ' || coalesce(spot_name, 'the campus center')
                       || ' most afternoons. When works for you?' end,
             md5('mock-hello:' || x.id::text)::uuid))
         or mock.fails(x.id, 'hello') >= 3 then
        update mock.chat_state s
           set hello_at = private.now(),
               replied_upto = coalesce((select max(m.id) from public.messages m where m.chat_id = x.id), 0)
         where s.chat_id = x.id;
        n := n + 1;
      end if;
      select * into st from mock.chat_state s where s.chat_id = x.id;
    end if;

    -- One short reply to the person's latest message: 15 to 40 s after it,
    -- at most one reply every 2 minutes and 8 per chat. Messages sent in the
    -- cooldown get a single reply afterwards.
    last_id := null;
    select m.id, m.created_at, m.sender_id into last_id, last_at, last_by
    from public.messages m
    where m.chat_id = x.id and m.kind = 'text'
    order by m.id desc
    limit 1;
    if last_id is not null and last_by = x.human and last_id > st.replied_upto and st.replies < 8
       and last_at < private.now() - mock.delay(x.id, 15, 40)
       and (st.last_reply_at is null or st.last_reply_at < private.now() - interval '2 minutes') then
      if mock.act(x.bot, 'reply', x.id,
           format('select public.send_message(%L::uuid, %L, %L::uuid)', x.id,
             lines[1 + st.replies % array_length(lines, 1)],
             md5('mock-reply:' || x.id::text || ':' || last_id::text)::uuid)) then
        n := n + 1;
      end if;
      update mock.chat_state s
         set replied_upto = last_id, replies = s.replies + 1, last_reply_at = private.now()
       where s.chat_id = x.id;
    end if;

    -- Meetups: confirm the person's proposal 20 to 45 s later. If nobody has
    -- proposed anything 10 minutes after the chat opened, propose one (once),
    -- so confirming the other side's proposal can be tested too.
    select * into mt from public.meetups m
    where m.chat_id = x.id and m.status in ('proposed', 'confirmed')
    order by m.created_at desc
    limit 1;
    if found then
      if mt.status = 'proposed' and mt.proposed_by = x.human and mt.starts_at > private.now()
         and mt.created_at < private.now() - mock.delay(mt.id, 20, 45) and mock.fails(mt.id) < 3 then
        if mock.act(x.bot, 'confirm_meetup', mt.id, format('select public.confirm_meetup(%L::uuid)', mt.id)) then
          n := n + 1;
        end if;
      end if;
    elsif st.proposed_at is null and spot is not null
          and x.created_at < private.now() - interval '10 minutes'
          and not exists (select 1 from public.meetups m where m.chat_id = x.id) then
      if mock.act(x.bot, 'propose_meetup', x.id,
           format('select public.propose_meetup(%L::uuid, %L::timestamptz, %L::uuid)',
             x.id, mock.slot(private.now(), tz), spot)) then
        n := n + 1;
      end if;
      update mock.chat_state s set proposed_at = private.now() where s.chat_id = x.id;
    end if;

    -- "Did it sell?": when the person answers done, the mock side says done too
    -- (a mock seller's done marks the listing sold) and leaves a thumbs up.
    if (case when x.bot_sells then x.buyer_outcome else x.seller_outcome end) = 'done' then
      if (case when x.bot_sells then x.seller_outcome else x.buyer_outcome end) is null
         and mock.fails(x.id, 'confirm_deal') < 3 then
        if mock.act(x.bot, 'confirm_deal', x.id, format('select public.confirm_deal(%L::uuid, %L)', x.id, 'done')) then
          n := n + 1;
        end if;
      end if;
      if not exists (select 1 from public.ratings r where r.chat_id = x.id and r.rater_id = x.bot)
         and mock.fails(x.id, 'submit_rating') < 3 then
        if mock.act(x.bot, 'submit_rating', x.id,
             format('select public.submit_rating(%L::uuid, true, %L::text[])', x.id, '{on_time,friendly}')) then
          n := n + 1;
        end if;
      end if;
    end if;
  end loop;

  delete from mock.log g where g.at < now() - interval '7 days';
  return n;
end;
$$;

revoke all on all functions in schema mock from public, anon, authenticated;

-- Every minute, like demo_autoplay. Re-running replaces the job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'mock_bot') then
    perform cron.unschedule('mock_bot');
  end if;
  perform cron.schedule('mock_bot', '* * * * *', 'select mock.tick()');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Staging tools in the admin console (Settings > Staging tools, owner only,
--    shown only by a staging build of the console). Read only. It lives here
--    and not in a migration, so only a server with the mock data has it: on any
--    other server PostgREST answers 404 and the console says the mock data
--    isn't installed. owu-mock-remove.sql drops it. Same rules as the other
--    admin reads: owner with the two-step check (private.require_admin).
create or replace function public.admin_mock_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.admins := private.require_admin('owner');
  now_at timestamptz := now();
  bot jsonb;
begin
  select jsonb_build_object(
      'jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'last_run', (select jsonb_build_object('status', d.status, 'start_time', d.start_time, 'end_time', d.end_time,
                                             'message', left(d.return_message, 200))
                   from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc nulls last limit 1),
      'runs_24h', (select count(*)::int from cron.job_run_details d
                   where d.jobid = j.jobid and d.start_time >= now_at - interval '24 hours'),
      'failures_24h', (select count(*)::int from cron.job_run_details d
                       where d.jobid = j.jobid and d.status = 'failed' and d.start_time >= now_at - interval '24 hours'))
    into bot
  from cron.job j where j.jobname = 'mock_bot';

  return jsonb_build_object(
    'generated_at', now_at,
    'users', jsonb_build_object(
      'active', (select count(*)::int from public.profiles p where p.id::text like 'b0000000-%' and p.status = 'active'),
      'total', (select count(*)::int from public.profiles p where p.id::text like 'b0000000-%')),
    'listings', jsonb_build_object(
      'discover', (select count(*)::int from public.listings l where l.id::text like 'b1000000-%' and l.status = 'active'
                     and l.kind in ('sale', 'free')),
      'food_live', (select count(*)::int from public.listings l where l.id::text like 'b1000000-%' and l.status = 'active'
                      and l.kind = 'food' and l.expires_at > now_at),
      'wanted', (select count(*)::int from public.listings l where l.id::text like 'b1000000-%' and l.status = 'active'
                   and l.kind = 'wanted'),
      'sold', (select count(*)::int from public.listings l where l.id::text like 'b1000000-%' and l.status = 'sold'),
      'total', (select count(*)::int from public.listings l where l.id::text like 'b1000000-%')),
    'photos', (select count(*)::int from public.listing_photos ph where ph.path like 'c/mock/l/%'),
    'bot', bot,
    'actions', jsonb_build_object(
      'ok_24h', (select count(*)::int from mock.log g where g.ok and g.at >= now_at - interval '24 hours'),
      'failed_24h', (select count(*)::int from mock.log g where not g.ok and g.at >= now_at - interval '24 hours'),
      'ok_total', (select count(*)::int from mock.log g where g.ok),
      'failed_total', (select count(*)::int from mock.log g where not g.ok)),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'at', g.at, 'action', g.action, 'ok', g.ok,
          'detail', g.detail, 'ref', g.ref, 'actor', g.actor, 'actor_name', p.display_name) order by g.at desc, g.id desc)
        from (select * from mock.log x order by x.at desc, x.id desc limit 15) g
        left join public.profiles p on p.id = g.actor), '[]'::jsonb),
    'recent_failures', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'at', g.at, 'action', g.action,
          'detail', g.detail, 'ref', g.ref, 'actor', g.actor, 'actor_name', p.display_name) order by g.at desc, g.id desc)
        from (select * from mock.log x where not x.ok order by x.at desc, x.id desc limit 10) g
        left join public.profiles p on p.id = g.actor), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_mock_status() from public, anon;
grant execute on function public.admin_mock_status() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Summary
select
  (select count(*) from public.profiles p where p.id::text like 'b0000000-%' and p.status = 'active') as mock_users,
  (select count(*) from public.listings l where l.id::text like 'b1000000-%' and l.status = 'active'
     and l.kind in ('sale', 'free')) as mock_listings_in_discover,
  (select count(*) from public.listings l where l.id::text like 'b1000000-%' and l.status = 'active'
     and l.kind = 'food' and l.expires_at > now()) as live_food_posts,
  (select count(*) from public.listings l where l.id::text like 'b1000000-%' and l.status = 'active'
     and l.kind = 'wanted') as wanted_posts,
  (select count(*) from public.listing_photos ph where ph.path like 'c/mock/l/%') as photos,
  (select string_agg(j.jobname || ' ' || j.schedule || case when j.active then ' active' else ' paused' end, ', ')
     from cron.job j where j.jobname = 'mock_bot') as bot_job;
