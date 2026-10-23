import { cronStatus, emailTemplate, plural } from '../labels';
import { ageLabel, bytesLabel, cronLabel, durationLabel, timeAgo, whenLabel } from '../logic';
import type { SystemHealth } from '../types';
import { Bar, Button, Card, EmptyState, Kpi, Loadable, StatusPill, Table, useRpc } from '../ui';

/** System health (owner, admin_system_health): email, push, scheduled jobs, database size. */
export function HealthSection() {
  const state = useRpc<SystemHealth>('admin_system_health');
  return (
    <>
      <div className="row">
        <span className="muted">
          {state.data ? `Checked ${timeAgo(state.data.generated_at).toLowerCase()}` : 'Checking…'}
        </span>
        <span className="spacer" />
        <Button icon="refresh" disabled={state.loading} onClick={state.reload}>
          {state.loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <Loadable state={state} rows={10}>
        {(h) => {
          const now = Date.parse(h.generated_at) || Date.now();
          const dbPct = h.storage.db_limit_bytes
            ? Math.round((h.storage.db_bytes / h.storage.db_limit_bytes) * 100)
            : 0;
          const cronFailing = h.cron.filter(
            (c) => c.last_run?.status === 'failed' || c.failures_24h > 0,
          ).length;
          return (
            <>
              <div className="kpis" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
                <Kpi
                  label="Emails waiting"
                  value={h.email.pending}
                  delta={
                    h.email.oldest_pending_at
                      ? `oldest ${ageLabel(h.email.oldest_pending_at, now)}`
                      : `${h.email.sent_24h} sent in 24 h`
                  }
                />
                <Kpi
                  label="Emails failed, 24 h"
                  value={
                    h.email.failed_24h ? <span className="error">{h.email.failed_24h}</span> : 0
                  }
                  delta={`${h.email.failed_total} failed in total`}
                  dir={h.email.failed_24h ? 'down' : 'flat'}
                />
                <Kpi
                  label="Push errors, 24 h"
                  value={h.push.errors_24h ? <span className="error">{h.push.errors_24h}</span> : 0}
                  delta={`${h.push.tickets_24h} sent · ${h.push.pending} waiting`}
                  dir={h.push.errors_24h ? 'down' : 'flat'}
                />
                <Kpi
                  label="Scheduled jobs failing"
                  value={cronFailing ? <span className="error">{cronFailing}</span> : 0}
                  delta={`${h.cron.length} jobs`}
                  dir={cronFailing ? 'down' : 'flat'}
                />
                <Kpi
                  label="Oldest open report"
                  value={
                    h.reports.oldest_open_at ? ageLabel(h.reports.oldest_open_at, now) : 'None'
                  }
                  delta={`${h.reports.open} open${h.deletions_stuck ? ` · ${plural(h.deletions_stuck, 'deletion')} stuck` : ''}`}
                  dir={
                    h.reports.oldest_open_at &&
                    now - Date.parse(h.reports.oldest_open_at) > 4 * 3_600_000
                      ? 'down'
                      : 'flat'
                  }
                />
              </div>

              <Card
                title="Database size"
                right={
                  <span className="muted">
                    {bytesLabel(h.storage.db_bytes)} of {bytesLabel(h.storage.db_limit_bytes)} plan
                    limit · {dbPct}%
                  </span>
                }
              >
                <div className="cb">
                  <div className={dbPct >= 80 ? 'bar-warn' : ''}>
                    <Bar pct={dbPct} lime={dbPct < 80} />
                  </div>
                  {dbPct >= 80 ? (
                    <p className="error small" style={{ marginTop: 8 }}>
                      Over 80% of the plan limit. Check the largest tables below.
                    </p>
                  ) : null}
                </div>
                <details style={{ padding: '0 16px 14px' }}>
                  <summary>Largest tables</summary>
                  <Table
                    compact
                    label="Largest tables"
                    columns={[
                      'Table',
                      { label: 'Size', num: true },
                      { label: 'Rows (about)', num: true },
                    ]}
                  >
                    {h.storage.tables.map((t) => (
                      <tr key={t.name}>
                        <td className="mono">{t.name}</td>
                        <td className="num">{bytesLabel(t.bytes)}</td>
                        <td className="num">
                          {Math.max(0, t.rows_estimate).toLocaleString('en-US')}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </details>
              </Card>

              <Card title="Scheduled jobs">
                {h.cron.length ? (
                  <Table
                    label="Scheduled jobs"
                    columns={[
                      'Job',
                      'Runs',
                      'Last run',
                      'Status',
                      'Took',
                      { label: 'Failed, 24 h', num: true },
                    ]}
                  >
                    {h.cron.map((c) => (
                      <tr key={c.jobname}>
                        <td className="mono">{c.jobname}</td>
                        <td className="ink2">
                          {cronLabel(c.schedule)}
                          {c.active ? '' : ' (off)'}
                        </td>
                        <td className="muted">
                          {c.last_run?.start_time ? whenLabel(c.last_run.start_time) : 'Never'}
                        </td>
                        <td title={c.last_run?.message ?? undefined}>
                          <StatusPill {...cronStatus(c.last_run?.status)} />
                        </td>
                        <td className="muted tnum">
                          {durationLabel(c.last_run?.start_time, c.last_run?.end_time)}
                        </td>
                        <td className="num">
                          {c.failures_24h ? <span className="error">{c.failures_24h}</span> : 0}
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <EmptyState title="No scheduled jobs found." />
                )}
              </Card>

              <div className="grid2" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
                <Card title="Recent email errors">
                  {h.email.recent_errors.length ? (
                    <Table
                      compact
                      label="Recent email errors"
                      columns={['Email', 'To', 'Tries', 'Error', 'When']}
                    >
                      {h.email.recent_errors.map((e) => (
                        <tr key={e.id}>
                          <td>{emailTemplate(e.template)}</td>
                          <td className="ink2">{e.to}</td>
                          <td className="num">{e.attempts}</td>
                          <td className="ink2 wrap" style={{ maxWidth: 260 }}>
                            {e.error}
                          </td>
                          <td className="muted">{timeAgo(e.at)}</td>
                        </tr>
                      ))}
                    </Table>
                  ) : (
                    <EmptyState title="No email errors." />
                  )}
                </Card>
                <Card title="Recent push errors">
                  {h.push.recent_errors.length ? (
                    <Table compact label="Recent push errors" columns={['Error', 'When']}>
                      {h.push.recent_errors.map((e) => (
                        <tr key={e.id}>
                          <td className="ink2 wrap">{e.error ?? e.status}</td>
                          <td className="muted">{timeAgo(e.at)}</td>
                        </tr>
                      ))}
                    </Table>
                  ) : (
                    <EmptyState title="No push errors." />
                  )}
                </Card>
              </div>
            </>
          );
        }}
      </Loadable>
    </>
  );
}
