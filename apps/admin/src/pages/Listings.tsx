import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { listingStatus } from '../labels';
import { timeAgo, whenLabel } from '../logic';
import { useCampusId, useSession } from '../session';
import { rpc } from '../supabase';
import {
  ActionButton,
  Card,
  Loadable,
  ListingCell,
  Page,
  Pager,
  Segmented,
  StatusPill,
  Table,
  useRpc,
} from '../ui';

type ListingRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  price_cents: number;
  campus_id: string;
  seller: string | null;
  thumb_path: string | null;
  created_at: string;
};

const VIEWS = [
  { id: 'held_review', label: 'Held for review' },
  { id: 'active', label: 'Active' },
  { id: 'removed', label: 'Removed' },
] as const;
type View = (typeof VIEWS)[number]['id'];

/**
 * Listings: the held-for-review queue, live listings, and removed ones that
 * can be restored. Every action asks for a reason and is audited.
 */
export function ListingsPage() {
  const campusId = useCampusId();
  const { counts, refreshCounts, campuses } = useSession();
  const [view, setView] = useState<View>('held_review');
  const [cursor, setCursor] = useState(0);
  const state = useRpc<ListingRow[]>('admin_list_listings', {
    filters: { status: view, ...(campusId ? { campus_id: campusId } : {}) },
    cursor,
  });
  const campusName = (id: string) => campuses.find((c) => c.id === id)?.short_name ?? '';
  const done = () => {
    state.reload();
    refreshCounts();
  };

  return (
    <Page
      title="Listings"
      crumb={counts?.held_listings ? `${counts.held_listings} held for review` : undefined}
    >
      <div className="filters">
        <Segmented
          label="Show"
          options={VIEWS.map((v) => ({
            id: v.id,
            label:
              v.id === 'held_review' && counts?.held_listings
                ? `${v.label} ${counts.held_listings}`
                : v.label,
          }))}
          value={view}
          onChange={(v) => {
            setView(v);
            setCursor(0);
          }}
        />
        <span className="muted spacer">
          Chats stay private. They open only from a report, and every read is logged.
        </span>
      </div>
      <Card>
        <Loadable
          state={state}
          rows={6}
          empty={(d) => d.length === 0}
          emptyText={
            view === 'held_review' ? 'Nothing is waiting for review.' : 'No listings here.'
          }
        >
          {(rows) => (
            <>
              <Table
                label="Listings"
                columns={[
                  'Listing',
                  'Seller',
                  'Campus',
                  'Status',
                  'Posted',
                  { label: '', className: 'actions' },
                ]}
              >
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td className="wrap" style={{ minWidth: 280 }}>
                      <Link
                        to="/listings/$id"
                        params={{ id: l.id }}
                        style={{ textDecoration: 'none' }}
                      >
                        <ListingCell
                          listing={{
                            title: l.title,
                            price_cents: l.price_cents,
                            photo: l.thumb_path,
                          }}
                        />
                      </Link>
                      {l.description ? (
                        <div className="muted small" style={{ marginTop: 4, maxWidth: 420 }}>
                          {l.description}
                        </div>
                      ) : null}
                    </td>
                    <td>{l.seller ?? <span className="muted">Deleted account</span>}</td>
                    <td className="ink2">{campusName(l.campus_id)}</td>
                    <td>
                      <StatusPill {...listingStatus(l.status)} />
                    </td>
                    <td className="muted" title={whenLabel(l.created_at)}>
                      {timeAgo(l.created_at)}
                    </td>
                    <td className="actions">
                      <div className="row">
                        {l.status !== 'active' ? (
                          <ActionButton
                            label={l.status === 'removed' ? 'Restore' : 'Approve'}
                            size="sm"
                            run={(reason) =>
                              rpc('admin_set_listing_status', {
                                id: l.id,
                                status: 'active',
                                reason,
                              })
                            }
                            onDone={done}
                          />
                        ) : null}
                        {l.status !== 'removed' ? (
                          <ActionButton
                            label="Remove"
                            kind="danger"
                            size="sm"
                            run={(reason) =>
                              rpc('admin_set_listing_status', {
                                id: l.id,
                                status: 'removed',
                                reason,
                              })
                            }
                            onDone={done}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
              <Pager
                hasPrev={cursor > 0}
                hasNext={rows.length === 50}
                onPrev={() => setCursor(Math.max(0, cursor - 50))}
                onNext={() => setCursor(cursor + 50)}
              />
            </>
          )}
        </Loadable>
      </Card>
    </Page>
  );
}
