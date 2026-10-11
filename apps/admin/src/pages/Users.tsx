import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import {
  appealStatus,
  appealSubject,
  classYear,
  listingStatus,
  platform,
  plural,
  reportReason,
  reportStatus,
  USER_STATUS_OPTIONS,
  userStatus,
  YEAR_OPTIONS,
} from '../labels';
import {
  changeEmailError,
  dateLabel,
  errorMessage,
  knownError,
  maxUntil,
  needsUntil,
  timeAgo,
  toCsv,
  whenLabel,
} from '../logic';
import { useCampusId, useSession, useWho } from '../session';
import { rpc } from '../supabase';
import type { UserV2 } from '../types';
import {
  ActionButton,
  Avatar,
  Button,
  Card,
  downloadCsv,
  EmptyState,
  Field,
  FilterChip,
  Icon,
  Loadable,
  Page,
  Pager,
  PersonCell,
  Pill,
  ReasonActions,
  StatusPill,
  Table,
  useRpc,
  type ReasonAction,
} from '../ui';

type UsersV2 = { items: UserV2[]; total: number; next_cursor: number | null };

const SORTS = [
  { id: 'last_active', label: 'Last active' },
  { id: 'joined', label: 'Newest' },
  { id: 'name', label: 'Name' },
  { id: 'reports', label: 'Most reported' },
] as const;

const CSV_COLS = [
  'id',
  'display_name',
  'status',
  'campus',
  'email',
  'year',
  'swipes',
  'offers',
  'deals',
  'reports',
  'joined_at',
  'last_active_at',
];

/** People list (admin_list_users_v2): status colors, campus, email, year, counts, last active. */
export function UsersPage() {
  const who = useWho();
  const owner = who.role === 'owner';
  const sideCampus = useCampusId();
  const { campuses } = useSession();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '', year: '', sort: 'last_active' });
  // null follows the sidebar campus until a campus is picked here.
  const [campus, setCampus] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const campusId = campus ?? sideCampus ?? '';
  const state = useRpc<UsersV2>('admin_list_users_v2', {
    filters: { ...filters, campus_id: campusId },
    cursor,
  });
  const set = (patch: Partial<typeof filters>) => {
    setFilters({ ...filters, ...patch });
    setCursor(0);
  };
  const total = state.data?.total;

  return (
    <Page
      title="People"
      crumb={total !== undefined ? plural(total, 'student') : undefined}
      actions={
        <Button
          icon="down"
          disabled={!state.data?.items.length}
          onClick={() =>
            downloadCsv(
              'onlyswap-people',
              toCsv(
                (state.data?.items ?? []).map((u) => ({
                  ...u,
                  campus: u.campus?.short_name ?? '',
                })),
                CSV_COLS,
              ),
            )
          }
        >
          CSV
        </Button>
      }
    >
      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: q.trim() });
        }}
      >
        <FilterChip icon="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => q.trim() !== filters.q && set({ q: q.trim() })}
            placeholder={owner ? 'Name or exact email' : 'Name'}
            aria-label={owner ? 'Search by name or exact email' : 'Search by name'}
            style={{ width: 170 }}
          />
        </FilterChip>
        <FilterChip label="Status">
          <select value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All</option>
            {USER_STATUS_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </FilterChip>
        {owner ? (
          <FilterChip label="Campus">
            <select
              value={campusId}
              onChange={(e) => {
                setCampus(e.target.value);
                setCursor(0);
              }}
            >
              <option value="">All</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.short_name || c.name}
                </option>
              ))}
            </select>
          </FilterChip>
        ) : null}
        <FilterChip label="Year">
          <select value={filters.year} onChange={(e) => set({ year: e.target.value })}>
            <option value="">All</option>
            {YEAR_OPTIONS.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
        </FilterChip>
        <FilterChip label="Sort">
          <select value={filters.sort} onChange={(e) => set({ sort: e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </FilterChip>
        <button type="submit" className="sr-only">
          Search
        </button>
      </form>
      <Card>
        <Loadable
          state={state}
          rows={8}
          empty={(d) => d.items.length === 0}
          emptyText="No students match these filters."
        >
          {(d) => (
            <>
              <Table
                label="Students"
                columns={[
                  'Student',
                  'Status',
                  'Campus',
                  'Year',
                  { label: 'Swipes', num: true },
                  { label: 'Offers', num: true },
                  { label: 'Deals', num: true },
                  { label: 'Reports', num: true },
                  'Joined',
                  'Last active',
                ]}
              >
                {d.items.map((u) => (
                  <tr
                    key={u.id}
                    className="click"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a')) return;
                      void navigate({ to: '/people/$id', params: { id: u.id } });
                    }}
                  >
                    <td>
                      <PersonCell person={u} sub={u.email ?? undefined} />
                    </td>
                    <td>
                      <StatusPill {...userStatus(u.status)} />
                    </td>
                    <td className="ink2">{u.campus?.short_name ?? ''}</td>
                    <td className="ink2">{classYear(u.year)}</td>
                    <td className="num">{u.swipes.toLocaleString('en-US')}</td>
                    <td className="num">{u.offers.toLocaleString('en-US')}</td>
                    <td className="num">{u.deals.toLocaleString('en-US')}</td>
                    <td className="num">
                      {u.reports ? <span className="error strong">{u.reports}</span> : '0'}
                    </td>
                    <td className="muted">{dateLabel(u.joined_at)}</td>
                    <td className="muted" title={u.last_platform ? platform(u.last_platform) : ''}>
                      {u.last_active_at ? timeAgo(u.last_active_at) : 'Never'}
                    </td>
                  </tr>
                ))}
              </Table>
              <Pager
                info={`${cursor + 1} to ${cursor + d.items.length} of ${d.total.toLocaleString('en-US')}`}
                hasPrev={cursor > 0}
                hasNext={d.next_cursor !== null}
                onPrev={() => setCursor(Math.max(0, cursor - 50))}
                onNext={() => setCursor(d.next_cursor ?? cursor)}
              />
            </>
          )}
        </Loadable>
      </Card>
    </Page>
  );
}
