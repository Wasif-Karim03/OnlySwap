-- 0034_demo_meetup_time.sql · Found on the Simulator: the Demo University seller
-- proposed a meetup at 1:00 AM (now + 2 h, late at night). App Review would see
-- that. It now proposes the next daytime slot in the campus time zone: two hours
-- ahead when that lands between 9:00 and 20:00, otherwise 10:00 the next morning.

create or replace function private.demo_slot(at timestamptz, tz text)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(hour from (date_trunc('hour', at) + interval '2 hours') at time zone coalesce(tz, 'America/New_York')) between 9 and 20
      then date_trunc('hour', at) + interval '2 hours'
    else ((date_trunc('day', (at + interval '14 hours') at time zone coalesce(tz, 'America/New_York')) + interval '10 hours')
          at time zone coalesce(tz, 'America/New_York'))
  end
$$;
revoke all on function private.demo_slot(timestamptz, text) from public, anon, authenticated;

create or replace function private.demo_autoplay()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  demo uuid := (select id from public.campuses where is_demo limit 1);
  x record;
  n int := 0;
  spot uuid;
  tz text := (select c.timezone from public.campuses c where c.is_demo limit 1);
begin
  if demo is null then
    return 0;
  end if;
  spot := (select s.id from public.safe_spots s where s.campus_id = demo and s.active order by s.sort limit 1);

  -- Bots are the demo campus's non-reviewer accounts.
  for x in
    select o.id, o.seller_id from public.offers o
    join public.profiles p on p.id = o.seller_id and p.campus_id = demo
    join auth.users u on u.id = p.id and u.email not in (select email from public.review_accounts where note ilike '%reviewer%')
    where o.status in ('pending', 'countered') and o.last_actor = 'buyer' and o.created_at < private.now() - interval '30 seconds'
  loop
    if private.demo_act(x.seller_id, format('select public.accept_offer(%L)', x.id)) then n := n + 1; end if;
  end loop;

  for x in
    select c.id, case when bu.email in (select email from public.review_accounts where note ilike '%reviewer%') then c.seller_id else c.buyer_id end as bot,
           (select m.sender_id from public.messages m where m.chat_id = c.id and m.kind = 'text' order by m.id desc limit 1) as last_sender,
           (select mt.id from public.meetups mt where mt.chat_id = c.id and mt.status in ('proposed', 'confirmed') limit 1) as meetup
    from public.chats c
    join public.profiles bp on bp.id = c.buyer_id and bp.campus_id = demo
    join auth.users bu on bu.id = c.buyer_id
    where c.status = 'open'
  loop
    -- Answer the reviewer's last message once.
    if x.last_sender is not null and x.last_sender <> x.bot then
      if private.demo_act(x.bot, format('select public.send_message(%L, %L, %L)', x.id,
           'Sounds good. The Demo Library lobby works for me.', gen_random_uuid())) then n := n + 1; end if;
    end if;
    if x.meetup is null and spot is not null then
      perform private.demo_act(x.bot, format('select public.propose_meetup(%L, %L::timestamptz, %L)',
        x.id, private.demo_slot(private.now(), tz), spot));
    else
      perform private.demo_act(x.bot, format('select public.confirm_meetup(%L)', x.meetup));
      perform private.demo_act(x.bot, format('select public.checkin_meetup(%L)', x.meetup));
    end if;
  end loop;
  return n;
end;
$$;
