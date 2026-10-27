# 03 Sell flow and campus posts

[Index: SCREENS.md](../SCREENS.md) | [Design review: DESIGN_REVIEW.md](../DESIGN_REVIEW.md)

Route files: `apps/mobile/app/(tabs)/sell/{_layout,index,details,meetup,posted,scan,food,news,wanted}.tsx`, `apps/mobile/app/listing/[id]/edit.tsx` and `relist.tsx`. Feature files: `apps/mobile/src/features/sell/{SellPhotosScreen,SellDetailsScreen,SellMeetupScreen,SellPostedScreen,SellScanScreen,SellStep,PhotoGrid,ShareCard}.tsx` (plus `draft.ts`, `help.ts`, `logic.ts` for validation), `apps/mobile/src/features/campus/{PostFoodScreen,PostNewsScreen,PostWantedScreen,PostShared}.tsx`. Edit and Relist are not in `features/sell`: both routes render `EditListingScreen` / `RelistScreen` from `apps/mobile/src/features/me/MeScreens.tsx:702` and `:830`. Wanted posts are the "requests board" posts (Feed filter "Wanted", `apps/mobile/src/strings/en.ts:1989`).

Haptic references in this slice (grep `haptic`, all of `features/sell`, `features/campus`, `app/(tabs)/sell`, `app/listing`, `MeScreens.tsx`): only three calls.
- `apps/mobile/src/features/sell/SellScanScreen.tsx:73` `haptic('success')` when the barcode lookup finds the book. This is NOT in the budget (DESIGN_SYSTEM.md:97-102 allows success only for offer sent, offer accepted, listing posted). Confirmed out of budget.
- `apps/mobile/src/features/sell/SellPostedScreen.tsx:69` `haptic('success')` when the Posted screen mounts with a listing (comment cites the budget "listing posted"). In budget.
- `apps/mobile/src/features/sell/SellDetailsScreen.tsx:265` `haptic('warning')` when Next is tapped and there are errors (local or banned word). Budget says "warning on error shake"; there is no shake here, the warning fires with the error banner. Out of budget (same classification as SCREENS.md and DESIGN_REVIEW.md 2.8).
- `apps/mobile/src/features/sell/PhotoGrid.tsx:41` is a comment only ("No haptics here"). Campus post screens, `PostShared.tsx`, Edit and Relist call no haptic. Toast, SuccessCheck, Sheet and PermissionPrimer components contain no haptic call.

<a id="03-sell-layout"></a>
### Sell stack layout  (layout)
- Source: apps/mobile/app/(tabs)/sell/_layout.tsx:4-6
- Route & entry: Stack for the Sell tab, `headerShown: false` (`_layout.tsx:5`). Comment at `_layout.tsx:3`: each step draws its own "New listing" bar with the step count.
- Purpose: Hosts the five Sell steps plus scan, food, news and wanted inside the Sell tab.
- Roles: any verified user (no guard in this file).
- Elements: none (stack only).
- States: not applicable (layout only).
- Copy: none.
- Notes: Food, news and wanted are pushed on this same stack from Sell step 1 (`SellPhotosScreen.tsx:324,332,340`) and from the Feed (`apps/mobile/src/features/campus/CampusFeedScreen.tsx:131-133`), so they open in the Sell tab even when started from the Feed; their close button uses `router.back()` or falls back to `/sell` (`PostFoodScreen.tsx:83`) or `/feed` (`PostNewsScreen.tsx:100`).

