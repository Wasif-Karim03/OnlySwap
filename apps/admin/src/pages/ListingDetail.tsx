import { Link, useParams, useSearch } from '@tanstack/react-router';
import { useState } from 'react';

import {
  condition,
  dwellLabel,
  listingStatus,
  offerStatus,
  platform,
  reportReason,
  reportStatus,
  swipeDirection,
  viewSource,
} from '../labels';
import {
  comparisonText,
  dateLabel,
  funnelRows,
  moneyLabel,
  rightLeft,
  SWIPE_FILTERS,
  swipeCounts,
  timeAgo,
  whenLabel,
  type SwipeFilter,
} from '../logic';
import { useSession } from '../session';
import { rpc } from '../supabase';
import type { ListingActivity } from '../types';
import {
  Bar,
  Card,
  EmptyState,
  EventIcon,
  ListingCell,
  Loadable,
  Loading,
  LoggedNote,
  Page,
  PersonCell,
  ReasonActions,
  Segmented,
  StatusPill,
  Table,
  useRpc,
  type ReasonAction,
} from '../ui';

const TABS = ['swipes', 'offers', 'views', 'price', 'reports'] as const;
type Tab = (typeof TABS)[number];

/**
 * One listing (admin_listing_activity, DEC 93): who swiped which way and
 * when, offers, views, price history, funnel and right vs left. Opening it is
 * written to the audit log by the server.
 */
