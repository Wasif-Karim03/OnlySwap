# tasks.md — Master task checklist

Format: `ID` description · **deps** · **done when** · size.

Sizes: **S** is under 2 h, **M** is a half day, **L** is 1–2 days.

For each Claude Code session, point it at a range of IDs, e.g. "do P4-AUTH-01 through P4-AUTH-06". Tasks marked 💲 carry a cost. Each one names the free alternative.

---

## P0 · Accounts and access (manual, you)

- [ ] **P0-ACC-01** Register the Google Play Console personal account ($25, one-time, unavoidable). Complete government ID, phone and email verification, and the device check in the Play Console app. · deps — · done when the Console home shows "Verified" · S 💲 *(unavoidable; no free alternative)*
- [ ] **P0-ACC-02** Confirm the Apple Developer Program membership is active and accept the latest agreements in App Store Connect. · — · Agreements page has no pending items · S
- [ ] **P0-ACC-03** Create the GitHub private repo `onlyswap` with main branch protection (PR + CI required). · — · a push to main without PR is blocked · S
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

## P1 · Foundations

- [ ] **P1-SETUP-01** Scaffold the pnpm monorepo (`apps/mobile`, `apps/admin`, `workers/*`, `supabase/`, `packages/tokens`, `packages/shared`, `docs/`) with Node 24 LTS `.nvmrc`. · P0-ACC-03 · `pnpm i` succeeds · S
- [ ] **P1-SETUP-02** Create the Expo SDK 57 app (`npx create-expo-app@latest apps/mobile -t tabs`) with TypeScript strict and Expo Router. · SETUP-01 · runs on the iOS simulator and Android emulator · S
- [ ] **P1-SETUP-03** Install the SDK-pinned deps with `npx expo install`: reanimated, gesture-handler, expo-image, flash-list, mmkv, unistyles, tanstack query, zustand, supabase-js, expo-secure-store, netinfo, expo-haptics, expo-image-picker, expo-image-manipulator, expo-location, expo-notifications, expo-age-range, maplibre, sentry, posthog, expo-store-review, expo-application, react-native-view-shot, expo-clipboard. · SETUP-02 · `npx expo-doctor` passes · S
- [ ] **P1-SETUP-04** Configure `app.config.ts`:
  - bundle id and package `app.onlyswap`, scheme `onlyswap`, `ios.supportsTablet=false`, `usesNonExemptEncryption:false`
  - `android.blockedPermissions` (fine location, READ_MEDIA_*, READ_EXTERNAL_STORAGE, RECORD_AUDIO, READ_CONTACTS, SCHEDULE_EXACT_ALARM, USE_EXACT_ALARM, AD_ID)
  - permission strings copied from the design (X19)
  - runtimeVersion fingerprint, associated domains, Android intent filters

  · SETUP-03 · `expo prebuild` output contains the expected Info.plist and AndroidManifest · M
- [ ] **P1-SETUP-05** Create `eas.json` profiles `development`, `preview` and `production` with channels, `appVersionSource: remote` and `autoIncrement`. · SETUP-04 · `eas build -p ios --profile development` succeeds · S
- [ ] **P1-SETUP-06** Build development clients for your iPhone (`eas device:create`) and Android phone. · SETUP-05 · the app launches on both physical devices · M
- [ ] **P1-ENV-01** Environment plumbing: `.env.example`, EAS env vars per environment (Secret visibility for secrets), `src/lib/env.ts` validated with zod at startup. · SETUP-05 · a missing env var crashes dev with a clear message · S
- [ ] **P1-ENV-02** Add gitleaks pre-commit and CI secret scan. · SETUP-01 · a commit containing a fake key is blocked · S
- [ ] **P1-CI-01** Add `.github/workflows/ci.yml` (Linux) with lint (eslint + prettier), typecheck, jest, pgTAP (later), and turbo-less pnpm filters. · SETUP-02 · green on a PR · M
- [ ] **P1-DB-01** Supabase CLI init; `supabase start` works locally; link staging. · P0-ACC-04 · local Studio opens · S
- [ ] **P1-SPIKE-01** Spike: Edge Function sending mail over SMTP 465 via Gmail. If it's blocked, build the Worker `mailer` fallback. Record the outcome. · DB-01, P0-ACC-10 · a test email arrives from a staging function · M
- [ ] **P1-SPIKE-02** Spike: MapLibre + OpenFreeMap style renders in the dev build on both OSes. · SETUP-06 · map visible with a pin · S
- [ ] **P1-SPIKE-03** Spike: `expo-age-range` returns a result or `unknown` on both OSes (with the entitlement `com.apple.developer.declared-age-range`). · SETUP-06 · logged result on devices · S
- [ ] **P1-LIB-01** `lib/supabase.ts`, `lib/rpc.ts`, `lib/errors.ts` (initial codes), `lib/storage.ts`, `lib/queryClient.ts`. · ENV-01 · unit tests pass (T-UNIT-LIB-*) · M
- [ ] **P1-LIB-02** `lib/sentry.ts` and `lib/analytics.ts` with the opt-in flag, plus the Sentry source-map upload set up through its EAS integration. · LIB-01, P0-ACC-08/09 · a test crash shows symbolicated in Sentry · M

