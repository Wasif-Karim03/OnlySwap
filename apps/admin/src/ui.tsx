import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { errorMessage } from './logic';
import { rpc } from './supabase';

/** Load an RPC result with loading, error and reload. */
export function useRpc<T>(fn: string, args?: Record<string, unknown>) {
  const key = JSON.stringify(args ?? {});
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    rpc<T>(fn, JSON.parse(key) as Record<string, unknown>)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [fn, key]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export function Loadable<T>({
  state,
  empty,
  children,
}: {
  state: { data: T | null; error: string | null; loading: boolean; reload: () => void };
  empty?: (d: T) => boolean;
  children: (d: T) => ReactNode;
}) {
  if (state.error)
    return (
      <div className="card">
        <p className="error">{state.error}</p>
        <button className="secondary" onClick={state.reload}>
          Try again
        </button>
      </div>
    );
  if (state.loading && state.data === null) return <p className="meta">Loading…</p>;
  if (state.data === null) return null;
  if (empty?.(state.data)) return <p className="meta">Nothing here right now.</p>;
  return <>{children(state.data)}</>;
}

/**
 * An admin action: asks for a reason (required, 3+ characters, goes to the audit
 * log), runs it, and reports the result.
 */
export function ActionButton({
  label,
  run,
  onDone,
  kind,
  needsReason = true,
  confirm,
}: {
  label: string;
  run: (reason: string) => Promise<unknown>;
  onDone?: () => void;
  kind?: 'danger' | 'secondary';
  needsReason?: boolean;
  /** Asked first with OK / Cancel (for removals). */
  confirm?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span>
      <button
        className={kind}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          const reason = needsReason
            ? window.prompt(`${label}: reason (saved to the audit log)`)
            : '';
          if (reason === null) return;
          if (needsReason && reason.trim().length < 3) {
            setMsg('Add a reason of at least 3 characters.');
            return;
          }
          setBusy(true);
          setMsg(null);
          try {
            await run(reason.trim());
            setMsg('Done');
            onDone?.();
          } catch (e) {
            setMsg(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </button>
      {msg ? <span className={msg === 'Done' ? 'ok' : 'error'}> {msg}</span> : null}
    </span>
  );
}

export function money(cents: number | null | undefined): string {
  return cents === null || cents === undefined
    ? ''
    : `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

export type CampusOption = {
  id: string;
  name: string;
  short_name: string;
  status: string;
  is_demo: boolean;
};

/** Campus picker fed by admin_list_campuses (moderators only get their own campus back). */
export function CampusSelect({
  campuses,
  value,
  onChange,
  allLabel,
  label = 'Campus',
}: {
  campuses: CampusOption[];
  value: string;
  onChange: (id: string) => void;
  /** Adds an "all campuses" option with value '' when set. */
  allLabel?: string;
  label?: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel ? <option value="">{allLabel}</option> : null}
        {campuses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.is_demo ? ' (demo)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
