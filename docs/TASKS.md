# TASKS.md — Master checklist (LOCKED)

**Format:** `ID` description · deps · done when · size. S < 2 h, M ≈ half day, L = 1–2 days.

**How to work:**
- Do one **session** from §Build order at a time.
- Tick a box only when its "done when" passes.
- Tasks come from blueprint v0, amended by the pre-build review. New review tasks are marked 🆕. Changed tasks are marked ✎.

**Totals:** R1.0 = 197 tasks, about 840 h human-paced (1051 h with buffer; see PRD §6 for the Claude Code assumption). The R1.1 and R2 backlogs are listed below.

**Release scope** (PRD §6):
- Sections P0–P16 are **R1.0**.
- The **R1.1 backlog** and **R2 backlog** are at the end and aren't scheduled yet.



## P0 · Accounts and access (manual, you)

- [ ] **P0-ACC-01** Register the Google Play Console personal account ($25, one-time, unavoidable). Complete government ID, phone and email verification, and the device check in the Play Console app. · deps — · done when the Console home shows "Verified" · S 💲 *(unavoidable; no free alternative)*
- [ ] **P0-ACC-02** Confirm the Apple Developer Program membership is active and accept the latest agreements in App Store Connect. · — · Agreements page has no pending items · S
- [x] **P0-ACC-03** ✎ GitHub repo `Wasif-Karim03/OnlySwap` (exists). After the first scaffold is pushed, protect `main`: require PRs and CI. From then on each session works on a `feat/*` branch. · deps — · done when a direct push to main is rejected · S
- [ ] **P0-ACC-04** Create Supabase projects `onlyswap-staging` and `onlyswap-prod` (US East) and save their refs and keys in the password manager. · — · both dashboards reachable · S
- [ ] **P0-ACC-05** Create a Cloudflare account, enable R2 (complete the checkout; set a billing notification at $1), and create buckets `onlyswap-media`, `onlyswap-private` and `onlyswap-backups`. · — · buckets listed · S
- [ ] **P0-ACC-06** Create an Expo account, org and project `onlyswap`, plus a robot access token. · — · `eas whoami` works · S
- [ ] **P0-ACC-07** Create a Firebase project and Android app `app.onlyswap`, then download the FCM v1 service account JSON. · — · JSON in the password manager · S
- [ ] **P0-ACC-08** Create a Sentry org and the projects `mobile`, `admin`, `functions`. · — · DSNs saved · S
- [ ] **P0-ACC-09** Create a PostHog US Cloud project and turn **off** GeoIP enrichment and IP capture. · — · settings confirmed · S
- [ ] **P0-ACC-10** Create the sender Gmail account with 2-Step Verification and an app password (Plan A). If going with Plan B, buy the domain and set up Resend instead 💲($10.46/yr, optional). · — · a test email sends from `swaks` locally · S
- [ ] **P0-ACC-11** Create an UptimeRobot free account. · — · login works · S
- [ ] **P0-ACC-12** Recruit 15–20 closed testers (Gmail addresses) and create Google Group `onlyswap-testers`. · — · 15+ members joined · M
- [ ] **P0-ACC-13** Run the USPTO trademark search on "OnlySwap" and record the result in `docs/decisions.md`. · — · go or rename decided · S
- [ ] **P0-ACC-14** Optional: register a DMCA designated agent at copyright.gov 💲($6 per 3 years; free alternative is to skip it and rely on the takedown process in the Terms). · — · decision recorded · S
- [ ] 🆕 **P0-ACC-15** Decide Q2 (domain, Plan A vs B) and Q4 (name). Record both in DECISIONS_LOG. · deps P0-ACC-13 · done when both recorded **before P11** · S
- [ ] 🆕 **P0-ACC-16** Create a dedicated admin email (not your personal one); plan TOTP on 2 devices; a second address for receipts. · deps — · done when accounts exist · S
- [ ] 🆕 **P0-ACC-17** Create a separate **staging** Gmail sender (OPS-01). · deps — · done when test mail sends · S

## P1 · Foundations

- [x] **P1-SETUP-01** ✎ Scaffold the pnpm monorepo: `apps/mobile`, `apps/admin`, `apps/site`, `workers/media`, `supabase/`, `packages/tokens`, `packages/shared`, `scripts/`, `docs/`; Node 24 LTS `.nvmrc`; root `CLAUDE.md` unchanged. · deps P0-ACC-03 · done when `pnpm i` succeeds · S
- [x] **P1-SETUP-02** Create the Expo SDK 57 app (`npx create-expo-app@latest apps/mobile -t tabs`) with TypeScript strict and Expo Router. · SETUP-01 · runs on the iOS simulator; Android bundle and prebuild pass in CI (DEC 42) · S
- [x] **P1-SETUP-03** ✎ Install the SDK-pinned deps with `npx expo install`: reanimated, gesture-handler, react-native-keyboard-controller, react-native-safe-area-context, expo-image, flash-list, react-native-mmkv, react-native-unistyles, @tanstack/react-query, zustand, @supabase/supabase-js, expo-secure-store, @react-native-community/netinfo, @react-native-community/datetimepicker, expo-haptics, expo-image-picker, expo-image-manipulator, expo-notifications, expo-age-range, expo-updates, expo-store-review, expo-application, react-native-view-shot, expo-clipboard, @sentry/react-native, posthog-react-native. **No maplibre, no expo-location in R1.0.** · deps P1-SETUP-02 · done when `npx expo-doctor` passes · S
- [ ] **P1-SETUP-04** ✎ Configure `app.config.ts`: bundle and package `app.onlyswap`; scheme `onlyswap`; `ios.supportsTablet=false`; `orientation: portrait`; `usesNonExemptEncryption:false`; entitlements (Associated Domains for `onlyswap.pages.dev` [+ custom domain if Q2], Time Sensitive Notifications, Declared Age Range); `expo-build-properties` minSdk 26, target/compile 36; `android.blockedPermissions` = fine+coarse location, READ_MEDIA_*, READ_EXTERNAL_STORAGE, RECORD_AUDIO, READ_CONTACTS, SCHEDULE_EXACT_ALARM, USE_EXACT_ALARM, AD_ID; permission strings from `en.ts`; runtimeVersion fingerprint; `ios.privacyManifests`. · deps P1-SETUP-03 · done when `expo prebuild` output has exactly the expected Info.plist keys, entitlements and merged manifest permissions (T-STORE check) · M
- [x] **P1-SETUP-05** Create `eas.json` profiles `development`, `preview` and `production` with channels, `appVersionSource: remote` and `autoIncrement`. · SETUP-04 · `eas build -p ios --profile development` succeeds · S
- [x] **P1-SETUP-06** Build the development client for the iOS Simulator (`development-simulator` profile or `expo run:ios`); Android dev client built on EAS but not device-tested (DEC 42). · SETUP-05 · the app launches on the iOS Simulator and the Android EAS build succeeds · M
- [x] **P1-ENV-01** Environment plumbing: `.env.example`, EAS env vars per environment (Secret visibility for secrets), `src/lib/env.ts` validated with zod at startup. · SETUP-05 · a missing env var crashes dev with a clear message · S
- [x] **P1-ENV-02** Add gitleaks pre-commit and CI secret scan. · SETUP-01 · a commit containing a fake key is blocked · S
- [ ] **P1-CI-01** Add `.github/workflows/ci.yml` (Linux) with lint (eslint + prettier), typecheck, jest, pgTAP (later), and turbo-less pnpm filters. · SETUP-02 · green on a PR · M
- [ ] 🆕 **P1-CI-02** CI hardening: `eslint-plugin-react-native-a11y`, `pnpm audit --audit-level high`, bundle secret scan, Dependabot config, path filters (DB tests only on `supabase/**`). · deps P1-CI-01 · done when CI fails on a planted high-severity dep and on a planted secret · S
- [ ] 🆕 **P1-CI-03** RPC contract snapshot: `scripts/rpc-contract.ts` generates `packages/shared/src/rpc-contract.json` from the DB; CI compares it (T-CONTRACT-01). · deps P1-CI-01, P3-DB-01 · done when changing a signature without `_v2` fails CI · M
- [x] **P1-DB-01** Supabase CLI init; `supabase start` works locally; link staging. · P0-ACC-04 · local Studio opens · S
- [ ] **P1-SPIKE-01** Spike: Edge Function sending mail over SMTP 465 via Gmail. If it's blocked, build the Worker `mailer` fallback. Record the outcome. · DB-01, P0-ACC-10 · a test email arrives from a staging function · M
- [ ] **P1-SPIKE-03** Spike: `expo-age-range` returns a result or `unknown` on both OSes (with the entitlement `com.apple.developer.declared-age-range`). · SETUP-06 · logged result on devices · S
- [ ] 🆕 **P1-SPIKE-04** Spike: New Architecture/Nitro modules (MMKV v4, Unistyles 3, keyboard-controller) build and run on both dev clients. · deps P1-SETUP-06 · done when a demo screen uses all three on iOS + Android · S
- [ ] **P1-LIB-01** `lib/supabase.ts`, `lib/rpc.ts`, `lib/errors.ts` (initial codes), `lib/storage.ts`, `lib/queryClient.ts`. · ENV-01 · unit tests pass (T-UNIT-LIB-*) · M
- [ ] **P1-LIB-02** `lib/sentry.ts` and `lib/analytics.ts` with the opt-in flag, plus the Sentry source-map upload set up through its EAS integration. · LIB-01, P0-ACC-08/09 · a test crash shows symbolicated in Sentry · M

