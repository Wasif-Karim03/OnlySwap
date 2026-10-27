-- DEC 151 (owner, 2026-10-24): every meetup is at one of the campus's listed
-- public Meetup spots, for everyone (no age rules). A custom place is no
-- longer accepted: a proposal without a spot fails INVALID:place. Same
-- signature (custom_place stays for builds already installed and is ignored).

create or replace function public.propose_meetup(chat_id uuid, starts_at timestamptz, spot_id uuid default null, custom_place text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  c public.chats := private.my_chat(propose_meetup.chat_id, me.id);
  prev public.meetups;
  m public.meetups;
  -- DEC 151: campus Meetup spots only; a custom place is ignored.
  place text := null;
begin
  perform private.hit('propose_meetup', 20, interval '1 day');
  if c.status <> 'open' or private.is_blocked(c.buyer_id, c.seller_id) then
    perform private.raise('CHAT_CLOSED');
  end if;
  if propose_meetup.starts_at is null or propose_meetup.starts_at < private.now() + interval '15 minutes'
     or propose_meetup.starts_at > private.now() + interval '14 days' then
    perform private.raise('MEETUP_WINDOW');
  end if;
  if propose_meetup.spot_id is null then
    perform private.raise('INVALID', 'place');
  end if;
  if propose_meetup.spot_id is not null and not exists (
      select 1 from public.safe_spots s where s.id = propose_meetup.spot_id and s.campus_id = me.campus_id and s.active) then
    perform private.raise('INVALID', 'spot_id');
  end if;

  -- One active meetup per chat (BE-06): the new proposal replaces the old one in this transaction.
  select * into prev from public.meetups x
  where x.chat_id = c.id and x.status in ('proposed', 'confirmed')
  for update;
  if found then
    update public.meetups x set status = 'cancelled', cancelled_by = me.id, cancel_reason = 'replaced'
     where x.id = prev.id;
  end if;

  insert into public.meetups (chat_id, spot_id, custom_place, starts_at, proposed_by, previous_starts_at, created_at)
  values (c.id, propose_meetup.spot_id, place, propose_meetup.starts_at, me.id,
          case when prev.id is not null then prev.starts_at end, private.now())
  returning * into m;

  perform private.meetup_event(m.id, me.id, case when prev.id is null then 'proposed' else 'reproposed' end,
    me.display_name || ' suggested ' || private.local_time(m.starts_at, me.campus_id) || ' at ' || private.place_name(m),
    'meetup_proposed',
    me.display_name || ' suggested ' || private.local_time(m.starts_at, me.campus_id) || ' at ' || private.place_name(m),
    'meetup_proposed:' || m.id);
  return private.meetup_json(m.id, me.id);
end;
$$;
