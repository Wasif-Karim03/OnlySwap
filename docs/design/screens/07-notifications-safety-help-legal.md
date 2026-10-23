# 07 Notifications, safety, report, help and legal

[Index: SCREENS.md](../SCREENS.md) | [Design review: DESIGN_REVIEW.md](../DESIGN_REVIEW.md)

Route files: `apps/mobile/app/notifications/index.tsx`, `apps/mobile/app/safety/index.tsx`, `apps/mobile/app/report/[id].tsx`, `apps/mobile/app/help/index.tsx`, `apps/mobile/app/help/email-access.tsx`, `apps/mobile/app/legal/[doc].tsx`. Feature files: `apps/mobile/src/features/notifications/NotificationsScreen.tsx`, `.../NotificationBell.tsx`, `apps/mobile/src/features/safety/SafetyScreens.tsx` (holds Report update, Safety center AND Help), `.../AppealSheet.tsx`, `apps/mobile/src/components/ReportSheet.tsx` (usage only; the component entry lives in slice 08), `apps/mobile/src/features/help/EmailAccessScreen.tsx`, `apps/mobile/src/features/legal/LegalScreen.tsx`. Note: `app/help/index.tsx` maps to `HelpScreen` in `features/safety/SafetyScreens.tsx`, not to `features/help/`.

<a id="07-notifications"></a>
### Notifications  (F09; empty = X35)
- Source: apps/mobile/app/notifications/index.tsx:3-5 -> apps/mobile/src/features/notifications/NotificationsScreen.tsx:84-214
- Route & entry: `/notifications`, no params; plain push (no presentation override in the route file). Linked from the bell: `apps/mobile/src/features/notifications/NotificationBell.tsx:89` (`router.push('/notifications')`; bell mounted at `features/offers/InboxScreen.tsx:40`, `features/campus/CampusFeedScreen.tsx:212`, `features/campus/DiscoverHeader.tsx:54`, `features/me/MeScreens.tsx:281`); push-tap fallback `apps/mobile/src/lib/push.ts:64,80`; Report update back fallback `SafetyScreens.tsx:37`.
- Purpose: A day-grouped list of what happened (offers, messages, meetups, reports); each row opens its target.
- Roles: any verified person; no role gate in the file (no `isOwner`/status branches found). Signed-out: not handled (no branch found; the query would just error).
- Elements:
  - NavBar, no title, leading back (`NotificationsScreen.tsx:194-207`); back falls back to `/inbox` (`:111`).
  - Trailing text Button "Mark all read" (`copy.markAll`, `:198-204`), only when `unread > 0` (`:197`).
  - Large title as a separate `Text variant="display"` with `accessibilityRole="header"` (`:208-210`), string `notificationsScreen.title`.
  - SectionList with section headers Today / Yesterday / Earlier (`:139-157`, `variant="label" tone="ink3"`); non-sticky (`:151`).
  - Row = Tappable (`:161-166`) with visual (`:168`), title in bold `variant="label"` (`:170`), body `variant="label" tone="ink2"` weight 400 (`:171-173`), relative time `variant="meta" tone="ink3"` (`:174-176`), unread ink dot on the right (`:178-181`, style `:250-256`).
  - Visual (`NotificationVisual`, `:37-76`): listing photo thumb if the notification has a listing id and the listing is visible (`:55-62`), else DealAvatar initial of the actor (`:63-70`), else a quiet glyph in a `bg2` circle (`:71-75`).
  - Pagination: `onEndReached` fetches the next page; page size 30 (`:103-105,152`).