## P2 · Design system and component kit

- [ ] **P2-TOK-01** ✎ `packages/tokens`: `tokens.json` per DESIGN_SYSTEM §2–5 (light, dark, accent options, type, space, radius, motion) plus a generator producing `dist/unistyles.ts` and `dist/tokens.css`. · deps P1-SETUP-01 · done when generated files committed; values match DESIGN_SYSTEM tables · M
- [ ] **P2-TOK-02** ✎ Contrast test T-UNIT-TOK-01 (light + dark × every accent option), including the rule that `accent` never appears as text on `bg`. · deps P2-TOK-01 · done when all required pairs pass · S
- [ ] **P2-TOK-03** ✎ Unistyles themes: mode System/Light/Dark × one accent (from config), persisted in MMKV and `profiles.theme_mode`. · deps P2-TOK-01 · done when switching mode is instant with no flash · S
- [ ] **P2-FONT-01** ✎ Type components on **system fonts** (SF Pro / Roboto) with the DESIGN_SYSTEM §3 scale, tabular numerals and `maxFontSizeMultiplier` rules. · deps P2-TOK-03 · done when every type row renders at 100% and 200% · S
- [ ] **P2-CMP-01** Button (all variants, states, loading, haptic) · TOK-03 · kitchen-sink row matches H3 · S
- [ ] **P2-CMP-02** Input, TextArea (counter), OTPInput · CMP-01 · states match H3 · M
- [ ] **P2-CMP-03** Chip/ChipGroup, SegmentedControl, Toggle, Checkbox, OptionRow (radio), Stepper · CMP-01 · a11y roles set · M
- [ ] **P2-CMP-04** Sheet + ActionSheet (Reanimated, pan to close, focus trap, Android back) · CMP-01 · works with keyboard open · L
- [ ] **P2-CMP-05** Toast, ToastUndo, Banner, OfflineBanner · CMP-01 · offline toggle shows the banner · S
- [ ] **P2-CMP-06** Card, ListRow/GroupedList, Tag, Avatar, Mark (logo from the shared SVG) · CMP-01 · matches F10 styling · S
- [ ] **P2-CMP-07** Photo (expo-image + blurhash), PhotoCarousel, ZoomableImage · CMP-01 · a 4-photo carousel works · M
- [ ] **P2-CMP-08** EmptyState, ErrorState, Skeleton set · CMP-01 · matches X3/X36 · S
- [ ] **P2-CMP-09** NavBar, TabBar (iOS style + Android pill variant), StepIndicator, ProgressBar · CMP-06 · N1 look on Android · M
- [ ] **P2-CMP-10** ✎ PermissionPrimer for camera, photos and notifications (undetermined → primer → OS prompt; denied → Settings). · deps P2-CMP-01 · done when every OS status handled · M
- [ ] **P2-CMP-11** ConfirmDialog, ReportSheet shell · CMP-04 · — · S
- [ ] **P2-MOT-01** Motion primitives: press scale, spring presets, check-draw success, reduce-motion hook · CMP-01 · reduce motion swaps to fades · S
- [ ] **P2-KIT-01** Kitchen-sink route `/dev/kit` (dev builds only) showing every component and state in every skin. · CMP-01..11 · visual pass against H3 in 8 skins · S
- [ ] **P2-KIT-02** States gallery route `/dev/states` (dev builds only) rendering every X-section state with fixtures, used by manual QA · KIT-01 · every X frame is reachable · S

## P3 · Data model, RLS, auth hooks

