# 06 Profile, settings and user profile

[Index: SCREENS.md](../SCREENS.md) | [Design review: DESIGN_REVIEW.md](../DESIGN_REVIEW.md)

Route files: `apps/mobile/app/(tabs)/profile/{_layout,index,edit,listings}.tsx`, `apps/mobile/app/user/[id].tsx`, `apps/mobile/app/settings/{index,about,appearance,blocked,data,delete,language,notifications,privacy,school}.tsx`. Feature files: `apps/mobile/src/features/me/MeScreens.tsx` (profile tab, edit, my listings), `apps/mobile/src/features/me/SettingsScreens.tsx` (settings index, privacy, appearance, language, school, about, data), `apps/mobile/src/features/profiles/ProfileViewScreen.tsx` (public profile), `apps/mobile/src/features/appIcon/AppearanceExtras.tsx` (app icon picker, Lock Screen toggle), `apps/mobile/src/features/notifications/NotificationSettingsScreen.tsx`. Two routes map outside the listed feature files: `settings/blocked.tsx` and `settings/delete.tsx` render `apps/mobile/src/features/safety/AccountScreens.tsx` (BlockedScreen :193, DeleteAccountScreen :264); those two entries cite that file. Copy: `me` en.ts:1578-1679, `profileView` en.ts:1045-1082, `settings` en.ts:1681-1763, `safety` en.ts:1435-1577 (F13 :1486-1491, F16 :1569-1575), `notificationsScreen` en.ts:1390-1433. Haptics: no `haptic(` call and no `hapticOnPress` in any of these files (details in each Notes).

<a id="06-profile-layout"></a>
### Profile stack layout
- Source: apps/mobile/app/(tabs)/profile/_layout.tsx:1-6
- Configures a plain `Stack` with `headerShown: false` (:5); each profile screen draws its own header (NavBar or the tab top bar). The comment at :3 says "Profile draws its own large-title header (F01)", but the tab screen renders no title text (see 06-profile-tab Notes).

<a id="06-profile-tab"></a>
### Profile tab  (F01)
- Source: apps/mobile/app/(tabs)/profile/index.tsx:8-33 -> apps/mobile/src/features/me/MeScreens.tsx:115-304
- Route & entry: `/profile`, tab root of the Profile tab, no params. `devLinks` (kit and dev spikes) only when `__DEV__` (index.tsx:12-30). Reached from the tab bar; fallback target of many `leave()` helpers (`router.replace('/profile')`, MeScreens.tsx:317, :506).
- Purpose: show your own identity, one line of real numbers and your Active/Sold listings, with entry points to Notifications, Saved and Settings.
- Roles: any verified user only (own data via `api.me()`, MeScreens.tsx:125). Founding-seller tag gated on `m.founding_seller` (:222-226). No other role gates.
- Elements:
  - Top bar, right aligned: `NotificationBell filled` (label `copy.notifications`, :281-285), `IconButton bookmark filled` -> `/saved` (:286-292), `IconButton gear filled` -> `/settings` (:293-299). No title text in the bar (:280-300).
  - Head: `Avatar size L fill="accent" letters={1}` (:203-209); `Text variant="title"` name with `accessibilityRole="header"` (:211-213); school line `verifiedAt` or `yearAt` plus green check `Icon` (:135-139, :214-221); `Tag` `profileView.founding` tone accent (:222-226).
  - One inline stats line `Text testID="profile-stats"`: "{n} sold", "{n} swaps", "{pct}% thumbs up" only when `thumbs_total > 0`, and "Joined {Mon YYYY}" (built by `profileStats`, :85-106; rendered :229-245).
  - `Button` "Edit profile" secondary M -> `/profile/edit` (:246-252).
  - `SegmentedControl` Active / Sold with counts in the label, e.g. "Active 3" (:253-263; counts computed client-side from the listings query, :142-145).
  - Photo grid, 3 columns, `Tappable` cells with `Photo fill` and a white price tag overlay (:170-199); styles :184-200 of the style block (`photoGrid`, `gridCell`, `priceTag`).
  - Active-empty block `testID="profile-sell-nudge"`: bodyStrong "Got something to sell?", label "It takes a minute. Most things get an offer the same week.", `Button` "List something" -> `/sell` (:152-164).
  - Sold-empty `Text` "Nothing sold yet." (:165-168).
  - `GroupedList` with `ListRow` "My listings" -> `/profile/listings` and "View my public profile" -> `/user/[id]` with own id (:265-273).
