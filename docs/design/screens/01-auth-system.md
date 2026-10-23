# 01 Auth, launch and system

[Index: SCREENS.md](../SCREENS.md) | [Design review: DESIGN_REVIEW.md](../DESIGN_REVIEW.md)

Route files covered: `apps/mobile/app/index.tsx`, `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/app/(auth)/{_layout,welcome,email,verify,age,profile-setup,rules,allow-notifications}.tsx`, `apps/mobile/app/(system)/{_layout,account-status,maintenance,reverify,update,waitlist}.tsx`, `apps/mobile/app/{unlocked,link-error,+not-found,+native-intent}.tsx`. Feature files: `apps/mobile/src/features/auth/{LaunchScreen,LaunchIntro,WelcomeScreen,EmailScreen,VerifyScreen,AgeScreen,RulesScreen,ProfileSetupScreen,NotificationsScreen,ReverifyScreen,AuthStep,SessionExpiredSheet,useAppGate}.tsx|ts`, `apps/mobile/src/features/auth/logic.ts` (gate order), `apps/mobile/src/features/system/SystemScreens.tsx`, `apps/mobile/src/features/waitlist/{WaitlistScreen,UnlockedScreen}.tsx`, `apps/mobile/src/features/safety/AccountScreens.tsx` (account status and appeal sheet only; Blocked and Delete account screens in that file belong to the settings slice).

Gate order (the one place that decides where the app opens): `computeGate` in `apps/mobile/src/features/auth/logic.ts:181-214`: maintenance, update (system gate, :164-174, :185-187), welcome when signed out (:190) or no profile row (:192), account-status for banned/suspended/paused (:194-199), reverify (:201-204), age (:205), profile-setup (:206), rules (:207), rules-updated (:208), waitlist (:209), unlocked (:210), notifications (:212), home = `/discover` (:213, `GATE_HREF` :143-158).

Sign-up step counter: `SIGNUP_STEPS = 5` (`apps/mobile/src/features/auth/AuthStep.tsx:16`): email 1, code 2, birthday 3, profile 4, rules 5. Login mode, re-verify and updated-rules show no counter.

---

<a id="01-launch"></a>
### Launch  (A01)
- Source: `apps/mobile/app/index.tsx:1-3` -> `apps/mobile/src/features/auth/LaunchScreen.tsx:25-72`
- Route & entry: `/` (initial route). No params. Plain stack screen in the root `Stack` (`apps/mobile/app/_layout.tsx:108`). Re-entered with `router.replace('/')` after every onboarding step (`useGateHandoff`, `apps/mobile/src/features/auth/useAppGate.ts:86-93`), from Maintenance "Try again" (`SystemScreens.tsx:57`) and for any link that rewrites to `/` (`apps/mobile/app/+native-intent.tsx:10-14`).
- Purpose: Hold the native splash while the session restores and the gate picks one route, then `router.replace` to it.
- Roles: all (signed-out and signed-in). The route it picks depends on role: `GATE_HREF` (`logic.ts:143-158`).
- Elements:
  - `Mark` at `SPLASH_MARK` size, centered on `theme.colors.bg` (`LaunchScreen.tsx:69`, styles :74-81), `accessibilityRole="progressbar"` with label `launch.label` (:62-68).
  - Failure view: `ErrorState` with retry (`:54-58`).
  - No text nodes, no buttons on the happy path.
- States:
  - loading: the Mark view itself, native splash matching it (`LaunchScreen.tsx:61-71`); config wait capped at `CONFIG_WAIT_MS = 600` (`useAppGate.ts:18`, :49-53, :55).
  - empty: not applicable.
  - error: profile failed to load -> `ErrorState` (`error={gate.error} onRetry={gate.retry}`, `LaunchScreen.tsx:53-58`, `useAppGate.ts:71-73`). The view has no Sign out or other exit: not handled (no branch found).
  - populated: replaces itself with the gate route (`LaunchScreen.tsx:36`); drops a kept invite code when signed in (:35).
  - offline: same `ErrorState` (it renders the offline variant, `ErrorState.tsx:62`); signed-out cold start with no network still routes to Welcome because config falls back to `null` after 600 ms (`useAppGate.ts:55`).
  - suspended/banned: routes to `/account-status` (`logic.ts:194-199`).
  - reduce motion: handled by the overlay, see Launch animation entry.
  - Dynamic Type: no text, not applicable.
- Copy: `strings/en.ts` `launch` 491-493 (`label`); `states` 90-96 for the error variant.
- Notes: `DESIGN_SYSTEM.md:204` A01 says "splash <= 700 ms"; the config wait is 600 ms (`useAppGate.ts:18`). Text-node density: 0 `<Text` in `LaunchScreen.tsx`.

<a id="01-launch-animation"></a>
### Launch animation overlay  (A01 overlay, DEC 135)
- Source: mounted at `apps/mobile/app/_layout.tsx:112` -> `apps/mobile/src/features/auth/LaunchIntro.tsx:47-158`
- Route & entry: not a route. Absolute-fill cover rendered above the root `Stack` on every cold start; `useLaunchIntro` store (`LaunchIntro.tsx:26-29`) is set ready by `LaunchScreen.tsx:37` and `:49`.
- Purpose: Replace the still logo with the mark halves swapping places (DEC 135, `docs/DECISIONS_LOG.md:15`), then fade away once the app has routed.
- Roles: all.
- Elements:
  - Two `Svg` `Path` halves (`HANDOFF_PATHS`) filled `theme.colors.ink`, moved by `useAnimatedStyle` (`LaunchIntro.tsx:120-125`, :148-154).
  - Accent ring `Animated.View` (`:147`, styles :173-179), opacity 0.35 fading out (:126-129).
  - Cover `Animated.View` `testID="launch-intro"` hidden from VoiceOver (`:138-145`).
