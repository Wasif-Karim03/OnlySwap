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

-- Meetup spots (docs/launch/OWU_SPOTS.md; coordinates from OpenStreetMap, used
-- for the Directions link). None is police-designated. Spots marked active =
-- false still need an on-site check; turn them on in the admin console.
-- 61 S. Sandusky St. is the university's mailing address, not the Campus Center.
insert into public.safe_spots (campus_id, name, description, hours, lat, lng, is_default, active, sort)
select c.id, s.name, s.description, s.hours, s.lat, s.lng, s.is_default, s.active, s.sort
from public.campuses c
cross join (values
  ('Hamilton-Williams Campus Center', 'Main lobby by the front desk, 40 Rowland Ave.', null, 40.296626, -83.069990, true, true, 1),
  ('Science Center lobby', 'Main lobby inside the entrance, Schimmel/Conrades Science Center, 90 S. Henry St.', null, 40.295477, -83.065123, false, true, 2),
  ('Beeghly Library entrance', 'Inside the main entrance, by the circulation desk', null, 40.295933, -83.069802, false, false, 3),
  ('Public Safety office', 'Outside the Public Safety office, Welch Hall 133', null, 40.297291, -83.074226, false, false, 4),
  ('Merrick Hall lobby', 'Main lobby inside the entrance', null, 40.296653, -83.065931, false, false, 5)
) as s(name, description, hours, lat, lng, is_default, active, sort)
where c.slug = 'owu'
  and not exists (select 1 from public.safe_spots x where x.campus_id = c.id and x.name = s.name);

-- An earlier version of this file put the Campus Center at the mailing address.
update public.safe_spots x
set description = 'Main lobby by the front desk, 40 Rowland Ave.', hours = null,
    lat = 40.296626, lng = -83.069990
from public.campuses c
where x.campus_id = c.id and c.slug = 'owu' and x.name = 'Hamilton-Williams Campus Center'
  and x.lat = 40.2970 and x.lng = -83.0672;

select c.slug, c.name, c.status, d.domain,
       (select count(*) from public.safe_spots s where s.campus_id = c.id and s.active) as meetup_spots
from public.campuses c join public.campus_domains d on d.campus_id = c.id
where c.slug = 'owu';
