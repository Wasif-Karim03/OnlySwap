import { useState } from 'react';

import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_TYPES,
  announcementFormError,
  charCounter,
  formatWhen,
  knownError,
  nextAnnouncementAt,
  rateLimitRetryAt,
  retryIn,
  type AnnouncementType,
  type Whoami,
} from '../logic';
import { rpc } from '../supabase';
import { CampusSelect, Loadable, useRpc, type CampusOption } from '../ui';

type Announcement = {
  id: string;
  campus_id: string;
  type: AnnouncementType;
  title: string;
  body: string;
  send_push: boolean;
  created_at: string;
  sent_at: string | null;
  pinned_until: string | null;
  pinned: boolean;
  created_by: string | null;
  recipients: number;
  next_allowed_at: string;
};

const PAGE = 50;

/**
 * G03 Announcements (R11-ADM-02, T-INT-ANN-01): one per campus per 7 days,
 * pinned at the top of the Quad feed. Safety pushes go to every active
 * member; news and updates only to people who turned on tips. Owners create;
 * moderators read their campus.
 */
export function AnnouncementsPage({ who }: { who: Whoami }) {
  const owner = who.role === 'owner';
  const campuses = useRpc<CampusOption[]>('admin_list_campuses');
  const [campus, setCampus] = useState('');
  const [cursor, setCursor] = useState(0);
  const campusId = owner ? campus || null : (who.campus_id ?? null);
  const state = useRpc<Announcement[]>('admin_list_announcements', {
    campus_id: campusId,
    cursor,
  });
  const name = (id: string) => campuses.data?.find((c) => c.id === id)?.name ?? id;

  return (
    <>
      <h1>Announcements</h1>
      {owner ? (
        <div className="row">
          <CampusSelect
            campuses={campuses.data ?? []}
            value={campus}
            onChange={(id) => {
              setCampus(id);
              setCursor(0);
            }}
            allLabel="All campuses"
          />
        </div>
      ) : null}

      {owner ? (
        campus ? (
          <CreateForm
            key={campus}
            campusId={campus}
            campusName={name(campus)}
            existing={state.data ?? []}
            onDone={() => {
              setCursor(0);
              state.reload();
            }}
          />
        ) : (
          <p className="meta">Pick a campus to post an announcement.</p>
        )
      ) : (
        <p className="meta">Only an owner can post announcements.</p>
      )}

      <h2>Sent</h2>
      <Loadable state={state} empty={(d) => d.length === 0}>
        {(rows) => (
          <table>
            <thead>
              <tr>
                <th>Posted</th>
                {campusId ? null : <th>Campus</th>}
                <th>Type</th>
                <th>Announcement</th>
                <th>Pinned</th>
                <th>Push</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="meta">{formatWhen(a.created_at)}</td>
                  {campusId ? null : <td>{name(a.campus_id)}</td>}
                  <td>
                    <span className={a.type === 'safety' ? 'pill p1' : 'pill'}>{a.type}</span>
                  </td>
                  <td>
                    <strong>{a.title}</strong>
                    <div>{a.body}</div>
                  </td>
                  <td>
                    {a.pinned ? (
                      <span className="pill met">Until {formatWhen(a.pinned_until)}</span>
                    ) : (
                      <span className="meta">{a.pinned_until ? 'Ended' : 'Not pinned'}</span>
                    )}
                  </td>
                  <td>
                    {a.send_push ? (
                      `${a.recipients} ${a.recipients === 1 ? 'person' : 'people'}`
                    ) : (
                      <span className="meta">No push</span>
                    )}
                  </td>
                  <td className="meta">{a.created_by ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loadable>
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
    </>
  );
}

function CreateForm({
  campusId,
  campusName,
  existing,
  onDone,
}: {
  campusId: string;
  campusName: string;
  existing: Announcement[];
  onDone: () => void;
}) {
  const [type, setType] = useState<AnnouncementType>('news');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendPush, setSendPush] = useState(false);
  const [pinnedHours, setPinnedHours] = useState(24);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);

  const now = Date.now();
  const listedNext = nextAnnouncementAt(existing, campusId, now);
  const serverNext = blockedUntil && Date.parse(blockedUntil) > now ? blockedUntil : null;
  const nextAt = serverNext ?? listedNext;
  const t = charCounter(title, ANNOUNCEMENT_TITLE_MAX);
  const b = charCounter(body, ANNOUNCEMENT_BODY_MAX);

  return (
    <form
      className="card"
      aria-label="New announcement"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone(null);
        const invalid = announcementFormError({ campusId, title, body, pinnedHours, reason });
        if (invalid) return setError(invalid);
        if (
          sendPush &&
          !window.confirm(
            type === 'safety'
              ? `Send a push to every active member at ${campusName}?`
              : `Send a push to members at ${campusName} who turned on tips?`,
          )
        )
          return;
        setBusy(true);
        setError(null);
        try {
          const r = await rpc<{ recipients: number; next_allowed_at: string }>(
            'admin_create_announcement',
            {
              campus_id: campusId,
              type,
              title: title.trim(),
              body: body.trim(),
              send_push: sendPush,
              pinned_hours: pinnedHours,
              reason: reason.trim(),
            },
          );
          setDone(
            sendPush
              ? `Posted and sent to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}.`
              : 'Posted.',
          );
          setBlockedUntil(r.next_allowed_at);
          setTitle('');
          setBody('');
          setReason('');
          onDone();
        } catch (err) {
          const at = rateLimitRetryAt((err as { message?: string })?.message ?? '');
          if (at) setBlockedUntil(at);
          setError(
            knownError(err, {
              'INVALID:title': `Use 1 to ${ANNOUNCEMENT_TITLE_MAX} characters for the title.`,
              'INVALID:body': `Use 1 to ${ANNOUNCEMENT_BODY_MAX} characters for the message.`,
              'INVALID:pinned_hours': 'Pin for 0 to 168 hours.',
            }),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 style={{ marginTop: 0 }}>New announcement for {campusName}</h2>
      {nextAt ? (
        <p className="error" role="status">
          This campus had an announcement in the last 7 days. The next one can go out{' '}
          {retryIn(nextAt, now)} ({formatWhen(nextAt)}).
        </p>
      ) : (
        <p className="meta">One announcement per campus every 7 days.</p>
      )}
      <div className="row">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as AnnouncementType)}>
            {ANNOUNCEMENT_TYPES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-describedby="ann-title-count"
            required
          />
          <span id="ann-title-count" className={t.over ? 'counter over' : 'counter'}>
            {t.label}
          </span>
        </label>
      </div>
      <label style={{ marginTop: 'var(--space-md)' }}>
        Message
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          aria-describedby="ann-body-count"
          required
        />
        <span id="ann-body-count" className={b.over ? 'counter over' : 'counter'}>
          {b.label}
        </span>
      </label>
      <div className="row" style={{ marginTop: 'var(--space-md)' }}>
        <label>
          Pin at the top of Quad (hours, 0 to 168)
          <input
            type="number"
            min={0}
            max={168}
            step={1}
            value={pinnedHours}
            onChange={(e) => setPinnedHours(Number(e.target.value))}
          />
        </label>
        <fieldset>
          <legend className="meta">Push</legend>
          <label>
            <input
              type="checkbox"
              checked={sendPush}
              onChange={(e) => setSendPush(e.target.checked)}
            />{' '}
            Also send a push
          </label>
        </fieldset>
        <label style={{ flex: 1 }}>
          Reason (saved to the audit log)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            autoComplete="off"
          />
        </label>
      </div>

      <h3 className="meta">Preview</h3>
      {sendPush ? (
        <div className="preview" aria-label="Push preview">
          <div className="meta">OnlySwap · now</div>
          <strong>{title.trim() || 'Title'}</strong>
          <div>{body.trim() || 'Message'}</div>
        </div>
      ) : (
        <div className="preview" aria-label="Quad preview">
          <span className={type === 'safety' ? 'pill p1' : 'pill'}>{type}</span>
          <div>
            <strong>{title.trim() || 'Title'}</strong>
          </div>
          <div>{body.trim() || 'Message'}</div>
        </div>
      )}
      <p className="meta">
        {sendPush
          ? type === 'safety'
            ? 'Safety pushes go to every active member at this campus.'
            : 'News and update pushes only go to members who turned on tips.'
          : 'No push.'}{' '}
        {pinnedHours > 0 ? `Pinned at the top of Quad for ${pinnedHours} hours.` : 'Not pinned.'}
      </p>
      {error ? <p className="error">{error}</p> : null}
      {done ? <p className="ok">{done}</p> : null}
      <button type="submit" disabled={busy || !!nextAt || t.over || b.over}>
        {busy ? 'Posting…' : sendPush ? 'Post and send push' : 'Post announcement'}
      </button>
    </form>
  );
}
