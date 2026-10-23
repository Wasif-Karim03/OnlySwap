import { Link, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { ACTIVITY_GROUPS, eventDetails, eventKind, platform, plural } from '../labels';
import {
  ACTIVITY_CSV_COLS,
  ACTIVITY_RANGES,
  activityArgs,
  activityCsvRows,
  appendPage,
  errorMessage,
  kindsSummary,
  toCsv,
  toggleGroup,
  toggleItem,
  whenLabel,
  type ActivityRange,
} from '../logic';
import { SearchPicker, type Picked } from '../pickers';
import { useCampusId, useSession } from '../session';
import { rpc } from '../supabase';
import type { ActivityEvent, ActivityFeed } from '../types';
import {
  Button,
  Card,
  downloadCsv,
  EmptyState,
  ErrorState,
  EventIcon,
  FilterChip,
  Icon,
  ListingCell,
  Loading,
  LoggedNote,
  Page,
  PersonCell,
  Switch,
  Table,
} from '../ui';

/**
 * Activity (DEC 93): every action by every student, newest first, from
 * admin_activity_feed. Filtering by a person writes a profile view to the
 * audit log on the server. Message text is never shown.
 */
export function ActivityPage() {
  const sideCampus = useCampusId();
  const { campuses, who } = useSession();
  const owner = who.role === 'owner';
  const search = useSearch({ strict: false }) as Partial<Record<string, string>>;
  const [campus, setCampus] = useState<string | null>(null);
  const campusId = campus ?? sideCampus ?? '';
  const [kinds, setKinds] = useState<string[]>([]);
  const [person, setPerson] = useState<Picked>(
    search.user ? { id: search.user, label: search.user_name ?? 'One student' } : null,
  );
  const [listing, setListing] = useState<Picked>(
    search.listing ? { id: search.listing, label: search.listing_name ?? 'One listing' } : null,
  );
  const [range, setRange] = useState<ActivityRange>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [live, setLive] = useState(false);
  const [items, setItems] = useState<ActivityEvent[]>([]);
  const [next, setNext] = useState<ActivityFeed['next_cursor']>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const filters = {
    campusId,
    kinds,
    userId: person?.id ?? null,
    listingId: listing?.id ?? null,
    range,
    from,
    to,
  };
  const key = JSON.stringify(filters);
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = (quiet = false) => {
    const k = key;
    const t = Date.now();
    if (!quiet) setLoading(true);
    rpc<ActivityFeed>('admin_activity_feed', activityArgs({ ...filters, now: t }))
      .then((d) => {
        if (keyRef.current !== k) return;
        setItems(d.items);
        setNext(d.next_cursor);
        setError(null);
        setNow(t);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [key]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => load(true), 20_000);
    return () => clearInterval(t);
  }, [live, key]);

  const loadMore = () => {
    if (!next) return;
    setMore(true);
    rpc<ActivityFeed>('admin_activity_feed', activityArgs({ ...filters, now, cursor: next }))
      .then((d) => {
        setItems((shown) => appendPage(shown, d.items));
        setNext(d.next_cursor);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setMore(false));
  };

  return (
    <Page
      title="Activity"
      crumb="Every action, every student"
      actions={
        <Button
          icon="down"
          disabled={!items.length}
          onClick={() =>
            downloadCsv(
              'onlyswap-activity',
              toCsv(activityCsvRows(items, eventDetails), ACTIVITY_CSV_COLS),
            )
          }
        >
          Download rows on this page (CSV)
        </Button>
      }
    >
      <div className="filters">
        <KindPicker value={kinds} onChange={setKinds} />
        {owner ? (
          <FilterChip label="Campus">
            <select value={campusId} onChange={(e) => setCampus(e.target.value)}>
              <option value="">All</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.short_name || c.name}
                </option>
              ))}
            </select>
          </FilterChip>
        ) : null}
        <SearchPicker
          kind="people"
          label="Person"
          anyLabel="Anyone"
          value={person}
          onChange={setPerson}
        />
        <SearchPicker
          kind="listings"
          label="Listing"
          anyLabel="Any"
          value={listing}
          onChange={setListing}
        />
        <FilterChip label="Time">
          <select value={range} onChange={(e) => setRange(e.target.value as ActivityRange)}>
            {ACTIVITY_RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </FilterChip>
        {range === 'custom' ? (
          <>
            <FilterChip label="From">
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </FilterChip>
            <FilterChip label="To">
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </FilterChip>
          </>
        ) : null}
        <span className="spacer row" style={{ gap: 10 }}>
          <span className="muted">
            {loading && !items.length
              ? 'Loading'
              : `${plural(items.length, 'event')} shown${next ? ', more to load' : ''}`}
          </span>
          <label className="row" style={{ gap: 6 }}>
            <Switch checked={live} onChange={setLive} label="Refresh every 20 seconds" />
            <span className="ink2 small">Live</span>
          </label>
        </span>
      </div>
      {person ? (
        <LoggedNote>
          Showing one student's activity writes a profile view to the audit log.
        </LoggedNote>
      ) : null}
      <Card>
        {error ? (
          <ErrorState message={error} onRetry={() => load()} />
        ) : loading && !items.length ? (
          <Loading rows={10} />
        ) : !items.length ? (
          <EmptyState title="No activity matches these filters." />
        ) : (
          <>
            <Table
              label="Activity"
              columns={['Time', 'Student', 'Action', 'Listing', 'Details', 'Device']}
            >
              {items.map((e) => {
                const k = eventKind(e.kind);
                return (
                  <tr key={e.id}>
                    <td className="muted tnum" title={new Date(e.at).toLocaleString()}>
                      {whenLabel(e.at, now)}
                    </td>
                    <td>
                      <PersonCell person={e.person} />
                    </td>
                    <td>
                      <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <EventIcon tone={k.tone} icon={k.icon} />
                        {k.label}
                        {e.kind === 'deal_done' && e.other ? (
                          <span className="muted">
                            with{' '}
                            <Link className="link" to="/people/$id" params={{ id: e.other.id }}>
                              {e.other.display_name}
                            </Link>
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      {e.listing ? (
                        <Link to="/listings/$id" params={{ id: e.listing.id }}>
                          <ListingCell listing={e.listing} showPrice={false} />
                        </Link>
                      ) : e.kind === 'searched' && typeof e.details?.query === 'string' ? (
                        <span className="ink2">"{e.details.query}"</span>
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                    <td className="ink2 details">{eventDetails(e.kind, e.details)}</td>
                    <td className="muted">{platform(e.platform)}</td>
                  </tr>
                );
              })}
            </Table>
            {next ? (
              <div className="pager">
                <span className="muted">{plural(items.length, 'event')} loaded</span>
                <span className="spacer" />
                <Button size="sm" disabled={more} onClick={loadMore}>
                  {more ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
      <p className="note">
        Left swipes are kept 30 days and app events 90 days. Chats show as counts only; words open
        only from a report.
      </p>
    </Page>
  );
}

/** Type filter: groups with their kinds, any mix. None picked = everything but deck cards. */
export function KindPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  return (
    <div className="picker" ref={box}>
      <span className="fchip">
        <button
          type="button"
          className="chip-btn"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name="filter" />
          Type <b>{kindsSummary(value, ACTIVITY_GROUPS)}</b>
        </button>
        {value.length ? (
          <button
            type="button"
            className="chip-x"
            aria-label="Clear type filter"
            onClick={() => onChange([])}
          >
            <Icon name="x" />
          </button>
        ) : null}
      </span>
      {open ? (
        <div className="pop picker-pop" style={{ width: 380 }} aria-label="Pick types">
          {ACTIVITY_GROUPS.map((g) => {
            const on = g.kinds.filter((k) => value.includes(k)).length;
            return (
              <div key={g.id} className="kind-group">
                <label className="check head">
                  <input
                    type="checkbox"
                    checked={on === g.kinds.length}
                    ref={(el) => {
                      if (el) el.indeterminate = on > 0 && on < g.kinds.length;
                    }}
                    onChange={() => onChange(toggleGroup(value, g.kinds))}
                  />
                  {g.label}
                </label>
                {g.kinds.length > 1 ? (
                  <div className="checks">
                    {g.kinds.map((k) => (
                      <label key={k} className="check">
                        <input
                          type="checkbox"
                          checked={value.includes(k)}
                          onChange={() => onChange(toggleItem(value, k))}
                        />
                        {eventKind(k).label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          <div className="kind-group muted small">
            With nothing picked you see everything except cards shown in the deck.
          </div>
        </div>
      ) : null}
    </div>
  );
}
