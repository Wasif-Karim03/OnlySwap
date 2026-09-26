-- 0005_safety_ops.sql (P3-DB-06, DATA_MODEL §2.4)
-- Reports with retained evidence (BE-02), strikes, appeals, banned words,
-- append-only audit log, unlogged rate counters (BE-16) and support tables.
-- RLS on, no policies until 0008.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null,
  reporter_id uuid references public.profiles on delete set null,
  target_type text not null check (target_type in ('listing','user','chat','message','quad_post','quad_reply')),
  target_id text not null,
  target_user_id uuid references public.profiles on delete set null,     -- never returned to reporter
  reason text not null check (reason in ('scam','not_allowed','stolen','counterfeit','misleading','harassment','threat',
         'hate','sexual','minor_safety','calls_out_student','spam','self_harm','no_show','other')),
  details text check (char_length(details) <= 500),
  evidence jsonb not null default '{}',     -- BE-02: {text, excerpts[], photo_keys[], captured_at}
  status report_status not null default 'open',
  priority smallint not null default 2,     -- 1 = threat, self_harm, minor_safety
  assigned_to uuid, action_taken text, resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index reports_one_open on public.reports (reporter_id, target_type, target_id) where status = 'open';
create index on public.reports (campus_id, status, priority, created_at);
create index on public.reports (target_type, target_id, created_at);   -- auto-hide window (DATA_MODEL §4.5)
create index on public.reports (target_user_id);

create table public.strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles on delete cascade,
  reason text, report_id uuid, created_by uuid,
  expires_at timestamptz default now() + interval '180 days',
  cleared_at timestamptz,
  created_at timestamptz default now()
);
create index on public.strikes (user_id);

create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  subject_type text not null check (subject_type in ('strike','listing','quad_post','suspension','noshow')),
  subject_id text not null,
  reason_choice text, body text check (char_length(body) <= 500),
  status text not null default 'open' check (status in ('open','upheld','overturned')),
  decided_by uuid, decision_note text, decided_at timestamptz, created_at timestamptz default now(),
  unique (subject_type, subject_id)
);
create index on public.appeals (user_id);

create table public.banned_words (
  id uuid primary key default gen_random_uuid(),
  pattern text not null, match text not null default 'word' check (match in ('word','phrase','regex')),
  scopes text[] not null, action text not null check (action in ('block','review')),
  fired_count int not null default 0, overturned_count int not null default 0,
  created_by uuid, created_at timestamptz default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid, action text not null, target_type text, target_id text, campus_id uuid,
  reason text, case_ref text, meta jsonb, created_at timestamptz not null default now()
);
create index on public.audit_log (created_at);
create index on public.audit_log (target_type, target_id);

-- The audit log is append-only for everyone (DATA_MODEL §3). The one
-- exception is the retention purge: rows older than 2 years may be deleted
-- (DATA_MODEL §5).
create or replace function private.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.created_at < now() - interval '2 years' then
      return old;
    end if;
  end if;
  raise exception 'FORBIDDEN: audit_log is append-only' using errcode = '42501';
end;
$$;
revoke all on function private.audit_log_append_only() from public, anon, authenticated;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function private.audit_log_append_only();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.audit_log_append_only();

create unlogged table public.rate_counters (
  user_id uuid, action text, window_start timestamptz, count int not null,
  primary key (user_id, action, window_start)
);  -- BE-16
create index on public.rate_counters (window_start);   -- 2 d purge

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  email text,
  topic text check (topic in ('general','cant_access_email','safety','bug','other')),
  body text check (char_length(body) <= 2000),
  created_at timestamptz default now(), handled_at timestamptz
);

create table public.daily_counters (
  campus_id uuid, day date, key text, value int not null default 0,
  primary key (campus_id, day, key)
);

alter table public.reports          enable row level security;
alter table public.strikes          enable row level security;
alter table public.appeals          enable row level security;
alter table public.banned_words     enable row level security;
alter table public.audit_log        enable row level security;
alter table public.rate_counters    enable row level security;
alter table public.support_requests enable row level security;
alter table public.daily_counters   enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