- [ ] **P3-DB-01** Migration `0001_extensions_enums.sql` · P1-DB-01 · `db reset` succeeds · S
- [ ] **P3-DB-02** ✎ `0002_campus_identity.sql` per DATA_MODEL §2.1. · deps P3-DB-01 · done when `db reset` ok · M
- [ ] **P3-DB-03** ✎ `0003_listings.sql` per DATA_MODEL §2.2 (soft delete, `wanted_ref`, reservations). · deps P3-DB-02 · done when — · M
- [ ] **P3-DB-04** ✎ `0004_deals.sql` per DATA_MODEL §2.3 (`set null` FKs, chat snapshot, `meetups_one_active`, spot designation). · deps P3-DB-03 · done when — · M
- [ ] **P3-DB-06** ✎ `0005_safety_ops.sql` + `0006_notifications.sql` per DATA_MODEL §2.4–2.5 (evidence, unlogged rate_counters, `dedupe_key`, claim states, email outbox). · deps P3-DB-02 · done when — · M
- [ ] **P3-DB-07** `0007_helpers.sql`: `private.*` helpers (require_active, hit, hit_ip, check_text, pii_check, names_student, email_hash, is_blocked, queue_notification, new_invite_code, unaccent_immutable) · DB-06 · pgTAP helper tests pass · L
- [ ] **P3-DB-08** ✎ `0008_rls_grants.sql`: RLS on every table per DATA_MODEL §3; `revoke all` from anon/authenticated; column grants on profiles; `realtime.messages` policies. · deps P3-DB-02..06 · done when T-INT-RLS-* and T-SEC-19 pass · L
- [ ] **P3-DB-09** `0009_views.sql`: public_profiles, profile_stats (MV), ratings_visible, campus_progress, price_hints, campus_trending_terms, my_reports · DB-08 · — · M
- [ ] 🆕 **P3-DB-10** `0007_helpers.sql` extras: `private.now()`, `queue_notification` (dedupe), `queue_email`, `snapshot_evidence`, `can_upload`, `unlock_campus`. · deps P3-DB-07 · done when pgTAP helper tests · M
- [ ] 🆕 **P3-DB-11** `0100_ref_data.sql`: categories, banned words (≈150 + pets, gift cards, recalled items), `app_config` defaults (`rules_version`, min versions, flags). Idempotent upserts (BE-15). · deps P3-DB-02 · done when re-running the migration is a no-op · S
- [ ] 🆕 **P3-DB-12** Integrity pgTAP suite: T-INT-DEL-02, T-INT-NOTIF-DEDUPE, T-INT-LIST-04, T-INT-MEET-02/03, T-INT-SAFE-03, T-INT-OFF-RACE-02, T-INT-SOLD-01, T-INT-TZ-01 (written now as failing tests, turned green by later phases). · deps P3-TEST-01 · done when tests exist and are tracked in CI (marked todo until their phase) · M
- [ ] **P3-AUTH-01** Postgres auth hooks `hook_before_user_created` and `hook_custom_access_token`, enabled in config.toml and on staging/prod · DB-07 · signups from unknown domains are rejected; JWT has the claims · M
- [ ] **P3-AUTH-02** Trigger `on_auth_user_created`: profile, prefs, waitlist status, invite link · AUTH-01 · a new user gets a profile row · S
- [ ] **P3-AUTH-03** Auth config: email OTP length 6, expiry 600 s, custom SMTP (Gmail 465 or Resend), rate limits raised to 200/h, "Confirm email" ON, password provider on (reviewers), OTP template with the code in the subject (T3) · AUTH-01, P1-SPIKE-01 · a real .edu inbox receives the code · M
- [ ] **P3-SEED-01** ✎ `supabase/seed.sql` (local only): Ohio State, Demo University, a waitlist campus, 40 demo listings, fixture users. Production reference data is in P3-DB-11. · deps P3-DB-09 · done when `db reset` gives a usable app · M
- [ ] **P3-TYPES-01** `supabase gen types` script plus CI drift check · DB-09 · CI fails on drift · S
- [ ] **P3-TEST-02** `private.now()` wrapper used by every time-based function and cron job, plus a staging-only `test_set_now(ts)` RPC (dropped in production migrations through `if current_setting('app.env')='prod'`). · DB-07 · pgTAP time-travel tests work · S
- [ ] **P3-SAFE-01** RPCs `create_report`, `get_my_report`, `block_user`, `unblock_user`, `create_appeal`; auto-hide trigger; priority-1 alert email · P3-DB-07 · pgTAP · M
- [ ] **P3-TEST-01** pgTAP harness `supabase/tests/` with fixtures (two campuses, users A/B/C, an admin, a moderator) · DB-08 · `supabase test db` runs in CI · M

## P4 · Auth and onboarding (A)

- [ ] **P4-AUTH-01** RPCs `lookup_school`, `confirm_age`, `update_profile`, `accept_rules`, `my_waitlist_position`, `update_profile_flags` · P3-AUTH-02 · pgTAP green · M
- [ ] **P4-AUTH-02** `features/auth/api.ts` and hooks (sendCode, verifyCode, signInReviewer, signOut, useSession, useAppGate) · P1-LIB-01, AUTH-01 · unit tests green · M
- [ ] **P4-AUTH-03** S-A01 Launch + splash handoff + gate routing · AUTH-02, P2-MOT-01 · cold start under 700 ms to first route on a mid Android device · M
- [ ] **P4-AUTH-04** S-A02 Welcome · P2 · matches A2 · S
- [ ] **P4-AUTH-05** S-A03 School email with detect, not-found, personal-email and reviewer password states · AUTH-02 · all A3/A4/A5 states reachable · M
- [ ] **P4-AUTH-06** S-A04 Verify code with autofill, errors, resend timer and lockout · AUTH-05 · wrong/expired/locked states tested · M
- [ ] **P4-DEL-01** Edge Function `delete-account` (normal + underage mode; ratings anonymized; banned hash; R2 prefix deletion added in P5-MEDIA-04) · P3-AUTH-02 · T-INT-DEL-01 shows no rows left except retained reports · M
- [ ] **P4-AUTH-07** ✎ A05 Age check: OS signal (`expo-age-range`) → native date picker fallback → Not eligible; underage path calls `delete-account` (underage) and signs out. · deps P4-AUTH-06, P1-SPIKE-03, P4-DEL-01 · done when the minor path deletes the auth user and blocks retry (T-INT-AUTH-04, E2E-02) · M
- [ ] **P4-AUTH-08** S-A10 Profile setup, including avatar upload (depends on the media pipeline) · AUTH-07, P5-MEDIA-03 · the profile row is updated · M
- [ ] **P4-AUTH-09** S-A11 Community rules with the 18+ checkbox and legal links · AUTH-08 · can't continue unchecked · S
- [ ] **P4-AUTH-10** S-A12 Notifications primer (permission flow; registration completed in P9) · AUTH-09, P2-CMP-10 · the OS prompt fires only on the button · S
- [ ] **P4-AUTH-11** Edge Function `waitlist-request` + Turnstile helper · P3-DB-02 · a duplicate email is a silent success; IP limited · M
- [ ] **P4-AUTH-14** Session expired modal (X7) and the re-verify gate (X9) with `complete_reverify` · AUTH-06 · forcing `verified_until` into the past shows X9; a new code restores it · M
- [ ] **P4-AUTH-15** Reviewer accounts: `scripts/seed-review.ts` + `review_accounts` rows on staging · AUTH-05 · a reviewer logs in with a password on staging · S
- [ ] **P4-AUTH-16** `demo_autoplay` cron (Demo University only): the bot accepts offers, replies, proposes and completes meetups for reviewers · AUTH-15, P8-MEET-01 · a reviewer completes a swap alone on staging · M
- [ ] 🆕 **P4-AUTH-17** Rules re-accept gate: `require_active` checks `rules_version`; A07 "Updated rules" variant with a "What changed" list. · deps P4-AUTH-09 · done when T-UNIT-AUTH-06, E2E-22 · S
- [ ] 🆕 **P4-AUTH-18** Sign out of all devices (`signOut({scope:"global"})`) + `revoke-sessions` Edge Function used on suspension/ban. · deps P4-AUTH-02 · done when T-INT-AUTH-05/06 · S
- [ ] 🆕 **P4-AUTH-19** Email-access recovery: F20 Help form topic `cant_access_email` → `support-request`; `admin_change_email` + `admin-change-email` function; `on_auth_user_email_changed` trigger re-resolves campus. · deps P4-AUTH-11 · done when T-INT-AUTH-07 · M

## P5 · Sell and media (D)

