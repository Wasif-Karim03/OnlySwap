/**
 * Sell flow rules (P5-SELL-02, P5-SELL-03). Pure functions only, so the draft,
 * the photo grid and the "all errors at once" check are unit tested
 * (T-UNIT-SELL-01, T-UNIT-SELL-02). The server re-checks everything
 * (create_listing); these rules only mirror it for instant feedback.
 */

export const DRAFT_VERSION = 1;
export const MAX_PHOTOS = 8;
export const TITLE_MIN = 3;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 1000;
/** Prices go up to $2,000 (listings.price_cents <= 200000). */
export const PRICE_MAX_CENTS = 200_000;
export const PRICE_MIN_CENTS = 100;

export type ListingKind = 'sale' | 'free';
export type Condition = 'new' | 'like_new' | 'good' | 'fair';
export type PickupBy = 'tomorrow' | 'sunday' | 'week';
export type Availability = 'weekdays' | 'weekends' | 'mornings' | 'afternoons' | 'evenings';
export const AVAILABILITY: Availability[] = [
  'weekdays',
  'weekends',
  'mornings',
  'afternoons',
  'evenings',
];
/** create_listing allows at most 5 meetup spots and a 60-character extra place. */
export const MAX_SPOTS = 5;
export const MEET_NOTE_MAX = 60;

export type DraftPhoto = {
  /** Local id; stable across reorders. */
  id: string;
  /** Local file for the preview (may be gone after an app restart). */
  uri: string;
  width: number;
  height: number;
  status: 'uploading' | 'done' | 'failed';
  path?: string;
  thumbPath?: string;
  blurhash?: string | null;
};

export type SellDraft = {
  v: number;
  /** From reserve_listing_id; photos upload under it before the listing exists. */
  listingId: string | null;
  kind: ListingKind;
  photos: DraftPhoto[];
  title: string;
  categoryId: number | null;
  condition: Condition | null;
  /** Dollars as typed, digits and one dot only. */
  price: string;
  openToOffers: boolean;
  pickupBy: PickupBy;
  description: string;
  /** Step 3. null until the seller touches the list (then the campus default is used). */
  spotIds: string[] | null;
  meetNote: string;
  availability: Availability[];
  startedAt: string;
  updatedAt: string;
};

export function emptyDraft(now: Date = new Date()): SellDraft {
  const iso = now.toISOString();
  return {
    v: DRAFT_VERSION,
    listingId: null,
    kind: 'sale',
    photos: [],
    title: '',
    categoryId: null,
    condition: null,
    price: '',
    openToOffers: true,
    pickupBy: 'week',
    description: '',
    spotIds: null,
    meetNote: '',
    availability: [],
    startedAt: iso,
    updatedAt: iso,
  };
}

