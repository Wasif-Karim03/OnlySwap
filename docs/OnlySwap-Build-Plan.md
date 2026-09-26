> **Status (2026-09-25 spec freeze):** this research plan is still valid for the stack, free-tier limits and store research. **Scope, schema, API and tasks are superseded** by `docs/PRD.md`, `docs/DATA_MODEL.md`, `docs/API.md` and `docs/TASKS.md`. Differences are listed in `docs/REVIEW.md` §14 and `docs/DECISIONS_LOG.md`.

# OnlySwap: Build and Launch Plan (iOS + Android, $0 infra)

Researched and verified September 25, 2026. Sources are linked inline and collected at the end. Free tiers change often, so re-check the pricing pages once per quarter.

**Assumptions**

- You develop on a Mac.
- Ohio State is the launch campus.
- The app ships as "OnlySwap" to iPhone and Android phones, with no iPad build at launch.
- The design source of truth is `OS_FInal Design.html` (204 frames).
- Anything the design leaves open is decided below and marked **Assumption**.

---

## Summary

OnlySwap is built as a single **Expo SDK 57** app (React Native 0.86, React 19.2, TypeScript) using **Expo Router**. One codebase produces the iOS app, the Android app, and the student web app.

- **Look and feel.** Every interaction comes from **Reanimated** and **Gesture Handler**: the swipe deck, sheets and micro-interactions from the Motion section are hand-built rather than taken from a UI kit. **Unistyles 3** carries the design board's tokens and eight skins.
- **Data.** Server data goes through **TanStack Query**, and local UI state through **Zustand + MMKV**.
- **Backend.** One **Supabase Free** project provides Postgres with row-level security, email OTP auth with hooks, Realtime for chat, Edge Functions, and `pg_cron` for timers.
- **Photos.** Photos live in **Cloudflare R2** (10 GB free, zero egress). They are served through a free **Cloudflare Worker**.
- **Web.** The landing site, web app, legal and support pages, share pages and the admin panel are static sites on **Cloudflare Pages**.
- **Push and email.** Push goes through **Expo's free push service** (APNs + FCM v1). Auth emails go through Supabase custom SMTP on a free Gmail account.
- **Crashes and analytics.** Crashes go to **Sentry Developer**, product analytics to **PostHog Free**.
- **Builds.** Builds come from **EAS Free** (15 iOS + 15 Android a month) with unlimited `eas build --local` as a fallback. CI runs on **GitHub Actions**.
- **Cost.** Running cost is **$0/month**. The only unavoidable extra is Google Play's **one-time $25**. One optional **$10.46/yr domain** is strongly recommended because it removes the two weakest links: sending email from Gmail and the Worker's daily image cap.

---

## 1. Tech stack decision

| Layer | Pick | Version (Sep 2026) | Why this one |
|---|---|---|---|
| Framework | Expo (managed, dev builds + prebuild) | SDK 57 / RN 0.86 / React 19.2 | One codebase for iOS, Android and web. Free EAS, OTA updates and Expo modules for push, images and age range. |
| Language | TypeScript (strict) | — | Types are generated from the Supabase schema, so there is one source of truth. |
| Navigation | Expo Router | 57.x | File-based routes that double as deep links. Native stacks give real iOS and Android transitions. Web export is included. |
| Server state | @tanstack/react-query | 5.103 | Caching, optimistic offers and saves, and infinite feed pages. |
| Client state | zustand + react-native-mmkv | 5.0.15 / 4.3.2 | Tiny and fast. MMKV persists drafts, the chosen theme and seen-card IDs. |
| Styling / theming | react-native-unistyles | 3.3.0 | Theme objects map one-to-one to the board's CSS variables (`--bg`, `--acc`…), and the 8 skins switch without re-renders. |
| Animation | react-native-reanimated + gesture-handler | Use the SDK 57 pins (Reanimated 4.5.x, RNGH 2.32.x) via `npx expo install` | npm "latest" is ahead of the pins (Reanimated 4.7, RNGH 3.3), so don't bypass the pins. |
| Lists | @shopify/flash-list | 2.x (SDK pin) | Inbox, results and the Quad at 60fps. |
| Images | expo-image | 57.x | Disk cache, blurhash placeholders and prefetching the next 3 swipe cards. |
| Maps | @maplibre/maplibre-react-native + OpenFreeMap tiles | 11.4.0 | Free, no API key, no billing account. Google Maps SDK would need a Cloud billing account. |
| Crash reporting | @sentry/react-native | SDK 57 pin (~7.11); npm latest is 8.28 | Maps JS stack traces through source maps on EAS builds. |
| Analytics | posthog-react-native | 4.78 | 1M events a month free, and it stops at the cap instead of billing. |
| Age signals | expo-age-range (official) | 57.x | Wraps Apple's Declared Age Range and Google Play Age Signals. See §8 and the decisions list. |

**Close calls, decided:**

- **Expo vs Flutter.** Picked Expo. Flutter matches it on feel, but Expo lets the web app, admin tooling, Supabase types and your existing JS knowledge share one language. EAS also gives free cloud iOS builds.
- **Unistyles vs NativeWind.** Picked Unistyles. NativeWind pushes you toward Tailwind defaults, which is a big part of why apps look AI-generated. Your design is a custom token system, and Unistyles is a direct match for it.
- **Swipe deck library vs hand-built.** Hand-built. About 200 lines of Reanimated gives you the exact physics from the Motion section: rotation on drag, spring return, the $ fly-out and undo. Libraries all feel the same.

**Why this stack avoids looking AI-made:**

- No component library. Every component is rebuilt from the Component states panel (H3).
- Real native navigation transitions.
- Haptics through `expo-haptics` on swipe thresholds and offer accept.
- Photography-first cards through expo-image.
- The copy from the Voice panel (H4) goes into a single `strings/en.ts`.

---

## 2. Backend and database

**Hosting.** One Supabase Free project for **prod** and one for **staging**. Free allows exactly 2 active projects. Daily development runs on the local Supabase stack in Docker, which is free.

| Supabase Free limit | Value | What breaks when we hit it |
|---|---|---|
| Database size | 500 MB | Writes fail at the limit. Messages are the growth risk, so auto-archive chats 90 days after they close. |
| Auth MAU | 50,000 | New sign-ins blocked. Not a concern before multi-campus. |
| Storage | 1 GB | Not used for photos (R2 holds them), so no issue. |
| Egress | 5 GB + 5 GB cached | API JSON only. About 10k MAU of normal use fits. |
| Edge Functions | 500k invocations/mo; 2s CPU, 150s wall, 256 MB | Push fan-out is batched to stay far below this. |
| Realtime | 200 concurrent connections, 2M msgs/mo, 100 msg/s | **The first real ceiling.** See the mitigation below. |
| Compute | Nano (shared CPU, 0.5 GB), 60 direct / 200 pooled connections | Heavy search could slow down, so add indexes (§5). |
| Logs | 1 day | Keep our own `audit_log` and `events` tables. |
| Backups | **None**, no PITR | We run our own nightly dump (§8). |
| Pausing | Paused after 7 days of low activity. You get a warning email and can restore within 1 year. | Only matters before launch. A GitHub Actions cron pings staging daily. |

**Database design.** Everything is scoped by `campus_id`. Tables:

