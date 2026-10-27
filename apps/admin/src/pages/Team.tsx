import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { role } from '../labels';
import { dateLabel, inviteFormError, knownError } from '../logic';
import { useIsOwner, useSession } from '../session';
import { rpc } from '../supabase';
import {
  ActionButton,
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Loadable,
  Pill,
  useRpc,
  type CampusOption,
} from '../ui';

type Admin = {
  user_id: string;
  role: 'owner' | 'moderator';
  campus_id: string | null;
  display_name: string | null;
  email: string | null;
  created_at: string;
  invited_by: string | null;
  me: boolean;
};

/**
 * Settings > Team: owners list, invite and remove admins. The person needs an
 * account first; inviting an admin again changes their role or campus.
 * Moderators are bound to one campus (DEC 69). Owner only.
 */
export function TeamSection() {
  const owner = useIsOwner();
  if (!owner)
    return (
      <div className="card">
        <EmptyState title="Only owners can manage the team.">
          <p className="muted">Banned words are read-only for moderators.</p>
          <Link className="btn" to="/settings/words">
            Open Banned words
          </Link>
        </EmptyState>
      </div>
    );
  return <OwnerTeam />;
}

function OwnerTeam() {
  const state = useRpc<Admin[]>('admin_list_admins');
  const { campuses } = useSession();
  const campusName = (id: string | null) =>
    id ? (campuses.find((c) => c.id === id)?.name ?? 'Unknown campus') : 'All campuses';
  const owners = state.data?.filter((a) => a.role === 'owner').length ?? 0;

  return (
    <div className="grid2" style={{ gridTemplateColumns: 'minmax(0, 1fr) 400px' }}>
      <Card title="Team">
        <Loadable state={state} rows={3} empty={(d) => d.length === 0}>
          {(rows) => (
            <>
              {rows.map((a) => (
                <div key={a.user_id} className="ev">
                  <Avatar initial={a.display_name?.slice(0, 1)} seed={a.user_id} me={a.me} />
                  <div style={{ minWidth: 0 }}>
                    <div className="strong">
                      {a.display_name ?? 'No display name'}
                      {a.me ? <span className="muted"> (you)</span> : null}
                    </div>
                    <div className="muted small">
                      {campusName(a.campus_id)} · {a.email ?? 'no email'} · added{' '}
                      {dateLabel(a.created_at)}
                      {a.invited_by ? ` by ${a.invited_by}` : ''}
                    </div>
                  </div>
                  <span className="spacer" />
                  <Pill tone={a.role === 'owner' ? 'green' : 'sky'} label={role(a.role)} />
                  {a.me ? null : a.role === 'owner' && owners <= 1 ? (
                    <span className="muted small">Last owner</span>
                  ) : (
                    <ActionButton
                      label="Remove"
                      kind="danger"
                      size="sm"
                      confirm={`Remove ${a.display_name ?? a.email ?? 'this admin'} from the admin team? They lose console access right away.`}
                      run={(reason) => rpc('admin_remove_admin', { user_id: a.user_id, reason })}
                      onDone={state.reload}
                    />
                  )}
                </div>
              ))}
              <p className="note" style={{ padding: '12px 16px' }}>
                Moderators see their own campus, can pause or suspend up to 7 days, and can't ban or
                change settings.
              </p>
            </>
          )}
        </Loadable>
      </Card>
      <InviteForm campuses={campuses.filter((c) => !c.is_demo)} onDone={state.reload} />
    </div>
  );
}

function InviteForm({ campuses, onDone }: { campuses: CampusOption[]; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [roleId, setRole] = useState<'owner' | 'moderator'>('moderator');
  const [campusId, setCampusId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const campus = campusId || campuses[0]?.id || '';

  return (
    <form
      className="card clip"
      aria-label="Add an admin"
      onSubmit={async (e) => {
        e.preventDefault();
        const invalid = inviteFormError({ email, role: roleId, campusId: campus, reason });
        if (invalid) return setMsg({ ok: false, text: invalid });
        setBusy(true);
        setMsg(null);
        try {
          const r = await rpc<{ display_name: string | null; updated: boolean }>(
            'admin_invite_admin',
            {
              email: email.trim(),
              role: roleId,
              campus_id: roleId === 'moderator' ? campus : null,
              reason: reason.trim(),
            },
          );
          setMsg({
            ok: true,
            text: `${r.display_name ?? email.trim()} ${r.updated ? 'now has the new role' : 'is now an admin'}. They sign in here with their email and set up an authenticator app.`,
          });
          setEmail('');
          setReason('');
          onDone();
        } catch (err) {
          setMsg({
            ok: false,
            text: knownError(err, {
              'INVALID:email': 'No OnlySwap account uses that email. They need to sign up first.',
              'INVALID:self': "You can't change your own role.",
              'INVALID:status': 'That account is suspended or banned.',
              'INVALID:last_owner': 'There has to be at least one owner.',
              'INVALID:campus_id': 'Pick a campus that exists.',
            }),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="ch">
        <h2>Add or change an admin</h2>
      </div>
      <div className="cb stack tight" style={{ gap: 12 }}>
        <p className="note">
          The person needs an OnlySwap account first. Adding someone who is already an admin changes
          their role and campus.
        </p>
        <Field label="Email on their account">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="off"
          />
        </Field>
        <Field label="Role">
          <select value={roleId} onChange={(e) => setRole(e.target.value as 'owner' | 'moderator')}>
            <option value="moderator">Moderator (one campus)</option>
            <option value="owner">Owner (every campus)</option>
          </select>
        </Field>
        {roleId === 'moderator' ? (
          <Field label="Campus">
            <select value={campus} onChange={(e) => setCampusId(e.target.value)}>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="callout amber">
            Owners can ban, change settings, reveal Quad authors and manage this team.
          </div>
        )}
        <Field label="Reason (saved to the audit log)">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            autoComplete="off"
          />
        </Field>
        {msg ? <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p> : null}
      </div>
      <div className="cf">
        <Button type="submit" variant="primary" disabled={busy} className="spacer">
          {busy ? 'Saving…' : 'Add admin'}
        </Button>
      </div>
    </form>
  );
}
