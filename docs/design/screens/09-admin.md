# 09 Admin console

[Index: SCREENS.md](../SCREENS.md) | [Design review: DESIGN_REVIEW.md](../DESIGN_REVIEW.md)

Admin is a React + TanStack Router console in `apps/admin`. This file has three parts: (1) the route table, the sign-in screens and the shared UI (`auth.tsx`, `ui.tsx`, `search.tsx`, `pickers.tsx`, `shell.tsx` incl. the routed NotFoundPage), with one reusable entry per control; (2) the `styles.css` token inventory; (3) one entry per page in `pages/*.tsx`, which links to the shared entries instead of repeating them.

## Part 1. Routes, sign-in and shared UI

Covers the shared layer of the admin console, all under `apps/admin/src/`: `main.tsx` (router and mount), `auth.tsx` (sign-in gate), `shell.tsx` (frame, nav, not-found), `ui.tsx` (UI kit, 1090 lines), `search.tsx` (global search), `pickers.tsx` (filter pickers), `session.tsx`, `feed.tsx`, `env.ts`, `nav.ts`, and a note on `labels.ts`/`logic.ts`; styles are in `admin-tokens.md`. The per-page screens (`apps/admin/src/pages/*.tsx`) are covered by the other agent. Admin is a desktop staff tool at `apps/admin` (React + TanStack Router, Supabase RPC). Page-use counts below come from grepping `<Name` and `Name(` in `apps/admin/src/pages/*.tsx` (files / matching lines). Admin copy is hardcoded in the TSX (no strings file); `labels.ts` maps enum values to plain words.

Conventions for the reusable entries (ui, search, pickers, shell): "Route & entry" and "Roles" are not applicable to a component unless stated; every entry gives Source, Variants/props, States, Used by pages, Copy, Notes. Roles for the whole console: staff only, `owner` or `moderator` (`apps/admin/src/logic.ts:12`); the server check is `private.require_admin(min_role default 'moderator', for_campus)` which raises NOT_ADMIN when there is no admins row, MFA is not ok, the rank is too low, or the campus differs (`supabase/migrations/0211_admin_mfa_switch.sql:28-45`).

<a id="09-routes"></a>
## Route table (main.tsx)

Root route is the shell: `createRootRoute({ component: Shell, notFoundComponent: NotFoundPage })` (`apps/admin/src/main.tsx:35`); the router also sets `defaultNotFoundComponent: NotFoundPage` (`main.tsx:108`). `page(path, component)` wraps `createRoute` with a plain-string `validateSearch` (`main.tsx:47-48`). `moved(path, to)` throws a replace redirect in `beforeLoad` (`main.tsx:51-58`). Nav entry column points at `apps/admin/src/nav.ts`.

| Line | Path | Component | File | Nav entry |
|---|---|---|---|---|
| main.tsx:62 | `/` | OverviewPage | pages/Overview.tsx | nav.ts:22 Overview |
| main.tsx:63 | `/activity` | ActivityPage | pages/Activity.tsx | nav.ts:23 |
| main.tsx:64 | `/metrics` | MetricsPage | pages/Metrics.tsx | nav.ts:24 |
| main.tsx:65 | `/waitlist` | WaitlistPage | pages/Waitlist.tsx | nav.ts:25 |
| main.tsx:67 | `/people` | UsersPage | pages/Users.tsx | nav.ts:31 People |
| main.tsx:68 | `/people/$id` | PersonPage | pages/Person.tsx | none (linked from rows) |
| main.tsx:69 | `/listings` | ListingsPage | pages/Listings.tsx | nav.ts:32 (held count, quiet) |
| main.tsx:70 | `/listings/$id` | ListingDetailPage | pages/ListingDetail.tsx | none |
| main.tsx:72 | `/reports` | ReportsPage | pages/Reports.tsx | nav.ts:38 (open_reports count) |
| main.tsx:73 | `/reports/$id` | ReportsPage | pages/Reports.tsx | none |
| main.tsx:74 | `/support` | SupportPage | pages/Support.tsx | nav.ts:39 (support_open, quiet) |
| main.tsx:75 | `/support/$id` | SupportPage | pages/Support.tsx | none |
| main.tsx:76 | `/appeals` | AppealsPage (exported from Reports.tsx, main.tsx:26) | pages/Reports.tsx | nav.ts:40 (appeals_open, quiet) |
| main.tsx:77 | `/quad` | QuadPage | pages/Quad.tsx | nav.ts:41 (quad_held, quiet) |
| main.tsx:78 | `/meetups` | MeetupsPage | pages/Meetups.tsx | nav.ts:42 |
| main.tsx:79 | `/audit` | AuditPage | pages/Audit.tsx | nav.ts:43 Audit log |
| main.tsx:81 | `/campuses` | CampusPage | pages/Campus.tsx | nav.ts:49 |
| main.tsx:82 | `/announcements` | AnnouncementsPage | pages/Announcements.tsx | nav.ts:50 |
| main.tsx:83 | `/settings` | redirect (replace) to `/settings/team` | none | nav.ts:51 Settings |
| main.tsx:84 | `/settings/team` | `<SettingsPage tab="team" />` | pages/Settings.tsx (-> Team.tsx) | settings sub-nav nav.ts:78 |
| main.tsx:85 | `/settings/words` | SettingsPage tab=words | Settings.tsx (-> BannedWords.tsx) | nav.ts:79 Banned words |
| main.tsx:86 | `/settings/switches` | SettingsPage tab=switches | Settings.tsx (-> Config.tsx) | nav.ts:80 App switches |
| main.tsx:87 | `/settings/data` | SettingsPage tab=data | Settings.tsx (-> DataRequests.tsx) | nav.ts:81 owner only |
| main.tsx:88 | `/settings/health` | SettingsPage tab=health | Settings.tsx (-> Health.tsx) | nav.ts:82 owner only |
| main.tsx:89 | `/settings/review` | SettingsPage tab=review | Settings.tsx (-> ReviewAccounts.tsx) | nav.ts:83 owner only |
| main.tsx:90 | `/settings/blocked-emails` | SettingsPage tab=blocked-emails | Settings.tsx (-> BannedEmails.tsx) | nav.ts:84 Banned emails, owner only |
| main.tsx:91 | `/settings/categories` | SettingsPage tab=categories | Settings.tsx (-> Categories.tsx) | nav.ts:85 owner only |
| main.tsx:93 | `/settings/staging` (only if `STAGING`) | SettingsPage tab=staging | Settings.tsx (-> Staging.tsx) | nav.ts:86-92 owner only, staging only |
| main.tsx:95 | `/users` | redirect to `/people` | none | old address |
| main.tsx:96-102 | `/users/$id` | redirect to `/people/$id` with the id | none | old address |
| main.tsx:103 | `/team` | redirect to `/settings/team` | none | old address |
| main.tsx:104 | `/banned-words` | redirect to `/settings/words` | none | old address |
| main.tsx:105 | `/config` | redirect to `/settings/switches` | none | old address |
| main.tsx:35,108 | any other address | NotFoundPage (inside the shell) | shell.tsx:131 | none |

Pages present in `apps/admin/src/pages/` with no direct route of their own: Team, BannedWords, Config, DataRequests, Health, ReviewAccounts, BannedEmails, Categories, Staging (rendered as sections of `SettingsPage` by tab, `pages/Settings.tsx:55-63`), and Ratings (exports `RatingsSection` and `AgeBlocksSection`, mounted inside the Metrics page, `pages/Metrics.tsx:20,207`). `/settings/staging` is built only when `STAGING` is true (`apps/admin/src/env.ts:6`, `main.tsx:93`), otherwise the address falls to "Page not found".

---

## Sign-in gate (auth.tsx)

<a id="09-auth-gate"></a>
### Admin gate (G-LOGIN, P12-ADM-02) and loading branch
- Source: `apps/admin/src/main.tsx:118-121` -> `apps/admin/src/auth.tsx:12-67` (state machine), `GateCard` frame `auth.tsx:70-100`.
- Route & entry: not a route. `AdminGate` is mounted in `createRoot(...).render` before the router: `<AdminGate>{(who, signOut) => <SessionProvider who={who} signOut={signOut}><RouterProvider router={router} /></SessionProvider>}</AdminGate>` (`main.tsx:116-125`). Every URL, including bookmarks, therefore passes the gate first; the router never mounts until `state === 'ok'` (`auth.tsx:66`).
- Purpose: decide which of loading / sign in / not an admin / two-step check / console to show, and end sessions after 8 hours.
- Roles: signed-out visitor -> `login`; signed in but `admin_whoami` says not admin or the RPC failed -> `denied`/`login`; admin without `aal2` -> `mfa`; owner/moderator with `aal2` (or `mfa_required === false`) -> console. Decision function `gate(session, who)` at `apps/admin/src/logic.ts:21-27` (no session -> login; no `who` -> login; `!who.admin` -> denied; `aal !== 'aal2' && mfa_required !== false` -> mfa; else ok). Role type `'owner' | 'moderator'` (`logic.ts:12`).
- Elements: state `'loading' | 'login' | 'denied' | 'mfa' | 'ok'` (`auth.tsx:17`); `refresh()` reads `supabase.auth.getSession()`, compares `onlyswap-admin-signed-in-at` in localStorage via `sessionExpired` (8 h, `logic.ts:4-8`), signs out and returns to `login` when expired (`auth.tsx:20-32`), otherwise loads `admin_whoami` (`auth.tsx:29`); re-runs on `onAuthStateChange` and every 60 s (`auth.tsx:34-42`). `signOut` clears the stamp and signs out (`auth.tsx:44-47`). `GateCard` = `main.gate` > `form|div.gate-card` with logo mark (`.mark.lg`), `h1` title and the fixed line "For the OnlySwap team. Two-step sign-in required." (`auth.tsx:79-98`).
- States: loading = blank `div.gate` with the static logo mark only, `aria-busy="true"` (`auth.tsx:49-54`), no text and no timeout, so a hung `getSession` or RPC shows the mark forever (not handled, no branch found); login -> `EmailLogin` (below); denied -> access-denied card (below); mfa -> `Mfa` (below); ok -> children. Error: a failing `admin_whoami` is swallowed to `null` (`auth.tsx:29`) and shows the sign-in form again with no message (not handled, no branch found for "could not check your access"). Expired session: silently returns to login with no explanation (`auth.tsx:23-27`). Offline / empty / long-content: not handled (no branch found).
- Copy: hardcoded in `auth.tsx` (no strings file): lede `auth.tsx:84`.
- Notes: `.gate` and `.gate-card` styles `styles.css:1322-1353`; card 380px wide, 14px radius, hairline border, no shadow (`styles.css:1330-1340`). The loading branch and every gate card sit on `--a-page` (`styles.css:1328`). Text-node density: 0 (`<Text` not applicable on web); 5 `<p>` in the file.

<a id="09-auth-loading"></a>
### Admin gate: loading branch
- Source: `apps/admin/src/auth.tsx:49-54`.
- Route & entry: shown at first paint of any URL and again whenever `state` is `'loading'`; `refresh` never sets `loading` again after the first resolve (`auth.tsx:20-32`), so it appears once per page load.
- Purpose: hold the screen while the session and `admin_whoami` resolve.
- Roles: all visitors.
- Elements: `div.gate[aria-busy=true]` containing `span.mark.lg` (`auth.tsx:51-53`). No text, no spinner.
- States: loading only; no error/timeout branch (see Admin gate).
- Copy: none.
- Notes: contrast with the app's skeleton rows (`ui.tsx:708-716`); only the logo mark, which is static (no animation in `styles.css:151-176`).

<a id="09-auth-email-login"></a>
### Email sign-in (EmailLogin)
- Source: `apps/admin/src/auth.tsx:102-156`.
- Route & entry: rendered by `AdminGate` when `state === 'login'` (`auth.tsx:55`): first visit, after sign-out, after an 8-hour expiry (`auth.tsx:23-27`), or when `admin_whoami` failed.
- Purpose: staff enter their email, receive a code, and sign in with it.
- Roles: signed-out staff. Not-staff emails: `signInWithOtp` is called with `shouldCreateUser: false` (`auth.tsx:114-117`) so unknown addresses cannot create accounts; the server returns an error that is shown inline.
- Elements: `GateCard` title "Sign in to OnlySwap admin" (`auth.tsx:109`); `label.field` "Email" `input type=email required autoComplete=email` (`auth.tsx:130-139`); when `sent`, `label.field` "Code from your email" with `inputMode=numeric autoComplete=one-time-code required` (`auth.tsx:140-151`); inline `p.error` (`auth.tsx:152`); submit `button.btn.primary` labelled "Send code" or, after sending, "Sign in" (`auth.tsx:153-155`). On code success writes `onlyswap-admin-signed-in-at` and calls `onDone` (= `refresh`) (`auth.tsx:124-127`).
- States: first state "email" (email field + "Send code"); second state "code" (`sent === true`, email stays editable, code field appears, same button becomes "Sign in") (`auth.tsx:105,140`). Loading/pending: not handled (no `busy` flag, the button stays enabled and double submits are possible) (`auth.tsx:110-128`). Error: `errorMessage(err)` in red under the fields, cleared on next submit (`auth.tsx:112,118,123,152`). Success: no confirmation text that the code was sent; the only cue is the new field. No resend, no "wrong email, go back" action, no code-length validation (not handled, no branch found). Disabled state: none.
- Copy: hardcoded `auth.tsx:109,130-154`.
- Notes: the page title and the in-card lede both say OnlySwap but `document.title` is the static "OnlySwap Admin" (`apps/admin/index.html:7`). Primary button uses the shared `.btn.primary` at 36px inside `.gate-card` (`styles.css:1350-1353`). The email is not trimmed before `signInWithOtp` (`auth.tsx:114`).

<a id="09-auth-access-denied"></a>
### Not an admin (access denied)
- Source: `apps/admin/src/auth.tsx:56-64`.
- Route & entry: `AdminGate` when `gate()` returns `denied` (a session exists and `admin_whoami.admin` is false, `logic.ts:24`).
- Purpose: tell a signed-in non-staff user the console is not for them and offer sign-out.
- Roles: signed-in non-admin (for example a student account that knows the URL).
- Elements: `GateCard` title "Not an admin" (`auth.tsx:58`), `p.lede` "This account doesn't have access to the console." (`auth.tsx:59`), `button.btn.primary` "Sign out" calling `signOut` (`auth.tsx:60-62`). The card also repeats the lede "For the OnlySwap team. Two-step sign-in required." (`auth.tsx:84`), which reads wrongly on a denial.
- States: single state. Loading on sign-out: not handled (no busy flag). Error: not handled (sign-out promise has no catch, `auth.tsx:46`). The user's email is not shown, so a person with several accounts cannot tell which one is signed in (not handled, no branch found).
- Copy: hardcoded `auth.tsx:58-61`.
- Notes: this is the only place a revoked admin lands; a revoked admin whose `admin_whoami` RPC throws goes to the sign-in form instead (`auth.tsx:29-31`, `logic.ts:23`), which is inconsistent with this card.

<a id="09-auth-mfa"></a>
### Two-step check and enrollment (Mfa)
- Source: `apps/admin/src/auth.tsx:160-243`.
- Route & entry: `AdminGate` when `gate()` returns `mfa` (`logic.ts:25`): admin, session not at `aal2`, and `mfa_required` not false. Reached right after the email code succeeds, and on every later sign-in.
- Purpose: enroll a TOTP authenticator the first time, or verify a 6-digit code; completing it lifts the session to `aal2`.
- Roles: MFA-pending admin (owner or moderator). The owner can switch the check off (DEC 95, `logic.ts:15`), in which case this step is skipped for everyone (`logic.ts:25`).
- Elements: mount effect lists factors; a verified TOTP factor is reused (`auth.tsx:169-174`); stale unverified TOTP factors are unenrolled first because a duplicate name is refused (`auth.tsx:175-181`); then `mfa.enroll({factorType:'totp', friendlyName:'OnlySwap admin'})` (`auth.tsx:182-191`). Title is "Set up two-step sign-in" when a QR is present, otherwise "Two-step check" (`auth.tsx:197`). Enrollment content: `p.ink2` "Scan this with an authenticator app, then enter the 6-digit code it shows." (`auth.tsx:210-212`), `img.qr` 180px with alt "QR code for your authenticator app" (`auth.tsx:213`, `styles.css:1354-1362`), and when `secret` exists a `muted small` "Can't scan? Type this key into the app instead:" over `code.secret` with `aria-label="Setup key"` (`auth.tsx:214-221`, `styles.css:1363-1372`). Verification-only content: `p.ink2` "Enter the 6-digit code from your authenticator app." (`auth.tsx:224`). Common: `label.field` "Code" numeric one-time-code (`auth.tsx:226-235`), error `p.error` (`auth.tsx:236`), `button.btn.primary` "Verify" (`auth.tsx:237-239`), `button.btn.ghost` "Sign out" (`auth.tsx:240-242`). Submit does `mfa.challenge` then `mfa.verify` and calls `onDone` on success (`auth.tsx:198-206`).
- States: loading: while factors load/enroll the card shows "Two-step check" with the verification text and an enabled "Verify" that silently does nothing when `factorId` is null (`auth.tsx:200`); no spinner (not handled). Enrollment: QR + key. Verify-only: code field. Error: enroll error and verify error shown in `p.error` (`auth.tsx:186,202,204`); a failed challenge returns the error without clearing the code. Pending after submit: not handled (no busy flag). Empty: none. Edge: reload mid-setup re-enrolls and invalidates the old QR (`auth.tsx:175-181`); the setup key is selectable (`user-select: all`, `styles.css:1371`) but there is no copy button; no recovery code path and no "lost my device" help (not handled, no branch found). Code field accepts any length and non-digits (`inputMode` only, `auth.tsx:228-233`).
- Copy: hardcoded `auth.tsx:197-242`.
- Notes: Sidebar later claims "two-step on" for everyone (`shell.tsx:110`), even when the owner switched the check off (`logic.ts:15`).

---

## Shell and nav chrome (shell.tsx, nav.ts)

