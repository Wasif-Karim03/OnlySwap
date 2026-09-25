# screens.md — Screen and page inventory

Each entry is one **route** and lists every design frame it covers.

Legend:
- **R** = reads (table.column or RPC)
- **W** = writes
- **→** = what an action triggers
- Reusable components are in `apps/mobile/src/components/` (**[C]**). Screen-specific components are in `src/features/<f>/components/` (**[F]**).

## 0. Global rules (apply to every screen, not repeated below)

**Global states:**
- **Loading:** skeletons (`[C] Skeleton`) shaped like the final layout. A spinner is used only inside buttons (`[C] Button loading`).
- **Offline:** `[C] OfflineBanner` from `@react-native-community/netinfo` (frame X4). Writes queue only for swipes/saves; everything else shows `ERR_OFFLINE` copy and disables the primary button.
- **Error:** `[C] ErrorState` (retry). Mutation errors map through `src/lib/errors.ts` to inline copy or `[C] Toast`.

**Root gates** (`app/_layout.tsx` → `useAppGate()`), evaluated in this order:
1. `maintenance` → X12 Maintenance
2. `min_version` → X11 Update required
3. no session → `(auth)`
4. `profiles.status`:
   - `waitlist` → A13
   - `reverify` → X9
   - `paused` or `suspended` → X10
   - `banned` → X10 banned variant
5. `adult_confirmed_at` null → A7
6. `rules_accepted_at` null → A11
7. otherwise → `(tabs)`

**Deep links** (`src/lib/deeplinks.ts`), scheme `onlyswap://` plus universal/app links on `EXPO_PUBLIC_SITE_URL`:
- `/l/[id]` → listing
- `/q/[id]` → Quad post
- `/i/[code]` → invite
- `/m/[token]` → web only
- `/chat/[id]`, `/offer/[id]` → from push

Link errors → X30/X31.

**Accessibility baseline:**
- Every touchable has `accessibilityRole` and `accessibilityLabel`. Icon-only buttons get a verb label ("Save listing").
- Hit area ≥ 44×44 pt.
- Text uses Dynamic Type/font scale up to 200% (X32 Large text). Layout stacks instead of truncating; no fixed-height text containers.
- Contrast ≥ 4.5:1 for body text in all 8 skins. `packages/tokens/scripts/contrast.test.ts` checks every token pair.
- `reduceMotion` (`AccessibilityInfo.isReduceMotionEnabled`) swaps springs for 150 ms fades and turns the swipe deck into buttons.
- VoiceOver/TalkBack custom actions on swipe cards (X33 VoiceOver).
- Focus moves to the sheet title when a sheet opens and returns to the trigger when it closes.

**Motion baseline** (design section M):
- Screen push is a native stack.
- Sheets use `[C] Sheet` (Reanimated spring damping 22 / stiffness 240).
- Tap feedback scales to 0.97 over 120 ms with a light haptic.
- Success moments use a check-draw + haptic `notificationSuccess`.

**Analytics:** every screen calls `track('screen_viewed', {name})` only if `analytics_opt_in`. Event list is in plan H6.

**Reusable components** (built in P2, specs in `functions.md` §3):
- Controls: Button (p/k/s/t/dr, sizes, loading, disabled), IconButton, Input (default/focus/error/disabled/loading), TextArea (counter), OTPInput, Chip/ChipGroup, SegmentedControl, Toggle, Radio/OptionRow, Checkbox, Stepper
- Surfaces: Sheet, ActionSheet, Toast/ToastUndo, Banner, Card, ListRow/GroupedList, Tag
- Identity and media: Avatar, Photo (expo-image + blurhash), PhotoCarousel
- Structure: EmptyState, ErrorState, Skeleton, ProgressBar, TabBar, NavBar, StepIndicator, KeyboardAvoider
- Maps: MapView (MapLibre wrapper), SafeSpotPin
- Marketplace: PriceTag, ListingCardH (horizontal), ListingTile (grid), SwipeCard, SwipeDeck, OfferCard, MeetupCard, MessageBubble, PhotoMessage, SystemMessage, RatingThumbs
- Quad: VoteControl, QuadPostCard, PollBlock
- Misc: ReportSheet, ConfirmDialog, PermissionPrimer, OfflineBanner, Mark (logo from `lg-cur` symbol)

---

## A · Sign up (`apps/mobile/app/(auth)/`)

### S-A01 Launch — `app/index.tsx` + native splash · A1
- **Purpose/entry:** cold start.
- **Components:** [C] Mark, [F] LaunchSequence.
- **States:**
  - Loading: splash held until fonts, theme and session restore finish, max 700 ms.
  - Error: session restore fails → treat as signed out.
- **Actions:** none → `useAppGate()` routes.
- **R:** MMKV `theme`, SecureStore session, `app_config` (cached 5 min).
- **Motion:** logo scale 0.9→1 with the stroke draw from M1. Reduce-motion → fade.
- **A11y:** `accessibilityElementsHidden` during animation; announce "OnlySwap".

### S-A02 Welcome — `app/(auth)/welcome.tsx` · A2
- **Purpose/entry:** first screen when signed out.
- **Components:** [C] Button, Mark; [F] FloatingListingChips (3 mini cards, static assets bundled, not live data).
- **States:** static. Offline OK.
- **Actions:**
  - "Continue with school email" → S-A03.
  - "I already have an account" → S-A03 with `mode=login` (same flow; the copy says "Welcome back").
- **R/W:** none.
- **Motion:** chips float in with a 60 ms stagger; parallax on scroll is disabled.
- **A11y:** the hero image has an `accessibilityLabel`; chips are hidden from screen readers.

### S-A03 School email — `app/(auth)/email.tsx` · A3, A4 (Reviewer sign-in), A5 (School not found)
- **Purpose/entry:** from Welcome; also from X9 Re-verify and X7 Session expired.
- **Components:** [C] NavBar, Input(email), Button, KeyboardAvoider; [F] SchoolDetectRow, ReviewerPasswordField, SchoolNotFoundCard.
- **States:**
  - Default: empty.
  - Typing: debounced 300 ms `rpc('lookup_school', {domain})`, which shows the detected school row with a check (A3).
  - Unknown domain: A5 card with "Try a different email" / "Get <school> on the list".
  - Personal email (gmail etc.): error inline "Use your school email".
  - Review domain: A4 password field appears.
  - Loading: button spinner.
  - Error: `RATE_LIMITED` ("Too many tries, wait a minute"), network.
  - Offline: button disabled with banner.
- **Actions:**
  - Send code → `auth.sendCode(email)` (`signInWithOtp`) → S-A04. `track('signup_started')`.
  - Reviewer Sign in → `auth.signInReviewer(email, pw)` → gate.
  - Join the waitlist (A5) → `fn waitlist-request` → toast + S-W09-like in-app confirmation (A13 variant without count).
