# 02 Discover, listing, search and saved

[Index: SCREENS.md](../SCREENS.md) | [Design review: DESIGN_REVIEW.md](../DESIGN_REVIEW.md)

Route files covered (all under `apps/mobile/app/`): `(tabs)/discover/_layout.tsx`, `(tabs)/discover/index.tsx`, `(tabs)/discover/campus.tsx`, `listing/[id]/index.tsx`, `listing/[id]/photos.tsx`, `listing/[id]/comments.tsx`, `listing/[id]/stats.tsx`, `search/_layout.tsx`, `search/index.tsx`, `search/results.tsx`, `saved/index.tsx`. Feature files: `apps/mobile/src/features/feed/{DiscoverScreen,SwipeDeck,SwipeCard,ListingScreen,ListingStrip,PhotoViewerScreen}.tsx` and `deckMath.ts`, `features/campus/DiscoverHeader.tsx`, `features/search/{SearchScreen,ResultsScreen,FiltersSheet}.tsx`, `features/saved/SavedScreen.tsx`, `features/comments/{CommentsScreen.tsx,components/CommentRow.tsx,components/SocialBar.tsx}`, plus `features/me/MeScreens.tsx:640-699` (the stats route maps there, not to a stats file). Shared components are described only by how these screens use them (`ListingTile`, `PhotoCarousel`, `ZoomableImage`, `ErrorState`, `EmptyState`, `Banner`, `Sheet`); their own entries live in slice 08.

Two of the five high-impact areas are here: Discover (B01) and Listing detail (B02). Both have deep entries. Haptics: the whole slice contains exactly one haptic call (see the Discover entry, Notes).

<a id="02-discover-layout"></a>
### Discover stack layout  (layout)
- Source: apps/mobile/app/(tabs)/discover/_layout.tsx:3-6
- Configures a plain `Stack` with `headerShown: false`; Discover draws its own large-title header (B01). No guards, no tabs here (the tab bar is the parent `(tabs)` layout).

<a id="02-discover"></a>
### Discover  (B01)
- Source: apps/mobile/app/(tabs)/discover/index.tsx:3-5 -> apps/mobile/src/features/feed/DiscoverScreen.tsx:53-273 (deck: SwipeDeck.tsx:82-165, card face: SwipeCard.tsx:59-115, header: apps/mobile/src/features/campus/DiscoverHeader.tsx:28-64, swipe queue: apps/mobile/src/features/feed/swipes.ts:40-99)
- Route & entry: `/discover`, tab root of the Discover tab, no params. Linked from the tab bar; `router.replace('/discover')` from the unavailable-listing screen (ListingScreen.tsx:699), the listing back fallback (ListingScreen.tsx:168), Saved (SavedScreen.tsx:117, :267). Leaves to: listing detail `router.push('/listing/[id]', {id, from:'discover'})` on card tap (DiscoverScreen.tsx:208-212), offer sheet `router.push('/listing/[id]/offer')` on a right swipe or the Make an offer button (DiscoverScreen.tsx:202), `/search` (DiscoverHeader.tsx:51), `/sell` from the end/day-one empty state (DiscoverScreen.tsx:235). The old `/discover/campus` link redirects to Feed (see below).
- Purpose: swipe through active campus listings: skip, save, or make an offer, with undo and an offline-safe queue.
- Roles: any verified student. No signed-out, owner or suspended branch exists in this screen (`not handled (no branch found)`); the feed RPC `get_feed` decides what is returned (features/feed/api.ts:27). Own listings are not filtered client-side.
- Elements:
  - Header block (DiscoverHeader.tsx:33-61): campus short name, `Text variant="meta"` ink3, only when `get_me` has loaded (:36-40, `testID discover-campus`); large title `feed.title` "Discover", `variant="title"` role header (:41-43); round filled `IconButton icon="search"` label `feed.search` (:46-53); `NotificationBell filled` label `feed.notifications` (:54-58). Header is not inside a ScrollView, so it never collapses.
  - Deck stage (SwipeDeck.tsx:132-154): up to 3 mounted cards (MOUNTED = 3, :73); top card is a `GestureDetector` (Pan race Tap) with `accessibilityRole="button"`, label from `cardLabel` and hint `feed.cardHint` (:322-331).
  - Card face (SwipeCard.tsx:66-113): full-bleed `Photo` with `backdrop` and segment bars (one per photo, shown when more than one photo, :69-75); below on white: title `heading` 1 line + price `heading` 1 line (:78-85); meta `meta` ink2 "Good condition · 12 minutes ago" (:86-90, built by `metaLine`, logic.ts:93-100); seller row `Avatar S` + first name and initial `label` + year and "n people saved this" `meta` ink3 (:91-103, `sellerMeta` omits year/saves when `compact`, :62-64); trust row shield icon green + "Verified student · 95% thumbs up" or "· 3 swaps", plus "Moving out by Mar 30" when set (:104-111, `trustLine` logic.ts:119-134). No text sits on the photo.
  - Stamps while dragging (SwipeDeck.tsx:333-350): "Offer" (accent fill, left side, opacity from right drag), "Skip" (ink fill, right side), "Saved" (accent, centered, only for the Save button fly-out).
  - Action row `DeckActions size="L"` (SwipeDeck.tsx:155-162, :184-229): Skip (white circle with hairline border and `liftShadow`, X icon, label `feed.skip`, :196, :487-492), Make an offer (ink pill, `bodyStrong` text `feed.offer`, :209-213), Save (accent circle, heart icon `tone="onAccent"`, label `feed.save`, :223-225). Buttons are disabled with opacity 0.35 when there is no top card (:485, :503).
  - First-swipe coach (DiscoverScreen.tsx:244-262): bordered rounded card absolutely positioned 96 pt above the bottom (styles :280-290), `heading` `feed.coachTitle`, `body` ink2 `feed.coachBody`, `Button size="M" variant="dark"` `feed.coachOk`.
  - Undo toast (DiscoverScreen.tsx:195-203): `useToastStore.showUndo` with `feed.undoSaved` or `feed.undoSkipped`; 5 s (Toast.tsx:41 comment).
