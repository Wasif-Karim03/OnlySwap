import { useState } from 'react';

import { configHelp, configKey } from '../labels';
import { useIsOwner } from '../session';
import { rpc } from '../supabase';
import { Button, Card, Loadable, ReasonDialog, Switch, useRpc } from '../ui';

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
  const [asking, setAsking] = useState<boolean | null>(null);
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
        disabled={!owner || asking !== null}
        onChange={(next) => setAsking(next)}
      />
      {asking !== null ? (
        <ReasonDialog
          title={`Turn ${configKey(k)} ${asking ? 'on' : 'off'}`}
          pendingLabel="Saving…"
          onCancel={() => setAsking(null)}
          onRun={async (reason) => {
            const value = typeof v === 'boolean' ? asking : { ...(v as object), enabled: asking };
            await rpc('admin_set_config', { key: k, value, reason });
            setError(null);
            setAsking(null);
            reload();
          }}
        />
      ) : null}
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
  const [asking, setAsking] = useState(false);
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
            <Button variant="primary" disabled={!valid || asking} onClick={() => setAsking(true)}>
              Save
            </Button>
          ) : null}
          {asking ? (
            <ReasonDialog
              title={`Change ${configKey(k)}`}
              pendingLabel="Saving…"
              onCancel={() => setAsking(false)}
              onRun={async (reason) => {
                await rpc('admin_set_config', { key: k, value: parsed, reason });
                setError(null);
                setAsking(false);
                reload();
              }}
            />
          ) : null}
        </div>
      ) : null}
      {!valid ? <div className="error small">That isn't valid for this setting.</div> : null}
      {error ? <div className="error small">{error}</div> : null}
    </div>
  );
}