- **R:** RPC `lookup_school(domain)` → `{campus_id, name, status}` or null.
- **W:** Supabase auth (OTP request); `waitlist_requests` (via function).
- **Motion:** the school row slides down with a spring; shake on invalid email.
- **A11y:** `keyboardType="email-address"`, `autoComplete="email"`, `textContentType="emailAddress"`. The school row is announced through an `accessibilityLiveRegion="polite"` / `announceForAccessibility`.

### S-A04 Verify code — `app/(auth)/verify.tsx` · A6, A9 (Wrong email), X2 (Code errors)
- **Purpose/entry:** after Send code.
- **Components:** [C] OTPInput (6 cells, `textContentType="oneTimeCode"`, `autoComplete="sms-otp"`), NavBar; [F] ResendTimer.
- **States:**
  - Waiting.
  - Autofill.
  - Verifying (cells pulse).
  - Wrong code: X2, cells shake red, "That code didn't work. 2 tries left".
  - Expired: X2 variant with Resend.
  - Too many attempts: lockout 5 min.
  - Resend countdown 60 s.
  - A9 "Use a different email" → back.
  - Offline: disabled.
- **Actions:**
  - Complete 6 digits → `auth.verifyCode(email, token)` → session → gate. `track('email_verified')`.
  - Resend → `sendCode` again (60 s rule).
- **W:** auth session; the trigger `on_auth_user_created` creates the `profiles` row.
- **Motion:** each digit pops in; success check draws.
- **A11y:** single hidden TextInput for screen readers, announced "Code, 6 digits".

### S-A07 Age check — `app/(auth)/age.tsx` · A7 Birthday, A8 Not eligible
- **Purpose/entry:** gate when `adult_confirmed_at` is null (after verify).
- **Components:** [C] StepIndicator(3 of 5), Button; [F] DOBWheel (month/day/year, nothing preselected, years 1940 → current year), NotEligibleView.
- **States:**
  - Checking OS signal (spinner, up to 3 s).
  - Signal says 18+ → skip straight to Profile.
  - Signal under 18 → A8.
  - Signal unavailable or declined → Birthday wheel.
  - Continue is disabled until all three wheels are set.
  - Error: network → retry.
- **Actions:**
  - `age.requestAgeSignal()` (expo-age-range) → `rpc('confirm_age', {method:'os_signal', is_adult})`.
  - Continue → `rpc('confirm_age', {method:'self_declared', birth_date})`. The server computes adulthood and **does not store DOB**.
  - Under 18 → the server inserts into `age_blocks(email_hash)`, calls `delete-account` in `mode=underage` and signs out → A8.
  - A8 Close → Welcome.
- **W:** `profiles.adult_confirmed_at`, `profiles.age_method`; `age_blocks`.
- **Motion:** wheel is native picker style with a haptic per tick.
- **A11y:** wheels are adjustable (`accessibilityRole="adjustable"`, increment/decrement actions).

### S-A10 Profile setup — `app/(auth)/profile.tsx` · A10
- **Components:** [C] Avatar (tap to add photo), Input(first name), ChipGroup(year), Button; [F] ShownAsPreview ("Wasif K.").
- **States:**
  - Photo optional.
  - Name required, 1–30 characters, letters/space/hyphen/apostrophe.
  - Upload progress on the avatar.
  - Camera or photos denied → X20/X21 path.
- **Actions:**
  - Add photo → `media.pickPhotos({max:1})` → `media.processPhoto` → `media.uploadPhotos(kind:'avatar')`.
  - Continue → `rpc('update_profile', {first_name, last_initial, year})`.
- **W:** `profiles.first_name, last_initial, year, avatar_path`.
- **A11y:** the year chips form a radio group.

### S-A11 Community rules — `app/(auth)/rules.tsx` · A11
- **Components:** [F] RuleRow ×4, [C] Checkbox, Button.
- **States:** Continue is disabled until the box is checked ("I'm 18 or older and agree to the Community Rules, Terms and Privacy Policy"); the links open S-X-LEGAL.
- **Actions:** Agree → `rpc('accept_rules', {version:'2026-09'})`.
- **W:** `profiles.rules_accepted_at`, `rules_version`.
- **A11y:** the checkbox label includes the full sentence, and each link is focusable separately.

### S-A12 Notifications primer — `app/(auth)/notifications.tsx` · A12
- **Components:** [C] PermissionPrimer, [F] SampleNotificationStack.
- **Actions:**
  - "Turn on notifications" → `push.requestPermissionAndRegister()` → OS prompt → store token → (tabs).
  - "Not now" → (tabs); asked again after the first offer is sent.
- **States:** permission already granted → skipped. Denied earlier → shows the "Open Settings" variant.
- **W:** `push_tokens`.
- **A11y:** the sample notifications are hidden from screen readers.

### S-A13 Campus waitlist — `app/(auth)/waitlist.tsx` · A13, W9 in-app equivalent
- **Purpose/entry:** gate when `profiles.status='waitlist'`.
- **Components:** [C] ProgressBar, Card, Input(read-only link), Button; [F] BigCounter, HowItWorksTour (3 cards from Demo University sample data; required for Apple 4.2 / Play minimum functionality).
- **States:**
  - Live count updates on focus plus every 60 s.
  - Offline → cached count.
  - Unlocked → auto-switches to S-A14.
- **Actions:**
  - Copy link → clipboard + toast.
  - Share → native share sheet with `SITE_URL/i/{invite_code}`. `track('invite_shared')`.
  - Take the tour → tour sheet.
- **R:** `campus_progress` view (`count`, `threshold`), `profiles.invite_code`, own waitlist position (`rpc('my_waitlist_position')`).
- **Motion:** the counter rolls on change.
- **A11y:** the progress bar announces "488 of 500".

### S-A14 Campus unlocked — `app/(auth)/unlocked.tsx` · A14
- **Entry:** first open after `campuses.status` turns `live`, or from the `campus_unlocked` push.
- **Components:** [F] ConfettiBurst (Reanimated, 1.2 s, off with reduce motion), FoundingSellerCallout.
- **Actions:**
  - "Start swiping" → (tabs)/discover.
  - "List something" → sell.
  - Marks `profiles.seen_unlock_at`.
- **W:** `profiles.seen_unlock_at`.

---

## B · Buy (`app/(app)/`)

### S-B01 Discover (swipe) — `app/(app)/(tabs)/discover/index.tsx` · B1 Swipe, B2 First swipe, B3 mid-drag, B4 End of deck, X24 Undo swipe, N1 Android Discover, X33 VoiceOver
- **Components:**
  - [C] TabBar, SwipeDeck, SwipeCard, IconButton (skip/save/offer), SegmentedControl (Swipe | Campus), ToastUndo.
  - [F] FirstSwipeCoach (shown once, flag in MMKV `coach.firstSwipe`), CampusSwitcherPill, EndOfDeck.
- **States:**
  - Loading: 3 skeleton cards.
  - Empty campus: C6 Day one variant.
  - End of deck (B4): "You've seen everything new", with Saved searches + "Post a Wanted".
  - Error: retry.
  - Offline: cached deck, swipes queued in MMKV `pendingSwipes`.
