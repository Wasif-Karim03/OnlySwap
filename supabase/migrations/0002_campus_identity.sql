-- 0002_campus_identity.sql (P3-DB-02, DATA_MODEL §2.1)
-- Campuses, school domains, profiles and account-level support tables.
-- RLS is enabled on every table with no policies yet (deny all); the policies
-- and grants from DATA_MODEL §3 arrive in 0008_rls_grants.sql.

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null, short_name text not null,
  timezone text not null default 'America/New_York',
  status campus_status not null default 'waitlist',
  unlock_threshold int not null default 500,
  unlocked_at timestamptz,
  founding_seller_limit int not null default 50,
  offers_per_hour int not null default 10,
  noshow_pause_threshold int not null default 2,
  reverify_months int not null default 12,
  quad_enabled bool not null default false,          -- R1.1; needs >=300 active users (SEC-13)
  is_demo bool not null default false,
  created_at timestamptz not null default now()
);

create table public.campus_domains (
  domain text primary key check (domain = lower(domain)),
  campus_id uuid not null references public.campuses on delete cascade,
  kind text not null check (kind in ('student','blocked')),   -- aliases = extra 'student' rows (PM-03)
  created_at timestamptz not null default now()
);
create index on public.campus_domains (campus_id);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  campus_id uuid not null references public.campuses,
  email_hash text not null,
  status user_status not null default 'active',
  status_reason text, paused_until timestamptz,
  first_name text check (char_length(first_name) between 1 and 30),
  last_initial char(1),
  display_name text generated always as (first_name || coalesce(' ' || last_initial || '.', '')) stored,
  year class_year, areas text[] not null default '{}',
  bio text check (char_length(bio) <= 80),
  avatar_path text,
  verified_until date not null,
  adult_confirmed_at timestamptz, age_method age_method,
  rules_accepted_at timestamptz, rules_version text,
  invite_code text unique not null default private.new_invite_code(),
  invited_by uuid references public.profiles on delete set null,
  founding_seller_until timestamptz,
  theme_mode text not null default 'system' check (theme_mode in ('system','light','dark')),
  analytics_opt_in bool not null default true,
  crash_reports_opt_in bool not null default true,
  noshow_count int not null default 0,
  strike_count int not null default 0,
  seen_unlock_at timestamptz, last_active_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.profiles (campus_id, status);
create index on public.profiles (campus_id, created_at);
create index on public.profiles (verified_until);
create index on public.profiles (invited_by);

create table public.review_accounts (email text primary key, note text);
create table public.age_blocks (email_hash text primary key, created_at timestamptz default now());
create table public.banned_hashes (email_hash text primary key, created_at timestamptz default now());
create table public.waitlist_requests (
  id uuid primary key default gen_random_uuid(),
  email_hash text unique not null, email_enc bytea not null,   -- pgp_sym_encrypt, key in Vault
  domain text not null, school_guess text,
  created_at timestamptz default now(), notified_at timestamptz
);
create table public.admins (
  user_id uuid primary key references public.profiles on delete cascade,
  role admin_role not null, campus_id uuid references public.campuses,   -- null = all
  invited_by uuid, created_at timestamptz default now()
);
create table public.app_config (key text primary key, value jsonb not null, updated_at timestamptz default now());
create table public.activity_days (user_id uuid, day date, primary key (user_id, day));
create table public.common_first_names (name text primary key);                -- R1.1 Quad

alter table public.campuses           enable row level security;
alter table public.campus_domains     enable row level security;
alter table public.profiles           enable row level security;
alter table public.review_accounts    enable row level security;
alter table public.age_blocks         enable row level security;
alter table public.banned_hashes      enable row level security;
alter table public.waitlist_requests  enable row level security;
alter table public.admins             enable row level security;
alter table public.app_config         enable row level security;
alter table public.activity_days      enable row level security;
alter table public.common_first_names enable row level security;

revoke all on all tables in schema public from anon, authenticated;
