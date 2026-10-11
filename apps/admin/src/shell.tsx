// The console frame: fixed 232px sidebar (brand, campus picker, nav groups
// with counts, signed-in admin) and the page outlet. Pages render <Page>.
// Under 900px the sidebar is a drawer opened from a top bar (phone layout).
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { role } from './labels';
import { isActive, NAV } from './nav';
import { useSession } from './session';
import { Avatar, Button, EmptyState, Icon, Page } from './ui';

export function Shell() {
  const { who, signOut, campusId, setCampusId, campuses, counts } = useSession();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const owner = who.role === 'owner';
  const myCampus = campuses.find((c) => c.id === who.campus_id);
  const [menuOpen, setMenuOpen] = useState(false);
  const urgent = counts?.open_reports ?? 0;

  // The drawer closes on navigation and on Escape.
  useEffect(() => setMenuOpen(false), [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className={`app${menuOpen ? ' menu-open' : ''}`}>
      <header className="mbar">
        <button
          type="button"
          className="btn ghost mbar-menu"
          aria-label={
            menuOpen ? 'Close menu' : urgent ? `Open menu, ${urgent} open reports` : 'Open menu'
          }
          aria-expanded={menuOpen}
          aria-controls="admin-side"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <Icon name={menuOpen ? 'x' : 'menu'} />
          {urgent && !menuOpen ? <span className="mbar-dot" aria-hidden="true" /> : null}
        </button>
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          OnlySwap<small>Admin</small>
        </div>
      </header>
      {menuOpen ? (
        <div className="scrim" aria-hidden="true" onClick={() => setMenuOpen(false)} />
      ) : null}
      <aside className="side" id="admin-side" aria-label="Admin navigation">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          OnlySwap<small>Admin</small>
        </div>
        <div className="camp">
          {owner ? (
            <select
              value={campusId}
              onChange={(e) => setCampusId(e.target.value)}
              aria-label="Campus shown on every page"
            >
              <option value="">All campuses</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.is_demo ? ' (demo)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="fixed">{myCampus?.name ?? 'Your campus'}</div>
          )}
        </div>
        <nav className="nav">
          {NAV.map((g) => (
            <div key={g.label}>
              <div className="grp">{g.label}</div>
              {g.items
                .filter((i) => !i.ownerOnly || owner)
                .map((i) => {
                  const n = i.count && counts ? counts[i.count] : 0;
                  const on = isActive(i.to, path);
                  return (
                    <Link
                      key={i.to}
                      to={i.to}
                      className={on ? 'on' : ''}
                      aria-current={on ? 'page' : undefined}
                    >
                      <Icon name={i.icon} />
                      {i.label}
                      {n ? (
                        <span className={`c${i.quiet ? ' g' : ''}`} aria-label={`${n} waiting`}>
                          {n}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
            </div>
          ))}
        </nav>
        <div className="me">
          <Avatar initial={who.name?.slice(0, 1) ?? '?'} me />
          <div className="who-text">
            <div className="who-name">{who.name ?? 'Admin'}</div>
            <div className="muted small">{role(who.role)} · two-step on</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon name="logout" />
          </Button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

/** Unknown address: shown inside the shell with a way back (checklist §2). */
export function NotFoundPage() {
  return (
    <Page title="Page not found">
      <div className="card">
        <EmptyState title="There's no page at this address.">
          <p className="muted">It may have moved in the new console.</p>
          <Link className="btn primary" to="/">
            Back to Overview
          </Link>
        </EmptyState>
      </div>
    </Page>
  );
}

/** Placeholder for pages that land in the next step (nav works meanwhile). */
export function ComingSoon({ title, crumb }: { title: string; crumb?: string }) {
  return (
    <Page title={title} crumb={crumb}>
      <div className="card">
        <EmptyState title="Coming in the next step">
          <p className="muted">This page is being built. Everything else in the console works.</p>
        </EmptyState>
      </div>
    </Page>
  );
}
