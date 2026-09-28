import type { Condition } from '../sell/logic';

/** Search filters (API §3 `search_listings`, DEC 58). */
export type SortKey = 'relevance' | 'new' | 'price_asc' | 'price_desc';
export type SearchFilters = {
  category_ids?: number[];
  min_cents?: number;
  max_cents?: number;
  conditions?: Condition[];
  free_only?: boolean;
  sort?: SortKey;
  hide_swiped?: boolean;
};

export type Suggestion = {
  type: 'saved' | 'category' | 'trending' | 'title';
  label: string;
  count: number | null;
};

export type SavedSearch = {
  id: string;
  query: string | null;
  filters: SearchFilters;
  alerts: boolean;
  last_seen_at: string;
  created_at: string;
};

const SORTS: SortKey[] = ['relevance', 'new', 'price_asc', 'price_desc'];
const CONDITIONS: Condition[] = ['new', 'like_new', 'good', 'fair'];

/** Drops empty values so the server gets only what's set (and saved searches compare equal). */
export function cleanFilters(f: SearchFilters): SearchFilters {
  const out: SearchFilters = {};
  if (f.category_ids?.length) out.category_ids = [...f.category_ids].sort((a, b) => a - b);
  if (typeof f.min_cents === 'number' && f.min_cents > 0) out.min_cents = f.min_cents;
  if (typeof f.max_cents === 'number' && f.max_cents > 0) out.max_cents = f.max_cents;
  if (out.min_cents && out.max_cents && out.min_cents > out.max_cents) {
    [out.min_cents, out.max_cents] = [out.max_cents, out.min_cents];
  }
  if (f.conditions?.length) out.conditions = CONDITIONS.filter((c) => f.conditions!.includes(c));
  if (f.free_only) out.free_only = true;
  if (f.sort && f.sort !== 'relevance') out.sort = f.sort;
  if (f.hide_swiped) out.hide_swiped = true;
  return out;
}

/** How many filters are on (the Filters button badge); sort doesn't count. */
export function activeCount(f: SearchFilters): number {
  const c = cleanFilters(f);
  return (
    (c.category_ids ? 1 : 0) +
    (c.min_cents || c.max_cents ? 1 : 0) +
    (c.conditions ? 1 : 0) +
    (c.free_only ? 1 : 0) +
    (c.hide_swiped ? 1 : 0)
  );
}

/** Filters travel in the results route as one JSON param. */
export function encodeFilters(f: SearchFilters): string {
  const c = cleanFilters(f);
  return Object.keys(c).length ? JSON.stringify(c) : '';
}

export function decodeFilters(raw: string | undefined | null): SearchFilters {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== 'object') return {};
    const f: SearchFilters = {};
    if (Array.isArray(v.category_ids))
      f.category_ids = v.category_ids.filter((n): n is number => Number.isInteger(n));
    if (Number.isInteger(v.min_cents)) f.min_cents = v.min_cents as number;
    if (Number.isInteger(v.max_cents)) f.max_cents = v.max_cents as number;
    if (Array.isArray(v.conditions))
      f.conditions = CONDITIONS.filter((c) => (v.conditions as unknown[]).includes(c));
    if (v.free_only === true) f.free_only = true;
    if (typeof v.sort === 'string' && SORTS.includes(v.sort as SortKey)) f.sort = v.sort as SortKey;
    if (v.hide_swiped === true) f.hide_swiped = true;
    return cleanFilters(f);
  } catch {
    return {};
  }
}

/** "12" or "12.50" dollars → cents; blank or bad → undefined. */
export function dollarsToCents(input: string): number | undefined {
  const t = input.replace(/[^0-9.]/g, '');
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number | undefined): string {
  if (!cents) return '';
  return Number.isInteger(cents / 100) ? String(cents / 100) : (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Recent searches (kept on the device, newest first, max 8)

export const RECENT_MAX = 8;

export function addRecent(list: string[], q: string): string[] {
  const t = q.trim();
  if (!t) return list;
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
}

export function parseRecent(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX)
    : [];
}

/** Offset cursor for the next page, or null at the end. */
export function nextOffset(pageLength: number, offset: number, limit = 20): number | null {
  return pageLength < limit ? null : offset + pageLength;
}
