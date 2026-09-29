import { useState } from 'react';

import { formatWhen } from '../logic';
import { rpc } from '../supabase';
import { ActionButton, Loadable, money, useRpc } from '../ui';

type ListingRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  price_cents: number;
  seller: string | null;
  thumb_path: string | null;
  created_at: string;
};

const mediaBase = (import.meta.env.VITE_MEDIA_URL as string | undefined) ?? '';

/**
 * G02 Listings (P12-ADM-07): the held-for-review queue, and removed listings
 * that can be restored. Every action goes through an audited RPC.
 */
export function ListingsPage() {
  const [status, setStatus] = useState('held_review');
  const state = useRpc<ListingRow[]>('admin_list_listings', { filters: { status } });
  return (
    <>
      <h1>Listings</h1>
      <div className="row">
        <label>
          Show
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="held_review">Held for review</option>
            <option value="active">Active</option>
            <option value="removed">Removed</option>
          </select>
        </label>
      </div>
      <Loadable state={state} empty={(d) => d.length === 0}>
        {(rows) => (
          <table>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Listing</th>
                <th>Seller</th>
                <th>Posted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.thumb_path && mediaBase ? (
                      <img
                        src={`${mediaBase}/${l.thumb_path}`}
                        alt=""
                        width={64}
                        height={64}
                        style={{ borderRadius: 'var(--radius-thumb)', objectFit: 'cover' }}
                      />
                    ) : null}
                  </td>
                  <td>
                    <strong>{l.title}</strong> {money(l.price_cents)}
                    <div className="meta">{l.description}</div>
                  </td>
                  <td>{l.seller}</td>
                  <td className="meta">{formatWhen(l.created_at)}</td>
                  <td>
                    <div className="row">
                      {l.status !== 'active' ? (
                        <ActionButton
                          label={l.status === 'removed' ? 'Restore' : 'Approve'}
                          run={(reason) =>
                            rpc('admin_set_listing_status', { id: l.id, status: 'active', reason })
                          }
                          onDone={state.reload}
                        />
                      ) : null}
                      {l.status !== 'removed' ? (
                        <ActionButton
                          label="Remove"
                          kind="danger"
                          run={(reason) =>
                            rpc('admin_set_listing_status', { id: l.id, status: 'removed', reason })
                          }
                          onDone={state.reload}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loadable>
      <p className="meta">
        Chats are private. They open only from a report about a chat or a message, and every read is
        logged.
      </p>
    </>
  );
}