- States:
  - loading: `SkeletonCard` inside `styles.stage`, a11y label `feed.loading`, testID `discover-loading` (DiscoverScreen.tsx:217-224). No action row skeleton.
  - error (first page): `ErrorState` with `onRetry={refresh}` (:225-226). `ErrorState` has its own offline variant (ERR_OFFLINE -> `states.offlineTitle`/`offlineBody`, components/ErrorState.tsx:19, :46, :68).
  - error (later page): `load(false)` failing only does `setError(e)` and keeps `phase === 'ready'` (:113-115); if the deck is then empty but `ended` is false the final `else` branch renders `SwipeDeck` with zero cards: blank stage and disabled action row (:240-243, SwipeDeck.tsx:157). No message, no retry (`not handled (no branch found)`).
  - empty, end of deck (`cards.length === 0 && ended`, total >= 10): `EmptyState icon="cards" tile="neutral"` title `feed.endTitle`, body `feed.endBody`, primary `feed.endSell` -> `/sell`, secondary `feed.endRefresh` -> `refresh()` (:227-239).
  - empty, day-one hero (`total < DAY_ONE_MAX`, DAY_ONE_MAX = 10, logic.ts:169): `EmptyState icon="plussq" tile="accent"` title `feed.dayOneTitle`, body `feed.dayOneBody`, same two actions (:228-238). `total` is the number of cards returned to this device in this session (`setTotal`, :109), not a campus count. See Notes.
  - populated deck: described above. Prefetch of the next page of 20 when 5 or fewer cards remain (PAGE = 20 :37, PREFETCH_AT = 5 :39, effect :133-135).
  - first-swipe coach: shown while `onboarding.swipeCoachSeen` is not true in MMKV (:41-45, :87); hidden on the first swipe or "Got it" (:191-194, :256-259). Shown only when `gridWidth === undefined` (:244), so it also shows in phone list mode where there is nothing to swipe (see Notes).
  - list mode, screen reader or reduce motion (DESIGN_SYSTEM X33): `asList = gridWidth !== undefined || (listMode ?? (screenReader || reduced))` (SwipeDeck.tsx:93). `DeckList` is a `ScrollView` with every card rendered (no virtualization, :408-452), each card a 3:4 `SwipeCard` wrapped in a `Tappable` that opens the listing, with four custom accessibility actions offer/save/skip/activate (:74, :395-405, :427-433), and below it a visible `DeckActions size="M"` hidden from the screen reader (:439-448). Offer pill gets `copy.offerShort` "Offer" in narrow grid tiles (:211).
  - iPad / wide window and web: `gridWidth` set (DiscoverScreen.tsx:73-78) so the same list renders as a grid with `gridColumns`/`gridCellWidth` (SwipeDeck.tsx:393-394), `compact` cards.
  - offline queue: swipes are stored in MMKV `feed.swipeQueue` (newest 200) and flushed at 10, on blur, background and when NetInfo says connected (swipes.ts:22-27, :129-149); failures are swallowed and retried at the next trigger (:60-62). Offline itself is visible: the app-wide `OfflineBanner` mounted at the root (`apps/mobile/app/_layout.tsx:110`) shows over Discover after 1.5 s offline (`components/Banner.tsx:38`, :48-73) with the generic `banner.offline` copy (en.ts:77). There is no queue-specific feedback: no pending marker and no line saying queued swipes will be sent (`not handled (no branch found)` in DiscoverScreen or SwipeDeck). The Save button also calls `api.save` directly and shows `feed.saveFailed` toast on error (DiscoverScreen.tsx:197), while the swipe stays recorded and the card stays gone.
  - undo: Skip and Save show an undo toast; `undo()` puts the card back at the front of `items` (DiscoverScreen.tsx:168-180), un-saves a saved card via `api.unsave` (:175-178). `undoPlan` allows 5 s (`UNDO_MS = 5000`, logic.ts:187, :223). A right swipe (offer) shows no toast: it pushes the offer sheet immediately (:201-203). `feed.undoOffer` "Opened the offer" exists (en.ts:910) but is not used anywhere in src.
  - long title: card title and price are single-line truncated (SwipeCard.tsx:79-84).
  - no photo: `Photo` receives `source={null}`, falls back to its placeholder (SwipeCard.tsx:68); photo bars are omitted when 1 or 0 photos (:69).
  - sold / hold / removed: not handled in the deck (the feed returns active listings only, DESIGN_SYSTEM B01 / DEC 97 "Discover only shows active listings"); `FeedItem.status` is never read in DiscoverScreen or SwipeCard.
  - suspended or banned user, blocked user: not handled in this file (server-side filter).
  - Dynamic Type: the stage is `flex: 1` and the card body is natural height (SwipeCard.tsx:118-146), so larger text shrinks the photo; title and price share one line with `numberOfLines={1}` (:79-83) so both truncate at large sizes.
  - reduce motion: swaps the deck for the list (see list mode). Fly-out and spring pass `ReduceMotion.Never` explicitly (SwipeDeck.tsx:262, :298) because the deck is not shown in reduce-motion mode.
