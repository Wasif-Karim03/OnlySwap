import { useState } from 'react';

import { formatWhen, inviteFormError, knownError, type Whoami } from '../logic';
import { rpc } from '../supabase';
import { ActionButton, CampusSelect, Loadable, useRpc, type CampusOption } from '../ui';

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
 * G03 Team (R11-ADM-02): owners list, invite and remove admins. The person
 * needs an account first; inviting an admin again changes their role or
 * campus. Moderators are bound to one campus (DEC 69). Owner only.
 */
export function TeamPage({ who }: { who: Whoami }) {
  if (who.role !== 'owner')
    return (
      <>
        <h1>Team</h1>
        <p className="meta">Only an owner can see and change the admin team.</p>
      </>
    );
  return <OwnerTeam />;
}

function OwnerTeam() {
  const state = useRpc<Admin[]>('admin_list_admins');
  const campuses = useRpc<CampusOption[]>('admin_list_campuses');
  const campusName = (id: string | null) =>
    id ? (campuses.data?.find((c) => c.id === id)?.name ?? id) : 'All campuses';
  const owners = state.data?.filter((a) => a.role === 'owner').length ?? 0;

  return (
    <>
      <h1>Team</h1>
      <Loadable state={state} empty={(d) => d.length === 0}>
        {(rows) => (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Campus</th>
                <th>Added</th>
                <th>Added by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.user_id}>
                  <td>
                    {a.display_name ?? 'No display name'}
                    {a.me ? <span className="meta"> (you)</span> : null}
                  </td>
                  <td>{a.email}</td>
                  <td>
                    <span className="pill">{a.role}</span>
                  </td>
                  <td>{campusName(a.campus_id)}</td>
                  <td className="meta">{formatWhen(a.created_at)}</td>
                  <td className="meta">{a.invited_by ?? ''}</td>
                  <td>
                    {a.me ? (
                      <span className="meta">You can't remove yourself.</span>
                    ) : a.role === 'owner' && owners <= 1 ? (
                      <span className="meta">Last owner</span>
                    ) : (
                      <ActionButton
                        label="Remove"
                        kind="danger"
                        confirm={`Remove ${a.display_name ?? a.email ?? 'this admin'} from the admin team? They lose console access right away.`}
                        run={(reason) => rpc('admin_remove_admin', { user_id: a.user_id, reason })}
                        onDone={state.reload}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loadable>
      <InviteForm
        campuses={(campuses.data ?? []).filter((c) => !c.is_demo)}
        onDone={state.reload}
      />
    </>
  );
}

function InviteForm({ campuses, onDone }: { campuses: CampusOption[]; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'moderator'>('moderator');
  const [campusId, setCampusId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const campus = campusId || campuses[0]?.id || '';

  return (
    <form
      className="card"
      aria-label="Add an admin"
      style={{ marginTop: 'var(--space-lg)' }}
      onSubmit={async (e) => {
        e.preventDefault();
        const invalid = inviteFormError({ email, role, campusId: campus, reason });
        if (invalid) return setMsg({ ok: false, text: invalid });
        setBusy(true);
        setMsg(null);
        try {
          const r = await rpc<{ display_name: string | null; updated: boolean }>(
            'admin_invite_admin',
            {
              email: email.trim(),
              role,
              campus_id: role === 'moderator' ? campus : null,
              reason: reason.trim(),
            },
          );
          setMsg({
            ok: true,
            text: `${r.display_name ?? email.trim()} ${r.updated ? 'now has the new role' : 'is now an admin'}. They sign in at this console with their email and set up an authenticator app.`,
          });
          setEmail('');
          setReason('');
          onDone();
        } catch (err) {
          const text = knownError(err, {
            'INVALID:email': 'No OnlySwap account uses that email. They need to sign up first.',
            'INVALID:self': "You can't change your own role.",
            'INVALID:status': 'That account is suspended or banned.',
            'INVALID:last_owner': 'There has to be at least one owner.',
            'INVALID:campus_id': 'Pick a campus that exists.',
          });
          setMsg({ ok: false, text });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 style={{ marginTop: 0 }}>Add or change an admin</h2>
      <p className="meta">
        The person needs an OnlySwap account first. Adding someone who is already an admin changes
        their role and campus. Owners cover every campus; moderators cover one.
      </p>
      <div className="row">
        <label>
          Email on their account
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="off"
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as 'owner' | 'moderator')}>
            <option value="moderator">Moderator</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        {role === 'moderator' ? (
          <CampusSelect campuses={campuses} value={campus} onChange={setCampusId} />
        ) : null}
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
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Add admin'}
        </button>
      </div>
      {role === 'owner' ? (
        <p className="error">
          Owners can ban, change config, reveal Quad authors and manage this team.
        </p>
      ) : null}
      {msg ? <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p> : null}
    </form>
  );
}