- **Actions:**
  - Swipe left → `swipe(listing,'left')`, batched every 10 swipes or on blur → `rpc('record_swipes', {items})`. Undo toast lasts 5 s → `rpc('undo_swipe')`.
  - Swipe right / $ → S-B09 Make an offer sheet.
  - Save → `rpc('save_listing')`, then the "N people saved this" pill updates.
  - Tap card → S-B05 Listing.
  - Filter icon → S-B15.
  - Search icon → S-B12.
  - Pull to refresh → refetch.
- **R:** `rpc('get_feed', {cursor, limit:20})` returns listing, first photo, seller mini, save_count, distance label. Prefetch the next 3 images through `Image.prefetch`.
- **W:** `swipes`, `saves`.
- **Motion:**
  - Drag rotates ±12° mapped to x.
  - Stamp labels (SKIP / OFFER) fade in past 25% width.
  - Release threshold is 35% width or velocity 800.
  - Fly-out spring; the next card scales 0.95→1.
  - Haptic `selection` at threshold.
  - Undo reverses the fly-out.
- **A11y:**
  - Each card: `accessibilityLabel` "Mini fridge, 3.1 cubic feet. $40. Good condition, Baker Hall, 12 minutes ago. Seller Devin P., verified."
  - `accessibilityActions`: Make an offer, Save, Skip, Details.
  - With reduce motion or a screen reader active, the deck renders as a vertical list with buttons.

### S-B05 Listing detail — `app/(app)/listing/[id]/index.tsx` · B5 Listing, B6 Your own listing, B7 On hold, N2 Android listing, X13 Item gone
- **Components:**
  - [C] PhotoCarousel, PriceTag, Tag, Avatar, Button, IconButton.
  - [F] SellerRow, MeetSpotsPreview (mini map), OwnerPanel ("This is your listing", stats), HoldOverlay, StickyOfferBar.
- **States:**
  - Loading skeleton.
  - Buyer view: offer bar.
  - Owner view (B6): stats + Edit + "See N offers".
  - On hold (B7): overlay, "Tell me if it's available" button.
  - Sold/removed: X13 Item gone with similar items.
  - Other campus: X30 (via deep link).
  - Blocked seller: 404 behavior (RLS returns no row → X13).
  - Error, offline (cached).
- **Actions:**
  - Make an offer → S-B09.
  - Save.
  - Share → S-X-SHARE (X25).
  - More → S-B08 Listing options.
  - Seller row → S-B17.
  - Photo → S-B09p Photo viewer.
  - Owner: Edit → S-F06; See offers → S-F05.
  - Hold: "Tell me" → `rpc('watch_listing')`.
- **R:** `listings`, `listing_photos`, `profile_stats` (seller), `safe_spots` for `meet_spot_ids`, `saves` (mine), `offers` (my open offer, if any).
- **W:** `listings.view_count` through `rpc('record_view')` (once per user per day).
- **Motion:** shared-element-like transition: the card image expands through a Reanimated layout animation; the offer bar slides up.
- **A11y:** the carousel is an adjustable element announcing "Photo 1 of 4"; the price is read as currency.

### S-B08 Listing options + Report listing — `app/(app)/listing/[id]/options.tsx` (sheet) · B8, B9
- **Components:** [C] ActionSheet, ReportSheet(target='listing').
- **Actions:**
  - Share.
  - Not interested → `rpc('hide_listing')` (acts as a left swipe) + toast.
  - See seller → S-B17.
  - Report listing → ReportSheet reasons: scam, not allowed, might be stolen, counterfeit, misleading, other + details → `rpc('create_report', {target_type:'listing', ...})` → S-E20 Report sent.
- **States:** submitting; duplicate report → "You already reported this".
- **W:** `reports`, `swipes`.

### S-B09p Photo viewer — `app/(app)/listing/[id]/photos.tsx` · B10
- **Components:** [F] ZoomableImage (pinch, double-tap), pager dots.
- **Actions:** swipe down to close.
- **A11y:** "Close photos" button always visible.

### S-B09 Make an offer — `app/(app)/listing/[id]/offer.tsx` (sheet) · B11 Make an offer, B12 Offer limit, B13 Offer sent
- **Components:** [C] Sheet, Stepper/price input, Chip (quick amounts: ask, −10%, −20%), Chip (quick notes: "Can pick up today", "Can meet at <spot>", "I'll bring a friend to carry it"), TextArea(140), Button.
- **States:**
  - Default at the ask price.
  - Below 50% of ask → warning "Low offers rarely get accepted".
  - Free item → "Ask for it" variant ($0).
  - Rate limited (B12) → sheet explains when; right-swipes are saved instead.
  - Already have a pending offer → "Update your offer".
  - Success (B13) → card flies, "Offer sent. Devin usually replies within an hour", and the notifications primer if push is off.
- **Actions:** Send → `rpc('make_offer', {listing_id, amount_cents, note, quick_notes})`. `track('offer_made')`.
- **W:** `offers`, `notifications` (seller, via trigger), `rate_counters`.
- **Motion:** the amount rolls digits; the send button morphs into a check.
- **A11y:** the amount field is adjustable ±$1 / ±$5.

### S-B12 Search — `app/(app)/search/index.tsx` · B14 Search, B15 Search suggestions
- **Components:** [C] Input(search, autofocus), ListRow; [F] RecentSearches, TrendingChips, SuggestionRow.
- **States:**
  - Empty field: recent searches + "Trending at <campus>".
  - Typing: suggestions from `rpc('search_suggest', {q})`, debounced 150 ms, minimum 2 characters.
  - No suggestions: "Search '<q>'".
  - Offline: recent searches only.
- **Actions:**
  - Suggestion → S-B16 with query.
  - Category suggestion → S-B16 with category filter.
  - Saved-search suggestion → S-B16 with that search.
  - Clear recent.
- **R:** `search_suggest` (pg_trgm over titles + categories + my saved searches), trending view `campus_trending_terms`.
- **W:** MMKV recent searches (device only).

### S-B16 Results — `app/(app)/search/results.tsx` · B16 Results, X5 No results
- **Components:** [C] ListingTile grid (FlashList, 2 columns), Chip (active filters with ×), Button "Save this search".
- **States:**
  - Loading grid skeleton.
  - Results, paginated 30.
  - No results (X5): "Nothing for 'x' yet" + Save search + Post a Wanted.
  - Error.
- **Actions:**
  - Tile → S-B05.
  - Save search → `rpc('create_saved_search', {query, filters, alerts:true})`.
  - Filters → S-B15.
  - Bookmark → save.
- **R:** `rpc('search_listings', {q, filters, cursor})`. `track('search_performed')`.

### S-B15 Filters — `app/(app)/search/filters.tsx` (sheet) · B17 Filters
- **Components:** ChipGroup(category), price range (two inputs + presets), SegmentedControl(condition), Toggle(Free only), Toggle(Walkable, meaning within the campus core), sort (Newest, Price low→high, Most saved).
- **Actions:** Apply → returns filters to the caller; Reset.
- **A11y:** each range input is labelled "Minimum price" / "Maximum price".

