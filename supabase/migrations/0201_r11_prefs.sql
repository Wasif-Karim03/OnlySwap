-- 0201_r11_prefs.sql (S46/S48, R11-NOTIF-01; DEC 76)
-- The R1.1 preferences become readable and writable: "Quad replies" (Quad
-- reply and milestone pushes) and "Free food nearby" (Around campus). Both are
-- off by default (0006). Additive: two new keys in the prefs JSON.

create or replace function private.prefs_json(p public.notification_prefs)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('offers', p.offers, 'messages', p.messages, 'meetups', p.meetups,
    'saved_search', p.saved_search, 'price_drop', p.price_drop, 'tips', p.tips,
    'message_previews', p.message_previews, 'quad_replies', p.quad_replies, 'free_food', p.free_food,
    'quiet_start', to_char(p.quiet_start, 'HH24:MI'), 'quiet_end', to_char(p.quiet_end, 'HH24:MI'))
$$;

create or replace function public.update_notification_prefs(prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me public.profiles := private.require_member();
  k text;
  p public.notification_prefs;
begin
  if update_notification_prefs.prefs is null or jsonb_typeof(update_notification_prefs.prefs) <> 'object' then
    perform private.raise('INVALID', 'prefs');
  end if;
  for k in select jsonb_object_keys(update_notification_prefs.prefs) loop
    if k not in ('offers','messages','meetups','saved_search','price_drop','tips','message_previews',
                 'quad_replies','free_food','quiet_start','quiet_end') then
      perform private.raise('INVALID', 'prefs');
    end if;
  end loop;
  insert into public.notification_prefs (user_id) values (me.id) on conflict do nothing;
  begin
    update public.notification_prefs x set
      offers = coalesce((prefs ->> 'offers')::bool, x.offers),
      messages = coalesce((prefs ->> 'messages')::bool, x.messages),
      meetups = coalesce((prefs ->> 'meetups')::bool, x.meetups),
      saved_search = coalesce((prefs ->> 'saved_search')::bool, x.saved_search),
      price_drop = coalesce((prefs ->> 'price_drop')::bool, x.price_drop),
      tips = coalesce((prefs ->> 'tips')::bool, x.tips),
      message_previews = coalesce((prefs ->> 'message_previews')::bool, x.message_previews),
      quad_replies = coalesce((prefs ->> 'quad_replies')::bool, x.quad_replies),
      free_food = coalesce((prefs ->> 'free_food')::bool, x.free_food),
      quiet_start = coalesce((prefs ->> 'quiet_start')::time, x.quiet_start),
      quiet_end = coalesce((prefs ->> 'quiet_end')::time, x.quiet_end)
    where x.user_id = me.id
    returning * into p;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    perform private.raise('INVALID', 'prefs');
  end;
  -- Tips off also drops any tip still waiting to go out (P9-NOTIF-02).
  if (prefs ->> 'tips')::bool is false then
    update public.notifications nn set push_state = 'skipped'
     where nn.user_id = me.id and nn.push_state = 'pending' and private.push_pref(nn.type) = 'tips';
  end if;
  return private.prefs_json(p);
end;
$$;

revoke all on function private.prefs_json(public.notification_prefs) from public, anon, authenticated;
revoke all on function public.update_notification_prefs(jsonb) from public, anon;
grant execute on function public.update_notification_prefs(jsonb) to authenticated, service_role;
