# 04 Offers, inbox, chat, deal and meetup

[Index: SCREENS.md](../SCREENS.md) | [Design review: DESIGN_REVIEW.md](../DESIGN_REVIEW.md)

Route files covered (all under `apps/mobile/app/`): `(tabs)/inbox/_layout.tsx`, `(tabs)/inbox/index.tsx`, `offer/[id].tsx`, `listing/[id]/offer.tsx`, `listing/[id]/offers.tsx`, `listing/[id]/sold.tsx`, `chat/[id]/index.tsx`, `chat/[id]/details.tsx`, `chat/[id]/deal.tsx`, `chat/[id]/meetup.tsx`, `deal/[chatId]/rate.tsx`, `meetup/[id].tsx`. Feature files: `apps/mobile/src/features/offers/{InboxScreen,OfferScreen,OfferSheetScreen,ListingOffersScreen,DealAvatar}.tsx` (+ `logic.ts`), `features/chat/{ChatScreen,ChatDetailsScreen}.tsx` (+ `logic.ts`, `useChat.ts`), `features/deals/DealScreens.tsx` (+ `logic.ts`), `features/meetups/{PlanMeetupScreen,MeetupDayScreen,MeetupCard,Handoff,SpotsMap}.tsx` (+ `logic.ts`), and how chat uses `apps/mobile/src/components/MessageBubble.tsx` (the component entry lives in slice 08). Owner words: "bids" = offers; the "sold?" popup = the "Did it sell?" screen (E07, reached from chat after a meetup) plus Mark sold from chat (DEC 97, `docs/DECISIONS_LOG.md:53`).

Terms used below: "Text-node density" = count of `<Text` in the feature file. Copy sections in `apps/mobile/src/strings/en.ts`: `offers:1087-1197`, `chat:1199-1259`, `meetup:1261-1346`, `deal:1348-1388`. Spanish (`es.ts`) carries the same keys (`es.ts:1159`, `:1199-1200`, `:1262`, `:1334` spot checks).

Haptic references in this slice (grep `haptic` over offers, chat, deals, meetups, MessageBubble and the route files): exactly two, both `success`: `apps/mobile/src/features/offers/OfferSheetScreen.tsx:165` fires after `api.make`/`api.makeBundle` resolves (offer sent); `apps/mobile/src/features/offers/OfferScreen.tsx:95` fires after `api.accept` resolves, before the redirect to the chat (offer accepted). No haptic on: chat send/retry/photo reveal, Did it sell answers, Mark sold, rating submit, handoff finish (toast only, `Handoff.tsx:80`), meetup check-in, counter, decline, withdraw. Both are inside the budget (`docs/DESIGN_SYSTEM.md:97-102`).

---

<a id="04-inbox-layout"></a>
### Inbox stack layout  (layout of E01)
- Source: `apps/mobile/app/(tabs)/inbox/_layout.tsx:1-6`
- Configures a plain `Stack` with `headerShown: false` (`_layout.tsx:5`); the Inbox draws its own large-title header (comment `_layout.tsx:3`). No guards, no tabs config here.

<a id="04-inbox"></a>
### Inbox  (E01)
- Source: `apps/mobile/app/(tabs)/inbox/index.tsx:3-5` -> `apps/mobile/src/features/offers/InboxScreen.tsx:58-299`
- Route & entry: `/inbox`, no params, tab root (Inbox tab). Linked from: tab bar; `router.replace('/inbox')` / `router.push('/inbox')` from `OfferSheetScreen.tsx:144` (Go to Inbox), `ChatDetailsScreen.tsx:114` (after Hide chat), the `leave()` fallbacks in OfferScreen/ChatScreen/MeetupDay/ListingOffers, and `features/safety/AccountScreens.tsx:131`. Push notifications deep-link to the offer or chat, not the list (`apps/mobile/src/lib/push.ts:71-73`). On a wide window (iPad) it becomes two panes (`InboxScreen.tsx:73,280-297`; list width `LAYOUT.inboxListWidth` `:337`).
- Purpose: one list of the offers and chats on the side I am on (Buying or Selling), what needs me first, the rest under Earlier (doc comment `InboxScreen.tsx:47-54`).
- Roles: any verified signed-in user. Side is chosen by role in each deal, not by account type: Buying = offers/chats where I am buyer, Selling = I am seller (`features/offers/logic.ts:196-225`). Opens on the side that needs me (Buying when both or neither do) and then keeps the pick (`InboxScreen.tsx:106-111`).
- Elements:
  - `NavBar variant="large"` titled `offers.inboxTitle` "Inbox" with `NotificationBell` trailing (`InboxScreen.tsx:241-247`).
  - `SegmentedControl` Buying / Selling with a count badge per side, label `offers.needsYouCount` "{n} need you" (`:249-267`).
  - Section header `Text variant="label" tone="ink3"` "Needs you" then "Earlier" (`:190-198,232-233`).
  - Row (`Tappable`, `:137-186`): item thumb `Photo rounded="thumb"` with the other person's `DealAvatar size="badge"` on its corner (`:152-159`), name (bodyStrong when it needs me, `:162-168`), short time (`shortAgo`, `:169-171`), item title meta (`:173-175`), status line (`:176-178`), unread dot in ink (`:180-184`, color `:347-352`).
  - Offer row status via `offerStatusShort` (`logic.ts:236-250`): "Offered $X", "Offer sent $X", "Countered $X", "You countered $X", "Accepted $X", plain words for declined/expired/withdrawn, and the auto-declined lines. Chat row status is the last message ("You: " prefix when mine, "Photo" for a photo with no body) else "Accepted $X" (`:120-130`).
  - Row accessibility label joins name, title, status, time and "Unread" (`:133-135`).