- Copy: apps/mobile/src/strings/en.ts `feed` 881-970 (deck 882-892, Discover B01 906-924, trust 893-900). Errors: `states` 90-97. Spanish: es.ts same keys (es.ts:898-899 undo strings).
- Notes:
  - Haptics in this slice (grep `haptic`, all files): exactly one call. `runOnJS(haptic)('selection')` at SwipeDeck.tsx:286, fired inside the Pan `onUpdate` once when the drag first crosses 35% of card width (`pastThreshold`, deckMath.ts:41-44; `armed` guard resets on release, SwipeDeck.tsx:287, :304). Import at SwipeDeck.tsx:32; doc mentions at SwipeDeck.tsx:78 and deckMath.ts:40. No haptic on Skip, Offer or Save button presses (SwipeDeck.tsx:158-160), on the toast, on list mode actions, or on any other screen in this slice. This matches the budget (DESIGN_SYSTEM.md:97-102).
  - Gesture constants: release at 35% of width or 800 px/s in the drag direction, 12 degree max rotation, stamp fully visible at 25%, next card scales 0.95 -> 1, fly-out 220 ms (deckMath.ts:9-18). Pan has `activeOffsetX [-10, 10]` (SwipeDeck.tsx:279); a tap opens the listing (:307-309). Save leaves upward (deckMath.ts:68-71).
  - Day-one detection can be wrong: `get_feed` omits listings swiped in the last 30 days (logic.ts note DEC 106), so after swiping everything and pressing "Check again", `refresh` resets `total` to the new page length (DiscoverScreen.tsx:109, :123-127), which is 0 and less than 10, and the day-one hero "It's early days here" replaces the end-of-deck message (:228-233). The API returns no campus listing count (see DESIGN_REVIEW.md section 5).
  - Coach copy tells the user to swipe even in list mode (en.ts:913), because the coach only checks `gridWidth` (DiscoverScreen.tsx:244), not `asList`.
  - `cardHint` ("Swipe right to make an offer ... Actions menu has more.", en.ts:892) is set on the top card (SwipeDeck.tsx:329) which is only rendered when a screen reader is off; a screen reader always gets list mode (:93), so the hint is never announced.
  - The Skip circle carries a drop shadow (`liftShadow`, SwipeDeck.tsx:491) while DESIGN_SYSTEM.md:78 says cards have no shadow; it is a button, not a card, but it is the only lifted element on the screen.
  - The offer pill is ink and Save is the accent circle (SwipeDeck.tsx:179-183, :493, :502), per DEC 90 mock screen 4.
  - DESIGN_SYSTEM §10 lists "offline queue" as a B01 state; only the generic app-wide offline banner covers it (app/_layout.tsx:110), with no queue-specific state (see States).
  - Time on top card is tracked for dwell (DiscoverScreen.tsx:143-166, DEC 93/100) and sent with the swipe; it has no UI.
  - Text-node density: 2 `<Text` in DiscoverScreen.tsx, 4 in SwipeDeck.tsx, 6 in SwipeCard.tsx, 2 in DiscoverHeader.tsx. Visible text on a populated phone deck: campus, title, title, price, meta, seller name, seller meta, trust, "Make an offer" = 9 strings plus the 3-string coach on first launch.

<a id="02-discover-campus"></a>
### Discover campus redirect  (redirect)
- Source: apps/mobile/app/(tabs)/discover/campus.tsx:5-7
- Redirects to `/feed` (with `kind` when present) because Around campus moved to the Feed tab (DEC 98). No UI.

