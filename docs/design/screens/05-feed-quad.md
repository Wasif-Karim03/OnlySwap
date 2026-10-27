# 05 Feed and Quad

[Index: SCREENS.md](../SCREENS.md) | [Design review: DESIGN_REVIEW.md](../DESIGN_REVIEW.md)

Covers the Feed tab (`apps/mobile/app/(tabs)/feed/_layout.tsx`, `apps/mobile/app/(tabs)/feed/index.tsx`), the hidden Quad tab redirect (`apps/mobile/app/(tabs)/quad/_layout.tsx`, `apps/mobile/app/(tabs)/quad/index.tsx`, DEC 130) and the stack routes `apps/mobile/app/quad/[id].tsx`, `activity.tsx`, `mine.tsx`, `muted.tsx`, `new.tsx`. Feature files: `apps/mobile/src/features/campus/{CampusFeedScreen,FeedPost,CampusCards}.tsx` and `apps/mobile/src/features/quad/{QuadFeedScreen,QuadThreadScreen,QuadNewPostScreen,QuadMoreScreens,useQuadActions}.tsx` plus `quad/components/{OutcomeSheet,QuadPostCard,QuadWelcome,ReplyRow,VoteControl}.tsx`. The Quad feed and Welcome are not routes of their own: they render inside the Feed screen when the "Quad" chip is selected (CampusFeedScreen.tsx:286-287).

Root-level notes used by several entries:
- Haptics: no file in this slice calls `haptic()`. The only reference is a comment, `apps/mobile/src/features/quad/components/VoteControl.tsx:31` ("No haptics (DESIGN_SYSTEM §5 budget)"). `Button` has an opt-in `hapticOnPress` limited to `success` (`apps/mobile/src/components/Button.tsx:26,81`); no Button in this slice passes it, so Quad "Post" and Feed taps give no haptic today.
- Lilac (purple) in this slice: exactly one place, the pinned note background `theme.colors.lilacBg` at `apps/mobile/src/features/quad/QuadFeedScreen.tsx:343` (mentioned in the doc comment at :109). Token documented at DESIGN_SYSTEM.md:42 ("the Quad (DEC 90)"). All other Quad color is the normal accent (up-vote fill VoteControl.tsx:108, OP badge ReplyRow.tsx:110, poll bar QuadPostCard.tsx:300, accent glyph tiles QuadWelcome.tsx:51 and QuadFeedScreen.tsx:195, unread dot QuadMoreScreens.tsx:497).
- Copy: `quad` block `apps/mobile/src/strings/en.ts:1791-1977`, `campus` block `en.ts:1980-2282+`, `comments` block `en.ts:2285+`, `tabs` `en.ts:15-22`, `feed` `en.ts:881+`.

<a id="05-feed-layout"></a>
### Feed layout  (tab stack)
- Source: apps/mobile/app/(tabs)/feed/_layout.tsx:4-6
- Configures a plain `Stack` with `headerShown: false` because the Feed draws its own large-title header (DEC 98, comment at :3). No guards.

