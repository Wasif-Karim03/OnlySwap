import { useState, type ReactNode } from 'react';

import {
  barPct,
  dayLabel,
  defaultRange,
  formatHours,
  formatPct,
  isoDay,
  latestWith,
  pooledRate,
  previousWeekStart,
  rangeError,
  targetLabel,
  targetStatus,
  TARGETS,
  type Target,
} from '../logic';
import { useCampusId, useSession } from '../session';
import { AgeBlocksSection, RatingsSection } from './Ratings';
import {
  Bar,
  Button,
  Card,
  FilterChip,
  Loadable,
  Page,
  Pill,
  Segmented,
  Table,
  useRpc,
  type RpcState,
} from '../ui';

type Num = number | null;

type FunnelDay = {
  day: string;
  signups: number;
  activated: number;
  offers: number;
  offers_accepted: number;
  meetups_confirmed: number;
  completed_swaps: number;
};
type Funnel = {
  campus_id: string | null;
  from: string;
  to: string;
  signups: number;
  swiped_10_24h: number;
  activated: number;
  activation_rate: Num;
  offers: number;
  offers_accepted: number;
  meetups_confirmed: number;
  completed_swaps: number;
  days: FunnelDay[];
};
type RetentionWeek = {
  signup_week: string;
  cohort: number;
  d1: number;
  d1_eligible: number;
  d1_rate: Num;
  d7: number;
  d7_eligible: number;
  d7_rate: Num;
  d30: number;
  d30_eligible: number;
  d30_rate: Num;
};
type LiquidityWeek = {
  week: string;
  listings_created: number;
  sold_14d: number;
  sell_through_14d: Num;
  sell_through_final: boolean;
  median_hours_to_first_offer: Num;
  active_buyers: number;
  feed_exhausted: number;
};
type Liquidity = {
  campus_id: string | null;
  active_listings: number;
  weekly_active_buyers: number;
  supply_ratio: Num;
  weeks: LiquidityWeek[];
};
type SafetyWeek = {
  week: string;
  reports: number;
  completed_swaps: number;
  reports_per_100_swaps: Num;
  p90_hours_to_resolve: Num;
  meetups_confirmed: number;
  meetups_completed: number;
  completion_rate: Num;
  meetups_no_show: number;
  no_show_rate: Num;
};

const SERIES = [
  { id: 'signups', label: 'Sign-ups' },
  { id: 'activated', label: 'Activated' },
  { id: 'offers', label: 'Offers' },
  { id: 'offers_accepted', label: 'Accepted' },
  { id: 'meetups_confirmed', label: 'Meetups' },
  { id: 'completed_swaps', label: 'Deals' },
] as const;
type Series = (typeof SERIES)[number]['id'];

/**
 * Metrics: PRD §5.1 definitions against the §5.2 targets for the sidebar
 * campus (all campuses adds up every real campus; the demo campus is always
 * left out on the server).
 */