- States:
  - loading: `SkeletonList` (`:124`).
  - empty: `EmptyState icon="bell"` with "No notifications yet" / "Offers, messages and meetup updates show up here." (`:129-136`); no action button (no `action` prop passed).
  - error: `ErrorState` with retry via `q.refetch()` (`:125`).
  - populated: grouped list (`:137-188`); read rows keep a transparent dot to hold alignment (`:255`).
  - long title / body: no `numberOfLines` on title or body, so rows grow (`:170-173`); no truncation branch found.
  - no photo: falls through to initial, then glyph (`:56-75`); a hidden/removed listing (`isVisible` false) also falls through (`:55`).
  - sold / removed listing: only via `isVisible` (`:55`); row still opens via `routeForNotification` (`:119-120`).
  - suspended / banned / blocked user: not handled (no branch found).
  - offline: error path only (`:125`); no offline-specific copy found.
  - reduce motion: not handled in this file (no branch found).
  - Dynamic Type: row `minHeight: theme.space.rowMin` (`:230`) and flex layout, no fixed heights on text; no explicit overflow handling.
  - unread: row a11y label prefixed "Unread." (`:163`); app icon badge synced to `unread` in an effect (`:107-109`).
- Copy: `apps/mobile/src/strings/en.ts` `notificationsScreen` section starts at 1390: title, markAll, today, yesterday, earlier, emptyTitle, emptyBody, unread are 1391-1400; the rest of the block is the Settings screen (other slice). Spanish parity in `es.ts` (same keys).
- Notes:
  - Haptics: none in this file (no `haptic` reference found in `features/notifications/*`). Mark-all and row taps give no haptic, inside the budget (DESIGN_SYSTEM.md:97-102).
  - DEC 90 (docs/DECISIONS_LOG.md:60): person initial or item photo is implemented (`NotificationsScreen.tsx:31-36` comment, `:55-70`). OK.
  - The file comment says "X36 empty" (`:79`) but the state frames list the notifications empty as X35 and X36 as "No listings yet" (`apps/mobile/src/features/dev/stateFrames.tsx:521-540`). docs/DESIGN_SYSTEM.md:274 says "F9, X36". Id mismatch to resolve in docs.
  - Unread dot is ink, not accent, consistent with P2 (`:249` comment).
  - `Text` nodes in the feature file: 5 (`grep -c "<Text"`); each row renders 3.