### S-B18 Saved — `app/(app)/saved/index.tsx` · B18 Saved, B19 Saved searches, X38 Nothing saved
- **Components:** [C] SegmentedControl (Items | Searches), ListingCardH, ListRow + Toggle (alerts per search).
- **States:**
  - Items: price-drop tag, sold or unavailable greyed out, empty (X38).
  - Searches: list with new-match counts, empty → "Save a search from results".
- **Actions:**
  - Unsave (swipe the row) → `rpc('unsave_listing')`.
  - Toggle alerts → `rpc('update_saved_search')`.
  - Delete search.
  - Tap search → S-B16.
- **R:** `saves`+`listings`, `saved_searches` + `rpc('saved_search_new_counts')`.

### S-B17 Seller profile — `app/(app)/user/[id]/index.tsx` · B20 Seller profile, B21 Seller reviews, B22 New seller
- **Components:** Avatar, VerifiedBadge, StatsRow (swaps, thumbs-up %, response time), SegmentedControl (Listings | Reviews), ListingTile grid, ReviewRow.
- **States:**
  - Normal.
  - New seller (B22): "No swaps yet" card + safe-exchange tip.
  - Blocked by me → "You blocked this person" + Unblock.
  - Loading, error.
- **Actions:**
  - Report / Block (more menu) → S-E19.
  - Tile → listing.
- **R:** `profiles` (public columns via the `public_profiles` view), `profile_stats`, `ratings_visible`, `listings` (active).

---

## C · Campus (`app/(app)/(tabs)/discover/campus.tsx` + posts)

### S-C01 Campus feed — `app/(app)/(tabs)/discover/campus.tsx` · C1 Campus feed, C3 Free stuff, C4 Wanted, C6 Day one, C7 Founding sellers
- **Purpose:** the "Campus" segment on Discover: a time-sorted feed of free food (live, expires in 3h), free stuff, Wanted posts, and new listings.
- **Components:** [C] SegmentedControl, Card, ListingCardH, Tag; [F] FreeFoodCard (countdown), WantedCard ("Got one? Offer it"), DayOneHero (C6), FoundingSellersCard (C7: 34 of 50 spots).
- **States:**
  - Loading.
  - Day one (fewer than 10 listings) → C6 hero + founding sellers.
  - Empty sub-filter → "Nothing free right now".
  - Offline.
- **Actions:**
  - Filter chips: All / Free food / Free stuff / Wanted.
  - Free food card → detail sheet with map.
  - Wanted "I have this" → sell flow prefilled with `wanted_id`.
  - Founding card → sell.
- **R:** `rpc('get_campus_feed', {kind, cursor})`, `campus_progress.founding_left`.

### S-C02 Post free food — `app/(app)/sell/food.tsx` · C2
- **Components:** TextArea(what, 140), place picker (safe spots + "Other building" text), "Until" chips (30 min / 1 h / 2 h / 3 h), optional photo.
- **States:**
  - Daily cap hit (3 per campus-day free-food pushes) → posts still go up but "Push already used today" is shown.
  - Banned words → X-block.
- **Actions:** Post → `rpc('create_listing', {kind:'food', ...})`. The campus push is sent only when `free_food` pref is on per recipient and the campus cap allows.
- **W:** `listings` (kind food, `expires_at`).

### S-C05 Post a Wanted — `app/(app)/sell/wanted.tsx` · C5
- **Components:** Input(title), Input(max price, optional), ChipGroup(category), TextArea.
- **Actions:** Post → `rpc('create_listing', {kind:'wanted'})`. The matching trigger notifies sellers whose active listings match (cap 1 per seller per day).
- **States:** validation, banned words, rate limit (5 Wanted posts a day).

---

## Q · The Quad (`app/(app)/(tabs)/quad/`) — whole tab hidden when `app_config.quad_enabled=false`

### S-Q01 Welcome to the Quad — `quad/welcome.tsx` (modal, first visit) · Q1
- Components: [F] RuleRow×4 (anonymity disclosure "Anonymous to students, not to us"), Checkbox, Button.
- Actions: Agree → `rpc('accept_quad_rules')` → Quad. W: `profiles.quad_rules_accepted_at`.
- A11y: disclosure text is first in reading order.

### S-Q02 Quad feed — `quad/index.tsx` · Q2 Quad, Q3 Quad·new, Q4 Quad·day one, N4 Android Quad
- Components: [C] SegmentedControl(Hot | New | Top), QuadPostCard (body, time, reply count, VoteControl, OP tag, poll, photo thumb blurred until tap if author <7 days old), FAB "New post", Banner (pinned announcement).
- States: loading; day one (Q4: seeded prompts "What's the best study spot?"); empty sort; error; offline cached; auto-hidden posts never shown; muted keywords filtered client-side + server-side.
- Actions: vote ↑/↓ → `rpc('vote_quad', {target:'post', id, value})` optimistic; tap → S-Q05; FAB → S-Q07; long-press → Post options.
- R: `rpc('get_quad_feed', {sort, cursor})` (returns alias not author). W: `quad_votes`.
- Motion: vote count ticks, arrow fills with spring; new-posts pill "3 new posts" slides in.
- A11y: vote buttons "Upvote, 214 points"; posts are single focusable containers with actions.

### S-Q05 Post thread — `quad/post/[id].tsx` · Q6 Post, Q7 Post options, Q5 Quad photo
- Components: QuadPostCard (full), ReplyRow (alias "Anon 3", OP badge), Composer(bottom), ActionSheet.
- States: loading; removed/hidden → "This post was removed"; replies off; error.
- Actions: reply → `rpc('create_quad_reply', {post_id, body})`; vote reply; options: Hide posts from this person → `rpc('hide_quad_author', {post_id})`; Turn off replies (own post) → `rpc('set_quad_replies', {post_id, enabled})`; Copy; Share (campus-only link); Report → S-Q09; photo → full-screen viewer.
- R: `rpc('get_quad_thread', {post_id})`.

### S-Q07 New post — `quad/new.tsx` · Q8 New post, Q9 Post blocked, Q10 Post held
- Components: TextArea(500, counter), photo button, poll builder (2–4 options, 24 h), Check-in toggle, Button Post.
- States: empty (disabled); posting; blocked (Q9: phone/email/room number/links → reason + "Make it a listing"); held (Q10: names/rates a student → "Send for review"); banned words; rate limited (10/h); new account photo → queued for review.
- Actions: Post → `rpc('create_quad_post', {body, kind, poll, photo_path})` → returns `{status: live|held|blocked, reason}`. `track('quad_post_created')`.
- W: `quad_posts`, `quad_poll_options`.

### S-Q09 Report post — sheet · Q11
- ReportSheet(target='quad_post'|'quad_reply') reasons: calls out a student, harassment/threat, hate, sexual content, spam, self-harm concern (routes to crisis resources copy), other → `rpc('create_report')` → toast "Thanks, a person will look at it".

