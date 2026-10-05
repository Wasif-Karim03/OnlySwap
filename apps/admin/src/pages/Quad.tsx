import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import {
  ageLabel,
  canReveal,
  errorMessage,
  formatWhen,
  holdReasonLabel,
  QUAD_VIEWS,
  revealFormError,
  type QuadView,
  type Whoami,
} from '../logic';
import { rpc, supabase } from '../supabase';
import { ActionButton, Loadable, useRpc } from '../ui';

type QuadRow = {
  target_type: 'post' | 'reply';
  id: string;
  post_id: string | null;
  campus_id: string;
  kind: string;
  body: string | null;
  photo_path: string | null;
  status: string;
  hold_reason: string | null;
  score: number;
  created_at: string;
  open_reports: number;
};

type Revealed = {
  user_id: string;
  display_name: string | null;
  status: string;
  case_ref: string;
};

const PAGE = 50;
const mediaBase = (import.meta.env.VITE_MEDIA_URL as string | undefined) ?? '';

/**
 * G-QUAD (R11-ADM-03): held, hidden-by-votes and reported Quad posts and
 * replies. Rows never carry author ids; only the owner can reveal an author,
 * with a fresh authenticator code, a case reference and a receipt email.
 */
export function QuadPage({ who }: { who: Whoami }) {
  const [view, setView] = useState<QuadView>('held');
  const [cursor, setCursor] = useState(0);
  const state = useRpc<QuadRow[]>('admin_list_quad', { filters: { view }, cursor });
  const [revealFor, setRevealFor] = useState<QuadRow | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const owner = canReveal(who);

  return (
    <>
      <h1>Quad</h1>
      <div className="row" role="tablist" aria-label="Quad queues">
        {QUAD_VIEWS.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={view === v.id}
            className={view === v.id ? undefined : 'secondary'}
            onClick={() => {
              setView(v.id);
              setCursor(0);
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {revealed ? (
        <div className="card" role="region" aria-label="Revealed author">
          <h2>Author for case {revealed.case_ref}</h2>
          <p>
            <Link to="/users/$id" params={{ id: revealed.user_id }}>
              {revealed.display_name ?? 'No display name'}
            </Link>{' '}
            <span className="pill">{revealed.status}</span>
          </p>
          <p className="meta">User id {revealed.user_id}</p>
          <button className="secondary" onClick={() => setRevealed(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {revealFor && owner ? (
        <RevealForm
          row={revealFor}
          onCancel={() => setRevealFor(null)}
          onRevealed={(r) => {
            setRevealFor(null);
            setRevealed(r);
          }}
        />
      ) : null}

      <div style={{ marginTop: 'var(--space-lg)' }}>
        <Loadable state={state} empty={(d) => d.length === 0}>
          {(rows) => (
            <table>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Post</th>
                  <th>Status</th>
                  <th>Why</th>
                  <th>Score</th>
                  <th>Open reports</th>
                  <th>Age</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => (
                  <tr key={`${q.target_type}:${q.id}`}>
                    <td>{q.target_type === 'reply' ? 'Reply' : q.kind}</td>
                    <td>
                      {q.photo_path && mediaBase ? (
                        <img
                          src={`${mediaBase}/${q.photo_path}`}
                          alt="Photo on this post"
                          width={64}
                          height={64}
                          style={{ borderRadius: 'var(--radius-thumb)', objectFit: 'cover' }}
                        />
                      ) : null}
                      <div>{q.body}</div>
                    </td>
                    <td>
                      <span className="pill">{q.status}</span>
                    </td>
                    <td>{holdReasonLabel(q.hold_reason)}</td>
                    <td>{q.score}</td>
                    <td>{q.open_reports}</td>
                    <td className="meta" title={formatWhen(q.created_at)}>
                      {ageLabel(q.created_at, Date.now())}
                    </td>
                    <td>
                      <div className="row">
                        {q.status === 'held' || q.status === 'hidden' ? (
                          <ActionButton
                            label="Approve"
                            run={(reason) =>
                              rpc('admin_moderate_quad', {
                                target_type: q.target_type,
                                id: q.id,
                                action: 'approve',
                                reason,
                              })
                            }
                            onDone={state.reload}
                          />
                        ) : null}
                        {q.status !== 'removed' ? (
                          <ActionButton
                            label="Remove"
                            kind="danger"
                            run={(reason) =>
                              rpc('admin_moderate_quad', {
                                target_type: q.target_type,
                                id: q.id,
                                action: 'remove',
                                reason,
                              })
                            }
                            onDone={state.reload}
                          />
                        ) : null}
                        {owner ? (
                          <button
                            className="secondary"
                            onClick={() => {
                              setRevealed(null);
                              setRevealFor(q);
                            }}
                          >
                            Reveal author
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Loadable>
      </div>

      <div className="row" style={{ marginTop: 'var(--space-md)' }}>
        <button
          className="secondary"
          disabled={cursor === 0}
          onClick={() => setCursor(Math.max(0, cursor - PAGE))}
        >
          Previous page
        </button>
        <button
          className="secondary"
          disabled={(state.data?.length ?? 0) < PAGE}
          onClick={() => setCursor(cursor + PAGE)}
        >
          Next page
        </button>
      </div>
      <p className="meta">
        Quad is anonymous. This list never shows who wrote a post. Approve and Remove are written to
        the audit log.
      </p>
    </>
  );
}

/**
 * Owner-only reveal. Runs a fresh TOTP challenge and verify (the server wants
 * a TOTP check in the last 10 minutes), refreshes the session so the new JWT
 * carries it, then calls admin_reveal_quad_author. Nothing is kept in the URL
 * or local storage; the result lives only in page state.
 */
function RevealForm({
  row,
  onCancel,
  onRevealed,
}: {
  row: QuadRow;
  onCancel: () => void;
  onRevealed: (r: Revealed) => void;
}) {
  const [caseRef, setCaseRef] = useState('');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const invalid = revealFormError(caseRef, reason, code);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const totp = factors.data.totp.find((f) => f.status === 'verified');
      if (!totp) throw new Error('No authenticator is set up on this account.');
      const ch = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (ch.error) throw ch.error;
      const v = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: ch.data.id,
        code: code.trim(),
      });
      if (v.error) throw v.error;
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      const r = await rpc<Revealed>('admin_reveal_quad_author', {
        target_type: row.target_type,
        id: row.id,
        case_ref: caseRef.trim(),
        reason: reason.trim(),
      });
      onRevealed(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCode('');
      setBusy(false);
    }
  };

  return (
    <form
      className="card"
      aria-label="Reveal author"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2>Reveal who wrote this {row.target_type === 'reply' ? 'reply' : 'post'}</h2>
      <p className="error">
        Use this only for safety cases. The author gets an email saying an admin looked up who wrote
        it. You can do this at most 5 times a day, and each one is written to the audit log.
      </p>
      {row.body ? <p className="bubble">{row.body}</p> : null}
      <div className="row">
        <label>
          Case reference
          <input
            value={caseRef}
            onChange={(e) => setCaseRef(e.target.value)}
            required
            minLength={3}
            autoComplete="off"
          />
        </label>
        <label>
          Reason (saved to the audit log)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            autoComplete="off"
          />
        </label>
        <label>
          Authenticator code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </label>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="row" style={{ marginTop: 'var(--space-md)' }}>
        <button type="submit" className="danger" disabled={busy}>
          {busy ? 'Checking…' : 'Reveal author'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
