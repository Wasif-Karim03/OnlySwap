import { useState } from 'react';

import { announcementType, plural } from '../labels';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_TYPES,
  announceableCampuses,
  announcementFormError,
  charCounter,
  formatWhen,
  knownError,
  nextAnnouncementAt,
  rateLimitRetryAt,
  retryIn,
  dateLabel,
  type AnnouncementType,
} from '../logic';
import { useCampusId, useIsOwner, useSession } from '../session';
import { rpc } from '../supabase';
import type { OverviewV2 } from '../types';
import {
  Button,
  Card,
  Field,
  Loadable,
  Page,
  Pager,
  Pill,
  Segmented,
  StatusPill,
  Table,
  useRpc,
} from '../ui';

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
const VIEWS = [
  { id: 'all', label: 'All' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'safety', label: 'Safety' },
] as const;
type View = (typeof VIEWS)[number]['id'];

/**
 * Announcements: one per campus per 7 days, pinned at the top of the Quad
 * feed. Safety pushes go to every active member; news and updates only to
 * people who turned on tips. Owners post; moderators read their campus.
 */
export function AnnouncementsPage() {
  const owner = useIsOwner();
  const campusId = useCampusId();
  const { campuses } = useSession();
  const [cursor, setCursor] = useState(0);
  const [view, setView] = useState<View>('all');
  const state = useRpc<Announcement[]>('admin_list_announcements', {
    campus_id: campusId,
    cursor,
  });
  const name = (id: string) => campuses.find((c) => c.id === id)?.short_name ?? '';
  const rows = (state.data ?? []).filter((a) =>
    view === 'pinned' ? a.pinned : view === 'safety' ? a.type === 'safety' : true,
  );

  return (
    <Page title="Announcements" crumb="In-app banners and pushes">
      <div className="split" style={{ gridTemplateColumns: 'minmax(0, 1fr) 420px' }}>
        <Card
          title="Sent"
          right={<Segmented label="Show" options={VIEWS} value={view} onChange={setView} />}
        >
          <Loadable
            state={state}
            rows={5}
            empty={() => rows.length === 0}
            emptyText="No announcements yet."
          >
            {() => (
              <>
                <Table
                  compact
                  label="Sent announcements"
                  columns={[
                    'Announcement',
                    'Type',
                    'Campus',
                    'Sent',
                    'Pinned',
                    { label: 'Reach', num: true },
                  ]}
                >
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="wrap" style={{ minWidth: 200, maxWidth: 300 }}>
                        <div className="strong">{a.title}</div>
                        <div className="muted small">{a.body}</div>
                      </td>
                      <td>
                        <StatusPill {...announcementType(a.type)} />
                      </td>
                      <td className="ink2">{name(a.campus_id)}</td>
                      <td className="muted" title={formatWhen(a.created_at)}>
                        {dateLabel(a.created_at)}
                        {a.created_by ? <div className="small">by {a.created_by}</div> : null}
                      </td>
                      <td>
                        {a.pinned ? (
                          <Pill tone="green" label={`Until ${dateLabel(a.pinned_until)}`} />
                        ) : (
                          <span className="muted">{a.pinned_until ? 'Ended' : 'No'}</span>
                        )}
                      </td>
                      <td className="num">
                        {a.send_push ? (
                          a.recipients.toLocaleString('en-US')
                        ) : (
                          <span className="muted">No push</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Table>
                <Pager
                  hasPrev={cursor > 0}
                  hasNext={(state.data?.length ?? 0) === PAGE}
                  onPrev={() => setCursor(Math.max(0, cursor - PAGE))}
                  onNext={() => setCursor(cursor + PAGE)}
                />
              </>
            )}
          </Loadable>
        </Card>
        {owner ? (
          <CreateForm
            existing={state.data ?? []}
            defaultCampus={campusId}
            onDone={() => {
              setCursor(0);
              state.reload();
            }}
          />
        ) : (
          <div className="card pad">
            <p className="ink2">Only an owner can post announcements.</p>
          </div>
        )}
      </div>
    </Page>
  );
}

/**
 * New announcement. It always has its own campus picker (checklist §2: with
 * "All campuses" in the sidebar the form used to be stuck), and the demo
 * campus is never offered.
 */
function CreateForm({
  existing,
  defaultCampus,
  onDone,
}: {
  existing: Announcement[];
  defaultCampus: string | null;
  onDone: () => void;
}) {
  const { campuses: all } = useSession();
  const campuses = announceableCampuses(all);
  const reach = useRpc<OverviewV2>('admin_overview_v2', { campus_id: null });
  const [campusId, setCampusId] = useState(() =>
    defaultCampus && campuses.some((c) => c.id === defaultCampus) ? defaultCampus : '',
  );
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

  const campus = campuses.find((c) => c.id === campusId);
  const students = reach.data?.campuses.find((c) => c.id === campusId)?.students ?? null;
  const now = Date.now();
  const listedNext = campusId ? nextAnnouncementAt(existing, campusId, now) : null;
  const serverNext = blockedUntil && Date.parse(blockedUntil) > now ? blockedUntil : null;
  const nextAt = serverNext ?? listedNext;
  const t = charCounter(title, ANNOUNCEMENT_TITLE_MAX);
  const b = charCounter(body, ANNOUNCEMENT_BODY_MAX);
  const reachText =
    students === null
      ? null
      : type === 'safety'
        ? `Send to ${plural(students, 'student')}`
        : `Send to students with tips on (up to ${students.toLocaleString('en-US')})`;

  return (
    <form
      className="card clip"
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
              ? `Send a push to every active member at ${campus?.name ?? 'this campus'}?`
              : `Send a push to members at ${campus?.name ?? 'this campus'} who turned on tips?`,
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
              ? `Posted and sent to ${plural(r.recipients, 'person', 'people')}.`
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
              'INVALID:campus_id': 'Pick a campus.',
            }),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="ch">
        <h2>New announcement</h2>
      </div>
      <div className="cb stack tight" style={{ gap: 12 }}>
        <Field
          label="Campus"
          hint={
            campuses.length === 0
              ? 'No campuses to post to yet.'
              : students !== null
                ? `Reach: ${plural(students, 'student')} at this campus`
                : undefined
          }
        >
          <select
            value={campusId}
            onChange={(e) => {
              setCampusId(e.target.value);
              setBlockedUntil(null);
              setError(null);
            }}
          >
            <option value="">Pick a campus</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="field">
          <span className="field-label">Type</span>
          <Segmented
            label="Type"
            full
            options={ANNOUNCEMENT_TYPES}
            value={type}
            onChange={setType}
          />
          <span className="hint">
            Safety always notifies. News and Update only reach students with tips turned on.
          </span>
        </div>
        <Field
          label="Title"
          hint={<span className={t.over ? 'counter over' : 'counter'}>{t.label}</span>}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field
          label="Message"
          hint={<span className={b.over ? 'counter over' : 'counter'}>{b.label}</span>}
        >
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required />
        </Field>
        <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
          <Field label="Pin at the top of Quad (hours)" className="">
            <input
              type="number"
              min={0}
              max={168}
              step={1}
              value={pinnedHours}
              onChange={(e) => setPinnedHours(Number(e.target.value))}
              style={{ width: 110 }}
            />
          </Field>
          <label className="check">
            <input
              type="checkbox"
              checked={sendPush}
              onChange={(e) => setSendPush(e.target.checked)}
            />
            Also send a push
          </label>
        </div>
        <Field label="Reason (saved to the audit log)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            autoComplete="off"
          />
        </Field>
        {nextAt ? (
          <div className="callout amber" role="status">
            {campus?.name ?? 'This campus'} had an announcement in the last 7 days. The next one can
            go out {retryIn(nextAt, now)} ({formatWhen(nextAt)}).
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {done ? <p className="ok">{done}</p> : null}
      </div>
      <div className="cf">
        <span className="muted">One per campus per week</span>
        <Button
          type="submit"
          variant="primary"
          className="spacer"
          disabled={busy || !!nextAt || t.over || b.over || !campusId}
        >
          {busy
            ? 'Posting…'
            : !campusId
              ? 'Pick a campus first'
              : sendPush && reachText
                ? reachText
                : 'Post announcement'}
        </Button>
      </div>
    </form>
  );
}
