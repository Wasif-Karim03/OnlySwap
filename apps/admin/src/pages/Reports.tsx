import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import {
  appealStatus,
  appealSubject,
  plural,
  reportActionLabel,
  reportReason,
  reportStatus,
  targetType,
  userStatus,
} from '../labels';
import { allowedActions, dateLabel, needsSuspendDays, timeAgo, whenLabel } from '../logic';
import { useSession, useWho } from '../session';
import { rpc } from '../supabase';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  Loadable,
  media,
  Page,
  PersonCell,
  ReasonActions,
  Segmented,
  StatusPill,
  useRpc,
  type ReasonAction,
} from '../ui';

type ReportRow = {
  id: string;
  campus_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  priority: number;
  status: string;
  created_at: string;
  target_name: string | null;
  reports_on_target: number;
};

type ReportDetail = Omit<ReportRow, 'target_name' | 'reports_on_target'> & {
  details: string | null;
  /** photo_keys and auto ('weapon', 'sexual', ...) come from the automatic photo check (DEC 154). */
  evidence: { text?: string; excerpts?: string[]; photo_keys?: string[]; auto?: string } | null;
  reporter_id: string | null;
  reporter_name: string | null;
  action_taken: string | null;
  resolved_at: string | null;
  target: {
    id: string;
    display_name: string;
    status: string;
    strike_count: number;
    noshow_count: number;
    created_at?: string;
  } | null;
  other_reports: number;
};

type ChatLine = { id: number; sender: string | null; body: string; created_at: string };

const STATUSES = [
  { id: 'open', label: 'Open' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'dismissed', label: 'Dismissed' },
] as const;
type Status = (typeof STATUSES)[number]['id'];

/**
 * Reports (checklist §3): queue on the left, the picked report on the right
 * with the reported person's history and one action row with a reason box.
 */