- States:
  - loading: `SkeletonList` (`:201`).
  - error: `ErrorState` with retry (`:202`).
  - empty Buying: `EmptyState icon="chat"` title "Nothing you are buying yet", body "Offers you make show up here. A chat starts when the seller accepts.", action "Start swiping" -> `router.replace('/discover')` (`:207-214`). Empty Selling: `icon="tag"`, "Nothing you are selling yet" / "Offers on your listings show up here, with the newest first.", action "Sell something" -> `router.navigate('/sell')` (`:215-223`).
  - populated: two sections inside a `ScrollView` with `RefreshControl` (`:225-235`). Live: `useUserChannel('inbox')` debounced 300 ms refetch (`:56,85-95`) plus refetch on focus (`:98-102`).
  - iPad right pane before a chat is picked: `EmptyState` "Pick a chat" (`:289-294`).
  - deleted user: name falls back to `offers.deletedUser` "Deleted user" (`:115`).
  - long title / long name: `numberOfLines={1}` on name, title, status (`:164,173,176`).
  - no photo: `Photo` with `source={null}` (placeholder handled in the Photo component, slice 08) (`:154`).
  - muted chat (`ChatSummary.muted`, `logic.ts:64`): not shown in the row (no branch found). Closed or blocked chat (`ChatSummary.status`, `logic.ts:57`): not surfaced in the row (no branch found). Suspended/banned other user: not handled (no branch found). Offline: no screen-specific branch (the app-wide `OfflineBanner` at `apps/mobile/app/_layout.tsx:110` is the only signal; a failed query falls to `ErrorState`). Reduce motion: no animation in this file. Dynamic Type: all rows use `numberOfLines={1}` so large text truncates rather than wraps; row min height `theme.space.rowMin` (`:314`).
- Copy: `strings/en.ts` `offers` (`:1087-1197`), mainly `:1135-1160` (tabs, empty, inboxStatus, time), plus `chat.photoPreview` `:1248`, `notificationsScreen.open`.
- Notes: DEC 90 (Buying/Selling, Needs you, Earlier) is implemented as written. `copy.tabOffers/tabChats/waitingOnYou/youMade/toYou/recent/emptyTitle/emptyBody/emptyChatsTitle/emptyChatsBody` (`en.ts:1124-1133`) are leftover keys from the old two-list inbox; `inboxSections()` (`logic.ts:171-178`) is also a leftover (not used by this screen). Offer rows show no expiry although `expires_at` is on the offer (`logic.ts:19`). Text-node density: 5 `<Text` in `InboxScreen.tsx` (+1 in `DealAvatar.tsx:42`), 3 text lines per row plus time.

<a id="04-offer"></a>
### Offer  (E02; frames E3-E8)
- Source: `apps/mobile/app/offer/[id].tsx:5-8` -> `apps/mobile/src/features/offers/OfferScreen.tsx:35-304` (state logic `apps/mobile/src/features/offers/logic.ts:103-168`)
- Route & entry: `/offer/[id]`, param `id` (offer id), push (no custom presentation). Linked from Inbox rows (`InboxScreen.tsx:144`), Offers on this listing rows (`ListingOffersScreen.tsx:56`), and push notifications with `offer_id` (`src/lib/push.ts:73`). Back falls back to `/inbox` (`OfferScreen.tsx:54`).
- Purpose: show one offer and let the right person accept, counter, decline, withdraw, open the chat or offer again.
- Roles: buyer or seller of this offer; `o.role` decides (`logic.ts:22,116-168`). Turn-based: `myTurn = open && role != last_actor` (`logic.ts:124`). Seller can never withdraw; buyer can withdraw whenever the offer is open (`logic.ts:138,145`). Counter is hidden once `round >= MAX_ROUND (4)` or when the listing is free (`logic.ts:75,125`).
- Elements:
  - `NavBar` back only, no title (`OfferScreen.tsx:105`).
  - Listing card `Tappable` -> `/listing/[id]` with thumb, title (`offerTitle`, bundles read "Title + N more", `logic.ts:47-51`), optional "Also in this deal: ..." (`:126-130`), asking price (`:131-133`).
  - Offer amount `Text variant="price"` as header (`:139-141`).
  - Status line `Text bodyStrong` (`view.line`, `:142-144`).
  - Other person: `Avatar size S` + name (`:145-152`).
  - Open offers only: meta line "Round {n} of 4 · Expires {weekday, time}" (`:153-163`, `copy.round`, `copy.expiresIn` `en.ts:1176-1177`).
  - Quick-note `Chip disabled` per note (`:164-170`), free-text note (`:171`).
  - Last-round note when `round >= 4` and Accept is allowed: "This is the last round. They can accept or decline." (`:172-176`).
  - Error `Banner kind="error"` (`:177`).
  - Docked buttons in order (`:180-229`): Accept "Accept {amount}" (primary, loading), Counter (`variant="dark"`), Decline (`secondary`), Withdraw offer (`text`), Open chat, Offer again.
  - Counter `Sheet` with price `Input` and "Send counter" (disabled unless a valid, changed amount) (`:231-256`). Decline `Sheet` with three reason `Chip`s (Too low / Selling to someone else / Keeping it) and destructive "Decline" (`:258-287`). Withdraw `ConfirmDialog` "Withdraw your offer?" / "The seller will no longer see it." (`:289-301`).
- States (every status x role, from `offerView`, `logic.ts:116-168`; testID `screen-offer-E3..E8`, `OfferScreen.tsx:104`):