- States:
  - loading: `SkeletonList rows={5}` for the profile (:129); `SkeletonList rows={2}` for the grid (:147).
  - empty: Active tab -> sell nudge above; Sold tab -> "Nothing sold yet." with no action (:150-169).
  - error: profile `ErrorState` with retry (:130); grid `ErrorState layout="inline"` with retry (:148-149).
  - populated: :170-199.
  - long title: grid cells show photo plus price only; title is only in `accessibilityLabel` `"{title}, {price}"` (:179). Name `Text` has no `numberOfLines` (:211-213), so a long name wraps.
  - no photo: `Photo source={null}` (:186); placeholder behavior is inside `Photo`, not handled in this file.
  - sold / hold / removed: grid filters by `listingTab(l.status)` (:141); the grid cell shows no hold, review or removed marker (no branch found in :173-197).
  - suspended or banned user: not handled (no branch found); `Me.status` is returned (apps/mobile/src/features/me/api.ts:14) but unused here.
  - blocked user: not applicable.
  - offline: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
  - reduce motion: not handled in this file (no branch found).
  - Dynamic Type: stats line is one wrapping `Text` with nested `Text` (:229-245); the head row uses `styles.flex` for the name column (:210), so long text wraps; no explicit large-text layout.
- Copy: strings/en.ts `me` 1578-1679 (title 1580, verifiedAt/yearAt, statsSold/statsSwaps, sellNudge* 1587-1589, soldEmpty 1583, viewProfile 1590, tabs 1611); `profileView` 1045-1082 (thumbs 1049, memberSince 1046, founding 1058).
- Notes: DEC 90 stat rule is met: `profileStats` only emits sold, swaps, thumbs (when rated) and join month (MeScreens.tsx:81-106), all from `Me.counts` and `created_at` (me/api.ts:27-34, :16); `counts.active` and `counts.saved` are returned (me/api.ts:28-30) but unused here, and `statsActive` "{n} listed" (en.ts:1584) is an unused string. Founding-seller badge still shows (:222-226, DEC 141). Comment at :108-114 describes the DEC 90 mock; the "Profile" title (`me.title`, en.ts:1580) is defined but not rendered, so there is no large title on this tab root (contradicts DEC 90 large titles; _layout.tsx:3 comment). Haptics: none in this file. Text-node density: 23 `<Text` in MeScreens.tsx (shared with edit, my listings, stats, edit listing, relist), about 12 on this screen.

<a id="06-edit-profile"></a>
### Edit profile  (F02)
- Source: apps/mobile/app/(tabs)/profile/edit.tsx:3-5 -> apps/mobile/src/features/me/MeScreens.tsx:307-444
- Route & entry: `/profile/edit`, push inside the profile Stack, no params. From the "Edit profile" button (MeScreens.tsx:246-252).
- Purpose: change first name, last initial, class year, bio and photo.
- Roles: any verified user (own profile).
- Elements: `NavBar title="Edit profile"` with back (:331, via `Screen` :55-72); `Avatar size L` plus `Button` "Change photo" / "Uploading photo" secondary S, `loading={uploading}` (:388-401); `Input` "First name" maxLength 30 (:402-408); `Input` "Last initial" maxLength 1, upper-cased (:409-414); `Text` "Year" + six `Chip`s, tap again to clear (:415-425); `TextArea` "About you (optional)" maxLength 80 with placeholder (:426-432); `Banner kind="error"` (:433); `Button` "Save" at the end of the scroll, `disabled` when first name empty or uploading, `loading={busy}` (:434-440).
- States:
  - loading: `SkeletonList rows={4}` in `Screen` (:329-334).
  - empty: not applicable (form).
  - error: load error -> `ErrorState` with retry (:335-340); save or upload error -> inline `Banner kind="error"` with `errorText(e)` (:358, :379, :433).
  - populated: draft state, `draft ?? server values` (:342-349).
  - saving: button `loading` (:436); success -> toast `success` "Saved" then back (:376-377).
  - long title / no photo: `Avatar name={d.first}` falls back to initial (:389-393).
  - banned term / dirty guard: no dirty-state or discard confirmation on back (`leave` just goes back, :317; no branch found). DESIGN_SYSTEM F02 lists "dirty/saving/banned term" (DESIGN_SYSTEM.md:266); banned-term has no dedicated branch, only the generic error banner.
  - suspended or banned user, blocked user: not handled (no branch found).
  - offline: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
  - keyboard: `keyboardShouldPersistTaps="handled"` (:387); no KeyboardAvoidingView found in the file.
  - reduce motion: not handled (no branch found).
  - Dynamic Type: chips wrap in `styles.chips` row (:416); inputs are shared components.
