import './styles.css';

import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  RouterProvider,
} from '@tanstack/react-router';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { AdminGate } from './auth';
import { ActivityPage } from './pages/Activity';
import { AnnouncementsPage } from './pages/Announcements';
import { AuditPage } from './pages/Audit';
import { CampusPage } from './pages/Campus';
import { ListingDetailPage } from './pages/ListingDetail';
import { ListingsPage } from './pages/Listings';
import { MeetupsPage } from './pages/Meetups';
import { MetricsPage } from './pages/Metrics';
import { OverviewPage } from './pages/Overview';
import { PersonPage } from './pages/Person';
import { QuadPage } from './pages/Quad';
import { AppealsPage, ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { SupportPage } from './pages/Support';
import { UsersPage } from './pages/Users';
import { WaitlistPage } from './pages/Waitlist';
import { SessionProvider } from './session';
import { NotFoundPage, Shell } from './shell';

// The root route is the shell, so unknown addresses render inside it.
const root = createRootRoute({ component: Shell, notFoundComponent: NotFoundPage });

/** Search params as plain strings (?tab=offers&user=...); every key optional. */
export type SearchParams = { [key: string]: string | undefined };
const searchParams = (s: Record<string, unknown>): SearchParams =>
  Object.fromEntries(
    Object.entries(s)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  );

/** One page = one file in src/pages + one line here + one entry in src/nav.ts. */
const page = <P extends string>(path: P, component: () => ReactNode) =>
  createRoute({ getParentRoute: () => root, path, component, validateSearch: searchParams });

/** Old addresses keep working (bookmarks from the first console). */
const moved = <P extends string>(path: P, to: string) =>
  createRoute({
    getParentRoute: () => root,
    path,
    beforeLoad: () => {
      throw redirect({ to, replace: true });
    },
  });

const routeTree = root.addChildren([
  // Monitor
  page('/', OverviewPage),
  page('/activity', ActivityPage),
  page('/metrics', MetricsPage),
  page('/waitlist', WaitlistPage),
  // People and items
  page('/people', UsersPage),
  page('/people/$id', PersonPage),
  page('/listings', ListingsPage),
  page('/listings/$id', ListingDetailPage),
  // Safety
  page('/reports', ReportsPage),
  page('/reports/$id', ReportsPage),
  page('/support', SupportPage),
  page('/support/$id', SupportPage),
  page('/appeals', AppealsPage),
  page('/quad', QuadPage),
  page('/meetups', MeetupsPage),
  page('/audit', AuditPage),
  // Setup
  page('/campuses', CampusPage),
  page('/announcements', AnnouncementsPage),
  moved('/settings', '/settings/team'),
  page('/settings/team', () => <SettingsPage tab="team" />),
  page('/settings/words', () => <SettingsPage tab="words" />),
  page('/settings/switches', () => <SettingsPage tab="switches" />),
  page('/settings/data', () => <SettingsPage tab="data" />),
  page('/settings/health', () => <SettingsPage tab="health" />),
  page('/settings/review', () => <SettingsPage tab="review" />),
  page('/settings/blocked-emails', () => <SettingsPage tab="blocked-emails" />),
  page('/settings/categories', () => <SettingsPage tab="categories" />),
  // Old addresses
  moved('/users', '/people'),
  createRoute({
    getParentRoute: () => root,
    path: '/users/$id',
    beforeLoad: ({ params }) => {
      throw redirect({ to: '/people/$id', params: { id: params.id }, replace: true });
    },
  }),
  moved('/team', '/settings/team'),
  moved('/banned-words', '/settings/words'),
  moved('/config', '/settings/switches'),
]);

const router = createRouter({ routeTree, defaultNotFoundComponent: NotFoundPage });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminGate>
      {(who, signOut) => (
        <SessionProvider who={who} signOut={signOut}>
          <RouterProvider router={router} />
        </SessionProvider>
      )}
    </AdminGate>
  </StrictMode>,
);
