// The console frame: fixed 232px sidebar (brand, campus picker, nav groups
// with counts, signed-in admin) and the page outlet. Pages render <Page>.
// Under 900px the sidebar is a drawer opened from a top bar (phone layout).
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { STAGING } from './env';
import { role } from './labels';
import { isActive, NAV } from './nav';
import { useSession } from './session';
import { Avatar, Button, Icon, Page } from './ui';

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
        <Brand />
      </header>
      {menuOpen ? (
        <div className="scrim" aria-hidden="true" onClick={() => setMenuOpen(false)} />
      ) : null}
      <aside className="side" id="admin-side" aria-label="Admin navigation">
        <Brand />
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
              <div
                className="grp"
                title={!counts && g.items.some((i) => i.count) ? 'Counts unavailable' : undefined}
              >
                {g.label}
              </div>
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
            <div className="muted small">{role(who.role)}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="main">
        {counts?.priority_reports ? (
          <Link to="/reports" className="red-alert" role="alert">
            <Icon name="flag" />
            <span className="strong">
              Red alert: {counts.priority_reports} urgent report
              {counts.priority_reports === 1 ? '' : 's'}
            </span>
            <span>Flagged photos and safety reports. Review now.</span>
          </Link>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}

/** The logo, the word Admin and, on a staging build, a neutral Staging label. */
function Brand() {
  return (
    <div className="brand">
      <span className="mark" aria-hidden="true" />
      OnlySwap<small>Admin</small>
      {STAGING ? <span className="pill t-neutral nodot env-tag">Staging</span> : null}
    </div>
  );
}

/** Unknown address: shown inside the shell with the address and a way back (checklist §2). */
export function NotFoundPage() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <Page title="Page not found">
      <div className="not-found">
        <h2>No page at this address</h2>
        <p className="muted">
          <code>{path}</code> is not a page in this console.
        </p>
        <Link className="btn primary" to="/">
          Go to Overview
        </Link>
      </div>
    </Page>
  );
}