## P2 · Design system and component kit

- [ ] **P2-TOK-01** `packages/tokens`: extract every CSS variable from the design board's 8 skins into `tokens.json` (color, type, space, radius, motion), with a generator script producing `unistyles.ts` and `admin.css`. · P1-SETUP-01 · generated files are committed · M
- [ ] **P2-TOK-02** Contrast test over all text/background token pairs in all skins. · TOK-01 · jest reports ≥ 4.5:1 for body pairs (fix tokens if not) · S
- [ ] **P2-TOK-03** Unistyles config with the theme switcher (System/Light/Night) persisted in MMKV. · TOK-01 · switching updates without re-render flashes · S
- [ ] **P2-FONT-01** Fonts (Inter via `expo-font`; the system font as fallback) and the type scale components `Text` variants. · TOK-03 · all H3 type rows render · S
- [ ] **P2-CMP-01** Button (all variants, states, loading, haptic) · TOK-03 · kitchen-sink row matches H3 · S
- [ ] **P2-CMP-02** Input, TextArea (counter), OTPInput · CMP-01 · states match H3 · M
- [ ] **P2-CMP-03** Chip/ChipGroup, SegmentedControl, Toggle, Checkbox, OptionRow (radio), Stepper · CMP-01 · a11y roles set · M
- [ ] **P2-CMP-04** Sheet + ActionSheet (Reanimated, pan to close, focus trap, Android back) · CMP-01 · works with keyboard open · L
- [ ] **P2-CMP-05** Toast, ToastUndo, Banner, OfflineBanner · CMP-01 · offline toggle shows the banner · S
- [ ] **P2-CMP-06** Card, ListRow/GroupedList, Tag, Avatar, Mark (logo from the shared SVG) · CMP-01 · matches F10 styling · S
- [ ] **P2-CMP-07** Photo (expo-image + blurhash), PhotoCarousel, ZoomableImage · CMP-01 · a 4-photo carousel works · M
- [ ] **P2-CMP-08** EmptyState, ErrorState, Skeleton set · CMP-01 · matches X3/X36 · S
- [ ] **P2-CMP-09** NavBar, TabBar (iOS style + Android pill variant), StepIndicator, ProgressBar · CMP-06 · N1 look on Android · M
- [ ] **P2-CMP-10** PermissionPrimer (camera/photos/location/notifications, including the denied → Settings variant) · CMP-01 · handles every OS status · M
- [ ] **P2-CMP-11** ConfirmDialog, ReportSheet shell · CMP-04 · — · S
- [ ] **P2-MOT-01** Motion primitives: press scale, spring presets, check-draw success, reduce-motion hook · CMP-01 · reduce motion swaps to fades · S
- [ ] **P2-KIT-01** Kitchen-sink route `/dev/kit` (dev builds only) showing every component and state in every skin. · CMP-01..11 · visual pass against H3 in 8 skins · S

- [ ] **P2-KIT-02** States gallery route `/dev/states` (dev builds only) rendering every X-section state with fixtures, used by manual QA · KIT-01 · every X frame is reachable · S

## P3 · Data model, RLS, auth hooks