| Status | Role | Whose turn | Frame | Status line (key, en.ts) | Dock actions |
|---|---|---|---|---|---|
| pending | seller | mine | E3 | "{name} offered {amount}" (`status.pending_seller` `:1164`) | Accept, Counter (if round<4 and not free), Decline |
| pending | buyer | theirs | E5 | "You offered {amount}. Waiting for {name}." (`pending_buyer` `:1165`) | Withdraw offer |
| countered | buyer | mine (seller countered) | E4 | "{name} countered at {amount}" (`countered_mine` `:1166`) | Accept, Counter (if round<4), Decline, Withdraw offer |
| countered | seller | mine (buyer countered back) | E4 | same line | Accept, Counter (if round<4), Decline |
| countered | seller | theirs (I countered) | E5 | "You countered at {amount}. Waiting for {name}." (`countered_theirs` `:1167`) | none (a waiting seller has no withdraw) |
| accepted | either | n/a | E6 | "Accepted at {amount}" (`:1168`) | Open chat (only if `chat_id`) |
| declined | either | n/a | E7 | "Declined" (`:1169`) | Offer again (buyer, listing `active`); none for seller |
| expired | either | n/a | E7 | "Expired" (`:1170`) | Offer again (buyer, listing `active`) |
| withdrawn | either | n/a | E7 | "Withdrawn" (`:1171`) | Offer again (buyer, listing `active`) |
| auto_declined, listing `hold` | either | n/a | E8 | "On hold with someone else" (`hold_other` `:1174`) | none |
| auto_declined, listing `sold` | either | n/a | E8 | "This sold to someone else" (`auto_declined` `:1172`) | none |
| auto_declined, other listing status | either | n/a | E8 | "This listing closed" (`listing_closed` `:1173`) | none |

  Mapping at `logic.ts:250-256` (`autoDeclinedLine`). A still-open (pending/countered) offer on a listing that has just gone to hold is not special-cased in `offerView`; it keeps its open actions until the server auto-declines it (no branch found).
  - loading: `NavBar` + `SkeletonList rows={3}` (`:56-62`). error: `ErrorState` with retry (`:64-71`).
  - busy: Accept shows loading (`:185`); Counter Send shows loading (`:248`); Decline and Withdraw show no loading state (`:197-212`).
  - action error: `Banner kind="error"` via `run()` (`:78-90,177`). The Withdraw `ConfirmDialog` calls `api.withdraw` directly, not through `run()` (`:295-299`), so a failure does not reach the Banner; it is still shown: `ConfirmDialog` awaits `onConfirm`, shows the error inline as an alert and stays open for retry (`apps/mobile/src/components/ConfirmDialog.tsx:53-62,72-75`).
  - deleted other user: `offers.deletedUser` (`:101`). No listing (`o.listing` null): listing card omitted (`:107,137`), "Offer again" also needs `listing_id` (`:220`).
  - decline reason: stored on the offer (`logic.ts:18`) but never displayed on this screen (no branch found).
  - Expiry: `expires_at` is real data, set 48 h after each send/counter (`supabase/migrations/0022_offers.sql:157,162,292`) and shown as an absolute weekday + time on open offers only (`OfferScreen.tsx:155-161`); there is no countdown.
  - reduce motion / Dynamic Type: no custom animation; the dock stacks up to 4 full-width buttons, which grows tall at large type (`:180-229`).
- Copy: `strings/en.ts` `offers` `:1163-1197`.
- Notes: DEC 90 P7 says one docked primary; the dock holds up to four stacked buttons (Accept, Counter, Decline, Withdraw, `:181-212`). Haptic `success` on accept at `:95` (in budget). The accept happens on one tap with no confirm; the amount is in the label. `testID` carries the board frame (E3..E8). Text-node density: 9 `<Text` in `OfferScreen.tsx`.

<a id="04-offer-sheet"></a>
### Make an offer  (B05; also D15 "Ask for it" and B13 success)
- Source: `apps/mobile/app/listing/[id]/offer.tsx:5-13` (`presentation: 'modal'`, `:9`) -> `apps/mobile/src/features/offers/OfferSheetScreen.tsx:42-331`
- Route & entry: `/listing/[id]/offer`, param `id` (listing id), full-screen modal. Linked from the listing detail (`features/feed/ListingScreen.tsx:316`), Discover tile (`features/feed/DiscoverScreen.tsx:202`), Around campus card (`features/campus/CampusFeedScreen.tsx:277`) and "Offer again" (`OfferScreen.tsx:224`). Close falls back to `/discover` (`OfferSheetScreen.tsx:80`).
- Purpose: choose an amount (or ask for a free item), add an optional note, send.
- Roles: any verified buyer. The owner of the listing, a non-active listing, a hidden listing, or a server `LISTING_UNAVAILABLE`/`OFFERS_PAUSED` error all land on the unavailable state (`:100-116`).
- Elements:
  - `NavBar leading="close"` titled "Make an offer", or "Ask for it" when free (`:186`).
  - Item row: `Photo` thumb, title, "Asking $X · Seller name" (just the seller name when free) (`:188-200`).
  - Moving-out bundle block (DEC 133): "Moving out by ..." label, body, one `Chip` per other active item of the seller (max 10 picked), running "Asking $X for N items" (`:201-229`). Hairline card with `colors.card` background (`:353-360`).
  - Free: body "It's free. Ask the giver and they'll pick who gets it." (`:230-233`).
  - Priced: "Your offer" label, then either the firm price as plain text plus "The price is firm, so offers are at the asking price." (`:239-250`), or the amount `TextInput` (display style x1.85, `$` kept in front, `:254-264,344-352`), quick-amount `Chip`s (Asking $X, 10% and 20% less rounded to whole dollars, `:265-278`, `logic.ts:80-88`), and the low-offer line "That's under half the asking price. Low offers are usually declined." in amber when under 50% (`:279-288`, `logic.ts:91-93`).
  - Note `TextArea` (140 chars) and four quick-note `Chip`s (Can pick up today / Can meet on campus / Is it still available? / Paying cash) (`:293-312`).
  - Error `Banner` (`:313`), pay-in-person line "You pay in person when you meet. No payment in the app." (`:314-316`).
  - Docked `Button variant="dark"` "Send offer" / "Ask for it", disabled until amount >= $1 (or free), loading while sending (`:318-328,179`).
