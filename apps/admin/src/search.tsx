// Top bar search (⌘K): people, listings and reports through admin_search.
import { Link, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { reportReason, targetType, userStatus } from './labels';
import { errorMessage, timeAgo } from './logic';
import { rpc } from './supabase';
import type { SearchResult } from './types';
import { Avatar, Icon, ListingCell, StatusPill } from './ui';

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });

  // ⌘K / Ctrl+K focuses the box from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close on navigation and on clicks outside.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRes(null);
      setError(null);
      return;
    }
    const t = setTimeout(() => {
      rpc<SearchResult>('admin_search', { q: term.slice(0, 80) })
        .then((r) => {
          setRes(r);
          setError(null);
        })
        .catch((e: unknown) => setError(errorMessage(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const empty =
    res && res.people.length === 0 && res.listings.length === 0 && res.reports.length === 0;

  return (
    <div className="search" ref={box}>
      <div className="search-box">
        <Icon name="search" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              input.current?.blur();
            }
          }}
          placeholder="Search people, listings, reports"
          aria-label="Search people, listings and reports"
          type="search"
        />
        <kbd aria-hidden="true">⌘K</kbd>
      </div>
      {open && q.trim().length >= 2 ? (
        <div className="pop" role="listbox" aria-label="Search results">
          {error ? <div className="empty error">{error}</div> : null}
          {!res && !error ? <div className="empty">Searching…</div> : null}
          {empty ? <div className="empty">No matches for "{q.trim()}"</div> : null}
          {res?.people.length ? <div className="grp">People</div> : null}
          {res?.people.map((p) => (
            <Link key={p.id} to="/people/$id" params={{ id: p.id }}>
              <Avatar initial={p.initial} seed={p.id} />
              <span className="strong">{p.display_name}</span>
              <span className="muted small">{p.campus?.short_name ?? ''}</span>
              <span className="spacer" />
              <StatusPill {...userStatus(p.status)} />
            </Link>
          ))}
          {res?.listings.length ? <div className="grp">Listings</div> : null}
          {res?.listings.map((l) => (
            <Link key={l.id} to="/listings/$id" params={{ id: l.id }}>
              <ListingCell listing={l} />
              <span className="spacer" />
              <span className="muted small">{l.campus?.short_name ?? ''}</span>
            </Link>
          ))}
          {res?.reports.length ? <div className="grp">Reports</div> : null}
          {res?.reports.map((r) => (
            <Link key={r.id} to="/reports/$id" params={{ id: r.id }}>
              <StatusPill {...reportReason(r.reason)} />
              <span>{targetType(r.target_type)}</span>
              <span className="spacer" />
              <span className="muted small">{timeAgo(r.created_at)}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