export function MetricsPage() {
  const campusId = useCampusId();
  const { campuses } = useSession();
  const [range, setRange] = useState(() => defaultRange(new Date()));
  const [draft, setDraft] = useState(range);
  const draftError = rangeError(draft.from, draft.to);

  const funnel = useRpc<Funnel>('admin_metrics_funnel', {
    campus_id: campusId,
    from_day: range.from,
    to_day: range.to,
  });
  const retention = useRpc<{ weeks: RetentionWeek[] }>('admin_metrics_retention', {
    campus_id: campusId,
  });
  const liquidity = useRpc<Liquidity>('admin_metrics_liquidity', { campus_id: campusId });
  const safety = useRpc<{ weeks: SafetyWeek[] }>('admin_metrics_safety', { campus_id: campusId });
  const allCampuses = !campusId;
  const campusName = campusId
    ? (campuses.find((c) => c.id === campusId)?.name ?? 'Your campus')
    : 'All campuses';

  return (
    <Page
      title="Metrics"
      crumb={`${campusName} · ${dayLabel(range.from)} to ${dayLabel(range.to)}`}
    >
      <form
        className="filters"
        aria-label="Date range"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draftError) setRange(draft);
        }}
      >
        <FilterChip label="From">
          <input
            type="date"
            value={draft.from}
            max={draft.to}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
        </FilterChip>
        <FilterChip label="To">
          <input
            type="date"
            value={draft.to}
            min={draft.from}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
        </FilterChip>
        <Button type="submit" disabled={!!draftError}>
          Show range
        </Button>
        {draftError ? <span className="error">{draftError}</span> : null}
        <span className="muted spacer">
          Campus follows the picker in the sidebar. Targets are the first-semester goals from the
          PRD.
        </span>
      </form>

      <Kpis
        funnel={funnel.data}
        retention={retention.data?.weeks ?? null}
        liquidity={liquidity.data}
        safety={safety.data?.weeks ?? null}
        allCampuses={allCampuses}
      />

      <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <FunnelCard state={funnel} />
        <Card title="Retention by sign-up week">
          <Loadable state={retention} rows={5} empty={(d) => d.weeks.length === 0}>
            {(r) => <RetentionView weeks={r.weeks} />}
          </Loadable>
        </Card>
      </div>

      <Card title="Liquidity by week">
        <Loadable state={liquidity} rows={5}>
          {(l) => <LiquidityView l={l} allCampuses={allCampuses} />}
        </Loadable>
      </Card>

      <Card title="Safety and deal reliability by week">
        <Loadable state={safety} rows={5} empty={(d) => d.weeks.length === 0}>
          {(s) => <SafetyView weeks={s.weeks} allCampuses={allCampuses} />}
        </Loadable>
      </Card>
      <RatingsSection campusId={campusId} />
      <AgeBlocksSection campusId={campusId} />
      <p className="note">Crash-free sessions (target 99.5%) live in Sentry, not here.</p>
    </Page>
  );
}

function Kpis({
  funnel,
  retention,
  liquidity,
  safety,
  allCampuses,
}: {
  funnel: Funnel | null;
  retention: RetentionWeek[] | null;
  liquidity: Liquidity | null;
  safety: SafetyWeek[] | null;
  allCampuses: boolean;
}) {
  const prev = previousWeekStart(isoDay(new Date()));
  const lastWeek = safety?.find((w) => w.week.slice(0, 10) === prev);
  const swaps = safety ? (lastWeek?.completed_swaps ?? 0) : null;
  const d7 = retention
    ? pooledRate(
        retention.reduce((s, w) => s + w.d7, 0),
        retention.reduce((s, w) => s + w.d7_eligible, 0),
      )
    : null;
  const median = liquidity ? latestWith(liquidity.weeks, 'median_hours_to_first_offer') : null;
  const sell = liquidity?.weeks.find((w) => w.sell_through_final) ?? null;
  const noShow = safety
    ? pooledRate(
        safety.reduce((s, w) => s + w.meetups_no_show, 0),
        safety.reduce((s, w) => s + w.meetups_confirmed, 0),
      )
    : null;
  const per100 = safety
    ? pooledRate(
        safety.reduce((s, w) => s + w.reports, 0),
        safety.reduce((s, w) => s + w.completed_swaps, 0),
      )
    : null;
  const p90 = safety ? latestWith(safety, 'p90_hours_to_resolve') : null;
  const oneCampus = 'Pick one campus to see this.';

  return (
    <div className="kpis k4">
      <TargetKpi
        label="Deals last week"
        value={swaps === null ? '…' : String(swaps)}
        raw={swaps}
        target={TARGETS.swaps_per_week}
        unit=""
        note={`Week of ${dayLabel(prev)}`}
      />
      <TargetKpi
        label="Activation"
        value={funnel ? formatPct(funnel.activation_rate) : '…'}
        raw={funnel?.activation_rate}
        target={TARGETS.activation}
        unit="%"
        note={funnel ? `${funnel.activated} of ${funnel.signups} sign-ups in the range` : ''}
      />
      <TargetKpi
        label="Day 7 retention"
        value={retention ? formatPct(d7) : '…'}
        raw={d7}
        target={TARGETS.d7_retention}
        unit="%"
        note="Last 12 sign-up weeks, pooled"
      />
      <TargetKpi
        label="Listing to first offer"
        value={liquidity ? formatHours(median?.median_hours_to_first_offer) : '…'}
        raw={median?.median_hours_to_first_offer}
        target={TARGETS.hours_to_first_offer}
        unit=" h"
        note={allCampuses ? oneCampus : median ? `Median, week of ${dayLabel(median.week)}` : ''}
      />
      <TargetKpi
        label="Sold within 14 days"
        value={liquidity ? formatPct(sell?.sell_through_14d) : '…'}
        raw={sell?.sell_through_14d}
        target={TARGETS.sell_through_14d}
        unit="%"
        note={sell ? `Week of ${dayLabel(sell.week)} (newest final week)` : 'No final week yet'}
      />
      <TargetKpi
        label="No-show rate"
        value={safety ? formatPct(noShow) : '…'}
        raw={noShow}
        target={TARGETS.no_show_rate}
        unit="%"
        note="Confirmed meetups, last 8 weeks"
      />
      <TargetKpi
        label="Reports per 100 deals"
        value={per100 === null ? 'n/a' : String(per100)}
        raw={per100}
        target={TARGETS.reports_per_100_swaps}
        unit=""
        note="Last 8 weeks"
      />
      <TargetKpi
        label="Time to resolve a report (p90)"
        value={safety ? formatHours(p90?.p90_hours_to_resolve) : '…'}
        raw={p90?.p90_hours_to_resolve}
        target={TARGETS.p90_hours_to_resolve}
        unit=" h"
        note={allCampuses ? oneCampus : p90 ? `Week of ${dayLabel(p90.week)}` : ''}
      />
    </div>
  );
}

