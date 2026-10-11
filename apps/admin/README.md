# apps/admin

Vite + React admin console (Cloudflare Pages). Built in S34 (P12-ADM-01), redesigned to the
approved mock `design/admin-redesign-mock.html` (docs/ADMIN_CHECKLIST.md §3).

```bash
pnpm --filter admin dev        # needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (+ VITE_MEDIA_URL for photos,
                               #   VITE_APP_ENV=staging for Settings > Staging tools; never in production)
pnpm --filter admin typecheck
pnpm --filter admin test       # node --test on the pure modules (logic, labels, nav)
pnpm --filter admin build
```

## Layout

| File | What it is |
|---|---|
| `src/main.tsx` | Routes. The root route is the shell, so unknown addresses show "Page not found" inside it. Old addresses (`/users`, `/team`, `/config`, `/banned-words`) redirect. |
| `src/nav.ts` | Sidebar groups (Monitor, People and items, Safety, Setup), icons and badge counts; Settings sections (`SETTINGS_TABS`, `settingsTabs(owner, staging)`) |
| `src/env.ts` | `STAGING`: true only when built with `VITE_APP_ENV=staging` (the staging deploy sets it) |
| `src/shell.tsx` | Fixed 232px sidebar, campus picker, signed-in admin, `NotFoundPage`, `ComingSoon` placeholder |
| `src/session.tsx` | `useWho()`, `useIsOwner()`, `useCampusId()` (sidebar campus, null = all or "mine"), `useSession()` (`campuses`, `counts`, `refreshCounts`) |
| `src/ui.tsx` | UI kit (below) and `useRpc` |
| `src/styles.css` | Design system classes (tokens from `packages/tokens` plus the mock's admin-only shades) |
| `src/labels.ts` | Plain words and pill colors for every database value. Never show a raw enum |
| `src/logic.ts` | Pure helpers (time labels, deltas, sparkline path, paging, form checks) |
| `src/types.ts` | Shapes of the v2 RPCs (docs/API.md §4.1) |
| `src/feed.tsx` | `FeedRow`: one activity event as a sentence |
| `src/search.tsx` | Top bar search (⌘K) through `admin_search` |
| `src/pickers.tsx` | `SearchPicker`: pick one person or listing for a filter (Activity) |
| `src/pages/*.tsx` | One file per page |

## Adding a page

1. Create `src/pages/Thing.tsx` exporting `ThingPage()` that renders one `<Page title crumb actions>`.
   Read the admin and campus with `useWho()` / `useCampusId()`; load data with `useRpc`.
2. Add one line to the route list in `src/main.tsx`: `page('/thing', ThingPage),`
   (params: `page('/thing/$id', ThingDetailPage)` and `useParams({ strict: false })`). Every route
   takes optional string search params (`?tab=offers`): read them with `useSearch({ strict: false })`.
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
| `useLoadMore` / `MoreList` | `fn, args` / `state, emptyText` + render child | lists with "Load more" (offset or keyset `next_cursor`) |
| `Dialog` | `title, onClose, wide?` | dimmed overlay (Add school, Open school) |
| `LoggedNote` | children? | lock line "Opening this page is logged." (DEC 93) |
| `Stat` | `label, value` | header numbers (`.hero .nums`) |

## Pages

| Route | Page | RPCs |
|---|---|---|
| `/activity` | Activity (filters, CSV, Load more, live) | `admin_activity_feed`, `admin_search` |
| `/people/$id?tab=` | One student (timeline, offers, listings, chats, meetups, reports, blocks, access log) | `admin_person` and its tabs |
| `/listings/$id?tab=` | One listing (who swiped, offers, views, price history, reports) | `admin_listing_activity` |
| `/support`, `/support/$id` | Support inbox | `admin_list_support`, `admin_support_detail`, `admin_update_support` |
| `/waitlist` | Waitlist demand, Open school | `admin_waitlist_demand`, `admin_open_campus` |
| `/meetups` | Meetups and who keeps missing | `admin_list_meetups`, `admin_noshow_summary` |
| `/metrics` | plus Ratings and Under-18 attempts cards | `admin_ratings_summary`, `admin_age_blocks_summary` |
| `/campuses?add=1` | Add school dialog | `admin_create_campus` |
| `/settings/data`, `/health`, `/review`, `/blocked-emails`, `/categories` | owner-only Settings sections | see API §4.1 |
| `/settings/staging` | Staging tools (owner, staging builds only): mock data counts, mock bot job, recent actions and failures; "Mock data isn't installed" when the function is missing | `admin_mock_status` (only on staging, from `supabase/campuses/owu-mock.sql`) |

## Phone layout

Under 900px wide the sidebar becomes a top bar with a menu button (the sidebar slides in as a
drawer and closes on navigation, Escape or a tap outside), tables scroll sideways inside their
cards, split views and side-by-side cards stack, and KPI grids wrap to 2 columns. The console is
meant for reading on a phone (checking reports on the go); actions still work but aren't tuned
for touch.

Useful classes: `stack`, `row`, `spacer`, `split` (330px + rest), `grid2`, `grid3`, `form-grid`,
`ev` (list row; `ev col`, `ev sel`), `kv` (definition list), `filters`, `tabs`, `callout`, `quote`,
`bubble`, `note`, `muted`, `ink2`, `strong`, `small`.
