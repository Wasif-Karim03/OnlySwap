-- 0013_account_media.sql (P5-MEDIA-04; API §5 delete-account steps 1-2, BE-02)
-- delete-account now also cleans R2:
--   * photos referenced by open reports about the person are copied to
--     onlyswap-private/evidence/{report}/ first, and the report is relinked;
--   * then every media prefix the person owns is deleted: their avatar folder,
--     their listings' folders (including unfinished drafts) and share cards.

create or replace function private.prepare_account_deletion(p_uid uuid, p_underage boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  addr text;
  prefixes text[];
  evidence jsonb;
begin
  select * into p from public.profiles x where x.id = p_uid;
  if not found then
    perform private.raise('NOT_FOUND');
  end if;
  perform private.hit_key(p_uid, 'delete_account', 3, interval '1 day');

  -- Underage mode skips the confirmation and the goodbye email, so it is only
  -- for accounts the age check has just blocked.
  if p_underage and not exists (select 1 from public.age_blocks a where a.email_hash = p.email_hash) then
    perform private.raise('FORBIDDEN');
  end if;

  select u.email into addr from auth.users u where u.id = p_uid;

  -- Deal data stays for the other person (BE-01): close the chats read-only
  -- with a system message; snapshots and FKs (set null) do the rest.
  insert into public.messages (chat_id, sender_id, kind, body, created_at)
  select c.id, null, 'system', 'This account was deleted.', private.now()
  from public.chats c
  where p_uid in (c.buyer_id, c.seller_id) and c.status <> 'closed';
  update public.chats c
     set status = 'closed', closed_at = coalesce(c.closed_at, private.now())
   where p_uid in (c.buyer_id, c.seller_id) and c.status <> 'closed';

  -- A banned person can't come back with the same address.
  if p.status = 'banned' then
    insert into public.banned_hashes (email_hash, created_at) values (p.email_hash, private.now())
    on conflict do nothing;
  end if;

  -- Media the person owns (R2 prefixes), computed before the rows go away.
  prefixes := array['c/' || p.campus_id || '/u/' || p_uid || '/']
    || coalesce((select array_agg(x order by x collate "C") from (
         select 'c/' || l.campus_id || '/l/' || l.id || '/' as x
         from public.listings l where l.seller_id = p_uid
         union
         select 'share/' || l.id || '.jpg'
         from public.listings l where l.seller_id = p_uid
         union
         select 'c/' || p.campus_id || '/l/' || r.id || '/'
         from public.listing_reservations r where r.user_id = p_uid) s), '{}');

  -- Photos that open reports about this person point at (BE-02). They are
  -- moved to the private bucket before the prefixes above are deleted.
  select coalesce(jsonb_agg(jsonb_build_object('report_id', r.id, 'key', k.key) order by r.id, k.key), '[]'::jsonb)
    into evidence
  from public.reports r
  cross join lateral jsonb_array_elements_text(coalesce(r.evidence -> 'photo_keys', '[]'::jsonb)) as k(key)
  where r.target_user_id = p_uid and r.status = 'open'
    and coalesce(r.evidence ->> 'photo_bucket', 'media') = 'media';

  -- Rows keyed by the user id without a foreign key.
  delete from public.activity_days where user_id = p_uid;
  delete from public.listing_reservations where user_id = p_uid;
  delete from public.rate_counters where user_id = p_uid;

  if not p_underage and addr is not null then
    perform private.queue_email(addr, 'account_deleted', '{}'::jsonb, 'account_deleted:' || p_uid::text);
  end if;

  return jsonb_build_object(
    'email', case when p_underage then null else addr end,
    'r2_prefixes', to_jsonb(prefixes),
    'evidence', evidence);
end;
$$;

-- After the Edge Function copied the photos, point each report at the copies:
-- p_moves = [{report_id, from, to}] with `to` a key in onlyswap-private.
create or replace function private.record_evidence_moves(p_moves jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  n int := 0;
begin
  for m in
    select (x ->> 'report_id')::uuid as report_id,
           jsonb_agg(x -> 'to' order by x ->> 'to') as keys
    from jsonb_array_elements(coalesce(p_moves, '[]'::jsonb)) as x
    group by (x ->> 'report_id')::uuid
  loop
    update public.reports r
       set evidence = r.evidence || jsonb_build_object('photo_keys', m.keys, 'photo_bucket', 'private')
     where r.id = m.report_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function private.prepare_account_deletion(uuid, boolean) from public, anon, authenticated;
revoke all on function private.record_evidence_moves(jsonb) from public, anon, authenticated;
grant execute on function private.prepare_account_deletion(uuid, boolean) to service_role;
grant execute on function private.record_evidence_moves(jsonb) to service_role;
