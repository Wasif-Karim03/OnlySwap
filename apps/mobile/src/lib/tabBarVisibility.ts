import { useSegments } from 'expo-router';

/**
 * Which tab routes hide the bottom tab bar (QA M1). Form flows pushed inside a
 * tab (Sell steps after the first, Edit profile) need the height for their
 * fields and pinned button, so the bar goes away until the user backs out.
 */

/** Tab name -> nested route names that hide the bar. */
const FORM_ROUTES: Readonly<Record<string, readonly string[]>> = {
  sell: ['details', 'food', 'news', 'wanted', 'meetup', 'scan', 'posted'],
  profile: ['edit'],
};

/** The minimal shape of a React Navigation tab route with its nested stack. */
export type TabRouteLike = {
  name: string;
  state?: { index?: number; routes: readonly { name: string }[] };
};

/** The focused screen inside a tab's stack, or undefined on its first screen. */
function focusedChild(route: TabRouteLike): string | undefined {
  const nested = route.state;
  if (!nested || nested.routes.length === 0) return undefined;
  const index = nested.index ?? nested.routes.length - 1;
  return nested.routes[index]?.name;
}

/** True when `child` inside tab `tab` is a form route that hides the bar. */
export function isFormRoute(tab: string | undefined, child: string | undefined): boolean {
  if (!tab || !child) return false;
  return FORM_ROUTES[tab]?.includes(child) ?? false;
}

/** True when the focused tab is showing one of its form routes. */
export function hidesTabBar(route: TabRouteLike): boolean {
  return isFormRoute(route.name, focusedChild(route));
}

/**
 * True when the current screen sits under a hidden tab bar, so its dock must
 * pad for the home indicator itself (`DockedScroll standalone`).
 */
export function useHidesTabBar(): boolean {
  const segments = useSegments() as readonly string[];
  const at = segments.indexOf('(tabs)');
  if (at < 0) return false;
  return isFormRoute(segments[at + 1], segments[at + 2]);
}
