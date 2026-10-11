import { Link, useParams, useSearch } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';

import {
  ageMethod,
  appealStatus,
  appealSubject,
  auditAction,
  chatStatus,
  classYear,
  eventDetails,
  eventKind,
  eventVerb,
  listingStatus,
  meetupStatus,
  offerStatus,
  platform,
  reportReason,
  reportStatus,
  role,
  targetType,
  userStatus,
} from '../labels';
import {
  changeEmailError,
  dateLabel,
  errorMessage,
  heatLevels,
  knownError,
  maxUntil,
  moneyLabel,
  needsUntil,
  peakHours,
  personTab,
  ratingLabel,
  timeAgo,
  TIMELINE_FILTERS,
  timelineKinds,
  whenLabel,
  type PersonTab,
  type TimelineFilter,
} from '../logic';
import { useWho } from '../session';
import { rpc } from '../supabase';
import type {
  AccessRow,
  ActivityEvent,
  PersonChat,
  PersonFull,
  PersonListing,
  PersonMeetup,
  PersonOffer,
  PersonReports,
} from '../types';
import {
  ActionButton,
  Avatar,
  Bar,
  Button,
  Card,
  EmptyState,
  EventIcon,
  Field,
  ListingCell,
  Loadable,
  LoggedNote,
  MoreList,
  Page,
  PersonCell,
  Pill,
  ReasonActions,
  Segmented,
  Stat,
  StatusPill,
  Table,
  useLoadMore,
  useRpc,
  type ReasonAction,
} from '../ui';
import { KindPicker } from './Activity';

/**
 * One student (admin_person, DEC 93): header with status, numbers and account
 * actions; tabs in the URL (?tab=offers) for deep links; what they like, when
 * they're active and account facts on the right. Opening the page and its
 * tabs is written to the audit log by the server.
 */
