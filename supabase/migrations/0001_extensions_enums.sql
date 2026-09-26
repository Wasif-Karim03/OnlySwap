-- 0001_extensions_enums.sql (P3-DB-01, DATA_MODEL §1)
-- Extensions, enums, the private schema and deny-by-default privileges.

create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;
drop extension if exists pg_graphql;            -- BE-13

create type campus_status  as enum ('waitlist','live','paused');
create type user_status    as enum ('active','waitlist','reverify','paused','suspended','banned');
create type class_year     as enum ('freshman','sophomore','junior','senior','grad','other');
create type age_method     as enum ('os_signal','self_declared','review');
create type listing_kind   as enum ('sale','free','wanted','food');
create type listing_status as enum ('active','hold','sold','expired','held_review','removed','deleted');
create type item_condition as enum ('new','like_new','good','fair');
create type swipe_dir      as enum ('left','save');           -- right-swipe = offer (recorded as offer)
create type offer_status   as enum ('pending','countered','accepted','declined','expired','withdrawn','auto_declined');
create type chat_status    as enum ('open','closed','blocked');
create type message_kind   as enum ('text','system','meetup','photo');   -- 'photo' used from R1.1
create type meetup_status  as enum ('proposed','confirmed','cancelled','completed','no_show');
create type report_status  as enum ('open','actioned','dismissed');
create type admin_role     as enum ('owner','moderator');
create type push_state     as enum ('pending','sending','sent','skipped','failed');
create type spot_designation as enum ('public','police');

-- Private helpers are never exposed through the API (DATA_MODEL §0).
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

-- Two helpers are needed by column definitions in 0002 and 0003, so they are
-- created here; the rest of private.* arrives in 0007_helpers.sql (DEC 45).

-- Immutable wrapper so unaccent can be used in the generated search column.
create or replace function private.unaccent_immutable(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value)
$$;

-- 8-character invite code without look-alike characters (0/O, 1/I/L).
-- Uniqueness is enforced by profiles.invite_code; a clash is astronomically rare.
create or replace function private.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), ''
  )
  from generate_series(1, 8)
$$;

revoke all on function private.unaccent_immutable(text) from public, anon, authenticated;
revoke all on function private.new_invite_code() from public, anon, authenticated;

-- Deny by default (DATA_MODEL §0 grants): tables and sequences created by
-- later migrations get no privileges for anon/authenticated. 0008 grants only
-- what DATA_MODEL §3 lists.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
