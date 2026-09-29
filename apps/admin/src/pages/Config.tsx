import { useState } from 'react';

import { formatWhen, toCsv, type Whoami } from '../logic';
import { rpc } from '../supabase';
import { ActionButton, Loadable, useRpc } from '../ui';

/**
 * Flags and config (P12-ADM-08): maintenance, minimum app versions, rules_version
 * (bumping it makes the app ask everyone to accept the rules again, E2E-22).
 */
export function ConfigPage({ who }: { who: Whoami }) {
  const state = useRpc<Record<string, unknown>>('admin_get_config');
  const owner = who.role === 'owner';
  return (
    <>
      <h1>Flags and config</h1>
      {!owner ? <p className="meta">Only the owner can change these.</p> : null}
      <Loadable state={state}>
        {(cfg) => (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Value (JSON)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {Object.entries(cfg)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => (
                  <ConfigRow key={k} k={k} v={v} owner={owner} reload={state.reload} />
                ))}
            </tbody>
          </table>
        )}
      </Loadable>
    </>
  );
}

function ConfigRow({
  k,
  v,
  owner,
  reload,
}: {
  k: string;
  v: unknown;
  owner: boolean;
  reload: () => void;
}) {
  const [text, setText] = useState(JSON.stringify(v));
  let parsed: unknown;
  let valid = true;
  try {
    parsed = JSON.parse(text);
  } catch {
    valid = false;
  }
  return (
    <tr>
      <td>{k}</td>
      <td>
        <input
          style={{ width: '100%' }}
          disabled={!owner}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label={`${k} value`}
        />
        {!valid ? <div className="error">Not valid JSON</div> : null}
      </td>
      <td>
        {owner && valid && text !== JSON.stringify(v) ? (
          <ActionButton
            label="Save"
            run={(reason) => rpc('admin_set_config', { key: k, value: parsed, reason })}
            onDone={reload}
          />
        ) : null}
      </td>
    </tr>
  );
}

type AuditRow = {
  id: number;
  actor: string | null;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  meta: unknown;
  created_at: string;
};
const AUDIT_COLS = [
  'id',
  'created_at',
  'actor',
  'action',
  'target_type',
  'target_id',
  'reason',
  'meta',
];

/** Audit log with CSV export (P12-ADM-08). */
export function AuditPage() {
  const [action, setAction] = useState('');
  const [filter, setFilter] = useState('');
  const state = useRpc<AuditRow[]>('admin_list_audit', {
    filters: filter ? { action: filter } : {},
  });
  return (
    <>
      <h1>Audit log</h1>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter(action.trim());
        }}
      >
        <label>
          Action starts with
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="report." />
        </label>
        <button type="submit">Filter</button>
        <button
          type="button"
          className="secondary"
          disabled={!state.data?.length}
          onClick={() => {
            const blob = new Blob([toCsv(state.data ?? [], AUDIT_COLS)], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `onlyswap-audit-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          Download CSV
        </button>
      </form>
      <Loadable state={state} empty={(d) => d.length === 0}>
        {(rows) => (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="meta">{formatWhen(r.created_at)}</td>
                  <td>{r.actor}</td>
                  <td>{r.action}</td>
                  <td className="meta">
                    {r.target_type} {r.target_id}
                  </td>
                  <td>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loadable>
      <ActionButton
        label="Refresh"
        kind="secondary"
        needsReason={false}
        run={async () => state.reload()}
      />
    </>
  );
}