<a id="05-feed"></a>
### Feed (C01)
- Source: apps/mobile/app/(tabs)/feed/index.tsx:3-5 -> apps/mobile/src/features/campus/CampusFeedScreen.tsx:81-404 (rows: FeedPost.tsx:44-264, CampusCards.tsx:91-202)
- Route & entry: `/feed`, tab root. Optional param `kind` (one of `all|news|food|free|wanted|new|quad`, CampusFeedScreen.tsx:96-109) and, for the Quad chip, `sort` (read inside QuadScreen, QuadFeedScreen.tsx:122). Entered from the tab bar, from the old `/quad` redirect (`apps/mobile/app/(tabs)/quad/index.tsx:9`), from Quad new-post (`QuadNewPostScreen.tsx:50-51`), and from push routing for food (`apps/mobile/src/lib/push.ts:63`).
- Purpose: One scrolling campus feed of news, free food, free stuff, Wanted posts (the requests board) and the last week of listings, with a Quad chip for the anonymous board.
- Roles: any verified student (no signed-out branch). Own posts show "Your post" instead of Save / Make offer (FeedPost.tsx:246-251, :220; CampusCards.tsx:193-197). Make offer shows only for non-own active sale/free listings (FeedPost.tsx:220). "I have this" shows only when `canAnswer(item)` (CampusCards.tsx:183). The Quad chip shows only when `get_quad_status` says enabled (CampusFeedScreen.tsx:110,244).
- Elements:
  - Header row: `Text variant="title"` "Feed" (`campus.title`, en.ts:1981; CampusFeedScreen.tsx:201-203), `IconButton` search (label `feed.search`, -> `/search`, :204-211), `NotificationBell` (label `feed.notifications`, :212-217). No school line.
  - Filter chips in a horizontal `ScrollView` (`campus.filtersLabel` "Show"): All, News, Free food (icon food), Free stuff (icon gift), Wanted, New (:223-243, `CAMPUS_FILTERS` logic.ts:24; labels en.ts:1984-1991), then a "Quad" chip with icon quad (`tabs.quad`, :244-253). All chips `surface="card"`.
  - Composer row: `Avatar` M of the student (:317), tappable placeholder "What's happening on campus?" (`campus.composer`, en.ts:1997; -> `/sell/news`, :318-328), `IconButton` plus (label `campus.newPost`, opens ActionSheet, :329-334).
  - ActionSheet with Post news, Post free food, Ask for something (:393-401; en.ts:1993-1995).
  - Day one panel (only when `first.day_one` and filter All): heading "It's early days here", body from `dayOneBody(n)`, `Button` "List something" size M (:336-346; en.ts:2063-2067).
  - Separator: 1 px hairline `Gap` between rows (:406-408, :450).
  - `FeedPost` (news, sale, free): head with `Avatar`, name, meta "ago · place", "News" tag for news (FeedPost.tsx:89-104); news headline `heading`, optional event line with cal icon in sky (:106-116), description 4 lines (:117-121); photo grid: one large (4:3, or 1:1 if alone) plus up to 3 thumbs with "+n" (:125-149); listing text: price, title 2 lines, description 2 lines (:151-163); link row with host and arrow on `bg2` (:167-181); counts line "n likes / n comments" (:183-201); action row Like, Comment, Make offer / Ask for it, Open link, Share (:203-242); Save bookmark `IconButton` absolutely placed top right (:245-261).
  - `CampusCard` food: warm `peachBg` tile with "Free food" tag + live countdown, title, place, "Time ran out on this one." when gone, 16:9 photo, `SocialBar` (CampusCards.tsx:102-155).
  - `CampusCard` wanted: "{name} is looking for", title, budget and need-by, "I have this" secondary S `Button` or "Your post", `SocialBar` (CampusCards.tsx:157-202).
  - `ListingCard` (CampusCards.tsx:204-235) is only reachable through `CampusCard` for kinds other than food/wanted; the Feed never sends those there (CampusFeedScreen.tsx:258-284), so it is unused from this screen.
