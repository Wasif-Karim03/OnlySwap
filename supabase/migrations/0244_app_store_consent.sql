-- 0244_app_store_consent.sql · AR-04, DEC 136. A parent in Texas, Utah or
-- Louisiana can withdraw consent for the app. Apple then sends the
-- RESCIND_CONSENT App Store Server Notification, which names the Apple
-- download (appTransactionId), not our user. So:
--   * the iOS app links its appTransactionId to the signed-in user
--     (link_app_transaction, any time it starts signed in);
--   * the Edge Function app-store-notifications verifies Apple's signature and
--     calls private.rescind_consent, which locks every linked account
--     (suspended, status_reason 'parental_consent', parental_consent
--     'revoked'). Deal data is kept (never hard-deleted, CLAUDE rule 6).
-- An admin turns an account back on after a parent allows the app again.

create table public.app_transactions (
  app_transaction_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (app_transaction_id, user_id)
);
create index app_transactions_user_idx on public.app_transactions (user_id);
alter table public.app_transactions enable row level security;
revoke all on public.app_transactions from public, anon, authenticated;
comment on table public.app_transactions is
  'AR-04: Apple appTransactionId per user, only to act on RESCIND_CONSENT. No policies: RPC and service role only.';

-- require_onboarding, not require_active: an account mid sign-up is linked too.
create or replace function public.link_app_transaction(app_transaction_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_onboarding();
begin
  if link_app_transaction.app_transaction_id is null
     or link_app_transaction.app_transaction_id !~ '^[0-9A-Za-z_-]{1,64}$' then
    perform private.raise('INVALID', 'app_transaction_id');
  end if;
  perform private.hit('link_app_transaction', 20, interval '1 day');
  insert into public.app_transactions as t (app_transaction_id, user_id, created_at, last_seen_at)
  values (link_app_transaction.app_transaction_id, me.id, private.now(), private.now())
  on conflict on constraint app_transactions_pkey do update set last_seen_at = excluded.last_seen_at;
end;
$$;
revoke all on function public.link_app_transaction(text) from public, anon;
grant execute on function public.link_app_transaction(text) to authenticated, service_role;

-- Called only by the Edge Function (service role). Idempotent. A banned
-- account stays banned; everyone else linked to the download is locked.
create or replace function private.rescind_consent(p_app_transaction_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.profiles p
     set parental_consent = 'revoked',
         status = case when p.status = 'banned' then p.status else 'suspended' end,
         status_reason = case when p.status = 'banned' then p.status_reason else 'parental_consent' end
   where p.id in (select t.user_id from public.app_transactions t
                   where t.app_transaction_id = p_app_transaction_id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function private.rescind_consent(text) from public, anon, authenticated;
grant execute on function private.rescind_consent(text) to service_role;
