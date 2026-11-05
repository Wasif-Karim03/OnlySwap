# OWU meetup spots (Ohio Wesleyan University)

Status: DRAFT for owner review. Date: 2026-11-04.

Scope: candidate rows for `public.safe_spots` on the OWU campus (email domain owu.edu). UI copy says "Meetup spot".

## How to verify before production

1. Walk to each spot and confirm the exact meeting point, that it is staffed or busy, and that it is lit in the evening.
2. Drop a pin at the exact door or desk and replace the lat/lng below (all coordinates are OpenStreetMap building positions via Nominatim, not surveyed door positions).
3. Confirm hours with the office. The owu.edu pages that publish hours were not reachable by this research (see Gaps).
4. Ask OWU Public Safety (740-368-2222) whether they would designate a spot for internet purchase exchanges. Only then set `designation = 'police'` and `designated_on`.

## Police-designated finding

None. No OWU Public Safety page or City of Delaware police page found in this research explicitly designates a safe exchange or internet purchase exchange location. All OWU spots are therefore `designation = 'public'` ("Meetup spot").

City of Delaware Police Department (separate, off campus, not designated): a Delaware Gazette article (older, roughly 10 years per the search summary) reports that the department has no designated online-deal parking spots, but that residents may meet for online transactions in the lobby or parking lot of the police building at 70 North Union Street, and can ask for an officer at the lobby desk. I could not open the article (HTTP 403), so this is a search-summary paraphrase and NOT a verified quote. It is not an official designation, so it is `public`. Call 740-203-1100 to confirm before listing it.

## Spots

Coordinates: OpenStreetMap via Nominatim (OSM way ids given). Confidence is for the building location, not the door.

| # | Display name | Building | Where exactly to meet | Lat | Lng | Hours | Type | Coordinate confidence |
|---|---|---|---|---|---|---|---|---|
| 1 | Campus Center lobby | Hamilton-Williams Campus Center, 40 Rowland Ave | Main lobby by the front desk (confirm desk location on site) | 40.296626 | -83.069990 | Not published; verify on site | Meetup spot | Good (OSM way 331012060) |
| 2 | Beeghly Library entrance | Beeghly Library | Inside the main entrance by the circulation desk (confirm on site) | 40.295933 | -83.069802 | Not published in reachable pages; verify on site | Meetup spot | Verify on site (OSM way 331012189 is labelled differently, so confirm it is Beeghly) |
| 3 | Public Safety office | Welch Hall, room 133 | Outside the Department of Public Safety office, Welch Hall 133 | 40.297291 | -83.074226 | Not published; office phone 740-368-2222 | Meetup spot | Verify on site (building point only; OSM way 1551346139) |
| 4 | Science Center lobby | Schimmel/Conrades Science Center, 90 S Henry St | Main lobby inside the entrance | 40.295477 | -83.065123 | Not published; verify on site | Meetup spot | Good (OSM way 331011239) |
| 5 | Merrick Hall lobby | Merrick Hall | Main lobby inside the entrance (verify it is open to all students in the evening) | 40.296653 | -83.065931 | Not published; verify on site | Meetup spot | Verify on site (OSM way 331011242) |
| 6 | Delaware Police lobby (off campus) | Delaware City Police Department, 70 N Union St | Public lobby; ask the desk if you want an officer present | 40.301000 | -83.065362 | Not confirmed; call 740-203-1100 | Meetup spot (not designated) | Good (OSM way 331126643) |

Not included, no usable coordinate found: Gordon Field House / rec center lobby, Gray Chapel, Sanborn Hall. Residence hall lobbies (Smith 40.298200,-83.073581; Stuyvesant 40.298502,-83.075529 from OSM) were left out because no source confirms a staffed desk, and residence lobbies may be card access only. Add after an on-site check.

Suggested default (`is_default`): row 1, the Campus Center lobby.

## Sources

Official OWU:
- Department of Public Safety: https://owu.edu/student-life/department-of-public-safety/ (phone 740-368-2222, no exchange-location designation found)
- Clery / department contact info (office location Welch Hall 133): https://owu.edu/student-life/department-of-public-safety/clery-report
- Residential Life & Dining Services (office in Campus Center 213, office hours Mon-Fri 8:30-12, 1-5; this is the office, not the building): https://www.owu.edu/about/offices-services-directory/residential-life-and-dining-services/

City of Delaware:
- Police department page: https://www.delawareohio.net/government/departments/police (address 70 N Union St, 740-203-1100; no exchange zone listed in the search result)
- Delaware Gazette, "Police offer safe zones for transactions": https://www.delgazette.com/news/10360/police-offer-safe-zones-for-transactions (not opened, 403)

Coordinates: OpenStreetMap Nominatim queries (https://nominatim.openstreetmap.org), ODbL data.

## Gaps

- owu.edu campus map and building pages were not retrievable; coordinates are OSM, not the official map.
- Library and Campus Center building hours not found, so `hours` is null in the SQL.
- Spot descriptions about desks and lobbies are plausible defaults and must be confirmed on site.

## SQL (do not run until verified; replace :owu_campus_id)

```sql
insert into public.safe_spots
  (campus_id, name, description, hours, lat, lng, designation, designated_on, is_default, active, sort)
values
  (:owu_campus_id, 'Campus Center lobby',   'Main lobby by the front desk, Hamilton-Williams Campus Center', null, 40.296626, -83.069990, 'public', null, true,  true, 1),
  (:owu_campus_id, 'Beeghly Library entrance', 'Inside the main entrance, by the circulation desk',          null, 40.295933, -83.069802, 'public', null, false, true, 2),
  (:owu_campus_id, 'Public Safety office',  'Outside the Department of Public Safety office, Welch Hall 133', null, 40.297291, -83.074226, 'public', null, false, true, 3),
  (:owu_campus_id, 'Science Center lobby',  'Main lobby inside the entrance, Schimmel/Conrades Science Center', null, 40.295477, -83.065123, 'public', null, false, true, 4),
  (:owu_campus_id, 'Merrick Hall lobby',    'Main lobby inside the entrance',                                  null, 40.296653, -83.065931, 'public', null, false, true, 5),
  (:owu_campus_id, 'Delaware Police lobby', 'Public lobby at 70 N Union St, off campus. Ask the desk for an officer', null, 40.301000, -83.065362, 'public', null, false, false, 6);
```

Row 6 is `active = false` until the police department confirms the lobby is acceptable. Rows 2, 3 and 5 carry "verify on site" coordinates.
