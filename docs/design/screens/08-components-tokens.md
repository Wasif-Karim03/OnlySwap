# 08 Shared components and tokens

[Index: SCREENS.md](../SCREENS.md) | [Design review: DESIGN_REVIEW.md](../DESIGN_REVIEW.md)

<a id="08-tokens"></a>
## Tokens

The live token values (color light and dark, type, space, radius, size, elevation, motion) with `packages/tokens/tokens.json` line references, plus the theme, motion, haptics and layout facts, are in [SCREENS.md, Current tokens](../SCREENS.md#current-tokens). The theme files are `apps/mobile/src/theme/{themes.ts,unistyles.ts,mode.ts,motion.ts,reducedMotion.ts,shadow.ts,layout.ts}` and `apps/mobile/src/lib/haptics.ts`. The current to proposed comparison for every group is in [DESIGN_REVIEW.md section 2](../DESIGN_REVIEW.md#design-system).

## Components

Covers every file in `apps/mobile/src/components/*.tsx` (40 files), the icon set `apps/mobile/src/components/icons/Icon.tsx` and `iconData.ts`, and the four dev-only routes `apps/mobile/app/dev/kit.tsx`, `dev/spikes.tsx`, `dev/states/index.tsx`, `dev/states/[id].tsx` (feature code in `apps/mobile/src/features/dev/`). Usage counts are `<Name` JSX occurrences in `apps/mobile/src/features` and `apps/mobile/app` (tests excluded), plus the number of files that import the component from `@/components/...`; uses inside other components are noted separately when they matter. Pressed feedback means `Tappable` (scale 0.97 over 120 ms, opacity 0.7 with reduce motion, `apps/mobile/src/theme/motion.ts:60-80`, `apps/mobile/src/components/Tappable.tsx:45-59`) unless stated otherwise.

DESIGN_SYSTEM section 6 lists components that have no file in `src/components`: SwipeCard and SwipeDeck live in `apps/mobile/src/features/feed/SwipeCard.tsx` and `SwipeDeck.tsx`, MeetupCard in `apps/mobile/src/features/meetups/MeetupCard.tsx:24`; OfferCard, SpotRow, RatingThumbs, ListingCardH and DateField have no component of that name anywhere in `apps/mobile/src` (grep found nothing; the rating thumbs are two `Button`s at `apps/mobile/src/features/deals/DealScreens.tsx:332-333`, the date field is the native picker used in `features/auth/AgeScreen.tsx` and `features/campus/PostNewsScreen.tsx`).

<a id="08-avatar"></a>
### Avatar
- Source: apps/mobile/src/components/Avatar.tsx:36-59 (styles :61-71; helpers `initials` :11, `avatarShade` :19)
- Props and variants: `name` :26; `uri` :27; `size` S|M|L :8,28 (32/44/72 pt from `theme.size.avatarS/M/L`, `packages/tokens/tokens.json:176-178`); `fill` shade|accent :30 (accent = own profile, DEC 90); `letters` 1|2 :32.
- States: pressed: not pressable. disabled/selected: n/a. loading: expo-image fade `transition={150}` :49, no blurhash/placeholder. error: not handled (no branch found; `uri` truthy but failing leaves a blank shade circle, initials only render when `uri` is falsy :44-56). reduce motion: not handled (150 ms transition is not gated by `useReducedMotion`, :49).
- Accessibility: decorative, `accessible={false}` :41 and `importantForAccessibility="no-hide-descendants"` :42 (the row reads the name). No hit area (not interactive). Initials use `Text` variant label/heading with no `overlay` cap :53, so at large Dynamic Type the glyphs can outgrow the fixed 32 pt circle (:63-64).
- Tokens: `colors.bg2 | bg3 | accent` by hash :69; `ink`/`onAccent` text :53; `radius.avatar` :66; `size.avatar*` :63-64. Raw: `transition={150}` :49 (equals `motion.fade.duration`).
- Used in: 13 JSX, 11 files; top: features/dev/KitScreen.tsx (3), features/me/MeScreens.tsx (2), features/offers/OfferScreen.tsx (1).
- Notes: matches DESIGN_SYSTEM section 6 "initials (color from token set) / photo"; `fill="accent"` and `letters` are additions (DEC 90) not in the table.

<a id="08-badge"></a>
### Badge
- Source: apps/mobile/src/components/Badge.tsx:12-27 (styles :29-43)
- Props and variants: `count: number | undefined` :12; `testID` :12. Text from `badgeText` (TabBar.tsx:30): nothing for 0, 1 to 99, then "99+".
- States: pressed/disabled/selected: n/a (non-interactive, `pointerEvents="none"` :18). hidden when count is 0 or missing :14-15. loading/error: n/a. reduce motion: no animation.
- Accessibility: hidden from screen readers `importantForAccessibility="no-hide-descendants"` :19; the host `IconButton` speaks the count (IconButton.tsx:58-62). Count text uses `overlay` so Dynamic Type is capped at 1.4x :22.
- Tokens: `colors.red` :40; `size.badge` :34-35 (18 pt); `radius.chip` :38; `space.xs` :32-33,36. Raw: `fontWeight: '700'` :42.
- Used in: 0 direct JSX in features/app; rendered only by `IconButton` (IconButton.tsx:76). Imported by 1 component. `TabBar` and `SegmentedControl` draw their own near-identical red badges (TabBar.tsx:115-121,187-193; SegmentedControl.tsx:50-56).
- Notes: DESIGN_SYSTEM section 6 "IconButton badge ... red count in the corner" matches. Three separate badge implementations is drift; `Badge` is imported from `./TabBar` (circular-looking dependency, Badge.tsx:4 and IconButton.tsx:11).

<a id="08-banner"></a>
### Banner
- Source: apps/mobile/src/components/Banner.tsx:18-27 (`Banner`), :48-74 (`OfflineBanner`), :30-35 (`isOffline`); styles :76-93
- Props and variants: `kind` offline|info|warning|error :13 with icon map :15 and tone map :16; `message` :18. `OfflineBanner` takes no props; delay `OFFLINE_SHOW_DELAY_MS = 1500` :38.
- States: pressed: not pressable. offline: slides in from the top (`SlideInUp.duration(220)`) :68, copy `banner.offline` :71. reduce motion: `FadeIn.duration(150)` :68 via `useReducedMotion` :50. exiting animation deliberately absent (Android crash note :41-47) so it vanishes without animation. loading/disabled/selected: n/a.
- Accessibility: `accessibilityRole="alert"` and `accessibilityLiveRegion="polite"` :20; min height `size.hit` 44 :80; text variant label scales with Dynamic Type, row wraps (`flex: 1` :92). No dismiss control.
- Tokens: `colors.amberBg | redBg | bg2` :85-90; icon tones amber/red/ink :16; `radius.control` :84; `space` sm/md :81-83. Raw: icon size 18 :21. No hex. Message text tone is always default ink (:22), only the icon is tinted.
- Used in: 53 JSX, 29 files; top: features/me/SettingsScreens.tsx (5), features/deals/DealScreens.tsx (3), features/safety/AccountScreens.tsx (3). `OfflineBanner` mounted from app/_layout.tsx (grep `OfflineBanner`).
- Notes: DESIGN_SYSTEM section 6 "Banner offline, info, warning; offline banner slides from the top" matches; `error` kind is an addition. `OfflineBanner` is absolutely positioned at `top: rt.insets.top` :77 over content (does not push layout), so it can cover a NavBar title/back button.

<a id="08-button"></a>
### Button
- Source: apps/mobile/src/components/Button.tsx:46-110 (styles :112-141)
- Props and variants: variants `primary | dark | secondary | text | destructive | onAccent | textOnAccent` Button.tsx:14-15 (last two for the accent Welcome screen, DEC 89 :10-13); sizes `L | M | S` :16 (54/44/36 pt, `theme.size.button${size}` :116, tokens.json:170-172); props `label` :19, `onPress` :20, `variant` :21, `size` :22, `loading` :23, `disabled` :24, `hapticOnPress` ('success' only) :26, `accessibilityHint` :27, `testID` :28, `fullWidth` (default true) :29,56.
- States: pressed: yes, via `Tappable` (:72). disabled: opacity 0.35 and non-interactive :122,:79 (the opacity only when `disabled`, not `loading`). loading: label hidden and spinner shown in the same view tree, width kept :91-106. error: n/a (caller shows inline errors). selected: n/a. focus ring (2 px ink, DESIGN_SYSTEM section 6): not handled (no branch found). reduce motion: inherited from `Tappable` (opacity instead of scale). 500 ms double-tap guard: inherited, `DOUBLE_TAP_GUARD_MS` Tappable.tsx:8.
- Accessibility: `accessibilityRole="button"` :74; label :75; hint :76; `a11yState({ disabled, busy })` :77; Small size gets `hitSlop` `SMALL_SLOP` (+4 pt top and bottom, Tappable.tsx:11-16) :78; heights are `minHeight` so labels wrap at large text :115,:138-139; spinner hidden from screen readers :104-105.
- Tokens: `colors.accent | ink | bg2 | red | onAccent | bg | onPhoto` :60-69,:123-134; `radius.control` :118; `space.lg/xl/sm` :117,:121. Raw: `opacity: 0.35` :122 and `0 / 1` opacities. No hex.
- Used in: 182 JSX, 50 files; top: features/dev/KitScreen.tsx (16), features/dev/stateFrames.tsx (11), features/campus/PostShared.tsx (10). Also used inside EmptyState, ErrorState, ConfirmDialog, CrashScreen, PermissionPrimer, ReportSheet.
- Notes: matches DESIGN_SYSTEM section 6 except the focus ring. `hapticOnPress` (:26,:81) has no caller anywhere in `apps/mobile/src` or `app` (grep), every success haptic is fired from the screen (see Haptic inventory below). `text` variant is a transparent, hugging-less button with the same 54 pt height (:123-134).

<a id="08-card"></a>
### Card
- Source: apps/mobile/src/components/Card.tsx:8-24 (styles :26-35)
- Props and variants: `children` :9; `onPress` (makes it a `Tappable` button) :10,18-23; `accessibilityLabel` :11. No variants.
- States: pressed: yes when `onPress` set (Tappable :20). disabled/loading/error/selected: not handled (no branch found). reduce motion: inherited.
- Accessibility: `accessibilityRole="button"` only when pressable :20; label only if the caller passes one :20 (pressable card without label reads its children). No explicit hit size (content-sized).
- Tokens: `colors.card`, `line` :28,:31; `radius.card` :29; `space.lg`/`sm` :32-33. Raw: `borderWidth: 1` :30. No shadow, hairline (matches DESIGN_SYSTEM section 4).
- Used in: 1 JSX, 1 file: features/dev/KitScreen.tsx (1). Not used by any real screen.
- Notes: DESIGN_SYSTEM section 6 lists "Card / ListRow / GroupedList" as one family; `Card` is effectively dead code outside the kit (screens build their own card views). `card` fill on a `bg` screen is the same white with a hairline, so a Card on a white screen is just an outlined box.

<a id="08-chip"></a>
### Chip
- Source: apps/mobile/src/components/Chip.tsx:30-66 (`Chip`), :84-107 (`ChipGroup`), :79-82 (`toggleChip`); styles :109-121
- Props and variants: `label` :10; `selected` :11; `disabled` :12; `onRemove` (removable chip with x) :14; `onPress` :15; `removeLabel` :16; `icon` :18; `surface` bg2|card :20; `role` choice|tab :25; `testID` :26. `ChipGroup` mode single|multi :76.
- States: pressed: yes (Tappable :45, `guard={false}` :54 so no double-tap guard). selected: ink fill with inverse text :117,:58-59. disabled: opacity 0.35 :118. removable: x icon :62. loading/error: n/a. reduce motion: inherited from Tappable.
- Accessibility: role `tab` for `role="tab"`, `button` for removable, `checkbox` otherwise :46; state `selected` or `checked` :48-50; label includes removeLabel :47; 36 pt tall (`size.buttonS` :111) grown to 44 pt by `SMALL_SLOP` hit slop :53 (vertical only); `ChipGroup` is a `radiogroup` for single mode but its chips are `checkbox` role (:93 vs :46) which is inconsistent.
- Tokens: `colors.ink | bg2 | card` :117; `radius.chip` :116; `space.xs/md` :114-115,:120; `size.buttonS` :111. Raw: icon sizes 16 :58,:62.
- Used in: 41 JSX, 23 files; top: features/sell/SellDetailsScreen.tsx (4), features/offers/OfferSheetScreen.tsx (3), features/campus/PostFoodScreen.tsx (3).
- Notes: matches DESIGN_SYSTEM section 6 (filter, choice, removable; off, on ink fill, disabled); `role="tab"` and `surface` are DEC 90 additions. Selected state is a color change only, no check glyph.

<a id="08-confirmdialog"></a>
### ConfirmDialog
- Source: apps/mobile/src/components/ConfirmDialog.tsx:32-88 (styles :90-92)
- Props and variants: `visible` :13; `title` :14; `message` :15; `confirmLabel` (a verb) :17; `cancelLabel` :18 (default `sheet.cancel`); `destructive` :19; `onConfirm` (may return a promise) :21; `onCancel` :22; `campusTimeZone` :23; `testID` :24. Built on `Sheet`.
- States: busy: confirm button `loading`, cancel `disabled`, close blocked :66,:78-84. error: inline red text from `errorCopy` and the dialog stays open :53-62,:72-76. resets error on reopen :48-51. pressed: via Button. disabled: n/a beyond busy. selected: n/a. reduce motion: inherited from Sheet.
- Accessibility: Sheet focus trap and Android back via `Modal`; error has `accessibilityRole="alert"` :73. Buttons are 54 pt (`Button` default size L).
- Tokens: none directly except `space.sm/xs` :91; text tones `ink2`, `red` :68,73.
- Used in: 12 JSX, 10 files; top: features/meetups/MeetupDayScreen.tsx (2), features/me/SettingsScreens.tsx (2), features/offers/OfferScreen.tsx (1).
- Notes: DESIGN_SYSTEM section 6 has no ConfirmDialog row; it is a sheet, not a centered alert (consistent with "sheets feel native"). Confirm is `dark` or `destructive`; no haptic is attached.

<a id="08-crashscreen"></a>
### CrashScreen
- Source: apps/mobile/src/components/CrashScreen.tsx:23-56 (styles :58-71)
- Props and variants: `error: Error` :13; `retry` :15. Content: `GlyphTile icon="alert"` :38, heading `crash.title` :41, body `crash.body` :44, secondary L `Button` `crash.retry` :47-53 (copy `apps/mobile/src/strings/en.ts:99-103`).
- States: retrying: button `loading` :51. error text never shown :20-21. captures the error to Sentry once :25. reduce motion/pressed: via Button.
- Accessibility: `accessibilityLiveRegion="polite"` :37; heading role :40; testID `crash-screen` :37. Insets via `rt.insets` :65-66.
- Tokens: `colors.bg` :63; `space.screen/2xl/lg/xl` :64-67; `size.copyMax` :69. No raw values.
- Used in: 1 JSX, 1 file: app/_layout.tsx:62 (`ErrorBoundary` export). Also referenced from the states gallery (features/dev/stateFrames.tsx).
- Notes: DESIGN_SYSTEM section 10 global states; centered-everything layout (Hick/peak-end not at issue) and a secondary (grey) button as the only action. Body copy is 2 sentences (en.ts:101).

<a id="08-emptystate"></a>
### EmptyState
- Source: apps/mobile/src/components/EmptyState.tsx:44-88 (`EmptyState`), :26-38 (`GlyphTile`); styles :90-116
- Props and variants: `icon` :13; `title` :14; `body` :15; `tile` neutral|accent :17; `suggestions` (Tag chips, display only) :19; `action` {label,onPress} :20; `secondaryAction` :21; `testID` :22. `GlyphTile` props `icon`, `tile` :26-32 (88 pt tile, 38 pt glyph, `size.glyphTile/glyphIcon` tokens.json:179-180).
- States: this is the empty state. action rendered as primary `Button` :76, secondary as `text` Button :77-83. loading/error/disabled/selected: n/a. pressed: via Button. reduce motion: no animation.
- Accessibility: tile hidden `accessible={false}` :34; title `accessibilityRole="header"` :58; copy centered. Buttons 54 pt. Action is optional (`action?` :20) although the doc comment says "always a next step" :41-43.
- Tokens: `colors.accent | bg2` :105; `radius.sheet` :102; `space.screen/2xl/lg/xs/sm` :91-115; `size.copyMax` :107. No raw values.
- Used in: 49 JSX, 25 files; top: features/dev/stateFrames.tsx (14), features/offers/InboxScreen.tsx (3), features/quad/QuadFeedScreen.tsx (3). `GlyphTile` is also used by ErrorState, CrashScreen, PermissionPrimer.
- Notes: matches DESIGN_SYSTEM section 7 ("empty-state glyph tiles, a single icon on a bg2 square"). Everything is centered (`alignItems: 'center'` :93) and the actions are stretched in the middle of the screen, not docked at the thumb (P7). `suggestions` renders as grey Tags which look tappable but are not (:67-73).

<a id="08-errorstate"></a>
### ErrorState
- Source: apps/mobile/src/components/ErrorState.tsx:37-82 (`ErrorState`), :18-20 (`errorTitle`); styles :84-95
- Props and variants: `error: unknown` :23; `onRetry` :25; `campusTimeZone` :27; `layout` screen|inline :29; `testID` :30.
- States: offline (`ERR_OFFLINE`): wifi glyph, `states.offlineTitle`/`offlineBody` :62,:65,:68 (en.ts:90-97). other errors: alert glyph, `states.errorTitle` and `errorCopy(appError, {campusTimeZone})` :62-68. retry: secondary Button, spinner while the promise runs :48-58,:72-78; retry only rendered when `onRetry` passed :71. inline layout drops the glyph tile and uses size M :62,:77. reduce motion: none.
- Accessibility: `accessibilityLiveRegion="polite"` :61; heading role :64; retry button 54/44 pt.
- Tokens: `space.screen/2xl/xl/lg/xs` :86-93; `size.copyMax` :93. No raw values.
- Used in: 46 JSX, 32 files; top: features/me/MeScreens.tsx (6), features/quad/QuadMoreScreens.tsx (4), features/saved/SavedScreen.tsx (2).
- Notes: DESIGN_SYSTEM section 6 "EmptyState / ErrorState / Skeleton per layout". Copy "Couldn't load this" is generic: it names no object; centered layout. Title `errorTitle` is the same for every screen.

<a id="08-iconbutton"></a>
### IconButton
- Source: apps/mobile/src/components/IconButton.tsx:40-80 (styles :82-93)
- Props and variants: `icon: IconName` :17; `accessibilityLabel` (required) :19; `accessibilityHint` :20; `onPress` :21; `disabled` :22; `filled` :23; `surface` bg2|card|accent :29; `tone` ink|ink3|onPhoto :31; `selected` (solid icon, "selected" to screen readers) :33; `badge` :35; `testID` :36.
- States: pressed: yes (Tappable :55). disabled: opacity 0.35 :90. selected: icon drawn filled :74; accent fill when `filled` + `surface="accent"` :73,:89. badge: count in corner via `Badge` :76. loading/error: not handled (no branch found). reduce motion: inherited.
- Accessibility: role button :57; label includes count `nav.tabWithBadge` :58-62; `a11yState` :64-66; hit area 44x44 (`size.hit`) :84-85, matches DESIGN_SYSTEM section 6 "44 hit area".
- Tokens: `colors[surface]` :89; `radius.chip` :86; `size.hit` :84; `liftShadow()` (soft shadow) when `surface` is card or accent :91 (`apps/mobile/src/theme/shadow.ts`). No raw values.
- Used in: 36 JSX, 23 files; top: features/feed/ListingScreen.tsx (4), features/quad/QuadFeedScreen.tsx (3), features/chat/ChatScreen.tsx (3). Also in NavBar (NavBar.tsx:61) and Stepper (Stepper.tsx:50,60).
- Notes: shadow on `card`/`accent` filled buttons (:91) is in tension with "no card-with-shadow everywhere"; limited to over-photo controls (:25-28 doc). Icon size is the `Icon` default 22 (Icon.tsx:32); there is no size prop.

<a id="08-icon"></a>
### Icon
- Source: apps/mobile/src/components/icons/Icon.tsx:32-66 (data `iconData.ts:72-680`, type `IconName` iconData.ts:8-70)
- Props and variants: `name: IconName` :9; `size` default 22 :10,32; `tone` ink|ink2|ink3|red|green|amber|sky|peach|lilac|onAccent|inverse|onPhoto :12-24; `strokeWidth` default 1.8 (2.2 marks selected tab) :26,32; `filled` (solid fill, liked heart DEC 121) :28,40. 24x24 viewBox :39, round caps and joins :43-44.
- States: decorative only, `accessible={false}` and `no-hide-descendants` :45-46. No pressed/disabled/loading/error (the host control owns those). reduce motion: no animation.
- Accessibility: never names itself; every icon-only control must come through `IconButton` (label required). Size is a plain number so icons do not scale with Dynamic Type (not handled).
- Tokens: `theme.colors[tone]`, with `inverse` mapped to `colors.bg` :34. Raw: none; callers pass literal sizes (16, 18, 20, 24, 28, 38 via `size.glyphIcon`).
- Used in: 45 JSX in features/app across 26 files; top: features/feed/ListingScreen.tsx (6), features/quad/components/VoteControl.tsx (4), features/comments/CommentsScreen.tsx (3); also used by Banner, Chip, EmptyState, Input, ListRow, MessageBubble, NavBar, OptionRow, Photo, TabBar, Toast.
- Notes: 64 glyphs, generated by `scripts/generate-icons.mjs` (iconData.ts:1) as a single stroke set (DESIGN_SYSTEM section 7 lines 144-148: 1.8 px, rounded caps; matches). Glyph list with data line range and number of source files that contain the quoted name (approximate, string-literal grep, tests excluded): alert 73-82 (8); arrdown 83-88 (0); arrow 89-94 (1); back 95-100 (9); ban 101-112 (7); bell 113-122 (9); bookmark 123-128 (6); building 129-134 (1); cal 135-148 (3); camera 149-160 (13); cards 161-174 (3); chart 175-180 (0); chat 181-186 (20); chdn 187-192 (2); check 193-198 (7); chev 199-204 (5); chup 205-210 (1); clock 211-222 (3); copy 223-236 (0); del 237-246 (0); down 247-252 (1); download 253-258 (3); edit 259-268 (0); eye 269-280 (7); flag 281-286 (3); food 287-292 (7); gear 293-304 (1); gift 305-318 (1); grid 319-352 (1); heart 353-358 (6); help 359-370 (2); image 371-390 (6); info 391-402 (15); lock 403-416 (8); mail 417-430 (3); minus 431-436 (1); more 437-443 (8); phone 444-449 (3); pin 450-461 (4); plus 462-467 (4); plussq 468-481 (2); poll 482-487 (4); qr 488-517 (0); quad 518-527 (14); refresh 528-533 (1); search 534-545 (11); send 546-551 (5); share 552-557 (6); shield 558-567 (6); shift 568-573 (0); sliders 574-591 (0); swap 592-597 (1); tag 598-609 (11); tool 610-615 (2); trash 616-621 (2); trend 622-627 (2); undo 628-637 (0); up 638-643 (1); user 644-655 (9); users 656-667 (4); wifi 668-673 (2); x 674-679 (9). Zero hits (apparently unused): arrdown, chart, copy, del, edit, qr, shift, sliders, undo. Missing glyphs: every `icon=` / `name=` value in features and components is a valid `IconName` (typed; the only unmatched `name="..."` hits are route names in `app/(tabs)/_layout.tsx:68-73`, not icons). Glyphs the design or screens seem to need but that do not exist: thumbs up and thumbs down (ratings are two text Buttons, features/deals/DealScreens.tsx:332-333), a verified/.edu badge glyph (verified state reuses `check`/`shield`, P5), a star or rating glyph, and a "close in circle". No `Icon` accepts a color outside the tone list, so there is no way to draw an accent-colored icon on `bg` (intended, UX-03).

<a id="08-input"></a>
### Input
- Source: apps/mobile/src/components/Input.tsx:49-119 (styles :123-153; `appFocusRing` :31-33)
- Props and variants: `kind` text|email|price|search :9,36-46; `label` (required, also the accessibility label) :12; `error` :14; `disabled` :15; `loading` (right spinner) :16,110; `hideLabel` (search) :18; `inlineLabel` (small label inside the field, white while focused) :23; all other `TextInputProps` pass through :11,:107.
- States: default / focus / error / disabled computed :66. focus: 2 px ink border :132-134 (and white fill when `inlineLabel`) :138-139; error: redBg fill, red border, message under the field in red meta text with polite live region :112-116,:134-137; disabled: opacity 0.35 and not editable :93,:141; loading: ActivityIndicator on the right :110. keyboard-controller awareness (DESIGN_SYSTEM section 6): not handled in this component (no branch found; Sheet uses it, Input does not). reduce motion: no animation (instant ring change).
- Accessibility: `accessibilityLabel={label}` :90 even when the label is hidden; `a11yState({disabled})` :91; error text is also the accessibility hint :92; field min height 54 pt (`size.buttonL`, :126), inline 66 pt; native input min height 44 (`size.hit`) :146; `$` prefix and search icon are static. No `maxFontSizeMultiplier` (full scaling); input font size is `type.body.fontSize` raw size without line height :148.
- Tokens: `colors.ink | red | redBg | bg2 | card | ink3 | ink2` :94-95,:133-140; `radius.control` :131; `space` sm/lg/xs :124,129-130; `size` buttonL/buttonS/hit :126,146. Raw: `borderWidth: 2` :132, icon size 18 :76, `fontWeight '600'/'400'` :144,149.
- Used in: 41 JSX, 21 files; top: features/dev/KitScreen.tsx (6), features/me/MeScreens.tsx (5), features/campus/PostNewsScreen.tsx (3).
- Notes: matches DESIGN_SYSTEM section 6 states (focus ring 2 px ink, redBg + red ring + message, disabled, loading). A grey field with a 2 px transparent border means the field grows 4 pt on focus without layout shift (border is always 2 px, :132). Error is shown as red text only plus red border (color is not the only cue because the message text exists).

<a id="08-listingtile"></a>
### ListingTile
- Source: apps/mobile/src/components/ListingTile.tsx:27-69 (styles :71-74)
- Props and variants: `title` :15; `price` :16; `photo` :17; `blurhash` :18; `state` default|sold|hold :12,19; `note` (line under title, e.g. "Price dropped") :21; `onPress` :22; `testID` :23.
- States: default; sold: whole tile at 0.5 opacity plus a neutral "Sold" Tag :37,:72,:49-53; hold: amber Tag :51; pressed: yes (Tappable :40); note shown in green meta text :61-65. loading: via `Photo` blurhash. error: via `Photo` image placeholder. disabled/selected: not handled. reduce motion: inherited.
- Accessibility: `accessibilityRole="button"` with label "title, price. tag. note" built from `search.tileLabel` :38,:42; text lines `numberOfLines` 1 (price) and 2 (title) :55,:58; fixed photo ratio means no layout break at large text. Sold opacity 0.5 lowers text contrast on the whole tile (a11y-contrast risk).
- Tokens: `space.xs/sm` :72-73; photo `rounded="thumb"` :48. Text tones `ink`, `ink2`, `green`. No raw values.
- Used in: 4 JSX, 4 files; top: features/search/ResultsScreen.tsx (1), features/feed/ListingStrip.tsx (1), features/me/MeScreens.tsx (1).
- Notes: DESIGN_SYSTEM section 6 says "sold (overlay), hold (overlay)"; implementation is an opacity fade plus a Tag in the photo's top-left corner, not a photo overlay. Only 4 uses: most listing grids elsewhere (Saved, Quad, Profile) may render their own tiles.

<a id="08-listrow"></a>
### ListRow
- Source: apps/mobile/src/components/ListRow.tsx:28-74 (`ListRow`), :81-115 (`GroupedList`); styles :117-143
- Props and variants: `label` :12; `value` :13; `icon` :14; `iconTile` (red|sky|ink|green|lilac|ink3|peach|amber settings tile) :9,19; `onPress` :20; `destructive` :21; `right` (custom right side, replaces value + chevron) :23; `accessibilityHint` :24. `GroupedList`: `header` (uppercased) :82,96-98, `footer` :109, `surface` bg2|card :89,100.
- States: pressed: raw `Pressable` with `bg3` background, no scale :64-70,:125 (not `Tappable`). destructive: red label and icon :45,:47. non-pressable row when no `onPress` :62. disabled/loading/error/selected: not handled (no branch found). reduce motion: no animation.
- Accessibility: pressable row `accessibilityRole="button"`, label "label, value" :65-67; hint :67; min height 52 (`space.rowMin`) :119; `GroupedList` header has `accessibilityRole="header"` :96; header text is `.toUpperCase()` :97, so screen readers read it per-letter in some locales and the style is all caps (not in the type scale).
- Tokens: `space.rowMin | lg | md` :119-123; `colors.bg3 | line | bg2 | card` :125,:130,:134; `radius.card` :131; tile colors `colors[fill]` :141. Raw: icon sizes 18/20 :42,:45,:57, `strokeWidth 2` :42, divider `height 1` :134.
- Used in: 58 JSX, 9 files; top: features/me/SettingsScreens.tsx (24), features/dev/stateFrames.tsx (9), features/chat/ChatDetailsScreen.tsx (7).
- Notes: DESIGN_SYSTEM section 6 "Card / ListRow / GroupedList: pressed" matches only loosely: pressed is a grey fill, not the 0.97 scale of the `tap` motion token ("every pressable", section 5). `iconTile` colored tiles are Settings-only (DEC 90, :16-18).

<a id="08-mark"></a>
### Mark
- Source: apps/mobile/src/components/Mark.tsx:14-31 (paths `HANDOFF_PATHS` :5)
- Props and variants: `size` default 32 :15; `tone` ink|onAccent|inverse|accent :10; `accessibilityLabel` :11.
- States: static SVG, no states. reduce motion: n/a.
- Accessibility: hidden unless an `accessibilityLabel` is passed, then `role="image"` :22-24.
- Tokens: `theme.colors[tone]` (`inverse` -> `bg`) :16. Raw: viewBox 100 and path data :5,:21.
- Used in: 6 JSX, 7 files; top: features/waitlist/UnlockedScreen.tsx (1), features/sell/ShareCard.tsx (1), features/auth/LaunchScreen.tsx (1); also TabBar rail (TabBar.tsx:152).
- Notes: DESIGN_SYSTEM section 7 "Logo: the chosen mark (Q6) in components/Mark.tsx" matches. `tone="accent"` is allowed as a fill (never text).

<a id="08-messagebubble"></a>
### MessageBubble
- Source: apps/mobile/src/components/MessageBubble.tsx:68-266 (styles :268-352; types :14-65)
- Props and variants: `kind` mine|theirs|system :14,37; `body` :39; `state` pending|sent|failed :15,40; `author` :42; `scamHint` :43; `onRetry` :44; `photo` ({source, aspect, blurred, progress, onReveal, onOpen, onLoad, onError}) :20-34,46; `onLongPress` (report) :48; `surface` bg|card :54; `first` / `last` grouping :60-61; `time` :63; `testID` :64.
- States: pending: opacity 0.6 :287 and "Sending" in the spoken label :130-132; sent: default; failed: red alert row "failed" plus whole bubble becomes a Tappable retry button when `onRetry` set :166,:191-200,:244-251; scam hint row (amber, shield icon, alert role) for incoming :252-263; photo: blurred cover with eye icon and "Tap to view" :146-153, upload progress strip with percent :154-160; system rows as plain text or a pill :88-107; grouped corners :290-299; time under the last bubble when sent :232-243. loading (photo): `Photo` blurhash/placeholder. reduce motion: no animation in this component.
- Accessibility: composed spoken label with author, photo description, uploading/sending :113-133; `longpress` accessibility action "report message" :209-214; bubbles use `accessible` only when not pressable :176; time hidden from screen readers :237-238; Dynamic Type: bubbles use full scaling, `maxWidth` measured from the row width :87,:278; photo upload text uses `overlay` cap :149,:156.
- Tokens: `colors.accent | card | bg2 | amberBg | overlay` :282-286,:316,:325,:338,:349; `radius.card | thumb | chip` :291,:348,:337; `space` xs..2xl. Raw: `PHOTO_BLUR_RADIUS = 40` :18, widths `'78%'`, `0.78`, `'65%'`, `'80%'` :278,:302,:346, `marginTop: space.xs / 2` :274.
- Used in: 2 JSX, 1 file: features/chat/ChatScreen.tsx (2).
- Notes: DESIGN_SYSTEM section 6 MessageBubble row: `meetup` kind is not in this component (kinds are mine|theirs|system, :14); day separators (DEC 120) are not here; scam hint row and grouping match. "mine" is accent fill with `onAccent` text :182,:282. Failed state is color plus icon plus word (not color alone).

<a id="08-navbar"></a>
### NavBar
- Source: apps/mobile/src/components/NavBar.tsx:33-85 (styles :87-116)
- Props and variants: `title` :11; `variant` large|inline :16 (default inline); `leading` back|close|none :17 (default back for inline, none for large :36); `onLeading` :18; `trailing` (IconButtons, a step count, or a text Button) :20; `safeTop` :22; `tone` default|onPhoto :24; `testID` :25.
- States: large: left-aligned `title` text variant (26/800) with trailing actions on the right :46-55; inline: back/close `IconButton`, title `bodyStrong` max 2 lines, centered on iOS and left-aligned on Android :44,:57-84. pressed: via IconButton. reduce motion: none (no collapsing large title, no scroll-linked behavior: not handled). loading/error/disabled/selected: n/a.
- Accessibility: title has `accessibilityRole="header"` :49,:74; leading button label from `nav.back`/`nav.close` :63; title wrapper `pointerEvents="none"` :69; large title is a fixed row (`minHeight navBar + lg`) :96, title text scales with Dynamic Type and the row grows; inline title capped by `numberOfLines={2}` :75.
- Tokens: `size.navBar` (46), `size.hit`, `space.*`, `rt.insets.top` :93-105. No raw values.
- Used in: 78 JSX, 35 files; top: features/me/SettingsScreens.tsx (7), features/deals/DealScreens.tsx (6), features/profiles/ProfileViewScreen.tsx (5). Also PermissionPrimer (PermissionPrimer.tsx:51).
- Notes: DESIGN_SYSTEM section 6 and DEC 90: "tab roots large title, pushed screens inline title". The large variant is a static header, not an iOS collapsing large title; there is no hairline or blur on scroll.

<a id="08-optionrow"></a>
### OptionRow
- Source: apps/mobile/src/components/OptionRow.tsx:19-58 (`OptionRow`), :61-63 (`Checkbox`); styles :65-90
- Props and variants: `label` :9; `kind` radio|checkbox :10; `selected` :11; `onPress` :12; `disabled` :13; `description` :14; `testID` :15. `Checkbox` = OptionRow with `kind="checkbox"` :61-63.
- States: off / on: ring 2 px `line2` or `ink`, checkbox fills ink with an inverse check, radio shows an ink dot :73-88,:40-46; disabled: opacity 0.35 :71. pressed: not handled (raw `Pressable`, no feedback :29). loading/error: not handled. reduce motion: no animation.
- Accessibility: role radio/checkbox :30; `checked` + `disabled` via `a11yState` :33; description is the hint :32; row min height 52 (`rowMin`) :67; the whole row is the target; mark is 24 pt (`space.xl` :74-75).
- Tokens: `colors.ink | line2` :78-79,:87; `radius.chip | space.sm` :76; `space.rowMin/md/xl` :67-75. Raw: `borderWidth: 2` :77, icon size 16 :44.
- Used in: 12 JSX, 7 files; top: features/dev/KitScreen.tsx (3), features/meetups/PlanMeetupScreen.tsx (2), features/deals/DealScreens.tsx (2). Also ReportSheet (ReportSheet.tsx:231).
- Notes: DESIGN_SYSTEM section 6 "OptionRow: radio / checkbox; whole row pressable" matches. Checkbox corner radius is `space.sm` (8 pt) :76, not a radius token. No press feedback (section 5 says every pressable).

<a id="08-otpinput"></a>
### OTPInput
- Source: apps/mobile/src/components/OTPInput.tsx:49-112 (styles :114-139; helpers `normalizeCode` :19, `otpCellState` :37)
- Props and variants: `value` :24; `onChange` :25; `onComplete` :26; `label` :27; `error` :28; `disabled` :29; `autoFocus` :31. 6 cells over one hidden input, `OTP_LENGTH = 6` :16.
- States: cell states active / filled / empty :35-41,:124-135; error: red border, redBg fill :124-134, shake (4 timed steps of 50 ms, +-8/6 pt) and `haptic('warning')` :63-75; disabled: opacity 0.35 :136; waiting/focus: active cell ink border :126-127. reduce motion: shake skipped, haptic still fires :65-66 (the cue becomes color only). loading/pressed: not handled (pressing focuses the hidden input :78).
- Accessibility: hidden input labelled `label` :94; `oneTimeCode` autofill :99-100; the visual cells have no accessible semantics (the input is the target); digits use `overlay` cap (1.4x) :84; no live-region announcement of the error (only color/shake: not handled).
- Tokens: `colors.red | redBg | ink | line | bg2 | card` :124-135; `size.otpCell` (52) :118-119; `radius.control` :120; `space.sm` :115. Raw: shake offsets -8/8/-6 and 50 ms :68-71, hidden input 1x1 :138.
- Used in: 4 JSX, 4 files; top: features/auth/SessionExpiredSheet.tsx (1), features/auth/VerifyScreen.tsx (1), features/dev/KitScreen.tsx (1).
- Notes: matches DESIGN_SYSTEM section 6 "OTPInput 6 cells ... single hidden input, oneTimeCode" and section 5 warning haptic. Haptic triggered inside the component whenever `error` flips true.

<a id="08-permissionprimer"></a>
### PermissionPrimer
- Source: apps/mobile/src/components/PermissionPrimer.tsx:37-80 (`PermissionPrimerView`), :96-118 (`PermissionPrimer`); styles :120-136
- Props and variants: view props `kind` camera|photos|notifications :21,14-18; `step` primer|settings :23; `onContinue` :24; `onOpenSettings` :25; `onAlternative` :27; `onClose` :28; `busy` :29; `testID` :30. Wrapper: `onGranted` :84; it never prompts on mount :92-95.
- States: primer: accent `GlyphTile`, title/body, primary Button `cta` (loading while requesting) :53,:72, optional text alternative :74-76; denied (settings): neutral tile, denied title/body, dark Button "Open Settings" :53,:56-60,:64-70; undetermined check: plain empty screen :103-105. granted: calls `onGranted` :99-101. reduce motion: none.
- Accessibility: headings have `accessibilityRole="header"` :55; close via NavBar `leading="close"` :51; buttons 54 pt; tile hidden.
- Tokens: `colors.bg` :121; `space.screen/xl/sm/xs/lg` :122-134; `size.copyMax` :129. Copy `strings.primer` (en.ts:113-143).
- Used in: 7 JSX, 6 files; top: features/dev/stateFrames.tsx (2), features/sell/SellScanScreen.tsx (1), features/sell/SellPhotosScreen.tsx (1).
- Notes: DESIGN_SYSTEM section 6 "PermissionPrimer: camera, photos, notifications; undetermined, denied -> Settings" matches. Layout is centered content with the actions pinned at the bottom (:63-77, `actions` :131-135), which already follows P7. Body copy is long (en.ts camera body, 2 sentences).

<a id="08-photo"></a>
### Photo
- Source: apps/mobile/src/components/Photo.tsx:50-119 (styles :121-139; `imageStyles` :147-149; `photoState` :15)
- Props and variants: `source` :23; `blurhash` :25; `accessibilityLabel` :27; `aspectRatio` default 1 :29,54; `fill` :31; `rounded` none|thumb|card :32; `contentFit` cover|contain :33; `backdrop` :35; `blurRadius` :37; `onLoad` :39; `onError` :41; `testID` :42.
- States: loading: blurhash placeholder :98 over a bg2 backdrop :130; loaded: fades in 150 ms :101; error: bg2 placeholder with `image` glyph and a spoken "Photo didn't load" :90-93,:82-86 (en.ts:83-87); no source: counts as loading (blurhash shows) :15-19; recycled cells reset state :69-73. reduce motion: transition 0 :101.
- Accessibility: decorative unless `accessibilityLabel` is passed (`accessible`, role image) :79-81,:87; image itself `accessibilityIgnoresInvertColors` :113. The error placeholder is not retryable (no tap to reload: not handled).
- Tokens: `colors.bg2` :130,:137; `radius[rounded]` :131; `motion.fade.duration` :101. Raw: error glyph size 28 :92.
- Used in: 26 JSX, 22 files; top: features/dev/KitSections2.tsx (3), features/dev/stateFrames.tsx (3), features/campus/FeedPost.tsx (2). Also Avatar (imageStyles), ListingTile, MessageBubble, PhotoCarousel, ZoomableImage.
- Notes: DESIGN_SYSTEM section 6 "Photo / PhotoCarousel: loading (blurhash), error (placeholder)" matches. `imageStyles` is plain RN StyleSheet because Unistyles styles are not applied to expo-image on web (:141-146, DEC 90).

<a id="08-photocarousel"></a>
### PhotoCarousel
- Source: apps/mobile/src/components/PhotoCarousel.tsx:55-142 (styles :144-159; helpers `pageFromOffset` :25, `stepPage` :32)
- Props and variants: `photos` ({key, source, blurhash}) :41,18-22; `label` :43; `aspectRatio` :44; `onPressPhoto` :45; `onIndexChange` :46; `testID` :47.
- States: populated: paging FlatList with "1 / 4" count pill when more than one photo :109-139; empty (0 photos): one `Photo` with no source (blurhash/placeholder) :106-108; per-photo loading/error via `Photo`. pressed: raw `Pressable` without feedback :121-129. reduce motion: paging has no animation of its own.
- Accessibility: one adjustable element with increment/decrement/activate actions and a "1 / 4" value :94-102,:78-89; inner list hidden from accessibility :119; count text uses `overlay` cap :135.
- Tokens: `colors.bg2 | overlay` :148,:157; `radius.chip` :156; `space.lg/md/sm/xs` :152-155. No raw values (inline `style={{ width }}` :126 is a measured value).
- Used in: 2 JSX, 3 files; top: features/feed/ListingScreen.tsx (1), features/dev/KitSections2.tsx (1).
- Notes: DESIGN_SYSTEM section 6 matches. The count is a pill on a photo scrim (`overlay`); there are no dots (P1 chrome is minimal). `scrollToIndex({animated:false})` for the accessibility path :87.

<a id="08-progress"></a>
### Progress
- Source: apps/mobile/src/components/Progress.tsx:26-50 (`StepIndicator`), :56-92 (`ProgressBar`), :12 (`clampProgress`), :18 (`stepLabel`); styles :94-110
- Props and variants: `StepIndicator` {step, total, testID} :26-34; `ProgressBar` {value 0 to 1, label, testID} :56-65.
- States: step bars on/off (ink vs bg3) :96-101; progress fill animates over the `fade` timing (150 ms) or jumps with reduce motion :67-73. loading/error/pressed: n/a.
- Accessibility: both are `progressbar` with `accessibilityValue` (steps min 1 max total; bar 0 to 100) :37-44,:79-85; "Step 1 of 3" label from `nav.step` :18-20 (en.ts:105-110).
- Tokens: `colors.ink | bg3 | bg2` :100,:106,:109; `size.stepBar | progressBar` :98,:103; `radius.chip` :99,:104,:109; `space.sm` :95.
- Used in: 8 JSX, 7 files; top: features/dev/stateFrames.tsx (3), features/dev/KitSections2.tsx (2), features/sell/SellStep.tsx (1).
- Notes: DESIGN_SYSTEM section 6 "ProgressBar / StepIndicator" matches. File name is `Progress.tsx` (two exports, no component named Progress).

<a id="08-reportsheet"></a>
### ReportSheet
- Source: apps/mobile/src/components/ReportSheet.tsx:125-290 (styles :292-304; pure helpers `reportReasons` :69, `canBlock` :81, `blockDefault` :94, `phaseAfterError` :102)
- Props and variants: `visible` :109; `onClose` :110; `target` listing|user|chat|message|quad_post|quad_reply|listing_comment :18-19,111; `name` :113; `onSubmit(input)` :115; `campusTimeZone` :116; `testID` :117. 15 reasons :22-37, per-target lists :54-67 (listing 6, person/chat 7, message 7, Quad/comment 9).
- States: form :215-288; submitting (rows, textarea, toggle disabled, Send `loading`) :178,:190,:236,:261,:268,:285; sent: `SuccessCheck` + title + body (+ "blocked" body when block was on) + Done :192-211; duplicate (`ALREADY_REPORTED`): same sheet without the check :200-207,:102-104; error: inline red alert text and the form stays :275-279,:184-186; crisis block for `self_harm` :241-248; Send disabled until a reason is picked :284; reset on every open :143-154; close blocked while submitting :216. reduce motion: inherited (Sheet, SuccessCheck).
- Accessibility: reason list is a `radiogroup` :229; rows are `OptionRow` (52 pt); the form scrolls inside a 60% screen-height cap so Send stays visible :217-221,:294; error `accessibilityRole="alert"` :276; headings via Sheet title.
- Tokens: `space.md/lg` :295-296; `radius.card` :301; `colors.bg2` :302. Raw: `screenH * 0.6` :294.
- Used in: 7 JSX, 9 importing files; top: features/comments/CommentsScreen.tsx (1), features/quad/useQuadActions.tsx (1), features/chat/ChatScreen.tsx (1).
- Notes: DESIGN_SYSTEM section 6 ReportSheet row (listing, user, chat, message; reason, details, block toggle, submitting, duplicate) matches; Quad/comment targets are additions (DEC 121). One sheet holds a 9-row radio list, a 500-char textarea and a toggle (Hick).

<a id="08-segmentedcontrol"></a>
### SegmentedControl
- Source: apps/mobile/src/components/SegmentedControl.tsx:21-62 (styles :64-89)
- Props and variants: `label` :8; `segments` ({value, label, badge, badgeLabel}) 2 to 4 :13,28-30; `value` :14; `onChange` :15; `surface` bg2|bg3 (track color) :17.
- States: selected: white `card` pill :80; unselected: transparent :80; badge: red count after the label, "99+" cap :35,:50-56; pressed: not handled (raw `Pressable` without feedback :37); disabled/loading/error: not handled. Throws an Error for fewer than 2 or more than 4 segments :28-30 (render crash, not an error state). reduce motion: no animation (selection jumps).
- Accessibility: `tablist` + `tab` roles, `selected` state :32,:39,:43; label includes `badgeLabel` ("2 need you") :40-42; segment height is `size.buttonS` 36 pt (:76) with no `hitSlop`, below the 44 pt target (a11y-target); badge count uses the `overlay` 1.4x cap :52.
- Tokens: `colors.bg2 | bg3 | card | red` :70,:80,:87; `radius.control` :69,:79; `size.buttonS | badge` :76,:83; `space.xs` :67-68. Raw: none.
- Used in: 11 JSX, 8 files; top: features/sell/SellDetailsScreen.tsx (2), features/me/MeScreens.tsx (2), features/dev/KitScreen.tsx (2).
- Notes: DESIGN_SYSTEM section 6 "SegmentedControl 2-4 segments, selected" matches. Badge is a third copy of the red-badge style (see Badge).

<a id="08-sheet"></a>
### Sheet
- Source: apps/mobile/src/components/Sheet.tsx:38-124 (`Sheet`), :163-204 (`ActionSheet`); styles :126-158 and :206-213; `shouldCloseSheet` :19-22
- Props and variants: `visible` :25; `onClose` :26; `title` :27; `children` :28; `testID` :29. `ActionSheet`: `actions` ({label, onPress, destructive}) :160,172 plus Cancel row :192-201. iPad/wide windows: floating centered card up to `LAYOUT.sheetMax` :35-37,:99,:131.
- States: opening: spring (`sheet` motion) with scrim fade :50-54; dragging: pan from 8 pt, follows finger, closes past 30% of height or fling above 800 pt/s :18-22,:64-75; closing: fade then unmount after `motion.fade.duration + 20` ms :56-59; snap-back spring :73; reduce motion: panel does not slide, it fades (`y` 0, opacity = fade) :53,:57,:79; scrim tap closes :89-95; keyboard: `KeyboardAvoidingView` (keyboard-controller) :97-101. loading/error/disabled: not handled here (callers).
- Accessibility: RN `Modal` (focus trap, Android back via `onRequestClose`) :86; `accessibilityViewIsModal` :105; title has header role :112; scrim is a labelled "Close" button :91-93; grabber hidden from screen readers :110. No visible close button on the panel (relies on scrim, grabber drag, back). `ActionSheet` rows are raw `Pressable` (no press feedback) with 52 pt min height :177-190,:207-212.
- Tokens: `colors.overlay | bg | line2 | line`; `radius.sheet`; `elevation.soft` shadow :132-148; `space.screen/sm/md/lg/xl`; `rt.insets.bottom` :143. Raw: 0.3 and 800 in `shouldCloseSheet` :21, `activeOffsetY(8)` :65, grabber `space.xs + 1` :153.
- Used in: 21 JSX (`Sheet` + `ActionSheet`), 17 files; top: features/offers/OfferScreen.tsx (2), features/comments/CommentsScreen.tsx (2), features/dev/KitScreen.tsx (2). Also ConfirmDialog, ReportSheet.
- Notes: DESIGN_SYSTEM section 6 "Sheet / ActionSheet: snap points; open, dragging, closing; focus trap; Android back closes" matches except there are no snap points (one height, content-sized). Section 4 sheet radius 28 and one soft shadow match. The sheet shadow (:145-148) is the only elevation besides Toast and IconButton.

<a id="08-shellscreen"></a>
### ShellScreen
- Source: apps/mobile/src/components/ShellScreen.tsx:14-27
- Props and variants: `testID` :7.
- States: static centered text `shell.comingSoon` "This screen is being built." (apps/mobile/src/strings/en.ts:24-30, `comingSoon`). No other states.
- Accessibility: `accessible`, role `summary` :20-21.
- Tokens: none from the app theme; it uses `useTheme()` colors from expo-router (`colors.background`, `colors.text`) :1,:15,:22,:24 and React Native's own `Text` and `StyleSheet` :2, bypassing `components/Text` (the "only way to render text", Text.tsx:35) and Unistyles.
- Used in: 0 (no import anywhere in `apps/mobile/src` or `app`; grep). Dead S1 scaffold.
- Notes: not in DESIGN_SYSTEM section 6. Candidate for deletion (code change, not a design change). If a user could ever reach it the screen would be an unstyled placeholder.

<a id="08-skeleton"></a>
### Skeleton
- Source: apps/mobile/src/components/Skeleton.tsx:58-101 (`SkeletonBlock`), :128-139 (`SkeletonCard`), :142-158 (`SkeletonList`), :161-175 (`SkeletonGrid`), :23-35 (`useDelayedLoading`), :53 (`lineHeight`); styles :177-206
- Props and variants: `SkeletonBlock` {width, line (type token), aspectRatio, fill, radius thumb|card|control|chip, raised} :39-50; `SkeletonCard` {testID} fills its parent (deck card) :128; `SkeletonList` {rows = 5, testID} :142 (thumb + 2 lines per row); `SkeletonGrid` {tiles = 6, testID} :161 (2 columns, `flexBasis 47%` :205).
- States: pulse: opacity 1 to 0.55 over 650 ms each way, repeating :75-89 (`motion.skeleton.duration` 1300, tokens.json:219-222); reduce motion: static, no pulse :70-74; loading delay hook `useDelayedLoading` (300 ms, board X3 "faster loads flash nothing") :23-35 has no caller outside this file (grep), so skeletons render immediately wherever used. error/empty: n/a.
- Accessibility: each skeleton is one `progressbar` element labelled `states.loading` ("Loading", en.ts:91) with `busy` :114-121; the shapes inside are not separate stops.
- Tokens: `colors.bg2 | bg3` :182; `radius[...]` :181; `space.md/sm/lg/xl/rowMin`; `size.avatarM` :197. Raw: pulse factor 0.45 :89.
- Used in: 46 JSX across 31 files (`SkeletonBlock/Card/List/Grid`); top: features/me/MeScreens.tsx (6), features/quad/QuadMoreScreens.tsx (4), features/dev/KitSections2.tsx (3).
- Notes: DESIGN_SYSTEM section 6 "EmptyState / ErrorState / Skeleton per layout" matches. List skeleton row = 44 pt square thumb + 60% and 40% lines, which does not match specific screens (e.g. Inbox rows, Notifications) one to one. Pulse is a whole-block opacity fade, not a shimmer (no gradient, consistent with the no-gradient rule).

<a id="08-stepper"></a>
### Stepper
- Source: apps/mobile/src/components/Stepper.tsx:23-69 (`clampStep` :18; styles :71-80)
- Props and variants: `label` :8; `value` :9; `onChange` :10; `min` 0, `max` 99, `step` 1 :11-13,27-29; `decreaseLabel` :14; `increaseLabel` :15.
- States: minus disabled at `min`, plus disabled at `max` :54,:64; pressed via IconButton; loading/error/selected: not handled. reduce motion: no animation.
- Accessibility: one `adjustable` element with `increment`/`decrement` actions and a value range :34-44; buttons are 44 pt IconButtons (`filled`); value text uses `tabular-nums` :79.
- Tokens: `space.rowMin/sm/2xl` :73-79. Raw: none.
- Used in: 1 JSX, 1 file: features/dev/KitScreen.tsx (1). Not used by a real screen.
- Notes: DESIGN_SYSTEM section 6 has no Stepper row. Unused outside the kit.

<a id="08-successcheck"></a>
### SuccessCheck
- Source: apps/mobile/src/components/SuccessCheck.tsx:13-39 (styles :41-76)
- Props and variants: `visible` :7; `accessibilityLabel` :7.
- States: draws the two strokes of a check over 400 ms via `useSuccessProgress` (apps/mobile/src/theme/motion.ts) :14,:19-24; reduce motion: fades in instead (doc comment :11, hook handles it). The component itself fires no haptic.
- Accessibility: `accessible`, role `image`, label from the caller :28-30.
- Tokens: `colors.accent | onAccent` :46,:63,:73; `radius.chip`; `space['2xl']*2` (64 pt circle) :43-44, `space.md/xl/xs/sm`. Raw: `rotate: '45deg'` :54.
- Used in: 7 JSX, 7 files; top: features/waitlist/UnlockedScreen.tsx (1), features/offers/OfferSheetScreen.tsx (1), features/sell/SellPostedScreen.tsx (1); also ReportSheet.
- Notes: DESIGN_SYSTEM section 5 `success` token ("400 ms check-draw: offer sent, listing posted, report sent") matches. The check is built from rotated Views, not an SVG path.

<a id="08-tabbar"></a>
### TabBar
- Source: apps/mobile/src/components/TabBar.tsx:67-139 (bar), :142-200 (`TabRail`), helpers `badgeText` :30, `tabAccessibilityLabel` :36; styles :202-287
- Props and variants: `items` ({key, label, icon, badge, prominent}) :14-25,42; `activeKey` :43; `onSelect` :44; `onLongPress` :45; `variant` ios|android :27,50 (android pill kept for the kit only :47-49); `safeBottom` :52; `layout` bar|rail :57 (iPad sidebar with wordmark :150-156); `testID` :58. Wired in apps/mobile/app/(tabs)/_layout.tsx:38-51.
- States: active: ink icon (stroke 2.2) and ink label; inactive: ink3 (stroke 1.8) :112-113,:126; prominent Sell tab: accent rounded rectangle with onAccent icon and no visible label :105-108,:123; badge: red count, "99+" :115-121; android active pill: accent :272. pressed: not handled (raw `Pressable`, no scale, no highlight :95,:162). long-press hook :102. reduce motion: no animation exists. No haptic (comment: "Tabs never slide or buzz" :62).
- Accessibility: `tablist`/`tab` roles, `selected` state :90,:98,:100; label includes unread count (`nav.tabWithBadge`, en.ts:105-110) :36-39; labels use the `overlay` 1.4x Dynamic Type cap and one line :124-130; item `minHeight` 44 (`size.hit`) :264, full-width flex hit area.
- Tokens: `colors.bg | line | ink | ink3 | accent | red | bg2`; `size.tabIcon` (25), `tabPillW/H` (64/32), `badge`; `space.*`; `rt.insets.bottom` :245-246. Raw: stroke widths 2.2 and 1.8 :113,:176-177, `fontWeight '600' | '700' | '800'` :219,:251,:286.
- Used in: 3 JSX, 2 files: app/(tabs)/_layout.tsx (1), features/dev/KitSections2.tsx (2).
- Notes: DESIGN_SYSTEM section 6 "TabBar uses the labelled iOS style on Android too, no accent pill (DEC 120)" matches (`variant` default `ios`, only the kit sets `android`). The ink-vs-ink3 active cue is color/weight only; the bar has a hairline top border and an opaque `bg` (no blur).

<a id="08-tag"></a>
### Tag
- Source: apps/mobile/src/components/Tag.tsx:17-25 (styles :27-45)
- Props and variants: `label` :17; `tone` neutral|accent|green|amber|red :6,17 (text tones :8-14).
- States: static, not pressable. reduce motion: n/a.
- Accessibility: plain text; the label is read as text. Size: `meta` (12.5 pt) with 2 pt vertical padding :31, so about 20 pt tall; no maxFontSizeMultiplier cap.
- Tokens: `colors.accent | greenBg | amberBg | redBg | bg2` :34-42; text `ink2 | onAccent | green | amber | red` :9-13; `radius.chip` :32; `space.sm`, `space.xs / 2` :30-31. Raw: `fontWeight '600'` :44.
- Used in: 20 JSX, 11 files; top: features/dev/KitScreen.tsx (5), features/profiles/ProfileViewScreen.tsx (4), features/quad/QuadMoreScreens.tsx (2); also EmptyState suggestions (EmptyState.tsx:69-71) and ListingTile (ListingTile.tsx:51).
- Notes: DESIGN_SYSTEM section 6 "Tag: neutral, accent, green, amber, red" matches. Tinted-fill tags for status sit against P3 ("status as plain words, colored only when it matters") when used for ordinary states.

<a id="08-tappable"></a>
### Tappable
- Source: apps/mobile/src/components/Tappable.tsx:45-59 (`useGuardedPress` :19-27, `SMALL_SLOP` :11-16, `DOUBLE_TAP_GUARD_MS` :8)
- Props and variants: all `PressableProps` except `style/children/onPress` :29; `onPress` :30; `children` :32; `style` (layout only, no colors) :37; `guard` (default true) :38,45.
- States: pressed: scale 0.97 over 120 ms, or opacity 0.7 with reduce motion (`usePressFeedback`, motion.ts:60-80); 500 ms double-tap guard :8,:19-27; disabled passed through :51. loading/error/selected: n/a.
- Accessibility: forwards accessibility props through `...rest` :50; does not enforce a 44 pt minimum itself; `SMALL_SLOP` helper adds 4 pt top and bottom to 36 pt controls :11-16.
- Tokens: `size.hit`, `size.buttonS` from `@onlyswap/tokens` :1,:12-14.
- Used in: 52 JSX, 29 files; top: features/comments/CommentsScreen.tsx (4), features/campus/FeedPost.tsx (4), features/feed/SwipeDeck.tsx (4). Inside components: Button, IconButton, Card, Chip, ListingTile, MessageBubble, Toast.
- Notes: implements DESIGN_SYSTEM section 5 `tap` and section 6 "double-tap guard 500 ms". Components that do not use it and therefore lack the scale feedback: ListRow (grey fill), OptionRow, Toggle, SegmentedControl, TabBar (bar and rail), ActionSheet rows, PhotoCarousel photos, OTPInput wrapper.

<a id="08-text"></a>
### Text
- Source: apps/mobile/src/components/Text.tsx:38-62 (styles :64-78)
- Props and variants: `variant` (`display | title | heading | price | body | bodyStrong | label | meta`, from `TypeVariant`, packages/tokens/tokens.json:96-141) default body :28,39; `tone` ink|ink2|ink3|red|green|amber|sky|peach|lilac|onAccent|inverse|onPhoto :13-25,40 (`accent` deliberately absent :10); `overlay` :31,41.
- States: static. Dynamic Type: `allowFontScaling` always on :51; `overlay` caps at `fontScale.overlayMax` 1.4 :52 (tokens.json:225) for text on photos, the tab bar, badges and OTP digits; re-mounts the native node when system font scale changes (`key={fontScale}`) :47,:50; Android `textBreakStrategy="simple"` :57. reduce motion: n/a.
- Accessibility: no role of its own; callers set `accessibilityRole="header"` etc. `inverse` maps to `colors.bg` :75.
- Tokens: `theme.type[variant]` (fontSize, fontWeight, letterSpacing, lineHeight, optional tabular fontVariant) :66-75; `theme.colors[tone]` :75.
- Used in: 530 JSX across features/app, 78 importing files; top: features/feed/ListingScreen.tsx (24), features/safety/SafetyScreens.tsx (23), features/me/MeScreens.tsx (21).
- Notes: matches DESIGN_SYSTEM section 3 (8 variants, scaling on, 1.4x only on overlays). The text tone list includes `sky`, `peach`, `lilac` as text colors (Text.tsx:20-22) used for kinds (meetups, free food, Quad); DESIGN_SYSTEM section 2 requires them to pass 4.5:1 only on their own `*Bg`, so on `bg` they are a risk (a11y-contrast). `ShellScreen.tsx:2` imports the raw RN Text, the only bypass inside `components`.

<a id="08-textarea"></a>
### TextArea
- Source: apps/mobile/src/components/TextArea.tsx:21-82 (styles :86-106; `counterTone` :8-12)
- Props and variants: `label` :15; `maxLength` (required) :16; `error` :17; `disabled` :18; plus `TextInputProps` except style/maxLength/editable :14.
- States: default / focus (2 px ink border) / error (redBg fill, red border, message with polite live region) / disabled (opacity 0.35) :35,:95-98,:75-79; counter "n/max" in ink2, amber from 90%, red at 100% :8-12,:43-49; min height 108 pt (`size.buttonL * 2`), grows with content :90. loading: not handled. reduce motion: no animation.
- Accessibility: input `accessibilityLabel={label}` and error as hint :54-55; counter has its own spoken label "n / max" :46; the input does not call `a11yState({disabled})` as `Input` does (:91 in Input.tsx) so VoiceOver may not say "dimmed" (a11y-VoiceOver, minor). No `maxFontSizeMultiplier`.
- Tokens: `colors.ink | red | redBg | bg2 | ink3`; `radius.control`; `space.lg/md/xs`; `size.buttonL`; `type.body` size and line height :103-104. Raw: `borderWidth: 2` :94, `0.9` threshold :10.
- Used in: 15 JSX, 14 files; top: features/me/MeScreens.tsx (2), features/offers/OfferSheetScreen.tsx (1), features/sell/SellDetailsScreen.tsx (1); also ReportSheet.
- Notes: DESIGN_SYSTEM section 6 "TextArea: counter; amber at 90%, red at 100%" matches.

<a id="08-toast"></a>
### Toast
- Source: apps/mobile/src/components/Toast.tsx:42-96 (`ToastHost`), store :30-37 (`useToastStore`: `show`, `showUndo`, `dismiss`); styles :98-121
- Props and variants: kinds info|success|error :13; `show(kind, message)` :32; `showUndo(message, onUndo)` (info kind with Undo button) :33; one toast at a time, a new one replaces the old :29; durations `TOAST_MS = 4000`, `UNDO_MS = 5000` :15-16,:49.
- States: visible: fade in 150 ms (`entering={FadeIn.duration(150)}`) :59, no exit animation (Android ghost-view crash note :56-57); auto-dismiss timer :47-51 (the countdown is not shown); undo: underlined "Undo" text button, 44 pt hit height :77-91,:119-120, dismisses after calling `onUndo` :81-84; error: red alert icon :72. tap-to-dismiss and swipe-to-dismiss: not handled (no branch found). reduce motion: the entrance is already a plain 150 ms fade; no separate branch.
- Accessibility: `accessibilityRole="alert"` and `accessibilityLiveRegion="polite"` :65-66; testID "toast" :67. Icon colors on the ink toast: `green`/`red` icon tones sit on `colors.ink` (:72, :112). By token values (DESIGN_SYSTEM section 2) that is about 3.1:1 (green) and 3.5:1 (red) in light mode, but in dark mode `ink` is #F3F3EF and the icons are #3DD68C and #FF5A40, about 1.7:1 and 2.8:1 (a11y-contrast; computed by hand from the table, worth verifying on device).
- Tokens: `colors.ink` background, `inverse` text; `elevation.soft` shadow :113-116; `radius.control`; `size.buttonL`, `size.hit`; `rt.insets.bottom + space['2xl'] * 2` bottom offset :103. Raw: icon size 20 :71.
- Used in: `<ToastHost` 1 JSX (app/_layout.tsx); `useToastStore` is imported in 25 files (e.g. features/meetups/MeetupDayScreen.tsx, features/meetups/Handoff.tsx, features/waitlist/WaitlistScreen.tsx).
- Notes: DESIGN_SYSTEM section 6 "Toast / ToastUndo: info, success, error; auto-dismiss 4 s / undo 5 s" matches. The host floats about 64 pt above the bottom inset (:103), which can sit on top of a bottom-docked primary button (P7) on screens that dock one. A toast fires no haptic (correct per the budget).

<a id="08-toggle"></a>
### Toggle
- Source: apps/mobile/src/components/Toggle.tsx:16-40 (styles :42-66)
- Props and variants: `label` :8; `value` :9; `onChange` :10; `disabled` :11; `description` (small ink2 line, also the hint) :12,29-33.
- States: off: bg3 track, card knob on the left; on: ink track, bg knob on the right :57-64; the knob jumps (alignment flip, no animation) :56-57; disabled: opacity 0.35 :48; pressed: not handled (raw `Pressable` :18). loading/error: not handled. reduce motion: nothing animates.
- Accessibility: role `switch`, `checked` and `disabled` via `a11yState` :19-22; the whole row is the target, `minHeight` 52 (`rowMin`) :44; switch is 51x31 (`size.toggleW/H`, tokens.json:173-174) at the trailing edge.
- Tokens: `colors.ink | bg3 | bg | card`; `size.toggleW/toggleH`; `radius.chip`; `space.rowMin/md`. Raw: `padding: 2`, knob `toggleH - 4` :55,:61-62.
- Used in: 18 JSX, 11 files; top: features/notifications/NotificationSettingsScreen.tsx (4), features/search/FiltersSheet.tsx (2), features/me/SettingsScreens.tsx (2); also ReportSheet.
- Notes: DESIGN_SYSTEM section 6 "Toggle: off, on (ink), disabled" matches. The on state is ink, not the accent (accent-as-selection is not used here).

<a id="08-turnstilefield"></a>
### TurnstileField
- Source: apps/mobile/src/components/TurnstileField.tsx:27-59 (hook `useTurnstile` :78-91, seam type :62-65)
- Props and variants: `siteKey` :16; `onToken` :17; `resetKey` :19. Web only: returns `null` on native :57.
- States: invisible on native; on web mounts the Cloudflare Turnstile widget on a View, resets on `resetKey` change, removes on unmount :35-55; load failure calls `onToken(null)` :45. No visual styling of its own, no error UI (caller disables submit until a token exists, `useTurnstile.required` :90).
- Accessibility: the web container has `accessibilityLabel` "Bot check" (`banner.botCheckLabel`, apps/mobile/src/strings/en.ts:76-82) :58.
- Tokens: none.
- Used in: 0 direct JSX; consumed through the `useTurnstile` hook, imported in 3 files: features/auth/EmailScreen.tsx, features/safety/SafetyScreens.tsx, features/help/EmailAccessScreen.tsx.
- Notes: not in DESIGN_SYSTEM section 6 (web-only, LR-04). `banner.botCheckFailed` copy exists (en.ts) but the field itself shows nothing on failure.

<a id="08-webdateinput"></a>
### WebDateInput
- Source: apps/mobile/src/components/WebDateInput.tsx:36-83 (helpers `isoDay` :14, `parseIsoDay` :21, `SYSTEM_FONT_STACK` :10)
- Props and variants: `value: Date | null` :44; `min` :46; `max` :47; `onChange` :48; `label` :49; `testID` :50. Web only: a raw DOM `<input type="date">` via `createElement` :54-82.
- States: default (bg2 fill) and focus (2 px ink border, card fill) :53,:74-75; error / disabled / loading: not handled (no branch found). reduce motion: n/a.
- Accessibility: `aria-label` from `label` :59; native browser date UI; opts out of the page focus ring (`data-focus-ring`) :61.
- Tokens: `colors.ink | card | bg2`; `radius.control`; `space.lg`; `size.buttonL`; `type.body.fontSize`; `colorScheme: theme.mode` :80. Raw: `borderWidth: 2` :73, `outline: 'none'` :78.
- Used in: 2 JSX, 2 files: features/auth/AgeScreen.tsx (1), features/campus/PostNewsScreen.tsx (1).
- Notes: DESIGN_SYSTEM section 6 "DateField: native picker (UX-06); empty, set, error" describes the native flow; this file is the web fallback only. No error styling.

<a id="08-zoomableimage"></a>
### ZoomableImage
- Source: apps/mobile/src/components/ZoomableImage.tsx:53-152 (helpers `clampZoom` :19, `clampPan` :25, `shouldDismiss` :32; constants :12-17)
- Props and variants: `source` :40; `blurhash` :41; `accessibilityLabel` :42; `onDismiss` :44; `testID` :45.
- States: pinch zoom 1x to 4x :12-13,75-82; double-tap toggles 1x / 2.5x :14,112-122; pan when zoomed, clamped to the image edges :24-29,93-94; swipe down at 1x closes past 120 pt or 800 pt/s :16-17,32-37,96-105; snap-backs use `resolveMotion('sheet', reduced)` (150 ms fade timing with reduce motion) :62. loading/error: via `Photo` (blurhash / placeholder). No backdrop fade or scale while dragging down to dismiss (not handled).
- Accessibility: the photo carries the label :143; gestures have no screen-reader alternative inside this component (the close button belongs to the host screen's NavBar): not handled.
- Tokens: none (uses `Photo`); `StyleSheet.create` without theme :154-157.
- Used in: 3 JSX, 3 files: features/chat/ChatScreen.tsx (1), features/feed/PhotoViewerScreen.tsx (1), features/dev/KitSections2.tsx (1).
- Notes: DESIGN_SYSTEM section 6 / board B10 viewer; matches (pinch, double-tap, swipe-down). Raw numeric zoom/dismiss constants are exported consts, not tokens.

<a id="08-dev-kit"></a>
### Kit (dev)  (dev-only)
- Source: apps/mobile/app/dev/kit.tsx:6-9 -> apps/mobile/src/features/dev/KitScreen.tsx:50 (sections in KitSections2.tsx)
- Dev-only. Renders `KitScreen`; in release builds `if (!__DEV__) return <Redirect href="/discover" />` (kit.tsx:7). It shows every shared component (Avatar, Banner, Button, Card, Chip, IconButton, Input, GroupedList/ListRow, Mark, OptionRow, OTPInput, SegmentedControl, Sheet/ActionSheet, Stepper, Tag, Text, TextArea, Toast, Toggle, accent picker, theme mode) in each state. Linked from the Profile tab in dev builds only (apps/mobile/app/(tabs)/profile/index.tsx:14-20) and links on to the states gallery (KitScreen.tsx:83). Not part of the product; excluded from the redesign.

<a id="08-dev-spikes"></a>
### Spikes (dev)  (dev-only)
- Source: apps/mobile/app/dev/spikes.tsx:6-9 -> apps/mobile/src/features/dev/SpikesScreen.tsx:70
- Dev-only. Renders `SpikesScreen` (P1 spike checks: age-range API, spot map pins, MMKV, type/theme/motion specimen; imports at SpikesScreen.tsx:1-14, doc comment :20-23); release builds redirect to `/discover` (spikes.tsx:7). Linked from the Profile tab in dev builds only (apps/mobile/app/(tabs)/profile/index.tsx:21-26). Excluded from the redesign.

<a id="08-dev-states"></a>
### States gallery (dev)  (dev-only)
- Source: apps/mobile/app/dev/states/index.tsx:6-9 -> apps/mobile/src/features/dev/StatesGalleryScreen.tsx:27
- Dev-only. Lists every board X frame (`STATE_FRAMES`, features/dev/stateFrames.tsx) as `ListRow`s that push `/dev/states/[id]` (StatesGalleryScreen.tsx:36-44); release builds redirect to `/discover` (index.tsx:7). Reached from the Kit screen (KitScreen.tsx:83). Useful as the checklist of edge states; excluded from the redesign.

<a id="08-dev-states-id"></a>
### State frame (dev)  (dev-only)
- Source: apps/mobile/app/dev/states/[id].tsx:6-10 -> apps/mobile/src/features/dev/StatesGalleryScreen.tsx:53
- Dev-only. Reads param `id`, renders one frame full screen with its release tag and owning real screen (StatesGalleryScreen.tsx:53-66), falls back to the gallery for an unknown id (:55); release builds redirect to `/discover` ([id].tsx:8). Excluded from the redesign.

## Haptic inventory (components and callers)

- apps/mobile/src/lib/haptics.ts:5-24: the three kinds `selection | success | warning`; best-effort, errors swallowed.
- Inside components: `Button` prop `hapticOnPress` ('success' only) Button.tsx:26,53,81 fires on press before `onPress`; no caller passes it anywhere in `apps/mobile/src` or `app`, so it is dormant. `OTPInput` fires `warning` when `error` becomes true, OTPInput.tsx:11,47,65 (the sign-in code error shake). `TabBar` explicitly has none (TabBar.tsx:62). Toast, Sheet, ConfirmDialog, ReportSheet (including "report sent"), Toggle, SegmentedControl, Chip, SuccessCheck: no haptic.
- Fired from screens (not components): offer sent features/offers/OfferSheetScreen.tsx:165 (success); offer accepted features/offers/OfferScreen.tsx:95 (success); listing posted features/sell/SellPostedScreen.tsx:69 (success); swipe threshold features/feed/SwipeDeck.tsx:286 (selection, matches budget); form error features/sell/SellDetailsScreen.tsx:265 (warning).
- Outside the DESIGN_SYSTEM budget (lines 97-102): sign-in code verified features/auth/VerifyScreen.tsx:144 (success); barcode found features/sell/SellScanScreen.tsx:73 (success); rules checkbox features/auth/RulesScreen.tsx:163 (selection).
