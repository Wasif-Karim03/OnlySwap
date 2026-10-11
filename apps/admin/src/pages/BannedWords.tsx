import { useState } from 'react';

import { bannedAction, bannedMatch } from '../labels';
import {
  BANNED_SCOPES,
  bannedWordFormError,
  dateLabel,
  knownError,
  regexError,
  type BannedAction,
  type BannedMatch,
} from '../logic';
import { useIsOwner } from '../session';
import { rpc } from '../supabase';
import {
  ActionButton,
  Button,
  Card,
  Field,
  FilterChip,
  Loadable,
  Pager,
  StatusPill,
  Table,
  useRpc,
} from '../ui';

type BannedWord = {
  id: string;
  pattern: string;
  match: BannedMatch;
  scopes: string[];
  action: BannedAction;
  fired_count: number;
  overturned_count: number;
  created_at: string;
  created_by: string | null;
};

const PAGE = 100;
const scopeLabel = (id: string) => BANNED_SCOPES.find((s) => s.id === id)?.label ?? id;

/**
 * Settings > Banned words: the terms the server checks text for. Block stops
 * the text from posting; review holds it for a moderator. Owners edit;
 * moderators read.
 */
export function BannedWordsSection() {
  const owner = useIsOwner();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ q: '', scope: '', action: '' });
  const [cursor, setCursor] = useState(0);
  const state = useRpc<BannedWord[]>('admin_list_banned_words', { filters, cursor });
  const [editing, setEditing] = useState<BannedWord | null>(null);
  const [formKey, setFormKey] = useState(0);

  const setFilter = (patch: Partial<typeof filters>) => {
    setFilters({ ...filters, ...patch });
    setCursor(0);
  };

  return (
    <div
      className="grid2"
      style={{ gridTemplateColumns: owner ? 'minmax(0, 1fr) 340px' : 'minmax(0, 1fr)' }}
    >
      <Card
        title={
          <div className="row">
            <h2>Banned words</h2>
            {state.data ? <span className="muted">{state.data.length}</span> : null}
          </div>
        }
      >
        <form
          className="filters in-card"
          aria-label="Filter banned words"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter({ q: q.trim() });
          }}
        >
          <FilterChip icon="search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => q.trim() !== filters.q && setFilter({ q: q.trim() })}
              placeholder="Find a term"
              aria-label="Find a term"
              style={{ width: 140 }}
            />
          </FilterChip>
          <FilterChip label="Checked in">
            <select value={filters.scope} onChange={(e) => setFilter({ scope: e.target.value })}>
              <option value="">Anywhere</option>
              {BANNED_SCOPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </FilterChip>
          <FilterChip label="Action">
            <select value={filters.action} onChange={(e) => setFilter({ action: e.target.value })}>
              <option value="">Any</option>
              <option value="block">Block</option>
              <option value="review">Hold for review</option>
            </select>
          </FilterChip>
          <button type="submit" className="sr-only">
            Search
          </button>
        </form>
        <Loadable state={state} rows={6} empty={(d) => d.length === 0} emptyText="No terms match.">
          {(rows) => (
            <>
              <Table
                compact
                label="Banned words"
                columns={[
                  'Term',
                  'Match',
                  'Checked in',
                  'Action',
                  { label: 'Fired', num: true },
                  { label: 'Undone', num: true },
                  ...(owner ? [{ label: '', className: 'actions' }] : []),
                ]}
              >
                {rows.map((w) => (
                  <tr key={w.id}>
                    <td
                      className="mono wrap"
                      style={{ maxWidth: 190, overflowWrap: 'anywhere' }}
                      title={`Added ${dateLabel(w.created_at)}${w.created_by ? ` by ${w.created_by}` : ''}`}
                    >
                      {w.pattern}
                    </td>
                    <td className="ink2">{bannedMatch(w.match)}</td>
                    <td className="ink2 wrap" style={{ minWidth: 150 }}>
                      {w.scopes.map(scopeLabel).join(', ')}
                    </td>
                    <td>
                      <StatusPill {...bannedAction(w.action)} />
                    </td>
                    <td className="num">{w.fired_count}</td>
                    <td className="num">{w.overturned_count}</td>
                    {owner ? (
                      <td className="actions">
                        <div className="row">
                          <Button size="sm" onClick={() => setEditing(w)}>
                            Edit
                          </Button>
                          <ActionButton
                            label="Delete"
                            kind="danger"
                            size="sm"
                            confirm={`Delete "${w.pattern}"? Text with it will no longer be blocked or held.`}
                            run={(reason) => rpc('admin_delete_banned_word', { id: w.id, reason })}
                            onDone={() => {
                              if (editing?.id === w.id) setEditing(null);
                              state.reload();
                            }}
                          />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </Table>
              <Pager
                hasPrev={cursor > 0}
                hasNext={rows.length === PAGE}
                onPrev={() => setCursor(Math.max(0, cursor - PAGE))}
                onNext={() => setCursor(cursor + PAGE)}
              />
            </>
          )}
        </Loadable>
        <p
          className="note"
          style={{ padding: '12px 16px', borderTop: '1px solid var(--color-line)' }}
        >
          Text is lowercased, accents and look-alike characters (like 0 for o and $ for s) are
          folded, and punctuation becomes spaces before it is checked. Word and phrase terms match
          whole words. Fired counts every time a term stopped or held something.
        </p>
      </Card>
      {owner ? (
        <WordForm
          key={editing ? `edit:${editing.id}` : `new:${formKey}`}
          editing={editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            setFormKey((k) => k + 1);
            state.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function WordForm({
  editing,
  onCancel,
  onDone,
}: {
  editing: BannedWord | null;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [pattern, setPattern] = useState(editing?.pattern ?? '');
  const [match, setMatch] = useState<BannedMatch>(editing?.match ?? 'word');
  const [scopes, setScopes] = useState<string[]>(
    editing?.scopes ?? ['listing', 'quad', 'profile', 'offer', 'rating'],
  );
  const [action, setAction] = useState<BannedAction>(editing?.action ?? 'review');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const liveRegex = match === 'regex' && pattern.trim() ? regexError(pattern.trim()) : null;

  return (
    <form
      className="card clip"
      aria-label={editing ? 'Edit banned word' : 'Add a banned word'}
      onSubmit={async (e) => {
        e.preventDefault();
        const invalid = bannedWordFormError({ pattern, match, scopes, reason });
        if (invalid) return setMsg({ ok: false, text: invalid });
        setBusy(true);
        setMsg(null);
        try {
          const r = await rpc<{ created: boolean; pattern: string }>('admin_upsert_banned_word', {
            pattern: pattern.trim(),
            match,
            scopes,
            action,
            reason: reason.trim(),
          });
          setMsg({ ok: true, text: `${r.created ? 'Added' : 'Updated'} "${r.pattern}".` });
          onDone();
        } catch (err) {
          setMsg({
            ok: false,
            text: knownError(err, {
              'INVALID:pattern':
                match === 'regex'
                  ? "The server couldn't read that pattern, or it isn't 2 to 100 characters."
                  : 'Use 2 to 100 characters.',
              'INVALID:scopes': 'Pick at least one place to check.',
            }),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="ch">
        <h2>{editing ? `Edit "${editing.pattern}"` : 'Add a term'}</h2>
      </div>
      <div className="cb stack tight" style={{ gap: 12 }}>
        {editing ? (
          <p className="note">
            The term and match type identify an entry. To change them, add a new term and delete
            this one.
          </p>
        ) : null}
        <Field label="Term">
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            disabled={!!editing}
            required
            autoComplete="off"
            spellCheck={false}
            aria-invalid={liveRegex ? true : undefined}
          />
        </Field>
        <div className="row" style={{ gap: 12 }}>
          <Field label="Match" className="grow">
            <select
              value={match}
              onChange={(e) => setMatch(e.target.value as BannedMatch)}
              disabled={!!editing}
            >
              <option value="word">Word</option>
              <option value="phrase">Phrase</option>
              <option value="regex">Pattern (regex)</option>
            </select>
          </Field>
          <Field label="Action" className="grow">
            <select value={action} onChange={(e) => setAction(e.target.value as BannedAction)}>
              <option value="review">Hold for review</option>
              <option value="block">Block (don't post)</option>
            </select>
          </Field>
        </div>
        {liveRegex ? <p className="error">{liveRegex}</p> : null}
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">Check it in</legend>
          <div className="checks">
            {BANNED_SCOPES.map((s) => (
              <label key={s.id} className="check">
                <input
                  type="checkbox"
                  checked={scopes.includes(s.id)}
                  onChange={(e) =>
                    setScopes(
                      e.target.checked ? [...scopes, s.id] : scopes.filter((x) => x !== s.id),
                    )
                  }
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
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
        {editing ? (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" className="spacer" disabled={busy || !!liveRegex}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add term'}
        </Button>
      </div>
    </form>
  );
}
