import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { FeedRow } from '../feed';
import {
  campusStatus,
  FEED_FILTERS,
  plural,
  reportReason,
  targetType,
  type FeedFilter,
} from '../labels';
import { ageLabel, deltaLabel, moneyLabel, timeAgo } from '../logic';
import { useCampusId, useSession } from '../session';
import type { ActivityFeed, OverviewV2 } from '../types';
import {
  Card,
  EmptyState,
  Kpi,
  Loadable,
  Loading,
  ErrorState,
  Page,
  Pill,
  Segmented,
  StatusPill,
  Table,
  useRpc,
} from '../ui';

/** Overview (checklist §3): six live numbers, live activity, needs attention, campuses. */
export function OverviewPage() {
  const campusId = useCampusId();
  const { campuses } = useSession();
  const state = useRpc<OverviewV2>('admin_overview_v2', { campus_id: campusId });
  const crumb = campusId ? campuses.find((c) => c.id === campusId)?.name : 'All campuses';

  useEffect(() => {
    const t = setInterval(state.reload, 60_000);
    return () => clearInterval(t);
  }, [state.reload]);

  return (
    <Page title="Overview" crumb={crumb}>
      {state.error ? (
        <div className="card">
          <ErrorState message={state.error} onRetry={state.reload} />
        </div>
      ) : state.data ? (
        <Kpis o={state.data} />
      ) : (
        <div className="card">
          <Loading rows={2} />
        </div>
      )}
      <div className="grid2">
        <LiveActivity campusId={campusId} />
        <div className="stack">
          <Card
            title="Needs attention"
            right={
              state.data ? (
                <span className="muted">{state.data.kpis.open_reports.value} open</span>
              ) : null
            }
          >
            <Loadable state={state} rows={3}>
              {(o) => <NeedsAttention o={o} />}
            </Loadable>
          </Card>
          <Card title="Campuses">
            <Loadable state={state} rows={3} empty={(o) => o.campuses.length === 0}>
              {(o) => (
                <Table
                  compact
                  columns={[
                    'Campus',
                    'Status',
                    { label: 'Students', num: true },
                    { label: 'Live', num: true },
                    { label: 'Deals 7 d', num: true },
                  ]}
                >
                  {o.campuses.map((c) => (
                    <tr key={c.id}>
                      <td className="strong">{c.short_name || c.name}</td>
                      <td>
                        <StatusPill {...campusStatus(c)} />
                      </td>
                      <td className="num">{c.students.toLocaleString('en-US')}</td>
                      <td className="num">{c.live_listings.toLocaleString('en-US')}</td>
                      <td className="num">{c.deals_7d.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Loadable>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Kpis({ o }: { o: OverviewV2 }) {
  const k = o.kpis;
  const now = Date.now();
  const lastWeekDay = new Date(now - 7 * 86_400_000).toLocaleDateString('en-US', {
    weekday: 'short',
  });
  const active = deltaLabel(
    k.active_today.value,
    k.active_today.same_day_last_week,
    `last ${lastWeekDay}`,
  );
  const offers = deltaLabel(k.offers_today.value, k.offers_today.same_day_last_week, 'last week');
  const deals = deltaLabel(k.deals_7d.value, k.deals_7d.prev_7d, 'the week before');
  const open = k.open_reports;
  return (
    <div className="kpis">
      <Kpi
        label="Students"
        value={k.students.value.toLocaleString('en-US')}
        delta={`+${k.students.new_7d.toLocaleString('en-US')} this week`}
        dir={k.students.new_7d > 0 ? 'up' : 'flat'}
        series={k.students.series}
        to="/people"
      />
      <Kpi
        label="Active today"
        value={k.active_today.value.toLocaleString('en-US')}
        delta={active.text}
        dir={active.dir}
        series={k.active_today.series}
      />
      <Kpi
        label="Listings live"
        value={k.listings_live.value.toLocaleString('en-US')}
        delta={`+${k.listings_live.new_7d.toLocaleString('en-US')} this week`}
        dir={k.listings_live.new_7d > 0 ? 'up' : 'flat'}
        series={k.listings_live.series}
        to="/listings"
      />
      <Kpi
        label="Offers today"
        value={k.offers_today.value.toLocaleString('en-US')}
        delta={offers.text}
        dir={offers.dir}
        series={k.offers_today.series}
      />
      <Kpi
        label="Deals done (7 d)"
        value={k.deals_7d.value.toLocaleString('en-US')}
        delta={`${moneyLabel(k.deals_7d.agreed_cents)} in person`}
        dir={deals.dir}
        series={k.deals_7d.series}
      />
      <Kpi
        label="Open reports"
        value={open.value.toLocaleString('en-US')}
        delta={
          open.oldest_at
            ? `oldest ${ageLabel(open.oldest_at, now).replace(/(\d+)([mhd])/, '$1 $2')}${open.priority ? `, ${open.priority} urgent` : ''}`
            : 'none waiting'
        }
        dir={open.value > 0 ? 'down' : 'flat'}
        to="/reports"
      />
    </div>
  );
}

function NeedsAttention({ o }: { o: OverviewV2 }) {
  const n = o.needs_attention;
  const now = Date.now();
  const queues: { to: string; label: string; count: number }[] = [
    { to: '/listings', label: 'Listings held for review', count: n.held_listings },
    { to: '/quad', label: 'Quad posts held', count: n.quad_held },
    { to: '/appeals', label: 'Appeals waiting', count: n.appeals_open },
  ];
  const anyQueue = queues.some((q) => q.count > 0) || n.support_open > 0;
  if (n.reports.length === 0 && !anyQueue)
    return <EmptyState title="All clear. Nothing is waiting." />;
  return (
    <>
      {n.reports.map((r) => (
        <Link key={r.id} className="ev" to="/reports/$id" params={{ id: r.id }}>
          <StatusPill {...reportReason(r.reason)} />
          <span className="ink2">
            {targetType(r.target_type)}
            {r.campus ? ` · ${r.campus.short_name}` : ''}
          </span>
          <span className="t">{timeAgo(r.created_at, now).replace(' ago', '')}</span>
        </Link>
      ))}
      {queues
        .filter((q) => q.count > 0)
        .map((q) => (
          <Link key={q.to} className="ev" to={q.to}>
            <Pill tone="amber" label={plural(q.count, 'item')} />
            <span className="ink2">{q.label}</span>
          </Link>
        ))}
      {n.support_open > 0 ? (
        <div className="ev">
          <Pill tone="sky" label={plural(n.support_open, 'request')} />
          <span className="ink2">Support requests waiting</span>
        </div>
      ) : null}
    </>
  );
}

/**
 * Live activity: the latest 10 events (admin_activity_feed), refreshed every
 * 20 seconds. Part B's Activity page has the full list with filters and CSV.
 */
function LiveActivity({ campusId }: { campusId: string | null }) {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const kinds = FEED_FILTERS.find((f) => f.id === filter)?.kinds ?? null;
  const state = useRpc<ActivityFeed>('admin_activity_feed', {
    campus_id: campusId,
    kinds,
    limit: 10,
  });
  useEffect(() => {
    const t = setInterval(state.reload, 20_000);
    return () => clearInterval(t);
  }, [state.reload]);
  const now = Date.now();
  return (
    <Card
      title={
        <div className="row">
          <h2>Live activity</h2>
          <Pill tone="green" label="Live" />
        </div>
      }
      right={
        <Segmented
          label="Show"
          options={FEED_FILTERS.map((f) => ({ id: f.id, label: f.label }))}
          value={filter}
          onChange={setFilter}
        />
      }
      label="Live activity"
    >
      <Loadable
        state={state}
        rows={8}
        empty={(d) => d.items.length === 0}
        emptyText="No activity yet."
      >
        {(d) => (
          <>
            {d.items.map((e) => (
              <FeedRow key={`${e.kind}:${e.id}`} e={e} now={now} />
            ))}
          </>
        )}
      </Loadable>
      <div className="cf">
        <Link className="btn" to="/activity">
          See all activity
        </Link>
      </div>
    </Card>
  );
}
