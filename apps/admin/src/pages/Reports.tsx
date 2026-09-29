import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { allowedActions, formatWhen, type ReportAction, type Whoami } from '../logic';
import { rpc } from '../supabase';
import { ActionButton, Loadable, useRpc } from '../ui';

type ReportRow = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  priority: number;
  status: string;
  created_at: string;
  target_name: string | null;
  reports_on_target: number;
};

/** G-REPORTS queue (P12-ADM-05): priority first, oldest first. */
export function ReportsPage() {
  const [status, setStatus] = useState('open');
  const state = useRpc<ReportRow[]>('admin_list_reports', { filters: { status } });
  return (
    <>
      <h1>Reports</h1>
      <div className="row">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open</option>
            <option value="actioned">Actioned</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
      </div>
      <Loadable state={state} empty={(d) => d.length === 0}>
        {(rows) => (
          <table>
            <thead>
              <tr>
                <th>Priority</th>
                <th>Reason</th>
                <th>About</th>
                <th>Reports on it</th>
                <th>Filed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={`pill${r.priority === 1 ? ' p1' : ''}`}>P{r.priority}</span>
                  </td>
                  <td>
                    <Link to="/reports/$id" params={{ id: r.id }}>
                      {r.reason}
                    </Link>
                  </td>
                  <td>
                    {r.target_type}
                    {r.target_name ? `: ${r.target_name}` : ''}
                  </td>
                  <td>{r.reports_on_target}</td>
                  <td className="meta">{formatWhen(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loadable>
    </>
  );
}

type ReportDetail = ReportRow & {
  details: string | null;
  evidence: { text?: string; excerpts?: string[] } | null;
  reporter_name: string | null;
  action_taken: string | null;
  target: {
    id: string;
    display_name: string;
    status: string;
    strike_count: number;
    noshow_count: number;
  } | null;
  other_reports: number;
};

const ACTION_LABEL: Record<ReportAction, string> = {
  dismiss: 'Dismiss',
  remove_content: 'Remove content',
  warn: 'Warn',
  strike: 'Strike',
  suspend: 'Suspend',
  ban: 'Ban',
};

/** Report detail + actions; chats open only from a chat or message report (T-INT-ADMIN-04). */
export function ReportDetailPage({ who }: { who: Whoami }) {
  const { id } = useParams({ from: '/shell/reports/$id' });
  const state = useRpc<ReportDetail>('admin_report_detail', { id });
  const [days, setDays] = useState(7);
  const [chat, setChat] = useState<
    { id: number; sender: string | null; body: string; created_at: string }[] | null
  >(null);
  return (
    <>
      <p>
        <Link to="/reports">Back to reports</Link>
      </p>
      <Loadable state={state}>
        {(r) => (
          <>
            <h1>Report: {r.reason}</h1>
            <div className="card">
              <p>
                <span className={`pill${r.priority === 1 ? ' p1' : ''}`}>P{r.priority}</span>{' '}
                {r.status}
                {r.action_taken ? ` (${r.action_taken})` : ''}
              </p>
              <p className="meta">
                Filed {formatWhen(r.created_at)} by {r.reporter_name ?? 'a deleted account'} about a{' '}
                {r.target_type}
              </p>
              {r.details ? <p>{r.details}</p> : null}
              {r.evidence?.text ? <p className="bubble">{r.evidence.text}</p> : null}
              {(r.evidence?.excerpts ?? []).map((x, i) => (
                <p key={i} className="bubble">
                  {x}
                </p>
              ))}
            </div>
            {r.target ? (
              <div className="card">
                <h2>Person</h2>
                <p>
                  <Link to="/users/$id" params={{ id: r.target.id }}>
                    {r.target.display_name}
                  </Link>{' '}
                  <span className="pill">{r.target.status}</span>
                </p>
                <p className="meta">
                  {r.target.strike_count} strikes, {r.target.noshow_count} no-shows,{' '}
                  {r.other_reports} other reports
                </p>
              </div>
            ) : null}
            {r.target_type === 'chat' || r.target_type === 'message' ? (
              <div className="card">
                <h2>Chat</h2>
                {chat ? (
                  chat.map((m) => (
                    <div key={m.id} className="bubble">
                      <strong>{m.sender ?? 'System'}</strong>{' '}
                      <span className="meta">{formatWhen(m.created_at)}</span>
                      <div>{m.body}</div>
                    </div>
                  ))
                ) : (
                  <ActionButton
                    label="Read this chat"
                    kind="secondary"
                    needsReason={false}
                    run={async () =>
                      setChat(await rpc('admin_read_reported_chat', { report_id: r.id }))
                    }
                  />
                )}
                <p className="meta">Opening a chat is written to the audit log.</p>
              </div>
            ) : null}
            {r.status === 'open' ? (
              <div className="card">
                <h2>Decide</h2>
                <div className="row">
                  <label>
                    Suspend days
                    <input
                      type="number"
                      min={1}
                      max={who.role === 'owner' ? 365 : 7}
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                    />
                  </label>
                  {allowedActions(who.role ?? 'moderator', r.target_type).map((a) => (
                    <ActionButton
                      key={a}
                      label={ACTION_LABEL[a]}
                      kind={
                        a === 'ban' || a === 'suspend'
                          ? 'danger'
                          : a === 'dismiss'
                            ? 'secondary'
                            : undefined
                      }
                      run={(note) =>
                        rpc('admin_resolve_report', {
                          id: r.id,
                          action: a,
                          note,
                          suspend_days: days,
                        })
                      }
                      onDone={state.reload}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Loadable>
    </>
  );
}

type Appeal = {
  id: string;
  user_id: string;
  user_name: string;
  subject_type: string;
  subject_id: string;
  body: string;
  created_at: string;
};

/** G-APPEALS (P12-ADM-05). */
export function AppealsPage() {
  const state = useRpc<Appeal[]>('admin_list_appeals', { filters: { status: 'open' } });
  return (
    <>
      <h1>Appeals</h1>
      <Loadable state={state} empty={(d) => d.length === 0}>
        {(rows) =>
          rows.map((ap) => (
            <div key={ap.id} className="card">
              <p>
                <Link to="/users/$id" params={{ id: ap.user_id }}>
                  {ap.user_name}
                </Link>{' '}
                appeals a {ap.subject_type}{' '}
                <span className="meta">{formatWhen(ap.created_at)}</span>
              </p>
              <p>{ap.body}</p>
              <div className="row">
                <ActionButton
                  label="Overturn"
                  run={(note) =>
                    rpc('admin_decide_appeal', { id: ap.id, decision: 'overturned', note })
                  }
                  onDone={state.reload}
                />
                <ActionButton
                  label="Uphold"
                  kind="secondary"
                  run={(note) =>
                    rpc('admin_decide_appeal', { id: ap.id, decision: 'upheld', note })
                  }
                  onDone={state.reload}
                />
              </div>
            </div>
          ))
        }
      </Loadable>
    </>
  );
}
