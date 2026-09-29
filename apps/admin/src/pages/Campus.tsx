import { useState } from 'react';

import type { Whoami } from '../logic';
import { rpc } from '../supabase';
import { ActionButton, Loadable, useRpc } from '../ui';

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

const DIALS = [
  'unlock_threshold',
  'founding_seller_limit',
  'offers_per_hour',
  'noshow_pause_threshold',
  'reverify_months',
] as const;

/** G02 Campus setup (P12-ADM-08): status, dials, domains, meetup spots. Owner edits; moderators read. */
export function CampusPage({ who }: { who: Whoami }) {
  const state = useRpc<Campus[]>('admin_list_campuses');
  const owner = who.role === 'owner';
  return (
    <>
      <h1>Campuses</h1>
      <Loadable state={state} empty={(d) => d.length === 0}>
        {(rows) =>
          rows.map((c) => <CampusCard key={c.id} c={c} owner={owner} reload={state.reload} />)
        }
      </Loadable>
    </>
  );
}

function CampusCard({ c, owner, reload }: { c: Campus; owner: boolean; reload: () => void }) {
  const [dials, setDials] = useState<Record<string, number>>(() =>
    Object.fromEntries(DIALS.map((k) => [k, c[k]])),
  );
  const [domain, setDomain] = useState('');
  const [kind, setKind] = useState<'student' | 'blocked'>('student');
  return (
    <div className="card">
      <h2>
        {c.name} <span className="pill">{c.status}</span>
      </h2>
      <p className="meta">
        {c.members} members, {c.timezone}
      </p>
      {owner ? (
        <div className="row">
          {(['live', 'paused', 'waitlist'] as const)
            .filter((s) => s !== c.status)
            .map((s) => (
              <ActionButton
                key={s}
                label={`Set ${s}`}
                kind="secondary"
                run={(reason) =>
                  rpc('admin_update_campus', { id: c.id, patch: { status: s }, reason })
                }
                onDone={reload}
              />
            ))}
        </div>
      ) : null}

      <h2>Dials</h2>
      <div className="row">
        {DIALS.map((k) => (
          <label key={k}>
            {k.replace(/_/g, ' ')}
            <input
              type="number"
              disabled={!owner}
              value={dials[k]}
              onChange={(e) => setDials({ ...dials, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
        {owner ? (
          <ActionButton
            label="Save dials"
            run={(reason) => rpc('admin_update_campus', { id: c.id, patch: dials, reason })}
            onDone={reload}
          />
        ) : null}
      </div>

      <h2>Email domains</h2>
      <table>
        <tbody>
          {c.domains.map((d) => (
            <tr key={d.domain}>
              <td>{d.domain}</td>
              <td>
                <span className="pill">{d.kind}</span>
              </td>
              <td>
                {owner ? (
                  <ActionButton
                    label="Delete"
                    kind="secondary"
                    run={(reason) => rpc('admin_delete_domain', { domain: d.domain, reason })}
                    onDone={reload}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {owner ? (
        <div className="row" style={{ marginTop: 'var(--space-md)' }}>
          <label>
            Domain (aliases like mail.school.edu too)
            <input value={domain} onChange={(e) => setDomain(e.target.value)} />
          </label>
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as 'student' | 'blocked')}>
              <option value="student">Student</option>
              <option value="blocked">Blocked (staff, alumni)</option>
            </select>
          </label>
          <ActionButton
            label="Save domain"
            run={(reason) => rpc('admin_upsert_domain', { domain, campus_id: c.id, kind, reason })}
            onDone={reload}
          />
        </div>
      ) : null}

      <h2>Meetup spots</h2>
      {c.spots.map((s) => (
        <SpotRow key={s.id} campusId={c.id} spot={s} owner={owner} reload={reload} />
      ))}
      {owner ? <SpotRow campusId={c.id} owner reload={reload} /> : null}
    </div>
  );
}

function SpotRow({
  campusId,
  spot,
  owner,
  reload,
}: {
  campusId: string;
  spot?: Spot;
  owner: boolean;
  reload: () => void;
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
  return (
    <div className="row" style={{ marginBottom: 'var(--space-md)' }}>
      <label>
        {spot ? 'Name' : 'New spot'}
        <input
          disabled={!owner}
          value={s.name}
          onChange={(e) => setS({ ...s, name: e.target.value })}
        />
      </label>
      <label>
        Hours
        <input
          disabled={!owner}
          value={s.hours}
          onChange={(e) => setS({ ...s, hours: e.target.value })}
        />
      </label>
      <label>
        Lat
        <input
          disabled={!owner}
          type="number"
          step="any"
          value={s.lat}
          onChange={(e) => setS({ ...s, lat: Number(e.target.value) })}
        />
      </label>
      <label>
        Lng
        <input
          disabled={!owner}
          type="number"
          step="any"
          value={s.lng}
          onChange={(e) => setS({ ...s, lng: Number(e.target.value) })}
        />
      </label>
      <label>
        Label
        <select
          disabled={!owner}
          value={s.designation}
          onChange={(e) => setS({ ...s, designation: e.target.value as 'public' | 'police' })}
        >
          <option value="public">Meetup spot</option>
          <option value="police">Police-designated (confirmed)</option>
        </select>
      </label>
      {s.designation === 'police' ? (
        <label>
          Confirmed on
          <input
            disabled={!owner}
            type="date"
            value={s.designated_on}
            onChange={(e) => setS({ ...s, designated_on: e.target.value })}
          />
        </label>
      ) : null}
      <label>
        Active
        <input
          disabled={!owner}
          type="checkbox"
          checked={s.active}
          onChange={(e) => setS({ ...s, active: e.target.checked })}
        />
      </label>
      {owner ? (
        <ActionButton
          label={spot ? 'Save' : 'Add spot'}
          run={(reason) =>
            rpc('admin_upsert_safe_spot', {
              spot: {
                ...s,
                id: spot?.id,
                campus_id: campusId,
                designated_on: s.designation === 'police' ? s.designated_on || null : null,
              },
              reason,
            })
          }
          onDone={reload}
        />
      ) : null}
    </div>
  );
}
