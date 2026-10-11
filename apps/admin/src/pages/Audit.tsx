import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';

import { AUDIT_ACTION_FILTERS, auditAction, configKey, humanize, targetType } from '../labels';
import { AUDIT_RANGES, auditWindow, pageStack, toCsv, whenLabel, type AuditRange } from '../logic';
import { useIsOwner } from '../session';
import type { AuditV2 } from '../types';
import {
  Button,
  Card,
  downloadCsv,
  FilterChip,
  Loadable,
  Page,
  Pager,
  StatusPill,
  Table,
  useRpc,
} from '../ui';

type AuditPage = { items: AuditV2[]; next_cursor: number | null };
type Admin = { user_id: string; display_name: string | null };

const TARGETS = [
  'user',
  'listing',
  'report',
  'chat',
  'campus',
  'config',
  'announcement',
  'support',
];

const CSV_COLS = [
  'id',
  'at',
  'actor',
  'action',
  'target_type',
  'target_id',
  'target_label',
  'reason',
  'case_ref',
  'meta',
];

/** What a row is about, linked when there's a page for it. */
function About({ r }: { r: AuditV2 }): ReactNode {
  const label =
    r.target_label ?? (r.target_type === 'config' && r.target_id ? configKey(r.target_id) : null);
  const text =
    label ?? `${targetType(r.target_type)}${r.target_id ? ` ${r.target_id.slice(0, 8)}` : ''}`;
  if (!r.target_id) return <span className="muted">{targetType(r.target_type) || 'None'}</span>;
  if (r.target_type === 'user')
    return (
      <Link className="link" to="/people/$id" params={{ id: r.target_id }}>
        {text}
      </Link>
    );
  if (r.target_type === 'listing')
    return (
      <Link className="link" to="/listings/$id" params={{ id: r.target_id }}>
        {text}
      </Link>
    );
  if (r.target_type === 'report')
    return (
      <Link className="link" to="/reports/$id" params={{ id: r.target_id }}>
        {text}
      </Link>
    );
  return <span>{text}</span>;
}

/**
 * Audit log (admin_list_audit_v2): every staff action and every look at a
 * person, 100 per page with Previous / Next, filtered by staff, action, what
 * it's about and time (checklist §2: paging and date filter).
 */
export function AuditPage() {
  const owner = useIsOwner();
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [actor, setActor] = useState('');
  const [range, setRange] = useState<AuditRange>('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stack, setStack] = useState<number[]>([]);
  // Fixed "now" per filter change so paging doesn't drift.
  const [now, setNow] = useState(() => Date.now());
  const win = auditWindow(range, now, from, to);
  const cursor = stack.length ? stack[stack.length - 1] : null;
  const state = useRpc<AuditPage>('admin_list_audit_v2', {
    filters: {
      ...(action ? { action } : {}),
      ...(target ? { target_type: target } : {}),
      ...(actor ? { actor_id: actor } : {}),
      ...win,
    },
    cursor,
  });
  const admins = useRpc<Admin[]>('admin_list_admins', {}, !owner);
  const reset = () => {
    setStack(pageStack(stack, 'reset'));
    setNow(Date.now());
  };

  return (
    <Page
      title="Audit log"
      crumb="Every staff action and every look at a person"
      actions={
        <Button
          icon="down"
          disabled={!state.data?.items.length}
          onClick={() =>
            downloadCsv(
              'onlyswap-audit',
              toCsv(
                (state.data?.items ?? []).map((r) => ({
                  ...r,
                  actor: r.actor?.display_name ?? '',
                })),
                CSV_COLS,
              ),
            )
          }
        >
          CSV
        </Button>
      }
    >
      <div className="filters">
        {owner ? (
          <FilterChip label="Staff">
            <select
              value={actor}
              onChange={(e) => {
                setActor(e.target.value);
                reset();
              }}
            >
              <option value="">Anyone</option>
              {(admins.data ?? []).map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {a.display_name ?? 'No name'}
                </option>
              ))}
            </select>
          </FilterChip>
        ) : null}
        <FilterChip label="Action">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              reset();
            }}
          >
            <option value="">All</option>
            {AUDIT_ACTION_FILTERS.map((a) => (
              <option key={a.prefix} value={a.prefix}>
                {a.label}
              </option>
            ))}
          </select>
        </FilterChip>
        <FilterChip label="About">
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              reset();
            }}
          >
            <option value="">Anything</option>
            {TARGETS.map((t) => (
              <option key={t} value={t}>
                {targetType(t) || humanize(t)}
              </option>
            ))}
          </select>
        </FilterChip>
        <FilterChip label="Time">
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as AuditRange);
              reset();
            }}
          >
            {AUDIT_RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </FilterChip>
        {range === 'custom' ? (
          <>
            <FilterChip label="From">
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => {
                  setFrom(e.target.value);
                  reset();
                }}
              />
            </FilterChip>
            <FilterChip label="To">
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => {
                  setTo(e.target.value);
                  reset();
                }}
              />
            </FilterChip>
          </>
        ) : null}
        <span className="muted spacer">Kept 2 years. Rows can't be edited or deleted.</span>
      </div>
      <Card>
        <Loadable
          state={state}
          rows={10}
          empty={(d) => d.items.length === 0}
          emptyText="No staff actions match these filters."
        >
          {(d) => (
            <>
              <Table label="Audit log" columns={['When', 'Staff', 'Action', 'About', 'Reason']}>
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td className="muted tnum" title={new Date(r.at).toLocaleString()}>
                      {whenLabel(r.at)}
                    </td>
                    <td className="strong">{r.actor?.display_name ?? 'System'}</td>
                    <td>
                      <StatusPill {...auditAction(r.action)} />
                    </td>
                    <td>
                      <About r={r} />
                    </td>
                    <td className="ink2 wrap" style={{ maxWidth: 420 }}>
                      {r.reason === 'view' || r.reason === 'review' ? (
                        <span className="muted">Looked only</span>
                      ) : (
                        r.reason
                      )}
                      {r.case_ref ? <span className="muted"> · case {r.case_ref}</span> : null}
                    </td>
                  </tr>
                ))}
              </Table>
              <Pager
                info={`Page ${stack.length + 1}`}
                hasPrev={stack.length > 0}
                hasNext={d.next_cursor !== null}
                onPrev={() => setStack(pageStack(stack, 'prev'))}
                onNext={() => setStack(pageStack(stack, 'next', d.next_cursor))}
              />
            </>
          )}
        </Loadable>
      </Card>
    </Page>
  );
}