- States:
  - loading: swap plays once (`:90-94`), repeats after `REST_MS = motion.success.duration * 2` while not ready (:96-103), gives up after `MAX_SWAPS = 6` (:37, :58).
  - ready: cover fades out at once, even mid-swap, using `motion.fade.duration` (`:107-118`), then unmounts (`:135`). Deep link cold start counts as ready when `pathname !== '/'` (`:58`).
  - reduce motion: no swap (`:91`), mark scale held at 1 (`:132`), only the cover fade remains (:45 comment, :107-118). The fade `withTiming` passes no `reduceMotion` option (`:109-117`), unlike `apps/mobile/src/theme/motion.ts:46,52` which pins `ReduceMotion.Never`; whether the fade is skipped under the OS Reduce Motion setting is not verified (check on device).
  - error: `LaunchScreen` sets ready on `gate.failed` so the retry view is reachable (`LaunchScreen.tsx:47-51`).
  - empty, offline, suspended, Dynamic Type: not applicable (no text).
- Copy: none (the Launch screen owns the accessibility label, `strings/en.ts` 491-493).
- Notes: DEC 135 says the cover fades "after the current swap"; code fades immediately mid-swap (`LaunchIntro.tsx:105-106` comment, owner change after the log entry). `DESIGN_SYSTEM.md:204` A01 still describes "fade out after routing". Haptics: none. Text-node density: 0.

<a id="01-root-layout"></a>
### Root layout  (shell)
- Source: `apps/mobile/app/_layout.tsx:66-119`
- Configures: `Stack` with `headerShown: false` (:108) inside `GestureHandlerRootView` > `KeyboardProvider` > `QueryClientProvider` > `ThemeProvider` (:104-107). Mounts, above the stack and in this order: `SessionExpiredSheet` (:109), `OfflineBanner` (:110), `ToastHost` (:111), `LaunchIntro` (:112), `StatusBar` (:113). Exports `ErrorBoundary` -> `CrashScreen` (`:62-64`, DEC 103). Native splash held with `preventAutoHideAsync` and a 2500 ms backstop (:54-55, :98-101). Foreground watch of maintenance/update (`useSystemWatch`, :136-156). No per-route presentation is set here; routes use the default push.

<a id="01-tabs-layout"></a>
### Tabs layout  (app tab bar shell)
- Source: `apps/mobile/app/(tabs)/_layout.tsx:55-76`
- Configures: `Tabs` with `initialRouteName="discover"` and a custom `tabBar` (`:63-66`); tabs registered at :68-73: `discover`, `feed`, `sell`, `quad` (hidden with `href: null`, DEC 130, :71), `inbox`, `profile`. Visible items map: Discover (`cards`), Feed (`users`), Sell (`plus`, `prominent` accent rounded rectangle, DEC 90, :16-23), Inbox (`chat`), Profile (`user`); labels from `strings/en.ts` `tabs` 15-22. `AppTabBar` (`:26-53`) hides the bar while the keyboard is open (:31-32, not on the iPad rail), forwards `tabPress` and `tabLongPress` events (:43-50), and switches to a left rail when `useLayout().wide` (:61, :66). Starts push registration and tab prefetch (`:57-59`). `badge` is never set on any item (no `badge` in `:16-23` or the map at :33-35) although `TabBar` supports it (`apps/mobile/src/components/TabBar.tsx:18,93`): the Inbox tab shows no unread count (not handled, no branch found). Tab bar haptics: none, per `TabBar.tsx:62`.

<a id="01-auth-layout"></a>
### Auth layout  (A group)
- Source: `apps/mobile/app/(auth)/_layout.tsx:4-6`
- Configures: plain `Stack`, `headerShown: false`, default push and swipe-back. Each step draws its own nav through `AuthStep`.

<a id="01-auth-step"></a>
### Auth step frame  (shared frame for A03 to A07)
- Source: used by every `(auth)` step -> `apps/mobile/src/features/auth/AuthStep.tsx:42-97`
- Configures: `StepNav` (back `IconButton`, centered "Step n of 5" `meta` text, thin ink progress track, :100-146) or a plain `NavBar` when `step` is not given (:60-70); large `display` title with `accessibilityRole="header"` (:76-78); optional `ink2` body line (:79-85); scrolling `KeyboardAwareScrollView` (:71-87); `dock` slot in a `KeyboardStickyView` so the primary button sits on top of the keyboard (:88-94). Back with no history falls back to `/welcome` (:55-57). Step label from `nav.step` "Step {step} of {total}" (`strings/en.ts:109`). Strings `age.step` '3 of 5' (:568), `profileSetup.step` (:584), `rules.step` (:616) are not referenced by any screen file (checked in `src` and `app`).

<a id="01-welcome"></a>
### Welcome  (A02)
- Source: `apps/mobile/app/(auth)/welcome.tsx:1-3` -> `apps/mobile/src/features/auth/WelcomeScreen.tsx:76-156`
- Route & entry: `/welcome`, push in the auth stack. Reached from the gate (`GATE_HREF.welcome`, `logic.ts:146`), `replace('/welcome')` after sign-out (`ReverifyScreen.tsx:90`, `WaitlistScreen.tsx:222`, `AccountScreens.tsx:149`, `SessionExpiredSheet.tsx:75`), and as the back fallback of `AuthStep` (:56-57).
- Purpose: Introduce the app in one headline and send the person to sign up or sign in (DEC 89, `docs/DECISIONS_LOG.md:61`).
- Roles: signed-out only; nothing in the file gates a role.
- Elements:
  - Full-screen accent background (`styles.root`, :267) with a tilted wall (`-12deg`, :34, :97-119) of three drifting `Lane` columns (40/48/44 s, opposite directions, :39-43); tiles are listing photos with a price tag (`copy.wall.prices`) or a note tile (`copy.wall.notes`) (:201-224). Whole wall hidden from screen readers (:91-96).
  - Two `Fade` overlays in the accent color, top 16% and bottom 56% of the height, drawn with SVG `LinearGradient` (`:120-121`, :236-264); treated as the photo scrim by DEC 89.
  - Brand row: `Mark` (26, onAccent) plus wordmark `welcome.wordmark` in `heading` (:124-129).
  - Headline `welcome.title` in `display` (:132-134), body `welcome.body` (:135-137).
  - `Button` "Continue with school email", variant `onAccent`, `testID="welcome-continue"` -> `router.push('/email')` (:139-144).
  - `Button` "I already have an account", variant `textOnAccent`, `accessibilityHint` `welcome.signInHint`, `testID="welcome-sign-in"` -> `router.push('/email?mode=login')` (:145-151).
