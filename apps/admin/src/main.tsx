import './styles.css';

import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { createContext, StrictMode, useContext } from 'react';
import { createRoot } from 'react-dom/client';

import { AdminGate } from './auth';
import type { Whoami } from './logic';
import { AnnouncementsPage } from './pages/Announcements';
import { BannedWordsPage } from './pages/BannedWords';
import { CampusPage } from './pages/Campus';
import { AuditPage, ConfigPage } from './pages/Config';
import { ListingsPage } from './pages/Listings';
import { MetricsPage } from './pages/Metrics';
import { OverviewPage } from './pages/Overview';
import { QuadPage } from './pages/Quad';
import { AppealsPage, ReportDetailPage, ReportsPage } from './pages/Reports';
import { TeamPage } from './pages/Team';
import { UserDetailPage, UsersPage } from './pages/Users';

const Session = createContext<{ who: Whoami; signOut: () => void } | null>(null);
const useWho = () => useContext(Session)!.who;

function Shell() {
  const { who, signOut } = useContext(Session)!;
  return (
    <div className="shell">
      <nav className="nav" aria-label="Admin">
        <strong style={{ padding: 'var(--space-sm) var(--space-md)' }}>OnlySwap admin</strong>
        <Link to="/">Overview</Link>
        <Link to="/metrics">Metrics</Link>
        <Link to="/reports">Reports</Link>
        <Link to="/appeals">Appeals</Link>
        <Link to="/users">Users</Link>
        <Link to="/listings">Listings</Link>
        <Link to="/quad">Quad</Link>
        <Link to="/banned-words">Banned words</Link>
        <Link to="/announcements">Announcements</Link>
        <Link to="/campuses">Campuses</Link>
        {who.role === 'owner' ? <Link to="/team">Team</Link> : null}
        <Link to="/config">Flags and config</Link>
        <Link to="/audit">Audit log</Link>
        <div className="who">
          {who.name} ({who.role})
          <br />
          <button className="link" onClick={signOut}>
            Sign out
          </button>
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

const root = createRootRoute({ component: () => <Outlet /> });
const shell = createRoute({ getParentRoute: () => root, id: 'shell', component: Shell });
const page = <P extends string>(path: P, component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => shell, path, component });

const routeTree = root.addChildren([
  shell.addChildren([
    page('/', OverviewPage),
    page('/metrics', () => <MetricsPage who={useWho()} />),
    page('/reports', ReportsPage),
    page('/reports/$id', () => <ReportDetailPage who={useWho()} />),
    page('/appeals', AppealsPage),
    page('/users', () => <UsersPage who={useWho()} />),
    page('/users/$id', () => <UserDetailPage who={useWho()} />),
    page('/listings', ListingsPage),
    page('/quad', () => <QuadPage who={useWho()} />),
    page('/banned-words', () => <BannedWordsPage who={useWho()} />),
    page('/announcements', () => <AnnouncementsPage who={useWho()} />),
    page('/campuses', () => <CampusPage who={useWho()} />),
    page('/team', () => <TeamPage who={useWho()} />),
    page('/config', () => <ConfigPage who={useWho()} />),
    page('/audit', AuditPage),
  ]),
]);

const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => <p className="pad">Page not found.</p>,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminGate>
      {(who, signOut) => (
        <Session.Provider value={{ who, signOut }}>
          <RouterProvider router={router} />
        </Session.Provider>
      )}
    </AdminGate>
  </StrictMode>,
);
