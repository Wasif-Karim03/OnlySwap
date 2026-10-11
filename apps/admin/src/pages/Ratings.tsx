import { humanize, plural, userStatus } from '../labels';
import { dateLabel, dayLabel } from '../logic';
import { useSession } from '../session';
import type { AgeBlocks, RatingsSummary } from '../types';
import { Bar, Card, EmptyState, Loadable, PersonCell, StatusPill, Table, useRpc } from '../ui';

/** Ratings on the Metrics page (admin_ratings_summary): low-rated sellers and recent thumbs down. */
export function RatingsSection({ campusId }: { campusId: string | null }) {
  const state = useRpc<RatingsSummary>('admin_ratings_summary', { campus_id: campusId });
  const t = state.data?.totals;
  const pctUp = t && t.up + t.down ? Math.round((t.up / (t.up + t.down)) * 100) : null;
  return (
    <Card
      title="Ratings"
      right={
        t ? (
          <span className="muted">
            {plural(t.up, 'thumb')} up · {plural(t.down, 'thumb')} down
            {pctUp !== null ? ` · ${pctUp}% up` : ''}
          </span>
        ) : null
      }
    >
      <Loadable state={state} rows={5}>
        {(r) => (
          <div className="grid2" style={{ gridTemplateColumns: '1fr 1.3fr', gap: 0 }}>
            <div style={{ borderRight: '1px solid var(--color-line)' }}>
              <div className="ch flush" style={{ minHeight: 40 }}>
                <h3>Low-rated students</h3>
                <span className="muted small">3+ ratings, under 70% up</span>
              </div>
              {r.low_rated.length ? (
                <Table compact label="Low-rated students" columns={['Student', 'Up', 'Status']}>
                  {r.low_rated.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <PersonCell person={p} sub={`${p.up} up, ${p.down} down`} />
                      </td>
                      <td style={{ minWidth: 120 }}>
                        <span className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                          <span style={{ flex: 1 }}>
                            <Bar pct={p.pct_up} />
                          </span>
                          <span className="tnum small">{Math.round(p.pct_up)}%</span>
                        </span>
                      </td>
                      <td>
                        <StatusPill {...userStatus(p.status)} />
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <EmptyState title="Nobody is under 70% up." />
              )}
            </div>
            <div>
              <div className="ch flush" style={{ minHeight: 40 }}>
                <h3>Recent thumbs down</h3>
                <span className="muted small">Latest 20</span>
              </div>
              {r.recent_down.length ? (
                <Table
                  compact
                  label="Recent thumbs down"
                  columns={['About', 'From', 'Why', 'When']}
                >
                  {r.recent_down.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <PersonCell person={d.ratee} />
                      </td>
                      <td>
                        <PersonCell person={d.rater} />
                      </td>
                      <td className="ink2 wrap" style={{ maxWidth: 260 }}>
                        {[
                          ...(d.tags ?? []).map((x) => humanize(x)),
                          d.comment ? `"${d.comment}"` : null,
                        ]
                          .filter(Boolean)
                          .join(', ') || <span className="muted">No reason given</span>}
                      </td>
                      <td className="muted">{dateLabel(d.created_at)}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <EmptyState title="No thumbs down yet." />
              )}
            </div>
          </div>
        )}
      </Loadable>
    </Card>
  );
}

/** Under-18 attempts (admin_age_blocks_summary): age check blocks per campus, for compliance. */
export function AgeBlocksSection({ campusId }: { campusId: string | null }) {
  const state = useRpc<AgeBlocks>('admin_age_blocks_summary', { campus_id: campusId, days: 30 });
  const { campuses } = useSession();
  const campusName = (id: string | null) =>
    id ? (campuses.find((c) => c.id === id)?.short_name ?? 'Unknown campus') : 'No campus';
  return (
    <Card
      title="Under-18 attempts"
      right={
        state.data ? (
          <span className="muted">
            {state.data.total} in 30 days · {state.data.all_time} all time
          </span>
        ) : null
      }
    >
      <Loadable
        state={state}
        rows={3}
        empty={(d) => d.total === 0}
        emptyText="Nobody under 18 tried to sign up in the last 30 days."
      >
        {(d) => (
          <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            <Table compact label="By campus" columns={['Campus', { label: 'Blocked', num: true }]}>
              {d.by_campus.map((c, i) => (
                <tr key={c.campus?.id ?? i}>
                  <td>{c.campus?.name ?? <span className="muted">No campus</span>}</td>
                  <td className="num">{c.n}</td>
                </tr>
              ))}
            </Table>
            <Table
              compact
              label="By day"
              columns={['Day', 'Campus', { label: 'Blocked', num: true }]}
            >
              {d.by_day.slice(0, 10).map((x, i) => (
                <tr key={`${x.day}-${x.campus_id ?? i}`}>
                  <td className="muted">{dayLabel(x.day)}</td>
                  <td className="ink2">{campusName(x.campus_id)}</td>
                  <td className="num">{x.n}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Loadable>
      <p className="note" style={{ padding: '0 16px 14px' }}>
        Counts only. The age check keeps a hash of the email so the same person can't retry, never
        the address.
      </p>
    </Card>
  );
}