- States:
  - loading: none (static assets, `welcomeAssets.ts`).
  - empty/error: not applicable.
  - populated: as above.
  - offline: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`); screen has no network need.
  - reduce motion: lanes stand still, `progress` reset to 0 (`:175-180`, `still={reduced}` :116).
  - suspended/banned: not applicable (signed out).
  - Dynamic Type: headline and body are bottom-anchored (`content` `marginTop: 'auto'`, :309-312) over a 56% accent fade; no `numberOfLines` on headline or body (:132-137), so large text grows upward into the fade.
  - signed-in user landing here: possible via the Age screen Close buttons (`AgeScreen.tsx:172,198`) without sign-out on the OS-required path (see Age entry).
- Copy: `strings/en.ts` `welcome` 495-514 (`wall` prices/notes are example content).
- Notes: `DESIGN_SYSTEM.md:205` A02 states "static"; the wall animates (DEC 89). Gradient fades are allowed only as scrim (`DESIGN_SYSTEM.md:153`, DEC 89). The `statusBar` is forced `dark` (:90) on the accent. The wall tile copy ("Free couch, today only") is invented example content. Text-node density: 5 `<Text` in `WelcomeScreen.tsx` (three in the repeated tile renderers).

<a id="01-email"></a>
### School email  (A03; sign-up and login modes, DEC 140)
- Source: `apps/mobile/app/(auth)/email.tsx:3-5` -> `apps/mobile/src/features/auth/EmailScreen.tsx:34-274`
- Route & entry: `/email` (sign-up) and `/email?mode=login` (login), push. `login = params.mode === 'login'` (:53). Linked from Welcome (`WelcomeScreen.tsx:142,149`). On success pushes `/verify?email=` (`:61`).
- Purpose: Take the school email, detect the school as the person types, and send a 6-digit code (sign-up, or sign-in for an existing account).
- Roles: signed-out only. Reviewer accounts (`school.isReview`, :51) get a password field and a password sign-in (:67-70, :191-205, DEC 6).
- Elements:
  - `AuthStep` frame (:146-160): title `signIn.titleSignUp` or `titleSignIn` (:148), body `signIn.body` (:149), `step={login ? undefined : 1}` (:150), docked `Button` `testID="email-send"` labelled `sendCode` or `signInReviewer`, `loading={send.isPending}`, `disabled={!canSend}` (:152-158).
  - `Input` email, `inlineLabel`, autofocus, `returnKeyType="send"`, `testID="email-input"`, field error from `fieldError` (:161-179).
  - School line: green `check` `Icon` plus school name (or `reviewAccount`) in `label` text, `testID="email-school"` (:181-189).
  - Reviewer-only `Input` password `testID="email-password"` (:191-205).
  - Unknown-school card (`testID="email-unknown"`): `unknownTitle` with `{domain}`, `unknownBody`, optional bot-check element `bot.element`, secondary `Button` `joinWaitlist` `testID="email-waitlist"` (:207-224).
  - Alumni card (`testID="email-alumni"`): `alumniTitle`, `alumniBody`, shown for both `personal` and `unknown` lookups (:226-233).
  - Lookup error line in red (`email-lookup-error`, :235-244).
  - No-account card (login only, `testID="email-no-account"`): `noAccountTitle` with the email, `noAccountBody`, secondary `Button` `createAccount` `testID="email-create-account"` (:246-261).
  - Send error line in red (`email-send-error`, :263-267).
  - Legal line `signIn.legal` in `meta` `ink3` (`email-legal`, :269-271).
- States:
  - Sign-up mode: `send` calls `sendCodeWithInvite` (credits an invite code), sets `setLoginIntent(false)`, tracks `signup_started` (:78-82), then `goToVerify` (:56-62). Step bar shows "Step 1 of 5" (:150).
  - Login mode (DEC 140, `docs/DECISIONS_LOG.md:10`): `api.signInCode` never creates an account (:71-77); result `no_account` shows the No-account card (:74, :89-91, :246-261); otherwise `setLoginIntent(true)` so Verify hides the step counter (:75, `VerifyScreen.tsx:159`). Title becomes "Sign in with your school email"; body and legal line are the same as sign-up; no step bar (:150).
  - "Create an account" from the card (`createAccount` mutation, :98-110) sends the sign-up code for the same email and clears the card.
  - loading: `Input loading` while `lookup.kind === 'checking'` (:174); sending = `Button loading` (:156). No skeleton.
  - empty: field empty, `Send code` disabled (`canSend` needs a matched school, :141-142).
  - error: personal email -> field error `signIn.personal` plus alumni card (:134-137, :226-233); invalid -> `signIn.invalid` (:138); school lookup failure -> red line via `errorCopy` (:235-244); send failure -> `errorCopy` or `signIn.wrongPassword` for reviewers (:126-132); waitlist join failure -> error `Toast` or `banner.botCheckFailed` (:115-121); waitlist success -> success `Toast` (:114).
  - rate limited / offline: through `errorCopy(toAppError(...))` (:128-131); no special UI.
  - suspended/banned: not applicable (no session).
  - reduce motion: no animation in this file.
  - Dynamic Type: content scrolls (`AuthStep.tsx:71`); dock grows with the Button (`Button.tsx:138` wraps labels).
- Copy: `strings/en.ts` `signIn` 517-556 (lines 518-540 for this screen), `banner` 76-81.
- Notes: `DESIGN_SYSTEM.md:206` A03 lists no login mode or no-account state (added by DEC 140). In login mode with an unknown domain the Join waitlist card also appears (:207). Up to three stacked cards (unknown, alumni, no-account) can show with the legal line. Text-node density: 10 `<Text` in `EmailScreen.tsx` (plus 3 in `AuthStep.tsx`).

<a id="01-verify"></a>
### Verify code  (A04; X2 code errors; X9 reverify mode)
- Source: `apps/mobile/app/(auth)/verify.tsx:3-5` -> `apps/mobile/src/features/auth/VerifyScreen.tsx:44-253`
- Route & entry: `/verify?email=...[&mode=reverify]`, push. From Email (`EmailScreen.tsx:61`) and Re-verify (`ReverifyScreen.tsx:78`). `reverify = mode === 'reverify'` (:54-55).
- Purpose: Take the 6-digit code from the email, sign the person in, then hand back to the launch gate.
- Roles: signed-out (sign-up and login) and signed-in expired-student (reverify mode, :135-143).
- Elements:
  - `AuthStep` title `signIn.verifyTitle`, `step={reverify || hadLoginIntent() ? undefined : 2}` (:156-159); body "We sent a code to **email**" with the address in `bodyStrong` (:160-166).
  - `OTPInput` 6 cells, autofocus, `onComplete` submits, `error={wrongFlash}`, `disabled={busy || locked}` (:179-190). Error shake fires the `warning` haptic (`OTPInput.tsx:65`).
  - Message line (red or `ink2`, `accessibilityLiveRegion`, `testID="verify-message"`, :192-201).
  - Link row (`testID="verify-links"`): resend countdown `resendIn` or `Tappable` "Resend code" (`verify-resend`), and `Tappable` "Change email" -> `router.back()` (`verify-different-email`), hidden in reverify mode (:204-234).
  - `spamHint` line, always visible (:236-238).
  - `Tappable` link "Can't get into your school email?" -> `router.push('/help/email-access')` (`verify-cant-access`, :240-250).
  - Docked `Button` "Resend code" only while locked (`verify-resend-main`, :167-177).
- States:
  - loading/verifying: `busy` disables the cells (:188); no visible "checking" text (string `signIn.verifying` en.ts:545 is not referenced in the file).
  - empty: waiting for the code; resend timer (`resendIn`, :207-210).
  - error: wrong code with "n tries left" (:119-130, `wrongCode` :546, `wrongCodeOne` :547); expired -> automatic resend with `copy.expired` (:102-105, :92); locked after repeated wrong codes -> `copy.locked` with countdown and a docked Resend button (:149-151, :167-177); offline and rate-limited -> `errorCopy` without counting a try (:116-118); resend failure -> red `errorCopy` (:94).
  - success: `haptic('success')` then `handoff()` (:144-146); in reverify mode `api.completeReverify()` runs first (:135-143).
  - suspended/banned: not applicable here; the gate decides after handoff.
  - reduce motion: OTP shake becomes none (`OTPInput.tsx:66`).
  - Dynamic Type: link row wraps (`flexWrap`, :258-262).
- Copy: `strings/en.ts` `signIn` 541-555.
- Notes: `haptic('success')` at `VerifyScreen.tsx:144` is outside the haptics budget (`DESIGN_SYSTEM.md:97-102`: offer sent, offer accepted, listing posted). `DESIGN_SYSTEM.md:207` A04 lists "waiting, autofill, verifying, wrong, expired, locked 5 min, resend timer"; "verifying" has no visible UI. Text-node density: 8 `<Text` in `VerifyScreen.tsx` (plus 3 in `AuthStep.tsx`).

<a id="01-age"></a>
### Age check  (A05; boards A7 Birthday, D4 date picker)
- Source: `apps/mobile/app/(auth)/age.tsx:3-5` -> `apps/mobile/src/features/auth/AgeScreen.tsx:56-323`
- Route & entry: `/age` via the gate (`logic.ts:205`, `GATE_HREF.age`). Dev only: `/age?form=1` skips the OS signal (`AgeScreen.tsx:68-72`). `leading="none"`: no back (:242).
- Purpose: Confirm the person is 13 or older, first from the OS age signal, otherwise from a birthday (DEC 136, `docs/DECISIONS_LOG.md:14`).
- Roles: signed-in, age not yet confirmed.
- Elements (form phase):
  - `AuthStep` title `age.title`, body `age.body`, `step={3}` (:238-243).
  - Native: `Tappable` field card "Birthday" with the chosen date or `fieldPlaceholder` (`testID="age-field"`, :274-295); `DateTimePicker` in `spinner` mode, open by default on iOS (:74, :298-310), start date `PICKER_START_YEARS_AGO = 20` years back (:45, :228). Web: `WebDateInput` (:256-272).
  - Inline error `age-error` (:312-316); privacy line `age.privacy` (:318-320).
  - Docked `Button` "Continue" `testID="age-continue"`, disabled until a date is chosen (:244-254).
- States:
  - checking: full-screen `ActivityIndicator`, label `age.checking`, no nav and no text (`phase === 'checking'`, :211-222). When the OS answers (13+ band) the screen submits and leaves without ever showing the form (:126-134); the person goes from step 2 straight to step 4.
  - form: as above (OS answer unknown, not a regulated region, :132).
  - saving: `Button loading` (:247-248).
  - osRequired (regulated regions, no OS answer): `AuthStep` `testID="screen-age-os-required"`, `step={3}`, body `osRequiredBody`, hint `osRequiredHint`, docked "Share age range" (retry) plus secondary "Close" -> `router.replace('/welcome')` (:180-209). Close does not sign out here; the account and session stay.
  - error: invalid date -> `age.invalidDate`, other errors -> `errorCopy` (:117-123).
  - under 13: see the Not eligible entry.
  - offline: only through the generic `errorCopy` (:120).
  - reduce motion, suspended: not applicable.
  - Dynamic Type: scrolls; field label and value stack (:281-294).
- Copy: `strings/en.ts` `age` 559-580.
- Notes: `DESIGN_SYSTEM.md:208` A05 matches. The OS-signal path makes the step bar jump from "Step 2 of 5" to "Step 4 of 5" (`AuthStep.tsx:16`, `AgeScreen.tsx:129-131`). `copy.privacy` mentions the Privacy Policy but is plain text, not a link (:318-320). Text-node density: 10 `<Text` in `AgeScreen.tsx`.

<a id="01-age-blocked"></a>
### Not eligible (under 13)  (A8, sub-state of A05)
- Source: same route -> `apps/mobile/src/features/auth/AgeScreen.tsx:147-178`
- Route & entry: rendered inside `/age` when `phase === 'blocked'`, set by `finishUnderMinimum` after `confirmAge` returns `eligible: false` (:104-107, :81-95). The account is deleted (`deleteUnderageAccount`) and the session cleared (`signOut('local')`); either failing still ends here (:84-94).
- Purpose: End sign-up for under-13 users with no retry.
- Roles: signed-in until the delete and sign-out finish.
- Elements:
  - `GlyphTile` `lock` (:154), `heading` `blockedTitle` centered (:155-157), `body` `blockedBody` (:158-160).
  - Card (hairline border, `card` fill): `blockedCardTitle` and `blockedCardBody` (:161-166, styles :346-355).
  - Docked secondary `Button` "Close" `testID="age-close"` -> `router.replace('/welcome')` (:168-175).
- States: loading: none; empty: not applicable; error: delete/sign-out failure is swallowed, screen still shows (:84-94); populated: as above; offline: not handled (no branch found; delete failure falls through) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`); reduce motion: none; suspended: not applicable; Dynamic Type: centered column, no scroll (`blockedBody` is `flex: 1` without `ScrollView`, :344), so very large text can clip.
- Copy: `strings/en.ts` `age` 569-574.
- Notes: Layout is centered text plus a tip card, against `DESIGN_SYSTEM.md:158` (centered-everything) and DEC 90 (no tip boxes). Text-node density: counted in the 10 above (4 here).