### S-Q12 Your Quad — `quad/mine.tsx` · Q12 · lists my posts/replies with scores and status (live/hidden/held/removed + appeal link). R: `rpc('get_my_quad')`.
### S-Q13 Quad activity — `quad/activity.tsx` · Q13 · replies/milestones on my posts. R: `notifications where group='quad'`. Mark read.
### S-Q14 Muted — `quad/muted.tsx` · Q14 · list of hidden people (shown as "Someone you hid · from post 'best dining…'") + muted keywords; unhide/remove. R/W: `quad_hides`, `quad_mutes`.
### S-Q15 Check-in — `quad/checkin.tsx` · Q15 · place + vibe chips ("Studying at Thompson, quiet") posted as kind `checkin`; expires 3 h. W: `quad_posts`.

---

## D · Sell (`app/(app)/(tabs)/sell/`)

### S-D01 Sell · photos — `sell/index.tsx` step 1 · D1, X16 Uploading and drafts, X20/X21 camera access/denied
- Components: [F] PhotoGrid (up to 8, drag to reorder, first = cover), Camera/Library buttons, StepIndicator(1 of 3), DraftBanner.
- States: no photos (Next disabled); processing (per-tile progress); upload failed (retry tile); draft restored banner; camera permission primer (X19) / denied (X21 → Open Settings / use library).
- Actions: pick (system Photo Picker, `expo-image-picker` `allowsMultipleSelection`, limit 8) → `media.processPhoto` (1080 + 400 WebP, EXIF stripped) → `media.uploadPhotos` via `fn upload-url` presigned PUT → R2. Draft auto-saved to MMKV `draft.listing`.
- W: R2 objects `c/{campus}/l/{draftId}/…`.

### S-D02 Sell · details — step 2 · D2 details, D3 fix these, D4 give it away
- Components: Input(title 80), category picker sheet, SegmentedControl(condition), price Input + [F] PriceHint, Toggle(open to offers), Toggle(give it away → price 0, D4 copy), TextArea(description 1000).
- States: price hint loading / hidden (<5 comparables); D3 errors all at once: banned word in title (links X27 Banned items), missing category, price > $2,000, empty title; Next disabled until valid.
- R: `rpc('price_hint', {category_id})`; `rpc('check_text', {text, scope:'listing'})` debounced for inline banned-word warning.

### S-D05 Sell · meetup — step 3 · D5
- Components: SafeSpot list (RPAC-style zones preselected), MapView preview, Input("Anywhere else?" 60), availability chips (Weekdays / Evenings / Weekends).
- Actions: Post → `rpc('create_listing', {...})` → server validates again, creates listing + photo rows, moves R2 keys from draft id to listing id (client uses listing id reserved earlier via `rpc('reserve_listing_id')` so no moves needed), generates nothing server-side.
- W: `listings`, `listing_photos`.

### S-D06 Sell · posted — step 4 · D6
- Components: success check, ListingCardH preview, Share button, "List another".
- Actions: Share → generates OG share card (react-native-view-shot of `[F] ShareCard`) → upload `share/{listing}.jpg` → native share with `SITE_URL/l/{id}`. `track('listing_created')`.
- W: `listings.share_image_path`.

---

## E · Offers, chat, meetups (`app/(app)/`)

### S-E01 Inbox — `(tabs)/inbox/index.tsx` · E1 Inbox·offers, E2 Inbox·chats, X6 Empty inbox, X32 Large text
- Components: SegmentedControl(Offers (badge) | Chats), OfferCard (incoming: Decline/Review; outgoing: status), ChatRow (last message, unread dot, deal thumb), EmptyState.
- States: loading; empty (X6); offers sections "Waiting on you" / "Offers you made"; error; offline cached; realtime updates only while focused.
- Actions: Review → S-E03; Decline → confirm → `rpc('decline_offer')`; chat row → S-E09.
- R: `rpc('get_inbox')` → offers + chats with unread counts. Realtime: private channel `user:{uid}` for inbox events.

### S-E03 Incoming offer — `offer/[id].tsx` · E3 Incoming offer, E4 Counter offer, E5 Counter received, E6 Offer declined, E7 Offer expired, E8 Withdraw offer
- Components: OfferCard large, buyer mini profile (+ New seller/buyer badge), other offers count, Buttons Accept / Counter / Decline, counter Sheet (price input + note), withdraw confirm Sheet.
- States by role/status: seller pending (E3); seller countering (E4 sheet); buyer receives counter (E5: Accept counter / Counter back (max 3 rounds) / Decline); declined (E6, buyer sees "Save it for later" + similar items); expired 48 h (E7, "Offer again"); buyer withdraw (E8); already accepted elsewhere → "This item is on hold with someone else".
- Actions: Accept → `rpc('accept_offer')` → creates chat, auto-declines others, listing → hold → navigate S-E09; Counter → `rpc('counter_offer', {offer_id, amount_cents, note})`; Decline → `rpc('decline_offer', {offer_id, reason_chip})`; Withdraw → `rpc('withdraw_offer')`; Offer again → S-B09 prefilled.
- W: `offers`, `chats`, `listings.status`, `notifications`.

### S-E09 Chat — `chat/[id]/index.tsx` · E9 Chat, E10 Photos in chat, N3 Android chat, X18 Blocked chat
- Components: NavBar (avatar, name, "usually replies in 10 min"), DealBar (thumb, price, Mark sold / Plan pickup), FlashList inverted of MessageBubble / PhotoMessage (blurred until tapped when sender is a new contact) / SystemMessage / MeetupCard, Composer (camera if `chat_photos_enabled`, text, calendar → S-E11).
- States: loading; first message tip system row ("Meet somewhere public. Never share a code texted to your phone."); sending (clock) → sent → read; failed (tap to retry); blocked (X18 composer replaced by "You blocked Ben · Unblock"); chat closed (sold to someone else → read-only); offline (queue send, show pending); typing indicator skipped (broadcast cost).
- Actions: send text → `rpc('send_message', {chat_id, body, client_id})` (idempotent on client_id); photo → process + `upload-url(kind:'chat')` → `send_message(kind:'photo')`; tap blurred photo → reveal (local state only); calendar → S-E11; more → S-X17 Chat details; long-press message → Copy / Report.
- R: `rpc('get_messages', {chat_id, before})`; Realtime private channel `chat:{id}` (broadcast from DB), subscribe on focus, unsubscribe on blur; mark read `rpc('mark_chat_read')` on focus (debounced 2 s).
- A11y: messages announce sender + time; photo "Photo from Aisha, hidden, double tap to show".

### S-X17 Chat details — `chat/[id]/details.tsx` · X17
- Components: deal summary, meetup summary, mute toggle (per chat), Report, Block, "Delete chat for me".
- Actions: mute → `rpc('set_chat_mute')`; Report/Block → S-E19; delete → `rpc('hide_chat')`.