<a id="02-listing"></a>
### Listing detail  (B02)
- Source: apps/mobile/app/listing/[id]/index.tsx:6-9 -> apps/mobile/src/features/feed/ListingScreen.tsx:78-682 (Unavailable: :684-703; More like this strip: apps/mobile/src/features/feed/ListingStrip.tsx:15-55; photos: apps/mobile/src/components/PhotoCarousel.tsx)
- Route & entry: `/listing/[id]`, params `id`, `from` (mapped by `toSource(from)`, index.tsx:8, values like discover, search, saved, campus, comments, notification). Pushed from Discover card tap (DiscoverScreen.tsx:210), Search recently viewed (SearchScreen.tsx:160), Results tile (ResultsScreen.tsx:139), Saved row (SavedScreen.tsx:148), Feed (CampusFeedScreen.tsx:126), Comments "Open the post" (CommentsScreen.tsx:114), More like this (ListingScreen.tsx:554), Profile My listings (MeScreens.tsx:180, :543), seller profile (ProfileViewScreen.tsx:189), offers/chat/deal screens (OfferScreen.tsx:112, ChatDetailsScreen.tsx:77, DealScreens.tsx:149) and push notifications (lib/push.ts:61, :75). Standard push in the root Stack (app/_layout.tsx:108).
- Purpose: show one listing so a buyer can decide and offer, and give the owner their controls.
- Roles: the RPC returns `access`: buyer, owner, gone, blocked, other_campus (logic.ts:80-84). `owner = item.access === 'owner'` (ListingScreen.tsx:193). Owner differences: no seller row (:457), no Save or More buttons (:578-597), no hold block (:444), inline view/save/offer counts (:430-442), removed banner and Appeal (:403-429), dock of Edit / Mark sold / See offers (:603-633). Buyer-only: view recorded (`record_view`, :132-139), activity dwell event (:144-166), More like this (shoppable, :124, :549). Signed-out and suspended: not handled in this file (no branch found).
- Elements:
  - Top overlay (ListingScreen.tsx:561-599): white filled `IconButton` back (`nav.back`), share (`feed.share`), heart (`feed.save`/`feed.saved`, accent surface when saved, buyer only), more (`feed.more`, buyer only), all on top of the photo.
  - `PhotoCarousel` square (aspectRatio 1) with page position text on photo and tap to open the viewer at index `i` (:336-348).
  - Price row (:351-363): `Text variant="price"` and, when set, a colored status word `label`: "On hold" amber, "Sold" ink3, "In review" amber, "Removed" amber (:255-266); for food, `FoodTimeTag` when there is no status (:360-362).
  - Title `heading` role header (:364-366); meta line condition and time (:367-369).
  - Notes: away note `feed.sellerAwayBody` (:370-374); news event line with calendar icon (sky) (:375-382); link host (:383-387); food/wanted body (:388-396); "Price is firm" for sale listings with `open_to_offers` false (:397-401).
  - Owner banners: `Banner kind="info"` "Under review" for `held_review` (:403-405); `Banner kind="warning"` removed with reason or no-reason copy (:406-415); then "Appeal this" secondary button or the text "Appeal sent. A person will review it." (:416-429).
  - Owner inline stats: three `label` ink2 texts "{n} views", "{n} saves", "{n} offers" from `view_count`, `save_count`, `offer_count` (:430-442). Not tappable.
  - Hold block (non-owner, status hold): `bodyStrong` amber "On hold" + body "Someone is meeting up for this. It may come back." (:444-453).
  - One bordered list (:456-530): seller row (avatar, name `bodyStrong`, class year or "Seller" `meta`, trust line with green shield, chevron; opens `/user/[id]`, :458-489); meetup rows with sky pin: either "You and the seller pick a spot in chat." (:490-499), or each chosen spot with "Meetup spot" / police label (:500-517), then the free-text meet note (:518-529).
  - "Usually free: ..." availability line (:531-537); description `body` (:539-547).
  - "More like this" `ListingStrip` of `ListingTile`s (180 pt wide cells, ListingStrip.tsx:62), buyer, sale/free only (:549-557). Strip renders nothing when empty (ListingStrip.tsx:28).
  - Bottom dock (:601-638): buyer gets one `Button` from `cta` (see states); owner gets up to three equal buttons: Edit (secondary), Mark sold (secondary, only for non-campus kinds in active/hold, :612-621) and See offers (dark, non-campus kinds, :622-632).
  - Options `Sheet` "Options" with `ListRow` "Not interested" and destructive "Report listing" (:640-658), `ReportSheet` (:659-668), `AppealSheet` (:669-679).
- States:
  - loading: `NavBar` plus `SkeletonCard` (not photo-shaped) (:170-178).
  - error: `NavBar` plus `ErrorState` with refetch (:180-187).
  - buyer, active, sale: CTA "Make an offer" (dark) -> `/listing/[id]/offer` (:311-319). Free kind: "Ask for it" (:314). Food: no CTA (`item.kind !== 'food'` guard, :311). Wanted: "I have this" only when `canAnswer(item)` (:286-298). News: "Open link" when a link exists (:299-308).
  - hold (buyer): status word + hold block + dark button "Tell me if it comes back" which turns into disabled "We'll tell you" once `watching` (:274-283, `watch` :225-232). Failure of `watch` reverts silently (:229-231).
  - sold (buyer): status word "Sold" plus a disabled full-width `Button` "Sold" (:284-285). Owner of a sold listing sees Edit and See offers; Mark sold is hidden (:612).
  - away seller (buyer): disabled button "Seller is away" plus the note (:309-310, :370-374).
  - price firm: only a `meta` line "Price is firm"; the CTA still says "Make an offer" (:311-319 vs :397-401), no separate branch (`not handled (no branch found)`).
  - removed (owner): warning banner + Appeal; the dock still offers Edit and See offers (:603-633). held_review (owner): info banner. For a non-owner, `removed` or `held_review` would only show the status word; whether the RPC returns them to buyers is a server matter.
  - gone / blocked / other campus (access not buyer/owner): `Unavailable` renders `NavBar` + `EmptyState` with title/body per access and primary "Back to Discover" -> `router.replace('/discover')`; icon `ban` for blocked and `tag` for the others (:684-703, testID `screen-listing-{access}`). Other campus is DESIGN_SYSTEM "X30"; the dev frame for that case is X31 and uses icon `building` (stateFrames.tsx:467-469 vs ListingScreen.tsx:696).
  - saved toggle: optimistic, reverts and toasts `feed.saveFailed` on error (:212-223); heart uses the accent surface when saved (:582).
  - hide ("Not interested"): `api.hide`, toast `notInterestedDone`, then leaves; error toast `hideFailed` (:241-250).
  - report: `ReportSheet` for target listing; success handled inside the sheet component (slice 08).
  - no photo: `PhotoCarousel` shows a null `Photo` placeholder when there are no photos (PhotoCarousel.tsx:107). Long title: wraps freely (heading, no `numberOfLines`, :364-366).
  - wide (iPad): photos left, details right (:116-117, :332-350).
  - offline: query error path only; no offline-specific branch beyond `ErrorState`'s own offline copy.
  - reduce motion / Dynamic Type: no branch in this file; the owner dock puts three `flex: 1` buttons in one row (:603-633, styles :761-775), which at large text sizes has no wrap or fallback (`not handled (no branch found)`).
  - comments (DEC 121): not shown or linked on this screen. `like_count`, `comment_count`, `comments_enabled` and `liked` exist on `FeedItem` (logic.ts:25-27) but ListingScreen never reads them. See Notes.