<a id="03-sell-photos"></a>
### Sell photos  (D01; states X15 Uploading and drafts, X18 Camera access, X21 Access denied)
- Source: apps/mobile/app/(tabs)/sell/index.tsx:3-5 -> apps/mobile/src/features/sell/SellPhotosScreen.tsx:74-347 (frame `SellStep.tsx:36-98`, grid `PhotoGrid.tsx:43-111`)
- Route & entry: `/sell` (tab root of the Sell stack). Linked from the Sell tab itself, `apps/mobile/src/features/waitlist/UnlockedScreen.tsx:93` (replace), `apps/mobile/src/features/offers/InboxScreen.tsx:220`, `apps/mobile/src/features/feed/DiscoverScreen.tsx:235`, `apps/mobile/src/features/feed/ListingScreen.tsx:294`, `apps/mobile/src/features/me/MeScreens.tsx:162,520`, `apps/mobile/src/features/campus/CampusFeedScreen.tsx:129,134`, `apps/mobile/src/features/quad/QuadNewPostScreen.tsx:365`. "I have this" on a Wanted post fills the draft with `answerWanted` (`apps/mobile/src/features/sell/draft.ts:85-99`, called from `CampusFeedScreen.tsx:128`) and lands here.
- Purpose: Step 1 of 3: add up to 8 photos (first is the cover); photos upload one by one while the seller continues.
- Roles: any verified user. Wanted-answer mode (`draft.wantedRef`) swaps the campus shortcuts for an "Answering a Wanted post" card (`SellPhotosScreen.tsx:275-292,317`). Signed-out / suspended gating: not handled in this screen (no branch found; tab guard is outside this slice).
- Elements:
  - NavBar "New listing" with close X (`SellStep.tsx:62`, `copy.title` en.ts:716); close goes to `router.navigate('/discover')` with no confirm (`SellPhotosScreen.tsx:215`).
  - StepIndicator, 3 steps (`SellStep.tsx:13,63-65`); step 1 (`SellPhotosScreen.tsx:213`).
  - Title "Add photos" (`copy.photosTitle` en.ts:721, `SellPhotosScreen.tsx:216`, `Text variant="title"` `SellStep.tsx:71-75`).
  - Body line: "Up to 8. The first one is the cover." until the draft has content, then "Draft saved · {time}" re-rendered every 10 s (`SellPhotosScreen.tsx:97,201-204`; en.ts:722,724).
  - Answering card (wanted mode): bodyStrong "Answering a Wanted post", meta body with title, text Button "Not for this post" (`SellPhotosScreen.tsx:275-292`; campus en.ts:2176-2178).
  - PhotoGrid (`SellPhotosScreen.tsx:293-302`): cover is a large slot, next photos beside it then rows of 3 (`PhotoGrid.tsx:37-39`); blank placeholder slots fill the hero block (`PhotoGrid.tsx:105`, `HERO_SLOTS = 3` at `:21`). Add tiles "Camera" and "Library" (dashed border tiles, `PhotoGrid.tsx:87-104,115-142`; camera tile hidden on web via `supportsFeature('camera')` `SellPhotosScreen.tsx:297`). Each photo tile: "Cover" label on first (`PhotoGrid.tsx:250-256`), ProgressBar "Uploading" while uploading (`:257-261`), failed overlay with refresh icon and "Retry" in red and photo faded to 0.45 (`:262-270`, `:290`), 22 pt remove X with `hitSlop 11` (`:270-280,333`). Long-press 250 ms then drag to reorder (`:179-195`); VoiceOver actions Move earlier / Move later / Make cover / Remove photo n (`:209-224`).
  - Status line (meta, red when error or failed, polite live region): "Photos are still uploading." / "Retry or remove the photos that didn't upload." / error text (`SellPhotosScreen.tsx:197-200,303-312`; en.ts:741,742,739,743).
  - Tip line: "Shoot near a window on a plain surface. Show any scratches or dents, it saves a lot of back and forth." plus " Hold and drag to reorder." once 2+ photos (`SellPhotosScreen.tsx:313-316`; en.ts:738,737).
  - Campus shortcuts row (hidden in wanted mode): text Buttons size S "Post free food", "Ask for something", "Post news" (`SellPhotosScreen.tsx:317-344`; campus en.ts:1993-1995), hairline above (`:367-368`).
  - Docked Button "Next", disabled unless photos state is ready (`SellPhotosScreen.tsx:219-224`; en.ts:718).
  - Restore Sheet "Pick up where you left off?" with body (named or unnamed), buttons "Start over" (secondary, resets draft, no confirm) and "Continue" (`SellPhotosScreen.tsx:228-252`; en.ts:745-749).
  - Permission primer overlay (full-screen, absolute fill, covers NavBar and stepper) `PermissionPrimerView` kind camera/photos with Continue, alternative, Open settings, close (`SellPhotosScreen.tsx:253-271,352`; primer en.ts:113-131).
- States:
  - Loading: no screen skeleton; the draft is read from storage by the store (`draft.ts:57-58`). Per-photo loading = ProgressBar "Uploading" (`PhotoGrid.tsx:257-261`); queued photos beyond `UPLOAD_CONCURRENCY = 2` show an empty progress bar until a slot frees (`SellPhotosScreen.tsx:67,163-169`).
  - Empty (no photos): grid shows only the add tiles plus blank slots; body "Up to 8. The first one is the cover."; Next disabled with no explanation (`SellPhotosScreen.tsx:222`, `logic.ts:186-187`). `copy.needPhoto` "Add at least one photo to keep going." (en.ts:740) is defined but never used (grep found no consumer).
  - Error: reserve failed -> "We couldn't start your listing. Check your connection and try again." red line (`SellPhotosScreen.tsx:149-153`; en.ts:743); photo cap reached -> "That is 8 photos, the most a listing can have." (`:136-140`; en.ts:739); single upload failed -> tile goes to `failed` with Retry (`:129-131`) and status "Retry or remove the photos that didn't upload." (en.ts:742).
  - Populated: grid with cover, status line empty, Next enabled when all done (`logic.ts:186-190`).
  - Draft restored (X15): Sheet visible when `restored` is true (`:228-232`); dismissing the sheet (drag/scrim) calls `keep`, i.e. continues (`:230`).
  - Permission primer (X18) / denied (X21): `PermissionPrimerView` shown while `primerStep !== 'granted'` (`:253`); denied step shows Open Settings (`:261-263`); alternative button switches camera <-> library (`:264-267`).
  - Edge: sold/hold/removed, blocked user, suspended or banned user: not handled in this screen (no branch found). Offline: no screen-level offline branch (no NetInfo read in `SellPhotosScreen.tsx`); the app-wide `OfflineBanner` (`app/_layout.tsx:110`) still shows after 1.5 s, and on this screen failures surface as reserve/upload failed. Reduce motion: drag settle uses `resolveMotion('fade', reduced)` (`PhotoGrid.tsx:165,169`), ProgressBar jumps (`Progress.tsx:72`). Dynamic Type: title and tip wrap; the "Camera"/"Library" tile labels are meta text in fixed-size square tiles (`PhotoGrid.tsx:115-142`), no overflow guard found. Long title: not applicable. No photo: see Empty.
- Copy: `apps/mobile/src/strings/en.ts` sell block 715-879 (photos 720-743, restore 744-749); campus 1993-1995, 2176-2178; primer 113-131; es.ts has the same keys (`photosBody` es.ts:720).
- Notes: Text-node density: 5 `<Text` in SellPhotosScreen.tsx, 3 in PhotoGrid.tsx, 2 in SellStep.tsx. Visible text blocks on an empty draft: title, body, tip, 3 shortcut links, 2 tile labels = 8, against DEC 90/141 "fewer words" (DECISIONS_LOG.md:60,9). The tip is a one-line tip, not a box (`SellPhotosScreen.tsx:313` cites DEC 90). Haptics: none on this screen. `SellStep.tsx:32` comment says "board D1 to D5" but `SELL_STEPS = 3` (`SellStep.tsx:13`). Sell is a tab root but uses an inline NavBar "New listing" instead of a large title (DEC 90 large titles on tab roots, DECISIONS_LOG.md:60). Price/other fields not here. Selected/cover cue is a text label "Cover", not color.