### S-E11 Plan the pickup — `chat/[id]/meetup.tsx` (sheet) · E11 Plan the pickup, X19 Location access, X20 Location off
- Components: MapView with SafeSpotPin (safe zones first), spot OptionRow list, day/time chips + time picker, Button "Suggest to Aisha".
- States: location primer (X19) on first open → OS prompt (coarse, foreground); denied/off (X20: list sorted without distance + banner "Turn on"); no spots configured → free-text place; proposing; counter-proposal received ("Aisha wants 5:00 PM" Accept / Suggest another).
- Actions: Suggest → `rpc('propose_meetup', {chat_id, spot_id|custom_place, starts_at})` → MeetupCard in chat + push; Accept → `rpc('confirm_meetup')`.
- W: `meetups`, `messages(kind='meetup')`.
- Privacy: location never sent to server; distance computed on device.

### S-E12 Meetup day — `meetup/[id].tsx` · E12 Meetup day, E13 Share with a friend, E14 No-show, E15 Meetup changes, X34 Live Activity (post-launch)
- Components: countdown header, MapView (spot), status row for both people (On the way / Here), Buttons "I'm here" / "Running late" (5/10/15 chips) / "Cancel", "Share with a friend", safety tips card, 911 link (tel: shows confirm).
- States: >2 h before (plain card); T−30 min (reminder); both here; other person late; other person cancelled (E15 red card + reason); rescheduled (E15 strike-through old time); 20 min after start with other not here → "Report a no-show" (E14); completed → "Did it sell?".
- Actions: I'm here → `rpc('checkin_meetup')` (no GPS); late → `rpc('running_late', {minutes})`; cancel → `rpc('cancel_meetup', {reason})`; reschedule → S-E11; share → `rpc('create_meetup_share')` → share sheet `SITE_URL/m/{token}` (W-MEET); no-show → `rpc('report_noshow', {meetup_id, note})`.
- W: `meetups`, `noshow_reports`, `notifications`.

### S-E16 Did it sell? — sheet from push/chat · E16
- Buyer and seller each: "Yes, it's done" / "Not yet" / "It fell through". Seller "Yes" → S-F07 Mark sold with buyer preselected. Buyer "Yes" → marks `chats.buyer_confirmed_at`.
- `rpc('confirm_deal', {chat_id, outcome})`.

### S-E17 Rate the swap — `deal/[chatId]/rate.tsx` · E17 Rate the swap, E18 Rating reveal
- Components: RatingThumbs (up/down), tag chips (On time, As described, Friendly, Easy to deal with / Late, Not as described, Rude), TextArea(200, optional).
- States: submitted-waiting ("You'll both see ratings once Aisha rates, or in 7 days"); reveal (E18 card animation).
- `rpc('submit_rating')`. R: `ratings_visible`.

### S-E19 Report and block (user/chat) — sheet · E19 Report and block, E20 Report sent, E21 Report update
- ReportSheet(target='user'|'chat') reasons: scam/fake payment, harassment, not allowed item, no-show, other; Toggle "Also block" (default on for harassment).
- `rpc('create_report')`, `rpc('block_user')` → E20 confirmation (timeline: received → reviewed → action) → later E21 status page `report/[id].tsx` via push: R `rpc('get_my_report', {id})` (status + generic outcome only). Unblock inline.

---

## F · Profile & settings (`app/(app)/(tabs)/profile/` and `settings/`)

### S-F01 Profile (mine) — `(tabs)/profile/index.tsx` · F1
- Components: Avatar, name, year + campus, verified badge, StatsRow, nudge card ("Got stuff you don't use? Sell"), ListRow menu (My listings, Saved, Wanted posts, Offer history, Safety, Help), header bell + gear.
- R: `profiles`, `profile_stats`, counts via `rpc('my_counts')`.

### S-F02 Edit profile — `profile/edit.tsx` · F2
- Components: Avatar edit, Input(first name), read-only "Shown as", ChipGroup(year), ChipGroup(usually around: areas), TextArea(about 80), locked email row.
- States: dirty → Save enabled; saving; banned words in bio; error.
- `rpc('update_profile')`.

### S-F03 My listings — `profile/listings.tsx` · F3, X37 No listings yet
- Tabs Active / On hold / Sold / Drafts. Rows with stats. Empty (X37) with category suggestions + "List your first thing".
- R: `listings where seller_id=me`, drafts from MMKV.

### S-F04 Listing stats — `listing/[id]/stats.tsx` · F4 · seen, saved, offers, days live, tip ("Listings with 3+ photos sell 2x faster" static). R: `listings` counters, `rpc('listing_stats')`.
### S-F05 Offers on this listing — `listing/[id]/offers.tsx` · F5 · highest/average/waiting stats, offer history list (accepted/countered/expired/declined). R: `rpc('listing_offers')` (seller only).
### S-F06 Edit listing — `listing/[id]/edit.tsx` · F6 · same form as Sell details + photos; price drop triggers saved-by notifications ("price_drop") only if decreased ≥5%. `rpc('update_listing')`. Delete listing (ConfirmDialog, cancels offers) → `rpc('delete_listing')`.
### S-F07 Mark sold — `listing/[id]/sold.tsx` · F7 · pick buyer from chats (or "Someone not on OnlySwap"); `rpc('mark_sold', {listing_id, buyer_id|null})` → closes other chats read-only, rating prompt.
### S-F08 Relist — `listing/[id]/relist.tsx` · F8 · for expired/fell-through listings: price suggestion, `rpc('relist_listing')` (bumps to top once/7 days).

### S-F09 Notifications (activity list) — `notifications/index.tsx` · F9, X36 No notifications
- Grouped by day; row shows item thumb; tap deep-links. Empty X36 with "Notification settings".
- R: `notifications` (last 60 days, paginated). W: `rpc('mark_notifications_read')`.

### S-F10 Settings — `settings/index.tsx` · F10
- Rows: School email, Student status (verified until), Name shown as, Notifications → S-F11, Blocked accounts, Safety center, Privacy → S-F12, Download your data, About OnlySwap, Log out, Delete account.
- Log out → `auth.signOut()` (unregister push token `rpc('disable_push_token')`).

### S-F11 Notification settings — `settings/notifications.tsx` · F11
- Toggles per `notification_prefs` column; "Selling tips and campus news" default off with consent line; message previews default off; quiet hours row (11 PM–8 AM editable); OS permission off → banner "Notifications are off in iOS Settings".
- W: `rpc('update_notification_prefs')`.