- States:
  - loading: `SkeletonList rows={3}` (`:83-90`). error: `ErrorState` (`:91-98`).
  - unavailable: `EmptyState` "This item isn't taking offers" (icon `tag`) or "Offers are paused" (icon `lock`) with body from `errorText`, action "Close" (`:100-116`).
  - sent (B13): `SuccessCheck`, title "Offer sent" / "Request sent", body "We'll tell you when {name} answers. Offers last 48 hours.", docked "Go to Inbox" (dark) and "Keep swiping" (secondary) (`:131-148`). Haptic `success` fires on send (`:165`).
  - send error: `Banner` with `errorText` (`:172-173,313`).
  - Sheet is a route, not a `Sheet` component; it fills the screen. Keyboard: `keyboardShouldPersistTaps="handled"` (`:187`), Enter submits from the amount field (`:261`).
  - long title: `numberOfLines={2}` (`:193`). No photo: `Photo` null source (`:190`). Sold/hold/removed: covered by `item.status !== 'active'` (`:100`).
  - Bundles: if the extra-item profile query fails, the pool is empty and the bundle block is silently omitted (`:118-121`, no error branch).
  - notification primer after the first offer (D-doc B13 mentions it): not handled in this file (no branch found).
  - Dynamic Type: the big amount is a fixed multiple of the display size (`:344-351`); at large text it can overflow a narrow screen (no `adjustsFontSizeToFit`).
- Copy: `strings/en.ts` `offers` `:1087-1124`, `feed.free`.
- Notes: DEC 90 comment at `:37-41`. The amount, label and firm note are centered (`styles.center`, `:236-249`), the one place a centered hero number is used. Success screen is a centered stack (`:132-142`). Text-node density: 15 `<Text` in `OfferSheetScreen.tsx`.