<a id="03-sell-details"></a>
### Sell details  (D02; board D2, D3, D4; give-away D2 variant, price hint R11-HINT-01)
- Source: apps/mobile/app/(tabs)/sell/details.tsx:3-5 -> apps/mobile/src/features/sell/SellDetailsScreen.tsx:179-456
- Route & entry: `/sell/details`, pushed from `SellPhotosScreen.tsx:221` (Next). Back: `router.back()` or `router.replace('/sell')` (`SellDetailsScreen.tsx:280`). Returned to from scan via `router.back()` (`SellScanScreen.tsx:48`).
- Purpose: Step 2 of 3: title, price (or give away), condition, category, offers, description; every error shown at once.
- Roles: any verified user (no gate in file). Mode switch Sell it / Give it away changes the form (`SellDetailsScreen.tsx:271,291-299,332,363`).
- Elements:
  - NavBar "New listing" + back, StepIndicator step 2 (`SellStep.tsx:62-65`; `SellDetailsScreen.tsx:278-280`). No page title (no `title` prop passed, `:276-290`).
  - SegmentedControl "Sell it" / "Give it away" (`:291-299`; en.ts:751-753).
  - Error Banner (kind error) "{count} things to fix before you can post" / "1 thing to fix before you can post" (`:300-307`; en.ts:814-815); warning Banner "We couldn't check the text. Check your connection and try again." (`:308`; en.ts:826).
  - Input "Title" placeholder "What is it?" max 80 with inline error (`:310-318`; en.ts:754-755, errors 817-819); example line "Example: {example}" per category (`:319-321`, `help.ts:7-14`; en.ts:768-780).
  - Secondary Button S "Scan a book barcode", native and sale only, any category (`:323-331`; en.ts:757).
  - Price Input (`kind="price"`, placeholder "0") with inline error (`:332-349`; errors en.ts:821-824); price hint beside it: "Similar items here sold for" + range bold + secondary Button S "Use {price}" (`PriceHintLine` `:62-86`; en.ts:795-797,793).
  - Condition label + SegmentedControl New / Like new / Good / Fair (`:351-361`; en.ts:785-786).
  - Category label + chips (top level, then sub-category row for Tech) (`:363-391`, `CategoryChips` `:93-146`); inline red error "Pick one so the right people see it" (`:386-390`; en.ts:820).
  - Toggle "Open to offers" with description "People can offer less than your price. You decide." (`:392-399`; en.ts:789-790).
  - Give-away branch: label "Pick up by" + ChipGroup Tomorrow / Sunday / This week (`:403-417`; en.ts:798-799) and a bordered note "Goes on the Free shelf" + "Free things usually go within a day. You pick who gets it from the people who ask." (`:418-425`; en.ts:800-801).
  - TextArea "Description" max 1000 with error (`:429-437`; en.ts:802-803,825).
  - "Quick details" label + 6 starter chips (Barely used. ... Pickup only.) (`:438-453`; en.ts:805-813).
  - Docked Button "Next" with loading while checking text, disabled while error count > 0 (`:281-289`).
- States:
  - Loading: categories `SkeletonList rows=2` (`:369-370`); Next shows `loading` during the banned-word check (`:285`, `:245`); price hint has no loading indicator (appears when data arrives, `:345`).
  - Empty: fresh form, no errors shown until Next is tapped once (`errors = submitted ? ... : []` `:234`).
  - Error: all errors at once with a count banner and inline messages (`:234-240,300-307`); banned term from the server check "\"{term}\" isn't allowed on OnlySwap. Check the banned items in the rules." (`:224-233,252-254`; en.ts:819); check request failure -> warning banner and stay (`:255-259`); categories failed -> inline `ErrorState` with retry (`:372-376`). Next is disabled while any error is present (`:286`), so re-checking happens only after the user fixes the fields; errors recompute live after the first Next (`:234`).
  - Populated: Next enabled, `router.push('/sell/meetup')` (`:268`).
  - Give-away (D2 variant): category, price, offers toggle hidden; Pick up by chips shown (`:332,363,401-427`); title still required (`logic.ts:296-298`); condition is optional in both modes (`validateDetails` `logic.ts:292-310` has no condition rule).
  - Offline: price hint disabled when offline (`:210,220-222`); no screen-level offline Banner (the app-wide `OfflineBanner`, `app/_layout.tsx:110`, still shows), and Next shows "We couldn't check the text..." (`:255-259`).
  - Edge: sold/hold/removed, blocked, suspended: not handled (no branch found). Reduce motion: not applicable (no custom animation in file). Dynamic Type: 4-segment condition control and the title/price row (`styles.priceRow` flexWrap `:461-466`) wrap; segment label wrapping not verified (`SegmentedControl.tsx:76` sets only a minHeight). Long title: capped at 80 chars (`TITLE_MAX` `logic.ts:13`).
- Copy: en.ts sell block 750-827; es.ts same keys.
- Notes: Text-node density: 11 `<Text` in SellDetailsScreen.tsx (plus Input/TextArea/Button/Toggle labels). Field/control count above the dock on a sale: mode switch, title, example, scan button, price, hint, condition, category, offers toggle, description, quick-detail chips (11 groups); against DEC 90/141 (DECISIONS_LOG.md:60,9). Scan ISBN: DEC 131 says it shows "when the category is Textbooks" (DECISIONS_LOG.md:19) but the code shows it for every sale on native (`SellDetailsScreen.tsx:323`). Haptic: `haptic('warning')` at `:265` fires on a failed Next. The error count banner sits at the top of the scroll content (`:300`) while Next is docked at the bottom; no scroll-to-first-error branch found. The "banned items" server check blocks Next with a network round trip before local errors are shown (`:248-251` runs before `:263`).