/** Something worth offering to restore: a photo or any typed text. */
export function hasContent(d: SellDraft): boolean {
  return (
    d.photos.length > 0 ||
    d.title.trim() !== '' ||
    d.description.trim() !== '' ||
    d.price !== '' ||
    d.categoryId !== null
  );
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * Reads a stored draft. A different schema version or a malformed value is
 * discarded (T-UNIT-SELL-01). Uploads cut off by an app kill become failed,
 * so the tile offers a retry instead of spinning forever.
 */
export function parseStoredDraft(raw: unknown): SellDraft | null {
  if (!isObj(raw) || raw.v !== DRAFT_VERSION) return null;
  const base = emptyDraft();
  const d = { ...base, ...raw } as SellDraft;
  if (
    !Array.isArray(d.photos) ||
    typeof d.title !== 'string' ||
    typeof d.description !== 'string' ||
    typeof d.price !== 'string' ||
    (d.kind !== 'sale' && d.kind !== 'free')
  ) {
    return null;
  }
  const photos = d.photos
    .filter(
      (p): p is DraftPhoto => isObj(p) && typeof p.id === 'string' && typeof p.uri === 'string',
    )
    .slice(0, MAX_PHOTOS)
    .map((p) => (p.status === 'uploading' ? { ...p, status: 'failed' as const } : p));
  return { ...d, photos };
}

// ---------------------------------------------------------------------------
// Photos

/** Moves one item; out-of-range targets clamp to the ends. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items;
  const target = Math.min(Math.max(to, 0), items.length - 1);
  if (target === from) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved as T);
  return next;
}

/** How many more photos fit. */
export function photoRoom(photos: DraftPhoto[]): number {
  return Math.max(0, MAX_PHOTOS - photos.length);
}

export type PhotosState = 'empty' | 'uploading' | 'failed' | 'ready';

/** Step 1 can move on once there is a photo and every photo is uploaded. */
export function photosState(photos: DraftPhoto[]): PhotosState {
  if (photos.length === 0) return 'empty';
  if (photos.some((p) => p.status === 'uploading')) return 'uploading';
  if (photos.some((p) => p.status === 'failed')) return 'failed';
  return 'ready';
}

/** Grid cell under a point, for drag-to-reorder in a `columns`-wide grid. */
export function cellAt(
  x: number,
  y: number,
  cell: number,
  gap: number,
  columns: number,
  count: number,
): number {
  const step = cell + gap;
  const col = Math.min(Math.max(Math.floor((x + gap / 2) / step), 0), columns - 1);
  const row = Math.max(Math.floor((y + gap / 2) / step), 0);
  return Math.min(row * columns + col, Math.max(count - 1, 0));
}

export function mediaUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, '')}/${key}`;
}

// ---------------------------------------------------------------------------
// Details

/** Keeps digits and at most one dot with two decimals ("$1,200.505" → "1200.50"). */
export function cleanPrice(input: string): string {
  const kept = input.replace(/[^0-9.]/g, '');
  const [whole = '', ...rest] = kept.split('.');
  const intPart = whole.replace(/^0+(?=\d)/, '');
  if (rest.length === 0) return intPart;
  return `${intPart}.${rest.join('').slice(0, 2)}`;
}

/** Cents from the typed dollars; null when empty or not a number. */
export function priceToCents(price: string): number | null {
  const clean = cleanPrice(price);
  if (clean === '' || clean === '.') return null;
  const value = Number(clean);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export type DetailsField = 'title' | 'category' | 'price' | 'description';
export type DetailsError =
  | { field: 'title'; kind: 'short' | 'long' }
  | { field: 'title' | 'description'; kind: 'banned'; term: string }
  | { field: 'category'; kind: 'missing' }
  | { field: 'price'; kind: 'missing' | 'too_low' | 'too_high' }
  | { field: 'description'; kind: 'long' };

/**
 * Every problem at once, in screen order (D3, T-UNIT-SELL-02). Give-aways
 * skip category and price: the server stores them at $0.
 */
export function validateDetails(
  d: Pick<SellDraft, 'kind' | 'title' | 'categoryId' | 'price' | 'description'>,
): DetailsError[] {
  const errors: DetailsError[] = [];
  const title = d.title.trim();
  if (title.length < TITLE_MIN) errors.push({ field: 'title', kind: 'short' });
  else if (title.length > TITLE_MAX) errors.push({ field: 'title', kind: 'long' });
  if (d.kind === 'sale') {
    if (d.categoryId === null) errors.push({ field: 'category', kind: 'missing' });
    const cents = priceToCents(d.price);
    if (cents === null || cents === 0) errors.push({ field: 'price', kind: 'missing' });
    else if (cents < PRICE_MIN_CENTS) errors.push({ field: 'price', kind: 'too_low' });
    else if (cents > PRICE_MAX_CENTS) errors.push({ field: 'price', kind: 'too_high' });
  }
  if (d.description.trim().length > DESCRIPTION_MAX) {
    errors.push({ field: 'description', kind: 'long' });
  }
  return errors;
}

/** Price sent to the server: give-aways are always 0 (T-UNIT-SELL-02). */
export function listingPriceCents(d: Pick<SellDraft, 'kind' | 'price'>): number {
  return d.kind === 'free' ? 0 : (priceToCents(d.price) ?? 0);
}

// ---------------------------------------------------------------------------
// Give-away pickup day (DEC 54), as a campus-calendar date "YYYY-MM-DD".

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Tomorrow; the coming Sunday (a week out when today is Sunday); or a week
 * from today. Uses the phone's calendar, which is the campus one for R1.0.
 */
export function pickupDate(choice: PickupBy, today: Date = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (choice === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (choice === 'sunday') d.setDate(d.getDate() + (7 - d.getDay() || 7));
  else d.setDate(d.getDate() + 7);
  return ymd(d);
}

// ---------------------------------------------------------------------------
// Categories (0100_ref_data.sql). Parents first; children show as "Tech / Monitors".

export type Category = { id: number; name: string; parentId: number | null };

export function categoryLabel(categories: Category[], id: number | null): string | null {
  if (id === null) return null;
  const c = categories.find((x) => x.id === id);
  if (!c) return null;
  const parent = c.parentId === null ? null : categories.find((x) => x.id === c.parentId);
  return parent ? `${parent.name} / ${c.name}` : c.name;
}

// ---------------------------------------------------------------------------
// "Draft saved · 2 seconds ago", "You started listing a lamp yesterday".

export type Ago =
  | { key: 'now' | 'second' | 'minute' | 'today' | 'yesterday' }
  | { key: 'seconds' | 'minutes' | 'days'; n: number };

export function ago(then: Date, now: Date): Ago {
  const secs = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (secs < 5) return { key: 'now' };
  if (secs < 60) return { key: 'seconds', n: secs };
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins === 1 ? { key: 'minute' } : { key: 'minutes', n: mins };
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(then)) / 86_400_000);
  if (days <= 0) return { key: 'today' };
  if (days === 1) return { key: 'yesterday' };
  return { key: 'days', n: days };
}

// ---------------------------------------------------------------------------
// Step 3: meetup spots (D03). Police-designated first, then the campus order.

export type Spot = {
  id: string;
  name: string;
  description: string | null;
  hours: string | null;
  lat: number;
  lng: number;
  police: boolean;
  isDefault: boolean;
  sort: number;
};

export function sortSpots(spots: Spot[]): Spot[] {
  return spots
    .slice()
    .sort(
      (a, b) =>
        Number(b.police) - Number(a.police) || a.sort - b.sort || a.name.localeCompare(b.name),
    );
}

/** The chosen spots: the seller's picks, or the campus defaults before they touch the list. */
export function chosenSpots(d: Pick<SellDraft, 'spotIds'>, spots: Spot[]): string[] {
  if (d.spotIds !== null) return d.spotIds.filter((id) => spots.some((s) => s.id === id));
  return spots
    .filter((s) => s.isDefault)
    .slice(0, MAX_SPOTS)
    .map((s) => s.id);
}

/** Tapping a spot: toggles it; a sixth is refused (returns null). */
export function toggleSpot(current: string[], id: string): string[] | null {
  if (current.includes(id)) return current.filter((x) => x !== id);
  if (current.length >= MAX_SPOTS) return null;
  return [...current, id];
}

/** Apple Maps on iOS, a geo: link elsewhere (no location permission needed). */
export function directionsUrl(spot: Pick<Spot, 'lat' | 'lng' | 'name'>, platform: string): string {
  const q = encodeURIComponent(spot.name);
  return platform === 'ios'
    ? `https://maps.apple.com/?daddr=${spot.lat},${spot.lng}&q=${q}`
    : `geo:${spot.lat},${spot.lng}?q=${spot.lat},${spot.lng}(${q})`;
}