<a id="04-listing-offers"></a>
### Offers on this listing  (F05)
- Source: `apps/mobile/app/listing/[id]/offers.tsx:5-8` -> `apps/mobile/src/features/offers/ListingOffersScreen.tsx:18-81`
- Route & entry: `/listing/[id]/offers`, param `id` (listing id), push. Linked from the seller's own listing detail (`features/feed/ListingScreen.tsx:628`). Back falls back to `/inbox` (`ListingOffersScreen.tsx:30`).
- Purpose: the seller's history of offers on one listing, in arrival order.
- Roles: seller (owner) of the listing; the screen itself has no role check, the `listing_offers` RPC does (`ListingOffersScreen.tsx:28`).
- Elements: `NavBar` title "Offers" (`:77`); `FlatList` of rows: index number, buyer name (bodyStrong), status line from `offerView(o).line`, amount (label) (`:59-68`). Row opens the offer (`:56`). Accessibility label "{n}. {status line}" (`:55`).
- States: loading `SkeletonList` (`:33`); error `ErrorState` retry (`:34`); empty `EmptyState icon="tag"` "No offers yet" / "Offers show up here in the order they came in." (no action) (`:35-43`); populated list (`:44-73`). Deleted buyer: "Deleted user" (`:62`). Long names: no `numberOfLines` on name or status (`:62-66`). Offline, reduce motion: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`). Pull-to-refresh: not present (no `RefreshControl`).
- Copy: `strings/en.ts` `offers.listingOffersTitle`, `noOffers`, `noOffersBody` `:1194-1196`, status lines `:1163-1175`.
- Notes: the row shows the pre-computed status line ("Sam offered $40", "You offered ...") from the viewer's perspective; for the seller every open offer says "{name} offered/countered ..." or "You countered ...". Row has no listing photo and no time. Text-node density: 4 `<Text` in `ListingOffersScreen.tsx`.

<a id="04-mark-sold"></a>
### Mark sold  (F07)
- Source: `apps/mobile/app/listing/[id]/sold.tsx:5-13` (`presentation: 'modal'`, `:9`; params `id`, optional `buyer`) -> `apps/mobile/src/features/deals/DealScreens.tsx:125-213`
- Route & entry: `/listing/[id]/sold`, modal. Linked from the seller's listing detail (`features/feed/ListingScreen.tsx:617`) and from the chat "Mark sold" button with `buyer` preselected (`ChatScreen.tsx:247-252`, DEC 97). Close falls back to the listing (`DealScreens.tsx:146-149`).
- Purpose: record who bought the item (or "someone not on OnlySwap") so both sides can rate.
- Roles: seller (owner). No client-side gate; the `mark_sold` RPC enforces it (`:160`).
- Elements: `NavBar leading="close"` title "Who bought it?" (`:176`); body "Pick the buyer so you can rate each other. Other chats close." (`:178-180`); one radio `OptionRow` per buyer whose offer is `accepted` (`:151-153,185-193`); radio "Someone not on OnlySwap" (`:194-199`); error `Banner` (`:200`); docked `Button` "Mark sold", disabled until a choice exists (`:202-210`).
- States: loading inline `SkeletonList rows={2}` (`:181`); error inline `ErrorState layout="inline"` with retry (`:182-184`); empty list: only the "Someone not on OnlySwap" row shows (`:185-199`). Submit: loading on the button, on success closes and invalidates `inbox`, `chat`, `my-listings`, listing (`:155-172`); error Banner (`:167-168,200`). No confirm step although the body says other chats close; no toast or haptic on success (closes silently, `:166`; no branch found). Preselected buyer not in the accepted list: button is enabled with no visible selection (`:143,205`).
- Copy: `strings/en.ts` `deal` `:1359-1362`.
- Notes: DEC 97 (`DECISIONS_LOG.md:53`) matches the chat entry point. Text-node density: shared file `DealScreens.tsx` has 10 `<Text`; this screen holds 1 (`:178`).

<a id="04-chat"></a>
### Chat  (E03; X18 blocked)
- Source: `apps/mobile/app/chat/[id]/index.tsx:5-8` -> `apps/mobile/src/features/chat/ChatScreen.tsx:64-566` (bubble: `apps/mobile/src/components/MessageBubble.tsx:68-352`; logic `features/chat/logic.ts`, store `features/chat/useChat.ts`)
- Route & entry: `/chat/[id]`, param `id` (chat id), push; also the right pane of the iPad Inbox (`pane` prop, `ChatScreen.tsx:80,135,355`, `InboxScreen.tsx:45`). Linked from Inbox (`InboxScreen.tsx:147`), accepted offer (`OfferScreen.tsx:96,216`), push (`src/lib/push.ts:72`), Meetup widget. Back falls back to `/inbox` (`ChatScreen.tsx:120`).
- Purpose: message the other person about one deal, plan the meetup, mark it sold.
- Roles: buyer or seller of the deal (`c.role`). Seller-only: Mark sold (`:235-255`). Both: Plan meetup, Did it sell?.
- Elements:
  - Header (`:352-398`): `NavBar` title = the other person's name `c.other.display_name` (`:149,354`; "Deleted user" when the account is gone), back (or none in the iPad pane), trailing `IconButton "more"` -> Chat details (`:358-363`). This is the person's profile display name, the same field Inbox and the meetup screen use; there is no handle or anonymised label in the chat header.
  - Deal bar pinned under it: item `Photo`, title, "{amount} in person", bundle line, and a green "Accepted" label while open (`:367-392`, `copy.accepted` `en.ts:1217`). Action row beneath: Plan meetup (dark, `:208-218`), Did it sell? (dark, only after a meetup is confirmed/completed and my outcome is unset, `:219-232`), Mark sold (secondary, seller, listing `active` or `hold`, `:235-255`), plus `extraActions` (`:256-257`). All hidden when read-only.
  - `MeetupCard` between header and list when a meetup exists (`:399-407`; see Meetup card entry).
  - Message list: inverted `FlatList` (`:409-431`), day headers "Today"/"Yesterday"/date (`:270-284`), bubbles via `MessageBubble` (`:333-346`), system and meetup rows as small centered text (`:294-297`; `MessageBubble.tsx:100-106`).
  - Composer: optional photo `IconButton` (only when the `chat_photos_enabled` flag is on and the chat is open, `:152,447-454`), multiline `TextInput` max 1000 (`:455-471`), send `IconButton` filled in the accent (`:472-480`).
  - Photo sheet (`:489-510`), camera/photos permission primer (`:511-527`), full-screen photo viewer (`:528-547`), `ReportSheet` for a message via long-press (`:548-563`).
- States:
  - loading: `SkeletonList rows={6}` (`:132-139`). error: `ErrorState` (`:140-147`).
  - first-message safety tip: when `c.my_first_message` and not read-only, one plain line "Stay safe. Meet at a Meetup spot in daylight, check the item, and pay in person. Never pay before you meet." as the list footer, which on an inverted list sits at the top of the thread (`:417-429`, `en.ts:1207-1209`).
  - message states (`MessageBubble.tsx:15`): pending = bubble at 60% opacity plus screen-reader "Sending" (`:287,127-133`); sent = full opacity, time under the last bubble of a group (`:232-243`, `ChatScreen.tsx:344`); failed = red alert icon and "Didn't send. Tap to retry." under the bubble, whole bubble is a retry `Tappable` (`MessageBubble.tsx:166,191-199,244-251`, `ChatScreen.tsx:339`).
  - offline queue: unsent messages stay `pending` in the store, keep order, and flush on reconnect via NetInfo (`useChat.ts:99-124,206-219,263,325-329`). The chat shows no offline line of its own and no "queued" label (no branch found in `ChatScreen.tsx`); the signals are the dimmed bubble and the app-wide `OfflineBanner` mounted at the root (`apps/mobile/app/_layout.tsx:110`, component `components/Banner.tsx:48`, shown after a 1.5 s delay `:38`).
  - scam hint: for incoming text matching payment words, links or phone numbers, a row under the bubble with a shield icon and amber text: "Never pay before you meet. OnlySwap deals are paid in person." / "Be careful with links. Keep the deal in this chat." / "Keep the deal in this chat until you meet." (`ChatScreen.tsx:300,338`, `logic.ts:96-108`, `MessageBubble.tsx:252-262`, `en.ts:1210-1214`).
  - blocked / closed / deleted user: read-only. `readOnly = status === 'closed' || blocked || other_deleted` (`:150`); the composer is replaced by an info `Banner`: "This chat is closed." (closed), "You blocked {name}." (I blocked), else "You can't message each other." (they blocked me) (`:432-444`). A deleted user shows the name "Deleted user" (`:149`) and the generic blocked line (no deleted-specific banner copy, no branch found). All deal-bar action buttons are hidden when read-only (`:209,220,236,257`).
  - photo blur for new contacts: an incoming photo is blurred (`blurRadius 40`, `MessageBubble.tsx:18,141`) with an eye icon and "Tap to view" (`:146-153`) while the other person has sent fewer than 10 messages in the chat or the chat is under 24 h old (`logic.ts:113-131`, `ChatScreen.tsx:153,309`, rule from DEC 79, `docs/DECISIONS_LOG.md:71`). Tap reveals it for the session (`ChatScreen.tsx:116,320`); a second tap opens the full-screen viewer (`MessageBubble.tsx:165`). Only the photo is blurred: the text body and caption always render (`MessageBubble.tsx:180-186`, caption wrapper `:181`). My own photos are never blurred (`ChatScreen.tsx:309` requires `!mine`). Screen-reader label while hidden: "Photo from {name}, hidden because you are new to each other. Double tap to view." (`en.ts:1253-1254`).
  - photo error: `Banner` "Couldn't open that photo. Try again." (`:483-487`). Upload progress: "Uploading {n}%" over the photo (`MessageBubble.tsx:154-160`).
  - empty thread: `chat.empty` "Say hi and plan the pickup." exists (`en.ts:1227`) but is not used anywhere in `ChatScreen.tsx` (no branch found); a chat always starts with a system row.
  - long names/titles: item title `numberOfLines={1}` (`:375`), bundle line 2 lines (`:382`). Long-press an incoming message to report (`:341`).
  - Dynamic Type: bubble width is measured, not a percentage (`MessageBubble.tsx:83-87`); the header stacks NavBar + deal row + action row, three layers before the thread (`ChatScreen.tsx:352-398`).
  - Reduce motion: no custom animation in this file (viewer uses `animationType="fade"`, `:530`).
- Copy: `strings/en.ts` `chat` `:1199-1259`; `offers.deletedUser` for the inbox side.
- Notes: DEC 90 comment says header name with the item pinned under it (`ChatScreen.tsx:58-63`). Header comment says "a grey message area ... blue card"; code is a single white surface per the later owner note (`:575`). Mark sold from chat is DEC 97. Soft limits: this file is 633 lines (under the 800 soft ceiling). Text-node density: 9 `<Text` in `ChatScreen.tsx`, 8 in `MessageBubble.tsx`.

<a id="04-meetup-card"></a>
### Meetup card (inside Chat)  (E05/E06 entry; P8-MEET-04)
- Source: `apps/mobile/src/features/meetups/MeetupCard.tsx:24-142`, mounted at `ChatScreen.tsx:399-407` (no own route)
- Route & entry: component only. A confirmed card opens `/meetup/[id]` with `id` and `name` (`MeetupCard.tsx:124-126`); a proposed card from the other person has Accept and "Suggest another" (-> `/chat/[id]/meetup`, `:94-114`).
- Purpose: show the current meetup state in the chat.
- Roles: both; the Accept and Suggest another pair only when `proposed` and not proposed by me (`:94`).
- Elements: title line per status (`:47-58`): "{name} suggested {when} at {place}", "You suggested {when} at {place}. Waiting for {name}.", "Meetup {day}, {time}", "Meetup cancelled", "Meetup done", "Marked as a no-show"; place line (sky tone when confirmed, `:78-82`); "Police-designated" `Tag` (`:84-86`); chevron when confirmed (`:87`).
- States: proposed (two copies above), confirmed (blue `skyBg` card, tappable, `:119-128,141-142`), cancelled, completed, no-show (plain card with one line); accept error shown as red meta text (`:89-93`); accept busy -> button loading (`:100`). Offline / reduce motion: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
- Copy: `strings/en.ts` `meetup` `:1286-1299` (cardProposed etc.).
- Notes: The status "done" and "no-show" cards give no next step. Text-node density: 3 `<Text`.

<a id="04-chat-details"></a>
### Chat details  (E04; X17)
- Source: `apps/mobile/app/chat/[id]/details.tsx:5-8` -> `apps/mobile/src/features/chat/ChatDetailsScreen.tsx:23-147`
- Route & entry: `/chat/[id]/details`, param `id`, push, from the header "more" button (`ChatScreen.tsx:361`). Back falls back to `/inbox` (`ChatDetailsScreen.tsx:37`).
- Purpose: mute, view the listing or profile, report, block or hide the chat.
- Roles: buyer or seller.
- Elements: `NavBar` "Chat details" (`:68`); `Toggle` "Mute notifications" (`:70`); grouped list: "View listing" (tag icon), "View profile" (user icon) (`:71-88`); grouped list: "Report {name}" (flag), "Block {name}" (ban, destructive, hidden once blocked), "Hide chat" (eye) (`:89-117`); `ReportSheet target="chat"` (`:119-131`); block `ConfirmDialog` (`:132-144`).
- States: loading `SkeletonList rows={4}` (`:39-45`); error `ErrorState` (`:47-54`). Mute is optimistic and refetches on failure, no error shown (`:57-64`). Hide: calls `api.hide`, shows a toast "Chat hidden. It comes back if they message you.", replaces to `/inbox` (`:110-115`), with no error handling around `api.hide` (no branch found). Deleted other user: the report and block rows are hidden because `c.other` is null (`:81,90`); name falls back to "Deleted user" (`:56`). Already blocked: Block row hidden, no "Unblock" row here (`:97`, no branch found). Offline, reduce motion: not handled (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
- Copy: `strings/en.ts` `chat` `:1229-1238`; `profileView.blockTitle/blockBody/blockConfirm` for the dialog.
- Notes: the block dialog copy comes from the profile section (`:134-136`). Text-node density: 0 `<Text` (rows come from `ListRow`/`Toggle`).

<a id="04-did-it-sell"></a>
### Did it sell?  (E07; board E16) - the "sold?" popup
- Source: `apps/mobile/app/chat/[id]/deal.tsx:5-13` (`presentation: 'modal'`, `:9`) -> `apps/mobile/src/features/deals/DealScreens.tsx:34-122`
- Route & entry: `/chat/[id]/deal`, param `id` (chat id), modal. Linked from the chat deal bar "Did it sell?" button (`ChatScreen.tsx:219-232`, shown only when the meetup is confirmed/completed and my outcome is still unset) and from a push (`src/lib/push.ts:71`). Close falls back to the chat (`DealScreens.tsx:49-52`). The handoff code path (`Handoff.tsx:84`) skips this screen and goes straight to Rate.
- Purpose: after a meetup, say whether the swap happened.
- Roles: buyer or seller; the title differs: seller "Did it sell?", buyer "Did you get it?" (`:74-80`, `en.ts:1350-1351`).
- Elements: `NavBar leading="close"` (`:77-81`); item title as heading (`:83-87`); `Button` "Yes, all done" (primary, loading) (`:88-93`); `Button` "Not yet" (secondary) (`:94-99`); `Button variant="text"` "It fell through" (`:100-105`); error `Banner` (`:106`); `ConfirmDialog` "Close this deal?" / "The chat closes and the listing goes back up." / "Close deal" (destructive) (`:108-119`).
- States: no loading state for the chat query: before it resolves `seller` is false so a seller briefly sees "Did you get it?" and the heading is blank (`:74,80,83`); no error state for the chat query (no branch found). Answer: `done` -> replace to Rate (`:64-65`); `not_yet` / `fell_through` -> close (`:66`). Busy shows only on "Yes, all done" (`:90`), the other two buttons stay tappable while a call is in flight (`:94-105`). API error: `Banner` (`:67-68,106`). Offline, reduce motion: not handled (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`).
- Copy: `strings/en.ts` `deal` `:1350-1356`.
- Notes: no haptic or toast on any answer. The three buttons sit in the body at the top, not in a docked bar (`:82-107`; no `dock` style used). The Mark sold screen (previous entry) is the alternative route for "Mark sold" in chat (DEC 97). Text-node density: 2 `<Text` on this screen.

