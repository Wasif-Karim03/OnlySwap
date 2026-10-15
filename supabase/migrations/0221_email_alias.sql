-- 0221_email_alias.sql · G-02 (audit), DEC 105.
-- name+tag@school reaches the same inbox as name@school (Microsoft 365 and
-- Google Workspace both deliver +tags), but it hashed differently, so a
-- banned or age-blocked student could sign up again on a +alias, and one
-- person could hold several accounts.
--   * private.email_hash drops a +tag from the name part before hashing.
--     Dots still count (school mail is not consumer Gmail). An address with
--     no +tag hashes exactly as before, so stored hashes stay valid.
--   * the sign-up hook refuses a new address that hashes like an existing
--     profile with EMAIL_ALIAS (sign in with the address you used first).
--   * profiles created on a +address get the new hash, and a ban or age
--     block on their old hash moves to the new one. Older ban and age-block
--     rows for +addresses with no profile left can't be rehashed (only the
--     hash is stored).
-- The hook is copied from 0210 with only the EMAIL_ALIAS branch added.

-- sha256(lower(trim(email)) without a +tag || pepper), hex (API §1).
create or replace function private.email_hash(email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    sha256(convert_to(
      regexp_replace(lower(btrim(email)), '^([^@+]+)\+[^@]*@', '\1@')
        || private.secret('email_hash_pepper'), 'UTF8')),
    'hex'
  )
$$;

create or replace function private.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(event #>> '{user,email}', '')));
  v_domain text;
  hash text;
  dom public.campus_domains;
  demo boolean;
  code text;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    code := 'SCHOOL_UNKNOWN';
  else
    v_domain := split_part(v_email, '@', 2);
    hash := private.email_hash(v_email);
    if exists (select 1 from public.age_blocks a where a.email_hash = hash) then
      code := 'AGE_BLOCKED';
    elsif exists (select 1 from public.banned_hashes b where b.email_hash = hash) then
      code := 'BANNED';
    elsif exists (select 1 from public.profiles p where p.email_hash = hash) then
      -- A new address that hashes like an existing account is an alias of it
      -- (name+tag@school): one account per person (G-02).
      code := 'EMAIL_ALIAS';
    elsif private.is_staff_email(v_email) then
      code := null;
    elsif exists (select 1 from public.review_accounts r where lower(r.email) = v_email) then
      code := null;
    else
      select * into dom from public.campus_domains d where d.domain = v_domain;
      select c.is_demo into demo from public.campuses c where c.id = dom.campus_id;
      if dom.domain is null then
        code := 'SCHOOL_UNKNOWN';
      elsif dom.kind = 'blocked' then
        code := 'DOMAIN_BLOCKED';
      elsif demo then
        -- The reviewer campus only admits the accounts listed in review_accounts.
        code := 'SCHOOL_UNKNOWN';
      end if;
    end if;
  end if;

  if code is null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', code));
end;
$$;

-- Profiles made on a +address: new hash, and bans and age blocks follow it.
do $$
declare
  r record;
  h text;
begin
  for r in
    select p.id, p.email_hash as old_hash, u.email
    from public.profiles p join auth.users u on u.id = p.id
    where u.email like '%+%@%'
  loop
    h := private.email_hash(r.email);
    continue when h = r.old_hash
      or exists (select 1 from public.profiles x where x.email_hash = h);
    insert into public.banned_hashes (email_hash)
      select h where exists (select 1 from public.banned_hashes b where b.email_hash = r.old_hash)
      on conflict do nothing;
    insert into public.age_blocks (email_hash)
      select h where exists (select 1 from public.age_blocks a where a.email_hash = r.old_hash)
      on conflict do nothing;
    update public.profiles set email_hash = h where id = r.id;
  end loop;
end;
$$;
