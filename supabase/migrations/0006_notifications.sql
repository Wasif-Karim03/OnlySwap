-- 0006_notifications.sql (P3-DB-06, DATA_MODEL §2.5)
-- In-app notifications with dedupe keys (BE-04) and push claim states,
-- preferences, push tokens and tickets, the email outbox, announcements and
-- data exports. RLS on, no policies until 0008.

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  type text not null,                              -- catalog in API.md §7
  grp text not null check (grp in ('offers','messages','meetups','alerts','selling','safety','account','campus','quad')),
  title text not null, body text not null, data jsonb not null default '{}',
  time_sensitive bool not null default false,
  dedupe_key text,                                  -- BE-04
  push_state push_state not null default 'pending', push_after timestamptz not null default now(), claimed_at timestamptz,
  read_at timestamptz, created_at timestamptz not null default now()
);
create unique index notifications_dedupe on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (push_after) where push_state = 'pending';
create index on public.notifications (claimed_at) where push_state = 'sending';   -- stuck-claim recovery
create index on public.notifications (created_at);                                 -- 60 d purge

create table public.notification_prefs (
  user_id uuid primary key references public.profiles on delete cascade,
  offers bool not null default true, messages bool not null default true, meetups bool not null default true,
  saved_search bool not null default true, price_drop bool not null default true,
  free_food bool not null default false,
  tips bool not null default false,                 -- promotional (Apple 4.5.4): stale nudges, campus news
  quad_replies bool not null default false,         -- R1.1
  message_previews bool not null default false,
  quiet_start time not null default '23:00', quiet_end time not null default '08:00'
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade,
  token text unique not null,
  platform text check (platform in ('ios','android')),
  app_version text,
  created_at timestamptz default now(), last_seen_at timestamptz default now(),
  disabled_at timestamptz
);
create index on public.push_tokens (user_id) where disabled_at is null;

create table public.push_tickets (
  id bigint generated always as identity primary key,
  token_id uuid, notification_id bigint, ticket_id text, status text, error text,
  created_at timestamptz default now(), checked_at timestamptz
);
create index on public.push_tickets (created_at) where checked_at is null;

create table public.email_outbox (
  id bigint generated always as identity primary key,
  to_email text not null,
  template text not null check (template in ('campus_open','account_paused','reverify_due','account_deleted','data_export','admin_reveal_receipt','support_request','priority_report')),
  vars jsonb not null default '{}', dedupe_key text unique,
  state text not null default 'pending' check (state in ('pending','sending','sent','failed')),
  send_after timestamptz not null default now(), claimed_at timestamptz, sent_at timestamptz, error text, attempts smallint not null default 0
);
create index on public.email_outbox (send_after) where state = 'pending';

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses,
  type text check (type in ('safety','news','update')),
  title text check (char_length(title) <= 60),
  body text check (char_length(body) <= 200),
  send_push bool, created_by uuid, created_at timestamptz default now(), sent_at timestamptz, pinned_until timestamptz
);  -- R1.1 UI; table in R1.0

create table public.data_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade,
  status text, path text, expires_at timestamptz,
  created_at timestamptz default now()
);
create index on public.data_exports (user_id);

alter table public.notifications      enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.push_tokens        enable row level security;
alter table public.push_tickets       enable row level security;
alter table public.email_outbox       enable row level security;
alter table public.announcements      enable row level security;
alter table public.data_exports       enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