- **Accounts and campuses:** `campuses`, `campus_domains`, `profiles`, `waitlist`
- **Listings:** `listings`, `listing_photos`, `swipes`, `saves`, `saved_searches`
- **Deals:** `offers`, `chats`, `messages`, `meetups`, `safe_spots`, `ratings`
- **Safety:** `reports`, `blocks`, `appeals`, `strikes`, `banned_words`
- **Quad:** `quad_posts`, `quad_replies`, `quad_votes`, `quad_polls`, `quad_mutes`
- **Notifications:** `notifications`, `notification_prefs`, `push_tokens`
- **Admin and ops:** `announcements`, `admins`, `audit_log`, `rate_counters`, `review_accounts`

**Row-level security.**

- RLS is on for every table.
- A **Custom Access Token hook** (free) writes `campus_id`, `status` (active/waitlist/paused) and `role` into the JWT. Policies read `auth.jwt()->>'campus_id'`, so no joins are needed.
- Clients can **never** write state columns directly. Every state change is a `security definer` Postgres function (RPC) that checks rules and rate limits. Examples: `make_offer`, `accept_offer`, `counter_offer`, `withdraw_offer`, `mark_sold`, `check_in_meetup`, `create_quad_post`, `reveal_author` (admin only, and always writes to `audit_log`).
- Blocks are enforced inside policies: blocked users disappear from the feed, offers and chat.
- Admin policies require `role in ('owner','moderator')` **and** `auth.jwt()->>'aal' = 'aal2'`, which means TOTP MFA was passed.

**Timers.** `pg_cron` handles:

- Expiring offers after 48h
- Meetup reminders
- "Did it sell?" prompts
- Re-verification
- Stale-listing nudges
- Rating reveal after 7 days
- The notification send queue

`pg_net` calls Edge Functions from the database.

**Realtime.**

- Chat uses **Broadcast from Database**: a trigger on `messages` calls `realtime.broadcast_changes()` to a private channel `chat:{id}`, and Realtime Authorization policies restrict it to the two participants.
- **Mitigation for the 200-connection cap:** the app opens a Realtime socket only while a chat or the Inbox is on screen. Everything else uses push notifications plus TanStack Query refetch on focus.

---

## 3. Auth

**Sign-up and login flow** (screens A1–A10, A4):

1. The school email screen checks the domain live against `campus_domains` through a public RPC, then shows the school name.
2. `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`. The email template prints `{{ .Token }}`, a 6-digit code, and the subject line leads with the code for iOS autofill.
3. The **Before User Created hook** (free) does one of three things:
   - rejects domains that aren't on any campus list, so the app shows **School not found**;
   - creates `waitlist` status if the campus isn't live yet;
   - blocks alumni/staff forwarding domains.
4. `verifyOtp({ email, token, type: 'email' })` returns the session, stored in SecureStore/MMKV (encrypted).
5. Then the profile screen, community rules (acceptance is saved in `profiles.rules_accepted_at`, which Google requires), and the notifications ask.

**Supabase auth limits.** 30 OTP requests per 5 minutes per IP, resend once every 60s, and a default of 30 emails an hour with custom SMTP. **Raise that to 200/hour** under Auth → Rate Limits before campus unlock day.

**Re-verification.** `verified_until` is set to one year out. pg_cron sends the reminder email at T-14 days. On expiry, the status flips to `reverify` and the app shows the re-verify screen, which runs the same OTP flow.

**Demo accounts for reviewers.** Apple and Google both require a login that doesn't expire. Google explicitly says to give credentials that bypass one-time codes.

- Seed a campus called "**Demo University**" with domain `review.onlyswap.test`. It has 40 listings and 3 scripted users.
- `review_accounts` holds two emails. When one of them is typed on the email screen, the app shows a **password field** and uses `signInWithPassword`. No OTP is sent.
- A scripted seller auto-accepts offers after 10 seconds, using a pg_cron job limited to Demo University. That lets reviewers reach chat, the meetup card and ratings.
- Put both accounts and the steps in App Review Notes and the Play "App access" section.

---

## 4. File and image storage

**Where photos live.** An R2 bucket `onlyswap-media`, with keys like `c/{campus}/l/{listing}/{photo}_{w}.webp`.

| Cloudflare free limit | Value |
|---|---|
| R2 storage | 10 GB-month |
| R2 Class A (writes) | 1M/month |
| R2 Class B (reads) | 10M/month |
| R2 egress | $0 |
| Workers | 100,000 requests/day, 10 ms CPU, 5 cron triggers |
| r2.dev URLs | Rate limited, "development only", so **not used in production** |

**Upload pipeline** (client-side, free):

1. Pick photos with `expo-image-picker`. It uses the system Photo Picker, so Android needs no broad media permission.
2. Resize and re-encode with `expo-image-manipulator` into two sizes: 1080 px long edge at ~0.72 quality (~150–220 KB) and 400 px thumbnails (~25 KB). Re-encoding **strips EXIF, including GPS location**, which is a privacy must.
3. The app asks the Edge Function `upload-url` for presigned R2 PUT URLs. The function checks auth, the listing owner, a maximum of 8 photos and a 2 MB cap, then signs with `aws4fetch`.
4. The app PUTs directly to R2, so no bytes go through Supabase.
5. The app writes the `listing_photos` rows.

**Serving.** A Worker `media` on `media.<you>.workers.dev` reads from the R2 binding and returns `Cache-Control: public, max-age=31536000, immutable`. expo-image caches on disk, so repeat views cost nothing.

**Where the free path ends.** 100k Worker requests a day is roughly 1,000 daily active users swiping about 100 cards each. **Fix:** a custom domain on R2 serves straight from Cloudflare's cache and doesn't count against Worker requests. That's the $10.46/yr domain (§14).

**Storage math.** About 200 KB per listing photo set times 3 photos is ~0.6 MB per listing. 10 GB holds about 16,000 listings. Sold listings older than 180 days drop to the thumbnail only.

**Note:** Cloudflare asks you to complete the R2 checkout, which is likely where a card is added. Nothing is charged within the free tier. Turn on billing notifications at $1.

---

## 5. Feature-by-feature implementation

**Client** means the Expo app. **Server** means Postgres functions, triggers, cron jobs and Edge Functions.

