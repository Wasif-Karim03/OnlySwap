import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { supportStatus, supportTopic } from '../labels';
import {
  errorMessage,
  knownError,
  reasonError,
  supportEmailLine,
  timeAgo,
  whenLabel,
} from '../logic';
import { useCampusId, useSession } from '../session';
import { rpc } from '../supabase';
import type { SupportDetail, SupportItem } from '../types';
import {
  Button,
  Card,
  EmptyState,
  Field,
  FilterChip,
  Loadable,
  LoggedNote,
  MoreList,
  Page,
  PersonCell,
  Segmented,
  StatusPill,
  useLoadMore,
  useRpc,
} from '../ui';

const VIEWS = [
  { id: 'open', label: 'Open' },
  { id: 'answered', label: 'Answered' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
] as const;
type View = (typeof VIEWS)[number]['id'];

/**
 * Support inbox (DEC 93): Help form and "can't get into my school email"
 * requests. Reply by email through the outbox (sent only to the address on
 * the request), keep a staff note, close. Opening a request is logged.
 */
export function SupportPage() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const navigate = useNavigate();
  const sideCampus = useCampusId();
  const { campuses, counts, refreshCounts, who } = useSession();
  const owner = who.role === 'owner';
  const [view, setView] = useState<View>('open');
  const [campus, setCampus] = useState<string | null>(null);
  const campusId = campus ?? sideCampus ?? '';
  const list = useLoadMore<SupportItem>('admin_list_support', {
    status: view,
    campus_id: campusId || null,
    cursor: 0,
  });
  const selected = id ?? list.items[0]?.id ?? null;

  return (
    <Page
      title="Support"
      crumb={counts?.support_open ? `${counts.support_open} open` : 'Help requests by email'}
    >
      <div className="split" style={{ gridTemplateColumns: '360px minmax(0, 1fr)' }}>
        <Card>
          <div className="filters in-card">
            <Segmented
              label="Show"
              options={VIEWS.map((v) => ({
                id: v.id,
                label:
                  v.id === 'open' && counts?.support_open
                    ? `${v.label} ${counts.support_open}`
                    : v.label,
              }))}
              value={view}
              onChange={setView}
            />
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
          </div>
          <MoreList
            state={list}
            emptyText={view === 'open' ? 'No open requests. Nice.' : 'Nothing here.'}
          >
            {(items) => (
              <div role="list">
                {items.map((s) => (
                  <Link
                    key={s.id}
                    role="listitem"
                    to="/support/$id"
                    params={{ id: s.id }}
                    className={`ev col${selected === s.id ? ' sel' : ''}`}
                  >
                    <div className="row">
                      <span className="strong">{supportTopic(s.topic)}</span>
                      <span className="spacer" />
                      <StatusPill {...supportStatus(s.status)} />
                    </div>
                    <span className="ink2 small" style={{ overflowWrap: 'anywhere' }}>
                      {s.email ?? 'No email'}
                      {s.campus ? ` · ${s.campus.short_name}` : ''}
                    </span>
                    {s.preview ? (
                      <span className="muted small" style={{ lineHeight: 1.4 }}>
                        {s.preview}
                      </span>
                    ) : null}
                    <span className="muted small">
                      {timeAgo(s.created_at)}
                      {s.reply_count ? ` · ${s.reply_count} sent` : ''}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </MoreList>
        </Card>
        {selected ? (
          <SupportDetailCard
            key={selected}
            id={selected}
            onChange={() => {
              list.reload();
              refreshCounts();
            }}
            onClosed={() => void navigate({ to: '/support' })}
          />
        ) : (
          <div className="card">
            <EmptyState title="Pick a request on the left." />
          </div>
        )}
      </div>
    </Page>
  );
}

function SupportDetailCard({
  id,
  onChange,
  onClosed,
}: {
  id: string;
  onChange: () => void;
  onClosed: () => void;
}) {
  const state = useRpc<SupportDetail>('admin_support_detail', { id });
  return (
    <Loadable state={state} rows={8}>
      {(s) => (
        <SupportBody
          s={s}
          onSaved={() => {
            state.reload();
            onChange();
          }}
          onClosed={onClosed}
        />
      )}
    </Loadable>
  );
}

function SupportBody({
  s,
  onSaved,
  onClosed,
}: {
  s: SupportDetail;
  onSaved: () => void;
  onClosed: () => void;
}) {
  const [reply, setReply] = useState('');
  const [note, setNote] = useState(s.staff_note ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setNote(s.staff_note ?? ''), [s.staff_note]);

  const save = async (status: string, withReply: boolean) => {
    const invalid = reasonError(reason);
    if (invalid) return setMsg({ ok: false, text: invalid });
    if (withReply && reply.trim().length < 2)
      return setMsg({ ok: false, text: 'Write a reply first.' });
    setBusy(true);
    setMsg(null);
    try {
      await rpc('admin_update_support', {
        id: s.id,
        status,
        reason: reason.trim(),
        note: note.trim() !== (s.staff_note ?? '') ? note.trim() : null,
        reply: withReply ? reply.trim() : null,
      });
      setMsg({
        ok: true,
        text: withReply
          ? `Reply queued to ${s.email}.`
          : status === 'closed'
            ? 'Closed.'
            : 'Saved.',
      });
      setReply('');
      setReason('');
      onSaved();
      if (status === 'closed' && !withReply) onClosed();
    } catch (e) {
      setMsg({
        ok: false,
        text:
          knownError(e, {
            'INVALID:reply': 'Keep the reply under 2,000 characters.',
            'INVALID:note': 'Keep the note under 1,000 characters.',
            'INVALID:reason': 'Add a reason of at least 3 characters.',
          }) || errorMessage(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <Card title={supportTopic(s.topic)} right={<StatusPill {...supportStatus(s.status)} />}>
        <dl className="kv">
          <dt>From</dt>
          <dd>{s.email ?? 'No email'}</dd>
          <dt>Account</dt>
          <dd>
            {s.person ? (
              <PersonCell person={s.person} />
            ) : (
              <span className="muted">No account with this email</span>
            )}
          </dd>
          <dt>Campus</dt>
          <dd>{s.campus?.name ?? <span className="muted">Not a campus domain</span>}</dd>
          <dt>Sent</dt>
          <dd>{whenLabel(s.created_at)}</dd>
          <dt>History</dt>
          <dd>
            {[
              s.reply_count
                ? `${s.reply_count} ${s.reply_count === 1 ? 'reply' : 'replies'} sent`
                : 'No reply yet',
              s.replied_at ? `last ${whenLabel(s.replied_at)}` : null,
              s.handled_at ? `closed ${whenLabel(s.handled_at)}` : null,
              s.updated_by ? `last change by ${s.updated_by.display_name}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </dd>
        </dl>
        <div className="cb" style={{ paddingTop: 0 }}>
          <div className="msg-body">{s.body || 'No message.'}</div>
        </div>
      </Card>
      <Card title="Reply">
        <div className="cb stack tight reply-box">
          <Field label="Reply by email" hint={supportEmailLine(s.email)}>
            <textarea
              value={reply}
              maxLength={2000}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Plain words. Say what you did and what they should do next."
              disabled={!s.email}
            />
          </Field>
          <Field label="Staff note (only staff see it)">
            <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="row">
            <input
              className="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required, saved to the audit log)"
              aria-label="Reason (required, saved to the audit log)"
              autoComplete="off"
            />
            <Button
              variant="primary"
              icon="mail"
              disabled={busy || !s.email}
              onClick={() => void save(s.status === 'closed' ? 'closed' : 'answered', true)}
            >
              Send reply
            </Button>
            {note.trim() !== (s.staff_note ?? '') ? (
              <Button disabled={busy} onClick={() => void save(s.status, false)}>
                Save note
              </Button>
            ) : null}
            {s.status !== 'closed' ? (
              <Button disabled={busy} onClick={() => void save('closed', false)}>
                Mark closed
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void save('open', false)}>
                Reopen
              </Button>
            )}
          </div>
          {msg ? (
            <p className={msg.ok ? 'ok' : 'error'} role="status">
              {msg.text}
            </p>
          ) : null}
        </div>
      </Card>
      <LoggedNote>Opening a request is logged.</LoggedNote>
    </div>
  );
}