- [ ] **P5-MEDIA-01** ✎ R2 media Worker (`workers/media`): prefix allowlist (`c/`, `share/`), immutable cache headers, `nosniff`, type by extension, best-effort per-IP limit. Signed chat-photo reads are R1.1. · deps P0-ACC-05 · done when GET of a public key → 200 + immutable header; unknown prefix → 404 · M
- [ ] **P5-MEDIA-02** ✎ Edge Function `upload-url` + `private.can_upload` + `_shared/r2.ts`; **signs content-length and content-type** (SEC-02); kinds listing/avatar/share. · deps P3-DB-10 · done when presigned PUT works; wrong owner → 403; oversize body → 403 (T-SEC-18) · M
- [ ] **P5-MEDIA-03** `lib/media.ts`: pickPhotos, processPhoto (1080/400 WebP, EXIF stripped, blurhash), uploadPhotos (retry, progress) · MEDIA-02 · T-UNIT-MEDIA-01..05 pass; output has no GPS EXIF · M
- [ ] **P5-MEDIA-04** ✎ Extend `delete-account`: move photo keys referenced by open reports to `onlyswap-private/evidence/` (BE-02), then delete the user's R2 prefixes (avatar, own listings, share cards). · deps P5-MEDIA-02, P4-DEL-01 · done when T-INT-DEL-03 passes; no other user objects remain · M
- [ ] **P5-SELL-01** ✎ RPCs `reserve_listing_id`, `create_listing` (idempotent), `update_listing`, `delete_listing` (soft), `relist_listing`, `mark_sold`, `check_text` (`price_hint` RPC is built too; its UI is R1.1) · deps P3-DB-10 · done when pgTAP incl. banned words, limits, T-INT-LIST-04 pass · L
- [ ] **P5-SELL-02** `useDraft` + S-D01 Sell·photos (grid, reorder, camera/library, permission primer and denied states, X16) · MEDIA-03 · a draft survives an app kill · L
- [ ] **P5-SELL-03** ✎ D02 Sell·details with every D3 error state and the give-away toggle (D4); no price hint UI in R1.0 · deps P5-SELL-01 · done when all errors show at once · M
- [ ] **P5-SELL-04** ✎ D03 Sell step 3: meetup spot list (police-designated first), extra place text, availability chips. No map. · deps P5-SELL-03 · done when spots saved on the listing · S
- [ ] **P5-SELL-05** S-D06 Posted + ShareCard generation (view-shot) + share sheet · SELL-04 · `share_image_path` is set and the OG image loads · M
- [ ] **P5-SELL-07** Draft photo cleanup (cron + R2 list/delete) · MEDIA-02 · orphan drafts older than 24 h are removed on staging · S

## P6 · Discover, listing, search (B, C)

- [ ] **P6-FEED-01** RPCs `get_feed`, `record_swipes`, `undo_swipe`, `save_listing`, `unsave_listing`, `hide_listing`, `watch_listing`, `record_view` · P5-SELL-01 · pgTAP: excludes own, blocked, swiped · M
- [ ] **P6-FEED-02** SwipeDeck + SwipeCard components (gesture, stamps, fly-out, programmatic swipe, undo, list mode for screen readers) · P2-MOT-01 · 60 fps on a mid Android device (Perf-02) · L
- [ ] **P6-FEED-03** S-B01 Discover: feed hook, batching swipes, first-swipe coach, end of deck, undo toast, offline queue · FEED-01, FEED-02 · all B1–B4 and X24 states · L
- [ ] **P6-LIST-01** S-B05 Listing detail (buyer, owner, hold, gone, blocked) · FEED-01 · all B5–B7 and X13 states · L
- [ ] **P6-LIST-02** S-B08 Listing options + S-B09 Report listing (report RPC stub from P10 or build it early) · LIST-01, P3-SAFE-01 · report row created · M
- [ ] **P6-LIST-03** S-B09p Photo viewer · LIST-01 · pinch and swipe-down close · S
- [ ] **P6-SRCH-01** RPCs `search_listings`, `search_suggest`, saved-search CRUD, `saved_search_new_counts`; MV `campus_trending_terms` · P3-DB-09 · "mini frig" finds "Mini fridge" · M
- [ ] **P6-SRCH-02** S-B12 Search + suggestions + recent · SRCH-01 · B14/B15 states · M
- [ ] **P6-SRCH-03** S-B16 Results + X5 no results + save search · SRCH-02 · — · M
- [ ] **P6-SRCH-04** S-B15 Filters sheet · SRCH-03 · filters applied round trip · M
- [ ] **P6-SAVE-01** S-B18 Saved (Items and Searches tabs, alerts toggles, X38) · SRCH-01, FEED-01 · — · M
- [ ] **P6-USER-01** S-B17 Seller profile, reviews, new seller, blocked state · P3-DB-09 · B20–B22 · M

## P7 · Offers (E, part 1)

- [ ] **P7-OFF-01** ✎ Offer RPCs `make_offer` (FOR SHARE), `accept_offer` (FOR UPDATE, chat + snapshot, auto-decline), `counter_offer`, `decline_offer`, `withdraw_offer`, `get_inbox`, `listing_offers`, and the `expire_offers` cron. · deps P6-FEED-01 · done when state machine (DATA_MODEL §4.2) pgTAP green incl. T-INT-OFF-RACE and T-INT-OFF-RACE-02 · L
- [ ] **P7-OFF-02** S-B09 Make an offer sheet (quick chips, notes, low-offer warning, B12 limit, B13 success) · OFF-01 · — · M
- [ ] **P7-OFF-03** S-E01 Inbox (Offers and Chats tabs, sections, empty X6, realtime `user:` channel) · OFF-01 · a new offer appears without refresh while the screen is focused · M
- [ ] **P7-OFF-04** S-E03 Offer detail covering all roles and statuses (E3–E8) · OFF-01 · every state reachable via fixtures · L
- [ ] **P7-OFF-05** S-F05 Offers on this listing (seller history) · OFF-01 · — · S
- [ ] **P7-OFF-06** New-account and paused-offer limits wired to copy (OFFERS_PAUSED) · OFF-01 · — · S
- [ ] 🆕 **P7-OFF-07** Free items: offers at $0 with "Ask for it" copy; seller sees requests in arrival order. · deps P7-OFF-02 · done when E2E free-item step passes · S

## P8 · Chat, meetups, deals (E, part 2)

