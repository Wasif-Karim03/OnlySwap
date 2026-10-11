import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';

import {
  CAMPUS_DIALS,
  campusStatus,
  domainKind,
  spotDesignation,
  type CampusDial,
} from '../labels';
import {
  errorMessage,
  knownError,
  newCampusArgs,
  newCampusError,
  reasonError,
  slugFromName,
  TIME_ZONES,
  type NewCampusForm,
} from '../logic';
import { useIsOwner, useSession } from '../session';
import { rpc } from '../supabase';
import {
  ActionButton,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Loadable,
  Page,
  Pill,
  StatusPill,
  Table,
  useRpc,
} from '../ui';

type Spot = {
  id: string;
  name: string;
  description: string | null;
  hours: string | null;
  lat: number;
  lng: number;
  designation: 'public' | 'police';
  designated_on: string | null;
  is_default: boolean;
  active: boolean;
};
type Campus = {
  id: string;
  name: string;
  short_name: string;
  status: 'waitlist' | 'live' | 'paused';
  is_demo: boolean;
  timezone: string;
  unlock_threshold: number;
  founding_seller_limit: number;
  offers_per_hour: number;
  noshow_pause_threshold: number;
  reverify_months: number;
  members: number;
  domains: { domain: string; kind: 'student' | 'blocked' }[];
  spots: Spot[];
};

/**
 * Campuses (checklist §3): schools on the left; settings, email domains and
 * Meetup spots on the right. The owner edits; moderators read.
 */
