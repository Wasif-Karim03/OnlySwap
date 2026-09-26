# DESIGN_SYSTEM.md — Tokens, components, motion, screen specs (LOCKED)

**The visual reference is `design/OS_FInal Design.html`.** Where it conflicts with this document, **this document wins** (§9 lists every delta).

Tokens live in `packages/tokens/tokens.json`. They generate:
- `packages/tokens/dist/unistyles.ts` for mobile
- `packages/tokens/dist/tokens.css` for the site and admin

App code never uses raw hex values, font sizes or spacing numbers.

## 1. Principles

1. **Photos first.** The item photo is the hero. Chrome is quiet.
2. **One accent, used as a fill.** The accent marks the primary action and selection. It's never used as body text.
3. **Plain student voice.** All copy lives in `strings/en.ts`, following the Voice guide (board H4): no em dashes, no exclamation stacks, no emoji, verbs on buttons.
4. **Native first.** System fonts, native stacks, native pickers and sheets that feel native.
5. **Every state is designed.** Loading, empty, error, offline and permission-denied, for every screen (§10).
6. **Accessible by default.** WCAG 2.2 AA contrast; 44 pt targets; text scales to 200% (overlays capped at 1.4×); screen-reader actions for gestures.

## 2. Color tokens

**Mode × accent (DEC-5).** Mode is `light` | `dark`, following the system unless overridden in Appearance. The **accent** is one brand value, chosen by the owner (Q6).

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | #FFFFFF | #0C0C0D | screen background |
| `bg2` | #F3F3F0 | #1A1A1C | grouped surfaces, inputs |
| `bg3` | #E8E8E3 | #262629 | pressed surfaces, toggles off |
| `card` | #FFFFFF | #2A2A2D | cards on bg2 |
| `line` | #E6E6E1 | #28282B | hairlines |
| `line2` | #CFCFC9 | #3D3D41 | borders, radio rings |
| `ink` | #111110 | #F3F3EF | primary text, dark buttons |
| `ink2` | #5A5A54 | #A6A69F | secondary text |
| `ink3` | #9A9A93 | #6D6D67 | tertiary / placeholders (large text only in light) |
| `accent` | #C8E27D (Pistachio default) | same | primary fills, selection |
| `onAccent` | #111110 | #0C0C0D | text/icons on accent |
| `red` / `redBg` | #E8432A / #FCEBE7 | #FF5A40 / #2C1511 | destructive, errors |
| `green` / `greenBg` | #17804A / #E5F3EA | #3DD68C / #0F2A1C | verified, success |
| `amber` / `amberBg` | #9A6200 / #FBF0DA | #F5B84B / #2A2110 | warnings, held |
| `overlay` | rgba(0,0,0,.45) | rgba(0,0,0,.6) | sheet scrim |

**Accent options** (owner picks one; the rest are not user settings): Pistachio #C8E27D, Butter #FFD95A, Tangerine #FF9A4D, Coral #FF7B67, Bubblegum #FFA3D1, Sky #7CC0FF, Cobalt #2B45E8 (`onAccent` #FFFFFF).

**Contrast rules** (tested in T-UNIT-TOK-01):
- `ink` on `bg` / `bg2` ≥ 7:1.
- `ink2` on `bg` ≥ 4.5:1.
- `ink3` only for text ≥ 17 pt or non-essential meta.
- `onAccent` on `accent` ≥ 4.5:1.
- **`accent` as text or icon on `bg` is banned** (UX-03).

## 3. Typography

System fonts: SF Pro (iOS), Roboto (Android), `-apple-system, system-ui` (web). Numerals are `tabular-nums` for prices and timers.

| Token | Size / weight / tracking / line | Use |
|---|---|---|
| `display` | 34 / 800 / −0.04em / 1.05 | onboarding hero, big moments |
| `title` | 26 / 800 / −0.035em / 1.1 | tab root large titles |
| `heading` | 20 / 750 / −0.025em / 1.2 | sections, sheet titles |
| `price` | 28 / 800 / −0.04em / 1.0 | card and listing price |
| `body` | 16 / 400 / 0 / 1.5 | reading text |
| `bodyStrong` | 16 / 650 | list primary |
| `label` | 14 / 600 | buttons in lists, tags, chips |
| `meta` | 12.5 / 500 / 1.35 | times, counts, hints |

`allowFontScaling` stays on. `maxFontSizeMultiplier` is 1.4 **only** on photo overlays and the tab bar.