export function ReportsPage() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const navigate = useNavigate();
  const { counts, refreshCounts } = useSession();
  const [status, setStatus] = useState<Status>('open');
  const queue = useRpc<ReportRow[]>('admin_list_reports', { filters: { status } });
  const rows = queue.data ?? [];
  const selectedId = id ?? rows[0]?.id ?? null;
  const selectedRow = rows.find((r) => r.id === selectedId);
  const open = counts?.open_reports;

  return (
    <Page title="Reports" crumb={open !== undefined ? `${open} open` : undefined}>
      {/* On a phone the queue and the picked report are two screens (master-detail). */}
      <div className={`split master${id ? ' has-detail' : ''}`}>
        <Card
          title={
            <Segmented
              label="Report status"
              options={STATUSES.map((s) => ({
                id: s.id,
                label: s.id === 'open' && open ? `Open ${open}` : s.label,
              }))}
              value={status}
              onChange={(s) => {
                setStatus(s);
                void navigate({ to: '/reports' });
              }}
            />
          }
          label="Report queue"
        >
          <Loadable
            state={queue}
            rows={6}
            empty={(d) => d.length === 0}
            emptyText={status === 'open' ? 'No open reports.' : 'No reports in this view.'}
          >
            {(list) => (
              <div role="list">
                {list.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="listitem"
                    className={`ev col${r.id === selectedId ? ' sel' : ''}`}
                    aria-current={r.id === selectedId ? 'true' : undefined}
                    onClick={() => void navigate({ to: '/reports/$id', params: { id: r.id } })}
                  >
                    <div className="row">
                      <StatusPill {...reportReason(r.reason)} />
                      {r.priority === 1 ? <span className="small error strong">Urgent</span> : null}
                      <span className="t">{timeAgo(r.created_at).replace(' ago', '')}</span>
                    </div>
                    <span className="strong">
                      {targetType(r.target_type)}
                      {r.target_name ? ` · ${r.target_name}` : ''}
                    </span>
                    {r.reports_on_target > 1 ? (
                      <span className="muted small">
                        {plural(r.reports_on_target, 'report')} on this
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </Loadable>
        </Card>
        {selectedId ? (
          <div className="stack tight">
            <Link className="btn sm phone-only back" to="/reports">
              Back to reports
            </Link>
            <ReportDetailCard
              key={selectedId}
              id={selectedId}
              row={selectedRow}
              onResolved={() => {
                queue.reload();
                refreshCounts();
              }}
            />
          </div>
        ) : (
          <div className="card">
            <EmptyState title="Select a report." />
          </div>
        )}
      </div>
    </Page>
  );
}

const AUTO_WORDS: Record<string, string> = {
  weapon: 'a weapon',
  drugs: 'drugs',
  violence: 'violence or gore',
  hate: 'a hate symbol',
  sexual: 'sexual content',
  minor: 'a possible minor-safety problem',
  other: 'something against the rules',
};

/**
 * Automatic photo flag (DEC 154): red alert, who posted, when, and the photo.
 * The photo starts blurred; sexual starts hidden behind a click; minor is never shown.
 */
function AutoFlag({
  why,
  keys,
  targetType: kind,
  poster,
  flaggedAt,
}: {
  why: string;
  keys: string[];
  targetType: string;
  poster: ReportDetail['target'];
  flaggedAt: string;
}) {
  const [shown, setShown] = useState(false);
  const minor = why === 'minor';
  return (
    <div className="auto-flag" role="alert">
      <div className="auto-flag-head">
        <Icon name="flag" />
        <span className="strong">
          Red alert: photo flagged for {AUTO_WORDS[why] ?? AUTO_WORDS.other}
        </span>
      </div>
      <dl className="kv flush">
        <dt>Posted by</dt>
        <dd>
          {poster ? (
            <Link to="/people/$id" params={{ id: poster.id }}>
              {poster.display_name}
            </Link>
          ) : kind === 'quad_post' ? (
            'Anonymous Quad author (use Reveal author on the Quad page; it is logged)'
          ) : (
            'Unknown or deleted account'
          )}
        </dd>
        <dt>Flagged</dt>
        <dd>
          {whenLabel(flaggedAt)} ({timeAgo(flaggedAt)})
        </dd>
        <dt>Status</dt>
        <dd>Already hidden from students</dd>
      </dl>
      {minor ? (
        <p className="body-text">
          This photo is not shown here. Don't download or share it. Ban the account, keep the
          evidence (never delete it) and file a CyberTipline report: see
          docs/runbooks/photo-screening.md.
        </p>
      ) : keys.length ? (
        <div className="auto-flag-photos">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              className={`auto-flag-photo${shown ? ' shown' : ''}`}
              onClick={() => setShown(true)}
              aria-label={shown ? 'Flagged photo' : 'Show the flagged photo'}
            >
              <img src={media(k)} alt="The flagged photo" />
              {shown ? null : <span className="btn sm">Show photo</span>}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReportDetailCard({
  id,
  row,
  onResolved,
}: {
  id: string;
  row?: ReportRow;
  onResolved: () => void;
}) {
  const who = useWho();
  const owner = who.role === 'owner';
  const state = useRpc<ReportDetail>('admin_report_detail', { id });
  const [days, setDays] = useState(7);
  const [chat, setChat] = useState<ChatLine[] | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [askChat, setAskChat] = useState(false);

  return (
    <Loadable state={state} rows={8}>
      {(r) => {
        const reason = reportReason(r.reason);
        const isChat = r.target_type === 'chat' || r.target_type === 'message';
        const actions: ReasonAction[] = allowedActions(who.role ?? 'moderator', r.target_type).map(
          (a) => ({
            id: a,
            label: reportActionLabel(a, r.target_type),
            // Ban and Remove always confirm in the reason dialog.
            variant: a === 'ban' ? 'ban' : a === 'remove_content' ? 'danger' : 'secondary',
            confirm:
              a === 'ban'
                ? `Ban ${r.target?.display_name ?? 'this person'}? They lose access for good.`
                : undefined,
            needsExtra: needsSuspendDays(a),
            extra: needsSuspendDays(a) ? (
              <Field label="Suspend for (days)">
                <input
                  type="number"
                  min={1}
                  max={owner ? 365 : 7}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  style={{ width: 120 }}
                />
              </Field>
            ) : undefined,
            run: (note) =>
              rpc('admin_resolve_report', {
                id: r.id,
                action: a,
                note,
                ...(needsSuspendDays(a) ? { suspend_days: days } : {}),
              }),
          }),
        );
        return (
          <section className="card" aria-label="Report">
            <div className="ch">
              <StatusPill {...reason} />
              <h2>
                {targetType(r.target_type)}
                {row?.target_name ? ` · ${row.target_name}` : ''}
              </h2>
              <div className="r">
                <span className="muted">
                  {r.evidence?.auto && !r.reporter_id
                    ? `Flagged ${timeAgo(r.created_at)} by the automatic photo check`
                    : `Reported ${timeAgo(r.created_at)} by ${r.reporter_name ?? 'a deleted account'}`}
                </span>
              </div>
            </div>
            <div className="action-bar">
              {r.status === 'open' ? (
                <ReasonActions
                  hint="Saved to the audit log. If you remove a listing, the seller sees this."
                  actions={actions}
                  onDone={() => {
                    state.reload();
                    onResolved();
                  }}
                />
              ) : (
                <div className="row">
                  <StatusPill {...reportStatus(r.status)} />
                  <span className="ink2">
                    {r.action_taken ? `${reportActionLabel(r.action_taken, r.target_type)}. ` : ''}
                    {r.resolved_at ? `Closed ${whenLabel(r.resolved_at)}` : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="cb stack tight">
              {r.evidence?.auto ? (
                <AutoFlag
                  why={r.evidence.auto}
                  keys={r.evidence.photo_keys ?? []}
                  targetType={r.target_type}
                  poster={r.target}
                  flaggedAt={r.created_at}
                />
              ) : null}
              <div className="muted small strong">What was reported</div>
              {r.evidence?.text ? <div className="quote">"{r.evidence.text}"</div> : null}
              {(r.evidence?.excerpts ?? []).map((x, i) => (
                <div key={i} className="bubble">
                  {x}
                </div>
              ))}
              {!r.evidence?.text && !(r.evidence?.excerpts ?? []).length && !r.evidence?.auto ? (
                <div className="muted">No text was captured with this report.</div>
              ) : null}
              {r.details ? (
                <>
                  <div className="muted small strong">What the reporter said</div>
                  <p className="body-text">{r.details}</p>
                </>
              ) : null}
            </div>
            <details className="section">
              <summary>Person history</summary>
              <div className="cb stack tight">
                {r.target ? (
                  <>
                    <dl className="kv flush">
                      <dt>Status</dt>
                      <dd>
                        <StatusPill {...userStatus(r.target.status)} />
                      </dd>
                      <dt>Other reports</dt>
                      <dd>{plural(r.other_reports, 'report')}</dd>
                      <dt>Strikes</dt>
                      <dd>{plural(r.target.strike_count, 'strike')}</dd>
                      <dt>No-shows</dt>
                      <dd>{plural(r.target.noshow_count, 'no-show')}</dd>
                      {r.target.created_at ? (
                        <>
                          <dt>Joined</dt>
                          <dd>{dateLabel(r.target.created_at)}</dd>
                        </>
                      ) : null}
                    </dl>
                    <div>
                      <Link className="btn" to="/people/$id" params={{ id: r.target.id }}>
                        <Icon name="user" /> Open profile
                      </Link>
                    </div>
                  </>
                ) : (
                  <EmptyState title="No person to show for this report." />
                )}
              </div>
            </details>
            {isChat ? (
              <details className="section" open={!!chat}>
                <summary>Read the whole chat (logged)</summary>
                <div className="cb stack tight">
                  {chat ? (
                    <div className="stack tight" aria-label="Reported chat">
                      <div className="muted small strong">Whole chat (this read was logged)</div>
                      {chat.map((m) => (
                        <div key={m.id} className="bubble">
                          <span className="strong">{m.sender ?? 'OnlySwap'}</span>{' '}
                          <span className="muted small">{whenLabel(m.created_at)}</span>
                          <div>{m.body}</div>
                        </div>
                      ))}
                    </div>
                  ) : chatError ? (
                    <ErrorState
                      message="Could not read the chat. Try again."
                      onRetry={() => setAskChat(true)}
                    />
                  ) : (
                    <div>
                      <Button icon="eye" onClick={() => setAskChat(true)}>
                        Read the whole chat
                      </Button>
                    </div>
                  )}
                </div>
              </details>
            ) : null}
            {askChat ? (
              <Dialog title="Read the whole chat" onClose={() => setAskChat(false)}>
                <div className="cb">
                  <p className="ink2">This read is saved to the audit log.</p>
                </div>
                <div className="cf end">
                  <Button variant="ghost" onClick={() => setAskChat(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    autoFocus
                    onClick={async () => {
                      setAskChat(false);
                      setChatError(null);
                      try {
                        setChat(
                          await rpc<ChatLine[]>('admin_read_reported_chat', {
                            report_id: r.id,
                          }),
                        );
                      } catch (e) {
                        setChatError((e as Error).message);
                      }
                    }}
                  >
                    Read the chat
                  </Button>
                </div>
              </Dialog>
            ) : null}
          </section>
        );
      }}
    </Loadable>
  );
}

type Appeal = {
  id: string;
  user_id: string;
  user_name: string;
  subject_type: string;
  subject_id: string;
  body: string;
  status: string;
  created_at: string;
  decided_at?: string | null;
  decision_note?: string | null;
};

const APPEAL_VIEWS = [
  { id: 'open', label: 'Open' },
  { id: 'overturned', label: 'Overturned' },
  { id: 'upheld', label: 'Upheld' },
] as const;
type AppealView = (typeof APPEAL_VIEWS)[number]['id'];

/** Appeals: approve (overturn) or deny (uphold), each with a reason. */
export function AppealsPage() {
  const { refreshCounts, counts } = useSession();
  const [view, setView] = useState<AppealView>('open');
  const state = useRpc<Appeal[]>('admin_list_appeals', { filters: { status: view } });
  return (
    <Page
      title="Appeals"
      crumb={
        counts?.appeals_open ? `${counts.appeals_open} waiting` : 'Strikes, no-shows and pauses'
      }
    >
      <div className="filters">
        <Segmented label="Appeal status" options={APPEAL_VIEWS} value={view} onChange={setView} />
        <span className="muted spacer">
          Overturning clears the strike or no-show and lifts a pause that came from it.
        </span>
      </div>
      <Card>
        <Loadable
          state={state}
          rows={4}
          empty={(d) => d.length === 0}
          emptyText={view === 'open' ? 'No appeals waiting.' : 'No appeals in this view.'}
        >
          {(rows) =>
            rows.map((ap) => (
              <div key={ap.id} className="ev col" style={{ gap: 8, padding: '14px 16px' }}>
                <div className="row">
                  <PersonCell
                    person={{ id: ap.user_id, display_name: ap.user_name }}
                    sub={`appeals ${appealSubject(ap.subject_type)}`}
                  />
                  {view !== 'open' ? <StatusPill {...appealStatus(ap.status)} /> : null}
                  <span className="t">{whenLabel(ap.created_at)}</span>
                </div>
                <p style={{ lineHeight: 1.45, maxWidth: 760 }}>{ap.body}</p>
                {ap.status === 'open' ? (
                  <div style={{ width: '100%' }}>
                    <ReasonActions
                      onDone={() => {
                        state.reload();
                        refreshCounts();
                      }}
                      actions={[
                        {
                          id: 'overturned',
                          label: 'Overturn',
                          variant: 'primary',
                          run: (note) =>
                            rpc('admin_decide_appeal', { id: ap.id, decision: 'overturned', note }),
                        },
                        {
                          id: 'upheld',
                          label: 'Uphold',
                          run: (note) =>
                            rpc('admin_decide_appeal', { id: ap.id, decision: 'upheld', note }),
                        },
                      ]}
                    />
                  </div>
                ) : ap.decision_note ? (
                  <p className="muted">Note: {ap.decision_note}</p>
                ) : null}
              </div>
            ))
          }
        </Loadable>
      </Card>
    </Page>
  );
}