### S-F12 Privacy settings — `settings/privacy.tsx` · F12 · Share usage analytics toggle (PostHog `optOut()`/`optIn()` + `profiles.analytics_opt_in`), Crash reports toggle (Sentry `enabled` flag persisted), links.
### S-F13 Blocked accounts — `settings/blocked.tsx` · F13 · list + Unblock. `rpc('unblock_user')`.
### S-F14 Appearance — `settings/appearance.tsx` · F14 · theme (System/Light/Dark via Night skin) + app icon picker (`expo-alternate-app-icons` config plugin; iOS + Android activity-alias). W: MMKV + `profiles.theme`.
### S-F15 Change school — `settings/school.tsx` · F15 · explains transfer; enter new school email → OTP to new address → `rpc('change_campus')` (listings closed, chats read-only).
### S-F16 Delete account — `settings/delete.tsx` · F16 · consequences list, type DELETE, `fn delete-account` → sign out → Welcome + toast.
### S-F17 Download your data — `settings/data.tsx` · F17 · `fn export-data` → "We'll email a link" state; rate 1/day.
### S-F18 About — `settings/about.tsx` · F18 · version (`expo-application`), legal links, licenses (generated `licenses.json` via `license-checker` at build), contact support (mailto), Rate OnlySwap (`expo-store-review`, only if available).
### S-F19 Safety center — `safety/index.tsx` · F19 · safe spots map + list, scam tips, 911 shortcut (confirm dialog), "Report a problem". R: `safe_spots`.

---

## X · States and system screens (`app/(app)/(states)/` or components)

| ID | Frame | Route/Component | Trigger | Content & actions |
|---|---|---|---|---|
| S-X01 | X1 Log in | `(auth)/email?mode=login` | returning user | same as S-A03 with "Welcome back" |
| S-X02 | X2 Code errors | S-A04 state | wrong/expired code | shake + counts |
| S-X03 | X3 Loading | [C] Skeleton set | any fetch | per-layout skeletons |
| S-X04 | X4 Offline | [C] OfflineBanner | NetInfo offline | cached content, disabled writes |
| S-X05 | X5 No results | S-B16 state | 0 results | save search, post wanted |
| S-X06 | X6 Empty inbox | S-E01 state | no offers/chats | "Swipe right on something" |
| S-X07 | X7 Session expired | root modal | refresh token invalid | "Sign in again" → S-A03 prefilled |
| S-X09 | X9 Re-verify | gate `(states)/reverify.tsx` | `status='reverify'` | send code to school email → `rpc('complete_reverify')` |
| S-X10 | X10 Suspended | gate `(states)/paused.tsx` | paused/suspended/banned | reason, until, what still works, Appeal → S-X10a, rules |
| S-X10a | X10a Appeal | `appeal/[subject].tsx` | from X10/removed content | radio reason + textarea 500 → `rpc('create_appeal')`; one per decision |
| S-X11 | X11 Update required | gate | version < min | open store (`Linking` to App Store / Play URL) |
| S-X12 | X12 Maintenance | gate | `app_config.maintenance` | message + status link |
| S-X13 | X13 Item gone | S-B05 state | sold/removed/blocked | similar items |
| S-X14 | X14 Under review | listing/post state | held content | "A person is checking this" |
| S-X16 | X16 Uploading and drafts | Sell state | upload in progress / app killed | resume draft |
| S-X17 | X17 Chat details | see E | | |
| S-X18 | X18 Blocked chat | Chat state | block exists | unblock |
| S-X19 | X19 Camera access | PermissionPrimer | first camera use | Continue → OS prompt |
| S-X19b | X19b Location access | PermissionPrimer | first spot picking | Continue / Not now |
| S-X20 | X20 Location off | S-E11 state | denied | list fallback |
| S-X21 | X21 Access denied | PermissionPrimer denied variant | denied camera/photos | Open Settings (`Linking.openSettings()`) |
| S-X24 | X24 Undo swipe | S-B01 toast | left swipe | 5 s undo |
| S-X25 | X25 Share listing | native share | Share | OG preview |
| S-X26 | X26 Rate the app | `expo-store-review` | after 3rd completed swap + 14 days since install, max 1/120 days | system prompt only (Apple 5.6.1) |
| S-X27 | X27 Banned items | `legal/banned.tsx` | links | expanded list |
| S-X28 | X28 Help | `help/index.tsx` | Profile/Settings | search static FAQ (bundled JSON), contact, safety button |
| S-X29 | X29 Terms | `legal/terms.tsx` | links | static markdown bundled + web |
| S-X29b | X29b Privacy | `legal/privacy.tsx` | links | static markdown |
| S-X30 | X30 Link from another campus | deep-link handler | listing.campus ≠ mine | similar at my campus |
| S-X31 | X31 Link while signed out | deep-link handler | no session | blurred + sign in |
| S-X32 | X32 Large text | all screens | font scale | layout stacks |
| S-X33 | X33 VoiceOver | S-B01 | screen reader | list mode + actions |
| S-X35 | X35 Lock screen | push content | — | copy per catalog |
| S-X36..38 | Empty notifications/listings/saved | see F9/F3/B18 | | |
| S-X39 | X39 Home screen widgets | post-launch `expo-widgets` | — | NOT in v1 binary |
| S-X40 | X40 Lock screen widgets | post-launch | — | NOT in v1 binary |
| S-X34 | X34 Live Activity | post-launch | — | NOT in v1 binary |

## N · Devices
- N1–N4 Android variants: same routes; platform differences in `Platform.select`: Material bottom bar pill indicator, arrow back icon, `android_ripple`, notification channels, predictive back gesture (Expo Router supports), edge-to-edge (SDK 57 default).
- N5/N6 iPad: **not in v1** (`ios.supportsTablet=false`).
- N7 Spanish: strings extracted to `src/strings/en.ts` from day one; `es.ts` post-launch.

---

## W · Student web (`apps/mobile` Expo Router web export → Cloudflare Pages project `onlyswap-web`)

Static export (`web.output: "static"`). Public pages are prerendered; signed-in pages are client-rendered with the same hooks as mobile. Dynamic OG pages are Pages Functions in `workers/web-edge/functions/`.

