-- 0032_public_site.sql · S37/S38 (P13-WEB-02, P13-WEB-06): the anonymous read RPCs
-- the public site uses (API §1 public rows).
--   * public_campus_progress(): live and waitlist schools with member counts (W01).
--   * public_safe_spots(slug): a campus's active meetup spots (W02 /safety).
--   * get_listing_public_card(id): the /l/:id OG card, only for a listing its
--     seller shared that is still active or on hold. 60/min per IP.
-- None of them return people, emails or anything a signed-out visitor can't see
-- on a share image already.

create or replace function public.public_campus_progress()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'slug', c.slug, 'name', c.name, 'status', c.status,
      'members', (select count(*)::int from public.profiles p where p.campus_id = c.id and p.status <> 'banned'),
      'threshold', c.unlock_threshold) order by c.name), '[]')
  from public.campuses c
  where not c.is_demo and c.status in ('live', 'waitlist');
$$;

create or replace function public.public_safe_spots(slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', s.name, 'designation', s.designation, 'designated_on', s.designated_on,
      'lat', s.lat, 'lng', s.lng, 'hours', s.hours) order by s.sort, s.name), '[]')
  from public.safe_spots s
  join public.campuses c on c.id = s.campus_id
  where c.slug = public_safe_spots.slug and s.active and not c.is_demo;
$$;

create or replace function public.get_listing_public_card(id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  res jsonb;
begin
  perform private.hit_ip('listing_card', 60, interval '1 minute');
  select jsonb_build_object('title', l.title, 'price_cents', l.price_cents, 'kind', l.kind,
                            'campus_name', c.short_name, 'share_image_path', l.share_image_path)
    into res
    from public.listings l
    join public.campuses c on c.id = l.campus_id
   where l.id = get_listing_public_card.id
     and l.share_image_path is not null
     and l.status in ('active', 'hold');
  return res; -- null → the page shows "no longer available"
end;
$$;

revoke all on function public.public_campus_progress() from public;
revoke all on function public.public_safe_spots(text) from public;
revoke all on function public.get_listing_public_card(uuid) from public;
grant execute on function public.public_campus_progress() to anon, authenticated;
grant execute on function public.public_safe_spots(text) to anon, authenticated;
grant execute on function public.get_listing_public_card(uuid) to anon, authenticated;