function TargetKpi({
  label,
  value,
  raw,
  target,
  unit,
  note,
}: {
  label: string;
  value: string;
  raw: number | null | undefined;
  target: Target;
  unit: '%' | ' h' | '';
  note: string;
}) {
  const status = targetStatus(raw, target);
  return (
    <div className="card kpi">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      <div className="row" style={{ marginTop: 6 }}>
        <Pill
          tone={status === 'met' ? 'green' : status === 'missed' ? 'red' : 'neutral'}
          label={status === 'met' ? 'On target' : status === 'missed' ? 'Below target' : 'No data'}
        />
        <span className="muted small">{targetLabel(target, unit)}</span>
      </div>
      {note ? (
        <div className="muted small" style={{ marginTop: 4 }}>
          {note}
        </div>
      ) : null}
    </div>
  );
}

function FunnelCard({ state }: { state: RpcState<Funnel> }) {
  const [series, setSeries] = useState<Series>('completed_swaps');
  return (
    <Card
      title="Daily activity"
      right={<Segmented label="Series" options={SERIES} value={series} onChange={setSeries} />}
    >
      <Loadable state={state} rows={6}>
        {(f) => {
          const stages: [string, number][] = [
            ['Sign-ups', f.signups],
            ['Swiped 10+ cards in 24 h', f.swiped_10_24h],
            ['Activated', f.activated],
            ['Offers', f.offers],
            ['Offers accepted', f.offers_accepted],
            ['Meetups confirmed', f.meetups_confirmed],
            ['Deals done', f.completed_swaps],
          ];
          const max = Math.max(1, ...stages.map((s) => s[1]));
          return (
            <>
              <div className="cb">
                <DayColumns
                  days={f.days}
                  series={series}
                  label={SERIES.find((s) => s.id === series)!.label}
                />
              </div>
              <div className="ch top-line">
                <h3>Funnel</h3>
              </div>
              <div className="bars">
                {stages.map(([name, n]) => (
                  <div key={name} className="brow">
                    <span>{name}</span>
                    <Bar pct={barPct(n, max)} />
                    <span className="num">{n.toLocaleString('en-US')}</span>
                  </div>
                ))}
              </div>
              <p className="note" style={{ padding: '0 16px 14px' }}>
                Activation counts new members who swiped 10+ cards in 24 hours and made an offer or
                posted within 7 days, so the newest week keeps climbing.
              </p>
            </>
          );
        }}
      </Loadable>
    </Card>
  );
}