<a id="01-profile-setup"></a>
### Profile setup  (A06; board A10)
- Source: `apps/mobile/app/(auth)/profile-setup.tsx:3-5` -> `apps/mobile/src/features/auth/ProfileSetupScreen.tsx:45-294`
- Route & entry: `/profile-setup` via the gate (`logic.ts:206`). `leading="none"` (:130). The design doc names the route `profile.tsx` (`DESIGN_SYSTEM.md:209`); the file is `profile-setup.tsx`.
- Purpose: Collect first name, last initial, optional class year and optional photo.
- Roles: signed-in, profile without a first name.
- Elements:
  - `AuthStep` title `profileSetup.title`, body `profileSetup.body`, `step={4}`, docked `Button` "Continue" `testID="profile-continue"` (disabled while uploading or saving, hint `waitForPhoto`) (:126-141).
  - Photo row: round avatar `Tappable` with `user` icon or the chosen photo and a camera badge (`testID="profile-photo"`, :143-169); label `addPhoto`/`changePhoto` in `bodyStrong`, `photoHint` in `meta`, `Remove photo` link when a photo exists and is not uploading (:170-188).
  - Upload progress `ProgressBar` (:191-197); "Photo added" green line (:198-207); failure line plus small secondary "Try again" (`states.retry`) (:208-222); permission-denied block with "Open Settings" (:223-238).
  - `Input` "First name" (`profile-first`, max 30, :240-256), `Input` "Last name" (`profile-last`, :257-269).
  - `meta` line: "Shown as {name}" when a first name is typed, else `lastNameHint` (:270-272).
  - Year: `label` "Year" plus `ChipGroup` single select Freshman to Grad (:274-285).
  - Red error line (`profile-error`, :287-291).
