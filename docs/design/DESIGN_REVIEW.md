# OnlySwap design review (Phase 2)

Status: proposal only. Nothing in this document has been built. It reads the inventory in [SCREENS.md](SCREENS.md) and the slice files under [screens/](screens/), and proposes a calmer, Apple-like pass over the same screens, the same data and the same flows. Phase 3 (code) starts only after the owner approves; section 6 is the order.

## 0. Scope and terminology

Scope: every mobile route under `apps/mobile/app/`, every admin page under `apps/admin/src/`, the shared components, and the tokens in `packages/tokens/tokens.json`. The current look is captured in `design/app-screens-now.html` (all app screens after DEC 90) and `design/admin-screens-now.html`; the approved DEC 90 direction is `design/app-redesign-mock.html`. Those files are references only and are not edited. `apps/site` is out of scope.

What this review may change: layout, hierarchy, spacing, type, color use within the existing tokens, copy, motion and haptics within the budget. What it may not change: queries, RPCs, routes, params, data shapes, or anything else that is logic. Ideas that need logic are listed in section 5 and are not part of the screen proposals.

### Terminology (owner words to app words)

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

### Decisions respected

| Decision | What it says (short) | Status in this review |
|---|---|---|
| DEC 90 (`docs/DECISIONS_LOG.md:60`) | Large titles; one main action docked at the bottom; plain rows; status as plain words; no tip boxes, no uppercase labels, no stat grids, no invented numbers; price and title below photos | Kept, and used as the baseline rule set. One proposal touches it: retiring `lilac` for the Quad (section 2.1) contradicts DEC 90's color list and is marked as an owner decision. |
| DEC 98 (`DECISIONS_LOG.md:52`) | Feed tab and news posts; composer at the top | Kept (as amended by DEC 130 and DEC 141). |
| DEC 121 (`DECISIONS_LOG.md:29`) | Likes and comments on every Feed post, real names | Kept. The Feed proposal keeps Like and Comment on every row; it only reduces chrome around them. |
| DEC 130 (`DECISIONS_LOG.md:20`) | Quad lives inside Feed as a chip; five tabs | Kept. No proposal adds a tab or brings Quad back to the bar. |
| DEC 135 (`DECISIONS_LOG.md:15`) | Launch animation; Reduce Motion = fade only | Kept. Motion table (2.7) lists it unchanged. |
| DEC 141 (`DECISIONS_LOG.md:9`) | Calmer Feed: header "Feed" + Search + bell, one composer row with +, flat rows split by hairlines, no founding panel, chips stay | Kept, and extended in spirit to the other tab roots (fewer words, flat rows). No proposal reintroduces boxed Feed cards or the founding panel. |
| DEC 96 / DEC 99 (`DECISIONS_LOG.md:54`, `:51`) | Seller sees an admin removal and its reason; Appeal a removed listing | Kept. Copy edits only. |
| DEC 97 (`DECISIONS_LOG.md:53`) | Mark sold from the chat; "Did it sell?" after a meetup unchanged | Kept. |
| DEC 140 (`DECISIONS_LOG.md:10`) | Login mode checks the account first, "No OnlySwap account uses {email}" | Kept. Copy is not changed on that branch. |
| DESIGN_SYSTEM.md (LOCKED, line 1) | Tokens, type, haptic budget, banned patterns | Kept. Every proposal that would change a LOCKED value is flagged "owner decision" with the section number. |

## 1. Design principles

These are the seven principles every screen proposal is checked against. Where `docs/DESIGN_SYSTEM.md` already says it, the line is cited; the review does not restate generic HIG.

1. **P1 Photo first, chrome quiet.** The item photo is the hero (DESIGN_SYSTEM.md:13). Headers, chips and buttons step back: hairlines over boxes, ink over color.
2. **P2 One accent, used as a fill.** Pistachio marks the one primary action or the current selection on a screen, never text on `bg` (DESIGN_SYSTEM.md:14, :53). If the accent is already used on a screen, the docked action is ink (DEC 90).
3. **P3 Status as plain words.** "Sold", "On hold", "Offer sent", colored only when it matters: today's meetup `sky`, free food `peach`, done or price drop `green` (DEC 90, `DECISIONS_LOG.md:60`).
4. **P4 Fewer words per screen.** One headline, at most one line of help, no tip boxes, no repeated explanations. Owner feedback on 2026-10-23: "too much text and too many boxes", "simple like Apple's apps" (DEC 141, `DECISIONS_LOG.md:9`).
5. **P5 Stranger-safe by default.** This is a campus marketplace between strangers. The three trust signals the app already has (school email verification, ratings, public meetup spots with the police-designated tag) appear at the moment of decision: on the listing, in the offer sheet and in the meetup planner, not behind a menu.
6. **P6 Every action answers back.** Each press gets the `tap` press feedback (`apps/mobile/src/theme/motion.ts:60-80`); each mutation ends in an inline result, a toast or the success check. Haptics stay inside the UX-09 budget (DESIGN_SYSTEM.md:97-102).
7. **P7 One primary action, in the thumb zone.** One main action, docked at the bottom (DEC 90). Secondary actions are text buttons or rows, never a second filled button of equal weight.

<a id="design-system"></a>
## 2. Design system, current -> proposed

The current values are inventoried with line references in [screens/08-components-tokens.md](screens/08-components-tokens.md#08-tokens) and summarised in [SCREENS.md](SCREENS.md#current-tokens). The short version of this section: the token set is already restrained and mostly right. The redesign is about *using* it with more discipline (fewer surfaces, fewer colors per screen, one filled action), not about new values. Every change below to a value in `docs/DESIGN_SYSTEM.md` (LOCKED, line 1) is marked **owner decision**.

### 2.1 Color (light and dark)

| Token group | Current (tokens.json) | Proposed | Why |
|---|---|---|---|
| Surfaces `bg`, `bg2`, `bg3`, `card` | light `#FFFFFF` / `#F3F3F0` / `#E8E8E3` / `#FFFFFF`; dark `#0C0C0D` / `#1A1A1C` / `#262629` / `#2A2A2D` (`packages/tokens/tokens.json:5-8`, `:31-34`) | Keep values. Use rule: a screen uses `bg` plus at most one grouped surface (`bg2`); `card` only inside grouped lists. No surface-on-surface-on-surface stacks | P1, P4; DEC 141 removed boxes from the Feed; slices 05 and 06 found boxed panels left (e.g. `CampusFeedScreen.tsx:336-349`) |
| Hairlines `line`, `line2` | light `#E6E6E1` / `#CFCFC9`; dark `#28282B` / `#3D3D41` (`tokens.json:9-10`, `:35-36`) | Keep. `line` is the default separator between flat rows (DEC 141); `line2` only for control borders and radio rings | Hairlines replace card shadows (DESIGN_SYSTEM.md:78) |
| Text `ink`, `ink2`, `ink3` | light `#111110` / `#5A5A54` / `#6F6F68`; dark `#F3F3EF` / `#A6A69F` / `#9A9A93` (`tokens.json:11-13`, `:37-39`) | Keep. Use rule: at most two text tones per row (ink + ink3 meta); `ink2` for body help lines | All pairs pass (table 2.2) |
| Accent | Pistachio `#C8E27D`, `onAccent` `#111110` light / `#0C0C0D` dark (`tokens.json:57-61`, default `:93`; `apps/mobile/src/theme/themes.ts:7-10`) | **Keep Pistachio** (decision below). Use rule: one accent fill per screen (the docked primary or the selected state, not both); when the screen already shows accent, the docked action is ink (DEC 90) | P2 |
| Status `red`, `green`, `amber` (+ `*Bg`) | light `#C8321C` / `#12703F` / `#9A6200`; dark `#FF5A40` / `#3DD68C` / `#F5B84B` (`tokens.json:14-19`, `:40-45`) | Keep values. Status is a word first; color only for errors, done/price drop and held (P3) | `amber/amberBg` light is 4.51:1, the thinnest pass in the set; do not use amber for small meta text |
| Category tints `sky`, `peach` (+ `*Bg`) | light `#1A5FA6` / `#9A4414`; dark `#8CC3FF` / `#FFB58A` (`tokens.json:20-23`, `:46-49`) | Keep: today's meetup `sky`, free food `peach` (DEC 90). Do not add new uses | DEC 90 |
| `lilac` / `lilacBg` (purple) | light `#5B45C4` / `#ECE7FF`; dark `#B9A9FF` / `#231D40` (`tokens.json:24-25`, `:50-51`). Live uses: the Quad pinned-note background `QuadFeedScreen.tsx:343` and the Settings icon tiles (`SettingsScreens.tsx:81-143`, slice 06); admin pills and avatar tints (`apps/admin/src/styles.css:783-790`, slice 09) | **Retire lilac from new and existing UI** (Quad pinned note -> `bg2` with an ink title; Settings tiles -> plain rows, see 3.06; admin -> neutral pill). Keep the token in `tokens.json` until Phase 3 confirms 0 uses, then remove. **Owner decision; contradicts DEC 90**, which names lilac as the Quad color | The owner's "no purple" constraint and DESIGN_SYSTEM.md:160 (purple-blue defaults banned). Quad is now a chip inside Feed (DEC 130), so it no longer needs its own hue to be found |
| `overlay`, `onPhoto`, `photoBg` | light `rgba(0,0,0,0.45)`, dark `rgba(0,0,0,0.6)`; `#FFFFFF`; `#000000` (`tokens.json:26-28`, `:52-54`) | Keep. The photo scrim is the only gradient allowed (DESIGN_SYSTEM.md:153) | |
| Toast icon tone | success icon `green`, error icon `red` on the `ink` pill (`apps/mobile/src/components/Toast.tsx:72`, background `:112`) | Icon tone `inverse` for every kind; the glyph (check / alert) carries the meaning | Dark mode the pill is light ink: green 1.69:1, red 2.78:1, below the 3:1 non-text minimum (table 2.2) |

**Accent decision: keep Pistachio.** Reasoning, with the numbers from table 2.2: text on the accent (`onAccent`) is 13.16:1 light and 13.62:1 dark, so every filled button is very legible; in dark mode the accent also works as an edge (13.62:1 against `bg`). In light mode the accent against white is only 1.44:1, so it fails WCAG 1.4.11 (3:1) **as a boundary on its own**. That is acceptable only because the accent is never the only cue: every accent fill carries ink text or an ink glyph (Button, Sell tab pill, selected chip), and accent text on `bg` stays banned (DESIGN_SYSTEM.md:53). The proposal adds that as a written rule for Phase 3 review: "an accent fill always contains ink content; a selected state never relies on the accent tint alone". Of the other options in `tokens.json:62-91`, only Cobalt passes 3:1 against white (6.73:1), but it fails against the dark `bg` (2.90:1) and is blue-violet, close to the banned purple-blue look. No change is proposed; if the owner wants a different accent, that is **owner decision (DEC-5/Q6)**.

<a id="contrast"></a>
### 2.2 Contrast table (WCAG relative luminance, computed from tokens.json)

Text pairs need 4.5:1 (body) or 3:1 (large or non-text). Values computed by a scratch script, not stored in the repo.[^contrast]

| Pair | Light | Dark | Verdict |
|---|---|---|---|
| ink / bg | 18.89 | 17.58 | pass (>= 7 required, DESIGN_SYSTEM.md:48) |
| ink / bg2 | 16.99 | 15.62 | pass |
| ink2 / bg | 6.94 | 7.99 | pass |
| ink3 / bg | 5.06 | 6.91 | pass |
| ink3 / bg2 | 4.55 | 6.14 | pass (light is close to the line) |
| ink3 / card | 5.06 | 5.05 | pass |
| onAccent / accent | 13.16 | 13.62 | pass |
| accent / bg (fill edge, non-text) | 1.44 | 13.62 | light fails 3:1 as a boundary; acceptable only with ink content inside (see accent decision) |
| red / redBg | 4.63 | 5.55 | pass |
| green / greenBg | 5.37 | 8.18 | pass |
| amber / amberBg | 4.51 | 8.95 | pass (light is the thinnest margin in the set) |
| sky / skyBg | 5.61 | 8.32 | pass |
| peach / peachBg | 5.58 | 8.92 | pass |
| lilac / lilacBg | 5.64 | 7.71 | pass (retire anyway, 2.1) |
| ink / skyBg, peachBg, lilacBg | 16.32, 16.11, 15.69 | 13.82, 13.78, 14.29 | pass |
| red / bg, green / bg | 5.35, 6.15 | 6.32, 10.42 | pass |
| Toast icon green / ink pill (non-text) | 3.07 | 1.69 | dark fails 3:1 -> proposal in 2.1 |
| Toast icon red / ink pill (non-text) | 3.53 | 2.78 | dark fails 3:1 -> proposal in 2.1 |
| line / bg, line2 / bg (decorative) | 1.25, 1.56 | 1.33, 1.81 | decorative hairlines; never the only boundary of a control |

[^contrast]: Script: `/Users/wasifkarim/.claude/team-runs/OnlySwap-20261023-143204/artifacts/scratch/contrast/contrast.mjs`, run as `node contrast.mjs packages/tokens/tokens.json` (outside the repo, not committed).

### 2.3 Type and Dynamic Type

| Style | Current (tokens.json) | Proposed |
|---|---|---|
| display | 34 / 800 / -0.04 / 1.05 (`:96-101`) | Keep; use only on Welcome and Unlocked |
| title | 26 / 800 / -0.035 / 1.1 (`:102-107`) | Keep; every tab root shows it as the large title (DEC 90). Profile currently renders none (`(tabs)/profile/_layout.tsx:3` promises one; `me.title` en.ts:1580 unused) |
| heading | 20 / "700", `specWeight` 750 (`:108-114`, comment `:147`) | Keep 700 in code. **Owner decision**: change DESIGN_SYSTEM.md:63 from 750 to 700 so the LOCKED spec matches what React Native can render (and `bodyStrong` 650 -> 600 at :66) |
| price | 28 / 800 / tabular (`:115-121`) | Keep; price sits below the photo, never on it (DEC 90; the Posted screen breaks this at `SellPostedScreen.tsx:174-178`) |
| body, bodyStrong, label, meta | 16/400, 16/600, 14/600, 12.5/500 (`:122-146`) | Keep. Rule: a row is `bodyStrong` + one `meta` line; help text is one `body` line in `ink2` |

Dynamic Type behaviour today: every `Text` sets `allowFontScaling` and scales without a cap (`apps/mobile/src/components/Text.tsx:51`); only `overlay` text is capped at 1.4x (`Text.tsx:52`, `tokens.json:225`). DESIGN_SYSTEM.md:70 allows the cap only on photo overlays and the tab bar. In-rule today: MessageBubble photo cover, PhotoCarousel, FeedPost photo count, TabBar labels and badges, the My listings price tag. Out of rule (about 9 sites): `DealAvatar.tsx:42`, `OTPInput.tsx:84`, `SegmentedControl.tsx:52`, `WaitlistScreen.tsx:185,295,298`, `ReplyRow.tsx:29`, `QuadFeedScreen.tsx:290`, and `Badge.tsx:22` (borderline). Proposed: keep the cap on fixed-size chrome (OTP cells, avatar initials, badges, the segmented pill) and **ask the owner to widen DESIGN_SYSTEM.md:70** to "photo overlays, the tab bar and fixed-size chrome"; remove `overlay` from the Waitlist ring copy and the Quad Post label, which can grow instead. Phase 3 checks every screen at the largest accessibility size.

### 2.4 Space (4/8 grid)

Current: `xs 4, sm 8, md 12, lg 16, xl 24, 2xl 32, screen 20, rowMin 52` (`tokens.json:149-158`). The code is already disciplined: no literal 4/8/12/16 paddings in features or components; the only literals are six `0` resets and three `2`s (`Toggle.tsx:55`, `PhotoGrid.tsx:312`, `ShareCard.tsx:97`, `SellMeetupScreen.tsx:344`, `PostNewsScreen.tsx:413`; full list in SCREENS.md inconsistencies).

| Use | Proposed mapping |
|---|---|
| Screen edge | `space.screen` (20) everywhere, including sheets |
| Between rows in a flat list | 0 gap, `line` hairline, row min `space.rowMin` (52) |
| Between groups / sections | `space.xl` (24); section label to first row `space.sm` (8) |
| Inside a row (icon to text, text to meta) | `space.md` (12) / `space.xs` (4) |
| Docked action area | `space.lg` (16) above the button, safe-area inset below |
| Literal 2 | keep only for hairline nudges (Toggle thumb inset); others become `space.xs` |

### 2.5 Radius

Current: `chip 999, control 15, card 18, sheet 28, thumb 12, avatar 999` (`tokens.json:159-166`). Proposed: keep all values; reduce *use*: flat rows have no radius, `card` only on grouped lists and photos, `thumb` for list photos. This avoids the "rounded-2xl-everything" look banned at DESIGN_SYSTEM.md:161.

### 2.6 Elevation

Current: one token, `elevation.soft` = `#000000`, opacity 0.12, y 8, blur 24 (`tokens.json:190-197`), used for sheets and toasts; `liftShadow()` derives a smaller lift (y 2, blur 8) for floating circles (`apps/mobile/src/theme/shadow.ts:10-18`). Found against DESIGN_SYSTEM.md:78: `IconButton` lifts every filled icon button not on `bg2` (`IconButton.tsx:91`), and the Waitlist ring card has a shadow (slice 01). Proposed: `elevation.soft` only on Sheet, Toast and the photo-overlay circle buttons; everything else flat with hairlines.

<a id="motion"></a>
### 2.7 Motion

| Kind (`apps/mobile/src/theme/motion.ts:14`) | Token value (`tokens.json:198-223`) | Used for now | Reduce Motion fallback |
|---|---|---|---|
| `tap` | scale 0.97, 120 ms ease-out (`:200-203`) | every `Tappable` and `Button` via `usePressFeedback` (`motion.ts:60-80`, `Tappable.tsx:46`) | opacity 0.7 over 150 ms, no scale (`motion.ts:65-68`) |
| `sheet` | spring damping 22, stiffness 240 (`:204-207`) | Sheet open and snap back (`Sheet.tsx:53,63`), ZoomableImage snap (`ZoomableImage.tsx:62`) | panel appears in place, 150 ms fade (`Sheet.tsx:52-57`, `resolveMotion` `motion.ts:24-26`) |
| `swipe` | spring damping 18, stiffness 180; fly-out 220 ms (`:208-212`, `deckMath.ts:18`) | Discover deck drag, snap back and fly-out (`SwipeDeck.tsx:263-303`) | the deck becomes a list with buttons, X33 (`SwipeDeck.tsx:93`: `asList` when screen reader or reduced) |
| `success` | 400 ms check draw (`:213-215`) | SuccessCheck (`SuccessCheck.tsx:14`, `useSuccessProgress` `motion.ts:86-108`) | finished check, 150 ms fade in (`motion.ts:98-100`) |
| `fade` | 150 ms (`:216-218`) | Toast enter (`Toast.tsx:59`), Banner under reduce motion, Progress width (`Progress.tsx:72`), PhotoGrid settle (`PhotoGrid.tsx:169`) | is itself the fallback |
| (skeleton) | 1300 ms period, 300 ms delay (`:219-222`) | `Skeleton.tsx:76-86` pulse | static block (`Skeleton.tsx:70-73`). The 300 ms delay hook `useDelayedLoading` (`Skeleton.tsx:23`) has 0 callers, so skeletons can flash |

Animated moments outside the five kinds, with their fallback:

| Moment | What animates and why | Duration | Reduce Motion |
|---|---|---|---|
| Launch (DEC 135) | mark halves part, swap and spring back; accent ring; cover fades after routing (`LaunchIntro.tsx:75-84,110`) | about 0.6 s per swap | no movement, fade only (`LaunchIntro.tsx:91,97,132`); kept |
| Welcome wall (DEC 89) | three columns of example listings drift (`WelcomeScreen.tsx:182-183`) | 40/48/44 s loops | still (`WelcomeScreen.tsx:116`); kept |
| Unlocked confetti | confetti pieces fall (`UnlockedScreen.tsx:120-145`) | `CONFETTI_MS` | no confetti, content fades in (`UnlockedScreen.tsx:60,73`). Proposed: one color (accent) instead of four (`UnlockedScreen.tsx:124`) |
| OTP error shake | cells shake -8/8/-6/0 px (`OTPInput.tsx:69-72`) | 4 x 50 ms | no shake, warning haptic only (`OTPInput.tsx:65-66`) |
| Offline banner | slides from the top (`Banner.tsx:68`) | 220 ms | 150 ms fade (`Banner.tsx:68`) |

Proposed motion changes: none to values. (1) Delaying mobile skeletons by 300 ms with the existing `useDelayedLoading` is deferred: needs logic change (see §5): it has to be wired into the loading branch of each screen that shows a skeleton, so it is not part of any batch. (2) The deck's next card scale 0.95 -> 1 (DESIGN_SYSTEM.md:95) stays. (3) No new animations; Phase 3 adds only `tap` feedback where it is missing (`ListRow`, `OptionRow`, `Toggle`, `SegmentedControl`, `TabBar`, ActionSheet rows, per slice 08).

<a id="haptic-map"></a>
### 2.8 Haptic map (every reference, classified against the event budget)

Budget, DESIGN_SYSTEM.md:97-102: `selection` at the swipe threshold; `success` on offer sent, offer accepted and listing posted; `warning` on the error shake; nothing else. The helper is `apps/mobile/src/lib/haptics.ts:8-21`. `grep -rni haptic` over `apps/mobile/src` and `apps/mobile/app` returns 39 lines: 9 imports, 14 comments/definition lines, 9 call sites and the Button prop plumbing.

| Reference | Kind | Triggering event | Current | Proposed |
|---|---|---|---|---|
| `features/feed/SwipeDeck.tsx:286` `runOnJS(haptic)('selection')` (worklet bridge) | selection | drag crosses the release threshold, once per crossing (guarded by `armed`) | in budget | keep |
| `components/OTPInput.tsx:65` | warning | wrong code: `error` prop set, with the shake | in budget | keep |
| `features/offers/OfferSheetScreen.tsx:165` | success | offer sent (make or counter) | in budget | keep |
| `features/offers/OfferScreen.tsx:95` | success | offer accepted | in budget | keep |
| `features/sell/SellPostedScreen.tsx:69` | success | Posted screen mounts with the new listing | in budget | keep |
| `features/auth/RulesScreen.tsx:163` | selection | toggling the "I agree" checkbox | **out of budget** | remove |
| `features/sell/SellScanScreen.tsx:73` | success | ISBN scan found a book | **out of budget** | remove (the filled form is the answer) |
| `features/auth/VerifyScreen.tsx:144` | success | email code verified | **out of budget** | remove, or **owner decision** to add "signed in" to the budget |
| `features/sell/SellDetailsScreen.tsx:265` | warning | Next pressed with validation or banned-word errors; no shake in that file | **out of budget** (the budget ties `warning` to the error shake) | remove, or add the shake to the error banner so the event matches the budget (presentation-only) |
| `components/Button.tsx:26,53,81` `hapticOnPress` prop (type limited to `'success'`) | success pass-through | any Button press that passes the prop | dormant: 0 callers | keep the prop; allowed only on offer send, accept and post |
| Comments only: `TabBar.tsx:62`, `PhotoGrid.tsx:41`, `VoteControl.tsx:31`, `deckMath.ts:40`, `platform.ts:7` | none | none | no call | none |

Not proposed: no haptic on the Mark sold, Did it sell?, rating, comment, like, vote or campus-post confirmations. Food and Wanted posts are created by `create_listing` (slice 03), so a `success` on their confirmation would arguably be "listing posted"; that is left as an owner question rather than proposed.

### 2.9 Icons

The set is one generated stroke set: 64 glyphs in `apps/mobile/src/components/icons/iconData.ts:72-680` (names `:8-70`), 1.8 stroke, round caps (`Icon.tsx:39-44`), matching DESIGN_SYSTEM.md:146. Every `icon=` and `name=` used in code exists in the set, so nothing referenced is missing. Glyphs with no use: `arrdown`, `chart`, `copy`, `del`, `edit`, `qr`, `shift`, `sliders`, `undo`. Missing for the proposals: a `thumbs` up/down pair (ratings are two text buttons today, `DealScreens.tsx:332-333`) and a `verified` mark for the school-email check on profiles and listings (P5). Both would be added to the generator source in Phase 3 B0; no emoji icons. Icons do not scale with Dynamic Type (size is a number, `Icon.tsx:10,32`); proposed: keep, since the label next to each icon scales.

### 2.10 Admin tokens (apps/admin/src/styles.css)

Inventory: [screens/09-admin.md](screens/09-admin.md#09-styles-tokens). The console imports the shared `tokens.css` (`apps/admin/src/styles.css:6`) and reads only its colors; it adds nine light-only variables (`styles.css:10-18`), uses none of the `--space-`, `--radius-` or `--type-` tokens, and pins light mode (`apps/admin/index.html:2`).

<a id="admin-tokens-critique"></a>
| Area | Current | Proposed | Evidence |
|---|---|---|---|
| Color source | Imports `@onlyswap/tokens/tokens.css` and reads `--color-*`; 9 admin-only variables (`--a-page`, `--a-soft`, `--a-soft2`, `--a-hover`, `--a-lime50/100`, `--a-limeInk`, `--a-shadow`, `--a-pop`) hardcode light values | Derive each from package tokens so no admin hex exists: `--a-page: var(--color-bg)`; `--a-soft: var(--color-bg2)`; `--a-soft2: var(--color-bg3)`; `--a-hover: var(--color-bg2)`; lime tints from `color-mix(in srgb, var(--color-accent) 25%, var(--color-bg))`; `--a-limeInk: var(--color-ink)` | `styles.css:6,10-16`; `packages/tokens/dist/tokens.css:3-27` |
| Drift from packages/tokens | `#fbfbf9`, `#f4f4f0`, `#ecece6`, `#fafaf7` differ by 1 to 4 steps from `bg #FFFFFF`, `bg2 #F3F3F0`, `bg3 #E8E8E3` | Collapse to the package values so a token edit reaches the admin | `styles.css:10-13` vs `tokens.json` |
| Dark mode | Pinned light by `<html data-theme="light">`; package dark block unused; removing the pin would put dark ink on `#fbfbf9` because `--a-*` have no dark values (54 uses) | After the derivation above, remove the pin and let `prefers-color-scheme` apply; no dark literals needed in `styles.css` | `apps/admin/index.html:2`; `tokens.css:63-119`; `styles.css:39,230,871,1296` |
| Accent | Pistachio `--color-accent` on the logo dot, avatar, bars, chart columns, split bar, dot, heat strip; unused `.btn.accent` | One accent fill, used sparingly: logo dot, own avatar, positive bar. Delete `.btn.accent` and `variant="accent"` | `styles.css:166,598,922,1119,1144,1630,1651,1661` |
| Purple and peach | `--color-lilac` and `--color-peach` pills, tiles and avatar tints | Map lilac, peach and sky tones to neutral in `labels.ts` (no purple in the console); keep green, red, amber | `styles.css:783-790,826-833,909-914`; `labels.ts:43,161,309,388` |
| Gradients | Skeleton shimmer `linear-gradient` | Flat soft bar with opacity pulse | `styles.css:1296` |
| Type | 14 distinct sizes (11 to 24px), 7 weights (400 to 800); `--type-*` unused; body 13.5px | Three body sizes: 11.5 (table heads, group labels), 12.5 (meta, buttons), 13.5 (body); 16 page title, 20 gate title; weights 400/500/600/700 (drop 650/750/800). Optionally add an `admin` density block to `tokens.json` rather than local literals | `styles.css:37,299-301,1341-1345`; counts in `admin-tokens.md` section 6 |
| Space | Literals: 4, 5, 6, 8, 9, 10, 12, 14, 16, 24, 28px | Use the package steps 4, 8, 12, 16, 24 (`--space-xs`..`--space-xl`); table and card padding 12 16 | `styles.css:140,222,486,857` |
| Radius | 12 distinct values (2 to 14px, 50%) | Three: 6 (pills, small chips), 8 (controls), 12 (cards, popovers, dialog, gate card); gate-card and dialog 14 -> 12 | `styles.css:473,566,751,1335,1697` |
| Shadow | `--a-pop` on popover, dialog, drawer; `--a-shadow` on the selected segment; switch knob shadow | One shadow for floating layers only, equal to package `elevation.soft` (y8 blur24 .12); remove the segment and knob shadows (use a hairline) | `styles.css:17-18,382,648,1261,1698,1821` |
| Scrim | `rgba(20,20,16,0.32)` literal | `var(--color-overlay)` | `styles.css:1685,1838` |
| Motion | Skeleton 1.2 s linear; drawer 0.2 s; switch uses `--motion-tap` without reduce-motion guard | Use `--motion-fade` (150 ms) and the 1300 ms skeleton token; wrap the switch transition in the reduce-motion media query | `styles.css:1298,1262,1818-1826` |
| Focus | Global 2px `--color-sky` outline; search and filter inputs remove outline and use `:focus-within` | Keep the global ring; give `:focus-within` boxes a 2px ink or sky ring, not a border color shift only | `styles.css:70-73,359-364,729-735` |

<a id="screen-critique"></a>
## 3. Screen-by-screen critique and redesign

Same slice order as SCREENS.md. Each entry: current (link to the inventory), problems (tagged), proposed layout, components, motion/haptic, copy changes, whether logic is needed, and conflicts with decisions. Principles are cited as P1 to P7 (section 1).

### 3.01 Auth, launch and system

Area note, onboarding flow (A03 to A07 plus A08): the flow is one area. Today `SIGNUP_STEPS = 5` (`apps/mobile/src/features/auth/AuthStep.tsx:16`) counts email, code, birthday, profile, rules, but the birthday screen never appears when the OS answers the age question (`AgeScreen.tsx:126-134`), so most people see "Step 2 of 5" then "Step 4 of 5". Proposal for an honest count with no data change: count the four steps everyone does (email 1, code 2, profile 3, rules 4) as "Step n of 4"; the birthday screen, when it does appear, holds the bar at its current length and shows no number (an optional prop on `AuthStep` that hides the label). Every step keeps one primary button docked above the keyboard (already true, `AuthStep.tsx:88-94`) and the wording is cut to one headline and at most one line of help (P4, P7).

#### Launch (A01)
- Current: [Launch](screens/01-auth-system.md#01-launch) shows the Mark centered on `bg` over the native splash, no text (`apps/mobile/src/features/auth/LaunchScreen.tsx:61-71`); the cover animation is [Launch animation](screens/01-auth-system.md#01-launch-animation).
- Problems:
  - [loss-aversion] When the profile cannot load, the retry view has only Try again (`LaunchScreen.tsx:53-58`); someone who is offline or stuck on a bad account has no way to sign out.
  - [feedback] On the failure path the cover is released but there is no hint it was a load problem versus a crash (shares `ErrorState` default copy, `strings/en.ts:91-95`).
  - [a11y-VoiceOver] Label "OnlySwap is starting" is correct (`LaunchScreen.tsx:66`); keep.
- Proposed layout: unchanged on the happy path (Mark centered, nothing else). Failure view: `ErrorState` as now, plus a text-only "Sign out" under it.
- Components: `ErrorState`, `Button` (variant `text`).
- Motion/haptic: cover animation unchanged (DEC 135); reduce-motion fallback is the 150 ms fade (`LaunchIntro.tsx:107-118`); confirm the fade still plays under the OS Reduce Motion setting because that `withTiming` sets no `reduceMotion` option (`:109-117`). Haptic: none.
- Copy changes: new key `launch.signOut` "Sign out" (es.ts needs the same key); other copy unchanged.
- Logic needed?: no (calls the existing `authApi.signOut('local')`, used the same way at `ReverifyScreen.tsx:86-92`).
- Conflicts: none.

#### Welcome (A02)
- Current: [Welcome](screens/01-auth-system.md#01-welcome): whole screen in the accent, a tilted drifting wall of listings, brand row, headline and one line, then "Continue with school email" and a text button "I already have an account" (`WelcomeScreen.tsx:124-152`).
- Problems:
  - [P5, trust] The first screen shows no sign of verification beyond the line "Only verified students" (`strings/en.ts:498`); the wall carries invented prices and notes (`strings/en.ts:503-512`) that read as real listings.
  - [disclosure] None: two actions, one primary. Layout is already one headline and one line of help (P4).
  - [DynamicType] Headline and body have no line cap and sit at the bottom over a 56% accent fade (`WelcomeScreen.tsx:121,309-312`); at the largest sizes they grow upward into the wall, readable because the fade is opaque there.
  - [a11y-contrast] Near-black text on the accent fill is by design (`onAccent`, `DESIGN_SYSTEM.md` color table); no change.
- Proposed layout: keep DEC 89 as is. Brand row top, wall behind, headline and one line, docked `onAccent` primary in the thumb zone, `textOnAccent` secondary under it. Only change: nothing structural.
- Components: `Button` (`onAccent`, `textOnAccent`), `Mark`, `Text`.
- Motion/haptic: wall drift stays; reduce motion = still wall (`WelcomeScreen.tsx:175-180`). Haptic: none.
- Copy changes: none.
- Logic needed?: no.
- Conflicts: none. (Note: `DESIGN_SYSTEM.md:205` calls A02 "static"; doc drift only, DEC 89 governs.)

#### School email (A03, sign-up and login)
- Current: [School email](screens/01-auth-system.md#01-email): large title, one body line, an `Input`, a green-check school line, then conditional cards and a legal line, with "Send code" docked (`EmailScreen.tsx:146-272`).
- Problems:
  - [Hick, disclosure] An unknown school shows two cards at once (waitlist card and "Graduated, or work at the school?" card) with four text blocks, plus the legal line (`EmailScreen.tsx:207-233,269-271`). A personal email shows the field error and the alumni card together (`:134-137,226-233`).
  - [feedback, P7] Login mode with no account: the card's "Create an account" is a mid-scroll button while the docked button still says "Send code" and resends (`:246-261` vs `:152-158`). Two competing actions.
  - [P7] Unknown school: the real next step "Join the waitlist" is a small secondary button inside a card (`:214-222`), while the docked button is a disabled "Send code".
  - [P4] Legal line repeats "Students 13 and older only" (`strings/en.ts:540`), already covered by the age step and the rules checkbox (`strings/en.ts:645`).
  - [a11y-VoiceOver] School line is announced as text with the check icon (`EmailScreen.tsx:183`); fine.
- Proposed layout (top to bottom): nav with back and "Step 1 of 4" (sign-up only; none in login mode); large title; one line of help; email `Input`; the school line or one field-level message; for an unknown school one hairline card with title, one line and the waitlist button; for login with no account one plain text line (no card). Legal line as the last small text. Docked primary changes with the state: "Send code" normally, "Join the waitlist" when the school is unknown, "Create an account" when login found no account. The alumni card disappears; its one sentence becomes the card's second line.
- Components: `AuthStep`, `Input`, `Button`, `Icon` (check), `Toast`.
- Motion/haptic: tap only. Haptic: none (OTP and errors are the only shakes).
- Copy changes:
  - `signIn.personal` (en.ts:528) "That's a personal email. Use the one your school gave you, ending in .edu." -> "That's a personal email. Use your school email, ending in .edu."
  - `signIn.alumniTitle` (en.ts:530) removed; `signIn.alumniBody` (en.ts:531) -> "Current students only. Alumni and staff emails can't join."
  - `signIn.unknownBody` (en.ts:533) "Join the waitlist and we'll email you when your school opens." -> "Join the waitlist and we'll email you when it opens."
  - `signIn.legal` (en.ts:540) -> "By continuing you agree to the Terms and Privacy Policy."
  - `signIn.noAccountTitle` (en.ts:537) kept verbatim because DEC 140 quotes it.
  - es.ts needs the same keys updated or removed.
- Logic needed?: no (the three docked actions are existing mutations: `send`, `waitlist`, `createAccount`, `EmailScreen.tsx:64,98,112`).
- Conflicts: none (DEC 140 flow unchanged; only the button placement moves).

#### Verify code (A04)
- Current: [Verify code](screens/01-auth-system.md#01-verify): title, "We sent a code to ...", six cells, a message line, a row with resend timer and "Change email", a spam hint, and a link "Can't get into your school email?" (`VerifyScreen.tsx:156-251`).
- Problems:
  - [feedback] After the sixth digit the cells just disable (`:188`); no visible "checking". The string exists (`strings/en.ts:545` `signIn.verifying`) but is not referenced in the file.
  - [Hick, disclosure] Seven text blocks on a one-field screen; the spam hint (`:236-238`) and the lost-access link (`:240-250`) are always visible although most people receive the code.
  - [P6] `haptic('success')` on a verified code (`:144`) is outside the budget (`DESIGN_SYSTEM.md:97-102`).
  - [Fitts-thumb] The resend and change-email links are mid-screen and only the locked state docks a button (`:167-177`); acceptable because the code auto-submits.
  - [a11y-target] Links use `theme.size.hit` min height (`:265`); fine.
- Proposed layout: nav "Step 2 of 4" (none in login or reverify); large title; one line "We sent a code to email"; six cells; one live message line (shows "Checking the code" while busy, then errors); one row: resend countdown on the left, "Change email" on the right; the spam hint appears only once the resend timer has finished; "Can't get into your school email?" stays as the single small link at the bottom. Docked primary only in the locked state.
- Components: `AuthStep`, `OTPInput`, `Tappable`, `Button`, `Text`.
- Motion/haptic: OTP error shake with the `warning` haptic stays (in budget); reduce motion = no shake (`OTPInput.tsx:66`). Remove the `success` haptic at `VerifyScreen.tsx:144`. Haptic otherwise none.
- Copy changes:
  - `signIn.spamHint` (en.ts:553) "Not there? School email can take a minute. Check spam too." -> "Not there yet? Check spam, or wait a minute."
  - Use existing `signIn.verifying` (en.ts:545) "Checking the code" in the message slot while busy.
  - es.ts needs the same keys updated.
- Logic needed?: no (timer `resendIn` already computed, `VerifyScreen.tsx:83`).
- Conflicts: none (removes a haptic that contradicts `DESIGN_SYSTEM.md:97-102`).

#### Age check (A05) and Not eligible (A8)
- Current: [Age check](screens/01-auth-system.md#01-age): title, one line, a "Birthday" field card with the iOS wheel open below it, an error line, a privacy line, "Continue" docked (`AgeScreen.tsx:237-321`). [Not eligible](screens/01-auth-system.md#01-age-blocked): centered lock tile, heading, body, a tip card, docked Close (`:147-178`).
- Problems:
  - [P4] Two lines of help on the form: `age.body` and `age.privacy` (`:318-320`); the privacy line names the Privacy Policy but is not a link.
  - [trust, step count] When the OS answers, the screen is a spinner with no step bar (`:211-222`) and the counter jumps from 2 to 4 (see area note).
  - [loss-aversion] The OS-required screen's Close goes to Welcome while the session and account stay (`:195-199`); next launch lands back on Age.
  - [P4, HIG] Not eligible is a centered stack plus a tip card (`:153-166`, styles `:343-355`), against `DESIGN_SYSTEM.md:158` and DEC 90 (no tip boxes).
  - [DynamicType] Not eligible has no `ScrollView` (`:344`), so large text can clip.
- Proposed layout: Form: nav (no back) with the bar held at step 2 and no label; large title; one line "We ask everyone. It's never shown on your profile."; field card; wheel; docked "Continue". Drop the privacy line. OS-required: title, one body line, docked "Share age range"; "Close" becomes a text button that signs out first, as the Re-verify "Log out" does. Not eligible: left-aligned large title and one line in a scrolling column, docked secondary "Close"; the tip card is removed.
- Components: `AuthStep`, `Tappable`, `DateTimePicker`, `Button`; spinner (`ActivityIndicator`) for checking.
- Motion/haptic: push transition only; picker native. Haptic: none.
- Copy changes:
  - `age.privacy` (en.ts:565) removed.
  - `age.blockedCardTitle` and `age.blockedCardBody` (en.ts:572-573) removed.
  - `age.osRequiredBody` (en.ts:576-577) -> "Where you live, the law asks Apple to share your age range with apps. We learn only 13 to 17 or 18 and older, never your birthday."
  - `age.step`, `profileSetup.step`, `rules.step` (en.ts:568,584,616) are unused and can go.
  - es.ts needs the same keys updated or removed.
- Logic needed?: no (the sign-out is the existing `authApi.signOut('local')`, used at `AgeScreen.tsx:90`).
- Conflicts: none (DEC 136 age rules untouched).

#### Profile setup (A06)
- Current: [Profile setup](screens/01-auth-system.md#01-profile-setup): title, one line, a photo row with three text blocks, first and last name inputs, a "Shown as" line, a "Year" label with five chips, "Continue" docked (`ProfileSetupScreen.tsx:126-291`).
- Problems:
  - [Hick, disclosure] Optional things (photo, year) come before and look as heavy as the required name; the photo row carries label, hint, progress, status and remove (`:143-207`).
  - [P4] Three lines of help: body, `photoHint` (`:172-174`), `lastNameHint` or "Shown as" (`:270-272`).
  - [feedback] Name errors appear only after Continue (`:96-101`).
  - [a11y-target] Remove-photo link keeps a hit-size row (`:324`); fine.
- Proposed layout: nav "Step 3 of 4"; large title; one line; first name and last name inputs (required) with the "Shown as" line directly under them; then a quiet "Optional" group: avatar button with "Add a photo" and the year chips; docked "Continue". The photo hint becomes only the accessibility hint it already is (`:147`).
- Components: `AuthStep`, `Input`, `ChipGroup`, `ProgressBar`, `Tappable`, `Button`, `Icon`.
- Motion/haptic: tap only; upload progress bar as now. Haptic: none.
- Copy changes:
  - new `profileSetup.optional` "Optional" (es.ts needs the same key).
  - `profileSetup.photoHint` (en.ts:589) no longer shown visibly.
  - `profileSetup.uploadFailed` (en.ts:593) -> "Photo didn't upload. Try again, or continue without it."
- Logic needed?: no.
- Conflicts: none.

#### Community rules (A07)
- Current: [Community rules](screens/01-auth-system.md#01-rules): title "Four rules", one line, four numbered rules with title and body, a checkbox with a 14-word label, three underlined links, "Agree and continue" docked (`RulesScreen.tsx:105-190`).
- Problems:
  - [P4, Hick] Eight text blocks for the rules plus the label plus three links; rule bodies run two sentences (`strings/en.ts:627,632,642`).
  - [feedback] The docked button is disabled until the box is ticked with no explanation (`RulesScreen.tsx:116`).
  - [P6] `haptic('selection')` on the checkbox (`:163`) is outside the budget.
  - [feedback] The whole screen waits behind a spinner for `get_app_config` although the rules are static text (`:74-85`).
  - [trust] "Break them and your account comes down." (`strings/en.ts:618`) is a threat line, not help.
- Proposed layout: nav "Step 4 of 4" (none for the update variant); large title; one line; the four rules shown immediately (title plus one short line each) with hairline dividers; checkbox row with the existing label (age wording is DEC 136); the three links in one row; docked "Agree and continue" enabled once the box is ticked and config has arrived (the button shows the loading state until then instead of a full-screen spinner).
- Components: `AuthStep`, `Tappable` (checkbox), `Button`, `ErrorState` (only if config fails), `Text`.
- Motion/haptic: tap; checkbox fills in place. Remove the `selection` haptic at `RulesScreen.tsx:163`. Haptic: none.
- Copy changes:
  - `rules.body` (en.ts:618) -> "Everyone here agrees to these."
  - `rules.items[0].body` (en.ts:627) -> "Use a Meetup spot or a busy place on campus."
  - `rules.items[1].body` (en.ts:632) -> "Cash, Venmo, whatever you agree on. OnlySwap never touches the money."
  - `rules.items[3].body` (en.ts:642) -> "Anything creepy gets reported and reviewed by a person."
  - `rules.agreeLabel` (en.ts:645) unchanged (DEC 136).
  - es.ts needs the same keys updated.
- Logic needed?: no (button waits on the already fetched `config.data`, `RulesScreen.tsx:51`).
- Conflicts: none.

#### Notifications primer (A08)
- Current: [Notifications primer](screens/01-auth-system.md#01-allow-notifications): three example notifications, a title, a two-sentence body, "Turn on notifications" and text "Not now" docked (`NotificationsScreen.tsx:70-125`).
- Problems:
  - [P4, trust] "Most things sell within a few hours." (`strings/en.ts:134`) is an unsourced number-like claim (DEC 90: no invented numbers).
  - [feedback] The checking state is a blank screen with no indicator (`:53-55`).
  - [Fitts-thumb] Two docked buttons; correct for a permission primer.
- Proposed layout: unchanged order (examples, title, one line, docked primary and text secondary), with left-aligned title and body inside the readable column; example rows stay decorative.
- Components: `Button`, `Mark`, `Text`, `PermissionPrimerView` (denied step).
- Motion/haptic: push only. Haptic: none.
- Copy changes:
  - `primer.notifications.body` (en.ts:134) "Most things sell within a few hours. We only notify you about offers, messages and stuff you saved." -> "Get notified about offers, messages, meetups and other updates on your swaps and campus. You can change which ones anytime." The current "We only notify you about ..." sentence overpromises as well, so it is replaced, not kept: meetup reminders are sent (`supabase/migrations/0025_meetups.sql:420-426`), meetups and comments are on by default and any type without a pref (safety and account notices) is always on (`0233_feed_comments.sql:1033-1040`). The new line is non-exclusive and names no number. Copy only; no notification behavior changes.
  - es.ts: same key, same meaning: "Recibe avisos de ofertas, mensajes, encuentros y otras novedades de tus intercambios y tu campus. Puedes cambiar cuáles recibes cuando quieras."
- Logic needed?: no.
- Conflicts: none.

#### Campus waitlist (A09)
- Current: [Campus waitlist](screens/01-auth-system.md#01-waitlist): grey page, campus name, large title, one line, a ring card with count and position, an invite card with link, Copy pill and a dark Share button, a notify line, a secondary notify button, a Sign out text button (`WaitlistScreen.tsx:116-226`).
- Problems:
  - [P7, Fitts-thumb] The primary action, Share invite link, sits inside a mid-scroll card (`:191-198`); three more buttons follow (`:209-225`).
  - [P4] Overlapping lines: `countsToward` (`:149-151`), `notifyLine` (`:205-207`) and the "Get a notification" button say related things.
  - [P2, HIG] The ring card has a lift shadow (`:331`) against hairline cards (`DESIGN_SYSTEM.md:78`).
  - [loss-aversion] The error view offers only Try again (`:108-109`); no Sign out.
  - Dead copy: `tour`, `next`, `heading` and others are not shown (`strings/en.ts:2190-2234`).
- Proposed layout: grey page; campus name small over a large title; one line; a flat ring card (no shadow) with the count and "N more to go" plus position line; the invite link row (link plus Copy pill) as a plain `bg` row; notify button only when notifications were not yet asked, otherwise nothing; "Sign out" as a text button at the end of the scroll; docked primary "Share invite link" at the bottom.
- Components: `Button` (dock), `Tappable`, `SkeletonList`, `ErrorState`, `Toast`.
- Motion/haptic: ring static (no motion to reduce); Copy answers with the existing `success` toast. Haptic: none.
- Copy changes:
  - `waitlist.countsToward` (en.ts:2204) no longer shown.
  - `waitlist.notifyLine` (en.ts:2205) shown only when the notify button is hidden (notifications already asked).
  - es.ts needs no new keys.
- Logic needed?: no.
- Conflicts: none.

#### Campus open (A10)
- Current: [Campus open](screens/01-auth-system.md#01-unlocked): confetti, success check, large title, a two-sentence body, a founding-seller card, docked "List something" and secondary "Start swiping" (`UnlockedScreen.tsx:68-101`).
- Problems:
  - [P2] Confetti uses accent, ink, green and amber (`:124`).
  - [P4] Body is 19 words and the title already says it (`strings/en.ts:2241-2242`).
  - [peak-end] While the waitlist query loads the body shows the no-campus fallback and then swaps text (`:65-66,80`).
  - [DynamicType] No scroll; content `flex: 1` above the dock (`:159-164`).
- Proposed layout: success check; large title; one line; the founding-seller row (flat `bg2`, mark plus two lines); docked primary and secondary as now; content in a `ScrollView`. Confetti stays (it is in the spec, `DESIGN_SYSTEM.md:213`) in accent and ink only.
- Components: `SuccessCheck`, `Button`, `Mark`, `Text`.
- Motion/haptic: confetti 1.2 s; reduce motion = 150 ms fade, no confetti (`UnlockedScreen.tsx:59-62,73`). Haptic: none (campus opening is not in the budget).
- Copy changes:
  - `unlocked.body` (en.ts:2242) -> "{campus} reached {threshold} students. You're one of the first in."
  - `unlocked.bodyNoCampus` (en.ts:2243-2244) -> "Your school reached its goal. You're one of the first in."
  - es.ts needs the same keys updated.
- Logic needed?: no.
- Conflicts: none.

#### Account status (X04) and appeal sheet (X10a)
- Current: [Account status](screens/01-auth-system.md#01-account-status): `title`-size heading, body, reason, counts, appeal banner and up to four stacked buttons (`AccountScreens.tsx:93-153`); [Appeal sheet](screens/01-auth-system.md#01-appeal-sheet) holds reason chips, a text area and "Send appeal" (`:154-187`).
- Problems:
  - [P7, Hick] Up to four buttons in the scroll: Open my chats, Appeal, Contact support, Sign out (`:127-152`).
  - [HIG] Title uses `title`, not the `display` large title the other full-screen steps use (`:96`).
  - [feedback] The "ok" state shows "Your appeal was accepted." with a button labelled "Open my chats" that goes to Discover (`:62-66`).
  - [loss-aversion] Loading skeleton lacks the safe-area wrapper (`:54`) and the error view has no Sign out (`:55`).
  - [P3] "No-shows: 2" is built in code as `title: n` (`:112,115`).
- Proposed layout: large title; one line of body; reason as plain words; "No-shows" and "Strikes" as plain rows with the number at the end only when non-zero; the appeal result as a one-line banner; docked primary by state (paused: Open my chats; suspended with an appeal: Appeal; otherwise Contact support); below it text buttons for the other options and Sign out. The sheet is unchanged except Send appeal stays docked at the bottom of the sheet.
- Components: `Button`, `Banner`, `Sheet`, `Chip`, `TextArea`, `SkeletonList`, `ErrorState`, `EmptyState`.
- Motion/haptic: sheet spring (reduce motion = fade). Haptic: none.
- Copy changes: ok-state action label -> use `system.goHome` (en.ts:1781) "Go to Discover" instead of `safety.openChats` (en.ts:1460); es.ts needs no change.
- Logic needed?: no.
- Conflicts: none.

#### Re-verify (X03)
- Current: [Re-verify](screens/01-auth-system.md#01-reverify): title "Still at {school}?", a shield tile, a two-row list (email, due date), a footnote about graduating, "Send code" and "Log out" docked (`ReverifyScreen.tsx:94-136`).
- Problems:
  - [loss-aversion, trust] The footnote tells ex-students to "close your account from Settings" (`strings/en.ts:691-692`) but Settings cannot be reached from this screen.
  - [P4] Body is 22 words including "It takes 20 seconds" (`strings/en.ts:686`), an unsourced number.
  - [HIG] A decorative `GlyphTile` sits above the list (`:118`).
- Proposed layout: large title; one line; flat list with email and due date; text link "Close my account" (-> existing `/settings/delete`); docked "Send code" and text "Log out".
- Components: `AuthStep`, `GroupedList`, `ListRow`, `Button`.
- Motion/haptic: push only. Haptic: none.
- Copy changes:
  - `reverify.body` (en.ts:686) -> "Once a year we check you're still a student. We'll email a code."
  - `reverify.graduated` (en.ts:691-692) -> "Graduated? You can close your account."
  - new `reverify.closeAccount` "Close my account" (es.ts needs the same keys).
- Logic needed?: no (route `apps/mobile/app/settings/delete.tsx` exists; verify the route is reachable outside the gate).
- Conflicts: none.

#### Session expired sheet (X02)
- Current: [Session expired](screens/01-auth-system.md#01-session-expired): sheet titled "Quick check it's you", body, six cells, Continue, "Log out instead" (`SessionExpiredSheet.tsx:78-125`).
- Problems:
  - [loss-aversion] Tapping the scrim, dragging down or Android back signs the person out (`:81`).
  - [feedback] No way to resend a code that did not arrive (not handled, no branch found).
  - [P4] "It's been a while." (`strings/en.ts:676`) is filler.
- Proposed layout: same sheet; scrim, drag and back do nothing (the sheet is the only way forward); title, one line, six cells, message line, docked "Continue", then two text buttons: "Resend code" and "Log out instead".
- Components: `Sheet`, `OTPInput`, `Button`, `Text`.
- Motion/haptic: `sheet` spring, reduce motion = fade (`Sheet.tsx:34`); OTP error shake with `warning` haptic (in budget).
- Copy changes: `sessionExpired.body` (en.ts:676) -> "We sent a code to {email}."; reuse `signIn.resend` (en.ts:551) for the resend button; es.ts needs `sessionExpired.body` updated.
- Logic needed?: no (resend is the existing `api.sendCode(email)`, `SessionExpiredSheet.tsx:37`).
- Conflicts: `DESIGN_SYSTEM.md:292` X02 says "modal -> A03 prefilled"; the shipped sheet already deviates and this keeps the shipped behavior.

#### System states: Maintenance (X06), Update (X05), Link error and Not found (X12)
- Current: [Maintenance](screens/01-auth-system.md#01-maintenance), [Update](screens/01-auth-system.md#01-update), [Link error](screens/01-auth-system.md#01-link-error), [Not found](screens/01-auth-system.md#01-not-found): each an `EmptyState` (icon tile, title, body, one button) centered in the screen (`SystemScreens.tsx:21-33,47-59,66-74`).
- Problems:
  - [trust] Update opens the website `/download` page, not the store (`SystemScreens.tsx:30`).
  - [feedback] Maintenance "Try again" replaces to `/` which re-runs the gate on cached config (`:57`; `queryClient.ts:19` stale time 30 s); the screen's query key `['app-config']` (`:40`) differs from `['app_config']` (`useAppGate.ts:42`).
  - [peak-end] "Back around 9:00 AM" has no day (`:41-46`).
  - [Hick] Link error and Not found offer "Go to Discover" to everyone, including signed-out visitors (`:72`).
- Proposed layout: keep one `EmptyState` per screen; icon tile, large-ish title, one line, one button. Maintenance adds the day when the time is not today. No new buttons.
- Components: `EmptyState`.
- Motion/haptic: none. Haptic: none.
- Copy changes:
  - `system.updateBody` (en.ts:1769) -> "This version is too old to keep working. Update to keep swapping."
  - `system.linkErrorBody` (en.ts:1778) -> "It may be old, or the listing is gone."
  - es.ts needs the same keys updated.
- Logic needed?: yes -> deferred: needs logic change (see §5): store URL per platform for the Update button; signed-out variant of Link error.
- Conflicts: none.

#### Tabs layout (shell)
- Current: [Tabs layout](screens/01-auth-system.md#01-tabs-layout): five tabs with an accent Sell button in the middle, Quad hidden (`(tabs)/_layout.tsx:16-23,68-73`).
- Problems:
  - [feedback] The Inbox tab never shows an unread count; no `badge` is passed (`:16-23,33-35`) although the component supports it (`TabBar.tsx:18,93`).
  - [HIG] Bar hides while the keyboard is open (`:31-32`), correct.
- Proposed layout: unchanged. The badge is deferred: needs logic change (see §5).
- Components: `TabBar`.
- Motion/haptic: tabs never slide or buzz (`TabBar.tsx:62`). Haptic: none.
- Copy changes: none.
- Logic needed?: yes -> deferred: needs logic change (see §5): Inbox unread badge.
- Conflicts: none (DEC 130, DEC 90 respected).

### 3.02 Discover, listing, search and saved

Layout and redirect routes (`(tabs)/discover/_layout.tsx`, `(tabs)/discover/campus.tsx`, `search/_layout.tsx`) have no UI of their own and need no redesign: [Discover layout](screens/02-discover-listing-search.md#02-discover-layout), [campus redirect](screens/02-discover-listing-search.md#02-discover-campus), [Search layout](screens/02-discover-listing-search.md#02-search-layout). Everything below respects "no query, route, param or data-shape change"; ideas that need one are in section 5 (Needs logic change). Skeleton line numbers: `SkeletonCard` is Skeleton.tsx:128, `SkeletonList` :142, `SkeletonGrid` :161.

#### Discover (B01)
- Current: [Discover](screens/02-discover-listing-search.md#02-discover). A small campus name over a large "Discover" with filled Search and bell circles (DiscoverHeader.tsx:33-61); a rounded bordered card with the photo on top and, on white below it, a title and price line, a meta line, the seller row with year and "n people saved this", and a trust line (SwipeCard.tsx:77-112); then a white Skip circle with a shadow, an ink "Make an offer" pill and an accent heart circle (SwipeDeck.tsx:184-229). On first launch a bordered tip card with a heading, a sentence and a "Got it" button floats over the bottom of the deck (DiscoverScreen.tsx:244-262).
- Problems:
  - [P4][disclosure] The card carries nine pieces of text under the photo: title, price, condition plus age, seller name, class year, saves line, trust line, and on some cards "Moving out by ..." (SwipeCard.tsx:78-111, logic.ts:119-134). Decision-time facts are trust and price; year and "n people saved this" are filler.
  - [P4][trust] The first-swipe coach is a tip box (heading, body, button) that sits on top of the card and its buttons (DiscoverScreen.tsx:244-262; styles :280-290). DEC 90 and DEC 141 remove tip boxes.
  - [a11y-VoiceOver] The coach also shows in list mode (screen reader or reduce motion) where nothing can be swiped, because it checks `gridWidth` only (DiscoverScreen.tsx:244; copy en.ts:913 tells the user to swipe).
  - [feedback][peak-end] End of deck says "New stuff usually shows up in the evening." (en.ts:919), a claim no API field supports (DEC 90: never invent). After "Check again" with everything already swiped, `total` resets to 0 and the day-one hero "It's early days here" replaces the end message (DiscoverScreen.tsx:109, :228-233, logic.ts:169).
  - [feedback][trust] Being offline is announced: the app-wide `OfflineBanner` is mounted at the root (`apps/mobile/app/_layout.tsx:110`) and appears over every screen, Discover included, after 1.5 s offline (`components/Banner.tsx:38`, :48-73), with the generic copy "You're offline. Some things won't update until you reconnect." (en.ts:77). What is missing is queue-specific feedback: nothing on Discover says that swipes made while offline are kept and sent later (swipes.ts:60-62, :129-149; DESIGN_SYSTEM B01 lists "offline queue"), so the generic "won't update" line reads as if swiping is pointless. A failed Save only toasts (DiscoverScreen.tsx:197) and the card is already gone.
  - [feedback] A failed next-page load leaves a blank stage with disabled buttons and no retry (DiscoverScreen.tsx:113-115, :240-243, SwipeDeck.tsx:157).
  - [loss-aversion] A right swipe removes the card and opens the offer sheet with no undo toast (DiscoverScreen.tsx:201-203); `feed.undoOffer` (en.ts:910) is unused. Returning the card to the deck is deferred: needs logic change (see §5).
  - [HIG][Fitts-thumb] The primary action is correctly at the bottom, but it competes: the accent fill is on Save, the primary offer is ink (SwipeDeck.tsx:493, :502). The Skip circle has a drop shadow (SwipeDeck.tsx:491) against the hairline rule (DESIGN_SYSTEM.md:78).
  - [a11y-VoiceOver] `feed.cardHint` is set on the top card (SwipeDeck.tsx:329) which is never rendered when a screen reader is on (SwipeDeck.tsx:93), so it is dead copy.
  - [DynamicType] Photo shrinks as text grows because the card body is natural height and title plus price are single-line (SwipeCard.tsx:79-83, :126).
  - [Fitts-thumb] Search and bell are top right, out of thumb reach (DiscoverHeader.tsx:45-60); acceptable for a tab root with a large title.
- Proposed layout (top to bottom): keep the large title "Discover" with the small campus name above it, Search and bell at the right. Below it the card fills the stage: the photo takes the large majority of the card with the photo bars on top. White block under the photo with exactly two lines: line one is the title on the left and the price on the right; line two is "Alex R. · Verified student · 95% thumbs up" (seller first name and initial, then the existing trust string). Condition, age, class year, saves and "Moving out by" leave the card (they stay on the listing). While dragging, stamps stay as they are (Offer accent fill, Skip ink fill). Docked under the card in the thumb zone: a quiet Skip circle (hairline, no shadow), a wide "Make an offer" pill as the single accent-filled primary, and a quiet Save heart circle (hairline, accent only when saved on the listing). First launch: no card; one plain `meta` line above the action row, "Swipe right to make an offer, left to skip. Tap a card for details.", left-aligned, gone after the first swipe or tap. List mode: no hint line; each tile keeps its three buttons but the photo leads and the tile shows only the two lines above. Offline: no second banner. The app-wide `OfflineBanner` (`app/_layout.tsx:110`) stays the only offline banner (its compact restyle is under Primitives, Banner and OfflineBanner). Discover adds one queue-specific `meta` line in the hint slot above the action row, "Your swipes will be sent when you're back online.", shown under exactly the banner's rule (`isOffline` plus `OFFLINE_SHOW_DELAY_MS`, Banner.tsx:30-38) so the line and the banner appear and clear together; while it shows, it replaces the first-launch hint line. Load-more failure with an empty deck: show the same `ErrorState` as a first-page failure.
- Components: `SkeletonCard`, `EmptyState` (with `tile`), `ErrorState`, `Banner`, `Button`, `IconButton`, `Tappable`, `Text`, `Toast` (undo), `Avatar` stays on the card only if the seller line keeps a small avatar (existing `Avatar size S`).
- Motion/haptic: card drag uses motion `swipe` (spring back, 220 ms fly-out, deckMath.ts:18, SwipeDeck.tsx:296-304); stamps fade with drag; the next card scales 0.95 -> 1. Reduce motion: the deck becomes the list (SwipeDeck.tsx:93), which is the fallback; the 150 ms fade applies to the hint and banner. Haptic: keep the single `selection` at the 35% line (SwipeDeck.tsx:286); none on the buttons (the fly-out and toast already answer back), none on the hint or offline line.
- Copy changes: `feed.coachTitle` (en.ts:912) "Swipe to shop" -> remove; `feed.coachBody` (en.ts:913) "Swipe right or tap Make an offer. Left skips. Tap a card to see more." -> "Swipe right to make an offer, left to skip. Tap a card for details."; `feed.coachOk` (en.ts:917) "Got it" -> remove (the hint ends on the first swipe). `feed.endTitle` (en.ts:918) "You've seen everything for now" -> "You're all caught up"; `feed.endBody` (en.ts:919) "New stuff usually shows up in the evening." -> "Check back later for new listings."; `feed.endRefresh` (en.ts:921) "Check again" -> "Refresh". `feed.dayOneTitle` (en.ts:922) "It's early days here" -> "Be one of the first"; `feed.dayOneBody` (en.ts:923) "Only a few things are listed so far. Post yours and be one of the first." -> "Not much is listed yet. Post yours to get things started." New key `feed.offlineQueued` "Your swipes will be sent when you're back online." (es: "Lo que deslizaste se enviará cuando vuelvas a tener conexión."); it does not repeat "You're offline", which the global banner already says. es.ts needs the same keys updated or added (es.ts:898-899 holds the undo pair; the rest follow `feed` order).
- Logic needed?: no for everything above. The day-one false positive and "return the card when the offer sheet is dismissed" are deferred: needs logic change (see §5).
- Conflicts: contradicts the DEC 90 mock screen 4 choice recorded at SwipeDeck.tsx:179-183 (ink offer pill, accent heart): reason, P2 and P7 want the single accent fill on the one primary action, and a neutral Save keeps the screen to one accent. DEC 141 and DEC 90 (no tip boxes) support the coach change. DESIGN_SYSTEM B01 "list mode (X33)" is unchanged.

#### Listing detail (B02)
- Current: [Listing detail](screens/02-discover-listing-search.md#02-listing). A square carousel with four white circles floating on it (back, share, heart, more; ListingScreen.tsx:561-599), then price with a colored status word, title, meta, optional notes, a bordered list holding the seller row (with trust line) and meetup rows, availability, description and More like this (:351-557). The bottom dock is one dark button for a buyer and up to three buttons for the owner (:601-637).
- Problems:
  - [P4][disclosure] Hold is said three times: amber word by the price (:355-359), amber block heading "On hold" (:446-448) and the button text (:277). Away repeats in a disabled button and a note (:310, :370-374); sold repeats as a word and a disabled "Sold" button (:285, :357).
  - [P3] Amber is used for hold, in review and removed (:266), but DEC 90 reserves color for meetup today, free food, the Quad and done/price drop (DECISIONS_LOG.md:60).
  - [P7][Fitts-thumb] The owner dock has three equal-weight buttons (:603-633), two of them secondary, so there is no single primary; at large text sizes three flex buttons in a row have no fallback [DynamicType] (styles :761-775).
  - [Fitts-thumb][P1] Save sits on the photo at the top right (:578-587), the furthest point from the thumb, while the dock only carries Make an offer.
  - [trust][P5] The seller row with the shield trust line is below the title, meta, notes and hold block (:455-489); for a stranger purchase it should sit right under the title. Meetup copy "Meetup spot" and police label are present and good (:500-517).
  - [disclosure] Owner views, saves and offers are three loose labels (:430-442) that do not open the Stats screen; Stats is only reachable from My listings (MeScreens.tsx:546-553). A buyer cannot reach comments at all although comment_count and comments_enabled are on the item (logic.ts:25-27; reachable only from the Feed card, CampusFeedScreen.tsx:181).
  - [feedback] "Price is firm" is shown (:397-401) while the button still says "Make an offer" (:311-319).
  - [a11y-VoiceOver] Description heading "About this item" exists only inside the accessibility label (:542).
  - [loss-aversion] The dock for a removed owner listing still offers Edit and See offers (:603-633) with an Appeal button above; unclear what is available.
  - [peak-end] The loading state is a generic card skeleton, not a photo-shaped one (:170-178). Other-campus uses a `tag` icon while the dev frame uses `building` (ListingScreen.tsx:696 vs stateFrames.tsx:467).
- Proposed layout (top to bottom): carousel with only back at the left and share plus more at the right on the photo (quiet chrome; owners get a more button too). Under the photo: price, then the status as a plain word in `ink2` next to it (On hold, Sold, In review, Removed; no amber). Title (`heading`). One meta line: condition, age, and "Price is firm" when set. Directly below, the seller row (avatar, name, class year, shield trust line, chevron), followed in the same hairline list by the meetup rows (spot name with Meetup spot or the police label, or "You and the seller pick a spot in chat."). For buyers whose item has comments enabled, a `ListRow` "Comments" with the count as its value (from `comment_count`) that opens the existing comments route. Then availability and the description. Then More like this. Dock (buyer): a heart `IconButton` (surface card; accent surface when saved, as today) beside one dark primary button that fills the width, label depends on state: "Make an offer", "Ask for it", "Notify me" (hold, becomes "We'll notify you" and disabled once set), "I have this", "Open link". Sold: no dock, just the word beside the price. Away: the dock keeps only the heart, with no offer button, and one line under the meta says "{name} paused their listings for now. Save it and check back later." Hold: remove the amber block, keep one body line under the meta, "Someone is meeting up for this. It may come back." Owner: the heart is not shown; the dock has two buttons, "Mark sold" (secondary) and "See offers" (dark); "Edit" and "Stats" move into the more sheet (a `Sheet` with two `ListRow`s); a `ListRow` "Stats" with the value "12 views, 3 saves, 2 offers" built from `view_count`, `save_count`, `offer_count` replaces the three loose labels and opens the existing stats route. Gone, blocked and other campus keep `EmptyState` with the same primary "Back to Discover".
- Components: `PhotoCarousel`, `IconButton`, `Button`, `ListRow`/`GroupedList`, `Sheet`, `Banner`, `ListingStrip`/`ListingTile`, `EmptyState`, `ErrorState`, `SkeletonCard`.
- Motion/haptic: heart toggle fills with the accent surface (state change, motion kind tap); sheets use motion `sheet`; reduce motion: 150 ms fade. Haptic: none (save and Notify me are outside the budget, DESIGN_SYSTEM.md:97-102); the filled heart and the button label change are the answer-back.
- Copy changes: `feed.tellMe` (en.ts:945) "Tell me if it comes back" -> "Notify me"; `feed.watching` (en.ts:949) "We'll tell you" -> "We'll notify you"; `feed.sellerAway` (en.ts:947) button label becomes unused once the disabled button is dropped (keep the body `feed.sellerAwayBody`, en.ts:948); `feed.onHold` (en.ts:943) stays as the status word; `feed.sold` (en.ts:950) stays; new key `feed.comments` "Comments" and `feed.statsRow` "Stats" for the two rows; `feed.statViews/statSaves/statOffers` (en.ts:938-940) become one string "{views} views, {saves} saves, {offers} offers". es.ts needs the same keys updated.
- Logic needed?: no. Reading `comment_count`/`comments_enabled` that already ship on the item and routing to existing screens is UI. The "Price is firm" button state, a like button on listings and a count that sums comments are deferred: needs logic change (see §5).
- Conflicts: contradicts DEC 90 mock screen 7 as noted at ListingScreen.tsx:561 ("white circles over the photo: back, share, save, more"): reason, the Save heart moves to the thumb zone (P1, Fitts). DEC 121 is satisfied by finally exposing comments from the listing. DEC 97 (Mark sold) is kept. DEC 99 (Appeal) is kept in the owner view.

#### Listing options sheet and report (B03)
- Current: [Options sheet](screens/02-discover-listing-search.md#02-listing-options). A `Sheet` titled "Options" with "Not interested" and a destructive "Report listing" (ListingScreen.tsx:640-658).
- Problems: [feedback] hiding closes the sheet first and gives no in-sheet progress or result beyond a toast (:241-250); [loss-aversion] "Not interested" is permanent with no undo toast ("We won't show it again", en.ts:965).
- Proposed layout: unchanged two rows; the owner gets a different sheet with Edit and Stats (see Listing detail).
- Components: `Sheet`, `GroupedList`, `ListRow`, `ReportSheet`, `Toast`.
- Motion/haptic: motion `sheet`; reduce motion 150 ms fade; haptic none.
- Copy changes: `feed.notInterestedDone` (en.ts:965) "We won't show it again" -> "Got it. We won't show this again." es.ts needs the same key updated.
- Logic needed?: no. Conflicts: none.

#### Photo viewer (B04)
- Current: [Photo viewer](screens/02-discover-listing-search.md#02-listing-photos). Black full screen, paging photos with pinch and swipe-down, close at top left and "Photo n of m" at top right (PhotoViewerScreen.tsx:44-83).
- Problems: [feedback] nothing is drawn while loading or when the listing is not visible (:39-40), so the user sees a black screen with only a close button; [a11y-target] `feed.closePhotos` (en.ts:970) is not wired; counter can show a start index beyond the count (:34).
- Proposed layout: unchanged. When there are no photos to show, centre a single `onPhoto` line "No photos to show." under the close button, and show an `ActivityIndicator` while the query is pending.
- Components: `NavBar`, `ZoomableImage`, `Text` (onPhoto), spinner (ActivityIndicator).
- Motion/haptic: fade presentation; swipe-down dismiss; reduce motion 150 ms fade (ZoomableImage.tsx:62); haptic none.
- Copy changes: new key `feed.noPhotos` "No photos to show."; wire `feed.closePhotos` (en.ts:970) as the close label. es.ts needs the same.
- Logic needed?: no. Conflicts: none.

#### Listing comments (DEC 121)
- Current: [Comments](screens/02-discover-listing-search.md#02-listing-comments). Title row link to the post, Like with count, Top and Newest chips, grey comment bubbles with Like and Reply under each, and a composer docked above the keyboard with an accent send button (CommentsScreen.tsx:352-483).
- Problems: [P4][disclosure] the header stacks three controls (post link, Like, two chips) before the first comment, and the chips show even with no comments (:363-417); [a11y-target] Like and Reply under a bubble are small `label` text hit areas (CommentRow.tsx:100-125, `metaHit` style); [feedback] sending shows no pending state besides a disabled button (:477).
- Proposed layout: header keeps the post title row; one row below it with Like on the left and a `SegmentedControl` Top | Newest on the right, hidden when there are no comments; the rest unchanged. Composer stays docked with the accent send.
- Components: `NavBar`, `Chip` (or `SegmentedControl`), `EmptyState`, `Banner`, `ActionSheet`, `ConfirmDialog`, `ReportSheet`, `SkeletonList`, `IconButton`.
- Motion/haptic: keyboard-avoiding composer; reduce motion not relevant; haptic none (likes and sends are outside the budget).
- Copy changes: none required. `comments.heldToast` (en.ts:2313) and the rest are plain already.
- Logic needed?: no. Conflicts: none.

#### Listing stats (F04)
- Current: [Stats](screens/02-discover-listing-search.md#02-listing-stats). A 2-column grid of four big-number cells (Views, Saves, Offers, Open offers), a "Best open offer" line, listed and expires dates, and a price-changes list (MeScreens.tsx:653-690).
- Problems: [P4] the number grid is the stat-box pattern DEC 90 removed (DECISIONS_LOG.md:60); [disclosure] reachable only from My listings (MeScreens.tsx:546-553); [feedback] a non-owner deep link shows "Couldn't load this" with a Try again that can never work (server NOT_FOUND, 0030_profile_settings.sql:64-66; client MeScreens.tsx:649).
- Proposed layout: one grouped list. Rows (label left, number right): Views, Saves, Offers, Open offers, Best open offer (only when present), Listed, Expires. Below it a section label "Price changes" in sentence case `ink3` and either "No price changes yet" or one line per change. No colors.
- Components: `Screen`, `GroupedList`, `ListRow`, `SkeletonList`, `ErrorState`.
- Motion/haptic: none; reduce motion not relevant; haptic none.
- Copy changes: none required (`me.statsTitle` etc., en.ts:1645-1655, already fit).
- Logic needed?: no (an owner-only message for non-owners is deferred: needs logic change (see §5)). Conflicts: none (aligns with DEC 90).

#### Search (B06)
- Current: [Search](screens/02-discover-listing-search.md#02-search). Search input with a text Cancel at the top, then Recently viewed tiles, Recent rows with Clear, and "Popular right now" rows; typing shows Suggestions (SearchScreen.tsx:111-204).
- Problems: [trust] "Popular right now" lists whatever `search_suggest('')` returns, including saved searches and categories (SearchScreen.tsx:185-202, search/logic.ts:15-19); [HIG] section headers are styled two ways, `label` ink3 for Suggestions (:130) and `bodyStrong` for Recent and Popular (:167, :187), against DEC 90's 13 pt ink3 sentence-case labels; [feedback] a failed or slow suggest call is invisible (:107).
- Proposed layout: unchanged order. All section headers become the same `label` ink3 style; "Popular right now" becomes "Suggested"; rows stay plain with hairlines, category rows keep their API counts ("{n} listed").
- Components: `Input` (search), `Button` (text), `ListingStrip`, `Tappable`, `IconButton`, `Text`.
- Motion/haptic: keyboard opens on mount; reduce motion not relevant; haptic none.
- Copy changes: `search.trending` (en.ts:983) "Popular right now" -> "Suggested". es.ts needs the same key updated.
- Logic needed?: no. Conflicts: none.

#### Search results (B07, X5)
- Current: [Results](screens/02-discover-listing-search.md#02-search-results). Nav title `Results for "{q}"` with an icon-only bookmark, a small secondary "Filters" button, and a tile grid (ResultsScreen.tsx:150-173, :117-148).
- Problems: [disclosure][a11y-target] Save search is an unlabelled-looking icon in the nav bar (:156-163), far from the thumb; [Fitts-thumb] the Filters button is 36 pt tall (size S) with slop; [feedback] in the empty state the primary action is Save search even when filters are on and are the likely cause (:110-113); next page loading has no indicator (:126-129); [P4] a long query overflows the nav title (:153); DESIGN_SYSTEM B07 promises "Post a Wanted" in no-results but it is not built (DESIGN_SYSTEM.md B07 row).
- Proposed layout: nav title is just the query (or "All listings"); under it one row with the secondary "Filters" button on the left and a text "Save search" button on the right; grid unchanged. No-results: if filters are on, primary "Clear filters" and secondary "Save search"; if none, primary "Save search". Add a footer spinner while the next page loads.
- Components: `NavBar`, `Button` (secondary, text), `ListingTile`, `SkeletonGrid`, `EmptyState`, `ErrorState`, `Toast`.
- Motion/haptic: toast on save; reduce motion 150 ms fade; haptic none (saving a search is outside the budget).
- Copy changes: `search.resultsTitle` (en.ts:989) 'Results for "{q}"' -> '{q}'; `search.searchSaved` (en.ts:994) "Search saved. We'll tell you about new matches." -> "Search saved. You'll get alerts for new matches."; `search.noResultsBody` (en.ts:997) unchanged. es.ts needs the same keys updated.
- Logic needed?: no (result count and "Post a Wanted" are deferred: needs logic change (see §5)). Conflicts: none.

#### Filters sheet (B08)
- Current: [Filters](screens/02-discover-listing-search.md#02-search-filters). Category chips, min and max price inputs, condition chips, two toggles, a four-segment sort control, then Reset and Show results inside the scroll content (FiltersSheet.tsx:67-137).
- Problems: [P7][Fitts-thumb] the primary "Show results" scrolls away with the content (:121-136); [DynamicType] four sort segments with long labels in one row (:115-120); [P4] six groups in one sheet.
- Proposed layout: same groups in the same order; move the Reset and Show results row out of the `ScrollView` so it stays docked at the bottom of the sheet (verify the sheet height handling while building). Sort uses the existing control but with the shorter labels below.
- Components: `Sheet`, `ChipGroup`, `Input`, `Toggle`, `SegmentedControl`, `Button`.
- Motion/haptic: motion `sheet`; reduce motion 150 ms fade; haptic none (chips and toggles are outside the budget).
- Copy changes: `search.sorts.price_asc` (en.ts:1011) "Lowest price" -> "Price: low"; `search.sorts.price_desc` (en.ts:1012) "Highest price" -> "Price: high"; `search.hideSwiped` (en.ts:1006) "Hide things I skipped" unchanged. es.ts needs the same keys updated.
- Logic needed?: no. Conflicts: none.

#### Saved (B09, B18, B19, X38)
- Current: [Saved](screens/02-discover-listing-search.md#02-saved). Back, a large "Saved", an Items | Searches control, and plain hairline rows: thumbnail, title, meta, a status word, price, and an x to remove; search rows have a query, a green "n new", a trash button and an Alerts toggle (SavedScreen.tsx:264-283, :127-192, :217-259).
- Problems: [loss-aversion] removing an item and deleting a search are immediate with no confirm and no undo (:74-82, :95-104); [feedback] failures refetch silently (:80, :91, :102); [P3] "Price dropped" does not say by how much although `price_at_save` is available (SavedScreen.tsx:30-37); [a11y-target] x and trash icon buttons sit at the row edge; [disclosure] the new-count query failure is ignored (:71).
- Proposed layout: unchanged structure. The green status word for a drop reads "Price dropped from $40". Deleting a saved search asks first with the existing confirm dialog. Items rows keep sold at 50% opacity with the plain word "Sold".
- Components: `NavBar`, `SegmentedControl`, `Photo`, `IconButton`, `Toggle`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `SkeletonList`.
- Motion/haptic: row removal is a list removal (motion fade); reduce motion 150 ms fade; haptic none.
- Copy changes: `saved.priceDropped` (en.ts:1027) "Price dropped" -> "Price dropped from {price}" (price from `price_at_save`, formatted by `priceLabel`); new keys `saved.deleteTitle` "Delete this saved search?" and `saved.deleteBody` "You'll stop getting alerts for it." `saved.emptyItemsBody` (en.ts:1031) "Tap the heart on anything you like and it shows up here." stays. es.ts needs the same keys.
- Logic needed?: no for the confirm and the price text (both use data already returned); undo for unsave and delete is deferred: needs logic change (see §5).
- Conflicts: none. Green for price drop is allowed by DEC 90.

### 3.03 Sell flow and campus posts

Scope: Sell steps D01 to D04, scan, the three campus post forms (Food, News, Wanted = requests board), Edit listing and Relist. Principles P1 to P7 as in the brief. Haptic audit for the slice: success at `apps/mobile/src/features/sell/SellPostedScreen.tsx:69` (in budget), warning at `apps/mobile/src/features/sell/SellDetailsScreen.tsx:265` (**out of budget**: the budget ties `warning` to the error shake, DESIGN_SYSTEM.md:97-102, and this file has no shake; see table 2.8), success at `apps/mobile/src/features/sell/SellScanScreen.tsx:73` (out of budget, confirmed). No other haptic call exists in this slice.

#### Sell photos (D01)
- Current: [SCREENS entry](screens/03-sell.md#03-sell-photos). Inline "New listing" bar and a 3-bar stepper, title "Add photos", one body line that becomes "Draft saved · {time}", the photo grid (big cover slot plus add tiles), a status line, a tip line, then three small text links for campus posts, with Next docked (`apps/mobile/src/features/sell/SellPhotosScreen.tsx:210-345`).
- Problems:
  - [disclosure] [Hick] Up to four text lines under the title before the grid ends: body (`SellPhotosScreen.tsx:217`), status (`:303-312`), tip (`:313-316`, en.ts:738 is 104 characters) and the reorder hint appended to it (en.ts:737). P4 asks for one line of help at most.
  - [Hick] [Fitts-thumb] [a11y-target] Three size-S text buttons "Post free food", "Ask for something", "Post news" sit under the grid on the very first step of listing an item (`SellPhotosScreen.tsx:317-344`). They are small, far from the thumb zone, and compete with Next. The Feed composer already offers the same three (DECISIONS_LOG.md:9).
  - [feedback] Next is disabled on an empty draft with no reason shown (`SellPhotosScreen.tsx:222`, `logic.ts:186-187`); `sell.needPhoto` (en.ts:740) exists but no screen uses it.
  - [loss-aversion] "Start over" discards the draft on one tap, no confirm (`SellPhotosScreen.tsx:241-246`); the two buttons are equal-width halves (`:239-251`).
  - [a11y-contrast] [feedback] A failed upload fades the photo to 0.45 opacity and puts red "Retry" text on it (`apps/mobile/src/features/sell/PhotoGrid.tsx:262-270,290`); red meta text over a faded photo is low contrast and relies on color.
  - [a11y-target] The remove X is a 22 pt disc with `hitSlop` 11, which is 44 pt effective (`PhotoGrid.tsx:270-280,333`); acceptable, but it sits on the photo corner and can collide with the drag gesture area.
  - [DynamicType] "Camera" and "Library" labels sit in fixed square tiles (`PhotoGrid.tsx:115-142`); long Spanish or large-text labels have no wrap or shrink rule found.
  - [peak-end] Closing the X returns to Discover with no feedback that the draft was saved (`SellPhotosScreen.tsx:215`). The body already shows "Draft saved" so this is a small gap.
  - Relative time "Draft saved · 12 seconds ago" re-renders every 10 s (`:57-64,97`), a moving label that adds noise; `sell.savedJustNow` "Draft saved" (en.ts:723) is unused.
- Proposed layout: NavBar "New listing" with close, stepper below it, large-style title "Add photos" (existing `Text variant="title"`), one help line only: "Up to 8. The first one is the cover." which becomes "Draft saved" once there is content. Photo grid as today (photo first, P1). Under the grid at most one status line, shown only when something is wrong. No tip line; after two photos the single help line becomes "Hold and drag to reorder." A single quiet row "Post something else" at the end of the scroll, a ListRow with a chevron that opens a Sheet listing Post free food, Ask for something, Post news as ListRows (hidden in Wanted-answer mode as today). Failed tile: photo at full opacity under the existing photo scrim with a refresh icon and the word "Retry" in white, no red text. Dock: Next (accent fill). Tapping Next with an empty, uploading or failed state does not disable it: it shows the matching status line with the budgeted error shake (below).
- Components: `NavBar`, `StepIndicator` (Progress), `Text`, `Photo`, `ProgressBar`, `Button`, `ListRow`, `Sheet`, `ConfirmDialog`, `Banner` only for errors.
- Motion/haptic: sheet opens with the `sheet` motion kind, tile drag settle and status line appear as `fade`; reduce motion = 150 ms fade (as `PhotoGrid.tsx:165-169`). Haptic: when Next is tapped while blocked, the status line gets the error shake and the `warning` haptic fires with it, the same pattern as `OTPInput.tsx:63-75` (translateX -8/8/-6/0, 4 x 50 ms); reduce motion = no shake, the line fades in (150 ms) and the haptic still fires, as OTPInput does. This keeps `warning` tied to the error shake (DESIGN_SYSTEM.md:97-102). If the owner does not want a shake here, there is no haptic (owner decision, UX-09). Nothing else.
- Copy changes:
  - `sell.savedAgo` (en.ts:724) "Draft saved · {time}" -> use `sell.savedJustNow` (en.ts:723) "Draft saved"; the 10 s tick (`SellPhotosScreen.tsx:97`) is only needed by the restore sheet wording.
  - `sell.tip` (en.ts:738) and `sell.reorderHint` (en.ts:737): tip removed from the screen; `sell.reorderHint` "Hold and drag to reorder." becomes the help line after two photos.
  - `sell.fixUploads` (en.ts:742) "Retry or remove the photos that didn't upload." -> "Tap a photo to retry, or remove it."
  - `sell.needPhoto` (en.ts:740) reused as is: "Add at least one photo to keep going."
  - `sell.full` (en.ts:739) "That is 8 photos, the most a listing can have." -> "8 photos is the most."
  - New `sell.postMore` "Post something else" (row label); new `sell.discardTitle` "Discard this draft?", `sell.discardBody` "Your photos and details will be deleted.", `sell.discardConfirm` "Discard draft"; `sell.startOver` stays the button label (en.ts:748).
  - `primer.camera.body` (en.ts:117) -> "OnlySwap uses the camera only when you add photos or scan a book barcode. Nothing is recorded in the background." (shared primer, affects every slice that shows it).
  - es.ts needs the same keys updated.
- Logic needed?: no
- Conflicts: none (DEC 98 "also from Sell" is kept as one row, DECISIONS_LOG.md:52; DEC 141 composer is untouched, DECISIONS_LOG.md:9).

#### Sell details (D02)
- Current: [SCREENS entry](screens/03-sell.md#03-sell-details). No page title; a Sell/Give away segmented control, an error banner at the top of the scroll, then title, example line, scan button, price with a price-hint block, condition segments, category chips, offers toggle (or pickup chips and a Free shelf box), description and six "Quick details" chips; Next docked (`apps/mobile/src/features/sell/SellDetailsScreen.tsx:276-455`).
- Problems:
  - [Hick] [disclosure] Eleven groups before Next on a sale (`SellDetailsScreen.tsx:291-453`). Optional helpers (example line `:319-321`, scan button `:323-331`, price hint `:345-347`, quick-detail chips `:438-453`) all show by default.
  - [feedback] [Fitts-thumb] The "N things to fix" banner is at the top of the scroll (`:300-307`) while Next is docked at the bottom; after tapping Next the user may not see it. The meetup screen already puts this kind of message in the dock (`SellMeetupScreen.tsx:153-169`). No scroll-to-first-error branch found.
  - [DynamicType] The 4-segment condition control (`:355-360`) uses a fixed `minHeight` (`apps/mobile/src/components/SegmentedControl.tsx:76`); "Like new" will crowd at large text. `ChipGroup` (used for pickup `:407-416`) wraps.
  - [HIG] [disclosure] Free-shelf box with bold "Goes on the Free shelf" plus a two-sentence explanation (`:418-425`; en.ts:800-801) is a tip box (DEC 90).
  - [HIG] The price hint is a two-line text block plus a button beside the price input (`PriceHintLine` `:62-86`, row styles `:461-468`) which wraps awkwardly at large text.
  - Inconsistent with DEC 131: the scan button shows for every native sale (`:323`) but DEC 131 says when the category is Textbooks (DECISIONS_LOG.md:19).
  - No title: Photos and Meetup have headlines, Details does not (`:276-290`), so the three steps read unevenly.
  - [a11y-contrast] Section labels use `tone="ink3"` (`:352,366,404,439`); fine per DEC 90 for 13 pt semibold but check ink3 on bg against the contrast folder.
- Proposed layout: NavBar + stepper; title "About the item"; the Sell it / Give it away segmented control; Title input whose placeholder carries the category example (the separate example line goes); Price input with one meta line beneath it "Similar items here sold for $x to $y (typical $z)" and a text Button "Use $z" at its end; Condition as single-select chips (wrap); Category chips with the sub-category row; Open to offers toggle with its one-line description; Description text area; a horizontally scrolling single chip row of quick details with no label. Give away: the same but pickup-by chips and one meta line instead of the Free shelf box. Scan a book barcode stays as a small text Button under Title but only until a non-Textbooks category is chosen (aligns with DEC 131 intent). Dock: one red meta line "N things to fix" (error text, polite live region) above the docked Next.
- Components: `SegmentedControl` (mode only), `Input`, `TextArea`, `Chip`/`ChipGroup`, `Toggle`, `Button`, `Banner` (checkFailed only), `SkeletonList` (categories), `ErrorState` (inline).
- Motion/haptic: error line and inline errors appear as `fade`; reduce motion = 150 ms fade. Haptic: the current `warning` at `SellDetailsScreen.tsx:265` is out of budget because nothing shakes (table 2.8). Proposed: when Next is tapped with errors, the dock error line shakes with the same pattern as `OTPInput.tsx:63-75` and the `warning` fires with the shake (presentation-only); reduce motion = no shake, the line fades in (150 ms) and the haptic still fires, as OTPInput does. Owner decision (UX-09): if no shake is wanted, remove the haptic instead. Nothing else.
- Copy changes:
  - New `sell.detailsTitle` "About the item".
  - `sell.fixCount` (en.ts:814) "{count} things to fix before you can post" -> "{count} things to fix"; `sell.fixOne` (en.ts:815) "1 thing to fix before you can post" -> "1 thing to fix".
  - `sell.titleExample` (en.ts:768) line removed as visible text; the example string `sell.titleExamples` (en.ts:769-780) becomes the Input placeholder, replacing `sell.titlePlaceholder` "What is it?" (en.ts:755) when a category is chosen.
  - `sell.freeTitle` (en.ts:800) removed; `sell.freeBody` (en.ts:801) -> "You choose who gets it."
  - `sell.startersLabel` (en.ts:805) "Quick details" removed from the screen.
  - `sell.priceHintLead` / `sell.priceHintRange` (en.ts:796-797) replaced on screen by the existing single sentence `sell.priceHint` (en.ts:792).
  - es.ts needs the same keys updated.
- Logic needed?: no
- Conflicts: contradicts DEC 129 placement ("example title under the title field", DECISIONS_LOG.md:21): the example moves into the placeholder to meet P4; the content and per-category mapping are unchanged. DEC 131 is aligned, not contradicted.

#### Sell meetup (D03)
- Current: [SCREENS entry](screens/03-sell.md#03-sell-meetup). Title "Where can you meet?" and body, a list of checkbox-style spot cards with a "Police-designated" tag and a small Directions button each, a "Decide in chat" card, a note input, availability chips, a Preview row and a banned-items checkbox; the dock holds the confirm hint, any post error and "Post listing" (`apps/mobile/src/features/sell/SellMeetupScreen.tsx:140-319`).
- Problems:
  - [feedback] [Fitts-thumb] The banned-items checkbox is the last item in the scroll (`:310-318`); a user taps Post, then gets a red hint in the dock telling them to scroll down and tick it (`:94-97,154-163`; en.ts:852). Two steps for one confirmation.
  - [feedback] [peak-end] FORBIDDEN on post silently replaces the screen with `/sell` and gives no message (`:111-117`); the seller loses their place with no explanation.
  - [a11y-target] The Directions button is size S nested in each spot row (`:228-234`); S relies on a hit slop (`apps/mobile/src/components/Button.tsx:78`). Leaving to Maps mid-flow is also easy to do by accident.
  - [HIG] Spot rows use a bespoke Pressable and a plain filled square (`:197-227,341-349`) while the banned-items row uses the shared `Checkbox` (`:310`); the selected square has no check glyph.
  - [P1] [trust] The preview with the cover photo is at the bottom (`:286-308`) and the thumbnail is 60 pt (`:358`); the seller sees what buyers will see only after the list and two optional fields.
  - [Hick] Two ways to say "elsewhere": the "Decide in chat" row and the "Somewhere else? (optional)" input (`:238-256,265-272`).
- Proposed layout: NavBar + stepper; title "Where can you meet?" and the one body line (it is the trust cue, P5, keep); the Preview as one compact row (photo, title, price) directly under the body; the spot list as shared `Checkbox` rows with the green "Police-designated" Tag, name, one meta line, and a trailing text "Directions" at size M; "Decide in chat" row; note input; availability chips. Dock: the "This isn't on the banned items list" `Checkbox` row, any post error Banner, and "Post listing" (accent fill), which is disabled until the box is ticked.
- Components: `Checkbox` (OptionRow), `Tag`, `Button`, `Input`, `ChipGroup`, `Photo`, `Banner`, `SkeletonList` (spots), `ErrorState` (inline), `Toast`.
- Motion/haptic: row selection is a press state only; the post error Banner fades in; reduce motion = 150 ms fade. Haptic: none on this screen (success fires on Posted).
- Copy changes:
  - `sell.confirmBanned` (en.ts:852) "Tick the box at the bottom to confirm it is allowed." no longer needed (checkbox sits above Post, Post is disabled until ticked).
  - New `sell.reservationExpired` "Your photos need to upload again." shown as an error Toast before the redirect to `/sell`.
  - `sell.directions` (en.ts:832) unchanged; `sell.preview` (en.ts:849) label removed because the row is self-explanatory.
  - es.ts needs the same keys updated.
- Logic needed?: no
- Conflicts: none. The banned-items confirmation is kept (DESIGN_SYSTEM D17 banned list, DESIGN_SYSTEM.md:184).

#### Sell posted (D04)
- Current: [SCREENS entry](screens/03-sell.md#03-sell-posted). Centered column: a 70% width square hero photo with a price pill on the photo, a success check, a centered title and body, a share-card status line, and a dock with "Share listing" and a text "List another" (`apps/mobile/src/features/sell/SellPostedScreen.tsx:146-208`).
- Problems:
  - [HIG] Price pill sits on the photo (`:174-178`), against DEC 90 "price and title sit on white below photos" (DECISIONS_LOG.md:60).
  - [HIG] Everything is centered (`styles.body` `alignItems: 'center'` `:214-219`; `styles.center` `:230`).
  - [peak-end] [Hick] No way to open the listing just posted: exits are Share, List another and close (`:159-165,197-207`). The listing id is known (`listing.id` `:131`).
  - [feedback] "Making the share preview" shows while Share is already tappable (`:187-189,199`), which reads like a blocker; the failure line "The preview image didn't upload. Sharing still works with the link." is 12 words about something the user can't act on (`:191-194`; en.ts:865).
  - [P7] In review, the only action is a text button (`:198-206`).
  - [feedback] If the screen opens without a fresh post it shows a NavBar only, no copy and no action (`:112-119`).
  - [trust] The share card correctly omits the seller name (`ShareCard.tsx:22-26`) and shows campus and condition (`SellPostedScreen.tsx:123-128`); keep.
- Proposed layout: NavBar close; success check, left-aligned title "Your listing is up" and one line of body; below it a summary row on white: 64 pt thumbnail, title, price underneath (price off the photo); tapping the row opens the listing (existing route `/listing/[id]`). Dock: Share listing (accent fill) and a text "List another". In review: title "Your listing is in review", same summary row, dock shows "List another" as the primary fill (Share hidden as today). Share card status: one small meta line under the dock only while preparing or when it failed; hidden when ready. Empty (no fresh post): `EmptyState` with one action back to `/sell`.
- Components: `NavBar`, `SuccessCheck`, `Photo`, `ListRow`, `Button`, `EmptyState`.
- Motion/haptic: `SuccessCheck` (success kind, 400 ms draw, fade under reduce motion `SuccessCheck.tsx:11`). Haptic: success on mount stays (`SellPostedScreen.tsx:69`, budget "listing posted"); nothing else.
- Copy changes:
  - `sell.postedBody` (en.ts:857-858) "It's in your campus feed now. We'll tell you when someone saves it or makes an offer." -> "It's live on your campus. We'll tell you about saves and offers."
  - `sell.cardPreparing` (en.ts:864) "Making the share preview" -> "Preparing the preview".
  - `sell.cardFailed` (en.ts:865) -> "Preview unavailable. The link still works."
  - New `sell.postedEmptyTitle` "Nothing to show here" and `sell.postedEmptyAction` "Start a listing".
  - es.ts needs the same keys updated.
- Logic needed?: no
- Conflicts: none. Aligns with DEC 90 (price below photo) and DEC 133 (List another carries spots and times, `SellPostedScreen.tsx:138-144`, unchanged).

#### Sell scan (D02 variant)
- Current: [SCREENS entry](screens/03-sell.md#03-sell-scan). Camera permission primer, then a full-height camera with an "Scan the barcode" bar and a bottom panel with one hint line, or a warning banner with "Scan again" and "Type it instead" (`apps/mobile/src/features/sell/SellScanScreen.tsx:98-131`).
- Problems:
  - [feedback] [P6] `haptic('success')` on a found book (`SellScanScreen.tsx:73`) is outside the budget (DESIGN_SYSTEM.md:97-102). The success Toast and the automatic return to Details already answer back (`:74-75`).
  - [HIG] No scan target on the camera view (`:101-110`), so the user can't tell where to aim.
  - [feedback] "Looking up the book" is text only, no activity indicator (`:127`).
  - [disclosure] The hint is two sentences (`:127`; en.ts:759).
  - [P7] On a problem the panel shows a warning banner and two stacked buttons (`:112-119`); acceptable, but the happy path has no docked action by design.
- Proposed layout: unchanged frame; a thin hairline rounded-rectangle guide centered on the camera (plain View border, no new component); the bottom panel keeps one line of text; looking-up shows the text with an `ActivityIndicator`; problem state unchanged (warning Banner, primary "Scan again", text "Type it instead").
- Components: `NavBar`, `PermissionPrimer`, `Banner`, `Button`, `Toast`, `ActivityIndicator`.
- Motion/haptic: Toast appears with the `fade` kind; reduce motion = 150 ms fade. Haptic: none (remove `SellScanScreen.tsx:73`).
- Copy changes: `sell.scanBody` (en.ts:759) "Point the camera at the barcode on the back cover. We fill in the title for you." -> "Point the camera at the barcode on the back cover."; es.ts needs the same key updated.
- Logic needed?: no
- Conflicts: none (removes a haptic that DESIGN_SYSTEM.md:97-102 does not allow).

#### Post free food, Post news and Post a Wanted / requests board (C02, DEC 98, C03)
- Current: [Food](screens/03-sell.md#03-post-food), [News](screens/03-sell.md#03-post-news), [Wanted](screens/03-sell.md#03-post-wanted), [confirmation](screens/03-sell.md#03-post-confirmation). Each is a scrolling form under an inline NavBar with a small dark "Post" button at top right; a note box with an icon at the bottom; a "Fix the highlighted fields to post." banner plus a toast on error (`apps/mobile/src/features/campus/PostFoodScreen.tsx:142-279`, `PostNewsScreen.tsx:170-360`, `PostWantedScreen.tsx:146-274`). On success an in-place centered confirmation with "See the Feed" and "Done" (`PostShared.tsx:402-433`).
- Problems:
  - [Fitts-thumb] [P7] The primary action is a size-S button in the top bar, away from the thumb (`PostFoodScreen.tsx:148-159`, `PostNewsScreen.tsx:176-187`, `PostWantedScreen.tsx:152-163`). Sell steps dock theirs (`SellStep.tsx:85-94`).
  - [disclosure] [Hick] Wanted shows eight groups at once: what, budget plus hint, category plus hint, need-by chips, alert toggle, details, photo, note (`PostWantedScreen.tsx:167-261`). News shows eight (`PostNewsScreen.tsx:191-346`).
  - [disclosure] Note boxes with an icon are tip boxes (DEC 90): clock (`PostFoodScreen.tsx:260-265`), info (`PostWantedScreen.tsx:256-261`), users (`PostNewsScreen.tsx:341-346`). The trust facts inside them ("Everyone on your campus sees it with your name", "Others see your first name and budget") are valuable (P5) but sit at the end of the form after the user has filled everything.
  - [feedback] An invalid Post triggers three messages at once: inline errors, a Banner at the bottom of the scroll and a Toast (`PostFoodScreen.tsx:101-106,267-271`; same in News `:120-125,348-352` and Wanted `:103-107,262-266`).
  - [feedback] [peak-end] No success haptic on the confirmation, unlike Sell posted (`SellPostedScreen.tsx:69`); `create_listing` is used for Food and Wanted (`PostFoodScreen.tsx:110`, `PostWantedScreen.tsx:112`).
  - [P1] The optional photo preview is a small thumbnail (`PostShared.tsx:438`, `glyphTile * 1.5`) and the control is labeled "Photo (optional)" (`PostShared.tsx:180-182`).
  - [HIG] Permission handling for the photo here is a direct OS ask with a warning banner (`PostShared.tsx:24-28,224-229`), while Sell step 1 uses a full primer (`SellPhotosScreen.tsx:253-271`).
  - [HIG] News on iOS opens an inline spinner date picker plus a Done button (`PostNewsScreen.tsx:296-317`), which pushes the form down.
  - [feedback] Wanted: if categories fail to load the category block simply disappears (`PostWantedScreen.tsx:144,190`); preference save errors are swallowed (`:115`).
  - [peak-end] The confirmation is centered with two stacked buttons (`PostShared.tsx:427-430,439-447`).
- Proposed layout (all three): NavBar inline with title and close only; fields as today but shorter; Post docked at the bottom using the same sticky dock as `SellStep.tsx:85-94` (accent fill, "Post"), with the single error line in the dock (red meta, polite live region) in place of the Toast and Banner. The note box becomes one meta line under the first field, kept for trust: Wanted "Others see your first name and budget." News "Everyone on your campus sees it with your name." Food "Hides itself when the time runs out." Wanted: visible fields are "What are you looking for?", budget (hint line kept short), photo; category, need-by, alert and details move into a ListRow "More options" that expands in place. News: headline, details, photos, then the event toggle (date, time and place appear only when on, as today); link stays under details. Food: unchanged order. Confirmation: left-aligned, title and one line, primary "See the Feed", text "Done".
- Components: `NavBar`, `Input`, `TextArea`, `Chip`, `Toggle`, `Button`, `ListRow`, `Sheet` (photo source), `SkeletonList`, `ErrorState`, `Banner` (permission off only), `SuccessCheck`.
- Motion/haptic: expanding "More options" uses `fade`; reduce motion = 150 ms fade. Haptic: none proposed. Question for the owner: DESIGN_SYSTEM.md:99 allows success on "listing posted" and Food and Wanted are created with `create_listing`, so a success haptic on their confirmation would be in budget; News is not a listing, so it would not be.
- Copy changes:
  - `campus.wantedNote` (en.ts:2131-2132) -> "Others see your first name and budget."; `campus.newsNote` (en.ts:2110-2111) -> "Everyone on your campus sees it with your name."; `campus.foodNote` (en.ts:2088-2089) -> "The post hides itself when the time runs out."
  - New `campus.moreOptions` "More options".
  - `campus.fixFirst` (en.ts:2153) stays as the dock line "Fix the highlighted fields to post."; the Toast call is dropped.
  - `campus.budgetHint` (en.ts:2120) "Leave it empty if you are flexible." stays; `campus.categoryHint` (en.ts:2122) -> "People who list in this category hear about your post."
  - `campus.photoOptional` (en.ts:2145) "Photo (optional)" -> "Photo".
  - es.ts needs the same keys updated.
- Logic needed?: no
- Conflicts: none. DEC 127 fields (need by, alert me) stay (DECISIONS_LOG.md:23); DEC 98 name visibility stays (DECISIONS_LOG.md:52); DEC 141 composer unchanged (DECISIONS_LOG.md:9).

#### Edit listing (F06)
- Current: [SCREENS entry](screens/03-sell.md#03-edit-listing). Inline "Edit listing" bar, title input, description, price and Open to offers (sale only), error banner, full-width "Save changes", then a text "Delete listing" directly below, with a delete confirm dialog (`apps/mobile/src/features/me/MeScreens.tsx:768-826`).
- Problems:
  - [Fitts-thumb] [P7] "Save changes" is inside the scroll, not docked (`MeScreens.tsx:797-803`).
  - [loss-aversion] [Fitts-thumb] A destructive "Delete listing" sits right under Save (`:804-809`); the confirm exists (`:811-824`) but the proximity invites mis-taps.
  - [feedback] Save is disabled with no reason when the title is under 3 characters (`:800`); price has no inline validation and an empty or non-positive price is silently dropped (`:751-755`, `apps/mobile/src/features/search/logic.ts:89-95`).
  - [feedback] Saving leaves with no toast (`:758-760`) while Relist shows "Relisted" (`:843`).
  - [loss-aversion] Going back with edits discards them silently (`:723`, draft state `:714-719`).
  - [feedback] Good: delete failure is handled. `onConfirm` awaits `api.deleteListing` before closing (`:817-822`); the shared `ConfirmDialog` awaits it, catches the error, shows it inline with `accessibilityRole="alert"` and stays open for a retry (`apps/mobile/src/components/ConfirmDialog.tsx:53-62,72-75`). No change needed.
  - [trust] The doc comment says a price drop tells savers (`:701`) but nothing in the UI says it.
- Proposed layout: NavBar "Edit listing"; Title, Price (sale, with inline errors from the Sell rules), Description, Open to offers toggle; at the end of the scroll a hairline then a red-text "Delete listing" row; dock: "Save changes" (accent fill), disabled only while saving; tapping with an invalid title or price shows the inline error. Back with unsaved edits opens a ConfirmDialog.
- Components: `NavBar`, `Input`, `TextArea`, `Toggle`, `ListRow`, `Button`, `ConfirmDialog`, `Banner`, `Toast`, `SkeletonList`, `ErrorState`.
- Motion/haptic: toast `fade`; dialog uses the `sheet` kind; reduce motion = 150 ms fade. Haptic: none.
- Copy changes:
  - Reuse `sell.errors.titleShort` (en.ts:817) and `sell.errors.priceMissing`/`priceLow`/`priceHigh` (en.ts:821-824) as inline errors.
  - Success Toast uses existing `me.saved_` (en.ts:1608) "Saved".
  - New `me.discardTitle` "Discard changes?", `me.discardBody` "Your edits will be lost.", `me.discardConfirm` "Discard".
  - `me.deleteBody` (en.ts:1664) stays; delete failure keeps the existing inline `ConfirmDialog` error (no new key).
  - es.ts needs the same keys updated.
- Logic needed?: no
- Conflicts: none.

#### Relist (F08)
- Current: [SCREENS entry](screens/03-sell.md#03-relist). Inline "Relist" bar, one body sentence, an optional new-price input, an error banner and a full-width "Relist" button in the scroll (`apps/mobile/src/features/me/MeScreens.tsx:851-866`).
- Problems:
  - [trust] [feedback] The screen shows nothing about which listing is being relisted (no title or photo; the screen runs no listing query, `MeScreens.tsx:830-850`).
  - [P7] [Fitts-thumb] The button is in the content, not docked (`:863`).
  - Copy: "goes back to the top of the deck" (en.ts:1668) uses old vocabulary; the tab is called Discover (en.ts:16).
  - [feedback] An invalid price silently becomes "no new price" (`dollarsToCents(price) ?? null`, `:841`).
- Proposed layout: NavBar "Relist"; one body line; the price Input with inline error for an invalid number; dock: "Relist" (accent fill). Success Toast stays (`:843`).
- Components: `NavBar`, `Input`, `Button`, `Banner`, `Toast`.
- Motion/haptic: toast `fade`; reduce motion = 150 ms fade. Haptic: none.
- Copy changes: `me.relistBody` (en.ts:1668) "Your listing goes back to the top of the deck for 60 days." -> "Your listing goes back to the top of Discover for 60 days."; es.ts needs the same key updated.
- Logic needed?: yes -> deferred: needs logic change (see §5): show the listing (photo, title, price) on this screen.
- Conflicts: none.

### 3.04 Offers, inbox, chat, deal and meetup

Owner words: "bids" = offers; the "sold?" popup = Did it sell? (E07) plus Mark sold from chat (DEC 97). Screens documented in `docs/design/screens/04-offers-inbox-chat-deal-meetup.md`. Offers have expiry data (`expires_at`, 48 h after each send or counter: `apps/mobile/src/features/offers/logic.ts:19`, `supabase/migrations/0022_offers.sql:157,162,292`), so an "expires in" line needs no logic change; a push reminder is deferred: needs logic change (see §5).

#### Inbox (E01)
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-inbox). Large title "Inbox" with the bell, a Buying / Selling segmented control with "{n} need you" badges, then "Needs you" and "Earlier" lists. A row is an item thumb with the other person's initial on its corner, name, time, item title and a plain status line, with an ink dot when it needs me (`apps/mobile/src/features/offers/InboxScreen.tsx:241-267,137-186`).
- Problems:
  - [Hick] Every row carries four text pieces (name, time, title, status) and, for unread, a bold name plus an ink dot plus a darker status (`InboxScreen.tsx:162-184`); three signals for one fact. The dot alone is enough (P3).
  - [loss-aversion] An open offer shows "Offered $40" but not how long the seller has to answer, even though `expires_at` is on every offer (`logic.ts:19`, `InboxScreen.tsx:121,173-178`). Expired offers then appear as a surprise.
  - [a11y-VoiceOver] Good: one label per row joins name, item, status, time and "Unread" (`InboxScreen.tsx:133-141`). Gap: the section headers are `label` ink3 text (`:193-195`), contrast follows `ink3` (checked in slice 08).
  - [disclosure] Closed or blocked chats and muted chats look the same as live ones (`ChatSummary.status`/`muted` unused in the row, `logic.ts:57,64`).
  - [feedback] Empty Buying body is two sentences (`en.ts:1141,1143`, `InboxScreen.tsx:208-221`), violating "one line of help at most" (P4).
  - [DynamicType] Rows truncate to one line each (`:164,173,176`), so at large sizes the status line, the only place the offer amount lives, is cut off.
- Proposed layout: Large title "Inbox" with the bell trailing (unchanged). Directly under it the segmented control (Buying / Selling) with the count badge only when n > 0. Then a plain list with hairline separators: "Needs you" header (only if rows), rows, "Earlier" header, rows. Row: thumb with initial badge (unchanged), first line name left and time right, second line item title, third line status as plain words; for an open offer waiting on me append the time left to the status ("Offered $40. 6 h left"). Unread = ink dot only; drop the bold-name and darker-status treatment so the dot is the single signal. Muted chat: append "Muted" to the time line. No docked action on this tab root; empty states carry the one action.
- Components: `NavBar variant="large"`, `SegmentedControl`, `Photo`, `DealAvatar`, `Tappable`, `SkeletonList`, `EmptyState`, `ErrorState`.
- Motion/haptic: list fade on load per `fade`; pull-to-refresh as now; reduce-motion = 150 ms fade. Haptic: none.
- Copy changes: `offers.emptyBuyingBody` (en.ts:1141) "Offers you make show up here. A chat starts when the seller accepts." -> "Offers you make show up here." `offers.emptySellingBody` (en.ts:1143) "Offers on your listings show up here, with the newest first." -> "Offers on your listings show up here." New key `offers.timeLeft` "{time} left", `offers.muted` "Muted". es.ts needs the same keys.
- Logic needed?: no (uses `offer.expires_at` and `chat.muted`, both already in `get_inbox`: `logic.ts:19,64`). A live per-second countdown is not proposed; the text is computed on render.
- Conflicts: none (DEC 90 Buying/Selling and Needs you kept).

#### Offer (E02)
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-offer). Listing card, big amount, a status sentence, person row, a meta line "Round n of 4 · Expires Thu 3:00 PM", note chips and text, then up to four stacked buttons in the dock (`apps/mobile/src/features/offers/OfferScreen.tsx:106-229`).
- Problems:
  - [Hick][Fitts-thumb] P7 breach: a seller whose turn it is (or a buyer who has been countered) gets Accept, Counter, Decline and Withdraw stacked full width (`OfferScreen.tsx:181-212`, rules `logic.ts:133-139`). Four choices of equal width; Accept and Counter are both filled (primary and `dark`, `:182-195`).
  - [disclosure] The amount appears three times: the big price (`:139-141`), the status sentence "Sam offered $40" (`en.ts:1164`) and the Accept label "Accept $40" (`en.ts:1178`). One is enough on the page plus the Accept button.
  - [loss-aversion] The expiry is an absolute weekday and time (`:155-161`), which forces the reader to do arithmetic; there is no sense of urgency or of what happens when it passes.
  - [trust] The other person is a name and avatar only (`:145-152`); the offer payload has no rating or verification (`logic.ts:32`). A seller deciding to accept sees no "verified .edu" or thumbs summary (P5). Deferred: needs logic change (see §5).
  - [feedback] The decline reason a seller picked is stored (`logic.ts:18`) but never shown to the buyer (`OfferScreen.tsx` has no `decline_reason` reference). The Withdraw confirm calls the API outside `run()` (`:295-299`), but that is fine: `ConfirmDialog` awaits `onConfirm`, shows the error inline and stays open (`ConfirmDialog.tsx:53-62,72-75`).
  - [a11y-contrast] Quick-note chips are rendered `disabled` (`:167`), which reads as unavailable controls although they are plain tags.
  - [DynamicType] The dock grows to four full-width rows at large text and can cover the body (`:180-229`).
- Proposed layout (top to bottom): back; listing row (thumb, title, asking price) as a hairline row; big amount; one visible status sentence without the amount ("Sam offered", "You offered. Waiting for Sam."), while its accessibility label keeps the full sentence with the amount; person row (avatar, name); one meta line "Expires in 6 hours" (round shown only from round 3: "Round 3 of 4. Expires in 6 hours"); quick notes as plain text separated by dots instead of disabled chips; note text. Dock: for an open offer on my turn, a single primary "Accept $40" (accent fill), with "Counter" as a secondary button next to it (two columns) and "Decline" as a text button below; buyer-only "Withdraw offer" is a text button, shown only when I am waiting (E5) or after a seller counter via the same text slot. For E6: one primary "Open chat". E7: one primary "Offer again" for a buyer when the listing is active, otherwise no dock. E8: no dock, one line of plain words. A declined offer shows "Declined" and, when present, the reason as a second line.
- Components: `NavBar`, `Photo`, `Avatar`, `Button` (primary / secondary / text), `Sheet` (counter, decline), `ConfirmDialog` (withdraw), `Banner`, `SkeletonList`, `ErrorState`.
- Motion/haptic: sheets use `sheet` motion; accept keeps the one `success` haptic (`OfferScreen.tsx:95`, in budget); counter, decline, withdraw: none; reduce-motion = 150 ms fade.
- Copy changes: keep every `offers.status.*` string as it is, with the amount: `pending_seller` (en.ts:1164) "{name} offered {amount}", `pending_buyer` (en.ts:1165), `countered_mine` (en.ts:1166), `countered_theirs` (en.ts:1167), `accepted` (en.ts:1168). `offerView().line` (`features/offers/logic.ts:129-151`) feeds the F05 row's `accessibilityLabel` (`ListingOffersScreen.tsx:55`), and that label replaces the row's children for VoiceOver, so dropping the amount there would hide it from screen-reader users (the visible amount at `:67` is not read). Add a separate visual-only set `offers.statusShort.*` for the Offer screen's line (`OfferScreen.tsx:142-143`), which keeps `accessibilityLabel={view.line}` with the full string: en `pending_seller` "{name} offered", `pending_buyer` "You offered. Waiting for {name}.", `countered_mine` "{name} countered", `countered_theirs` "You countered. Waiting for {name}.", `accepted` "Accepted"; es (parity with es.ts:1145-1149) `pending_seller` "{name} ofreció", `pending_buyer` "Ofreciste. Esperando a {name}.", `countered_mine` "{name} contraofertó", `countered_theirs` "Contraofertaste. Esperando a {name}.", `accepted` "Aceptada". The F05 row may show the short line visually (the amount is on the right, `ListingOffersScreen.tsx:67`) but its label stays `v.line`. `offers.expiresIn` (en.ts:1176) "Expires {when}" -> "Expires in {when}" with `when` a relative span such as "6 hours". New `offers.declinedReason` "Declined: {reason}". es.ts needs the same keys.
- Logic needed?: no. The relative span is a display helper over `expires_at`; the short line is a second display string returned next to `line` by `offerView()` (no data change); `decline_reason` is already in the payload.
- Conflicts: none (restores DEC 90 P7; keeps the Accept haptic from DESIGN_SYSTEM:97-102).

#### Make an offer (B05)
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-offer-sheet). Modal with item row, optional bundle card, a big centered editable amount with quick chips and a low-offer warning, a note box, four quick-note chips, a pay-in-person line and a docked "Send offer" (`apps/mobile/src/features/offers/OfferSheetScreen.tsx:184-328`).
- Problems:
  - [Hick] Three chip groups (quick amounts `:265-278`, bundle items `:207-221`, quick notes `:301-312`) plus a text area on one screen; 15 `<Text` nodes.
  - [trust] The seller appears as a plain name in "Asking $X · Name" (`:197`) although `trustLine(item.seller)` (verified label, thumbs percentage or swap count, `features/feed/logic.ts:119-133`) is on the same payload. P5 asks for ratings and verification visible at the moment of decision.
  - [disclosure] The "pay in person" line sits below the note and chips, usually below the fold (`:314-316`), while it is the main trust message. The meetup-spot idea is not mentioned.
  - [Fitts-thumb] Good: Send is docked (`:318-328`). The amount field is above the keyboard fold at the top, away from the thumb, but the number is the hero by design (DEC 90).
  - [DynamicType] The amount is 1.85x the display size with no scaling cap (`:344-351`); long amounts like "$1,250.50" may overflow narrow phones.
  - [a11y-contrast] Low-offer warning in amber meta text (`:279-288`); status is conveyed by words as well, which is good.
  - [feedback] Success is a centered stack (check, title, body) with two buttons (`:131-148`); fine for peak-end but the body carries the 48-hour rule in one sentence (good).
- Proposed layout: close + title; item row with thumb, title and "Asking $X" on one line, then the trust line under the seller name (what `trustLine` returns: the verified label plus the thumbs percentage or swap count); big amount hero (left unchanged: one allowed centered hero); quick-amount chips directly beneath it; low-offer line only when triggered; "Add a note" collapsed into a single-line field with the four quick notes as a horizontally scrolling chip row below it; the pay-in-person line moved directly above the dock, still one line. Bundle card unchanged but shown only when the seller is moving out. Dock: "Send offer" (ink fill, existing).
- Components: `NavBar leading="close"`, `Photo`, `Chip`, `TextArea`, `Banner`, `Button`, `EmptyState`, `SuccessCheck`.
- Motion/haptic: keyboard push as now; success check on sent; `success` haptic on send stays (`OfferSheetScreen.tsx:165`); reduce-motion = no check animation, 150 ms fade.
- Copy changes: `offers.payInPerson` (en.ts:1112) "You pay in person when you meet. No payment in the app." -> "You pay in person at a public Meetup spot. No payment in the app." `offers.notesLabel` (en.ts:1102) "Add a note (optional)" stays. es.ts needs the same key updated.
- Logic needed?: no.
- Conflicts: none.

#### Offers on this listing (F05)
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-listing-offers). Title "Offers", rows with an index number, buyer name, a status line and the amount on the right (`apps/mobile/src/features/offers/ListingOffersScreen.tsx:59-68`).
- Problems:
  - [disclosure] The status line repeats the amount shown on the right ("Sam offered $40" and "$40", `:64,67`).
  - [Hick] The index number (`:60`) means arrival order but has no label; it competes with the name.
  - [feedback] No pull-to-refresh and no time on a row (no `RefreshControl`, no `shortAgo` use), so a seller cannot tell new from old.
  - [a11y-VoiceOver] Label is "{n}. {status line}" without the amount or buyer name beyond the status text (`:55`); the status line includes the name for open offers but not for declined ones ("Declined").
- Proposed layout: back + title "Offers"; list rows: buyer name (bodyStrong) with amount right-aligned, second line status as plain words and the time ("Offered. 2h" / "Declined. Mon"); drop the index number; highest open offer is not marked (no new logic). Pull to refresh. The row's `accessibilityLabel` reads buyer, amount and status in full ("Sam, $40, Sam offered $40" for an open offer; "Sam, $40, Declined" for a closed one), built from the unchanged `offers.status.*` line plus `money(o.amount_cents)`, so VoiceOver keeps the amount.
- Components: `NavBar`, `Tappable`/`ListRow`, `SkeletonList`, `EmptyState`, `ErrorState`.
- Motion/haptic: none; reduce-motion n/a.
- Copy changes: the visible second line uses the new visual-only `offers.statusShort.*` keys above; the label keeps the full `offers.status.*` strings (with amount); `offers.noOffersBody` (en.ts:1196) "Offers show up here in the order they came in." -> "Offers show up here." es.ts needs the same key updated.
- Logic needed?: no (`created_at` and `responded_at` are in the offer: `logic.ts:20-21`).
- Conflicts: none.

#### Mark sold (F07)
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-mark-sold). Modal, title "Who bought it?", one sentence, radio rows for buyers with accepted offers plus "Someone not on OnlySwap", docked "Mark sold" (`apps/mobile/src/features/deals/DealScreens.tsx:174-211`).
- Problems:
  - [loss-aversion] The irreversible effects ("Other chats close", open offers declined, DEC 97 `docs/DECISIONS_LOG.md:53`) are one clause in the intro (`en.ts:1360`) with no confirm step; "Mark sold" closes the screen silently on success (`DealScreens.tsx:166`).
  - [feedback] No toast, no haptic, no visible change for the person who tapped; the only proof is the chat losing its button.
  - [Hick] If the preselected buyer is not in the accepted list the button is enabled with no visible choice (`:143,151-153,205`).
  - [a11y-VoiceOver] Rows are `OptionRow kind="radio"` (good); the heading is in the NavBar title only.
- Proposed layout: close; one-line intro; radio list of buyers (name, with the item thumb row above); "Someone not on OnlySwap" last; docked "Mark sold" (primary). After tap, a confirm `ConfirmDialog` "Mark as sold?" stating "Other chats about this item will close." Success: close and show a success toast "Marked as sold". 
- Components: `NavBar leading="close"`, `OptionRow`, `Button`, `ConfirmDialog`, `Toast` (`useToastStore`), `SkeletonList`, `ErrorState`.
- Motion/haptic: toast per `fade`; haptic: none (not in budget).
- Copy changes: `deal.markSoldBody` (en.ts:1360) "Pick the buyer so you can rate each other. Other chats close." -> "Pick the buyer so you can rate each other." New keys `deal.markSoldConfirmTitle` "Mark as sold?", `deal.markSoldConfirmBody` "Other chats about this item will close.", `deal.markSoldDone` "Marked as sold". es.ts needs the same keys.
- Logic needed?: no.
- Conflicts: DEC 97 allows Mark sold from chat in one tap with a buyer preselected; a confirm adds one step for a destructive action. No contradiction, flagged for the owner.

#### Chat (E03)
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-chat). White header with the other person's name (`ChatScreen.tsx:354`, `name` from `c.other.display_name` at `:149`; "Deleted user" when gone), a more button, a pinned deal bar (thumb, item, "$X in person", green "Accepted") and an action row of up to three small buttons (`:352-398`), then the meetup card, the thread and the composer.
- Problems:
  - [Fitts-thumb][Hick] The header stacks three layers (name bar, deal bar, action buttons) before the first message, and the actions (Plan meetup, Did it sell?, Mark sold) live at the top, out of thumb reach (`:208-266,393-397`). P7 asks for one docked action.
  - [disclosure] "Accepted" in green is shown on every open chat (`:387-391`); it never changes, so it is chrome (P3: color only when it matters).
  - [feedback] Pending messages are only dimmed to 60% (`MessageBubble.tsx:287`); "Sending" is read by screen readers (`:127-133`) but not visible. Failed messages are clear ("Didn't send. Tap to retry.", `:244-251`).
  - [trust] The scam hint and the first-message safety line are good (one plain line, `ChatScreen.tsx:417-429`; amber shield row `MessageBubble.tsx:252-262`); but a new contact's profile signals (verified, thumbs) are nowhere in the chat (`ChatInfo` has none, `features/chat/api.ts:10-22`): deferred: needs logic change (see §5).
  - [a11y-contrast] Photos from new contacts are blurred with "Tap to view" in `onPhoto` text over the blur (`MessageBubble.tsx:146-153`); text bodies and captions always show (`:180-184`), as intended.
  - [a11y-target] Mark sold / Plan meetup use `size="S"` buttons (`:211,225,243`), below the 44 pt target if S is smaller (check `Button` in slice 08).
  - [DynamicType] Bubble width is measured (good, `MessageBubble.tsx:83-87`) but the three-layer header leaves little room for the thread at large text.
  - Confirmed: the chat header shows the other person's name from `display_name` (`ChatScreen.tsx:149,354`), not a handle or anonymous label.
- Proposed layout: slim header: back, name (title), more. One pinned deal row beneath it: thumb, item title, "$X in person"; drop the green "Accepted" label. The thread follows (meetup card stays above it as the one tinted card). Above the composer, a one-line contextual action row with exactly one dark `Button size="M"` chosen by state (Plan meetup when none; Did it sell? when the meetup is done and my outcome is unset) and, for sellers, "Mark sold" as a text button beside it; none when read-only. Composer unchanged (accent send). Pending bubbles show a visible "Sending" meta under them. Read-only states keep the info Banner in place of the composer; add a deleted-account line.
- Components: `NavBar`, `IconButton`, `Photo`, `MessageBubble`, `MeetupCard`, `Button`, `Banner`, `Sheet`, `ReportSheet`, `SkeletonList`, `ErrorState`.
- Motion/haptic: bubbles fade in per `fade`; viewer fade; reduce-motion = 150 ms fade. Haptic: none for send (not in budget).
- Copy changes: new key `chat.deletedBanner` "This account was deleted." (shown when `other_deleted`; today the generic `chat.blocked` copy shows, `ChatScreen.tsx:437-441`); `chat.blocked` (en.ts:1223) "You can't message each other." stays; `chat.accepted` (en.ts:1217) removed from the header (key can stay). `chat.empty` (en.ts:1227) is unused; delete or use it. es.ts needs the same key.
- Logic needed?: no. The queued-message cue reuses the existing `pending` state; offline is already announced by the app-wide `OfflineBanner` (`apps/mobile/app/_layout.tsx:110`).
- Conflicts: none (DEC 90 pinned item row and DEC 97 Mark sold kept; moves the buttons, does not remove them).

#### Chat details (E04)
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-chat-details). Mute toggle, a group (View listing, View profile), a group (Report, Block, Hide chat) (`apps/mobile/src/features/chat/ChatDetailsScreen.tsx:66-117`).
- Problems:
  - [feedback] Mute failure is swallowed (`:58-63`); Hide has no error path (`:110-115`).
  - [loss-aversion] Hide chat has no confirm and sits beside Report in the same group; the toast explains afterwards (`:113`).
  - [Hick] Fine: 6 rows. Block is destructive-styled (`:101`).
  - [trust] No unblock row after a block (`:97`).
- Proposed layout: unchanged order; add the other person's name as the large row header ("Sam") above the groups; keep destructive Block last in its group; Hide chat moves to its own group.
- Components: `NavBar`, `Toggle`, `GroupedList`, `ListRow`, `ReportSheet`, `ConfirmDialog`, `Toast`.
- Motion/haptic: none.
- Copy changes: none beyond reusing `chat.*`.
- Logic needed?: no.
- Conflicts: none.

#### Did it sell? (E07) - the "sold?" popup
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-did-it-sell). Modal with the item title and three buttons stacked at the top: "Yes, all done", "Not yet", "It fell through" (`apps/mobile/src/features/deals/DealScreens.tsx:82-107`). Reached from the chat button after a meetup (`ChatScreen.tsx:219-232`) or a push (`src/lib/push.ts:71`).
- Problems:
  - [Fitts-thumb] P7: the primary is at the top of the body, not docked (`:88-93`; no dock style used on this screen).
  - [feedback] Before the chat loads the title reads "Did you get it?" even for sellers and the item heading is empty (`:74,80,83`). Only "Yes, all done" shows loading (`:90`); the other two can be double-tapped.
  - [loss-aversion] Good: "It fell through" asks for confirmation (`:108-119`).
  - [peak-end] "Yes, all done" lands on Rate with no acknowledgement; no toast or haptic (haptic outside budget).
- Proposed layout: close; item row (thumb unavailable: this screen has only the title) -> keep the title; question in the NavBar title; dock at the bottom: primary "Yes, all done"; a secondary "Not yet" above it; "It fell through" as a text button. Show a skeleton title until the chat query settles so the buyer/seller wording does not flip.
- Components: `NavBar leading="close"`, `Button` (primary, secondary, text), `ConfirmDialog`, `Banner`, `SkeletonList`.
- Motion/haptic: sheet motion; haptic: none (success haptic list does not include deal answers).
- Copy changes: none; `deal.done` (en.ts:1352) "Yes, all done" stays.
- Logic needed?: no.
- Conflicts: none (keeps the DEC 97 "Did it sell? button after a meetup is unchanged").

#### Plan the pickup (E05)
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-plan-meetup). Headings "Meetup spots", "Day", "Time"; a collapsible map; radio spot rows with Police-designated tags and a Directions icon; "Somewhere else"; day and time chips; docked "Suggest this time" (`apps/mobile/src/features/meetups/PlanMeetupScreen.tsx:94-188`).
- Problems:
  - [Hick] Three sections plus a map on one scroll; the time chip list can run long (`:164-176`).
  - [trust] Good for P5: police-designated spots first with a tag and Directions (`:108-130`).
  - [feedback] A failed spots request looks like "no spots" (`:103-107`, no error branch).
  - [a11y-target] Directions is an `IconButton` beside each row (`:124-128`); label includes the spot name (good).
  - [a11y-contrast] Green "Police-designated" tag: color plus words (good).
- Proposed layout: close; title; one section "Where" (spot rows, then "Somewhere else"), one section "When" with day chips above time chips, no map by default (collapsed, toggle stays); docked "Suggest this time".
- Components: `NavBar`, `OptionRow`, `Tag`, `IconButton`, `Chip`, `Input`, `Button`, `SkeletonList`, `Banner`.
- Motion/haptic: map camera 0 ms under reduce motion (`SpotsMap.tsx:91`); haptic: none.
- Copy changes: `meetup.spotsTitle` (en.ts:1273) "Meetup spots" -> "Where"; `meetup.dayTitle` (en.ts:1280) -> "When"; `meetup.timeTitle` (en.ts:1281) heading removed. es.ts needs the same keys.
- Logic needed?: no.
- Conflicts: none.

#### Rate the swap (E08)
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-rate). Submit: heading "How was swapping with {name}?", Good / Not great, tag chips, comment, docked "Send rating". Waiting: check, "Thanks for rating", "Their rating shows up when they rate too, or after 7 days." Revealed: "Your ratings" with only their rating (`apps/mobile/src/features/deals/DealScreens.tsx:289-391`).
- Problems:
  - [trust] The waiting body "Their rating shows up when they rate too, or after 7 days" (`en.ts:1383`) promises the wrong thing: the 7-day rule releases *your* rating to them; their rating exists only if they submit one (`supabase/migrations/0026_deals.sql:175-177`, `apps/mobile/src/features/deals/logic.ts:21-24`).
  - [feedback] After the waiting state, the second visit to the screen is the only place the user sees their own rating; the revealed box shows only theirs even though the title is "Your ratings" and `youSaid` is unused (`:304-313`, `en.ts:1386`).
  - [Hick] Good/Not great plus four tag chips plus a comment on one screen; tags are optional (good).
  - [trust] The 7-day rule is stated plainly (good, `en.ts:1383`).
  - [a11y-VoiceOver] Good/Not great buttons switch variant only (dark vs secondary, `:333,344`); no `selected` state is announced.
  - Heading can read "How was swapping with ?" when the chat query fails (`:260`).
- Proposed layout: close; heading; two equal buttons; optional tags; comment collapsed behind "Add a comment"; docked "Send rating". Waiting: left-aligned title and one line, "Done" docked. Revealed: two rows "You said" and "{name} said" in a hairline list.
- Components: `NavBar`, `Button`, `Chip`, `TextArea`, `SuccessCheck`, `ListRow`, `SkeletonList`, `ErrorState`.
- Motion/haptic: `success` check on the waiting state; haptic: none (rating submit is not in the budget).
- Copy changes: `deal.revealedTitle` (en.ts:1384) "Your ratings" -> "Ratings"; use `deal.youSaid` (en.ts:1386). es.ts needs the same key updated.
- Logic needed?: no (`mine` and `theirs` are both on the rating view: `features/deals/logic.ts:15-19`).
- Conflicts: none (the visibility rule stays server-side).

#### Meetup day (E06) with Meetup card and Handoff
- Current: [SCREENS entry](screens/04-offers-inbox-chat-deal-meetup.md#04-meetup-day). Big time, countdown, a map, a two-row list (place, person), the handoff panel, "Running late" and "Directions", text links for reschedule, no-show and cancel, then a docked "I'm here" with "Call 911" beneath (`apps/mobile/src/features/meetups/MeetupDayScreen.tsx:155-352`).
- Problems:
  - [Hick] Up to seven actions on one screen (late, directions, share, reschedule, no-show, cancel, 911, plus the handoff panel) (`:157-352`).
  - [disclosure] The handoff panel is a bordered card with a label, a big code and a sentence for buyers (`Handoff.tsx:49-66`), or a title, sentence, input and button for sellers (`:92-115`); it sits above the primary "I'm here" and competes with it near the start time.
  - [feedback] Handoff success is a toast only (`Handoff.tsx:80`); cancel and no-show failures are handled (both `onConfirm`s await the API before closing, `MeetupDayScreen.tsx:361-379`, and `ConfirmDialog` shows the error inline, `ConfirmDialog.tsx:53-62,72-75`); completed and no-show meetups show no banner (only `cancelled` does, `:192`).
  - [trust] Good: 911 is always one tap away (`:337-351`); police tag and hours in the place row (`:151-153,201-203`).
  - [a11y-contrast] "Here / Not here yet" status is green or ink3 text (`:220-231`) with explicit labels (good).
  - [DynamicType] The big time is fixed multiples of display (`:393-398`); two-up buttons stack at large text.
- Proposed layout: back, "Meetup", share; day + big time; countdown; place row (name, Police-designated); person row; for a buyer inside the window, the handoff code as the main content block; dock: one primary only ("I'm here" -> then, for the seller, "Finish swap" once the code field has 4 digits), with "Call 911" below. Running late, Directions, Pick another time, They didn't show up and Cancel meetup move into a single "More" `Sheet` list opened from a text button. Completed and no-show get one line of plain words.
- Components: `NavBar`, `SpotsMap`, `DealAvatar`, `Button`, `Sheet`, `ListRow`, `ConfirmDialog`, `Banner`, `Toast`, `Input`.
- Motion/haptic: map camera as now; haptic: none (handoff finish uses a toast; not in the budget).
- Copy changes: new key `meetup.more` "More"; `meetup.handoffBuyer` (en.ts:1264) "Show this to the seller when you have the item. They type it to finish the swap." -> "Show this to the seller when you have the item." (the seller's panel already explains the next step). es.ts needs the same keys.
- Logic needed?: no (time windows already in `meetupActions`, `features/meetups/logic.ts:131-149`).
- Conflicts: none (DEC 132 handoff and the 911 rule kept).

### 3.05 Feed and Quad

Context: DEC 141 (DECISIONS_LOG.md:9) already made the Feed calmer. The code matches it on the header, the single composer row with +, the missing pill buttons and founding panel, the plain page with hairline rows, the warm food tile and the chips (see the Notes bullet of the Feed entry in screens/05-feed-quad.md). The proposals below only finish that job (a few boxes remain) and bring the Quad chip in line with it. No proposal adds a boxed card or the founding panel back.

Haptics in this slice: none today (only the comment at apps/mobile/src/features/quad/components/VoteControl.tsx:31). Every proposal below keeps "none"; Quad posting and voting are outside the budget at DESIGN_SYSTEM.md:97-102.

Lilac in this slice: one use, the pinned note background `lilacBg` (apps/mobile/src/features/quad/QuadFeedScreen.tsx:343). Proposed: replace with `bg2`, since lilac is retired (owner decision 2, approved 2026-10-23); see the Quad feed proposal.

#### Feed (C01)
- Current: [SCREENS entry](screens/05-feed-quad.md#05-feed). Large "Feed" title with filled Search and bell buttons, a chip row, a composer row with avatar, prompt and +, then flat rows split by hairlines (apps/mobile/src/features/campus/CampusFeedScreen.tsx:198-256, :316-335, :406-408). Listings and news are `FeedPost` rows with photo grid, counts line and a four-to-five item action row (apps/mobile/src/features/campus/FeedPost.tsx:183-242); food keeps its peach tile (apps/mobile/src/features/campus/CampusCards.tsx:241-247); Wanted posts are text rows with a small "I have this" button (CampusCards.tsx:157-202).
- Problems:
  - The Day one hero is still a boxed rounded `bg2` panel with heading, body and a filled Button in the list header (CampusFeedScreen.tsx:336-346, style :443-449), the one box left on a flat page. [HIG] [disclosure] [P4]
  - Link row on news is a filled `bg2` box (FeedPost.tsx:356-366) and the Open link action repeats it (:228-235). [P4] [Hick]
  - Action row packs Like, Comment, Make offer / Ask for it, Open link and Share into one line with one-line labels (FeedPost.tsx:203-242, :300-306, :317); the counts line above duplicates Like and Comment (:183-201). At large text sizes "Make offer" truncates. [DynamicType] [Hick] [P4]
  - Two controls start a post from the composer: the text row opens Post news, the + opens a menu (CampusFeedScreen.tsx:318-334). [Hick]
  - The Quad chip is the seventh chip, past the visible edge on a 390 pt phone, and is the only way to reach the Quad (:231-253). The filter "New" (en.ts:1990) also collides with the Quad sort "New" (en.ts:1795). [Hick] [disclosure]
  - Cold link `/feed?kind=quad` shows the All feed first, then jumps to the Quad (:110-111). [feedback]
  - News event line is sky-colored text on the page background (FeedPost.tsx:111-114); DESIGN_SYSTEM.md:52 only guarantees sky text on `skyBg`. [a11y-contrast] [P2]
  - Header icon buttons are filled `card` chips (:204-217), heavier than the large title needs. [P1]
  - "I have this" is a secondary S button (CampusCards.tsx:184-192); confirm its hit area is 44 pt (size S, not checked in this slice). [a11y-target]
  - Rows have no trust line at the moment of decision for sale rows (verified student, rating); `FeedPost` shows only name and time (FeedPost.tsx:89-98). [trust] [P5]
- Proposed layout: Top to bottom: large title "Feed" with Search and bell as plain icon buttons (no fill); chip row with order All, Quad (when enabled), News, Free food, Free stuff, Wanted, This week; composer row unchanged except the avatar and prompt become the only tap target, the + stays at the right and keeps the three-way menu; Day one becomes one plain row with a hairline below: bold line, one line of help, a text Button "List something" (no panel); then rows. Row: header (avatar, name, "ago · place"), headline or price + title, photos, then one quiet line of icon actions: heart with count, comment with count, share icon, and, for others' active listings only, "Make offer" / "Ask for it" as a right-aligned text button. The separate counts line is removed because the counts sit next to the icons. Link on news is one plain line "host" with an arrow, no fill, no second Open link action. Event line becomes ink text with the calendar icon in ink2. Wanted rows stay text rows; "I have this" keeps its secondary S button.
- Components: Chip, IconButton, Avatar, Button (variant text and secondary), Tappable, Photo, ActionSheet, EmptyState, ErrorState, SkeletonList, Text.
- Motion/haptic: tap press states only (motion.ts `tap`); like toggle fills the heart instantly (no scale); chip switch is an instant swap with a 150 ms fade for reduce motion; haptic none.
- Copy changes: `campus.filters.new` (en.ts:1990) "New" -> "This week" (es.ts needs the same key updated); `campus.dayOneTitle` (en.ts:2063) "It's early days here" -> "Be one of the first to list" (es.ts same key); `campus.dayOneBody*` (en.ts:2064-2066) keep, drop the second sentence in each: "{n} listings so far." / "1 listing so far." / "Nothing is listed yet." (es.ts same keys); `campus.dayOneAction` (en.ts:2067) "List something" stays.
- Logic needed?: no. (Moving the Quad chip is a reorder inside CampusFeedScreen.tsx:231-253; the cold-link flash is fixed by rendering SkeletonList while `params.kind === 'quad'` and `useQuadStatus` is pending, using data the screen already has.)
- Conflicts: none. Agrees with DEC 141 (flat rows, no boxes, filter chips stay, free food keeps warm tile) and DEC 121 (likes and comments with real names stay). Moving Quad to the second chip is consistent with DEC 130 (Quad inside Feed via a chip).

#### Quad feed in the Feed (Q02, Q01 gate)
- Current: [SCREENS entry](screens/05-feed-quad.md#05-quad-feed). Under the Feed header and chips, a grey page with a lock + "Anonymous · {campus}" line, three filled icon buttons (activity bell, muted eye, your-Quad user), Hot / New / Top chips, an optional lilac pinned note, white boxed post cards with votes on the left, and a floating ink "Post" pill at the bottom right (apps/mobile/src/features/quad/QuadFeedScreen.tsx:223-296, :308-354; QuadPostCard.tsx:265-273).
- Problems:
  - The Feed is flat white with hairlines; the Quad chip flips to a grey page of boxed white cards, a visible style break inside one screen (QuadFeedScreen.tsx:309, QuadPostCard.tsx:265-273 vs CampusFeedScreen.tsx:412). [HIG] [P1] [P4]
  - Two bells in view: the Feed's notification bell (CampusFeedScreen.tsx:212) and the Quad activity bell (QuadFeedScreen.tsx:241-248), plus two more icon buttons; three same-weight round icons with no labels. [Hick] [disclosure] [a11y-VoiceOver]
  - Post is a floating pill at bottom right, not the one docked primary (QuadFeedScreen.tsx:280-296, :345-354). [P7] [Fitts-thumb]
  - Pinned note is a rounded lilac box with bold title + body in one line, placed above the list (:170-182). [P2] [P4]
  - Top sort empty state has no next action (:186-191). [feedback]
  - Welcome has an intro sentence plus four two-line rules plus a checkbox (QuadWelcome.tsx:52-76; en.ts:1802-1814). [P4] [disclosure]
  - The anonymity line is 12 pt `meta` text in ink3 (QuadFeedScreen.tsx:229-234), the smallest, lowest-contrast text on the screen, while it is the Quad's key promise. [a11y-contrast] [trust]
- Proposed layout: Same Feed title and chips above. Page background stays `bg` (not grey). Under the chips, one line "Anonymous · {campus}" in ink2 with the lock icon, and at its right a single "..." IconButton that opens an ActionSheet with Your Quad, Quad activity, Muted and hidden (the three icon buttons go away). Then Hot / New / Top as chips. Pinned note: a plain row with the word "Pinned" in label type, then title and body, split by a hairline; the row uses `bg2` (lilac retired, section 2.1). Posts: flat rows split by hairlines (the existing `row` variant with votes in one fixed column), no card background, no radius. Bottom: one full-width ink "Post" Button docked above the tab bar with a hairline above it; the list keeps its bottom padding so the last vote arrows stay reachable. Welcome: title, one line of help, four rules each shown as bold title with one short sentence, checkbox, docked "Enter the Quad".
- Components: Chip, IconButton, ActionSheet, Button (variant dark), EmptyState, ErrorState, SkeletonList, Text, Checkbox.
- Motion/haptic: sheet = motion.ts `sheet` for the menu; sort chip change swaps content with a 150 ms fade (also the reduce-motion fallback); votes update instantly; haptic none (VoteControl.tsx:31 states none, and Quad actions are outside the budget).
- Copy changes: `quad.welcomeIntro` (en.ts:1803) delete the line, or "The Quad is your campus's anonymous board. Four things to know first." -> "Four things to know first." (es.ts same key); `quad.ruleAnonBody` (en.ts:1805) shorten to "Students can't see who you are. We keep your account on file and only share it if the law requires it or someone is in danger." (no change to meaning; legal wording must be re-approved before shipping; es.ts same key); `quad.ruleNamesBody` (en.ts:1808) "No names, initials, photos or dorm rooms of students in a negative way. Professors are fair game." -> "No names, photos or dorm rooms of students in a negative way." (es.ts same key); `quad.ruleHarmBody` (en.ts:1811) "These get removed and can end your account, on the Quad and the marketplace." stays; `quad.topEmptyBody` (en.ts:1826) keep; add the sheet is titled with existing `quad.options`-style keys: new key `quad.menuTitle` "Your Quad" (add to en.ts and es.ts); `quad.offAction` (en.ts:1829) "Go to Discover" stays.
- Logic needed?: no.
- Conflicts: Retiring lilac contradicts DESIGN_SYSTEM.md:42 (lilac = the Quad, DEC 90). The owner approved retirement on 2026-10-23, so Phase 3 B0 updates DESIGN_SYSTEM.md:42 and records a DEC entry. No new purple is added. Does not contradict DEC 130 (Quad stays a Feed chip) or DEC 141 (it extends flat rows to the Quad).

#### Quad post thread (Q05)
- Current: [SCREENS entry](screens/05-feed-quad.md#05-quad-thread). Nav bar "Post", full post, replies with letter badges and votes on the right, composer docked at the bottom with the keyboard (apps/mobile/src/features/quad/QuadThreadScreen.tsx:105-176, :180).
- Problems:
  - Alias badges use green, amber and red fills for identity (apps/mobile/src/features/quad/components/ReplyRow.tsx:36-42, :108-117); those colors mean status elsewhere. [P3] [a11y-contrast]
  - Empty replies are a bare line "No replies yet." (QuadThreadScreen.tsx:126-130), no nudge to reply. [feedback]
  - A post that is held, hidden or removed shows no composer and no note (:147-173). [feedback]
  - Reply failure and held states use banners above the composer; success has no confirmation beyond the list updating (:60-66). [feedback]
  - Vote and more buttons on every reply (ReplyRow.tsx:65-70, :75-86) crowd a short reply. [P4]
- Proposed layout: Nav bar "Post"; the post at the top as plain text (no card); a hairline; replies each as: small neutral letter badge (OP keeps the accent fill), "Anon A" and time on one line, reply text, vote column on the right; the more button moves into a long-press on the reply plus the existing accessibility action (as the feed card already does, QuadPostCard.tsx:214-222). Composer stays docked at the bottom with the send button. When replies are off or the post is not live, the note appears in the composer's place.
- Components: NavBar, IconButton, Banner, EmptyState (inline), SkeletonList, Text, Tag.
- Motion/haptic: keyboard-avoiding (existing); sent reply slides in with `fade`; haptic none.
- Copy changes: `quad.noReplies` (en.ts:1880) "No replies yet." -> "No replies yet. Add one below." (es.ts same key); `quad.repliesOffNote` (en.ts:1879) keep.
- Logic needed?: no.
- Conflicts: none. Neutral badges agree with P3 and DESIGN_SYSTEM D7 (letters and colors, no emoji, DESIGN_SYSTEM.md:174) in spirit; D7 permits colors, so this is a tightening, not a contradiction.

#### Quad new post (Q07)
- Current: [SCREENS entry](screens/05-feed-quad.md#05-quad-new). Nav bar with close and a small dark "Post" button at the top right; a four-way segmented control; text area; mode extras; the anonymity line last (apps/mobile/src/features/quad/QuadNewPostScreen.tsx:192-207, :210-345).
- Problems:
  - The only submit is a small button in the top bar, away from the thumb (:195-206). [Fitts-thumb] [P7]
  - The anonymity promise ("Posting anonymously") is the last item of the form, under the keyboard when typing (:340-345). [trust] [disclosure]
  - Closing with text typed discards it with no confirm (`leave()` at :95 has no draft check). [loss-aversion]
  - Pick-a-mode comes before any content; four modes with equal weight. [Hick]
  - Hints are separate grey lines at the bottom per mode (:330-332, :336-338). [P4]
- Proposed layout: Nav bar "New post" with close at left and no trailing button. Directly under it, the anonymity line with lock icon. Then the segmented control, then the text area, then mode extras (hint line sits under its own field). A dark full-width "Post" Button docks above the keyboard (rides it with the existing KeyboardAvoidingView). Closing with any text, option or photo opens a ConfirmDialog "Discard this post?" with "Discard" (destructive) and "Keep writing".
- Components: NavBar, SegmentedControl, TextArea, Input, ChipGroup, Button (variant dark), ConfirmDialog, Banner, PhotoSourceSheet, OutcomeSheet.
- Motion/haptic: sheets use `sheet`; success is the existing toast "Posted to the Quad" (QuadNewPostScreen.tsx:162); haptic none (Quad posting is not in the budget at DESIGN_SYSTEM.md:97-102).
- Copy changes: `quad.anonNote` (en.ts:1892) "Posting anonymously" -> "Posting anonymously. Other students can't see who you are." (es.ts same key); new keys `quad.discardTitle` "Discard this post?", `quad.discardBody` "What you wrote won't be saved.", `quad.discardKeep` "Keep writing" (add to en.ts and es.ts).
- Logic needed?: no. (Draft check is local form state.)
- Conflicts: none.

#### Your Quad (Q12), Quad activity (Q13), Muted and hidden (Q14)
- Current: [Your Quad](screens/05-feed-quad.md#05-quad-mine), [Quad activity](screens/05-feed-quad.md#05-quad-activity), [Muted and hidden](screens/05-feed-quad.md#05-quad-muted). Three plain list screens on `bg` with a nav bar (apps/mobile/src/features/quad/QuadMoreScreens.tsx:168-221, :306-312, :420-463).
- Problems:
  - Status is a colored `Tag` chip on every row (QuadMoreScreens.tsx:90,133); P3 prefers plain words, color only for problems. [P3] [P4]
  - Appeal sent state is held in component state and lost on reopen (:57,101-104), so a person may appeal twice. [feedback] [trust]
  - Your Quad has no pull to refresh (plain ScrollView, :152) and no empty-state action (:153-158). [feedback]
  - Activity filters by group after paging (:241-243, :266), so an empty list can hide more pages. [feedback]
  - Muted: Unhide and Mute give no confirmation; Unhide has no undo (:330-337, :340-357). [feedback] [loss-aversion]
  - "People you hid" rows read `Someone you hid, from: "{excerpt}"` (en.ts:1965) then an S button; fine privacy-wise, but the sentence is long. [P4]
  - Appeal sheet chips plus text area plus button, all visible at once (:186-218). [Hick]
- Proposed layout: Your Quad: nav bar, helper line "Only you can see this." under it, Posts / Replies segmented control, rows with the status as a plain word in ink2 ("Under review", "Removed") colored red only for Removed, then "ago, n points", body; Appeal as a text Button under removed rows; pull to refresh via the existing query refetch. Activity: unchanged rows; the unread dot stays an accent fill (P2). Muted: two sections as now; Unhide shows a toast "Unhidden" and adding a word shows a toast "Muted"; the empty lines stay one short sentence each.
- Components: NavBar, SegmentedControl, ListRow-style rows (existing hairline `item` style, QuadMoreScreens.tsx:475-481), Tag (only for Removed / Under review), Button (text / secondary), Sheet, Chip, Input, EmptyState, ErrorState (inline), SkeletonList, Toast.
- Motion/haptic: sheet = `sheet`; toasts = `fade`; haptic none.
- Copy changes: add `quad.unhidden` "Unhidden" and `quad.muted` "Muted" toast keys (en.ts and es.ts); `quad.mineEmptyPosts` (en.ts:1947) "You haven't posted yet" -> "You haven't posted yet. Your posts show up here." (es.ts same key); `quad.hiddenFrom` (en.ts:1965) `Someone you hid, from: "{excerpt}"` -> `Hidden from: "{excerpt}"` (es.ts same key).
- Logic needed?: no for the layout and toasts; yes for persisted appeal state and server-side group filter -> deferred: needs logic change (see §5).
- Conflicts: none.

#### Quad sheets: Post options, Report, Delete, Outcome (Q7, Q9, Q10)
- Current: [SCREENS entry](screens/05-feed-quad.md#05-quad-sheets). ActionSheet list, ReportSheet, ConfirmDialog, and an OutcomeSheet with a glyph tile, heading, reason, optional hint box, and buttons (apps/mobile/src/features/quad/useQuadActions.tsx:171-208; components/OutcomeSheet.tsx:45-79).
- Problems:
  - The OutcomeSheet hint is a filled `bg2` box with an icon (OutcomeSheet.tsx:55-62, :86-92). [P4]
  - Held sheet carries heading, reason and a second grey note, then one button (:49-67). [P4]
  - Delete confirm and blocked/held outcomes are the moments the person is most invested; copy is clear, but the blocked reasons repeat one long sentence three times (en.ts:1916-1923). [P4]
- Proposed layout: Blocked: heading, one reason sentence, hint as a plain line (no box, no icon), buttons "Edit post" (secondary) and "Make it a listing" (dark) when relevant. Held: heading, reason, a single plain line for where to find it, "Back to the Quad". Drop the glyph tile on both.
- Components: Sheet, Button, ConfirmDialog, ActionSheet, ReportSheet, Text.
- Motion/haptic: `sheet`; haptic none (a blocked post is not the "error shake" in the budget, no shake exists here).
- Copy changes: `quad.blocked.phone`, `.email`, `.room` (en.ts:1916-1925) -> "It has a {thing} in it. Phone numbers, emails and room numbers stay off the Quad so nobody can be tracked down." is already the pattern; shorten to "Phone numbers, emails and room numbers stay off the Quad." (es.ts same keys); `quad.heldNote` (en.ts:1941) "You can find it in Your Quad while it waits." keep.
- Logic needed?: no.
- Conflicts: none.

### 3.06 Profile, settings and user profile

Paths below are repo-relative; `MeScreens.tsx` = `apps/mobile/src/features/me/MeScreens.tsx`, `SettingsScreens.tsx` = `apps/mobile/src/features/me/SettingsScreens.tsx`, `ProfileViewScreen.tsx` = `apps/mobile/src/features/profiles/ProfileViewScreen.tsx`, `AccountScreens.tsx` = `apps/mobile/src/features/safety/AccountScreens.tsx`. Haptics: none of these files call `haptic()` and none pass `hapticOnPress` (Button supports it, `apps/mobile/src/components/Button.tsx:26,53,81`); every proposal below keeps haptic at "none" because the budget (DESIGN_SYSTEM.md:97-102) names only offers, accepts, listing posted, swipe threshold and error shake.

#### Profile tab (F01)
- Current: [SCREENS entry](screens/06-profile-settings-user.md#06-profile-tab). Three filled icon buttons top right and no title (MeScreens.tsx:280-300), then avatar, name, school check, founding tag (:203-228), one inline stats line (:229-245), secondary Edit button (:246-252), Active/Sold segment with counts (:253-263), 3-column photo grid with price tags (:170-199), then two plain rows (:265-273).
- Problems:
  - [HIG] No large title on a tab root: `me.title` "Profile" exists (en.ts:1580) but is never rendered; the layout comment promises a large-title header (apps/mobile/app/(tabs)/profile/_layout.tsx:3). Contradicts DEC 90.
  - [disclosure] [Hick] Header holds three equal icon buttons (bell, saved, gear) plus the Edit button and two link rows: six entry points before the grid (MeScreens.tsx:280-300, :246, :265-273).
  - [disclosure] "View my public profile" and "My listings" are plain rows under the grid and repeat what the grid already shows (:267-271).
  - [trust] The stats line already follows DEC 90 (sold, swaps, thumbs only when rated, join month: :85-106) but the thumbs part is plain ink and the line reads as four numbers run together with three spaces (:234).
  - [disclosure] Active-empty state is a headline, a sentence and a button (a tip box, P4): :152-164.
  - [feedback] Sold-empty is a bare gray line with no action (:165-168), which is fine; the Sold tab count is shown as "Sold 0" (:257-258).
  - [a11y-VoiceOver] Grid cells announce title and price (:179) but not status; the status of a listing (hold, review) is invisible in the grid (:173-197).
  - [DynamicType] Name has no line limit and sits beside the avatar (:210-213).
- Proposed layout: large title "Profile" at the top left with the bell, Saved and gear as quiet icon buttons on the same row (no fills). Below: avatar left, name, then one line "Sophomore at {campus}" with the verified check (existing `yearAt`, :135-139); founding seller as plain text tag. One stats line as now. Edit profile as a text-weight secondary action beside the name block. Active/Sold segment, then the photo grid. Merge "View my public profile" into the avatar block tap and keep "My listings" as the only row under the grid. Empty Active tab: one line plus the existing "List something" button, the title line dropped. No bottom-docked action (tab root; the tab bar is the dock).
- Components: Button (secondary M), IconButton, NotificationBell, Avatar, Tag, SegmentedControl, GroupedList/ListRow, SkeletonList, ErrorState, Photo.
- Motion/haptic: tap pressed state on grid cells (`Tappable`, motion kind tap); segment change fade; reduce-motion fallback 150 ms fade. Haptic: none.
- Copy changes: `me.sellNudgeTitle` (en.ts:1587) "Got something to sell?" -> remove from layout (keep key unused or delete); `me.sellNudgeBody` (en.ts:1588) "It takes a minute. Most things get an offer the same week." -> "It takes a minute." only if kept (the offer-timing claim is dropped: no API field supports it, deferred: needs logic change (see §5)) and only if true (deferred: needs logic change (see §5)); `me.viewProfile` (en.ts:1590) "View my public profile" -> "See how others see you". es.ts needs the same keys updated.
- Logic needed?: no. (Any offer-timing claim would need data: deferred: needs logic change (see §5).)
- Conflicts: none; large title restores DEC 90.

#### Edit profile (F02)
- Current: [SCREENS entry](screens/06-profile-settings-user.md#06-edit-profile). NavBar back, avatar with a "Change photo" button, two inputs, six year chips, bio, error banner, Save at the end of the scroll (MeScreens.tsx:386-441).
- Problems:
  - [Fitts-thumb] [HIG] Save is the last scroll item, not docked (:434-440); with the keyboard open it is far from the thumb. P7.
  - [loss-aversion] Back discards edits with no prompt (`leave`, :317; no dirty check).
  - [feedback] Success is a toast then immediate exit (:376-377), acceptable; the failure path is a banner at the bottom, off screen after scrolling (:433).
  - [disclosure] "Change photo" and the avatar are separate targets (:388-401).
  - [DynamicType] Chips wrap (:416); fine.
- Proposed layout: NavBar with Cancel/back; avatar centered tap target opens the picker (the avatar itself is the control, with "Change photo" as its caption). Fields in order: first name, last initial, year chips, bio. Primary "Save" docked at the bottom in the thumb zone above the keyboard, disabled until the draft differs and first name is set. Error banner pinned above the docked button. Discard confirm via existing ConfirmDialog when the draft is dirty.
- Components: NavBar, Avatar, Button, Input, Chip, TextArea, Banner, ConfirmDialog, Toast.
- Motion/haptic: save button loading state; success toast (motion kind fade); reduce-motion fallback 150 ms fade. Haptic: none (profile save is not in the budget).
- Copy changes: `me.bio` (en.ts:1603) "About you (optional)" -> "About you"; `me.bioPlaceholder` (en.ts:1604) "Example: junior, lives on north campus" -> "Example: Junior, lives on north campus". Add a discard dialog needs new strings (`me.discardTitle`, `me.discardConfirm`): new keys, es.ts needs the same keys.
- Logic needed?: no (dirty check is local state).
- Conflicts: none.

#### My listings (F03, X37)
- Current: [SCREENS entry](screens/06-profile-settings-user.md#06-my-listings). Pause toggle with a long description, a Moving out block with four chips, then the Active/Sold/Other segment and a 2-column tile grid with Stats and Renew/Relist text buttons under every tile (MeScreens.tsx:592-634, :526-585).
- Problems:
  - [Hick] [disclosure] Two settings blocks (about 8 controls, a three-sentence description en.ts:1625-1627) sit above the first listing (:592-622). P1, P4.
  - [a11y-target] Small text buttons (`size="S"`, :548-583) under each tile are dense in a 2-column grid; two actions per tile.
  - [feedback] Tile status is a note under the photo (:538-542) while the state overlay is only sold/hold (:537).
  - [HIG] Not a large title screen (pushed detail, fine).
- Proposed layout: segment first (Active / Sold / Other), then the tile grid. Move "Pause my listings" and "Moving out" into a single `GroupedList` section at the bottom ("Selling options") or behind one row "Away and moving out" that opens a Sheet. Per tile keep one text action: "Renew" or "Relist" when available; "Stats" moves to the listing screen header. Empty states as now.
- Components: SegmentedControl, ListingTile, GroupedList/ListRow, Toggle, Chip, Sheet, Button text, EmptyState, SkeletonList, ErrorState.
- Motion/haptic: tile press (motion tap); sheet for away options (motion kind sheet); reduce-motion fallback 150 ms fade. Haptic: none.
- Copy changes: `me.awayBody` (en.ts:1625-1627) "Your items leave Discover and search, and no one can make new offers. Chats stay open. Expiry dates move by the time you are away." -> "Your items leave Discover and search. Chats stay open." (the expiry shift stays in help); `me.movingOutBody` (en.ts:1630) "Buyers see your date and can make one offer for several of your items." -> "Buyers see your date and can bundle your items." es.ts needs the same keys updated.
- Logic needed?: no. The Stats button move only changes where the link lives; the listing screen route exists (MeScreens.tsx:551-553).
- Conflicts: none; away mode stays per DEC 126 and moving out per DEC 133.

#### Seller profile (B10)
- Current: [SCREENS entry](screens/06-profile-settings-user.md#06-user-profile). Centered avatar, name, meta line, tag row (founding, new seller, away, moving out), swaps and thumbs line, optional amber note, Listings grid, Reviews rows (ProfileViewScreen.tsx:143-217). Report and Block are in a "More" sheet (:219-239). Gone and blocked are empty-state screens (:90-117).
- Problems:
  - [trust] [P5] School is not stated: the meta line is year, join month, reply time (:122-126); the .edu verification is not visible at the moment of decision. `PublicProfile` has no campus field (apps/mobile/src/features/profiles/api.ts:18-34), so this is a data gap, deferred: needs logic change (see §5).
  - [disclosure] Amber "New seller" tag and an amber paragraph box repeat the same fact (:154, :164-168); a tip box (P4).
  - [trust] Ratings summary and review list are text-only: "Thumbs up · name" (:211); 'No ratings yet' shows beside swaps (:34-37). Rating comes before listings in importance for a stranger; listings are first (:170-198).
  - [Fitts-thumb] Report and block hide behind a top-right More button (:133-141), unreachable one-handed; no primary action on the page.
  - [a11y-contrast] [P3] Amber tag and amber box add a second status color (:154, :277-281).
  - [DynamicType] Tag row and stats row do not wrap (`tags`, `stats` styles :275-276).
  - [feedback] Unblock from the blocked state has no failure path: the `EmptyState` action awaits `api.unblock` with no catch (:109-112) and `EmptyState` passes it straight to `Button` (`EmptyState.tsx:76`). Block is fine: its `onConfirm` awaits `api.block` before closing (:260-264) and `ConfirmDialog` shows the error inline (`ConfirmDialog.tsx:53-62,72-75`); report errors show inside `ReportSheet` (`ReportSheet.tsx:179-186,276-280`).
  - Everything centered (:274) against the no centered-everything rule.
- Proposed layout: left-aligned head: avatar, name, then one line "Sophomore · Joined Sep 2026 · Usually replies in 10 min". Directly beneath, one line of real stats "12 swaps   92% thumbs up" (plain words; "No ratings yet" when none) and plain-word status ("New seller", "Away", "Founding seller") joined with dots, no colored tags except the founding seller as an accent fill chip (DEC 141 keeps the badge on profiles). Drop the amber box; keep a single sentence under the status line only for new sellers: "Meet at a Meetup spot and check the item first." Then "Listings" grid, then "Reviews". Report and Block remain in the More sheet; More also shown as a labeled text action in the NavBar. No bottom primary action (read-only page).
- Components: NavBar, IconButton, Avatar, Tag (accent only for founding), ListingTile, Sheet, ListRow, ReportSheet, ConfirmDialog, EmptyState, SkeletonList, ErrorState.
- Motion/haptic: tile press, sheet slide (kind sheet); reduce-motion fallback 150 ms fade. Haptic: none.
- Copy changes: `profileView.newSellerBody` (en.ts:1056-1057) "They haven't finished a swap here yet. Meet at a Meetup spot and check the item first." -> "No finished swaps yet. Meet at a Meetup spot and check the item first."; `profileView.thumbsUp` / `thumbsDown` (en.ts:1064-1065) "Thumbs up" / "Thumbs down" kept; `profileView.goneTitle` (en.ts:1074) "This profile isn't available" -> "Profile not available"; `profileView.goneBody` (en.ts:1075) "The account may be gone or not on your campus." -> "This account may be deleted or not on your campus." (keeps the hedge: `access: 'gone'` does not say why, profiles/api.ts:41); `profileView.blocked` (en.ts:1071) "You blocked {name}" kept. es.ts needs the same keys updated.
- Logic needed?: no for the layout above; "verified at {campus}" -> yes, deferred: needs logic change (see §5): expose campus or verified flag on the public profile.
- Conflicts: none; the founding-seller badge stays (DEC 141). Blocked and deleted states keep their separate copy (the API merges deleted and out-of-campus into `gone`, profiles/api.ts:41).

#### Settings group: Settings (F10), Notifications (F11), Privacy (F12), Blocked (F13), Appearance (F14), School (F15), Delete (F16), Data (F17), About (F18), Language
- Current: [Settings](screens/06-profile-settings-user.md#06-settings), [Notifications](screens/06-profile-settings-user.md#06-settings-notifications), [Privacy](screens/06-profile-settings-user.md#06-settings-privacy), [Blocked](screens/06-profile-settings-user.md#06-settings-blocked), [Appearance](screens/06-profile-settings-user.md#06-settings-appearance), [School](screens/06-profile-settings-user.md#06-settings-school), [Delete](screens/06-profile-settings-user.md#06-settings-delete), [Data](screens/06-profile-settings-user.md#06-settings-data), [About](screens/06-profile-settings-user.md#06-settings-about), [Language](screens/06-profile-settings-user.md#06-settings-language). Settings is a grey page with a display title and four inset card groups with colored icon tiles (SettingsScreens.tsx:69-153); sub-screens are a NavBar with a title plus Toggles, OptionRows, inputs or text.
- Problems:
  - [Hick] [P2] Eight icon tile colors including lilac and amber (SettingsScreens.tsx:81-143) are decoration, not meaning; contradicts the one-accent rule (DESIGN_SYSTEM.md:14). The comment cites DEC 90 mock 17 (:72-73), so this needs an owner call (see Conflicts).
  - [feedback] "Sign out" fires with no confirm and no failure handling (SettingsScreens.tsx:63-67, :146); the sign-out-all dialog exists (:155-165).
  - [disclosure] Download your data appears in Settings and About (SettingsScreens.tsx:138-143, :379).
  - [Fitts-thumb] [P7] Primary buttons are inline at the end of content: Send code (:346-352), Email me my data (:467-473), Delete my account (AccountScreens.tsx:302-309).
  - [disclosure] [P4] Heavy copy: Data screen has intro, 7 bullets and two notes (SettingsScreens.tsx:442-455); Notifications has a description under every toggle and three-sentence tips copy (NotificationSettingsScreen.tsx:111-119, en.ts:1416-1417); Away and Live Activity descriptions run two to three sentences (en.ts:1718-1719).
  - [feedback] Privacy switch failure snaps back silently (SettingsScreens.tsx:180-184), unlike Notifications which toasts (NotificationSettingsScreen.tsx:89); Blocked unblock failure silently refetches (AccountScreens.tsx:238-246); Appearance theme save failure swallowed (SettingsScreens.tsx:220).
  - [trust] School email copy says "a code" then "a link or code" (en.ts:1729, :1732); delete uses a hardcoded English 'DELETE' (AccountScreens.tsx:305) while the prompt string is localised (en.ts:1573).
  - [loss-aversion] Delete body says what goes but not what happens to open offers or meetups (en.ts:1571-1572).
  - [a11y-VoiceOver] App icon tiles have role radio and label (AppearanceExtras.tsx:77-79); fine. Blocked rows are not tappable to preview the profile (AccountScreens.tsx:223).
  - [DynamicType] Notifications quiet-hours buttons wrap (NotificationSettingsScreen.tsx:202); Settings row values are in shared ListRow.
- Proposed layout: Settings: keep large title and inset groups; make icon tiles one neutral ink tile, or remove tiles entirely and rely on text rows with chevrons (final call to owner because of DEC 90 mock 17). Group 4 (Sign out, Sign out of all devices, Delete account) stays, with Sign out confirming through the existing dialog pattern. Sub-screens: NavBar title (pushed screens keep inline titles), content first, primary action docked at the bottom (Send code, Email me my data, Delete my account) on a safe-area strip; destructive Delete uses the destructive Button variant. Notifications: group toggles in one `GroupedList` with the label only and drop the description for self-evident rows (Offers, Messages, Meetups, Saved searches, Price drops); keep descriptions for Selling tips, Show message text, Free food; Quiet hours as a row that opens a Sheet. Data: one sentence, a collapsed "What's in it" row, docked button; offline: the button stays disabled (SettingsScreens.tsx:469) but the inline `Banner kind="offline"` (:465) becomes a plain meta line under the button, because the app-wide `OfflineBanner` (`app/_layout.tsx:110`) already shows at the same time and two offline banners would stack. About: version as a footer line; remove the duplicate Download your data row.
- Components: GroupedList/ListRow (rows with values), Toggle, OptionRow, Button (docked), Sheet, ConfirmDialog, Banner, Toast, EmptyState, SkeletonList, ErrorState, Chip.
- Motion/haptic: toggle and radio press feedback (motion kind tap); sheet for quiet hours (kind sheet); success toast for save-failure recovery; reduce-motion fallback 150 ms fade. Haptic: none (no setting action is in the budget).
- Copy changes: `notificationsScreen.offersBody` (en.ts:1406) etc. -> remove descriptions for Offers, Messages, Meetups, Saved searches and Price drops (keys kept for es.ts parity or deleted in both); `notificationsScreen.tipsBody` (en.ts:1416-1417) "Occasional nudges, like when a listing gets no offers. These are promotional and off unless you turn them on." -> "Occasional nudges, like when a listing gets no offers. Off unless you turn it on."; `settings.dataIntro` (en.ts:1745-1746) "We put a copy of your account data in one file and email you a link to it. The link works for 7 days." -> "We email you a link to a file with your data. The link works for 7 days."; `settings.dataOthers` + `dataOncePerDay` (en.ts:1757-1758) -> keep only "You can ask once a day."; `settings.schoolBody` (en.ts:1728-1729) "Moving to a new school email? We'll send a code to the new address. Your account and listings stay." -> "We'll send a link or code to your new school email. Your account and listings stay."; `settings.liveActivitiesBody` (en.ts:1718-1719) -> "A countdown starts 2 hours before a confirmed meetup. It shows the spot, the time and a first name."; `safety.deleteBody` (en.ts:1571-1572) "This removes your profile, listings and saved items for good. People you chatted with will see a deleted user. This cannot be undone." -> "This deletes your profile, listings and saved items. People you chatted with will see Deleted user. This cannot be undone."; `safety.deleteType` (en.ts:1573) keep. es.ts needs the same keys updated.
- Logic needed?: no, except nothing; all of the above are layout, copy and local state.
- Conflicts: removing icon tiles contradicts the layout recorded under DEC 90 mock screen 17 (SettingsScreens.tsx:72-73); recommend owner confirmation. Dropping the DESIGN_SYSTEM D5 row note (app icon "removed until R2", DESIGN_SYSTEM.md:172) is a docs fix, not a UI change.

### 3.07 Notifications, safety, report, help and legal

Slice file: [screens/07-notifications-safety-help-legal.md](screens/07-notifications-safety-help-legal.md). Help and the two legal-style reading pages are grouped at the end of section 3.07.

#### Notifications (F09)
- Current: [SCREENS entry](screens/07-notifications-safety-help-legal.md#07-notifications). Inline NavBar with only a back arrow and an optional "Mark all read" text button, then a display-size title, then Today / Yesterday / Earlier sections; each row has a photo thumb or initial, a bold title, a regular body, the time, and an ink dot when unread (`apps/mobile/src/features/notifications/NotificationsScreen.tsx:192-214,161-183`).
- Problems:
  - Each row carries three text lines (title, body, time) plus a dot, so a screen of notifications is dense (`NotificationsScreen.tsx:170-176`) [disclosure] [Hick] (P4).
  - Title and body are the same `label` size and differ only by weight (`:170-173`), so the eye has no clear first line [disclosure].
  - "Mark all read" is a small top-right text button (`:197-204`, `size="S"`), the smallest target on the screen and in the far thumb corner [Fitts-thumb] [a11y-target].
  - Empty state has no next action (no `action` passed, `:129-135`); the user lands on a dead end [peak-end] [feedback]. The state-frame version offers a notification-settings secondary action (`apps/mobile/src/features/dev/stateFrames.tsx:521-533`), the live screen does not.
  - Unread is carried only by a small dot (`:178-181`); the dot color is ink and the VoiceOver label adds "Unread." (`:163`), which is good, but sighted low-vision users get a 8-point cue only [a11y-contrast].
  - No `numberOfLines`, so a long body makes a tall row (`:171-173`) [DynamicType].
  - Mark all and row taps give no explicit answer besides the list refreshing after the awaited call (`:112-115`); no pressed feedback beyond Tappable [feedback].
  - Section headers use `ink3` label text (`:154`), the weakest text tone [a11y-contrast].
- Proposed layout: top to bottom: back arrow, large title "Notifications" left-aligned, "Mark all read" as a text action in the title row (right aligned, size M so the target reaches 44 pt); sections Today / Yesterday / Earlier as quiet small headers; rows as ListRow-style: leading photo thumb or initial (kept per DEC 90), one bold line (title) and one `ink2` line (body, 2 lines max with a11y label carrying the full text), time right aligned on the title line; unread = bold title plus the dot, read = regular title, no dot. Hairline separators only. Empty state: EmptyState with one line and one secondary action "Notification settings" (existing route to F11, the target already exists in state frame X35).
- Components: Tappable/ListRow, Photo, DealAvatar, Icon, Button (variant text), SkeletonList, EmptyState, ErrorState, NavBar.
- Motion/haptic: row press = `tap` (existing Tappable pressed state); list refresh after mark-all = 150 ms `fade` (reduce-motion fallback is the same 150 ms fade); haptic: none.
- Copy changes: `notificationsScreen.emptyBody` (en.ts:1399) "Offers, messages and meetup updates show up here." -> "Offers, messages and meetup updates appear here."; no other edits needed. New key `notificationsScreen.emptyAction` "Notification settings" would reuse existing `notificationsScreen.settingsTitle` (en.ts, settings block of the same section), so no new copy; es.ts keeps its existing key.
- Logic needed?: no
- Conflicts: none (keeps DEC 90 photo-or-initial; keeps the 99+ rule of DESIGN_SYSTEM.md:140)

#### Notification bell (F09 entry)
- Current: [SCREENS entry](screens/07-notifications-safety-help-legal.md#07-notification-bell). IconButton with count badge, label "Notifications, N new" (`apps/mobile/src/features/notifications/NotificationBell.tsx:83-91`; `apps/mobile/src/components/IconButton.tsx:53-61`).
- Problems:
  - Count is fetched only on focus and by realtime pings; on query error the badge silently reads 0 (`NotificationBell.tsx:57`) which can hide unread items [trust].
  - Two label patterns exist: caller labels get "{label}, {count} new" (`IconButton.tsx:58-61`) while `notificationsScreen.openUnread` "Notifications, {n} unread" (en.ts:1393) is unused here [a11y-VoiceOver].
- Proposed layout: no visual change. Keep red count badge (0 hidden, 1-99, 99+; DESIGN_SYSTEM.md:140).
- Components: IconButton (badge).
- Motion/haptic: `tap` on press; none for count changes; haptic none.
- Copy changes: none; remove or use `notificationsScreen.openUnread` so one string defines the spoken label (es.ts needs the same decision).
- Logic needed?: no
- Conflicts: none

#### Safety center (F19)
- Current: [SCREENS entry](screens/07-notifications-safety-help-legal.md#07-safety-center). One long scroll: a red-tinted emergency card with a destructive "Call 911" button, five numbered tips, a map plus spot rows with Directions pins, then a banned-items bullet list (`apps/mobile/src/features/safety/SafetyScreens.tsx:92-185`).
- Problems:
  - Whole page is five headed sections and about 25 text lines before banned items [Hick] [disclosure] (P4).
  - Red is used twice in the first block: tinted `redBg` card and a red destructive button (`SafetyScreens.tsx:325-330,100-106`); tinted card plus filled button is heavier than the one-accent restraint of P2 [HIG].
  - The tips list repeats a title and a body for each of five items (`:114-132`) while a second plain-string copy exists unused (`strings/en.ts:1499-1505`) [disclosure].
  - Meetup spots, the stranger-safe core (P5), sit below tips and under a heading plus help line, and the spot rows have no "Police-designated" icon, only green text (`:162-166`) [trust] [a11y-contrast].
  - Spots empty state has no copy: when the list is empty the heading and help line remain with nothing under them (`:145,148`) [feedback].
  - Row tap target: the Directions IconButton is the only action; the row itself selects only through the map (`:149-172`) [Fitts-thumb].
  - Literal "•" bullets typed into Text (`:183`) are read aloud as "bullet" by VoiceOver on every line [a11y-VoiceOver].
  - Banned items is 10 lines of plain bullets (`strings/en.ts:1521-1532`) [Hick].
- Proposed layout: inline "Safety" title; section 1 "Meetup spots" first (P5): the existing collapsible map, then spot rows (name, one line of hours or description, a small "Police" word as plain text with ink2, Directions pin at the right); section 2 "Before you meet" five tips as ListRow-style rows with the title in bold and body in ink2; section 3 "Banned items" collapsed by default behind a single row "What can't be listed" that expands the list (uses the same disclosure pattern as Help). "Call 911" moves out of the card into a docked bottom button in the thumb zone, destructive variant, label "Call 911"; the card tint is dropped and the line "In danger right now?" becomes the single caption above the dock (P1, P7).
- Components: NavBar, ListRow, SpotsMap, Button (destructive, docked), IconButton, Tappable (disclosure), SkeletonList, ErrorState, EmptyState (inline).
- Motion/haptic: map pin selection = `tap`; disclosure open/close = 150 ms `fade` with height change (reduce motion: instant swap or 150 ms fade); haptic: none (outside the budget; calling 911 gets no haptic).
- Copy changes: `safety.emergencyTitle` (en.ts:1517) "In danger right now?" kept; `safety.emergencyBody` (en.ts:1518) "Call 911 and stay somewhere public with people around." -> "Call 911 and stay where people are." Empty spots: new key `safety.spotsEmpty` "No meetup spots listed for your campus yet." (es.ts needs the same key). `safety.bannedTitle` (en.ts:1519) "Banned items" -> "What can't be listed" (es.ts same key). Delete unused `safety.tips` (en.ts:1499-1505) in both locales.
- Logic needed?: no
- Conflicts: contradicts DEC 90 mock screen 18 only in ordering (emergency first, `SafetyScreens.tsx:90-91`): proposal keeps emergency always reachable by docking it, so the intent (emergency action first-class) is preserved.

#### Report update (E21)
- Current: [SCREENS entry](screens/07-notifications-safety-help-legal.md#07-report-update). Inline title "Your report", a text-only timeline (Received, Reviewed, each with a date) and one sentence of outcome (`apps/mobile/src/features/safety/SafetyScreens.tsx:34-67`).
- Problems:
  - The timeline has no visual structure; steps are two bold lines with hairlines (`:45-54`, style `:319-324`) so progress is not readable at a glance [disclosure].
  - Both "Received" and "Reviewed" rows show only after they happen, so the reporter never sees what comes next [peak-end] [trust].
  - Body copy for reviewed is two sentences and the privacy sentence is long (`strings/en.ts:1484-1485`) [DynamicType] (P4).
  - No next action (for example back to the thing reported or to Help) [feedback].
  - Opened only from a push (`apps/mobile/src/lib/push.ts:76-78`); if the id fails the user gets an ErrorState with no explanation that the report may not be theirs (`SafetyScreens.tsx:40`) [trust].
- Proposed layout: inline title; first line is the current status as plain words (large `heading`: "Reviewed" or "Received") with the date in ink2 under it; one line of help below; a short two-step list "Received, Reviewed" with the done step in ink and the pending one in ink3 (plain words, P3); docked bottom Button "Done" (back).
- Components: NavBar, Text, ListRow, Button, SkeletonList, ErrorState.
- Motion/haptic: `fade` 150 ms when content swaps from skeleton; haptic none.
- Copy changes: `safety.reportReceivedBody` (en.ts:1483) "We got your report. A person looks at it, usually within a day." keep; `safety.reportReviewedBody` (en.ts:1484-1485) "We reviewed your report and took the action we thought was right. We don't share details to protect everyone's privacy." -> "We reviewed your report. We keep details private to protect everyone." (es.ts same key). Outcome-neutral on purpose: `get_my_report` maps every non-open status, dismissed and actioned alike, to `reviewed` (`supabase/migrations/0011_rpcs_safety.sql:105`), so the client cannot know whether action was taken. Add `safety.reportDone` "Done" (or reuse `report.done` en.ts:230).
- Logic needed?: no
- Conflicts: none

#### Help, I can't get into my school email, Legal pages (F20, D11, X11)
- Current: [Help](screens/07-notifications-safety-help-legal.md#07-help), [Email access](screens/07-notifications-safety-help-legal.md#07-email-access), [Legal](screens/07-notifications-safety-help-legal.md#07-legal). Help is a six-row accordion followed by a topic-chip + email + message form with an inline Send (`SafetyScreens.tsx:238-303`); email access is the AuthStep form with a docked Send (`apps/mobile/src/features/help/EmailAccessScreen.tsx:100-163`); legal is a scroll of bundled markdown (`apps/mobile/src/features/legal/LegalScreen.tsx:38-93`).
- Problems:
  - Help: contact form is fully expanded below the FAQ, so a person looking for a quick answer has to scroll past 4 inputs; Send is inline and not docked [Fitts-thumb] [disclosure] (P7).
  - Help: no inline field errors; the Send button just stays disabled (`SafetyScreens.tsx:299`) so a user cannot tell why [feedback] [HIG].
  - Help: sent state has no way back to a fresh form and no Done action (`:263-267`) [peak-end].
  - Help: the "I can't get into my school email" route is not linked from Help although DESIGN_SYSTEM.md:285 lists it under F20; it is only on the verify screen (`apps/mobile/src/features/auth/VerifyScreen.tsx:243`) [disclosure].
  - Help: FAQ rows toggle without an animation and without a chevron (`:242-257`) [HIG] [a11y-VoiceOver] (the expanded state is exposed, good).
  - Email access: three fields plus note plus bot check; the second field "School email on your account" is optional but not marked as such (`EmailAccessScreen.tsx:128-135`) [Hick] [disclosure].
  - Email access: error is red `meta` text (`:154-161`), small and easy to miss [a11y-contrast].
  - Legal: the whole document is one long scroll with no way to jump to a section (`LegalScreen.tsx:41-91`) [disclosure]; table rows have no table semantics (`:70-85`) [a11y-VoiceOver]; the version line (`:42-44`) is the only metadata.
  - Legal: missing page uses `EmptyState` with "Go back" (`:26-36`), fine.
- Proposed layout:
  - Help: inline title "Help"; section "Common questions" as ListRow rows with a trailing chevron that rotates on open; below, one row "Contact us" that opens a Sheet (existing Sheet) containing topic chips, email, message and a docked Send; a second row "Can't get into your school email?" pushing `/help/email-access`. Sent state inside the sheet = `SuccessCheck` + line + Done.
  - Email access: keep as is (docked Send); mark the school-email field "(optional)" in its label and move the note above the Send as a single caption.
  - Legal: keep the single scroll; add nothing new (no new dependency); tighten heading spacing only.
- Components: NavBar, ListRow, Sheet, Chip, Input, TextArea, Button, SuccessCheck, Banner, AuthStep, EmptyState.
- Motion/haptic: accordion chevron rotation = `tap`; sheet = `sheet`; success check = `success` animation (reduce motion: 150 ms fade); haptic none (support sent is not in the budget, DESIGN_SYSTEM.md:97-102).
- Copy changes: `safety.contactTitle` (en.ts:1562) "Contact us" keep; `emailAccess.schoolLabel` (en.ts:702) "School email on your account" -> "School email on your account (optional)" (es.ts needs the same key updated); `safety.contactSent` (en.ts:1568) "Thanks. We'll reply by email." keep; `emailAccess.note` (en.ts:707) keep.
- Logic needed?: no
- Conflicts: none (Help route and `help/email-access` route stay as they are)

### 3.08 Primitives

Phase 3 batch B0 (tokens plus primitives). Every change below is visual or internal to the component, keeps the existing prop API (nothing a caller passes is removed or renamed), and needs no query, RPC, route or data-shape change. Where a change would alter what callers must pass it is flagged and moved to the end. Hard constraints applied: no gradients, no glass or blur, one accent, hairlines instead of card shadows, no emoji, no new dependencies. Principles P1 to P7 are the fixed list from the brief.

#### Text (type primitive)
- Current: [entry](screens/08-components-tokens.md#08-text); 8 variants from DESIGN_SYSTEM section 3, font scaling always on, `overlay` caps at 1.4x (apps/mobile/src/components/Text.tsx:38-62).
- Problems: [a11y-contrast] `sky`, `peach` and `lilac` are valid text tones (Text.tsx:20-22) but DESIGN_SYSTEM section 2 only guarantees 4.5:1 for them on their own `*Bg`; used on `bg` they can fail. [DynamicType] no issue in the primitive; the remount `key={fontScale}` (:50) is intentional.
- Proposed change: no change to the scale (LOCKED, DESIGN_SYSTEM section 3). Rule for B0: `sky | peach | lilac` text is allowed only inside a tinted chip or Tag, never on a plain screen; large titles on tab roots use `title` (26/800) as already specified. No code change needed beyond a dev-time lint or a comment.
- Motion/haptic: none.
- Conflicts: none.

#### Button
- Current: [entry](screens/08-components-tokens.md#08-button); 7 variants, 3 sizes, loading keeps width, 0.35 disabled, 500 ms guard (apps/mobile/src/components/Button.tsx:14-16,46-110).
- Problems: [HIG] no visible focus ring on web (DESIGN_SYSTEM section 6 asks for a 2 px ink ring; no branch in Button.tsx). [Hick] `primary` (accent), `dark` (ink) and `secondary` (grey) are all full-width 54 pt filled blocks; screens that stack two of them show equal weight (`EmptyState.tsx:76-83` uses a text variant for the second, but `ErrorState.tsx:72-78` and `ConfirmDialog.tsx:78-84` stack two filled buttons). [Fitts-thumb] the button has no docking behavior of its own, so P7 depends on each screen. [feedback] the `hapticOnPress` prop (Button.tsx:26,81) is unused, so the budgeted success haptics are scattered in screens.
- Proposed layout/visual change: keep sizes, radius 15 and colors (LOCKED, DESIGN_SYSTEM sections 4 and 6). Compose the docked footer from existing parts only: a full-width `L` Button over `bg` with a 1 px `line` top hairline and `space.lg` padding plus bottom inset; the second action under it is a `text` variant (not `secondary`) so there is exactly one filled button (P7). Add the 2 px ink focus ring on web only (`appFocusRing`-style, as Input does, Input.tsx:31-33). The pressed state stays scale 0.97, no color change.
- Motion/haptic: `tap` 120 ms scale; reduce motion = opacity 0.7 (already, motion.ts:60-80). Haptic only `success` on offer sent, offer accepted, listing posted, and keep them in the screens that already fire them (OfferSheetScreen.tsx:165, OfferScreen.tsx:95, SellPostedScreen.tsx:69).
- Conflicts: none (section 6 specifies the focus ring and the sizes; it does not specify docking).

#### IconButton
- Current: [entry](screens/08-components-tokens.md#08-iconbutton); 44 pt hit, `filled` with bg2 | card | accent surface, optional unread badge (apps/mobile/src/components/IconButton.tsx:40-93).
- Problems: [HIG] `surface="card"` and `"accent"` add a soft shadow via `liftShadow()` (:91); DESIGN_SYSTEM section 4 allows shadow only on sheets and toasts. [P1] over-photo controls with a shadow read as heavy chrome. [a11y-target] fine (44 pt, :84-85).
- Proposed change: replace the shadow with a solid `card` fill plus a 1 px `line` hairline for over-photo controls (no blur, no glass); the accent "on" state (Saved) stays a flat accent fill with `onAccent` icon. API unchanged.
- Motion/haptic: `tap` scale; selected state swaps to the filled glyph without animation; no haptic (save is not in the budget).
- Conflicts: none; this brings the component in line with DESIGN_SYSTEM section 4.

#### Input
- Current: [entry](screens/08-components-tokens.md#08-input); 54 pt bg2 field, 2 px ink focus ring, redBg + red ring + message on error, optional inline label (apps/mobile/src/components/Input.tsx:49-153).
- Problems: [HIG] two label systems (label above, or `inlineLabel`) coexist (:70-87). [feedback] error is a full redBg fill plus red text (:136-137), which is loud for a typing error (P3), but it is the specified state. [a11y-VoiceOver] `TextArea` does not set the disabled state (TextArea.tsx:54-56) unlike Input (:91).
- Proposed change: none to the error look (LOCKED, DESIGN_SYSTEM section 6 "error (redBg + red ring + message)"). Make `inlineLabel` the default look on sign-in and sell forms (screens already choose it) and keep the label-above only for long forms; set the disabled accessibility state in TextArea. No new props.
- Motion/haptic: focus ring appears instantly (no animation needed); warning haptic fires only with an error shake (the OTP shake today, plus the Sell Photos and Sell details error lines proposed in 3.03), never on a plain field error.
- Conflicts: none.

#### Card
- Current: [entry](screens/08-components-tokens.md#08-card); `card` fill, 1 px `line` border, radius 18, no shadow (apps/mobile/src/components/Card.tsx:8-35).
- Problems: only the dev kit uses it (1 JSX, features/dev/KitScreen.tsx), so real screens hand-roll their own boxes and drift. On a white screen a Card is a white box with a hairline. [Hick] n/a.
- Proposed change: no visual change. Adopt it as the one container wherever a screen draws a bordered box, never nested inside another Card, never with a shadow.
- Motion/haptic: pressed scale only when `onPress` is set; none.
- Conflicts: none (matches DESIGN_SYSTEM section 4).

#### ListRow and GroupedList
- Current: [entry](screens/08-components-tokens.md#08-listrow); 52 pt rows, optional colored icon tile, chevron, grouped block with hairlines (apps/mobile/src/components/ListRow.tsx:28-143).
- Problems: [feedback] pressed is a flat `bg3` fill edge to edge (:69,:125), not the `tap` scale; this is acceptable for full-width rows but differs from every other pressable. [P4/HIG] the group header is forced upper case (`header.toUpperCase()` :97) at 12.5 pt, shouty and not in the type scale. [P2] `iconTile` offers 8 saturated fills (:9), the rainbow settings look. [DynamicType] label wraps, fine.
- Proposed change: keep the `bg3` row highlight (it is the iOS list convention); header becomes sentence-case `meta` in `ink2` (drop `toUpperCase`; the copy stays). Option for the owner: collapse `iconTile` to one neutral tile (bg2 with ink glyph) plus red only for destructive.
- Motion/haptic: pressed highlight instant; reduce motion same; no haptic.
- Conflicts: the `iconTile` option contradicts DEC 90 (inset settings with colored icon tiles); the header change does not conflict with any LOCKED rule.

#### Sheet and ActionSheet
- Current: [entry](screens/08-components-tokens.md#08-sheet); spring open, drag to close past 30% or fling, scrim, keyboard aware (apps/mobile/src/components/Sheet.tsx:38-124,163-204).
- Problems: [feedback] `ActionSheet` rows are raw `Pressable`s with no pressed state (:177-190). [HIG] Cancel is the last row of the same list (:192-201), iOS sets it apart. [disclosure] no snap points, though section 6 lists them. [a11y-VoiceOver] fine (modal, labelled scrim). [P7] action sheets list actions with equal weight.
- Proposed change: ActionSheet rows get a `bg2` pressed fill and 52 pt rows; Cancel moves to its own rounded `bg2` block 8 pt below the list; the title stays `heading`, left aligned. Keep the grabber and the 28 pt top radius and the single soft shadow (LOCKED, DESIGN_SYSTEM section 4).
- Motion/haptic: `sheet` spring (damping 22, stiffness 240), reduce motion = 150 ms fade (Sheet.tsx:53,57,79); no haptic.
- Conflicts: none.

#### Avatar
- Current: [entry](screens/08-components-tokens.md#08-avatar); S/M/L circles of 32/44/72, initials on neutral shades or accent (apps/mobile/src/components/Avatar.tsx:36-59).
- Problems: [feedback] a photo that fails to load leaves an empty shade circle because initials only render when `uri` is falsy (:44-56). [DynamicType] initials use uncapped `label`/`heading` text in a fixed 32 pt circle (:53).
- Proposed change: fall back to the initials when the image errors (component-local state, same as Photo does); give the initials the `overlay` cap so they cannot outgrow the circle.
- Motion/haptic: 150 ms image fade stays, instant with reduce motion (gate `transition` on `useReducedMotion`, currently ungated :49); none.
- Conflicts: none.

#### Badge (unread count)
- Current: [entry](screens/08-components-tokens.md#08-badge); red pill, 18 pt min, hidden at 0, 99+ (apps/mobile/src/components/Badge.tsx:12-43).
- Problems: three copies of the same red pill exist (Badge.tsx:29-43, TabBar.tsx:115-121 and :187-193, SegmentedControl.tsx:50-56 and :82-88), and `badgeText` lives in TabBar (Badge.tsx:4 imports from TabBar.tsx:30), so styling can drift. [P3] red is allowed only because it signals unread.
- Proposed change: one badge style used by all three, no visual difference (red fill, `inverse` text, 99+ rule); move `badgeText` next to Badge. Position and size unchanged.
- Motion/haptic: none (a new unread count appears without animation or haptic).
- Conflicts: none.

#### Tag
- Current: [entry](screens/08-components-tokens.md#08-tag); small `meta` label on neutral, accent or tinted green, amber, red fills (apps/mobile/src/components/Tag.tsx:17-45).
- Problems: [P3] tinted pills turn every status into a colored badge; status should be plain words and color only when it matters. [P1] a Tag in the photo corner (ListingTile.tsx:49-53) competes with the photo. [feedback] Tags used as suggestions look tappable (EmptyState.tsx:69-71).
- Proposed change: keep the five tones and API. Guidance for B0 and the screen batches: neutral and accent Tags only for proper labels (category, Verified); ordinary statuses (Sold, On hold, Pending) become plain `meta` text in `ink2`, with `green|amber|red` text only when it needs attention. Do not use Tag for non-interactive suggestions.
- Motion/haptic: none.
- Conflicts: none (DESIGN_SYSTEM section 6 keeps the Tag component; only its usage narrows).

#### Chip
- Current: [entry](screens/08-components-tokens.md#08-chip); 36 pt pill, ink fill when on, removable, tab role (apps/mobile/src/components/Chip.tsx:30-121).
- Problems: [a11y-target] the 44 pt target is vertical only (`SMALL_SLOP` has left and right 0, Tappable.tsx:11-16), chips sit 8 pt apart. [a11y-contrast] selected is signalled by fill color alone (:117). [Hick] `ChipGroup` wraps freely.
- Proposed change: selected chips (role `choice`) show a 16 pt check glyph before the label so state is not color only; keep ink fill (LOCKED section 6 "on (ink fill)"). Keep wrap behavior but cap visible chips per row group by the screen, not the component.
- Motion/haptic: `tap` scale on press; no haptic (selection haptic is reserved for the swipe threshold).
- Conflicts: none.

#### EmptyState (and GlyphTile)
- Current: [entry](screens/08-components-tokens.md#08-emptystate); centered 88 pt glyph tile, heading, body, suggestion Tags, primary and secondary Buttons (apps/mobile/src/components/EmptyState.tsx:44-116).
- Problems: [P4] heading plus body plus suggestions plus two buttons is five blocks. [P7/Fitts-thumb] actions sit in the middle of the screen, not at the thumb (`justifyContent: 'center'` :94). [feedback] suggestion Tags look tappable. Constraint: centered-everything layouts are banned for the redesign.
- Proposed layout: keep the glyph tile (LOCKED, DESIGN_SYSTEM section 7); left-aligned block in the upper third: tile, `heading` title, one `body` ink2 line. When `action` exists, dock the primary Button at the bottom of the empty area (the container uses space-between); `secondaryAction` becomes a `text` button directly under it. Suggestions render as one `meta` ink2 line ("Try: ..."), not Tags.
- Motion/haptic: no animation, no haptic. Reduce motion: nothing to change.
- Conflicts: none.

#### ErrorState
- Current: [entry](screens/08-components-tokens.md#08-errorstate); glyph tile, "Couldn't load this" or "You're offline", body from `errorCopy`, grey Try again button (apps/mobile/src/components/ErrorState.tsx:37-82).
- Problems: [peak-end] the title never names the thing that failed. [Fitts-thumb] retry is a grey `secondary` block mid-screen. [feedback] good: spinner while retrying (:48-58,:72-78). [P7] same centered layout as EmptyState.
- Proposed layout: same left-aligned block as EmptyState; retry becomes the single docked `dark` Button for `layout="screen"` (inline layout keeps the M size, no glyph). Offline keeps the wifi glyph. Copy rewrites are in the States table.
- Motion/haptic: Button spinner only; no haptic (the warning haptic is for the form-error shake, not load failures).
- Conflicts: none.

#### Skeleton
- Current: [entry](screens/08-components-tokens.md#08-skeleton); pulsing bg2 shapes for card, list and grid (apps/mobile/src/components/Skeleton.tsx:58-175).
- Problems: [feedback] `useDelayedLoading` (Skeleton.tsx:23-35, "loads under 300 ms flash nothing", board X3) has no caller (grep), so fast loads flash a skeleton. The list skeleton is a generic 44 pt square plus 2 lines (:146-153), unlike the real rows.
- Proposed change: keep the whole-block pulse (no shimmer gradient) and reduce-motion static look. The 300 ms delay is deferred: needs logic change (see §5) (call-site wiring in each screen). Make `SkeletonList` thumb match the real row photo size when `rows` are listing rows (visual only).
- Motion/haptic: pulse 1300 ms (`motion.skeleton`), static with reduce motion (:70-74); no haptic.
- Conflicts: none.

#### Toast
- Current: [entry](screens/08-components-tokens.md#08-toast); ink pill with icon, message and optional Undo, 4 s or 5 s (apps/mobile/src/components/Toast.tsx:42-121).
- Problems: [a11y-contrast] the success (green) and error (red) icons sit on the `ink` pill (:72); by the token table that is about 1.7:1 and 2.8:1 in dark mode, where `ink` is near white. [Fitts-thumb/P7] the host is fixed at `insets.bottom + 64` (:103), on top of a bottom-docked primary button (54 pt plus padding). [feedback] no tap or swipe to dismiss; the 4 s timer is invisible.
- Proposed change: draw the icon in `inverse` for every kind (the word carries the meaning, P3); raise the host to one fixed offset that clears a docked 54 pt button on every screen (bottom inset plus `buttonL` plus 2 x `space.lg`; display only, built in B0). Moving it only when a button is docked, or adapting to the NavBar, is deferred: needs logic change (see §5); tap on the pill dismisses it. API unchanged.
- Motion/haptic: 150 ms fade in, no exit animation (Android crash note, Toast.tsx:56-57); no haptic (success toasts are not in the budget; the success haptic belongs to the action that triggered it).
- Conflicts: none (DESIGN_SYSTEM section 6 specifies kinds and durations only).

#### Banner and OfflineBanner
- Current: [entry](screens/08-components-tokens.md#08-banner); inline rounded bar with icon and one line; the offline version slides down from the top over content (apps/mobile/src/components/Banner.tsx:18-93).
- Problems: [HIG] `OfflineBanner` is absolutely positioned at `rt.insets.top` (:77), so it covers the NavBar title and back button for as long as the device is offline. [P4] the copy is two sentences (apps/mobile/src/strings/en.ts:77). [a11y-contrast] message text is always default ink (:22); only the icon carries the amber or red tone, fine.
- Proposed change: compact single-line bar (bg2, no shadow) sized to 36 pt instead of 44 pt, copy cut to "You're offline"; keep the 1.5 s delay (:38) and the entering-only animation. Inline `Banner` unchanged.
- Motion/haptic: slide in 220 ms, 150 ms fade with reduce motion (:68); no haptic.
- Conflicts: none (section 6 "offline banner slides from the top").

#### TabBar
- Current: [entry](screens/08-components-tokens.md#08-tabbar); white bar with hairline, ink or ink3 icons and labels, accent Sell rectangle, red badges, iPad rail (apps/mobile/src/components/TabBar.tsx:67-200).
- Problems: [feedback] tabs are raw `Pressable`s with no pressed state (:95,:162). [a11y-contrast] active versus inactive is ink versus ink3 and stroke weight only (:112-113,:126); ink3 meets 4.5:1 so it is legible but the selected cue is subtle. [DynamicType] labels capped at 1.4x and one line, correct (:124-130).
- Proposed change: pressed = icon and label at 0.6 opacity (no scale, nothing that shifts the row); the active tab uses the filled glyph (`Icon filled`) where the glyph reads well, otherwise stroke 2.2 as now. Bar stays opaque `bg` with a 1 px `line` top hairline (no blur, LOCKED DEC 120 "labelled iOS style, no accent pill").
- Motion/haptic: tabs never slide or buzz (TabBar.tsx:62); no animation, no haptic.
- Conflicts: none.

#### NavBar
- Current: [entry](screens/08-components-tokens.md#08-navbar); large left-aligned 26 pt title for tab roots, inline 16 pt title with back or close for pushed screens (apps/mobile/src/components/NavBar.tsx:33-85).
- Problems: [HIG] the large title is static: no collapse on scroll and no hairline when content scrolls under the inline bar. [DynamicType] inline title is `numberOfLines={2}` (:75) so a long title makes the bar taller; fixed `minHeight` keeps the back button aligned. [a11y-target] back and close are 44 pt IconButtons, fine.
- Proposed change: no static change needed beyond keeping `title` large on roots (DEC 90). A scroll-linked hairline or collapsing title needs scroll offset from every screen and is deferred: needs logic change (see §5).
- Motion/haptic: none in the component; no haptic.
- Conflicts: none.

#### MessageBubble
- Current: [entry](screens/08-components-tokens.md#08-messagebubble); accent bubble with ink text for mine, bg2 or card for theirs, grouped corners, pending at 60%, failed row, scam hint, blurred photos (apps/mobile/src/components/MessageBubble.tsx:68-266).
- Problems: [feedback] pending is only a 0.6 opacity (:287); the words "Sending" exist only in the spoken label (:130-132). [trust] the scam hint is an amber alert (:252-263) at 12.5 pt with an icon, correct for P5 but small. [P3] failed uses red icon and word (:244-251), fine.
- Proposed change: show "Sending" (existing string `chat.sending`, apps/mobile/src/strings/en.ts chat section from line 1199) as `ink3` meta under a pending bubble, so the state is visible without color or opacity alone. Failed row text becomes the retry instruction using the existing `chat.failed` copy. No new data.
- Motion/haptic: none; no haptic on send (offer sent is the only chat-adjacent budget moment and fires from the offer sheet).
- Conflicts: none.

#### ListingTile
- Current: [entry](screens/08-components-tokens.md#08-listingtile); photo, price, two-line title, optional green note; sold fades the whole tile to 0.5 and adds a corner Tag, hold adds an amber Tag (apps/mobile/src/components/ListingTile.tsx:27-69).
- Problems: [a11y-contrast] 50% opacity on the whole sold tile (:72) drops price and title text below 4.5:1. [P1] a Tag on the photo corner adds chrome. [P3] status should be plain words. [Hick] none.
- Proposed change: dim only the photo with the `overlay` scrim token (DESIGN_SYSTEM section 6 says "overlay"), keep price and title at full contrast, and put the status as a plain `meta` word under the price ("Sold" in `ink2`, "On hold" in `amber`); remove the corner Tag. The accessibility label already includes the tag text (:38).
- Motion/haptic: `tap` scale; none.
- Conflicts: none.

#### Other primitives touched in B0 (not in the required list)
- SegmentedControl: segments are 36 pt with no slop (SegmentedControl.tsx:76) [a11y-target]; raise `minHeight` to the 44 pt `buttonM` token and add a pressed state.
- Toggle and OptionRow: raw `Pressable`s with no pressed state (Toggle.tsx:18, OptionRow.tsx:29) [feedback]; the Toggle knob jumps (:57-64): animate over 150 ms (`fade` timing), instant with reduce motion.
- ConfirmDialog: two stacked full filled buttons (ConfirmDialog.tsx:78-84) [P7]: confirm stays `dark`/`destructive`, cancel becomes `text`.
- OTPInput: the error shake has no screen-reader announcement (OTPInput.tsx:63-75) [a11y-VoiceOver]; add a polite live-region message from the caller's existing error string.
- Photo and PhotoCarousel: failed photo placeholder is not retryable (Photo.tsx:90-93); retry needs a fresh signed URL, deferred: needs logic change (see §5).
- Dead components: `ShellScreen` (0 uses), `Card` and `Stepper` (kit only): cleanup candidates, not design changes.
- Haptics: audit found `selection`, `success` or `warning` fired outside the budget at features/auth/VerifyScreen.tsx:144 (code verified), features/sell/SellScanScreen.tsx:73 (barcode found), features/auth/RulesScreen.tsx:163 (rules checkbox) and features/sell/SellDetailsScreen.tsx:265 (`warning` with no shake); recommend removing the first three and either adding the error shake to SellDetails or removing its haptic, so the budget in DESIGN_SYSTEM section 5 (lines 97-102) holds. `Button.hapticOnPress` stays unused.
- Icons: 64 glyphs, nine with no string-literal use (arrdown, chart, copy, del, edit, qr, shift, sliders, undo). Glyphs likely wanted by the redesign but absent: thumbs up and thumbs down for ratings (now two text buttons, features/deals/DealScreens.tsx:332-333), a verified/.edu mark (P5). `iconData.ts` is generated from the board (iconData.ts:1), so these need a board update, not a hand edit.

### 3.09 Admin (shared UI and sign-in)

Admin is a desktop staff tool (React + TanStack Router, `apps/admin`), so the mobile rules are applied as restraint rather than thumb-zone layout: hairlines, plain words, one accent fill, one primary action per surface, every action answers back (P2, P3, P4, P6, P7). Density stays. Admin copy is hardcoded in TSX (no strings file), so "Copy changes" cite `file:line` instead of a string key, and there is no es parity. Screen entries are in [screens/09-admin.md](screens/09-admin.md).

#### Admin gate and loading (09-auth-gate)
- Current: [entry](screens/09-admin.md#09-auth-gate). Mounted before the router (`apps/admin/src/main.tsx:118-121`). Loading is a blank page with the static logo mark (`apps/admin/src/auth.tsx:49-54`); expired sessions silently bounce to the form (`auth.tsx:23-27`).
- Problems:
  - [feedback] The loading branch has no text and no timeout; a slow `getSession` or `admin_whoami` shows a mark forever (`auth.tsx:49-54`, `:29`).
  - [feedback] A failed `admin_whoami` is swallowed and shows the sign-in form with no message (`auth.tsx:29-31`, `logic.ts:23`), so a revoked or flaky account looks like "type your email again".
  - [feedback] The 8-hour expiry returns to sign-in with no explanation (`auth.tsx:23-27`).
  - [disclosure] Every card repeats "For the OnlySwap team. Two-step sign-in required." (`auth.tsx:84`), including the denial card where it reads as contradictory.
- Proposed layout: a quiet centered column on the page background (`--a-page`), the 380px hairline card (`styles.css:1330-1340`), logo mark, one h1, at most one line of help, the form, one primary button. Loading shows the mark plus the word "Checking your session" after a 300 ms delay (matches `motion.skeleton.delay` 300 ms in `tokens.json`), and after 10 s a line "This is taking longer than usual." with a ghost "Reload" button.
- Components: existing `.gate`, `.gate-card`, `.mark.lg`, `Button`.
- Motion/haptic: none (no motion; if the delay text fades use `--motion-fade` 150 ms, 0 under reduce motion). No haptic (web).
- Copy changes: `auth.tsx:84` lede "For the OnlySwap team. Two-step sign-in required." -> show only on the email card ("For the OnlySwap team."), drop the second sentence once the second step is shown; add `auth.tsx:49-54` "Checking your session" and "This is taking longer than usual." The expiry line "Your session ended. Sign in again." and an "access check failed" line are deferred: needs logic change (see §5): the gate does not keep why it fell back to the form.
- Logic needed?: no for the loading text, the 10 s line and the lede; the session-expired and access-check-failed lines are deferred: needs logic change (see §5) (gate states).
- Conflicts: none.

#### Email sign-in (09-auth-email-login)
- Current: [entry](screens/09-admin.md#09-auth-email-login). Email field + "Send code", then a code field and "Sign in" (`auth.tsx:130-155`). No busy flag (`auth.tsx:110-128`).
- Problems:
  - [feedback] Pressing "Send code" gives no pending state and no "code sent" confirmation; the only cue is a new field appearing (`auth.tsx:119,140`). Double submits are possible (`auth.tsx:110-128`).
  - [Hick] No way back to edit the email or resend the code once sent (`auth.tsx:105`); a typo means a reload.
  - [a11y-VoiceOver] The error `p.error` is not announced (no `role="alert"`) (`auth.tsx:152`); focus does not move to the new code field.
  - [trust] "Send code" and "Sign in" are the only labels; the page never says where the code was sent.
  - [a11y-contrast] Error text is `--color-red` on white at 13.5px (`styles.css:96-98`); it passes, but the only error cue is colour plus text, which is fine.
- Proposed layout: card with h1 "Sign in", one-line help under it, Email field, Send code (primary). After sending: the email becomes read-only text with a ghost "Change" link (back to the email step; local state), a Code field (autofocus) and primary "Sign in". A "Send a new code" control is deferred: needs logic change (see §5): the client cannot read the sign-in rate limit, so the button could fail every time. Pending: the primary button is disabled and reads "Sending…" / "Signing in…". Errors in a `role="alert"` line directly under the field.
- Components: `Field` (instead of the raw `label.field`, `ui.tsx:541`), `Button` (`ui.tsx:460`), `.gate-card`.
- Motion/haptic: none; the new field appears without animation.
- Copy changes: `auth.tsx:109` "Sign in to OnlySwap admin" -> "Sign in"; add the sent line "We sent a code to {email}."; `auth.tsx:142` "Code from your email" -> "Code"; `auth.tsx:154` "Send code" / "Sign in" unchanged.
- Logic needed?: no for the layout, the Change link, the sent line and the pending labels (local component state); resend is deferred: needs logic change (see §5).
- Conflicts: none.

#### Not an admin (09-auth-access-denied)
- Current: [entry](screens/09-admin.md#09-auth-access-denied). "Not an admin", "This account doesn't have access to the console." and a primary "Sign out" (`auth.tsx:56-64`).
- Problems:
  - [trust] The card does not say which account is signed in, so someone with two accounts cannot tell what to do (`auth.tsx:58-61`).
  - [disclosure] The shared lede "Two-step sign-in required." appears on the denial (`auth.tsx:84`).
  - [feedback] Sign-out has no pending or error state (`auth.tsx:46`).
  - A revoked admin whose RPC throws never sees this card; they see sign-in (`auth.tsx:29`, `logic.ts:23`).
- Proposed layout: logo mark, h1 "No access", one line "This account is not on the admin list. Ask an owner to add you, or sign in with another account.", primary "Sign out". Naming the signed-in email in that line is deferred: needs logic change (see §5).
- Components: `.gate-card`, `Button`.
- Motion/haptic: none.
- Copy changes: `auth.tsx:58` "Not an admin" -> "No access"; `auth.tsx:59` "This account doesn't have access to the console." -> "This account is not on the admin list. Ask an owner to add you, or sign in with another account."
- Logic needed?: no; showing the signed-in email is deferred: needs logic change (see §5).
- Conflicts: none.

#### Two-step check and enrollment (09-auth-mfa)
- Current: [entry](screens/09-admin.md#09-auth-mfa). Enrollment shows text, a 180px QR, the setup key and a "Code" field; verify-only shows one line and the field; buttons "Verify" and ghost "Sign out" (`auth.tsx:195-243`).
- Problems:
  - [feedback] While factors load or enroll, the card looks like the verify-only state with a working "Verify" that silently does nothing (`auth.tsx:200`, `:167-193`).
  - [feedback] No pending state on "Verify" and no clearing of a wrong code after an error (`auth.tsx:198-206`).
  - [Hick] The setup key has no copy button (`auth.tsx:217-219`); no help for a lost device or authenticator (no branch found).
  - [a11y-VoiceOver] The error is not announced (`auth.tsx:236`); the code input accepts any length and letters (`auth.tsx:228-233`) with only `inputMode`.
  - [disclosure] Instruction copy is split between two paragraphs plus a hint; the three lines say the same thing in different words (`auth.tsx:210-221,224`).
  - [trust] The sidebar says "two-step on" for everyone even when the owner has turned the check off (`shell.tsx:110`, `logic.ts:15`).
- Proposed layout: h1 "Two-step sign-in". First-time: step 1 "Scan this code with an authenticator app." QR (180px, hairline), a muted line "Or enter this key" with the key and a ghost "Copy" button; step 2 "Enter the 6-digit code." field. Returning: only the field and one line. Code field: `maxLength=6`, numeric, autofocus, clears on error. Buttons: primary "Verify" (disabled with "Checking…" while pending and until the factor is ready), ghost "Sign out".
- Components: `Field`, `Button`, `.qr`, `.secret`, `.gate-card`.
- Motion/haptic: none.
- Copy changes: `auth.tsx:197` "Set up two-step sign-in" / "Two-step check" -> "Two-step sign-in" for both; `auth.tsx:210-212` -> "Scan this code with an authenticator app, then enter the 6-digit code."; `auth.tsx:216` "Can't scan? Type this key into the app instead:" -> "Can't scan? Enter this key instead."; `auth.tsx:224` -> "Enter the 6-digit code from your authenticator app." (unchanged); sidebar `shell.tsx:110` "Owner · two-step on" -> drop "two-step on".
- Logic needed?: no. The sidebar line only drops the "two-step on" claim (copy only, see Shell and nav chrome); nothing reads `mfa_required`, so this needs no logic change and is built in B8.
- Conflicts: none.

#### Shell and nav chrome (09-shell-shell)
- Current: [entry](screens/09-admin.md#09-shell-shell). 232px sidebar with brand, campus picker, four groups of 15 links and a signed-in block (`apps/admin/src/shell.tsx:53-122`, `apps/admin/src/nav.ts:18-54`); hamburger drawer under 900px (`shell.tsx:31-52`, `styles.css:1767+`).
- Problems:
  - [Hick] Fifteen top-level links in four groups, with Settings hiding eight sub-pages (`nav.ts:77-93`); Appeals, Support and Reports are three separate queues each with its own badge (`nav.ts:38-40`).
  - [feedback] Counts that fail to load disappear silently (`session.tsx:72`); staff cannot tell "0 waiting" from "could not load".
  - [a11y-VoiceOver] Sign-out is an icon-only ghost button (`shell.tsx:112-120`), fine for labels but the 26px target is small.
  - [trust] The staging build has no visible marker; nothing in the shell says "Staging" (`env.ts:6` is only used for routes).
  - [disclosure] Brand is rendered twice (phone bar and sidebar, `shell.tsx:45-48,54-57`).
  - [a11y-contrast] Active item is only a soft fill and a weight change (`styles.css:232-236`); the fill (`#f4f4f0` on white) is about 1.1:1, so the state depends on weight alone.
- Proposed layout: keep the 232px sidebar. Active item: 2px ink bar at the left edge plus the existing weight (not just a fill). Badge: red only for open reports, the other counts as plain grey numbers (already so; keep). Move the signed-in block to "Name" over "Role" with Sign out as a text button "Sign out" (not an icon). On a staging build show a neutral "Staging" label next to the brand.
- Components: existing `.nav`, `.camp`, `.me`, `Avatar`, `Button`, `Icon`.
- Motion/haptic: drawer `transform 0.2s` (`styles.css:1818-1826`) -> `--motion-fade` 150 ms or none under reduce motion (already none, `styles.css:1950-1953`).
- Copy changes: `shell.tsx:110` "{Role} · two-step on" -> "{Role}"; `shell.tsx:74` fallback "Your campus" stays.
- Logic needed?: no for chrome; the staging label uses `STAGING` from `env.ts:6` which already exists (no data change).
- Conflicts: none.

#### Page not found (09-notfoundpage)
- Current: [entry](screens/09-admin.md#09-notfoundpage). Inside the shell: top bar "Page not found", a bordered card with a centered title "There's no page at this address.", a muted line "It may have moved in the new console." and a primary "Back to Overview" (`apps/admin/src/shell.tsx:131-143`). Reached through `notFoundComponent` (`main.tsx:35`) and `defaultNotFoundComponent` (`main.tsx:108`).
- Problems:
  - [disclosure] Two lines say the same thing and "the new console" refers to a build-time history staff do not know (`shell.tsx:135-136`, `main.tsx:50`).
  - [Hick] A box inside a box: a bordered card around a centered empty state (`shell.tsx:134`, `styles.css:1276-1284`) for a one-line message.
  - [feedback] The failed address is not shown, so staff cannot tell a typo from a stale bookmark (not handled, no branch found).
  - [trust] A staging-only address on production lands here by design (`main.tsx:92-93`), but the page gives no hint that it is environment-specific.
  - [a11y-VoiceOver] Fine: `EmptyState` is `role="status"` (`ui.tsx:691`).
- Proposed layout: top bar "Page not found". Left-aligned content (no card): h2 "No page at this address", one muted line with the address in a `code` span ("{pathname} is not a page in this console."), then a primary "Go to Overview". No second paragraph.
- Components: `Page`, `Button` rendered as `Link.btn.primary`, the existing `code` style (`styles.css:65-69`).
- Motion/haptic: none.
- Copy changes: `shell.tsx:135` "There's no page at this address." -> "No page at this address"; `shell.tsx:136` "It may have moved in the new console." -> "{pathname} is not a page in this console."; `shell.tsx:138` "Back to Overview" -> "Go to Overview".
- Logic needed?: no (`useRouterState` pathname is already available in the shell, `shell.tsx:14`).
- Conflicts: none.

#### Global search and pickers (09-search-globalsearch, 09-pickers-searchpicker)
- Current: [search](screens/09-admin.md#09-search-globalsearch), [picker](screens/09-admin.md#09-pickers-searchpicker). Search shows "Searching…", an error line, `No matches for "{q}"`, or three groups of links (`apps/admin/src/search.tsx:88-120`). The picker shows "Type 2 or more letters." and "No matches." (`apps/admin/src/pickers.tsx:104-106`).
- Problems:
  - [Hick] No keyboard navigation of results (arrow keys, Enter); the popover claims `role="listbox"` but children are plain links (`search.tsx:89-119`).
  - [feedback] The picker shows nothing while loading (`pickers.tsx:104-131`); the search keeps old results while a new query is pending and a slow earlier response can overwrite a newer one (`search.tsx:50-57`).
  - [feedback] Under two characters the search shows nothing and does not say why (`search.tsx:44-49`).
  - [disclosure] The picker repeats the debounce/outside-click code of the search (`pickers.tsx:32-55`, `search.tsx:35-59`).
- Proposed layout: unchanged popover (12px radius, hairline, one shadow). Add: under two characters show "Type 2 or more letters." as in the picker; loading shows the same "Searching…" line in both components. Arrow-key and Enter navigation of results and ignoring stale responses are deferred: needs logic change (see §5) (behavior change, not restyling).
- Components: existing `.pop`, `Avatar`, `StatusPill`, `ListingCell`.
- Motion/haptic: none.
- Copy changes: `search.tsx:91` "Searching…" kept; `search.tsx:92` `No matches for "{q}"` -> `No matches for "{q}"` (keep); add hint "Type 2 or more letters." in `search.tsx:88`; `pickers.tsx:106` "No matches." keep.
- Logic needed?: no for the hint and loading line; keyboard navigation and request ordering are deferred: needs logic change (see §5).
- Conflicts: none.

#### UI kit: buttons, forms, tables, pills, cards (09-ui-button and related)
- Current: [Button](screens/09-admin.md#09-ui-button), [Field](screens/09-admin.md#09-ui-field), [Table](screens/09-admin.md#09-ui-table), [Pill](screens/09-admin.md#09-ui-pill), [Card](screens/09-admin.md#09-ui-card), [Dialog](screens/09-admin.md#09-ui-dialog); component table in `admin-comp-table.md`.
- Problems:
  - [feedback] Button has no built-in pending state: pages pass `disabled={busy}` and the label never changes (`apps/admin/src/ui.tsx:460-485`, `:861`).
  - [a11y-contrast] Pills carry meaning with colour alone across six tones, two of them purple and peach (`ui.tsx:314-332`, `styles.css:767-794`); the sky, lilac and peach tones add no extra meaning in the plain-words model (P3).
  - [a11y-target] Buttons 30px and 26px, inputs 34px (`styles.css:565,612,1183`); acceptable for a pointer, below 44px for the phone drawer controls except the menu button (`styles.css:1788-1790`).
  - [a11y-VoiceOver] `Dialog` has no initial focus, focus trap or focus return (`ui.tsx:954-984`); `Segmented` declares `role="radiogroup"` without arrow-key behaviour (`ui.tsx:504-515`).
  - [disclosure] `Field` has no error, required or disabled presentation; pages invent it (`ui.tsx:541-559`).
  - Dead or duplicate pieces: `money`, `CampusSelect`, `ComingSoon`, `variant="accent"` have 0 uses (`admin-comp-table.md`).
- Proposed layout: Button gets `pending` (disables and shows the verb in progress, for example "Saving…"). Status pills: three colours only (green for done/good, red for needs action, amber for waiting) and neutral for everything else; sky, lilac, peach map to neutral in `labels.ts` (mapping change only; tone type unchanged). `Field` gets an `error` prop that renders a red line under the control. `Dialog` gets focus-in, focus-return and scroll lock. Remove unused `money`, `CampusSelect`, `ComingSoon`.
- Components: the existing kit only.
- Motion/haptic: none; the switch knob transition honours reduce motion (add it, `styles.css:1262`).
- Copy changes: none beyond below.
- Logic needed?: no.
- Conflicts: contradicts nothing locked; note P2 (one accent) is already met in buttons since primary is ink (`styles.css:582-586`).

#### Moderation reason and confirmation (ReasonActions, ActionButton) (09-ui-reasonactions, 09-ui-actionbutton)
- Current: [ReasonActions](screens/09-admin.md#09-ui-reasonactions), [ActionButton](screens/09-admin.md#09-ui-actionbutton). `ReasonActions` shows one reason input beside a row of action buttons; fewer than 3 characters shows a red line; some actions ask `window.confirm`; success shows a green "Done" and clears the box (`apps/admin/src/ui.tsx:804-886`). `ActionButton` chains `window.confirm` and `window.prompt` (`ui.tsx:757-761`). Used on Person, Reports (reports and appeals) and ListingDetail, and on 8 files for single actions.
- Problems:
  - [loss-aversion] Destructive actions (Ban, Remove) sit in the same row as harmless ones and differ only by colour; confirmation is a native `window.confirm` that cannot name the person or the consequence (`ui.tsx:829`, `:757`).
  - [feedback] While running, every button is disabled but nothing says what is running; no spinner or changed label (`ui.tsx:830,861`). "Done" never goes away and does not say what was done (`ui.tsx:834,879-883`).
  - [feedback] Validation fires after the click, not while typing: no live "3 characters minimum" counter, though `.counter` exists (`ui.tsx:825-828`, `styles.css:1228-1235`).
  - [Hick] The same required reason is described three ways with different wording (placeholder, aria-label, error) (`ui.tsx:807,827,853`).
  - [a11y-VoiceOver] `ActionButton` prompts are native dialogs that screen readers handle inconsistently and cannot be styled or translated; the cancel path is silent (`ui.tsx:761`).
  - The two-step "extra" row (days, until date) is a good pattern, but its "Confirm {action}" sentence-cases a label by lowercasing (`ui.tsx:872`).
- Proposed layout: one pattern for all moderation actions, a `Dialog` (560px) opened by the action button. Title is the action's existing `label` (for example "Ban"); the first line is the action's existing `confirm` sentence when it has one (`ReasonAction.confirm`, `ui.tsx:791-792`), then the reason field with a live count ("3 characters minimum"), then the extra input when needed, and a footer with ghost "Cancel" and one primary button (red fill only for Ban). Pending: the primary shows "Working…" and the dialog stays open; on success the dialog closes and a one-line inline result appears at the action row: "Done. Logged to the audit log." with a "View" link, disappearing after 6 seconds (action-specific wording such as "Banned" is deferred: needs logic change (see §5)); on error the dialog stays open with the message under the field and the reason kept. The inline reason box on the page (current `ReasonActions`) remains for the quick row of low-risk actions (for example hold/release) but never for ban/remove.
- Components: `Dialog`, `Field`, `Button`, existing `.counter`, `.callout.red` for the effect line.
- Motion/haptic: none (dialog opens without animation or `--motion-fade` 150 ms; none under reduce motion).
- Copy changes: `ui.tsx:807` "Reason (required, saved to the audit log)" -> "Reason (required)"; `ui.tsx:827` "Add a reason of at least 3 characters." -> "Add a reason, at least 3 characters."; `ui.tsx:834` "Done" -> "Done. Logged to the audit log."; `ui.tsx:872` "Confirm {label}" -> "{Label}" (button carries the verb); "saved to the audit log" moves to one hint line under the field.
- Logic needed?: no for the dialog and copy (existing `run(reason)`, `label` and `confirm` are reused); per-action result wording needs a `doneLabel` prop passed by each page and is deferred: needs logic change (see §5).
- Conflicts: none.

#### UI kit: states (Loadable, EmptyState, ErrorState, Loading, MoreList)
- Current: [Loadable](screens/09-admin.md#09-ui-loadable), [Loading](screens/09-admin.md#09-ui-loading), [ErrorState](screens/09-admin.md#09-ui-errorstate), [MoreList](screens/09-admin.md#09-ui-morelist).
- Problems:
  - [feedback] The skeleton shimmer is a gradient (`styles.css:1296`) and shows immediately, so it flashes on fast loads (`ui.tsx:707-716`).
  - [feedback] A failed refresh replaces already-shown data with an error (`ui.tsx:58`).
  - [disclosure] Error state shows the raw `errorMessage` with only "Try again" (`ui.tsx:698-705`), no hint whether it is the network or a permission problem.
  - Empty states are centered text in a bordered card with no next action unless the page adds one (`ui.tsx:689-696`).
- Proposed layout: skeleton rows as flat `--a-soft` bars with a slow opacity pulse (no gradient), shown only after 300 ms, static under reduce motion; error line left-aligned with "Try again"; keep stale data visible with a small banner "Could not refresh. Try again." when a reload fails.
- Components: `Loading`, `ErrorState`, `EmptyState`, `Loadable`.
- Motion/haptic: opacity pulse 1300 ms (`tokens.json` motion.skeleton), static under reduce motion; none otherwise.
- Copy changes: `ui.tsx:61` "Nothing here right now." kept; `ui.tsx:702` "Try again" kept; `ui.tsx:1083` "Loading…" kept.
- Logic needed?: no.
- Conflicts: none.

### 3.09b Admin pages

Scope: 26 page files in apps/admin/src/pages (inventory: [09b](screens/09-admin.md)). Admin is a desktop web console, so P1 (photo first) applies only to listing and Quad thumbnails, haptics do not apply, and the adaptation is: hairlines not shadows, plain-word status, one accent fill per view, density kept. Components named below are the admin ones in apps/admin/src/ui.tsx (Page, Card, Table, Pill, StatusPill, Button, Segmented, Field, Pager, Kpi, EmptyState, ErrorState, Loading, ActionButton, ReasonActions, Dialog, LoggedNote, Stat, MoreList). All proposals are presentation or copy only; none changes an RPC, query or data shape. Server role enforcement and RPC bodies were not read.

Cross-cutting problems (referenced by id below):
- X1 [feedback][loss-aversion] Three reason-capture patterns: browser `window.prompt`/`window.confirm` in ActionButton (ui.tsx:757-759), Config's own prompt plus `window.alert` (Config.tsx:10-18), and inline reason inputs in ReasonActions (ui.tsx:826-849) and bulk bars. Remove, Pause and "Set live" are confirmed in some pages and not in others.
- X2 [feedback] `Loadable` keeps stale data on reload with no pending indicator (ui.tsx:59); save buttons often have no busy label (ReviewAccounts.tsx:171, BannedEmails.tsx:85, Categories.tsx:205, Config toggles).
- X3 [trust] Pager `hasNext = rows.length === PAGE` shows Next on an exact full page (Listings.tsx:225, Quad.tsx:220, BannedWords.tsx:173, Announcements.tsx:140, DataRequests.tsx:105). The fix is deferred: needs logic change (see §5) (the list RPCs return no next-page signal).
- X4 [a11y-VoiceOver] Status and danger are conveyed by colour (red numerals in Health, DataRequests; amber/red pills) with the word usually present, but several KPI deltas rely on colour direction (Overview.tsx:166).
- X5 [disclosure] Heavy inline styling (Person 16, Metrics 15, ListingDetail 13) instead of shared classes makes density uneven.

#### Overview (/)
- Current: [Overview](screens/09-admin.md#09-page-overview). Six KPI tiles, "Needs attention", "Campuses" table and "Live activity" in one scroll (Overview.tsx:105-270).
- Problems:
  - [Hick] Four cards compete; the one thing staff must act on (open reports and held items) is the second block, and the Open reports tile turns red whenever any exist (Overview.tsx:166), so red is the default state, not a signal. [feedback]
  - [trust] Deltas show "+0 this week" with a hard-coded plus sign (:124, :139) and are built with a regex fix-up (:163).
  - [feedback] Auto-refresh every 60 s and 20 s with no visible refresh state (:38-41, :226-229; ui.tsx:59); the static "Live" pill (:236) suggests a stream.
  - [a11y-VoiceOver] Three of six tiles are links, three are not, with the same appearance (:121-158).
- Proposed layout: Top: "Needs attention" first as a full-width hairline list (reason as plain word, target, age, one "Open" link per row), then the 6 KPI tiles in a single row with delta as plain text and no colour unless the number is worse than last week, then Campuses table, then Live activity at the right on wide screens. One accent fill: the row action in Needs attention.
- Components: Page, Card, Kpi, Table, StatusPill (words), Segmented, EmptyState.
- Motion/haptic: none (desktop); no animation added.
- Copy changes: "All clear. Nothing is waiting." (Overview.tsx:183) -> "Nothing is waiting."; delta "+0 this week" -> "No change this week" (:124, :139); "Live" pill -> "Updates every 20 s" text.
- Logic needed?: no.
- Conflicts: none.

#### Reports and Appeals (/reports, /appeals)
- Current: [Reports](screens/09-admin.md#09-page-reports). Queue left, detail right, reason input and action buttons in the footer of the detail card (Reports.tsx:77-169, :334-341).
- Problems:
  - [Hick][disclosure] Detail card stacks evidence, reporter, chat button, person history and actions in one scroll (:240-322); the actions sit at the bottom, below the history, so the decision is made far from the evidence. [Fitts-thumb] (cursor distance)
  - [trust] One reason field serves both the audit log and the seller-visible message ("If you remove a listing, the seller sees this", :334-341); long placeholder disappears when typing. [loss-aversion]
  - [feedback] Chat read error is only a red paragraph (:289); "(logged)" is the only warning before an access that is audit-logged.
  - [feedback] Ban asks `confirm` while other irreversible actions go through the shared flow (:199 vs ui.tsx:829).
  - [a11y-target] Queue rows and Segmented use small desktop targets; selected row relies on background tint.
  - Empty "No open reports. Nice." (:113) is flippant in a moderation tool.
- Proposed layout: Detail card: header (person, reason, age), evidence quote, then the action bar docked at the top of the detail column (sticky): reason input on its own labelled line "Reason (saved to the audit log)" and a separate labelled line "Message to the seller (only when removing a listing)" if the existing single field can be split visually by help text only, otherwise keep one field with help text under it. History and chat read become collapsed sections ("Person history", "Read the whole chat (logged)") using native `details`. One accent fill: the recommended action.
- Components: Card, ReasonActions, Segmented, StatusPill, Field, Dialog (for the chat read confirm, replacing nothing else).
- Motion/haptic: none.
- Copy changes: "No open reports. Nice." -> "No open reports."; "Pick a report on the left." -> "Select a report."; "This report isn't about one person (or the account is gone)." -> "No person to show for this report."; placeholder (:334) -> shortened, with the seller-visible note as help text.
- Logic needed?: no.
- Conflicts: none.

#### People list and Person (/people, /people/$id)
- Current: [People](screens/09-admin.md#09-page-users), [Person](screens/09-admin.md#09-page-person). Person header packs 6 stats, 5 actions and 3 pills before 8 tabs (Person.tsx:219-275, :106-131).
- Problems:
  - [Hick][disclosure] Header shows everything at once; the right column repeats strikes, no-shows and blocks that also exist as tabs (Person.tsx:321-356, :726-868).
  - [loss-aversion] Suspend has a date reveal but no confirm; Ban confirms; "Clear strike" uses a browser prompt (:209, ui.tsx:757-759). A suspended or banned subject appears only as a pill and a line (:231, :245), no banner. [trust]
  - [feedback] Chats tab ignores an `admin_person_reports` error and silently downgrades "Open report" (:590-594).
  - [a11y-VoiceOver] 24-cell active-hours strip (:304-320) has no text equivalent noted; tab counts mix totals (Offers = made + received, :110).
  - [DynamicType] 16 inline styles (X5) make layout fragile at larger browser font sizes.
- Proposed layout: Header: avatar, name, status as plain words, one line of facts, 4 stats (drop the two least used: put Swipes and Saves into the Timeline tab header). Account actions in a "Moderation" overflow section: Pause, Suspend and Make active shown, Ban and Ask to re-verify behind a "More" disclosure. Right column limited to Account and the logged note. A status banner (text row with hairline) when paused, suspended or banned.
- Components: Page, Card, Stat, StatusPill, ReasonActions, Segmented, LoggedNote, Table, MoreList.
- Motion/haptic: none.
- Copy changes: Tab tooltip or label "Reports" -> "Reports (on and by)"; "Nothing in this view yet." (Person.tsx:448) -> "Nothing yet."; "Nobody has looked yet." (:878) -> "No one has opened this profile."
- Logic needed?: no.
- Conflicts: none.

#### Listings and Listing detail (/listings, /listings/$id)
- Current: [Listings](screens/09-admin.md#09-page-listings), [Listing detail](screens/09-admin.md#09-page-listingdetail). List with bulk bar; detail with hero, five tabs and funnel (ListingDetail.tsx:112-280).
- Problems:
  - [feedback][loss-aversion] Single Remove uses a browser prompt with no confirm (Listings.tsx:207) while bulk Remove uses `window.confirm` (:261-267) and the detail uses `window.confirm` (ListingDetail.tsx:96): three patterns for one action (X1).
  - [Hick] Row text stack: title, price, description, seller, campus, status, age, up to two buttons (Listings.tsx:158-179). [Fitts-thumb]
  - [trust] Reports tab shows fewer reports than exist without saying why until the footer (ListingDetail.tsx:423-439, :452); errors ignored.
  - [feedback] Pager shows Next when exactly 50 rows (X3, :225).
  - [a11y-VoiceOver] Bulk checkbox is labelled "Pick every listing on this page" (:131-136); good, but row checkboxes need the title in the label (not checked).
  - Hero numbers hand-built (ListingDetail.tsx:154-167) vs Stat on Person.
- Proposed layout: List: photo cell, title and price, seller and campus on one muted line, status as a word, one primary row action per status (Approve for held, Hold for active), others in a "More" menu. Bulk bar docked at the bottom of the viewport when anything is picked, with the inline reason input. Detail: use Stat for Views, Saves, Offers; move Funnel and Right-vs-left into a collapsed "How it performed"; the Reports tab gets an explicit note line "Showing the latest reports about this listing" with the existing disclaimer.
- Components: Table, ListingCell, StatusPill, Segmented, Pager, ReasonActions, Stat, Dialog.
- Motion/haptic: none.
- Copy changes: "Nobody here yet." (ListingDetail.tsx:300) -> "No swipes yet."; single-Remove prompt text (Listings.tsx:207) moved from browser prompt to the bulk bar's inline reason pattern.
- Logic needed?: no.
- Conflicts: none.

#### Quad (/quad)
- Current: [Quad](screens/09-admin.md#09-page-quad). Queue table plus a right column with an always-visible explainer or reveal form (Quad.tsx:98, :229-266, :333-389).
- Problems:
  - [trust] Explainer says 'Pick "Reveal author"' but the button reads "Reveal" (:263 vs :210); the explainer card shows owner-only instructions to moderators (:255-261).
  - [loss-aversion] Remove has no confirm and uses a browser prompt (:185-198; ui.tsx:757-759); reveal is guarded well (callout :347-350, authenticator code).
  - "5 per day" hard-coded in copy twice (:260, :349). [trust]
  - [feedback] Identical empty copy for held, hidden and reported views (:104). Pager X3 (:220).
- Proposed layout: Remove the permanent explainer card; show the reveal form only when "Reveal" is pressed (owner), and put one help line under the table title. Queue rows: body, hold reason as plain word, votes, reports, age, primary action by status.
- Components: Table, Segmented, Pill, ReasonActions, Card, Field, EmptyState.
- Motion/haptic: none.
- Copy changes: align explainer and button to "Reveal author" or "Reveal"; empty text per view: held "Nothing is held.", hidden "Nothing is hidden.", reported "No reported posts."
- Logic needed?: no (the "5 per day" limit reads from a server rule; showing it from config is deferred: needs logic change (see §5)).
- Conflicts: none.

#### Family: config-ish (Settings, Team, Banned words, App switches, Review accounts, Banned emails, Categories, Staging)
- Current: [Settings](screens/09-admin.md#09-page-settings) frame with nine sections.
- Problems: moderators land on a dead end at Team (Team.tsx:38-43; nav.ts:78); Team invite lacks an `errorMessage` fallback (Team.tsx:142-148); App switches flip after only a prompt, including maintenance-type ones, with no busy state (Config.tsx:87-103); Banned words delete chains confirm and prompt (BannedWords.tsx:158); the same address concept is named "Banned emails", "blocked-emails", "Blocked emails" and "Block email" (nav.ts:84, BannedEmails.tsx); Categories uses a hand-written load state and client-side next id (Categories.tsx:14-31, :109); Review accounts form pushes the table down (ReviewAccounts.tsx:27-37). [feedback][loss-aversion][trust][Hick]
- Proposed layout: Make the first visible tab for a moderator "Banned words" (read-only) instead of Team, or show Team's message in a sentence-case EmptyState with "Banned words are read-only for moderators." Use one reason pattern (inline reason field in a Dialog) for Delete, Unblock, Remove and Switch changes. Forms open in a Dialog instead of above the table. Use "Banned emails" everywhere.
- Components: Page, Card, Table, Dialog, Field, Button, Switch, EmptyState.
- Motion/haptic: none.
- Copy changes: "Only an owner can see and change the admin team." -> "Only owners can manage the team."; "Block email" -> "Ban email"; "Blocked emails" card -> "Banned emails"; "Saving…" kept but add to every save button.
- Logic needed?: no, except atomic category id, which is deferred: needs logic change (see §5).
- Conflicts: none.

#### Family: lists (Activity, Waitlist, Support, Meetups, Audit, Campuses, Announcements)
- Current: [Activity](screens/09-admin.md#09-page-activity), [Waitlist](screens/09-admin.md#09-page-waitlist), [Support](screens/09-admin.md#09-page-support), [Meetups](screens/09-admin.md#09-page-meetups), [Audit](screens/09-admin.md#09-page-audit), [Campuses](screens/09-admin.md#09-page-campus), [Announcements](screens/09-admin.md#09-page-announcements).
- Problems: Activity `?user` and `?listing` params exist but nothing links to them (Activity.tsx:50-59); CSV buttons export only the loaded page without saying so [trust]; Campus time zone is free text in detail but a select in Add school, default `America/New_York` hard-coded (Campus.tsx:240-246, :695-701, :605); "Set live" has no confirm; Announcements push confirm is `window.confirm` only (Announcements.tsx) and Pager X3 (:140); Support invite errors have an `errorMessage` fallback while Team does not. [feedback][loss-aversion][Hick]
- Proposed layout: Every list: filters in one row above a hairline table, a count of the rows loaded on this page (no total; totals are deferred: needs logic change (see §5)), Pager; CSV button labelled "Download rows on this page (CSV)". Destructive or visible-to-everyone actions (Set live, push announcement) use a Dialog with the consequence in one sentence and a primary fill on the confirm.
- Components: Table, Segmented, Pager, Dialog, Button, Field, Pill.
- Motion/haptic: none.
- Copy changes: CSV button -> "Download rows on this page (CSV)"; confirm text for Set live: "Set {school} live? Students can sign up right away."
- Logic needed?: no; full-set CSV and "rows shown of total" are deferred: needs logic change (see §5).
- Conflicts: none.

#### Family: metrics and read-only (Metrics, Ratings, DataRequests, Health)
- Current: [Metrics](screens/09-admin.md#09-page-metrics), [Ratings](screens/09-admin.md#09-page-ratings), [Data requests](screens/09-admin.md#09-page-datarequests), [System health](screens/09-admin.md#09-page-health).
- Problems: Metrics KPI strip ignores query errors and shows "…" forever (Metrics.tsx:180-183) [feedback]; Metrics has 15 inline styles and charts coloured with `color-mix` accent (Metrics.tsx:481) [a11y-contrast]; Health shows danger as red numerals and names a plan ("free tier", Health.tsx:80) that will go stale [trust]; DataRequests drives one cursor across two lists (DataRequests.tsx:105) [trust]; Health and Staging "Refresh" is manual only. 
- Proposed layout: KPI tiles with value, label and a text delta; an error state tile ("Could not load. Try again.") replacing the infinite "…"; Health groups "Needs attention" (failing jobs, stuck deletions, over 80% database) above the rest as a word list, not red numerals.
- Components: Kpi, Card, Bar, Table, ErrorState, Button.
- Motion/haptic: none.
- Copy changes: "free tier" -> "plan limit"; "Checking" -> "Checking…".
- Logic needed?: no.
- Conflicts: none.

<a id="states-rewritten"></a>
## 4. States rewritten

One table per slice. Component names: `SkeletonList`, `SkeletonGrid`, `SkeletonCard` (`apps/mobile/src/components/Skeleton.tsx:142,161,128`), `EmptyState`, `ErrorState`, `Banner`, `Toast`. Copy rules: sentence case, no emoji, no exclamation stacks, no "welcome" greetings for returning users, verbs on buttons (DESIGN_SYSTEM.md:15). Every changed `en.ts` key needs the same key changed in `es.ts`.

### States rewritten (01)

| Screen | State | Current copy (en key, en.ts:line) | Proposed copy | Next action | Component |
|---|---|---|---|---|---|
| Launch | Profile could not load | `states.errorTitle` (en.ts:91) "Couldn't load this" | unchanged | Try again; new "Sign out" (`launch.signOut`) | ErrorState |
| Launch | Offline | `states.offlineTitle` / `offlineBody` (en.ts:92-93) | unchanged | Try again | ErrorState |
| School email | Personal address | `signIn.personal` (en.ts:528) | "That's a personal email. Use your school email, ending in .edu." | Edit the field | Input (inline field error) |
| School email | Unknown school | `signIn.unknownBody` (en.ts:533) | "Join the waitlist and we'll email you when it opens." | Join the waitlist (docked) | Banner-style hairline card, Button |
| School email | Alumni or staff | `signIn.alumniTitle` / `alumniBody` (en.ts:530-531) | "Current students only. Alumni and staff emails can't join." | Use another email | Input (inline field error) |
| School email | Login, no account | `signIn.noAccountTitle` / `noAccountBody` (en.ts:537-538) | title unchanged (DEC 140); body "Check for a typo, or create an account with this email." | Create an account (docked) | Button |
| School email | Waitlist joined | `signIn.waitlistJoined` (en.ts:535) | "You're on the list. We'll email you when your school opens." (unchanged) | none | Toast |
| Verify code | Checking | none; `signIn.verifying` (en.ts:545) unused | "Checking the code" | wait | inline message line |
| Verify code | Wrong code | `signIn.wrongCode` (en.ts:546) | unchanged | Re-enter | OTPInput error |
| Verify code | Expired | `signIn.expired` (en.ts:548) | unchanged | wait (new code sent) | inline message line |
| Verify code | Locked | `signIn.locked` (en.ts:549) | unchanged | Resend code (docked) | Button |
| Verify code | Code not arriving | `signIn.spamHint` (en.ts:553) | "Not there yet? Check spam, or wait a minute." | Resend code | inline message line |
| Age check | Checking | `age.checking` (en.ts:560), label only | unchanged | wait | spinner (ActivityIndicator) |
| Age check | Invalid date | `age.invalidDate` (en.ts:567) | unchanged | Pick a date | inline error |
| Age check | Share age range required | `age.osRequiredBody` (en.ts:576-577) | "Where you live, the law asks Apple to share your age range with apps. We learn only 13 to 17 or 18 and older, never your birthday." | Share age range; Close signs out | Button |
| Not eligible | Under 13 | `age.blockedBody` (en.ts:570-571), card (en.ts:572-573) | body unchanged; card removed | Close | Button |
| Profile setup | Name missing | `profileSetup.nameEmpty` (en.ts:607) | unchanged | Type a name | Input (inline field error) |
| Profile setup | Photo upload failed | `profileSetup.uploadFailed` (en.ts:593) | "Photo didn't upload. Try again, or continue without it." | Try again | inline message with Button |
| Community rules | Loading | spinner (ActivityIndicator, `RulesScreen.tsx:74-85`) | rules render at once; Agree shows loading until config arrives | wait | Button loading |
| Community rules | Config failed | `states.errorTitle` (en.ts:91) | unchanged | Try again | ErrorState |
| Notifications | Denied | `primer.notifications.deniedTitle` (en.ts:137) "Notifications are off" | unchanged | Open Settings | PermissionPrimerView |
| Re-verify | Loading | spinner (ActivityIndicator, `ReverifyScreen.tsx:58-69`) | unchanged | wait | spinner (ActivityIndicator) |
| Re-verify | Footnote | `reverify.graduated` (en.ts:691-692) | "Graduated? You can close your account." | Close my account | link Button |
| Session expired | Wrong code | `sessionExpired.wrongCode` (en.ts:677) | unchanged | Re-enter or Resend code | OTPInput error |
| Waitlist | Loading | `waitlist.loading` (en.ts:2237) label only | unchanged | wait | SkeletonList |
| Waitlist | Error | `states.errorTitle` (en.ts:91) | unchanged | Try again; Sign out | ErrorState |
| Waitlist | Link copied | `waitlist.copied` (en.ts:2211) | unchanged | none | Toast |
| Campus open | Body | `unlocked.body` (en.ts:2242) | "{campus} reached {threshold} students. You're one of the first in." | List something | Button |
| Account status | Loading | none (`SkeletonList rows={4}`, `AccountScreens.tsx:54`) | unchanged, inside safe-area root | wait | SkeletonList |
| Account status | Error | `states.errorTitle` (en.ts:91) | unchanged | Try again; Sign out | ErrorState |
| Account status | Appeal accepted (ok) | `safety.appealDecided.overturned` (en.ts:1465) with action `safety.openChats` (en.ts:1460) | action label "Go to Discover" (`system.goHome`, en.ts:1781) | Go to Discover | EmptyState |
| Maintenance | Down | `system.maintenanceTitle` / `maintenanceBody` (en.ts:1772-1773) | unchanged | Try again | EmptyState |
| Maintenance | End time | `system.maintenanceUntil` (en.ts:1774) "Back around {time}." | unchanged, with the day added when not today | Try again | EmptyState |
| Update required | Old build | `system.updateBody` (en.ts:1769) | "This version is too old to keep working. Update to keep swapping." | Update OnlySwap | EmptyState |
| Link error | Bad link | `system.linkErrorBody` (en.ts:1778) | "It may be old, or the listing is gone." | Go to Discover | EmptyState |
| Not found | Unknown path | `system.notFoundBody` (en.ts:1780) | unchanged | Go to Discover | EmptyState |

### States rewritten (02)

| Screen | State | Current copy (en key, en.ts:line) | Proposed copy | Next action | Component |
|---|---|---|---|---|---|
| Discover | loading | `feed.loading` "Loading listings" (a11y only, en.ts:924) | unchanged | none | SkeletonCard |
| Discover | first-swipe hint | `feed.coachTitle` "Swipe to shop" (912), `feed.coachBody` (913), `feed.coachOk` "Got it" (917) | one line: "Swipe right to make an offer, left to skip. Tap a card for details." | ends on first swipe or tap | Text (meta) |
| Discover | end of deck | `feed.endTitle` "You've seen everything for now" (918), `feed.endBody` "New stuff usually shows up in the evening." (919) | "You're all caught up" / "Check back later for new listings." | List something; Refresh | EmptyState |
| Discover | day one | `feed.dayOneTitle` "It's early days here" (922), `feed.dayOneBody` (923) | "Be one of the first" / "Not much is listed yet. Post yours to get things started." | List something; Refresh | EmptyState |
| Discover | error (first page) | ErrorState default (`states.errorTitle` "Couldn't load this", en.ts:92) | unchanged | Try again | ErrorState |
| Discover | offline, swipes queued (new) | global `banner.offline` only (en.ts:77, `OfflineBanner` mounted at app/_layout.tsx:110); no queue-specific line | keep the global banner as the only banner; add `feed.offlineQueued` "Your swipes will be sent when you're back online." as a meta line above the action row | none, clears with the banner when online | Text (meta) |
| Discover | save failed | `feed.saveFailed` "Couldn't save that. Try again." (911) | unchanged | tap Save again from the toast-free list | Toast |
| Discover | undo skip / save | `feed.undoSkipped` "Skipped" (908), `feed.undoSaved` "Saved" (909) | unchanged | Undo for 5 s | Toast |
| Listing | loading | none (skeleton only, ListingScreen.tsx:170-178) | unchanged | none | SkeletonCard |
| Listing | hold | `feed.onHold` (943), `feed.onHoldBody` "Someone is meeting up for this. It may come back." (944), `feed.tellMe` (945) | status word "On hold" in ink2; body unchanged; button "Notify me" | Notify me | Button |
| Listing | hold, watching | `feed.watching` "We'll tell you" (949) | "We'll notify you" | none (disabled) | Button |
| Listing | sold | `feed.sold` "Sold" word plus disabled button (950; ListingScreen.tsx:285) | word "Sold" only, no dock | back | Text |
| Listing | seller away | `feed.sellerAway` button (947), `feed.sellerAwayBody` (948) | body only: "{name} paused their listings for now. Save it and check back later." | Save | Text |
| Listing | price firm | `feed.notOpenToOffers` "Price is firm" (953) | unchanged (in the meta line) | Make an offer | Text |
| Listing | gone | `feed.goneTitle` "This listing is gone" (955), `feed.goneBody` "It was sold, taken down or expired." (956) | unchanged | Back to Discover | EmptyState |
| Listing | blocked | `feed.blockedTitle` (957), `feed.blockedBody` (958) | unchanged | Back to Discover | EmptyState |
| Listing | other campus | `feed.otherCampusTitle` (959), `feed.otherCampusBody` (960) | unchanged; icon `building` to match the dev frame | Back to Discover | EmptyState |
| Listing | removed (owner) | `system.removedByAdmin` (en.ts:1786), `system.removedByAdminNoReason` (1787) | unchanged | Appeal this | Banner |
| Listing | in review (owner) | `system.underReview` (en.ts:1783) | unchanged | none | Banner |
| Listing | error | ErrorState default | unchanged | Try again | ErrorState |
| Listing | hide done | `feed.notInterestedDone` "We won't show it again" (965) | "Got it. We won't show this again." | none | Toast |
| Photo viewer | loading | nothing shown | spinner on black | none | spinner (ActivityIndicator) |
| Photo viewer | no photos | nothing shown | `feed.noPhotos` "No photos to show." | Close | Text (onPhoto) |
| Comments | empty | `comments.empty` "No comments yet" (2314), `comments.emptyBody` (2315) | unchanged | write a comment | EmptyState |
| Comments | closed / off | `comments.closedNote` (2317), `comments.offNote` (2316) | unchanged | none | Banner |
| Comments | gone | `comments.goneTitle` "This post is gone" (2333), `comments.goneBody` (2334) | unchanged | Go back | EmptyState |
| Stats | error (non-owner) | ErrorState default | unchanged (owner message deferred: needs logic change (see §5)) | Try again | ErrorState |
| Search | none typed, nothing stored | blank under the bar | unchanged (nothing to show) | type | none |
| Search | section label | `search.trending` "Popular right now" (983) | "Suggested" | pick a row | Text |
| Results | loading | none (skeleton only, ResultsScreen.tsx:100-101) | unchanged | none | SkeletonGrid |
| Results | no results | `search.noResultsTitle` "Nothing matches yet" (996), `search.noResultsBody` (997) | unchanged; primary is Clear filters when filters are on | Clear filters or Save search | EmptyState |
| Results | search saved | `search.searchSaved` (994) | "Search saved. You'll get alerts for new matches." | none | Toast |
| Results | save failed | `search.saveFailed` "Couldn't save the search. Try again." (995) | unchanged | tap Save search | Toast |
| Saved | empty items | `saved.emptyItemsTitle` "Nothing saved yet" (1030), `saved.emptyItemsBody` (1031) | unchanged | Start swiping | EmptyState |
| Saved | empty searches | `saved.emptySearchesTitle` (1032), `saved.emptySearchesBody` (1033) | unchanged | Search | EmptyState |
| Saved | price dropped | `saved.priceDropped` "Price dropped" (1027) | "Price dropped from {price}" | open item | Text |
| Saved | delete search | none (immediate) | `saved.deleteTitle` "Delete this saved search?" / `saved.deleteBody` "You'll stop getting alerts for it." | Delete / Cancel | ConfirmDialog |

### States rewritten (03)
| Screen | State | Current copy (en key, en.ts:line) | Proposed copy | Next action | Component |
|---|---|---|---|---|---|
| Sell photos | Empty, Next tapped | none (`sell.needPhoto` unused, en.ts:740) | "Add at least one photo to keep going." | Add photos | inline status line |
| Sell photos | Uploading | `sell.waitUploads` "Photos are still uploading." (en.ts:741) | "Photos are still uploading." (unchanged) | Wait, then Next | ProgressBar per tile (Progress.tsx), no skeleton |
| Sell photos | Upload failed | `sell.fixUploads` "Retry or remove the photos that didn't upload." (en.ts:742) | "Tap a photo to retry, or remove it." | Retry on the tile | inline status line, tile overlay |
| Sell photos | Reserve failed | `sell.reserveFailed` (en.ts:743) | "We couldn't start your listing. Check your connection and try again." (unchanged) | Pick photos again | inline status line |
| Sell photos | Photo limit | `sell.full` "That is 8 photos, the most a listing can have." (en.ts:739) | "8 photos is the most." | Remove one | inline status line |
| Sell photos | Draft saved | `sell.savedAgo` "Draft saved · {time}" (en.ts:724) | "Draft saved" (`sell.savedJustNow`, en.ts:723) | Continue | help line |
| Sell photos | Draft restored | `sell.restoreTitle` "Pick up where you left off?" (en.ts:745), buttons `sell.startOver`/`sell.continue` (en.ts:748-749) | unchanged; Start over opens "Discard this draft?" / "Your photos and details will be deleted." / "Discard draft" | Continue or Discard draft | Sheet, ConfirmDialog |
| Sell photos | Camera access, primer | `primer.camera.body` (en.ts:117) | "OnlySwap uses the camera only when you add photos or scan a book barcode. Nothing is recorded in the background." | Continue | PermissionPrimer |
| Sell photos | Camera or photos denied | `primer.camera.deniedTitle` "Camera is turned off" (en.ts:120), `primer.photos.deniedTitle` "Photos are turned off" (en.ts:128) | unchanged | Open Settings, or the other source | PermissionPrimer |
| Sell details | Errors on Next | `sell.fixCount` "{count} things to fix before you can post" (en.ts:814), `sell.fixOne` (en.ts:815) | "{count} things to fix" / "1 thing to fix" in the dock | Fix the fields | Banner kind error moved to a dock line |
| Sell details | Check text failed | `sell.errors.checkFailed` (en.ts:826) | "We couldn't check the text. Check your connection and try again." (unchanged) | Tap Next again | Banner kind warning |
| Sell details | Categories loading | none (`SellDetailsScreen.tsx:369-370`) | none | none | SkeletonList |
| Sell details | Categories failed | `ErrorState` default copy (`SellDetailsScreen.tsx:372-376`) | unchanged | Retry | ErrorState inline |
| Sell details | Give away | `sell.freeTitle` + `sell.freeBody` (en.ts:800-801) | "You choose who gets it." | Pick up by chips | inline meta line |
| Sell meetup | Spots loading | none (`SellMeetupScreen.tsx:179-180`) | none | none | SkeletonList |
| Sell meetup | No spots | `sell.noSpots` (en.ts:838) | "No meetup spots here yet. You and the buyer can pick one in chat." (unchanged) | Post | inline meta line |
| Sell meetup | Spots failed | `ErrorState` default (`SellMeetupScreen.tsx:181-186`) | unchanged | Retry | ErrorState inline |
| Sell meetup | Banned box not ticked | `sell.confirmBanned` (en.ts:852) | none; Post is disabled until the box is ticked | Tick the box | Button disabled, Checkbox |
| Sell meetup | Post failed | `sell.postFailed` (en.ts:854) | "We couldn't post it. Your draft is saved, try again in a moment." (unchanged) | Post again | Banner |
| Sell meetup | Reserved id gone (FORBIDDEN) | none, silent redirect (`SellMeetupScreen.tsx:111-117`) | "Your photos need to upload again." | Re-add or retry photos | Toast |
| Sell posted | Posted | `sell.postedBody` (en.ts:857-858) | "It's live on your campus. We'll tell you about saves and offers." | Share listing | SuccessCheck |
| Sell posted | In review | `sell.reviewTitle`/`sell.reviewBody` (en.ts:859-860) | unchanged | List another | SuccessCheck |
| Sell posted | Share card generating | `sell.cardPreparing` "Making the share preview" (en.ts:864) | "Preparing the preview" | Share (already enabled) | inline meta line |
| Sell posted | Share card failed | `sell.cardFailed` (en.ts:865) | "Preview unavailable. The link still works." | Share | inline meta line |
| Sell posted | Opened without a post | none (`SellPostedScreen.tsx:112-119`) | "Nothing to show here" | "Start a listing" | EmptyState |
| Sell scan | Scanning | `sell.scanBody` (en.ts:759) | "Point the camera at the barcode on the back cover." | Aim at the barcode | inline text |
| Sell scan | Looking up | `sell.scanLooking` "Looking up the book" (en.ts:760) | unchanged, with an activity indicator | Wait | spinner (ActivityIndicator) |
| Sell scan | Not a book / not found / offline | `sell.scanNotBook`, `sell.scanNotFound`, `sell.scanOffline` (en.ts:761-763) | unchanged | Scan again, or Type it instead | Banner kind warning |
| Post free food / news / Wanted | Validation errors | `campus.fixFirst` "Fix the highlighted fields to post." (en.ts:2153) | unchanged, one dock line; Toast and bottom Banner removed | Fix the fields | inline errors + dock line |
| Post free food / news / Wanted | Daily cap | `campus.errors.foodCap`/`newsCap`/`wantedCap` (en.ts:2167,2169,2170) | unchanged | Come back tomorrow | Banner kind error in the dock |
| Post free food | Spots loading | none (`PostFoodScreen.tsx:180-181`) | none | none | SkeletonList |
| Post free food | Spots failed | `ErrorState` default (`PostFoodScreen.tsx:182-187`) | unchanged | Retry | ErrorState inline |
| Post news / free food / Wanted | Photo upload failed | `campus.photoFailed` (en.ts:2148) | "The photo didn't upload. Try again." (unchanged) | Add the photo again | inline red line |
| Post news / free food / Wanted | Photo or camera access off | `campus.photosOff`/`campus.cameraOff` (en.ts:2150-2151) | unchanged | Open settings | Banner kind warning |
| Post a Wanted | Categories failed | none, block hidden (`PostWantedScreen.tsx:190`) | none (optional field stays hidden) | Post anyway | none |
| Post a Wanted | Posted | `campus.wantedPostedBody` (en.ts:2134) | "We'll tell you when someone lists one." (unchanged) | See the Feed | SuccessCheck |
| Post free food / news / Wanted | In review | `campus.reviewTitle`/`campus.reviewBody` (en.ts:2135-2136) | unchanged | Done | SuccessCheck |
| Edit listing | Loading | none (`MeScreens.tsx:725-730`) | none | none | SkeletonList |
| Edit listing | Not owner / removed / failed | `errors.NOT_FOUND` "We couldn't find that. It may have been removed." (en.ts:39) | unchanged | Go back | ErrorState |
| Edit listing | Saved | none (silent leave, `MeScreens.tsx:758-760`) | "Saved" (`me.saved_`, en.ts:1608) | none | Toast |
| Edit listing | Unsaved edits on back | none (`MeScreens.tsx:723`) | "Discard changes?" / "Your edits will be lost." / "Discard" | Keep editing or Discard | ConfirmDialog |
| Edit listing | Delete confirm | `me.deleteTitle`/`me.deleteBody` (en.ts:1663-1664) | unchanged | Delete listing | ConfirmDialog |
| Edit listing | Delete failed | handled: inline `errorCopy` text in the delete dialog, which stays open (`MeScreens.tsx:817-822`, `ConfirmDialog.tsx:53-62,72-75`) | unchanged | Delete listing again | ConfirmDialog (inline) |
| Relist | Default | `me.relistBody` (en.ts:1668) | "Your listing goes back to the top of Discover for 60 days." | Relist | inline text |
| Relist | Relisted | `me.relisted` "Relisted" (en.ts:1671) | unchanged | none | Toast |

### States rewritten (04)
| Screen | State | Current copy (en key, en.ts:line) | Proposed copy | Next action | Component |
|---|---|---|---|---|---|
| Inbox | loading | none | none | none | SkeletonList |
| Inbox | empty, Buying | `offers.emptyBuyingTitle` "Nothing you are buying yet" (en.ts:1140); `emptyBuyingBody` (en.ts:1141) | "No offers yet" / "Offers you make show up here." | Browse items (`offers.startSwiping`, en.ts:1155) | EmptyState |
| Inbox | empty, Selling | `offers.emptySellingTitle` (en.ts:1142); `emptySellingBody` (en.ts:1143) | "No offers yet" / "Offers on your listings show up here." | Sell something (`offers.sellSomething`) | EmptyState |
| Inbox | error | `errors` generic via ErrorState | unchanged | Retry | ErrorState |
| Inbox | iPad pane empty | `offers.paneEmptyTitle` "Pick a chat" (en.ts:1160) | unchanged | none | EmptyState |
| Offer | open, my turn | `offers.status.pending_seller` "{name} offered {amount}" (en.ts:1164) | label unchanged; visible line `offers.statusShort.pending_seller` "{name} offered" (es "{name} ofreció") | Accept, Counter, Decline | Button (dock) |
| Offer | open, waiting | `offers.status.pending_buyer` (en.ts:1165) | label unchanged; visible line `offers.statusShort.pending_buyer` "You offered. Waiting for {name}." (es "Ofreciste. Esperando a {name}.") | Withdraw offer | Button (text) |
| Offer | expiry line | `offers.expiresIn` "Expires {when}" (en.ts:1176) | "Expires in 6 hours" | none | Text meta |
| Offer | accepted | `offers.status.accepted` "Accepted at {amount}" (en.ts:1168) | label unchanged; visible line `offers.statusShort.accepted` "Accepted" (es "Aceptada") | Open chat | Button |
| Offer | declined | `offers.status.declined` "Declined" (en.ts:1169) | "Declined" plus reason when present | Offer again (buyer, active listing) | Button |
| Offer | expired | `offers.status.expired` (en.ts:1170) | "Expired" | Offer again | Button |
| Offer | withdrawn | `offers.status.withdrawn` (en.ts:1171) | "Withdrawn" | Offer again | Button |
| Offer | sold elsewhere | `offers.status.auto_declined` "This sold to someone else" (en.ts:1172) | unchanged | none | Text |
| Offer | on hold with someone else | `offers.status.hold_other` (en.ts:1174) | unchanged | none | Text |
| Offer | listing closed | `offers.status.listing_closed` (en.ts:1173) | unchanged | none | Text |
| Offer | last round | `offers.lastRound` "This is the last round. They can accept or decline." (en.ts:1192) | "Last round. They can accept or decline." | Accept / Decline | Text meta |
| Offer | withdraw confirm | `offers.withdrawTitle` / `withdrawBody` (en.ts:1189-1190) | unchanged | Withdraw / Cancel | ConfirmDialog |
| Offer | error | via `errorText` | unchanged | Retry | Banner |
| Offer | loading | none | none | none | SkeletonList |
| Make an offer | unavailable | `offers.unavailableTitle` "This item isn't taking offers" (en.ts:1120) | unchanged | Close | EmptyState |
| Make an offer | paused | `offers.pausedTitle` "Offers are paused" (en.ts:1121) | unchanged | Close | EmptyState |
| Make an offer | low offer | `offers.lowWarning` (en.ts:1100) | "Under half the asking price. The seller may say no." (drops "usually declined": no API data on decline rates) | Edit amount | Text meta (amber) |
| Make an offer | sent | `offers.sentTitle` "Offer sent"; `sentBody` (en.ts:1116) | unchanged | Go to Inbox / Keep swiping | Button, SuccessCheck |
| Offers on listing | empty | `offers.noOffers` / `noOffersBody` (en.ts:1195-1196) | "No offers yet" / "Offers show up here." | none | EmptyState |
| Mark sold | confirm (new) | none | "Mark as sold?" / "Other chats about this item will close." | Mark sold / Cancel | ConfirmDialog |
| Mark sold | done (new) | none | "Marked as sold" | none | Toast |
| Chat | first message | `chat.safetyTitle` + `safetyBody` (en.ts:1207-1209) | unchanged | none | Text meta |
| Chat | pending | a11y only `chat.sending` "Sending" (en.ts:1204) | visible "Sending" under the bubble | none | Text meta |
| Chat | failed | `chat.failed` "Didn't send. Tap to retry." (en.ts:1205) | unchanged | Tap to retry | Text meta |
| Chat | scam hint | `chat.scamHint.*` (en.ts:1210-1214) | unchanged | none | Text meta (amber) |
| Chat | blocked | `chat.blocked` "You can't message each other." (en.ts:1223) | unchanged | none | Banner |
| Chat | closed | `chat.closed` "This chat is closed." (en.ts:1222) | unchanged | none | Banner |
| Chat | deleted user | `chat.blocked` shown (ChatScreen.tsx:437-441) | "This account was deleted." (new `chat.deletedBanner`) | none | Banner |
| Chat | new-contact photo | `chat.tapToView` "Tap to view" (en.ts:1252) | unchanged | Tap to reveal | Text on photo |
| Chat | photo failed | `chat.photoFailed` (en.ts:1251) | unchanged | Try again | Banner |
| Chat | loading | none | none | none | SkeletonList |
| Chat | empty thread | `chat.empty` "Say hi and plan the pickup." (en.ts:1227), unused | not shown (a chat always opens with a system row) | none | none |
| Chat details | hide done | `chat.hideDone` (en.ts:1236) | "Chat hidden. It comes back if they message you." | none | Toast |
| Did it sell? | question | `deal.didItSellTitle` "Did it sell?" (en.ts:1350); buyer `didYouGetItTitle` | unchanged | Yes / Not yet / Fell through | Button |
| Did it sell? | loading title | none (wording flips, DealScreens.tsx:74) | hold title until the chat loads | none | SkeletonList |
| Did it sell? | fell through | `deal.fellThroughTitle` "Close this deal?" (en.ts:1355) | unchanged | Close deal / Cancel | ConfirmDialog |
| Plan the pickup | no spots | `meetup.noSpots` (en.ts:1289) | unchanged | Type a public place | Text |
| Rate | waiting | `deal.waitingTitle` / `waitingBody` (en.ts:1382-1383) | "Thanks for rating" / "You'll see their rating if they rate you. They'll see yours once they rate, or in 7 days." (es.ts same key, same meaning) | Done | Button, SuccessCheck |
| Rate | revealed | `deal.revealedTitle` "Your ratings" (en.ts:1384) | "Ratings" plus "You said" and "{name} said" | Done | ListRow |
| Meetup day | cancelled | `meetup.cancelled` (en.ts:1333) | unchanged | Pick another time | Banner |
| Meetup day | completed / no-show | none (no banner, MeetupDayScreen.tsx:192) | new short line, e.g. "Meetup done." | none | Text |
| Meetup day | handoff wrong | `meetup.handoffWrong` (en.ts:1269) | unchanged | Retry | Banner |

### States rewritten (05)
| Screen | State | Current copy (en key, en.ts:line) | Proposed copy | Next action | Component |
|---|---|---|---|---|---|
| Feed | loading | `campus.loading` "Loading posts" (en.ts:1992) | no visible text; keep the label for VoiceOver | none | SkeletonList |
| Feed | empty, All | `campus.empty.all` "Quiet around campus right now" / "News, free food, giveaways, Wanted posts and new listings show up here." (en.ts:2038-2039) | "Quiet around campus" / "News, free food, giveaways and new listings show up here." | List something | EmptyState |
| Feed | empty, News | `campus.empty.news` "No news yet" / "Got an event, club news or something people should know? Post it." (en.ts:2042-2044) | "No news yet" / "Got an event or club news? Post it." | Post news | EmptyState |
| Feed | empty, Free food | `campus.empty.food` "No free food right now" / "Turn on free food alerts in notification settings to hear about it first." (en.ts:2046-2048) | "No free food right now" / "Turn on free food alerts to hear first." | Post free food | EmptyState |
| Feed | empty, Wanted | `campus.empty.wanted` "No Wanted posts yet" / "Need something? Ask for it, and anyone who has one can list it for you." (en.ts:2054-2056) | "No Wanted posts yet" / "Need something? Ask, and anyone who has it can list it for you." | Ask for something | EmptyState |
| Feed | empty, This week | `campus.empty.new` "Nothing new this week" / "Listings from the last 7 days show up here." (en.ts:2058-2060) | "Nothing new this week" / "Listings from the last 7 days show up here." (unchanged) | List something | EmptyState |
| Feed | error (first load) | generic ErrorState (errors section, en.ts:33+) | unchanged | Retry | ErrorState |
| Feed | save failed | `campus.saveFailed` "Couldn't save that. Try again." (en.ts:2007) | unchanged | none (toast) | Toast |
| Feed | like failed | `comments.likeFailed` "Your like did not save. Try again." (en.ts:2332) | "Couldn't save your like. Try again." | none (toast) | Toast |
| Feed | loading more | `campus.loadingMore` "Loading more" (label only) | unchanged | none | spinner (ActivityIndicator) |
| Quad | status loading / cold link | none (All feed shows first, CampusFeedScreen.tsx:110-111) | no text | none | SkeletonList |
| Quad | off | `quad.offTitle` "The Quad isn't on at your school yet" / `offBody` "It opens campus by campus. Everything else in OnlySwap works as usual." (en.ts:1827-1828) | "The Quad isn't open at your school yet" / "It opens campus by campus." | Go to Discover | EmptyState |
| Quad | welcome error | error text via `errorText` (QuadWelcome.tsx:43) | unchanged | Enter the Quad (retry) | Banner |
| Quad | empty, Hot / New | `quad.emptyTitle` "Nobody has posted yet" / `emptyBody` "Get it started. A few ideas:" (en.ts:1817-1819) | "Nobody has posted yet" / "Start it off. A few ideas:" | Write the first post | EmptyState |
| Quad | empty, Top | `quad.topEmptyTitle` "No top posts this week" / `topEmptyBody` "Vote on posts in Hot and New and the best ones land here." (en.ts:1825-1826) | "No top posts this week" / "Vote in Hot and New and the best ones land here." | Open Hot (set sort chip) | EmptyState |
| Quad | error | generic ErrorState | unchanged | Retry | ErrorState |
| Quad | vote failed | `quad.voteFailed` "Your vote didn't go through. Try again." (en.ts:1853) | "Couldn't save your vote. Try again." | none (toast) | Toast |
| Quad thread | post gone | `quad.unavailableTitle` "This post isn't available" / `unavailableBody` "It may have been removed, hidden or deleted." (en.ts:1872-1873) | unchanged | Back to the Quad | EmptyState |
| Quad thread | no replies | `quad.noReplies` "No replies yet." (en.ts:1880) | "No replies yet. Add one below." | Focus the reply field | Text (inline) |
| Quad thread | replies off | `quad.repliesOffNote` "The poster turned off replies." (en.ts:1879) | unchanged | none | Banner |
| Quad thread | reply held | `quad.held.*` via `heldText` (en.ts:1931-1939) | "A person will look at your reply before it shows up." (all held variants shortened to this when reason is `other`) | none | Banner |
| Quad new | post blocked | `quad.blockedTitle` "This can't go on the Quad" + `blocked.*` (en.ts:1913-1925) | title unchanged; reasons shortened as above | Edit post / Make it a listing | Sheet (OutcomeSheet) |
| Quad new | post held | `quad.heldTitle` "Sent for review" + `held.*` (en.ts:1928-1941) | unchanged title; one reason sentence | Back to the Quad | Sheet (OutcomeSheet) |
| Quad new | post failed | `errorText(e)` banner + toast (QuadNewPostScreen.tsx:175-177) | unchanged | Post again | Banner, Toast |
| Quad new | photo failed | `quad.photoFailed` "The photo didn't upload. Try again." (en.ts:1897) | unchanged | Add a photo | Banner |
| Your Quad | empty, posts | `quad.mineEmptyPosts` "You haven't posted yet" (en.ts:1947) | "You haven't posted yet. Your posts show up here." | none | EmptyState |
| Your Quad | empty, replies | `quad.mineEmptyReplies` "You haven't replied to anything yet" (en.ts:1948) | "You haven't replied yet. Your replies show up here." | none | EmptyState |
| Your Quad | appeal sent | `quad.appealed` "Appeal sent. A person will review it." (en.ts:1957) | unchanged | none | Toast |
| Quad activity | empty | `quad.activityEmptyTitle` "Nothing yet" / `activityEmptyBody` "Replies and milestones on your posts show up here." (en.ts:1960-1961) | "No activity yet" / "Replies on your posts show up here." | none | EmptyState |
| Muted | no hidden | `quad.noHidden` "You haven't hidden anyone." (en.ts:1968) | "No one hidden." | none | Text (inline) |
| Muted | no words | `quad.noKeywords` "No muted words." (en.ts:1976) | unchanged | Mute a word | Text (inline) |
| Muted | invalid word | `quad.keywordInvalid` "Use 2 to 30 characters." (en.ts:1975) | unchanged | fix field | Input error |

### States rewritten (06)
| Screen | State | Current copy (en key, en.ts:line) | Proposed copy | Next action | Component |
|---|---|---|---|---|---|
| Profile tab | loading | none (skeleton, MeScreens.tsx:129) | none | none | SkeletonList |
| Profile tab | empty (Active) | `me.sellNudgeTitle` "Got something to sell?" + `me.sellNudgeBody` "It takes a minute. Most things get an offer the same week." (en.ts:1587-1588) | "Nothing listed yet." | List something (`me.sellNudge`, en.ts:1589) | EmptyState |
| Profile tab | empty (Sold) | `me.soldEmpty` "Nothing sold yet." (en.ts:1583) | "Nothing sold yet." | none | EmptyState |
| Profile tab | error | `errors` generic via ErrorState (MeScreens.tsx:130) | keep | Try again | ErrorState |
| Edit profile | save error | generic `errorText` in a bottom banner (MeScreens.tsx:433) | keep copy, pin above the docked button | Save again | Banner |
| Edit profile | save success | `me.saved_` "Saved" (en.ts:1608) | "Profile saved" | back to profile | Toast |
| My listings | empty | `me.listingsEmptyTitle` "Nothing listed yet" / `listingsEmptyBody` "Your listings show up here." (en.ts:1612-1613) | "Nothing here yet." (Active: "Nothing listed yet.") | List something on Active only | EmptyState |
| My listings | away on | `me.awayOn` "Your listings are paused" (en.ts:1627) | "Listings paused" | Turn off in the same row | Toast |
| My listings | away off | `me.awayOff` "Your listings are back" (en.ts:1628) | "Listings back" | none | Toast |
| Seller profile | gone or deleted | `profileView.goneTitle` / `goneBody` (en.ts:1074-1075) | "Profile not available" / "This account may be deleted or not on your campus." (keeps the hedge: `access: 'gone'` does not say why, profiles/api.ts:41) | Go back | EmptyState |
| Seller profile | blocked | `profileView.blocked` / `blockedBody` (en.ts:1071-1072) | "You blocked {name}" / "You won't see each other's listings or messages." | Unblock (`profileView.unblock`, en.ts:1073) | EmptyState |
| Seller profile | no listings | `profileView.noListings` "Nothing listed right now." (en.ts:1060) | "No listings right now." | none | plain text |
| Seller profile | no reviews | `profileView.noReviews` "No reviews yet." (en.ts:1062) | "No reviews yet." | none | plain text |
| Seller profile | block failed | handled: inline `errorCopy` text in the block dialog, which stays open (ProfileViewScreen.tsx:260-264, ConfirmDialog.tsx:53-62,72-75) | unchanged | Block again | ConfirmDialog (inline) |
| Seller profile | unblock failed | not handled (EmptyState action has no catch, ProfileViewScreen.tsx:109-112) | "Couldn't unblock. Try again." (reuse the new Blocked accounts key) | Try again | Toast |
| Settings | sign out failed | not handled: "Sign out" calls `void signOut('local')` with no catch (SettingsScreens.tsx:63-67,146); "Sign out everywhere" closes its dialog before awaiting (:160-163), so the dialog's inline error never shows | "Couldn't sign out. Try again." (new key) | Try again | Toast |
| Notifications | OS off | `notificationsScreen.osOff` (en.ts:1403) | "Notifications are off for OnlySwap in your phone settings." | Open settings (`openSettings`, en.ts:1404) | Banner |
| Notifications | save failed | `notificationsScreen.saveFailed` (en.ts:1432) | "Couldn't save that. Try again." | toggle again | Toast |
| Privacy | save failed | none (silent revert, SettingsScreens.tsx:180-184) | "Couldn't save that. Try again." (reuse `notificationsScreen.saveFailed`) | toggle again | Toast |
| Blocked accounts | empty | `safety.blockedEmptyTitle` / `blockedEmptyBody` (en.ts:1488-1489) | "No blocked accounts" / "People you block show up here." | none | EmptyState |
| Blocked accounts | unblock failed | none (silent refetch, AccountScreens.tsx:238-246) | "Couldn't unblock. Try again." (new key) | Try again | Toast |
| Appearance | icon change failed | `settings.appIconFailed` (en.ts:1713) | "Couldn't change the icon. Try again." | pick again | Toast |
| School email | sent | `settings.schoolSent` (en.ts:1732) | "Check {email} for a link or code." | Open mail or wait; no resend now | Banner |
| Delete account | error | `safety.deleteFailed` (en.ts:1575) | "Couldn't delete your account. Try again or contact support." | Try again | Banner |
| Download your data | offline | `settings.dataOffline` "You're offline. Connect to ask for your data." (en.ts:1763) in an inline offline `Banner` (SettingsScreens.tsx:465), shown alongside the app-wide `OfflineBanner` | "Connect to ask for your data." (es: "Conéctate para pedir tus datos."); the global banner already says you're offline | reconnect | Text (meta) under the disabled button |
| Download your data | rate limited | `settings.dataRateLimited` (en.ts:1762) | "You already asked today. Ask again after {time}." | wait | Banner |
| Download your data | sent | `settings.dataSentTitle` "On its way" / `dataSent` (en.ts:1760-1761) | "On its way" / "Check your school email in a few minutes." | none | Banner |

### States rewritten (07)

| Screen | State | Current copy (en key, en.ts:line) | Proposed copy | Next action | Component |
|---|---|---|---|---|---|
| Notifications | loading | none (skeleton rows) | none | none | SkeletonList |
| Notifications | empty | `notificationsScreen.emptyTitle` (en.ts:1398) "No notifications yet"; `emptyBody` (en.ts:1399) "Offers, messages and meetup updates show up here." | "No notifications yet" / "Offers, messages and meetup updates appear here." | "Notification settings" (secondary) | EmptyState |
| Notifications | error | generic `ErrorState` copy (`errors`/`states` sections, strings/en.ts:33,90) | unchanged | Retry | ErrorState |
| Notifications | unread count 100+ | label "{label}, {count} new" with count `99+` (`navCopy.tabWithBadge`, en.ts:108) | unchanged | none | IconButton badge (bell) |
| Safety center | spots loading | none (skeleton rows) | none | none | SkeletonList |
| Safety center | spots empty | not handled (no branch found, `SafetyScreens.tsx:145,148`) | "No meetup spots listed for your campus yet." (new `safety.spotsEmpty`) | Keep "Call 911" docked | EmptyState (inline) |
| Safety center | spots error | generic `ErrorState` inline (`SafetyScreens.tsx:143`) | unchanged | Retry | ErrorState |
| Report update | loading | none (2-row skeleton, `SafetyScreens.tsx:39`) | none | none | SkeletonList |
| Report update | received | `safety.reportReceivedBody` (en.ts:1483) "We got your report. A person looks at it, usually within a day." | unchanged | Done | Banner-free plain text |
| Report update | reviewed | `safety.reportReviewedBody` (en.ts:1484-1485) | "We reviewed your report. We keep details private to protect everyone." (outcome-neutral: `get_my_report` returns `reviewed` for both dismissed and actioned, 0011_rpcs_safety.sql:105) | Done | Banner-free plain text |
| Report update | error | generic `ErrorState` (`SafetyScreens.tsx:40`) | unchanged | Retry | ErrorState |
| Help | message sent | `safety.contactSent` (en.ts:1568) "Thanks. We'll reply by email." | unchanged | Done (closes the sheet) | SuccessCheck |
| Help | send error | server text or `banner.botCheckFailed` (en.ts:80) "We couldn't confirm you're a person. Reload the page and try again." | "We couldn't verify you. Reload the page and try again." (es.ts needs same key) | Send again | Banner |
| Email access | invalid contact | `emailAccess.contactInvalid` (en.ts:701) "Check the email. We need it to reply." | unchanged | Fix field | Input (inline error) |
| Email access | empty message | `emailAccess.messageEmpty` (en.ts:706) "Add a short note so we can help." | unchanged | Fix field | red meta text, move to a Banner |
| Email access | sent | `emailAccess.sentTitle` (en.ts:709) "We got your message"; `sentBody` (en.ts:710) "We'll reply to {email}. Keep an eye on your spam folder too." | unchanged | Done | SuccessCheck (replace the mail GlyphTile) |
| Legal | missing page | `legal.missing` (en.ts:1676) "We couldn't find that page"; `legal.back` (en.ts:1677) "Go back" | unchanged | Go back | EmptyState |
| Appeal sheet | error | server text (`AppealSheet.tsx:45,71`) | unchanged | Send again | Banner |
| Appeal sheet | sent | `safety.appealed` (en.ts:1462) "Appeal sent. A person will review it." | unchanged | none (Toast + line) | Toast |
| Removal banner | removed with reason | `systemCopy.removedByAdmin` (en.ts:1786) "OnlySwap removed this listing. Reason: {reason}" | unchanged | Appeal (secondary) | Banner |
| Removal banner | removed no reason | `systemCopy.removedByAdminNoReason` (en.ts:1787) "OnlySwap removed this listing. Other students can no longer see it." | unchanged | Appeal (secondary) | Banner |
| Report sheet (usage) | sent | `report.sentTitle` (en.ts:220) "Report sent"; `sentBody` (en.ts:221) "Thanks for telling us. We'll look into it, usually within a day." | unchanged | Done | SuccessCheck |
| Report sheet (usage) | duplicate | `report.duplicateTitle` (en.ts:224) "Already reported" | unchanged | Done | Sheet |

Haptic references found in this slice: none. No `haptic(` call exists in `features/notifications/*`, `features/safety/*`, `features/help/*`, `features/legal/*` or `components/ReportSheet.tsx`; the only haptics in the app are `success` (offer accepted `OfferScreen.tsx:95`, offer sent `OfferSheetScreen.tsx:165`, listing posted `SellPostedScreen.tsx:69`, plus `SellScanScreen.tsx:73`, `VerifyScreen.tsx:144`), `warning` (`SellDetailsScreen.tsx:265`, `OTPInput.tsx:65`) and `selection` (`RulesScreen.tsx:163`). Button has an opt-in `hapticOnPress` for success only (`apps/mobile/src/components/Button.tsx:26,81`), unused in this slice.

### States rewritten (08)

| Screen | State | Current copy (en key, en.ts:line) | Proposed copy | Next action | Component |
|---|---|---|---|---|---|
| Any list or screen (EmptyState) | empty | caller-supplied `title` and `body` (EmptyState.tsx:14-15), no default | Rule: title 2 to 4 words naming the thing, one body line under 60 characters, action is a verb | docked primary action | EmptyState |
| Any list or screen (ErrorState) | load error, generic | `states.errorTitle` "Couldn't load this" (en.ts:92) with `errors.*` body | keep "Couldn't load this" | "Try again" docked (`dark`) | ErrorState |
| Any list or screen (ErrorState) | load error, offline | `states.offlineTitle` "You're offline" (en.ts:93), `states.offlineBody` "Check your connection and try again." (en.ts:94) | keep both | "Try again" docked | ErrorState |
| Any list or screen | retry button | `states.retry` "Try again" (en.ts:95) | keep | n/a | ErrorState |
| Any screen | loading | `states.loading` "Loading" (en.ts:91, screen reader label) | keep | none | SkeletonList / SkeletonGrid / SkeletonCard |
| Global | offline banner | `banner.offline` "You're offline. Some things won't update until you reconnect." (en.ts:77) | "You're offline" | none, clears itself on reconnect | Banner |
| Global | toast with undo | `toast.undo` "Undo" (en.ts:73) | keep | tap Undo within 5 s | Toast |
| Global | toast, contrast | no copy change; icon tone `inverse` on the ink pill (Toast.tsx:72) | n/a | tap to dismiss | Toast |
| App crash fallback | crash | `crash.title` "Something went wrong" (en.ts:100); `crash.body` "OnlySwap hit a problem on this screen. Try again, and if it keeps happening, close and reopen the app." (en.ts:101); `crash.retry` "Try again" (en.ts:102) | body: "Something broke on our end. Try again, or close and reopen the app." | "Try again" docked (`dark`) | CrashScreen |
| ShellScreen (unused scaffold) | placeholder | `shell.comingSoon` "This screen is being built." (en.ts:29) | none; delete the component and key | none | spinner-free placeholder, remove |

es.ts needs the same keys updated for `banner.offline` and `crash.body`; the other keys are unchanged.

### States rewritten (09 shared)

| Screen | State | Current copy (location) | Proposed copy | Next action | Component |
|---|---|---|---|---|---|
| Admin gate | loading | none, mark only (`auth.tsx:49-54`) | "Checking your session" after 300 ms; after 10 s "This is taking longer than usual." | Reload | blank `.gate` with `.mark.lg` (no skeleton) |
| Admin gate | session expired | none (`auth.tsx:23-27`) | unchanged in Phase 3; deferred: needs logic change (see §5) ("Your session ended. Sign in again." once the gate keeps the reason) | Email field | `.gate-card` line |
| Admin gate | access check failed | none, shows sign-in form (`auth.tsx:29`) | unchanged in Phase 3; deferred: needs logic change (see §5) ("We could not check your access. Try again." once the gate keeps the reason) | Try again | `.gate-card` line |
| Email sign-in | code sent | none (`auth.tsx:119`) | "We sent a code to {email}." | Enter code | `.gate-card` line |
| Email sign-in | pending | none (`auth.tsx:110-128`) | button reads "Sending…" / "Signing in…" | none | `Button` disabled |
| Email sign-in | error | `errorMessage` text (`auth.tsx:152`) | same text, announced with `role="alert"` | Fix and retry | `p.error` |
| Not an admin | denied | "This account doesn't have access to the console." (`auth.tsx:59`) | "This account is not on the admin list." | Sign out | `.gate-card` |
| Two-step check | pending | none (`auth.tsx:198-206`) | "Checking…" on the Verify button; code field cleared on error | Retry | `Button` disabled |
| Two-step check | setting up | verify text with a no-op button (`auth.tsx:224,200`) | "Preparing your setup code…" | wait | `.gate-card` line, Verify disabled |
| Shell | counts unavailable | badges vanish (`session.tsx:72`) | tooltip "Counts unavailable" on the nav group | none | `span.c` omitted |
| Page not found | not found | "There's no page at this address." / "It may have moved in the new console." (`shell.tsx:135-136`) | "No page at this address" / "{pathname} is not a page in this console." | Go to Overview | `Page` + `Button` link |
| Global search | under 2 characters | nothing (`search.tsx:88`) | "Type 2 or more letters." | type | `.pop .empty` |
| Global search | no results | `No matches for "{q}"` (`search.tsx:92`) | unchanged | refine | `.pop .empty` |
| SearchPicker | loading | nothing (`pickers.tsx:104-106`) | "Searching…" | wait | `.pop .empty` |
| Loadable / MoreList | loading | skeleton rows (`ui.tsx:707-716`) | flat pulse rows after 300 ms | none | `Loading` |
| Loadable | empty | "Nothing here right now." (`ui.tsx:61`) | page-specific line; keep default | page action | `EmptyState` |
| Loadable | error | raw `errorMessage` + "Try again" (`ui.tsx:701-702`) | same text; stale data stays with a banner on refresh failure | Try again | `ErrorState` |
| ReasonActions | validation | "Add a reason of at least 3 characters." (`ui.tsx:827`) | live count "3 characters minimum", shown before submit | type | `.counter` |
| ReasonActions | pending | buttons disabled, no text (`ui.tsx:861`) | primary reads the verb in progress, for example "Banning…" | wait | `Button` |
| ReasonActions | result | "Done" (`ui.tsx:834`) | "Done. Logged to the audit log.", fades after 6 s (per-action wording deferred: needs logic change (see §5)) | View | inline `p.ok` |
| ActionButton | prompt and confirm | native `window.prompt` / `window.confirm` (`ui.tsx:757-760`) | `Dialog` with effect line, reason field, Cancel and one primary | Confirm | `Dialog` |

### States rewritten (09 pages)

| Screen | State | Current copy (key, file:line) | Proposed copy | Next action | Component |
|---|---|---|---|---|---|
| Overview | empty, Needs attention | inline, Overview.tsx:183 "All clear. Nothing is waiting." | "Nothing is waiting." | none | EmptyState |
| Overview | empty, Live activity | inline, Overview.tsx:253 "No activity yet." | "No activity yet." | none | EmptyState |
| Reports | empty, Open | inline, Reports.tsx:113 "No open reports. Nice." | "No open reports." | switch to Actioned | EmptyState |
| Reports | empty, other | inline, Reports.tsx:113 "Nothing here." | "No reports in this view." | switch view | EmptyState |
| Reports | no selection | inline, Reports.tsx:163 "Pick a report on the left." | "Select a report." | select a row | EmptyState |
| Reports | target gone | inline, Reports.tsx:325 "This report isn't about one person (or the account is gone)." | "No person to show for this report." | decide from evidence | EmptyState |
| Reports | chat read error | inline red paragraph, Reports.tsx:289 | "Could not read the chat. Try again." | Try again | ErrorState |
| Appeals | empty | inline, Reports.tsx:403 "No appeals waiting." | "No appeals waiting." | none | EmptyState |
| Person | empty tab | inline, Person.tsx:448 "Nothing in this view yet." | "Nothing yet." | none | EmptyState |
| Person | access log empty | inline, Person.tsx:878 "Nobody has looked yet." | "No one has opened this profile." | none | EmptyState |
| Listing detail | swipes empty | inline, ListingDetail.tsx:300 "Nobody here yet." | "No swipes in this view." | switch filter | EmptyState |
| Listing detail | reports tab error | not handled (no branch found), ListingDetail.tsx:423-434 | "Could not load reports. Try again." | Try again | ErrorState |
| Listings | empty | Loadable default, ui.tsx:61 "Nothing here right now." | "No listings in this view." | change filter | EmptyState |
| Quad | empty, held | inline, Quad.tsx:104 "Nothing here right now." | "Nothing is held." | none | EmptyState |
| Quad | empty, reported | inline, Quad.tsx:104 | "No reported posts." | none | EmptyState |
| Metrics | KPI error | "…" shown forever, Metrics.tsx:180-183 | "Could not load." with Try again | Try again | ErrorState |
| Team | moderator blocked | inline, Team.tsx:41 "Only an owner can see and change the admin team." | "Only owners can manage the team." | open Banned words | EmptyState |
| Settings | blocked tab | inline, Settings.tsx:51 "Only the owner can open this section." | "Only owners can open this section." | go to Team or Banned words | EmptyState |
| Banned words | empty | inline, BannedWords.tsx:114 "No terms match." | "No terms match. Clear the filters." | clear filters | EmptyState |
| App switches | save pending | not handled (no branch found), Config.tsx:87-103 | button text "Saving…" and switch disabled | wait | Switch |
| Review accounts | save pending | not handled (no branch found), ReviewAccounts.tsx:171 | "Saving…" | wait | Button |
| Banned emails | save pending | not handled (no branch found), BannedEmails.tsx:85 | "Saving…" | wait | Button |
| Data requests | empty | inline, DataRequests.tsx:79, :99 "No deletions yet." / "No exports yet." | same | none | EmptyState |
| Health | empty jobs | inline, Health.tsx:155 "No scheduled jobs found (pg_cron is off here)." | "No scheduled jobs found." | none | EmptyState |
| Staging | not installed | inline, Staging.tsx:40-48 "Mock data isn't installed on this server." | same | run the shown command | EmptyState |

<a id="needs-logic-change"></a>
## 5. Needs logic change

Nothing in this section is part of the redesign. Each item needs a query, RPC, route, param or data-shape change, so it is excluded from Phase 3 and listed here for the owner to schedule separately.

### 5.1 Required items

1. **Rewards / tokens / points.** The owner's "tokens or rewards" idea. Absent: 0 hits for `reward` under `apps/`; every `token` hit is auth, push or Turnstile (`apps/mobile/src/components/TurnstileField.tsx`). Touches: new tables, RPCs to earn and spend, profile data shape, abuse rules. Excluded: a new feature, not a visual change.
2. **Anonymous chat with an identity reveal.** Not a feature: chats show the other person's name (`apps/mobile/src/features/chat/ChatScreen.tsx:149`, header `:354`). What exists is the new-contact photo blur (client UI), the rating visibility rule (server) and the owner-only Quad author reveal (server) described in the terminology block. An anonymous buyer/seller chat would touch `get_chat` / `get_messages` payloads (names and avatars), the chat RLS, reporting and blocking (which need a real identity), and a new reveal RPC with consent from both sides. Excluded: logic and trust-and-safety design, and it works against P5 (stranger-safe by default).
3. **Offer (bid) timers.** Offers already carry `expires_at`, set 48 hours after each send or counter, and the Offer screen shows it as an absolute time (`apps/mobile/src/features/offers/OfferScreen.tsx:155-161`). Showing it as a relative "Expires in 5 h" line is presentation only and is proposed in section 3.04. What needs logic: a push reminder before expiry (touches the offers expiry job and the notification outbox, `supabase/migrations/0022_offers.sql`, `0028_notify_cron.sql`) and a live, ticking countdown. A static "6 h left" in the Inbox, computed on render, is presentation only and stays in section 3.04: `get_inbox` already returns `expires_at` through `private.offer_json` (`supabase/migrations/0022_offers.sql:418`, current definition `0241_moving_out.sql:161`).
4. **Any count or number the API does not return** (DEC 90, `docs/DECISIONS_LOG.md:60`: never invent numbers). Found in the slices: a campus listing count for the Discover day-one hero (`get_feed` returns no total, slice 02), a results count on Search (`search_listings` returns no total, slice 02), an unread count per chat in the Inbox (`ChatSummary.unread` is a boolean, slice 04), seller response time (no field, slice 04), per-category counts, deal counts and distances (already left out by DEC 90). Each needs an RPC to return it. Copy that states an unbacked number today ("Most things sell within a few hours", `en.ts:134`; "20 seconds", `en.ts:686`; "New stuff usually shows up in the evening", slice 02) is cut in section 3, which needs no logic.

### 5.2 Candidates from each slice

The slice files list every idea that came up during the screen review and would need logic, with the evidence for why.

#### Needs logic change candidates (01)
- Inbox tab unread badge. Touches: the tabs shell would need the existing unread count query (`unread_count`, DEC 138) wired into the `badge` field of `TabItem` (`(tabs)/_layout.tsx:33-35`). Excluded: adds a query to the always-mounted shell.
- Store link on the Update screen (App Store or Play Store URL per platform instead of `{site}/download`, `SystemScreens.tsx:30`). Touches: `app_config` data shape or a new env value. Excluded: data shape.
- Signed-out variant of Link error and Not found ("Go to Welcome" instead of Discover; DESIGN_SYSTEM X12 mentions signed-out, `DESIGN_SYSTEM.md:302`). Touches: reading session state in the system screens and a route choice. Excluded: navigation logic.
- Campus proof on Welcome (for example "N students at your school" from `public_campus_progress`, named at `DESIGN_SYSTEM.md:212`). Touches: a new signed-out query; the number is not available before the school is known. Excluded: new query, and DEC 90 forbids invented numbers.
- Live listing count on Campus open (peak-end, "N things for sale now"). Touches: a new count query. Excluded: new query and number the current API does not return.
- Resume after a killed app at the age step without re-asking the OS signal. Touches: persisted onboarding state. Excluded: new storage and gate logic.
- Maintenance "Try again" that refetches config before routing. Touches: invalidating `['app_config']` (`useAppGate.ts:42`) and unifying the second key `['app-config']` (`SystemScreens.tsx:40`). Excluded: query cache behavior (low risk, but not a pure layout change).

#### Needs logic change candidates (02)

- Count of listings on the campus, or a "you have swiped everything" flag, for Discover end-of-deck vs day-one. Touches `get_feed` (it returns only the page, features/feed/api.ts:27) or a new RPC, plus `DiscoverScreen` total logic. Excluded because the client cannot tell 0 new from an empty campus; today the hero can be wrong after a refresh (DiscoverScreen.tsx:109, :228). DEC 90: do not invent numbers.
- Put the card back on the deck when the offer sheet is dismissed without sending (and show `feed.undoOffer`, en.ts:910). Touches the swipe store `undo` window (logic.ts:187) and a route result from `/listing/[id]/offer`. Excluded: needs cross-screen state.
- Result count on Search results ("24 results"). `search_listings` returns `FeedItem[]` with no total (search/api.ts:21-25). Excluded: no number is returned; DEC 90 forbids inventing one.
- "Post a Wanted" from empty results (DESIGN_SYSTEM B07). Touches the sell draft store (prefill kind wanted and title from `q`, as `answerWanted` does in sell/draft). Excluded: new draft flow.
- Pending-swipe count or "n waiting to sync" on the offline banner. The queue length is local (swipes.ts), but the copy would then promise delivery timing; excluded to keep the banner count-free.
- Like button on a listing and a combined likes and comments row. `like_count`, `liked` are on `FeedItem` (logic.ts:25-27) but there is no like call in `FeedApi` (feed/api.ts:11-22); `commentsApi.likePost` exists (comments/api.ts) and would need an optimistic cache patch like Comments (CommentsScreen.tsx:158-164). Excluded: new mutation wiring.
- "Price is firm" should change the buyer button (for example "Buy at asking" or hide the offer path). Touches `make_offer` rules for `open_to_offers` false and the offer sheet. Excluded: server and offer-flow behavior.
- Undo for "Remove from saved" and for deleting a saved search. Needs a delayed commit or a re-save call with toast state in `SavedScreen` (SavedScreen.tsx:74-104). Excluded: new async behavior.
- Owner message for a non-owner opening Stats ("This listing isn't yours"). The server returns the same NOT_FOUND as for a missing listing (0030_profile_settings.sql:64-66). Excluded: needs a distinct error code.
- Views over time or a chart on Stats. `listing_stats` returns totals and price changes only (features/me/api.ts:40-50). Excluded: no time series is returned.
- Distance or "walk time" on meetup spots, seller response time on the card: not returned by `get_feed` (FeedItem, logic.ts:8-66); `profileView.replies` exists for profiles only (en.ts:1045+). Excluded: not in the data.
- "Notify me" reasons for hold (who holds, until when): `FeedItem` has no hold expiry. Excluded: not returned.

#### Needs logic change candidates (03)
- Show the listing being relisted (photo, title, current price) on Relist. Touches a listing query for an expired or sold listing: `EditListingScreen` rejects non-visible listings via `isVisible` (`apps/mobile/src/features/me/MeScreens.tsx:731`), so an owner read for relistable items may not exist. Excluded: needs a query that is known to return expired or sold owner listings.
- Photo editing on Edit listing (add, remove, reorder after posting). Touches `update_listing` args and the photo upload path (`apps/mobile/src/features/me/api.ts` updateListing, `apps/mobile/src/features/sell/api.ts:uploadPhoto`). Excluded: data-shape change.
- A visible "price dropped, savers will be told" hint on Edit. The only evidence is a code comment (`MeScreens.tsx:701`); needs backend confirmation that a drop notifies savers, and ideally a count of savers (DEC 90: never invent numbers). Excluded: unverified behavior and an API number.
- Category and condition required or defaulted on Sell details. `validateDetails` has no condition rule (`apps/mobile/src/features/sell/logic.ts:292-310`); making condition required changes validation and `create_listing` args. Excluded: validation contract change.
- Scan ISBN fills the description with the author (DEC 131 says author goes into the description, DECISIONS_LOG.md:19) but the scan only writes title and category (`SellScanScreen.tsx:72`, `isbn.ts`). Excluded: data-flow change in the lookup.
- Draft autosave indicator tied to real save state ("Saving..." / "Draft saved") rather than the savedAt timestamp. Touches the draft store (`apps/mobile/src/features/sell/draft.ts:16-71`). Excluded: store change.
- A seller preview of the exact buyer view (rating, verification) on the meetup step or the Posted screen. Needs seller rating or verification fields from the listing/profile shape that `PostedListing` does not carry (`apps/mobile/src/features/sell/api.ts:46`). Excluded: data-shape change.
- Rewards or tokens for posting: absent from the product, no data exists. Excluded: not a feature.
- Posted-screen "View listing" works with the existing `/listing/[id]` route and the known id; if the listing is held for review (`held_review`) the route may not show it to the owner, which needs confirming. Excluded from section 3 only for the review variant.

#### Needs logic change candidates (04)
- Rating, thumbs and verification of the other person on the Offer screen and in the Chat header: `get_offer`/`get_chat` return only `{id, display_name, avatar_path}` (`apps/mobile/src/features/offers/logic.ts:32,67`; `features/chat/api.ts:10-22`). Adding a trust line (as `trustLine` does for listings) touches those RPC payloads and the offer/chat data shapes. Excluded because no data shape change is allowed (P5).
- Push reminder before an offer expires (for example 6 h before `expires_at`): touches the offers cron and notification outbox (`supabase/migrations/0028_notify_cron.sql`, `0022_offers.sql` expiry job). A visible relative "expires in" line needs no logic and is in section 3; a reminder does.
- Unread message count per chat in the Inbox row (a number rather than a dot): `ChatSummary.unread` is a boolean (`logic.ts:65`); a count needs `get_inbox` to return it (DEC 90: never invent numbers).
- Delivered or read receipts, typing indicator in chat: no field on `Message` for either (`features/chat/useChat.ts` reads only `markRead`); needs a schema and realtime change.
- Undo for Mark sold (reopen the listing and chats): no un-mark call exists in `features/deals/api.ts`; needs a new RPC and rules for closed chats.
- Seller response-time hint ("usually replies in 2 h") on the offer sheet: no field in `FeedItem.seller` (`features/feed/logic.ts:37-58` area); needs an aggregate.
- Rewards, tokens, loyalty for completed swaps: absent in the schema; any such feature is new logic.
- Automatic in-app "Did it sell?" prompt on launch after a meetup has passed (instead of the chat button and the push): the meetup start time is on the client, but deciding when to prompt, dismiss and not re-prompt needs a persisted flag or a server prompt state; excluded as a behavior change beyond layout.
- Offer on a listing that just went to hold: an open offer on a held listing keeps its actions until the server auto-declines (`logic.ts:127-146`); showing "On hold" earlier needs the listing status to be refreshed with the offer or a server-side state.

#### Needs logic change candidates (05)
- Unread indicator on the Quad chip or the new "..." menu (a dot when Quad activity has unread items): needs the unread count for group `quad` from the notifications API (today only `unread_count` overall, plus `api.notifications` list); excluded because it adds a query or count field.
- Persisted appeal status on Your Quad ("Appeal sent" after reopening, and no double appeal): needs the appeal state returned with `api.mine()` posts (data shape change); today it is local state only (apps/mobile/src/features/quad/QuadMoreScreens.tsx:57).
- Server-side `quad` group filter for Quad activity (so paging does not hide pages): needs a group parameter on the notifications call (apps/mobile/src/features/quad/QuadMoreScreens.tsx:239,266); excluded because it changes the query.
- "New posts" count or badge on the Quad chip: the API returns no count; DEC 90 says never invent numbers.
- Sold or on-hold label on Feed rows: `FeedPost` hides Make offer when `status !== 'active'` (FeedPost.tsx:220) but nothing shows why; whether the Feed returns sold or held items at all is not visible in this slice, so any "Sold" word needs a data check on `feed` pages.
- Answer count on Wanted posts in the requests board ("3 people have this"): not in `CampusItem` as read here; excluded because it needs a new count in the feed row.
- Seller trust line on Feed sale rows (Verified student, rating, swaps): `seller` on `CampusItem` carries name and avatar in this slice (FeedPost.tsx:61-64); DEC 124 data exists on the swipe card (`feed_item.seller`), but the campus feed row shape would need `swaps_count` and thumbs fields (data shape change).
- Rewards or tokens for Quad posting: not a feature; absent.
- Student-visible author reveal: not a feature and must not become one (reveal is owner-only admin with fresh MFA).

#### Needs logic change candidates (06)
- Show "Verified at {campus}" or ".edu verified" on the public seller profile (P5): `get_public_profile` / `public_profiles` data shape, since `PublicProfile` has no campus or verification field (apps/mobile/src/features/profiles/api.ts:18-34). Excluded: needs an RPC and type change.
- Claim in the sell nudge "Most things get an offer the same week" (en.ts:1588): would need a campus-level stat; no such number is returned by `get_me` or `my_counts` (me/api.ts:27-34). Excluded: DEC 90, no invented numbers; keep generic or drop the claim.
- Reply time ("Usually replies in X") on your own profile tab: `median_reply_minutes` exists on the public profile only (profiles/api.ts:29), not on `Me`; adding it needs `get_me` change.
- Separate deleted-account profile from out-of-campus profile: `access: 'gone'` merges both (profiles/api.ts:41, en.ts:1075); distinct copy would need an RPC change.
- Suspended or banned seller state on the public profile: no `access` value for it (profiles/api.ts:20, :40-41); would need an RPC change.
- Rewards, tokens or a "Your impact" stats area on the profile: not in the API, and DEC 90 forbids stat grids; absent by design.
- Notification time picker backed by an arbitrary time (instead of the fixed `QUIET_TIMES` chips, NotificationSettingsScreen.tsx:172): `update_notification_prefs` would need to accept arbitrary times if it does not already; not verified, excluded.
- Resend or change-address on the School email sent state: `auth.updateUser` is a Supabase call with no resend path wired (SettingsScreens.tsx:306-308); excluded as new behavior.

#### Needs logic change candidates (07)

- Per-type notification icon or deep "what to do next" button on each row: would need the notification payload to carry a call-to-action and a typed enum beyond `type` and `data` (`apps/mobile/src/lib/push.ts:76-80`); excluded because it changes the notification data shape.
- Counts like "3 new offers" grouped under one row (collapse a busy chat or offer burst): needs a grouped RPC or server-side grouping (`api.list`, `NotificationsScreen.tsx:101`); excluded because it changes the query/RPC.
- Notification filters (All / Offers / Messages): would need a type filter on `api.list` (`NotificationsScreen.tsx:101`); excluded because it changes the query.
- Report update with more steps (for example "Action taken" vs "No action") or a link back to the reported item: needs `get_my_report` to return more than status and timeline (`SafetyScreens.tsx:36,42,45`); DEC 99/96 style generic outcome is deliberate, excluded because it changes data shape and disclosure policy.
- Safety center: campus police phone number per campus (replace 911-only): no number is on file (`SafetyScreens.tsx:90-91` comment); needs new campus data; excluded.
- Safety spots with a "distance from me" number: requires location permission, which the screen deliberately avoids (`SafetyScreens.tsx:70-73` comment); excluded and also a number the API does not return.
- Help: show support ticket status or replies in-app: needs a support-threads table and RPC (`auth.sendSupportRequest` is send-only, `SafetyScreens.tsx:219`); excluded.
- Help and Email access: localize the English-only composed support message prefix "School email on the account:" (`EmailAccessScreen.tsx:26`); needs a server-side template or locale param to support; excluded because it changes the payload.
- Legal: in-app table of contents / search: could be done client-side, but a section index needs a change to the generated markdown shape (`apps/mobile/src/legal/generated.ts`); excluded to avoid changing the build step.

#### Needs logic change candidates (08)

- Delay mobile skeletons by 300 ms (board X3): `useDelayedLoading` exists (Skeleton.tsx:23-35) but no screen calls it; wiring touches the loading branch of the roughly 31 screens that import Skeleton, so it is per-screen query-state code, not a primitive change.
- Collapsing large title and a scroll-linked hairline in NavBar: needs the scroll offset passed from each screen into NavBar (new prop and Reanimated scroll handler per screen).
- Toast and offline banner that avoid a docked primary button or the NavBar: needs a shared layout store with the docked footer height and header height; today both are absolutely positioned with fixed offsets (Toast.tsx:103, Banner.tsx:77). Not covered by this item: the single fixed higher Toast offset in section 3.08, which is display only and built in B0.
- Retry for a failed photo (Photo.tsx:41 "an expired signed URL"): needs a fresh signed URL from the media Worker, a data call, not styling.
- Sheet snap points (listed in DESIGN_SYSTEM section 6): needs a second detent and its gesture logic in Sheet.
- "Delivered" or "Read" under chat bubbles: the app has no delivery or read data (MessageBubble knows pending, sent, failed only, :15); not invented (DEC 90).
- Rewards or tokens: absent from the app and out of scope for primitives.

#### Needs logic change candidates (09 shared)

- Gate states for "session expired" and "access check failed" (currently both collapse into the sign-in form): touches `AdminGate` state machine and `gate()` in `apps/admin/src/auth.tsx:17-32` and `logic.ts:21-27`, adding two states and a stored reason. Excluded: new state, not copy only.
- Show the signed-in email on the "No access" and Mfa cards: reads `data.session.user.email` in `refresh` and threads it through `AdminGate` (`auth.tsx:20-32`). Excluded: new data passed through components (no RPC change, but a prop contract change).
- Resend code / countdown on the email step: needs rate-limit knowledge from Supabase (`signInWithOtp` limits) that the client does not read (`auth.tsx:114-121`). Excluded: needs server limit data to avoid showing a button that always fails.
- Per-action result text ("Banned", "Released") for `ReasonActions`: requires each page to pass a `doneLabel` per action (props in `ui.tsx:786-797`); touches ~3 pages (Person, Reports, ListingDetail). Excluded: spans the page agent's files.
- Keyboard-navigable search (arrow keys, Enter) and request ordering (ignore stale responses) in `search.tsx:44-59` and `pickers.tsx:40-55`: component logic, not data, but a behavior change beyond restyling.
- Recent items or saved searches in the global search: needs new storage/RPC; never implemented. Excluded: new data.

#### Needs logic change candidates (09 pages)
- Server-side target filter for reports (by listing and by person): the Listing detail Reports tab fetches three whole queues and filters in the browser (ListingDetail.tsx:423-439). Touches `admin_list_reports` parameters. Excluded: query change.
- Real next-page signal (`has_more` or total) for Listings, Quad, BannedWords, Announcements, DataRequests so Next is accurate (X3). Touches the list RPC return shapes. Excluded: data shape.
- Full-set CSV export and "rows shown of total" in Activity and Audit. Touches RPCs. Excluded: new endpoint.
- Counts for "Clear filters" and filter result totals on admin lists. Excluded: RPC change.
- Rate and limit values currently hard-coded in prose (7 days, 168 h, 5 per day: Team.tsx:90-92, Quad.tsx:260, :349) read from config. Touches config exposure. Excluded: data shape.
- Atomic category id generation instead of client-side max+1 (Categories.tsx:109, :136). Touches `admin_upsert_category`. Excluded: RPC change.
- Audit scope for moderators and a waitlist scoped to the moderator's campus. Touches RPC role rules (not read). Excluded: server change.
- Pagination total for Listings and Quad. Excluded: RPC change.
- Split the audit message from the seller-visible message on report actions (Reports.tsx:334-341). Touches `admin_resolve_report` arguments. Excluded: RPC change.

<a id="implementation-order"></a>
## 6. Implementation order (Phase 3 handoff)

Phase 3 starts only after the owner approves this review and answers the owner decisions listed at the end. File counts are estimates from the inventory (feature files that hold the screens, plus their route wrappers only where a header option changes). Batches run in order; each batch ends green before the next starts.

| Batch | Scope | Files (est.) | Main files |
|---|---|---|---|
| B0 | Tokens and primitives | 14-16 | `packages/tokens/tokens.json` (only if an owner decision changes a value), regenerate `packages/tokens/dist/*` with `packages/tokens/scripts/generate.mjs`, update `packages/tokens/test/tokens.test.mjs` if a value changes; `components/{Text,Button,IconButton,Input,Card,ListRow,Sheet,Avatar,Badge,Tag,EmptyState,Skeleton,ErrorState,Toast,Banner}.tsx`; `components/icons/iconData.ts` for the two new glyphs |
| B1 | Discover deck | 5 | `features/feed/{DiscoverScreen,SwipeDeck,SwipeCard}.tsx`, `features/campus/DiscoverHeader.tsx`, `strings/{en,es}.ts` (feed keys) |
| B2 | Listing detail, photos, comments | 5-6 | `features/feed/{ListingScreen,ListingStrip,PhotoViewerScreen}.tsx`, `features/comments/CommentsScreen.tsx`, `components/PhotoCarousel.tsx`, `features/me/MeScreens.tsx` (stats only) |
| B3 | Sell flow and campus posts | 12 | `features/sell/{SellPhotosScreen,SellDetailsScreen,SellMeetupScreen,SellPostedScreen,SellScanScreen,SellStep,PhotoGrid,ShareCard}.tsx`, `features/campus/{PostFoodScreen,PostNewsScreen,PostWantedScreen,PostShared}.tsx` |
| B4 | Offers, Inbox, Chat, Deal, Meetup | 12-14 | `features/offers/{InboxScreen,OfferScreen,OfferSheetScreen,ListingOffersScreen,DealAvatar}.tsx`, `features/chat/{ChatScreen,ChatDetailsScreen}.tsx`, `features/deals/DealScreens.tsx`, `features/meetups/{PlanMeetupScreen,MeetupDayScreen,MeetupCard,Handoff}.tsx`, `components/MessageBubble.tsx` |
| B5 | Feed and Quad | 10 | `features/campus/{CampusFeedScreen,FeedPost,CampusCards}.tsx`, `features/quad/{QuadFeedScreen,QuadThreadScreen,QuadNewPostScreen,QuadMoreScreens}.tsx`, `features/quad/components/{QuadPostCard,QuadWelcome,ReplyRow}.tsx` |
| B6 | Profile, Settings, User | 6 | `features/me/{MeScreens,SettingsScreens}.tsx`, `features/profiles/ProfileViewScreen.tsx`, `features/appIcon/AppearanceExtras.tsx`, `features/notifications/NotificationSettingsScreen.tsx`, `features/safety/AccountScreens.tsx` (blocked, delete) |
| B7 | Auth, System, Notifications, Safety, Help, Legal | 15 | `features/auth/{WelcomeScreen,EmailScreen,VerifyScreen,AgeScreen,RulesScreen,ProfileSetupScreen,NotificationsScreen,ReverifyScreen,AuthStep,SessionExpiredSheet}.tsx`, `features/system/SystemScreens.tsx`, `features/waitlist/{WaitlistScreen,UnlockedScreen}.tsx`, `features/notifications/NotificationsScreen.tsx`, `features/safety/{SafetyScreens,AppealSheet}.tsx`, `features/help/EmailAccessScreen.tsx`, `features/legal/LegalScreen.tsx` |
| B8 (optional) | Admin console | about 34 | `apps/admin/src/styles.css` (token derivation, section 2.10), `apps/admin/index.html` (dark mode pin), `apps/admin/src/{ui,shell,search,pickers,auth}.tsx`, `apps/admin/src/pages/*.tsx` (26), `packages/tokens/dist/tokens.css` only through the generator |

Rules for every batch:
- **No logic change.** No query, RPC, route, param or data-shape change; anything that needs one is in section 5 and stays out.
- **Copy:** every changed `en.ts` key changes in `es.ts` in the same commit (parity). `apps/mobile/__tests__/copy.test.ts` and `i18n.test.tsx` (and `webApp.test.tsx`) reference strings and must keep passing **without editing the tests**; if a test pins a string the proposal changes, the batch stops and asks the owner.
- **Verification:** `cd apps/mobile && npx tsc --noEmit`, `pnpm --filter mobile lint` (`eslint . --max-warnings 0`), `pnpm --filter mobile test` (`jest --ci`) per `apps/mobile/package.json:11-13`; then the iOS simulator in light and dark, at the largest accessibility Dynamic Type size, with Reduce Motion on and VoiceOver on for the deck; then an Android emulator. B0 also runs `packages/tokens/test`.
- **Dependencies:** ask before adding any dependency (none is needed by this review).
- **Owner decisions first:** do not build an item marked "owner decision" until it is answered.
- **Deferred items:** anything marked "deferred: needs logic change (see §5)" in sections 2 to 4 is not built in any batch, even when its file is in the batch list.

Disposition cross-check: every section 5 item, one row each. Each was searched for in sections 2 to 4 and in the batch lists above; any other mention is a problem note or carries "deferred: needs logic change (see §5)". Rows with a non-default disposition name where the display-only part lives.

| # | Section 5 item | Disposition in sections 2-4 and 6 |
|---|---|---|
| 1 | Rewards / tokens / points | Deferred; not in any batch |
| 2 | Anonymous chat with an identity reveal | Deferred; not in any batch |
| 3 | Offer (bid) timers | Static "6 h left" stays in 3.04 (B4, no logic); push reminder and live countdown deferred |
| 4 | Any count or number the API does not return | Deferred; not in any batch |
| 5 | Inbox tab unread badge | Deferred; not in any batch |
| 6 | Store link on the Update screen | Deferred; not in any batch |
| 7 | Signed-out variant of Link error and Not found | Deferred; not in any batch |
| 8 | Campus proof on Welcome | Deferred; not in any batch |
| 9 | Live listing count on Campus open | Deferred; not in any batch |
| 10 | Resume after a killed app at the age step without re-asking the OS signal | Deferred; not in any batch |
| 11 | Maintenance "Try again" that refetches config before routing | Deferred; not in any batch |
| 12 | Count of listings on the campus, or a "you have swiped everything" flag, for Discover... | Deferred; not in any batch |
| 13 | Put the card back on the deck when the offer sheet is dismissed without sending | Deferred; not in any batch |
| 14 | Result count on Search results | Deferred; not in any batch |
| 15 | "Post a Wanted" from empty results | Deferred; not in any batch |
| 16 | Pending-swipe count or "n waiting to sync" on the offline banner | Deferred; not in any batch |
| 17 | Like button on a listing and a combined likes and comments row | Deferred; not in any batch |
| 18 | "Price is firm" should change the buyer button | Deferred; not in any batch |
| 19 | Undo for "Remove from saved" and for deleting a saved search | Deferred; not in any batch |
| 20 | Owner message for a non-owner opening Stats | Deferred; not in any batch |
| 21 | Views over time or a chart on Stats | Deferred; not in any batch |
| 22 | Distance or "walk time" on meetup spots, seller response time on the card | Deferred; not in any batch |
| 23 | "Notify me" reasons for hold | Deferred; not in any batch |
| 24 | Show the listing being relisted | Deferred; not in any batch |
| 25 | Photo editing on Edit listing | Deferred; not in any batch |
| 26 | A visible "price dropped, savers will be told" hint on Edit | Deferred; not in any batch |
| 27 | Category and condition required or defaulted on Sell details | Deferred; not in any batch |
| 28 | Scan ISBN fills the description with the author | Deferred; not in any batch |
| 29 | Draft autosave indicator tied to real save state | Deferred; not in any batch |
| 30 | A seller preview of the exact buyer view | Deferred; not in any batch |
| 31 | Rewards or tokens for posting | Deferred; not in any batch |
| 32 | Posted-screen "View listing" works with the existing /listing/[id] route and the known... | Deferred; not in any batch |
| 33 | Rating, thumbs and verification of the other person on the Offer screen and in the... | Deferred; not in any batch |
| 34 | Push reminder before an offer expires | Deferred; not in any batch |
| 35 | Unread message count per chat in the Inbox row | Deferred; not in any batch |
| 36 | Delivered or read receipts, typing indicator in chat | Deferred; not in any batch |
| 37 | Undo for Mark sold | Deferred; not in any batch |
| 38 | Seller response-time hint | Deferred; not in any batch |
| 39 | Rewards, tokens, loyalty for completed swaps | Deferred; not in any batch |
| 40 | Automatic in-app "Did it sell?" prompt on launch after a meetup has passed | Deferred; not in any batch |
| 41 | Offer on a listing that just went to hold | Deferred; not in any batch |
| 42 | Unread indicator on the Quad chip or the new "..." menu | Deferred; not in any batch |
| 43 | Persisted appeal status on Your Quad | Deferred; not in any batch |
| 44 | Server-side quad group filter for Quad activity | Deferred; not in any batch |
| 45 | "New posts" count or badge on the Quad chip | Deferred; not in any batch |
| 46 | Sold or on-hold label on Feed rows | Deferred; not in any batch |
| 47 | Answer count on Wanted posts in the requests board | Deferred; not in any batch |
| 48 | Seller trust line on Feed sale rows | Deferred; not in any batch |
| 49 | Rewards or tokens for Quad posting | Deferred; not in any batch |
| 50 | Student-visible author reveal | Deferred; not in any batch |
| 51 | Show "Verified at {campus}" or ".edu verified" on the public seller profile | Deferred; not in any batch |
| 52 | Claim in the sell nudge "Most things get an offer the same week" | Deferred; not in any batch |
| 53 | Reply time ("Usually replies in X") on your own profile tab | Deferred; not in any batch |
| 54 | Separate deleted-account profile from out-of-campus profile | Deferred; not in any batch |
| 55 | Suspended or banned seller state on the public profile | Deferred; not in any batch |
| 56 | Rewards, tokens or a "Your impact" stats area on the profile | Deferred; not in any batch |
| 57 | Notification time picker backed by an arbitrary time | Deferred; not in any batch |
| 58 | Resend or change-address on the School email sent state | Deferred; not in any batch |
| 59 | Per-type notification icon or deep "what to do next" button on each row | Deferred; not in any batch |
| 60 | Counts like "3 new offers" grouped under one row | Deferred; not in any batch |
| 61 | Notification filters | Deferred; not in any batch |
| 62 | Report update with more steps | Deferred; not in any batch |
| 63 | Safety center | Deferred; not in any batch |
| 64 | Safety spots with a "distance from me" number | Deferred; not in any batch |
| 65 | Help: support ticket status or replies in-app | Deferred; not in any batch |
| 66 | Help and Email access: localized support message prefix | Deferred; not in any batch |
| 67 | Legal: in-app table of contents or search | Deferred; not in any batch |
| 68 | Delay mobile skeletons by 300 ms | Deferred; not in any batch |
| 69 | Collapsing large title and a scroll-linked hairline in NavBar | Deferred; not in any batch |
| 70 | Toast and offline banner that avoid a docked primary button or the NavBar | Adaptive avoidance deferred; fixed higher Toast offset stays in 3.08 (B0) |
| 71 | Retry for a failed photo | Deferred; not in any batch |
| 72 | Sheet snap points | Deferred; not in any batch |
| 73 | "Delivered" or "Read" under chat bubbles | Deferred; not in any batch |
| 74 | Rewards or tokens | Deferred; not in any batch |
| 75 | Gate states for "session expired" and "access check failed" | Deferred; not in any batch |
| 76 | Show the signed-in email on the "No access" and Mfa cards | Deferred; not in any batch |
| 77 | Resend code / countdown on the email step | Deferred; not in any batch |
| 78 | Per-action result text | Deferred; not in any batch |
| 79 | Keyboard-navigable search | Deferred; not in any batch |
| 80 | Recent items or saved searches in the global search | Deferred; not in any batch |
| 81 | Server-side target filter for reports | Deferred; not in any batch |
| 82 | Real next-page signal | Deferred; not in any batch |
| 83 | Full-set CSV export and "rows shown of total" in Activity and Audit | Deferred; not in any batch |
| 84 | Counts for "Clear filters" and filter result totals on admin lists | Deferred; not in any batch |
| 85 | Rate and limit values currently hard-coded in prose | Deferred; not in any batch |
| 86 | Atomic category id generation instead of client-side max+1 | Deferred; not in any batch |
| 87 | Audit scope for moderators and a waitlist scoped to the moderator's campus | Deferred; not in any batch |
| 88 | Pagination total for Listings and Quad | Deferred; not in any batch |
| 89 | Split the audit message from the seller-visible message on report actions | Deferred; not in any batch |

Items resolved earlier:
- Kept in section 5 and now marked deferred everywhere else: mobile skeleton delay (2.7, 3.08 Skeleton); admin session-expired and access-check-failed lines (3.09 gate, section 4 admin gate rows); admin "Send a new code" (3.09 Email sign-in); signed-in email on the No access card (3.09); admin search arrow keys and stale-response ordering (3.09 search); per-action ReasonActions result wording (3.09 ReasonActions, section 4 row, which now uses "Done. Logged to the audit log."); admin pager next-page signal, full-set CSV and totals (3.09b X3 and lists).
- Taken out of section 5 because they are built in B8 with no logic change: the sidebar drops "two-step on" as copy only (`shell.tsx:110`), so nothing reads `mfa_required`; the "Staging" label reads the existing `STAGING` constant (`apps/admin/src/env.ts:6`).
- Taken out of section 5 because no change is needed: the unused `statsActive` string (it was a note, not a logic item); auto-retry after reconnect, because TanStack Query is already wired to NetInfo (`apps/mobile/src/lib/queryClient.ts:39-50`, called at `apps/mobile/app/_layout.tsx:48`) and mounted queries refetch on reconnect by default.

<a id="hard-constraint-checklist"></a>
## 7. Hard-constraint checklist (self-audit)

| Constraint | Result | Evidence |
|---|---|---|
| No gradients | Pass. No proposal adds one; the only gradient kept is the photo scrim (DESIGN_SYSTEM.md:153). The admin skeleton shimmer gradient (`apps/admin/src/styles.css:1296`) is proposed to become a flat pulse | 2.10 |
| No glass or blur panels | Pass. None proposed. The only blur in the app stays the new-contact chat photo blur, a safety feature (`ChatScreen.tsx:303-320`) | Terminology block |
| No emoji icons, no emoji in copy | Pass. Icons stay the single stroke set; two glyphs are proposed for the generator (2.9). `en.ts` and `es.ts` have 0 emoji today | SCREENS.md inconsistencies item 7 |
| No card-with-shadow everywhere | Pass. Cards use hairlines; `elevation.soft` limited to Sheet, Toast and photo-overlay circles; shadows on `IconButton` and the Waitlist ring card are proposed for removal | 2.6 |
| No centered-everything layouts | Pass. Content screens are left aligned; centering is kept only for empty and error states (`EmptyState`, `ErrorState`) and the Launch and Unlocked moments | Section 3 |
| One accent | Pass. One accent fill per screen; Pistachio kept; lilac retired (owner approved 2026-10-23) | 2.1 |
| No purple | Pass. Lilac is retired in every proposal (owner approved 2026-10-23); the token stays until Phase 3 confirms no uses | 2.1 |
| No "Welcome back" | Pass. No proposed copy uses it | Section 4 |
| Sentence case, verbs on buttons, no exclamation stacks, no em dashes | Pass for proposed copy | Section 4 |
| No invented numbers (DEC 90) | Pass. Every count that the API does not return is in section 5; proposals that cut unbacked claims ("Most things sell within a few hours", en.ts:134) are in section 3 | Section 5 |
| No logic changes | Pass. Every "Logic needed?" in section 3 is "no" or points to section 5 | Section 3 |

### Owner decisions (approved 2026-10-23: the owner accepted every recommendation)

1. Accent: keep Pistachio. Accent fills always carry ink content (fill edge on white is 1.44:1). Section 2.1.
2. Retire `lilac`: the Quad pinned note and Settings icon tiles move to neutral (`bg2` / ink tones); Phase 3 B0 updates DESIGN_SYSTEM.md:42 and records a DEC entry. Sections 2.1, 3.05, 3.06.
3. Update DESIGN_SYSTEM.md:63 and :66 to the rendered weights 700 and 600. Section 2.3.
4. Widen DESIGN_SYSTEM.md:70 so the 1.4x cap also covers fixed-size chrome. Section 2.3.
5. Haptics: remove the four out-of-budget haptics (RulesScreen.tsx:163, SellScanScreen.tsx:73, VerifyScreen.tsx:144, SellDetailsScreen.tsx:265) unless a budgeted error shake is added with it; Food and Wanted confirmations do not count as "listing posted" (no haptic). Section 2.8.
6. Section 5: everything there stays out of the redesign; none of it is built in Phase 3.
