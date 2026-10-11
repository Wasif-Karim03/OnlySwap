import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { campusStatus, plural } from '../labels';
import { errorMessage, knownError, reasonError, thresholdPct, timeAgo } from '../logic';
import { useIsOwner, useSession } from '../session';
import { rpc } from '../supabase';
import type { WaitlistDemand } from '../types';
import { Bar, Button, Card, Dialog, Field, Loadable, Page, StatusPill, Table, useRpc } from '../ui';

type School = WaitlistDemand['schools'][number];

/**
 * Waitlist demand (DEC 93): sign-ups by school email domain, so the owner can
 * see which school to open next, open a waitlist campus in one step, or add a
 * school that isn't a campus yet.
 */
export function WaitlistPage() {
  const owner = useIsOwner();
  const navigate = useNavigate();
  const { refreshCounts } = useSession();
  const state = useRpc<WaitlistDemand>('admin_waitlist_demand');
  const [opening, setOpening] = useState<School | null>(null);

  return (
    <Page
      title="Waitlist"
      crumb={
        state.data ? `${plural(state.data.total_requests, 'request')} waiting` : 'Demand by school'
      }
    >
      <p className="note">
        Requests are website and app sign-ups we haven't told yet. Waiting students already have an
        account on a waitlist campus. A campus opens on its own at its threshold, or here by hand.
      </p>
      <Card>
        <Loadable
          state={state}
          rows={6}
          empty={(d) => d.schools.length === 0}
          emptyText="Nobody is waiting for a school yet."
        >
          {(d) => (
            <Table
              label="Demand by school"
              columns={[
                'School',
                'Email domain',
                'Status',
                { label: 'Requests', num: true },
                { label: 'Waiting students', num: true },
                'Toward opening',
                'Newest',
                { label: '', className: 'actions' },
              ]}
            >
              {d.schools.map((s) => {
                const pct = s.campus ? thresholdPct(s.total, s.campus.unlock_threshold) : 0;
                return (
                  <tr key={s.domain}>
                    <td className="strong">
                      {s.campus?.name ?? s.school_guess ?? (
                        <span className="muted">Unknown school</span>
                      )}
                    </td>
                    <td className="ink2 mono">{s.domain}</td>
                    <td>
                      {s.campus ? (
                        <StatusPill {...campusStatus({ status: s.campus.status })} />
                      ) : (
                        <span className="muted">Not a campus yet</span>
                      )}
                    </td>
                    <td className="num">{s.requests.toLocaleString('en-US')}</td>
                    <td className="num">{s.members_waiting.toLocaleString('en-US')}</td>
                    <td style={{ minWidth: 190 }}>
                      {s.campus && s.campus.unlock_threshold ? (
                        <span className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                          <span style={{ flex: 1 }}>
                            <Bar pct={pct} lime />
                          </span>
                          <span className="muted tnum small">
                            {s.total}/{s.campus.unlock_threshold}
                          </span>
                        </span>
                      ) : (
                        <span className="muted">
                          {s.campus
                            ? 'Opened by hand'
                            : `${s.total.toLocaleString('en-US')} so far`}
                        </span>
                      )}
                    </td>
                    <td className="muted">{s.newest_at ? timeAgo(s.newest_at) : ''}</td>
                    <td className="actions">
                      {owner && s.campus?.status === 'waitlist' ? (
                        <Button size="sm" variant="primary" onClick={() => setOpening(s)}>
                          Open school
                        </Button>
                      ) : null}
                      {owner && !s.campus ? (
                        <Button
                          size="sm"
                          icon="plus"
                          onClick={() =>
                            void navigate({
                              to: '/campuses',
                              search: { add: '1', domain: s.domain, name: s.school_guess ?? '' },
                            })
                          }
                        >
                          Add as school
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Loadable>
      </Card>
      {opening?.campus ? (
        <OpenSchool
          s={opening}
          onClose={() => setOpening(null)}
          onDone={() => {
            state.reload();
            refreshCounts();
          }}
        />
      ) : null}
    </Page>
  );
}

function OpenSchool({
  s,
  onClose,
  onDone,
}: {
  s: School;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const campus = s.campus!;
  return (
    <Dialog title={`Open ${campus.name}?`} onClose={onClose}>
      <div className="cb stack tight">
        <p>
          {plural(s.members_waiting, 'waiting student')} get in right away and get a push. The{' '}
          {plural(s.requests, 'waitlist request')} get the campus open email.
        </p>
        <p className="muted">
          This is the same step as reaching the threshold. It can't be undone from here (pause the
          campus instead).
        </p>
        <Field label="Reason (saved to the audit log)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
        </Field>
        {msg ? <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p> : null}
      </div>
      <div className="cf">
        <span className="spacer" />
        <Button variant="ghost" onClick={onClose}>
          {msg?.ok ? 'Close' : 'Cancel'}
        </Button>
        {!msg?.ok ? (
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              const invalid = reasonError(reason);
              if (invalid) return setMsg({ ok: false, text: invalid });
              setBusy(true);
              setMsg(null);
              try {
                const r = await rpc<{ opened: boolean; members_activated: number }>(
                  'admin_open_campus',
                  { campus_id: campus.id, reason: reason.trim() },
                );
                setMsg({
                  ok: true,
                  text: `${campus.name} is open. ${plural(r.members_activated, 'student')} let in.`,
                });
                onDone();
              } catch (e) {
                setMsg({
                  ok: false,
                  text:
                    knownError(e, { 'INVALID:status': 'This campus is not on the waitlist.' }) ||
                    errorMessage(e),
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Open school
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
