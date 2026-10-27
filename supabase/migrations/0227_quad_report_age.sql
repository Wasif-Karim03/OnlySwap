-- 0227: Quad auto-hide counts only reporters older than 7 days (audit A-11, DEC 114).
-- SECURITY's brigading rule: auto-hide needs 3 distinct reporters whose accounts
-- are older than 7 days. Listings already did this (trg_reports_ai); the Quad
-- check in create_report counted any three open reports. Same signature, so
-- grants are kept; only the count changes.

CREATE OR REPLACE FUNCTION public.create_report(target_type text, target_id text, reason text, details text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  me public.profiles := private.require_active();
  target_user uuid;
  target_campus uuid;
  chat uuid;
  new_id uuid;
begin
  perform private.hit('report', 20, interval '1 day');

  if target_type not in ('listing','user','chat','message','quad_post','quad_reply') then
    perform private.raise('INVALID', 'target_type');
  end if;
  if reason not in ('scam','not_allowed','stolen','counterfeit','misleading','harassment','threat',
                    'hate','sexual','minor_safety','calls_out_student','spam','self_harm','no_show','other') then
    perform private.raise('INVALID', 'reason');
  end if;
  if char_length(coalesce(details, '')) > 500 then
    perform private.raise('INVALID', 'details');
  end if;

  -- Resolve the reported person; the reporter must be able to see the target.
  -- Quad authors are resolved here and never returned (SECURITY T12).
  begin
    if target_type = 'listing' then
      select l.seller_id, l.campus_id into target_user, target_campus
      from public.listings l
      where l.id = target_id::uuid and l.status <> 'deleted';
    elsif target_type = 'user' then
      select p.id, p.campus_id into target_user, target_campus
      from public.profiles p where p.id = target_id::uuid;
    elsif target_type = 'chat' then
      select case when c.buyer_id = me.id then c.seller_id else c.buyer_id end, me.campus_id
        into target_user, target_campus
      from public.chats c
      where c.id = target_id::uuid and me.id in (c.buyer_id, c.seller_id);
    elsif target_type = 'message' then
      select m.sender_id, m.chat_id, me.campus_id into target_user, chat, target_campus
      from public.messages m
      join public.chats c on c.id = m.chat_id
      where m.id = target_id::bigint and me.id in (c.buyer_id, c.seller_id);
    elsif target_type = 'quad_post' then
      select q.author_id, q.campus_id into target_user, target_campus
      from public.quad_posts q
      where q.id = target_id::uuid and q.status in ('live', 'held');
    else
      select r.author_id, q.campus_id into target_user, target_campus
      from public.quad_replies r join public.quad_posts q on q.id = r.post_id
      where r.id = target_id::uuid and r.status in ('live', 'held');
    end if;
  exception when invalid_text_representation then
    perform private.raise('NOT_FOUND');
  end;

  if target_campus is null or target_campus <> me.campus_id then
    perform private.raise('NOT_FOUND');
  end if;
  if target_user = me.id then
    perform private.raise('INVALID', 'target_id');
  end if;

  begin
    insert into public.reports
      (campus_id, reporter_id, target_type, target_id, target_user_id, reason, details, evidence, priority, created_at)
    values
      (me.campus_id, me.id, target_type, target_id, target_user, reason, nullif(btrim(details), ''),
       private.snapshot_evidence(target_type, target_id),
       case when reason in ('threat','self_harm','minor_safety') then 1 else 2 end,
       private.now())
    returning id into new_id;
  exception when unique_violation then
    perform private.raise('ALREADY_REPORTED');
  end;

  -- Three open reports on a Quad post or reply take it off the board until a
  -- moderator looks (DESIGN_SYSTEM Q09). Only reporters whose accounts are
  -- older than 7 days count, so fresh accounts cannot brigade (A-11).
  if target_type in ('quad_post', 'quad_reply')
     and (select count(distinct rp.reporter_id) from public.reports rp
          join public.profiles p on p.id = rp.reporter_id
          where rp.target_type = create_report.target_type and rp.target_id = create_report.target_id
            and rp.status = 'open'
            and p.created_at < private.now() - interval '7 days') >= 3 then
    if target_type = 'quad_post' then
      update public.quad_posts set status = 'held', hold_reason = 'reports'
      where id = target_id::uuid and status = 'live';
    else
      update public.quad_replies set status = 'held', hold_reason = 'reports'
      where id = target_id::uuid and status = 'live';
    end if;
  end if;

  return jsonb_build_object('id', new_id);
end;
$function$;