| Feature (board section) | Client | Server | Tricky parts |
|---|---|---|---|
| Launch animation, transitions (M) | Reanimated splash handoff via `expo-splash-screen` hide after the first frame; Router native stack | — | Keep the splash under 700ms; preload fonts and the theme first. |
| Theme / skins (S, F Appearance) | Unistyles themes built from `packages/tokens` | `profiles.theme` | Generate tokens from the board's CSS so they never drift. |
| Swipe deck + first-swipe tip + undo (B1–B4) | Custom Reanimated deck, 3-card prefetch, haptics, 5s undo toast | `get_feed(campus, cursor)` RPC ranks by recency × saves × distance-to-seller's-spot, excluding swiped and blocked | Batch swipe writes every 10 cards; a left swipe is a soft hide that can be undone. |
| Listing, own listing, on hold, options, report listing (B) | Sheets built with Reanimated bottom-sheet primitives | `listings.status` (active/hold/sold), `report_listing` RPC | The owner view is decided by the client comparing `seller_id`; RLS still gates edits. |
| Search, suggestions, results, filters, saved searches (B) | Debounced input, suggestion list | `tsvector` column + GIN index; `pg_trgm` for typo suggestions; `saved_searches` matched by an `after insert` trigger on listings | The trigger only queues a `notifications` row; sending is async. |
| Sell flow, drafts, errors, give-away (D) | 3-step form, MMKV draft, all errors at once | `create_listing` RPC: banned words, price ≤ $2,000, rate limit 20/day, 3/day in the first 24h | Banned-word check runs on the server too; the client check is only for UX. |
| Price hint | — | View `price_hints` (percentiles of sold items in the same category and campus) | Hidden until there are 5 or more comparables. |
| Offers: make, sent, incoming, counter, decline, expire, withdraw, limit, history (B/E/F) | Offer sheet with quick chips | State machine in RPCs; the `offers` status enum is the only writer; limit of 10 per hour via `rate_counters`; pg_cron expires after 48h | Seller-accept-before-chat: `accept_offer` creates the `chats` row atomically and auto-declines the others with a polite note. |
| Chat, photos in chat, blocked chat (E) | FlashList inverted, Realtime Broadcast only while open, blur photos from people you haven't chatted with before | `messages` + broadcast trigger; photo upload through the same presign function under the `chat/` prefix | No content scanning (design decision). Reported chats become readable to admins through an audited RPC. |
| Meetup: plan, map, safe spots, I'm here, running late, reschedule, no-show, share with friend (E) | MapLibre + OpenFreeMap; "Directions" deep-links to Apple/Google Maps; share uses the native share sheet with a 24h tokenized link | `meetups` RPCs; `safe_spots` per campus; no-show count → offer pause after 2 | Location is used only while picking a spot and never stored. The share-with-friend link page is served from Pages. |
| Did it sell, mark sold, pick buyer, relist (E/F) | Sheets | pg_cron 2h after meetup → notification; `mark_sold(buyer_id)` | Sold-in-app tracking feeds the metrics. |
| Ratings + double-blind reveal (E) | Rating sheet | View shows a rating only when both sides submitted or 7 days have passed | Enforced in the view, never in the client. |
| Profiles, new seller, reviews (B/F) | — | `profile_stats` materialized view refreshed every 10 minutes | — |
| Campus tab, free food, Wanted, day one, founding sellers (C) | — | `listing.kind` enum (sale/free/wanted/food); food posts expire after 3h; founding = first 50 sellers, badge for 14 days | Free food uses campus-wide push, capped at 3 per day per campus. |
| Waitlist, campus unlock (A) | Progress bar, invite link | `waitlist` count trigger at 500 → `campuses.live = true` → queue "campus open" emails and pushes | 500 emails on one day equals the Gmail cap exactly, so send in 2 waves or use the domain path. |
| Quad: feed, posts, replies, votes, polls, photo, check-in, mute, your Quad, activity (Q) | FlashList with sort tabs | `author_id` is stored but **never selectable**. The public view shows a per-thread alias `hash(author_id, post_id, server_secret)`. Score trigger auto-hides at −5; banned words block or send to review | Keep anonymity server-side only. Reveals require the `owner` role + AAL2 and write to `audit_log`. No DMs from the Quad (Apple 1.2). |
| Reports, blocks, appeals, suspended, report status (E/Q/X) | Sheets and status screens | `reports` with category, auto-escalation rules, `appeals` (one per decision), `strikes` | Report updates push to the reporter without revealing the outcome details. |
| Notifications list, prefs (F/X) | In-app Activity list from `notifications` | Per-type prefs; see §6 | — |
| Settings, edit profile, blocked, appearance, change school, delete account, download data, about (F) | Screens | `delete_account` Edge Function; `export_data` Edge Function writes JSON to R2 with a 7-day signed link and emails it | Deletion must cascade and remove R2 objects. |
| Offline, loading, maintenance, update required, deep-link errors (X) | NetInfo banner; `app_config` row read at launch sets `min_version` and `maintenance` | `app_config` table | Update-required compares `expo-application` versions. |
| Share listing + share image + link preview (W/X) | At listing creation, render the 1200×630 share card off-screen with `react-native-view-shot` and upload it to R2 | Pages Function `/l/[id]` returns HTML with OG tags, fetched from Supabase REST | No server image rendering, so no CPU limits to hit. |
| Home/lock widgets, Live Activity (X) — post-launch | `expo-widgets` (alpha) | Push-to-start needs iOS 17.2+ | Ship after v1; alpha API. |
| iPad, Spanish (N) — post-launch | `supportsTablet: false` at launch; all strings in `strings/*.ts` from day one | — | — |

---

## 6. Notifications

**Push.**

- `expo-notifications` registers the Expo push token, stored in `push_tokens` (per device).
- APNs key: generate it once with `eas credentials` (included with your Apple account).
- Android: a Firebase project (free), with FCM v1 service-account JSON uploaded to EAS.
- **Expo Push Service:** free, 600 notifications/second per project, 100 messages per request, no monthly quota.

**Sending pipeline.**

1. Triggers and cron jobs insert into `notifications`, with type, user and payload.
2. pg_cron runs every minute, `pg_net` POSTs to the `send-push` Edge Function.
3. The function batches 100 per request, respects user prefs, quiet hours (11 PM–8 AM except meetup types) and the cap of **6 non-urgent pushes a day**. It stores tickets, and a second cron checks receipts and deletes dead tokens.
4. iOS `interruptionLevel: time-sensitive` is used only for offers and meetups, matching the catalog in H5.
5. Android notification channels are Offers, Messages, Meetups, Alerts, Selling, Quad, Safety, Campus, Account.

**In-app.** The Activity list reads `notifications`. Badge counts come from `unread_count` RPC.

**Email.**

| Option | Free limit | Needs own domain? | Use |
|---|---|---|---|
| **Gmail SMTP** (new Google account, 2-Step Verification on, app password) | ~500 emails/day | No | **Plan A ($0).** Supabase custom SMTP: `smtp.gmail.com:465`. |
| Resend Free | 3,000/mo, 100/day | **Yes** | Plan B (with the $10.46 domain), clean HTTPS API |
| Brevo Free | 300/day | Effectively yes (a Gmail sender gets rewritten) | Not recommended |

**Auth emails in Plan A.** OTP and re-verify codes go through Supabase custom SMTP to Gmail.

**Other transactional emails in Plan A.** Campus open, paused, re-verify reminder, deleted and data export use the `send-email` Edge Function over SMTP **port 465**. Edge Functions block ports 25 and 587, and 465 is not on that list.

**Phase 1 spike:** confirm that port 465 works from an Edge Function. If it doesn't, move the sender to a Cloudflare Worker using TCP sockets.

**Plan A risks:**

- Google can lock a Gmail account that suddenly sends lots of automated mail.
- Gmail app passwords are "not recommended" by Google.

Keep volume low: codes are only sent at sign-up and at yearly re-verify, since sessions persist.

---

## 7. Admin tools

**App.** `apps/admin` is a Vite + React SPA (TanStack Table, the same tokens). It's deployed to Cloudflare Pages at `onlyswap-admin.pages.dev`. Pages Free gives 500 builds a month, and static requests plus bandwidth are unlimited.

**Access control.**