export function CampusPage() {
  const owner = useIsOwner();
  const { campusId } = useSession();
  const state = useRpc<Campus[]>('admin_list_campuses');
  const search = useSearch({ strict: false }) as Partial<Record<string, string>>;
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(owner && search.add === '1');
  const rows = state.data ?? [];
  const current = rows.find((c) => c.id === (picked ?? campusId)) ?? rows[0] ?? null;
  const closeAdd = () => {
    setAdding(false);
    if (search.add) void navigate({ to: '/campuses', search: {}, replace: true });
  };

  return (
    <Page
      title="Campuses"
      crumb={current ? `/ ${current.short_name || current.name}` : undefined}
      actions={
        owner ? (
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
            Add school
          </Button>
        ) : null
      }
    >
      {adding ? (
        <AddSchool
          domain={search.domain ?? ''}
          name={search.name ?? ''}
          onClose={closeAdd}
          onCreated={(id) => {
            setPicked(id);
            state.reload();
          }}
        />
      ) : null}
      <div className="split" style={{ gridTemplateColumns: '280px minmax(0, 1fr)' }}>
        <Card title="Schools">
          <Loadable
            state={state}
            rows={3}
            empty={(d) => d.length === 0}
            emptyText="No campuses yet."
          >
            {(list) => (
              <div role="list">
                {list.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="listitem"
                    className={`ev col${current?.id === c.id ? ' sel' : ''}`}
                    aria-current={current?.id === c.id ? 'true' : undefined}
                    onClick={() => setPicked(c.id)}
                  >
                    <div className="row">
                      <span className="strong">{c.name}</span>
                      <span className="spacer" />
                      <StatusPill {...campusStatus(c)} />
                    </div>
                    <span className="muted">
                      {c.domains.find((d) => d.kind === 'student')?.domain ?? 'no email domain'}
                      {' · '}
                      {c.members.toLocaleString('en-US')} members
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Loadable>
        </Card>
        {current ? (
          <CampusDetail key={current.id} c={current} owner={owner} reload={state.reload} />
        ) : (
          <div className="card">
            <EmptyState title="Pick a school on the left." />
          </div>
        )}
      </div>
    </Page>
  );
}

function CampusDetail({ c, owner, reload }: { c: Campus; owner: boolean; reload: () => void }) {
  const [form, setForm] = useState(() => ({
    name: c.name,
    short_name: c.short_name,
    timezone: c.timezone,
    ...(Object.fromEntries(CAMPUS_DIALS.map((d) => [d.key, c[d.key]])) as Record<
      CampusDial,
      number
    >),
  }));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<Spot | 'new' | null>(null);
  const changed = (Object.keys(form) as (keyof typeof form)[]).filter(
    (k) => String(form[k]) !== String(c[k]),
  );

  const save = async () => {
    const invalid = reasonError(reason);
    if (invalid) return setMsg({ ok: false, text: invalid });
    setBusy(true);
    setMsg(null);
    try {
      const patch = Object.fromEntries(changed.map((k) => [k, form[k]]));
      await rpc('admin_update_campus', { id: c.id, patch, reason: reason.trim() });
      setMsg({ ok: true, text: 'Saved.' });
      setReason('');
      reload();
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const statusMoves = (['live', 'paused', 'waitlist'] as const).filter((s) => s !== c.status);
  const moveLabel = { live: 'Set live', paused: 'Pause campus', waitlist: 'Back to waitlist' };

  return (
    <div className="stack">
      <Card
        title={
          <div className="row">
            <h2>{c.name}</h2>
            <StatusPill {...campusStatus(c)} />
          </div>
        }
        right={
          owner
            ? statusMoves.map((s) => (
                <ActionButton
                  key={s}
                  label={moveLabel[s]}
                  kind={s === 'paused' ? 'danger' : 'secondary'}
                  confirm={
                    s === 'paused'
                      ? `Pause ${c.name}? Students can't post or make offers while it's paused.`
                      : undefined
                  }
                  run={(why) =>
                    rpc('admin_update_campus', { id: c.id, patch: { status: s }, reason: why })
                  }
                  onDone={reload}
                />
              ))
            : null
        }
      >
        <div className="form-grid">
          <Field label="Name">
            <input
              value={form.name}
              disabled={!owner}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Short name">
            <input
              value={form.short_name}
              disabled={!owner}
              onChange={(e) => setForm({ ...form, short_name: e.target.value })}
            />
          </Field>
          <Field label="Time zone">
            <input
              value={form.timezone}
              disabled={!owner}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </Field>
          {CAMPUS_DIALS.map((d) => (
            <Field key={d.key} label={d.label} hint={d.unit}>
              <input
                type="number"
                min={0}
                value={form[d.key]}
                disabled={!owner}
                onChange={(e) => setForm({ ...form, [d.key]: Number(e.target.value) })}
              />
            </Field>
          ))}
        </div>
        {owner ? (
          <div className="cf">
            <input
              className="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required, saved to the audit log)"
              aria-label="Reason for the change"
            />
            <Button
              variant="primary"
              disabled={busy || changed.length === 0}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
            {msg ? <span className={`toast ${msg.ok ? 'ok' : 'error'}`}>{msg.text}</span> : null}
          </div>
        ) : (
          <div className="cf muted">Only the owner can change campus settings.</div>
        )}
      </Card>

      <Domains c={c} owner={owner} reload={reload} />

      <Card
        title={
          <div className="row">
            <h2>Meetup spots</h2>
            <span className="muted">Shown when students pick where to meet</span>
          </div>
        }
        right={
          owner ? (
            <Button icon="plus" onClick={() => setEditing('new')}>
              Add spot
            </Button>
          ) : null
        }
      >
        {c.spots.length === 0 ? (
          <EmptyState title="No Meetup spots yet." />
        ) : (
          <Table
            columns={[
              'Spot',
              'Hours',
              'Type',
              'Shown',
              'Default',
              { label: '', className: 'actions' },
            ]}
          >
            {c.spots.map((s) => (
              <tr key={s.id}>
                <td className="wrap" style={{ minWidth: 220 }}>
                  <div className="strong">{s.name}</div>
                  {s.description ? <div className="muted small">{s.description}</div> : null}
                </td>
                <td className="ink2 wrap">{s.hours ?? ''}</td>
                <td>
                  <StatusPill {...spotDesignation(s.designation)} />
                </td>
                <td>
                  {s.active ? (
                    <Pill tone="green" label="Shown" />
                  ) : (
                    <Pill tone="neutral" label="Hidden" />
                  )}
                </td>
                <td>{s.is_default ? <Pill tone="green" dot={false} label="Default" /> : null}</td>
                <td className="actions">
                  {owner ? (
                    <Button size="sm" onClick={() => setEditing(s)}>
                      Edit
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && owner ? (
        <SpotForm
          key={editing === 'new' ? 'new' : editing.id}
          campusId={c.id}
          spot={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function Domains({ c, owner, reload }: { c: Campus; owner: boolean; reload: () => void }) {
  const [domain, setDomain] = useState('');
  const [kind, setKind] = useState<'student' | 'blocked'>('student');
  return (
    <Card
      title={
        <div className="row">
          <h2>Email domains</h2>
          <span className="muted">Who can sign up here</span>
        </div>
      }
    >
      {c.domains.length === 0 ? (
        <EmptyState title="No email domains yet." />
      ) : (
        <Table columns={['Domain', 'Kind', { label: '', className: 'actions' }]}>
          {c.domains.map((d) => (
            <tr key={d.domain}>
              <td className="mono">{d.domain}</td>
              <td>
                <StatusPill {...domainKind(d.kind)} />
              </td>
              <td className="actions">
                {owner ? (
                  <ActionButton
                    label="Delete"
                    kind="danger"
                    size="sm"
                    confirm={`Delete ${d.domain}? New sign-ups with it stop working.`}
                    run={(reason) => rpc('admin_delete_domain', { domain: d.domain, reason })}
                    onDone={reload}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {owner ? (
        <div className="cf">
          <div className="inline-form" style={{ width: '100%' }}>
            <Field label="Add a domain (aliases like mail.school.edu too)">
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="school.edu"
              />
            </Field>
            <Field label="Kind" className="">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'student' | 'blocked')}
              >
                <option value="student">Student</option>
                <option value="blocked">Blocked (staff, alumni)</option>
              </select>
            </Field>
            <ActionButton
              label="Save domain"
              kind="primary"
              run={(reason) =>
                rpc('admin_upsert_domain', { domain: domain.trim(), campus_id: c.id, kind, reason })
              }
              onDone={() => {
                setDomain('');
                reload();
              }}
            />
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function SpotForm({
  campusId,
  spot,
  onClose,
  onSaved,
}: {
  campusId: string;
  spot?: Spot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [s, setS] = useState({
    name: spot?.name ?? '',
    description: spot?.description ?? '',
    hours: spot?.hours ?? '',
    lat: spot?.lat ?? 0,
    lng: spot?.lng ?? 0,
    designation: spot?.designation ?? 'public',
    designated_on: spot?.designated_on ?? '',
    is_default: spot?.is_default ?? false,
    active: spot?.active ?? true,
  });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="card clip"
      aria-label={spot ? `Edit ${spot.name}` : 'Add a Meetup spot'}
      onSubmit={async (e) => {
        e.preventDefault();
        if (s.name.trim().length < 2) return setError('Give the spot a name.');
        if (s.designation === 'police' && !s.designated_on)
          return setError('Add the date the police confirmed this spot.');
        const invalid = reasonError(reason);
        if (invalid) return setError(invalid);
        setBusy(true);
        setError(null);
        try {
          await rpc('admin_upsert_safe_spot', {
            spot: {
              ...s,
              id: spot?.id,
              campus_id: campusId,
              designated_on: s.designation === 'police' ? s.designated_on || null : null,
            },
            reason: reason.trim(),
          });
          onSaved();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="ch">
        <h2>{spot ? `Edit ${spot.name}` : 'Add a Meetup spot'}</h2>
      </div>
      <div className="form-grid">
        <Field label="Name" className="span2">
          <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
        </Field>
        <Field label="Where exactly">
          <input
            value={s.description}
            onChange={(e) => setS({ ...s, description: e.target.value })}
            placeholder="Main entrance"
          />
        </Field>
        <Field label="Hours">
          <input
            value={s.hours}
            onChange={(e) => setS({ ...s, hours: e.target.value })}
            placeholder="7 am to 11 pm"
          />
        </Field>
        <Field label="Latitude">
          <input
            type="number"
            step="any"
            value={s.lat}
            onChange={(e) => setS({ ...s, lat: Number(e.target.value) })}
          />
        </Field>
        <Field label="Longitude">
          <input
            type="number"
            step="any"
            value={s.lng}
            onChange={(e) => setS({ ...s, lng: Number(e.target.value) })}
          />
        </Field>
        <Field label="Type">
          <select
            value={s.designation}
            onChange={(e) => setS({ ...s, designation: e.target.value as 'public' | 'police' })}
          >
            <option value="public">Meetup spot</option>
            <option value="police">Police-designated (confirmed)</option>
          </select>
        </Field>
        {s.designation === 'police' ? (
          <Field label="Confirmed on">
            <input
              type="date"
              value={s.designated_on}
              onChange={(e) => setS({ ...s, designated_on: e.target.value })}
            />
          </Field>
        ) : null}
        <div className="field">
          <span className="field-label">Options</span>
          <label className="check">
            <input
              type="checkbox"
              checked={s.active}
              onChange={(e) => setS({ ...s, active: e.target.checked })}
            />
            Shown to students
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.is_default}
              onChange={(e) => setS({ ...s, is_default: e.target.checked })}
            />
            Default spot
          </label>
        </div>
      </div>
      <div className="cf">
        <input
          className="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required, saved to the audit log)"
          aria-label="Reason for the change"
        />
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : spot ? 'Save spot' : 'Add spot'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {error ? <span className="toast error">{error}</span> : null}
      </div>
    </form>
  );
}

/**
 * Add school (owner, admin_create_campus): name, short name, link name from
 * the name, time zone, student email domain, Live or Waitlist, and the first
 * Meetup spot (optional). The new school is picked when it's saved.
 */
function AddSchool({
  domain,
  name,
  onClose,
  onCreated,
}: {
  domain: string;
  name: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [f, setF] = useState<NewCampusForm>(() => ({
    name,
    short_name: '',
    slug: slugFromName(name),
    timezone: 'America/New_York',
    domain,
    status: 'waitlist',
    spot_name: '',
    spot_description: '',
    spot_hours: '',
    spot_lat: '',
    spot_lng: '',
    reason: '',
  }));
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<NewCampusForm>) => setF({ ...f, ...patch });

  const submit = async () => {
    const invalid = newCampusError(f);
    if (invalid) return setMsg({ ok: false, text: invalid });
    setBusy(true);
    setMsg(null);
    try {
      const r = await rpc<{ id: string; slug: string; spot_id: string | null }>(
        'admin_create_campus',
        newCampusArgs(f),
      );
      onCreated(r.id);
      onClose();
    } catch (e) {
      setMsg({
        ok: false,
        text:
          knownError(e, {
            'INVALID:slug_taken': 'Another school already uses this link name.',
            'INVALID:domain_taken': 'This email domain already belongs to a school.',
            'INVALID:timezone': 'Pick a real time zone.',
            'INVALID:domain': 'Enter the student email domain, like owu.edu.',
            'INVALID:spot': 'Check the Meetup spot name and map position.',
          }) || errorMessage(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Add school" onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-grid">
          <Field label="School name" className="span2">
            <input
              value={f.name}
              autoFocus
              onChange={(e) =>
                set({
                  name: e.target.value,
                  ...(slugTouched ? {} : { slug: slugFromName(e.target.value) }),
                })
              }
              placeholder="Ohio Wesleyan University"
            />
          </Field>
          <Field label="Short name" hint="Shown in the app and here">
            <input
              value={f.short_name}
              onChange={(e) => set({ short_name: e.target.value })}
              placeholder="Ohio Wesleyan"
            />
          </Field>
          <Field label="Link name" hint="Made from the name; can't change later">
            <input
              value={f.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set({ slug: e.target.value.toLowerCase() });
              }}
            />
          </Field>
          <Field label="Student email domain">
            <input
              value={f.domain}
              onChange={(e) => set({ domain: e.target.value })}
              placeholder="owu.edu"
            />
          </Field>
          <Field label="Time zone">
            <select value={f.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              {TIME_ZONES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Start as"
            hint={
              f.status === 'live'
                ? 'Students can sign up and trade right away.'
                : 'Sign-ups wait until it opens.'
            }
          >
            <select
              value={f.status}
              onChange={(e) => set({ status: e.target.value as NewCampusForm['status'] })}
            >
              <option value="waitlist">Waitlist</option>
              <option value="live">Live</option>
            </select>
          </Field>
        </div>
        <div className="ch top-line flush">
          <h3>First Meetup spot</h3>
          <span className="muted">Optional. A public place, like a library entrance.</span>
        </div>
        <div className="form-grid">
          <Field label="Spot name">
            <input
              value={f.spot_name}
              onChange={(e) => set({ spot_name: e.target.value })}
              placeholder="Library entrance"
            />
          </Field>
          <Field label="Where exactly">
            <input
              value={f.spot_description}
              onChange={(e) => set({ spot_description: e.target.value })}
              placeholder="Inside the front doors"
            />
          </Field>
          <Field label="Hours">
            <input
              value={f.spot_hours}
              onChange={(e) => set({ spot_hours: e.target.value })}
              placeholder="7am to 1am"
            />
          </Field>
          <Field label="Latitude">
            <input
              inputMode="decimal"
              value={f.spot_lat}
              onChange={(e) => set({ spot_lat: e.target.value })}
              placeholder="40.2986"
            />
          </Field>
          <Field label="Longitude">
            <input
              inputMode="decimal"
              value={f.spot_lng}
              onChange={(e) => set({ spot_lng: e.target.value })}
              placeholder="-83.0680"
            />
          </Field>
        </div>
        <div className="cf">
          <input
            className="reason"
            value={f.reason}
            onChange={(e) => set({ reason: e.target.value })}
            placeholder="Reason (required, saved to the audit log)"
            aria-label="Reason (required, saved to the audit log)"
            autoComplete="off"
          />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add school'}
          </Button>
          {msg ? (
            <p className={`${msg.ok ? 'ok' : 'error'}`} style={{ width: '100%' }}>
              {msg.text}
            </p>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
