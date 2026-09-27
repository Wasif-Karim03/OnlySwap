-- 0014_onboarding.sql (P4-AUTH-11, P4-AUTH-17; API §5 waitlist-request, D10)
--   * private.record_waitlist_request: the database half of the anon
--     waitlist-request Edge Function (IP limit 5/h, duplicate is silent).
--   * rules_changes: a public app_config key with the "What changed" lines the
--     Updated rules screen shows after the owner bumps rules_version (DEC 52).

-- ---------------------------------------------------------------------------
-- Same key as private.client_ip_key(), for callers that pass the address in
-- (Edge Functions reach the database directly, without PostgREST headers).
create or replace function private.ip_key(p_ip text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select md5('ip:' || coalesce(nullif(btrim(p_ip), ''), 'unknown'))::uuid
$$;

-- Stores a "tell me when my school opens" request (F06, DATA_MODEL §2.1).
-- The address is kept only encrypted (pgp_sym_encrypt, key in Vault as
-- `waitlist_email_key`) plus its peppered hash for de-duplication. Always
-- returns nothing, whether the address was new or already on the list, so
-- the caller can answer the same way every time (SEC-12, T16).
create or replace function private.record_waitlist_request(p_email text, p_ip text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  email text := lower(btrim(coalesce(p_email, '')));
  domain text;
  hash text;
begin
  if email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(email) > 254 then
    perform private.raise('INVALID', 'email');
  end if;
  perform private.hit_key(private.ip_key(p_ip), 'ip:waitlist', 5, interval '1 hour');

  domain := split_part(email, '@', 2);
  hash := private.email_hash(email);
  insert into public.waitlist_requests (email_hash, email_enc, domain, school_guess)
  values (
    hash,
    extensions.pgp_sym_encrypt(email, private.secret('waitlist_email_key')),
    domain,
    null
  )
  on conflict (email_hash) do nothing;
end;
$$;

revoke all on function private.ip_key(text) from public, anon, authenticated;
revoke all on function private.record_waitlist_request(text, text) from public, anon, authenticated;
grant execute on function private.ip_key(text) to service_role;
grant execute on function private.record_waitlist_request(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Public config keys: rules_changes joins the list (additive).
create or replace function private.is_public_config_key(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_key in ('maintenance','min_version_ios','min_version_android','rules_version',
                   'rules_changes','quad_enabled','chat_photos_enabled')
$$;

-- A list of short lines, newest rules first. Empty until the first change.
insert into public.app_config (key, value) values ('rules_changes', '[]'::jsonb)
on conflict (key) do nothing;
