// Admin UI kit (approved mock: design/admin-redesign-mock.html). Pages build
// from these pieces and the classes in styles.css; see apps/admin/README.md.
import { Link } from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import { displayTone, type IconName, type Labeled, type Tone } from './labels';
import { errorMessage, mediaUrl, moneyLabel, sparkPath } from './logic';
import { GlobalSearch } from './search';
import { rpc } from './supabase';

// ---------------------------------------------------------------------------
// Data

/** Load an RPC result with loading, error and reload. Pass `skip` to wait. */
export function useRpc<T>(fn: string, args?: Record<string, unknown>, skip = false) {
  const key = JSON.stringify(args ?? {});
  // Results are tagged with the args they answer, so rows for old args never
  // show (or survive a failed load) after the args change.
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null }>({
    key,
    data: null,
    error: null,
  });
  const [loading, setLoading] = useState(!skip);
  const reload = useCallback(() => {
    if (skip) return;
    setLoading(true);
    rpc<T>(fn, JSON.parse(key) as Record<string, unknown>)
      .then((d) => setResult({ key, data: d, error: null }))
      .catch((e: unknown) =>
        setResult((prev) => ({
          key,
          data: prev.key === key ? prev.data : null,
          error: errorMessage(e),
        })),
      )
      .finally(() => setLoading(false));
  }, [fn, key, skip]);
  useEffect(() => {
    reload();
  }, [reload]);
  const current = result.key === key;
  return {
    data: current ? result.data : null,
    error: current ? result.error : null,
    loading,
    reload,
  };
}

export type RpcState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

/** Loading skeleton, error with retry, empty state, or the content. */
export function Loadable<T>({
  state,
  empty,
  emptyText,
  rows = 4,
  children,
}: {
  state: RpcState<T>;
  empty?: (d: T) => boolean;
  emptyText?: ReactNode;
  rows?: number;
  children: (d: T) => ReactNode;
}) {
  // A failed refresh keeps the rows already shown and says so above them.
  if (state.error && state.data === null)
    return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.loading && state.data === null) return <Loading rows={rows} />;
  if (state.data === null) return null;
  const stale = state.error ? <StaleBanner onRetry={state.reload} /> : null;
  if (empty?.(state.data))
    return (
      <>
        {stale}
        <EmptyState title={emptyText ?? 'Nothing here right now.'} />
      </>
    );
  return (
    <>
      {stale}
      {children(state.data)}
    </>
  );
}

/** One hairline row over data that is still shown after a reload failed. */
export function StaleBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="stale" role="alert">
      <span>Could not refresh.</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

const MEDIA = (import.meta.env.VITE_MEDIA_URL as string | undefined) ?? '';
/** Image URL for a media key (listing thumbs, avatars); '' without a media host. */
export const media = (key: string | null | undefined) => mediaUrl(MEDIA, key);

// ---------------------------------------------------------------------------
// Icons (the mock's line set)

const ICONS: Record<IconName, ReactNode> = {
  home: <path d="M3 10.5L12 3l9 7.5V21H3z" />,
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="8.5" r="1.5" />
    </>
  ),
  flag: <path d="M5 21V4h11l-2 4 2 4H5" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  quad: <path d="M4 5h16v11H8l-4 4z" />,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />,
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z" />
      <path d="M4 16a4 4 0 0 1 4-4h12" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  log: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  down: <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  ),
  dollar: <path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  check: <path d="M5 12l5 5L20 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  scale: <path d="M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0z" />,
  logout: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  thumb: (
    <path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7" />
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  school: <path d="M2 9l10-5 10 5-10 5zM6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />,
  server: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </>
  ),
};