<a id="04-plan-meetup"></a>
### Plan the pickup  (E05; E11 list-only)
- Source: `apps/mobile/app/chat/[id]/meetup.tsx:5-13` (`presentation: 'modal'`, `:9`) -> `apps/mobile/src/features/meetups/PlanMeetupScreen.tsx:37-190`
- Route & entry: `/chat/[id]/meetup`, param `id` (chat id), modal. Linked from the chat "Plan meetup" button (`ChatScreen.tsx:215`), the meetup card "Suggest another" (`MeetupCard.tsx:110`) and "Pick another time" on the meetup day screen (`MeetupDayScreen.tsx:301`). Close falls back to the chat (`PlanMeetupScreen.tsx:60-63`).
- Purpose: choose a public place, day and time and send it as a suggestion.
- Roles: buyer or seller.
- Elements: `NavBar leading="close"` "Plan the pickup" (`:96`); heading "Meetup spots" (`:98-100`); collapsible `SpotsMap` (native only, `SpotsMap.tsx:27-122`, web returns null `SpotsMap.web.tsx:13`); radio `OptionRow` per spot with description or hours, a green "Police-designated" `Tag`, and a Directions `IconButton` (`:108-130`); radio "Somewhere else" plus a `Input` "Place" (60 chars) (`:131-146`); "Day" heading and `Chip`s (`:148-163`); "Time" heading and `Chip`s (`:164-176`); error `Banner` (`:177`); docked `Button` "Suggest this time", disabled until place and time are set (`:179-187`).
- States: spots loading `SkeletonList rows={3}` (`:101`); spots empty: "No Meetup spots here yet. Type a public place." (`:103-107`); spots fetch error: not shown, same as empty (`:65,103`, no error branch found); submit busy via button loading (`:183`); submit error `Banner` (`:87-88,177`). Time chips reset when the day changes (`:158`). Map failure hides the map (`SpotsMap.tsx:47`). Counter-proposal: reuses the same screen (no pre-filled values, no branch found). Offline, reduce motion: the map camera uses zero duration under reduce motion (`SpotsMap.tsx:91`); rest not handled.
- Copy: `strings/en.ts` `meetup` `:1272-1295`.
- Notes: Meetup spots and police designation are visible at the moment of decision (good for P5). The map is a list helper only; no location permission. Text-node density: 4 `<Text` in `PlanMeetupScreen.tsx` (+2 in `SpotsMap.tsx`).

