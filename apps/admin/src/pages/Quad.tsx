import { useState } from 'react';

import { quadStatus, userStatus } from '../labels';
import {
  canReveal,
  errorMessage,
  holdReasonLabel,
  QUAD_VIEWS,
  revealFormError,
  timeAgo,
  whenLabel,
  type QuadView,
} from '../logic';
import { useSession, useWho } from '../session';
import { rpc, supabase } from '../supabase';
import {
  ActionButton,
  Button,
  Card,
  Field,
  Icon,
  Loadable,
  media,
  Page,
  Pager,
  PersonCell,
  Pill,
  Segmented,
  StatusPill,
  Table,
  useRpc,
} from '../ui';

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

/**
 * Quad moderation: held, hidden-by-votes and reported posts and replies.
 * Rows never carry author ids; only the owner can reveal an author, with a
 * fresh authenticator code, a case reference and a receipt email.
 */
export function QuadPage() {
  const who = useWho();
  const { counts, refreshCounts, campuses } = useSession();
  const [view, setView] = useState<QuadView>('held');
  const [cursor, setCursor] = useState(0);
  const state = useRpc<QuadRow[]>('admin_list_quad', { filters: { view }, cursor });
  const [revealFor, setRevealFor] = useState<QuadRow | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const owner = canReveal(who);
  const campusName = (id: string) => campuses.find((c) => c.id === id)?.short_name ?? '';
  const done = () => {
    state.reload();
    refreshCounts();
  };

  return (
    <Page title="Quad" crumb="Moderation · authors stay hidden">
      <div className="filters">
        <Segmented
          label="Quad queue"
          options={QUAD_VIEWS.map((v) => ({
            id: v.id,
            label:
              v.id === 'held' && counts?.quad_held ? `${v.label} ${counts.quad_held}` : v.label,
          }))}
          value={view}
          onChange={(v) => {
            setView(v);
            setCursor(0);
          }}
        />
        <span className="muted spacer">
          Held automatically when a post matches a review word, names a student or gets voted down.
        </span>
      </div>
      <p className="note">
        Quad is anonymous. This list never shows who wrote a post. Approve and Remove are written to
        the audit log.
      </p>
      <div
        className="split"
        style={{
          gridTemplateColumns: revealed || revealFor ? 'minmax(0, 1fr) 280px' : 'minmax(0, 1fr)',
        }}
      >
        <Card>
          <Loadable
            state={state}
            rows={6}
            empty={(d) => d.length === 0}
            emptyText={
              view === 'held'
                ? 'Nothing is held.'
                : view === 'hidden'
                  ? 'Nothing is hidden.'
                  : 'No reported posts.'
            }
          >
            {(rows) => (
              <>
                <Table
                  compact
                  label="Quad posts"
                  columns={[
                    'Post',
                    'Why',
                    { label: 'Votes', num: true },
                    { label: 'Reports', num: true },
                    'Posted',
                    { label: '', className: 'actions' },
                  ]}
                >
                  {rows.map((q) => (
                    <tr key={`${q.target_type}:${q.id}`}>
                      <td className="wrap" style={{ minWidth: 180 }}>
                        <div
                          className="row"
                          style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}
                        >
                          {q.photo_path && media(q.photo_path) ? (
                            <img
                              className="th"
                              src={media(q.photo_path)}
                              alt="Photo on this post"
                            />
                          ) : null}
                          <div>
                            <div style={{ fontWeight: 500, lineHeight: 1.4 }}>{q.body}</div>
                            <div className="muted small">
                              {q.target_type === 'reply' ? 'Reply' : 'Post'}
                              {q.kind && q.target_type === 'post' && q.kind !== 'text'
                                ? ` · ${q.kind}`
                                : ''}
                              {q.status !== view ? (
                                <>
                                  {' · '}
                                  {quadStatus(q.status).label}
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {q.hold_reason ? (
                          <Pill
                            tone={q.hold_reason === 'names_student' ? 'red' : 'amber'}
                            label={holdReasonLabel(q.hold_reason)}
                          />
                        ) : (
                          <StatusPill {...quadStatus(q.status)} />
                        )}
                      </td>
                      <td className="num">{q.score}</td>
                      <td className="num">{q.open_reports}</td>
                      <td className="muted" title={whenLabel(q.created_at)}>
                        {timeAgo(q.created_at)}
                        <div className="small">{campusName(q.campus_id)}</div>
                      </td>
                      <td className="actions">
                        <div className="row">
                          {q.status === 'held' || q.status === 'hidden' ? (
                            <ActionButton
                              label="Approve"
                              size="sm"
                              run={(reason) =>
                                rpc('admin_moderate_quad', {
                                  target_type: q.target_type,
                                  id: q.id,
                                  action: 'approve',
                                  reason,
                                })
                              }
                              onDone={done}
                            />
                          ) : null}
                          {q.status !== 'removed' ? (
                            <ActionButton
                              label="Remove"
                              kind="danger"
                              size="sm"
                              run={(reason) =>
                                rpc('admin_moderate_quad', {
                                  target_type: q.target_type,
                                  id: q.id,
                                  action: 'remove',
                                  reason,
                                })
                              }
                              onDone={done}
                            />
                          ) : null}
                          {owner ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon="lock"
                              onClick={() => {
                                setRevealed(null);
                                setRevealFor(q);
                              }}
                            >
                              Reveal author
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
                <Pager
                  hasPrev={cursor > 0}
                  hasNext={rows.length === PAGE}
                  onPrev={() => setCursor(Math.max(0, cursor - PAGE))}
                  onNext={() => setCursor(cursor + PAGE)}
                />
              </>
            )}
          </Loadable>
        </Card>
        <div className="stack">
          {revealed ? (
            <Card title={`Author for case ${revealed.case_ref}`}>
              <div className="cb stack tight">
                <div className="row">
                  <PersonCell
                    person={{ id: revealed.user_id, display_name: revealed.display_name }}
                  />
                  <StatusPill {...userStatus(revealed.status)} />
                </div>
                <p className="muted small">User id {revealed.user_id}</p>
                <div>
                  <Button onClick={() => setRevealed(null)}>Close</Button>
                </div>
              </div>
            </Card>
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
        </div>
      </div>
    </Page>
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
      className="card clip"
      aria-label="Reveal author"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="ch">
        <Icon name="lock" />
        <h2>Reveal who wrote this {row.target_type === 'reply' ? 'reply' : 'post'}</h2>
      </div>
      <div className="cb stack tight">
        <div className="callout red">
          Use this only for safety cases. The author gets an email saying an admin looked up who
          wrote it. At most 5 a day, each written to the audit log.
        </div>
        {row.body ? <div className="bubble">{row.body}</div> : null}
        <Field label="Case reference">
          <input
            value={caseRef}
            onChange={(e) => setCaseRef(e.target.value)}
            required
            minLength={3}
            autoComplete="off"
          />
        </Field>
        <Field label="Reason (saved to the audit log)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            autoComplete="off"
          />
        </Field>
        <Field label="Authenticator code">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </Field>
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Checking…' : 'Reveal author'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