<a id="03-sell-meetup"></a>
### Sell meetup  (D03; board D5, DESIGN_SYSTEM D3 delta)
- Source: apps/mobile/app/(tabs)/sell/meetup.tsx:3-5 -> apps/mobile/src/features/sell/SellMeetupScreen.tsx:54-321
- Route & entry: `/sell/meetup`, pushed from `SellDetailsScreen.tsx:268`. Back: `router.back()` or `router.replace('/sell/details')` (`SellMeetupScreen.tsx:144`). Post replaces to `/sell/posted` (`:108`).
- Purpose: Step 3 of 3: pick up to 5 public meetup spots (police-designated first), add a note and availability, confirm, and post.
- Roles: any verified user. Post on the reserved listing id so a retry never creates a second listing (`:50-52`, `createListing` `:101`).
- Elements:
  - NavBar "New listing" + back, StepIndicator step 3 (`:142-144`).
  - Title "Where can you meet?" and body "Buyers see this before they make an offer. Pick up to 5." (`:145-146`; en.ts:829-830).
  - Spot list: each spot is a checkbox row (bordered, ink border and filled box when selected) with name (bodyStrong), "description · hours" meta, green Tag "Police-designated", and a text Button S "Directions" that opens Maps (`:188-237`; en.ts:831-833; styles `:328-349`). Final row "Decide in chat" / "You and the buyer pick a spot" is selected when no spot is chosen (`:238-256`; en.ts:834-835). Red line "Pick up to 5 spots." when the cap is hit (`:257-261`; en.ts:836).
  - Input "Somewhere else? (optional)", placeholder "For example, the lobby of your building", max 60 (`:265-272`; en.ts:839-840).
  - "Usually free" ChipGroup Weekdays / Weekends / Mornings / Afternoons / Evenings (`:274-284`; en.ts:841-848).
  - "Preview" label and a row: 60 pt thumbnail, title (1 line), price/Free, "condition · category · first spot" (`:286-308,358`; en.ts:849-850).
  - Checkbox "This isn't on the banned items list" (`:310-318`; en.ts:851).
  - Dock: red meta "Tick the box at the bottom to confirm it is allowed." (`:154-163`; en.ts:852), error Banner (`:164-168`), Button "Post listing" with loading (`:170-175`; en.ts:853).
- States:
  - Loading: `SkeletonList rows=3` for spots (`:179-180`); posting = Button `loading` (`:173`).
  - Empty: no spots -> meta "No meetup spots here yet. You and the buyer can pick one in chat." (`:189-193`; en.ts:838).
  - Error: spots failed -> inline `ErrorState` with retry (`:181-186`); post failed (offline or unknown) -> Banner "We couldn't post it. Your draft is saved, try again in a moment." (`:118-122`; en.ts:854); other app errors use `errorCopy` (`:121`); box not ticked -> hint in the dock (`:94-97,154-163`); FORBIDDEN (reserved id gone) -> silently `router.replace('/sell')` with no message (`:111-117`).
  - Populated: spots selected (0-5), preview shown, Post posts and resets the draft (`:101-108`).
  - Edge: sold/hold/removed, blocked, suspended: not handled (no branch found). Offline: no pre-check; failure shows the post-failed banner (`:119-120`). Reduce motion: not applicable. Dynamic Type: spot rows use `minHeight: theme.size.hit` and wrap (`:334-340`); the Directions button is size S inside the row (`:228-234`). Long title: preview title `numberOfLines={1}` (`:295`). No photo: Photo with `source` null (`:129-130,292`).
- Copy: en.ts sell block 828-854; es.ts same keys.
- Notes: Text-node density: 12 `<Text` in SellMeetupScreen.tsx. Trust: police tag and spot descriptions are visible at decision time (P5). The dock message comment explains why the confirm hint lives in the dock (`:149-152`). Haptic: none on this screen (success fires on the Posted screen, `SellPostedScreen.tsx:69`). No `title` large-style; title is `Text variant="title"` in the scroll content (`SellStep.tsx:71-75`).

<a id="03-sell-posted"></a>
### Sell posted  (D04; board D6; share card generating / failed)
- Source: apps/mobile/app/(tabs)/sell/posted.tsx:3-5 -> apps/mobile/src/features/sell/SellPostedScreen.tsx:38-210
- Route & entry: `/sell/posted`, `router.replace` from `SellMeetupScreen.tsx:108`. Data comes from `usePostedStore` (`SellPostedScreen.tsx:56-57`), not route params.
- Purpose: Confirms the listing is up (or in review), builds a share card in the background and offers Share and List another.
- Roles: seller (owner of the new listing). A held listing (`status === 'held_review'`) swaps copy and hides Share (`:122,181-186,198-200`).
- Elements:
  - Hidden `ShareCard` (opacity 0, off-screen-in-place, hidden from screen readers) (`:148-158`, `ShareCard.tsx:28-78,82`): cover photo, "onlyswap" wordmark, big price, title, tags "{condition} condition" and "{campus} only" (accent-filled last tag), never the seller's name (`ShareCard.tsx:22-26`). Captured at 1200 x 630 JPEG q0.8 (`SellPostedScreen.tsx:28-31`).
  - NavBar with close only, no title (`:159-165`); close clears the store and goes to `/discover`.
  - Hero photo (70% width, max 300, square) with a price pill ON the photo (`:167-179`, styles `:220-229`).
  - `SuccessCheck` (accessibility label "Listing posted") (`:180`; en.ts:861).
  - Title "Your listing is up" / "Your listing is in review" (`:181-183`; en.ts:856,859); body "It's in your campus feed now. We'll tell you when someone saves it or makes an offer." / "Most reviews take under 2 hours. We'll tell you when it's up." (`:184-186`; en.ts:857-858,860).
  - Card status meta: "Making the share preview" while preparing; "The preview image didn't upload. Sharing still works with the link." on failure (`:187-195`; en.ts:864-865).
  - Dock: Button "Share listing" (hidden in review) and text Button "List another" (`:197-207`; en.ts:862,866).
