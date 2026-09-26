-- 0004_deals.sql (P3-DB-04, DATA_MODEL §2.3)
-- Offers, chats, messages, meetup spots, meetups, no-shows, ratings, blocks.
-- Deal data is never hard-deleted: FKs into deals are `set null` and chats
-- keep a listing snapshot (BE-01). RLS on, no policies until 0008.

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings on delete set null,          -- BE-01
  buyer_id uuid references public.profiles on delete set null,
  seller_id uuid references public.profiles on delete set null,
  amount_cents int not null check (amount_cents between 0 and 200000),
  note text check (char_length(note) <= 140), quick_notes text[] not null default '{}',
  status offer_status not null default 'pending',
  round smallint not null default 1 check (round between 1 and 4),
  last_actor text not null default 'buyer' check (last_actor in ('buyer','seller')),
  decline_reason text,
  expires_at timestamptz not null default now() + interval '48 hours',
  responded_at timestamptz, created_at timestamptz not null default now()
);
create unique index offers_one_open on public.offers (listing_id, buyer_id) where status in ('pending','countered');
create index on public.offers (seller_id, status);
create index on public.offers (buyer_id, status);
create index on public.offers (expires_at) where status in ('pending','countered');

-- listings.hold_offer_id points at the accepted offer (DATA_MODEL §4.1 invariant).
alter table public.listings
  add constraint listings_hold_offer_id_fkey
  foreign key (hold_offer_id) references public.offers on delete set null;

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings on delete set null,
  offer_id uuid unique references public.offers on delete set null,
  buyer_id uuid references public.profiles on delete set null,
  seller_id uuid references public.profiles on delete set null,
  listing_title text not null, listing_price_cents int not null, listing_thumb_path text,   -- snapshot (BE-01)
  agreed_cents int not null,
  status chat_status not null default 'open',
  last_message_at timestamptz not null default now(),
  buyer_read_at timestamptz, seller_read_at timestamptz,
  buyer_hidden bool not null default false, seller_hidden bool not null default false,
  buyer_muted bool not null default false, seller_muted bool not null default false,
  buyer_outcome text check (buyer_outcome in ('done','not_yet','fell_through')),
  seller_outcome text check (seller_outcome in ('done','not_yet','fell_through')),
  closed_at timestamptz, archived_at timestamptz, created_at timestamptz not null default now()
);
create index on public.chats (buyer_id, last_message_at desc);
create index on public.chats (seller_id, last_message_at desc);
create index on public.chats (listing_id);

create table public.messages (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.chats on delete cascade,
  sender_id uuid references public.profiles on delete set null,
  kind message_kind not null default 'text',
  body text check (char_length(body) <= 1000),
  photo_path text,                                   -- R1.1
  meta jsonb, client_id uuid,
  created_at timestamptz not null default now(),
  unique (chat_id, client_id)
);
create index on public.messages (chat_id, id desc);

create table public.safe_spots (    -- "Meetup spots" in UI copy (LEG-04)
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses on delete cascade,
  name text not null, description text, hours text,
  lat double precision not null, lng double precision not null,   -- used for Directions deep links
  designation spot_designation not null default 'public',
  designated_on date,                                               -- required when designation='police'
  is_default bool not null default false, active bool not null default true, sort smallint default 0,
  check (designation = 'public' or designated_on is not null)
);
create index on public.safe_spots (campus_id, active, sort);

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats on delete cascade,
  spot_id uuid references public.safe_spots on delete set null,
  custom_place text check (char_length(custom_place) <= 60),
  starts_at timestamptz not null,
  status meetup_status not null default 'proposed',
  proposed_by uuid references public.profiles on delete set null, confirmed_at timestamptz,
  buyer_here_at timestamptz, seller_here_at timestamptz,
  late_user uuid, late_minutes smallint check (late_minutes in (5,10,15,30)),
  cancelled_by uuid, cancel_reason text, previous_starts_at timestamptz,
  reminder_sent_at timestamptz, deal_check_sent_at timestamptz,
  share_token text unique, share_created_by uuid, share_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (spot_id is not null or custom_place is not null)
);
create unique index meetups_one_active on public.meetups (chat_id) where status in ('proposed','confirmed');   -- BE-06
create index on public.meetups (starts_at) where status = 'confirmed';

create table public.noshow_reports (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups on delete cascade,
  reporter_id uuid references public.profiles on delete set null,
  reported_id uuid references public.profiles on delete set null,
  note text check (char_length(note) <= 300),
  status text not null default 'open' check (status in ('open','confirmed','rejected')),
  created_at timestamptz not null default now(),
  unique (meetup_id, reporter_id)
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats on delete cascade,
  rater_id uuid references public.profiles on delete set null,
  ratee_id uuid references public.profiles on delete set null,
  thumbs_up bool not null, tags text[] not null default '{}',
  comment text check (char_length(comment) <= 200),
  created_at timestamptz not null default now(),
  unique (chat_id, rater_id)
);
create index on public.ratings (ratee_id);

create table public.blocks (
  blocker_id uuid references public.profiles on delete cascade,
  blocked_id uuid references public.profiles on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);
create index on public.blocks (blocked_id);

alter table public.offers         enable row level security;
alter table public.chats          enable row level security;
alter table public.messages       enable row level security;
alter table public.safe_spots     enable row level security;
alter table public.meetups        enable row level security;
alter table public.noshow_reports enable row level security;
alter table public.ratings        enable row level security;
alter table public.blocks         enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