- [ ] **P3-DB-01** Migration `0001_extensions_enums.sql` · P1-DB-01 · `db reset` succeeds · S
- [ ] **P3-DB-02** `0002_campus_identity.sql`: campuses, campus_domains, profiles, review_accounts, age_blocks, banned_hashes, waitlist_requests, admins, app_config, activity_days, common_first_names · DB-01 · — · M
- [ ] **P3-DB-03** `0003_listings.sql`: categories, listings (generated search column), listing_photos, listing_price_changes, listing_reservations, swipes, saves, watches, saved_searches, plus indexes · DB-02 · — · M
- [ ] **P3-DB-04** `0004_deals.sql`: offers, chats, messages, safe_spots, meetups, noshow_reports, ratings, blocks · DB-03 · — · M
- [ ] **P3-DB-05** `0005_quad.sql`: quad tables · DB-02 · — · S
- [ ] **P3-DB-06** `0006_safety_ops.sql`: reports, strikes, appeals, banned_words, audit_log (immutable trigger), rate_counters, support_requests, notifications, notification_prefs, push_tokens, push_tickets, announcements, data_exports, email_outbox, daily_counters · DB-02 · — · M
- [ ] **P3-DB-07** `0007_helpers.sql`: `private.*` helpers (require_active, hit, hit_ip, check_text, pii_check, names_student, email_hash, is_blocked, queue_notification, new_invite_code, unaccent_immutable) · DB-06 · pgTAP helper tests pass · L
- [ ] **P3-DB-08** `0008_rls.sql`: enable RLS on every table and write every policy from backend §2 · DB-02..06 · pgTAP RLS matrix passes (T-INT-RLS-*) · L
- [ ] **P3-DB-09** `0009_views.sql`: public_profiles, profile_stats (MV), ratings_visible, campus_progress, price_hints, campus_trending_terms, my_reports · DB-08 · — · M
- [ ] **P3-AUTH-01** Postgres auth hooks `hook_before_user_created` and `hook_custom_access_token`, enabled in config.toml and on staging/prod · DB-07 · signups from unknown domains are rejected; JWT has the claims · M
- [ ] **P3-AUTH-02** Trigger `on_auth_user_created`: profile, prefs, waitlist status, invite link · AUTH-01 · a new user gets a profile row · S
- [ ] **P3-AUTH-03** Auth config: email OTP length 6, expiry 600 s, custom SMTP (Gmail 465 or Resend), rate limits raised to 200/h, "Confirm email" ON, password provider on (reviewers), OTP template with the code in the subject (T3) · AUTH-01, P1-SPIKE-01 · a real .edu inbox receives the code · M
- [ ] **P3-SEED-01** `seed.sql` with campuses, domains, categories, safe spots, banned words (about 150), common first names, and demo data · DB-09 · `db reset` gives a usable app · M
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
- [ ] **P4-AUTH-07** S-A07 Age check: OS signal, Birthday wheel fallback, Not eligible, underage deletion · AUTH-06, P1-SPIKE-03, P4-DEL-01 · a minor path deletes the auth user and blocks retry · M
- [ ] **P4-AUTH-08** S-A10 Profile setup, including avatar upload (depends on the media pipeline) · AUTH-07, P5-MEDIA-03 · the profile row is updated · M
- [ ] **P4-AUTH-09** S-A11 Community rules with the 18+ checkbox and legal links · AUTH-08 · can't continue unchecked · S
- [ ] **P4-AUTH-10** S-A12 Notifications primer (permission flow; registration completed in P9) · AUTH-09, P2-CMP-10 · the OS prompt fires only on the button · S
- [ ] **P4-AUTH-11** Edge Function `waitlist-request` + Turnstile helper · P3-DB-02 · a duplicate email is a silent success; IP limited · M
- [ ] **P4-AUTH-12** S-A13 Campus waitlist (count, invite link, share, tour) + `public_campus_progress` · AUTH-02 · the count updates · M
- [ ] **P4-AUTH-13** Campus unlock: trigger, `private.unlock_campus`, `campus-unlock` function (push + email queue), S-A14 Campus unlocked · AUTH-12, P9-PUSH-03, P9-MAIL-02 · simulating the 500th signup unlocks and notifies · M
- [ ] **P4-AUTH-14** Session expired modal (X7) and the re-verify gate (X9) with `complete_reverify` · AUTH-06 · forcing `verified_until` into the past shows X9; a new code restores it · M
- [ ] **P4-AUTH-15** Reviewer accounts: `scripts/seed-review.ts` + `review_accounts` rows on staging · AUTH-05 · a reviewer logs in with a password on staging · S