- States:
  - Loading (share card generating): `card === 'preparing'` meta line; Share is already enabled (`:187-189,199`). Capture waits for the cover image or a 6 s timeout (`:104-109`, `cardTimeoutMs = 6000` `:44`).
  - Empty (opened without a fresh post, e.g. after reload): renders only a NavBar with a close button, no copy, no content (`:112-119`).
  - Error (card failed): meta line above (`:191-194`); Share still works with the link alone (`:130-136`). A failed capture or upload sets `failed` (`:99-102`).
  - Populated: ready state shows no card status line (`:195` null) and an enabled Share.
  - In review (`held_review`): review title/body, no Share, only "List another" (`:198-206`).
  - Edge: no photo -> `Photo` source null; capture runs immediately when there is no cover (`:104`). Offline: share card upload fails -> card failed state (`:99-102`); no screen-level banner beyond the app-wide `OfflineBanner` (`app/_layout.tsx:110`). Reduce motion: `SuccessCheck` fades in (`SuccessCheck.tsx:11`). Dynamic Type: body and title centered with `maxWidth: theme.size.copyMax` (`:230`). Sold/removed/blocked/suspended: not handled (not applicable to this moment).
- Copy: en.ts sell block 855-868; es.ts same keys.
- Notes: Text-node density: 5 `<Text` in SellPostedScreen.tsx, 4 in ShareCard.tsx. Haptic: `haptic('success')` at `:69` on mount, in budget. The price pill on the photo (`:174-178`, text tone `onPhoto`) conflicts with DEC 90 "price and title sit on white below photos, never on them" (DECISIONS_LOG.md:60). There is no "View listing" action: the only exits are Share, List another and close (`:197-207,159-165`). `listAnother` carries spots, note, times and pick-up-by into the next draft (DEC 133, `:138-144`).

<a id="03-sell-scan"></a>
### Sell scan  (D02 variant, DEC 131; permission X18)
- Source: apps/mobile/app/(tabs)/sell/scan.tsx:3-5 -> apps/mobile/src/features/sell/SellScanScreen.tsx:33-133
- Route & entry: `/sell/scan`, pushed from `SellDetailsScreen.tsx:328`. Native only (the button is hidden on web, `SellDetailsScreen.tsx:323`).
- Purpose: Scan a book's EAN-13, look it up on Open Library, fill the draft title and Textbooks category and go back.
- Roles: any verified user on native.
- Elements:
  - Camera permission primer (full screen) until granted (`SellScanScreen.tsx:86-95`; `PermissionPrimer.tsx:93-110`; primer en.ts:115-122).
  - NavBar "Scan the barcode" with close (`:100`; en.ts:758).
  - `CameraView` back camera, EAN-13 only, accessibility label = hint text (`:101-110`).
  - Panel: polite live text "Point the camera at the barcode on the back cover. We fill in the title for you." or "Looking up the book" (`:121-128`; en.ts:759-760); on a problem: warning Banner, Button "Scan again", text Button "Type it instead" (`:112-119`; en.ts:761-765).
- States:
  - Loading: `status === 'looking'` text "Looking up the book" (`:127`); scanning disabled while not `scanning` (`:106`).
  - Empty: ready-to-scan hint (`:121-128`).
  - Error: notBook, notFound, offline mapped to copy (`:22-26,57-78`; en.ts:761-763), each with Scan again / Type it instead.
  - Populated (success): title and category written to the draft, `haptic('success')`, success Toast "Title filled in from the barcode", then `leave()` (`:72-75`; en.ts:766).
  - Edge: permission denied -> primer settings step (`PermissionPrimer.tsx:48`, copy en.ts:120-121). Offline checked before the lookup (`:61-64`) and after a throw (`:77`). Reduce motion, Dynamic Type: no custom handling found. Sold/blocked/suspended: not applicable.
- Copy: en.ts sell block 756-766; primer 113-122.
- Notes: Text-node density: 1 `<Text` in SellScanScreen.tsx. Haptic `haptic('success')` at `SellScanScreen.tsx:73` is NOT in the budget (DESIGN_SYSTEM.md:97-102): confirmed out of budget. Success toast plus screen close already answer back (P6). The camera screen uses a bottom panel with two stacked buttons, no docked single primary on the happy path.

<a id="03-post-food"></a>
### Post free food  (C02; board C2)
- Source: apps/mobile/app/(tabs)/sell/food.tsx:3-5 -> apps/mobile/src/features/campus/PostFoodScreen.tsx:61-281
- Route & entry: `/sell/food`, pushed from `SellPhotosScreen.tsx:324` and `CampusFeedScreen.tsx:132`. Close: `router.back()` or `router.replace('/sell')` (`PostFoodScreen.tsx:83`).
- Purpose: Post free food with a place, a duration of 30 min to 3 h and an optional photo; the post expires on its own (`:56-60`).
- Roles: any verified user; 3 posts a day (`:59`, cap copy en.ts:2169; new-account and daily caps en.ts:2171-2172).
- Elements:
  - NavBar "Post free food" with close and a trailing Button S dark "Post" (`:144-160`; en.ts:2074,2141).
  - Input "What is it?" with placeholder (`:163-171`; en.ts:2075-2076).
  - "Where exactly?" label, meta "Pick a meetup spot or type the place.", spot chips + "Somewhere else" chip; typed place Input appears for "Somewhere else" (`:173-230`; en.ts:2077-2080).
  - "Around for about" chips 30 min / 1 hour / 2 hours / 3 hours (`:232-251`; en.ts:2081-2087).
  - `PhotoField` "Photo (optional)" + "Add a photo" button -> `PhotoSourceSheet` (`:253-258`; `PostShared.tsx:165-238,34-66`).
  - Note with clock icon: "People on campus with free food alerts on get a notification. The post hides itself when the time runs out." (`:260-265`; en.ts:2088-2089).
  - Error Banner "Fix the highlighted fields to post." and post-error Banner (`:267-276`; en.ts:2153); error Toast with the same text (`:104`).
  - After posting: `PostedView` (see Campus post confirmation) (`:123-137`).
