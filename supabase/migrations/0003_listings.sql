-- 0003_listings.sql (P3-DB-03, DATA_MODEL §2.2)
-- Listings with soft delete, wanted_ref (PM-05) and id reservations (BE-05).
-- RLS on, no policies until 0008 (deny all).

create table public.categories (
  id smallint primary key,
  slug text unique,
  name text,
  parent_id smallint references public.categories,
  sort smallint
);

create table public.listings (
  id uuid primary key,                                   -- from reserve_listing_id (BE-05)
  campus_id uuid not null references public.campuses,
  seller_id uuid references public.profiles on delete cascade,  -- account deletion removes listing rows; chats keep snapshots
  kind listing_kind not null default 'sale',
  status listing_status not null default 'active',
  title text not null check (char_length(title) between 3 and 80),
  description text check (char_length(description) <= 1000),
  category_id smallint references public.categories,
  condition item_condition,
  price_cents int not null default 0 check (price_cents between 0 and 200000),
  open_to_offers bool not null default true,
  meet_spot_ids uuid[] not null default '{}',
  meet_note text check (char_length(meet_note) <= 60),
  availability text[] not null default '{}',
  wanted_max_cents int check (wanted_max_cents between 0 and 200000),
  wanted_ref uuid references public.listings on delete set null,        -- PM-05
  share_image_path text,
  view_count int not null default 0, save_count int not null default 0, offer_count int not null default 0,
  hold_offer_id uuid,
  buyer_id uuid references public.profiles on delete set null,
  sold_at timestamptz, sold_in_app bool,
  expires_at timestamptz,                                 -- food: <= 3 h; others: 60 d
  bumped_at timestamptz not null default now(),
  deleted_at timestamptz,
  search tsvector generated always as (
    setweight(to_tsvector('english', private.unaccent_immutable(title)),'A') ||
    setweight(to_tsvector('english', private.unaccent_immutable(coalesce(description,''))),'B')) stored,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.listings using gin (search);
create index on public.listings using gin (title extensions.gin_trgm_ops);
create index on public.listings (campus_id, status, bumped_at desc);
create index on public.listings (seller_id, status);
create index on public.listings (campus_id, kind, status, created_at desc);
create index on public.listings (expires_at) where status = 'active';
create index on public.listings (wanted_ref) where wanted_ref is not null;
create index on public.listings (buyer_id) where buyer_id is not null;

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings on delete cascade,
  idx smallint not null check (idx between 0 and 7),
  path text not null, thumb_path text not null, width int, height int, blurhash text,
  unique (listing_id, idx)
);

create table public.listing_reservations (
  id uuid primary key,
  user_id uuid not null,
  created_at timestamptz default now(),
  used_at timestamptz
);
create index on public.listing_reservations (created_at);   -- 24 h purge

create table public.listing_price_changes (
  id bigint generated always as identity primary key,
  listing_id uuid references public.listings on delete cascade,
  old_cents int, new_cents int,
  changed_at timestamptz default now()
);
create index on public.listing_price_changes (listing_id);

create table public.swipes (
  user_id uuid references public.profiles on delete cascade,
  listing_id uuid references public.listings on delete cascade,
  dir swipe_dir not null,
  created_at timestamptz default now(),
  primary key (user_id, listing_id)
);
create index on public.swipes (listing_id);

create table public.saves (
  user_id uuid references public.profiles on delete cascade,
  listing_id uuid references public.listings on delete cascade,
  price_at_save int,
  created_at timestamptz default now(),
  primary key (user_id, listing_id)
);
create index on public.saves (listing_id);

create table public.watches (
  user_id uuid references public.profiles on delete cascade,
  listing_id uuid references public.listings on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, listing_id)
);
create index on public.watches (listing_id);

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade, campus_id uuid not null,
  query text check (char_length(query) <= 80),
  filters jsonb not null default '{}',   -- keys: category_ids int[], min_cents, max_cents, condition, free_only
  alerts bool not null default true,
  last_seen_at timestamptz default now(), last_notified_at timestamptz, created_at timestamptz default now()
);
create index on public.saved_searches (user_id);

alter table public.categories            enable row level security;
alter table public.listings              enable row level security;
alter table public.listing_photos        enable row level security;
alter table public.listing_reservations  enable row level security;
alter table public.listing_price_changes enable row level security;
alter table public.swipes                enable row level security;
alter table public.saves                 enable row level security;
alter table public.watches               enable row level security;
alter table public.saved_searches        enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