export function PersonPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const search = useSearch({ strict: false }) as Partial<Record<string, string>>;
  const tab = personTab(search.tab);
  const who = useWho();
  const owner = who.role === 'owner';
  const state = useRpc<PersonFull>('admin_person', { user_id: id });
  const name = state.data?.person.display_name ?? null;

  return (
    <Page title="People" crumb={<>/ {name ?? '…'}</>}>
      <Loadable state={state} rows={8}>
        {(d) => (
          <>
            <Header d={d} owner={owner} reload={state.reload} />
            <div className="split main-side">
              <Card className="tabbed">
                <nav className="tabs" aria-label="Student sections">
                  {(
                    [
                      ['timeline', 'Timeline', null],
                      ['offers', 'Offers', d.counts.offers_made + d.counts.offers_received],
                      ['listings', 'Listings', d.counts.listings],
                      ['chats', 'Chats', d.counts.chats],
                      ['meetups', 'Meetups', d.counts.meetups],
                      ['reports', 'Reports', d.counts.reports_on_them + d.counts.reports_by_them],
                      ['blocks', 'Blocks', d.counts.blocks_made + d.counts.blocks_received],
                      ['access', 'Access log', null],
                    ] as [PersonTab, string, number | null][]
                  ).map(([t, label, n]) => (
                    <Link
                      key={t}
                      to="/people/$id"
                      params={{ id }}
                      search={t === 'timeline' ? {} : { tab: t }}
                      className={tab === t ? 'on' : ''}
                      aria-current={tab === t ? 'page' : undefined}
                    >
                      {label}
                      {n !== null ? <span className="n">{n.toLocaleString('en-US')}</span> : null}
                    </Link>
                  ))}
                </nav>
                {tab === 'timeline' ? <TimelineTab userId={id} /> : null}
                {tab === 'offers' ? <OffersTab userId={id} /> : null}
                {tab === 'listings' ? <ListingsTab userId={id} /> : null}
                {tab === 'chats' ? <ChatsTab userId={id} /> : null}
                {tab === 'meetups' ? <MeetupsTab userId={id} /> : null}
                {tab === 'reports' ? <ReportsTab userId={id} onChange={state.reload} /> : null}
                {tab === 'blocks' ? <BlocksTab d={d} /> : null}
                {tab === 'access' ? <AccessTab userId={id} /> : null}
              </Card>
              <SideColumn d={d} owner={owner} reload={state.reload} />
            </div>
          </>
        )}
      </Loadable>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Header

function Header({ d, owner, reload }: { d: PersonFull; owner: boolean; reload: () => void }) {
  const p = d.person;
  const who = useWho();
  const limit = maxUntil(who.role ?? 'moderator', new Date());
  const [until, setUntil] = useState(() =>
    new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
  );
  const name = p.display_name ?? 'No name';
  const untilField = (
    <Field
      label="Until"
      hint={limit ? 'Moderators can pause or suspend for up to 7 days.' : undefined}
    >
      <input
        type="date"
        value={until}
        min={new Date().toISOString().slice(0, 10)}
        max={limit ? limit.toISOString().slice(0, 10) : undefined}
        onChange={(e) => setUntil(e.target.value)}
        style={{ width: 170 }}
      />
    </Field>
  );
  const setStatus =
    (status: string) =>
    (reason: string): Promise<unknown> =>
      rpc('admin_set_user_status', {
        user_id: p.id,
        status,
        until: needsUntil(status) ? `${until}T23:59:00Z` : null,
        reason,
      });
  const actions: ReasonAction[] = [
    { id: 'paused', label: 'Pause', needsExtra: true, extra: untilField, run: setStatus('paused') },
    {
      id: 'suspended',
      label: 'Suspend',
      variant: 'danger',
      needsExtra: true,
      extra: untilField,
      run: setStatus('suspended'),
    },
    ...(p.status !== 'active'
      ? [{ id: 'active', label: 'Make active', run: setStatus('active') }]
      : []),
    {
      id: 'reverify',
      label: 'Ask to re-verify',
      run: (reason: string) => rpc('admin_force_reverify', { user_id: p.id, reason }),
    },
    ...(owner && p.status !== 'banned'
      ? [
          {
            id: 'banned',
            label: 'Ban',
            variant: 'ban' as const,
            confirm: `Ban ${name}? They lose access for good.`,
            run: setStatus('banned'),
          },
        ]
      : []),
  ];
  const lastSeen = p.last_active_at
    ? `last seen ${timeAgo(p.last_active_at)}${p.last_platform ? ` on ${platform(p.last_platform)}` : ''}${p.last_app_version ? ` (v${p.last_app_version})` : ''}`
    : 'not seen yet';

  return (
    <section className="card" aria-label="Student">
      <div className="hero">
        <Avatar
          initial={p.initial ?? name.slice(0, 1)}
          seed={p.id}
          photo={p.avatar_path}
          size="lg"
        />
        <div style={{ minWidth: 0 }}>
          <div className="row">
            <span className="name">{name}</span>
            <StatusPill {...userStatus(p.status)} />
            {p.year ? <Pill tone="neutral" dot={false} label={classYear(p.year)} /> : null}
            {p.admin_role ? <Pill tone="lilac" dot={false} label={role(p.admin_role)} /> : null}
          </div>
          <div className="facts">
            {[
              p.campus?.short_name ?? p.campus?.name,
              p.email ?? p.email_masked,
              `joined ${dateLabel(p.joined_at)}`,
              lastSeen,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {p.paused_until || p.status_reason ? (
            <div className="muted small" style={{ marginTop: 3 }}>
              {p.paused_until ? `Until ${whenLabel(p.paused_until)}. ` : ''}
              {p.status_reason ?? ''}
            </div>
          ) : null}
        </div>
        <div className="nums">
          <Stat label="Swipes" value={d.counts.swipes.toLocaleString('en-US')} />
          <Stat label="Saves" value={d.counts.saves.toLocaleString('en-US')} />
          <Stat label="Offers" value={d.counts.offers_made.toLocaleString('en-US')} />
          <Stat label="Deals" value={d.counts.deals.toLocaleString('en-US')} />
          <Stat label="Rating" value={ratingLabel(d.counts.rating)} />
          <Stat
            label="Reports on them"
            value={
              d.counts.reports_on_them ? (
                <span className="error">{d.counts.reports_on_them}</span>
              ) : (
                '0'
              )
            }
          />
        </div>
      </div>
      <div className="cf">
        <div style={{ flex: 1 }}>
          <ReasonActions actions={actions} onDone={reload} />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Right column

function SideColumn({ d, owner, reload }: { d: PersonFull; owner: boolean; reload: () => void }) {
  const p = d.person;
  const first = p.first_name ?? p.display_name?.split(' ')[0] ?? 'They';
  const levels = heatLevels(d.hourly);
  return (
    <div className="side-col">
      <Card title={`What ${first} likes`}>
        {d.affinity.length === 0 ? (
          <EmptyState title="No saves or offers yet." />
        ) : (
          <div className="funnel">
            {d.affinity.slice(0, 6).map((a) => (
              <div key={a.category_id} className="frow narrow">
                <span>{a.name}</span>
                <Bar pct={a.share} lime />
                <span className="muted num">{a.share}%</span>
              </div>
            ))}
            <p className="muted small">Share of right swipes (saves and offers).</p>
          </div>
        )}
      </Card>
      <Card title={`When ${first} is active`}>
        <div className="cb">
          <div className="heat" aria-label={peakHours(d.hourly)} role="img">
            {levels.map((o, h) => (
              <i key={h} style={{ opacity: o }} title={`${h}:00, ${d.hourly[h] ?? 0} actions`} />
            ))}
          </div>
          <div className="heat-axis">
            <span>12 am</span>
            <span>12 pm</span>
            <span>11 pm</span>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            {peakHours(d.hourly)}. Campus time, last 30 days.
          </p>
        </div>
      </Card>
      <Card title="Account">
        <dl className="kv">
          <dt>Age check</dt>
          <dd>
            {p.age_method
              ? `${ageMethod(p.age_method)}${p.adult_confirmed_at ? `, ${dateLabel(p.adult_confirmed_at)}` : ''}`
              : 'Not done'}
          </dd>
          <dt>Verified until</dt>
          <dd>{p.verified_until ? dateLabel(p.verified_until) : 'Not set'}</dd>
          <dt>Invited by</dt>
          <dd>
            {p.invited_by ? (
              <Link className="link" to="/people/$id" params={{ id: p.invited_by.id }}>
                {p.invited_by.display_name}
              </Link>
            ) : (
              'Nobody'
            )}
          </dd>
          <dt>Strikes</dt>
          <dd>{p.strikes}</dd>
          <dt>No-shows</dt>
          <dd>{p.no_shows}</dd>
          <dt>Push</dt>
          <dd>
            {p.push_on ? 'On' : 'Off'} · tips {p.tips_on ? 'on' : 'off'}
          </dd>
          <dt>Blocks</dt>
          <dd>
            {d.counts.blocks_made} made · {d.counts.blocks_received} received
          </dd>
        </dl>
      </Card>
      {owner ? <ChangeEmail userId={p.id} onDone={reload} /> : null}
      <LoggedNote />
    </div>
  );
}

/** Owner only: move an account to a new school email (lost access). Needs a reason (checklist §2). */
function ChangeEmail({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Card title="Change school email">
      <form
        className="cb stack tight"
        onSubmit={async (e) => {
          e.preventDefault();
          const invalid = changeEmailError(email, reason);
          if (invalid) return setMsg({ ok: false, text: invalid });
          setBusy(true);
          setMsg(null);
          try {
            await rpc('admin_change_email', {
              user_id: userId,
              new_email: email.trim(),
              reason: reason.trim(),
            });
            setMsg({ ok: true, text: 'Sent. They confirm the new address with a code.' });
            setEmail('');
            setReason('');
            onDone();
          } catch (err) {
            setMsg({
              ok: false,
              text:
                knownError(err, {
                  'INVALID:new_email':
                    'Use a student address of a supported school that no other account uses.',
                  'INVALID:reason': 'Add a reason of at least 3 characters.',
                }) || errorMessage(err),
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="note">For a student who lost access to their school inbox.</p>
        <Field label="New school email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Reason (saved to the audit log)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
        </Field>
        <div className="row">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Change email'}
          </Button>
        </div>
        {msg ? <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p> : null}
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tabs

function TimelineTab({ userId }: { userId: string }) {
  const [seg, setSeg] = useState<TimelineFilter>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const state = useLoadMore<ActivityEvent>('admin_person_timeline', {
    user_id: userId,
    kinds: timelineKinds(seg, picked),
    limit: 50,
  });
  return (
    <>
      <div className="filters in-card">
        <Segmented
          label="Show"
          options={TIMELINE_FILTERS.map((f) => ({ id: f.id, label: f.label }))}
          value={seg}
          onChange={(v) => {
            setSeg(v);
            setPicked([]);
          }}
        />
        <KindPicker value={picked} onChange={setPicked} />
        <span className="muted spacer">Left swipes kept 30 days</span>
      </div>
      <MoreList state={state} emptyText="Nothing in this view yet." rows={8}>
        {(items) => (
          <Table label="Timeline" columns={['When', 'Action', 'Listing', 'Other side', 'Details']}>
            {items.map((e) => {
              const k = eventKind(e.kind);
              const mine = e.person?.id === userId;
              const other = mine ? e.other : e.person;
              return (
                <tr key={e.id}>
                  <td className="muted tnum" title={new Date(e.at).toLocaleString()}>
                    {whenLabel(e.at)}
                  </td>
                  <td>
                    <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                      <EventIcon tone={k.tone} icon={k.icon} />
                      {mine ? (
                        k.label
                      ) : (
                        <span>
                          <span className="strong">{e.person?.display_name ?? 'Someone'}</span>{' '}
                          {eventVerb(e.kind, e.details).replace(/ (on|for|about)$/, '')}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>
                    {e.listing ? (
                      <Link to="/listings/$id" params={{ id: e.listing.id }}>
                        <ListingCell listing={e.listing} showPrice={false} />
                      </Link>
                    ) : e.kind === 'searched' && typeof e.details?.query === 'string' ? (
                      <span className="ink2">"{e.details.query}"</span>
                    ) : (
                      <span className="muted">None</span>
                    )}
                  </td>
                  <td>
                    {other ? <PersonCell person={other} /> : <span className="muted">None</span>}
                  </td>
                  <td className="ink2 details">{eventDetails(e.kind, e.details)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </MoreList>
    </>
  );
}

function OffersTab({ userId }: { userId: string }) {
  const state = useLoadMore<PersonOffer>('admin_person_offers', { user_id: userId, cursor: 0 });
  return (
    <MoreList state={state} emptyText="No offers made or received.">
      {(items) => (
        <Table
          label="Offers"
          columns={['Listing', 'Side', 'With', 'Offer', 'Status', 'Made', 'Answered']}
        >
          {items.map((o) => (
            <tr key={o.id}>
              <td>
                {o.listing ? (
                  <Link to="/listings/$id" params={{ id: o.listing.id }}>
                    <ListingCell listing={o.listing} showPrice={false} />
                  </Link>
                ) : (
                  <span className="muted">Deleted listing</span>
                )}
              </td>
              <td className="ink2">{o.role === 'buyer' ? 'Buying' : 'Selling'}</td>
              <td>
                <PersonCell person={o.other} />
              </td>
              <td>
                <span className="strong">{moneyLabel(o.amount_cents)}</span>
                <span className="muted">
                  {o.asking_cents !== null ? ` · asking ${moneyLabel(o.asking_cents)}` : ''}
                  {o.round > 1 ? ` · round ${o.round}` : ''}
                </span>
              </td>
              <td>
                <StatusPill {...offerStatus(o.status)} />
              </td>
              <td className="muted">{whenLabel(o.created_at)}</td>
              <td className="muted">{o.responded_at ? whenLabel(o.responded_at) : ''}</td>
            </tr>
          ))}
        </Table>
      )}
    </MoreList>
  );
}

function ListingsTab({ userId }: { userId: string }) {
  const state = useLoadMore<PersonListing>('admin_person_listings', {
    user_id: userId,
    cursor: 0,
  });
  return (
    <MoreList state={state} emptyText="No listings.">
      {(items) => (
        <Table
          label="Listings"
          columns={[
            'Listing',
            'Status',
            'Posted',
            { label: 'Views', num: true },
            { label: 'Saves', num: true },
            { label: 'Offers', num: true },
            { label: 'Left', num: true },
            { label: 'Reports', num: true },
          ]}
        >
          {items.map((l) => (
            <tr key={l.id}>
              <td>
                <Link to="/listings/$id" params={{ id: l.id }}>
                  <ListingCell listing={l} />
                </Link>
              </td>
              <td>
                <StatusPill {...listingStatus(l.status)} />
              </td>
              <td className="muted">{dateLabel(l.created_at)}</td>
              <td className="num">{l.views}</td>
              <td className="num">{l.saves}</td>
              <td className="num">{l.offers}</td>
              <td className="num">{l.left}</td>
              <td className="num">{l.reports ? <span className="error">{l.reports}</span> : 0}</td>
            </tr>
          ))}
        </Table>
      )}
    </MoreList>
  );
}

function ChatsTab({ userId }: { userId: string }) {
  const state = useLoadMore<PersonChat>('admin_person_chats', { user_id: userId, cursor: 0 });
  // Reports name the chat; the chat itself opens only from its report (DEC 69(d)).
  const reports = useRpc<PersonReports>('admin_person_reports', { user_id: userId });
  const reportFor = (chatId: string) =>
    [...(reports.data?.against ?? []), ...(reports.data?.by_them ?? [])].find(
      (r) => r.target_type === 'chat' && r.target_id === chatId,
    )?.id;
  return (
    <>
      <p className="note" style={{ padding: '10px 16px 0' }}>
        Counts and times only. The words open only from a report about the chat, and every read is
        logged.
      </p>
      <MoreList state={state} emptyText="No chats.">
        {(items) => (
          <Table
            label="Chats"
            columns={[
              'Listing',
              'Side',
              'With',
              { label: 'Messages', num: true },
              'Agreed',
              'Status',
              'Last message',
              '',
            ]}
          >
            {items.map((c) => {
              const rid = c.reported ? reportFor(c.id) : undefined;
              return (
                <tr key={c.id}>
                  <td>
                    {c.listing?.id ? (
                      <Link
                        className="link strong"
                        to="/listings/$id"
                        params={{ id: c.listing.id }}
                      >
                        {c.listing.title}
                      </Link>
                    ) : (
                      <span className="strong">{c.listing?.title ?? 'Listing gone'}</span>
                    )}
                  </td>
                  <td className="ink2">{c.role === 'buyer' ? 'Buying' : 'Selling'}</td>
                  <td>
                    <PersonCell person={c.other} />
                  </td>
                  <td className="num" title="Their messages of all messages">
                    {c.their_message_count} of {c.message_count}
                  </td>
                  <td>{c.agreed_cents !== null ? moneyLabel(c.agreed_cents) : ''}</td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <StatusPill {...chatStatus(c.status)} />
                      {c.archived ? <Pill tone="neutral" dot={false} label="Archived" /> : null}
                    </span>
                  </td>
                  <td className="muted">{c.last_message_at ? timeAgo(c.last_message_at) : ''}</td>
                  <td className="actions">
                    {c.reported ? (
                      rid ? (
                        <Link className="btn sm" to="/reports/$id" params={{ id: rid }}>
                          Open report
                        </Link>
                      ) : (
                        <Link className="btn sm" to="/reports">
                          Reported
                        </Link>
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </MoreList>
    </>
  );
}

function MeetupsTab({ userId }: { userId: string }) {
  const state = useLoadMore<PersonMeetup>('admin_person_meetups', {
    user_id: userId,
    cursor: 0,
  });
  return (
    <MoreList state={state} emptyText="No meetups.">
      {(items) => (
        <Table
          label="Meetups"
          columns={['When', 'Place', 'Listing', 'With', 'Status', 'Checked in', 'No-shows']}
        >
          {items.map((m) => (
            <tr key={m.id}>
              <td className="tnum">{whenLabel(m.starts_at)}</td>
              <td className="ink2">{m.place ?? 'Custom place'}</td>
              <td>
                {m.listing?.id ? (
                  <Link className="link" to="/listings/$id" params={{ id: m.listing.id }}>
                    {m.listing.title}
                  </Link>
                ) : (
                  (m.listing?.title ?? '')
                )}
              </td>
              <td>
                <PersonCell person={m.other} />
              </td>
              <td>
                <StatusPill {...meetupStatus(m.status)} />
              </td>
              <td className="ink2">
                {[m.their_check_in ? 'them' : null, m.other_check_in ? 'other side' : null]
                  .filter(Boolean)
                  .join(' and ') || <span className="muted">Nobody</span>}
              </td>
              <td>
                {m.no_shows.length ? (
                  <span className="error">
                    {m.no_shows
                      .map((n) => (n.by_them ? 'they reported' : 'reported them'))
                      .join(', ')}
                  </span>
                ) : (
                  <span className="muted">None</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </MoreList>
  );
}

function ReportsTab({ userId, onChange }: { userId: string; onChange: () => void }) {
  const state = useRpc<PersonReports>('admin_person_reports', { user_id: userId });
  return (
    <Loadable state={state} rows={6}>
      {(r) => (
        <div className="stack" style={{ gap: 0 }}>
          <Section title="Reports about them" n={r.against.length}>
            {r.against.map((x) => (
              <Link key={x.id} className="ev" to="/reports/$id" params={{ id: x.id }}>
                <StatusPill {...reportReason(x.reason)} />
                <span className="ink2">{targetType(x.target_type)}</span>
                <span className="muted">by</span>
                <span>{x.reporter?.display_name ?? 'Deleted account'}</span>
                <StatusPill {...reportStatus(x.status)} dot={false} />
                <span className="t">{whenLabel(x.created_at)}</span>
              </Link>
            ))}
          </Section>
          <Section title="Reports they made" n={r.by_them.length}>
            {r.by_them.map((x) => (
              <Link key={x.id} className="ev" to="/reports/$id" params={{ id: x.id }}>
                <StatusPill {...reportReason(x.reason)} />
                <span className="ink2">{targetType(x.target_type)}</span>
                {x.about ? (
                  <>
                    <span className="muted">about</span>
                    <span>{x.about.display_name}</span>
                  </>
                ) : null}
                <StatusPill {...reportStatus(x.status)} dot={false} />
                <span className="t">{whenLabel(x.created_at)}</span>
              </Link>
            ))}
          </Section>
          <Section title="Strikes" n={r.strikes.length}>
            {r.strikes.map((s) => (
              <div key={s.id} className="ev">
                <span>{s.reason}</span>
                <span className="muted small">
                  {dateLabel(s.created_at)}
                  {s.expires_at && !s.cleared_at ? `, ends ${dateLabel(s.expires_at)}` : ''}
                </span>
                <span className="spacer" />
                {s.cleared_at ? (
                  <Pill tone="neutral" label="Cleared" dot={false} />
                ) : (
                  <ActionButton
                    label="Clear strike"
                    size="sm"
                    run={(reason) => rpc('admin_clear_strike', { id: s.id, reason })}
                    onDone={() => {
                      state.reload();
                      onChange();
                    }}
                  />
                )}
              </div>
            ))}
          </Section>
          <Section title="Appeals" n={r.appeals.length}>
            {r.appeals.map((a) => (
              <Link key={a.id} className="ev" to="/appeals">
                <span>Appeal of {appealSubject(a.subject_type)}</span>
                <StatusPill {...appealStatus(a.status)} />
                <span className="t">{whenLabel(a.created_at)}</span>
              </Link>
            ))}
          </Section>
          <Section title="No-shows" n={r.no_shows.length}>
            {r.no_shows.map((n) => (
              <div key={n.id} className="ev">
                <span>
                  {n.by_them ? 'They reported ' : 'Reported by '}
                  <span className="strong">{n.other?.display_name ?? 'a deleted account'}</span>
                </span>
                <Pill tone={n.status === 'confirmed' ? 'red' : 'neutral'} dot={false}>
                  {n.status === 'open'
                    ? 'Open'
                    : n.status === 'confirmed'
                      ? 'Confirmed'
                      : n.status === 'rejected'
                        ? 'Rejected'
                        : n.status}
                </Pill>
                <span className="t">{whenLabel(n.created_at)}</span>
              </div>
            ))}
          </Section>
        </div>
      )}
    </Loadable>
  );
}

function Section({ title, n, children }: { title: string; n: number; children: ReactNode }) {
  return (
    <div>
      <div className="ch flush" style={{ minHeight: 40, paddingBottom: 6 }}>
        <h3>{title}</h3>
        <span className="muted">{n}</span>
      </div>
      {n ? (
        children
      ) : (
        <p className="muted" style={{ padding: '0 16px 12px' }}>
          None
        </p>
      )}
    </div>
  );
}

function BlocksTab({ d }: { d: PersonFull }) {
  return (
    <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr', gap: 0 }}>
      {(
        [
          ['They blocked', d.blocks.made],
          ['Blocked them', d.blocks.received],
        ] as const
      ).map(([title, rows]) => (
        <div key={title}>
          <div className="ch flush" style={{ minHeight: 40 }}>
            <h3>{title}</h3>
            <span className="muted">{rows.length}</span>
          </div>
          {rows.length ? (
            rows.map((b) => (
              <div key={b.id} className="ev">
                <PersonCell person={b} />
                <span className="t">{whenLabel(b.at)}</span>
              </div>
            ))
          ) : (
            <p className="muted" style={{ padding: '0 16px 12px' }}>
              Nobody
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function AccessTab({ userId }: { userId: string }) {
  const state = useLoadMore<AccessRow>('admin_person_access_log', { user_id: userId });
  return (
    <>
      <p className="note" style={{ padding: '10px 16px 0' }}>
        Every time staff opened this student or changed their account. Reading this list is not
        logged.
      </p>
      <MoreList state={state} emptyText="Nobody has looked yet.">
        {(items) => (
          <Table label="Access log" columns={['When', 'Staff', 'What', 'Section', 'Reason']}>
            {items.map((a) => (
              <tr key={a.id}>
                <td className="muted tnum">{whenLabel(a.at)}</td>
                <td>
                  <PersonCell person={a.actor} />
                </td>
                <td>
                  <StatusPill {...auditAction(a.action)} />
                </td>
                <td className="ink2">
                  {typeof a.meta?.tab === 'string'
                    ? a.meta.tab.replace(/^./, (c) => c.toUpperCase())
                    : ''}
                </td>
                <td className="ink2 wrap">
                  {a.reason === 'view' ? <span className="muted">Opened</span> : a.reason}
                  {a.case_ref ? <span className="muted"> · {a.case_ref}</span> : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </MoreList>
    </>
  );
}
