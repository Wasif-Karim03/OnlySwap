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

type UserDetail = {
  id: string;
  display_name: string;
  status: string;
  strike_count: number;
  noshow_count: number;
  created_at: string;
  status_reason: string | null;
  paused_until: string | null;
  verified_until: string | null;
  year: string | null;
  email: string | null;
  strikes: { id: string; reason: string; created_at: string; cleared_at: string | null }[];
  reports_against: { id: string; reason: string; status: string; created_at: string }[];
  appeals: { id: string; subject_type: string; status: string; created_at: string }[];
  listings: { id: string; title: string; status: string; created_at: string }[];
};

/**
 * One student (admin_user_detail). Part B replaces this with the full student
 * page (timeline and tabs). Opening it is logged.
 */
export function UserDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const who = useWho();
  const owner = who.role === 'owner';
  const state = useRpc<UserDetail>('admin_user_detail', { id });
  const limit = maxUntil(who.role ?? 'moderator', new Date());
  const [until, setUntil] = useState(() =>
    new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
  );
  const name = state.data?.display_name;

  const untilField = (
    <Field
      label="Until"
      hint={limit ? 'Moderators can pause or suspend for up to 7 days.' : undefined}
    >
      <input
        type="date"
        value={until}
        min={new Date().toISOString().slice(0, 10)}
        max={limit ? limit.toISOString().slice(0, 10) : undefined}
        onChange={(e) => setUntil(e.target.value)}
        style={{ width: 170 }}
      />
    </Field>
  );
  const setStatus =
    (status: string) =>
    (reason: string): Promise<unknown> =>
      rpc('admin_set_user_status', {
        user_id: id,
        status,
        until: needsUntil(status) ? `${until}T23:59:00Z` : null,
        reason,
      });

  return (
    <Page title="People" crumb={<>/ {name ?? '…'}</>}>
      <Loadable state={state} rows={6}>
        {(u) => {
          const actions: ReasonAction[] = [
            {
              id: 'paused',
              label: 'Pause',
              needsExtra: true,
              extra: untilField,
              run: setStatus('paused'),
            },
            {
              id: 'suspended',
              label: 'Suspend',
              variant: 'danger',
              needsExtra: true,
              extra: untilField,
              run: setStatus('suspended'),
            },
            ...(u.status !== 'active'
              ? [{ id: 'active', label: 'Make active', run: setStatus('active') }]
              : []),
            {
              id: 'reverify',
              label: 'Ask to re-verify',
              run: (reason: string) => rpc('admin_force_reverify', { user_id: u.id, reason }),
            },
            ...(owner && u.status !== 'banned'
              ? [
                  {
                    id: 'banned',
                    label: 'Ban',
                    variant: 'ban' as const,
                    confirm: `Ban ${u.display_name}? They lose access for good.`,
                    run: setStatus('banned'),
                  },
                ]
              : []),
          ];
          return (
            <>
              <div className="card pad row" style={{ gap: 16, padding: '18px 20px' }}>
                <Avatar initial={u.display_name.slice(0, 1)} seed={u.id} size="lg" />
                <div style={{ minWidth: 0 }}>
                  <div className="row">
                    <span style={{ fontSize: 20, fontWeight: 750, letterSpacing: '-0.02em' }}>
                      {u.display_name}
                    </span>
                    <StatusPill {...userStatus(u.status)} />
                    {u.year ? <Pill tone="neutral" dot={false} label={classYear(u.year)} /> : null}
                  </div>
                  <div className="ink2" style={{ marginTop: 3 }}>
                    {[
                      u.email,
                      `joined ${dateLabel(u.created_at)}`,
                      u.verified_until ? `verified until ${dateLabel(u.verified_until)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {u.paused_until || u.status_reason ? (
                    <div className="muted small" style={{ marginTop: 3 }}>
                      {u.paused_until ? `Until ${whenLabel(u.paused_until)}. ` : ''}
                      {u.status_reason ?? ''}
                    </div>
                  ) : null}
                </div>
                <div className="row spacer" style={{ gap: 28, textAlign: 'right' }}>
                  {[
                    ['Strikes', u.strike_count],
                    ['No-shows', u.noshow_count],
                    ['Reports on them', u.reports_against.length],
                    ['Listings', u.listings.length],
                  ].map(([l, v]) => (
                    <div key={l as string}>
                      <div style={{ fontSize: 18, fontWeight: 750 }}>{v}</div>
                      <div className="muted small">{l}</div>
                    </div>
                  ))}
                </div>
              </div>

              <Card title="Account actions">
                <div className="cb">
                  <ReasonActions actions={actions} onDone={state.reload} />
                </div>
              </Card>

              <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="stack">
                  <Card title="Reports about them">
                    {u.reports_against.length === 0 ? (
                      <EmptyState title="None" />
                    ) : (
                      u.reports_against.map((r) => (
                        <Link key={r.id} className="ev" to="/reports/$id" params={{ id: r.id }}>
                          <StatusPill {...reportReason(r.reason)} />
                          <StatusPill {...reportStatus(r.status)} dot={false} />
                          <span className="t">{whenLabel(r.created_at)}</span>
                        </Link>
                      ))
                    )}
                  </Card>
                  <Card title="Strikes">
                    {u.strikes.length === 0 ? (
                      <EmptyState title="None" />
                    ) : (
                      u.strikes.map((s) => (
                        <div key={s.id} className="ev">
                          <span>{s.reason}</span>
                          <span className="muted small">{dateLabel(s.created_at)}</span>
                          <span className="spacer" />
                          {s.cleared_at ? (
                            <Pill tone="neutral" label="Cleared" dot={false} />
                          ) : (
                            <ActionButton
                              label="Clear"
                              size="sm"
                              run={(reason) => rpc('admin_clear_strike', { id: s.id, reason })}
                              onDone={state.reload}
                            />
                          )}
                        </div>
                      ))
                    )}
                  </Card>
                  {u.appeals.length ? (
                    <Card title="Appeals">
                      {u.appeals.map((a) => (
                        <Link key={a.id} className="ev" to="/appeals">
                          <span>Appeal of {appealSubject(a.subject_type)}</span>
                          <StatusPill {...appealStatus(a.status)} />
                          <span className="t">{whenLabel(a.created_at)}</span>
                        </Link>
                      ))}
                    </Card>
                  ) : null}
                </div>
                <div className="stack">
                  <Card title="Recent listings">
                    {u.listings.length === 0 ? (
                      <EmptyState title="None" />
                    ) : (
                      u.listings.map((l) => (
                        <Link key={l.id} className="ev" to="/listings/$id" params={{ id: l.id }}>
                          <span className="strong">{l.title}</span>
                          <StatusPill {...listingStatus(l.status)} />
                          <span className="t">{dateLabel(l.created_at)}</span>
                        </Link>
                      ))
                    )}
                  </Card>
                  {owner ? <ChangeEmail userId={u.id} onDone={state.reload} /> : null}
                  <div className="lock">
                    <Icon name="lock" /> Opening this page was written to the audit log.
                  </div>
                </div>
              </div>
            </>
          );
        }}
      </Loadable>
    </Page>
  );
}

/** Owner only: move an account to a new school email (lost access). Needs a reason (checklist §2). */
function ChangeEmail({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Card title="Change school email">
      <form
        className="cb stack tight"
        onSubmit={async (e) => {
          e.preventDefault();
          const invalid = changeEmailError(email, reason);
          if (invalid) return setMsg({ ok: false, text: invalid });
          setBusy(true);
          setMsg(null);
          try {
            await rpc('admin_change_email', {
              user_id: userId,
              new_email: email.trim(),
              reason: reason.trim(),
            });
            setMsg({ ok: true, text: 'Sent. They confirm the new address with a code.' });
            setEmail('');
            setReason('');
            onDone();
          } catch (err) {
            setMsg({
              ok: false,
              text:
                knownError(err, {
                  'INVALID:new_email':
                    'Use a student address of a supported school that no other account uses.',
                  'INVALID:reason': 'Add a reason of at least 3 characters.',
                }) || errorMessage(err),
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="note">For a student who lost access to their school inbox.</p>
        <Field label="New school email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Reason (saved to the audit log)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
        </Field>
        <div className="row">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Change email'}
          </Button>
        </div>
        {msg ? <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p> : null}
      </form>
    </Card>
  );
}