- Copy: apps/mobile/src/strings/en.ts `feed` "Listing (B02)" 925-962 and "Options (B03)" 962-967; `system` 1766+ (underReview 1783, removedByAdmin 1786-1787); `safety` 1435+ (appeal 1461, appealed 1462); `deal.markSold` 1362; `campus` 1980+ (listingFood 2180, listingWanted 2181, iHaveThis 2026, openLink 2005); `nav.back` 106.
- Notes:
  - Haptics: none in ListingScreen.tsx (no `haptic` reference). Save heart, Tell me and Mark sold answer with visual state only.
  - The hold state says the same thing three times: amber status word (:355-359), amber block heading "On hold" (:446-448) and the button label (:277). The away state also repeats (button :310 plus note :370-374), and sold repeats (word :357 plus disabled button :285).
  - The only comment/like surface for a listing is the Feed card (CampusFeedScreen.tsx:181) and push (lib/push.ts:55). DEC 121 says likes and comments exist on every Feed post, including sale and free, but a buyer opening a sale listing from Discover cannot reach its comments from here.
  - Owner inline counts are not linked to the Stats screen (F04); Stats is reachable only from My listings (MeScreens.tsx:552).
  - "Price is firm" is shown but the primary button remains "Make an offer" (see states). Behavior of the offer sheet when `open_to_offers` is false is outside this slice.
  - Other-campus copy and icon differ from the dev state frame (see states).
  - Mark sold button for owner uses `deal.markSold` (en.ts:1362), consistent with DEC 97.
  - Text-node density: 24 `<Text` in ListingScreen.tsx (1 in ListingStrip.tsx). A buyer on an active sale with spots, description and trust sees about 12 text lines before "More like this".