- Copy: strings/en.ts `me` 1599-1608 (editTitle through saved_); `profileView.years` 1076-1082.
- Notes: the primary action sits at the end of the scroll, not docked (:434-440; P7). Haptic: none; success is a toast only (:376). Year chips use `profileView.years` while the profile tab reads the same map, consistent. Text-node density: shares the 23 `<Text` count of MeScreens.tsx; this screen has 1 plain `<Text` (:415).

<a id="06-my-listings"></a>
### My listings  (F03, X37 empty)
- Source: apps/mobile/app/(tabs)/profile/listings.tsx:3-5 -> apps/mobile/src/features/me/MeScreens.tsx:447-638
- Route & entry: `/profile/listings`, push in the profile Stack, no params. From the "My listings" row (MeScreens.tsx:267). Row actions link to `/listing/[id]`, `/listing/[id]/stats`, `/listing/[id]/relist`, `/sell` (:543, :551-553, :578-580, :520).
- Purpose: manage your listings by status, pause them (away mode), set a moving-out date, renew or relist.
- Roles: seller (owner of every row shown); any verified user.
- Elements: `NavBar title="My listings"` (:591); `Toggle` "Pause my listings" with a three-sentence description (:592-602); "Moving out" block: `Text` label, meta line (`movingOutLine` or body), four `Chip`s None/Week/2 weeks/Month (:603-622); `SegmentedControl` Active / Sold / Other (:623-634); 2-column `ListingTile` grid with state sold/hold (:526-545); under each tile `Button` "Stats" text S and either "Renew" text S, "Renew {date}" meta text, or "Relist" text S (:546-584).
- States:
  - loading: `SkeletonList` (:508).
  - empty: `EmptyState icon="tag"` "Nothing listed yet" / "Your listings show up here." with "List something" only on the Active tab (:513-524).
  - error: `ErrorState` with retry (:509); action errors -> error toast via `errorText` (:471-472, :487-488, :500-501).
  - populated: :525-588. Status note under tile for hold/sold/expired/held_review/removed via `copy.statusLabels` (:538-542).
  - sold / hold / removed: `ListingTile state` maps sold and hold only (:537); expired, in review and removed show only the note text.
  - long title: depends on `ListingTile`; not handled in this file.
  - suspended or banned user, blocked user: not handled (no branch found).
  - offline: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
  - success feedback: toasts "Your listings are paused" / "back", "Moving out is off", "Moved to the top of Discover" (:470, :486, :499).
  - reduce motion: not handled in this file.
  - Dynamic Type: per-tile `row` holds two text buttons (:546-584); no explicit large-text handling.
- Copy: strings/en.ts `me` 1610-1642 (tabs, listingsEmpty* 1612-1613, statusLabels, away* 1624-1628, movingOut* 1629-1639, renew* 1641-1643, stats).
- Notes: away mode and moving-out controls are always shown above the tabs, before any listing (:592-622), which pushes the grid down (P1). Away description is three sentences (en.ts:1625-1627). The `testID="away-toggle"` and `moving-out` wrappers reuse `styles.tabs` (:593, :604). Haptic: none (all feedback is toasts). Text-node density: part of the 23 `<Text` in MeScreens.tsx; this screen has 3 direct (:565, :605, :606).

