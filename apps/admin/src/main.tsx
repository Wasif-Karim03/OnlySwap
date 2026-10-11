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
import { AnnouncementsPage } from './pages/Announcements';
import { AuditPage } from './pages/Audit';
import { CampusPage } from './pages/Campus';
import { ListingsPage } from './pages/Listings';
import { MetricsPage } from './pages/Metrics';
import { OverviewPage } from './pages/Overview';
import { QuadPage } from './pages/Quad';
import { AppealsPage, ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { UserDetailPage, UsersPage } from './pages/Users';
import { SessionProvider } from './session';
import { ComingSoon, NotFoundPage, Shell } from './shell';

// The root route is the shell, so unknown addresses render inside it.
const root = createRootRoute({ component: Shell, notFoundComponent: NotFoundPage });

/** One page = one file in src/pages + one line here + one entry in src/nav.ts. */
const page = <P extends string>(path: P, component: () => ReactNode) =>
  createRoute({ getParentRoute: () => root, path, component });

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
  page('/activity', () => <ComingSoon title="Activity" crumb="Every action, every student" />),
  page('/metrics', MetricsPage),
  // People and items
  page('/people', UsersPage),
  page('/people/$id', UserDetailPage),
  page('/listings', ListingsPage),
  page('/listings/$id', () => <ComingSoon title="Listings" crumb="Listing activity" />),
  // Safety
  page('/reports', ReportsPage),
  page('/reports/$id', ReportsPage),
  page('/appeals', AppealsPage),
  page('/quad', QuadPage),
  page('/audit', AuditPage),
  // Setup
  page('/campuses', CampusPage),
  page('/announcements', AnnouncementsPage),
  moved('/settings', '/settings/team'),
  page('/settings/team', () => <SettingsPage tab="team" />),
  page('/settings/words', () => <SettingsPage tab="words" />),
  page('/settings/switches', () => <SettingsPage tab="switches" />),
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