export function ListingDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const search = useSearch({ strict: false }) as Partial<Record<string, string>>;
  const tab: Tab = (TABS as readonly string[]).includes(search.tab ?? '')
    ? (search.tab as Tab)
    : 'swipes';
  const { refreshCounts } = useSession();
  const state = useRpc<ListingActivity>('admin_listing_activity', { listing_id: id });
  const title = state.data?.listing.title;

  return (
    <Page title="Listings" crumb={<>/ {title ?? '…'}</>}>
      <Loadable state={state} rows={8}>
        {(d) => {
          const l = d.listing;
          const setStatus =
            (status: string) =>
            (reason: string): Promise<unknown> =>
              rpc('admin_set_listing_status', { id: l.id, status, reason });
          const actions: ReasonAction[] = [
            ...(l.status === 'active' || l.status === 'hold'
              ? [{ id: 'held_review', label: 'Hold', run: setStatus('held_review') }]
              : []),
            ...(l.status === 'held_review' || l.status === 'removed'
              ? [
                  {
                    id: 'active',
                    label: l.status === 'removed' ? 'Restore' : 'Approve',
                    variant: 'primary' as const,
                    run: setStatus('active'),
                  },
                ]
              : []),
            ...(l.status !== 'removed' && l.status !== 'deleted'
              ? [
                  {
                    id: 'removed',
                    label: 'Remove',
                    variant: 'danger' as const,
                    confirm: `Remove "${l.title}"? Open offers and chats about it wind down.`,
                    run: setStatus('removed'),
                  },
                ]
              : []),
          ];
          const counts = swipeCounts(d.who_swiped);
          const tabs: [Tab, string, number | null][] = [
            ['swipes', 'Who swiped', counts.all],
            ['offers', 'Offers', d.offers.length],
            ['views', 'Views', l.views],
            ['price', 'Price history', d.price_history.length],
            ['reports', 'Reports', l.reports],
          ];
          return (
            <>
              <section className="card" aria-label="Listing">
                <div className="hero" style={{ padding: '16px 20px' }}>
                  <ListingCell
                    listing={{ title: '', photo: l.photo }}
                    size="lg"
                    showPrice={false}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="row">
                      <span className="name">{l.title}</span>
                      <StatusPill {...listingStatus(l.status)} />
                    </div>
                    <div className="facts">
                      {[moneyLabel(l.price_cents, true), condition(l.condition), l.category?.name]
                        .filter(Boolean)
                        .join(' · ')}
                      {l.seller ? (
                        <>
                          {' · by '}
                          <Link className="link" to="/people/$id" params={{ id: l.seller.id }}>
                            {l.seller.display_name}
                          </Link>
                        </>
                      ) : (
                        ' · seller deleted'
                      )}
                      {[
                        l.campus?.short_name,
                        `posted ${timeAgo(l.created_at).toLowerCase()}`,
                        l.spots.length ? l.spots.join(', ') : null,
                      ]
                        .filter(Boolean)
                        .map((x) => ` · ${x}`)
                        .join('')}
                    </div>
                    {l.sold_at ? (
                      <div className="muted small" style={{ marginTop: 3 }}>
                        Sold {dateLabel(l.sold_at)}
                        {l.buyer ? ` to ${l.buyer.display_name}` : ''}
                      </div>
                    ) : null}
                  </div>
                  <div className="nums">
                    <div>
                      <div className="v">{l.views}</div>
                      <div className="l">Views</div>
                    </div>
                    <div>
                      <div className="v">{l.saves}</div>
                      <div className="l">Saves</div>
                    </div>
                    <div>
                      <div className="v">{l.offers}</div>
                      <div className="l">Offers</div>
                    </div>
                  </div>
                </div>
                {l.description ? (
                  <div className="cb" style={{ paddingTop: 0 }}>
                    <p className="ink2" style={{ maxWidth: 760 }}>
                      {l.description}
                    </p>
                  </div>
                ) : null}
                {actions.length ? (
                  <div className="cf">
                    <div style={{ flex: 1 }}>
                      <ReasonActions
                        actions={actions}
                        onDone={() => {
                          state.reload();
                          refreshCounts();
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </section>
              <div className="split main-side wide">
                <Card>
                  <nav className="tabs" aria-label="Listing sections">
                    {tabs.map(([t, label, n]) => (
                      <Link
                        key={t}
                        to="/listings/$id"
                        params={{ id }}
                        search={t === 'swipes' ? {} : { tab: t }}
                        className={tab === t ? 'on' : ''}
                        aria-current={tab === t ? 'page' : undefined}
                      >
                        {label}
                        {n !== null ? <span className="n">{n.toLocaleString('en-US')}</span> : null}
                      </Link>
                    ))}
                  </nav>
                  {tab === 'swipes' ? <SwipesTab d={d} /> : null}
                  {tab === 'offers' ? <OffersTab d={d} /> : null}
                  {tab === 'views' ? <ViewsTab d={d} /> : null}
                  {tab === 'price' ? <PriceTab d={d} /> : null}
                  {tab === 'reports' ? <ReportsTab d={d} /> : null}
                </Card>
                <div className="side-col">
                  <Card title="Funnel">
                    <div className="funnel">
                      {funnelRows(d.funnel).map((r) => (
                        <div key={r.label} className="frow">
                          <span>{r.label}</span>
                          <Bar pct={r.pct} />
                          <span className="num">
                            {r.label === 'Sold' ? (d.funnel.sold ? 'Yes' : 'No') : r.value}
                          </span>
                        </div>
                      ))}
                      <p className="muted small">
                        People, not taps. Shown counts each person once.
                      </p>
                    </div>
                  </Card>
                  <RightVsLeft d={d} />
                  <LoggedNote />
                </div>
              </div>
            </>
          );
        }}
      </Loadable>
    </Page>
  );
}

function RightVsLeft({ d }: { d: ListingActivity }) {
  const split = rightLeft(d.swipes);
  const cmp = comparisonText(d.comparison, d.listing.category?.name, d.listing.campus?.short_name);
  const total = d.swipes.right + d.swipes.left;
  return (
    <Card title="Right vs left">
      <div className="cb">
        {total ? (
          <>
            <div className="split-bar" aria-hidden="true">
              <i className="r" style={{ width: `${split.right}%` }} />
              <i className="l" style={{ width: `${split.left}%` }} />
            </div>
            <div className="row ink2" style={{ justifyContent: 'space-between', marginTop: 8 }}>
              <span>
                <span className="dot" /> Saved or offered {d.swipes.right}
              </span>
              <span>Left {d.swipes.left}</span>
            </div>
          </>
        ) : (
          <p className="muted">No swipes yet.</p>
        )}
        {cmp ? (
          <p className="muted" style={{ marginTop: 10, lineHeight: 1.45 }}>
            {cmp.line}
            {cmp.hint ? ` ${cmp.hint}` : ''}
          </p>
        ) : null}
        {d.swipes.hidden ? (
          <p className="muted small" style={{ marginTop: 6 }}>
            {d.swipes.hidden} hid it with Not interested.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function SwipesTab({ d }: { d: ListingActivity }) {
  const [f, setF] = useState<SwipeFilter>('all');
  const counts = swipeCounts(d.who_swiped);
  const rows = f === 'all' ? d.who_swiped : d.who_swiped.filter((r) => r.direction === f);
  return (
    <>
      <div className="filters in-card">
        <Segmented
          label="Show"
          options={SWIPE_FILTERS.map((s) => ({ id: s.id, label: `${s.label} ${counts[s.id]}` }))}
          value={f}
          onChange={setF}
        />
        <span className="muted spacer">
          One row per person, strongest swipe. Left kept 30 days.
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nobody here yet." />
      ) : (
        <Table label="Who swiped" columns={['Student', 'Swipe', 'When', 'Time on card', 'Then']}>
          {rows.map((r, i) => {
            const s = swipeDirection(r.direction);
            const then = [
              r.offer
                ? `Offered ${moneyLabel(r.offer.amount_cents)}, ${offerStatus(r.offer.status).label.toLowerCase()}${r.offer.round > 1 ? ` (round ${r.offer.round})` : ''}`
                : null,
              r.direction === 'saved' && !r.offer ? 'Saved, no offer yet' : null,
              r.direction === 'offered' && r.saved ? 'also saved' : null,
              r.viewed_first ? 'Viewed details first' : null,
            ].filter(Boolean);
            return (
              <tr key={r.person?.id ?? i}>
                <td>
                  <PersonCell person={r.person} />
                </td>
                <td>
                  <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <EventIcon tone={s.tone} icon={s.icon} />
                    {s.label}
                  </span>
                </td>
                <td className="muted">{whenLabel(r.at)}</td>
                <td className="tnum">
                  {dwellLabel(r.dwell_ms) || <span className="muted">None</span>}
                </td>
                <td className="ink2 details">{then.join(' · ')}</td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}

function OffersTab({ d }: { d: ListingActivity }) {
  if (!d.offers.length) return <EmptyState title="No offers yet." />;
  return (
    <Table label="Offers" columns={['Buyer', 'Offer', 'Status', 'Made', 'Answered']}>
      {d.offers.map((o) => (
        <tr key={o.id}>
          <td>
            <PersonCell person={o.buyer} />
          </td>
          <td>
            <span className="strong">{moneyLabel(o.amount_cents)}</span>
            {o.round > 1 ? <span className="muted"> · round {o.round}</span> : null}
          </td>
          <td>
            <StatusPill {...offerStatus(o.status)} />
          </td>
          <td className="muted">{whenLabel(o.created_at)}</td>
          <td className="muted">{o.responded_at ? whenLabel(o.responded_at) : ''}</td>
        </tr>
      ))}
    </Table>
  );
}

function ViewsTab({ d }: { d: ListingActivity }) {
  if (!d.views.length) return <EmptyState title="No detail views yet." />;
  return (
    <>
      <p className="note" style={{ padding: '10px 16px 0' }}>
        The latest 100 detail views.
      </p>
      <Table label="Views" columns={['Student', 'When', 'Time on page', 'Opened from', 'Device']}>
        {d.views.map((v, i) => (
          <tr key={i}>
            <td>
              <PersonCell person={v.person} />
            </td>
            <td className="muted">{whenLabel(v.at)}</td>
            <td className="tnum">{dwellLabel(v.dwell_ms)}</td>
            <td className="ink2">{viewSource(v.source)}</td>
            <td className="muted">{platform(v.platform)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function PriceTab({ d }: { d: ListingActivity }) {
  if (!d.price_history.length)
    return (
      <EmptyState
        title={`Same price since it was posted: ${moneyLabel(d.listing.price_cents, true)}.`}
      />
    );
  return (
    <Table label="Price history" columns={['When', 'From', 'To', 'Change']}>
      {d.price_history.map((p, i) => {
        const diff = p.new_cents - p.old_cents;
        return (
          <tr key={i}>
            <td className="muted">{whenLabel(p.at)}</td>
            <td>{moneyLabel(p.old_cents, true)}</td>
            <td className="strong">{moneyLabel(p.new_cents, true)}</td>
            <td className={diff < 0 ? 'ok' : 'ink2'}>
              {diff < 0 ? '-' : '+'}
              {moneyLabel(Math.abs(diff))}
            </td>
          </tr>
        );
      })}
    </Table>
  );
}

type ReportRow = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
};

function ReportsTab({ d }: { d: ListingActivity }) {
  const open = useRpc<ReportRow[]>('admin_list_reports', {
    filters: { status: 'open' },
    cursor: 0,
  });
  const done = useRpc<ReportRow[]>('admin_list_reports', {
    filters: { status: 'actioned' },
    cursor: 0,
  });
  const dismissed = useRpc<ReportRow[]>('admin_list_reports', {
    filters: { status: 'dismissed' },
    cursor: 0,
  });
  if (!d.listing.reports) return <EmptyState title="No reports about this listing." />;
  if (open.loading || done.loading || dismissed.loading) return <Loading rows={3} />;
  const rows = [...(open.data ?? []), ...(done.data ?? []), ...(dismissed.data ?? [])].filter(
    (r) => r.target_type === 'listing' && r.target_id === d.listing.id,
  );
  return (
    <>
      {rows.map((r) => (
        <Link key={r.id} className="ev" to="/reports/$id" params={{ id: r.id }}>
          <StatusPill {...reportReason(r.reason)} />
          <StatusPill {...reportStatus(r.status)} dot={false} />
          <span className="t">{whenLabel(r.created_at)}</span>
        </Link>
      ))}
      <div className="pager">
        <span className="muted">
          {d.listing.reports} report{d.listing.reports === 1 ? '' : 's'} in total
          {rows.length < d.listing.reports ? '; older ones are in the report queue' : ''}.
        </span>
        <span className="spacer" />
        <Link className="btn sm" to="/reports">
          Open the report queue
        </Link>
      </div>
    </>
  );
}