- Sign in uses Supabase auth with email OTP plus **TOTP MFA (free)**, enforced on the client and required by RLS through `aal2`.
- `admins` table roles:
  - **owner:** everything.
  - **moderator:** reports, appeals, removals, suspensions of 7 days or less, reading reported chats. Moderators **cannot** ban or reveal a Quad author.
- There is no service key in the browser. Every admin action is a `security definer` RPC that checks role and AAL2 and writes `audit_log`. The log is append-only: there's no update or delete policy, and a trigger rejects changes.
- Sessions time out after 8 hours through a JWT expiry setting.

**Screens (G section).** Overview, reports, users, user detail, listings, Quad, chats (metadata unless reported), campuses setup, safe spots, appeals, audit log, metrics (SQL views over events), team, announcements (1 a week enforced in the RPC), banned words (with fired and overturned counts).

---

## 8. Security and privacy

**Secrets.**

- The Supabase anon key and URL are public by design.
- The service-role key, R2 keys, Gmail app password, Expo access token and FCM JSON are stored only in Supabase Edge Function secrets, EAS environment variables (Secret visibility) and GitHub Actions secrets.
- `.env*` is git-ignored, and `gitleaks` runs in CI.

**Abuse and rate limits.**

- `rate_counters(user_id, action, window_start, count)` is checked in every RPC. Limits:
  - offers 10/hour
  - listings 20/day
  - Quad posts 10/hour
  - replies 60/hour
  - messages 60/min
  - reports 20/day
- New accounts get tighter limits for their first 24h.
- Supabase auth rate limits cover OTP spam. The web waitlist and support forms use **Cloudflare Turnstile** (free, unlimited challenges, 20 widgets).
- Banned words use a `banned_words` table (block/review) checked in the listing, Quad and profile RPCs.
- Quad score auto-hide happens at −5.
- 2 no-shows pause offers.
- Photos from new contacts are blurred until tapped.

**Store-required safety (Apple 1.2 / Google UGC).**

- Terms are accepted before posting.
- Report and block are available everywhere.
- A published contact is shown on Support and About.
- Moderation response is tracked (report SLA shown in admin).
- There is **no anonymous chat**.

**Account deletion.**

- The in-app path is Settings → Delete account.
- The web path is `onlyswap.pages.dev/delete` (OTP sign-in → confirm). Google requires this.
- The `delete_account` Edge Function deletes the auth user, which cascades through the tables. It also deletes the user's R2 prefix, anonymizes ratings they gave, keeps reports for 180 days (as the Privacy page states), and sends the confirmation email.

**Data export.** Settings → Download your data runs an Edge Function that writes JSON to R2 and emails a 7-day link.

**Backups** (self-built, $0). A GitHub Actions cron job runs nightly at 03:00 UTC:

1. `supabase db dump --data-only` plus the schema dump
2. encrypt with `age`
3. upload to a private R2 `onlyswap-backups` bucket, with a lifecycle rule to delete after 30 days

A restore drill runs once per phase milestone.

**Age compliance.** Texas SB 2420 has been in effect since June 4, 2026, with Utah and Louisiana in 2026 as well. Apple expects developers to use the Declared Age Range API, and Google provides Play Age Signals. **Recommended:** call `expo-age-range` once after the email is verified. It asks the OS rather than showing a DOB screen, so it keeps your "no birthday step" design. This is decision #2.

**Privacy.**

- Location is approximate, used only while picking a spot, and never stored.
- EXIF is stripped from photos.
- There's no ad SDK and no tracking, so no ATT prompt.
- PostHog runs with `person_profiles: 'identified_only'` and without message text.
- Sentry has `sendDefaultPii: false`.

---

## 9. Dev environment

| Install | Why |
|---|---|
| macOS + **Xcode 26.4+** (App Store) | Required for SDK 57. App Store uploads must use Xcode 26 / iOS 26 SDK since Apr 28, 2026. |
| Android Studio (latest) + JDK it bundles; SDK 36 | targetSdk 36 is required on Play from Aug 31, 2026 (SDK 57 already targets 36). |
| Node **24 LTS**, `pnpm`, watchman (`brew install watchman`) | JS toolchain |
| `npm i -g eas-cli` · `brew install supabase/tap/supabase` · Docker Desktop (free for personal use) | Builds, the local Supabase stack |
| `npm i -g wrangler` | Cloudflare Workers and Pages |
| Maestro CLI (`curl -fsSL "https://get.maestro.mobile.dev" \| bash`) | E2E tests |

**Mac vs not.** iOS builds (local), the simulator and device installs need the Mac. Android and web work anywhere. EAS cloud builds iOS without a Mac, but you still need the Mac for Xcode-only work like widgets.

**Real devices, free.**

- Expo Go can't load our native modules (MapLibre, MMKV, age-range), so use a **development build**.
- iPhone: `npx expo run:ios --device` over USB, or `eas build --profile development --platform ios` and install through the internal distribution link (register the device UDID with `eas device:create`).
- Android: enable USB debugging, then `npx expo run:android`.

---

## 10. Builds and CI/CD

| Service | Free limit | Our use |
|---|---|---|
| EAS Build Free | 15 iOS + 15 Android builds/mo, low-priority queue (90+ min waits possible), 45-min timeout, 1 concurrent | Store and TestFlight builds, about 4–8 a month |
| `eas build --local` | Runs on your Mac; no EAS worker used (quota impact not stated by Expo, treat as unlimited) | Fallback when the queue is slow or the quota is spent |
| EAS Submit | Included | `eas submit -p ios` / `-p android` |
| EAS Update Free | 1,000 MAU, 100 GiB bandwidth, no overage | OTA JS fixes up to about 1k MAU (see §18) |
| GitHub Actions (private repo) | 2,000 min/mo; Linux cheapest (macOS burns about 10×) | Lint, typecheck, unit tests, RLS tests, backups; **Linux runners only** |
| Cloudflare Pages | 500 builds/mo | Web app, admin, legal pages |

**Pipeline.**

- **PR → `ci.yml`:** `pnpm lint && pnpm typecheck && pnpm test`, plus `supabase test db` (pgTAP RLS tests) on Linux. Budget about 4 minutes a run.
- **Merge to `main`:**
  - Pages auto-deploys web and admin.
  - `supabase db push` runs to **staging**.
  - `eas update --channel preview` goes out.