- States:
  - loading: photo `uploading` with progress; saving = `Button loading`.
  - empty: name empty -> `nameEmpty` on Continue (:97-101); no validation before Continue.
  - error: name rules (`nameTooLong`, `nameInvalid`, :34-38, :115); server error -> `errorCopy` (:116); photo upload failure with retry (:208-222); picker blocked -> denied block (:223-238).
  - offline: through `errorCopy`; upload failure shows the retry line.
  - populated: preview "Shown as Ava M." style (:123, :271).
  - reduce motion, suspended: not applicable. Dynamic Type: scrolls; the photo row text column is `flex: 1` (:323).
- Copy: `strings/en.ts` `profileSetup` 583-612; `primer.photos` 123-130 (denied block, `states.retry` 95).
- Notes: Four fields plus a photo on one screen; only the first name is required. The photo is stripped of EXIF on device before upload (comment :40-44). Text-node density: 11 `<Text` in `ProfileSetupScreen.tsx`.

<a id="01-rules"></a>
### Community rules  (A07; D10 Updated rules at `/rules?updated=1`)
- Source: `apps/mobile/app/(auth)/rules.tsx:3-5` -> `apps/mobile/src/features/auth/RulesScreen.tsx:31-192`
- Route & entry: `/rules` or `/rules?updated=1` via the gate (`logic.ts:207-208`, `GATE_HREF` :151-152). `leading="none"`.
- Purpose: Get agreement to the four community rules, Terms and Privacy Policy, and confirm age 13+ (DEC 136); records `rulesVersion` from `get_app_config` (:50-65).
- Roles: signed-in, no rules version or an outdated one.
- Elements:
  - `AuthStep` title "Four rules" (or "We updated the rules"), body line, `step={5}` for first sign-up, none for the update variant (:106-111).
  - Update variant only: "What changed" block on `bg2` with a bullet per change line, or `noChangeList` (:122-138).
  - Numbered list of four rules: `bodyStrong` number, `bodyStrong` title, `label` `ink2` body, hairline dividers (:140-155).
  - Checkbox row: `Tappable` `accessibilityRole="checkbox"`, `haptic('selection')` on toggle, label `agreeLabel` (:157-178, haptic :163).
  - Three underlined links: Community Rules, Terms, Privacy Policy -> `router.push('/legal/{page}')` (:87-101, :179-183).
  - Docked `Button` "Agree and continue" (`rules-agree`), disabled until checked (:112-120).
- States:
  - loading: full-screen `ActivityIndicator` until `get_app_config` returns, even though the rules text is static (`RulesScreen.tsx:74-85`).
  - error: config failure -> `ErrorState` full screen (:67-73); agree failure -> red line; an `INVALID` result refetches config (:58-64).
  - empty: unchecked box, disabled button.
  - offline: via `ErrorState` or `errorCopy`.
  - reduce motion, suspended: not applicable. Dynamic Type: scrolls; links wrap (:242).
- Copy: `strings/en.ts` `rules` 615-651.
- Notes: `haptic('selection')` at `RulesScreen.tsx:163` is outside the budget (`DESIGN_SYSTEM.md:97-102`). `DESIGN_SYSTEM.md:210` A07 matches. A literal bullet glyph is used in the changes list (:130). Text-node density: 9 `<Text` in `RulesScreen.tsx`.

