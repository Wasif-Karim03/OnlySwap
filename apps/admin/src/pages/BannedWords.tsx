import { useState } from 'react';

import {
  BANNED_SCOPES,
  bannedWordFormError,
  formatWhen,
  knownError,
  regexError,
  type BannedAction,
  type BannedMatch,
  type Whoami,
} from '../logic';
import { rpc } from '../supabase';
import { ActionButton, Loadable, useRpc } from '../ui';

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
 * G03 Banned words (R11-ADM-02): the terms private.check_text looks for.
 * Block stops the text from posting; review holds it for a moderator.
 * Owners add, edit and delete; moderators read.
 */
export function BannedWordsPage({ who }: { who: Whoami }) {
  const owner = who.role === 'owner';
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<{ q: string; scope: string; action: string }>({
    q: '',
    scope: '',
    action: '',
  });
  const [cursor, setCursor] = useState(0);
  const state = useRpc<BannedWord[]>('admin_list_banned_words', { filters, cursor });
  const [editing, setEditing] = useState<BannedWord | null>(null);
  const [formKey, setFormKey] = useState(0);

  const setFilter = (patch: Partial<typeof filters>) => {
    setFilters({ ...filters, ...patch });
    setCursor(0);
  };

  return (
    <>
      <h1>Banned words</h1>
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
      ) : (
        <p className="meta">Only an owner can change this list.</p>
      )}

      <form
        className="row"
        aria-label="Filter banned words"
        style={{ marginTop: 'var(--space-lg)' }}
        onSubmit={(e) => {
          e.preventDefault();
          setFilter({ q: q.trim() });
        }}
      >
        <label>
          Search
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" />
        </label>
        <label>
          Checked in
          <select value={filters.scope} onChange={(e) => setFilter({ scope: e.target.value })}>
            <option value="">Anywhere</option>
            {BANNED_SCOPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Action
          <select value={filters.action} onChange={(e) => setFilter({ action: e.target.value })}>
            <option value="">Block or review</option>
            <option value="block">Block</option>
            <option value="review">Review</option>
          </select>
        </label>
        <button type="submit" className="secondary">
          Search
        </button>
      </form>

      <div style={{ marginTop: 'var(--space-lg)' }}>
        <Loadable state={state} empty={(d) => d.length === 0}>
          {(rows) => (
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Match</th>
                  <th>Checked in</th>
                  <th>Action</th>
                  <th>Fired</th>
                  <th>Overturned</th>
                  <th>Added</th>
                  {owner ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <code>{w.pattern}</code>
                    </td>
                    <td>{w.match}</td>
                    <td>{w.scopes.map(scopeLabel).join(', ')}</td>
                    <td>
                      <span className={w.action === 'block' ? 'pill p1' : 'pill'}>{w.action}</span>
                    </td>
                    <td>{w.fired_count}</td>
                    <td>{w.overturned_count}</td>
                    <td className="meta">
                      {formatWhen(w.created_at)}
                      {w.created_by ? ` by ${w.created_by}` : ''}
                    </td>
                    {owner ? (
                      <td>
                        <div className="row">
                          <button className="secondary" onClick={() => setEditing(w)}>
                            Edit
                          </button>
                          <ActionButton
                            label="Delete"
                            kind="danger"
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
              </tbody>
            </table>
          )}
        </Loadable>
      </div>
      <div className="row" style={{ marginTop: 'var(--space-md)' }}>
        <button
          className="secondary"
          disabled={cursor === 0}
          onClick={() => setCursor(Math.max(0, cursor - PAGE))}
        >
          Previous page
        </button>
        <button
          className="secondary"
          disabled={(state.data?.length ?? 0) < PAGE}
          onClick={() => setCursor(cursor + PAGE)}
        >
          Next page
        </button>
      </div>
      <p className="meta">
        Text is lowercased, accents and look-alike characters (like 0 for o and $ for s) are folded,
        and punctuation becomes spaces before it is checked. Word and phrase terms match whole
        words. Fired counts every time a term stopped or held something.
      </p>
    </>
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
      className="card"
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
                  ? "Postgres couldn't read that regex, or it isn't 2 to 100 characters."
                  : 'Use 2 to 100 characters.',
              'INVALID:scopes': 'Pick at least one place to check.',
            }),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 style={{ marginTop: 0 }}>{editing ? `Edit "${editing.pattern}"` : 'Add a term'}</h2>
      {editing ? (
        <p className="meta">
          The term and match type identify an entry. To change them, add a new term and delete this
          one.
        </p>
      ) : null}
      <div className="row">
        <label style={{ flex: 1 }}>
          Term
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            disabled={!!editing}
            required
            autoComplete="off"
            spellCheck={false}
            aria-invalid={liveRegex ? true : undefined}
          />
        </label>
        <label>
          Match
          <select
            value={match}
            onChange={(e) => setMatch(e.target.value as BannedMatch)}
            disabled={!!editing}
          >
            <option value="word">Word</option>
            <option value="phrase">Phrase</option>
            <option value="regex">Regex</option>
          </select>
        </label>
        <label>
          Action
          <select value={action} onChange={(e) => setAction(e.target.value as BannedAction)}>
            <option value="review">Review (hold for a moderator)</option>
            <option value="block">Block (don't post)</option>
          </select>
        </label>
      </div>
      {liveRegex ? <p className="error">{liveRegex}</p> : null}
      <fieldset style={{ marginTop: 'var(--space-md)' }}>
        <legend className="meta">Check it in</legend>
        <div className="row">
          {BANNED_SCOPES.map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={scopes.includes(s.id)}
                onChange={(e) =>
                  setScopes(e.target.checked ? [...scopes, s.id] : scopes.filter((x) => x !== s.id))
                }
              />{' '}
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="row">
        <label style={{ flex: 1 }}>
          Reason (saved to the audit log)
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={3}
            autoComplete="off"
          />
        </label>
        <button type="submit" disabled={busy || !!liveRegex}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add term'}
        </button>
        {editing ? (
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        ) : null}
      </div>
      {msg ? <p className={msg.ok ? 'ok' : 'error'}>{msg.text}</p> : null}
    </form>
  );
}
