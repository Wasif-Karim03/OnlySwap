import type { SpotsMap as NativeSpotsMap } from './SpotsMap';

export type { MapSpot } from './SpotsMap';

/** Same as the native file; kept in step by the web shim test. */
export const MAX_ZOOM = 17;

/**
 * Web app (P13-WEB-07): no MapLibre in the browser bundle. The Meetup spot
 * list under the map is already the full, accessible UI (R11-MAP-01), so the
 * map section is simply left out.
 */
export const SpotsMap: typeof NativeSpotsMap = () => null;