## 4. Space, radius, elevation

| Group | Values |
|---|---|
| **Space (4-pt)** | `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24, `2xl` 32; screen edge 20; list row min height 52 |
| **Radius** | `chip` full, `control` 15 (buttons, inputs), `card` 18, `sheet` 28 (top corners), `thumb` 12, `avatar` full |
| **Elevation** | cards have no shadow (hairline `line` instead). Sheets and toasts have one soft shadow (`0 8 24 rgba(0,0,0,.12)`). No stacked shadows (UX-14) |

## 5. Motion and haptics

| Token | Value | Used for |
|---|---|---|
| `tap` | scale 0.97, 120 ms ease-out | every pressable |
| `push` | native stack | screen transitions |
| `sheet` | spring damping 22, stiffness 240 | sheets |
| `swipe` | spring damping 18, stiffness 180; fly-out 220 ms | deck |
| `success` | 400 ms check-draw | offer sent, listing posted, report sent |
| `fade` | 150 ms | reduce-motion replacement for all of the above |

**Deck rules:**
- rotation = x/width × 12° (clamped)
- stamps fade in from 25% width
- release at 35% width or velocity 800
- the next card scales 0.95 → 1

**Haptics budget (UX-09):**
- `selection` at the swipe threshold
- `success` on offer sent, offer accepted and listing posted
- `warning` on error shake

Nothing else gets a haptic.

**Reduce motion:** every spring becomes `fade`, and the deck becomes a list with buttons (X33).

## 6. Components

Components live in `apps/mobile/src/components/`. Each is built with every state below.

| Component | Variants | States | Notes |
|---|---|---|---|
| Button | primary (accent), dark (ink), secondary (bg2), text, destructive (red) · sizes L 54 / M 44 / S 36 | default, pressed, loading (spinner, width kept), disabled (35% opacity + non-interactive), focus ring 2 px ink | double-tap guard 500 ms |
| IconButton | 44 hit area | same | a11y label required |
| Input | text, email, price, search | default, focus (2 px ink ring), error (redBg + red ring + message), disabled, loading (right spinner) | keyboard-controller aware |
| TextArea | counter | + counter turns amber at 90%, red at 100% | |
| OTPInput | 6 cells | waiting, focus cell, filled, error shake, disabled | single hidden input, `oneTimeCode` |
| DateField | native picker (UX-06) | empty ("Pick a date"), set, error | iOS wheels in a sheet; Android dialog |
| Chip | filter, choice, removable | off, on (ink fill), disabled | |
| SegmentedControl | 2–4 segments | selected | |
| Toggle | — | off, on (ink), disabled | |
| OptionRow | radio / checkbox | off, on, disabled | whole row pressable |
| Sheet / ActionSheet | snap points | open, dragging, closing | focus trap; Android back closes |
| Toast / ToastUndo | info, success, error | visible, countdown | auto-dismiss 4 s / undo 5 s |
| Banner | offline, info, warning | — | offline banner slides from the top |
| Card / ListRow / GroupedList | — | pressed | |
| Tag | neutral, accent, green, amber, red | — | |
| Avatar | initials (color from token set) / photo | — | |
| Photo / PhotoCarousel | — | loading (blurhash), error (placeholder) | expo-image |
| SwipeCard / SwipeDeck | — | idle, dragging, stamped, flying, undo | 3 mounted cards |
| ListingTile / ListingCardH | — | default, sold (overlay), hold (overlay) | |
| OfferCard | incoming, outgoing | pending, countered, accepted, declined, expired, withdrawn | |
| MessageBubble | mine / theirs / system / meetup | pending, sent, failed (retry) | scam hint row (SEC-06) |
| MeetupCard | proposed, confirmed, changed, cancelled | + here/late badges | |
| SpotRow | public / police-designated | selected | "Directions" opens Maps |
| RatingThumbs | up / down + tags | — | |
| EmptyState / ErrorState / Skeleton | per layout | — | |
| PermissionPrimer | camera, photos, notifications | undetermined, denied → Settings | (no location in R1.0) |
| ReportSheet | listing, user, chat, message | reason, details, block toggle, submitting, duplicate | |
| ProgressBar / StepIndicator / NavBar / TabBar | — | — | tab roots large title, pushed screens inline title (UX-04) |

**Share card (MOB-06):** render on-screen at opacity 0 with `collapsable={false}`, capture with view-shot at 1200×630 JPEG q0.8. On failure, share without an image.

## 7. Icons and imagery

- Icons are a single stroke set (1.8 px, rounded caps) redrawn from the board's SVG symbols in `components/icons/`. No emoji icons.
- Imagery is real item photos. There are no illustrations except the empty-state glyph tiles (a single icon on a `bg2` square).
- Logo: the chosen mark (Q6) in `components/Mark.tsx`, driven by the same SVG path as the board.

## 8. Banned patterns (anti-"AI look", UX-14)

The following aren't allowed in code review:
- gradient buttons or backgrounds (except the photo scrim)
- glassmorphism panels
- more than one shadow per element
- emoji in UI
- "✨", "🚀" or hype words ("seamless", "unlock", "supercharge")
- centered-everything layouts on content screens
- stock illustrations
- purple-blue default gradients
- rounded-2xl-everything
- icon + title + description card grids for features inside the app

## 9. Design deltas (these override the board)

| # | Board shows | Locked spec | Source |
|---|---|---|---|
| D1 | 5 tabs incl. Quad (and early frames with a Search tab) | R1.0: **Discover · Sell · Inbox · Profile**; Search icon in the Discover header; Quad added as tab 2 in R1.1 | UX-01, DEC-1 |
| D2 | 8 user-selectable skins; "Night" as a skin | light/dark mode × one accent; Appearance offers System/Light/Dark only | DEC-5 |
| D3 | "safe-exchange zone" copy, map on Sell·meetup and Plan the pickup | "Meetup spot" + "Police-designated" tag only when official; **list + Directions**, no map, no location primer in R1.0 | DEC-2, DEC-7 |
| D4 | Custom birthday wheel (A7) | native date picker field | UX-06 |
| D5 | Alternate app icon picker (F14) | removed until R2 | MOB-08 |
| D6 | Photos in chat (E10), camera in the composer | removed until R1.1 (DEC-3); composer = text + calendar | DEC-3 |
| D7 | Quad screens (Q1–Q15), Quad activity, Muted, Check-in | R1.1 (check-in R2); aliases use letters + colors, no emoji | DEC-1, UX-11 |
| D8 | Student web app (W3–W7) | R2 | DEC (33) |
| D9 | Admin metrics, team, announcements, banned-words UI | R1.1 | DEC-6 |
| D10 | — | **New:** "Updated rules" gate (A11 variant with "What changed" summary) | PM-04 |
| D11 | — | **New:** Help → "I can't get into my school email" form; Settings → "Sign out of all devices" | PM-03 |
| D12 | — | **New:** scam hint row under incoming messages that contain links, phone numbers or payment words | SEC-06 |
| D13 | — | **New:** meetup share sheet line "Your friend will see Aisha's first name and the spot." | LEG-06 |
| D14 | Card text scales freely | overlays capped at 1.4× | UX-05 |
| D15 | Free items "Ask for it" | same machinery as offers at $0; seller sees requests in order | PM-06 |
| D16 | Wanted "I have this" | R1.1: opens Sell prefilled with `wanted_ref` | PM-05, DEC-13 |
| D17 | Banned items list (8 groups) | + pets/animals, gift cards, recalled items | LEG-05 |
| D18 | Deleted counterpart | "Deleted user" name, grey avatar, read-only chat with the listing snapshot | BE-01 |
| D19 | Discover segment "Swipe \| Campus" | R1.0: no segment (Swipe only). R1.1: "Swipe \| Around campus" | UX-08, DEC-13 |
| D20 | Founding sellers, Day one | Day one hero (with founding-seller callout) replaces the deck while the campus has < 10 active listings | UX-10 |
| D21 | Waitlist gate, campus unlocked, Around campus, data export screen | R1.1 (DEC-13) | DEC-13 |

## 10. Screen-by-screen spec

Release: **1.0** / **1.1** / **2**.

**Every screen must also meet:**
- global states (§1.5): skeleton loading, `ErrorState` with retry, `OfflineBanner`, and inline mutation errors from `errors.*`
- accessibility (§1.6)

The "Data/API" column lists the calls from API.md.

### A · Onboarding and account (`app/(auth)/`)

| ID | Route | Frames | Rel | States | Actions → effect | Data/API |
|---|---|---|---|---|---|---|
| A01 | `index.tsx` Launch | A1 | 1.0 | splash ≤700 ms; restore session | gate routing | `get_app_config`, session |
| A02 | `welcome.tsx` | A2 | 1.0 | static | Continue → A03; "I already have an account" → A03 login mode | — |
| A03 | `email.tsx` | A3, A4, A5, X1 | 1.0 | typing (school detect), personal email error, unknown school card (A5), reviewer password field (A4), sending, rate limited, offline | Send code → A04; Join waitlist → `waitlist-request`; reviewer Sign in | `lookup_school`, `signInWithOtp`, `signInWithPassword` |
| A04 | `verify.tsx` | A6, A9, X2 | 1.0 | waiting, autofill, verifying, wrong (attempts left), expired, locked 5 min, resend timer | complete → session → gate | `verifyOtp` |
| A05 | `age.tsx` | A7, A8 | 1.0 | checking OS signal, date field (native), under 18 (A8), error | `confirm_age`; minor → `delete-account`(underage) + sign out | `expo-age-range`, `confirm_age` |
| A06 | `profile.tsx` | A10 | 1.0 | name required, photo optional + upload progress, permission denied | Continue | `update_profile`, `upload-url` |
| A07 | `rules.tsx` | A11 (+ D10 "Updated rules") | 1.0 | unchecked (disabled), checked, updated-rules variant with a diff list | Agree | `accept_rules` |
| A08 | `notifications.tsx` | A12 | 1.0 | undetermined, denied → Settings, granted skip | Turn on → OS prompt → `register_push_token` | expo-notifications |
| A09 | `waitlist.tsx` | A13 | 1.1 | count, position, invite copy/share, tour | share invite | `my_waitlist_position`, `public_campus_progress` |
| A10 | `unlocked.tsx` | A14 | 1.1 | confetti (reduce motion: fade) | Start swiping / List something | profile `seen_unlock_at` |

### B · Buy (`app/(app)/`)

| ID | Route | Frames | Rel | States | Actions → effect | Data/API |
|---|---|---|---|---|---|---|
| B01 | `(tabs)/discover/index.tsx` | B1–B4, X24, X33, N1, C6, C7 | 1.0 | loading deck, first-swipe coach, deck, end of deck, day-one hero (<10 listings), offline queue, list mode (SR / reduce motion) | swipe left → queue `record_swipes`; right/$ → B05 offer sheet; save; undo 5 s; tap → B02 | `get_feed`, `record_swipes`, `undo_swipe`, `save_listing` |
| B02 | `listing/[id]/index.tsx` | B5, B6, B7, X13, N2 | 1.0 | buyer, owner (stats, Edit, See offers), hold overlay + "Tell me", gone/deleted, other campus (X30) | offer, save, share, options, seller | select `listings` + `listing_photos` (RLS), `record_view`, `watch_listing` |
| B03 | `listing/[id]/options` sheet | B8, B9 | 1.0 | options; report reasons; submitting; duplicate | Not interested, Report → E14 confirmation | `hide_listing`, `create_report` |
| B04 | `listing/[id]/photos.tsx` | B10 | 1.0 | pinch, swipe-down close | — | — |
| B05 | `listing/[id]/offer` sheet | B11, B12, B13 | 1.0 | amount (quick chips), notes, low-offer warning, free "Ask for it" (D15), rate limited (B12), paused, success (B13 + notif primer if off) | Send | `make_offer` |
| B06 | `search/index.tsx` | B14, B15 | 1.0 | recent, trending, suggestions, none | → B07 | `search_suggest` |
| B07 | `search/results.tsx` | B16, X5 | 1.0 | grid, no results (save search; "Post a Wanted" from R1.1) | save search, filters | `search_listings`, `create_saved_search` |
| B08 | `search/filters` sheet | B17 | 1.0 | category, price, condition, free only, sort | apply/reset | — |
| B09 | `saved/index.tsx` | B18, B19, X38 | 1.0 | items (price-drop tag, sold greyed), searches (alerts toggles), empty | unsave, toggle alerts, delete | `saves`, `saved_searches`, `saved_search_new_counts` |
| B10 | `user/[id].tsx` | B20–B22 | 1.0 | listings/reviews, new seller, blocked | report/block | `public_profiles`, `profile_stats`, `ratings_visible` |

### C · Around campus

| ID | Route | Frames | Rel | States | Actions | Data/API |
|---|---|---|---|---|---|---|
| C01 | `(tabs)/discover/campus.tsx` | C1, C3, C4 | 1.1 | filter chips (all / free food / free stuff / wanted), empty per filter, day one | "I have this" → D01 with `wanted_ref` | `get_campus_feed` |
| C02 | `sell/food.tsx` | C2 | 1.1 | what, place (spot or text), until chips, optional photo | Post (no campus push in R1.0) | `create_listing(kind food)` |
| C03 | `sell/wanted.tsx` | C5 | 1.1 | title, max price, category | Post | `create_listing(kind wanted)` |

### D · Sell (`(tabs)/sell/`)

| ID | Route | Frames | Rel | States | Actions | Data/API |
|---|---|---|---|---|---|---|
| D01 | `sell/index.tsx` step 1 | D1, X16, X19, X21 | 1.0 | empty, processing, upload failed (retry), draft restored, camera/photos primer, denied | pick/reorder | `reserve_listing_id`, `upload-url` |
| D02 | step 2 | D2, D3, D4 | 1.0 | all errors at once (D3), give-away; price hint UI R1.1 | Next | `price_hint`, `check_text` |
| D03 | step 3 | D5 | 1.0 | spot list (police-designated first), extra place text, availability | Post | `create_listing` |
| D04 | step 4 posted | D6 | 1.0 | success, share card generating/failed | Share, List another | `upload-url(share)` |

### E · Offers, chat, meetups, deals

| ID | Route | Frames | Rel | States | Actions | Data/API |
|---|---|---|---|---|---|---|
| E01 | `(tabs)/inbox/index.tsx` | E1, E2, X6, X32 | 1.0 | offers (waiting on you / you made), chats (unread), empty | review, decline, open chat | `get_inbox`; realtime `user:{uid}` while focused |
| E02 | `offer/[id].tsx` | E3–E8 | 1.0 | every status × role; counter sheet; withdraw sheet; "on hold with someone else" | accept/counter/decline/withdraw/offer again | offer RPCs |
| E03 | `chat/[id]/index.tsx` | E9, X18, N3 (+D12, D18) | 1.0 | first-message safety tip, pending/sent/failed, scam hint, blocked, closed, deleted user, offline queue | send, plan meetup, mark sold, details | `get_messages`, `send_message`, `mark_chat_read`; realtime `chat:{id}` |
| E04 | `chat/[id]/details.tsx` | X17 | 1.0 | — | mute, report, block, hide | `set_chat_mute`, `hide_chat`, `create_report`, `block_user` |
| E05 | `chat/[id]/meetup` sheet | E11 (list-only, D3) | 1.0 | spot list (designation tags), custom place, day/time, proposing, counter-proposal | Suggest / Accept / Suggest another; Directions (Maps deep link) | `propose_meetup`, `confirm_meetup` |
| E06 | `meetup/[id].tsx` | E12–E15 (+D13) | 1.0 | before, T−30, here/late, other late, cancelled, rescheduled, no-show window, completed | I'm here, late, cancel, reschedule, share, report no-show, 911 | meetup RPCs, `create_meetup_share` |
| E07 | Did it sell? sheet | E16 | 1.0 | done / not yet / fell through | → F07 mark sold | `confirm_deal` |
| E08 | `deal/[chatId]/rate.tsx` | E17, E18 | 1.0 | submit, waiting, revealed | — | `submit_rating`, `ratings_visible` |
| E09 | report and block sheet + `report/[id].tsx` | E19–E21 | 1.0 | reasons, also block, sent timeline, update | — | `create_report`, `block_user`, `get_my_report` |

### F · Profile and settings

| ID | Route | Frames | Rel | Notes | Data/API |
|---|---|---|---|---|---|
| F01 | `(tabs)/profile/index.tsx` | F1 | 1.0 | stats, sell nudge, menu | `my_counts`, `profile_stats` |
| F02 | `profile/edit.tsx` | F2 | 1.0 | dirty/saving/banned term | `update_profile` |
| F03 | `profile/listings.tsx` | F3, X37 | 1.0 | active/hold/sold/drafts; empty | listings (select) |
| F04 | `listing/[id]/stats.tsx` | F4 | 1.0 | — | `listing_stats` |
| F05 | `listing/[id]/offers.tsx` | F5 | 1.0 | — | `listing_offers` |
| F06 | `listing/[id]/edit.tsx` | F6 | 1.0 | + Delete listing (soft) confirm | `update_listing`, `delete_listing` |
| F07 | `listing/[id]/sold.tsx` | F7 | 1.0 | pick buyer or "someone not on OnlySwap" | `mark_sold` |
| F08 | `listing/[id]/relist.tsx` | F8 | 1.0 | — | `relist_listing` |
| F09 | `notifications/index.tsx` | F9, X36 | 1.0 | grouped by day, empty | `get_notifications`, `mark_notifications_read` |
| F10 | `settings/index.tsx` | F10 (+D11) | 1.0 | + "Sign out of all devices" | `auth.signOut({scope:'global'})` |
| F11 | `settings/notifications.tsx` | F11 | 1.0 | tips opt-in with consent line, previews off by default, quiet hours, OS-off banner | `update_notification_prefs` |
| F12 | `settings/privacy.tsx` | F12 | 1.0 | analytics + crash toggles | `update_profile_flags` |
| F13 | `settings/blocked.tsx` | F13 | 1.0 | — | `unblock_user` |
| F14 | `settings/appearance.tsx` | F14 (D2, D5) | 1.0 | System/Light/Dark | `update_profile_flags(theme_mode)` |
| F15 | `settings/school.tsx` | F15 | 1.0 | email change with code | `auth.updateUser({email})` |
| F16 | `settings/delete.tsx` | F16 | 1.0 | type DELETE | `delete-account` |
| F17 | `settings/data.tsx` | F17 | 1.1 | queued (R1.0: row opens email to support) | `export-data` |
| F18 | `settings/about.tsx` | F18 | 1.0 | version, licenses, contact | — |
| F19 | `safety/index.tsx` | F19 | 1.0 | spot list + Directions, tips, 911 | `safe_spots` |
| F20 | `help/index.tsx` + `help/email-access.tsx` | X28 (+D11) | 1.0 | FAQ, contact, "I can't get into my school email" form | `support-request` |

### X · States and system

| ID | Frame | Rel | Spec |
|---|---|---|---|
| X01 | X4 Offline | 1.0 | banner + cached content |
| X02 | X7 Session expired | 1.0 | modal → A03 prefilled |
| X03 | X9 Re-verify | 1.0 | code to school email → `complete_reverify` |
| X04 | X10 Suspended/paused/banned + Appeal | 1.0 | reason, until, what still works; appeal form → `create_appeal` |
| X05 | X11 Update required | 1.0 | store link |
| X06 | X12 Maintenance | 1.0 | message |
| X07 | X14 Under review | 1.0 | held listing state |
| X08 | X25 Share listing | 1.0 | native share + OG |
| X09 | X26 Rate the app | 1.0 | `expo-store-review` rules |
| X10 | X27 Banned items (+D17) | 1.0 | static list |
| X11 | X29 Terms / Privacy | 1.0 | bundled markdown, version shown |
| X12 | X30/X31 deep-link errors | 1.0 | other campus / signed out |
| X13 | X34/X35 Lock screen copy | 1.0 | API §7 |
| X14 | X19b location primer, X20 location off | — | removed in R1.0 (D3) |
| X15 | X39/X40 widgets, X34 Live Activity | 2 | — |

### Q · Quad (R1.1)

Q01–Q14 as blueprint v0 (Welcome, Feed, Thread, New post, Blocked, Held, Report, Your Quad, Activity, Muted), with the changes in D7. Check-in (Q15) is R2.

### W · Site (`apps/site`) and G · Admin (`apps/admin`)

| ID | Path | Rel | Notes |
|---|---|---|---|
| W01 | `/` landing (desktop + phone) | 1.0 | campus progress, store badges, school check → waitlist |
| W02 | `/privacy`, `/terms`, `/rules`, `/banned-items`, `/safety`, `/cookies`, `/child-safety` | 1.0 | markdown, versioned, sidebar nav |
| W03 | `/help` | 1.0 | FAQ + form (Turnstile) + safety CTA |
| W04 | `/delete` | 1.0 | OTP code entry → confirm |
| W05 | `/l/:id`, `/m/:token` (1.0); `/i/:code` (1.1) | 1.0 | Pages Functions (API §8) |
| W06 | 404 (1.0); `/joined` (1.1) | 1.0 | — |
| W07 | `/.well-known/*` | 1.0 | AASA + assetlinks |
| W08 | web app (browse/listing/inbox/sell/login) | 2 | — |
| G01 | `/login` email OTP + TOTP enroll/challenge | 1.0 | 2 factors (SEC-04) |
| G02 | overview, reports (+detail, evidence), users (+detail), listings, chats (report-gated), appeals, campus setup (domains, spots with designation, status), flags/config, audit log | 1.0 | — |
| G03 | metrics, team, announcements, banned words, Quad queue + reveal | 1.1 | — |