<a id="09-shell-shell"></a>
### Shell (frame, sidebar, top bar on phones)
- Source: `apps/admin/src/shell.tsx:12-128`; nav data `apps/admin/src/nav.ts:18-54`; styles `styles.css:119-330` (shell) and `styles.css:1758-1955` (under 900px).
- Route & entry: root route component (`main.tsx:35`); wraps every page via `<Outlet />` (`shell.tsx:123-125`). Pages render their own top bar with `<Page>` (`ui.tsx:198-226`).
- Purpose: fixed 232px left sidebar (brand, campus picker, grouped nav with counts, signed-in staff) and the content outlet; under 900px a hamburger drawer.
- Roles: owner sees a campus `<select>` with "All campuses" (`shell.tsx:59-72`); moderator sees their campus name fixed, fallback "Your campus" (`shell.tsx:73-75`). Nav items can be filtered by `ownerOnly` (`shell.tsx:82`) but no item in `NAV` sets it (`nav.ts:18-54`); owner-only pages are gated inside Settings sub-nav (`nav.ts:81-85,90`). Role label from `role()` in `labels.ts:123` ("Owner", "Moderator").
- Elements, nav items (path, label, line in `apps/admin/src/nav.ts`, count badge, gating):
  - Monitor: `/` Overview (`nav.ts:22`); `/activity` Activity (`:23`); `/metrics` Metrics (`:24`); `/waitlist` Waitlist (`:25`). No counts. No role gating.
  - People and items: `/people` People (`:31`); `/listings` Listings (`:32`, count `held_listings`, quiet grey). No role gating.
  - Safety: `/reports` Reports (`:38`, count `open_reports`, red); `/support` Support (`:39`, `support_open`, quiet); `/appeals` Appeals (`:40`, `appeals_open`, quiet); `/quad` Quad (`:41`, `quad_held`, quiet); `/meetups` Meetups (`:42`); `/audit` Audit log (`:43`). No role gating at nav level (the Quad reveal is owner plus `aal2`, `logic.ts:129-131`).
  - Setup: `/campuses` Campuses (`:49`); `/announcements` Announcements (`:50`); `/settings` Settings (`:51`, redirects to `/settings/team`, `main.tsx:83`). Sub-nav (not in sidebar): `SETTINGS_TABS` Team, Banned words, App switches (all staff), Data requests, System health, Review accounts, Banned emails, Categories (owner only), Staging tools (owner and staging build only) (`nav.ts:77-93`, filter `settingsTabs` `:96-98`).
  - Item rendering: `Link` with `aria-current="page"` on the active item; `isActive` treats `/` as exact and others as prefix (`nav.ts:101-104`, `shell.tsx:85-92`); icon + label + optional count `span.c` (`.g` when quiet) with `aria-label="N waiting"` (`shell.tsx:93-99`).
  - Brand: logo mark + "OnlySwap" + `small` "Admin" (`shell.tsx:54-57`, duplicated in the phone bar `shell.tsx:45-48`).
  - Signed-in block `.me`: `Avatar me` with first letter or "?" (`shell.tsx:107`), name or "Admin" (`:109`), `"{Role} · two-step on"` (`:110`), ghost icon `Button` "Sign out" with `aria-label` and `title` (`:112-120`).
  - Phone bar `header.mbar`: ghost menu button with `aria-label` "Open menu"/"Close menu"/"Open menu, N open reports", `aria-expanded`, `aria-controls="admin-side"`, a red dot when `urgent` and closed (`shell.tsx:31-44`); `div.scrim` closes the drawer on click (`:50-52`); Escape and any navigation close it (`:21-27`).
- States: counts null (RPC failed) -> no badges and no error shown (`session.tsx:72`, `shell.tsx:84`); counts of 0 render nothing (`shell.tsx:95`). Loading counts: no skeleton. Campus list empty/failed -> owner select only shows "All campuses" (`session.tsx:57`). No offline state. Reduce motion: drawer transition disabled (`styles.css:1950-1953`). Long campus or staff name: no truncation rule on `.camp select`/`.who-name` beyond `min-width` (not verified, `styles.css:181-207,261-267`). Phone: drawer width `min(300px, 86vw)` (`styles.css:1812`).
- Copy: hardcoded `shell.tsx:36,47,63,65,74,110,116`; labels `nav.ts`.
- Notes: Settings and Appeals items use a second page-level top bar for the title, so the sidebar and the 56px top bar both carry navigation context (`styles.css:286-298`). Count badge uses red for Reports only; 3 of 4 counts are quiet grey (`nav.ts:32,39-41`).

<a id="09-notfoundpage"></a>
### Page not found (NotFoundPage)
- Source: `apps/admin/src/main.tsx:35,108` -> `apps/admin/src/shell.tsx:131-143`.
- Route & entry: any address that matches no route in the table above, including `/settings/staging` on a production build (`main.tsx:92-93`) and typos of old addresses not redirected. Rendered inside `Shell` (root `notFoundComponent`, `main.tsx:35`), plus a router-level default (`main.tsx:108`). Links to it: none; the only link out is "Back to Overview" (`shell.tsx:137-139`).
- Purpose: tell staff the address does not exist and give one way back.
- Roles: any signed-in, MFA-passed staff (it is mounted inside the gate and session, `main.tsx:118-123`). Signed-out visitors never see it; they see the sign-in form for every URL.
- Elements: `<Page title="Page not found">` (top bar h1 + global search + document title "Page not found · OnlySwap admin", `ui.tsx:210-225`); `div.card` > `EmptyState title="There's no page at this address."` (`shell.tsx:135`) > `p.muted` "It may have moved in the new console." (`:136`) > `Link.btn.primary` "Back to Overview" to `/` (`:137-139`).
- States: single static state. Loading/error/empty: not applicable. Edge: a stale `/users` or `/team` address redirects instead (`main.tsx:95-105`); a detail address with a missing id (for example `/people/<unknown>`) does not reach this screen, that is each page's own error state. Sidebar stays visible and nothing in it is highlighted (`isActive` false for all, `nav.ts:101-104`). Phone: same layout under the hamburger bar.
- Copy: hardcoded `shell.tsx:133-138`.
- Notes: "the new console" refers to the first console that was replaced (`main.tsx:50` "bookmarks from the first console"), not meaningful to staff; the two lines say the same thing twice. The card is a bordered box wrapping a centered empty state (`styles.css:1276-1284`).

<a id="09-shell-comingsoon"></a>
### ComingSoon placeholder
- Source: `apps/admin/src/shell.tsx:146-157`.
- Route & entry: exported but not imported by any file in `apps/admin/src/pages` or `main.tsx` (grep found 0 uses); effectively dead code from the build-out.
- Purpose: placeholder page ("Coming in the next step") for pages not yet built.
- Roles: n/a.
- Elements: `Page title crumb` > `div.card` > `EmptyState title="Coming in the next step"` > `p.muted` "This page is being built. Everything else in the console works." (`shell.tsx:149-154`).
- States: static.
- Copy: hardcoded `shell.tsx:151-152`.
- Notes: remove or keep out of the redesign; contains build-process language.

---

## Search (search.tsx)

