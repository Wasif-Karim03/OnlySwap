import { useState } from 'react';

import { userStatus } from '../labels';
import { dateLabel, errorMessage, knownError, reasonError } from '../logic';
import { rpc } from '../supabase';
import type { BannedHashes } from '../types';
import {
  ActionButton,
  Button,
  Card,
  Field,
  Loadable,
  Pager,
  PersonCell,
  StatusPill,
  Table,
  useRpc,
} from '../ui';

/**
 * Banned emails (owner): hashes of the school emails of banned accounts, so
 * the same address can't sign up again. Adding an email hashes it on the
 * server; the address itself is never stored.
 */
export function BannedEmailsSection() {
  const [cursor, setCursor] = useState(0);
  const state = useRpc<BannedHashes>('admin_list_banned_hashes', { cursor });
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <>
      <p className="note">
        When an account is banned and deleted, its school email is kept here as a one-way hash so it
        can't sign up again. You can add an address by hand; it is hashed on the server and never
        saved as text.
      </p>
      <Card title="Block an email">
        <form
          className="cb inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
              return setMsg({ ok: false, text: 'Enter the school email to block.' });
            const invalid = reasonError(reason);
            if (invalid) return setMsg({ ok: false, text: invalid });
            setBusy(true);
            setMsg(null);
            try {
              const r = await rpc<{ email_hash: string; added: boolean }>(
                'admin_upsert_banned_hash',
                { email: email.trim(), reason: reason.trim() },
              );
              setMsg({
                ok: true,
                text: r.added ? 'Blocked. That address can no longer sign up.' : 'Already blocked.',
              });
              setEmail('');
              setReason('');
              state.reload();
            } catch (err) {
              setMsg({
                ok: false,
                text:
                  knownError(err, { 'INVALID:email': 'Enter a valid email.' }) || errorMessage(err),
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="School email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Reason (saved to the audit log)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
          </Field>
          <Button type="submit" variant="primary" pending={busy} pendingLabel="Saving…">
            Ban email
          </Button>
          {msg ? <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p> : null}
        </form>
      </Card>
      <Card
        title="Banned emails"
        right={state.data ? <span className="muted">{state.data.total} in total</span> : null}
      >
        <Loadable
          state={state}
          rows={5}
          empty={(d) => d.items.length === 0}
          emptyText="No blocked emails."
        >
          {(d) => (
            <>
              <Table
                label="Banned emails"
                columns={['Hash', 'Account', 'Added', { label: '', className: 'actions' }]}
              >
                {d.items.map((h) => (
                  <tr key={h.email_hash}>
                    <td className="mono hash" title={h.email_hash}>
                      {h.email_hash.slice(0, 16)}…
                    </td>
                    <td>
                      {h.person ? (
                        <span className="row" style={{ gap: 8 }}>
                          <PersonCell person={h.person} />
                          <StatusPill {...userStatus(h.person.status)} />
                        </span>
                      ) : (
                        <span className="muted">No account (deleted or never made)</span>
                      )}
                    </td>
                    <td className="muted">{dateLabel(h.created_at)}</td>
                    <td className="actions">
                      <ActionButton
                        label="Unblock"
                        size="sm"
                        confirm="Unblock this email? It can sign up again."
                        run={(r) =>
                          rpc('admin_delete_banned_hash', { email_hash: h.email_hash, reason: r })
                        }
                        onDone={state.reload}
                      />
                    </td>
                  </tr>
                ))}
              </Table>
              <Pager
                hasPrev={cursor > 0}
                hasNext={d.next_cursor !== null}
                onPrev={() => setCursor(Math.max(0, cursor - 50))}
                onNext={() => setCursor(d.next_cursor ?? cursor)}
              />
            </>
          )}
        </Loadable>
      </Card>
    </>
  );
}