<a id="06-user-profile"></a>
### Seller profile  (B10; board B20-B22)
- Source: apps/mobile/app/user/[id].tsx:5-8 -> apps/mobile/src/features/profiles/ProfileViewScreen.tsx:55-269
- Route & entry: `/user/[id]` (`id` from `useLocalSearchParams`, user/[id].tsx:6), root-level push (no Stack.Screen options in the route file). Linked from the profile tab "View my public profile" (MeScreens.tsx:270) and from listing/chat seller rows elsewhere. Back falls back to `/discover` (ProfileViewScreen.tsx:70).
- Purpose: let a buyer judge a seller (school year, join month, swaps, thumbs, reviews, listings) before engaging, and report or block.
- Roles: any verified user. `access` is `'ok' | 'me' | 'blocked' | 'gone'` (profiles/api.ts:20, :40-41). The "More" menu only for `access === 'ok'` (:133-141), so viewing yourself shows no menu.
- Elements: `NavBar` back + optional `IconButton more` (:130-142); centered head: `Avatar L`, `Text title` name header, meta line `Year · Joined {Month YYYY} · Usually replies in {time}` (:122-126, :149-151); tags `Founding seller` (accent), `New seller` (amber), `Away`, moving-out line (:152-157); stats row `{n} swaps` / `1 swap` and `{pct}% thumbs up` or `No ratings yet` (:158-161, :30-37); amber note box with `newSellerBody` when new seller and `access === 'ok'` (:164-168); heading "Listings" and 2-column `ListingTile` grid, hold state only (:170-198); heading "Reviews" and rows `Thumbs up · {rater name or Deleted user}` plus optional comment (:200-216); options `Sheet` with Report and Block rows (:219-239); `ReportSheet target="user"` with optional block (:240-253); `ConfirmDialog` "Block {name}?" destructive (:254-266).
- States:
  - loading: `SkeletonList` under a bare `NavBar` (`testID="screen-profile-loading"`, :73-79).
  - empty: "Nothing listed right now." and "No reviews yet." plain text (:173-176, :203-206).
  - error: `ErrorState` with retry (:81-87).
  - populated: :128-217.
  - deleted or unavailable user (`access: 'gone'`): `EmptyState icon="user"` "This profile isn't available" / "The account may be gone or not on your campus." with no action (:90-97). One state covers deleted account, other campus and missing id.
  - blocked user (`access: 'blocked'`): `EmptyState icon="ban"` "You blocked {name}" / "You won't see each other's listings or messages." with an "Unblock" action that awaits `api.unblock` then refetches, with no try/catch (:98-117).
  - deleted reviewer: review rows show "Deleted user" when `rater_name` is null (:211).
  - sold / hold / removed listing tile: only `hold` mapped (:186); sold items are not in `p.listings` as far as this file shows (no sold branch found).
  - suspended or banned seller: not handled (no branch found); API has no such access value (profiles/api.ts:20, :40-41).
  - offline: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
  - block failure: handled by the shared dialog. `onConfirm` awaits `api.block` before closing (:260-264); `ConfirmDialog` catches, shows the error inline as an alert and stays open (`apps/mobile/src/components/ConfirmDialog.tsx:53-62,72-75`). Report submit failure: handled by `ReportSheet`, which awaits `onSubmit` and shows the error in the sheet (:245-252; `ReportSheet.tsx:179-186,276-280`). Unblock (above) is the only unhandled path here.
  - reduce motion: not handled in this file.
  - Dynamic Type: tag row is a non-wrapping `flexDirection: 'row'` (:275, styles `tags`); `stats` row also non-wrapping (:276). Long names/tags can overflow at large sizes.
- Copy: strings/en.ts `profileView` 1045-1082 (goneTitle/goneBody 1074-1075, blocked* 1070-1073, newSellerBody 1056-1057, founding 1058).
- Notes: Founding-seller badge present (:153; DEC 141 "the badge still shows on profiles"). Stats shown are swaps, thumbs, join month and median reply time, all fields of `PublicProfile` (profiles/api.ts:26-30); nothing invented. Everything is centered (`alignItems: 'center'`, :274). The amber note box (:277-281) is a tip box against DEC 90/141 principles. Review rows use the label "Thumbs up" / "Thumbs down" (:211). No `.edu` / verified-at-school line on public profiles (profile shows year only, :122-126). Haptic: none. Text-node density: 11 `<Text` in ProfileViewScreen.tsx.

