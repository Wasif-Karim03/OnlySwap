import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { formatWhen, maxUntil, type Whoami } from '../logic';
import { rpc } from '../supabase';
import { ActionButton, Loadable, useRpc } from '../ui';

type UserRow = {
  id: string;
  display_name: string;
  status: string;
  strike_count: number;
  noshow_count: number;
  created_at: string;
};

/** G-USERS (P12-ADM-06): search by name (the owner can also look up an exact email). */
export function UsersPage({ who }: { who: Whoami }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [filters, setFilters] = useState({ q: '', status: '' });
  const state = useRpc<UserRow[]>('admin_list_users', { filters });
  return (
    <>
      <h1>Users</h1>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ q, status });
        }}
      >
        <label>
          {who.role === 'owner' ? 'Name or exact email' : 'Name'}
          <input value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
        </label>
        <button type="submit">Search</button>
      </form>
      <Loadable state={state} empty={(d) => d.length === 0}>
        {(rows) => (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Strikes</th>
                <th>No-shows</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to="/users/$id" params={{ id: u.id }}>
                      {u.display_name}
                    </Link>
                  </td>
                  <td>
                    <span className="pill">{u.status}</span>
                  </td>
                  <td>{u.strike_count}</td>
                  <td>{u.noshow_count}</td>
                  <td className="meta">{formatWhen(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loadable>
    </>
  );
}

type UserDetail = UserRow & {
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

/** G-USER detail (P12-ADM-06). Opening it is logged. */
export function UserDetailPage({ who }: { who: Whoami }) {
  const { id } = useParams({ from: '/shell/users/$id' });
  const state = useRpc<UserDetail>('admin_user_detail', { id });
  const limit = maxUntil(who.role ?? 'moderator', new Date());
  const [until, setUntil] = useState(() =>
    new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
  );
  const [email, setEmail] = useState('');
  return (
    <Loadable state={state}>
      {(u) => (
        <>
          <p>
            <Link to="/users">Back to users</Link>
          </p>
          <h1>{u.display_name}</h1>
          <div className="card">
            <p>
              <span className="pill">{u.status}</span>
              {u.paused_until ? ` until ${formatWhen(u.paused_until)}` : ''}{' '}
              {u.status_reason ? `(${u.status_reason})` : ''}
            </p>
            <p className="meta">
              Joined {formatWhen(u.created_at)}. Verified until {formatWhen(u.verified_until)}.{' '}
              {u.strike_count} strikes, {u.noshow_count} no-shows.
            </p>
            {u.email ? <p className="meta">Email: {u.email}</p> : null}
          </div>
          <div className="card">
            <h2>Account</h2>
            <div className="row">
              <label>
                Until
                <input
                  type="date"
                  value={until}
                  max={limit ? limit.toISOString().slice(0, 10) : undefined}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
              <ActionButton
                label="Pause"
                run={(reason) =>
                  rpc('admin_set_user_status', {
                    user_id: u.id,
                    status: 'paused',
                    until: `${until}T23:59:00Z`,
                    reason,
                  })
                }
                onDone={state.reload}
              />
              <ActionButton
                label="Suspend"
                kind="danger"
                run={(reason) =>
                  rpc('admin_set_user_status', {
                    user_id: u.id,
                    status: 'suspended',
                    until: `${until}T23:59:00Z`,
                    reason,
                  })
                }
                onDone={state.reload}
              />
              <ActionButton
                label="Make active"
                kind="secondary"
                run={(reason) =>
                  rpc('admin_set_user_status', {
                    user_id: u.id,
                    status: 'active',
                    until: null,
                    reason,
                  })
                }
                onDone={state.reload}
              />
              <ActionButton
                label="Ask to re-verify"
                kind="secondary"
                run={(reason) => rpc('admin_force_reverify', { user_id: u.id, reason })}
                onDone={state.reload}
              />
              {who.role === 'owner' ? (
                <ActionButton
                  label="Ban"
                  kind="danger"
                  run={(reason) =>
                    rpc('admin_set_user_status', {
                      user_id: u.id,
                      status: 'banned',
                      until: null,
                      reason,
                    })
                  }
                  onDone={state.reload}
                />
              ) : null}
            </div>
            {who.role === 'owner' ? (
              <div className="row" style={{ marginTop: 'var(--space-md)' }}>
                <label>
                  New school email (lost-access recovery)
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <ActionButton
                  label="Change email"
                  kind="secondary"
                  needsReason={false}
                  run={() => rpc('admin_change_email', { user_id: u.id, new_email: email })}
                  onDone={state.reload}
                />
              </div>
            ) : null}
          </div>
          <div className="card">
            <h2>Strikes</h2>
            {u.strikes.length === 0 ? <p className="meta">None</p> : null}
            {u.strikes.map((s) => (
              <p key={s.id}>
                {s.reason} <span className="meta">{formatWhen(s.created_at)}</span>{' '}
                {s.cleared_at ? (
                  <span className="pill">cleared</span>
                ) : (
                  <ActionButton
                    label="Clear"
                    kind="secondary"
                    run={(reason) => rpc('admin_clear_strike', { id: s.id, reason })}
                    onDone={state.reload}
                  />
                )}
              </p>
            ))}
          </div>
          <div className="card">
            <h2>Reports about them</h2>
            {u.reports_against.length === 0 ? <p className="meta">None</p> : null}
            {u.reports_against.map((r) => (
              <p key={r.id}>
                <Link to="/reports/$id" params={{ id: r.id }}>
                  {r.reason}
                </Link>{' '}
                <span className="pill">{r.status}</span>{' '}
                <span className="meta">{formatWhen(r.created_at)}</span>
              </p>
            ))}
          </div>
          <div className="card">
            <h2>Recent listings</h2>
            {u.listings.length === 0 ? <p className="meta">None</p> : null}
            {u.listings.map((l) => (
              <p key={l.id}>
                {l.title} <span className="pill">{l.status}</span>
              </p>
            ))}
          </div>
        </>
      )}
    </Loadable>
  );
}
