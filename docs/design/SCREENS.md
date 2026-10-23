# OnlySwap screens inventory (Phase 1)

Every mobile route, admin page, shared component and current token, with file:line evidence from the working tree of branch `design/overhaul` at `2edd9878919a341f7f936d1844c50d4d9e74c35c` (uncommitted changes included). This is an inventory of what exists; proposals are in [DESIGN_REVIEW.md](DESIGN_REVIEW.md). All slices are complete.

## Terminology (owner words to app words)

This block is identical in `SCREENS.md` and `DESIGN_REVIEW.md`. The owner's words are on the left; the names the app and code use are on the right. Both docs use the app words from here on.

| Owner says | App calls it | Where it lives |
|---|---|---|
| bids | **offers** (make, counter, accept, decline, withdraw; each offer has a status) | `apps/mobile/src/features/offers/{InboxScreen,OfferScreen,OfferSheetScreen,ListingOffersScreen}.tsx`; routes `apps/mobile/app/offer/[id].tsx`, `apps/mobile/app/listing/[id]/offer.tsx`, `apps/mobile/app/listing/[id]/offers.tsx` |
| requests board | **Wanted** posts ("Ask for something"), shown in the Feed | `apps/mobile/src/features/campus/PostWantedScreen.tsx`, route `apps/mobile/app/(tabs)/sell/wanted.tsx`, listed in `apps/mobile/src/features/campus/CampusFeedScreen.tsx` |
| "sold?" popup | the **"Did it sell?"** prompt after a meetup (Handoff), plus **Mark sold** from the chat (DEC 97, `docs/DECISIONS_LOG.md:53`) | `apps/mobile/src/features/meetups/Handoff.tsx`, `apps/mobile/src/features/deals/DealScreens.tsx`, `apps/mobile/src/features/chat/ChatScreen.tsx`, route `apps/mobile/app/listing/[id]/sold.tsx` |
| tokens / rewards | **absent.** There is no rewards or points feature: `reward` has 0 hits under `apps/`; every `token` hit is auth, push or Turnstile (`apps/mobile/src/components/TurnstileField.tsx`). Any rewards idea is listed under "Needs logic change" in `DESIGN_REVIEW.md`. | none |
| anonymous chat with an identity reveal | **not a feature.** Chats always show names. The idea is listed under "Needs logic change". | see the three real "reveal" mechanics below |

The three things in the code that do "reveal" something, with server visibility kept separate from client UI:

1. **Chat photo blur (client UI only).** Only an *incoming photo* message from a new contact is blurred, with "tap to view" to reveal it: the blur is decided at `apps/mobile/src/features/chat/ChatScreen.tsx:303-320` (`blurred = !mine && newContact && sentId !== null && !revealed.has(sentId)`, `onReveal` adds the id to the local `revealed` set) and drawn at `apps/mobile/src/components/MessageBubble.tsx:135-150` (blur radius plus an eye icon and `copy.tapToView`). Message *text* is never hidden: it renders unconditionally at `MessageBubble.tsx:180-184`.
2. **Rating visibility (server rule; the screen only reflects it).** The server shows the other person's rating once both people have rated, *or* seven days after that rating was submitted. The clock is the rating's own `created_at`, set by `submit_rating` (`supabase/migrations/0026_deals.sql:149-150`), not the deal date. The rule is enforced in `get_my_rating` (`0026_deals.sql:175-177`) and the `ratings_visible` view (`supabase/migrations/0009_views.sql:91-96`), and an hourly job notifies one-sided ratings reaching 7 days (`supabase/migrations/0205_r11_extras.sql:1051-1077`). The Rate screen's `submit | waiting | revealed` phase (`apps/mobile/src/features/deals/logic.ts:21-24`) is only a local choice of which UI to show based on what the server returned.
3. **Quad authorship (server rule).** Quad posts show "Anonymous · campus" (`apps/mobile/src/features/quad/QuadFeedScreen.tsx:108`). Revealing an author is an OWNER-only admin action that needs a fresh authenticator (TOTP within 10 minutes) and a case reference (`supabase/migrations/0220_quad_author_privacy.sql:166-183`); it is not a general staff capability and there is no student-facing reveal.

## Reading key

- Route files in `apps/mobile/app/` are thin wrappers; each entry gives `route file:line -> feature file:lines`.
- Each screen entry has the same eight bullets: Source, Route & entry, Purpose, Roles, Elements, States, Copy, Notes. Layouts, redirects and dev-only routes get a short entry.
- "not handled (no branch found)" means the code has no branch for that state; nothing is invented.
- App-wide UI mounted once in the root layout (`apps/mobile/app/_layout.tsx:108-112`) covers every mobile screen and is not repeated per entry: `OfflineBanner` (shows after 1.5 s offline, `components/Banner.tsx:38`, :48-73), `ToastHost`, `SessionExpiredSheet`. TanStack Query is wired to NetInfo and AppState (`src/lib/queryClient.ts:39-50`, called at `_layout.tsx:48`), so mounted queries pause offline and refetch on reconnect. A mobile States line that says offline is "not handled" means no screen-level branch; the global banner still shows.
- Screen ids (A01, B01, E08, F09, X04 ...) come from `docs/DESIGN_SYSTEM.md` section 10 (lines 190-325) or the file comments; X-frames from `apps/mobile/src/features/dev/stateFrames.tsx`.
- Short paths like `src/features/...` in the audit tables are relative to `apps/mobile/`.

## Slice files

- [01 Auth, launch and system](screens/01-auth-system.md)
- [02 Discover, listing, search and saved](screens/02-discover-listing-search.md)
- [03 Sell flow and campus posts](screens/03-sell.md)
- [04 Offers, inbox, chat, deal and meetup](screens/04-offers-inbox-chat-deal-meetup.md)
- [05 Feed and Quad](screens/05-feed-quad.md)
- [06 Profile, settings and user profile](screens/06-profile-settings-user.md)
- [07 Notifications, safety, report, help and legal](screens/07-notifications-safety-help-legal.md)
- [08 Shared components and tokens](screens/08-components-tokens.md)
- [09 Admin console](screens/09-admin.md)

## Path table (all 123 checklist paths)

Kinds: screen / layout / redirect / dev-only / admin page / admin infra. Counts: 71 screen, 11 layout, 3 redirect, 4 dev-only, 27 admin page, 7 admin infra.

### 01 Auth, launch and system

