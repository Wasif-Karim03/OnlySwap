// Filter pickers backed by admin_search: pick one person or one listing
// (Activity page filters). Shows the pick as a chip with a clear button.
import { useEffect, useRef, useState } from 'react';

import { errorMessage } from './logic';
import { rpc } from './supabase';
import type { SearchResult } from './types';
import { Avatar, Icon, ListingCell } from './ui';

export type Picked = { id: string; label: string } | null;

export function SearchPicker({
  kind,
  label,
  value,
  onChange,
  anyLabel,
}: {
  kind: 'people' | 'listings';
  label: string;
  value: Picked;
  onChange: (v: Picked) => void;
  anyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const pick = (v: Picked) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };
  const list = kind === 'people' ? (res?.people ?? []) : (res?.listings ?? []);

  return (
    <div className="picker" ref={box}>
      <span className="fchip">
        <button
          type="button"
          className="chip-btn"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {label} <b>{value ? value.label : anyLabel}</b>
        </button>
        {value ? (
          <button
            type="button"
            className="chip-x"
            aria-label={`Clear ${label.toLowerCase()} filter`}
            onClick={() => pick(null)}
          >
            <Icon name="x" />
          </button>
        ) : null}
      </span>
      {open ? (
        <div className="pop picker-pop" role="listbox" aria-label={`Pick a ${label.toLowerCase()}`}>
          <div className="search-box in-pop">
            <Icon name="search" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
              placeholder={kind === 'people' ? 'Type a name' : 'Type a listing title'}
              aria-label={kind === 'people' ? 'Search people' : 'Search listings'}
            />
          </div>
          {error ? <div className="empty error">{error}</div> : null}
          {q.trim().length < 2 ? <div className="empty">Type 2 or more letters.</div> : null}
          {res && list.length === 0 ? <div className="empty">No matches.</div> : null}
          {kind === 'people'
            ? res?.people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={value?.id === p.id}
                  onClick={() => pick({ id: p.id, label: p.display_name ?? 'No name' })}
                >
                  <Avatar initial={p.initial} seed={p.id} />
                  <span className="strong">{p.display_name}</span>
                  <span className="muted small">{p.campus?.short_name ?? ''}</span>
                </button>
              ))
            : res?.listings.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="option"
                  aria-selected={value?.id === l.id}
                  onClick={() => pick({ id: l.id, label: l.title })}
                >
                  <ListingCell listing={l} />
                </button>
              ))}
        </div>
      ) : null}
    </div>
  );
}