<a id="04-rate"></a>
### Rate the swap  (E08; E17 submit, E18 waiting and revealed)
- Source: `apps/mobile/app/deal/[chatId]/rate.tsx:5-8` -> `apps/mobile/src/features/deals/DealScreens.tsx:216-392`
- Route & entry: `/deal/[chatId]/rate`, param `chatId`, push. Reached by `router.replace` from Did it sell? "Yes, all done" (`DealScreens.tsx:64-65`), from the handoff finish (`Handoff.tsx:84`), and from a push (`src/lib/push.ts:69`). Close falls back to the chat (`DealScreens.tsx:239-242`).
- Purpose: rate the other person; see their rating once it is visible.
- Roles: buyer or seller after a completed deal.
- Phases: `ratePhase(rating)` (`apps/mobile/src/features/deals/logic.ts:21-25`) is local UI only: no rating from me = `submit`; mine but not theirs = `waiting`; both = `revealed`. The visibility rule itself is server-side (`ratings_visible`, `docs/DESIGN_SYSTEM.md:258`): their rating shows when both have rated, or 7 days after that rating's `created_at`. The client only reads whether `theirs` is present; `theirs_waiting` is in the type (`logic.ts:18`) but unused.
- Elements:
  - submit (`testID screen-rate-submit`, `:322-391`): heading "How was swapping with {name}?" (`:326-328`), two `Button`s "Good" / "Not great" (selected = dark) (`:329-352`), then "What stood out? (optional)" with four tag `Chip`s (good set or bad set, `logic.ts:12-13`) and a comment `TextArea` (200 chars) (`:353-378`), error `Banner`, docked `Button` "Send rating" (`:381-389`).
  - waiting (`screen-rate-waiting`, `:289-317`): `SuccessCheck`, title "Thanks for rating", body "Their rating shows up when they rate too, or after 7 days.", secondary "Done".
  - revealed (`screen-rate-revealed`): same check, title "Your ratings", then a box "{name} said" and "Good · tags" and the comment (`:304-313`), secondary "Done".