// ---------------------------------------------------------------------------
// Posting (create_listing arguments)

export type CreateListingArgs = {
  id: string;
  kind: ListingKind;
  title: string;
  description: string | null;
  category_id: number | null;
  condition: Condition | null;
  price_cents: number;
  open_to_offers: boolean;
  photos: {
    path: string;
    thumb_path: string;
    width: number;
    height: number;
    blurhash: string | null;
  }[];
  meet_spot_ids: string[];
  meet_note: string | null;
  availability: string[];
  pickup_by: string | null;
};

export function createArgs(
  d: SellDraft,
  spotIds: string[],
  today: Date = new Date(),
): CreateListingArgs {
  if (!d.listingId) throw new Error('no reserved listing id');
  return {
    id: d.listingId,
    kind: d.kind,
    title: d.title.trim(),
    description: d.description.trim() || null,
    category_id: d.kind === 'sale' ? d.categoryId : null,
    condition: d.condition,
    price_cents: listingPriceCents(d),
    open_to_offers: d.kind === 'sale' ? d.openToOffers : true,
    photos: d.photos
      .filter((p) => p.status === 'done' && p.path && p.thumbPath)
      .map((p) => ({
        path: p.path as string,
        thumb_path: p.thumbPath as string,
        width: p.width,
        height: p.height,
        blurhash: p.blurhash ?? null,
      })),
    meet_spot_ids: spotIds,
    meet_note: d.meetNote.trim() || null,
    availability: d.availability,
    pickup_by: d.kind === 'free' ? pickupDate(d.pickupBy, today) : null,
  };
}

/** "$60", "$12.50" or "Free". */
export function priceLabel(kind: ListingKind, cents: number, free: string): string {
  if (kind === 'free' || cents === 0) return free;
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars.toLocaleString('en-US') : dollars.toFixed(2)}`;
}

/** {SITE}/l/{id} (E2E-18); the site serves the preview with the share card. */
export function listingLink(site: string, id: string): string {
  return `${site.replace(/\/+$/, '')}/l/${id}`;
}
