import { useState } from 'react';

import { deletionStatus, exportStatus } from '../labels';
import { dateLabel, durationLabel, whenLabel } from '../logic';
import type { DeletionsExports } from '../types';
import {
  Card,
  EmptyState,
  Kpi,
  Loadable,
  Pager,
  PersonCell,
  Pill,
  StatusPill,
  Table,
  useRpc,
} from '../ui';

/** Account deletions and data exports (owner, admin_list_deletions_exports). */
export function DataRequestsSection() {
  const [cursor, setCursor] = useState(0);
  const state = useRpc<DeletionsExports>('admin_list_deletions_exports', { cursor });
  return (
    <Loadable state={state} rows={8}>
      {(d) => (
        <>
          <div className="kpis k4" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            <Kpi label="Accounts deleted, 30 days" value={d.counts.deletions_30d} />
            <Kpi label="Age-check removals, 30 days" value={d.counts.underage_30d} />
            <Kpi
              label="Deletions stuck"
              value={d.counts.stuck ? <span className="error">{d.counts.stuck}</span> : 0}
              delta={d.counts.stuck ? 'Running for over an hour' : 'None'}
              dir={d.counts.stuck ? 'down' : 'flat'}
            />
            <Kpi label="Data exports, 30 days" value={d.counts.exports_30d} />
            <Kpi
              label="Exports failed, 30 days"
              value={
                d.counts.exports_failed_30d ? (
                  <span className="error">{d.counts.exports_failed_30d}</span>
                ) : (
                  0
                )
              }
            />
          </div>
          <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' }}>
            <Card title="Account deletions">
              {d.deletions.length ? (
                <Table
                  label="Account deletions"
                  columns={['Account', 'Campus', 'Status', 'Started', 'Took']}
                >
                  {d.deletions.map((x) => (
                    <tr key={x.id}>
                      <td>
                        {x.person ? (
                          <PersonCell person={x.person} />
                        ) : (
                          <span className="muted">Gone, no name kept</span>
                        )}
                        {x.underage ? (
                          <span style={{ marginLeft: 8 }}>
                            <Pill tone="lilac" dot={false} label="Age check" />
                          </span>
                        ) : null}
                      </td>
                      <td className="ink2">{x.campus?.short_name ?? ''}</td>
                      <td>
                        <StatusPill {...deletionStatus(x)} />
                      </td>
                      <td className="muted">{whenLabel(x.started_at)}</td>
                      <td className="muted">{durationLabel(x.started_at, x.finished_at)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <EmptyState title="No deletions yet." />
              )}
            </Card>
            <Card title="Data exports">
              {d.exports.length ? (
                <Table label="Data exports" columns={['Student', 'Status', 'Asked', 'Link until']}>
                  {d.exports.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <PersonCell person={x.person} />
                      </td>
                      <td>
                        <StatusPill {...exportStatus(x.status)} />
                      </td>
                      <td className="muted">{whenLabel(x.created_at)}</td>
                      <td className="muted">{x.expires_at ? dateLabel(x.expires_at) : ''}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <EmptyState title="No exports yet." />
              )}
            </Card>
          </div>
          <Pager
            hasPrev={cursor > 0}
            hasNext={d.deletions.length === 50 || d.exports.length === 50}
            onPrev={() => setCursor(Math.max(0, cursor - 50))}
            onNext={() => setCursor(d.next_cursor ?? cursor + 50)}
          />
          <p className="note">
            Deletion records keep no name or email: the account id is cleared when the deletion
            finishes, and the record is kept 365 days. A deletion still running after an hour is
            stuck and needs a look in the Edge Function logs.
          </p>
        </>
      )}
    </Loadable>
  );
}