| Path | Kind | Entry | Note |
|---|---|---|---|
| apps/mobile/app/index.tsx | screen | [Launch (A01)](screens/01-auth-system.md#01-launch) | Launch gate view; native splash match plus [launch animation overlay](screens/01-auth-system.md#01-launch-animation) (DEC 135) |
| apps/mobile/app/_layout.tsx | layout | [Root layout](screens/01-auth-system.md#01-root-layout) | Root Stack, mounts SessionExpiredSheet, OfflineBanner, ToastHost, LaunchIntro; ErrorBoundary -> CrashScreen |
| apps/mobile/app/(tabs)/_layout.tsx | layout | [Tabs layout](screens/01-auth-system.md#01-tabs-layout) | Tabs registered :68-73, quad hidden (DEC 130), custom TabBar, no Inbox badge passed |
| apps/mobile/app/(auth)/_layout.tsx | layout | [Auth layout](screens/01-auth-system.md#01-auth-layout) | Plain Stack, headerShown false; shared frame in [AuthStep](screens/01-auth-system.md#01-auth-step) |
| apps/mobile/app/(auth)/welcome.tsx | screen | [Welcome (A02)](screens/01-auth-system.md#01-welcome) | Accent screen with drifting listing wall (DEC 89), Continue and "I already have an account" |
| apps/mobile/app/(auth)/email.tsx | screen | [School email (A03)](screens/01-auth-system.md#01-email) | Sign-up mode (step 1 of 5) and login mode `?mode=login` (DEC 140, no-account card) |
| apps/mobile/app/(auth)/verify.tsx | screen | [Verify code (A04)](screens/01-auth-system.md#01-verify) | 6-digit code, step 2 of 5, lockout, reverify mode |
| apps/mobile/app/(auth)/age.tsx | screen | [Age check (A05)](screens/01-auth-system.md#01-age) | OS age signal first, birthday fallback; [Not eligible](screens/01-auth-system.md#01-age-blocked) sub-state |
| apps/mobile/app/(auth)/profile-setup.tsx | screen | [Profile setup (A06)](screens/01-auth-system.md#01-profile-setup) | Name, optional photo and year, step 4 of 5 |
| apps/mobile/app/(auth)/rules.tsx | screen | [Community rules (A07)](screens/01-auth-system.md#01-rules) | Four rules, 13+ checkbox, step 5 of 5; `?updated=1` variant |
| apps/mobile/app/(auth)/allow-notifications.tsx | screen | [Notifications primer (A08)](screens/01-auth-system.md#01-allow-notifications) | Push primer; route differs from design doc name `notifications.tsx` |
| apps/mobile/app/(system)/_layout.tsx | layout | [System layout](screens/01-auth-system.md#01-system-layout) | Stack with swipe-back disabled for gate states |
| apps/mobile/app/(system)/account-status.tsx | screen | [Account status (X04)](screens/01-auth-system.md#01-account-status) | Paused, suspended, banned plus [appeal sheet](screens/01-auth-system.md#01-appeal-sheet) (component in features/safety) |
| apps/mobile/app/(system)/maintenance.tsx | screen | [Maintenance (X06)](screens/01-auth-system.md#01-maintenance) | EmptyState with optional "back around" time |
| apps/mobile/app/(system)/reverify.tsx | screen | [Re-verify (X03)](screens/01-auth-system.md#01-reverify) | Yearly student check, sends code then Verify in reverify mode |
| apps/mobile/app/(system)/update.tsx | screen | [Update required (X05)](screens/01-auth-system.md#01-update) | Forced update; opens website /download, not the store |
| apps/mobile/app/(system)/waitlist.tsx | screen | [Campus waitlist (A09)](screens/01-auth-system.md#01-waitlist) | Ring progress, invite link copy/share, polls every 60 s |
| apps/mobile/app/unlocked.tsx | screen | [Campus open (A10)](screens/01-auth-system.md#01-unlocked) | One-time confetti celebration; root-level route outside the (system) group |
| apps/mobile/app/link-error.tsx | screen | [Link didn't work (X12)](screens/01-auth-system.md#01-link-error) | EmptyState, kind link; target of invalid /l/ links |
| apps/mobile/app/+not-found.tsx | screen | [Nothing here (X12)](screens/01-auth-system.md#01-not-found) | EmptyState, kind missing; unmatched paths |
| apps/mobile/app/+native-intent.tsx | redirect | [Native intent](screens/01-auth-system.md#01-native-intent) | Rewrites universal links, remembers invite code; no UI. Related sheet: [Session expired (X02)](screens/01-auth-system.md#01-session-expired) mounted from root layout |

### 02 Discover, listing, search and saved

| Path | Kind | Entry | Note |
|---|---|---|---|
| apps/mobile/app/(tabs)/discover/_layout.tsx | layout | [Discover stack layout](screens/02-discover-listing-search.md#02-discover-layout) | Plain Stack, no header; Discover draws its own large title |
| apps/mobile/app/(tabs)/discover/index.tsx | screen | [Discover (B01)](screens/02-discover-listing-search.md#02-discover) | Swipe deck, coach, end of deck, day-one hero, list mode, undo, offline queue |
| apps/mobile/app/(tabs)/discover/campus.tsx | redirect | [Discover campus redirect](screens/02-discover-listing-search.md#02-discover-campus) | Redirects old Around campus links to /feed (DEC 98) |
| apps/mobile/app/listing/[id]/index.tsx | screen | [Listing detail (B02)](screens/02-discover-listing-search.md#02-listing) | Buyer, owner, hold, sold, removed, gone, blocked, other campus; options sheet B03 renders inside it |
| apps/mobile/app/listing/[id]/photos.tsx | screen | [Photo viewer (B04)](screens/02-discover-listing-search.md#02-listing-photos) | Full screen modal with fade, pinch to zoom, swipe down to close |
| apps/mobile/app/listing/[id]/comments.tsx | screen | [Listing comments (DEC 121)](screens/02-discover-listing-search.md#02-listing-comments) | Not linked from the listing screen; reached from Feed card and push |
| apps/mobile/app/listing/[id]/stats.tsx | screen | [Listing stats (F04)](screens/02-discover-listing-search.md#02-listing-stats) | Owner only (server NOT_FOUND otherwise); feature lives in features/me/MeScreens.tsx |
| apps/mobile/app/search/_layout.tsx | layout | [Search stack layout](screens/02-discover-listing-search.md#02-search-layout) | Plain Stack, no header |
| apps/mobile/app/search/index.tsx | screen | [Search (B06)](screens/02-discover-listing-search.md#02-search) | Recent, recently viewed, suggestions; filters sheet B08 is listed under results |
| apps/mobile/app/search/results.tsx | screen | [Search results (B07)](screens/02-discover-listing-search.md#02-search-results) | Grid, save search, no results; filters sheet at screens/02-discover-listing-search.md#02-search-filters |
| apps/mobile/app/saved/index.tsx | screen | [Saved (B09)](screens/02-discover-listing-search.md#02-saved) | Items and Searches tabs, price-drop word, alerts toggles |

### 03 Sell flow and campus posts

| Path | Kind | Entry | Note |
|---|---|---|---|
| apps/mobile/app/(tabs)/sell/_layout.tsx | layout | [Sell stack layout](screens/03-sell.md#03-sell-layout) | Stack, headerShown false; steps draw their own "New listing" bar |
| apps/mobile/app/(tabs)/sell/index.tsx | screen | [Sell photos (D01)](screens/03-sell.md#03-sell-photos) | Step 1 of 3; restore sheet, permission primer, per-photo retry |
| apps/mobile/app/(tabs)/sell/details.tsx | screen | [Sell details (D02)](screens/03-sell.md#03-sell-details) | Step 2 of 3; all errors at once, give-away, price hint |
| apps/mobile/app/(tabs)/sell/meetup.tsx | screen | [Sell meetup (D03)](screens/03-sell.md#03-sell-meetup) | Step 3 of 3; spot list, banned-items checkbox, Post |
| apps/mobile/app/(tabs)/sell/posted.tsx | screen | [Sell posted (D04)](screens/03-sell.md#03-sell-posted) | Success, share card preparing/failed, haptic success |
| apps/mobile/app/(tabs)/sell/scan.tsx | screen | [Sell scan (D02 variant)](screens/03-sell.md#03-sell-scan) | ISBN scan; haptic success at SellScanScreen.tsx:73 is out of budget |
| apps/mobile/app/(tabs)/sell/food.tsx | screen | [Post free food (C02)](screens/03-sell.md#03-post-food) | Top-bar Post button, icon note box |
| apps/mobile/app/(tabs)/sell/news.tsx | screen | [Post news](screens/03-sell.md#03-post-news) | Up to 4 photos, link, event date/time/place |
| apps/mobile/app/(tabs)/sell/wanted.tsx | screen | [Post a Wanted (C03)](screens/03-sell.md#03-post-wanted) | Requests board post; budget, need-by, alerts |
| apps/mobile/app/listing/[id]/edit.tsx | screen | [Edit listing (F06)](screens/03-sell.md#03-edit-listing) | Renders EditListingScreen from features/me/MeScreens.tsx:702 |
| apps/mobile/app/listing/[id]/relist.tsx | screen | [Relist (F08)](screens/03-sell.md#03-relist) | Renders RelistScreen from features/me/MeScreens.tsx:830 |

### 04 Offers, inbox, chat, deal and meetup

| Path | Kind | Entry | Note |
|---|---|---|---|
| apps/mobile/app/(tabs)/inbox/_layout.tsx | layout | [Inbox stack layout (E01)](screens/04-offers-inbox-chat-deal-meetup.md#04-inbox-layout) | Plain Stack, header hidden; Inbox draws its own large title |
| apps/mobile/app/(tabs)/inbox/index.tsx | screen | [Inbox (E01)](screens/04-offers-inbox-chat-deal-meetup.md#04-inbox) | Buying / Selling, Needs you then Earlier; two panes on iPad |
| apps/mobile/app/offer/[id].tsx | screen | [Offer (E02)](screens/04-offers-inbox-chat-deal-meetup.md#04-offer) | Every status x role (E3-E8), counter and decline sheets, withdraw dialog |
| apps/mobile/app/listing/[id]/offer.tsx | screen | [Make an offer (B05)](screens/04-offers-inbox-chat-deal-meetup.md#04-offer-sheet) | Modal; amount, note, bundle, free "Ask for it", sent state |
| apps/mobile/app/listing/[id]/offers.tsx | screen | [Offers on this listing (F05)](screens/04-offers-inbox-chat-deal-meetup.md#04-listing-offers) | Seller's offer history in arrival order |
| apps/mobile/app/listing/[id]/sold.tsx | screen | [Mark sold (F07)](screens/04-offers-inbox-chat-deal-meetup.md#04-mark-sold) | Modal; pick the buyer or "Someone not on OnlySwap"; opened from chat with buyer preselected (DEC 97) |
| apps/mobile/app/chat/[id]/index.tsx | screen | [Chat (E03)](screens/04-offers-inbox-chat-deal-meetup.md#04-chat) | Safety tip, pending/failed, scam hint, blocked/closed, new-contact photo blur; also hosts the Meetup card |
| apps/mobile/app/chat/[id]/details.tsx | screen | [Chat details (E04)](screens/04-offers-inbox-chat-deal-meetup.md#04-chat-details) | Mute, view listing/profile, report, block, hide |
| apps/mobile/app/chat/[id]/deal.tsx | screen | [Did it sell? (E07)](screens/04-offers-inbox-chat-deal-meetup.md#04-did-it-sell) | Modal "sold?" popup: Yes all done / Not yet / It fell through |
| apps/mobile/app/chat/[id]/meetup.tsx | screen | [Plan the pickup (E05)](screens/04-offers-inbox-chat-deal-meetup.md#04-plan-meetup) | Modal; spots, custom place, day, time |
| apps/mobile/app/deal/[chatId]/rate.tsx | screen | [Rate the swap (E08)](screens/04-offers-inbox-chat-deal-meetup.md#04-rate) | Submit, waiting, revealed phases |
| apps/mobile/app/meetup/[id].tsx | screen | [Meetup day (E06)](screens/04-offers-inbox-chat-deal-meetup.md#04-meetup-day) | Time, place, check-in, handoff code, cancel, no-show, 911 |

### 05 Feed and Quad

| Path | Kind | Entry | Note |
|---|---|---|---|
| apps/mobile/app/(tabs)/feed/_layout.tsx | layout | [Feed layout](screens/05-feed-quad.md#05-feed-layout) | Stack, headerShown false; Feed draws its own large title (DEC 98) |
| apps/mobile/app/(tabs)/feed/index.tsx | screen | [Feed (C01)](screens/05-feed-quad.md#05-feed) | CampusFeedScreen; also hosts the Quad chip view (DEC 130) |
| apps/mobile/app/(tabs)/quad/_layout.tsx | layout | [Quad layout](screens/05-feed-quad.md#05-quad-layout) | Stack, headerShown false; tab hidden via href null in (tabs)/_layout.tsx:71 |
| apps/mobile/app/(tabs)/quad/index.tsx | redirect | [Quad tab index (redirect)](screens/05-feed-quad.md#05-quad-redirect) | Redirects /quad to /feed?kind=quad[&sort] (DEC 130); the Quad feed itself is [Quad feed (Q02)](screens/05-feed-quad.md#05-quad-feed) |
| apps/mobile/app/quad/[id].tsx | screen | [Quad post thread (Q05)](screens/05-feed-quad.md#05-quad-thread) | Post, aliased replies, reply composer at bottom |
| apps/mobile/app/quad/activity.tsx | screen | [Quad activity (Q13)](screens/05-feed-quad.md#05-quad-activity) | Quad-group notifications; filtered client side after paging |
| apps/mobile/app/quad/mine.tsx | screen | [Your Quad (Q12)](screens/05-feed-quad.md#05-quad-mine) | Own posts and replies with status tag and appeal sheet |
| apps/mobile/app/quad/muted.tsx | screen | [Muted and hidden (Q14)](screens/05-feed-quad.md#05-quad-muted) | Unhide people, manage muted words |
| apps/mobile/app/quad/new.tsx | screen | [Quad new post (Q07)](screens/05-feed-quad.md#05-quad-new) | Text/photo/poll/check-in; Post button in the top bar, not docked |

### 06 Profile, settings and user profile

| Path | Kind | Entry | Note |
|---|---|---|---|
| apps/mobile/app/(tabs)/profile/_layout.tsx | layout | [Profile stack layout](screens/06-profile-settings-user.md#06-profile-layout) | Stack with headerShown false; screens draw their own header |
| apps/mobile/app/(tabs)/profile/index.tsx | screen | [Profile tab (F01)](screens/06-profile-settings-user.md#06-profile-tab) | Tab root; dev links only in __DEV__; no large title rendered |
| apps/mobile/app/(tabs)/profile/edit.tsx | screen | [Edit profile (F02)](screens/06-profile-settings-user.md#06-edit-profile) | Save button at end of scroll, not docked |
| apps/mobile/app/(tabs)/profile/listings.tsx | screen | [My listings (F03)](screens/06-profile-settings-user.md#06-my-listings) | Away and moving-out controls sit above the grid |
| apps/mobile/app/user/[id].tsx | screen | [Seller profile (B10)](screens/06-profile-settings-user.md#06-user-profile) | Gone and blocked states; founding badge shown |
| apps/mobile/app/settings/index.tsx | screen | [Settings (F10)](screens/06-profile-settings-user.md#06-settings) | Four grouped cards with colored icon tiles |
| apps/mobile/app/settings/about.tsx | screen | [About (F18)](screens/06-profile-settings-user.md#06-settings-about) | Version and legal links; duplicate data row |
| apps/mobile/app/settings/appearance.tsx | screen | [Appearance (F14)](screens/06-profile-settings-user.md#06-settings-appearance) | Theme radios, app icon picker, Lock Screen toggle |
| apps/mobile/app/settings/blocked.tsx | screen | [Blocked accounts (F13)](screens/06-profile-settings-user.md#06-settings-blocked) | Renders features/safety/AccountScreens.tsx, not a me feature file |
| apps/mobile/app/settings/data.tsx | screen | [Download your data (F17)](screens/06-profile-settings-user.md#06-settings-data) | Text heavy; offline and rate-limit handled |
| apps/mobile/app/settings/delete.tsx | screen | [Delete account (F16)](screens/06-profile-settings-user.md#06-settings-delete) | Renders features/safety/AccountScreens.tsx; literal DELETE match |
| apps/mobile/app/settings/language.tsx | screen | [Language (P17-FEAT-03)](screens/06-profile-settings-user.md#06-settings-language) | Radio list; restart confirm on change |
| apps/mobile/app/settings/notifications.tsx | screen | [Notification settings (F11)](screens/06-profile-settings-user.md#06-settings-notifications) | Up to ten toggles plus quiet hours |
| apps/mobile/app/settings/privacy.tsx | screen | [Privacy (F12)](screens/06-profile-settings-user.md#06-settings-privacy) | Two toggles; silent revert on failure |
| apps/mobile/app/settings/school.tsx | screen | [Change school email (F15)](screens/06-profile-settings-user.md#06-settings-school) | .edu regex gate; sent banner replaces form |

### 07 Notifications, safety, report, help and legal

| Path | Kind | Entry | Note |
|---|---|---|---|
| apps/mobile/app/notifications/index.tsx | screen | [Notifications (F09)](screens/07-notifications-safety-help-legal.md#07-notifications) | Day-grouped list, photo or initial per row, Mark all read; bell entry documented at #07-notification-bell |
| apps/mobile/app/safety/index.tsx | screen | [Safety center (F19)](screens/07-notifications-safety-help-legal.md#07-safety-center) | 911, tips, meetup spots with map and Directions, banned items |
| apps/mobile/app/report/[id].tsx | screen | [Report update (E21)](screens/07-notifications-safety-help-legal.md#07-report-update) | Received/Reviewed timeline; only entered from a report_update push |
| apps/mobile/app/help/index.tsx | screen | [Help (F20)](screens/07-notifications-safety-help-legal.md#07-help) | FAQ accordion plus contact form; component lives in features/safety/SafetyScreens.tsx |
| apps/mobile/app/help/email-access.tsx | screen | [I can't get into my school email (F20/D11)](screens/07-notifications-safety-help-legal.md#07-email-access) | Signed-out support form, docked Send, sent state |
| apps/mobile/app/legal/[doc].tsx | screen | [Legal pages (X11)](screens/07-notifications-safety-help-legal.md#07-legal) | Bundled markdown for terms, privacy, rules; missing-page empty state |

### 08 Shared components and tokens

| Path | Kind | Entry | Note |
|---|---|---|---|
| apps/mobile/app/dev/kit.tsx | dev-only | [Kit (dev)](screens/08-components-tokens.md#08-dev-kit) | dev-only; redirects to /discover when not __DEV__ (kit.tsx:7); renders features/dev/KitScreen.tsx |
| apps/mobile/app/dev/spikes.tsx | dev-only | [Spikes (dev)](screens/08-components-tokens.md#08-dev-spikes) | dev-only; redirects to /discover when not __DEV__ (spikes.tsx:7); renders features/dev/SpikesScreen.tsx |
| apps/mobile/app/dev/states/index.tsx | dev-only | [States gallery (dev)](screens/08-components-tokens.md#08-dev-states) | dev-only; list of board X frames; redirects when not __DEV__ (index.tsx:7) |
| apps/mobile/app/dev/states/[id].tsx | dev-only | [State frame (dev)](screens/08-components-tokens.md#08-dev-states-id) | dev-only; one X frame by id param; redirects when not __DEV__ ([id].tsx:8) |

### 09 Admin console

| Path | Kind | Entry | Note |
|---|---|---|---|
| apps/admin/src/auth.tsx | admin page | [Admin gate (09-auth-gate)](screens/09-admin.md#09-auth-gate) | AdminGate states loading, login, denied, mfa; also [Email sign-in](screens/09-admin.md#09-auth-email-login), [Not an admin](screens/09-admin.md#09-auth-access-denied), [Two-step check](screens/09-admin.md#09-auth-mfa) |
| apps/admin/src/feed.tsx | admin infra | [FeedRow](screens/09-admin.md#09-feed-feedrow) | one activity event row, used by Overview only |
| apps/admin/src/main.tsx | admin infra | [Route table](screens/09-admin.md#09-routes) | mounts AdminGate then SessionProvider then router; 27 page routes (1 staging-only) and 6 redirects |
| apps/admin/src/pickers.tsx | admin infra | [SearchPicker](screens/09-admin.md#09-pickers-searchpicker) | person/listing filter chip; used by Activity |
| apps/admin/src/search.tsx | admin infra | [GlobalSearch](screens/09-admin.md#09-search-globalsearch) | top-bar search with Cmd/Ctrl+K, in every Page |
| apps/admin/src/session.tsx | admin infra | [SessionProvider](screens/09-admin.md#09-infra-session) | who, campus, nav counts; owner vs moderator campus rule |
| apps/admin/src/shell.tsx | admin infra | [Shell](screens/09-admin.md#09-shell-shell), [NotFoundPage](screens/09-admin.md#09-notfoundpage) | sidebar, drawer under 900px, not-found screen, unused ComingSoon |
| apps/admin/src/ui.tsx | admin infra | [UI kit](screens/09-admin.md#09-ui-button) | 36 runtime exports plus types; component table in admin-comp-table.md |
| apps/admin/src/pages/Activity.tsx | admin page | [Activity (/activity)](screens/09-admin.md#09-page-activity) | audit-style event feed; ?user and ?listing params consumed but unlinked |
| apps/admin/src/pages/Announcements.tsx | admin page | [Announcements (/announcements)](screens/09-admin.md#09-page-announcements) | banner history and owner post form; push confirm is window.confirm |
| apps/admin/src/pages/Audit.tsx | admin page | [Audit (/audit)](screens/09-admin.md#09-page-audit) | read-only staff action history, filter and CSV |
| apps/admin/src/pages/BannedEmails.tsx | admin page | [Settings: Banned emails (/settings/blocked-emails)](screens/09-admin.md#09-page-bannedemails) | owner section inside Settings |
| apps/admin/src/pages/BannedWords.tsx | admin page | [Settings: Banned words (/settings/words)](screens/09-admin.md#09-page-bannedwords) | table plus form; owner edits |
| apps/admin/src/pages/Campus.tsx | admin page | [Campuses (/campuses)](screens/09-admin.md#09-page-campus) | school settings, status, domains, meetup spots, Add school |
| apps/admin/src/pages/Categories.tsx | admin page | [Settings: Categories (/settings/categories)](screens/09-admin.md#09-page-categories) | reads table directly; client-side next id |
| apps/admin/src/pages/Config.tsx | admin page | [Settings: App switches (/settings/switches)](screens/09-admin.md#09-page-config) | switches and limits; reason via window.prompt |
| apps/admin/src/pages/DataRequests.tsx | admin page | [Settings: Data requests (/settings/data)](screens/09-admin.md#09-page-datarequests) | read-only deletions and exports |
| apps/admin/src/pages/Health.tsx | admin page | [Settings: System health (/settings/health)](screens/09-admin.md#09-page-health) | read-only health KPIs |
| apps/admin/src/pages/ListingDetail.tsx | admin page | [Listing detail (/listings/$id)](screens/09-admin.md#09-page-listingdetail) | tabs and moderation actions |
| apps/admin/src/pages/Listings.tsx | admin page | [Listings (/listings)](screens/09-admin.md#09-page-listings) | moderation queue with bulk actions; Pager guesses next page |
| apps/admin/src/pages/Meetups.tsx | admin page | [Meetups (/meetups)](screens/09-admin.md#09-page-meetups) | upcoming and past meetups, repeat no-shows |
| apps/admin/src/pages/Metrics.tsx | admin page | [Metrics (/metrics)](screens/09-admin.md#09-page-metrics) | KPI strip and charts; embeds Ratings |
| apps/admin/src/pages/Overview.tsx | admin page | [Overview (/)](screens/09-admin.md#09-page-overview) | staff landing: numbers, waiting items, events |
| apps/admin/src/pages/Person.tsx | admin page | [Person (/people/$id)](screens/09-admin.md#09-page-person) | densest page, 8 tabs |
| apps/admin/src/pages/Quad.tsx | admin page | [Quad (/quad)](screens/09-admin.md#09-page-quad) | anonymous posts moderation; owner reveals author |
| apps/admin/src/pages/Ratings.tsx | admin page | [Metrics: ratings block (/metrics)](screens/09-admin.md#09-page-ratings) | no route; rendered only by Metrics.tsx:20 |
| apps/admin/src/pages/Reports.tsx | admin page | [Reports (/reports, /reports/$id)](screens/09-admin.md#09-page-reports) | also exports AppealsPage (/appeals, anchor 09-page-appeals) |
| apps/admin/src/pages/ReviewAccounts.tsx | admin page | [Settings: Review accounts (/settings/review)](screens/09-admin.md#09-page-reviewaccounts) | owner section; store reviewer logins |
| apps/admin/src/pages/Settings.tsx | admin page | [Settings (/settings)](screens/09-admin.md#09-page-settings) | frame and sub-nav for 9 sections |
| apps/admin/src/pages/Staging.tsx | admin page | [Settings: Staging tools (/settings/staging)](screens/09-admin.md#09-page-staging) | staging builds only |
| apps/admin/src/pages/Support.tsx | admin page | [Support (/support, /support/$id)](screens/09-admin.md#09-page-support) | inbox: reply, note, close |
| apps/admin/src/pages/Team.tsx | admin page | [Settings: Team (/settings/team)](screens/09-admin.md#09-page-team) | owner only; default Settings landing |
| apps/admin/src/pages/Users.tsx | admin page | [People (/people)](screens/09-admin.md#09-page-users) | list page; route is /people, file is Users.tsx |
| apps/admin/src/pages/Waitlist.tsx | admin page | [Waitlist (/waitlist)](screens/09-admin.md#09-page-waitlist) | demand by email domain, open campus, add school |

<a id="shared-components"></a>
## Shared components (mobile)

All 40 files in `apps/mobile/src/components/` plus `Icon`, with props and variants read from each file. "Used in" counts JSX uses across `apps/mobile/src/features` and `apps/mobile/app`.

| Component | File:line | Props / variants | States | Used in (count) | Entry |
|---|---|---|---|---|---|
| Avatar | apps/mobile/src/components/Avatar.tsx:36 | size S/M/L; fill shade/accent; letters 1/2; name, uri | initials / photo; image error not handled | 13 (11 files) | [entry](screens/08-components-tokens.md#08-avatar) |
| Badge | apps/mobile/src/components/Badge.tsx:12 | count (0 hidden, 1-99, 99+) | hidden at 0; non-interactive | 0 direct (via IconButton) | [entry](screens/08-components-tokens.md#08-badge) |
| Banner | apps/mobile/src/components/Banner.tsx:18 | kind offline/info/warning/error; OfflineBanner (:48) | offline slide-in (fade with reduce motion) | 53 (29 files) | [entry](screens/08-components-tokens.md#08-banner) |
| Button | apps/mobile/src/components/Button.tsx:46 | variant primary/dark/secondary/text/destructive/onAccent/textOnAccent; size L/M/S; loading, disabled, fullWidth, hapticOnPress | pressed, loading, disabled 35%, no focus ring | 182 (50 files) | [entry](screens/08-components-tokens.md#08-button) |
| Card | apps/mobile/src/components/Card.tsx:8 | onPress optional, no variants | pressed only when onPress | 1 (kit only) | [entry](screens/08-components-tokens.md#08-card) |
| Chip | apps/mobile/src/components/Chip.tsx:30 | selected, disabled, onRemove, icon, surface bg2/card, role choice/tab; ChipGroup single/multi | off, on (ink), disabled, pressed | 41 (23 files) | [entry](screens/08-components-tokens.md#08-chip) |
| ConfirmDialog | apps/mobile/src/components/ConfirmDialog.tsx:32 | title, message, confirmLabel, destructive, onConfirm (async) | busy spinner, inline error, reset on open | 12 (10 files) | [entry](screens/08-components-tokens.md#08-confirmdialog) |
| CrashScreen | apps/mobile/src/components/CrashScreen.tsx:23 | error, retry | retrying spinner | 1 (app/_layout.tsx) | [entry](screens/08-components-tokens.md#08-crashscreen) |
| EmptyState | apps/mobile/src/components/EmptyState.tsx:44 | icon, title, body, tile neutral/accent, suggestions, action, secondaryAction; GlyphTile (:26) | the empty state itself | 49 (25 files) | [entry](screens/08-components-tokens.md#08-emptystate) |
| ErrorState | apps/mobile/src/components/ErrorState.tsx:37 | error, onRetry, layout screen/inline, campusTimeZone | offline vs generic, retry spinner | 46 (32 files) | [entry](screens/08-components-tokens.md#08-errorstate) |
| IconButton | apps/mobile/src/components/IconButton.tsx:40 | icon, filled, surface bg2/card/accent, tone ink/ink3/onPhoto, selected, badge | pressed, disabled, selected, badge | 36 (23 files) | [entry](screens/08-components-tokens.md#08-iconbutton) |
| MessageBubble | apps/mobile/src/components/MessageBubble.tsx:68 | kind mine/theirs/system; state pending/sent/failed; photo, scamHint, surface bg/card, first/last, time | pending 60%, failed + retry, blurred photo, upload progress | 2 (1 file) | [entry](screens/08-components-tokens.md#08-messagebubble) |
| Input | apps/mobile/src/components/Input.tsx:49 | kind text/email/price/search; label, error, disabled, loading, hideLabel, inlineLabel | default, focus ring, error, disabled, loading | 41 (21 files) | [entry](screens/08-components-tokens.md#08-input) |
| ListingTile | apps/mobile/src/components/ListingTile.tsx:27 | state default/sold/hold; note, photo, blurhash | pressed, sold 50% + tag, hold tag | 4 (4 files) | [entry](screens/08-components-tokens.md#08-listingtile) |
| ListRow | apps/mobile/src/components/ListRow.tsx:28 | icon, iconTile, value, destructive, right; GroupedList (:81) header/footer/surface bg2/card | pressed (grey fill, no scale), destructive | 58 (9 files) | [entry](screens/08-components-tokens.md#08-listrow) |
| Mark | apps/mobile/src/components/Mark.tsx:14 | size, tone ink/onAccent/inverse/accent | static | 6 (7 files) | [entry](screens/08-components-tokens.md#08-mark) |
| NavBar | apps/mobile/src/components/NavBar.tsx:33 | variant large/inline; leading back/close/none; trailing; tone default/onPhoto; safeTop | large title / inline title | 78 (35 files) | [entry](screens/08-components-tokens.md#08-navbar) |
| OptionRow | apps/mobile/src/components/OptionRow.tsx:19 | kind radio/checkbox; description; Checkbox (:61) | off, on, disabled; no press feedback | 12 (7 files) | [entry](screens/08-components-tokens.md#08-optionrow) |
| OTPInput | apps/mobile/src/components/OTPInput.tsx:49 | value, onChange, onComplete, error, disabled, autoFocus | active, filled, empty, error shake + warning haptic | 4 (4 files) | [entry](screens/08-components-tokens.md#08-otpinput) |
| PermissionPrimer | apps/mobile/src/components/PermissionPrimer.tsx:96 | kind camera/photos/notifications; PermissionPrimerView step primer/settings (:37) | primer, denied -> Settings, busy | 7 (6 files) | [entry](screens/08-components-tokens.md#08-permissionprimer) |
| Photo | apps/mobile/src/components/Photo.tsx:50 | aspectRatio, fill, rounded none/thumb/card, contentFit, backdrop, blurRadius, blurhash | loading blurhash, loaded fade, error placeholder | 26 (22 files) | [entry](screens/08-components-tokens.md#08-photo) |
| PhotoCarousel | apps/mobile/src/components/PhotoCarousel.tsx:55 | photos, label, aspectRatio, onPressPhoto, onIndexChange | paging, count pill, empty placeholder | 2 (3 files) | [entry](screens/08-components-tokens.md#08-photocarousel) |
| Progress | apps/mobile/src/components/Progress.tsx:26 | StepIndicator (step, total) :26; ProgressBar (value, label) :56 | animated fill (jump with reduce motion) | 8 (7 files) | [entry](screens/08-components-tokens.md#08-progress) |
| ReportSheet | apps/mobile/src/components/ReportSheet.tsx:125 | target listing/user/chat/message/quad_post/quad_reply/listing_comment; name, onSubmit | form, submitting, sent, duplicate, error, crisis note | 7 (9 files) | [entry](screens/08-components-tokens.md#08-reportsheet) |
| SegmentedControl | apps/mobile/src/components/SegmentedControl.tsx:21 | 2-4 segments with badge/badgeLabel; surface bg2/bg3 | selected; no press feedback; throws if not 2-4 | 11 (8 files) | [entry](screens/08-components-tokens.md#08-segmentedcontrol) |
| Sheet | apps/mobile/src/components/Sheet.tsx:38 | visible, title; ActionSheet (:163) actions; iPad floating card | open spring, drag close, fade with reduce motion | 21 (17 files) | [entry](screens/08-components-tokens.md#08-sheet) |
| ShellScreen | apps/mobile/src/components/ShellScreen.tsx:14 | testID | placeholder text only | 0 (dead) | [entry](screens/08-components-tokens.md#08-shellscreen) |
| Skeleton | apps/mobile/src/components/Skeleton.tsx:58 | SkeletonBlock :58, SkeletonCard :128, SkeletonList :142 (rows), SkeletonGrid :161 (tiles), useDelayedLoading :23 | pulse; static with reduce motion | 46 (31 files) | [entry](screens/08-components-tokens.md#08-skeleton) |
| Stepper | apps/mobile/src/components/Stepper.tsx:23 | min, max, step, decreaseLabel, increaseLabel | min/max disable, adjustable a11y | 1 (kit only) | [entry](screens/08-components-tokens.md#08-stepper) |
| SuccessCheck | apps/mobile/src/components/SuccessCheck.tsx:13 | visible, accessibilityLabel | 400 ms draw; fade with reduce motion | 7 (7 files) | [entry](screens/08-components-tokens.md#08-successcheck) |
| TabBar | apps/mobile/src/components/TabBar.tsx:67 | items (prominent, badge); variant ios/android; layout bar/rail | active/inactive, badge, prominent Sell; no press feedback | 3 (2 files) | [entry](screens/08-components-tokens.md#08-tabbar) |
| Tag | apps/mobile/src/components/Tag.tsx:17 | tone neutral/accent/green/amber/red | static | 20 (11 files) | [entry](screens/08-components-tokens.md#08-tag) |
| Tappable | apps/mobile/src/components/Tappable.tsx:45 | guard; layout-only style; SMALL_SLOP, useGuardedPress | press scale 0.97 / opacity with reduce motion; 500 ms guard | 52 (29 files) | [entry](screens/08-components-tokens.md#08-tappable) |
| Text | apps/mobile/src/components/Text.tsx:38 | variant display/title/heading/price/body/bodyStrong/label/meta; tone (12); overlay | Dynamic Type on, overlay cap 1.4x | 530 (78 files) | [entry](screens/08-components-tokens.md#08-text) |
| TextArea | apps/mobile/src/components/TextArea.tsx:21 | maxLength, error, disabled, counter | default, focus, error, disabled, counter amber 90% / red 100% | 15 (14 files) | [entry](screens/08-components-tokens.md#08-textarea) |
| Toast | apps/mobile/src/components/Toast.tsx:42 | ToastHost + useToastStore: show(kind info/success/error), showUndo | visible 4 s / undo 5 s, fade in, no exit | 1 JSX; store in 25 files | [entry](screens/08-components-tokens.md#08-toast) |
| Toggle | apps/mobile/src/components/Toggle.tsx:16 | label, value, description | off, on (ink), disabled; knob jumps; no press feedback | 18 (11 files) | [entry](screens/08-components-tokens.md#08-toggle) |
| TurnstileField | apps/mobile/src/components/TurnstileField.tsx:27 | siteKey, onToken, resetKey; useTurnstile (:78) | web only; null on native | 0 direct (hook in 3 files) | [entry](screens/08-components-tokens.md#08-turnstilefield) |
| WebDateInput | apps/mobile/src/components/WebDateInput.tsx:36 | value, min, max, onChange, label | default, focus; web only | 2 (2 files) | [entry](screens/08-components-tokens.md#08-webdateinput) |
| ZoomableImage | apps/mobile/src/components/ZoomableImage.tsx:53 | source, blurhash, onDismiss | pinch 1-4x, double-tap, swipe down; reduce motion fade | 3 (3 files) | [entry](screens/08-components-tokens.md#08-zoomableimage) |
| Icon | apps/mobile/src/components/icons/Icon.tsx:32 | name (64 glyphs), size, tone, strokeWidth, filled | decorative; none | 45 (26 files) | [entry](screens/08-components-tokens.md#08-icon) |

<a id="admin-shared-components"></a>
## Admin shared components

Every export of `apps/admin/src/{ui,search,pickers,shell}.tsx` (plus `FeedRow` from `feed.tsx`) with variants, states and the pages that use it. Each links to its full entry in [09-admin.md](screens/09-admin.md); the routed NotFoundPage has a screen entry at [screens/09-admin.md#09-notfoundpage](screens/09-admin.md#09-notfoundpage).

# Admin component table (09a)

Paths are under `apps/admin/src/`. Used-by = pages files / matching lines in `apps/admin/src/pages/*.tsx` (grep `<Name` and `Name(`). Hooks and helpers are listed because they are exports of the kit. Types (`RpcState`, `Column`, `PersonRef`, `ListingRef`, `ButtonVariant`, `SegOption`, `ReasonAction`, `CampusOption`, `LoadMoreState`, `Picked`) are documented inside their component entries.

| Control | File:line | Variants / props | States | Used by pages (count) | Entry |
|---|---|---|---|---|---|
| useRpc | apps/admin/src/ui.tsx:15 | fn, args, skip | loading, error, reload (keeps old data) | 23 files / 37 | [entry](screens/09-admin.md#09-ui-userpc) |
| Loadable | apps/admin/src/ui.tsx:45 | state, empty, emptyText, rows | error+retry, loading skeleton, empty, content | 22 / 31 | [entry](screens/09-admin.md#09-ui-loadable) |
| money | apps/admin/src/ui.tsx:65 | cents | null-safe | 0 (dead) | [entry](screens/09-admin.md#09-ui-money) |
| media | apps/admin/src/ui.tsx:71 | key | '' without media host | 1 / 2 (Quad) | [entry](screens/09-admin.md#09-ui-media) |
| Icon | apps/admin/src/ui.tsx:178 | name (34 icons), size | decorative | 3 / 4 direct | [entry](screens/09-admin.md#09-ui-icon) |
| Page | apps/admin/src/ui.tsx:198 | title, crumb, actions | sets document.title | 16 / 17 | [entry](screens/09-admin.md#09-ui-page) |
| Card | apps/admin/src/ui.tsx:229 | title, right, pad, label, className | container, hairline | 25 / 53 | [entry](screens/09-admin.md#09-ui-card) |
| CardHeader | apps/admin/src/ui.tsx:256 | title, right, className | none | 0 direct (Card, Dialog) | [entry](screens/09-admin.md#09-ui-cardheader) |
| Table | apps/admin/src/ui.tsx:276 | columns, compact, label, className | none (wrapped by Loadable) | 21 / 40 | [entry](screens/09-admin.md#09-ui-table) |
| Pill | apps/admin/src/ui.tsx:314 | tone (7), dot, label, title | tone only | 10 / 20 | [entry](screens/09-admin.md#09-ui-pill) |
| StatusPill | apps/admin/src/ui.tsx:335 | Labeled spread, dot | hidden if no label | 19 / 45 | [entry](screens/09-admin.md#09-ui-statuspill) |
| EventIcon | apps/admin/src/ui.tsx:341 | tone, icon | tone only | 3 / 3 (+FeedRow) | [entry](screens/09-admin.md#09-ui-eventicon) |
| Avatar | apps/admin/src/ui.tsx:356 | initial, seed, photo, size lg, me | photo, initial, '?' | 2 / 2 (+Shell, cells) | [entry](screens/09-admin.md#09-ui-avatar) |
| PersonCell | apps/admin/src/ui.tsx:387 | person, sub, link | deleted account, no name, link/plain | 11 / 23 | [entry](screens/09-admin.md#09-ui-personcell) |
| ListingCell | apps/admin/src/ui.tsx:428 | listing, size lg, showPrice | none, no photo, no price | 4 / 6 | [entry](screens/09-admin.md#09-ui-listingcell) |
| Button | apps/admin/src/ui.tsx:460 | variant (6), size sm, icon | hover, disabled, on, focus; no loading | 20 / 48 | [entry](screens/09-admin.md#09-ui-button) |
| Segmented | apps/admin/src/ui.tsx:490 | options, value, onChange, label, full | selected | 10 / 12 | [entry](screens/09-admin.md#09-ui-segmented) |
| FilterChip | apps/admin/src/ui.tsx:522 | label, icon, children | focus-within | 7 / 22 | [entry](screens/09-admin.md#09-ui-filterchip) |
| Field | apps/admin/src/ui.tsx:541 | label, hint, className | none (error/required not built in) | 12 / 57 | [entry](screens/09-admin.md#09-ui-field) |
| Switch | apps/admin/src/ui.tsx:562 | checked, onChange, label, disabled | on, off, disabled | 2 / 2 | [entry](screens/09-admin.md#09-ui-switch) |
| Pager | apps/admin/src/ui.tsx:587 | hasPrev, hasNext, onPrev, onNext, info | prev/next disabled, hidden when empty | 8 / 8 | [entry](screens/09-admin.md#09-ui-pager) |
| Sparkline | apps/admin/src/ui.tsx:618 | points, dir, width, height | up, down, flat | 0 direct (Kpi) | [entry](screens/09-admin.md#09-ui-sparkline) |
| Kpi | apps/admin/src/ui.tsx:643 | label, value, delta, dir, series, to | link or static | 4 / 20 | [entry](screens/09-admin.md#09-ui-kpi) |
| Bar | apps/admin/src/ui.tsx:678 | pct, lime | clamped 0-100 | 6 / 7 | [entry](screens/09-admin.md#09-ui-bar) |
| EmptyState | apps/admin/src/ui.tsx:689 | title, children | empty | 14 / 26 | [entry](screens/09-admin.md#09-ui-emptystate) |
| ErrorState | apps/admin/src/ui.tsx:698 | message, onRetry | error + retry | 4 / 4 (+Loadable, MoreList) | [entry](screens/09-admin.md#09-ui-errorstate) |
| Loading | apps/admin/src/ui.tsx:708 | rows | skeleton, reduce-motion stop | 5 / 5 (+Loadable, MoreList) | [entry](screens/09-admin.md#09-ui-loading) |
| ActionButton | apps/admin/src/ui.tsx:726 | label, run, onDone, kind, needsReason, confirm, size, reasonPrompt | confirm, prompt, validation, busy, Done/error | 8 / 12 | [entry](screens/09-admin.md#09-ui-actionbutton) |
| ReasonActions | apps/admin/src/ui.tsx:804 | actions[], onDone, placeholder | reason validation, confirm, two-step extra, busy, Done/error | 3 / 4 | [entry](screens/09-admin.md#09-ui-reasonactions) |
| downloadCsv | apps/admin/src/ui.tsx:889 | name, csv | no feedback | 3 / 3 | [entry](screens/09-admin.md#09-ui-downloadcsv) |
| CampusSelect | apps/admin/src/ui.tsx:910 | campuses, value, onChange, allLabel, label | none | 0 (dead) | [entry](screens/09-admin.md#09-ui-campusselect) |
| Dialog | apps/admin/src/ui.tsx:943 | title, onClose, wide | Escape/backdrop close; no focus trap | 2 / 2 | [entry](screens/09-admin.md#09-ui-dialog) |
| LoggedNote | apps/admin/src/ui.tsx:987 | children | static | 4 / 4 | [entry](screens/09-admin.md#09-ui-loggednote) |
| Stat | apps/admin/src/ui.tsx:996 | label, value | none | 1 / 6 (Person) | [entry](screens/09-admin.md#09-ui-stat) |
| useLoadMore | apps/admin/src/ui.tsx:1009 | fn, args, skip | loading, more, error, hasMore | 3 / 8 | [entry](screens/09-admin.md#09-ui-useloadmore) |
| MoreList | apps/admin/src/ui.tsx:1059 | state, emptyText, rows | error, loading, empty, Load more pending | 3 / 8 | [entry](screens/09-admin.md#09-ui-morelist) |
| GlobalSearch | apps/admin/src/search.tsx:11 | none (Cmd/Ctrl+K) | under-2 chars, searching, error, empty, results | every Page (16 files) | [entry](screens/09-admin.md#09-search-globalsearch) |
| SearchPicker | apps/admin/src/pickers.tsx:12 | kind people|listings, label, value, onChange, anyLabel | closed, hint, no matches, error, selected; no loading | 1 / 2 (Activity) | [entry](screens/09-admin.md#09-pickers-searchpicker) |
| Shell | apps/admin/src/shell.tsx:12 | none (owner/moderator campus block, drawer under 900px) | counts null, drawer open/closed, owner vs moderator | root route | [entry](screens/09-admin.md#09-shell-shell) |
| NotFoundPage | apps/admin/src/shell.tsx:131 | none | static | root + default not-found (main.tsx:35,108) | [entry](screens/09-admin.md#09-notfoundpage) |
| ComingSoon | apps/admin/src/shell.tsx:147 | title, crumb | static | 0 (dead) | [entry](screens/09-admin.md#09-shell-comingsoon) |
| FeedRow | apps/admin/src/feed.tsx:10 | e, now | deleted account, deal_done pair, no listing | 1 (Overview) | [entry](screens/09-admin.md#09-feed-feedrow) |

<a id="current-tokens"></a>
## Current tokens (mobile)

Source of truth: `packages/tokens/tokens.json` (227 lines). It generates `packages/tokens/dist/unistyles.ts` (mobile) and `packages/tokens/dist/tokens.css` (site and admin) via `packages/tokens/scripts/generate.mjs`, with tests in `packages/tokens/test/tokens.test.mjs` (DESIGN_SYSTEM.md:5-7). DESIGN_SYSTEM.md:9 says app code never uses raw hex, font sizes or spacing numbers; the audit below confirms 0 raw hex and 1 literal font size.

### Color (default accent: Pistachio)

| Token | Light | Dark | tokens.json |
|---|---|---|---|
| bg | #FFFFFF | #0C0C0D | :5 / :31 |
| bg2 | #F3F3F0 | #1A1A1C | :6 / :32 |
| bg3 | #E8E8E3 | #262629 | :7 / :33 |
| card | #FFFFFF | #2A2A2D | :8 / :34 |
| line | #E6E6E1 | #28282B | :9 / :35 |
| line2 | #CFCFC9 | #3D3D41 | :10 / :36 |
| ink | #111110 | #F3F3EF | :11 / :37 |
| ink2 | #5A5A54 | #A6A69F | :12 / :38 |
| ink3 | #6F6F68 | #9A9A93 | :13 / :39 |
| red / redBg | #C8321C / #FCEBE7 | #FF5A40 / #2C1511 | :14-15 / :40-41 |
| green / greenBg | #12703F / #E5F3EA | #3DD68C / #0F2A1C | :16-17 / :42-43 |
| amber / amberBg | #9A6200 / #FBF0DA | #F5B84B / #2A2110 | :18-19 / :44-45 |
| sky / skyBg | #1A5FA6 / #E2F0FF | #8CC3FF / #13263A | :20-21 / :46-47 |
| peach / peachBg | #9A4414 / #FFE9D9 | #FFB58A / #36200F | :22-23 / :48-49 |
| lilac / lilacBg | #5B45C4 / #ECE7FF | #B9A9FF / #231D40 | :24-25 / :50-51 |
| overlay | rgba(0,0,0,0.45) | rgba(0,0,0,0.6) | :26 / :52 |
| onPhoto / photoBg | #FFFFFF / #000000 | #FFFFFF / #000000 | :27-28 / :53-54 |
| accent (Pistachio) | #C8E27D | #C8E27D | :58 |
| onAccent | #111110 | #0C0C0D | :59-60 |

Other accents defined but not selectable by users (DESIGN_SYSTEM.md:45): butter #FFD95A, tangerine #FF9A4D, coral #FF7B67, bubblegum #FFA3D1, sky #7CC0FF, cobalt #2B45E8 with white onAccent (`tokens.json:62-91`); `defaultAccent` "pistachio" at `:93`. The app pins it: `APP_ACCENT = defaultAccent`, `makeTheme('light'|'dark', APP_ACCENT)` (`apps/mobile/src/theme/themes.ts:7-10`), and Unistyles registers both themes (`apps/mobile/src/theme/unistyles.ts:15-18`).

### Type

| Style | Size | Weight | Tracking | Line | tokens.json |
|---|---|---|---|---|---|
| display | 34 | 800 | -0.04 | 1.05 | :96-101 |
| title | 26 | 800 | -0.035 | 1.1 | :102-107 |
| heading | 20 | 700 (specWeight 750) | -0.025 | 1.2 | :108-114 |
| price | 28 | 800, tabular | -0.04 | 1.0 | :115-121 |
| body | 16 | 400 | 0 | 1.5 | :122-127 |
| bodyStrong | 16 | 600 (specWeight 650) | 0 | 1.5 | :128-134 |
| label | 14 | 600 | 0 | 1.3 | :135-140 |
| meta | 12.5 | 500 | 0 | 1.35 | :141-146 |

`$comment` at `:147`: React Native only accepts weights in hundreds, so the spec's 750 and 650 render as 700 and 600. `fontScale.overlayMax` 1.4 at `:224-226` is applied only through `Text`'s `overlay` prop (`apps/mobile/src/components/Text.tsx:51-52`).

### Space, radius, size, elevation, motion

| Group | Values | tokens.json |
|---|---|---|
| space | xs 4, sm 8, md 12, lg 16, xl 24, 2xl 32, screen 20, rowMin 52 | :149-158 |
| radius | chip 999, control 15, card 18, sheet 28, thumb 12, avatar 999 | :159-166 |
| size | hit 44; buttonL 54, buttonM 44, buttonS 36; toggle 51x31; otpCell 52; avatar S/M/L 32/44/72; glyphTile 88, glyphIcon 38; tabIcon 25; tabPill 64x32; badge 18; stepBar 4; progressBar 8; navBar 46; copyMax 320 | :167-189 |
| elevation.soft | #000000, opacity 0.12, offsetY 8, blur 24 | :190-197 |
| motion | tap scale 0.97 / 120 ms; sheet spring 22/240; swipe spring 18/180, flyOut 220; success 400 ms; fade 150 ms; skeleton 1300 ms, delay 300 | :198-223 |

### Theme, motion, haptics and layout facts

- `liftShadow()` builds a `boxShadow` from `elevation.soft` at a quarter of the offset and a third of the blur, for floating circles (`apps/mobile/src/theme/shadow.ts:10-18`).
- Size classes: compact < 600, regular 600-1023, wide >= 1024; readableMax 640, feedMax 680, deckMax 520, sheetMax 560, railWidth 230, inboxListWidth 330, tileMin 220, grid 2-5 columns (`apps/mobile/src/theme/layout.ts:20-41`).
- Motion kinds `tap | sheet | swipe | success | fade` (`apps/mobile/src/theme/motion.ts:14`); `resolveMotion` turns every kind into the 150 ms linear fade when Reduce Motion is on (`motion.ts:24-37`); `usePressFeedback` scales to 0.97, or fades to 0.7 opacity under Reduce Motion (`motion.ts:60-80`); `useSuccessProgress` draws the check over 400 ms or fades it in (`motion.ts:86-108`). Reduce Motion is read live (`apps/mobile/src/theme/reducedMotion.ts:14-29`).
- Haptics: `HapticKind = 'selection' | 'success' | 'warning'` and one `haptic()` helper (`apps/mobile/src/lib/haptics.ts:8-21`), with the UX-09 budget in its comment (`:3-7`). Every call site is mapped in [DESIGN_REVIEW.md section 2.8](DESIGN_REVIEW.md#haptic-map).
- Strings: `apps/mobile/src/strings/en.ts` (2416 lines) and `es.ts` (2332 lines), keyed by top-level `export const` sections (e.g. `errors` :33, `states` :90, `sell` :715, `feed` :881, `offers` :1087, `chat` :1199). Tests that pin copy: `apps/mobile/__tests__/{copy.test.ts,i18n.test.tsx,webApp.test.tsx}`.

<a id="admin-tokens"></a>
## Current tokens (admin)

`apps/admin/src/styles.css` (1955 lines) imports the shared `tokens.css` (`styles.css:6`) and reads only its `--color-*` variables; it defines nine admin-only custom properties at `styles.css:10-18` (`--a-page #fbfbf9`, `--a-soft #f4f4f0`, `--a-soft2 #ecece6`, `--a-hover #fafaf7`, `--a-lime50 #f4f9e4`, `--a-lime100 #e6f1c4`, `--a-limeInk #4f6a0c`, `--a-shadow 0 1px 2px rgba(0,0,0,.08)`, `--a-pop 0 12px 32px rgba(0,0,0,.14)`), plus fonts and layout at `:19-24` (`--a-font`, `--a-mono`, `--a-side 232px`, `--a-top 56px`). It uses none of the package space, radius or type tokens, and the console pins light mode (`apps/admin/index.html:2`). The full inventory, including the rules that define recurring components, is at [screens/09-admin.md#09-styles-tokens](screens/09-admin.md#09-styles-tokens); the critique is in [DESIGN_REVIEW.md section 2.10](DESIGN_REVIEW.md#admin-tokens-critique).

<a id="inconsistencies"></a>
## Inconsistencies found

Grep results over `apps/mobile` (counts exclude `src/features/dev/` unless noted). Summary: 0 raw hex colors; 1 literal font size; 9 literal padding/margin/gap numbers (six 0 resets, three 2s); 8 ActivityIndicator sites vs 42 skeleton uses; 0 Alert.alert vs 11 ConfirmDialog; 1 maxFontSizeMultiplier site with about 9 out-of-rule `overlay` uses; 0 emoji in en.ts / es.ts; 483 `<Text` nodes in feature files; 99 IconButton/Tappable sites, 0 confirmed missing labels; heading weight 700 vs spec 750; 4 out-of-budget haptics.

Root: /Users/wasifkarim/Code/OnlySwap/apps/mobile. Scope `src/features` + `src/components` unless noted. Counts exclude `src/features/dev/` (reported separately). No file in the repo was modified.

### 1. Raw hex colors
Command: `rg -n --glob '*.{ts,tsx}' '#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b' src/features src/components`

| Metric | Value |
|---|---|
| Total (non-dev) | 0 |
| Files | 0 |
| src/features/dev | 0 |

Widened check: `rg -n '#[0-9A-Fa-f]{3,8}' --glob '*.{ts,tsx}' src app` returns 0 hits, and quoted-string form is also 0. `rgba(` in src/features + src/components is also 0. No top files. Result: clean.

### 2. Literal `fontSize:` number
Command: `rg -n --glob '*.{ts,tsx}' 'fontSize:\s*[0-9]' src/features src/components`

Total 1, files 1, dev 0.

| File:line | Hit |
|---|---|
| src/features/sell/ShareCard.tsx:93 | `price: { fontSize: 54, lineHeight: 60 }` |

### 3. Literal padding / margin / gap numbers
Commands: `rg -n --glob '*.{ts,tsx}' '\b(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical)?:\s*-?[0-9]' src/features src/components` and `... '\bgap:\s*[0-9]'`

Padding/margin: total 8, files 7, dev 0. Gap: total 1, files 1, dev 0. Combined 9 hits in 8 files. Six are literal 0 (reset), three are literal 2.

| File:line | Hit | Note |
|---|---|---|
| src/components/MessageBubble.tsx:306 | `paddingHorizontal: 0` | reset |
| src/components/MessageBubble.tsx:307 | `paddingVertical: 0` | reset |
| src/features/feed/ListingScreen.tsx:718 | `paddingHorizontal: 0, paddingTop: 0` (one line, 2 matches counted as 1 line) | reset |
| src/features/offers/OfferSheetScreen.tsx:352 | `paddingVertical: 0` | reset |
| src/components/Toggle.tsx:55 | `padding: 2` | literal 2 |
| src/features/sell/PhotoGrid.tsx:312 | `paddingVertical: 2` | literal 2 |
| src/features/sell/ShareCard.tsx:97 | `paddingVertical: 2` | literal 2 |
| src/features/sell/SellMeetupScreen.tsx:344 | `marginTop: 2` | literal 2 |
| src/features/campus/PostNewsScreen.tsx:413 | `gap: 2` | literal 2 |

(The 8 padding/margin lines: MessageBubble x2, ListingScreen, OfferSheet, Toggle, PhotoGrid, ShareCard, SellMeetup. Gap line: PostNewsScreen.) Only non-zero, non-reset literal is `2`; no 4/8/12/16 literals found.

### 4. ActivityIndicator vs Skeleton
Commands: `rg -n 'ActivityIndicator' src app --glob '*.{ts,tsx}'`; `rg -n '<Skeleton(Block|Card|List|Grid)\b' src app`.

ActivityIndicator JSX sites: 8 (in 8 files incl. components), 0 in dev, 0 in app/.

| File:line | Waiting for |
|---|---|
| src/components/Input.tsx:110 | async validation / lookup on a text field (`loading` prop) |
| src/components/Button.tsx:100 | button action in flight (`loading` prop, hidden when idle, a11y-hidden) |
| src/features/comments/CommentsScreen.tsx:310 | "view more replies" fetch (loadReplies) |
| src/features/comments/CommentsScreen.tsx:425 | next page of comments (list footer, isFetchingNextPage) |
| src/features/campus/CampusFeedScreen.tsx:377 | next page of campus feed (list footer) |
| src/features/auth/ReverifyScreen.tsx:66 | account query before reverify screen can render |
| src/features/auth/AgeScreen.tsx:219 | OS age-signal check (phase 'checking') |
| src/features/auth/RulesScreen.tsx:82 | rules config query |

Skeleton JSX uses (non-dev, outside Skeleton.tsx): 42. SkeletonList 39 (28 feature files: MeScreens x6, QuadMoreScreens x4, SavedScreen/SafetyScreens/AccountScreens/QuadFeedScreen/DealScreens x2 each, 1 each in ~20 others). SkeletonCard 2 (ListingScreen.tsx:175, DiscoverScreen.tsx:221). SkeletonGrid 1 (ResultsScreen.tsx:101). SkeletonBlock 0 externally (10 internal uses in src/components/Skeleton.tsx; defined :58, Card :128, List :142, Grid :161). Dev: 4 uses (stateFrames.tsx:197, KitSections2.tsx:168,171, plus 1 SkeletonList).

Ratio: 42 skeleton uses vs 8 spinner sites. Remaining full-screen spinners (ReverifyScreen, AgeScreen, RulesScreen) are the only whole-screen loading states not using a skeleton.

### 5. Alert.alert vs ConfirmDialog
Commands: `rg -n 'Alert\.alert' src app` and `rg -n 'ConfirmDialog' src app | grep -v import`.

Alert.alert: 0 sites (the only `Alert` hit is the string `alertMe` at src/strings/en.ts:2127). ConfirmDialog JSX sites: 11 non-dev + 1 dev, plus definition src/components/ConfirmDialog.tsx:32.

| File:line |
|---|
| src/features/deals/DealScreens.tsx:108 |
| src/features/chat/ChatDetailsScreen.tsx:132 |
| src/features/quad/useQuadActions.tsx:189 |
| src/features/profiles/ProfileViewScreen.tsx:254 |
| src/features/me/MeScreens.tsx:811 |
| src/features/meetups/MeetupDayScreen.tsx:354 |
| src/features/meetups/MeetupDayScreen.tsx:368 |
| src/features/me/SettingsScreens.tsx:155 |
| src/features/me/SettingsScreens.tsx:285 |
| src/features/comments/CommentsScreen.tsx:545 |
| src/features/offers/OfferScreen.tsx:289 |
| src/features/dev/KitSections2.tsx:303 (dev) |

### 6. maxFontSizeMultiplier and the `overlay` prop
Command: `rg -n 'maxFontSizeMultiplier' src app --glob '*.{ts,tsx}'`

Direct sites: 1.
| File:line | Value |
|---|---|
| src/components/Text.tsx:52 | `overlay ? fontScaleTokens.overlayMax : undefined`; overlayMax = 1.4 at packages/tokens/tokens.json:225 |

Text.tsx: prop doc at :30 ("Text drawn over photos or in the tab bar: Dynamic Type capped at 1.4x"), default `overlay = false` at :41, `allowFontScaling` always on :51. No other file sets the prop directly, so the cap is only reachable via `overlay`.

Rule (docs/DESIGN_SYSTEM.md:70): 1.4 only on photo overlays and the tab bar. `<Text ... overlay>` call sites (non-dev 21 lines; 1 more in dev SpikesScreen.tsx:141):

| Site | On photo / tab bar? |
|---|---|
| MessageBubble.tsx:149, :156 (tone onPhoto) | in-rule (photo cover) |
| PhotoCarousel.tsx:135 (onPhoto) | in-rule |
| FeedPost.tsx:139 (onPhoto) | in-rule |
| TabBar.tsx:117, :127, :181, :189 | in-rule (tab labels and badges) |
| Badge.tsx:22 | borderline: badge is drawn on icons/tab bar; used by IconButton and TabBar |
| MeScreens.tsx:190 | in-rule (price tag over listing photo, gridPhoto) |
| DealAvatar.tsx:42 | out-of-rule: initials fallback text inside avatar, no photo |
| OTPInput.tsx:84 | out-of-rule (comment at :83 justifies: fixed-size digit cells) |
| SegmentedControl.tsx:52 | out-of-rule (selected-segment label, `inverse` tone) |
| WaitlistScreen.tsx:185, :295, :298 | out-of-rule (progress ring text and a label on accent) |
| ReplyRow.tsx:29 | out-of-rule (colored badge text) |
| QuadFeedScreen.tsx:290 | out-of-rule (FAB label "Post"; fixed-size pill) |

Out-of-rule or borderline count: about 9 sites in 8 files (DealAvatar, OTPInput, SegmentedControl, WaitlistScreen x3, ReplyRow, QuadFeedScreen, Badge). Most are fixed-size containers where the cap prevents clipping, so the rule text in DESIGN_SYSTEM.md:70 is narrower than the practice. Either widen the doc ("fixed-size chrome") or drop `overlay` from these.

### 7. Emoji in strings
Command: `rg -n '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' src/strings/en.ts src/strings/es.ts`
Hits: 0 (no output) in both files.

### 8. `<Text` count per feature file
Command: `rg -c '<Text\b' src/features src/components app --glob '*.tsx'`

Totals: features non-dev 483 in 73 files; src/components 67 in 28 files; app/ 2 in 1 file; dev 45.

Top 15 feature files (non-dev):
| Count | File |
|---|---|
| 24 | src/features/feed/ListingScreen.tsx |
| 23 | src/features/safety/SafetyScreens.tsx |
| 21 | src/features/me/MeScreens.tsx |
| 15 | src/features/quad/QuadMoreScreens.tsx |
| 15 | src/features/campus/FeedPost.tsx |
| 14 | src/features/widgets/MeetupLiveActivity.tsx |
| 13 | src/features/waitlist/WaitlistScreen.tsx |
| 13 | src/features/offers/OfferSheetScreen.tsx |
| 13 | src/features/campus/CampusCards.tsx |
| 12 | src/features/sell/SellMeetupScreen.tsx |
| 12 | src/features/meetups/MeetupDayScreen.tsx |
| 11 | src/features/profiles/ProfileViewScreen.tsx |
| 10 | src/features/sell/SellDetailsScreen.tsx |
| 10 | src/features/auth/ProfileSetupScreen.tsx |
| 10 | src/features/auth/EmailScreen.tsx |

Per-slice totals (count, files): auth 64/10, campus 57/8, quad 48/9, sell 42/8, feed 38/6, offers 32/5, safety 30/2, me 30/2, meetups 26/5, widgets 23/2, waitlist 17/2, comments 16/3, profiles 11/1, deals 9/1, chat 8/1, notifications 7/2, saved 7/1, search 6/2, legal 6/1, appIcon 4/1, help 2/1. dev 45/6 (excluded). Top components: MessageBubble.tsx 8, ReportSheet.tsx 6, TabBar.tsx 5.

### 9. Accessibility labels (IconButton, Tappable)
Method: python parser (read-only) extracted the full JSX opening element for every `<IconButton`/`<Tappable` in src/features, src/components, app, tracking brace depth so multi-line props are included; then classified. Totals match `rg` (99 sites incl. 4 in dev).

Enforcement:
- IconButton: `accessibilityLabel: string` is a required prop (src/components/IconButton.tsx:15-16, "Required: icon-only controls must be named"), TypeScript-enforced; it is applied at :63-67 (suffixed with the badge count via navCopy.tabWithBadge when a badge exists). There is no `label=` prop; only `accessibilityLabel` counts.
- Tappable: no enforcement or default. Props are `Omit<PressableProps, ...>` (src/components/Tappable.tsx:29) and are spread to Pressable (:50); `accessibilityLabel` is optional and nothing defaults it. A bare Tappable with only a `<Text>` child would rely on RN's child-text fallback.

| Class | IconButton | Tappable | Total |
|---|---|---|---|
| Explicit accessibilityLabel= | 39 | 60 | 99 |
| Spread props only | 0 | 0 | 0 |
| Accessible text child only | 0 | 0 | 0 |
| Confirmed missing | 0 | 0 | 0 |

By area (non-dev, 95 sites): features Tappable 52, features IconButton 32, components Tappable 8 (incl. IconButton.tsx's own), components IconButton 3, app/ 0. Dev 4.

Confirmed-missing defects: none. Four labels are conditional expressions, each always yields a non-empty string: SavedScreen.tsx:224, FeedPost.tsx:284 (`a11yLabel ?? label`), SearchScreen.tsx:226, Chip.tsx:45.

Adjacent (not in the requested set): raw `<Pressable` without accessibilityLabel: OTPInput.tsx:78 (role none, wrapper that focuses the hidden input), PhotoCarousel.tsx:121 (`accessible={false}`, deliberate), Tappable.tsx:49 (the wrapper), and dev/test-only: KitScreen.tsx:84, SpikesScreen.tsx:54,116, MediaCheck.tsx:87,90, app/(tabs)/profile/index.tsx:15,22 (role link; verify the Link child text if these ship).

### 10. `heading` weight
packages/tokens/tokens.json: `"heading"` at :108, `"weight": "700"` at :110, `"specWeight": 750` at :113. Confirmed. Comment at :147 explains RN only accepts hundreds, so 750 renders as 700 (and 650 as 600, specWeight at :133).

### 11. Haptics
Command: `rg -n -i 'haptic' src app --glob '*.{ts,tsx}'` returns 39 lines. Definition: src/lib/haptics.ts (`HapticKind = 'selection' | 'success' | 'warning'` :8, `haptic()` :10). Of the 39: 9 imports/type imports, 14 comments/docs/definition lines, and 9 call sites below plus the Button prop plumbing (Button.tsx:26,53,81). Budget per docs/DESIGN_SYSTEM.md:97-102.

| File:line | Kind | Triggering event | Budget |
|---|---|---|---|
| src/features/feed/SwipeDeck.tsx:286 `runOnJS(haptic)('selection')` | selection | pan crosses release threshold (once, guarded by `armed`) | in-budget |
| src/components/OTPInput.tsx:65 | warning | `error` prop set, with the error shake | in-budget |
| src/features/offers/OfferSheetScreen.tsx:165 | success | offer sent (after api.make/counter) | in-budget |
| src/features/offers/OfferScreen.tsx:95 | success | offer accepted | in-budget |
| src/features/sell/SellPostedScreen.tsx:69 | success | listing posted screen mounts with listing | in-budget |
| src/features/auth/RulesScreen.tsx:163 | selection | toggling the "I agree" checkbox | OUT-of-budget |
| src/features/sell/SellScanScreen.tsx:73 | success | ISBN lookup found a book | OUT-of-budget |
| src/features/auth/VerifyScreen.tsx:144 | success | email code verified (after verifyCode / reverify) | OUT-of-budget |
| src/features/sell/SellDetailsScreen.tsx:265 | warning | Next pressed with validation or banned-word errors (no shake in the file) | OUT-of-budget (warning is tied to the error shake; this is form validation) |
| src/components/Button.tsx:81 via `hapticOnPress` (type limited to 'success', :26) | success | passed through on press | prop has 0 users in src/ or app/ (dormant); would be in-budget only if used on offer send/accept/post |

In-budget 5, out-of-budget 4, dormant pass-through 1. Known examples confirmed: SwipeDeck.tsx:286 in-budget, RulesScreen.tsx:163 out, SellScanScreen.tsx:73 out. Docs-only mentions (no calls): TabBar.tsx:62, PhotoGrid.tsx:41, VoteControl.tsx:31, deckMath.ts:40, platform.ts:7.