<a id="06-settings"></a>
### Settings  (F10)
- Source: apps/mobile/app/settings/index.tsx:3-5 -> apps/mobile/src/features/me/SettingsScreens.tsx:52-168
- Route & entry: `/settings`, push from the gear on the profile tab (MeScreens.tsx:293-299). Back falls back to `/profile` (SettingsScreens.tsx:60).
- Purpose: hub for account preferences, safety, help, account actions.
- Roles: any verified user.
- Elements: `NavBar` back, no title (:70); `Text variant="display"` "Settings" as large title (:74-76); four grouped cards (`GroupedList surface="card"`, grey page `bg2`, :69, :77): (1) Notifications (red tile), Privacy (sky), Appearance (ink tile, value = mode), Language (green, value = language) (:78-104); (2) Safety (lilac), Blocked accounts (ink3), Help (peach), About (amber) (:105-130); (3) Change school email (sky), Download your data (ink3) (:131-144); (4) Sign out, Sign out of all devices, Delete account (destructive) without icons (:145-153); `ConfirmDialog` "Sign out everywhere?" (:155-165).
- States:
  - loading / empty: not applicable (static; the theme and language values are read synchronously, :61, :101).
  - error: sign out has no try/catch; `beforeSignOut().catch(() => {})` swallows push-unregister errors and `auth.signOut` errors propagate unhandled (:63-67). The "Sign out" row calls it as `void signOut('local')` (:146); the sign-out-all `ConfirmDialog` closes itself before awaiting (:160-163), so its inline error never shows.
  - populated: :68-167.
  - sign out: "Sign out" acts immediately with no confirmation (:146); "Sign out of all devices" confirms (:147, :155-165).
  - suspended or banned user, blocked user: not handled (no branch found).
  - offline: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
  - reduce motion: not handled (no branch found).
  - Dynamic Type: rows are shared `ListRow`; value text placement not handled in this file.
- Copy: strings/en.ts `settings` 1681-1699 (title, rows, signOut*, deleteAccount).
- Notes: the comment at :72-73 cites DEC 90 mock screen 17 for the colored icon tiles. Seven tile hues (red, sky, ink, green, lilac, peach, amber, ink3: :81-143) conflict with "one accent" (DESIGN_SYSTEM.md:14) and include lilac (purple-ish). `settings.account` is an unused string (en.ts:1683). Two rows for safety exist: `/safety` here and `me.safety` elsewhere. Haptic: none. Text-node density: 9 `<Text` across SettingsScreens.tsx, 1 on this screen (:74).

<a id="06-settings-about"></a>
### About  (F18)
- Source: apps/mobile/app/settings/about.tsx:3-5 -> apps/mobile/src/features/me/SettingsScreens.tsx:361-389
- Route & entry: `/settings/about`, push from Settings (SettingsScreens.tsx:128). Back falls back to `/settings` (:363).
- Purpose: version and legal links.
- Roles: any user.
- Elements: `NavBar title="About"` (:367); `Text meta` "Version {x}" using `Constants.expoConfig?.version ?? '1.0.0'` (:369-371); `GroupedList` rows Terms, Privacy Policy, Community Rules (-> `/legal/*`, :374-376), Open source licenses (toggles inline text, :377), Contact us (-> `/help`, :378), Download your data (:379); `Text meta` `licensesBody` (:381-385).
- States: loading/empty/error: not applicable (static). Licenses text expands inline on tap (:377, :381). Offline: legal pages are bundled (comment :373); not otherwise handled. Suspended/blocked: not handled (no branch found). Reduce motion: not handled (no branch found); the licenses block appears without animation. Dynamic Type: plain text and rows; not specially handled. Long title: not applicable.
- Copy: strings/en.ts `settings` 1734-1742 (aboutTitle through contact).
- Notes: "Download your data" appears here (:379) and in Settings (SettingsScreens.tsx:138-143), a duplicate entry. Fallback version `'1.0.0'` is a hardcoded literal (:370). The licenses row has no chevron/expanded state hint in this file. Haptic: none. Text-node density: 2 `<Text` on this screen (:369, :382).