<a id="01-allow-notifications"></a>
### Notifications primer  (A08; board A12)
- Source: `apps/mobile/app/(auth)/allow-notifications.tsx:3-5` -> `apps/mobile/src/features/auth/NotificationsScreen.tsx:30-127`
- Route & entry: `/allow-notifications` via the gate (`logic.ts:212`, `GATE_HREF` :155-156: not `/notifications`, which is the notification list), and pushed from the Waitlist "Get a notification when it opens" button (`WaitlistScreen.tsx:213`). The design doc names it `notifications.tsx` (`DESIGN_SYSTEM.md:211`).
- Purpose: Explain why notifications help, then ask the OS permission only after the person taps Turn on.
- Roles: signed-in, not asked before (`onboarding.notificationsAsked` flag, `NotificationsScreen.tsx:19-21`); web skips it (`logic.ts:211-212`).
- Elements:
  - Three example notification rows (`Mark` 38, title, time, body) on `bg2`, hidden from screen readers (:75-99).
  - `title`-variant heading `primer.notifications.title` and body (:100-105).
  - Docked `Button` "Turn on notifications" (`notifications-turn-on`, `loading={requesting}`) and text `Button` "Not now" (`notifications-not-now`) (:107-124).
- States:
  - checking/granted: blank `bg` view, no spinner (`step === null || 'granted'`, :53-55); granted finishes and hands off (:49-51).
  - denied for good (`settings`): `PermissionPrimerView` kind `notifications` with "Open Settings" and an alternative that finishes (:57-68).
  - undetermined: the primer above.
  - error: request failure swallowed (`.catch(() => false).finally(finish)`, :112-114).
  - offline, reduce motion, suspended: not applicable. Dynamic Type: `ScrollView` centered column (:75, styles :131-137).
- Copy: `strings/en.ts` `notifyPrimer` 654-671 (samples, `turnOn`, `notNow`), `primer.notifications` 132-140 (title, body, denied). `primer.notifications.cta/alternative` (:135-136) duplicate `notifyPrimer.turnOn/notNow` and are unused here.
- Notes: Example notifications use invented names and times ("Devin accepted your offer"), decorative only. Body claims "Most things sell within a few hours" (`strings/en.ts:134`) without data; DEC 90 says never invent numbers. Text-node density: 5 `<Text` in `NotificationsScreen.tsx`.

<a id="01-system-layout"></a>
### System layout  (X group)
- Source: `apps/mobile/app/(system)/_layout.tsx:4-6`
- Configures: `Stack` with `headerShown: false` and `gestureEnabled: false` (swipe-back off) so the gate states cannot be swiped away. Holds account-status, maintenance, reverify, update and waitlist.

<a id="01-account-status"></a>
### Account status  (X04; X10 paused/suspended/banned)
- Source: `apps/mobile/app/(system)/account-status.tsx:3-5` -> `apps/mobile/src/features/safety/AccountScreens.tsx:33-190`
- Route & entry: `/account-status` via the gate for banned, suspended or paused (`logic.ts:194-199`), the `appeal_decided` and `account_notice` pushes (`apps/mobile/src/lib/push.ts:79`). Navigation inside the group has swipe-back off.
- Purpose: Tell the person why they are restricted, what still works, and let them appeal once.
- Roles: signed-in with `status` paused, suspended or banned (reads `status()` itself, :47). Appeal target: not for banned or parental-consent suspensions (:71-72).
- Elements:
  - Title `title`-variant by kind (`statusTitle[kind]`, :96-98), body by kind with `{until}` date for paused (:99-107).
  - Reason line `bodyStrong` from `copy.reasons` when known (:108-110).
  - `meta` lines "No-shows: n" and "Strikes: n" when non-zero (:111-116).
  - Appeal `Banner kind="info"`: "Appeal sent..." or the decision (:117-126).
  - Actions (:127-152): primary `Button` "Open my chats" (paused only, -> `/inbox`, `status-open-chats`), secondary "Appeal" (`status-appeal`), secondary "Contact support" -> `/help`, text "Sign out" -> `signOut('local')` then `/welcome`. Contact and Sign out have no testID.
  - Appeal `Sheet` (`appeal-sheet`, :154-187) <a id="01-appeal-sheet"></a>: three reason `Chip`s (:162-170), `TextArea` "Tell us what happened" max 500 (`appeal-body`, :171-178), error `Banner` (:179), `Button` "Send appeal" (`appeal-send`, :180-185).
- States:
  - loading: `SkeletonList rows={4}` returned directly, without the safe-area root (`:54`).
  - error: `ErrorState layout="screen"` with retry only; no Sign out (:55).
  - ok (status no longer restricted, e.g. appeal overturned): `testID="screen-account-status-ok"`, `EmptyState` check, title `appealDecided.overturned`, action labelled "Open my chats" that goes to `/discover` (:59-68).
  - appeal sheet: send error shows a red `Banner` using `errorText(e)` (:86-88, :179); empty-body validation: not handled (no branch found); success closes the sheet and refetches the status so the "Appeal sent" banner appears (:84-85).
  - populated: three kinds with different copy (`statusTitle`, `statusBody` `strings/en.ts` 1437-1452).
  - offline: through `ErrorState`.
  - reduce motion: sheet follows `Sheet.tsx`. Dynamic Type: `ScrollView` (:95).
- Copy: `strings/en.ts` `safety` 1435-1576, status block 1436-1479 (`appealReasons` 1471-1475).
- Notes: `DESIGN_SYSTEM.md:294` X04 "reason, until, what still works; appeal form" matches. Counts "No-shows: n" are built by concatenating `title: n` in code (:112,115), not a translatable key. Text-node density: 8 `<Text` in `AccountScreens.tsx` (whole file, includes Blocked and Delete screens; about 4 in this screen).