- [ ] **P4-AUTH-16** `demo_autoplay` cron (Demo University only): the bot accepts offers, replies, proposes and completes meetups for reviewers · AUTH-15, P8-MEET-01 · a reviewer completes a swap alone on staging · M

## P5 · Sell and media (D)

- [ ] **P5-MEDIA-01** R2 media Worker (`workers/media`) with prefix allowlist, cache headers and signed chat URLs · P0-ACC-05 · a GET of a public key returns 200 with an immutable header; an unknown prefix returns 404 · M
- [ ] **P5-MEDIA-02** Edge Function `upload-url` + `can_upload` RPC + `_shared/r2.ts` · P3-DB-03 · presigned PUT works; wrong owner → 403; oversize → 400 · M
- [ ] **P5-MEDIA-03** `lib/media.ts`: pickPhotos, processPhoto (1080/400 WebP, EXIF stripped, blurhash), uploadPhotos (retry, progress) · MEDIA-02 · T-UNIT-MEDIA-01..05 pass; output has no GPS EXIF · M
- [ ] **P5-MEDIA-04** Extend `delete-account` to delete the user's R2 prefixes (avatar, listing, chat, quad photos) via `_shared/r2.deletePrefix` · MEDIA-02, P4-DEL-01 · after a delete, the R2 list shows no user objects · S
- [ ] **P5-SELL-01** RPCs `reserve_listing_id`, `create_listing`, `update_listing`, `delete_listing`, `price_hint`, `check_text` · P3-DB-07 · pgTAP including banned words and limits · L
- [ ] **P5-SELL-02** `useDraft` + S-D01 Sell·photos (grid, reorder, camera/library, permission primer and denied states, X16) · MEDIA-03 · a draft survives an app kill · L
- [ ] **P5-SELL-03** S-D02 Sell·details with the price hint and every D3 error state, plus the give-away toggle (D4) · SELL-01 · all errors show at once · M
- [ ] **P5-SELL-04** S-D05 Sell·meetup spot selection (list + map preview) · SELL-03, P1-SPIKE-02 · spots saved on the listing · M
- [ ] **P5-SELL-05** S-D06 Posted + ShareCard generation (view-shot) + share sheet · SELL-04 · `share_image_path` is set and the OG image loads · M
- [ ] **P5-SELL-06** S-C02 Post free food and S-C05 Post a Wanted · SELL-01 · caps enforced · M
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
- [ ] **P6-CAMP-01** RPC `get_campus_feed` + S-C01 Campus feed (free food countdown, free stuff, Wanted with "I have this" prefill, Day one C6, Founding sellers C7) · P5-SELL-06 · — · L

## P7 · Offers (E, part 1)

- [ ] **P7-OFF-01** RPCs `make_offer`, `accept_offer`, `counter_offer`, `decline_offer`, `withdraw_offer`, `get_inbox`, `listing_offers`, and the `expire_offers` cron · P6-FEED-01 · pgTAP state machine: all transitions allowed or denied as specified; concurrent accepts are safe (T-INT-OFF-RACE) · L
- [ ] **P7-OFF-02** S-B09 Make an offer sheet (quick chips, notes, low-offer warning, B12 limit, B13 success) · OFF-01 · — · M
- [ ] **P7-OFF-03** S-E01 Inbox (Offers and Chats tabs, sections, empty X6, realtime `user:` channel) · OFF-01 · a new offer appears without refresh while the screen is focused · M
- [ ] **P7-OFF-04** S-E03 Offer detail covering all roles and statuses (E3–E8) · OFF-01 · every state reachable via fixtures · L
- [ ] **P7-OFF-05** S-F05 Offers on this listing (seller history) · OFF-01 · — · S
- [ ] **P7-OFF-06** New-account and paused-offer limits wired to copy (OFFERS_PAUSED) · OFF-01 · — · S

## P8 · Chat, meetups, deals (E, part 2)