/** Columns per day in inline SVG, with the numbers in a table for screen readers. */
function DayColumns({ days, series, label }: { days: FunnelDay[]; series: Series; label: string }) {
  if (days.length === 0) return <p className="muted">No activity in this range.</p>;
  const values = days.map((d) => d[series]);
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  const w = 20;
  return (
    <>
      <svg
        className="cols"
        viewBox={`0 0 ${days.length * w} 200`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} per day: ${total} in total, most in one day ${Math.max(...values)}`}
      >
        {days.map((d, i) => {
          const h = Math.max(1, (d[series] / max) * 196);
          return (
            <rect
              key={d.day}
              className={i === days.length - 1 ? 'last' : ''}
              x={i * w + 3}
              y={200 - h}
              width={w - 6}
              height={h}
              rx={3}
            >
              <title>
                {dayLabel(d.day)}: {d[series]}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="row muted small" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <span>{dayLabel(days[0]!.day)}</span>
        <span>
          {total.toLocaleString('en-US')} in total, most in a day {max}
        </span>
        <span>{dayLabel(days[days.length - 1]!.day)}</span>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary>Show the numbers per day</summary>
        <Table columns={['Day', ...SERIES.map((s) => ({ label: s.label, num: true }))]}>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{dayLabel(d.day)}</td>
              {SERIES.map((s) => (
                <td key={s.id} className="num">
                  {d[s.id]}
                </td>
              ))}
            </tr>
          ))}
        </Table>
      </details>
    </>
  );
}

/** Heat cells tint with ink (design review 2.10); capped so the ink text stays readable. */
const HEAT_MAX_INK = 40;
const HEAT_INK_PER_PCT = 0.6;

/** Retention cell tinted by the rate (like the mock's heat cells). */
function RateCell({ rate, n, of }: { rate: Num; n: number; of: number }) {
  if (!of) return <td className="num muted">Too early</td>;
  const pct = Number(rate ?? 0);
  return (
    <td className="num" title={`${n} of ${of}`}>
      <span
        className="heat-cell"
        style={{
          background: `color-mix(in srgb, var(--color-ink) ${Math.round(Math.min(HEAT_MAX_INK, pct * HEAT_INK_PER_PCT))}%, transparent)`,
        }}
      >
        {formatPct(rate)}
      </span>
    </td>
  );
}

function RetentionView({ weeks }: { weeks: RetentionWeek[] }) {
  return (
    <>
      <Table
        columns={[
          'Cohort',
          { label: 'Students', num: true },
          { label: 'Day 1', num: true },
          { label: 'Day 7', num: true },
          { label: 'Day 30', num: true },
        ]}
      >
        {weeks.map((w) => (
          <tr key={w.signup_week}>
            <td className="strong">{dayLabel(w.signup_week)}</td>
            <td className="num">{w.cohort}</td>
            <RateCell rate={w.d1_rate} n={w.d1} of={w.d1_eligible} />
            <RateCell rate={w.d7_rate} n={w.d7} of={w.d7_eligible} />
            <RateCell rate={w.d30_rate} n={w.d30} of={w.d30_eligible} />
          </tr>
        ))}
      </Table>
      <p className="note" style={{ padding: '12px 16px' }}>
        Active means the app was opened exactly 1, 7 or 30 days after signing up. Rates only count
        members old enough to have reached that day. Day 7 target: 25%.
      </p>
    </>
  );
}

function LiquidityView({ l, allCampuses }: { l: Liquidity; allCampuses: boolean }) {
  if (l.weeks.length === 0) return <p className="cb muted">Nothing here yet.</p>;
  const maxCreated = Math.max(1, ...l.weeks.map((w) => w.listings_created));
  return (
    <>
      <div className="cb row" style={{ gap: 28 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 750 }}>{l.supply_ratio ?? 'n/a'}</div>
          <div className="muted small">Live listings per weekly buyer</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 750 }}>
            {l.active_listings.toLocaleString('en-US')}
          </div>
          <div className="muted small">Live listings</div>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 750 }}>
            {l.weekly_active_buyers.toLocaleString('en-US')}
          </div>
          <div className="muted small">Buyers in the last 7 days</div>
        </div>
      </div>
      <Table
        columns={[
          'Week',
          { label: 'Listings posted', num: true },
          '',
          { label: 'Sold in 14 days', num: true },
          { label: 'Sell-through', num: true },
          { label: 'Hours to first offer', num: true },
          { label: 'Active buyers', num: true },
          { label: 'Feed ran low', num: true },
        ]}
      >
        {l.weeks.map((w) => (
          <tr key={w.week}>
            <td className="strong">{dayLabel(w.week)}</td>
            <td className="num">{w.listings_created}</td>
            <td style={{ width: 140 }}>
              <Bar pct={barPct(w.listings_created, maxCreated)} lime />
            </td>
            <td className="num">{w.sold_14d}</td>
            <td className="num">
              {w.sell_through_final ? (
                <Flag v={w.sell_through_14d} t={TARGETS.sell_through_14d}>
                  {formatPct(w.sell_through_14d)}
                </Flag>
              ) : (
                <>
                  {formatPct(w.sell_through_14d)}
                  <span className="muted"> so far</span>
                </>
              )}
            </td>
            <td className="num">
              {allCampuses && w.median_hours_to_first_offer === null ? (
                <span className="muted">One campus only</span>
              ) : (
                formatHours(w.median_hours_to_first_offer)
              )}
            </td>
            <td className="num">{w.active_buyers}</td>
            <td className="num">{w.feed_exhausted}</td>
          </tr>
        ))}
      </Table>
      <p className="note" style={{ padding: '12px 16px' }}>
        Feed ran low counts feed loads that ended with fewer than 5 new cards (feed sessions aren't
        counted yet, so there is no percent). Sell-through is final once the week is 3 weeks old.
      </p>
    </>
  );
}

function SafetyView({ weeks, allCampuses }: { weeks: SafetyWeek[]; allCampuses: boolean }) {
  return (
    <>
      <Table
        columns={[
          'Week',
          { label: 'Reports', num: true },
          { label: 'Deals', num: true },
          { label: 'Reports per 100 deals', num: true },
          { label: 'Hours to resolve (p90)', num: true },
          { label: 'Meetups confirmed', num: true },
          { label: 'Completed', num: true },
          { label: 'No-show rate', num: true },
        ]}
      >
        {weeks.map((w) => (
          <tr key={w.week}>
            <td className="strong">{dayLabel(w.week)}</td>
            <td className="num">{w.reports}</td>
            <td className="num">{w.completed_swaps}</td>
            <td className="num">
              <Flag v={w.reports_per_100_swaps} t={TARGETS.reports_per_100_swaps}>
                {w.reports_per_100_swaps ?? 'n/a'}
              </Flag>
            </td>
            <td className="num">
              {allCampuses && w.p90_hours_to_resolve === null ? (
                <span className="muted">One campus only</span>
              ) : (
                <Flag v={w.p90_hours_to_resolve} t={TARGETS.p90_hours_to_resolve}>
                  {formatHours(w.p90_hours_to_resolve)}
                </Flag>
              )}
            </td>
            <td className="num">{w.meetups_confirmed}</td>
            <td className="num">{formatPct(w.completion_rate)}</td>
            <td className="num">
              <Flag v={w.no_show_rate} t={TARGETS.no_show_rate}>
                {formatPct(w.no_show_rate)}
              </Flag>
            </td>
          </tr>
        ))}
      </Table>
      <p className="note" style={{ padding: '12px 16px' }}>
        Weeks start on Monday and go by the week a meetup was confirmed. Targets: under 5 reports
        per 100 deals, under 24 hours to resolve, under 10% no-shows.
      </p>
    </>
  );
}

function Flag({ v, t, children }: { v: Num; t: Target; children: ReactNode }) {
  return targetStatus(v, t) === 'missed' ? (
    <span className="error strong" title="Misses the target">
      {children}
    </span>
  ) : (
    <>{children}</>
  );
}