- States: loading `SkeletonList rows={3}` while the rating or chat query is pending (`:244-251`); rating error `ErrorState` (`:252-259`); chat query error is ignored, the name becomes an empty string so the heading reads "How was swapping with ?" (`:260`). Submit busy on button (`:385`); error `Banner` (`:282-283,379`). After a thumbs-up the app may ask for a store review (`:272-280`, rule `logic.ts:41-47`). The revealed box shows only their rating; the key `youSaid` ("You said") exists (`en.ts:1386`) but is not used and my own rating is not shown (no branch found).
- Copy: `strings/en.ts` `deal` `:1364-1388`.
- Notes: no haptic on submit (not in the budget). Waiting and revealed reuse the same success check even for a thumbs-down. Text-node density: shared file 10 `<Text`; this screen holds about 7.

<a id="04-meetup-day"></a>
### Meetup day  (E06; E12-E15)
- Source: `apps/mobile/app/meetup/[id].tsx:5-8` (params `id`, optional `name`) -> `apps/mobile/src/features/meetups/MeetupDayScreen.tsx:58-382`
- Route & entry: `/meetup/[id]`, push. Linked from the confirmed meetup card in chat (`MeetupCard.tsx:124-126`), push (`src/lib/push.ts:67`), widget/Live Activity. `name` is a first-paint only; the screen reloads the name from the chat (`MeetupDayScreen.tsx:53-56,88-93,125`). Back falls back to `/inbox` (`:99`).
- Purpose: on the day, see time and place, check in, share, run late, cancel, report a no-show, call 911, and (seller) finish with the handoff code.
- Roles: buyer or seller. Buyer sees the 4-digit handoff code; seller types it (`Handoff.tsx:45-67,92-115`). Actions gate on time windows (`meetupActions`, `features/meetups/logic.ts:131-149`): check-in from 1 h before to 1 h after start; running late until 1 h after; no-show only after 20 min, when I checked in and they did not.
- Elements: `NavBar` "Meetup" with a share `IconButton` while open (`:157-170`); day label + big time (`:172-181`); countdown "Starts in 2 h 10 min" / "Started 5 min ago" when confirmed (`:182-186`, `logic.ts:120-128`); "Moved from {when}" (`:187-191`); cancelled `Banner` (`:192`); `SpotsMap` of the spot (`:194`); grouped list: place + "Police-designated"/"Meetup spot" + hours, then person row (`DealAvatar`, name, item and "{amount} in person", "Here"/"Not here yet") (`:196-234`); `Handoff` panel (`:236`); "You're here" (`:237-241`); late note in amber (`:242-248`); error `Banner`; pair of buttons "Running late" (reveals 3+ minute chips, `:278-291`) and "Directions" (`:251-277`); text links "Pick another time", "They didn't show up", "Cancel meetup" (`:293-326`); docked "I'm here" (only when allowed) and a red "Call 911" link that is on every state (`:329-352`); cancel and no-show `ConfirmDialog`s (`:354-381`).
- Handoff panel (`Handoff.tsx`): returns null unless the meetup is confirmed and not yet handed off (`:45`). Buyer: label "Handoff code", the code in display style, "Show this to the seller when you have the item. They type it to finish the swap." (`:47-66`). Seller: "Swap done?" / "Ask the buyer for their 4-digit code and type it here." with a numeric `Input` "Buyer code" and "Finish swap" (disabled until 4 digits) (`:92-115`). Wrong code: "That code does not match. {n} tries left." and the field clears (`:74-78`); locked after 5 per the doc comment (`:27-28`). Success: toast "Swap done." (`:80`), then `router.replace` to Rate (`:84`); no haptic.
- States: loading `SkeletonList rows={4}` (`:106-113`); error `ErrorState` (`:114-121`); refetch every 60 s and a 30 s clock tick (`:86,101-104`). Statuses: proposed, confirmed, cancelled, completed, no-show, handled by `testID screen-meetup-{status}` (`:156`) and the action gates; completed/no-show show no dedicated banner (only `cancelled` has one, `:192`; no branch found). Other person deleted: "Deleted user" (`logic.ts:157-167`). Action errors in the `Banner` (`:130-139,249`); cancel and no-show `onConfirm` are not wrapped in `run()` (`:361-365,374-379`), but both await the API before closing, so a failure shows inline in the `ConfirmDialog`, which stays open (`ConfirmDialog.tsx:53-62,72-75`). Map failure hides the map. Reduce motion: not applicable here beyond the map camera.
- Copy: `strings/en.ts` `meetup` `:1261-1346`, `chat.inPerson`, `chat.deletedUser`.
- Notes: 911 stays one tap away on every state by design (`:337`). "I'm here" is the one docked primary (P7 conforms); the handoff panel above it competes with it when the meetup is within the check-in window. Text-node density: 12 `<Text` in `MeetupDayScreen.tsx`, 5 in `Handoff.tsx`.