<a id="07-notification-bell"></a>
### Notification bell (header component, F09 entry)
- Source: no route -> apps/mobile/src/features/notifications/NotificationBell.tsx:25-93
- Route & entry: component, not a screen. Used in four headers (see Notifications entry); pushes `/notifications` (`NotificationBell.tsx:89`).
- Purpose: Shows the unread count on the bell and opens the list.
- Roles: any verified person.
- Elements: `IconButton icon="bell"` with `badge={count}` (`:83-91`); count drawn by IconButton via `badgeText` (`apps/mobile/src/components/IconButton.tsx:53,76`; `components/TabBar.tsx:30-33`: 0 hidden, 1-99, `99+`); the a11y label includes the count through `navCopy.tabWithBadge` "{label}, {count} new" (`IconButton.tsx:58-61`; `strings/en.ts:108`).
- States: loading: count `0` until first fetch (`NotificationBell.tsx:57`, `count ?? 0`); empty: badge hidden at 0; error: silent, count stays 0 (query error not surfaced, no branch found); populated 1-99 and `99+` (see Elements); offline / reduce motion / Dynamic Type / suspended: not handled in this file (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Realtime refresh on `bell` and `inbox` pings, debounced 400 ms (`:15,51-52`); refetch on focus (`:46-50`); `staleTime` 15 s (`:31`).
- Copy: `notificationsScreen.open` / `openUnread` (`strings/en.ts:1391-1393`) exist; the caller passes the label (for example `features/me/MeScreens.tsx:283` `copy.notifications`); `openUnread` is not used in this file (the "{label}, {count} new" pattern is used instead).
- Notes: matches DESIGN_SYSTEM.md:140 (0 hidden, 1-99, 99+, label says the count). Haptics: none. Written for DEC 120 (`NotificationBell.tsx:70`). `Text` nodes: 0.

<a id="07-safety-center"></a>
### Safety center  (F19)
- Source: apps/mobile/app/safety/index.tsx:3-5 -> apps/mobile/src/features/safety/SafetyScreens.tsx:74-189
- Route & entry: `/safety`, no params, plain push. Linked from Settings `apps/mobile/src/features/me/SettingsScreens.tsx:110`. Back falls back to `/profile` (`SafetyScreens.tsx:84`).
- Purpose: Emergency call, meetup tips, public meetup spots with directions, banned items.
- Roles: any verified person; no role gates found.
- Elements:
  - NavBar inline title "Safety" (`SafetyScreens.tsx:88`).
  - Emergency block on a `redBg` card: heading, one line of body, destructive Button "Call 911" opening `tel:911` (`:92-108`; style `:325-331`).
  - "Before you meet" heading and 5 numbered tips, each title + body, one accessible element per tip (`:110-133`).
  - "Meetup spots" heading and one-line help (`:135-140`).
  - `SpotsMap` collapsible map when spots exist (`:145-147`), then one row per spot: name, "description · hours", green "Police-designated" text (`:162-166`), pin IconButton "Directions to {name}" (`:168-172`); selected row gets `bg2` (`:343-352`).
  - "Banned items" heading, intro, bulleted list with a literal bullet character in a Text (`:175-185`).
- States:
  - loading: `SkeletonList rows={3}` while spots load (`:141`); the rest of the page is already visible.
  - empty: no spots -> map and rows simply absent, no copy (`:145,148`); not handled (no branch found).
  - error: `ErrorState layout="inline"` with retry (`:142-144`).
  - populated: map + rows.
  - long names / description: no `numberOfLines` (`:156-161`); wraps.
  - selected spot: map pin highlights the row (`:151-153`).
  - offline / reduce motion / blocked / suspended: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
  - Dynamic Type: rows flexible, no fixed heights (`:343-352`); not explicitly handled.
- Copy: `strings/en.ts` `safety` section, F19 block 1493-1533 (centerTitle, spotsTitle, spotsBody, police, directions, tips, tipItems, emergency, emergencyTitle, emergencyBody, bannedTitle, bannedIntro, banned). Spanish parity in `es.ts`.
- Notes:
  - Haptics: none in this file.
  - `copy.tips` (plain string list, `strings/en.ts:1499-1505`) duplicates `copy.tipItems` (`:1506-1514`); the screen renders only `tipItems` (`SafetyScreens.tsx:114`). Dead copy to remove or reconcile.
  - DEC 90 mock screen 18 puts the emergency action first (`SafetyScreens.tsx:90-91`). It is a tinted `redBg` card plus a red button, so red is both the fill and the action.
  - Green text "Police-designated" is a status color (P3) (`:163`).
  - Body is a `ScrollView` with `readableColumn` (`:89,313-318`); no docked primary (P7), Call 911 sits inside the first card.
  - `Text` nodes: 24 in `SafetyScreens.tsx` (three screens); this screen about 12.

<a id="07-help"></a>
### Help  (F20; X28)
- Source: apps/mobile/app/help/index.tsx:3-5 -> apps/mobile/src/features/safety/SafetyScreens.tsx:194-309
- Route & entry: `/help`, no params, plain push. Linked from Settings `SettingsScreens.tsx:122` and `:378` (Contact), and from the account-status screen `apps/mobile/src/features/safety/AccountScreens.tsx:143`. Back falls back to `/profile` (`SafetyScreens.tsx:213`).
- Purpose: Answer common questions and send a support message.
- Roles: any verified person (email prefilled by prop, default empty, `:196`). Signed-out: not handled here; the "can't get into school email" form is the signed-out path (next entry).
- Elements:
  - NavBar inline "Help" (`SafetyScreens.tsx:236`).
  - "Common questions" heading and 6 accordion rows: Tappable role button with `expanded` state, question bold, answer `ink2` when open (`:238-258`).
  - "Contact us" heading (`:260-262`).
  - Topic label and 4 `Chip`s Question / Safety / Something is broken / Other (`:270-280`).
  - `Input kind="email"` "Your email" (`:281-287`), `TextArea` "Message" max 2000 (`:288-294`).
  - Web bot check element (`:295`), error `Banner kind="error"` (`:296`).
  - `Button` "Send", `loading`, disabled until email and message are non-empty (and bot token on web) (`:297-303`).
  - Sent state: `SuccessCheck` + "Thanks. We'll reply by email." (`:263-267`).
- States:
  - loading: button `loading={busy}` (`:300`); no skeleton (content is bundled).
  - empty: n/a (bundled FAQ).
  - error: red `Banner` with `errorText(e)` or `banner.botCheckFailed` for a failed bot check (`:226-227,296`).
  - populated / expanded accordion (`:251-255`).
  - sent: the form is replaced by check and line; no way back to the form except leaving (`:263-267`).
  - validation: disabled button instead of inline field errors (`:299`).
  - long text: wraps; accordion has no height cap.
  - offline / suspended / blocked: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`); errors surface in the banner only.
  - reduce motion: `SuccessCheck` animates in its own component (outside this slice); accordion has no animation.
  - Dynamic Type: not explicitly handled.
- Copy: `strings/en.ts` `safety` section, F20 block 1534-1569 (helpTitle, faqTitle, faq, contactTitle, contactTopic, topics, contactEmail, contactBody, contactSend, contactSent); `banner.botCheckFailed` at `strings/en.ts:80`.
- Notes:
  - Haptics: none (no success haptic on send; the budget does not list support sent, so correct).
  - The "can't get into my school email" link is NOT on this screen: it is only on the verify screen (`features/auth/VerifyScreen.tsx:243`). docs/DESIGN_SYSTEM.md:285 lists `help/email-access.tsx` under F20 "Help".
  - Send button is inline at the end of a long form, not docked (P7).
  - `Text` nodes: see Safety center (24 in the file); this screen about 8.

<a id="07-email-access"></a>
### I can't get into my school email  (F20 / D11, P4-AUTH-19)
- Source: apps/mobile/app/help/email-access.tsx:3-5 -> apps/mobile/src/features/help/EmailAccessScreen.tsx:34-165
- Route & entry: `/help/email-access`, no params, plain push; works signed out (`EmailAccessScreen.tsx:30-33`). Linked from `apps/mobile/src/features/auth/VerifyScreen.tsx:243` (link "cantAccessEmail"). Back falls back to `/` (`EmailAccessScreen.tsx:52`).
- Purpose: Ask a person to move the account to a new school address.
- Roles: signed-out or any verified person; no gates.
- Elements: `AuthStep` shell with title and body (`:101-106`); `Input` "Email we can reach you at" (`:116-127`); `Input` "School email on your account" (`:128-135`); `TextArea` "What happened" max 1800 (`:136-146`); a `meta` note "A real person reads this..." (`:147-151`); bot check (`:152`); inline red `meta` error with `accessibilityLiveRegion="polite"` (`:153-162`); docked `Button` "Send" in the AuthStep `dock` slot (`:107-113`).
- States:
  - loading: button `loading={sending}` (`:110`).
  - empty: n/a.
  - error: invalid contact -> inline `Input error` (`:55-58,124`); empty message -> red text under the form (`:60-63,153-162`); server or bot error -> same red text (`:75-79`).
  - success: second AuthStep "We got your message" with `GlyphTile icon="mail" tile="accent"`, body with the email, docked "Done" (`:86-98`).
  - long text, offline, suspended, reduce motion, Dynamic Type: not handled in this file (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
- Copy: `strings/en.ts` `emailAccess` section 696-713. Spanish parity in `es.ts`.
- Notes:
  - Haptics: none.
  - Best match for P7: the Send button is docked (`:106-114`).
  - The message sent to support is composed in English only: `School email on the account: ...` (`:26`).
  - TextArea max 1800 (`:143`) vs `MAX_BODY` 2000 (`:20`); the gap leaves room for the school prefix.
  - Error text is `tone="red"` (`:156`): plain-words status, acceptable under P3.
  - `Text` nodes: 3.

<a id="07-report-update"></a>
### Report update  (E21; E09 in DESIGN_SYSTEM.md:259)
- Source: apps/mobile/app/report/[id].tsx:5-8 -> apps/mobile/src/features/safety/SafetyScreens.tsx:34-67
- Route & entry: `/report/[id]`, param `id` (report id), plain push. Only entry is a push of type `report_update`: `apps/mobile/src/lib/push.ts:76-78` (the same helper is used by Notifications rows, `NotificationsScreen.tsx:119-120`). Back falls back to `/notifications` (`SafetyScreens.tsx:37`).
- Purpose: Tell the reporter their report was received and, later, reviewed (generic outcome only).
- Roles: reporter (enforced server-side by `api.report(id)`); no client-side gate. A non-owner id would hit the error state.
- Elements: NavBar inline "Your report" (`SafetyScreens.tsx:63`); a timeline of steps, each label "Received" or "Reviewed" bold plus a short date (`:45-54`); one body line by status (`:55-57`, `testID` `report-received` / `report-reviewed`).
- States:
  - loading: `SkeletonList rows={2}` (`:39`).
  - empty timeline: not handled (no branch found); the body line still renders.
  - error: `ErrorState` with retry (`:40`).
  - received / reviewed: `:42,55-57`.
  - removed or unknown id: falls to the error state (`:40`).
  - offline, reduce motion, Dynamic Type: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
- Copy: `strings/en.ts` `safety` section, E21 block 1480-1484 (reportTitle, reportReceived, reportReviewed, reportReceivedBody, reportReviewedBody).
- Notes:
  - Haptics: none.
  - Steps have no connector or marker, just bold text, a date and a hairline (`SafetyScreens.tsx:319-324`).
  - `Text` nodes: 4 of the 24 in the file.
  - DESIGN_SYSTEM.md:259 says E09 covers "sent timeline, update"; the sent state itself is in `ReportSheet` (below).

<a id="07-report-sheet-usage"></a>
### Report sheet (usage in this slice; component entry is in slice 08)
- Source: no route -> apps/mobile/src/components/ReportSheet.tsx:125-292 (read for context)
- Route & entry: sheet opened from `features/chat/ChatScreen.tsx:548`, `features/comments/CommentsScreen.tsx:529`, and the other importers `features/feed/ListingScreen.tsx`, `features/profiles/ProfileViewScreen.tsx`, `features/chat/ChatDetailsScreen.tsx`, `features/quad/useQuadActions.tsx`. The only link back into slice 07 is the `report_update` push to `/report/[id]` (`lib/push.ts:76-78`).
- Purpose: Pick a reason, add optional details, optionally block, send.
- Roles: any verified person; the block toggle is hidden for listings and Quad targets (`ReportSheet.tsx:81-83,263`).
- Elements: Sheet title by target (`:158-169`); privacy line "Reports are private..." (`:222-227`); radio `OptionRow` list (`:229-239`); crisis box when `self_harm` (`:241-248`); `TextArea` details max 500 (`:249-261`); `Toggle` also block (`:263-274`); red error text (`:276-280`); `Button` "Send report" dark, disabled until a reason is chosen (`:283-289`).
- States: form / submitting (inputs disabled, button `loading`) / sent (`SuccessCheck` + "Report sent", `:192-210`) / duplicate ("Already reported", `:101-104,192-200`); error text in-sheet (`:186`); the sheet cannot close while submitting (`:216`); offline / reduce motion: not handled here (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
- Copy: `strings/en.ts` `report` section 144-232.
- Notes: Haptics: none in this file (no `haptic` reference). The Send button sits below the scroll area so it stays on screen (`:217-220,283`). `Text` nodes: 7.

<a id="07-appeal-sheet"></a>
### Appeal sheet and removal banner  (X10a; DEC 96, DEC 99)
- Source: no route -> apps/mobile/src/features/safety/AppealSheet.tsx:19-81
- Route & entry: sheet with two hosts: the listing screen for a seller whose listing is removed (`apps/mobile/src/features/feed/ListingScreen.tsx:669-677` renders it; the Appeal button at about `:421-429` opens it) and the account-status screen (`features/safety/AccountScreens.tsx:32-65`, outside this slice).
- Purpose: Let the seller contest an admin removal with a reason chip and an optional note.
- Roles: seller / owner only: banner and Appeal render only when `owner && item.status === 'removed'` (`ListingScreen.tsx:406-430`); `held_review` shows an info banner (`:403-405`).
- Elements:
  - Removal banner (in ListingScreen): `Banner kind="warning"` "OnlySwap removed this listing. Reason: {reason}" or "OnlySwap removed this listing. Other students can no longer see it." (`ListingScreen.tsx:406-416`; `strings/en.ts:1786-1787`).
  - Below it: secondary `Button` "Appeal" (`ListingScreen.tsx:421-429`), or after sending a quiet `meta` line "Appeal sent. A person will review it." (`:417-420`).
  - Sheet: title "Appeal" (`AppealSheet.tsx:52`); 3 chips "I didn't do this" / "There's more to the story" / "Something else" (`:54-63`); `TextArea` "Tell us what happened" with placeholder, max 500 (`:64-70`); error `Banner` (`:71`); `Button` "Send appeal" with loading (`:72-77`).
- States: loading: button loading (`AppealSheet.tsx:74`); error: red `Banner` with `errorText` (`:45,71`); `ALREADY_APPEALED` counts as sent (`:44`, DEC 99); sent: sheet closes, the `appealed` line replaces the button and a success Toast shows `safety.appealed` (`ListingScreen.tsx:673-677`); default reason pre-selected `mistake` (`AppealSheet.tsx:32`) so the chip group always has a value; empty note allowed; offline / reduce motion / Dynamic Type: not handled in this file (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
- Copy: `strings/en.ts` `safety` section: `appeal`, `appealed` at 1461-1462; X10a sheet block `appealTitle` .. `appealSend` at 1470-1478; banner strings at 1786-1787.
- Notes:
  - Haptics: none in AppealSheet or the ListingScreen banner (a Toast is shown instead, `ListingScreen.tsx:676`).
  - DEC 96 (docs/DECISIONS_LOG.md:54) banner copy and DEC 99 (:51) Appeal button, sheet and ALREADY_APPEALED handling: match.
  - Appeal is a secondary button under the warning banner, not docked (P7).
  - `Text` nodes in AppealSheet: 0 (labels only through components).

<a id="07-legal"></a>
### Legal pages  (X11; P14-LEGAL-01)
- Source: apps/mobile/app/legal/[doc].tsx:5-8 -> apps/mobile/src/features/legal/LegalScreen.tsx:21-95
- Route & entry: `/legal/[doc]`, param `doc` is a bundled slug (`terms`, `privacy`, `rules` are the ones linked). Linked from Settings `apps/mobile/src/features/me/SettingsScreens.tsx:374-376` and from the rules screen `apps/mobile/src/features/auth/RulesScreen.tsx:41`. Back falls back to `/` (`LegalScreen.tsx:23`).
- Purpose: Read the bundled Terms, Privacy and Rules offline.
- Roles: signed-out or any verified person.
- Elements: NavBar inline with the page title (`LegalScreen.tsx:40`); "Version {version}" `meta` line (`:42-44`); markdown blocks: h2 -> `heading`, h3 -> `bodyStrong` (both `accessibilityRole="header"`, `:46-57`), list items with the marker hidden from VoiceOver (`:58-69`), table rows as a flex row with `label`/`meta` cells (`:70-85`), paragraphs `body` / `bodyStrong` (`:86-90`).
- States: loading: none (bundled); unknown slug: `screen-legal-missing` with `EmptyState icon="info"` "We couldn't find that page" and action "Go back" (`:26-36`); error: same as unknown; long documents: `ScrollView` only, no section index; offline: works (bundled); reduce motion: no animation; Dynamic Type: text only, wraps, not otherwise handled; suspended / blocked: not handled (no branch found).
- Copy: `strings/en.ts` `legal` section 1675-1679 (version, missing, back). The document text is in `apps/mobile/src/legal/generated.ts`.
- Notes: Haptics: none. `Text` nodes: 6. Table rows (`:70-85`) have no table semantics; headings are semantic. No share or open-on-web link.

<a id="07-layouts-note"></a>
### Layout files
None in this slice (no `_layout.tsx` among the six route files). The routes set no per-route `presentation` (`app/notifications/index.tsx:1-5`, `app/safety/index.tsx:1-5`, `app/report/[id].tsx:1-8`, `app/help/index.tsx:1-5`, `app/help/email-access.tsx:1-5`, `app/legal/[doc].tsx:1-8`).