- **Tag `v1.x.y`:**
  - Promote migrations to prod.
  - Run `eas build --profile production --platform all` (manual `workflow_dispatch` so quota isn't wasted).
  - Then `eas submit`.

**Versioning.**

- `appVersion` uses semver in `app.config.ts`.
- `"appVersionSource": "remote"` plus `autoIncrement: true` for the iOS buildNumber and Android versionCode.
- `runtimeVersion: { policy: "fingerprint" }`, so OTA updates only reach compatible binaries.

---

## 11. Testing

| Level | Tool (free) | What |
|---|---|---|
| Unit | Jest (`jest-expo`) + React Native Testing Library | Offer state UI, formatters, validation, rate-limit messages |
| DB / security | pgTAP through `supabase test db` | **Every RLS policy and RPC.** Campus isolation, block rules, Quad author never selectable, admin AAL2. This is the most important test suite. |
| Integration | Jest against local Supabase (Docker) | Sign-up hooks, offer → chat → meetup → sold flow |
| E2E mobile | Maestro CLI (Apache-2.0; Cloud is $250/device, not used) | 8 flows: sign-up, swipe + offer, accept + chat, meetup check-in, sell listing, Quad post + report, delete account, reviewer login |
| E2E web / admin | Playwright | Admin moderation, web delete-account, waitlist form |

**Beta distribution.**

- **TestFlight:** 100 internal and 10,000 external testers. Builds last 90 days. The first external build needs Beta App Review.
- **Play internal testing:** up to 100 testers, instant.
- **Play closed testing** is **mandatory** for your personal account. You need **12 testers opted in for 14 consecutive days** before you can apply for production, and that review takes about 7 days.
- **Start this in Phase 11,** not at the end. Recruit 15–20 Ohio State friends so an opt-out doesn't reset the clock.

---

## 12. Monitoring

| Need | Service | Free limit | Beyond it |
|---|---|---|---|
| Crashes + JS errors | Sentry Developer | 5k errors, 5M spans, 50 replays, 30-day retention, **1 user** | Sample `tracesSampleRate: 0.05`; drop noisy network errors |
| Product analytics | PostHog Free | 1M events/mo, 5k recordings, 1-year retention; stops at the cap (no bill) | Track only the 22 events in H6; no autocapture |
| Backend logs | Supabase | 1-day retention | Important events go to our `audit_log` and `events` tables |
| Uptime | UptimeRobot Free | 50 monitors, 5-min interval, commercial use allowed | Monitors the API health RPC, the media Worker, the web and admin |
| Business metrics | Admin Metrics page | Our own SQL views | Funnel, retention, liquidity warnings (G12) |

Firebase Crashlytics is also free and unlimited. It's kept as a fallback if Sentry's 5k errors a month ever becomes tight.

---

## 13. Store launch

**Both stores need:**

- Privacy Policy URL and Support URL: `onlyswap.pages.dev/privacy` and `/help`, free on Pages.
- Account deletion URL: `/delete`.
- Screenshots: already designed (T section).
- Reviewer accounts (§3).
- Contact email.

**App Store Connect checklist:**

1. Create the app with bundle ID `app.onlyswap` (Assumption), primary category Shopping, secondary Social Networking.
2. Screenshots: **6.9" 1320×2868**, 3–5 from T1. iPad isn't needed while `supportsTablet: false`. Optional app preview video (T11 storyboard): 15–30s, 886×1920, 30fps.
3. **Privacy nutrition label** from H7:
   - No tracking.
   - Contact info (email, name) linked.
   - User content linked.
   - Coarse location not linked.
   - Usage data and diagnostics.
4. **Age rating:** the new questionnaire (13+/16+/18+ since Jul 2025). User content plus the Quad "social media" feed means **at least 13+**. Recommended: **18+** (decision #2).
5. Privacy manifest: Expo modules ship their manifests. Run `npx expo prebuild` and confirm `PrivacyInfo.xcprivacy` lists the required-reason APIs from MMKV and Sentry.
6. **App Review Notes** should say:
   - demo login plus password;
   - "Quad is an anonymous-to-peers community board for verified students; no anonymous messaging; every post is tied to a verified account; report/block/filter on every post; moderation within 24h";
   - "physical goods between students, cash in person, no digital goods, so no IAP (3.1.3(e))".
7. Sign in with Apple is **not required**, because we use our own email login (4.8 exemption).

**Google Play Console checklist:**

1. Register ($25 one-time, no prepaid cards), verify government ID, phone and email, and prove a real Android device through the Play Console app. **Do this in week 1.**
2. Icon 512×512 PNG (≤1 MB), feature graphic **1024×500** (T section), 4+ phone screenshots at 1080×1920+ (T Play set).
3. Data safety form (mirror H7), plus data deletion answers and the web deletion URL.
4. Content rating (IARC) questionnaire.
5. UGC declarations: terms acceptance before posting, reporting, blocking, moderation.
6. Permissions: `ACCESS_COARSE_LOCATION` only, no media permissions (Photo Picker), `POST_NOTIFICATIONS`.
7. Target API 36.
8. Tracks: internal → closed (12 testers × 14 days) → apply for production → production.

**Common rejection risks for this app and how we avoid them:**

| Risk | Avoidance |
|---|---|
| Apple 1.2: "anonymous chat" | No anonymous DMs; Quad is a moderated board; clear notes; the Quad is behind a remote flag (`app_config.quad_enabled`) so a rejection doesn't block the marketplace |
| 2.1: can't log in (school email) | Password demo accounts plus a seeded Demo University |
| 4.2: thin app / empty content | The demo campus is seeded and scripted to respond |
| 5.1.1(v) / Play: account deletion | In-app plus web deletion, tested in Maestro |
| 5.1.2 / Data safety mismatch | Labels generated from one table (H7) that includes Sentry and PostHog |
| Permission strings vague | Copy from the X section ("only while picking a spot…") |
| Play: missing web deletion link or broad photo permission | `/delete` page; Photo Picker only |
| Broken privacy or support URLs | Pages deploy is checked by UptimeRobot |

---

## 14. Domain and email

**Plan A ($0).** No domain.

- Web on `onlyswap.pages.dev`, admin on `onlyswap-admin.pages.dev`, images on `media.<you>.workers.dev`.
- Universal Links / App Links work from pages.dev: host `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` there.
- Email is `onlyswap.app@gmail.com` (or similar) through Gmail SMTP. Support mail goes to the same inbox.

**Plan B (+$10.46/yr, recommended).** `onlyswap.com` at Cloudflare Registrar (at cost; `.app` is about $14.20/yr).

- Resend Free (3,000/mo) with SPF, DKIM and DMARC, so emails to .edu inboxes land reliably.
- R2 custom domain `img.onlyswap.com`, which removes the 100k/day Worker cap.
- Professional support address through **Cloudflare Email Routing** (free inbound forwarding to your Gmail).
- The same Pages sites on your domain.

Note the design shows `onlyswap.app` in copy. Update the strings to whichever domain you pick.

---

## 15. Repo structure

```
onlyswap/
├─ apps/
│  ├─ mobile/                # Expo SDK 57 app: iOS, Android, student web
│  │  ├─ app/                # Expo Router routes: (auth)/ (tabs)/discover|quad|sell|inbox|profile, listing/[id], chat/[id], …
│  │  ├─ src/components/     # Button, Input, Chip, Toggle, Sheet, SwipeCard… (from H3)
│  │  ├─ src/features/       # auth, feed, listings, offers, chat, meetups, quad, safety, settings
│  │  ├─ src/lib/            # supabase.ts, queryClient.ts, analytics.ts, sentry.ts, media.ts
│  │  ├─ src/strings/en.ts   # all copy (Voice guide H4)
│  │  ├─ .maestro/           # E2E flows
│  │  ├─ app.config.ts · eas.json
│  └─ admin/                 # Vite + React admin (Cloudflare Pages)
├─ workers/
│  ├─ media/                 # R2 image serving Worker
│  └─ web-edge/              # Pages Functions: /l/[id] OG pages, share-with-friend links
├─ supabase/
│  ├─ migrations/            # SQL, one file per change
│  ├─ functions/             # send-push, send-email, upload-url, delete-account, export-data, auth hooks
│  ├─ tests/                 # pgTAP RLS tests
│  └─ seed.sql               # Demo University + Ohio State dev data
├─ packages/
│  ├─ tokens/                # tokens.json generated from the design board → Unistyles themes + admin CSS
│  └─ shared/                # generated DB types (supabase gen types), zod schemas, constants
├─ design/OS_FInal Design.html
├─ docs/                     # this plan, runbooks, CLAUDE.md
└─ .github/workflows/        # ci.yml, backup.yml, keepalive.yml, release.yml
```

**Environments.**

- `local`: Docker Supabase.
- `staging`: Supabase project #1 + EAS channel `preview` + Pages preview.
- `production`: Supabase project #2 + channel `production`.
- The app reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_MEDIA_URL` from EAS env per profile.

**Branching.** Trunk-based:

- `main` is always releasable.
- Short `feat/*` branches merge through PRs with CI.
- Tags `v*` cut store releases.
- Migrations are forward-only.

---

## 16. Phased roadmap (one Claude Code phase at a time)

**Timing.** Phase 0 starts the Google Play verification clock on day 1. The closed test starts in Phase 11 so the 14 days overlap with building.

| # | Phase | Deliverables | Done when |
|---|---|---|---|
| 0 | Accounts | Play Console ($25, ID + device verify), Supabase (2 projects), Cloudflare, Expo, GitHub (private), Sentry, PostHog, Firebase (FCM), Gmail sender; APNs key through EAS | All dashboards reachable; Play identity approved |
| 1 | Foundations | Monorepo, Expo app with Router tabs, Unistyles + tokens from the board (8 skins), fonts, CI green, dev build on your iPhone and Android; spike: Edge Function SMTP on 465 | App runs on both phones with skin switching; CI passes |
| 2 | Component kit | Every component in H3 with all states, sheet, toast, empty-state, skeleton loaders, haptics, screen transitions from M | A kitchen-sink screen matches H3 in all 8 skins |
| 3 | Data model + RLS | Migrations for core tables, auth hooks, RLS, pgTAP tests, seed | `supabase test db` passes: campus isolation, block rules |
| 4 | Auth + onboarding | A section: email, OTP, school not found, waitlist, profile, rules, notification ask, reviewer password path, age signal (if chosen) | New .edu user reaches Discover; waitlist and review paths work |
| 5 | Sell + media | D section, presigned R2 upload, media Worker, drafts, errors, share-card render | Listing with 3 photos appears; EXIF gone; <250 KB per photo |
| 6 | Discover + search | Swipe deck (M physics), listing detail/options, search + suggestions + filters, saves, saved searches | 60fps swipe on a mid Android; undo works |
| 7 | Offers | All offer RPCs + screens, 48h expiry cron, rate limit, offer history | State-machine tests pass; accept creates chat |
| 8 | Chat + meetups | Realtime chat, map + safe spots, I'm here/late/reschedule/no-show, share link, did-it-sell, ratings reveal | Two devices complete a full swap end-to-end |
| 9 | Notifications + email | Push pipeline, prefs, quiet hours, caps, Activity list, transactional emails | Every H5 notification fires once, correctly grouped |
| 10 | Quad | Q section, aliases, votes, polls, auto-hide, banned words, mute, remote kill switch | Author ID never leaves the DB (pgTAP) |
| 11 | Safety + account | Reports, blocks, appeals, suspended/paused, delete account (app + web), data export, settings/profile/X states; **start Play closed test** | Maestro "delete account" passes; 12+ testers opted in |
| 12 | Admin | G section on Pages with TOTP MFA, roles, audit log, metrics | Moderator can't reveal or ban; every action logged |
| 13 | Web | Landing, web browse/listing/inbox/sell, `/l/[id]` OG pages, legal, help, delete, 404, universal and app links | Links open the app on phones and the web page otherwise |
| 14 | Hardening | Sentry + PostHog events (H6), backups + restore drill, keep-alive, UptimeRobot, accessibility pass (large text, VoiceOver), Maestro suite | All 8 Maestro flows green; restore drill works |
| 15 | Beta | TestFlight external (Beta Review), Play closed test continues, fix list, seed Ohio State founding sellers | 14 days complete; crash-free sessions > 99% |
| 16 | Store launch | Listings, labels, ratings, notes, submit both; apply for Play production | Live in both stores |
| 17 | Post-launch | Widgets/Live Activity (expo-widgets), iPad, Spanish, keep-alive removal, ops runbook | Per feature |

For each phase, give Claude Code: this plan, `CLAUDE.md` (conventions), the relevant board section names, and the "done when" line as the acceptance test.

---

## 17. Cost table

"Launch" is about 300 Ohio State users. "1k" and "10k" are monthly active users.

| Service | Free-tier limit | Launch | ~1,000 users | ~10,000 users | Monthly cost |
|---|---|---|---|---|---|
| Apple Developer | — | paid | — | — | $99/yr (already paid) |
| Google Play | — | one-time | — | — | **$25 once (unavoidable)** |
| Supabase (×2) | 500 MB DB, 50k MAU, 5+5 GB egress, 500k fn, 200 realtime conn | ~20 MB, <10 conns | ~120 MB, ~30 peak conns | ~450 MB (with chat archiving), **~250 peak conns ⚠** | $0 |
| Cloudflare R2 | 10 GB, 1M A, 10M B ops | ~0.5 GB | ~2 GB | ~9 GB ⚠ (thumbnail-only for old sold) | $0 |
| Cloudflare Workers | 100k req/day | ~5k/day | ~40k/day | **~400k/day ✖ needs domain** | $0 |
| Cloudflare Pages | Unlimited static, 500 builds | ✔ | ✔ | ✔ | $0 |
| Turnstile | Unlimited, 20 widgets | ✔ | ✔ | ✔ | $0 |
| Expo Push | 600/s, no quota | ✔ | ✔ | ✔ | $0 |
| FCM / APNs | Free | ✔ | ✔ | ✔ | $0 |
| EAS Build | 15+15/mo, 45 min | ~6 | ~6 | ~6 | $0 |
| EAS Update | 1,000 MAU | ✔ | ⚠ at the limit | **✖ self-host** (§18) | $0 |
| GitHub Actions | 2,000 min | ~600 | ~800 | ~900 | $0 |
| Gmail SMTP | ~500/day | ~50/day | ~150/day, unlock-day spike ⚠ | **✖ move to Resend** (needs domain) | $0 |
| Sentry | 5k errors, 1 seat | ✔ | ✔ | ⚠ with sampling | $0 |
| PostHog | 1M events | ~40k | ~150k | ~900k ⚠ | $0 |
| UptimeRobot | 50 monitors | 5 | 5 | 5 | $0 |
| OpenFreeMap | No limits, no SLA | ✔ | ✔ | ✔ | $0 |
| Domain (optional) | — | — | recommended | **needed** | $10.46/yr |
| **Total running** | | | | | **$0/mo** (+ $10.46/yr if Plan B) |

---

## 18. Risks and exit plan

| Risk | Trigger | Cheap exit |
|---|---|---|
| Realtime 200-connection cap | ~8–10k MAU | Open sockets only in chat (built in). Next step: poll every 5s in chat and drop Realtime, or self-host Supabase Realtime (open source) on a free Oracle Cloud Always Free VM. |
| DB 500 MB | Message growth | Archive closed chats older than 90 days to R2 JSON; prune `swipes` older than 30 days; then Supabase Pro ($25/mo), the first paid step. |
| Supabase free changes or pause policy | Pricing change | Everything is plain Postgres plus open-source Supabase. `pg_dump` restores into self-hosted Supabase (Docker) on any free VM. Keep all logic in SQL migrations, not dashboard clicks. |
| Worker 100k/day | ~1k DAU | Add the domain (R2 custom domain = cached, uncapped). |
| EAS Update 1,000 MAU | ~1k MAU | Self-host the Expo Updates protocol (open spec) on R2 + a Worker, or ship fixes only through store builds (both stores review in ~1 day). |
| EAS build queue / quota | Busy months | `eas build --local` on your Mac. |
| Gmail locks the sender | Volume spike | Resend with the domain (1-hour switch: change SMTP settings in Supabase). |
| OpenFreeMap disappears (no SLA) | Tiles fail | The map is non-critical: fall back to the static safe-spot list (the "Location off" design) plus deep links to Apple/Google Maps. |
| Apple rejects the Quad (1.2) | Review | Remote flag turns off the Quad for iOS; ship the marketplace first, then appeal with moderation evidence. |
| Age laws expand | New states or rules | `expo-age-range` is already integrated; tighten gating by a remote config flag. |
| Lock-in | — | Standard pieces (Postgres, S3-compatible R2, Expo push over plain HTTP, static web). No vendor-specific SDK in business logic: `src/lib/*` wraps every service. |

---

## 19. Store compliance audit (added Sep 25, 2026)

I did a full read of the Apple App Review Guidelines (last updated June 8, 2026) and the Google Play Developer Program Policies, including the July 15, 2026 update enforced from Aug 26, 2026. Items marked **(design)** are already updated in `OS_FInal Design.html`. The rest are build and store-console tasks. Everything is summarized in the board's "H · Store compliance" panel.

**Must-do (would block approval):**

1. **The app is 18+.** This overrides the earlier "no age check" choice.
   - **Why.** Google now treats apps with anonymous communication as age-restricted and requires "Restrict minor access". That only works when the target audience is 18+ only. Texas SB2420 (in effect June 4, 2026), Utah and Louisiana require checking the age signal from Apple and Google, and Apple says this applies even to 18+ apps.
   - **Build:**
     - `expo-age-range` (Apple Declared Age Range + Play Age Signals) runs after the code is verified.
     - The neutral **Birthday** screen is the fallback, for web sign-ups and OS signals that come back empty.
     - Under-18 users see **Not eligible**, and their auth user and email are deleted.
     - Handle Apple's consent-revocation server notification.
     - Never send age data to PostHog. **(design)**
   - **Console:**
     - Apple rating questionnaire: UGC yes, messaging yes, social media yes, age assurance yes; profanity, suggestive and substances each "infrequent". Then **override to 18+**.
     - Play Target audience: 18+ only, turn on "Restrict minor access", appeals to children: No.
     - IARC content rating: users interact yes, shares location yes, digital purchases no.
2. **Reviewer login without an email code.** Password accounts on Demo University, with a seeded counterpart that auto-accepts offers. Put step-by-step notes in App Review Information and Play App access. **(design)**
3. **Store assets can't use university names or marks** (Apple 5.2.1, Play impersonation and IP, where "college sports team logos" are named).
   - Screenshots now show a made-up "Northfield University".
   - Claims are accurate: "Verified with your school email" (a .edu address can also belong to staff).
   - No school names in keywords. **(design)**
4. **Promotional push needs opt-in** (Apple 4.5.4). "Selling tips and campus news" covers stale-listing nudges and campus announcements. It's off by default with a consent line. Message previews are hidden on the lock screen by default. **(design)**
5. **Expanded banned list** (Apple 1.4.3; Play tobacco, marijuana, prescription drugs, dangerous products and counterfeits). The list now covers:
   - nicotine pouches, carts and THC/CBD
   - all prescription drugs
   - ammo and gun parts, fireworks
   - fakes and IDs
   - services, "companionship" and homework help

   It applies to listings, Wanted, give-away, free food and Quad posts. **(design)** Seed `banned_words` with slang variants.
6. **Harassment on the Quad.** Posts that name or rate a student are held for review before going live (**Post held**). There are no rating polls about people. "Hide this person" works without revealing who they are. **(design)**
7. **Privacy disclosures.**
   - The privacy policy (app + web) names the processors: Supabase, Cloudflare, Expo/APNs/FCM, Sentry, PostHog and the email sender.
   - It says the Quad is "anonymous to other students, not to OnlySwap", with lookups only for legal requests or emergencies, and every lookup logged.
   - It states the 18+ rule. **(design)**
   - Settings has an analytics opt-out switch. **(design)**
8. **Child safety standards page** (Play: required for apps with social or anonymous content). The page lives at `/child-safety`, with a named contact in the Play Console. Report CSAM to the NCMEC CyberTipline. **(design)**
9. **Android manifest hygiene.** Check the merged `AndroidManifest.xml` after `expo prebuild`:
   - Only `ACCESS_COARSE_LOCATION` and `POST_NOTIFICATIONS` (plus CAMERA only if the in-app camera is used).
   - Remove `ACCESS_FINE_LOCATION`, `READ_MEDIA_*`, `READ_EXTERNAL_STORAGE`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `RECORD_AUDIO`, `READ_CONTACTS` and `com.google.android.gms.permission.AD_ID` through `android.blockedPermissions` in app config.
   - Photos go through the system Photo Picker.
   - EXIF is stripped on upload, otherwise the photos count as precise location.
10. **Required Play declarations:** Ads: No. Financial features: none. Health: none. Government: No. News: No. Advertising ID: not used. Category: **Shopping** (not Social, which pulls in extra child-safety scrutiny). Title ≤ 30 characters, e.g. "OnlySwap: Campus Marketplace".

**Should-do:**

- **Apple Privacy label** (all "linked to you", no tracking): Email Address, Name, User ID, Photos, Emails or Text Messages, Other User Content, Search History, Purchase History, Coarse Location, Product Interaction, Crash Data, Performance Data, Other Diagnostic Data.
- **Play Data safety:** every item below is collected, not shared (service providers under data processing agreements are not "sharing"), and encrypted in transit.
  - Email
  - Name
  - User IDs
  - Photos
  - Other in-app messages
  - Other UGC
  - Search history
  - App interactions
  - Crash logs
  - Diagnostics
  - Device or other IDs (push tokens)
  - Purchase history ("mark sold")
  - Other info (age range)
  - Approximate location, **only if IP geolocation is left on**. Turn off PostHog GeoIP and Sentry `sendDefaultPii` so it stays out.
- **Privacy manifest:** add `ios.privacyManifests` (UserDefaults CA92.1, file timestamp C617.1) and confirm the Sentry, PostHog and MMKV manifests.
- **Export compliance:** `ios.config.usesNonExemptEncryption: false` (HTTPS only).
- **Availability:** launch in the **United States only**. You're not distributing in the EU, so declare "not a trader" for the EU Digital Services Act and skip the requirement to publish a phone number and address there.
- **Apple 2.2 / 2.5.2.** Don't ship widgets or the Live Activity dormant behind remote flags. Add them in the version that turns them on. Use EAS Update only for bug fixes, never for new features.
- **Live Activity rules (post-launch):** only for a confirmed meetup, ends when the deal closes, no ads, initials and zone name only.
- **Apple 1.5 and Play contact:** a live Support URL (`/help`), an in-app "Contact support", and a public email.
- **Minimum functionality (Apple 4.2, Play spam).** A waitlisted user must still get value: a progress bar, invites, and a short "how it works" tour with sample listings from Demo University.
- **Your legal name is public.** Individual accounts show your personal name as the seller on the App Store and the account email on Play. An LLC with a D-U-N-S number would hide that, but it costs money, so stay individual for now.
- **DMCA designated agent: optional, $6 per 3 years** at copyright.gov. It gives safe-harbor protection when someone posts a copyrighted photo. It's the only cheap legal protection worth buying early.
- **Not applicable:**
  - The INFORM Consumers Act only counts sales where the marketplace processes the payment, and we don't.
  - Contest and sweepstakes rules don't apply because the founding-sellers badge has no prize.
  - IAP doesn't apply to physical goods (Apple 3.1.3(e)).

**Name risk.** Both audits flagged "OnlySwap" as possibly read as a reference to OnlyFans. Apple 4.1(c) and 2.3.8 (metadata suitable for all audiences) and Google's IP policy make this a real rejection and legal risk. Do a USPTO trademark search (free at tmsearch.uspto.gov) before buying anything with the name on it. If "ONLY" + marketplace marks come up as conflicts, rename now, while it costs nothing. Everything in the design reads the name from one place.

## Top 5 decisions to confirm before we start

1. **Domain: stay at $0 (Plan A) or spend $10.46/yr (Plan B)?** Plan A works up to roughly 1k daily users but relies on Gmail sending and a Worker cap. My recommendation is Plan B before campus unlock day.
2. **Age policy: now effectively required (see §19).** Google's July 2026 rule on anonymous features, together with the Texas, Utah and Louisiana laws, means the app must be **18+ with an age check**. It's designed as an OS age signal first, with a neutral birthday screen as the fallback. The only open question is whether you accept losing 17-year-old freshmen until their birthday. The alternative is dropping the Quad from v1, and even then the state laws still require the age signal.
2b. **The name.** Run the free USPTO search on "OnlySwap" this week (§19 name risk).
3. **Ship the Quad in v1 on iOS, behind a kill switch?** My recommendation is yes, with the flag ready. The alternative is launching the marketplace first and adding the Quad in v1.1 once the app has a review history.
4. **Photos in chat: yes (blurred from new contacts) or no for v1?** It changes storage and moderation scope.
5. **Devices and identifiers:** iPhone + Android phones only at launch (`supportsTablet: false`), bundle ID `app.onlyswap`, and Ohio State as the only launch campus. Confirm, and name your 12+ Play closed testers this week.

---

## Sources (checked Sep 25, 2026)

- Expo SDK 57: https://expo.dev/changelog/sdk-57 · https://docs.expo.dev/versions/latest/ · npm registry for package versions
- EAS pricing and plans: https://expo.dev/pricing · https://docs.expo.dev/billing/plans/ · local builds https://docs.expo.dev/build-reference/local-builds/
- Expo push: https://docs.expo.dev/push-notifications/faq/ · https://docs.expo.dev/push-notifications/sending-notifications/
- expo-widgets: https://docs.expo.dev/versions/latest/sdk/widgets/ · expo-age-range https://docs.expo.dev/versions/latest/sdk/age-range/
- MapLibre + Expo: https://maplibre.org/maplibre-react-native/docs/setup/expo · OpenFreeMap https://openfreemap.org/ · https://openfreemap.org/tos/
- Maestro: https://github.com/mobile-dev-inc/Maestro · https://maestro.dev/pricing
- Expo web export: https://docs.expo.dev/guides/publishing-websites/
- Supabase: https://supabase.com/pricing · pausing https://supabase.com/docs/guides/platform/free-project-pausing · SMTP https://supabase.com/docs/guides/auth/auth-smtp · rate limits https://supabase.com/docs/guides/auth/rate-limits · hooks https://supabase.com/docs/guides/auth/auth-hooks · MFA https://supabase.com/docs/guides/auth/auth-mfa/totp · functions limits https://supabase.com/docs/guides/functions/limits · realtime limits https://supabase.com/docs/guides/realtime/limits · broadcast https://supabase.com/docs/guides/realtime/broadcast · backups https://supabase.com/docs/guides/platform/backups · extensions https://supabase.com/docs/guides/database/extensions
- Cloudflare: R2 https://developers.cloudflare.com/r2/pricing/ · public buckets https://developers.cloudflare.com/r2/buckets/public-buckets/ · Workers limits https://developers.cloudflare.com/workers/platform/limits/ · Pages limits https://developers.cloudflare.com/pages/platform/limits/ · Registrar https://developers.cloudflare.com/registrar/ (prices via https://cfdomainpricing.com/) · Turnstile https://developers.cloudflare.com/turnstile/plans/
- Email: https://resend.com/pricing · https://www.brevo.com/pricing/ · Gmail limits https://support.google.com/mail/answer/22839 · app passwords https://support.google.com/accounts/answer/185833 · Supabase + Google SMTP https://supabase.com/docs/guides/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y
- Sentry https://sentry.io/pricing/ · PostHog https://posthog.com/pricing · GitHub Actions https://docs.github.com/en/billing/concepts/product-billing/github-actions · UptimeRobot https://uptimerobot.com/pricing/ · Firebase https://firebase.google.com/pricing
- Google Play: fee https://support.google.com/googleplay/android-developer/answer/6112435 · verification https://support.google.com/googleplay/android-developer/answer/10841920 · testing requirement https://support.google.com/googleplay/android-developer/answer/14151465 · target SDK https://developer.android.com/google/play/requirements/target-sdk · account deletion https://support.google.com/googleplay/android-developer/answer/13327111 · UGC https://support.google.com/googleplay/android-developer/answer/9876937 · assets https://support.google.com/googleplay/android-developer/answer/9866151 · test tracks https://support.google.com/googleplay/android-developer/answer/9845334 · reviewer access https://support.google.com/googleplay/android-developer/answer/15748846 · age laws https://support.google.com/googleplay/android-developer/answer/16569691
- Apple: guidelines https://developer.apple.com/app-store/review/guidelines/ · Feb 2026 update https://developer.apple.com/news/?id=d75yllv4 · age ratings https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions · Texas law https://developer.apple.com/news/?id=sg176nne · Utah/Louisiana https://developer.apple.com/news/?id=f5zj08ey · screenshots https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications · previews https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications · SDK requirements https://developer.apple.com/support/third-party-SDK-requirements/ · TestFlight https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview · upcoming requirements https://developer.apple.com/news/upcoming-requirements/

**Could not fully verify (treat as assumptions):**

- Whether `eas build --local` counts toward EAS quota (not stated by Expo).
- Whether port 465 SMTP works from Supabase Edge Functions (Phase 1 spike).
- Exact Registrar prices (third-party page).
- Whether R2 activation requires a card on file.
- GitHub's current macOS minute multiplier.
