import { useState } from 'react';

import { configHelp, configKey } from '../labels';
import { errorMessage } from '../logic';
import { useIsOwner } from '../session';
import { rpc } from '../supabase';
import { Button, Card, Loadable, Switch, useRpc } from '../ui';

/** Ask for the audit reason with a prompt (3+ characters), or null when cancelled. */
function askReason(what: string): string | null {
  const r = window.prompt(`${what}: reason (saved to the audit log)`);
  if (r === null) return null;
  if (r.trim().length < 3) {
    window.alert('Add a reason of at least 3 characters.');
    return null;
  }
  return r.trim();
}

/**
 * Settings > App switches and limits (admin_get_config / admin_set_config):
 * on/off values are switches, short values are text boxes, anything else is
 * JSON. rules_version makes the app ask everyone to accept the rules again.
 */
export function SwitchesSection() {
  const owner = useIsOwner();
  const state = useRpc<Record<string, unknown>>('admin_get_config');
  return (
    <Loadable state={state} rows={6}>
      {(cfg) => {
        const entries = Object.entries(cfg).sort(([a], [b]) =>
          configKey(a).localeCompare(configKey(b)),
        );
        const toggles = entries.filter(([, v]) => isToggle(v));
        const rest = entries.filter(([, v]) => !isToggle(v));
        return (
          <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Card title="App switches">
              {toggles.map(([k, v]) => (
                <ToggleRow key={k} k={k} v={v} owner={owner} reload={state.reload} />
              ))}
              {!owner ? <p className="note cb">Only the owner can change these.</p> : null}
            </Card>
            <Card title="Limits and versions">
              {rest.map(([k, v]) => (
                <ValueRow key={k} k={k} v={v} owner={owner} reload={state.reload} />
              ))}
            </Card>
          </div>
        );
      }}
    </Loadable>
  );
}

/** true/false, or {enabled: boolean, ...} like maintenance. */
function isToggle(v: unknown): boolean {
  return (
    typeof v === 'boolean' ||
    (typeof v === 'object' &&
      v !== null &&
      typeof (v as { enabled?: unknown }).enabled === 'boolean')
  );
}

function ToggleRow({
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
  const [error, setError] = useState<string | null>(null);
  const on = typeof v === 'boolean' ? v : !!(v as { enabled: boolean }).enabled;
  return (
    <div className="ev">
      <div style={{ minWidth: 0 }}>
        <div className="strong">{configKey(k)}</div>
        <div className="muted small">{configHelp(k) || k}</div>
        {error ? <div className="error small">{error}</div> : null}
      </div>
      <span className="spacer" />
      <Switch
        checked={on}
        label={configKey(k)}
        disabled={!owner}
        onChange={async (next) => {
          const reason = askReason(`Turn ${configKey(k)} ${next ? 'on' : 'off'}`);
          if (!reason) return;
          const value = typeof v === 'boolean' ? next : { ...(v as object), enabled: next };
          try {
            await rpc('admin_set_config', { key: k, value, reason });
            setError(null);
            reload();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </div>
  );
}

function ValueRow({
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
  const simple = typeof v === 'string' || typeof v === 'number';
  const initial = simple ? String(v) : JSON.stringify(v, null, 2);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  let parsed: unknown = text;
  let valid = true;
  if (typeof v === 'number') {
    parsed = Number(text);
    valid = text.trim() !== '' && Number.isFinite(parsed);
  } else if (!simple) {
    try {
      parsed = JSON.parse(text);
    } catch {
      valid = false;
    }
  }
  const dirty = text !== initial;
  return (
    <div className="ev col" style={{ gap: 6 }}>
      <div className="row">
        <div style={{ minWidth: 0 }}>
          <div className="strong">{configKey(k)}</div>
          <div className="muted small">{configHelp(k) || k}</div>
        </div>
        {simple && !owner ? <span className="spacer strong">{text}</span> : null}
      </div>
      {owner || !simple ? (
        <div
          className="row"
          style={{ width: '100%', flexWrap: 'nowrap', alignItems: 'flex-start' }}
        >
          {simple ? (
            <input
              value={text}
              disabled={!owner}
              onChange={(e) => setText(e.target.value)}
              aria-label={configKey(k)}
              inputMode={typeof v === 'number' ? 'numeric' : undefined}
            />
          ) : (
            <textarea
              className="mono"
              value={text}
              disabled={!owner}
              onChange={(e) => setText(e.target.value)}
              aria-label={`${configKey(k)} (JSON)`}
              rows={Math.min(8, text.split('\n').length)}
            />
          )}
          {owner && dirty ? (
            <Button
              variant="primary"
              disabled={!valid}
              onClick={async () => {
                const reason = askReason(`Change ${configKey(k)}`);
                if (!reason) return;
                try {
                  await rpc('admin_set_config', { key: k, value: parsed, reason });
                  setError(null);
                  reload();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Save
            </Button>
          ) : null}
        </div>
      ) : null}
      {!valid ? <div className="error small">That isn't valid for this setting.</div> : null}
      {error ? <div className="error small">{error}</div> : null}
    </div>
  );
}