- [ ] **P8-CHAT-01** RPCs `get_messages`, `send_message` (idempotent), `mark_chat_read`, `set_chat_mute`, `hide_chat`; broadcast trigger; `realtime.messages` policies · P7-OFF-01 · T-INT-RT-01: a non-participant can't subscribe · L
- [ ] **P8-CHAT-02** `useChat` (focus subscribe, dedupe, reconnect, offline queue) · CHAT-01 · T-UNIT-CHAT-* · L
- [ ] **P8-CHAT-03** S-E09 Chat UI (bubbles, system rows, deal bar, safety tip, failed/pending, blocked X18, closed read-only) · CHAT-02 · — · L
- [ ] **P8-CHAT-04** Photos in chat behind `chat_photos_enabled` (upload kind chat, signed media URLs, blur until tapped for new contacts) · CHAT-03, P5-MEDIA-03 · the flag hides the camera button · M
- [ ] **P8-CHAT-05** S-X17 Chat details (mute, report, block, hide) · CHAT-03 · — · S
- [ ] **P8-MEET-01** RPCs `propose_meetup`, `confirm_meetup`, `checkin_meetup`, `running_late`, `cancel_meetup`, `create_meetup_share`, `report_noshow`, `get_meetup_share`; cron jobs `meetup_reminders` and `noshow_autoconfirm` · CHAT-01 · pgTAP time windows · L
- [ ] **P8-MEET-02** S-E11 Plan the pickup (map, spot list, time picker, location primer X19b, location off X20) · MEET-01, P1-SPIKE-02 · works with location denied · L
- [ ] **P8-MEET-03** S-E12 Meetup day (countdown, I'm here, late, cancel, reschedule E15, no-show E14, share E13) · MEET-01 · every state reachable via fixtures · L
- [ ] **P8-MEET-04** MeetupCard component in chat with inline accept/suggest another · MEET-01 · — · M
- [ ] **P8-DEAL-01** RPCs `confirm_deal`, `mark_sold`, `submit_rating`; cron jobs `deal_checks` and `rating_reveal`; view `ratings_visible` · MEET-01 · the double-blind reveal is correct at 7 days · M
- [ ] **P8-DEAL-02** S-E16 Did it sell?, S-F07 Mark sold (pick buyer), S-E17 Rate the swap + E18 reveal · DEAL-01 · — · M
- [ ] **P8-DEAL-03** `maybeAskForReview()` (X26) · DEAL-02 · shown only when conditions hold · S

## P9 · Notifications and email

- [ ] **P9-PUSH-01** APNs key via `eas credentials` (iOS); upload the FCM v1 JSON to EAS (Android) · P1-SETUP-05, P0-ACC-07 · `eas credentials` shows both · S
- [ ] **P9-PUSH-02** `lib/push.ts`: Android channels, permission, token register/refresh, tap handling (cold and warm), badge · PUSH-01 · a test push opens the right screen on both OSes · M
- [ ] **P9-PUSH-03** Edge Function `send-push` (prefs, quiet hours, cap, collapse, time-sensitive, tickets) + `push-receipts` + cron jobs · P3-DB-06 · T-INT-PUSH-* pass; a bad token gets disabled · L
- [ ] **P9-PUSH-04** All notification triggers from the backend §7 catalog (offers, messages, meetups, alerts, selling, quad, safety, account, campus) · PUSH-03, P7, P8 · each type fires once in a staging script `scripts/fire-all-notifications.ts` · L
- [ ] **P9-NOTIF-01** S-F09 Notifications list + X36 empty + unread badge · PUSH-04 · — · M
- [ ] **P9-NOTIF-02** S-F11 Notification settings (prefs, tips opt-in with consent line, previews, quiet hours, OS-off banner) · PUSH-03 · toggling `tips` off stops stale nudges (test) · M
- [ ] **P9-MAIL-01** `_shared/mailer.ts` + templates (campus_open, account_paused, reverify_due, account_deleted, data_export, admin_reveal_receipt, support_request) · P1-SPIKE-01 · snapshot tests of rendered templates · M
- [ ] **P9-MAIL-02** `send-email` drain function + `email_drain` cron + 400/day cap · MAIL-01 · 500 queued emails drain over 2 days on staging (simulated clock) · S
- [ ] **P9-CRON-01** Remaining cron jobs: stale_listings, listings_expire, expire_food, reverify_reminders/enforce, pause_lift, refresh_stats/hints, prune, archive_chats, strike_expiry · P3-DB-09 · `select * from cron.job` lists all of them; each tested with pgTAP time travel (`set local` now override via `private.now()` wrapper) · L

## P10 · Quad (Q)

- [ ] **P10-QUAD-01** RPCs `get_quad_feed`, `get_quad_thread`, `create_quad_post`, `create_quad_reply`, `vote_quad`, `vote_poll`, `hide_quad_author`, `unhide_quad`, `get_my_quad_hides`, `set_quad_replies`, `delete_quad_post`, `get_my_quad`, `mute_keyword`/`unmute_keyword`, `accept_quad_rules`; vote and score triggers; hot_rank · P3-DB-05, P3-DB-07 · T-INT-QUAD-ANON: no RPC ever returns `author_id` · L
- [ ] **P10-QUAD-02** Remote flag `quad_enabled` hides the tab · QUAD-01 · flipping the flag in admin removes the tab on the next launch · S
- [ ] **P10-QUAD-03** S-Q01 Welcome to the Quad (disclosure + agree) · QUAD-01 · — · S
- [ ] **P10-QUAD-04** S-Q02 Quad feed (sorts, votes, pinned announcement, day one Q4, new-posts pill) · QUAD-01 · — · L
- [ ] **P10-QUAD-05** S-Q05 Thread (replies with aliases, OP badge, options sheet Q7, photo viewer Q5) · QUAD-04 · — · L
- [ ] **P10-QUAD-06** S-Q07 New post (text, photo, poll, check-in; blocked Q9, held Q10, rate limits) · QUAD-01, P5-MEDIA-03 · PII and names-student cases route correctly · L
- [ ] **P10-QUAD-07** S-Q09 Report post, S-Q12 Your Quad, S-Q13 Quad activity, S-Q14 Muted, S-Q15 Check-in · QUAD-05 · — · M

## P11 · Safety, account, settings, states — **start the Play closed test here**

- [ ] **P11-SAFE-02** S-E19 Report & block sheet, S-E20 Report sent, S-E21 Report update · P3-SAFE-01 · — · M
- [ ] **P11-SAFE-03** S-X10 Suspended/paused/banned gate + S-X10a Appeal · P3-SAFE-01 · — · M
- [ ] **P11-SAFE-04** S-F13 Blocked accounts · P3-SAFE-01 · — · S
- [ ] **P11-SAFE-05** S-F19 Safety center + S-X27 Banned items (expanded list) + S-X28 Help (bundled FAQ JSON) · P2 · — · M
- [ ] **P11-ACC-01** S-F16 Delete account (type DELETE) · P4-DEL-01 · end-to-end delete works · S
- [ ] **P11-ACC-02** Edge Function `export-data` + S-F17 Download your data · P3 · the JSON link arrives by email · M
- [ ] **P11-SET-01** S-F01 Profile, S-F02 Edit profile, S-F03 My listings (+X37), S-F04 Listing stats, S-F06 Edit listing (price-drop trigger), S-F08 Relist · P6 · — · L
- [ ] **P11-SET-02** S-F10 Settings, S-F12 Privacy settings (analytics/crash toggles), S-F14 Appearance (theme + alternate icons), S-F15 Change school, S-F18 About (licenses generation) · P9-NOTIF-02 · — · L
- [ ] **P11-STATE-01** Global states: OfflineBanner wiring, X11 Update required, X12 Maintenance, X14 Under review, X30/X31 deep-link errors, X25 Share listing · P4-AUTH-03 · toggling `app_config` values shows X11/X12 · M
- [ ] **P11-STATE-02** Deep links: `lib/deeplinks.ts`, universal links (AASA) and App Links (assetlinks) with `EXPO_PUBLIC_SITE_URL` · P13-WEB-01 · tapping `https://…/l/{id}` in Notes opens the app on both OSes · M
- [ ] **P11-A11Y-01** Accessibility pass: labels, roles, font scale 200% (X32), VoiceOver list mode for the deck (X33), focus order, reduce motion · all P4–P11 screens · T-QA-A11Y checklist passes · L
- [ ] **P11-BETA-01** First production-profile build → Play **closed testing** track with the testers group. **The 14-day clock starts.** · P11 features · 12+ testers opted in on the Play Console · S

## P12 · Admin panel (G)

- [ ] **P12-ADM-01** Scaffold `apps/admin` (Vite + React + TanStack Router/Table + tokens CSS) and deploy it to Pages `onlyswap-admin` · P2-TOK-01 · a preview URL loads · M
- [ ] **P12-ADM-02** G-LOGIN: email OTP + TOTP enroll/challenge + `requireAdmin` guard + 8 h session · ADM-01, P3-AUTH-01 · a non-admin is blocked; AAL1 is prompted for MFA · M
- [ ] **P12-ADM-03** Admin RPCs (backend §4 admin list) with audit writes · P3-DB-08 · pgTAP: a moderator can't ban or reveal · L
- [ ] **P12-ADM-04** G-OVER Overview + G-METRICS Metrics (views + charts, with a tiny local chart component, no paid libs) · ADM-03 · — · L
- [ ] **P12-ADM-05** G-REPORTS Reports queue + detail + actions; G-APPEALS · ADM-03 · — · L
- [ ] **P12-ADM-06** G-USERS, G-USER detail · ADM-03 · — · M
- [ ] **P12-ADM-07** G-LIST Listings, G-QUAD (held queue, reveal with re-MFA), G-CHATS (report-gated reading) · ADM-03 · every action logged · L
- [ ] **P12-ADM-08** G-CAMPUS setup (domains, safe spots with a MapLibre web map, dials, pause), G-ANNOUNCE, G-WORDS, G-TEAM, G-FLAGS, G-AUDIT (CSV) · ADM-03 · — · L

## P13 · Web surfaces (W)

- [ ] **P13-WEB-01** Expo web static export config, Pages project `onlyswap-web`, `_redirects`, `.well-known` AASA + assetlinks (with the SHA-256 from the Play App Signing key) · P1-SETUP-04 · the AASA validator passes; the Android `adb shell pm get-app-links` shows verified · M
- [ ] **P13-WEB-02** W-LAND landing (desktop + phone), campus progress, store badges · WEB-01 · Lighthouse ≥ 90 performance and accessibility · L
- [ ] **P13-WEB-03** Legal template + W-PRIV, W-TERMS, W-RULES, W-BANNED, W-SAFETY, W-COOKIES, W-CHILD (final legal text written by you; layouts from the design) · WEB-01 · all URLs live · M
- [ ] **P13-WEB-04** W-HELP support page + `support-request` function + Turnstile · WEB-03 · the form emails you · M
- [ ] **P13-WEB-05** W-DELETE web deletion (OTP login + confirm) · P4-DEL-01 · deletes a test account · M
- [ ] **P13-WEB-06** Pages Functions `/l/[id]` (OG), `/m/[token]` (W-MEET), `/i/[code]` (W-INVITE) · P5-SELL-05, P8-MEET-01 · the iMessage preview shows the card; an expired meetup token shows expiry · M
- [ ] **P13-WEB-07** W-LOGIN, W-BROWSE, W-LISTING, W-INBOX, W-SELL (web app, reusing mobile features with web-specific layout wrappers) · P4–P8 · a web user can list and make an offer · L
- [ ] **P13-WEB-08** W-JOINED, W-404 · WEB-02 · — · S

## P14 · Hardening, monitoring, backups

- [ ] **P14-MON-01** Sentry: release and dist tagging per EAS build, source maps, alert rules (new issue, spike more than 20 in 1 h), functions instrumented with `@sentry/deno` · P1-LIB-02 · a test error alerts email · M
- [ ] **P14-MON-02** PostHog: the 22 events from plan H6, funnels and a dashboard; verify no PII · P1-LIB-02 · the event list in PostHog matches H6 · M
- [ ] **P14-MON-03** UptimeRobot monitors: `health` function, media Worker, web, admin, `/privacy`, `/delete` · P13 · alert email on downtime · S
- [ ] **P14-BAK-01** `backup.yml`: nightly `supabase db dump` (schema + data) → `age` encrypt → R2 `onlyswap-backups`; 30-day lifecycle · P3 · file present each morning · M
- [ ] **P14-BAK-02** Restore drill to a local Docker instance, documented in `docs/runbooks/restore.md` · BAK-01 · restored row counts match · M
- [ ] **P14-KEEP-01** `keepalive.yml` pings staging daily until launch (private repo, so not auto-disabled) · P3 · staging never pauses · S
- [ ] **P14-SEC-01** Security test suite (testing.md §5) run and fixed · P4–P13 · all T-SEC pass · L
- [ ] **P14-PERF-01** Performance pass (testing.md §6) · P6, P8 · targets met · M
- [ ] **P14-E2E-00** Staging-only E2E support: catch-all domain `e2e.onlyswap.test` on the test campus + `test-inbox` Edge Function returning the latest OTP for `e2e+*` addresses (never deployed to production; CI check) · P3-AUTH-03 · Maestro reads the codes · M
- [ ] **P14-E2E-01** Maestro flows (testing.md §3), run locally on both platforms · P4–P11 · all green · L
- [ ] **P14-E2E-02** Playwright web and admin suites incl. axe a11y · P12, P13 · green · M
- [ ] **P14-LEGAL-01** Write the Terms, Privacy, Community Rules, Child Safety and Cookies text (your legal review; free templates adapted, not copied); version `2026-09` · P13-WEB-03 · pages published; the in-app bundled markdown matches · M

## P15 · Beta

- [ ] **P15-BETA-01** TestFlight internal build, then external group (submit for Beta App Review with notes and demo login) · P14 · external testers can install · M
- [ ] **P15-BETA-02** Play closed testing continues (started at P11-BETA-01); track opt-ins daily · P11-BETA-01 · 14 consecutive days with 12+ testers · S
- [ ] **P15-BETA-03** Seed founding sellers at the launch campus (real students; you onboard 20–50 listings) · P15-BETA-01 · 30+ live listings before public launch · L
- [ ] **P15-BETA-04** Bug bash: fix everything P0 and P1 from beta feedback · BETA-01 · crash-free sessions > 99% in Sentry for 7 days · L
- [ ] **P15-BETA-05** Confirm the real safe-exchange spots with campus police and update `safe_spots` in production · — · spots verified and dated in admin · M

## P16 · Store launch

- [ ] **P16-STORE-01** Export store assets from the design (`scripts/export-store-assets.ts`): iOS 6.9" ×5, Play phone ×5, feature graphic, icon 512, preview video (optional) · P15 · files meet the spec (testing.md §7) · M
- [ ] **P16-STORE-02** App Store Connect: app record, name/subtitle/keywords (no trademarks), description, support/privacy URLs, category Shopping/Social, Privacy Nutrition Label (plan §19), age rating questionnaire → **override 18+**, US-only availability, DSA "not a trader", export compliance, App Review notes + demo login · STORE-01 · all sections green · M
- [ ] **P16-STORE-03** Play Console: store listing (title ≤ 30), Data safety (plan §19 table), Target audience 18+ + Restrict minor access, content rating IARC, ads No, App access credentials, financial features none, health none, government no, news no, child safety standards URL + contact, account deletion URL, countries US · STORE-01 · the Policy status page shows no issues · M
- [ ] **P16-STORE-04** Production builds (`eas build -p all --profile production`), `eas submit` to both · STORE-02/03 · builds processed · S
- [ ] **P16-STORE-05** Apply for Play production access (after 14 days) · P15-BETA-02 · approved · S
- [ ] **P16-STORE-06** Submit iOS for review; answer any rejection within 24 h using the launch.md rejection playbook · STORE-04 · approved · M
- [ ] **P16-STORE-07** Phased release (iOS 7-day phased; Play staged rollout 20% → 50% → 100%) · STORE-05/06 · 100% live · S

## P17 · Post-launch ops and features

- [ ] **P17-OPS-01** Weekly and monthly routines from launch.md §5, set as calendar reminders · P16 · — · S
- [ ] **P17-OPS-02** Remove `keepalive.yml` (real traffic now) · P16 · — · S
- [ ] **P17-OPS-03** Free-tier usage dashboard: a monthly check script `scripts/usage-report.ts` (Supabase DB size, egress via the management API, R2 usage, Workers requests, EAS builds, PostHog events) · P16 · report emailed monthly · M
- [ ] **P17-FEAT-01** Home screen widgets + Live Activity (`expo-widgets`), shipped only in the release that enables them · P16 · Apple rules checked (launch.md §4) · L
- [ ] **P17-FEAT-02** iPad layout (N5/N6), then `supportsTablet=true` and 13" iPad screenshots · P16 · — · L
- [ ] **P17-FEAT-03** Spanish (`es.ts`, screenshots per locale) · P16 · — · L
- [ ] **P17-FEAT-04** Second campus: add domains, spots and a waitlist in admin (no code) · P16 · — · S

---

**Task count: 198.** P0 14 · P1 15 · P2 18 · P3 17 · P4 17 · P5 11 · P6 13 · P7 6 · P8 12 · P9 9 · P10 7 · P11 12 · P12 8 · P13 8 · P14 12 · P15 5 · P16 7 · P17 7. Recount with `grep -c '^- \[ \]' tasks.md`.
