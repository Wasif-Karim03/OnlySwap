// Sidebar groups (approved mock). Adding a page: one file in src/pages, one
// route in src/main.tsx, one entry here. See apps/admin/README.md.
import type { IconName } from './labels';
import type { NavCounts } from './session';

export type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  /** Badge from the nav counts; red unless `quiet`. */
  count?: keyof NavCounts;
  quiet?: boolean;
  ownerOnly?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: 'Monitor',
    items: [
      { to: '/', label: 'Overview', icon: 'home' },
      { to: '/activity', label: 'Activity', icon: 'pulse' },
      { to: '/metrics', label: 'Metrics', icon: 'chart' },
      { to: '/waitlist', label: 'Waitlist', icon: 'school' },
    ],
  },
  {
    label: 'People and items',
    items: [
      { to: '/people', label: 'People', icon: 'users' },
      { to: '/listings', label: 'Listings', icon: 'tag', count: 'held_listings', quiet: true },
    ],
  },
  {
    label: 'Safety',
    items: [
      { to: '/reports', label: 'Reports', icon: 'flag', count: 'open_reports' },
      { to: '/support', label: 'Support', icon: 'mail', count: 'support_open', quiet: true },
      { to: '/appeals', label: 'Appeals', icon: 'scale', count: 'appeals_open', quiet: true },
      { to: '/quad', label: 'Quad', icon: 'quad', count: 'quad_held', quiet: true },
      { to: '/meetups', label: 'Meetups', icon: 'pin' },
      { to: '/audit', label: 'Audit log', icon: 'log' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { to: '/campuses', label: 'Campuses', icon: 'school' },
      { to: '/announcements', label: 'Announcements', icon: 'book' },
      { to: '/settings', label: 'Settings', icon: 'gear' },
    ],
  },
];

/** Whether a nav item is the current page ("/" only matches itself). */
export function isActive(to: string, pathname: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}
