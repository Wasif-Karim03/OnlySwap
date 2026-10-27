-- 0243_age_assurance.sql · AR-03, DEC 136. Apple age assurance (Texas, Utah,
-- Louisiana). Where Apple says the law applies, the app takes the age range
-- from Declared Age Range only (no birthday fallback) and records it here:
--   * profiles.age_regulated: Apple said age assurance applies to this person.
--   * profiles.age_declaration: how the OS range was declared (self, guardian,
--     confirmed). Never a birth date.
--   * profiles.parental_consent: 'granted' for a 13 to 17 account in a
--     regulated state (Apple only shares the range after a parent approves);
--     'revoked' is set by the App Store notification endpoint (AR-04) and is
--     never overwritten from the client.
-- Columns are private: profiles is self-read only and public_profiles lists
-- its own columns.

alter table public.profiles
  add column if not exists age_regulated boolean,
  add column if not exists age_declaration text,
  add column if not exists parental_consent text;
alter table public.profiles add constraint profiles_age_declaration_valid
  check (age_declaration is null or age_declaration in ('self_declared', 'guardian_declared', 'confirmed'));
alter table public.profiles add constraint profiles_parental_consent_valid
  check (parental_consent is null or parental_consent in ('granted', 'revoked'));
comment on column public.profiles.age_regulated is
  'Apple age assurance applied when the age was checked (AR-03). Null: not asked or unknown.';
comment on column public.profiles.age_declaration is
  'Declared Age Range declaration type: self_declared, guardian_declared or confirmed. Never a birth date.';
comment on column public.profiles.parental_consent is
  'granted for a 13_17 account in a regulated state; revoked when a parent withdraws consent (AR-04).';

-- Called right after confirm_age_v2 says eligible. require_onboarding, not
-- require_active: it is part of the same age step (see confirm_age_v2, 0242).
create or replace function public.record_age_assurance(
  regulated boolean,
  declaration text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles := private.require_onboarding();
  v_consent text;
begin
  if record_age_assurance.regulated is null then
    perform private.raise('INVALID', 'regulated');
  end if;
  if record_age_assurance.declaration is not null
     and record_age_assurance.declaration not in ('self_declared', 'guardian_declared', 'confirmed') then
    perform private.raise('INVALID', 'declaration');
  end if;
  if me.adult_confirmed_at is null then
    perform private.raise('AGE_REQUIRED');
  end if;
  perform private.hit('record_age_assurance', 10, interval '1 day');

  update public.profiles p
     set age_regulated = record_age_assurance.regulated,
         age_declaration = coalesce(record_age_assurance.declaration, p.age_declaration),
         parental_consent = case
           when p.parental_consent = 'revoked' then 'revoked'
           when record_age_assurance.regulated and p.age_band = '13_17' then 'granted'
           else p.parental_consent
         end
   where p.id = me.id
  returning p.parental_consent into v_consent;
  return jsonb_build_object('regulated', record_age_assurance.regulated, 'parental_consent', v_consent);
end;
$$;
revoke all on function public.record_age_assurance(boolean, text) from public, anon;
grant execute on function public.record_age_assurance(boolean, text) to authenticated, service_role;
