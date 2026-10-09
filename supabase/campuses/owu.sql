-- Ohio Wesleyan University (DEC 91). Data, not schema: run against a project
-- with scripts/deploy/add-campus.command owu. Safe to run again.
-- Opens the campus right away (status live) so @owu.edu sign-ups go straight in.
insert into public.campuses (slug, name, short_name, status, timezone, unlocked_at)
values ('owu', 'Ohio Wesleyan University', 'Ohio Wesleyan', 'live', 'America/New_York', now())
on conflict (slug) do update
  set name = excluded.name, short_name = excluded.short_name, status = 'live',
      unlocked_at = coalesce(public.campuses.unlocked_at, now());

insert into public.campus_domains (domain, campus_id, kind)
select 'owu.edu', id, 'student' from public.campuses where slug = 'owu'
on conflict (domain) do nothing;

-- Meetup spots. Coordinates are approximate (used for the Directions link);
-- the owner can add or move spots in the admin console.
insert into public.safe_spots (campus_id, name, description, hours, lat, lng, is_default, sort)
select c.id, s.name, s.description, s.hours, s.lat, s.lng, s.is_default, s.sort
from public.campuses c
cross join (values
  ('Hamilton-Williams Campus Center', 'Main entrance, 61 S. Sandusky St.', 'Daytime and evening', 40.2970, -83.0672, true, 1)
) as s(name, description, hours, lat, lng, is_default, sort)
where c.slug = 'owu'
  and not exists (select 1 from public.safe_spots x where x.campus_id = c.id and x.name = s.name);

select c.slug, c.name, c.status, d.domain,
       (select count(*) from public.safe_spots s where s.campus_id = c.id) as meetup_spots
from public.campuses c join public.campus_domains d on d.campus_id = c.id
where c.slug = 'owu';