- [ ] **P8-CHAT-01** RPCs `get_messages`, `send_message` (idempotent), `mark_chat_read`, `set_chat_mute`, `hide_chat`; broadcast trigger; `realtime.messages` policies · P7-OFF-01 · T-INT-RT-01: a non-participant can't subscribe · L
- [ ] **P8-CHAT-02** `useChat` (focus subscribe, dedupe, reconnect, offline queue) · CHAT-01 · T-UNIT-CHAT-* · L
- [ ] **P8-CHAT-03** S-E09 Chat UI (bubbles, system rows, deal bar, safety tip, failed/pending, blocked X18, closed read-only) · CHAT-02 · — · L
- [ ] **P8-CHAT-05** S-X17 Chat details (mute, report, block, hide) · CHAT-03 · — · S
- [ ] **P8-MEET-01** ✎ Meetup RPCs `propose_meetup` (cancels previous), `confirm_meetup`, `checkin_meetup`, `running_late`, `cancel_meetup`, `create_meetup_share`, `report_noshow` (reporter must be checked in), `get_meetup_share`; crons `meetup_reminders`, `noshow_autoconfirm`. · deps P8-CHAT-01 · done when T-INT-MEET-01/02/03 and T-INT-TZ-01 pass · L
- [ ] **P8-MEET-02** ✎ E05 Plan the pickup: spot list with designation tags + **Directions** deep link (Apple/Google Maps), custom place, day/time picker, counter-proposal. No map, no location permission. · deps P8-MEET-01 · done when works end to end on both OSes (E2E-08) · M
- [ ] **P8-MEET-03** S-E12 Meetup day (countdown, I'm here, late, cancel, reschedule E15, no-show E14, share E13) · MEET-01 · every state reachable via fixtures · L
- [ ] **P8-MEET-04** MeetupCard component in chat with inline accept/suggest another · MEET-01 · — · M
- [ ] **P8-DEAL-01** RPCs `confirm_deal`, `mark_sold`, `submit_rating`; cron jobs `deal_checks` and `rating_reveal`; view `ratings_visible` · MEET-01 · the double-blind reveal is correct at 7 days · M
- [ ] **P8-DEAL-02** S-E16 Did it sell?, S-F07 Mark sold (pick buyer), S-E17 Rate the swap + E18 reveal · DEAL-01 · — · M
- [ ] **P8-DEAL-03** `maybeAskForReview()` (X26) · DEAL-02 · shown only when conditions hold · S
- [ ] 🆕 **P8-CHAT-06** Scam hint row under incoming messages with URLs, phone numbers or payment words (client-side only). · deps P8-CHAT-03 · done when T-UNIT-CHAT-04 · S
- [ ] 🆕 **P8-DEAL-04** Sold elsewhere / listing deleted / account deleted: other chats close read-only with a system message; "Deleted user" rendering with snapshot. · deps P8-DEAL-01 · done when T-INT-SOLD-01, T-INT-DEL-02, E2E-21 green · M

## P9 · Notifications and email

- [ ] **P9-PUSH-01** APNs key via `eas credentials` (iOS); upload the FCM v1 JSON to EAS (Android) · P1-SETUP-05, P0-ACC-07 · `eas credentials` shows both · S
- [ ] **P9-PUSH-02** `lib/push.ts`: Android channels, permission, token register/refresh, tap handling (cold and warm), badge · PUSH-01 · a test push opens the right screen on both OSes · M
- [ ] **P9-PUSH-03** Edge Function `send-push` (prefs, quiet hours, cap, collapse, time-sensitive, tickets) + `push-receipts` + cron jobs · P3-DB-06 · T-INT-PUSH-* pass; a bad token gets disabled · L
- [ ] **P9-PUSH-04** ✎ All 23 R1.0 notification triggers from API §7, with dedupe keys and preview-safe text. · deps P9-PUSH-03, P7, P8 · done when each type fires once in `scripts/fire-all-notifications.ts` on staging (T-INT-NOTIF-DEDUPE green) · L
- [ ] **P9-NOTIF-01** S-F09 Notifications list + X36 empty + unread badge · PUSH-04 · — · M
- [ ] **P9-NOTIF-02** S-F11 Notification settings (prefs, tips opt-in with consent line, previews, quiet hours, OS-off banner) · PUSH-03 · toggling `tips` off stops stale nudges (test) · M
- [ ] **P9-MAIL-01** `_shared/mailer.ts` + templates (campus_open, account_paused, reverify_due, account_deleted, data_export, admin_reveal_receipt, support_request) · P1-SPIKE-01 · snapshot tests of rendered templates · M
- [ ] **P9-MAIL-02** `send-email` drain function + `email_drain` cron + 400/day cap · MAIL-01 · 500 queued emails drain over 2 days on staging (simulated clock) · S
- [ ] **P9-CRON-01** Remaining cron jobs: stale_listings, listings_expire, expire_food, reverify_reminders/enforce, pause_lift, refresh_stats/hints, prune, archive_chats, strike_expiry · P3-DB-09 · `select * from cron.job` lists all of them; each tested with pgTAP time travel (`set local` now override via `private.now()` wrapper) · L
- [ ] 🆕 **P9-FIX-01** Outbox hardening: `for update skip locked` claims in `send-push`/`send-email`, `reset_stuck_sends` cron, exists-guards on the minute crons. · deps P9-PUSH-03, P9-MAIL-02 · done when T-FN-07 passes · S

## P10 · Quad (Q)


## P11 · Safety, account, settings, states — **start the Play closed test here**

- [ ] **P11-SAFE-02** S-E19 Report & block sheet, S-E20 Report sent, S-E21 Report update · P3-SAFE-01 · — · M
- [ ] **P11-SAFE-03** S-X10 Suspended/paused/banned gate + S-X10a Appeal · P3-SAFE-01 · — · M
- [ ] **P11-SAFE-04** S-F13 Blocked accounts · P3-SAFE-01 · — · S
- [ ] **P11-SAFE-05** ✎ F19 Safety center (spot list + Directions, tips, 911), X10 Banned items (expanded, D17), F20 Help (bundled FAQ JSON). · deps P2 · done when — · M
- [ ] **P11-ACC-01** S-F16 Delete account (type DELETE) · P4-DEL-01 · end-to-end delete works · S
- [ ] **P11-SET-01** S-F01 Profile, S-F02 Edit profile, S-F03 My listings (+X37), S-F04 Listing stats, S-F06 Edit listing (price-drop trigger), S-F08 Relist · P6 · — · L
- [ ] **P11-SET-02** ✎ F10 Settings (+ Sign out of all devices), F12 Privacy settings (analytics/crash toggles), F14 Appearance (System/Light/Dark), F15 Change school, F18 About (licenses). · deps P9-NOTIF-02 · done when — · L
- [ ] **P11-STATE-01** Global states: OfflineBanner wiring, X11 Update required, X12 Maintenance, X14 Under review, X30/X31 deep-link errors, X25 Share listing · P4-AUTH-03 · toggling `app_config` values shows X11/X12 · M
- [ ] **P11-STATE-02** Deep links: `lib/deeplinks.ts`, universal links (AASA) and App Links (assetlinks) with `EXPO_PUBLIC_SITE_URL` · P13-WEB-01 · tapping `https://…/l/{id}` in Notes opens the app on both OSes · M
- [ ] **P11-A11Y-01** Accessibility pass: labels, roles, font scale 200% (X32), VoiceOver list mode for the deck (X33), focus order, reduce motion · all P4–P11 screens · T-QA-A11Y checklist passes · L
- [ ] **P11-BETA-01** First production-profile build → Play **closed testing** track with the testers group. **The 14-day clock starts.** · P11 features · 12+ testers opted in on the Play Console · S

## P12 · Admin panel (G)

- [ ] **P12-ADM-01** Scaffold `apps/admin` (Vite + React + TanStack Router/Table + tokens CSS) and deploy it to Pages `onlyswap-admin` · P2-TOK-01 · a preview URL loads · M
- [ ] **P12-ADM-02** G-LOGIN: email OTP + TOTP enroll/challenge + `requireAdmin` guard + 8 h session · ADM-01, P3-AUTH-01 · a non-admin is blocked; AAL1 is prompted for MFA · M
- [ ] **P12-ADM-03** ✎ Admin RPCs `public.admin_*` for R1.0 (API §4) with `require_admin` and one audit row each; `revoke-sessions` + `admin-change-email` functions. · deps P3-DB-08 · done when T-INT-ADMIN-01/02 pass · L
- [ ] **P12-ADM-04** ✎ G02 Overview (open reports, today counts). The metrics UI is R1.1. · deps P12-ADM-03 · done when — · M
- [ ] **P12-ADM-05** G-REPORTS Reports queue + detail + actions; G-APPEALS · ADM-03 · — · L
- [ ] **P12-ADM-06** G-USERS, G-USER detail · ADM-03 · — · M
- [ ] **P12-ADM-07** ✎ G02 Listings (held queue, remove/restore) and Chats (metadata; report-gated reading). The Quad queue is R1.1. · deps P12-ADM-03 · done when every action logged · M
- [ ] **P12-ADM-08** ✎ G02 Campus setup (domains incl. aliases/blocked, meetup spots with designation + date, status live/paused, dials), Flags/config (maintenance, min versions, rules_version), Audit log (CSV). · deps P12-ADM-03 · done when flipping `rules_version` triggers the app gate (E2E-22) · L

## P13 · Web surfaces (W)

- [ ] **P13-WEB-01** ✎ `apps/site` with Astro on Pages project `onlyswap-site`; tokens CSS; `.well-known` AASA + assetlinks (Play App Signing SHA-256); `_redirects`. · deps P1-SETUP-01 · done when AASA validator passes; Android App Links verified · M
- [ ] **P13-WEB-02** W-LAND landing (desktop + phone), campus progress, store badges · WEB-01 · Lighthouse ≥ 90 performance and accessibility · L
- [ ] **P13-WEB-03** Legal template + W-PRIV, W-TERMS, W-RULES, W-BANNED, W-SAFETY, W-COOKIES, W-CHILD (final legal text written by you; layouts from the design) · WEB-01 · all URLs live · M
- [ ] **P13-WEB-04** W-HELP support page + `support-request` function + Turnstile · WEB-03 · the form emails you · M
- [ ] **P13-WEB-05** W-DELETE web deletion (OTP login + confirm) · P4-DEL-01 · deletes a test account · M
- [ ] **P13-WEB-06** ✎ Pages Functions `/l/[id]` (OG) and `/m/[token]` (meetup share). `/i/[code]` moves to R1.1 with the waitlist. · deps P5-SELL-05, P8-MEET-01 · done when the iMessage preview shows the card and an expired meetup token shows expiry · M
- [ ] **P13-WEB-08** ✎ W06 404 page (`/joined` moves to R1.1). · deps P13-WEB-02 · done when unknown paths show the 404 · S
- [ ] 🆕 **P13-WEB-09** `_headers` (CSP, XFO, nosniff, referrer, permissions) for site + admin; `robots.txt`, `sitemap.xml`, meta/OG per page; admin `X-Robots-Tag: noindex`. · deps P13-WEB-01, P12-ADM-01 · done when E2E-W08 passes; Lighthouse ≥ 90 · S

## P14 · Hardening, monitoring, backups

- [ ] **P14-MON-01** Sentry: release and dist tagging per EAS build, source maps, alert rules (new issue, spike more than 20 in 1 h), functions instrumented with `@sentry/deno` · P1-LIB-02 · a test error alerts email · M
- [ ] **P14-MON-02** ✎ PostHog: the 18 behavior events (PRD §5.3), privacy settings (identified_only, no autocapture, no replay, no GeoIP/IP), funnels dashboard. · deps P1-LIB-02 · done when T-DATA-01 passes · M
- [ ] **P14-MON-03** UptimeRobot monitors: `health` function, media Worker, web, admin, `/privacy`, `/delete` · P13 · alert email on downtime · S
- [ ] **P14-BAK-01** `backup.yml`: nightly `supabase db dump` (schema + data) → `age` encrypt → R2 `onlyswap-backups`; 30-day lifecycle · P3 · file present each morning · M
- [ ] **P14-BAK-02** Restore drill to a local Docker instance, documented in `docs/runbooks/restore.md` · BAK-01 · restored row counts match · M
- [ ] **P14-KEEP-01** `keepalive.yml` pings staging daily until launch (private repo, so not auto-disabled) · P3 · staging never pauses · S
- [ ] **P14-SEC-01** Security test suite (testing.md §5) run and fixed · P4–P13 · all T-SEC pass · L
- [ ] **P14-PERF-01** Performance pass (testing.md §6) · P6, P8 · targets met · M
- [ ] **P14-E2E-00** Staging-only E2E support: catch-all domain `e2e.onlyswap.test` on the test campus + `test-inbox` Edge Function returning the latest OTP for `e2e+*` addresses (never deployed to production; CI check) · P3-AUTH-03 · Maestro reads the codes · M
- [ ] **P14-E2E-01** Maestro flows (testing.md §3), run locally on both platforms · P4–P11 · all green · L
- [ ] **P14-E2E-02** Playwright web and admin suites incl. axe a11y · P12, P13 · green · M
- [ ] **P14-LEGAL-01** ✎ Write the Terms, Privacy, Rules, Banned items, Safety, Cookies and Child safety text with every required section (RELEASE §6); version `2026-10`; bundle and publish; CI diff app vs site. · deps P13-WEB-03 · done when pages live; bundled copy matches · L
- [ ] 🆕 **P14-OPS-01** Download and store the Android upload keystore backup after the first production build (OPS-02). · deps P11-BETA-01 · done when keystore in the password manager · S
- [ ] 🆕 **P14-OPS-03** `scripts/usage-report.ts` + `usage-report.yml` weekly email (moved from post-launch, ARC-10). · deps P3, P5-MEDIA-01 · done when first report received · M

## P15 · Beta

- [ ] **P15-BETA-01** TestFlight internal build, then external group (submit for Beta App Review with notes and demo login) · P14 · external testers can install · M
- [ ] **P15-BETA-02** Play closed testing continues (started at P11-BETA-01); track opt-ins daily · P11-BETA-01 · 14 consecutive days with 12+ testers · S
- [ ] **P15-BETA-03** Seed founding sellers at the launch campus (real students; you onboard 20–50 listings) · P15-BETA-01 · 30+ live listings before public launch · L
- [ ] **P15-BETA-04** Bug bash: fix everything P0 and P1 from beta feedback · BETA-01 · crash-free sessions > 99% in Sentry for 7 days · L
- [ ] **P15-BETA-05** ✎ Walk the meetup spots with campus police; set designation `police` + date only where official; everything else `public`. · deps — · done when spots verified in admin · M

## P16 · Store launch

- [ ] **P16-STORE-01** Export store assets from the design (`scripts/export-store-assets.ts`): iOS 6.9" ×5, Play phone ×5, feature graphic, icon 512, preview video (optional) · P15 · files meet the spec (testing.md §7) · M
- [ ] **P16-STORE-02** ✎ App Store Connect setup per RELEASE §5 (US only, privacy label, age questionnaire → 18+, export compliance, reviewer notes, screenshots). · deps P16-STORE-01 · done when all sections green · M
- [ ] **P16-STORE-03** ✎ Play Console setup per RELEASE §5 (content declarations, Data safety, target audience 18+, IARC, child safety URL, deletion URL, US only). · deps P16-STORE-01 · done when Policy status shows no issues · M
- [ ] **P16-STORE-04** Production builds (`eas build -p all --profile production`), `eas submit` to both · STORE-02/03 · builds processed · S
- [ ] **P16-STORE-05** Apply for Play production access (after 14 days) · P15-BETA-02 · approved · S
- [ ] **P16-STORE-06** Submit iOS for review; answer any rejection within 24 h using the launch.md rejection playbook · STORE-04 · approved · M
- [ ] **P16-STORE-07** Phased release (iOS 7-day phased; Play staged rollout 20% → 50% → 100%) · STORE-05/06 · 100% live · S

## P17 · Post-launch operations (R1.0 ops) · Post-launch ops and features

- [ ] **P17-OPS-01** Weekly and monthly routines from launch.md §5, set as calendar reminders · P16 · — · S
- [ ] **P17-OPS-02** Remove `keepalive.yml` (real traffic now) · P16 · — · S
- [ ] **P17-FEAT-04** Second campus: add domains, spots and a waitlist in admin (no code) · P16 · — · S

---

## R1.1 backlog (starts after the R1.0 submission; not scheduled)

**Moved by the second scope cut (DEC-13):**

- [ ] **P4-AUTH-12** S-A13 Campus waitlist (count, invite link, share, tour) + `public_campus_progress` · AUTH-02 · the count updates · M
- [ ] **P4-AUTH-13** Campus unlock: trigger, `private.unlock_campus`, `campus-unlock` function (push + email queue), S-A14 Campus unlocked · AUTH-12, P9-PUSH-03, P9-MAIL-02 · simulating the 500th signup unlocks and notifies · M
- [ ] **P5-SELL-06** S-C02 Post free food and S-C05 Post a Wanted · SELL-01 · caps enforced · M
- [ ] 🆕 **P5-SELL-08** Wanted → "I have this": opens Sell prefilled with `wanted_ref`; `wanted_match` notification to the poster. · deps P5-SELL-06, P6-CAMP-01 · done when the poster gets a notification and can offer · S
- [ ] **P6-CAMP-01** RPC `get_campus_feed` + S-C01 Campus feed (free food countdown, free stuff, Wanted with "I have this" prefill, Day one C6, Founding sellers C7) · P5-SELL-06 · — · L
- [ ] **P11-ACC-02** Edge Function `export-data` + S-F17 Download your data · P3 · the JSON link arrives by email · M
- [ ] 🆕 **R11-HINT-01** Price hint UI in Sell details (`price_hint`; hidden while n < 5). · deps P5-SELL-03 · done when shown only with ≥5 comparables · S
- [ ] 🆕 **R11-INVITE-01** `/i/[code]` and `/joined` pages; invite links in the waitlist screen. · deps P4-AUTH-12 · — · S

**Moved by the first scope cut:**

- [ ] **P1-SPIKE-02** Spike: MapLibre + OpenFreeMap style renders in the dev build on both OSes. · SETUP-06 · map visible with a pin · S
- [ ] **P3-DB-05** `0005_quad.sql`: quad tables · DB-02 · — · S
- [ ] **P8-CHAT-04** Photos in chat behind `chat_photos_enabled` (upload kind chat, signed media URLs, blur until tapped for new contacts) · CHAT-03, P5-MEDIA-03 · the flag hides the camera button · M
- [ ] **P10-QUAD-01** RPCs `get_quad_feed`, `get_quad_thread`, `create_quad_post`, `create_quad_reply`, `vote_quad`, `vote_poll`, `hide_quad_author`, `unhide_quad`, `get_my_quad_hides`, `set_quad_replies`, `delete_quad_post`, `get_my_quad`, `mute_keyword`/`unmute_keyword`, `accept_quad_rules`; vote and score triggers; hot_rank · P3-DB-05, P3-DB-07 · T-INT-QUAD-ANON: no RPC ever returns `author_id` · L
- [ ] **P10-QUAD-02** Remote flag `quad_enabled` hides the tab · QUAD-01 · flipping the flag in admin removes the tab on the next launch · S
- [ ] **P10-QUAD-03** S-Q01 Welcome to the Quad (disclosure + agree) · QUAD-01 · — · S
- [ ] **P10-QUAD-04** S-Q02 Quad feed (sorts, votes, pinned announcement, day one Q4, new-posts pill) · QUAD-01 · — · L
- [ ] **P10-QUAD-05** S-Q05 Thread (replies with aliases, OP badge, options sheet Q7, photo viewer Q5) · QUAD-04 · — · L
- [ ] **P10-QUAD-06** S-Q07 New post (text, photo, poll, check-in; blocked Q9, held Q10, rate limits) · QUAD-01, P5-MEDIA-03 · PII and names-student cases route correctly · L
- [ ] **P10-QUAD-07** S-Q09 Report post, S-Q12 Your Quad, S-Q13 Quad activity, S-Q14 Muted, S-Q15 Check-in · QUAD-05 · — · M
- [ ] 🆕 **R11-MAP-01** MapLibre + OpenFreeMap map on Plan the pickup and Safety center (spots only, no location permission). · deps P1-SPIKE-02 · done when the map renders with the designation pins · M
- [ ] 🆕 **R11-ADM-01** Admin metrics UI (funnel, retention, liquidity, safety views). · deps P12-ADM-03 · done when it matches T-DATA-02 · L
- [ ] 🆕 **R11-ADM-02** Admin team (invite moderator), announcements (1/week), banned-words UI. · deps P12-ADM-03 · done when every action is logged · L
- [ ] 🆕 **R11-ADM-03** Admin Quad queue + reveal with re-MFA + receipt. · deps P10-QUAD-01 · done when T-INT-ADMIN-03 passes · M
- [ ] 🆕 **R11-NOTIF-01** R1.1 notification types (quad_reply, quad_milestone, announcements, free_food, rating_revealed). · deps P9-PUSH-04 · done when each fires once · M
- [ ] 🆕 **R11-REL-01** R1.1 release: privacy policy Quad section, Apple age questionnaire (social media yes), Quad enabled per campus at ≥300 active users, the tab bar gains Quad. · deps all R1.1 · done when RELEASE §8 R1.1 go/no-go passes · M
- [ ] 🆕 **R11-PHOTO-GATE** Chat photos only after CSAM scanning is active (Q2/Q3) or an explicit owner risk acceptance is logged. · deps P8-CHAT-04 · done when the decision is logged · S

## R2 backlog

- [ ] **P13-WEB-07** W-LOGIN, W-BROWSE, W-LISTING, W-INBOX, W-SELL (web app, reusing mobile features with web-specific layout wrappers) · P4–P8 · a web user can list and make an offer · L
- [ ] **P17-FEAT-01** Home screen widgets + Live Activity (`expo-widgets`), shipped only in the release that enables them · P16 · Apple rules checked (launch.md §4) · L
- [ ] **P17-FEAT-02** iPad layout (N5/N6), then `supportsTablet=true` and 13" iPad screenshots · P16 · — · L
- [ ] **P17-FEAT-03** Spanish (`es.ts`, screenshots per locale) · P16 · — · L
- [ ] 🆕 **R2-ICON-01** Alternate app icons (config plugin). · — · done when both OSes switch the icon · M
- [ ] 🆕 **R2-QUAD-CHECKIN** Quad check-ins (Q15). · deps R1.1 Quad · — · M
- [ ] 🆕 **R-DES-01** (optional, any time) Re-render the design board to reflect DESIGN_SYSTEM §9 deltas. · — · done when the board matches the locked spec · M

---

## Build order (R1.0): one Claude Code session per line

Each session ends runnable and with its tests green. **P0 tasks are yours** (manual) and run in parallel from day 1.

| # | Session | Tasks | Runnable result |
|---|---|---|---|
| S1 | Scaffold | P1-SETUP-01, P1-SETUP-02, P1-SETUP-03, P1-SETUP-04, P1-SETUP-05, P1-SETUP-06 | blank tabs app on the iOS Simulator; Android build green |
| S2 | Env + CI | P1-ENV-01, P1-ENV-02, P1-CI-01, P1-CI-02, P1-DB-01 | CI green, local Supabase up |
| S3 | Libs + spikes | P1-LIB-01, P1-LIB-02, P1-SPIKE-01, P1-SPIKE-03, P1-SPIKE-04 | email from a function, age signal logged, Nitro modules OK, Sentry test crash |
| S4 | Tokens + type | P2-TOK-01, P2-TOK-02, P2-TOK-03, P2-FONT-01, P2-MOT-01 | light/dark switching, contrast test green |
| S5 | Components 1 | P2-CMP-01, P2-CMP-02, P2-CMP-03, P2-CMP-04, P2-CMP-05, P2-CMP-06 | kit page |
| S6 | Components 2 | P2-CMP-07, P2-CMP-08, P2-CMP-09, P2-CMP-10, P2-CMP-11, P2-KIT-01, P2-KIT-02 | full kit + states gallery |
| S7 | Schema | P3-DB-01, P3-DB-02, P3-DB-03, P3-DB-04, P3-DB-06, P3-DB-11 | `db reset` works |
| S8 | Helpers + tests harness | P3-DB-07, P3-DB-10, P3-TEST-01, P3-TEST-02, P3-DB-12, P1-CI-03 | helper tests green; integrity suite tracked; contract snapshot |
| S9 | RLS + views + safety RPCs | P3-DB-08, P3-DB-09, P3-SAFE-01, P3-TYPES-01 | RLS matrix + T-SEC-19 green |
| S10 | Auth platform | P3-AUTH-01, P3-AUTH-02, P3-AUTH-03, P3-SEED-01 | a real .edu inbox gets a code from staging |
| S11 | Auth client | P4-AUTH-01, P4-AUTH-02, P4-DEL-01, P4-AUTH-03, P4-AUTH-04 | launch → welcome on devices |
| S12 | Sign-in screens | P4-AUTH-05, P4-AUTH-06, P4-AUTH-07 | sign in with age check on devices |
| S13 | Media pipeline | P5-MEDIA-01, P5-MEDIA-02, P5-MEDIA-03, P5-MEDIA-04 | photos to R2, EXIF stripped |
| S14 | Onboarding rest | P4-AUTH-08, P4-AUTH-09, P4-AUTH-10, P4-AUTH-11, P4-AUTH-17 | full onboarding incl. avatar + rules gate |
| S15 | Account safety + reviewer | P4-AUTH-14, P4-AUTH-15, P4-AUTH-18, P4-AUTH-19 | re-verify, reviewer login, sign-out-everywhere |
| S16 | Sell 1 | P5-SELL-01, P5-SELL-02, P5-SELL-03 | draft + details with errors |
| S17 | Sell 2 | P5-SELL-04, P5-SELL-05, P5-SELL-07 | post + share card |
| S18 | Feed backend + deck | P6-FEED-01, P6-FEED-02 | deck at 60 fps on fixtures |
| S19 | Discover + listing | P6-FEED-03, P6-LIST-01, P6-LIST-02, P6-LIST-03 | swipe → listing → report |
| S20 | Search | P6-SRCH-01, P6-SRCH-02, P6-SRCH-03, P6-SRCH-04 | search + filters |
| S21 | Saved + profiles | P6-SAVE-01, P6-USER-01 | saved items/searches, seller profile |
| S22 | Offers backend | P7-OFF-01, P7-OFF-06 | offer state machine green |
| S23 | Offers UI | P7-OFF-02, P7-OFF-03, P7-OFF-04, P7-OFF-05, P7-OFF-07 | offer loop on two devices |
| S24 | Chat core | P8-CHAT-01, P8-CHAT-02 | realtime between two devices |
| S25 | Chat UI | P8-CHAT-03, P8-CHAT-05, P8-CHAT-06 | chat with scam hint |
| S26 | Meetups | P8-MEET-01, P8-MEET-04, P8-MEET-02, P8-MEET-03 | plan → meetup day |
| S27 | Deals | P8-DEAL-01, P8-DEAL-02, P8-DEAL-03, P8-DEAL-04 | full swap incl. deletions (E2E-21) |
| S28 | Push | P9-PUSH-01, P9-PUSH-02, P9-PUSH-03, P9-FIX-01 | pushes on both OSes, no double sends |
| S29 | Notifications + email + cron | P9-PUSH-04, P9-NOTIF-01, P9-NOTIF-02, P9-MAIL-01, P9-MAIL-02, P9-CRON-01, P4-AUTH-16 | all 21 types fire; demo bot runs |
| S30 | Safety screens | P11-SAFE-02, P11-SAFE-03, P11-SAFE-04, P11-SAFE-05, P11-ACC-01 | report/block/appeal/delete |
| S31 | Profile + settings | P11-SET-01, P11-SET-02 | all F screens |
| S32 | Site foundation + deep links | P13-WEB-01, P11-STATE-01, P11-STATE-02 | gates + universal links |
| S33 | A11y + beta start | P11-A11Y-01, P11-BETA-01 | **Play closed test starts (14-day clock)** |
| S34 | Admin 1 | P12-ADM-01, P12-ADM-02, P12-ADM-03 | admin login with MFA; RPCs |
| S35 | Admin 2 | P12-ADM-04, P12-ADM-05, P12-ADM-06 | reports, users |
| S36 | Admin 3 | P12-ADM-07, P12-ADM-08 | listings, chats, campus, config, audit |
| S37 | Site pages | P13-WEB-02, P13-WEB-03, P13-WEB-04, P13-WEB-05, P13-WEB-08, P13-WEB-09 | landing, legal, help, delete, 404, headers |
| S38 | Share pages | P13-WEB-06 | `/l` and `/m` live |
| S39 | Monitoring + ops | P14-MON-01, P14-MON-02, P14-MON-03, P14-BAK-01, P14-BAK-02, P14-KEEP-01, P14-OPS-01, P14-OPS-03 | alerts, backups, usage report |
| S40 | E2E | P14-E2E-00, P14-E2E-01, P14-E2E-02 | all E2E green |
| S41 | Hardening + legal | P14-SEC-01, P14-PERF-01, P14-LEGAL-01 | security, perf, legal done |
| S42 | Beta | P15-BETA-01, P15-BETA-02, P15-BETA-03, P15-BETA-04, P15-BETA-05 | TestFlight external, spots verified |
| S43 | Store | P16-STORE-01, P16-STORE-02, P16-STORE-03, P16-STORE-04, P16-STORE-05, P16-STORE-06, P16-STORE-07 | live |
| S44 | Post-launch ops | P17-OPS-01, P17-OPS-02, P17-FEAT-04 | routines set |