- States:
  - Loading: spots `SkeletonList rows=2` (`:180-181`); Post shows `loading` (`:154`); photo upload meta "Uploading photo" and Post disabled while uploading (`:155`, `PostShared.tsx:193-197`).
  - Empty: blank form, errors hidden until Post is tapped (`:92-96`).
  - Error: field errors (en.ts:2155-2159) plus banner and toast "Fix the highlighted fields to post." (`:101-106,267-271`); spots failed -> inline `ErrorState` with retry (`:182-187`); server failure -> Banner + Toast with `postFailure` text (`:113-118,272-276`; caps en.ts:2169-2173, banned term en.ts:2168); photo failed -> red line "The photo didn't upload. Try again." (`PostShared.tsx:150-151,219-223`; en.ts:2148); photo/camera access off -> warning Banner + "Open settings" (`PostShared.tsx:224-229`; en.ts:2150-2152).
  - Populated: Post -> `createListing(kind food)` -> `PostedView` (`:109-112,123-137`).
  - Edge: sold/hold/removed, blocked, suspended: not handled in this screen (no branch found; server rejects with `NOT_ACTIVE`, en.ts:35). Offline: only the generic post-failed message (`en.ts:2173`). Reduce motion: not applicable. Dynamic Type: chips wrap (`:293`).
- Copy: en.ts campus block 2073-2091, shared 2140-2174; es.ts same keys.
- Notes: Text-node density: 5 `<Text` in PostFoodScreen.tsx (+8 in PostShared.tsx). Primary action is a small Post button in the top bar (`:148-159`), not docked at the bottom (DEC 90 "one main action docked", DECISIONS_LOG.md:60). The icon note box (`:260-265`) is a tip box (DEC 90). The same "fix" message appears three ways: inline errors, a Banner, and a Toast (`:104,267-271`). No haptic on success (Sell posted has one).

<a id="03-post-news"></a>
### Post news  (DEC 98; Feed post)
- Source: apps/mobile/app/(tabs)/sell/news.tsx:3-5 -> apps/mobile/src/features/campus/PostNewsScreen.tsx:67-362
- Route & entry: `/sell/news`, pushed from `SellPhotosScreen.tsx:340` and `CampusFeedScreen.tsx:131`. Close: `router.back()` or `router.replace('/feed')` (`PostNewsScreen.tsx:100`).
- Purpose: Post a headline with optional details, up to 4 photos, a link and, for an event, a date, time and place; shows with the poster's name (`:61-66`).
- Roles: any verified user; 3 a day (`:65`; en.ts:2167).
- Elements:
  - NavBar "Post news" + close + trailing Button S dark "Post" (`:172-188`; en.ts:2093).
  - Input "Headline" (`:191-199`; en.ts:2094-2095); TextArea "Details (optional)" (`:200-208`; en.ts:2096-2097).
  - `PhotosField` "Photos (optional, up to 4)" with "Add photos" and per-photo remove buttons (`:210-216`; `PostShared.tsx:311-393`; en.ts:2098-2099).
  - Input "Link (optional)" url keyboard + meta "A sign-up form, a page or a post." (`:218-235`; en.ts:2100-2102).
  - Toggle "It's an event"; when on: date and time (native pickers: two `PickField` tiles, iOS spinner with a Done button; web date input + time buttons), red event error, Input "Where (optional)" (`:237-339,364-396`; en.ts:2103-2109).
  - Note with users icon: "Everyone on your campus sees it with your name. Event posts hide after the event day. Others hide after 14 days." (`:341-346`; en.ts:2110-2111).
  - Fix Banner and post-error Banner (`:348-357`).
  - After posting: `PostedView` with title "Your post is up" (`:150-163`; en.ts:2112-2113).
- States:
  - Loading: Post `loading` (`:182`); photos uploading meta and Post disabled (`:183`, `PostShared.tsx:356-360`).
  - Empty: blank form; errors hidden until Post (`:111-115`).
  - Error: field errors (en.ts:2155-2166), banner and toast "Fix the highlighted fields to post." (`:120-125,348-352`); event errors "Pick a date and time, or turn off the event switch." / "Pick a time that has not passed yet." / "Events can be up to 90 days away." (`:166,318-327`; en.ts:2164-2166); server failure Banner + Toast (`:132-137,353-357`); a failed photo is dropped with the red line "The photo didn't upload. Try again." (`PostShared.tsx:295-297,374-378`); access off -> warning Banner + Open settings (`PostShared.tsx:379-384`).
  - Populated: `createNews` then `PostedView` (`:127-131,150-163`).
  - Edge: link validation invalid / long (en.ts:2162-2163); event window capped at 90 days (`:168`). Offline, blocked, suspended: only the generic post failure (en.ts:2173). Reduce motion: not applicable. Dynamic Type: `PickField` has `numberOfLines={1}` on the value (`:391`).
- Copy: en.ts campus block 2092-2113, shared 2140-2174.
- Notes: Text-node density: 6 `<Text` in PostNewsScreen.tsx. Same top-bar Post pattern and note box as Food (`:176-187,341-346`). The form shows up to 8 labeled groups (headline, details, photos, link, event toggle, date, time, place). Trust note about name visibility is accurate and useful (P5) but sits at the bottom.