<a id="06-settings-appearance"></a>
### Appearance  (F14; D2, D5)
- Source: apps/mobile/app/settings/appearance.tsx:3-5 -> apps/mobile/src/features/me/SettingsScreens.tsx:214-240, apps/mobile/src/features/appIcon/AppearanceExtras.tsx:35-141
- Route & entry: `/settings/appearance`, push from Settings (SettingsScreens.tsx:95).
- Purpose: choose Match phone / Light / Dark, an alternate app icon, and the Lock Screen meetup toggle.
- Roles: any verified user (theme is saved to the profile via `api.updateFlags`, SettingsScreens.tsx:220).
- Elements: `NavBar title="Appearance"` (:224); three `OptionRow kind="radio"` for `THEME_MODES` (:226-234); `AppIconPicker` (AppearanceExtras.tsx:66-106): heading "App icon", radiogroup of four `Pressable` tiles (Default, Night, Paper, Mono) with a 2px ink ring on the selected tile and label under each (:68-98), Android-only meta line (:100-104); `LiveActivityToggle` (:124-139): heading "Lock Screen", `Toggle` "Show meetups on the Lock Screen" with a two-sentence description, iOS only (:123).
- States: loading: none (local store). Error: icon change failure reverts the selection and shows error toast "Couldn't change the icon. Try again." (AppearanceExtras.tsx:56-63); theme save failure is swallowed `.catch(() => {})` (SettingsScreens.tsx:220), device copy still applies. Unsupported platform: the picker returns `null` on web or when `api.supported()` is false (AppearanceExtras.tsx:51); the toggle returns `null` off iOS (:123). Selected state: ring + `a11yState({checked})` (:79, :84). Offline, suspended, blocked: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Reduce motion: not handled (no branch found). Dynamic Type: tiles use `minHeight: theme.size.hit` (AppearanceExtras.tsx:146-151) and a wrapping grid (:145).
- Copy: strings/en.ts `settings` 1708-1719 (appearanceTitle, modes, appIcon*, lockScreenTitle, liveActivities*).
- Notes: DESIGN_SYSTEM D5 says the app icon picker is "removed until R2" (DESIGN_SYSTEM.md:172) and D2 says System/Light/Dark only; the picker is now implemented (R2-ICON-01, AppearanceExtras.tsx:34), so the doc row is stale. Theme choice has no preview and no confirmation beyond the radio change. Haptic: none. Text-node density: 4 `<Text` in AppearanceExtras.tsx (:68, :93, :101, :126), 0 directly in the SettingsScreens appearance block.

<a id="06-settings-blocked"></a>
### Blocked accounts  (F13)
- Source: apps/mobile/app/settings/blocked.tsx:3-5 -> apps/mobile/src/features/safety/AccountScreens.tsx:193-258
- Route & entry: `/settings/blocked`, push from Settings (SettingsScreens.tsx:116). Back falls back to `/profile` (AccountScreens.tsx:202).
- Purpose: list people you blocked and let you unblock them.
- Roles: any verified user.
- Elements: `NavBar title="Blocked accounts"` (:256-257); rows with `Avatar S`, name, and `Button` "Unblock" secondary S with hint "Unblock {name}" (:224-248).
- States: loading `SkeletonList` (:205). Error `ErrorState` with retry (:206). Empty `EmptyState icon="ban"` "You haven't blocked anyone" / "People you block show up here. You can unblock them anytime." (:207-216). Populated rows (:217-252). Unblock is optimistic: the row is removed from the cache first, and a failure only triggers `q.refetch()` with no message (:238-246). No confirmation on unblock. Rows are not tappable to open the profile (the row is a plain `View`, :223). Offline, suspended: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Reduce motion: not handled (no branch found). Dynamic Type: row has `minHeight: theme.space.rowMin` and a flex name (:262-267 style block); long names wrap.
- Copy: strings/en.ts `safety` 1486-1491 (blockedTitle, blockedEmpty*, unblock, unblockName).
- Notes: DESIGN_SYSTEM F13 (DESIGN_SYSTEM.md:278) lists `unblock_user` only. The same "Unblock" copy exists in profileView (en.ts:1073) and safety (en.ts:1490), two copies. Haptic: none. Text-node density: 8 `<Text` in AccountScreens.tsx (shared with status and delete), 1 on this screen (:231).

