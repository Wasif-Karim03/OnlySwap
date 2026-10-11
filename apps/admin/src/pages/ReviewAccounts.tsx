import { useState } from 'react';

import { errorMessage, knownError, reasonError, timeAgo } from '../logic';
import { rpc } from '../supabase';
import type { ReviewAccount } from '../types';
import { ActionButton, Button, Card, Field, Loadable, Pill, Table, useRpc } from '../ui';

/** App Review accounts (owner): reviewer logins for the Demo University campus. */
export function ReviewAccountsSection() {
  const state = useRpc<ReviewAccount[]>('admin_list_review_accounts');
  const [edit, setEdit] = useState<{ email: string; note: string; isNew: boolean } | null>(null);
  return (
    <>
      <p className="note">
        App Store and Google Play reviewers sign in to the demo campus with these addresses (and a
        password instead of a code). A note with the word "reviewer" marks the account the demo bots
        answer; the others are the Demo University bots.
      </p>
      <Card
        title="Review accounts"
        right={
          <Button icon="plus" onClick={() => setEdit({ email: '', note: '', isNew: true })}>
            Add account
          </Button>
        }
      >
        {edit ? (
          <ReviewForm
            key={edit.email || 'new'}
            initial={edit}
            onClose={() => setEdit(null)}
            onSaved={() => {
              setEdit(null);
              state.reload();
            }}
          />
        ) : null}
        <Loadable
          state={state}
          rows={4}
          empty={(d) => d.length === 0}
          emptyText="No review accounts yet. Add one before you submit to the stores."
        >
          {(rows) => (
            <Table
              label="Review accounts"
              columns={[
                'Email',
                'Note',
                'Account',
                'Last sign-in',
                { label: '', className: 'actions' },
              ]}
            >
              {rows.map((r) => (
                <tr key={r.email}>
                  <td className="strong">{r.email}</td>
                  <td className="ink2 wrap">{r.note ?? <span className="muted">No note</span>}</td>
                  <td>
                    {r.has_account ? (
                      <Pill
                        tone="green"
                        label={`Signed up${r.campus ? `, ${r.campus.short_name}` : ''}`}
                      />
                    ) : (
                      <Pill tone="neutral" label="Not signed up yet" />
                    )}
                  </td>
                  <td className="muted">
                    {r.last_sign_in_at ? timeAgo(r.last_sign_in_at) : 'Never'}
                  </td>
                  <td className="actions">
                    <div className="row">
                      <Button
                        size="sm"
                        onClick={() =>
                          setEdit({ email: r.email, note: r.note ?? '', isNew: false })
                        }
                      >
                        Edit
                      </Button>
                      <ActionButton
                        label="Delete"
                        kind="danger"
                        size="sm"
                        confirm={`Remove ${r.email}? They can't sign in to the demo campus after this.`}
                        run={(reason) =>
                          rpc('admin_delete_review_account', { email: r.email, reason })
                        }
                        onDone={state.reload}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Loadable>
      </Card>
    </>
  );
}

function ReviewForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: { email: string; note: string; isNew: boolean };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(initial.email);
  const [note, setNote] = useState(initial.note);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="cb stack tight"
      style={{ borderBottom: '1px solid var(--color-line)' }}
      aria-label={initial.isNew ? 'Add review account' : 'Edit review account'}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
          return setMsg('Enter an email address.');
        const invalid = reasonError(reason);
        if (invalid) return setMsg(invalid);
        setBusy(true);
        setMsg(null);
        try {
          await rpc('admin_upsert_review_account', {
            email: email.trim(),
            note: note.trim(),
            reason: reason.trim(),
          });
          onSaved();
        } catch (err) {
          setMsg(
            knownError(err, {
              'INVALID:email': 'Enter a valid email address.',
              'INVALID:note': 'Keep the note under 200 characters.',
            }) || errorMessage(err),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="inline-form">
        <Field label="Email">
          <input
            type="email"
            value={email}
            disabled={!initial.isNew}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="appreview@demo.edu"
          />
        </Field>
        <Field label="Note">
          <input
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Apple reviewer"
          />
        </Field>
        <Field label="Reason (saved to the audit log)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>
          {initial.isNew ? 'Add' : 'Save'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {msg ? <p className="error">{msg}</p> : null}
    </form>
  );
}
