import { TITLE_MAX } from './logic';

/**
 * Scan ISBN (DEC 131). A book's barcode is an EAN-13 that starts with 978 or
 * 979; the title comes from Open Library (free, no key, no account). Only the
 * ISBN leaves the phone. Pure functions so the checks are unit tested.
 */

export const TEXTBOOKS_CATEGORY = 2;
export const OPEN_LIBRARY_URL = 'https://openlibrary.org/api/books';
export const LOOKUP_TIMEOUT_MS = 6000;

/** The ISBN-13 in a scanned barcode, or null when it isn't a valid book code. */
export function isbnFromBarcode(data: string): string | null {
  const digits = data.replace(/[\s-]/g, '');
  if (!/^97[89]\d{10}$/.test(digits)) return null;
  const sum = digits
    .slice(0, 12)
    .split('')
    .reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[12]) ? digits : null;
}

export type BookInfo = { title: string; authors: string[]; year: string | null };

/** Reads Open Library's `jscmd=data` answer for one ISBN. */
export function bookFromOpenLibrary(isbn: string, json: unknown): BookInfo | null {
  if (!json || typeof json !== 'object') return null;
  const entry = (json as Record<string, unknown>)[`ISBN:${isbn}`];
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as { title?: unknown; authors?: unknown; publish_date?: unknown };
  const title = typeof e.title === 'string' ? e.title.trim() : '';
  if (!title) return null;
  const authors = Array.isArray(e.authors)
    ? e.authors
        .map((a) => (a && typeof a === 'object' ? (a as { name?: unknown }).name : null))
        .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
        .map((n) => n.trim())
    : [];
  const year =
    typeof e.publish_date === 'string' ? (e.publish_date.match(/\d{4}/)?.[0] ?? null) : null;
  return { title, authors, year };
}

/** "Calculus: Early Transcendentals, Stewart", cut to the title limit. */
export function bookListingTitle(b: BookInfo): string {
  const author = b.authors[0]?.split(' ').slice(-1)[0];
  const full = author ? `${b.title}, ${author}` : b.title;
  if (full.length <= TITLE_MAX) return full;
  return b.title.length <= TITLE_MAX ? b.title : b.title.slice(0, TITLE_MAX).trimEnd();
}

/** Looks the ISBN up; null when Open Library doesn't know it. Network errors throw. */
export async function lookupIsbn(
  isbn: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = LOOKUP_TIMEOUT_MS,
): Promise<BookInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${OPEN_LIBRARY_URL}?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`open library ${res.status}`);
    return bookFromOpenLibrary(isbn, await res.json());
  } finally {
    clearTimeout(timer);
  }
}