export function Icon({ name, size }: { name: IconName; size?: number }) {
  return (
    <svg
      className="i"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={size ? { width: size, height: size } : undefined}
    >
      {ICONS[name]}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page frame

/**
 * One admin page: the 56px top bar (title, crumb, global search, page actions)
 * and the padded content column. Every page renders exactly one <Page>.
 */
export function Page({
  title,
  crumb,
  actions,
  children,
}: {
  title: string;
  crumb?: ReactNode;
  /** Buttons at the right of the top bar (Export, CSV, Add). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · OnlySwap admin`;
  }, [title]);
  return (
    <>
      <header className="top">
        <h1>{title}</h1>
        {crumb ? <span className="crumb">{crumb}</span> : null}
        <div className="top-right">
          <GlobalSearch />
          {actions}
        </div>
      </header>
      <div className="content">{children}</div>
    </>
  );
}

/** A bordered card; `title` renders the 50px header with `right` controls. */
export function Card({
  title,
  right,
  children,
  className,
  pad,
  label,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Pads the body (for text cards without a header). */
  pad?: boolean;
  label?: string;
}) {
  return (
    <section
      className={['card', 'clip', pad ? 'pad' : '', className ?? ''].join(' ').trim()}
      aria-label={label ?? (typeof title === 'string' ? title : undefined)}
    >
      {title !== undefined ? <CardHeader title={title} right={right} /> : null}
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  right,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ch ${className ?? ''}`}>
      {typeof title === 'string' ? <h2>{title}</h2> : title}
      {right ? <div className="r">{right}</div> : null}
    </div>
  );
}

export type Column = { label: ReactNode; num?: boolean; className?: string };

/** Calm table: light 11.5px headers, normal-weight cells. Children are <tr> rows. */
export function Table({
  columns,
  children,
  className,
  label,
  compact,
}: {
  columns: (Column | string)[];
  children: ReactNode;
  className?: string;
  label?: string;
  /** 12px side padding for narrow cards. */
  compact?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className={`t ${compact ? 'compact' : ''} ${className ?? ''}`} aria-label={label}>
        <thead>
          <tr>
            {columns.map((c, i) => {
              const col = typeof c === 'string' ? { label: c } : c;
              return (
                <th key={i} className={[col.num ? 'num' : '', col.className ?? ''].join(' ')}>
                  {col.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pills, avatars, people and items

export function Pill({
  tone = 'neutral',
  label,
  children,
  dot = true,
  title,
}: {
  tone?: Tone;
  label?: ReactNode;
  children?: ReactNode;
  dot?: boolean;
  title?: string;
}) {
  return (
    <span className={`pill t-${displayTone(tone)}${dot ? '' : ' nodot'}`} title={title}>
      {label ?? children}
    </span>
  );
}

/** A pill from a labels.ts mapping: `<StatusPill {...userStatus(u.status)} />`. */
export function StatusPill({ label, tone, dot = true }: Labeled & { dot?: boolean }) {
  if (!label) return null;
  return <Pill tone={tone} label={label} dot={dot} />;
}

/** The colored square with an icon used in activity rows. */
export function EventIcon({ tone, icon }: { tone: Tone; icon: IconName }) {
  return (
    <span className={`ico t-${displayTone(tone)}`} aria-hidden="true">
      <Icon name={icon} />
    </span>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Initial in a tinted circle (color fixed per person), or their photo. */
export function Avatar({
  initial,
  seed,
  photo,
  size,
  me,
}: {
  initial?: string | null;
  seed?: string | null;
  photo?: string | null;
  size?: 'lg';
  me?: boolean;
}) {
  const cls = `av ${size ?? ''} ${me ? 'me' : `c${hash(seed ?? initial ?? '?') % 5}`}`;
  const src = media(photo);
  if (src) return <img className={cls} src={src} alt="" />;
  return (
    <span className={cls} aria-hidden="true">
      {(initial || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export type PersonRef = {
  id: string;
  display_name: string | null;
  initial?: string | null;
  avatar_path?: string | null;
} | null;

/** Avatar plus name, linking to the person page. A gone account says so. */
export function PersonCell({
  person,
  sub,
  link = true,
}: {
  person: PersonRef | undefined;
  sub?: ReactNode;
  link?: boolean;
}) {
  if (!person) return <span className="muted">Deleted account</span>;
  const name = person.display_name ?? 'No name';
  const inner = (
    <>
      <Avatar
        initial={person.initial ?? name.slice(0, 1)}
        seed={person.id}
        photo={person.avatar_path}
      />
      <span>
        <span className="who-label">{name}</span>
        {sub ? <div className="sub">{sub}</div> : null}
      </span>
    </>
  );
  return link ? (
    <Link className="who" to="/people/$id" params={{ id: person.id }}>
      {inner}
    </Link>
  ) : (
    <span className="who">{inner}</span>
  );
}

export type ListingRef = {
  id?: string;
  title: string;
  price_cents?: number | null;
  photo?: string | null;
};

/** Thumbnail, title and price for a listing. */
export function ListingCell({
  listing,
  size,
  showPrice = true,
}: {
  listing: ListingRef | null | undefined;
  size?: 'lg';
  showPrice?: boolean;
}) {
  if (!listing) return <span className="muted">None</span>;
  const src = media(listing.photo);
  return (
    <span className="item">
      {src ? (
        <img className={`th ${size ?? ''}`} src={src} alt="" loading="lazy" />
      ) : (
        <span className={`th ${size ?? ''}`} aria-hidden="true" />
      )}
      <span className="t1">{listing.title}</span>
      {showPrice && listing.price_cents !== undefined && listing.price_cents !== null ? (
        <span className="muted">{moneyLabel(listing.price_cents, true)}</span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Controls

export type ButtonVariant = 'secondary' | 'primary' | 'danger' | 'ban' | 'ghost';

/**
 * 30px button. secondary (white, border), primary (dark), danger (red text), ban
 * (red fill, Ban only). `pending` disables it and shows `pendingLabel` ("Saving…").
 */
export function Button({
  variant = 'secondary',
  size,
  icon,
  children,
  className,
  type = 'button',
  pending = false,
  pendingLabel,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm';
  icon?: IconName;
  pending?: boolean;
  pendingLabel?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={['btn', variant === 'secondary' ? '' : variant, size ?? '', className ?? '']
        .join(' ')
        .trim()}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export type SegOption<T extends string> = { id: T; label: ReactNode };

/** Segmented control (one choice from a few). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  full,
}: {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  full?: boolean;
}) {
  return (
    <div className={`seg${full ? ' full' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={value === o.id ? 'on' : ''}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Filter chip: a label with a native select or input inside ("Status  All ▾"). */
export function FilterChip({
  label,
  icon,
  children,
}: {
  label?: string;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <label className="fchip">
      {icon ? <Icon name={icon} /> : null}
      {label ? <span>{label}</span> : null}
      {children}
    </label>
  );
}

/** Labeled form field with an optional hint and an error line under it. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  /** A red line under the control, announced when it appears. */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field${error ? ' has-error' : ''} ${className ?? ''}`}>
      <span>{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

/** On/off switch (a button with role switch). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

/** Previous / Next for offset or keyset lists. */
export function Pager({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  info,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  info?: ReactNode;
}) {
  if (!hasPrev && !hasNext && !info) return null;
  return (
    <div className="pager">
      {info ? <span className="muted">{info}</span> : null}
      <span className="spacer" />
      <Button size="sm" disabled={!hasPrev} onClick={onPrev}>
        Previous
      </Button>
      <Button size="sm" disabled={!hasNext} onClick={onNext}>
        Next
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI cards

export function Sparkline({
  points,
  dir = 'flat',
  width = 120,
  height = 30,
}: {
  points: number[];
  dir?: 'up' | 'down' | 'flat';
  width?: number;
  height?: number;
}) {
  return (
    <svg
      className={`spark ${dir === 'up' ? 'up' : dir === 'down' ? 'dn' : 'flat'}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <path d={sparkPath(points, width, height)} />
    </svg>
  );
}

/** KPI card: label, big number, change line, sparkline. Links when `to` is set. */
export function Kpi({
  label,
  value,
  delta,
  dir = 'flat',
  series,
  to,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  dir?: 'up' | 'down' | 'flat';
  series?: number[];
  to?: string;
}) {
  const body = (
    <>
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {delta ? (
        <div className={`d ${dir === 'up' ? 'up' : dir === 'down' ? 'dn' : ''}`}>{delta}</div>
      ) : null}
      {series && series.length ? <Sparkline points={series} dir={dir} /> : null}
    </>
  );
  return to ? (
    <Link className="card kpi" to={to}>
      {body}
    </Link>
  ) : (
    <div className="card kpi">{body}</div>
  );
}

/** Horizontal bar (decorative; put the number next to it). */
export function Bar({ pct, lime }: { pct: number; lime?: boolean }) {
  return (
    <div className={`bar${lime ? ' lime' : ''}`} aria-hidden="true">
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// States

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="state" role="status">
      <div className="title">{title}</div>
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state err" role="alert">
      <div className="title">{message}</div>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

/** Skeleton lines while a list loads. */
export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skel-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skel" style={{ width: `${90 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions

/** Shortest reason the audit log accepts. */
const MIN_REASON = 3;
/** How long the inline "Done" line stays after an action. */
const DONE_MS = 6000;
const REASON_LABEL = 'Reason (required)';
const REASON_HINT = 'Saved to the audit log.';
const REASON_SHORT = 'Add a reason, at least 3 characters.';

/** Shows the one-line result for DONE_MS, then hides it. */
function useDoneNote() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), DONE_MS);
    return () => clearTimeout(t);
  }, [shown]);
  return { shown, show: () => setShown(true), hide: () => setShown(false) };
}

/** "Done. Logged to the audit log." with a link to the log. */
function DoneNote() {
  return (
    <span className="ok done-note" role="status">
      Done. Logged to the audit log.{' '}
      <Link className="link" to="/audit">
        View
      </Link>
    </span>
  );
}

/** Live reason count: the minimum until it is met, then the length. */
function ReasonCount({ reason }: { reason: string }) {
  const n = reason.trim().length;
  return (
    <span className="counter">{n < MIN_REASON ? '3 characters minimum' : `${n} characters`}</span>
  );
}

/**
 * The confirmation for a moderation action: the effect line, a required reason
 * with a live count, an optional extra input, then Cancel and one primary.
 * Stays open while running and on error (the reason is kept).
 */
export function ReasonDialog({
  title,
  effect,
  needsReason = true,
  hint,
  extra,
  danger,
  initialReason = '',
  pendingLabel = 'Working…',
  onCancel,
  onRun,
}: {
  title: string;
  effect?: string;
  needsReason?: boolean;
  hint?: ReactNode;
  extra?: ReactNode;
  /** Red fill on the primary (Ban only). */
  danger?: boolean;
  initialReason?: string;
  /** The primary's label while running ("Saving…"). */
  pendingLabel?: string;
  onCancel: () => void;
  onRun: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(initialReason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (needsReason && reason.trim().length < MIN_REASON) {
      setError(REASON_SHORT);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRun(reason.trim());
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} onClose={busy ? () => undefined : onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="cb stack tight">
          {effect ? <p className="callout red">{effect}</p> : null}
          {needsReason ? (
            <Field label={REASON_LABEL} hint={hint ?? REASON_HINT} error={error}>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoComplete="off"
                autoFocus
                aria-invalid={error ? true : undefined}
              />
              <ReasonCount reason={reason} />
            </Field>
          ) : error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {extra ? <div className="row end">{extra}</div> : null}
        </div>
        <div className="cf end">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={danger ? 'ban' : 'primary'}
            pending={busy}
            pendingLabel={pendingLabel}
          >
            {title}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * An admin action button. When it needs a reason or a confirmation it opens
 * the reason dialog; the result shows next to it for a few seconds.
 */
export function ActionButton({
  label,
  run,
  onDone,
  kind,
  needsReason = true,
  confirm,
  size,
  reasonPrompt,
}: {
  label: string;
  run: (reason: string) => Promise<unknown>;
  onDone?: () => void;
  /** 'danger' is red text, 'ban' a red fill, 'primary' dark. */
  kind?: ButtonVariant;
  needsReason?: boolean;
  /** The effect line shown first in the dialog (for removals). */
  confirm?: string;
  size?: 'sm';
  /** Help line under the reason field; defaults to "Saved to the audit log." */
  reasonPrompt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useDoneNote();
  const finish = () => {
    setOpen(false);
    done.show();
    onDone?.();
  };
  const runNow = async () => {
    setBusy(true);
    setError(null);
    done.hide();
    try {
      await run('');
      finish();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="row nowrap">
      <Button
        variant={kind ?? 'secondary'}
        size={size}
        pending={busy}
        onClick={() => {
          if (!needsReason && !confirm) return void runNow();
          setError(null);
          done.hide();
          setOpen(true);
        }}
      >
        {label}
      </Button>
      {done.shown ? <DoneNote /> : null}
      {error ? (
        <span className="toast error" role="alert">
          {error}
        </span>
      ) : null}
      {open ? (
        <ReasonDialog
          title={label}
          effect={confirm}
          needsReason={needsReason}
          hint={reasonPrompt}
          danger={kind === 'ban'}
          onCancel={() => setOpen(false)}
          onRun={async (reason) => {
            await run(reason);
            finish();
          }}
        />
      ) : null}
    </span>
  );
}

export type ReasonAction = {
  id: string;
  label: string;
  variant?: ButtonVariant;
  run: (reason: string) => Promise<unknown>;
  /** The effect line shown first in the confirmation dialog. */
  confirm?: string;
  /** Shown only while this action is picked (for example a days box for Suspend). */
  extra?: ReactNode;
  /** Two-step actions: the first click picks it and shows `extra`, the second runs. */
  needsExtra?: boolean;
};

/** Ban, remove and other confirmed or red actions always go through the dialog. */
const usesDialog = (a: ReasonAction) =>
  !!a.confirm || a.variant === 'ban' || a.variant === 'danger';

/**
 * One action row (the Reports, person and listing pages). Low-risk actions
 * run with the inline reason box; Ban, Remove and other confirmed or red
 * actions open the reason dialog. An inline action with `needsExtra` first
 * reveals its extra input (Pause until).
 */
export function ReasonActions({
  actions,
  more = [],
  onDone,
  placeholder = REASON_LABEL,
  hint = REASON_HINT,
}: {
  actions: ReasonAction[];
  /** Less common actions, behind a "More" disclosure at the end of the row. */
  more?: ReasonAction[];
  onDone?: (id: string) => void;
  placeholder?: string;
  /** Help line under the reason box. */
  hint?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [dialogFor, setDialogFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useDoneNote();
  const all = [...actions, ...more];
  const pickedAction = all.find((a) => a.id === picked);
  const dialogAction = all.find((a) => a.id === dialogFor);
  const button = (a: ReasonAction) => (
    <Button
      key={a.id}
      variant={a.variant}
      disabled={busy !== null}
      pending={busy === a.id}
      pendingLabel="Working…"
      className={picked === a.id ? 'on' : ''}
      onClick={() => void go(a)}
    >
      {a.label}
    </Button>
  );

  const finish = (a: ReasonAction) => {
    setReason('');
    setPicked(null);
    setDialogFor(null);
    done.show();
    onDone?.(a.id);
  };

  const go = async (a: ReasonAction) => {
    setError(null);
    done.hide();
    if (usesDialog(a)) {
      setPicked(null);
      setDialogFor(a.id);
      return;
    }
    if (a.needsExtra && picked !== a.id) {
      setPicked(a.id);
      return;
    }
    if (reason.trim().length < MIN_REASON) {
      setError(REASON_SHORT);
      return;
    }
    setBusy(a.id);
    try {
      await a.run(reason.trim());
      finish(a);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack tight">
      <div className="row">
        <div className="reason">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            aria-label={REASON_LABEL}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
          />
        </div>
        {actions.map(button)}
        {more.length ? (
          <details className="more">
            <summary className="btn ghost">More</summary>
            <div className="row">{more.map(button)}</div>
          </details>
        ) : null}
      </div>
      <div className="row reason-meta">
        <span className="note">{hint}</span>
        <ReasonCount reason={reason} />
      </div>
      {pickedAction?.extra ? (
        <div className="row end">
          {pickedAction.extra}
          <Button
            variant="primary"
            pending={busy === pickedAction.id}
            pendingLabel="Working…"
            onClick={() => void go(pickedAction)}
          >
            {pickedAction.label}
          </Button>
          <Button variant="ghost" onClick={() => setPicked(null)}>
            Cancel
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {done.shown ? <DoneNote /> : null}
      {dialogAction ? (
        <ReasonDialog
          title={dialogAction.label}
          effect={dialogAction.confirm}
          extra={dialogAction.extra}
          danger={dialogAction.variant === 'ban'}
          initialReason={reason}
          onCancel={() => setDialogFor(null)}
          onRun={async (r) => {
            await dialogAction.run(r);
            finish(dialogAction);
          }}
        />
      ) : null}
    </div>
  );
}

/** Downloads rows as a CSV file. */
export function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------------
// Campuses

export type CampusOption = {
  id: string;
  name: string;
  short_name: string;
  status: string;
  is_demo: boolean;
};

// ---------------------------------------------------------------------------
// Dialog and small shared pieces (part B pages)

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centered dialog over a dimmed page. Escape and the backdrop close it; focus
 * moves in on open, stays inside while open and returns on close; the page
 * behind does not scroll.
 */
export function Dialog({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Read during the first render, before autoFocus moves focus into the dialog.
  const [trigger] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    const back = trigger;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = box.current;
    if (el && !el.contains(document.activeElement)) {
      const auto = el.querySelector<HTMLElement>('[autofocus]');
      (auto ?? el).focus();
    }
    return () => {
      document.body.style.overflow = overflow;
      back?.focus?.();
    };
  }, []);
  const trap = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      className="dialog-back"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        className={`dialog${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={trap}
      >
        <CardHeader
          title={title}
          right={
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </Button>
          }
        />
        {children}
      </div>
    </div>
  );
}

/** The lock line on pages whose opening is written to the audit log (DEC 93). */
export function LoggedNote({ children }: { children?: ReactNode }) {
  return (
    <div className="lock foot-lock">
      <Icon name="lock" /> {children ?? 'Opening this page is logged.'}
    </div>
  );
}

/** One big number with a label under it (header count rows). */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="v">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

/**
 * A list with "Load more": calls `fn` with `args` plus `cursor` (offset int or
 * keyset object, whatever the RPC returned as `next_cursor`) and appends.
 */
export function useLoadMore<T>(fn: string, args: Record<string, unknown>, skip = false) {
  const key = JSON.stringify(args);
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<unknown>(null);
  const [loading, setLoading] = useState(!skip);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (skip) return;
    setLoading(true);
    rpc<{ items: T[]; next_cursor: unknown }>(fn, JSON.parse(key) as Record<string, unknown>)
      .then((d) => {
        setItems(d.items ?? []);
        setNext(d.next_cursor ?? null);
        setError(null);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [fn, key, skip]);
  useEffect(() => {
    reload();
  }, [reload]);
  const loadMore = () => {
    if (next === null || next === undefined) return;
    setMore(true);
    rpc<{ items: T[]; next_cursor: unknown }>(fn, {
      ...(JSON.parse(key) as Record<string, unknown>),
      cursor: next,
    })
      .then((d) => {
        setItems((shown) => [...shown, ...(d.items ?? [])]);
        setNext(d.next_cursor ?? null);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setMore(false));
  };
  return {
    items,
    loading,
    error,
    more,
    hasMore: next !== null && next !== undefined,
    loadMore,
    reload,
  };
}

export type LoadMoreState<T> = ReturnType<typeof useLoadMore<T>>;

/** Loading, error, empty, the rows, and a Load more footer for useLoadMore lists. */
export function MoreList<T>({
  state,
  emptyText,
  rows = 6,
  children,
}: {
  state: LoadMoreState<T>;
  emptyText: ReactNode;
  rows?: number;
  children: (items: T[]) => ReactNode;
}) {
  if (state.error && !state.items.length)
    return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.loading && !state.items.length) return <Loading rows={rows} />;
  if (!state.items.length) return <EmptyState title={emptyText} />;
  return (
    <>
      {children(state.items)}
      {state.hasMore || state.error ? (
        <div className="pager">
          {state.error ? <span className="error">{state.error}</span> : null}
          <span className="spacer" />
          {state.hasMore ? (
            <Button size="sm" disabled={state.more} onClick={state.loadMore}>
              {state.more ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
