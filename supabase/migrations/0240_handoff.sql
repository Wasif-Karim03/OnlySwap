-- DEC 132 handoff code (UX pack). A confirmed meetup gets a 4-digit code that
-- only the buyer sees. The seller types it in "Swap done" (confirm_handoff, 5
-- tries per meetup): the meetup completes, both sides are recorded as done,
-- the listing is sold to this buyer and both get the rate prompt, the same as
-- confirm_deal 'done' from both sides. "Did it sell?" still works without it.

alter table public.meetups
  add column handoff_code text check (handoff_code ~ '^[0-9]{4}$'),
  add column handoff_tries smallint not null default 0,
  add column handoff_at timestamptz;

-- Four random digits from a v4 uuid (not random(), which is predictable).
create or replace function private.new_handoff_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select lpad((abs(('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::int) % 10000)::text, 4, '0')
$$;

-- Every meetup gets its code the moment it is confirmed.
create or replace function private.meetups_handoff_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'confirmed' and new.handoff_code is null then
    new.handoff_code := private.new_handoff_code();
  end if;
  return new;
end;
$$;
create trigger trg_meetups_handoff_code before insert or update of status on public.meetups
  for each row execute function private.meetups_handoff_code();

update public.meetups set handoff_code = private.new_handoff_code()
 where status = 'confirmed' and handoff_code is null;

-- meetup_json: the code for the buyer only, while the meetup is confirmed.
create or replace function private.meetup_json(p_meetup uuid, p_me uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'chat_id', m.chat_id, 'status', m.status, 'starts_at', m.starts_at,
    'spot', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'name', s.name, 'lat', s.lat, 'lng', s.lng, 'police', s.designation = 'police', 'hours', s.hours) end,
    'custom_place', m.custom_place,
    'proposed_by_me', m.proposed_by = p_me,
    'confirmed_at', m.confirmed_at,
    'my_here_at', case when c.buyer_id = p_me then m.buyer_here_at else m.seller_here_at end,
    'other_here_at', case when c.buyer_id = p_me then m.seller_here_at else m.buyer_here_at end,
    'late_minutes', m.late_minutes, 'late_is_me', m.late_user = p_me,
    'cancelled_by_me', m.cancelled_by = p_me, 'cancel_reason', m.cancel_reason,
    'previous_starts_at', m.previous_starts_at,
    'share_token', case when m.share_created_by = p_me and m.share_expires_at > private.now() then m.share_token end,
    'my_noshow_report', (select r.status from public.noshow_reports r where r.meetup_id = m.id and r.reporter_id = p_me),
    'i_am_seller', c.seller_id = p_me,
    'handoff_code', case when c.buyer_id = p_me and m.status = 'confirmed' then m.handoff_code end,
    'handoff_at', m.handoff_at,
    'handoff_tries_left', greatest(0, 5 - m.handoff_tries))
  from public.meetups m
  join public.chats c on c.id = m.chat_id
  left join public.safe_spots s on s.id = m.spot_id
  where m.id = p_meetup
$$;

-- The seller types the buyer's code. Wrong codes are counted and answered
-- (not raised, so the count sticks); after 5 the code is locked.
create or replace function public.confirm_handoff(meetup_id uuid, code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_active();
  r record := private.my_meetup(confirm_handoff.meetup_id, me.id);
  tries smallint;
begin
  if (r.c).seller_id is distinct from me.id then
    perform private.raise('FORBIDDEN');
  end if;
  if (r.m).status <> 'confirmed' then
    perform private.raise('MEETUP_WINDOW');
  end if;
  if (r.m).handoff_tries >= 5 then
    perform private.raise('HANDOFF_LOCKED');
  end if;
  if coalesce(btrim(confirm_handoff.code), '') !~ '^[0-9]{4}$' then
    perform private.raise('INVALID', 'code');
  end if;
  if btrim(confirm_handoff.code) is distinct from (r.m).handoff_code then
    update public.meetups x set handoff_tries = x.handoff_tries + 1
     where x.id = (r.m).id
    returning x.handoff_tries into tries;
    return jsonb_build_object('ok', false, 'tries_left', greatest(0, 5 - tries));
  end if;

  update public.meetups x set handoff_at = private.now() where x.id = (r.m).id;
  -- Both sides done: confirm_deal completes the meetup, sells the listing to
  -- this buyer, closes other chats and sends both rate prompts.
  update public.chats x set buyer_outcome = 'done' where x.id = (r.c).id;
  perform public.confirm_deal((r.c).id, 'done');
  insert into public.messages (chat_id, sender_id, kind, body, created_at)
  values ((r.c).id, null, 'system', 'Swap done. The handoff code matched.', private.now());
  return jsonb_build_object('ok', true, 'tries_left', greatest(0, 5 - (r.m).handoff_tries));
end;
$$;

revoke all on function private.new_handoff_code() from public, anon, authenticated;
revoke all on function private.meetups_handoff_code() from public, anon, authenticated;
revoke all on function public.confirm_handoff(uuid, text) from public, anon;
grant execute on function public.confirm_handoff(uuid, text) to authenticated;
