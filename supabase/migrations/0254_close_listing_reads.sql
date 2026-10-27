-- LAUNCH_READINESS item 45 (owner, 2026-10-24): students and admins read
-- listings only through the RPCs (get_feed, search_listings, get_listing, the
-- admin_* RPCs), which apply the private.hit rate limits, blocks and campus
-- scope. A plain SELECT over the REST API skipped the limits and let a script
-- page through a whole campus. No client reads these tables directly
-- (checked: apps/mobile, apps/admin, apps/site). The policies stay as a second
-- line of defense; security definer RPCs and views are not affected.
revoke select on public.listings, public.listing_photos from authenticated, anon;