- States:
  - Loading: `SkeletonList rows={4}` in a View labelled `campus.loading` (:290-295); load more: `ActivityIndicator` in footer labelled `campus.loadingMore` (:374-380).
  - Empty (per filter): `EmptyState` with `campus.empty[kind]` title/body and one action (food -> Post free food, wanted -> Ask for something, news -> Post news, others -> List something) (:349-373; copy en.ts:2036-2062).
  - Error: `ErrorState` with retry when the first load fails (:296-297); a failed save shows toast `campus.saveFailed` (:158); failed like shows toast `comments.likeFailed` and refetches (:168-171).
  - Populated: flat rows, hairlines, pull to refresh (:307-308), infinite scroll (:309-312).
  - Long title: listing title `numberOfLines={2}`, description 2, news description 4 (FeedPost.tsx:154,158,118); food title and wanted title have no line limit (CampusCards.tsx:130,176).
  - No photo: FeedPost skips the photo block (FeedPost.tsx:125); food skips photo (CampusCards.tsx:140); wanted never has one.
  - Sold / hold / removed: FeedPost hides Make offer unless `status === 'active'` (FeedPost.tsx:220); no sold/hold label on the row (not handled, no branch found). Food past its time dims to 60% and is disabled (CampusCards.tsx:105,115,246).
  - Suspended or banned user: not handled (no branch found). Blocked user: not handled in this file (no branch found; filtering, if any, is server side and not visible here).
  - Offline: not handled beyond ErrorState on first load (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
  - Reduce motion: not handled in this slice (no branch found).
  - Dynamic Type overflow: action labels `numberOfLines={1}` in a row that shares width (FeedPost.tsx:303, :317); at large sizes "Make offer" can truncate. Chip row scrolls horizontally.
  - Quad chip while status is loading: `showQuad = inQuad && quadOn`, so a cold `/feed?kind=quad` first shows All, then switches to the Quad when status arrives (:110-111).
- Copy: strings/en.ts `campus` 1980-2100 (title, filters, composer, newsTag, foodTag, wanted lines, empty, dayOne), `feed` 881+ (search, notifications, free, shareMessage, metaSeparator), `comments` 2285-2332 (like, comment, likeCount, likeFailed), `tabs.quad` 22.
- Notes: Check against DEC 141 (DECISIONS_LOG.md:9): header is "Feed" + Search + bell, no school line (matches, :198-218); one composer row with + opening the three post kinds (matches, :316-335, :393-401); two pill buttons gone (matches, none in file); founding-seller panel gone from the Feed (matches: `foundingTitle` is used only in `apps/mobile/src/features/waitlist/UnlockedScreen.tsx:85`); page one plain background (`styles.root` bg, :412) with hairline-split flat rows (:406-408, :450; `card` is only `overflow: hidden`, FeedPost.tsx:314) (matches); food keeps warm tile (CampusCards.tsx:241-247) (matches); filter chips stay (matches). Gaps vs DEC 141: (1) the Day one hero is still a boxed `bg2` rounded panel inside the list header (:336-346, style :443-449); DEC 141 names only the founding panel, but this is a box on a flat page. (2) The link row in FeedPost is a filled `bg2` box (FeedPost.tsx:356-366). (3) The Quad chip swaps to a screen with a grey `bg2` page and white boxed cards (QuadFeedScreen.tsx:309, QuadPostCard.tsx:265-273), the opposite of the flat page. (4) Header icon buttons are `filled surface="card"` (:204-217). (5) The composer has two tap targets that open different things: the text row goes straight to Post news (:321) and + opens the menu (:332). Stale doc comments: file header still says "Day one hero and the founding sellers card" (:75-80); CampusCards.tsx:87-90 mentions "two-column grid". Event line uses `tone="sky"` text on the page background (FeedPost.tsx:111-114; DESIGN_SYSTEM.md:52 covers sky text only on `skyBg`). Text-node density: `<Text` count 4 in CampusFeedScreen.tsx, 15 in FeedPost.tsx, 13 in CampusCards.tsx. DEC 121 (likes, comments, real names) is implemented: names via `sellerName` (FeedPost.tsx:61), Like/Comment actions (:204-219). Haptics: none.

<a id="05-quad-layout"></a>
### Quad layout  (hidden tab stack)
- Source: apps/mobile/app/(tabs)/quad/_layout.tsx:4-6
- Plain `Stack` with `headerShown: false` (comment "draws its own large-title header (Q02)", :3). The tab itself is hidden: `Tabs.Screen name="quad" options={{ href: null }}` at `apps/mobile/app/(tabs)/_layout.tsx:71`.

<a id="05-quad-redirect"></a>
### Quad tab index (redirect)  (Q02 entry)
- Source: apps/mobile/app/(tabs)/quad/index.tsx:5-12
- Redirects `/quad` and `/quad?sort=...` to `/feed` with params `{ kind: 'quad' }` plus `sort` when present (DEC 130). Used by `leave()` fallbacks in `QuadThreadScreen.tsx:46`, `QuadMoreScreens.tsx:36`.

<a id="05-quad-feed"></a>
### Quad feed inside the Feed (Q02)
- Source: apps/mobile/app/(tabs)/feed/index.tsx:3-5 (chip `kind=quad`) -> apps/mobile/src/features/quad/QuadFeedScreen.tsx:70-105 (gate), :113-301 (feed), with cards in apps/mobile/src/features/quad/components/QuadPostCard.tsx:122-255 and votes in VoteControl.tsx:33-97
- Route & entry: no route of its own; `/feed?kind=quad[&sort=hot|new|top]`, rendered by `CampusFeedScreen` as `<QuadScreen top={header}>` (CampusFeedScreen.tsx:286-287). Posting returns here on New (`QuadNewPostScreen.tsx:51,163-164`).
- Purpose: The campus anonymous board: ranked posts with votes, polls and check-ins.
- Roles: any verified student on a campus where the Quad is enabled; must accept rules first (QuadFeedScreen.tsx:85-97). Posts show no author: the line above is "Anonymous · {campus}" (`quad.anonAt`, en.ts:1794; QuadFeedScreen.tsx:229-234, the string requested at :108-109 comment; the text node is :231-233). Fallback when the campus name is missing: `quad.subtitle` "Anonymous to students" (:232). Author reveal is owner-only admin with fresh MFA; there is no student reveal and nothing in this screen offers one. Own posts: votes read-only with "Your post, n points" (QuadPostCard.tsx:199-203), options menu shows Turn off replies / Delete instead of Hide / Report (useQuadActions.tsx:114-149).
- Elements:
  - The Feed header and chips are passed in as `top` (CampusFeedScreen.tsx:198-256); the Quad chip is selected.
  - Anonymous line: `Icon lock` 12 px + `Text meta` "Anonymous · {campus}" (QuadFeedScreen.tsx:229-234); three `IconButton`s: bell -> `/quad/activity` (label `quad.openActivity`), eye -> `/quad/muted` (`quad.openMuted`), user -> `/quad/mine` (`quad.openMine`) (:241-264). The Feed header above already has its own search and bell, so two bells are visible.
  - Sort chips Hot / New / Top as `tablist` (`quad.sorts`, en.ts:1795; :266-278).
  - Pinned note (if present): lilac box with bold title + body (`theme.colors.lilacBg`, :170-182, style :338-344). This is the only lilac use in the slice.
  - Post cards (`variant="card"`): votes column on the left, text (`bodyStrong`), optional 4:3 photo, poll, quiet line "Poll · 12 replies · 2h", more button (QuadPostCard.tsx:151-254, :112-115).
  - Post pill: ink-filled pill with plus icon + "Post" (`quad.post`), floating bottom right (`styles.fab`, QuadFeedScreen.tsx:280-296, :345-354).
  - Post options `ActionSheet`, `ReportSheet`, delete `ConfirmDialog` from `useQuadActions` (useQuadActions.tsx:171-208): see entry 05-quad-sheets.
- States:
  - Gate: status pending -> `SkeletonList rows={4}` (:81); status error -> `ErrorState` retry (:82-83); not enabled -> `QuadOff` EmptyState "The Quad isn't on at your school yet", action "Go to Discover" (`router.replace('/discover')`, :52-64, :84); rules not accepted -> `QuadWelcome` (:85-96).
  - Loading: `SkeletonList rows={5}` (:150). Error: `ErrorState` retry (:152); `FEATURE_OFF` turns into QuadOff and refreshes status (:140-143,151).
  - Empty: Hot / New -> EmptyState with accent tile, "Nobody has posted yet", body, three prompt suggestions, action "Write the first post" (:193-201; en.ts:1819-1824); Top -> "No top posts this week" without action (:186-191).
  - Populated: grey page with white cards, gap between cards (:303-306, :337).
  - Held post (own, awaiting review): amber `Tag` "Under review", votes read-only (QuadPostCard.tsx:154-158,199). Hidden-by-votes or removed posts do not appear here (only in Your Quad).
  - Long text: 8 lines in the feed (QuadPostCard.tsx:180); no photo: block skipped (:183).
  - Muted word / hidden person: filtered server side; no inline placeholder (no branch found).
  - Pull to refresh and infinite scroll: yes (:163-168).
  - Offline, reduce motion, suspended/banned: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Dynamic Type: three header icon buttons plus a wrapping chip row (`flexWrap`, :325); text nodes are not size-capped except where listed.
  - Cold link `/feed?kind=quad` flashes the All feed until status loads (CampusFeedScreen.tsx:110-111).
- Copy: strings/en.ts `quad` 1791-1977 (anonAt 1794, sorts 1795, empty 1819-1830, pinned 1830, card 1831-1851).
- Notes: DEC 141/130 conflicts: the Quad page background is grey `bg2` (QuadFeedScreen.tsx:309) with boxed white cards (QuadPostCard.tsx:265-273) and a lilac boxed pinned note; the Feed it sits inside is flat white with hairlines. The Feed header sits on `bg` while the Quad root is `bg2`, so the header band changes color on chip switch. The Post pill is a floating bottom-right pill, not a docked full-width bar (P7); it avoids covering votes via bottom padding (:331-336). The screen title string `quad.title` "The Quad" (en.ts:1792) differs from the chip label `tabs.quad` "Quad" (en.ts:22); the title only renders when `top === undefined` (:235-239), which no longer happens from the Feed. Haptics: none (VoteControl.tsx:31). Text-node density: `<Text` 5 in QuadFeedScreen.tsx, 9 in QuadPostCard.tsx, 2 in VoteControl.tsx.

<a id="05-quad-welcome"></a>
### Quad welcome (Q01)
- Source: gate at apps/mobile/src/features/quad/QuadFeedScreen.tsx:85-97 -> apps/mobile/src/features/quad/components/QuadWelcome.tsx:25-90
- Route & entry: shown inside the Feed on the Quad chip until `rules_accepted` (embedded, header above it, QuadWelcome.tsx:50,100). Also gates replies and posting: `RULES_REQUIRED` sends the person to `/quad` (QuadThreadScreen.tsx:70-73, QuadNewPostScreen.tsx:170-173).
- Purpose: Disclose that the Quad is anonymous to students but not to OnlySwap, and get agreement to four rules.
- Roles: any verified student, first visit only.
- Elements: accent `GlyphTile` quad (:51); `Text title` "Say it without your name on it" (`quad.welcomeTitle`, en.ts:1802); intro line (`welcomeIntro`); four rule rows each with icon tile, bold title, body: "Anonymous to students, not to us", "Don't call out students", "No threats, hate or harassment", "Downvotes count" (:14-19,58-70; en.ts:1804-1813); `Checkbox` "I agree to the Quad rules" (:71-76); error `Banner` (:77); docked `Button` "Enter the Quad" disabled until agreed, `loading` while saving (:79-87).
- States: loading = button `loading` (:83); empty n/a; error = `Banner kind="error"` with `errorText` (:43,77); populated = the form; long text scrolls (`ScrollView`, :50); offline / reduce motion / Dynamic Type: not handled specifically (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`), content is scrollable so it survives large type; button stays docked below the scroll (:79).
- Copy: strings/en.ts `quad` 1801-1815.
- Notes: Good: single docked primary (P7) and the anonymity disclosure comes first. The copy says identity is shared "only if the law requires it or someone is in danger" (en.ts:1805); it does not mention the owner-only admin reveal, so confirm wording with SECURITY docs before any rewrite. About 12 text nodes on screen (`<Text` count 4 in file, two repeated in a `map`). Haptics: none.

<a id="05-quad-thread"></a>
### Quad post thread (Q05)
- Source: apps/mobile/app/quad/[id].tsx:5-8 -> apps/mobile/src/features/quad/QuadThreadScreen.tsx:32-185 (rows: components/ReplyRow.tsx:53-89, post: QuadPostCard.tsx `full`)
- Route & entry: `/quad/[id]` pushed (default stack push; no presentation override found in `apps/mobile/app/_layout.tsx`). Linked from the feed card (QuadFeedScreen.tsx:209), Your Quad rows (QuadMoreScreens.tsx:86,128) and push notifications (`apps/mobile/src/lib/push.ts:46`).
- Purpose: Read a post in full, read replies under per-thread aliases (OP, Anon A, Anon B ...), reply anonymously.
- Roles: any verified student; own post / reply show "(You)" and read-only votes (ReplyRow.tsx:61,79; QuadPostCard.tsx:199). Reply composer only when the post is live and replies are on (QuadThreadScreen.tsx:104,147).
- Elements: `NavBar` "Post" with back (`quad.threadTitle`, :180); list header = full `QuadPostCard` (votes on the right, 4:5 photo, poll) (:115-125); `ReplyRow` per reply: letter `AliasBadge` (accent for OP, token colours otherwise, ReplyRow.tsx:20-42), label, ago, more `IconButton`, text, `VoteControl` (:57-87); empty text "No replies yet." (:126-130); `Banner` for held/blocked reply result (:142-146); reply composer: multiline `TextInput` "Add a reply" + filled send `IconButton` (:147-168); read-only `Banner` "The poster turned off replies." (:169-173); overlays from `useQuadActions` (:182).
- States: loading `SkeletonList rows={4}` (:85); not found / feature off -> EmptyState "This post isn't available" with "Back to the Quad" (:89-97); other error -> `ErrorState` (:99); empty replies -> plain text (:126-130); populated (:105-141); held reply -> amber "Under review" tag on that reply, visible to author only (ReplyRow.tsx:72); reply blocked -> error `Banner` with exact reason (:60-63, OutcomeSheet.tsx:17-24); reply held -> info `Banner` (:65); send failure -> error toast (:78); sending disables the send button (:163); removed / hidden post by author: no composer and no note (the `else if post.status === 'live'` branch is the only one, :169-173; no branch found for other statuses). Keyboard: `KeyboardAvoidingView` (:106). Offline / reduce motion: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Dynamic Type: input `maxHeight` = 3 x hit height (:211), body text wraps.
- Copy: strings/en.ts `quad` 1866-1885 (thread), 1831-1851 (card), 1925-1941 (blocked/held).
- Notes: `quad.replyHeld` (en.ts:1884) has no use in `features/quad` (replies use `held.*` via `heldText`). Composer sits at the bottom in the thumb zone (good). Back fallback `router.replace('/quad')` goes through the redirect to the Feed Quad chip (:46). Haptics: none. Text-node density: `<Text` 2 in QuadThreadScreen.tsx, 4 in ReplyRow.tsx.

<a id="05-quad-new"></a>
### Quad new post (Q07)
- Source: apps/mobile/app/quad/new.tsx:4-6 -> apps/mobile/src/features/quad/QuadNewPostScreen.tsx:68-375
- Route & entry: `/quad/new`, pushed from the floating Post pill and the empty state action (QuadFeedScreen.tsx:147,199). Presentation: default stack push (no override found in `apps/mobile/app/_layout.tsx`); close icon is shown as leading (`leading="close"`, :194).
- Purpose: Write an anonymous text, photo, poll (2 to 4 options) or 3-hour check-in post.
- Roles: any verified student with rules accepted; `RULES_REQUIRED` or `FEATURE_OFF` sends back to the Quad (:170-173).
- Elements: `NavBar` "New post" with close and a trailing dark S `Button` "Post" (`quad.post`, disabled until valid, loading while posting, testID `quad-post-submit`, :192-207); `SegmentedControl` Text / Photo / Poll / Check-in (:210-215); check-in: `Input` "Where are you?" + vibe `ChipGroup` Quiet / Busy / Studying / Hanging out (:216-233); `TextArea` labelled "What's on your mind?" / "Your question" / "Anything to add? (optional)" (:183-188,234-241); photo mode: preview `Photo` 4:3, "Uploading photo", "Add a photo" / "Change photo" / "Remove photo" buttons, permission `Banner` + "Open Settings" (:242-296); poll mode: `Input` per option, remove `IconButton`, "Add option", hint "2 to 4 options, up to 40 characters each." (:297-334); check-in hint "Check-ins disappear after 3 hours." (:335-339); anonymity line with lock icon "Posting anonymously" (:340-345); error `Banner` (:346-350); `PhotoSourceSheet` (:353-358); `OutcomeSheet` (:359-372).
- States: loading = Post button `loading` (:202), photo upload text (:252-256); empty = Post disabled via `canPost` (:96,201); error = inline `Banner` plus error toast because the note sits under the keyboard (:175-177,346-350); photo failure -> `copy.photoFailed` banner and preview cleared (:122-125); permission off -> warning banner with Open Settings (:104-107,278-294); blocked / held -> `OutcomeSheet` (:167); success -> toast "Posted to the Quad", then `dismissTo`/`replace` to `/feed?kind=quad&sort=new` (:160-165); unsaved text on close: not handled (no branch found, `leave()` goes straight back, :95); offline: only the generic error path (:168-178); reduce motion: not handled; Dynamic Type: form scrolls (`ScrollView`, :209).
- Copy: strings/en.ts `quad` 1886-1912 (+ blocked/held 1913-1941).
- Notes: The only submit control is a small button in the top nav bar, not docked at the bottom (P7, thumb zone). The anonymity line is the last item of the form (:340-345), usually below the fold or under the keyboard, while the title is "New post" with no anonymity cue at the top. The screen uses its own `readableColumn` (:380). No haptic on success; the success toast is the only feedback (:162). Text-node density: `<Text` 5 in QuadNewPostScreen.tsx (plus labels inside Input/TextArea/Segmented).

<a id="05-quad-mine"></a>
### Your Quad (Q12)
- Source: apps/mobile/app/quad/mine.tsx:4-6 -> apps/mobile/src/features/quad/QuadMoreScreens.tsx:45-221
- Route & entry: `/quad/mine`, pushed from the user icon in the Quad header (QuadFeedScreen.tsx:262). Default stack push.
- Purpose: See your own Quad posts and replies with score and moderation status; appeal what was taken down.
- Roles: the signed-in author only ("Only you can see this.", `quad.onlyYou`, :172-174).
- Elements: `NavBar` "Your Quad" (:170); helper line; `SegmentedControl` Posts / Replies (:175-183); post row: status `Tag` (Live / Under review / Hidden by votes / Removed, `statusTone`, :90), "ago, n points", body 4 lines, secondary S `Button` "Appeal" when `canAppeal` (:80-121); reply row: tag, meta, body, "On: {excerpt}" (:123-144); appeal `Sheet` with reason chips, `TextArea`, error `Banner`, `Button` "Send appeal" (:186-218; strings from `safety` appeal keys).
- States: loading `SkeletonList rows={4}` (:147); error `ErrorState` (:148); empty `EmptyState` "You haven't posted yet" / "You haven't replied to anything yet" without action (:153-158); populated list (:159-163); post not live or held is not tappable (`disabled`, :85); appeal sent -> row text "Appeal sent. A person will review it." and success toast (:72,101-104). That "appealed" set is local state only (:57), so it resets when the screen is reopened (server state not read here). Pull to refresh: not handled (plain `ScrollView`, :152). Offline / reduce motion: not handled (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Dynamic Type: rows wrap.
- Copy: strings/en.ts `quad` 1943-1957; `safety` appeal keys.
- Notes: Status shown as a `Tag` chip with tone (P3 asks for plain words, color only when it matters). Haptics: none. Text-node density: `<Text` 16 in QuadMoreScreens.tsx (all three screens).

<a id="05-quad-activity"></a>
### Quad activity (Q13)
- Source: apps/mobile/app/quad/activity.tsx:4-6 -> apps/mobile/src/features/quad/QuadMoreScreens.tsx:227-312
- Route & entry: `/quad/activity`, pushed from the bell icon in the Quad header (QuadFeedScreen.tsx:246). Default stack push.
- Purpose: Replies and milestones on your posts (notifications in the `quad` group).
- Roles: signed-in author.
- Elements: `NavBar` "Quad activity" (:308); list of rows with an accent unread dot, title (bold when unread), "body ago" (:283-299, dot style :492-498); tap marks read and routes via `routeForNotification` (:246-260).
- States: loading `SkeletonList rows={5}` (:263); error `ErrorState` (:264); empty `EmptyState` bell "Nothing yet / Replies and milestones on your posts show up here." (:275-282); populated `FlatList` with paging (:268-274); items are filtered to `grp === 'quad'` after paging while the next-page rule uses the unfiltered length (:241-243,266), so a page of other groups can show an empty list with more pages unread; mark-read failure is swallowed (`.catch(() => {})`, :256); no pull to refresh, no mark all read (not handled, no branch found). Offline / reduce motion: not handled (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
- Copy: strings/en.ts `quad` 1958-1962.
- Notes: Uses accent for the unread dot as a fill (P2 compatible). Haptics: none.

<a id="05-quad-muted"></a>
### Muted and hidden (Q14)
- Source: apps/mobile/app/quad/muted.tsx:4-6 -> apps/mobile/src/features/quad/QuadMoreScreens.tsx:318-464
- Route & entry: `/quad/muted`, pushed from the eye icon in the Quad header (QuadFeedScreen.tsx:254). Default stack push.
- Purpose: Undo "hide posts from this person" and manage muted words.
- Roles: signed-in student.
- Elements: `NavBar` "Muted and hidden" (:422); section heading "People you hid" with rows `Someone you hid, from: "{excerpt}"` + secondary S `Button` "Unhide" (:380-394); section "Muted words" with helper "Posts and replies with these words are hidden for you.", `Input` "Mute a word" (max 30, submit on keyboard return), `Button` "Mute word", removable `Chip`s (:430-459).
- States: loading `SkeletonList` per section (:370,397); error `ErrorState layout="inline"` per section (:371-372,398-399); empty text "You haven't hidden anyone." / "No muted words." (:373-378,400-405); populated; invalid word -> field error "Use 2 to 30 characters." (:341-343); add or remove failure -> error toast / field error (:328,353); success has no toast or confirmation beyond the list updating (:332-334,348-351). Unhide is immediate with no confirm and no undo (:330-337). Offline / reduce motion: not handled (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
- Copy: strings/en.ts `quad` 1963-1977.
- Notes: "People you hid" is identified only by the source post excerpt, which is by design (anonymous). Haptics: none.

<a id="05-quad-sheets"></a>
### Quad sheets: Post options, Report, Delete, Outcome (Q7, Q9, Q10)
- Source: apps/mobile/src/features/quad/useQuadActions.tsx:171-208 (options `ActionSheet`, `ReportSheet`, delete `ConfirmDialog`); apps/mobile/src/features/quad/components/OutcomeSheet.tsx:41-82
- Route & entry: overlays, no route. Options open from the "more" button or long press on a card (QuadPostCard.tsx:214-222,243-249), or the more button on a reply (ReplyRow.tsx:65-70). Outcome sheet opens after a held or blocked post (QuadNewPostScreen.tsx:167,359-372).
- Purpose: Act on a post or reply (hide author, turn replies on or off, copy, report, delete) and explain why a post was blocked or held.
- Roles: owner of the post gets Turn off/on replies, Copy text, Delete post (useQuadActions.tsx:114-123,141-143); others get Hide posts from this person, Copy text, Report post (:124-148); on replies: Copy text and, if not yours, Report reply (:150-163).
- Elements: Options `ActionSheet` titled "Post options" / "Reply options" (:173-178); `ReportSheet` with target `quad_post` / `quad_reply` (:179-188); delete `ConfirmDialog` "Delete this post?" / "It comes off the Quad for everyone. This can't be undone." (:189-207). Outcome sheet: `GlyphTile` lock (blocked) or clock (held), heading "This can't go on the Quad" or "Sent for review", reason text, a bg2 hint box "Selling something? ..." when the block was for contact details, held note "You can find it in Your Quad while it waits.", buttons "Edit post" / "Make it a listing" or "Back to the Quad" (OutcomeSheet.tsx:45-79).
- States: toasts: hidden (info), replies on/off (info), copied (info), deleted (info), failure (error, `copy.actionFailed` or `errorText`) (useQuadActions.tsx:25-27,101-107,121,130,139,203); vote failure toast `voteFailed` and revert (:67-70); poll vote failure toast and revert (:95-98). Blocked: reason text maps phone / email / url / handle / room / term / other (OutcomeSheet.tsx:17-20). Offline / reduce motion: not handled (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
- Copy: strings/en.ts `quad` 1852-1865 (options), 1913-1941 (blocked, held).
- Notes: All options are one flat list; report and hide are separate verbs for two moderation paths. Haptics: none. Text-node density: `<Text` 0 in useQuadActions.tsx, 4 in OutcomeSheet.tsx.