<a id="01-maintenance"></a>
### Maintenance  (X06; X12 board)
- Source: `apps/mobile/app/(system)/maintenance.tsx:3-5` -> `apps/mobile/src/features/system/SystemScreens.tsx:38-61`
- Route & entry: `/maintenance` via the gate (`logic.ts:185-187`) and the foreground watch (`systemWatch`, `_layout.tsx:136-156`).
- Purpose: Say the service is down, and until when if known.
- Roles: all.
- Elements: `EmptyState` icon `tool`, title `maintenanceTitle`, body `maintenanceBody` plus `maintenanceUntil` with a time-only `toLocaleTimeString` (:41-46, :52-56), action "Try again" -> `router.replace('/')` (:57).
- States: loading: the `until` time appears after its own `useQuery(['app-config'])` resolves (:40-46); empty/error: if config is unavailable it simply omits the time; offline: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`); populated as above; reduce motion, suspended: not applicable; Dynamic Type: `EmptyState` centered in a `justifyContent: center` root (:78-85).
- Copy: `strings/en.ts` `system` 1766-1788 (1772-1775).
- Notes: The query key `['app-config']` (:40) differs from `['app_config']` used by the gate (`useAppGate.ts:42`, `RulesScreen.tsx:45`, `systemWatch.ts:39`); with `staleTime: 30_000` (`apps/mobile/src/lib/queryClient.ts:19`) "Try again" may re-enter the gate on cached config (verify on device). Time shown without a date. Text-node density: 0 `<Text` (copy via `EmptyState`).

<a id="01-reverify"></a>
### Re-verify  (X03; X9)
- Source: `apps/mobile/app/(system)/reverify.tsx:3-5` -> `apps/mobile/src/features/auth/ReverifyScreen.tsx:36-137`
- Route & entry: `/reverify` via the gate (`logic.ts:201-204`). Leads to `/verify?email=&mode=reverify` (:78).
- Purpose: Once a year, renew the student check with a code to the school email.
- Roles: signed-in student whose `verifiedUntil` passed or status `reverify`.
- Elements: `AuthStep` (no step, `leading="none"`) title `Still at {school}?` or `Still a student?` (:95-99); `GlyphTile shield` (:118); `GroupedList` with `ListRow` "School email" and "Due by" (formatted date) (:119-126); red error line (:127-131); `meta` `graduated` footnote (:132-134); docked `Button` "Send code" (`reverify-send`) and text "Log out" (`reverify-logout`) (:100-115).
- States: loading: full-screen `ActivityIndicator`, label `states.loading` (:58-69); error: `ErrorState` with retry, no Log out (:51-57); send failure -> red `errorCopy` (:80); populated; empty: the due row hidden without `verifiedUntil` (:122); offline via `ErrorState`; reduce motion, suspended: not applicable; Dynamic Type: scrolls through `AuthStep`.
- Copy: `strings/en.ts` `reverify` 683-693.
- Notes: The footnote says the person "can close your account from Settings" (`strings/en.ts:691-692`) but the screen has no link, and the swipe-back and tabs are unreachable from here (`(system)/_layout.tsx:5`; delete route is `apps/mobile/app/settings/delete.tsx`). `DESIGN_SYSTEM.md:293` X03 matches. Text-node density: 2 `<Text` here (plus 3 in `AuthStep.tsx`).

<a id="01-update"></a>
### Update required  (X05; X11)
- Source: `apps/mobile/app/(system)/update.tsx:3-5` -> `apps/mobile/src/features/system/SystemScreens.tsx:14-35`
- Route & entry: `/update` via the gate or foreground watch when `min_version_*` is above the build (`logic.ts:164-174`); never on web (:171).
- Purpose: Block old builds and send the person to update.
- Roles: all.
- Elements: `EmptyState` icon `download`, accent tile, title, body, action "Update OnlySwap" -> `Linking.openURL('{site}/download')` (:23-32).
- States: loading, empty, error: not applicable; offline: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`); populated; reduce motion, suspended: not applicable; Dynamic Type: as Maintenance.
- Copy: `strings/en.ts` `system` 1768-1770.
- Notes: `DESIGN_SYSTEM.md:295` X05 says "store link"; the action opens the website `/download` page (`SystemScreens.tsx:30`), not the store. Text-node density: 0.

<a id="01-waitlist"></a>
### Campus waitlist  (A09; board A13)
- Source: `apps/mobile/app/(system)/waitlist.tsx:3-5` -> `apps/mobile/src/features/waitlist/WaitlistScreen.tsx:57-235`
- Route & entry: `/waitlist` via the gate (`logic.ts:209`). Leaves by `router.replace('/unlocked')` or the gate handoff when the campus opens (`waitlistNext`, :91-97).
- Purpose: Show how close the campus is to opening, the person's place, and their invite link.
- Roles: signed-in with `status === 'waitlist'`.
- Elements:
  - Campus name (`label` `ink3`), `display` title `listTitle`, `lead` `listBody` with `{threshold}` (:118-130).
  - Ring card (`liftShadow`, :331): `ProgressRing` (members / threshold, accent stroke, static, :242-304), `heading` "{left} more to go" or `almost`, position line, `countsToward` line (:132-153).
  - Invite card (only with an invite code): heading `inviteTitle`, selectable link, accent "Copy" pill (`waitlist-copy`, toast on copy), dark `Button` "Share invite link" (`waitlist-share`), invited count text (:155-203).
  - `notifyLine` text (:205-207); secondary `Button` "Get a notification when it opens" -> `/allow-notifications` when not asked (:209-216); text `Button` "Sign out" (:217-225).
- States:
  - loading: `SkeletonList rows={4}` (`waitlist-loading`, :102-107).
  - error: `ErrorState` with retry, no Sign out (:108-109).
  - populated; refreshes on focus and every 60 s (`WAITLIST_REFRESH_MS`, :38, :77-81).
  - empty: position hidden when null or nobody left (:144); invite card hidden without a code (:155).
  - offline: via `ErrorState`.
  - reduce motion: ring is static ("nothing moves", :238-241).
  - Dynamic Type: `ScrollView`; link `numberOfLines={1}` (:164).
- Copy: `strings/en.ts` `waitlist` 2189-2238. Keys not referenced in this screen: `heading`, `headingNoCampus`, `count`, `position*`, `inviteBody`, `copyLink`, `nextTitle`, `next`, `tourTitle`, `tour` (en.ts 2190-2234).
- Notes: `DESIGN_SYSTEM.md:212` A09 lists "tour" in states; no tour in the screen. `liftShadow` on the ring card (:331) vs "cards have no shadow" (`DESIGN_SYSTEM.md:78`). Registers the push token here because waitlisted users never reach the tabs (:83-89). Text-node density: 13 `<Text` in `WaitlistScreen.tsx`.

