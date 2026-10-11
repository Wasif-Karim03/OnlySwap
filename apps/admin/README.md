# apps/admin

Vite + React admin console (Cloudflare Pages). Built in S34 (P12-ADM-01), redesigned to the
approved mock `design/admin-redesign-mock.html` (docs/ADMIN_CHECKLIST.md §3).

```bash
pnpm --filter admin dev        # needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (+ VITE_MEDIA_URL for photos)
pnpm --filter admin typecheck
pnpm --filter admin test       # node --test on the pure modules (logic, labels, nav)
pnpm --filter admin build
```

## Layout

| File | What it is |
|---|---|
| `src/main.tsx` | Routes. The root route is the shell, so unknown addresses show "Page not found" inside it. Old addresses (`/users`, `/team`, `/config`, `/banned-words`) redirect. |
| `src/nav.ts` | Sidebar groups (Monitor, People and items, Safety, Setup), icons and badge counts |
| `src/shell.tsx` | Fixed 232px sidebar, campus picker, signed-in admin, `NotFoundPage`, `ComingSoon` placeholder |
| `src/session.tsx` | `useWho()`, `useIsOwner()`, `useCampusId()` (sidebar campus, null = all or "mine"), `useSession()` (`campuses`, `counts`, `refreshCounts`) |
| `src/ui.tsx` | UI kit (below) and `useRpc` |
| `src/styles.css` | Design system classes (tokens from `packages/tokens` plus the mock's admin-only shades) |
| `src/labels.ts` | Plain words and pill colors for every database value. Never show a raw enum |
| `src/logic.ts` | Pure helpers (time labels, deltas, sparkline path, paging, form checks) |
| `src/types.ts` | Shapes of the v2 RPCs (docs/API.md §4.1) |
| `src/feed.tsx` | `FeedRow`: one activity event as a sentence |
| `src/search.tsx` | Top bar search (⌘K) through `admin_search` |
| `src/pages/*.tsx` | One file per page |

## Adding a page

1. Create `src/pages/Thing.tsx` exporting `ThingPage()` that renders one `<Page title crumb actions>`.
   Read the admin and campus with `useWho()` / `useCampusId()`; load data with `useRpc`.
2. Add one line to the route list in `src/main.tsx`: `page('/thing', ThingPage),`
   (params: `page('/thing/$id', ThingDetailPage)` and `useParams({ strict: false })`).
3. Add one entry to `NAV` in `src/nav.ts` (`{ to: '/thing', label: 'Thing', icon: 'pulse' }`,
   optional `count` key from `NavCounts`). Replacing a placeholder (`ComingSoon`) is just step 2.

Every user-facing word goes through `labels.ts` (add a map plus a test in `test/labels.test.ts`).
Copy: plain student tone, no em dashes, no emoji, verbs on buttons.

## UI kit (`src/ui.tsx`)

| Component | Props | Notes |
|---|---|---|
| `Page` | `title, crumb?, actions?, children` | 56px top bar with search; content padding 20/24 |
| `Card` | `title?, right?, pad?, className?, label?` | 1px line, 12px radius; `title` adds the header row |
| `CardHeader` | `title, right?` | for custom card layouts |
| `Table` | `columns: (string \| {label, num?, className?})[], compact?, label?`, children `<tr>` | 11.5px light headers, normal-weight cells; `td.num`, `td.actions`, `td.wrap` |
| `Pill` | `tone, label \| children, dot?` | tones: green, red, amber, sky, lilac, peach, neutral |
| `StatusPill` | spread a labels.ts result: `<StatusPill {...userStatus(s)} />` | |
| `Button` | `variant: secondary \| primary \| danger \| ban \| accent \| ghost, size?: 'sm', icon?` | 30px; `ban` (red fill) is for Ban only |
| `Segmented` | `options [{id,label}], value, onChange, label, full?` | |
| `FilterChip` | `label?, icon?`, child `<select>` or `<input>` | "Status  All" chips |
| `Field` | `label, hint?` | label above an input |
| `Switch` | `checked, onChange, label, disabled?` | |
| `Kpi` / `Sparkline` | `label, value, delta?, dir, series?, to?` / `points, dir` | |
| `Bar` | `pct, lime?` | |
| `Avatar` | `initial, seed, photo?, size?: 'lg', me?` | tint fixed per person |
| `PersonCell` | `person {id, display_name, initial?}, sub?, link?` | links to `/people/$id` |
| `ListingCell` | `listing {title, price_cents?, photo?}, size?, showPrice?` | thumbnail via `media(key)` |
| `EventIcon` | `tone, icon` | colored square for activity rows |
| `EmptyState` / `ErrorState` / `Loading` | `title` / `message, onRetry` / `rows` | |
| `Loadable` | `state, empty?, emptyText?, rows?` + render child | skeleton, error with retry, empty |
| `Pager` | `hasPrev, hasNext, onPrev, onNext, info?` | |
| `ReasonActions` | `actions: [{id, label, variant?, run(reason), confirm?, needsExtra?, extra?}]` | one action row with a required reason box; `needsExtra` reveals `extra` (days, until) |
| `ActionButton` | `label, run(reason), kind?, confirm?, size?` | single button that prompts for the reason |
| `downloadCsv(name, csv)` | | with `toCsv` from logic.ts |

Useful classes: `stack`, `row`, `spacer`, `split` (330px + rest), `grid2`, `grid3`, `form-grid`,
`ev` (list row; `ev col`, `ev sel`), `kv` (definition list), `filters`, `tabs`, `callout`, `quote`,
`bubble`, `note`, `muted`, `ink2`, `strong`, `small`.
