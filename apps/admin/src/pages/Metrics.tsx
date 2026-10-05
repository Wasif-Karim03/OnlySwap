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
  type Whoami,
} from '../logic';
import { CampusSelect, Loadable, useRpc, type CampusOption } from '../ui';

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
  { id: 'offers_accepted', label: 'Offers accepted' },
  { id: 'meetups_confirmed', label: 'Meetups confirmed' },
  { id: 'completed_swaps', label: 'Completed swaps' },
] as const;
type Series = (typeof SERIES)[number]['id'];

/**
 * G03 Metrics (R11-ADM-01): PRD §5.1 definitions against the §5.2 targets.
 * Moderators see their campus; owners can pick one campus or add up every
 * campus (the demo campus is always left out on the server).
 */
export function MetricsPage({ who }: { who: Whoami }) {
  const owner = who.role === 'owner';
  const campuses = useRpc<CampusOption[]>('admin_list_campuses');
  const [campus, setCampus] = useState('');
  const [range, setRange] = useState(() => defaultRange(new Date()));
  const [draft, setDraft] = useState(range);
  const draftError = rangeError(draft.from, draft.to);

  const campusId = owner ? campus || null : (who.campus_id ?? null);
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
  const allCampuses = owner && !campusId;

  return (
    <>
      <h1>Metrics</h1>
      <div className="row">
        {owner ? (
          <CampusSelect
            campuses={(campuses.data ?? []).filter((c) => !c.is_demo)}
            value={campus}
            onChange={setCampus}
            allLabel="All campuses"
          />
        ) : (
          <p className="meta">
            Your campus:{' '}
            {campuses.data?.find((c) => c.id === who.campus_id)?.name ?? 'your assigned campus'}
          </p>
        )}
        <form
          className="row"
          aria-label="Funnel date range"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draftError) setRange(draft);
          }}
        >
          <label>
            From
            <input
              type="date"
              value={draft.from}
              max={draft.to}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={draft.to}
              min={draft.from}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          <button type="submit" className="secondary" disabled={!!draftError}>
            Show range
          </button>
        </form>
      </div>
      {draftError ? <p className="error">{draftError}</p> : null}
      {campuses.error ? <p className="error">{campuses.error}</p> : null}

      <h2>Against targets</h2>
      <Kpis
        funnel={funnel.data}
        retention={retention.data?.weeks ?? null}
        liquidity={liquidity.data}
        safety={safety.data?.weeks ?? null}
        allCampuses={allCampuses}
      />
      <p className="meta">
        Targets are the first-semester hypotheses from the PRD. Crash-free sessions (target 99.5%)
        live in Sentry, not here.
      </p>

      <h2>
        Funnel, {dayLabel(range.from)} to {dayLabel(range.to)}
      </h2>
      <Loadable state={funnel}>{(f) => <FunnelView f={f} />}</Loadable>

      <h2>Retention by signup week</h2>
      <Loadable state={retention} empty={(d) => d.weeks.length === 0}>
        {(r) => <RetentionView weeks={r.weeks} />}
      </Loadable>

      <h2>Liquidity by week</h2>
      <Loadable state={liquidity}>
        {(l) => <LiquidityView l={l} allCampuses={allCampuses} />}
      </Loadable>

      <h2>Safety and deal reliability by week</h2>
      <Loadable state={safety} empty={(d) => d.weeks.length === 0}>
        {(s) => <SafetyView weeks={s.weeks} allCampuses={allCampuses} />}
      </Loadable>
    </>
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
    <div className="grid">
      <Kpi
        label="Completed swaps last week"
        value={swaps === null ? '…' : String(swaps)}
        raw={swaps}
        target={TARGETS.swaps_per_week}
        unit=""
        note={`Week of ${dayLabel(prev)}`}
      />
      <Kpi
        label="Activation"
        value={funnel ? formatPct(funnel.activation_rate) : '…'}
        raw={funnel?.activation_rate}
        target={TARGETS.activation}
        unit="%"
        note={funnel ? `${funnel.activated} of ${funnel.signups} sign-ups in the range` : ''}
      />
      <Kpi
        label="D7 retention"
        value={retention ? formatPct(d7) : '…'}
        raw={d7}
        target={TARGETS.d7_retention}
        unit="%"
        note="Last 12 signup weeks, pooled"
      />
      <Kpi
        label="Median hours to first offer"
        value={liquidity ? formatHours(median?.median_hours_to_first_offer) : '…'}
        raw={median?.median_hours_to_first_offer}
        target={TARGETS.hours_to_first_offer}
        unit=" h"
        note={allCampuses ? oneCampus : median ? `Week of ${dayLabel(median.week)}` : ''}
      />
      <Kpi
        label="Sell-through at 14 days"
        value={liquidity ? formatPct(sell?.sell_through_14d) : '…'}
        raw={sell?.sell_through_14d}
        target={TARGETS.sell_through_14d}
        unit="%"
        note={sell ? `Week of ${dayLabel(sell.week)} (newest final week)` : 'No final week yet'}
      />
      <Kpi
        label="No-show rate"
        value={safety ? formatPct(noShow) : '…'}
        raw={noShow}
        target={TARGETS.no_show_rate}
        unit="%"
        note="Confirmed meetups, last 8 weeks"
      />
      <Kpi
        label="Reports per 100 swaps"
        value={per100 === null ? 'n/a' : String(per100)}
        raw={per100}
        target={TARGETS.reports_per_100_swaps}
        unit=""
        note="Last 8 weeks"
      />
      <Kpi
        label="p90 hours to resolve a report"
        value={safety ? formatHours(p90?.p90_hours_to_resolve) : '…'}
        raw={p90?.p90_hours_to_resolve}
        target={TARGETS.p90_hours_to_resolve}
        unit=" h"
        note={allCampuses ? oneCampus : p90 ? `Week of ${dayLabel(p90.week)}` : ''}
      />
      <div className="card">
        <div className="stat">
          {liquidity?.supply_ratio === null || liquidity?.supply_ratio === undefined
            ? 'n/a'
            : liquidity.supply_ratio}
        </div>
        <div className="meta">Supply: active listings per weekly active buyer</div>
        {liquidity ? (
          <div className="meta">
            {liquidity.active_listings} listings, {liquidity.weekly_active_buyers} buyers in 7 days
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Kpi({
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
    <div className="card">
      <div className="stat">{value}</div>
      <div className="meta">{label}</div>
      <div className="row" style={{ marginTop: 'var(--space-xs)' }}>
        <span className={`pill ${status}`}>
          {status === 'met' ? 'On target' : status === 'missed' ? 'Below target' : 'No data'}
        </span>
        <span className="meta">{targetLabel(target, unit)}</span>
      </div>
      {note ? <div className="meta">{note}</div> : null}
    </div>
  );
}

/** A horizontal bar from plain divs (decorative; the number sits next to it). */
function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="bar" aria-hidden="true">
      <span style={{ width: `${barPct(value, max)}%` }} />
    </div>
  );
}

