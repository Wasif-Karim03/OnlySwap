import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { meetupPill, plural, userStatus } from '../labels';
import { dateLabel, whenLabel } from '../logic';
import { useCampusId, useSession } from '../session';
import type { MeetupRow, NoShowSummary } from '../types';
import {
  Card,
  FilterChip,
  Loadable,
  MoreList,
  Page,
  PersonCell,
  Segmented,
  StatusPill,
  Table,
  useLoadMore,
  useRpc,
} from '../ui';

const WHEN = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
] as const;
type When = (typeof WHEN)[number]['id'];

/** Meetups and no-shows (DEC 93): upcoming and past meetups, and who keeps missing. */
export function MeetupsPage() {
  const sideCampus = useCampusId();
  const { campuses, who } = useSession();
  const owner = who.role === 'owner';
  const [when, setWhen] = useState<When>('upcoming');
  const [campus, setCampus] = useState<string | null>(null);
  const campusId = campus ?? sideCampus ?? '';
  const list = useLoadMore<MeetupRow>('admin_list_meetups', {
    campus_id: campusId || null,
    when,
    cursor: 0,
  });
  const noshows = useRpc<NoShowSummary>('admin_noshow_summary', { campus_id: campusId || null });

  return (
    <Page title="Meetups" crumb="Where and when students meet, and who misses">
      <div className="filters">
        <Segmented label="Show" options={WHEN} value={when} onChange={setWhen} />
        {owner ? (
          <FilterChip label="Campus">
            <select value={campusId} onChange={(e) => setCampus(e.target.value)}>
              <option value="">All</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.short_name || c.name}
                </option>
              ))}
            </select>
          </FilterChip>
        ) : null}
        <span className="muted spacer">
          {when === 'upcoming'
            ? 'Suggested and confirmed meetups from 2 hours ago on, soonest first.'
            : 'Newest first.'}
        </span>
      </div>
      <div className="split main-side">
        <Card>
          <MoreList
            state={list}
            rows={8}
            emptyText={when === 'upcoming' ? 'No meetups coming up.' : 'No past meetups.'}
          >
            {(items) => (
              <Table
                label="Meetups"
                columns={['When', 'Place', 'Buyer', 'Seller', 'Listing', 'Status']}
              >
                {items.map((m) => (
                  <tr key={m.id}>
                    <td className="tnum">{whenLabel(m.starts_at)}</td>
                    <td className="ink2 wrap" style={{ minWidth: 140 }}>
                      {m.place ?? 'Custom place'}
                    </td>
                    <td>
                      <PersonCell person={m.buyer} />
                    </td>
                    <td>
                      <PersonCell person={m.seller} />
                    </td>
                    <td>
                      {m.listing?.id ? (
                        <Link className="link" to="/listings/$id" params={{ id: m.listing.id }}>
                          {m.listing.title}
                        </Link>
                      ) : (
                        <span className="muted">{m.listing?.title ?? 'Listing gone'}</span>
                      )}
                    </td>
                    <td>
                      <StatusPill {...meetupPill(m)} />
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </MoreList>
        </Card>
        <div className="side-col">
          <Card title="Who keeps missing">
            <Loadable state={noshows} rows={4}>
              {(n) => (
                <>
                  <div className="cb row" style={{ gap: 20 }}>
                    <div>
                      <div className="big-num">{n.totals.confirmed}</div>
                      <div className="muted small">Confirmed no-shows</div>
                    </div>
                    <div>
                      <div className="big-num">{n.totals.open}</div>
                      <div className="muted small">Waiting</div>
                    </div>
                    <div>
                      <div className="big-num">{n.totals.rejected}</div>
                      <div className="muted small">Rejected</div>
                    </div>
                  </div>
                  {n.people.length ? (
                    n.people.map((p) => (
                      <div key={p.id} className="ev">
                        <PersonCell
                          person={p}
                          sub={`${plural(p.noshow_count, 'no-show')}${p.reports_open ? `, ${p.reports_open} waiting` : ''}${p.last_at ? `, last ${dateLabel(p.last_at)}` : ''}`}
                        />
                        <span className="spacer" />
                        <StatusPill {...userStatus(p.status)} />
                      </div>
                    ))
                  ) : (
                    <p className="muted" style={{ padding: '0 16px 14px' }}>
                      Nobody has missed a meetup.
                    </p>
                  )}
                  <p className="note" style={{ padding: '10px 16px 14px' }}>
                    Last 180 days. A reported no-show confirms itself after 24 hours without an
                    appeal; at the campus limit the account is paused.
                  </p>
                </>
              )}
            </Loadable>
          </Card>
        </div>
      </div>
    </Page>
  );
}