<a id="02-listing-options"></a>
### Listing options sheet and report  (B03)
- Source: no route; rendered inside apps/mobile/src/features/feed/ListingScreen.tsx:640-668 (`Sheet` + `ReportSheet`); DESIGN_SYSTEM lists it as `listing/[id]/options` sheet.
- Route & entry: opened by the More circle on the listing (`listing-more`, ListingScreen.tsx:589-596), buyer only. Presentation: `Sheet` (bottom sheet) in-place; report is a second sheet after this one closes (:652-655).
- Purpose: hide a listing from my feed or report it.
- Roles: buyer only (owner gets no More button, :588). Report needs a verified member (server).
- Elements: `Sheet` title `feed.optionsTitle` "Options" (:643); `GroupedList` with `ListRow` "Not interested" icon eye (:647) and `ListRow` "Report listing" icon flag, destructive (:648-656); `ReportSheet target="listing"` with reasons, details and submit (:659-668); toast on hide.
- States: loading n/a. Hide in flight: no spinner or disabled state on the row (`hide` closes the sheet first, :241-243). Error: toast `feed.hideFailed` (:248). Success: toast `feed.notInterestedDone` and the listing closes (:245-246). Report submit states live in ReportSheet (slice 08). Empty, offline, sold/hold/removed, long title, Dynamic Type: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`) in this file.
- Copy: en.ts `feed` 962-967.
- Notes: no haptic; the report success check lives in the shared sheet. Text-node density: 0 `<Text` here (rows are `ListRow`).

<a id="02-listing-photos"></a>
### Photo viewer  (B04)
- Source: apps/mobile/app/listing/[id]/photos.tsx:5-13 -> apps/mobile/src/features/feed/PhotoViewerScreen.tsx:20-86 (zoom: apps/mobile/src/components/ZoomableImage.tsx:53-157)
- Route & entry: `/listing/[id]/photos`, params `id`, `i` (start index; `Number(i) || 0`). Presentation `fullScreenModal` with `fade` animation, set from the route file (photos.tsx:9). Pushed by tapping a photo in the carousel (ListingScreen.tsx:344-346).
- Purpose: look at the photos full screen: page, pinch to zoom, swipe down to close.
- Roles: anyone who can see the listing; if the cached listing is not visible, `item` is null (PhotoViewerScreen.tsx:39).
- Elements: black `photoBg` root (:89); horizontal paging `FlatList` of `ZoomableImage` (:44-69, label `feed.photoOf` "Photo 2 of 5, {title}"); overlaid `NavBar tone="onPhoto"` with a close button and, when more than one photo, a `label` onPhoto "Photo n of m" (:70-83).
- States: loading: nothing is drawn while the query is pending (empty list on black, no skeleton or spinner; :33, :39-40) (`not handled (no branch found)`); it normally reuses the cached listing (`listingKey`, :33). Empty / error / gone: the list is empty and the screen stays black with only the close button (no message). Populated: described. Close falls back to `/listing/[id]` when there is no history (:35-38). Zoom: `shouldDismiss` needs scale at minimum and drag over 120 pt or 800 px/s (ZoomableImage.tsx:16-17, :35, :99-101). Reduce motion: `resolveMotion('sheet', reduced)` (ZoomableImage.tsx:54, :62). Dynamic Type: the counter is `label` size, no wrap issue. Offline: images are remote and fall to blurhash (ZoomableImage `blurhash` prop); no explicit state. sold/hold/removed: n/a. Start index is not clamped for the counter (`useState(start)`, :34) while the scroll index is (:48).
- Copy: en.ts `feed` 968-970 (photoOf, closePhotos); `photoCount` 901.
- Notes: no haptic. `closePhotos` "Close photos" (en.ts:970) is not used; the close button label comes from `NavBar`. Text-node density: 1 `<Text`.

<a id="02-listing-comments"></a>
### Listing comments  (DEC 121)
- Source: apps/mobile/app/listing/[id]/comments.tsx:5-8 -> apps/mobile/src/features/comments/CommentsScreen.tsx:75-576 (rows: components/CommentRow.tsx:20-179; compact Feed bar: components/SocialBar.tsx:16-91)
- Route & entry: `/listing/[id]/comments`, param `id` (the listing id). Standard push. Reached from the Feed card comment action (CampusFeedScreen.tsx:181) and push notifications for `listing_comment`/`listing_like` types (lib/push.ts:49-55). Not linked from the listing screen itself.
- Purpose: read and write comments (one level of replies, likes) on a Feed post or listing; the post's author can turn comments off.
- Roles: any verified member; post author (`first.is_owner`) gets the top-right options (CommentsScreen.tsx:500-507); comment author or post author can delete (`c.can_delete`, :266); non-authors can report live comments (:269). The composer shows only when `first.can_comment` (:278, :439); otherwise a read-only `Banner` (:485-489).
- Elements: `NavBar` title `comments.title` (:496-498); header with the post title as a link row with chevron (:366-378), Like button with count (:380-399), Top / Newest `Chip`s (:400-413); per comment `CommentRow` (avatar S, grey bubble with name, optional "Author" and body, then time, Like, Reply and like count under it, CommentRow.tsx:65-179); "View n more replies" (:301-321); composer: reply bar "Replying to {name}" with cancel (:441-457), multiline `TextInput` with `maxLength` (:459-473), accent `IconButton icon="send"` (:474-482); `ActionSheet` for comment options (:512-517) and post options (:518-528); `ReportSheet` for `listing_comment` (:529-544); `ConfirmDialog` delete (:545-573).
- States:
  - loading: `SkeletonList rows={4}` (:327-332). Next page: `ActivityIndicator` footer (:423-431). Replies loading: `ActivityIndicator` in the more row (:309-313).
  - error: `ErrorState` with refetch (:345-347); `NOT_FOUND` shows `EmptyState icon="eye"` "This post is gone" with "Go back" (:333-344).
  - empty: `EmptyState icon="chat"` "No comments yet" with body "Be the first to say something." only when commenting is allowed (:418-422).
  - closed or off: info `Banner` `comments.closedNote` or `comments.offNote` in place of the composer (:485-489).
  - held comment: amber note "Only you can see this while a person checks it." (CommentRow.tsx:95-99) and a toast `heldToast` after posting (CommentsScreen.tsx:230).
  - blocked (contact details): error `Banner` with the reason copy (:211-214, :434-438). Deleted comment: "Comment deleted" placeholder (CommentRow.tsx:45-56).
  - offline: query error path; a failed send toasts `errorText(e)` (:231-234). Like failure toasts `comments.likeFailed` and refetches (:128-131).
  - long comment: bubble wraps; `COMMENT_MAX` input cap (:470). Dynamic Type: bubbles wrap; header row of Like + two chips has no wrap fallback (:379-414).
  - blocked / suspended user, sold/hold/removed post: not handled in this file (server returns `can_comment`).
  - reduce motion: no animation of its own.
- Copy: en.ts `comments` 2285-2345 (empty 2314-2315, offNote 2316, closedNote 2317, goneTitle 2333-2334).
- Notes: no haptic in CommentsScreen, CommentRow or SocialBar. Real names are shown (DEC 121). The send button is an accent fill docked above the keyboard (KeyboardAvoidingView, :351), the one primary action. Text-node density: 6 `<Text` in CommentsScreen.tsx, 9 in CommentRow.tsx, 3 in SocialBar.tsx.

<a id="02-listing-stats"></a>
### Listing stats  (F04)
- Source: apps/mobile/app/listing/[id]/stats.tsx:5-8 -> apps/mobile/src/features/me/MeScreens.tsx:640-699 (`ListingStatsScreen`)
- Route & entry: `/listing/[id]/stats`, param `id`. Standard push. Only link in the app: a "Stats" text `Button` on each row of My listings (MeScreens.tsx:546-553). The listing screen's owner counts do not link here.
- Purpose: the seller's numbers for one of their listings.
- Roles: owner only, enforced on the server: `listing_stats(id)` raises `NOT_FOUND` when the listing does not exist, the caller is not `seller_id`, or status is `deleted` (supabase/migrations/0030_profile_settings.sql:64-66). The client has no owner check: a non-owner (or a deep link) gets the generic `ErrorState` with a Try again that can never succeed (MeScreens.tsx:643, :649).
- Elements: `Screen` title `me.statsTitle` "Listing stats" with back (MeScreens.tsx:695); a 2-column grid of four big-number cells Views, Saves, Offers, Open offers (`Text variant="price"` + `meta` label, :654-668); "Best open offer: $x" `bodyStrong` when present (:669-671); "Listed {date} · Expires {date}" (:672-675); heading "Price changes" (:676-678) and either "No price changes yet" or one `body` line per change "Mar 3: $40 -> $35" (:679-690).
- States: loading `SkeletonList rows={4}` (:648); error `ErrorState` (:649); empty: zero counts are shown as 0; no price changes copy (:679-682); populated. long title / no photo / sold / hold / removed: not shown (no title or photo on this screen; no status branch). offline: ErrorState offline variant. Dynamic Type: grid cells are plain stacked text (no fixed height seen). Suspended / blocked: not handled.
- Copy: en.ts `me` 1578+ block, F04 lines 1645-1655.
- Notes: the 2-column big-number grid is the "stat-box grid" DEC 90 removed from the redesign (DECISIONS_LOG.md:60). All four counts are real API fields (`ListingStats`, features/me/api.ts:40-50); there is no time series. The arrow in the price-change line is a typed character in code (MeScreens.tsx:688). No haptic. Text-node density: 8 `<Text` in this component body (grid map counts as 2).

<a id="02-search-layout"></a>
### Search stack layout  (layout)
- Source: apps/mobile/app/search/_layout.tsx:3-5
- Plain `Stack` with `headerShown: false` for Search and Results (each screen draws its own bar). No guards. Root stack sets the push presentation (app/_layout.tsx:108).

<a id="02-search"></a>
### Search  (B06, B14, B15)
- Source: apps/mobile/app/search/index.tsx:3-5 -> apps/mobile/src/features/search/SearchScreen.tsx:38-208 (row: :211-255)
- Route & entry: `/search`, no params. Pushed from the Discover header (DiscoverHeader.tsx:51), the Feed header (CampusFeedScreen.tsx:209) and Saved's empty searches action (SavedScreen.tsx:207). Goes to Results via `router.push('/search/results', {q})` (SearchScreen.tsx:86).
- Purpose: type a query or pick a recent, suggested or recently viewed item.
- Roles: any verified student; recent searches live on the phone only (MMKV `search.recent`, :25-28, max 8, logic.ts:105).
- Elements: top bar with `Input kind="search"` (autofocus, hidden label, `onSubmitEditing` runs the search, :111-123) and `Button variant="text" size="S"` "Cancel" -> `router.back()` (:125); with fewer than 2 typed characters: "Recently viewed" strip (`ListingStrip`, :155-163), "Recent" header with "Clear" and rows with an x remove button (:164-184), "Popular right now" rows (:185-202); with 2 or more characters (200 ms debounce, :30, :70-75): "Suggestions" `label` ink3 header, an always-present `Search for "{q}"` row unless a suggestion equals the text, then suggestion rows with icon by type and optional right text (`Saved search` or `{n} listed` for categories, :100-105, :134-151). Rows are hairline-separated (:276-281).
- States: loading: no loading state for suggestions (`suggestions.data ?? []`, :107; `not handled (no branch found)`). empty: with no recents, no suggestions and no viewed items the screen is blank under the bar. error: a failed suggest call is silent (empty list). populated: as above. typed text with no suggestion: the "Search for" row keeps the list non-empty (:134-141). long query: row label `numberOfLines={1}` (:234). Dynamic Type: rows use `minHeight` 44 (:283). sold/hold/removed: the viewed strip marks hold only (ListingStrip.tsx:46). offline: suggestions are blank; recents still work (local).
- Copy: en.ts `search` 973-1020 (placeholder 975, recentlyViewed 979, recent 980, clearRecent 981, trending 983).
- Notes: section headers are styled two ways: "Suggestions" is `label` ink3 (:130) while "Recent" and "Popular right now" are `bodyStrong` (:167, :187). "Popular right now" lists whatever `search_suggest('')` returns, which can include saved searches and categories (Suggestion type, search/logic.ts:15-19). Category counts come from the API (`count`, :103-104). Keyboard opens automatically. No haptic. Text-node density: 5 `<Text` in SearchScreen.tsx, 1 in ListingStrip.tsx.

<a id="02-search-results"></a>
### Search results  (B07, X5)
- Source: apps/mobile/app/search/results.tsx:6-9 -> apps/mobile/src/features/search/ResultsScreen.tsx:29-188
- Route & entry: `/search/results`, params `q`, `f` (encoded filters, decoded by `decodeFilters`, results.tsx:8), `saved` (a saved-search id, which marks it seen, ResultsScreen.tsx:77-80). Pushed from Search (SearchScreen.tsx:86) and from a saved search row (SavedScreen.tsx:227-232). Standard push.
- Purpose: browse a grid of matches, filter, and save the search for alerts.
- Roles: any verified student.
- Elements: `NavBar` titled `Results for "{q}"` or "All listings" with a bookmark `IconButton` (label "Save search") at the right (:152-164); a secondary small `Button` "Filters" or "Filters, {n} on" (:165-173); the grid (`FlatList numColumns`, columns from `gridColumns(width)`, :119-147) of `ListingTile`s (price, title, photo, hold tag; :132-142); `FiltersSheet` (:175-185).
- States: loading `SkeletonGrid` (:100-101). error `ErrorState` with refetch (:102-103). empty (X5): `EmptyState icon="search"` "Nothing matches yet" / "Save this search and we will tell you when something shows up.", primary "Save search" (calls the same `save`, :110), secondary "Clear filters" only when filters are on (:104-116). populated grid; next page via `onEndReached` with no footer indicator (:126-129; `not handled (no branch found)` for a loading-more state). Saving: the bookmark is disabled while `saving` (:159); success toast "Search saved. We'll tell you about new matches." and error toast "Couldn't save the search. Try again." (:87-89). Sold tiles never appear (only the hold mapping, :137). Long query: the nav title is one line and will truncate. DESIGN_SYSTEM B07 also lists a "Post a Wanted" action in no-results; not present in the code (`not handled (no branch found)`). Offline: ErrorState offline variant.
- Copy: en.ts `search` 985-998 and filters 999-1015.
- Notes: no result count is shown; `search_listings` returns an array only (search/api.ts:21-25). `search_performed` bucketed analytics and a `searched` activity event (query text goes only to our DB, DEC 93) fire once per query (:65-75). No haptic. Text-node density: 0 `<Text` in ResultsScreen.tsx (all text is in shared components).

<a id="02-search-filters"></a>
### Filters sheet  (B08)
- Source: no route; apps/mobile/src/features/search/FiltersSheet.tsx:26-140, opened from ResultsScreen.tsx:175-185.
- Route & entry: `Sheet` (bottom sheet) toggled by the Filters button (ResultsScreen.tsx:170). Applying updates local state, not the URL.
- Purpose: set category, price, condition, free only, hide skipped, sort.
- Roles: any verified student.
- Elements: `Sheet` title "Filters" (FiltersSheet.tsx:66); multi-select `ChipGroup` of top-level categories (:68-74); "Price" label with two `Input kind="price"` (Min, Max) (:75-97); condition `ChipGroup` (New, Like new, Good, Fair via `sell.conditions`, :98-104); two `Toggle`s "Free stuff only" and "Hide things I skipped" (:105-114); `SegmentedControl` "Sort" with Best match (only with a query), Newest, Lowest price, Highest price (:55-57, :115-120); a row with secondary "Reset" and primary "Show results" at the end of the scroll content (:121-136).
- States: loading categories: the chip group is empty until `categories` loads (`cats.data ?? []`, ResultsScreen.tsx:183); no skeleton. error: not handled (no branch found). Reopening resets the draft to the applied filters (:44-53). Dynamic Type: a four-segment control with long labels (:115-120) has no wrap fallback. Offline, sold/hold: n/a.
- Copy: en.ts `search` 999-1015 (apply 1014, reset 1015).
- Notes: the primary and Reset buttons scroll with the content instead of docking. No count on "Show results" (the API returns no total). No haptic on toggles/chips. Text-node density: 1 `<Text` in FiltersSheet.tsx.

<a id="02-saved"></a>
### Saved  (B09, B18, B19, X38)
- Source: apps/mobile/app/saved/index.tsx:3-5 -> apps/mobile/src/features/saved/SavedScreen.tsx:50-286
- Route & entry: `/saved`, no params, standard push. Reached from Profile (MeScreens.tsx:290); DEC 90 moved Saved off the Discover header. Back falls back to `/discover` (SavedScreen.tsx:267).
- Purpose: saved listings (with price drops and sold) and saved searches with alert toggles.
- Roles: any verified student.
- Elements: `NavBar` (back only, :266-268); large title `display` "Saved" role header and `SegmentedControl` Items | Searches (:269-282). Items tab: hairline rows with 68 pt thumbnail, title (2 lines), meta, status word (`label`: green "Price dropped", ink2 "Sold" or "On hold"), price right, and an x `IconButton` "Remove {title} from saved" (:127-192). Searches tab: row with query (or "Filtered search"), green "{n} new" when positive, trash `IconButton`, and an "Alerts" `Toggle` below (:217-259).
- States: loading `SkeletonList` per tab (:108, :198). error `ErrorState` per tab (:109-110, :199-200); the new-count query has no error handling (`countsQ`, :71, :197). empty items: `EmptyState icon="bookmark"` "Nothing saved yet" / "Tap the heart on anything you like and it shows up here." / "Start swiping" -> `router.replace('/discover')` (:111-120). empty searches: `EmptyState icon="search"` "No saved searches" / "Save a search and we will tell you when something new matches." / "Search" -> `/search` (:201-210). sold rows at 50% opacity (:301-307); hold word; price dropped = `price_cents < price_at_save` and not sold (:33-37). unsave and delete search are immediate and optimistic with no confirm and no undo; failure silently refetches (:74-82, :95-104). Alerts toggle failure silently refetches (:84-93). Long title: 2 lines then truncates (:164). Dynamic Type: the right-hand price is `bodyStrong` with no shrink (:179). Offline: ErrorState offline variant. Tab choice is not persisted. removed / suspended: not handled (no branch found).
- Copy: en.ts `saved` 1022-1042 (empty 1030-1035, priceDropped 1027), `search.tileSold/tileHold`.
- Notes: row accessibility label joins title, price and status (:138-140). Green is used for price dropped and "n new" (allowed by DEC 90). Saved items come from `get_saved` with `price_at_save` and `saved_at` (saved/api.ts:9, SavedItem :30). No haptic. Text-node density: 7 `<Text` in SavedScreen.tsx.