<a id="03-post-wanted"></a>
### Post a Wanted (requests board)  (C03; board C5; DEC 127)
- Source: apps/mobile/app/(tabs)/sell/wanted.tsx:3-5 -> apps/mobile/src/features/campus/PostWantedScreen.tsx:61-276
- Route & entry: `/sell/wanted`, pushed from `SellPhotosScreen.tsx:332` ("Ask for something") and `CampusFeedScreen.tsx:133`. Close: `router.back()` or `router.replace('/sell')` (`PostWantedScreen.tsx:91`). Others answer with "I have this", which starts a Sell draft (`draft.ts:81-99`).
- Purpose: Ask for something: what, optional budget, optional category, need-by date, alert switch, details and an optional photo; 5 a day (`:56-60`).
- Roles: any verified user; 5 a day (en.ts:2170).
- Elements:
  - NavBar "Ask for something" + close + trailing Button S dark "Post" (`:148-164`; en.ts:2115,2141).
  - Input "What are you looking for?" (`:167-175`; en.ts:2116-2117).
  - Input "Budget in dollars (optional)" + meta "Leave it empty if you are flexible." (`:176-189`; en.ts:2118-2120).
  - "Category (optional)" chips (top-level categories only) + meta "People who list something in this category hear about your post." (`:190-214`; en.ts:2121-2122).
  - "Need it by" chips No rush / This week / In 2 weeks / This month (`:215-235`; en.ts:2124-2125).
  - Toggle "Alert me" with "Get a notification when someone lists a match." (`:236-241`; en.ts:2127-2128).
  - TextArea "Details (optional)" (`:242-249`; en.ts:2129-2130).
  - `PhotoField` optional photo (`:250-255`).
  - Note with info icon: "Others see your first name and budget. Anyone who has it lists it, and you get a notification so you can make an offer." (`:256-261`; en.ts:2131-2132).
  - Fix and error Banners (`:262-271`).
  - After posting: `PostedView` "Your Wanted post is up" / "We'll tell you when someone lists one." with "See the Feed" (opens Feed filtered to Wanted) and "Done" (`:128-142`; en.ts:2133-2134,2138-2139).
- States:
  - Loading: Post `loading` (`:158`), disabled while a photo uploads (`:159`); categories load silently (chips appear when data exists, `:144,190`).
  - Empty: blank form; errors hidden until Post (`:94-98`).
  - Error: field errors (title, budget "Budgets go up to $2,000.") with banner and toast "Fix the highlighted fields to post." (`:103-107,262-266`; en.ts:2155,2160); server failure Banner + Toast, cap "That's 5 Wanted posts today, the most for one day. You can post again tomorrow." (`:119-122,267-271`; en.ts:2170); preference save failure is swallowed (`.catch(() => {})` `:115`).
  - Populated: `createListing` then optional `setWantedPrefs` then `PostedView` (`:112-117,128-142`).
  - Edge: categories failed -> category section silently absent (`:190`, no error branch found). Offline, blocked, suspended: only generic failure. Reduce motion: not applicable. Dynamic Type: chips wrap (`:288`).
- Copy: en.ts campus block 2114-2139, shared 2140-2174.
- Notes: Text-node density: 6 `<Text` in PostWantedScreen.tsx; 8 field groups plus a note box. Same top-bar Post pattern (`:152-163`) and icon note (`:256-261`) as Food and News. Trust note about "first name and budget" is in the note at the bottom (P5).

<a id="03-post-confirmation"></a>
### Campus post confirmation  (PostedView, shared by Food, News, Wanted)
- Source: apps/mobile/src/features/campus/PostShared.tsx:402-433 (used at `PostFoodScreen.tsx:127`, `PostNewsScreen.tsx:154`, `PostWantedScreen.tsx:132`)
- Route & entry: in-place state of the post screens (no route); shown after `setPosted(listing)`.
- Purpose: Confirms a campus post is up (or in review) with a way to the Feed.
- Roles: poster. A held post (`status === 'held_review'`) swaps copy (`PostShared.tsx:417,422,425`).
- Elements: `SuccessCheck` (label "Posted", en.ts:2137); centered title; centered body; Button "See the Feed" and secondary Button "Done" (`PostShared.tsx:419-431`; en.ts:2138-2139). Titles: "Your free food post is up", "Your post is up", "Your Wanted post is up" (en.ts:2090,2112,2133); review: "Your post is in review" / "Most reviews take under 2 hours. We'll tell you when it's up." (en.ts:2135-2136).
- States: loading, empty and error not applicable (terminal). Populated and in-review variants above. Offline, blocked, suspended: not applicable. Reduce motion: `SuccessCheck` fades in (`SuccessCheck.tsx:11`). Dynamic Type: centered column, `justifyContent: 'center'` (`PostShared.tsx:439-445`).
- Copy: en.ts campus block 2090,2112,2133-2139.
- Notes: Text-node density: 2 `<Text` in PostedView (title, body). No haptic here although Sell posted fires success (`SellPostedScreen.tsx:69`). Two stacked buttons (primary + secondary) rather than one primary; everything is centered (`PostShared.tsx:439-447`).

<a id="03-post-photo-source"></a>
### Photo source sheet  (shared by Food, News, Wanted)
- Source: apps/mobile/src/features/campus/PostShared.tsx:34-66
- Route & entry: `Sheet` opened by "Add a photo" / "Change photo" / "Add photos" (`PostShared.tsx:199-207,363-371`).
- Purpose: Choose camera or library for a campus post photo.
- Roles: any verified user.
- Elements: Sheet titled "Add a photo" with two secondary Buttons "Take a photo" and "Choose from library" (`PostShared.tsx:46-64`; campus en.ts:2142; chat en.ts:1242-1243).
- States: loading, empty, error: not applicable on the sheet; access denied is shown on the form as a warning Banner "Photo access is off for OnlySwap. Turn it on in Settings to add a photo." or camera equivalent with "Open settings" (`PostShared.tsx:224-229,379-384`; en.ts:2150-2152). The permission is requested directly by `allowed()` (`PostShared.tsx:24-28`), with no primer screen (unlike Sell step 1).
- Copy: en.ts campus 2142; chat en.ts:1242-1243.
- Notes: Text-node density: 0 `<Text` (Buttons only). Inconsistent with Sell step 1, which shows a full permission primer (`SellPhotosScreen.tsx:253-271`).