<a id="06-settings-data"></a>
### Download your data  (F17)
- Source: apps/mobile/app/settings/data.tsx:3-5 -> apps/mobile/src/features/me/SettingsScreens.tsx:408-479
- Route & entry: `/settings/data`, push from Settings (SettingsScreens.tsx:142) and from About (:379).
- Purpose: request an emailed export of account data once a day.
- Roles: any verified user.
- Elements: `NavBar title="Download your data"` (:440); intro `Text` (:442); "What's in it" label header plus 7 bullet `Text` lines using a literal bullet (:443-452); meta lines "Other people show up only by their display name. You can ask once a day." (:453-455); idle: optional `Banner kind="offline"`, optional `Banner kind="error"`, `Button` "Email me my data" (:464-474); sent: bodyStrong header "On its way" plus `Banner kind="info"` (:456-462).
- States: loading: button `loading={busy}` (:468). Empty: not applicable. Error: `Banner kind="error"` with a rate-limit message including the retry time ("You already asked in the last day. You can ask again after {time}.") or `errorText` (:426-433, :466). Offline: `isOffline(useNetInfo())` shows `Banner offline` and disables the button (:416, :465, :469); the inline banner shows at once, and the app-wide `OfflineBanner` (`app/_layout.tsx:110`) joins it 1.5 s later, so two offline banners are on screen. Success: the form is replaced by the sent block (:456-462). Suspended/blocked: not handled (no branch found). Reduce motion: not handled (no branch found). Dynamic Type: all body text wraps; no explicit handling.
- Copy: strings/en.ts `settings` 1744-1763.
- Notes: DESIGN_SYSTEM F17 still says "queued (R1.0: row opens email to support)", release 1.1 (DESIGN_SYSTEM.md:282); the in-app flow is implemented. The screen is text heavy (intro, 7 bullets, two notes: P4). Primary button is inline, not docked. The bullet is a literal `•` string (:449). Haptic: none (success is a banner). Text-node density: 5 direct `<Text` (:442, :444, :448, :453, :458) plus banners.

<a id="06-settings-delete"></a>
### Delete account  (F16)
- Source: apps/mobile/app/settings/delete.tsx:3-5 -> apps/mobile/src/features/safety/AccountScreens.tsx:264-324
- Route & entry: `/settings/delete`, push from the destructive row in Settings (SettingsScreens.tsx:148-152). Back falls back to `/profile` (AccountScreens.tsx:273).
- Purpose: permanently delete the account after typing DELETE.
- Roles: any verified user.
- Elements: `NavBar title="Delete account"` (:289); `Text` body (:292); `Input` "Type DELETE to confirm" with `autoCapitalize="characters"` (:293-299); optional error `Banner` (:301); `Button` "Delete my account" destructive, `disabled` until the text equals `DELETE`, `loading={busy}` (:302-309).
- States: loading: button `loading` (:306). Error: `Banner kind="error"` "We couldn't delete your account. Try again or contact support." (:283-284, :301). Success: `auth.deleteAccount()`, local sign out, `router.replace('/welcome')` (:279-281). Offline, suspended, blocked: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Reduce motion: not handled (no branch found). Dynamic Type: body wraps.
- Copy: strings/en.ts `safety` 1569-1575.
- Notes: the match string `'DELETE'` is a hardcoded literal (:305) while the prompt copy is `deleteType` (en.ts:1573); a Spanish prompt would still require English DELETE. Body mentions what is removed but does not name open offers or active meetups (en.ts:1571-1572). Haptic: none (the budget has no destructive event). Text-node density: 1 direct `<Text` (:292).

<a id="06-settings-language"></a>
### Language  (P17-FEAT-03)
- Source: apps/mobile/app/settings/language.tsx:3-5 -> apps/mobile/src/features/me/SettingsScreens.tsx:247-301
- Route & entry: `/settings/language`, push from Settings (SettingsScreens.tsx:102).
- Purpose: pick Match phone / English / Espanol (each named in its own language), saved on the device only.
- Roles: any user.
- Elements: `NavBar title="Language"` (:273); three `OptionRow kind="radio"` (:275-283); `ConfirmDialog` "Switch language?" / "The app will restart to switch language." / "Restart" (:285-298).
- States: choosing a pref that resolves to the active language saves silently (:264-268); a pref that changes the language opens the confirm, then `setLanguage` restarts the app (:269, :290-295). Save failure `.catch(() => {})` swallowed (:266). Loading/empty/error: not applicable. Offline, suspended, blocked: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Reduce motion: not handled (no branch found). Dynamic Type: rows are shared `OptionRow`.
- Copy: strings/en.ts `settings` 1721-1726.
- Notes: no id in DESIGN_SYSTEM section 10 for this screen (P17-FEAT-03 only). Haptic: none. Text-node density: 0 direct `<Text` on this screen.