function FunnelView({ f }: { f: Funnel }) {
  const [series, setSeries] = useState<Series>('completed_swaps');
  const stages: [string, number][] = [
    ['Sign-ups', f.signups],
    ['Swiped 10+ cards in 24 h', f.swiped_10_24h],
    ['Activated', f.activated],
    ['Offers', f.offers],
    ['Offers accepted', f.offers_accepted],
    ['Meetups confirmed', f.meetups_confirmed],
    ['Completed swaps', f.completed_swaps],
  ];
  const max = Math.max(1, ...stages.map((s) => s[1]));
  const label = SERIES.find((s) => s.id === series)!.label;
  return (
    <>
      <div className="card">
        <table>
          <tbody>
            {stages.map(([name, n]) => (
              <tr key={name}>
                <td style={{ width: '30%' }}>{name}</td>
                <td style={{ width: '10%' }}>{n}</td>
                <td>
                  <Bar value={n} max={max} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="meta">
          Activation counts new members who swiped 10+ cards in 24 hours and made an offer or posted
          within 7 days, so the newest week keeps climbing.
        </p>
      </div>
      <div className="card">
        <div className="row">
          <label>
            Per day
            <select value={series} onChange={(e) => setSeries(e.target.value as Series)}>
              {SERIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DayColumns days={f.days} series={series} label={label} />
      </div>
    </>
  );
}

/** Columns per day in inline SVG, with the numbers in a table for screen readers. */
function DayColumns({ days, series, label }: { days: FunnelDay[]; series: Series; label: string }) {
  if (days.length === 0) return <p className="meta">No activity in this range.</p>;
  const values = days.map((d) => d[series]);
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  const w = 10;
  return (
    <>
      <svg
        className="cols"
        viewBox={`0 0 ${days.length * w} 100`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} per day: ${total} in total, most in one day ${Math.max(...values)}`}
      >
        {days.map((d, i) => {
          const h = (d[series] / max) * 100;
          return (
            <rect key={d.day} x={i * w + 1} y={100 - h} width={w - 2} height={h}>
              <title>
                {dayLabel(d.day)}: {d[series]}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="row meta" style={{ justifyContent: 'space-between' }}>
        <span>{dayLabel(days[0]!.day)}</span>
        <span>Most in a day: {max}</span>
        <span>{dayLabel(days[days.length - 1]!.day)}</span>
      </div>
      <details>
        <summary className="meta">Show the numbers per day</summary>
        <table>
          <thead>
            <tr>
              <th>Day</th>
              {SERIES.map((s) => (
                <th key={s.id}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td>{dayLabel(d.day)}</td>
                {SERIES.map((s) => (
                  <td key={s.id}>{d[s.id]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function RateCell({ rate, n, of }: { rate: Num; n: number; of: number }) {
  if (!of) return <td className="meta">Too early</td>;
  return (
    <td>
      {formatPct(rate)}{' '}
      <span className="meta">
        ({n}/{of})
      </span>
      <Bar value={Number(rate ?? 0)} max={100} />
    </td>
  );
}

function RetentionView({ weeks }: { weeks: RetentionWeek[] }) {
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Signup week</th>
            <th>New members</th>
            <th>D1</th>
            <th>D7 (target 25%)</th>
            <th>D30</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.signup_week}>
              <td>{dayLabel(w.signup_week)}</td>
              <td>{w.cohort}</td>
              <RateCell rate={w.d1_rate} n={w.d1} of={w.d1_eligible} />
              <RateCell rate={w.d7_rate} n={w.d7} of={w.d7_eligible} />
              <RateCell rate={w.d30_rate} n={w.d30} of={w.d30_eligible} />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">
        Active means the app was opened exactly 1, 7 or 30 days after signing up. Rates only count
        members old enough to have reached that day.
      </p>
    </>
  );
}

function LiquidityView({ l, allCampuses }: { l: Liquidity; allCampuses: boolean }) {
  const maxCreated = Math.max(1, ...l.weeks.map((w) => w.listings_created));
  return (
    <>
      <WeekTable
        empty={l.weeks.length === 0}
        head={[
          'Week',
          'Listings created',
          'Sold in 14 days',
          'Sell-through (target 30%)',
          'Median hours to first offer',
          'Active buyers',
          'Feed ran low (count)',
        ]}
      >
        {l.weeks.map((w) => (
          <tr key={w.week}>
            <td>{dayLabel(w.week)}</td>
            <td>
              {w.listings_created}
              <Bar value={w.listings_created} max={maxCreated} />
            </td>
            <td>{w.sold_14d}</td>
            <td>
              {formatPct(w.sell_through_14d)}
              {w.sell_through_final ? null : <span className="meta"> so far</span>}
            </td>
            <td>
              {allCampuses && w.median_hours_to_first_offer === null
                ? 'One campus only'
                : formatHours(w.median_hours_to_first_offer)}
            </td>
            <td>{w.active_buyers}</td>
            <td>{w.feed_exhausted}</td>
          </tr>
        ))}
      </WeekTable>
      <p className="meta">
        Feed ran low is a raw count of feed loads that ended with fewer than 5 new cards. The PRD
        defines feed exhaustion as a percent of feed sessions, but feed sessions aren't counted yet,
        so there is no percent. Watch the trend against active buyers instead.
      </p>
      <p className="meta">
        Sell-through is final once the week is 3 weeks old; newer weeks say &quot;so far&quot;.
      </p>
    </>
  );
}

function SafetyView({ weeks, allCampuses }: { weeks: SafetyWeek[]; allCampuses: boolean }) {
  return (
    <>
      <WeekTable
        empty={false}
        head={[
          'Week',
          'Reports',
          'Completed swaps',
          'Reports per 100 swaps (target < 5)',
          'p90 hours to resolve (target < 24)',
          'Meetups confirmed',
          'Completed',
          'No-show rate (target < 10%)',
        ]}
      >
        {weeks.map((w) => (
          <tr key={w.week}>
            <td>{dayLabel(w.week)}</td>
            <td>{w.reports}</td>
            <td>{w.completed_swaps}</td>
            <td>
              <Flag v={w.reports_per_100_swaps} t={TARGETS.reports_per_100_swaps}>
                {w.reports_per_100_swaps ?? 'n/a'}
              </Flag>
            </td>
            <td>
              {allCampuses && w.p90_hours_to_resolve === null ? (
                'One campus only'
              ) : (
                <Flag v={w.p90_hours_to_resolve} t={TARGETS.p90_hours_to_resolve}>
                  {formatHours(w.p90_hours_to_resolve)}
                </Flag>
              )}
            </td>
            <td>{w.meetups_confirmed}</td>
            <td>{formatPct(w.completion_rate)}</td>
            <td>
              <Flag v={w.no_show_rate} t={TARGETS.no_show_rate}>
                {formatPct(w.no_show_rate)}
              </Flag>
            </td>
          </tr>
        ))}
      </WeekTable>
      <p className="meta">Weeks start on Monday and go by the week a meetup was confirmed.</p>
    </>
  );
}

function Flag({ v, t, children }: { v: Num; t: Target; children: ReactNode }) {
  const s = targetStatus(v, t);
  return s === 'missed' ? (
    <span className="error" title="Misses the target">
      {children}
    </span>
  ) : (
    <>{children}</>
  );
}

function WeekTable({
  head,
  empty,
  children,
}: {
  head: string[];
  empty: boolean;
  children: ReactNode;
}) {
  if (empty) return <p className="meta">Nothing here right now.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