<a id="01-unlocked"></a>
### Campus open  (A10; board A14)
- Source: `apps/mobile/app/unlocked.tsx:3-5` -> `apps/mobile/src/features/waitlist/UnlockedScreen.tsx:37-103`
- Route & entry: `/unlocked` via the gate (`logic.ts:210`), the Waitlist watcher (`WaitlistScreen.tsx:95`) and the `campus_unlocked` push (`apps/mobile/src/lib/push.ts:58`). Root stack, push.
- Purpose: One-time celebration when the campus opens; marks it seen on mount (`markUnlockSeen`, :46-57).
- Roles: signed-in, active, `show_unlocked`.
- Elements: `Confetti` (18 pieces, 1.2 s, colors accent/ink/green/amber, :105-155, :124); `SuccessCheck` (:75); `display` title; body with campus and threshold; founding-seller card (`Mark` 40, title, body) on `bg2` (:82-90); docked `Button` "List something" -> `/sell` and secondary "Start swiping" -> `/discover` (`unlocked-list`, `unlocked-start`, :92-100).
- States: loading: body falls back to `bodyNoCampus` until the waitlist query returns (:65-66, :80); empty/error: query failure leaves the fallback body, `markUnlockSeen` failure is swallowed (:56); reduce motion: no confetti, 150 ms fade in (:59-62, :73); suspended, offline: not handled (no branch found) (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`); Dynamic Type: content `flex: 1`, no scroll (:159-164), so large text can push the founding card into the dock.
- Copy: `strings/en.ts` `unlocked` 2240-2250.
- Notes: `DESIGN_SYSTEM.md:213` A10 matches. Confetti uses four colors (`UnlockedScreen.tsx:124`) against one-accent (`DESIGN_SYSTEM.md:14`). Haptics: none. Text-node density: 4 `<Text`.

<a id="01-link-error"></a>
### Link didn't work  (X12; board X31)
- Source: `apps/mobile/app/link-error.tsx:3-5` -> `apps/mobile/src/features/system/SystemScreens.tsx:64-76` (`kind="link"`)
- Route & entry: `/link-error`, target of `rewriteDeepLink` for a `/l/{id}` link with an invalid id (`apps/mobile/src/lib/deeplinks.ts:38`).
- Purpose: Say that a shared link doesn't point at a listing.
- Roles: all. Signed-out and other-campus variants named in `DESIGN_SYSTEM.md:302` (X12): not handled (no branch found).
- Elements: `EmptyState` icon `alert`, title `linkErrorTitle`, body `linkErrorBody`, action "Go to Discover" -> `router.replace('/discover')` (:68-73).
- States: loading, error, empty: not applicable; offline: not handled (offline: no screen-level branch; the app-wide `OfflineBanner` still shows, `app/_layout.tsx:110`); populated; reduce motion, suspended: not applicable; Dynamic Type: centered root (:78-85).
- Copy: `strings/en.ts` `system` 1777-1778, 1781.
- Notes: A signed-out visitor tapping "Go to Discover" is sent to `/discover` without going through the gate (no branch found). Text-node density: 0.

<a id="01-not-found"></a>
### Nothing here  (X12; unknown app path)
- Source: `apps/mobile/app/+not-found.tsx:3-5` -> `apps/mobile/src/features/system/SystemScreens.tsx:64-76` (`kind="missing"`)
- Route & entry: Expo Router fallback for any unmatched path.
- Purpose: Dead-end recovery for unknown routes.
- Roles: all.
- Elements: same `EmptyState` with title `notFoundTitle`, body `notFoundBody`, action "Go to Discover" (:68-73).
- States: as the previous entry (`testID="screen-not-found"`, :67).
- Copy: `strings/en.ts` `system` 1779-1781.
- Notes: Same signed-out gap as Link error. Text-node density: 0.

<a id="01-native-intent"></a>
### Native intent  (redirect, no UI)
- Source: `apps/mobile/app/+native-intent.tsx:10-14`
- Configures: `redirectSystemPath` runs before routing for universal links and `onlyswap://`: remembers an `/i/{code}` invite code for sign-up (`rememberInviteCode`, :11-12) and returns `rewriteDeepLink(path)` (`apps/mobile/src/lib/deeplinks.ts:31-41`): invites -> `/`, `/l/{id}` -> `/listing/{id}?from=link` or `/link-error`, `/m/{token}` -> `/inbox`. Not a screen.

<a id="01-session-expired"></a>
### Session expired sheet  (X02; board X7)
- Source: mounted at `apps/mobile/app/_layout.tsx:109` -> `apps/mobile/src/features/auth/SessionExpiredSheet.tsx:23-127`
- Route & entry: not a route. A `Sheet` over whatever screen is open, shown when an unintended `SIGNED_OUT` auth event arrives and an email is known (`watchSessionExpiry`, `apps/mobile/src/features/auth/sessionExpiry.ts:39-56`); an intentional sign-out suppresses it (`noteIntentionalSignOut`, :26-28).
- Purpose: Let the person sign back in with a code on the same screen instead of losing their place.
- Roles: previously signed-in user whose session ended.
- Elements: `Sheet` `testID="sheet-session-expired"` title `sessionExpired.title` (:79-84); `body` with the email (:86-88); `OTPInput` (6 cells, autofocus, error shake) (:89-100); red message line (`session-expired-message`, :101-110); `Button` "Continue" (`session-expired-continue`, disabled until 6 digits) (:111-117); text `Button` "Log out instead" (`session-expired-logout`, :118-123).
- States: loading: sheet opens and a code is sent automatically (:32-40); `Button loading` while verifying; error: send failure -> red `errorCopy` (:37-39), wrong code -> `sessionExpired.wrongCode`, offline and rate-limited -> `errorCopy` (:56-61); success: `verifyCode` then `close()` (:52-53); no resend control (not handled, no branch found); dismissing: scrim tap, drag down or Android back all call `logOut` (`onClose={() => void logOut()}`, :81), which signs out and goes to `/welcome` (:67-76); reduce motion: `Sheet` fade (`Sheet.tsx:34`); Dynamic Type: sheet scroll follows `Sheet`.
- Copy: `strings/en.ts` `sessionExpired` 674-680; `signIn.codeLabel` 544.
- Notes: `DESIGN_SYSTEM.md:292` X02 says "modal -> A03 prefilled"; the implementation enters the code in the sheet itself. Text-node density: 2 `<Text` in `SessionExpiredSheet.tsx`.