<a id="06-settings-notifications"></a>
### Notification settings  (F11)
- Source: apps/mobile/app/settings/notifications.tsx:3-5 -> apps/mobile/src/features/notifications/NotificationSettingsScreen.tsx:50-196
- Route & entry: `/settings/notifications`, push from Settings (SettingsScreens.tsx:82). Back falls back to `/profile` (NotificationSettingsScreen.tsx:67).
- Purpose: per-type push switches, previews, quiet hours, OS-permission warning.
- Roles: any verified user. Quad replies toggle only when the Quad is enabled for the campus (`quadOn`, :64, :136); comments and free-food toggles only when the API returns a boolean (:120, :128).
- Elements: `NavBar title="Notifications"` (:192); OS-off block: `Banner kind="warning"` + `Button` "Open settings" (:100-110); seven `Toggle`s with labels and descriptions: Offers, Messages, Meetups, Saved searches, Price drops, Selling tips, Show message text (:39-47, :111-119); conditional toggles: Comments and replies, Free food nearby, Quad replies (:120-143); "Quiet hours" heading, meta line, two `Button`s "Start: {time}" / "End: {time}" that switch to dark variant when editing, and a `Chip` row of `QUIET_TIMES` (:144-185).
- States: loading `SkeletonList rows={6}` (:94). Error `ErrorState` with retry (:95). Save: optimistic update, rollback and error toast "Couldn't save that. Try again." (:82-91). OS permission off: warning banner (:100-110); skipped on web via `supportsFeature('push')` (:72). Reduce motion, offline, suspended, blocked: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Dynamic Type: buttons in a wrapping row (:202).
- Copy: strings/en.ts `notificationsScreen` 1401-1432.
- Notes: ten possible toggles each with a description line (P4), the longest being `tipsBody` (en.ts:1416-1417) and `freeFoodBody`. Quiet hours picker is a button pair plus a chip row rather than a native time picker (:154-184). Haptic: none. Text-node density: 2 `<Text` (:145, :148).

<a id="06-settings-privacy"></a>
### Privacy  (F12)
- Source: apps/mobile/app/settings/privacy.tsx:3-5 -> apps/mobile/src/features/me/SettingsScreens.tsx:171-211
- Route & entry: `/settings/privacy`, push from Settings (SettingsScreens.tsx:88).
- Purpose: opt in or out of usage stats and crash reports.
- Roles: any verified user.
- Elements: `NavBar title="Privacy"` (:188); `Toggle` "Share usage stats" with description (:195-200); `Toggle` "Send crash reports" with description (:201-206).
- States: loading `SkeletonList rows={2}` (:190). Error `ErrorState` with retry (:192). Toggle: optimistic cache update, the device opt-out applies immediately (:176-179); a server failure only refetches (reverts) with no message (:180-184). Offline, suspended, blocked, reduce motion: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Dynamic Type: shared `Toggle`.
- Copy: strings/en.ts `settings` 1701-1706 (privacyTitle, analytics*, crash*).
- Notes: a failed save snaps back silently; compare notifications, which toasts (NotificationSettingsScreen.tsx:89). Haptic: none. Text-node density: 0 direct `<Text`.

<a id="06-settings-school"></a>
### Change school email  (F15)
- Source: apps/mobile/app/settings/school.tsx:3-5 -> apps/mobile/src/features/me/SettingsScreens.tsx:304-358
- Route & entry: `/settings/school`, push from Settings (SettingsScreens.tsx:136).
- Purpose: move the account to a new .edu address; Supabase sends a confirmation.
- Roles: any verified user.
- Elements: `NavBar title="Change school email"` (:331); `Text` body (:333); form: `Input kind="email"` "New school email" (:338-344), optional `Banner kind="error"` (:345), `Button` "Send code" disabled until the value matches `^[^@\s]+@[^@\s]+\.edu$` (:346-352); sent: `Banner kind="info"` "Check {email} for a link or code to confirm the change." (:335).
- States: busy via button `loading` (:347). Error `Banner kind="error"` (:345). Success replaces the form with the banner, with no next step or resend (:334-336). Offline, suspended, blocked, reduce motion: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Dynamic Type: shared components.
- Copy: strings/en.ts `settings` 1727-1732.
- Notes: the body promises "a code" (en.ts:1729) while the success says "a link or code" (en.ts:1732); the button reads "Send code". Verification of the new .edu is shown only as a regex gate, not as a visible verified-school state (P5). Haptic: none. Text-node density: 1 direct `<Text` (:333).