<a id="09-search-globalsearch"></a>
### GlobalSearch (top bar search, Cmd/Ctrl+K)
- Source: `apps/admin/src/search.tsx:11-123`.
- Route & entry: rendered by `Page` in the top bar of every page that uses `<Page>` (`ui.tsx:218-221`); 16 of the pages use it. Result links go to `/people/$id`, `/listings/$id`, `/reports/$id` (`search.tsx:95,105,113`).
- Purpose: find a person, listing or report across the console with one box.
- Roles: owner or moderator; the RPC `admin_search` decides what each role can see (campus scoping is server-side; not verified in this file).
- Elements: `div.search` > `div.search-box` with `Icon search`, `input type=search` placeholder "Search people, listings, reports", `aria-label` "Search people, listings and reports", and `kbd` "Cmd K" (rendered as the command glyph) (`search.tsx:66-87`); results popover `div.pop[role=listbox][aria-label="Search results"]` (`:89`) with group headings "People" / "Listings" / "Reports" (`:93,103,111`) and rows: person = `Avatar` + name + campus short name + `StatusPill` of `userStatus` (`:96-100`), listing = `ListingCell` + campus short name (`:106-108`), report = `StatusPill` of `reportReason` + `targetType` + `timeAgo` (`:114-117`).
- States (the brief's `search.tsx:88-120` block): popover opens only when `open && q.trim().length >= 2` (`:88`); under 2 characters nothing is searched and nothing is shown, no hint about the 2-character minimum (`:44-49`). Loading: `div.empty` "Searching…" while `!res && !error` (`:91`); on a second query the old results stay until the new ones arrive (no stale indicator). Error: `div.empty.error` with `errorMessage(e)` (`:90`); the error is not cleared when the query changes until a new response arrives (`:53,56`). Empty: `div.empty` `No matches for "{q}"` (`:92`). Results: up to whatever the RPC returns, grouped, no "See all" link (not handled). Debounce 250 ms, query capped to 80 characters (`:50-57`). Keyboard: Cmd/Ctrl+K focuses and opens (`:21-31`), Escape closes and blurs (`:76-81`), clicking outside closes (`:35-41`), route change closes (`:34`); arrow-key navigation and Enter-to-open-first are not handled (no branch found), although the popover has `role="listbox"` and its children are plain links without `role="option"`.
- Copy: hardcoded `search.tsx:82-92`.
- Notes: race: a slow earlier response can overwrite a newer one because requests are not cancelled or tagged (`search.tsx:50-57`). Tab order and `aria-activedescendant` absent. Styles `styles.css:332-406`.

---

## Pickers (pickers.tsx)

<a id="09-pickers-searchpicker"></a>
### SearchPicker (person or listing filter chip)
- Source: `apps/admin/src/pickers.tsx:12-135`; exported type `Picked = { id; label } | null` (`pickers.tsx:10`).
- Route & entry: used by the Activity page filters only (1 file, 2 uses, `pages/Activity.tsx`); no route.
- Purpose: pick one person or one listing through `admin_search` and show the choice as a chip with a clear button.
- Roles: owner or moderator.
- Elements: props `kind: 'people' | 'listings'`, `label`, `value`, `onChange`, `anyLabel` (`pickers.tsx:12-24`). Chip: `span.fchip` > `button.chip-btn[aria-haspopup=listbox][aria-expanded]` "`{label} <b>{value.label or anyLabel}</b>`" and, when a value is set, `button.chip-x` with `aria-label` "Clear {label} filter" and `Icon x` (`:70-90`). Popover `div.pop.picker-pop[role=listbox]` with a `search-box.in-pop` input (placeholder "Type a name" / "Type a listing title", `:100`) and options `button[role=option][aria-selected]` (person: `Avatar` + name + campus; listing: `ListingCell`) (`:107-131`).
- States: closed (chip only); open with fewer than 2 characters -> `div.empty` "Type 2 or more letters." (`:105`); results -> options; no matches -> `div.empty` "No matches." (`:106`); error -> `div.empty.error` (`:104`; the error is not reset when the query is cleared, `:42-45`); loading: no indicator at all (nothing is shown between typing and results; not handled, no branch found). Selected: `aria-selected` styled `styles.css:1516-1518`. Clear: `pick(null)` closes and resets (`:61-65`). Keyboard: input is focused on open (`:57-59`), Escape closes (`:99`); arrow navigation not handled. Outside click closes (`:32-38`). A picked person with no name gets label "No name" (`:114`).
- Copy: hardcoded `pickers.tsx:78,84,100,101,105,106`.
- Notes: duplicates the debounce, error and outside-click logic of `GlobalSearch` (`search.tsx:35-59` vs `pickers.tsx:32-55`). The chip reuses `.fchip` (`styles.css:694-743`) so it matches the other filter chips. Styles `styles.css:1452-1521`.

---

## UI kit (ui.tsx)

All entries: source `apps/admin/src/ui.tsx`; "Used by" = pages files (matching lines) from `apps/admin/src/pages/*.tsx` found with a grep for `<Name` or `Name(`. Class styles are in `apps/admin/src/styles.css`. Anchor is `09-ui-<lowercase export name>`.

### Data helpers

<a id="09-ui-userpc"></a>
#### useRpc (hook)
- Source: `ui.tsx:15-35`; companion type `RpcState<T>` `ui.tsx:37-42`.
- Variants/props: `(fn, args?, skip = false)` returns `{ data, error, loading, reload }`. Args are JSON-stringified into a key so inline objects do not retrigger (`:16`).
- States: loading starts true unless `skip` (`:19`); success clears error (`:24-27`); error keeps the old `data` and stores `errorMessage(e)` (`:28`); `reload` sets loading but keeps the previous data (`:22`). No cancel or stale-response guard (not handled, no branch found).
- Used by pages: 23 files, 37 lines (Audit, Announcements, BannedWords, Campus, DataRequests, BannedEmails, Health, ListingDetail, Config, Overview, Listings, Meetups, Reports, Metrics, Person, Support, ReviewAccounts, Quad, Ratings, Users, Waitlist, Staging, Team).
- Copy: none (error text comes from `errorMessage`, `logic.ts`).
- Notes: not visual; its state is what `Loadable` renders.

<a id="09-ui-loadable"></a>
#### Loadable (loading / error / empty / content)
- Source: `ui.tsx:45-63`.
- Variants/props: `state` (RpcState), `empty?(d) => boolean`, `emptyText?` (default "Nothing here right now."), `rows = 4`, render-prop `children(d)`.
- States, in order: error -> `ErrorState` with "Try again" bound to `reload` (`:58`; the error wins even when old data exists, so a failed refresh replaces the content); first load -> `Loading rows` skeleton (`:59`); `data === null` after a skip -> renders nothing (`:60`); empty -> `EmptyState` (`:61`); else content (`:62`). Pending/disabled/result: not applicable.
- Used by pages: 22 files, 31 lines (BannedWords, Announcements, Audit, DataRequests, BannedEmails, Campus, Meetups, Quad, Health, Config, Metrics, Users, Ratings, Listings, Overview, ListingDetail, Waitlist, Reports, Person, ReviewAccounts, Team, Support).
- Copy: `ui.tsx:61`.
- Notes: the one place that decides how every list loads, fails and is empty, so the redesigned state copy lands here once.

<a id="09-ui-money"></a>
#### money
- Source: `ui.tsx:65-67` (wraps `moneyLabel`, `logic.ts`). `media` below.
- Variants/props: `(cents) => string`.
- States: handles null/undefined via `moneyLabel`.
- Used by pages: 0 files (no page imports `money`; pages that show money use `moneyLabel` or `ListingCell`). Dead export.
- Copy: none. Notes: remove or keep for tests (`apps/admin/test/logic.test.ts:343` tests `moneyLabel`).

<a id="09-ui-media"></a>
#### media
- Source: `ui.tsx:69-71` (reads `VITE_MEDIA_URL`, `mediaUrl(MEDIA, key)`).
- Variants/props: `(key) => url`; returns '' when there is no media host.
- States: empty key or missing env -> '' so `Avatar`/`ListingCell` fall back to the initial/grey tile (`:370-374,438-445`).
- Used by pages: 1 file, 2 lines (Quad). Also used internally by Avatar and ListingCell.
- Copy: none. Notes: in a build without `VITE_MEDIA_URL` all photos silently become placeholders.

<a id="09-ui-icon"></a>
#### Icon
- Source: `ui.tsx:76-189` (34 line icons in the `ICONS` map, `:76-176`; `Icon` `:178-189`); styles `svg.i` `styles.css:268-277` (16px, 1.8 stroke).
- Variants/props: `name: IconName` (from `labels.ts:350`), `size?` px override.
- States: decorative (`aria-hidden`), inherits `currentColor`. No state variants.
- Used by pages: 3 files, 4 lines directly (Activity, Quad, Reports); used inside Shell, Button, Dialog, LoggedNote, FilterChip, EventIcon, GlobalSearch, SearchPicker.
- Copy: none. Notes: icons carry no text; any icon-only control must provide `aria-label` itself (Shell does, `shell.tsx:116`).

### Page frame

<a id="09-ui-page"></a>
#### Page
- Source: `ui.tsx:194-226`; styles `.top` `styles.css:286-330`, `.content` `:322`.
- Variants/props: `title`, `crumb?`, `actions?` (right of the search), `children`. Sets `document.title` to "{title} · OnlySwap admin" (`:210-212`).
- States: none of its own; always renders `GlobalSearch` (`:219`). Phone: top bar becomes the page header under the `.mbar` (`styles.css:1767+`).
- Used by pages: 16 files, 17 lines (Activity, Listings, Person, Meetups, Quad, Settings, Campus, Users, Metrics, ListingDetail, Overview, Announcements, Audit, Waitlist, Support, Reports); also NotFoundPage and ComingSoon.
- Copy: `ui.tsx:211`.
- Notes: "every page renders exactly one Page" is the documented rule (`ui.tsx:196`); pages that live in sections (Settings tabs, Ratings inside Metrics) share the parent's Page.

<a id="09-ui-card"></a>
#### Card
- Source: `ui.tsx:228-254`; styles `.card` `styles.css:470-481`.
- Variants/props: `title?`, `right?`, `children`, `className?`, `pad?`, `label?`. Renders `section.card.clip` with `aria-label` from the string title (`:246-249`).
- States: none (container). Hairline border, 12px radius, no shadow (`styles.css:470-475`).
- Used by pages: 25 files, 53 lines.
- Copy: none. Notes: this is the hairline card the redesign wants; a card header uses `CardHeader`.

<a id="09-ui-cardheader"></a>
#### CardHeader
- Source: `ui.tsx:256-271`; styles `.ch` `styles.css:482-508`.
- Variants/props: `title` (string -> `h2`, else node), `right?`, `className?`.
- States: none. 50px minimum height, wraps (`flex-wrap`).
- Used by pages: 0 files directly; used by Card and Dialog.
- Copy: none. Notes: `.ch h3` is styled but this component only emits `h2` (`styles.css:497-501`).

<a id="09-ui-table"></a>
#### Table (and `Column` type)
- Source: `ui.tsx:273-309`; styles `.table-wrap` `styles.css:840`, `table.t` `:843-886`, `.compact` `:1423`.
- Variants/props: `columns: (Column | string)[]` where `Column = { label, num?, className? }` (`:273`), `className?`, `label?` (aria-label), `compact?` (12px side padding). Children are `<tr>` rows.
- States: no loading/empty/error of its own (wrapped by Loadable/MoreList). Row hover `--a-hover`; `tr.click` pointer (`styles.css:870-875`). Cells do not wrap (`white-space: nowrap`, `:861`) so long names push a horizontal scroll inside `.table-wrap` (`:841`).
- Used by pages: 21 files, 40 lines.
- Copy: none. Notes: 11.5px grey headers, 9px row padding, hairline row separators.

### Pills, avatars, people and items

<a id="09-ui-pill"></a>
#### Pill
- Source: `ui.tsx:314-332`; styles `.pill` `styles.css:745-794`.
- Variants/props: `tone: green | red | amber | sky | lilac | peach | neutral` (default neutral; `Tone` `labels.ts:6`), `label` or children, `dot = true`, `title?`.
- States: tone only. Dot via `::before` (`styles.css:756-766`). Colour is the only difference between tones; no text prefix, so tone alone carries meaning.
- Used by pages: 10 files, 20 lines (DataRequests, Quad, Announcements, Campus, Metrics, Staging, Overview, Person, ReviewAccounts, Team).
- Copy: none. Notes: 6 coloured tones; lilac and peach are used for Quad/demo/posted (`labels.ts:43,161,309,388`).

<a id="09-ui-statuspill"></a>
#### StatusPill
- Source: `ui.tsx:334-338`.
- Variants/props: spreads `Labeled` (`{label, tone}`) from a labels.ts mapper, `dot = true`. Returns null when `label` is empty (`:336`).
- States: hidden when no label.
- Used by pages: 19 files, 45 lines; also GlobalSearch (`search.tsx:100,114`).
- Copy: from `labels.ts`. Notes: the main way status is shown, always a coloured pill.

<a id="09-ui-eventicon"></a>
#### EventIcon
- Source: `ui.tsx:340-347`; styles `.ico` `styles.css:797-837`.
- Variants/props: `tone`, `icon`. Decorative.
- States: tone only.
- Used by pages: 3 files, 3 lines (Activity, ListingDetail, Person); FeedRow (`feed.tsx:15`).
- Copy: none. Notes: coloured square tile plus icon per event kind.

<a id="09-ui-avatar"></a>
#### Avatar
- Source: `ui.tsx:349-377`; styles `.av` `styles.css:888-923`.
- Variants/props: `initial?`, `seed?` (hash -> one of 5 tints, `:349-353,369`), `photo?`, `size?: 'lg'`, `me?` (accent fill, used for the signed-in staff, `shell.tsx:107`).
- States: photo (`img`, `alt=""`) when `media(photo)` is non-empty (`:370-371`), else the first letter uppercased or "?" (`:373-375`). Always `aria-hidden`/empty alt.
- Used by pages: 2 files, 2 lines (Person, Team); also Shell, FeedRow, PersonCell, GlobalSearch, SearchPicker.
- Copy: none. Notes: the 5 tints use lime, lilac, peach, sky and grey backgrounds (`styles.css:905-920`).

<a id="09-ui-personcell"></a>
#### PersonCell (and `PersonRef` type)
- Source: `ui.tsx:379-418`; styles `.who` `styles.css:924-940`.
- Variants/props: `person: PersonRef | undefined` (`{ id, display_name, initial?, avatar_path? } | null`), `sub?`, `link = true`.
- States: missing person -> muted "Deleted account" (`:396`); null name -> "No name" (`:397`); link to `/people/$id` or plain `span` (`:411-417`). Banned/suspended state is not shown here (callers add a pill).
- Used by pages: 11 files, 23 lines (Activity, BannedEmails, ListingDetail, DataRequests, Reports, Ratings, Support, Meetups, Quad, Person, Users).
- Copy: `ui.tsx:396-397`. Notes: "Deleted account" appears in 3 places with the same words (`ui.tsx:396`, `feed.tsx:12`).

<a id="09-ui-listingcell"></a>
#### ListingCell (and `ListingRef` type)
- Source: `ui.tsx:420-452`; styles `.item`, `.th` `styles.css:941-968`.
- Variants/props: `listing: ListingRef | null | undefined` (`{ id?, title, price_cents?, photo? }`), `size?: 'lg'`, `showPrice = true`.
- States: none -> muted "None" (`:437`); no photo -> grey tile (`:443-445`); lazy-loaded image with empty alt (`:442`); price shown only when present (`:447`). Sold/held/removed state is not shown here.
- Used by pages: 4 files, 6 lines (Activity, ListingDetail, Listings, Person); also FeedRow, GlobalSearch, SearchPicker.
- Copy: `ui.tsx:437`. Notes: title is not truncated here (`.item .t1`, `styles.css:962`, not verified for ellipsis).

### Controls

<a id="09-ui-button"></a>
#### Button (and `ButtonVariant`)
- Source: `ui.tsx:457-485`; styles `.btn` `styles.css:564-625`.
- Variants/props: `variant: 'secondary' | 'primary' | 'danger' | 'ban' | 'accent' | 'ghost'` (`:457`); `size?: 'sm'` (26px vs 30px default); `icon?: IconName`; `type = 'button'`; passes through every button prop. secondary = white with hairline, primary = ink fill with `--color-bg` text, danger = red text, ban = red fill with white text ("Ban only", `:459`), accent = pistachio fill, ghost = transparent (`styles.css:579-610`).
- States: hover (soft fill; primary 0.88 opacity), disabled 0.45 opacity with default cursor (`styles.css:616-620`), `.on` selected (soft fill + ink border, `:621-624`), focus via the global `:focus-visible` 2px sky ring (`styles.css:70-73`). No built-in loading/pending indicator or label change; pages pass `disabled={busy}`. No pressed state besides hover.
- Used by pages: 20 files, 48 lines. `variant="accent"`: 0 uses found in pages (dead variant).
- Copy: none. Notes: 30px high on desktop is below a 44px target (acceptable for a mouse-first tool; the phone bar menu is 44px, `styles.css:1787-1791`).

<a id="09-ui-segmented"></a>
#### Segmented (and `SegOption`)
- Source: `ui.tsx:487-519`; styles `.seg` `styles.css:627-657`.
- Variants/props: `options: {id,label}[]`, `value`, `onChange`, `label` (aria), `full?`.
- States: selected via `aria-checked` and `.on`; `role="radiogroup"/"radio"` but arrow-key behaviour of a radio group is not implemented (each is a tab stop button) (`:504-515`). No disabled state.
- Used by pages: 10 files, 12 lines (Announcements, Meetups, Quad, Metrics, ListingDetail, Reports, Support, Person, Listings, Overview).
- Copy: none. Notes: also `.tabs` exist for page tabs (`styles.css:658-683`) that are not a component here.

<a id="09-ui-filterchip"></a>
#### FilterChip
- Source: `ui.tsx:521-538`; styles `.fchip` `styles.css:694-743`.
- Variants/props: `label?`, `icon?`, `children` (a native `select` or `input`).
- States: focus-within border (`styles.css:733`); inner native outline removed (`:729-731`); no active-filter marker, no clear button (the picker chip has one).
- Used by pages: 7 files, 22 lines (Activity, BannedWords, Audit, Metrics, Meetups, Users, Support).
- Copy: none. Notes: also the base style of `SearchPicker`.

<a id="09-ui-field"></a>
#### Field
- Source: `ui.tsx:540-559`; styles `.field` `styles.css:1157-1197`.
- Variants/props: `label`, `hint?`, `children`, `className?`. Wraps a `label` so the control is implicitly labelled.
- States: no error, required or disabled styling of its own; error text is added by pages with `p.error`. Inputs: 34px, 8px radius, hairline border (`styles.css:1176-1186`); disabled gets a soft fill (`:1194-1197`).
- Used by pages: 12 files, 57 lines (BannedWords, Quad, Campus, BannedEmails, Categories, ReviewAccounts, Person, Reports, Team, Announcements, Waitlist, Support); the sign-in cards use a raw `label.field` (`auth.tsx:130,141,226`).
- Copy: none. Notes: the sign-in form uses the same `.field` class but not the component.

<a id="09-ui-switch"></a>
#### Switch
- Source: `ui.tsx:561-584`; styles `.switch` `styles.css:1241-1273`.
- Variants/props: `checked`, `onChange(next)`, `label` (aria), `disabled?`.
- States: off (grey `--color-line2`), on (ink fill), disabled 0.5 opacity; `role="switch"` with `aria-checked`; knob moves with a `--motion-tap` transition and no reduce-motion override (`styles.css:1262`). No pending state: the page must disable it while saving.
- Used by pages: 2 files, 2 lines (Activity, Config).
- Copy: none. Notes: on-state is ink, not accent.

<a id="09-ui-pager"></a>
#### Pager
- Source: `ui.tsx:586-613`; styles `.pager` `styles.css:1375-1381`.
- Variants/props: `hasPrev`, `hasNext`, `onPrev`, `onNext`, `info?`. Returns null when both disabled and no info (`:600`).
- States: Previous/Next disabled via `Button disabled`; no loading state.
- Used by pages: 8 files, 8 lines (BannedWords, Announcements, DataRequests, BannedEmails, Audit, Quad, Listings, Users).
- Copy: "Previous", "Next" (`ui.tsx:606,609`). Notes: MoreList uses a "Load more" pager instead (`ui.tsx:1078-1086`).

### KPI and charts

<a id="09-ui-sparkline"></a>
#### Sparkline
- Source: `ui.tsx:618-640`; styles `.spark` `styles.css:1085-1104`.
- Variants/props: `points: number[]`, `dir: up | down | flat`, `width = 120`, `height = 30`. Decorative (`aria-hidden`), path from `sparkPath`.
- States: stroke colour by direction (green/red/grey). Empty `points` handled by `Kpi` (`series.length`), not here.
- Used by pages: 0 directly; only through `Kpi` (`ui.tsx:665`).
- Copy: none. Notes: no text alternative; the delta line carries the meaning.

<a id="09-ui-kpi"></a>
#### Kpi
- Source: `ui.tsx:642-675`; styles `.kpi` `styles.css:1035-1084`.
- Variants/props: `label`, `value`, `delta?`, `dir`, `series?`, `to?` (renders a `Link.card.kpi`, otherwise a div).
- States: delta coloured up/down (`:663`); no loading skeleton or error (parents decide); link variant hover (`styles.css:1058`).
- Used by pages: 4 files, 20 lines (Health, DataRequests, Staging, Overview).
- Copy: none. Notes: green/red deltas plus a sparkline per card.

<a id="09-ui-bar"></a>
#### Bar
- Source: `ui.tsx:677-684`; styles `.bar` `styles.css:1105-1120`.
- Variants/props: `pct` (clamped 0-100), `lime?` (accent fill instead of ink).
- States: decorative (`aria-hidden`); the number must sit next to it.
- Used by pages: 6 files, 7 lines (Health, ListingDetail, Metrics, Ratings, Person, Waitlist).
- Copy: none. Notes: `lime` is the only prop name that carries the colour, but the colour is `--color-accent` (pistachio by default); `Health.tsx:87` uses the accent fill when DB usage is under 80% and ink otherwise; a `.bar-warn` wrapper turns the fill red (`styles.css:1754-1756`).

### States

<a id="09-ui-emptystate"></a>
#### EmptyState
- Source: `ui.tsx:689-696`; styles `.state` `styles.css:1276-1291`.
- Variants/props: `title`, `children?` (hint or action).
- States: `role="status"`; centered column, 28px vertical padding, grey text, 650-weight ink title.
- Used by pages: 14 files, 26 lines (Activity, Categories, Campus, DataRequests, Health, ListingDetail, Overview, Ratings, Settings, Reports, Person, Staging, Support, Team); also Loadable, MoreList, NotFoundPage, ComingSoon.
- Copy: default via Loadable "Nothing here right now." (`ui.tsx:61`).
- Notes: centered text; no icon.

<a id="09-ui-errorstate"></a>
#### ErrorState
- Source: `ui.tsx:698-705`.
- Variants/props: `message`, `onRetry?` (shows a secondary `Button` "Try again").
- States: `role="alert"`, red title (`styles.css:1289-1291`). The message is the raw `errorMessage(e)`.
- Used by pages: 4 files, 4 lines (Activity, Categories, Overview, Staging); also Loadable and MoreList.
- Copy: "Try again" (`ui.tsx:702`). Notes: no hint about what to do besides retry.

<a id="09-ui-loading"></a>
#### Loading
- Source: `ui.tsx:707-716`; styles `.skel`, `.skel-rows` `styles.css:1292-1315`.
- Variants/props: `rows = 4`; widths step down 90/73/56/39/90 (%) (`:712`).
- States: `aria-busy` + `aria-label="Loading"`; shimmering gradient bar (`linear-gradient`, `styles.css:1296`) stopped under reduce motion (`:1305-1309`). No delay before showing (flashes on fast loads).
- Used by pages: 5 files, 5 lines (Activity, Categories, ListingDetail, Staging, Overview); also Loadable and MoreList.
- Copy: none. Notes: the shimmer is the only gradient in the admin CSS.

### Actions (reason, confirmation, pending, result)

<a id="09-ui-actionbutton"></a>
#### ActionButton (single action with prompt)
- Source: `ui.tsx:721-784`.
- Variants/props: `label`, `run(reason)`, `onDone?`, `kind?: ButtonVariant`, `needsReason = true`, `confirm?` (OK/Cancel text), `size?`, `reasonPrompt?` (`:726-747`).
- States / flow: click -> optional `window.confirm(confirm)` (`:757`) -> `window.prompt(reasonPrompt ?? "{label}: reason (saved to the audit log)")` when a reason is needed (`:758-760`) -> Cancel on the prompt (null) aborts silently (`:761`) -> fewer than 3 characters after trim sets the message "Add a reason of at least 3 characters." (`:762-765`) -> busy: button disabled, no spinner, label unchanged (`:755,766`) -> success sets "Done" and calls `onDone` (`:770-771`) -> error shows `errorMessage` (`:773`) -> result is an inline `span.toast` styled green via the global `.ok` class or red via `.error` (`:781`, `styles.css:96-101,1316`). The result never times out; "Done" is compared by string (`:781`).
- Used by pages: 8 files, 12 lines (BannedEmails, Campus, BannedWords, Listings, Quad, Person, ReviewAccounts, Team).
- Copy: `ui.tsx:759,763,771`.
- Notes: the reason and the confirmation are native browser dialogs (`window.confirm`, `window.prompt`): unstyled, cannot show context (which person, which listing, what will happen), cannot validate before submit, and are blocked or auto-dismissed in some embedded browsers. Candidate for replacement by `Dialog` plus a reason field (see `rev-09a.md`).

<a id="09-ui-reasonactions"></a>
#### ReasonActions (moderation reason box, ui.tsx:804-883) and `ReasonAction` type
- Source: `ui.tsx:786-886` (type `ReasonAction` `:786-797`).
- Variants/props: `actions: { id, label, variant?, run(reason), confirm?, extra?, needsExtra? }[]`, `onDone?(id)`, `placeholder` default "Reason (required, saved to the audit log)" (`:807`).
- States / flow: one text input shared by all action buttons (`:848-855`). Click an action: if `needsExtra` and not yet picked, it only reveals `extra` (for example days or an until-date) and clears any message (`:820-824`); else reason under 3 trimmed characters -> red message "Add a reason of at least 3 characters." (`:825-828`) without running; then `window.confirm(a.confirm)` when set (`:829`, validation happens before confirmation); busy: every action button disabled, no spinner and no label change (`:830,861`); success: message "Done" in green (`p.ok[role=status]`), reason cleared, picked cleared, `onDone(id)` (`:834-837,879-883`); error: red `errorMessage`, reason kept so it can be retried (`:838-839`). Second step row when an action with `extra` is picked: `extra` input + primary "Confirm {action label lowercased}" + ghost "Cancel" (`:868-878`). The picked action button is highlighted with `.on` (`:861`). The result line has no auto-dismiss, so a stale "Done" stays while the reason box is already empty for the next action.
- Used by pages: 3 files, 4 lines (Person, Reports (twice: reports and appeals), ListingDetail). The doc comment names "Reports and person pages" (`:800`) and omits ListingDetail.
- Copy: `ui.tsx:807,827,853,872,874`.
- Notes: the destructive buttons (for example Ban) sit in the same row as harmless ones with only colour as a difference (`variant` passthrough `:859`); the required reason is stated three ways (placeholder, aria-label, message) with slightly different wording. Reason min length 3 is validated client side and also on the server (`supabase/migrations/0208_admin_v2_tools.sql:28`).

<a id="09-ui-downloadcsv"></a>
#### downloadCsv
- Source: `ui.tsx:888-896`.
- Variants/props: `(name, csv)` makes a Blob and clicks a temporary link; file name `{name}-{YYYY-MM-DD}.csv` (UTC date).
- States: no feedback after the click; no error handling.
- Used by pages: 3 files, 3 lines (Activity, Audit, Users).
- Copy: none. Notes: the object URL is revoked immediately after click (`:895`), which works in current browsers but is racy.

### Campuses, dialog and small pieces

<a id="09-ui-campusselect"></a>
#### CampusSelect (and `CampusOption` type)
- Source: `ui.tsx:898-937`; type `CampusOption = { id, name, short_name, status, is_demo }` (`:901-907`).
- Variants/props: `campuses`, `value`, `onChange`, `allLabel?` (adds a "" option), `label = 'Campus'`. Demo campuses get " (demo)" (`:931`).
- States: none beyond native select. Moderators only get their own campus back from the RPC (`:909`).
- Used by pages: 0 files (the sidebar uses its own inline select, `shell.tsx:60-72`; `CampusOption` type is used by `session.tsx:7`). Dead component.
- Copy: `ui.tsx:915`. Notes: duplicate of the Shell campus select.

<a id="09-ui-dialog"></a>
#### Dialog
- Source: `ui.tsx:942-984`; styles `.dialog-back`, `.dialog` `styles.css:1682-1702`.
- Variants/props: `title`, `onClose`, `children`, `wide?` (760px vs 560px).
- States: Escape (window keydown) and a mousedown on the backdrop close it (`:954-964`); `role="dialog"`, `aria-modal`, `aria-label` (`:967-970`); header with a ghost close button, `aria-label` "Close" (`:972-978`). Not handled (no branch found): focus moves into the dialog, focus trap, focus return to the trigger, body scroll lock; backdrop is `rgba(20,20,16,0.32)` (`styles.css:1685`); the effect re-subscribes every render unless `onClose` is stable (`:954-958`).
- Used by pages: 2 files, 2 lines (Campus, Waitlist).
- Copy: "Close" `ui.tsx:975`. Notes: this is the shared modal; the reason prompts do not use it (see ActionButton).

<a id="09-ui-loggednote"></a>
#### LoggedNote
- Source: `ui.tsx:986-993`; styles `.lock`, `.foot-lock` `styles.css:525-531,1664-1667`.
- Variants/props: `children?` (default "Opening this page is logged." DEC 93).
- States: static lock icon + text.
- Used by pages: 4 files, 4 lines (Activity, ListingDetail, Support, Person).
- Copy: `ui.tsx:990`. Notes: the audit notice at the bottom of sensitive pages.

<a id="09-ui-stat"></a>
#### Stat
- Source: `ui.tsx:995-1003`.
- Variants/props: `label`, `value`.
- States: none. Styled by parent (`.hero .nums` `styles.css:1558-1572`).
- Used by pages: 1 file, 6 lines (Person).
- Copy: none. Notes: unclassed markup, styling depends on the parent container.

<a id="09-ui-useloadmore"></a>
#### useLoadMore (hook) and `LoadMoreState`
- Source: `ui.tsx:1005-1056`.
- Variants/props: `(fn, args, skip)` returns `{ items, loading, error, more, hasMore, loadMore, reload }`; calls the RPC with `cursor` and appends (`:1031-1044`).
- States: initial loading, error (shared field: a load-more failure sets `error` while keeping items, `:1042`), `more` while appending, `hasMore` from `next_cursor`.
- Used by pages: 3 files, 8 lines (Meetups, Person, Support).
- Copy: none. Notes: a load-more error is shown in the footer by MoreList and never cleared until `reload` (`:1025`).

<a id="09-ui-morelist"></a>
#### MoreList
- Source: `ui.tsx:1058-1090`.
- Variants/props: `state` (LoadMoreState), `emptyText`, `rows = 6`, render-prop `children(items)`.
- States: error with no items -> `ErrorState` + retry (`:1070-1071`); first load -> `Loading` (`:1072`); empty -> `EmptyState` (`:1073`); footer with inline error text and `Button` "Load more" that shows "Loading…" and is disabled while appending (`:1077-1086`).
- Used by pages: 3 files, 8 lines (Meetups, Person, Support).
- Copy: `ui.tsx:1083`. Notes: uses an ellipsis character "…" in "Loading…" (same as search.tsx:91).

---

## Feed row, session, env, nav, labels, logic (no screens of their own)

<a id="09-feed-feedrow"></a>
### FeedRow (feed.tsx)
- Source: `apps/admin/src/feed.tsx:10-47`. One activity event row: `EventIcon`, `Avatar`, person link, "and {other}" for `deal_done`, verb from `eventVerb`, listing link, relative time with the full date in `title` (`:14-45`). Used by Overview only (1 file). Gone accounts read "Deleted account" (`:12`). Row layout uses inline styles (`:17,33`).

<a id="09-infra-session"></a>
### SessionProvider and hooks (session.tsx)
- Source: `apps/admin/src/session.tsx:34-104`. No UI. Holds `who`, `signOut`, `campusId`, campus list (`admin_list_campuses`, once per sign-in, `:51-58`) and sidebar counts (`admin_overview_v2`, every 60 s, `:60-79`). Roles: `owner` picks a campus saved in localStorage key `onlyswap-admin-campus` (`:32,44-46`) ('' = all campuses); `moderator` is locked to `who.campus_id` (`:49,81-85`); `useIsOwner` = role is `owner` (`:101`); `useCampusId` returns null for "all" or "mine" (`:104`). Count failures leave `counts = null` silently (`:72`).

<a id="09-infra-main"></a>
### main.tsx
- Source: `apps/admin/src/main.tsx:1-126`. Entry point: imports `styles.css` (`:1`), builds the router (route table above), mounts `<StrictMode><AdminGate>...<SessionProvider>...<RouterProvider>` (`:116-125`). No UI.

<a id="09-infra-env"></a>
### env.ts
- Source: `apps/admin/src/env.ts:1-6`. `STAGING = import.meta.env.VITE_APP_ENV === 'staging'`; gates the `/settings/staging` route and tab (`main.tsx:93`, `nav.ts:86-92`). No UI, and nothing in the shell marks a staging build to staff (no banner found).

<a id="09-infra-nav"></a>
### nav.ts
- Source: `apps/admin/src/nav.ts:1-104`. Sidebar groups (`NAV`), Settings sub-nav (`SETTINGS_TABS`, `settingsTabs`), `isActive`. No UI; entries listed under Shell above.

<a id="09-infra-labels"></a>
### labels.ts and logic.ts
- Source: `apps/admin/src/labels.ts` (743 lines): enum-to-plain-words maps, tones and icon names (`Tone` `:6`, `role()` `:123`, `IconName` `:350`); `apps/admin/src/logic.ts` (1042 lines): `gate`, `sessionExpired`, `canReveal`, CSV, time helpers. No screens. Unit tests live in `apps/admin/test/` (labels, logic, nav, pages).

## Part 2. Styles and tokens

<a id="09-styles-tokens"></a>
## Admin styles and tokens (apps/admin/src/styles.css, 1955 lines)

All line numbers are `apps/admin/src/styles.css` unless a path is given. Light-only console; one stylesheet, imported once from `apps/admin/src/main.tsx:1`.

### 1. Relationship to packages/tokens

- The file imports the shared tokens: `@import '@onlyswap/tokens/tokens.css';` (`styles.css:6`). The package exports `./tokens.css` -> `packages/tokens/dist/tokens.css` (`packages/tokens/package.json` exports). The admin therefore does not duplicate token values; it reads `--color-*` variables (for example `var(--color-ink)` `:40`, `var(--color-line)` `:128`, `var(--color-red)` `:97`).
- It uses only the color slice of the package. Count of `var(--space-`, `var(--radius-`, `var(--type-` in the file: 0. Every spacing, radius and font size is a literal. Only motion is used: `var(--motion-tap)` for the switch knob (`:1262`).
- Header comment says admin-only shades come "from the mock (light console only)" (`:9`).
- Dark mode: `tokens.css` ships a `prefers-color-scheme: dark` block on `:root:not([data-theme='light'])` and a `[data-theme='dark']` block (`packages/tokens/dist/tokens.css:63-119`). styles.css has no `prefers-color-scheme` rule of its own (only `prefers-reduced-motion` at `:1305` and `:1950`). The console pins light with `<html data-theme="light">` (`apps/admin/index.html:2`), so the dark block never applies. If that attribute were removed the page would break: the 9 admin-only variables below have light literals only and are used 54 times (`var(--a-` count), for example the page background `:39`, the sidebar hover `:230`, table row hover `:871`, skeleton `:1296`, so dark ink would sit on a near-white page.
- The accent comes from the package default (`--color-accent: #C8E27D`, pistachio, `tokens.css:27`; text on it `--color-onAccent #111110`, `:28`).

### 2. Custom properties defined in styles.css (`:root`, lines 8-25)

| Property | Value | Line | Category | Equivalent package token and drift |
|---|---|---|---|---|
| `--a-page` | `#fbfbf9` | 10 | color | page background (`:39`, `.gate` `:1328`); package `--color-bg` is `#FFFFFF`, `--color-bg2` `#F3F3F0`. Not in package. |
| `--a-soft` | `#f4f4f0` | 11 | color | soft fill (21 uses); nearest `--color-bg2 #F3F3F0` (one step off) |
| `--a-soft2` | `#ecece6` | 12 | color | deeper soft fill (6 uses); nearest `--color-bg3 #E8E8E3` (4 steps off) |
| `--a-hover` | `#fafaf7` | 13 | color | row hover (2 uses, `:871,:999`); no package equivalent |
| `--a-lime50` | `#f4f9e4` | 14 | color | selected-row tint (1 use, `:1720`); derived from pistachio `#C8E27D`, not in package |
| `--a-lime100` | `#e6f1c4` | 15 | color | avatar tint and a pill (2 uses `:811,:907`); derived from pistachio |
| `--a-limeInk` | `#4f6a0c` | 16 | color | text on lime100 (1 use `:812`); not in package |
| `--a-shadow` | `0 1px 2px rgba(0,0,0,.08)` | 17 | shadow | 1 use (segmented selected pill, `:648`); package elevation `soft` is y8 blur24 opacity .12 (`tokens.json` elevation) |
| `--a-pop` | `0 12px 32px rgba(0,0,0,.14)` | 18 | shadow | popovers, dialog, phone drawer (3 uses `:382,:1698,:1821`); close to elevation `soft` but y12 blur32 opacity .14 |
| `--a-font` | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif` | 19-21 | typography | package stacks are `-apple-system, system-ui, sans-serif` (`tokens.css:43-57`) |
| `--a-mono` | `ui-monospace, 'SF Mono', Menlo, monospace` | 22 | typography | no package equivalent |
| `--a-side` | `232px` | 23 | layout | sidebar width (`:127`, `:280`) |
| `--a-top` | `56px` | 24 | layout | top bar height (`:290`) |

Raw hex outside `:root` (lines 8-25): 0. Raw `rgba(...)` outside `:root`: 3, namely the switch knob shadow `rgba(0,0,0,0.2)` (`:1261`) and the dialog/drawer scrim `rgba(20,20,16,0.32)` (`:1685`, `:1838`); package `--color-overlay` is `rgba(0,0,0,0.45)` (light) and 0.6 (dark) and is unused. Other literal colors: none (all other colors are `var(--color-*)`).

### 3. Package tokens the admin consumes (resolved light values)

Compared against `packages/tokens/tokens.json` (color.light/dark) and `packages/tokens/dist/tokens.css`. Because the stylesheet imports the generated file, light and dark values match `tokens.json` exactly (spot check of all 24 color keys: bg `#FFFFFF`/`#0C0C0D`, line `#E6E6E1`/`#28282B`, ink `#111110`/`#F3F3EF`, red `#C8321C`/`#FF5A40`, etc., identical in both files). No value mismatches. The drift is conceptual:

| Item | Admin | Package | Note |
|---|---|---|---|
| Body font size | 13.5px (`:37`) | body 16px, label 14, meta 12.5 (`tokens.json` type) | desktop density; no package token used |
| Page title | 16px/700 (`:299-304`) | title 26/800, heading 20/700 | |
| Gate title | 20px/750 (`:1341-1345`) | heading 20/700 (specWeight 750) | matches heading |
| Card radius | 12px (`:473`) | card 18, thumb 12 | admin = thumb value |
| Control radius | 8px (`:566`, `:1181`) | control 15 | admin deliberately smaller |
| Spacing | 4/5/6/8/9/10/12/14/16/24/28px literals | xs4 sm8 md12 lg16 xl24 2xl32 | no token use |
| Shadow | `--a-pop` only on floating layers | elevation soft | one custom shadow |
| Touch size | buttons 30px/26px (`:565`, `:612`), inputs 34px (`:1183`) | hit 44, buttonM 44, buttonS 36 | mouse-first; phone menu 44px (`:1788-1790`) |

### 4. Colors in use

Package colors used by the console: `bg`, `line`, `line2`, `ink`, `ink2`, `ink3`, `red`/`redBg`, `green`/`greenBg`, `amber`/`amberBg`, `sky`/`skyBg`, `peach`/`peachBg`, `lilac`/`lilacBg`, `accent`/`onAccent`, `onPhoto`. Notable:
- Accent use (9 places): logo mark dot (`:166`), `.btn.accent` (`:598-602`, no page uses it), own avatar (`:922`), `.bar.lime i` (`:1118`), chart columns (`:1144`), split bar (`:1651`), dot (`:1661`), heat strip (`:1630`).
- Purple: `--color-lilac` (`#5B45C4`, bg `#ECE7FF`) drives `.pill.t-lilac` (`:783-786`), `.ico.t-lilac` (`:826-829`) and avatar tint `.av.c1` (`:909-911`). Used for "Calls out a student", "Review demo", "Posted announcement", "Posted" (`labels.ts:43,161,309,388`).
- Peach: pills and avatar tint (`:787-790`, `:830-833`, `:912-914`).
- Gradients: 1, the skeleton shimmer (`:1296`). Glass/blur: none (no `backdrop-filter`, no `blur`).

### 5. Recurring component rules

| Component | Rules (line) | Key values |
|---|---|---|
| Buttons | `.btn` `:564-578`; `.primary` `:582-589`; `.danger` `:590`; `.ban` `:593`; `.accent` `:598`; `.ghost` `:603-610`; `.sm` `:611`; disabled `:616-620`; `.on` `:621` | 30px (26px sm), 8px radius, 12.5px/600, hairline `--color-line2`; primary = ink fill; ban = red fill |
| Segmented / tabs / filter chips | `.seg` `:627-657`; `.tabs` `:658-683`; `.filters` `:684`; `.fchip` `:694-743` | |
| Tables | `.table-wrap` `:840`; `table.t` `:843`; th `:847` (11.5px/600, ink3); td `:856` (9px 16px, nowrap); hover `:870`; compact `:1423` | hairline row borders |
| Cards | `.card` `:470` (12px radius, 1px line); `.card.pad` `:476`; `.ch` header `:482` (min 50px); `.cb` `:509`; `.cf` `:512`; `.callout` `:532`; `.quote` `:548`; `.bubble` `:556` | no shadow |
| Badges / pills | `.pill` `:745-766` (11.5px/650, 6px radius, 6px dot); tones `:767-794`; `.ico` tiles `:797-837`; sidebar count `.nav .c` `:237-249` | six colored tones + neutral |
| Forms | `.field` `:1157`; `:where(input, select, textarea)` `:1176-1186` (34px, 8px radius); textarea `:1187`; disabled `:1194`; `.check` `:1206`; `.reason` `:1236`; `.counter` `:1228`; `.switch` `:1241-1273` | 13.5px/500 |
| Nav | `.side` `:124-135`; `.brand` `:136`; `.camp` `:177-207`; `.nav a` `:218-236` (13.5px, 8px radius, active = soft fill + 650 weight); `.grp` `:212`; `.me` `:250-267`; phone `.mbar`, drawer `:1767-1955` | 232px |
| Search and popover | `.search` `:332-364`; `.pop` `:374-406` (12px radius, `--a-pop` shadow); picker `:1452-1521` | |
| Modal / dialog | `.dialog-back` `:1682-1692` (scrim `rgba(20,20,16,.32)`); `.dialog` `:1693-1699` (560px, 14px radius, `--a-pop`); `.wide` `:1700` | no border |
| Toasts | `.toast` `:1316-1319` (12.5px/600 only; colour comes from the global `.ok`/`.error` text classes `:96-101`); no floating toast/snackbar exists, results are inline | |
| States | `.state` `:1276-1291`; `.skel` `:1292-1299` (gradient, `:1305` reduce motion); `.skel-rows` `:1310` | |
| Sign-in | `.gate` `:1322`; `.gate-card` `:1330` (380px, 14px radius, 28px pad); `.qr` `:1354`; `.secret` `:1363` | |
| Pager | `.pager` `:1375` | |
| KPI / charts | `.kpis` `:1036-1051`; `.kpi` `:1052-1084`; `.spark` `:1085`; `.bar` `:1105`; `.bars` `:1121`; `.cols` `:1134`; `.heat` `:1622`; `.funnel` `:1602`; `.split-bar` `:1639` | |

Breakpoints: 1280px (`:1047`), 1180px (`:458`, `:1586`), 899px phone layout (`:1767`, `:1950`). Reduced motion: skeleton (`:1305`) and drawer (`:1950`) handled; switch knob transition is not (`:1262`).

### 6. Scales actually in use (counts of literals)

- Border radius: 6px x9, 8px x6, 50% x6, 12px x6, 10px x4, 9px x3, 7px x3, 4px x2, 14px x2, 5px x1, 2px x1, 11px x1: 12 distinct values.
- Font size: 12px x13, 12.5px x8, 13px x5, 11.5px x4, 13.5px x3, 24px x2, 20px x2, 11px x2, 22px x1, 21px x1, 18px x1, 16px x1, 15px x1, 14px x1: 14 distinct values.
- Weights seen: 400, 500, 600, 650, 700, 750, 800.

## Part 3. Pages

Covers the 26 page files in apps/admin/src/pages (React + TanStack Router; routes in apps/admin/src/main.tsx:62-105). Nine settings sections and the Ratings block are rendered inside other pages (Settings.tsx:55-63, Metrics.tsx:20) and are entered as their own sub-entries. Shared controls are described in 09a. Only the client code was read: RPC bodies and server-side role enforcement were not read, so "Roles" lines describe client gates only.

<a id="09-page-overview"></a>
### Overview (/)
- Source: apps/admin/src/main.tsx:62 -> apps/admin/src/pages/Overview.tsx:32-103 (KPI strip :105-171, needs-attention list :173-212, live activity card :218-270)
- Route & entry: `/`, no params. Nav entry "Overview" (home icon), group Monitor, apps/admin/src/nav.ts:22, rendered by the sidebar loop at apps/admin/src/shell.tsx:75-102. In-page links out: KPI cards to /people (:127), /listings (:142), /reports (:167); needs-attention rows to /reports/$id (:187), /listings, /quad, /appeals (:177-179, :199); "See all activity" to /activity (:264). The 404 page links back here (shell.tsx:139).
- Purpose: Staff landing page. Six live numbers, what is waiting for a decision, a campus table and the last 10 events.
- Roles: Owner and moderator both see it. No client gate. Scope: the sidebar campus (`useCampusId`, Overview.tsx:33; owner picks any or "All campuses", moderator is pinned to their own campus, session.tsx:50, :104). Server enforces via `admin_overview_v2` (:35) and `admin_activity_feed` (:221); RPC bodies not read in this slice.
- Elements:
  - Page title "Overview" with crumb = campus name or "All campuses" (:44, :36) via [Page](#09-ui-page); the top bar also carries [GlobalSearch](#09-search-globalsearch).
  - KPI strip, 6 [Kpi](#09-ui-kpi) tiles with sparkline: Students (:121), Active today (:129), Listings live (:136), Offers today (:144), Deals done (7 d) (:151), Open reports (:158). Three tiles link (`to=`), three are static (:129, :144, :151).
  - Card "Needs attention" with a right-hand "N open" count (:59-65) via [Card](#09-ui-card); rows are report links (reason [StatusPill](#09-ui-statuspill), target type and campus, age :186-195), queue links with an amber [Pill](#09-ui-pill) "N items" (:196-203), a non-link row "N requests / Support requests waiting" (:204-209).
  - Card "Campuses": [Table](#09-ui-table) compact, columns Campus, Status, Students, Live, Deals 7 d (:74-95), status as [StatusPill](#09-ui-statuspill) (:88).
  - Card "Live activity" with a green "Live" [Pill](#09-ui-pill) (:236), a [Segmented](#09-ui-segmented) filter from FEED_FILTERS (:240-245), up to 10 `FeedRow` rows (feed.tsx, outside this slice, :257-259), footer link button "See all activity" (:263-266).
- States:
  - Loading: KPI area shows [Loading](#09-ui-loading) 2 rows inside a card (:52-54); each card uses [Loadable](#09-ui-loadable) with 3 or 8 skeleton rows (:67, :72, :251).
  - Empty: Needs attention "All clear. Nothing is waiting." (:183); Campuses default "Nothing here right now." (Loadable default, ui.tsx:61 and Overview.tsx:72); Live activity "No activity yet." (:253).
  - Error: KPIs show [ErrorState](#09-ui-errorstate) with "Try again" (:45-48); the two cards show the same through Loadable (ui.tsx:58). Activity card has its own RPC and fails separately.
  - Populated: :49-50, :255-261.
  - Pending/refresh: auto reload every 60 s (:38-41) and every 20 s for activity (:226-229); `Loadable` keeps old data while reloading (ui.tsx:59 only shows skeleton when data is null), so there is no refresh indicator other than the static "Live" pill.
  - Destructive confirms: none on this page (read only).
  - Result feedback: not applicable.
- Copy: Inline strings, no strings file (admin has none; labels live in apps/admin/src/labels.ts and logic.ts). Page-specific: Overview.tsx:44, :60, :71, :81, :122-158 (KPI labels), :177-179, :183, :207, :236, :253, :265. Delta text from `deltaLabel` and `ageLabel` (logic.ts).
- Notes: Delta strings are built with a regex fix-up (`ageLabel(...).replace(/(\d+)([mhd])/, '$1 $2')`, :163) and a hard-coded "+" prefix even for 0 ("+0 this week", :124, :139). "Open reports" tile uses `dir="down"` whenever any are open (:166), i.e. red for a count that is not a trend. Top-level states for KPIs are written inline rather than via Loadable (:45-55), so the KPI strip is the only area that does not use the shared pattern. No inline styles, no raw colors. Text density: about 6 literal text nodes plus 6 KPI labels and 4 card titles; 3 cards and one strip on one screen.

<a id="09-page-activity"></a>
### Activity (/activity)
- Source: apps/admin/src/main.tsx:63 -> apps/admin/src/pages/Activity.tsx:46-287 (KindPicker, also exported and reused by Person, :290-370)
- Route & entry: `/activity`; optional search params `user`, `user_name`, `listing`, `listing_name` pre-fill the person and listing pickers (:50-59). Nav entry "Activity" (pulse icon), apps/admin/src/nav.ts:23. Inbound: Overview "See all activity" (Overview.tsx:264). No other file in apps/admin/src links with the `user` or `listing` params (grep found none), so the deep-link inputs are currently unused.
- Purpose: Full searchable stream of student actions (swipes, offers, searches, deals, and so on), newest first, with filters and CSV export; message text is never shown (comment :41-45, note :281-284).
- Roles: Owner and moderator. Gate: the Campus filter shows for owner only (:143); moderators are pinned by the session (session.tsx:50). Filtering by a person writes a profile view to the audit log on the server (comment :42-44, shown to the user at :210-214). RPC: `admin_activity_feed` (:88, :113).
- Elements:
  - [Page](#09-ui-page) title "Activity", crumb "Every action, every student" (:124-125); action [Button](#09-ui-button) "CSV" (:127-138), disabled with no rows, exports only the rows loaded so far.
  - Filter bar (:141-209): KindPicker "Type" popover with grouped checkboxes (:290-370; indeterminate group boxes :339-341; footer "With nothing picked you see everything except cards shown in the deck." :363-365), owner Campus select ([FilterChip](#09-ui-filterchip)), two [SearchPicker](#09-pickers-searchpicker) (people "Anyone", listings "Any"), Time select (ACTIVITY_RANGES) and From and To date inputs when custom (:169-197), an inline count "N events shown, more to load" (:199-203) and a [Switch](#09-ui-switch) "Live" (refresh every 20 s) (:204-207).
  - Logged note when a person is picked (:210-214) via [LoggedNote](#09-ui-loggednote).
  - [Card](#09-ui-card) with a [Table](#09-ui-table) "Activity": Time, Student ([PersonCell](#09-ui-personcell)), Action ([EventIcon](#09-ui-eventicon) plus label, "with {name}" link for deals), Listing ([ListingCell](#09-ui-listingcell) link, or the search query, or "None"), Details, Device (:224-268). Footer pager row "N events loaded" and "Load more" (:269-277).
  - Footer note about retention (:281-284).
- States:
  - Loading: [Loading](#09-ui-loading) 10 rows only when nothing is shown yet (:218-219); "Loading" text in the count (:200-201). Not via Loadable (hand-written state machine :64-98).
  - Empty: "No activity matches these filters." (:221); no clear-filters action.
  - Error: [ErrorState](#09-ui-errorstate) with Try again (:216-217). A load-more failure sets the same page-level error and replaces the whole table (:118, :216), losing the loaded rows from view.
  - Populated: :222-279.
  - Pending: Load more shows "Loading…" and disables (:273-274); a stale-response guard drops results whose filter key changed (:81-82, :90).
  - Live mode: silent reload every 20 s without a skeleton (:84-87, :104-108); no "updated at" stamp.
  - Destructive confirms: none (read only).
- Copy: Inline; labels from labels.ts (`ACTIVITY_GROUPS`, `eventKind`, `eventDetails`, `platform`). Activity.tsx:124-125, :158-165, :200-206, :212, :221, :226, :274, :281-283, :316, :364.
- Notes: Four inline styles (:198, :204, :239, :330). The "live" switch label is the aria-label while the visible label is just "Live" (:205-206). Overview's Live activity card (Overview.tsx:218) and this page both own a copy of the kinds/limit RPC call logic. `Time` default 'today' (:60). The filter bar mixes FilterChip selects, a popover picker and two search pickers on one row. Text density: about 8 literal text nodes, 6 column headers, 6 filter controls.

<a id="09-page-metrics"></a>
### Metrics (/metrics)
- Source: apps/admin/src/main.tsx:64 -> apps/admin/src/pages/Metrics.tsx:118-212 (KPI strip :214-321, TargetKpi :323-357, funnel :359-409, day columns :412-470, retention :473-518, liquidity :520-593, safety :595-645)
- Route & entry: `/metrics`, no params. Nav entry "Metrics" (chart icon), apps/admin/src/nav.ts:24. No inbound links from other pages.
- Purpose: Product health against the first-semester targets: eight target tiles, daily activity chart and funnel, retention by sign-up week, liquidity by week, safety and reliability by week, plus ratings and age-check blocks (embedded from Ratings.tsx).
- Roles: Owner and moderator, no client gate. Campus comes from the sidebar (`useCampusId`, :119); "All campuses" adds up every real campus and leaves out the demo one on the server (comment :113-116). RPCs: `admin_metrics_funnel` (:125), `admin_metrics_retention` (:130), `admin_metrics_liquidity` (:133), `admin_metrics_safety` (:134), plus `admin_ratings_summary` and `admin_age_blocks_summary` in Ratings.tsx. Server enforces (not read).
- Elements:
  - [Page](#09-ui-page) title "Metrics", crumb "{campus} · {from} to {to}" (:141-144).
  - Date range form: From and To date inputs in [FilterChip](#09-ui-filterchip)s, [Button](#09-ui-button) "Show range" (disabled on error), inline error text, hint "Campus follows the picker in the sidebar. Targets are the first-semester goals from the PRD." (:145-177). The range is a draft that applies on submit (:121-123, :150).
  - Target tile grid, 8 tiles (:254-319): Deals last week, Activation, Day 7 retention, Listing to first offer, Sold within 14 days, No-show rate, Reports per 100 deals, Time to resolve a report (p90). Each tile is a hand-built `.card.kpi` with label, big value, a green "On target" / red "Below target" / neutral "No data" [Pill](#09-ui-pill) plus the target text and a note (:340-355). It is not the shared [Kpi](#09-ui-kpi).
  - Card "Daily activity" with a [Segmented](#09-ui-segmented) series switch (Sign-ups, Activated, Offers, Accepted, Meetups, Deals), an inline SVG column chart with an `aria-label` summary and a native `<details>` "Show the numbers per day" table, then the "Funnel" bars ([Bar](#09-ui-bar)) over 7 stages and a note on how activation is counted (:359-409, :412-470).
  - Card "Retention by sign-up week": [Table](#09-ui-table) Cohort, Students, Day 1, Day 7, Day 30 with tinted cells via `color-mix` of `--color-accent` (:473-487), "Too early" when not eligible (:474), note (:512-515).
  - Card "Liquidity by week": three hand-styled summary numbers (font-size 18, weight 750 inline, :525-542), table of 8 columns with a bar, note (:587-590).
  - Card "Safety and deal reliability by week": 8-column table; values that miss the target turn red via `Flag` (:647-655), note (:639-642).
  - Embedded `RatingsSection` and `AgeBlocksSection` (:207-208, see [Metrics: ratings and age-check blocks](#09-page-ratings)); closing note "Crash-free sessions (target 99.5%) live in Sentry, not here." (:209).
- States:
  - Loading: tiles show "…" as the value while data is null (:257, :265, :273, :281, :289, :297, :313; reports tile shows "n/a" instead, :305); cards use [Loadable](#09-ui-loadable) with 5 or 6 skeleton rows (:190, :197, :203, :366).
  - Empty: retention and safety lists use the Loadable default "Nothing here right now." (:190, :203, ui.tsx:61); liquidity "Nothing here yet." (:521); chart "No activity in this range." (:413); ratings and age-block empties in Ratings.tsx.
  - Error: each card shows ErrorState with Try again via Loadable (ui.tsx:58). The tile strip reads only `.data` (:180-183) and never the error, so a failed query leaves its tile at "…" with no message or retry.
  - Populated: :254-319 and the cards.
  - Pending: changing the range reloads the funnel (key change in useRpc); old data stays shown (ui.tsx:59), no pending hint. Invalid range: "Show range" disabled and the message from `rangeError` (:123, :169-172).
  - Destructive confirms: none (read only).
- Copy: Inline strings; targets text from logic.ts `TARGETS`, `targetLabel`. Metrics.tsx:104-109, :143, :170, :173-176, :256-317, :346, :363, :368-376, :388, :399-401, :454, :512-514, :527-540, :545-552, :587-589, :600-607, :639-641.
- Notes: Most text-dense admin page after Person: 4 explanatory notes of 2 to 3 lines, 3 table headers of 8 columns, 8 target tiles with 3 pieces of text each. 15 inline styles (e.g. :187, :343, :351, :399, :512, :525-541). Green and red pills on target tiles and red numbers in tables encode pass/fail by colour; the tile also spells it out ("On target" / "Below target"), the table cells do not (`Flag` is colour only plus a hover title, :649). A raw design-token reference `var(--color-accent)` via inline `color-mix` is the only colour computed in JS (:481). Text density: about 21 literal text nodes plus 8 tile labels.

<a id="09-page-ratings"></a>
### Metrics: ratings and age-check blocks (embedded in /metrics)
- Source: apps/admin/src/main.tsx:64 (via Metrics.tsx:20, :207-208) -> apps/admin/src/pages/Ratings.tsx:8-97 (RatingsSection), :100-154 (AgeBlocksSection)
- Route & entry: no route of its own; two cards at the bottom of /metrics. No nav entry.
- Purpose: Surface low-rated sellers and recent thumbs-down ratings, and a compliance count of people blocked by the age check.
- Roles: Owner and moderator; scope = sidebar campus passed as prop (Metrics.tsx:207). RPCs `admin_ratings_summary` (Ratings.tsx:9) and `admin_age_blocks_summary` with `days: 30` (:101); server enforces.
- Elements:
  - Card "Ratings" with a right-hand summary "N thumbs up · N thumbs down · P% up" (:13-23) via [Card](#09-ui-card). Two columns: "Low-rated students" with hint "3+ ratings, under 70% up" ([Table](#09-ui-table) Student/Up/Status with [Bar](#09-ui-bar), [PersonCell](#09-ui-personcell), [StatusPill](#09-ui-statuspill); :28-56) and "Recent thumbs down" with hint "Latest 20" (About, From, Why, When; :58-91).
  - Card "Age-check blocks" with right-hand "N in 30 days · N all time" (:106-115), two compact tables By campus and By day (first 10 days only, :137), note about hashed emails (:148-151).
- States:
  - Loading: [Loadable](#09-ui-loadable) 5 rows (:24) and 3 rows (:116-118).
  - Empty: "Nobody is under 70% up." (:54), "No thumbs down yet." (:89), "Nobody was blocked by the age check in the last 30 days." (:120). Ratings has no page-level empty when both lists are empty (each column shows its own message).
  - Error: ErrorState with Try again via Loadable.
  - Populated / pending / destructive: read only, none.
- Copy: Inline. Ratings.tsx:14, :18-19, :29-30, :54, :59-60, :66, :82, :89, :107, :111, :120, :124-135, :149-150.
- Notes: Wording says "thumbs up/down" while the product term elsewhere is ratings (see P5 in the review); ten inline styles (:26-28, :39-41, :58, :76, :123, :148). Low-rated students are not linked to their person page (PersonCell may link; ui.tsx:387 not read here). By-day list silently truncates to 10 rows (:137). Text density: about 10 literal text nodes, 4 tables.

<a id="09-page-waitlist"></a>
### Waitlist (/waitlist)
- Source: apps/admin/src/main.tsx:65 -> apps/admin/src/pages/Waitlist.tsx:18-135 (open-school dialog :137-208)
- Route & entry: `/waitlist`, no params. Nav entry "Waitlist" (school icon), apps/admin/src/nav.ts:25. Outbound: "Add as school" navigates to /campuses with search `add=1&domain=...&name=...` (Waitlist.tsx:105-109), read by Campus.tsx.
- Purpose: Sign-up demand by school email domain, so the owner can see which school to open next, open a waitlist campus, or add a school that is not a campus yet.
- Roles: Page visible to owner and moderator (no gate); both action buttons are owner-only: "Open school" `owner && s.campus?.status === 'waitlist'` (:96) and "Add as school" `owner && !s.campus` (:101). RPCs: `admin_waitlist_demand` (:22), `admin_open_campus` (:182); server enforces (not read; whether moderators receive all schools is a server decision).
- Elements:
  - [Page](#09-ui-page) title "Waitlist", crumb "N requests waiting" or "Demand by school" (:26-31).
  - Intro note, three lines (:32-35).
  - [Card](#09-ui-card) > [Table](#09-ui-table) "Demand by school": School, Email domain (mono), Status ([StatusPill](#09-ui-statuspill) or "Not a campus yet"), Requests, Waiting students, Toward opening ([Bar](#09-ui-bar) lime with "n/threshold", or "Opened by hand", or "N so far"), Newest, actions (:44-119).
  - Dialog "Open {campus}?" via [Dialog](#09-ui-dialog) (:151): two paragraphs, Reason field ([Field](#09-ui-field)), message, Cancel or Close and primary "Open school" (:152-205).
- States:
  - Loading: [Loadable](#09-ui-loadable) 6 skeleton rows (:37-39).
  - Empty: "Nobody is waiting for a school yet." (:41).
  - Error: ErrorState with Try again via Loadable.
  - Populated: :43-120.
  - Pending: the dialog's primary button disables while busy (:174); no busy label.
  - Destructive confirm: the dialog is the confirm; it states "This is the same step as reaching the threshold. It can't be undone from here (pause the campus instead)." (:157-160) and requires a reason of 3+ characters (`reasonError`, :176).
  - Result: success text "{campus} is open. N students let in." in the dialog, buttons switch to Close (:185-188, :169-171); the list reloads and nav counts refresh (:127-130). Known error `INVALID:status` -> "This campus is not on the waitlist." (:194).
- Copy: Inline. Waitlist.tsx:29, :32-34, :41, :47-54, :62-63, :71, :89-90, :98, :112, :151, :154-160, :187, :194, :202.
- Notes: Dialog uses a centered modal with a dimmed backdrop (ui.tsx Dialog :943-985) while destructive actions elsewhere use `window.confirm` or `window.prompt`: no single confirm pattern. Inline styles at :76, :78, :79. Table has 8 columns, two of which (Requests, Waiting students) are both counts needing the intro note to decode. Text density: about 8 literal text nodes, 8 column headers.

<a id="09-page-users"></a>
### People list (/people)
- Source: apps/admin/src/main.tsx:67 -> apps/admin/src/pages/Users.tsx:78-260
- Route & entry: `/people`, no params; old address `/users` redirects here (main.tsx:95). Nav entry "People" (users icon) apps/admin/src/nav.ts:31. Inbound: Overview "Students" tile (Overview.tsx:127); GlobalSearch results (search.tsx, outside this slice). Row click goes to /people/$id (Users.tsx:221-224).
- Purpose: Searchable, filterable, sortable table of every student with status, counts and last activity, exportable as CSV.
- Roles: Owner and moderator. Gates: the search box accepts "Name or exact email" for owner, only "Name" for moderator (Users.tsx:137-138); the Campus filter shows for owner only (:152); a moderator is pinned to their campus by the session (session.tsx:50). The email under the name (`sub={u.email}`, :227) is whatever `admin_list_users_v2` returns; whether it is masked for moderators is decided on the server (RPC body not read; the person page falls back to `email_masked`, Person.tsx:238).
- Elements:
  - [Page](#09-ui-page) title "People", crumb "N students" (:101-103); top-right action [Button](#09-ui-button) "CSV" (down icon), disabled with no rows (:105-122), calls [downloadCsv](#09-ui-downloadcsv) with 12 columns (:62-75).
  - Filter form (:125-192): search [FilterChip](#09-ui-filterchip) with a text input (:132-141); selects Status (:142), Campus (owner only, :152), Year (:170), Sort (Last active, Newest, Name, Most reported; :55-60, :180); a visually hidden submit button "Search" (:189).
  - [Card](#09-ui-card) > [Table](#09-ui-table) "Students", 10 columns: Student ([PersonCell](#09-ui-personcell) with email sub), Status ([StatusPill](#09-ui-statuspill)), Campus, Year, Swipes, Offers, Deals, Reports (red when above 0, :238), Joined, Last active (platform in the title attribute, :241) (:202-246). Whole row is clickable (`tr.click`, :218-225).
  - [Pager](#09-ui-pager) "a to b of N", Previous and Next, step 50 (:247-253).
- States:
  - Loading: [Loadable](#09-ui-loadable) 8 skeleton rows (:195-196).
  - Empty: "No students match these filters." (:198); no "clear filters" action.
  - Error: [ErrorState](#09-ui-errorstate) with Try again via Loadable.
  - Populated: :200-255.
  - Pending: changing a filter resets cursor to 0 and re-fetches (:94-97); old rows stay while loading (Loadable shows skeleton only when data is null, ui.tsx:59), so there is no pending hint on filter change.
  - Destructive confirms: none (read only). CSV button is the only action; it exports the current page of at most 50 rows, not the full filtered set (:112), with no label saying so.
  - Result: not applicable.
- Copy: Inline strings, labels from labels.ts (USER_STATUS_OPTIONS, YEAR_OPTIONS, classYear, platform). Lines Users.tsx:56-59, :103, :121, :137-138, :143-161, :198, :205-214.
- Notes: The file imports many unused symbols (Link, ActionButton, ReasonActions, Avatar, appealStatus, listingStatus, changeEmailError, etc., :1-51); leftovers from a split with Person.tsx. Whole-row click plus a link check (`closest('a')`, :222) is mixed with PersonCell, which may itself be a link, so two targets per row. Inline style once (`width: 170`, :139). No raw colors. Text density: about 5 literal text nodes, 10 column headers, 5 filters.

<a id="09-page-person"></a>
### Person (/people/$id)
- Source: apps/admin/src/main.tsx:68 -> apps/admin/src/pages/Person.tsx:89-148 (header :153-277, side column :282-361, change email :364-420, tabs :425-906)
- Route & entry: `/people/$id`, search param `tab` (timeline default, offers, listings, chats, meetups, reports, blocks, access) read with `useSearch` (:91-92); old `/users/$id` redirects (main.tsx:96-101). No nav entry of its own (the People item stays active, nav.ts:101 `isActive` prefix match). Inbound: People row click (Users.tsx:223); Reports "Open profile" (Reports.tsx:319); Person "Invited by" link to another person (:336); GlobalSearch.
- Purpose: One student's file: status and account actions, counts, history in eight tabs, tastes, active hours, account facts. Opening it and each tab is written to the audit log by the server (header comment :83-88, `LoggedNote` :358).
- Roles: Owner and moderator see the page. Client gates: Ban button only for owner and only when not already banned (:203); "Change school email" card only for owner (:357); Pause and Suspend date field `max` is 7 days for a moderator (`maxUntil`, :156, :170) with the hint "Moderators can pause or suspend for up to 7 days." (:164). RPCs: `admin_person` (:95), `admin_set_user_status` (:179), `admin_force_reverify` (:201), `admin_change_email` (:380), `admin_clear_strike` (:775), plus list RPCs per tab; server enforces roles and the 7-day cap (not read here).
- Elements:
  - [Page](#09-ui-page) title "People" with crumb "/ name" (:99). No back link to the list other than the sidebar.
  - Header card (:219-275): [Avatar](#09-ui-avatar) lg, name, [StatusPill](#09-ui-statuspill), class-year [Pill](#09-ui-pill) neutral, staff-role Pill "lilac" (:233), facts line "campus, email, joined date, last seen on platform (version)" (:236-244), pause or status reason line (:245-250), six [Stat](#09-ui-stat) numbers: Swipes, Saves, Offers, Deals, Rating, Reports on them (:252-268).
  - Account actions row via [ReasonActions](#09-ui-reasonactions) (:185-214, :272): one shared reason input and buttons Pause, Suspend (red text), Make active (only if not active), Ask to re-verify, Ban (owner). Pause and Suspend reveal a date field then "Confirm pause" and Cancel.
  - Tab bar of 8 links with counts (:106-131) inside a [Card](#09-ui-card).
  - Timeline tab (:425-496): [Segmented](#09-ui-segmented) filter, [KindPicker](#09-page-activity) (from Activity.tsx), note "Left swipes kept 30 days", [MoreList](#09-ui-morelist) of a 5-column [Table](#09-ui-table).
  - Offers (:498-540), Listings (:542-585, [ListingCell](#09-ui-listingcell) links to /listings/$id), Chats (:587-669, note "Counts and times only..." :597; "Open report" or "Reported" button per reported chat :649-659), Meetups (:671-724), Reports (:726-818, five sections with counts and "None" placeholders, ActionButton "Clear strike" per open strike :772-780), Blocks (:838-868, two columns), Access log (:870-906, note :874).
  - Side column cards: "What {first} likes" bars (:288-303), "When {first} is active" 24-cell heat strip (:304-320), "Account" definition list (:321-356), owner-only "Change school email" form (:364-420), [LoggedNote](#09-ui-loggednote) (:358).
- States:
  - Loading: [Loadable](#09-ui-loadable) 8 skeleton rows for the whole page (:100); each tab has its own skeleton via MoreList or Loadable (:448, :501, :729).
  - Empty: per tab "Nothing in this view yet." (:448), "No offers made or received." (:501), "No listings." (:548), "No chats." (:601), "No meetups." (:677), "Nobody has looked yet." (:878); Reports tab sections "None" (:830); Blocks "Nobody" (:861); likes card "No saves or offers yet." (:290).
  - Error: ErrorState with retry from Loadable for the page (ui.tsx:58); the Chats tab ignores an error from `admin_person_reports` (:590-594, no `error` read), so a failed lookup silently degrades "Open report" to a plain "Reported" link.
  - Populated: as above.
  - Pending: ReasonActions disables buttons while busy (ui.tsx:860 `disabled={busy}`); ChangeEmail button text becomes "Saving…" (:413).
  - Destructive confirms: Ban uses `window.confirm("Ban {name}? They lose access for good.")` (:209 -> ui.tsx:829 confirm); Suspend has a two-step date reveal but no confirm dialog; Clear strike uses `window.prompt` for the reason (ui.tsx ActionButton :757-759).
  - Result: ReasonActions shows "Done" or the error under the row (ui.tsx:834, :880-884); ChangeEmail shows green/red message "Sent. They confirm the new address with a code." (:385, :416). After a status change the whole page reloads (`onDone={reload}`, :272).
  - Suspended or banned subject: shown only as the status pill and reason line (:231, :245); no banner.
- Copy: Inline; labels from labels.ts and logic.ts. Key lines Person.tsx:109-116 (tab names), :164, :209, :288, :304, :316-317, :324-354, :385-398, :404-408, :446, :597-599, :874-876.
- Notes: Largest page (906 lines, 16 inline styles, e.g. :228, :246, :251, :731, :823, :840). The header packs 6 numbers, 5 buttons and 3 pills before any history; the right column repeats Strikes, No-shows and Blocks that also exist as counts and tabs. Tab numbers sum different things (Offers = made + received, Reports = on + by, :110, :114). "Make active" and "Ask to re-verify" sit with Suspend in one undifferentiated row. Several tab loaders pass `cursor: 0` and use `useLoadMore` while Reports and Chats-lookup use `useRpc`; mixed patterns. Text density: about 34 literal text nodes, 8 tab labels, 3 side cards, 4 headings plus 5 section headings in the Reports tab; the densest page.

<a id="09-page-listings"></a>
### Listings (/listings)
- Source: apps/admin/src/main.tsx:69 -> apps/admin/src/pages/Listings.tsx:53-241 (bulk bar :244-318)
- Route & entry: `/listings`, no params. Nav entry "Listings" (tag icon) with a quiet count badge from `held_listings`, apps/admin/src/nav.ts:32. Inbound: Overview KPI "Listings live" (Overview.tsx:142) and "Listings held for review" row (Overview.tsx:177); GlobalSearch. Row title links to /listings/$id (Listings.tsx:159-163).
- Purpose: Moderation queue for listings: held for review, active, removed, with single and bulk approve, hold, remove and restore.
- Roles: Owner and moderator, same actions. No client gate; scope is the sidebar campus (:54, :61; moderator pinned to own campus, session.tsx:50). RPCs: `admin_list_listings` (:60), `admin_set_listing_status` (:193, :209), `admin_bulk_set_listing_status` (:272, up to 200 per the comment :243; client caps the picked set at BULK_MAX, :135, :155). Server enforces roles (not read).
- Elements:
  - [Page](#09-ui-page) title "Listings", crumb "N held for review" when above 0 (:73-76).
  - [Segmented](#09-ui-segmented) "Show": Held for review (with count), Active, Removed (:42-46, :78-93); a transient green toast span for the last bulk result (:94-98); a muted line "Chats stay private. They open only from a report, and every read is logged." (:99-101).
  - [Card](#09-ui-card) holding an optional BulkBar (:104-115) and the [Table](#09-ui-table) "Listings": header checkbox "Pick every listing on this page" (:131-136), columns Listing, Seller, Campus, Status, Posted, actions (:140-145). Row: checkbox (:151-156), [ListingCell](#09-ui-listingcell) link with the description under it (:158-177), seller or "Deleted account" (:178), campus short name (:179), [StatusPill](#09-ui-statuspill) (:181), relative time with exact time as title (:183-185), per-row [ActionButton](#09-ui-actionbutton) "Approve" or "Restore" (:188-201, hidden when active) and red "Remove" (:202-217, hidden when removed).
  - BulkBar (:283-316): "N picked", reason input "One reason for all (required, saved to the audit log)", buttons "Hold selected" (Active view), "Approve selected" or "Restore selected" (primary), "Remove selected" (danger), "Clear".
  - [Pager](#09-ui-pager) Previous and Next without an "x of y" label (:223-234).
- States:
  - Loading: [Loadable](#09-ui-loadable) 6 skeleton rows (:116-118).
  - Empty: "Nothing is waiting for review." for the held view, "No listings here." otherwise (:120-122).
  - Error: ErrorState with Try again via Loadable.
  - Populated: :124-236.
  - Pending: single actions disable their own button while busy (ui.tsx:755); bulk buttons disable (:294-304). Switching view clears the selection (:91); paging clears it (:228, :232).
  - Destructive confirms: single Remove asks via `window.prompt` with the text "Remove: reason. The seller sees this in the app, so write it for them." (:207 -> ui.tsx:759) and no confirm dialog; bulk Remove asks `window.confirm("Remove N listings? Open offers and chats about them wind down, and each seller sees your reason in the app.")` (:261-267). Reason under 3 characters is rejected with a message (`reasonError`, :259-260; ui.tsx:763).
  - Result: single action shows "Done" or the error next to the button (ui.tsx:770, :781); bulk shows `bulkResultText` in a green toast above the card (:94-98, :275) which has no timeout or dismiss, and errors appear inside the bar (:311-315).
  - Removed or held rows: just a status pill; photo, price and description inside ListingCell.
- Copy: Inline; status labels from labels.ts `listingStatus`. Listings.tsx:43-45, :100, :121, :189-204, :207, :264, :284-309.
- Notes: Pager `hasNext={rows.length === 50}` (:225) offers a Next page when exactly 50 rows exist even if there are no more. Three inline styles (:158, :162, :173). Single actions use browser `prompt` while the bulk bar uses an inline input: two different reason patterns on one page. Row text stack: title, price, description, seller, campus, status, age, up to two buttons. Text density: about 6 literal text nodes, 7 column headers.

<a id="09-page-listingdetail"></a>
### Listing detail (/listings/$id)
- Source: apps/admin/src/main.tsx:70 -> apps/admin/src/pages/ListingDetail.tsx:57-241 (right vs left :243-280, tabs :282-461)
- Route & entry: `/listings/$id`, search param `tab` (swipes default, offers, views, price, reports; :49-62). No nav entry of its own (Listings stays active by prefix, nav.ts:101). Inbound: Listings row title (Listings.tsx:159), Person Listings and Timeline tabs (Person.tsx:475, :511, :566), Person Chats and Meetups tabs (Person.tsx:623, :689), GlobalSearch.
- Purpose: One listing under the microscope: who swiped which way, offers, views, price history, reports, a funnel, and hold, approve, restore or remove. Opening is audit-logged server side (header comment :52-55, `LoggedNote` :232).
- Roles: Owner and moderator, same actions. No client gate beyond status rules: Hold when status is active or hold (:77), Approve or Restore when held_review or removed (:80), Remove unless removed or deleted (:90). RPCs: `admin_listing_activity` (:64), `admin_set_listing_status` (:75), `admin_list_reports` x3 (:423-434). Server enforces.
- Elements:
  - [Page](#09-ui-page) title "Listings", crumb "/ title" (:68).
  - Hero card (:112-190): large [ListingCell](#09-ui-listingcell) photo, name and [StatusPill](#09-ui-statuspill), a facts line "price, condition, category, by seller (link to /people/$id), campus, posted age, meetup spots" (:124-146), optional "Sold {date} to {buyer}" (:147-152), three numbers Views, Saves, Offers drawn by hand with `.v` and `.l` divs, not [Stat](#09-ui-stat) (:154-167), description (:169-175), [ReasonActions](#09-ui-reasonactions) row with Hold, Approve or Restore (primary), Remove (danger) (:76-101, :176-189).
  - Tabs card (:192-213): "Who swiped" (count), Offers, Views, Price history, Reports. Swipes tab: [Segmented](#09-ui-segmented) with counts plus note "One row per person, strongest swipe. Left kept 30 days." (:288-298) and a 5-column [Table](#09-ui-table) (:302). Offers (:338-360), Views with note "The latest 100 detail views." (:362-384), Price history with green negative change (:386-411), Reports as linked rows plus a footer "N reports in total" and a button "Open the report queue" (:422-461).
  - Side column: [Card](#09-ui-card) "Funnel" with [Bar](#09-ui-bar) rows and a muted note "People, not taps. Shown counts each person who swiped the card." (:215-230), card "Right vs left" with a two-colour split bar and a comparison sentence (:243-280), [LoggedNote](#09-ui-loggednote) (:232).
- States:
  - Loading: [Loadable](#09-ui-loadable) 8 skeleton rows for the page (:69); the Reports tab shows [Loading](#09-ui-loading) 3 rows while its three queries run (:436).
  - Empty: "Nobody here yet." (:300), "No offers yet." (:339), "No detail views yet." (:363), "Same price since it was posted: $X." (:390), "No reports about this listing." (:435), "No swipes yet." (:264).
  - Error: ErrorState with retry for the page (ui.tsx:58). The Reports tab ignores errors from its three `admin_list_reports` calls (:423-434, no `error` read): a failed call shows an empty or short list with the footer "older ones are in the report queue" (:452).
  - Populated: as above.
  - Pending/result: ReasonActions disables buttons while busy and prints "Done" or the error (ui.tsx:834, :860, :880); success reloads the page and the nav counts (:182-185).
  - Destructive confirms: Remove uses `window.confirm('Remove "title"? Open offers and chats about it wind down.')` (:96 -> ui.tsx:829). Hold, Approve and Restore have none.
  - Sold, removed, held, deleted: status pill (:122), "Sold ..." line (:147), action set changes (:77-100). Deleted account seller: " · seller deleted" (:136). No photo: handled inside ListingCell (not read in this slice).
- Copy: Inline; labels from labels.ts (`condition`, `listingStatus`, `offerStatus`, `swipeDirection`, `viewSource`, `dwellLabel`). Lines ListingDetail.tsx:78-96, :104-108, :157-165, :226-228, :258-260, :264, :274, :296, :300, :339, :363, :367, :390, :435, :451-456.
- Notes: 13 inline styles (e.g. :113, :148, :170, :253-254, :256, :267). Hero numbers re-implemented by hand instead of Stat (:154-167) while Person uses Stat (Person.tsx:253). The Reports tab fetches three full report queues and filters in the browser (:423-439), so older reports can be missing (hence the :452 disclaimer). Right vs left bar uses two colours with no text label of which is which except below it (:252-260). Text density: about 10 literal text nodes, 5 tab labels, 2 side cards, 4 column sets of 4 to 5 headers.

<a id="09-page-reports"></a>
<a id="09-page-appeals"></a>
### Reports (/reports, /reports/$id) and Appeals (/appeals)
- Source: apps/admin/src/main.tsx:72-73, :76 -> apps/admin/src/pages/Reports.tsx:77-169 (`ReportsPage`), :171-358 (`ReportDetailCard`), :381-451 (`AppealsPage`)
- Route & entry: `/reports` and `/reports/$id` both render `ReportsPage` (main.tsx:72-73); `/appeals` renders `AppealsPage` from the same file (main.tsx:76). Nav "Reports" (nav.ts:38) and "Appeals" (nav.ts:40, quiet count).
- Purpose: Moderators work the report queue (read the evidence, act, write a reason) and decide appeals of strikes and no-shows.
- Roles: Owner and moderator. Actions are filtered by `allowedActions(role, target_type)` (Reports.tsx:192); suspend days max 365 for owner, 7 for moderator (:207); ban is owner-limited through `allowedActions`. RPCs `admin_list_reports` (:82), `admin_report_detail` (:182), `admin_resolve_report` (:215), `admin_read_reported_chat` (:272-287), `admin_list_appeals` (:384), `admin_decide_appeal` (:429-436). Server-side enforcement not read.
- Elements:
  - ReportsPage: [Segmented](#09-ui-segmented) status Open / Actioned / Dismissed (:66-70, :94-105); queue list left (reported person, reason, age), detail right; phone shows "Back to reports" (:148).
  - ReportDetailCard: header and target; evidence quote and excerpts (:240-248); reporter details (:249); "Read the whole chat (logged)" button (:272-287); person history list Status / Other reports / Strikes / No-shows / Joined with "Open profile" (:295-322); footer [ReasonActions](#09-ui-reasonactions) with reason input and action buttons, or a closed-status line (:334-350).
  - AppealsPage: Segmented Open / Overturned / Upheld, hint (:395), per-appeal [PersonCell](#09-ui-personcell), body, ReasonActions Overturn (primary) / Uphold (:429-436), decision note (:442).
- States:
  - Loading/error: [Loadable](#09-ui-loadable) for the queue and detail (skeleton only when data null, ui.tsx:59). Chat read error: red paragraph only (:289).
  - Empty: "No open reports. Nice." for Open, "Nothing here." otherwise (:113); appeals "No appeals waiting." / "Nothing here." (:403). No selection: "Pick a report on the left." (:163); the first row auto-selects (:84), so this shows only for an empty queue.
  - Target gone: "This report isn't about one person (or the account is gone)." (:325); reporter "a deleted account" (:233); no text: "No text was captured with this report." (:248).
  - Destructive confirms: Ban uses a confirm "Ban {name}? They lose access for good." (:199); other actions go through ReasonActions (window.confirm :829, reason of at least 3 characters :826, ui.tsx). Reading the chat has no confirm beyond the "(logged)" label.
  - Result: ReasonActions shows "Done" and a status line (ui.tsx:834, :880); the queue reloads.
- Copy: Inline; labels from labels.ts / logic.ts. Reports.tsx:66-70, :113, :148, :163, :199, :240-250, :272-290, :295-325, :334-350, :395, :403, :442.
- Notes: Reason placeholder is long ("Reason (required, saved to the audit log). If you remove a listing, the seller sees this.", :334-341). The same reason field covers an internal audit note and a seller-visible message. 8 inline styles (:210, :237, :251, :254, :333 and others). Text density: about 13 literal text nodes in this file.

<a id="09-page-support"></a>
### Support (/support, /support/$id)
- Source: apps/admin/src/main.tsx:74-75 -> apps/admin/src/pages/Support.tsx:46-159 (detail :161-185, body and reply :187-337)
- Route & entry: `/support` and `/support/$id` (`id` read with `useParams`, Support.tsx:47). Nav entry "Support" (mail icon) with a quiet open count, apps/admin/src/nav.ts:39. Inbound: Overview "Support requests waiting" row is not a link (Overview.tsx:204-209). List rows are links to /support/$id (:105-111). On a phone the list and detail are two screens (`has-detail`, :68; "Back to support", :138).
- Purpose: Inbox for Help-form and "can't get into my school email" requests: read, reply by email, keep a staff note, close or reopen. Opening a request is logged (comment :41-45, `LoggedNote` :334).
- Roles: Owner and moderator; Campus filter for owner only (:85). RPCs: `admin_list_support` (:55), `admin_support_detail` (:170), `admin_update_support` (:211). Server enforces (not read). The reply is sent only to the address on the request (comment :43-44).
- Elements:
  - [Page](#09-ui-page) title "Support", crumb "N open" or "Help requests by email" (:63-66).
  - Left card (360px, :69): [Segmented](#09-ui-segmented) Open (with count), Answered, Closed, All; owner Campus [FilterChip](#09-ui-filterchip); [MoreList](#09-ui-morelist) of link rows: topic, [StatusPill](#09-ui-statuspill), email and campus, 1-line preview, age and "N sent" (:98-134).
  - Right: card with topic title and status, definition list From, Account ([PersonCell](#09-ui-personcell) or "No account with this email"), Campus, Sent, History (:247-276), message body (:277-279); card "Reply" with a textarea (max 2000, disabled with no email, placeholder "Plain words. Say what you did and what they should do next."), "Staff note (only staff see it)" input (max 1000), reason input, buttons "Send reply" (primary, mail icon), "Save note" (only when the note changed), "Mark closed" or "Reopen" (:281-333); [LoggedNote](#09-ui-loggednote) "Opening a request is logged." (:334).
- States:
  - Loading: list skeleton via MoreList; detail [Loadable](#09-ui-loadable) 8 rows (:172).
  - Empty: "No open requests. Nice." for Open, "Nothing here." otherwise (:100); right pane "Pick a request on the left." (:153). No account: "No account with this email" (:256); no message: "No message." (:278).
  - Error: ErrorState with Try again (list and detail); save errors inline in red with mapped messages for reply and note length and reason (:231-238).
  - Populated: as above.
  - Pending: buttons disable while busy (:307, :313, :318, :322); no busy label.
  - Destructive confirms: none. "Send reply" emails an external person immediately with no confirm step, and requires a separate audit "reason" even for a reply (:204-205). "Mark closed" with no reply navigates back to the list (:229).
  - Result: green or red line "Reply queued to {email}." / "Closed." / "Saved." (:218-225, :327-331). The reply box and reason clear after sending (:226-227).
- Copy: Inline; labels from labels.ts `supportStatus`, `supportTopic`, logic.ts `supportEmailLine`. Support.tsx:34-37, :65, :100, :118, :139, :153, :207, :221-224, :235-237, :249-278, :283-324, :334.
- Notes: Master-detail with the selected item defaulting to the first list item (:60), so the detail pane opens automatically on desktop and the "Pick a request" empty state only shows when the list is empty. List column width forced inline `360px` (:69) plus 4 other inline styles. Three inputs (reply, note, reason) feed one of three buttons, and the audit reason applies to all of them. Text density: about 18 literal text nodes in the detail.

<a id="09-page-meetups"></a>
### Meetups (/meetups)
- Source: apps/admin/src/main.tsx:78 -> apps/admin/src/pages/Meetups.tsx:29-154
- Route & entry: `/meetups`, no params. Nav entry "Meetups" (pin icon), apps/admin/src/nav.ts:42. Inbound: none from other pages.
- Purpose: See upcoming and past meetups between buyers and sellers and who keeps missing them.
- Roles: Owner and moderator; Campus filter for owner only (:47). RPCs `admin_list_meetups` (:36), `admin_noshow_summary` (:41); server enforces.
- Elements:
  - [Page](#09-ui-page) title "Meetups", crumb "Where and when students meet, and who misses" (:44).
  - Filters: [Segmented](#09-ui-segmented) Upcoming and Past, owner Campus [FilterChip](#09-ui-filterchip), a line that changes with the view ("Suggested and confirmed meetups from 2 hours ago on, soonest first." / "Newest first.", :59-63).
  - Left [Card](#09-ui-card) with [MoreList](#09-ui-morelist) of a 6-column [Table](#09-ui-table): When, Place (or "Custom place"), Buyer, Seller ([PersonCell](#09-ui-personcell)), Listing (link to /listings/$id or "Listing gone"), Status ([StatusPill](#09-ui-statuspill) from `meetupPill`) (:67-106).
  - Right card "Who keeps missing": three big numbers Confirmed no-shows, Waiting, Rejected (:112-125), list of people with count text and status pill (:126-136), or "Nobody has missed a meetup." (:139), note about 180 days, 24-hour auto-confirmation and the campus limit (:142-145).
- States:
  - Loading: MoreList 8 rows (:69); [Loadable](#09-ui-loadable) 4 rows for the summary (:109).
  - Empty: "No meetups coming up." / "No past meetups." (:70); summary list "Nobody has missed a meetup." (:139).
  - Error: ErrorState with retry per source.
  - Populated: :72-103.
  - Pending/destructive/result: read only; none.
- Copy: Inline. Meetups.tsx:23-24, :44, :60-62, :70, :75, :81, :95, :108, :115-123, :139, :143-144.
- Notes: People in the no-show list are not links to /people/$id unless PersonCell links (ui.tsx:387 not read here). Rows have no pagination control visible beyond MoreList's own. Inline styles at :80, :112, :138, :142. Text density: about 6 literal text nodes, 6 column headers.

<a id="09-page-audit"></a>
### Audit log (/audit)
- Source: apps/admin/src/main.tsx:79 -> apps/admin/src/pages/Audit.tsx:81-274 (About cell :49-74)
- Route & entry: `/audit`, no params. Nav entry "Audit log" (log icon), apps/admin/src/nav.ts:43. Inbound: none.
- Purpose: Read-only history of every staff action and every look at a person, filterable and exportable.
- Roles: Owner and moderator see the page (no gate). The Staff filter and the `admin_list_admins` call are owner-only (:103, :135). Server decides which rows a moderator receives (RPC `admin_list_audit_v2`, :94; not read). Rows are append-only: "Kept 2 years. Rows can't be edited or deleted." (:226).
- Elements:
  - [Page](#09-ui-page) title "Audit log", crumb "Every staff action and every look at a person" (:110-112); [Button](#09-ui-button) "CSV" (:114-131).
  - Filter bar: owner Staff select, Action, About, Time (plus From and To for custom), all [FilterChip](#09-ui-filterchip) selects (:134-225), hint line (:226).
  - [Card](#09-ui-card) > [Table](#09-ui-table) "Audit log": When, Staff ("System" fallback), Action ([StatusPill](#09-ui-statuspill) from `auditAction`), About (links for user, listing and report; plain text for others, :49-74), Reason ("Looked only" for view or review, plus "· case X") (:237-259).
  - [Pager](#09-ui-pager) "Page N", Previous and Next (cursor stack, :261-267).
- States:
  - Loading: [Loadable](#09-ui-loadable) 10 rows (:229-231).
  - Empty: "No staff actions match these filters." (:233).
  - Error: ErrorState with Try again via Loadable.
  - Populated: :235-269.
  - Pending: changing a filter resets paging and refreshes "now" (:104-107); old rows stay until the response arrives.
  - Destructive/result: none (read only). CSV exports only the visible page (:121).
- Copy: Inline; labels from labels.ts (`AUDIT_ACTION_FILTERS`, `auditAction`, `targetType`, `configKey`, `humanize`). Audit.tsx:111-112, :144, :161, :177, :226, :233, :237, :252, :256, :262.
- Notes: The CSV button has no hint that it exports a single page. Reason column is capped `maxWidth: 420` inline (:250); one other inline style. The TARGETS list is hard-coded (:24-33). Targets `chat`, `campus`, `config`, `announcement`, `support` have no link (:73). Text density: about 6 literal text nodes, 5 columns, 4 to 6 filters.

<a id="09-page-quad"></a>
### Quad moderation (/quad)
- Source: apps/admin/src/main.tsx:77 -> apps/admin/src/pages/Quad.tsx:63-275 (owner reveal form :283-391)
- Route & entry: `/quad`, no params. Nav entry "Quad" (quad icon) with a quiet count of held items, apps/admin/src/nav.ts:41. Inbound: Overview "Quad posts held" row (Overview.tsx:178).
- Purpose: Review the queue of Quad (anonymous campus feed) posts and replies that were held automatically, hidden by votes or reported; approve or remove them; the owner can unmask an author for a safety case.
- Roles: Owner and moderator can approve and remove. Only the owner can reveal an author: client gate `canReveal(who)` (Quad.tsx:71, logic.ts) shows the "Reveal" button (:200-212) and the reveal form (:245). RPCs: `admin_list_quad` (:68), `admin_moderate_quad` (:174, :190), `admin_reveal_quad_author` (:318) after a fresh authenticator check through `supabase.auth.mfa` (:304-317). Server requires a TOTP check within 10 minutes (comment :278-279) and a 5 per day limit (copy :260, :349); not read here. List rows never carry author ids (comment :59-61).
- Elements:
  - [Page](#09-ui-page) title "Quad", crumb "Moderation · authors stay hidden" (:79).
  - [Segmented](#09-ui-segmented) "Quad queue" from QUAD_VIEWS with the held count (:81-93) and a muted line "Held automatically when a post matches a review word, names a student or gets voted down." (:94-96).
  - Two-column split: main [Card](#09-ui-card) with a compact [Table](#09-ui-table) "Quad posts": Post (optional thumb via [media](#09-ui-media), body, "Post" or "Reply" plus kind and status text), Why (amber or red [Pill](#09-ui-pill) hold reason, else [StatusPill](#09-ui-statuspill)), Votes, Reports, Posted (age and campus), actions (:108-217); per row [ActionButton](#09-ui-actionbutton) "Approve" (held or hidden only, :169-183), red "Remove" (not removed, :184-199), ghost "Reveal" with lock icon (owner, :200-212). [Pager](#09-ui-pager) (:218-223).
  - Right column (280px, :98): revealed-author card "Author for case {ref}" with person cell, status pill, "User id ..." and Close (:229-244); either the reveal form (:245-253) or an explainer card "Reveal an author" with a paragraph on conditions (:254-266); a footer note "Quad is anonymous. This list never shows who wrote a post. Approve and Remove are written to the audit log." (:267-270).
  - RevealForm (:333-389): lock icon header "Reveal who wrote this post/reply", red callout (:347-350), the post body in a bubble (:351), fields Case reference, Reason (saved to the audit log), Authenticator code, buttons "Reveal author" ("Checking…" while busy) and Cancel.
- States:
  - Loading: [Loadable](#09-ui-loadable) 6 skeleton rows (:100-102).
  - Empty: "Nothing here right now." (:104) for every view, identical for held, hidden and reported.
  - Error: ErrorState with Try again via Loadable. Reveal errors render as red text under the fields (:379).
  - Populated: :106-225.
  - Pending: action buttons disable (ui.tsx:755); reveal submit says "Checking…" and Cancel disables (:381-386).
  - Destructive confirms: Approve and Remove use the browser `window.prompt` for the reason, no confirm for Remove (ActionButton, ui.tsx:757-759; Quad.tsx:185-198 passes no `confirm`). Reveal is gated by the form, a danger callout and the authenticator code; there is no extra confirm dialog.
  - Result: "Done" or error next to the row buttons (ui.tsx:770, :781); after a reveal the card replaces the explainer; the code field is cleared in `finally` (:328).
  - Photo posts: thumbnail only when `media()` returns a URL (:127-133); no image-failed state.
- Copy: Inline strings. Quad.tsx:79, :94-96, :104, :112-116, :171, :186, :210, :230, :238, :256-263, :267-269, :344-349, :352-377, :382-385; labels from logic.ts `QUAD_VIEWS`, `holdReasonLabel`, labels.ts `quadStatus`.
- Notes: Copy mismatch: the explainer says 'Pick "Reveal author" on a post' (:263) but the row button reads "Reveal" (:210). The explainer card is permanent and tells moderators about a function they cannot use (:255-261 shown to everyone; only :262-264 is owner-gated). "5 per day" is hard-coded in copy twice (:260, :349). Pager `hasNext={rows.length === PAGE}` (:220) shows Next on an exact full page. Inline styles at :98, :122-125, :135, :257. A post body can be long; row has `minWidth: 180` and no truncation (:122). Text density: about 18 literal text nodes (3 paragraphs of 2 to 3 lines each in the side column), 6 column headers.

<a id="09-page-campus"></a>
### Campuses (/campuses)
- Source: apps/admin/src/main.tsx:81 -> apps/admin/src/pages/Campus.tsx:71-154 (detail :156-356, domains :358-431, spot form :433-583, add-school dialog :590-787)
- Route & entry: `/campuses`; optional search params `add=1`, `domain`, `name` open the Add school dialog pre-filled (:75-78, :99-101). Nav entry "Campuses" (school icon), apps/admin/src/nav.ts:49. Inbound: Waitlist "Add as school" (Waitlist.tsx:105-109).
- Purpose: Manage schools: settings and limits, status (live, paused, waitlist), allowed email domains and Meetup spots; owner can add a school.
- Roles: Owner edits; moderator reads. Client gates: every input is `disabled={!owner}` (:229-254); "Add school" page action (:91), status buttons (:205), Save bar (:259), Delete domain (:381), add-domain form (:396), "Add spot" and "Edit" (:292, :331), SpotForm (:342) all owner only. Moderators see "Only the owner can change campus settings." (:278). RPCs: `admin_list_campuses` (:74), `admin_update_campus` (:181, :217), `admin_delete_domain` (:387), `admin_upsert_domain` (:419), `admin_upsert_safe_spot` (:473), `admin_create_campus` (:626); server enforces.
- Elements:
  - [Page](#09-ui-page) title "Campuses", crumb "/ short name" (:87-89); primary [Button](#09-ui-button) "Add school" (owner, :92).
  - Left [Card](#09-ui-card) "Schools" (280px): selectable rows with name, [StatusPill](#09-ui-statuspill), first student domain and "N members" (:110-143).
  - Detail card for the picked school (:197-280): name and status title; owner status buttons via [ActionButton](#09-ui-actionbutton) ("Set live", red "Pause campus" with confirm, "Back to waitlist"); form grid Name, Short name, Time zone (free text), then the CAMPUS_DIALS number fields with unit hints (:247-257); footer reason input, "Save changes" (disabled until something changed), result toast.
  - Card "Email domains" with "Who can sign up here" (:358-429): [Table](#09-ui-table) Domain, Kind pill, owner Delete (confirm); an add-domain row with Domain, Kind (Student, "Blocked (staff, alumni)") and "Save domain" ActionButton.
  - Card "Meetup spots" with "Shown when students pick where to meet" (:284-341): table Spot, Hours, Type, Shown, Default, Edit; inline SpotForm below (Name, Where exactly, Hours, Latitude, Longitude, Type, Confirmed on for police, Shown to students, Default spot, reason, Save or Add, Cancel).
  - Add school [Dialog](#09-ui-dialog) wide (:650-785): school name (auto-fills the link name), short name, link name ("can't change later"), student email domain, time zone select, "Start as" Waitlist or Live with a live/waitlist hint, "First Meetup spot" subform with 5 fields, reason, Cancel and "Add school".
- States:
  - Loading: [Loadable](#09-ui-loadable) 3 rows for the school list (:111-113); the detail pane has no loading state of its own (it renders from the same list data).
  - Empty: "No campuses yet." (:115); "Pick a school on the left." (:148); "No Meetup spots yet." (:300); "No email domains yet." (:371).
  - Error: ErrorState with Try again for the list; form errors as red text or toast (:275, :579, :779); known server errors mapped for Add school (:636-642).
  - Populated: :117-141, :144-146.
  - Pending: "Saving…" (:273, :574), "Adding…" (:776); ActionButtons disable while busy.
  - Destructive confirms: Pause uses `window.confirm("Pause {name}? Students can't post or make offers while it's paused.")` (:211-215); Delete domain `window.confirm("Delete {domain}? New sign-ups with it stop working.")` (:386); "Set live" and "Back to waitlist" have no confirm even though live -> waitlist changes student access; every ActionButton asks for a reason through `window.prompt` (ui.tsx:757-759). Save changes shows no summary of what changed.
  - Result: "Saved." toast (:182, :275); ActionButton "Done"; Add school closes on success and selects the new school (:630-631).
- Copy: Inline strings, labels from labels.ts (`CAMPUS_DIALS`, `campusStatus`, `domainKind`, `spotDesignation`) and logic.ts (`TIME_ZONES`). Campus.tsx:93, :115, :148, :193, :213, :226-246, :265, :273, :278, :288, :300, :304-309, :366, :371, :386, :399-412, :465-467, :491, :532-533, :553, :561, :650-722, :776.
- Notes: Highest string count in the console (about 43 label/title props, 26 inputs in one file of 787 lines). Mixed patterns on one page: ActionButton + browser prompt for status and domains, inline reason input for settings and spots, modal Dialog for Add school, inline card form for spots. Time zone is a free-text input in the detail (:240-246) but a curated select in Add school (:695-701), and the default is hard-coded `America/New_York` (:605). 4 inline styles (:109, :314, :398, :779). Text density: about 26 literal text nodes plus ~25 field labels.

<a id="09-page-announcements"></a>
### Announcements (/announcements)
- Source: apps/admin/src/main.tsx:82 -> apps/admin/src/pages/Announcements.tsx:65-165 (create form :172-385)
- Route & entry: `/announcements`, no params. Nav entry "Announcements" (book icon), apps/admin/src/nav.ts:50. No inbound links.
- Purpose: History of in-app banners and pushes, and (owner) a form to post one: one per campus per 7 days, pinned at the top of Quad, with an optional push.
- Roles: Owner posts; moderators read their campus. Gate: `owner ? <CreateForm> : "Only an owner can post announcements."` (:148-161). Scope for the list is the sidebar campus (:67, :72). RPCs: `admin_list_announcements` (:71), `admin_create_announcement` (:235), `admin_overview_v2` (for reach, :183); server enforces the weekly limit and returns `next_allowed_at`.
- Elements:
  - [Page](#09-ui-page) title "Announcements", crumb "In-app banners and pushes" (:81).
  - Left [Card](#09-ui-card) "Sent" with [Segmented](#09-ui-segmented) All, Pinned, Safety (client-side filter of the loaded page, :76-78): compact [Table](#09-ui-table) Announcement (title and body), Type pill, Campus, Sent (date and "by name"), Pinned ("Until {date}" green pill, "Ended" or "No"), Reach (recipient count or "No push") (:95-137); [Pager](#09-ui-pager) (:138-143).
  - Right form card "New announcement" (420px) (:214-383): Campus select with reach hint, Type segmented (News, Update, Safety per ANNOUNCEMENT_TYPES) with a hint, Title and Message with live character counters, "Pin at the top of Quad (hours)" number, checkbox "Also send a push", Reason, an amber callout when the campus is rate-limited (:357-362), error and success lines, footer "One per campus per week" and the submit button.
- States:
  - Loading: [Loadable](#09-ui-loadable) 5 rows (:87-89).
  - Empty: "No announcements yet." (:91). Note: the empty check is the filtered list (:90), so the Pinned filter with none says "No announcements yet." as well.
  - Error: ErrorState with Try again for the list; form errors in red (:363); rate-limit message turns into the amber callout (:257-258).
  - Populated: :93-145.
  - Pending: submit button label "Posting…" (:375).
  - Destructive confirm: when "Also send a push" is checked, `window.confirm("Send a push to every active member at {campus}?")` or "...to members at {campus} who turned on tips?" (:222-230). The submit button text also changes to "Send to N students" (:378-379).
  - Result: green "Posted." or "Posted and sent to N people." (:246-250); form clears title, body, reason; the list reloads (:252-255).
  - Disabled reasons: over-length counters, no campus ("Pick a campus first"), or rate limit (:372-380).
- Copy: Inline. Announcements.tsx:81, :84, :91, :99-104, :159, :210-211, :226-227, :248-249, :261-264, :273, :277-294, :303-313, :316-328, :345, :348, :359-360, :367, :375-380.
- Notes: Hard-coded rules appear in three places as prose (7 days, 168 hours, "one per week": :263, :359, :367) next to the constants in logic.ts. 5 inline styles (:82, :109, :275, :327, :336). The Pager hasNext uses `state.data.length === PAGE` after client-side filtering is applied separately (:140), so Next can show on an exact full page. Safety announcements notify every active member, a high-impact action protected only by `window.confirm`. Text density: about 12 literal text nodes, 6 columns.

<a id="09-page-settings"></a>
### Settings (/settings, 9 section routes)
- Source: apps/admin/src/main.tsx:83-93 -> apps/admin/src/pages/Settings.tsx:30-67
- Route & entry: `/settings` redirects to `/settings/team` (main.tsx:83); one route per section: team, words, switches, data, health, review, blocked-emails, categories (main.tsx:84-91) and staging only when `VITE_APP_ENV=staging` (main.tsx:93; elsewhere "Page not found"). Old addresses /team, /banned-words, /config redirect here (main.tsx:103-105). Nav entry "Settings" (gear icon), apps/admin/src/nav.ts:51; section links are the sub-nav `SETTINGS_TABS` (nav.ts:77-90) rendered at Settings.tsx:37-48.
- Purpose: Frame for the nine owner/moderator setup sections; shows a section sub-nav and the picked section.
- Roles: Sub-nav list is filtered by `settingsTabs(owner, STAGING)` (Settings.tsx:32; nav.ts:96-98). Owner-only tabs (data, health, review, blocked-emails, categories, staging; nav.ts:81-90) are hidden from a moderator. If a moderator types an owner-only address, `blocked` is true and they get "Only the owner can open this section." (Settings.tsx:34, :49-52). The moderator-visible tabs Team, Banned words and App switches exist but see read-only or owner-only content (see sections below). The Settings nav item itself is not owner-only (nav.ts:51).
- Elements:
  - [Page](#09-ui-page) title "Settings" with a per-section crumb (:17-27, :36).
  - Sub-nav `nav.tabs.card.subnav` with one link per visible section (:37-48), `aria-current` on the active one.
  - Section body: Team, Banned words, App switches, Data requests, System health, Review accounts, Banned emails, Categories, Staging tools (:55-63).
- States:
  - Loading/error/empty: delegated to each section.
  - Blocked: [EmptyState](#09-ui-emptystate) "Only the owner can open this section." (:51).
  - Staging tab on a non-staging build: the route does not exist, so the shell's "Page not found" shows (main.tsx:93, shell.tsx:131-141).
- Copy: Inline. Settings.tsx:17-27 (crumbs), :51; tab labels in nav.ts:78-90.
- Notes: The default landing tab is Team (`/settings` -> `/settings/team`), but Team is the one tab a moderator can see yet cannot use: it renders "Only an owner can see and change the admin team." (Team.tsx:38-43). A moderator who clicks Settings therefore lands on a dead-end message. One inline style on the sub-nav (:37). Text density: about 9 crumbs, 9 tab labels, no other text in this file.

<a id="09-page-team"></a>
### Settings: Team (/settings/team)
- Source: apps/admin/src/main.tsx:84 -> apps/admin/src/pages/Team.tsx:36-211 (list :47-101, invite form :103-211)
- Route & entry: `/settings/team` (and `/settings`, `/team`). Sub-nav label "Team" (nav.ts:78). No other inbound links.
- Purpose: Owner lists, adds, changes and removes admins; moderators are bound to one campus.
- Roles: Owner only. `TeamSection` shows "Only an owner can see and change the admin team." to a moderator (Team.tsx:38-43). RPCs `admin_list_admins` (:48), `admin_invite_admin` (:124), `admin_remove_admin` (:84); server enforces and rejects self-change and removing the last owner (mapped errors :143-147).
- Elements:
  - [Card](#09-ui-card) "Team" (:56): rows with [Avatar](#09-ui-avatar), name with "(you)", line "campus · email · added date by X", role [Pill](#09-ui-pill) (owner green, moderator sky), then "Last owner" text or a red [ActionButton](#09-ui-actionbutton) "Remove" (self has none) (:60-89); a note "Moderators see their own campus, can pause or suspend up to 7 days, and can't ban or change settings." (:90-93).
  - Form card "Add or change an admin" (400px column, :113-209): note, Email, Role select (Moderator (one campus), Owner (every campus)), Campus select (moderator) or an amber callout "Owners can ban, change settings, reveal Quad authors and manage this team." (:189-191), Reason, "Add admin".
- States:
  - Loading: [Loadable](#09-ui-loadable) 3 rows (:57). Empty: Loadable default "Nothing here right now." (:57, ui.tsx:61); an empty team is impossible in practice.
  - Error: ErrorState with Try again; form errors mapped (:142-148) or shown by `knownError` only (no `errorMessage` fallback, so an unmapped error shows blank text).
  - Pending: "Saving…" (:206).
  - Destructive confirm: Remove uses `window.confirm("Remove {name} from the admin team? They lose console access right away.")` then `window.prompt` for a reason (:83; ui.tsx:757-759). Changing a role to owner has no confirm.
  - Result: green line confirming the admin was added or changed (:132-135); list reloads.
- Copy: Inline. Team.tsx:41, :65, :69, :77, :83, :90-92, :134, :143-147, :156, :159-161, :163-175, :190, :206.
- Notes: The note at :90-92 repeats rules also stated in the invite callout (:189-191); both are prose duplicates of server rules. Invite form `knownError(...)` has no `|| errorMessage(err)` fallback, unlike Campus (Campus.tsx:642) and Support (Support.tsx:238), so an unmapped failure may show an empty message. 4 inline styles (:55, :63, :90, :158). Text density: about 12 literal text nodes.

<a id="09-page-bannedwords"></a>
### Settings: Banned words (/settings/words)
- Source: apps/admin/src/main.tsx:85 -> apps/admin/src/pages/BannedWords.tsx:48-203 (form :205-344)
- Route & entry: `/settings/words` (old `/banned-words`). Sub-nav "Banned words" (nav.ts:79).
- Purpose: The terms the server checks text for in listings, chats, Quad and other places; Block stops the text, Hold for review sends it to a moderator.
- Roles: Owner edits, moderator reads (`owner` at :49; form column :189-200 and the actions column :127, :148 owner only). RPCs `admin_list_banned_words` (:53), `admin_upsert_banned_word` (:236), `admin_delete_banned_word` (:159); server enforces.
- Elements:
  - [Card](#09-ui-card) "Banned words" with a count (:67-74); filter form: search "Find a term", select "Checked in" (Anywhere + BANNED_SCOPES), select "Action" (Any, Block, Hold for review) (:75-113); compact [Table](#09-ui-table): Term (mono), Match, Checked in, Action pill, Fired, Undone, owner Edit + red Delete (:117-170); [Pager](#09-ui-pager) (:171-176); explanatory note (:180-187).
  - Form card (owner, 340px): "Add a term" or `Edit "term"`, note when editing, Term, Match (Word, Phrase, Pattern (regex)), Action (Hold for review, Block (don't post)), live regex error, "Check it in" checkboxes, Reason, "Add term" or "Save changes" (and Cancel when editing) (:261-341).
- States:
  - Loading: [Loadable](#09-ui-loadable) 6 rows (:114). Empty: "No terms match." (:114). Error: ErrorState with Try again.
  - Pending: "Saving…" (:339); live regex errors disable submit (:338).
  - Destructive confirm: Delete chains `window.confirm("Delete "{term}"? Text with it will no longer be blocked or held.")` and then a `window.prompt` for the reason (:158; ui.tsx:757-759): two browser dialogs. Add or edit saves without a confirm even for action "Block".
  - Result: green `Added "term".` or `Updated "term".` (:243); form key resets (:196).
- Copy: Inline; labels from labels.ts (`bannedAction`, `bannedMatch`) and logic.ts `BANNED_SCOPES`. BannedWords.tsx:70, :88-111, :121-126, :152, :158, :184-186, :251-253, :262-269, :272-320, :339.
- Notes: Eight inline styles (:65, :90, :134, :140, :182, :264, :282, :302); the page-wide count shows the length of the current page, not the total (:71). Moderators get a table with a count of `Fired` and `Undone` but no way to act, and the Team note says moderators "can't change settings" (Team.tsx:91-92), consistent. Wording "Hold for review" appears with different labels ("review" value, "Hold" elsewhere for listings). Text density: about 22 literal text nodes.

<a id="09-page-config"></a>
### Settings: App switches (/settings/switches)
- Source: apps/admin/src/main.tsx:86 -> apps/admin/src/pages/Config.tsx:25-193
- Route & entry: `/settings/switches` (old `/config`). Sub-nav "App switches" (nav.ts:80).
- Purpose: Flip the app's on/off switches and edit its limits and versions (including `rules_version`, which makes the app ask everyone to accept the rules again; comment :20-24).
- Roles: Everyone sees the values; only the owner edits: toggles `disabled={!owner}` (:90), value inputs `disabled={!owner}` (:153, :162), Save only for owner (:168), note "Only the owner can change these." (:42). RPCs `admin_get_config` (:27), `admin_set_config` (:96, :176); server enforces.
- Elements:
  - Two [Card](#09-ui-card)s: "App switches" (rows of name, help text and a [Switch](#09-ui-switch); :38-43) and "Limits and versions" (rows with a text input, number input or JSON textarea and a "Save" button when changed; :44-48, :108-193). Names/help from labels.ts `configKey` and `configHelp`.
- States:
  - Loading: [Loadable](#09-ui-loadable) 6 rows (:29). Empty: not handled for an empty config object (no `empty` prop; two empty cards would render). Error: ErrorState with retry; per-row errors in red small text (:84, :190).
  - Invalid input: "That isn't valid for this setting." (:189); Save disabled (:171).
  - Pending: not handled (no branch found) — neither Switch nor Save shows a busy state; the switch visually reflects the old value until the reload completes.
  - Destructive confirms: no confirm dialog. Each change asks for a reason through a bare `window.prompt` (:10-18), and a short reason is rejected with `window.alert` (:14), a third browser-dialog pattern in the console. A maintenance-mode switch (an `{enabled}` object, comment :56) flips with the same single prompt.
  - Result: reloads the config on success (:98, :178); no "Saved" message.
- Copy: Inline. Config.tsx:11, :14, :38, :42, :44, :92, :173, :184, :189.
- Notes: Own copy of the prompt helper `askReason` (:10-18) duplicates the reason logic in ui.tsx ActionButton (:757-766). The page cannot show what a value does beyond `configHelp(k) || k`; an unknown key shows its raw key as help (:83, :141). JSON textarea for non-simple values exposes raw structure to staff. 5 inline styles (:37, :81, :137, :139, :146-148). Text density: very low (about 4 literal text nodes), content is data-driven.

<a id="09-page-datarequests"></a>
### Settings: Data requests (/settings/data)
- Source: apps/admin/src/main.tsx:87 -> apps/admin/src/pages/DataRequests.tsx:20-118
- Route & entry: `/settings/data`. Sub-nav "Data requests" (owner only, nav.ts:81).
- Purpose: Monitor account deletions and data exports, and spot stuck deletions.
- Roles: Owner only (tab hidden for moderators and the section blocked by Settings.tsx:49-52). RPC `admin_list_deletions_exports` (:22); server enforces.
- Elements:
  - Five [Kpi](#09-ui-kpi) tiles: Accounts deleted 30 days, Age-check removals 30 days, Deletions stuck, Data exports 30 days, Exports failed 30 days (:27-47). Card "Account deletions" table (Account, Campus, Status, Started, Took; "Age check" lilac pill, :49-81). Card "Data exports" table (Student, Status, Asked, Link until; :82-101). [Pager](#09-ui-pager) (:103-108) and a 3-line note (:109-113).
- States:
  - Loading: [Loadable](#09-ui-loadable) 8 rows (:24). Error: ErrorState with Try again. Empty: "No deletions yet." (:79), "No exports yet." (:99).
  - Pending/destructive/result: read only; none.
- Copy: Inline. DataRequests.tsx:28-38, :53, :61, :79, :84, :99, :110-112.
- Notes: The Pager's `hasNext` guesses from `=== 50` on either list (:105) and Next uses `d.next_cursor ?? cursor + 50`, so paging two independent lists with one cursor can skip or repeat rows. Red numerals for stuck or failed counts plus delta text; the other Kpi tiles use the `error` class in a span (:32, :41). Inline styles at :27, :48, :64. Text density: about 8 literal text nodes.

<a id="09-page-health"></a>
### Settings: System health (/settings/health)
- Source: apps/admin/src/main.tsx:88 -> apps/admin/src/pages/Health.tsx:7-204
- Route & entry: `/settings/health`. Sub-nav "System health" (owner only, nav.ts:82).
- Purpose: One screen for email queue, push errors, scheduled jobs, database size and the oldest open report.
- Roles: Owner only (Settings.tsx:49-52). RPC `admin_system_health` (:8); server enforces.
- Elements:
  - Header row: "Checked N min ago" or "Checking", and a [Button](#09-ui-button) "Refresh" with refresh icon (:11-19).
  - Five [Kpi](#09-ui-kpi) tiles: Emails waiting, Emails failed 24 h, Push errors 24 h, Scheduled jobs failing, Oldest open report (:31-74).
  - [Card](#09-ui-card) "Database size" with a [Bar](#09-ui-bar), a warning line over 80%, and a `<details>` "Largest tables" (:76-117); card "Scheduled jobs" table (Job, Runs, Last run, Status, Took, Failed 24 h; :119-157); cards "Recent email errors" and "Recent push errors" (:159-197).
- States:
  - Loading: [Loadable](#09-ui-loadable) 10 rows (:20); refresh button text "Refreshing…" and disabled (:16-17); old data stays visible during refresh. Error: ErrorState with Try again. Empty: "No scheduled jobs found (pg_cron is off here)." (:155), "No email errors." (:180), "No push errors." (:194).
  - Pending/destructive/result: read only; no auto refresh.
- Copy: Inline. Health.tsx:13, :17, :33-62, :77-81, :91, :96, :101-103, :123-129, :155, :165, :180, :185, :194.
- Notes: The "free tier" is named in the UI (:80), a plan detail that will go stale. Danger is red text for numerals plus a warn class on the bar (:86); the KPI direction relies on `dir` color. 5 inline styles (:31, :90, :95, :159, :172). Text density: about 14 literal text nodes.

<a id="09-page-reviewaccounts"></a>
### Settings: Review accounts (/settings/review)
- Source: apps/admin/src/main.tsx:89 -> apps/admin/src/pages/ReviewAccounts.tsx:9-102 (form :104-181)
- Route & entry: `/settings/review`. Sub-nav "Review accounts" (owner only, nav.ts:83).
- Purpose: Manage the App Store and Google Play reviewer logins for the Demo University campus.
- Roles: Owner only (Settings.tsx:49-52). RPCs `admin_list_review_accounts` (:10), `admin_upsert_review_account` (:132), `admin_delete_review_account` (:88); server enforces.
- Elements:
  - Intro note, 4 lines (:14-18). [Card](#09-ui-card) "Review accounts" with a "Add account" [Button](#09-ui-button) (:19-26); inline form Email, Note, Reason, Add or Save, Cancel (:104-181); [Table](#09-ui-table) Email, Note, Account ("Signed up, {campus}" green or "Not signed up yet"), Last sign-in, Edit and red Delete (:45-96).
- States:
  - Loading: [Loadable](#09-ui-loadable) 4 rows (:38-40). Empty: "No review accounts yet. Add one before you submit to the stores." (:42). Error: ErrorState with Try again; form errors in red (:178).
  - Pending: submit button disables, no label change (:171). Destructive confirm: Delete uses `window.confirm("Remove {email}? They can't sign in to the demo campus after this.")` then `window.prompt` for the reason (:86). Result: the form closes and the list reloads (:32-35); no success message.
- Copy: Inline. ReviewAccounts.tsx:14-18, :20, :23, :42, :48-52, :58, :63, :66, :86, :126, :142, :157, :165, :168, :172, :175.
- Notes: Form is embedded inside the table card above the table (:27-37), so adding pushes the list down. Email regex duplicated from BannedEmails (:125 vs BannedEmails.tsx:45). Inline style at :121 only. Text density: about 8 literal text nodes.

<a id="09-page-bannedemails"></a>
### Settings: Banned emails (/settings/blocked-emails)
- Source: apps/admin/src/main.tsx:90 -> apps/admin/src/pages/BannedEmails.tsx:25-149
- Route & entry: `/settings/blocked-emails`. Sub-nav "Banned emails" (owner only, nav.ts:84).
- Purpose: Hashes of banned accounts' school emails so the same address cannot sign up again; add or lift one by hand.
- Roles: Owner only (Settings.tsx:49-52). RPCs `admin_list_banned_hashes` (:27), `admin_upsert_banned_hash` (:53), `admin_delete_banned_hash` (:129); server enforces.
- Elements:
  - Intro note (:35-39). [Card](#09-ui-card) "Block an email": School email, Reason, "Block email" (:40-90). Card "Blocked emails" with "N in total": [Table](#09-ui-table) Hash (first 16 characters, mono), Account ([PersonCell](#09-ui-personcell) plus status pill, or "No account (deleted or never made)"), Added, "Unblock" [ActionButton](#09-ui-actionbutton) (:91-146); [Pager](#09-ui-pager) (:137-142).
- States:
  - Loading: [Loadable](#09-ui-loadable) 5 rows (:95-97). Empty: "No blocked emails." (:99). Error: ErrorState with Try again.
  - Pending: submit disables (:85), no label change. Destructive confirm: Unblock uses `window.confirm("Unblock this email? It can sign up again.")` then a `window.prompt` for the reason (:127). Blocking an address has no confirm.
  - Result: "Blocked. That address can no longer sign up." or "Already blocked." (:58); inline error text otherwise.
- Copy: Inline. BannedEmails.tsx:35-38, :46, :58, :67, :74, :82, :86, :99, :105, :119, :127.
- Notes: Section label in the nav says "Banned emails" while the route is `blocked-emails` and the card says "Blocked emails" and the button "Block email": three words for one thing. The hash column is not meaningful to staff (16 characters of hex). Inline style once (:114). Text density: about 10 literal text nodes.

<a id="09-page-categories"></a>
### Settings: Categories (/settings/categories)
- Source: apps/admin/src/main.tsx:91 -> apps/admin/src/pages/Categories.tsx:13-96 (form :98-215)
- Route & entry: `/settings/categories`. Sub-nav "Categories" (owner only, nav.ts:85).
- Purpose: Rename, reorder and add listing categories; the link name never changes once made.
- Roles: Owner only (Settings.tsx:49-52). Reads the `categories` table directly with the Supabase client (:19-22) and writes through `admin_upsert_category` (:135); the other admin pages use `admin_*` read RPCs.
- Elements:
  - Intro note (:37-40). [Card](#09-ui-card) "Categories" with "Add category" [Button](#09-ui-button) (:41-47); inline form Name, Link name, Order, Inside (parent select with "Top level"), Reason, Save or Add, Cancel (:157-211); [Table](#09-ui-table) Order, Name, Link name (mono), Inside, Edit (:68-91).
- States:
  - Loading: [Loading](#09-ui-loading) 6 rows via hand-written state (:63-64). Empty: "No categories." (:66). Error: ErrorState with Try again (:61-62).
  - Pending: submit disables, no label change (:205). Destructive confirm: none (no delete exists). Result: form closes and list reloads (:55-58); validation text in red (:212).
- Copy: Inline. Categories.tsx:37-39, :44, :66, :71-75, :127-129, :147-149, :158-209.
- Notes: Hand-written load state (`useState` + `useEffect(load, [load])`, :14-31) instead of `useRpc` and `Loadable`; a thrown error from the query chain is not caught. New category ids are computed on the client as max+1 (:109, :136), which can collide with a concurrent add. Reorder is by typing a number (:178-184); no drag handle. Inline styles at :122, :183. Text density: about 8 literal text nodes.

<a id="09-page-staging"></a>
### Settings: Staging tools (/settings/staging, staging builds only)
- Source: apps/admin/src/main.tsx:93 -> apps/admin/src/pages/Staging.tsx:22-211
- Route & entry: `/settings/staging`, registered only when `STAGING` (env.ts:6; main.tsx:93). Sub-nav "Staging tools" (owner only, staging only; nav.ts:86-91).
- Purpose: Read-only status of the mock campus data and the mock seller bot on the staging server.
- Roles: Owner only; hidden outside staging builds. RPC `admin_mock_status` (:23), present only where `supabase/campuses/owu-mock.sql` was applied (comment :17-21).
- Elements:
  - Header row "Checked N min ago" / "Not installed" / "Checking" and "Refresh" [Button](#09-ui-button) (:27-39). Four [Kpi](#09-ui-kpi) tiles (:70-102). Card "Mock seller bot" with a state pill and a definition list Job, Last run, Runs 24 h, All actions, Photos (:104-151); cards "What the bot did lately" and "Failures" with a log table (:153-160, :169-211); closing note with a shell command (:161-164).
- States:
  - Loading: [Loading](#09-ui-loading) 8 rows (:53-56). Missing function: EmptyState "Mock data isn't installed on this server." with the command to run (:40-48). Error: ErrorState with Try again (:49-52). Empty: "The bot isn't scheduled. Run the mock data command again to start it." (:149), "The bot hasn't done anything yet." (:155), "No failed actions." (:158).
  - Pending: "Refreshing…" and disabled button (:36-38). Destructive/result: none (read only; removal is a shell command).
- Copy: Inline. Staging.tsx:28-33, :42-45, :72-100, :104, :109-146, :149, :155, :158, :161-163, :185-186, :197-199.
- Notes: The only page that names a shell script and developer terms; it is staging only. One inline style (:203). Text density: about 14 literal text nodes.