| ID | Frame | Path | Components | States | Actions | Data |
|---|---|---|---|---|---|---|
| W-LAND | W1 Landing page | `/` | Hero (phone mock, floating cards), HowItWorks 3 steps, Safety band, Quad band, Campus list with progress, FAQ, footer "Not affiliated…" | static; campus progress fetched client-side (fallback "Coming to more schools") | Get the app (store badges by UA), "Check your school" email field → S-W-CHECK | `campus_progress` (anon RPC `public_campus_progress`) |
| W-LAND-M | W2 Landing · phone | `/` (responsive) | same, stacked | | | |
| W-LOGIN | W3 Web login | `/login` | email + OTP + age step + rules (same flow as mobile) | all A states | | auth |
| W-BROWSE | W4 Web · browse | `/browse` | grid + filters sidebar + search | loading/empty/error | tile → W-LISTING | `get_feed`/`search_listings` |
| W-LISTING | W5 Web · listing | `/listing/[id]` | gallery, details, Make offer panel | owner/hold/gone | offer (same RPCs) | as S-B05 |
| W-INBOX | W6 Web · inbox | `/inbox`, `/inbox/[chatId]` | two-pane chat | realtime while open | send, meetup | as S-E01/E09 |
| W-SELL | W7 Web · sell | `/sell` | single-page form, drag-drop photos (browser resize via canvas → WebP) | D3 errors | post | as D |
| W-SHARED | W8 Shared listing · phone, X31 | `/l/[id]` (Pages Function) | OG meta + blurred photo + "Open in app"/"Sign in to see it" | invalid/sold → "No longer available" | smart app banner (`apple-itunes-app` meta) / Play intent link | `get_listing_public_card(id)` (title, price, campus name, share_image_path only) |
| W-JOINED | W9 Waitlist joined | `/joined` | check, position, progress, invite link copy | | copy/share | `my_waitlist_position` |
| W-404 | W10 Not found | `/*` fallback `404.html` | "Looks like this one already sold." | | Browse / Home | — |
| W-OGIMG | W11 Share image | R2 `share/{id}.jpg` | generated on device (D6) | | | |
| W-PREVIEW | W12 Link preview | (rendered by iMessage/GroupMe from W-SHARED meta) | | | | |
| W-PRIV | W13 Privacy policy · web | `/privacy` | legal template (sidebar nav) | | | static md |
| W-TERMS | (G9) | `/terms` | legal template | | | static md |
| W-RULES | (G9) | `/rules` | legal template | | | static md |
| W-BANNED | (G9) | `/banned-items` | legal template | | | static md |
| W-SAFETY | (G9) | `/safety` | legal template + safe spot list per campus | | | `public_safe_spots(campus_slug)` |
| W-COOKIES | (G9) | `/cookies` | legal template ("no tracking cookies") | | | static |
| W-HELP | W14 Support · web | `/help` | FAQ accordion, safety CTA, contact form (Turnstile) | sending/sent/error | submit → `fn support-request` (emails you) | `support_requests` |
| W-DELETE | W15 Delete account · web | `/delete` | OTP sign-in → consequences → type DELETE | not signed in / deleting / done | `fn delete-account` | auth |
| W-CHILD | W16 Child safety standards · web | `/child-safety` | legal template | | | static |
| W-MEET | (G8, new) | `/m/[token]` (Pages Function) | "Wasif is meeting someone for an OnlySwap pickup": spot name, time, map link, status (here/late/done), "If something feels wrong call 911" | expired/invalid token → "This link has expired" | none (read-only), auto-refresh 60 s | `get_meetup_share(token)` (first name + initial of both, spot, time, statuses; no item price, no phone) |
| W-INVITE | (G8, new) | `/i/[code]` | inviter first name, campus progress, "Get the app" + school email check | unknown code → landing | | `get_invite(code)` |
| W-WELLKNOWN | — | `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` | static JSON | | | — |

Web a11y: semantic HTML via `react-native-web` roles; `lang="en"`; skip link; visible focus rings (2px ink); all pages pass axe-core in Playwright (T-E2E-WEB-A11Y).

---

## G · Admin panel (`apps/admin`, Vite + React SPA → Pages project `onlyswap-admin`)

Common: `AdminLayout` (sidebar per `desk()` nav), `RequireAdmin` (session + `admins` row + `aal2`), `DataTable` (TanStack Table, server pagination), `ConfirmDialog` with reason field for every destructive action, toast. Every mutation = RPC in `admin` schema, writes `audit_log`. Session idle timeout 8 h; re-MFA for reveal.

| ID | Frame | Route | Purpose / components | Actions → RPC | Data |
|---|---|---|---|---|---|
| G-LOGIN | G9 Admin · sign in | `/login` | email OTP → TOTP 6-digit (enroll on first login: QR via `auth.mfa.enroll`) | `auth.mfa.challengeAndVerify` | auth |
| G-OVER | G1 Admin · overview | `/` | KPI cards, 7-day chart, open reports, liquidity warnings | — | `admin.overview(campus_id)` |
| G-REPORTS | G2 Admin · reports | `/reports` | queue (filters: type, reason, age), detail pane with evidence, history of target | remove content, warn, strike, suspend ≤7d (mod) / ban (owner), dismiss → `admin.resolve_report(id, action, note)` | `reports`, targets |
| G-USER | G3 Admin · user | `/users/[id]` | profile, stats, reports against/by, strikes, listings, chats metadata, audit trail | suspend/unsuspend, ban (owner), clear strike, force re-verify | `admin.user_detail` |
| G-USERS | G10 Admin · users | `/users` | table + search + filters (flagged/suspended/new) | open user | `admin.list_users` |
| G-LIST | G4 Admin · listings | `/listings` | table, flagged first, photo preview | remove/restore listing → `admin.set_listing_status` | `listings` |
| G-QUAD | G5 Admin · Quad | `/quad` | held queue (Q10), auto-hidden, reported; reveal author (owner, case ref) | approve/remove post, `admin.reveal_quad_author` | `quad_posts` |
| G-CHATS | G11 Admin · chats | `/chats` | metadata only; "Open messages for report #" (requires open report on that chat) | `admin.read_reported_chat(report_id)` (logged) | `chats`, `messages` gated |
| G-CAMPUS | G6 Admin · campus setup | `/campuses/[slug]` | domains (student/blocked), safe spots (map, add/edit), threshold, founding cap, safety dials, pause campus | `admin.upsert_domain`, `admin.upsert_safe_spot`, `admin.update_campus` | `campuses`, `campus_domains`, `safe_spots` |
| G-APPEALS | G7 Admin · appeals | `/reports/appeals` | original + rule + their appeal side by side, reply chips | restore + clear strike / keep → `admin.decide_appeal` | `appeals` |
| G-AUDIT | G8 Admin · audit log | `/settings/audit` | filterable, reveal rows highlighted, CSV export (client-side) | — | `audit_log` (select only) |
| G-METRICS | G12 Admin · metrics | `/metrics` | funnel, cohort retention, liquidity warnings | — | `admin.metrics_funnel`, `admin.metrics_retention`, `admin.metrics_liquidity` |
| G-TEAM | G13 Admin · team | `/settings/team` | admins table, role matrix, invite | invite (sends OTP login link to email; row created pending) → `admin.invite_admin`, remove | `admins` |
| G-ANNOUNCE | G14 Admin · announcement | `/campuses/[slug]/announce` | type Safety/Campus news/Update, title, body, push toggle, preview; limit 1/week | `admin.create_announcement` → queue | `announcements` |
| G-WORDS | G15 Admin · banned words | `/settings/words` | table with fired/overturned; add/edit | `admin.upsert_banned_word` | `banned_words` |
| G-FLAGS | (new, G-gap) | `/settings/app` | `app_config` editor: maintenance, min versions, quad/chat-photo flags per platform | `admin.set_config` (owner) | `app_config` |

Admin a11y: keyboard navigable tables, focus trap in dialogs, WCAG AA contrast.

---

## T · Store assets (produced, not screens)
T1 App Store screenshots (6.9" 1320×2868 ×5, fictional "Northfield University"), T2 App Store page copy, T3 verification email template, T4 icon sheet (1024 + Android adaptive fg/bg + monochrome + notification icon), T5 Play feature graphic 1024×500, T6–T9 emails (campus open, paused, re-verify, deleted), T10 Play screenshots (Android frames, 1080×1920+ ×5), T11 app preview video (optional, 886×1920, 15–30 s). Source files live in `design/store/`; exported with Playwright script `scripts/export-store-assets.ts` from the design board.
