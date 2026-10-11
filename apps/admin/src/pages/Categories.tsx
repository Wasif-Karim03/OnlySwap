import { useCallback, useEffect, useState } from 'react';

import { errorMessage, knownError, reasonError, slugFromName } from '../logic';
import { rpc, supabase } from '../supabase';
import type { Category } from '../types';
import { Button, Card, EmptyState, ErrorState, Field, Loading, Table } from '../ui';

/**
 * Categories (owner, admin_upsert_category): rename, reorder, add. The slug
 * never changes once made (the app picks icons by it). Hiding isn't offered:
 * the app reads the categories table directly.
 */
export function CategoriesSection() {
  const [rows, setRows] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Category | 'new' | null>(null);

  const load = useCallback(() => {
    supabase
      .from('categories')
      .select('id, slug, name, parent_id, sort')
      .order('sort')
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        else {
          setRows((data ?? []) as Category[]);
          setError(null);
        }
      });
  }, []);
  useEffect(load, [load]);

  const name = (id: number | null) => rows?.find((c) => c.id === id)?.name ?? '';

  return (
    <>
      <p className="note">
        Rename, reorder or add categories. A category's link name can't change once it exists, and
        hiding one isn't possible yet because the app reads the list directly.
      </p>
      <Card
        title="Categories"
        right={
          <Button icon="plus" onClick={() => setEdit('new')}>
            Add category
          </Button>
        }
      >
        {edit ? (
          <CategoryForm
            key={edit === 'new' ? 'new' : edit.id}
            cat={edit === 'new' ? null : edit}
            all={rows ?? []}
            onClose={() => setEdit(null)}
            onSaved={() => {
              setEdit(null);
              load();
            }}
          />
        ) : null}
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !rows ? (
          <Loading rows={6} />
        ) : !rows.length ? (
          <EmptyState title="No categories." />
        ) : (
          <Table
            label="Categories"
            columns={[
              { label: 'Order', num: true },
              'Name',
              'Link name',
              'Inside',
              { label: '', className: 'actions' },
            ]}
          >
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="num muted">{c.sort}</td>
                <td className="strong">{c.name}</td>
                <td className="mono ink2">{c.slug}</td>
                <td className="ink2">{c.parent_id ? name(c.parent_id) : ''}</td>
                <td className="actions">
                  <Button size="sm" onClick={() => setEdit(c)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function CategoryForm({
  cat,
  all,
  onClose,
  onSaved,
}: {
  cat: Category | null;
  all: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const nextId = Math.max(0, ...all.map((c) => c.id)) + 1;
  const [f, setF] = useState(() => ({
    name: cat?.name ?? '',
    slug: cat?.slug ?? '',
    sort: String(cat?.sort ?? Math.max(0, ...all.map((c) => c.sort)) + 10),
    parent_id: cat?.parent_id ? String(cat.parent_id) : '',
    reason: '',
  }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="cb stack tight"
      style={{ borderBottom: '1px solid var(--color-line)' }}
      aria-label={cat ? `Edit ${cat.name}` : 'Add category'}
      onSubmit={async (e) => {
        e.preventDefault();
        if (f.name.trim().length < 2 || f.name.trim().length > 40)
          return setMsg('Name it in 2 to 40 characters.');
        if (!cat && !/^[a-z0-9-]{2,40}$/.test(f.slug))
          return setMsg('The link name can use a to z, 0 to 9 and dashes.');
        const invalid = reasonError(f.reason);
        if (invalid) return setMsg(invalid);
        setBusy(true);
        setMsg(null);
        try {
          await rpc('admin_upsert_category', {
            id: cat?.id ?? nextId,
            name: f.name.trim(),
            sort: Number(f.sort) || 0,
            reason: f.reason.trim(),
            slug: cat ? null : f.slug,
            parent_id: f.parent_id ? Number(f.parent_id) : null,
          });
          onSaved();
        } catch (err) {
          setMsg(
            knownError(err, {
              'INVALID:slug': 'That link name is taken or not allowed.',
              'INVALID:name': 'Name it in 2 to 40 characters.',
              'INVALID:parent_id': 'Pick a different parent.',
            }) || errorMessage(err),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="inline-form">
        <Field label="Name">
          <input
            value={f.name}
            autoFocus
            onChange={(e) =>
              setF({
                ...f,
                name: e.target.value,
                ...(cat ? {} : { slug: slugFromName(e.target.value) }),
              })
            }
          />
        </Field>
        <Field label="Link name" hint={cat ? "Can't change" : undefined}>
          <input
            value={f.slug}
            disabled={!!cat}
            onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })}
          />
        </Field>
        <Field label="Order">
          <input
            type="number"
            value={f.sort}
            onChange={(e) => setF({ ...f, sort: e.target.value })}
            style={{ width: 90 }}
          />
        </Field>
        <Field label="Inside">
          <select value={f.parent_id} onChange={(e) => setF({ ...f, parent_id: e.target.value })}>
            <option value="">Top level</option>
            {all
              .filter((c) => c.id !== cat?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Reason (saved to the audit log)">
          <input
            value={f.reason}
            onChange={(e) => setF({ ...f, reason: e.target.value })}
            autoComplete="off"
          />
        </Field>
        <Button type="submit" variant="primary" disabled={busy}>
          {cat ? 'Save' : 'Add'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {msg ? <p className="error">{msg}</p> : null}
    </form>
  );
}