<a id="03-edit-listing"></a>
### Edit listing  (F06; P11-SET-01)
- Source: apps/mobile/app/listing/[id]/edit.tsx:5-8 -> apps/mobile/src/features/me/MeScreens.tsx:702-827
- Route & entry: `/listing/[id]/edit` with param `id`, pushed from the owner dock on a listing (`apps/mobile/src/features/feed/ListingScreen.tsx:609`). Presentation: default push in the root Stack (`apps/mobile/app/_layout.tsx:108`, `headerShown: false`; no per-route override found). Back: `router.back()` or `router.replace('/profile/listings')` (`MeScreens.tsx:723`).
- Purpose: Edit title, description, price and open-to-offers, or delete the listing.
- Roles: seller only; a non-owner, a hidden listing or a failed load all show `ErrorState` (`MeScreens.tsx:731-736`).
- Elements:
  - `Screen` frame: NavBar inline "Edit listing" + back (`MeScreens.tsx:55-69,769`; en.ts:1656).
  - Input "Title" max 80 (`:771-777`), TextArea "Description" max 1000 (`:778-783`).
  - Sale only: Input "Price" and Toggle "Open to offers" (`:784-795`; en.ts:1659-1660).
  - Error Banner (`:796`).
  - Button "Save changes", disabled when the title is under 3 characters (`:797-803`; en.ts:1661).
  - Text Button "Delete listing" (`:804-809`; en.ts:1662) -> `ConfirmDialog` "Delete this listing?" / "It disappears for everyone. Open offers are declined and chats close." destructive "Delete listing" (`:811-824`; en.ts:1663-1665).
- States:
  - Loading: `SkeletonList rows=4` (`:725-730`).
  - Empty: not applicable.
  - Error: load error, not owner or not visible -> `ErrorState` with NOT_FOUND (`:731-736`); save error -> Banner with `errorText(e)` (`:761-763,796`); delete failure is handled by the shared dialog: `onConfirm` awaits `api.deleteListing` before closing (`:817-822`), and `ConfirmDialog` catches the error, shows it inline as an alert and stays open for retry (`apps/mobile/src/components/ConfirmDialog.tsx:53-62,72-75`).
  - Populated: form prefilled from the listing (`:738-743`); save invalidates caches and leaves with no toast (`:758-760`).
  - Edge: sold/hold/removed: only `isVisible` is checked, sold or on-hold listings are not distinguished (no branch found). Price field has no validation or hint: an empty or non-positive price is silently not sent (`dollarsToCents` returns undefined `apps/mobile/src/features/search/logic.ts:89-95`, `:751-755`). Unsaved changes on back: not handled (no branch found). The doc comment says a price drop tells savers (`:701`) but no UI says so. Offline: generic save error. Reduce motion, Dynamic Type: standard form, no custom handling. Photos, category and condition are not editable (no fields).
- Copy: en.ts me block 1578-1980: 1656-1665; es.ts same keys.
- Notes: Text-node density: 0 `<Text` directly in the edit branch (all copy through Input/TextArea/Button/Toggle/Banner). Save is a full-width in-scroll button, not docked (`:797-803`); DEC 90 one primary docked (DECISIONS_LOG.md:60). Success has no toast while Relist has one (`MeScreens.tsx:843`).

<a id="03-relist"></a>
### Relist  (F08; P11-SET-01)
- Source: apps/mobile/app/listing/[id]/relist.tsx:5-8 -> apps/mobile/src/features/me/MeScreens.tsx:830-867
- Route & entry: `/listing/[id]/relist` with param `id`, pushed from My listings when `can_relist` (`apps/mobile/src/features/me/MeScreens.tsx:576-582`). Default push presentation (`apps/mobile/app/_layout.tsx:108`). Back: `router.back()` or `router.replace('/profile/listings')` (`MeScreens.tsx:836`).
- Purpose: Put an expired or sold-out listing back up, with an optional new price.
- Roles: seller; ownership and eligibility are enforced server-side (the screen loads no listing, `MeScreens.tsx:830-850`).
- Elements: NavBar "Relist" + back (`:852`; en.ts:1667); body "Your listing goes back to the top of the deck for 60 days." (`:854`; en.ts:1668); Input "New price (optional)" (`:855-861`; en.ts:1669); error Banner (`:862`); Button "Relist" with loading (`:863`; en.ts:1670).
- States:
  - Loading: Button `loading` only (`:863`); the listing itself is never fetched.
  - Empty: blank price field.
  - Error: Banner with `errorText(e)` (`:845-847,862`).
  - Populated: success Toast "Relisted" then leave (`:841-844`; en.ts:1671).
  - Edge: shows no title, photo or current price of the listing being relisted (no listing query, no branch found). Price validation: invalid text becomes `null` (`dollarsToCents(price) ?? null`, `:841`). Sold/removed/suspended: server decides. Offline: generic error Banner. Reduce motion, Dynamic Type: not applicable.
- Copy: en.ts me block 1667-1671.
- Notes: Text-node density: 1 `<Text` in the relist branch (`:854`). "Deck" in the body is old vocabulary versus "Discover" in the tab (`en.ts:1668`); the Button label "Relist" is a verb (good). Not docked (`:863` inside `styles.body`).
