# 01 Architecture map (as-built, branch `audit/production-readiness`)

Method: static read of the repo plus read-only queries against the LOCAL Postgres (migrations 0001..0216 applied; `supabase_migrations` max version = 0216, so local == repo head). Raw dumps are in `audit/raw/arch-*.txt` (tables, policies, rpcs, rpc guards, private helpers, triggers, cron, buckets, grants, route-to-RPC maps, notification types). Where a claim comes from the live local DB it says "local DB"; where from source it cites file:line.

Spec status: CLAUDE.md says LOCKED; this audit does not change anything.

---------------------------------------------------------------------

## 0. Key facts (audited against the locked R1.0 spec)

| # | Area | What the code does | Evidence |
|---|---|---|---|
| 1 | The Quad (anonymous campus feed, admin reveal) | **Exists, with caveats.** The Quad is anonymous to peers (no author in `quad_post_json`; replies carry `alias_no`, 0 = original poster; `is_mine` only). Admin owner can reveal an author via `admin_reveal_quad_author` (see section 4.4). Per-campus feature flag (`app_config.quad_enabled` AND `campuses.quad_enabled`). PRD lists Quad as F28, release **1.1**, yet it is built and routed in the app (tab is conditional). | `0200_quad.sql:17` (table), `0200_quad.sql:137` (`quad_on`), `0202_quad_admin_chat_photos.sql:143` (reveal), local DB `private.quad_post_json`, `docs/PRD.md:66` |
| 2 | Meetup spots map | **No location permission (per spec).** `@maplibre/maplibre-react-native@11.4.1` is installed and used by exactly one component, `SpotsMap.tsx`, showing campus "Meetup spot" pins (static lat/lng rows from `safe_spots`). No user location, no `expo-location`, no NSLocation* string; `ACCESS_FINE/COARSE/BACKGROUND_LOCATION` are in `BLOCKED_ANDROID_PERMISSIONS` (stripped from the merged manifest, CI-checked). Tiles/styles come from OpenFreeMap (`tiles.openfreemap.org/styles/liberty|dark`), so the device's IP and the viewed tile area are visible to that third party. Spec ("no location permission in R1.0") is honored. | `apps/mobile/src/features/meetups/SpotsMap.tsx:20-24`, `.../meetups/logic.ts:172-173`, `apps/mobile/app.config.ts:27-29,226-229` |
| 3 | Campus gating | Campus gating is not "ends with .edu": it is an allowlist table `campus_domains` (kind `student` / `blocked`) checked in the `before_user_created` auth hook. Bypasses that exist on purpose: a hardcoded **staff email** table (`private.staff_emails`, owner Gmail inserted by migration 0210, creates an `admins` row and NO profile) and `review_accounts` (store-reviewer logins). | `0210_staff_admin.sql:7-14,34`, local DB `private.hook_before_user_created` |
| 4 | Behavioural telemetry | There is a second, first-party behavioural pipeline: `track_events` -> `activity_events` (per-user card views, swipes, saves, offers, searches with query text, dwell time), exempt from the analytics opt-out (DEC 93). CLAUDE.md rule 12 only talks about PostHog's 18 events. | `apps/mobile/src/lib/activity.ts:2-18`, `docs/DECISIONS_LOG.md` row 93 |
| 5 | Photo storage | Photos live in **Cloudflare R2** (served by `workers/media`). The two Supabase buckets (`onlyswap-media` public, `onlyswap-private`) exist in the local DB but `storage.objects` has 0 rows and 0 policies (RLS on = deny). Presigned PUTs come from the `upload-url` Edge Function. | local DB `storage.buckets`, `supabase/functions/_shared/uploadUrl.ts:83-96` |

Also shipped: campus "Feed" tab with news/wanted/food posts (DEC 98, 0215), Appeals (DEC 99), iOS widget/Live Activity (expo-widgets) and Android widget, a student **web app** build (react-native-web), referral/invite links (`/i/{code}`), shareable meetup links (`/m/{token}`).

---------------------------------------------------------------------

## 1. Surfaces and how they connect

```
 iOS/Android/Web app (apps/mobile, Expo Router)
   |-- supabase-js 2.117.2 --> Supabase: Auth (email OTP), PostgREST RPC (/rest/v1/rpc/*),
   |                           a few direct table SELECTs under RLS, Realtime Broadcast (private channels)
   |-- fetch (supabase.functions.invoke) --> Edge Functions: upload-url, delete-account, export-data,
   |                                         waitlist-request, support-request
   |-- presigned PUT --> Cloudflare R2 (onlyswap-media)    ; GET --> workers/media (public c/*, share/*; signed chat/*)
   |-- Expo Push (via Edge send-push) --> APNs/FCM
   |-- Sentry, PostHog, OpenFreeMap tiles, EAS Update
 Admin console (apps/admin, Vite + TanStack Router, Cloudflare Pages) --> same Supabase, only admin_* RPCs + 1 table SELECT (categories)
 Public site (apps/site, Astro 7 + Pages Functions /l /m /i) --> anon RPCs + Edge Functions + Auth OTP (delete page)
 DB (Postgres): 53 tables, 9 views, 3 matviews, 178 public SECURITY DEFINER RPCs, 168 private functions,
   23 pg_cron jobs, pg_net --> Edge Functions (send-push, send-email, push-receipts, archive-chats, cleanup-drafts, revoke-sessions, admin-change-email)
```

Counts are from the local DB (`audit/raw/arch-tables.txt`, `arch-rpcs.txt`, `arch-private.txt`, `arch-cron.txt`).

---------------------------------------------------------------------

## 2. Client routes and the data they touch

### 2.1 Mobile (apps/mobile/app, 87 files)

Route files are thin wrappers (`<XScreen />` from `src/features/<f>`). Mapping below was produced by walking each route's imports inside its feature (`audit/raw/arch-mobile-routes3.txt`, feature-level, so a screen may use a subset), then confirmed against the feature `api.ts`. "RLS read" = direct PostgREST SELECT. Writes always go through RPCs (clients hold SELECT only; the only UPDATE grants are three profile columns, see 3.3).

Global (runs on every screen): `get_app_config` (maintenance/min version/rules version), `get_me`-style gate profile read from `profiles` (RLS read, `features/auth/api.ts:288`), `track_events` (activity queue, `lib/activity.ts`), PostHog `capture`, Sentry.

| Route | Reads | Writes / RPC | Realtime / storage / Edge |
|---|---|---|---|
| `index.tsx`, `+not-found`, `link-error`, `+native-intent` | gate: `get_app_config`, `profiles` | none; `+native-intent` rewrites `/l/{id}`, `/i/{code}` links and stores invite code locally | - |
| `(auth)/welcome, email, verify` | `lookup_school` (anon-callable) | `auth.signInWithOtp({shouldCreateUser:true, data:{invite_code}})`, `auth.verifyOtp` | Auth `/auth/v1/otp`,`/verify` |
| `(auth)/age` | - | `confirm_age(method, birth_date \| is_adult)`; may call `expo-age-range` (OS age signal) | - |
| `(auth)/profile-setup` | - | `update_profile`; avatar upload | `upload-url` (kind avatar) -> R2 PUT |
| `(auth)/rules` | `get_app_config` | `accept_rules` | - |
| `(auth)/allow-notifications` | - | `register_push_token` (Expo token, platform) | Expo push token via `expo-notifications` |
| `(system)/maintenance, update` | `get_app_config` | - | - |
| `(system)/reverify` | - | `auth` OTP again + `complete_reverify` | - |
| `(system)/account-status` | `get_account_status`, `get_my_report`, `list_blocked` | `create_appeal`, `unblock_user` | - |
| `(system)/waitlist`, `unlocked` | `my_waitlist_position` | `mark_unlock_seen`, `register_push_token`/`disable_push_token` | - |
| `(tabs)/discover/index`, `listing/[id]/index`, `listing/[id]/photos` | `get_feed` (deck), `get_listing` | `record_swipes`, `undo_swipe`, `save_listing`/`unsave_listing`, `hide_listing`, `watch_listing`, `record_view`, `create_report`, `track_events` | images from media Worker |
| `(tabs)/feed/index`, `(tabs)/sell/news,wanted,food` | `get_campus_feed` | `create_news` (kinds news/wanted/food), `create_listing` (wanted) | - |
| `(tabs)/sell/index, details, meetup, posted` | `safe_spots`, `categories`, `campuses` (RLS reads), `price_hint` | `reserve_listing_id`, `check_text`, `create_listing` (idempotent on reserved id), `set_listing_share_image` | `upload-url` kind listing/share -> R2 PUT (WebP, EXIF stripped on device, `lib/media.ts:9,56`) |
| `listing/[id]/offer`, `offers`, `offer/[id]`, `(tabs)/inbox/index` | `get_inbox`, `get_offer`, `listing_offers` | `make_offer`, `counter_offer`, `accept_offer`, `decline_offer`, `withdraw_offer` | Realtime private `user:{uid}` event `inbox` (`InboxScreen.tsx:72`) |
| `chat/[id]/index, details` | `get_chat`, `get_messages`, `get_profile` | `send_message(client_id)`, `mark_chat_read`, `set_chat_mute`, `hide_chat`, `block_user`, `create_report` | Realtime private `chat:{chatId}` event `message` (`chat/useChat.ts:267`); chat photos gated by `chat_photos_enabled=false` |
| `chat/[id]/meetup`, `meetup/[id]` | `get_chat_meetup`, `get_meetup`, `safe_spots` | `propose_meetup`, `confirm_meetup`, `cancel_meetup`, `checkin_meetup`, `running_late`, `report_noshow`, `create_meetup_share` | map tiles from OpenFreeMap (SpotsMap) |
| `chat/[id]/deal`, `listing/[id]/sold`, `deal/[chatId]/rate` | `get_my_rating`, `listing_offers` | `mark_sold(id, buyer_id)`, `confirm_deal(chat_id, outcome)`, `submit_rating` | - |
| `listing/[id]/edit, relist, stats`, `(tabs)/profile/listings` | `my_listings`, `listing_stats`, `get_listing` | `update_listing`, `relist_listing`, `delete_listing` (soft) | `upload-url` for new photos |
| `(tabs)/profile/index, edit`, `settings/*` (about, appearance, language, privacy, school) | `get_me` | `update_profile`, `update_profile_flags` (analytics/crash opt-ins, theme) | avatar upload |
| `settings/notifications`, `notifications/index` | `get_notifications`, `get_notification_prefs` | `update_notification_prefs`, `mark_notifications_read`, `register_push_token` / `disable_push_token` | - |
| `settings/blocked` | `list_blocked` | `unblock_user` | - |
| `settings/data` | - | `export-data` Edge Function (JWT) -> `data_exports` row + presigned GET to `onlyswap-private` | Edge |
| `settings/delete` | - | `delete-account` Edge Function (JWT) | Edge |
| `saved/index` | `get_saved`, `list_saved_searches`, `saved_search_new_counts` | `unsave_listing`, `create/update/delete_saved_search` | - |
| `search/index, results` | `search_suggest`, `search_listings` | `create_saved_search`, `track_events` (query text) | - |
| `user/[id]` | `get_profile` | `block_user`, `unblock_user`, `create_report` | - |
| `report/[id]` | `get_my_report` | `create_appeal` | - |
| `safety/index`, `help/index`, `help/email-access` | static + `get_account_status` | `support-request` Edge Function (anonymous, Turnstile) from the web/help flow | Edge |
| `legal/[doc]` | bundled markdown (`src/legal/generated.ts`) | - | - |
| `(tabs)/quad/index`, `quad/[id], new, mine, muted, activity` | `get_quad_status`, `get_quad_feed`, `get_quad_thread`, `get_my_quad`, `get_my_quad_hides`, `get_my_quad_mutes` | `accept_quad_rules`, `create_quad_post`, `create_quad_reply`, `vote_quad`, `vote_poll`, `delete_quad_post`, `set_quad_replies`, `hide_quad_author`/`unhide_quad`, `mute_keyword`/`unmute_keyword`, `create_report` | `upload-url` kind quad (photo posts) |
| `dev/*` | dev-only fixtures (`kit`, `spikes`, `states`) | none | should be excluded from production builds (not verified here) |

Tab bar: Discover, Feed, Sell, Quad (conditional), Inbox, Profile (`app/(tabs)/_layout.tsx`).

### 2.2 Admin console (apps/admin, TanStack Router, `main.tsx:47-80`)

Auth: Supabase email OTP, then `admin_whoami`; 8-hour session (`auth.tsx:10`). Only RPC surface is `admin_*` (+ one RLS read of `categories`, `pages/Categories.tsx:20`).

| Route | RPCs |
|---|---|
| `/` Overview | `admin_overview_v2`, `admin_activity_feed` |
| `/activity` | `admin_activity_feed` |
| `/metrics` | `admin_metrics_funnel/liquidity/retention/safety` |
| `/waitlist` | `admin_waitlist_demand`, `admin_open_campus` |
| `/people`, `/people/$id` | `admin_list_users_v2`, `admin_person` (+`_timeline,_listings,_offers,_chats,_meetups,_reports,_access_log`), `admin_set_user_status`, `admin_force_reverify`, `admin_clear_strike`, `admin_change_email` (-> Edge `admin-change-email` via pg_net) |
| `/listings`, `/listings/$id` | `admin_list_listings`, `admin_set_listing_status`, `admin_bulk_set_listing_status`, `admin_listing_activity`, `admin_list_reports` |
| `/reports(/$id)` | `admin_list_reports`, `admin_report_detail`, `admin_read_reported_chat`, `admin_resolve_report` |
| `/appeals` | `admin_list_appeals`, `admin_decide_appeal` |
| `/support(/$id)` | `admin_list_support`, `admin_support_detail`, `admin_update_support` |
| `/quad` | `admin_list_quad`, `admin_moderate_quad`, `admin_reveal_quad_author` |
| `/meetups` | `admin_list_meetups`, `admin_noshow_summary` |
| `/audit` | `admin_list_audit_v2`, `admin_list_admins` |
| `/campuses` | `admin_list_campuses`, `admin_create/update_campus`, `admin_upsert/delete_domain`, `admin_upsert_safe_spot` |
| `/announcements` | `admin_create_announcement`, `admin_list_announcements` |
| `/settings/team` | `admin_list_admins`, `admin_invite_admin`, `admin_remove_admin` |
| `/settings/words` | `admin_list/upsert/delete_banned_word` |
| `/settings/switches` | `admin_get_config`, `admin_set_config` |
| `/settings/data` | `admin_list_deletions_exports` |
| `/settings/health` | `admin_system_health` |
| `/settings/review` | `admin_list/upsert/delete_review_account` |
| `/settings/blocked-emails` | `admin_list/upsert/delete_banned_hash` |
| `/settings/categories` | `admin_upsert_category` (+ `categories` SELECT) |
| `/settings/staging` (only if `STAGING` build flag) | `admin_mock_status` (exists only on a staging DB with mock data; absent in repo `migrations/`, local DB has no such function) |
| top-bar search | `admin_search` |
| (Ratings page component, no standalone route found in `main.tsx`) | `admin_ratings_summary`, `admin_age_blocks_summary` |

### 2.3 Public site (apps/site, Astro 7.3.5, Cloudflare Pages)

| Route | Kind | Data |
|---|---|---|
| `/` (index) | static + form | `public_campus_progress` RPC, `lookup_school` RPC, `waitlist-request` Edge Function (Turnstile) |
| `/joined`, `/404`, `/[legal]` (privacy, terms, ...), `/sitemap.xml`, `/robots.txt` | static | - |
| `/help` | static + form | `support-request` Edge Function (Turnstile) |
| `/delete` | static + 3-step form | `/auth/v1/otp`, `/auth/v1/verify`, then `delete-account` Edge Function with the user's access token |
| `/l/:id` (Pages Function `functions/l/[id].ts` -> `src/lib/share.ts`) | SSR share page | anon RPC `get_listing_public_card` |
| `/m/:token` (`functions/m/[token].ts`) | SSR | anon RPC `get_meetup_share` |
| `/i/:code` (`functions/i/[code].ts`) | SSR | anon RPC `get_invite` |

`apps/site/public/_headers` sets a CSP, HSTS, `X-Frame-Options: DENY`, `Permissions-Policy` with geolocation/camera/microphone/payment off. `apps/site/wrangler.toml` commits **staging** values (`SUPABASE_URL`, publishable key `sb_publishable_…grbiQwa` masked, `MEDIA_URL` = staging Worker, Turnstile **test** site key `1x0000…AA`); production must override these in the Pages dashboard (not verifiable from the repo).

### 2.4 Media Worker (workers/media)

`handler.ts`: GET/HEAD only; public prefixes `c/` and `share/` (immutable, 1-year cache); `c/{campus}/chat/...` never public, served only with HMAC `exp`+`sig` (key = Vault `media_signing_key` == Worker `MEDIA_SIGNING_KEY`); per-isolate rate limit 600/min/IP; everything else 404. Listing photos, avatars, quad photos are therefore publicly fetchable by anyone who has the (unguessable uuid) key, i.e. no session needed (`handler.ts:1-4,18,62`).

Upload keys (server-chosen, `_shared/uploadUrl.ts:92-96`): `c/{campus}/l/{listing}/{uuid}_{full|thumb}.webp`, `c/{campus}/u/{user}/avatar_{uuid}.webp`, `c/{campus}/quad/{post}/...`, `c/{campus}/chat/{chat}/...`, `share/{id}.jpg`. Limits: listing full 2 MB / thumb 200 KB WebP, avatar 300 KB, share 500 KB JPEG, max 8 listing photos, 16 files per call (`uploadUrl.ts:22-40`).

---------------------------------------------------------------------

## 3. Database inventory (local DB == migrations 0001..0216)

### 3.1 Tables (53), views (9), matviews (3)
RLS is **enabled on all 53 tables and nothing is `FORCE`d** (`arch-tables.txt`). Policies exist on 32 tables; all are `SELECT` to `authenticated` except one `UPDATE` policy on `profiles` (`profiles_update_self`). `anon` has no table grants; `authenticated` has SELECT only (`arch-grants.txt`).

Tables with policies (select scope): admins, announcements (campus + pinned), app_config (public keys or owner), appeals (own/mod), audit_log (mod), blocks (own/mod), campus_domains (mod), campuses (own campus/mod), categories (all), chats (participants), data_exports (own), listing_photos (if the listing is visible), listings (campus + active/hold/sold... or own non-deleted, mods all), meetups/messages (`private.is_chat_participant`), noshow_reports, notification_prefs, notifications, offers (participants/mod), profiles (self/mod), push_tokens, quad_mutes, quad_votes, ratings (own given/mod), reports (mod), safe_spots (campus active/mod), saved_searches, saves, strikes, swipes, watches.

RLS on but **no policy (deny-all to direct clients; reached only through DEFINER RPCs)**: account_deletions, activity_days, activity_events, age_blocks, banned_hashes, banned_words, common_first_names, daily_counters, email_outbox, listing_price_changes, listing_removals, listing_reservations, push_tickets, quad_hides, quad_poll_options, quad_poll_votes, quad_posts, quad_replies, rate_counters, review_accounts, support_requests, waitlist_requests.

Views: `admin_metrics_{funnel,liquidity,retention,safety}`, `campus_progress`, `my_reports`, `profile_stats`, `public_profiles`, `ratings_visible` (the 3 `authenticated`-readable ones that matter: public_profiles, profile_stats, ratings_visible, campus_progress, my_reports). Matviews: `campus_trending_terms`, `price_hints`, `profile_stats_mv`. Private tables: `private.admin_settings` (mfa_required), `private.staff_emails`.

### 3.2 RPCs
178 functions in `public`, **all SECURITY DEFINER with a pinned `search_path`** (`proconfig` non-empty for all; `arch-rpcs.txt` col 4). EXECUTE: `authenticated` on all; `anon` on only seven: `get_app_config`, `get_invite`, `get_listing_public_card`, `get_meetup_share`, `lookup_school`, `public_campus_progress`, `public_safe_spots`.

Guard pattern (source scan `arch-rpc-guards.txt`, then resolved by hand):
- Write RPCs call `private.require_active()` (`0015_account_safety.sql:25`: authenticated, profile exists, status `active`, not past `verified_until`, `adult_confirmed_at` set, current `rules_version` accepted; also upserts `activity_days`).
- Chat/meetup/deal RPCs use `private.require_member()` = active **or paused** (paused users can finish open chats; `make_offer` explicitly raises `OFFERS_PAUSED`). Quad RPCs use `private.require_quad(write)` = require_active (write) / require_member (read) + campus flag + rules acceptance.
- Pre-onboarding RPCs (`confirm_age`, `update_profile`, `accept_rules`, `complete_reverify`) use `private.require_onboarding()`.
- Admin RPCs use `private.require_admin(role[, campus])`; person-scoped ones via `private.admin_for_person` (moderator scoped to the person's campus). Mutating admin RPCs write `audit_log` (a trigger blocks UPDATE/DELETE on `audit_log`, `0010`/`audit_log_no_update_delete`). Reads such as `admin_list_*`, `admin_person_*` and metrics do not write audit rows (by design; chat message bodies are only exposed by `admin_read_reported_chat`).
- Rate limiting: `private.hit(key, max, window)` / `hit_key` on sensitive RPCs (confirm_age 3/day, make_offer per-campus/hour, propose_meetup 20/day, quad reveal 5/day).

Families (names only; full list in `arch-rpcs.txt`): auth/account (get_me, update_profile, confirm_age, accept_rules, complete_reverify, get_account_status, register/disable_push_token, get_notification_prefs...), feed/listings (get_feed, get_listing, create/update/delete/relist_listing, reserve_listing_id, record_swipes, undo_swipe, save/unsave, watch, hide, record_view, price_hint, check_text, search_*, saved searches, listing_stats, my_listings), offers (make/counter/accept/decline/withdraw, listing_offers, get_inbox, get_offer), chat (get_chat, get_messages, send_message, mark_chat_read, set_chat_mute, hide_chat), meetups (propose/confirm/cancel/checkin/running_late/report_noshow/create_meetup_share/get_meetup/get_chat_meetup), deals (mark_sold, confirm_deal, submit_rating, get_my_rating), safety (block/unblock, create_report, create_appeal, get_my_report, list_blocked), quad (14 RPCs), campus feed (get_campus_feed, create_news), telemetry (track_events), 7 anon/public RPCs, ~57 `admin_*`.

### 3.3 Grants of note
`authenticated` may UPDATE only `profiles(theme_mode, crash_reports_opt_in, analytics_opt_in)` (column grants, local DB). `profiles_update_self` policy therefore only governs those three columns. Everything else is RPC-only.

### 3.4 Triggers (public/auth/storage)
`on_auth_user_created` -> `private.handle_new_user` (auth.users AFTER INSERT; creates profile + notification_prefs, or an `admins` row for staff); `on_auth_user_email_changed` -> `handle_user_email_changed`; `trg_listings_ai/price/status`; `trg_messages_ai` (updates chat, `realtime.send` to `chat:{id}` and `user:{uid}`, queues `message_new` push; preview text only if `notification_prefs.message_previews`, default false); `trg_offers_ping` (realtime inbox ping); `ratings_reveal_ai`; `trg_reports_ai`; `trg_saved_search_cap`; `trg_profiles_deleting`/`profiles_ad_deletion`/`trg_profiles_waitlist`; `trg_campuses_open(_stamp)`; `age_blocks_bi`; `audit_log_no_update_delete`. Storage protect_* triggers are Supabase built-ins.

### 3.5 pg_cron (23 jobs, local DB `cron.job`)
prune (09:30), trending (hourly :07), expire_offers (5 min), meetup_reminders (5 min), noshow_autoconfirm (hourly), deal_checks (15 min), notify_push (every minute; pg_net -> `send-push`), push_receipts (15 min), reset_stuck_sends (5 min), expire_listings (10 min), stale_listings (21:00), reverify_reminders (14:00), reverify_enforce (14:30), pause_lift (10 min), refresh_stats (10 min), refresh_hints (09:00), archive_chats (10:00), strike_expiry (11:00), email_drain (5 min; -> `send-email`), demo_autoplay (every minute), rating_reveal (hourly), prune_activity (09:45), report_queue_check (30 min). Job id 17 is absent (gap). `demo_autoplay` runs every minute on every environment the migrations reach; it is a demo-campus bot (confirm it is a no-op without demo data; not verified here).

### 3.6 Realtime
Publication list is empty (`pg_publication_tables` for `supabase_realtime` returns 0 rows): no postgres_changes. Only **Broadcast** via `realtime.send` from triggers. One policy on `realtime.messages`: SELECT allowed when topic = `user:{auth.uid()}` or topic matches `chat:{uuid}` and `private.is_chat_participant(uuid)` (local DB). Clients subscribe with `{config:{private:true}}` (`lib/realtime.ts:26-28`).

### 3.7 Storage
Supabase Storage: buckets `onlyswap-media` (public, 2 MB, webp/jpeg) and `onlyswap-private` (private, 10 MB); `storage.objects` RLS on, **0 policies, 0 objects**. Real storage is R2 (`onlyswap-media`, `onlyswap-private` for evidence/exports; 0013 relocates report evidence to `onlyswap-private/evidence/...`).

### 3.8 Edge Functions (supabase/functions, 14 + `_shared`)
`config.toml` `verify_jwt`: true only for `export-data`; `delete-account` and `upload-url` have no config entry (default true). All others `verify_jwt=false` and authenticate themselves:

| Function | Caller | Auth inside handler | Does |
|---|---|---|---|
| upload-url | app | JWT | `private.can_upload` then presigned R2 PUT URLs |
| delete-account | app, site `/delete` | JWT | account deletion + R2 cleanup |
| export-data | app | JWT | builds JSON export to `onlyswap-private`, presigned GET |
| waitlist-request | site (anon) | Turnstile + IP rate limit | inserts `waitlist_requests` |
| support-request | site/app (anon) | Turnstile | inserts `support_requests`, emails |
| send-push | pg_cron/pg_net | service key or `INTERNAL_FUNCTION_KEY` | claim (`for update skip locked`) -> Expo Push |
| push-receipts | cron | same | Expo receipts, prunes bad tokens |
| send-email | cron | same | Gmail SMTP (Plan A) or Resend (Plan B) |
| archive-chats, cleanup-drafts | cron | same | R2 archival/cleanup |
| revoke-sessions, admin-change-email | DB via pg_net | same | auth admin API |
| health | uptime pinger | none (public) | `select 1`, returns `{"ok":true}` |
| test-inbox | E2E | `E2E_SECRET`; refuses unless `APP_ENV` is `local`/`staging` | returns OTP codes for `e2e+*@e2e.onlyswap.test` |

Staging-only SQL lives in `supabase/migrations_staging/` (`9001_test_clock.sql` makes `private.now()` overridable; `9002_e2e_domain.sql`); each file aborts if `app.env = 'prod'`, and `scripts/verify/check-staging-migrations.mjs` runs in `pnpm test:scripts`.

### 3.9 Notification types (in-app + push) found in DB source
account_notice, appeal_decided, campus_unlocked, deal_check, free_food, listing_removed, listing_restored, listing_stale, meetup_reminder, message_new, offer_accepted, offer_countered, offer_declined, offer_expired, offer_new, price_drop, quad_milestone, quad_reply, rate_prompt, rating_revealed, report_update, reverify_due, saved_search_match, wanted_match, watch_available. Email templates queued: account_deleted, admin_reveal_receipt, campus_open, data_export, priority_report, report_queue, reverify_due, support_reply, support_request. Every notification carries a `dedupe_key`.

---------------------------------------------------------------------

## 4. Sequences

### 4.1 Auth, campus check, age gate, hooks

1. App opens -> `useAppGate` fetches `get_app_config` + the user's `profiles` row; `computeGate` (`features/auth/logic.ts:161`) picks the route in this order: maintenance -> force-update -> welcome (signed out or no profile) -> account-status (banned / suspended / paused) -> reverify (status or `verified_until` passed) -> age (`adult_confirmed_at` null) -> profile-setup (no first name) -> rules (not accepted) / rules-updated -> waitlist (campus not live) -> unlocked (once) -> allow-notifications -> `/discover`.
2. Email screen: `lookup_school(email)` (anon RPC) tells the user if the domain is allowed. `signInWithOtp({shouldCreateUser:true, data:{invite_code}})` (`auth/api.ts:135-140`). OTP is 6 digits, 600 s expiry (`config.toml:244-246`); `enable_anonymous_sign_ins=false` (`config.toml:189`).
3. Supabase Auth calls hook `private.hook_before_user_created` (`config.toml:306`; defined `0210_staff_admin.sql:34`). It lowercases the email and: rejects malformed (`SCHOOL_UNKNOWN`); hashes the email (`private.email_hash`) and rejects if in `age_blocks` (`AGE_BLOCKED`) or `banned_hashes` (`BANNED`); lets through staff emails and `review_accounts`; otherwise requires the domain in `campus_domains` (unknown -> `SCHOOL_UNKNOWN`, kind `blocked` -> `DOMAIN_BLOCKED`, demo campus -> `SCHOOL_UNKNOWN`). It returns HTTP 403 with the code as message. **No `.edu` literal check**; the allowlist is data.
4. `verifyOtp` creates the `auth.users` row; trigger `private.handle_new_user` (`0210_staff_admin.sql:84`) inserts the profile (campus from domain, `status` = `active` if campus `live` else `waitlist`, `verified_until` = now + `reverify_months`, optional `invited_by` from invite code) and default `notification_prefs`. Staff emails get an `admins` row and no profile.
5. Hook `private.hook_custom_access_token` (`0010_hooks_triggers.sql:61`) stamps JWT claims `campus_id`, `status`, `adult`, `admin_role`.
6. Age gate: `confirm_age` (`0012_rpcs_account.sql:78`, 3 calls/day). Method `os_signal` (client passes `is_adult` from `expo-age-range`; threshold 18) or `self_declared` (birth_date, evaluated in the campus timezone). Adult -> `adult_confirmed_at`, `age_method` set. Under 18 -> `age_blocks` row keyed by email hash, so the same email can never re-register (hook rejects `AGE_BLOCKED`). Note the `os_signal` value is client-asserted; the server cannot verify it.
7. `accept_rules` stores `rules_version`; every write RPC re-checks it via `require_active` so a version bump forces re-acceptance.
8. Push opt-in: `register_push_token` after the primer screen.
9. Yearly re-verification: cron `reverify_reminders` 14:00 and `reverify_enforce` 14:30 flip `status` to `reverify`; client routes to `/reverify` which does OTP + `complete_reverify`.

Admin console sign-in: same email OTP; staff email bypasses campus check; `admin_whoami` gates the UI. `private.admin_settings.mfa_required` is currently `false` on staging (DEC 95, `0211`); NOTES.md says to set it true before launch. Local DB default also false (inserted `0211:14`).

### 4.2 Identity model (who sees whom)

- Real, per-user identity everywhere except the Quad: `display_name` (first name from profile-setup), optional avatar, `year`, campus. Visibility is campus-scoped by RLS/views (`public_profiles` filters `campus_id = my_campus()`, excludes banned and blocked-either-way).
- Offers, chats, meetups, ratings: both counterparties are named. Blocking hides the other from `public_profiles` and blocks chat (`chats.status = 'blocked'`).
- Telemetry identity: PostHog distinct id = SHA-256 of `onlyswap:{userId}` (`lib/analytics.ts:131`); `track_events` is keyed by real user id server-side.
- Quad identity: see 4.3.

### 4.3 Quad anonymity model
- `quad_posts.author_id` is a real FK to `profiles` (`0200_quad.sql:20`). Clients never receive it: `private.quad_post_json` returns only `is_mine`; `private.quad_reply_json` returns `alias_no` (0 = OP) and `is_op`, `is_mine`. Tables have RLS with no policy, so there is no direct SELECT path.
- Moderation state: `status` live/held/hidden/removed; banned-words/hash checks via `check_text`.
- Per-user controls: hide an anonymous author (`quad_hides`), mute keywords, replies on/off.
- Peer anonymity is therefore server-enforced in the RPC layer, not by cryptography: anyone with DB or `service_role` access (or an owner admin) can resolve authors.

### 4.4 Quad author reveal by admin (`admin_reveal_quad_author`, `0202_quad_admin_chat_photos.sql:143`)
1. Owner opens `/quad` in the console and chooses "Reveal author" on a post/reply (a case reference >= 3 chars and a reason are required; `private.need_reason`).
2. RPC does `private.require_admin('owner')` (moderators cannot).
3. **Fresh TOTP is hard-required**: JWT `amr` must contain method `totp` within the last 10 minutes, else `FORBIDDEN: mfa_required`. This check is inline in the function and does NOT consult `admin_mfa_ok()`, so it still demands TOTP even while the console's general two-step switch is off (DEC 95). Practical effect: with `mfa_required=false` an owner can sign in with an email code alone but cannot reveal until they enroll TOTP.
4. `private.hit_key(admin, 'quad_reveal', 5, 1 day)` limits to 5 reveals/day/admin.
5. Writes an `audit_log` row `quad.reveal` including the revealed `author_id` and `case_ref`.
6. Queues email `admin_reveal_receipt` to the author ("An OnlySwap safety admin ... who wrote a Quad post"), deduped per post+admin, so the author is told after the fact.
7. Returns `{user_id, display_name, status, case_ref}` to the console. The email address is looked up for the receipt but not returned.

### 4.5 offer -> accept -> chat -> meetup -> mark sold -> rating

1. **Deck / listing**: `get_feed` -> swipe right opens listing / offer sheet. `record_swipes` batches swipes. Activity queue sends `deck_shown`, `listing_viewed`, `offer_made`... via `track_events`.
2. **Offer**: `make_offer(listing_id, amount_cents, note, quick_notes)` (`0022_offers.sql:92`). Checks: not paused, `require_active`, hourly cap from campus (`offers_per_hour`, default 10), extra 5/day for accounts < 24 h old, listing locked `FOR SHARE`, same campus, not blocked, not own listing, listing `active`, kind sale/free, amount 100..200000 cents (0 for free), firm-price listings only at the asking price, note screened by `check_offer_note`. Upserts the buyer's single open offer (48 h expiry), queues `offer_new` push to the seller, realtime inbox ping via `trg_offers_ping`.
3. **Counter / back-and-forth**: `counter_offer` (up to round 4), whoever did not act last may accept. `expire_offers` cron closes after 48 h.
4. **Accept**: `accept_offer` (`0022_offers.sql:184`, lock order fixed in `0033`). Locks listing FOR UPDATE then offer; sets offer `accepted`, listing `hold` with `hold_offer_id`; inserts `chats` row with title/price/thumb **snapshots** and `agreed_cents`; inserts a system message; auto-declines (and notifies) every other open offer on that listing; notifies the other party `offer_accepted`. Returns `{chat_id}`. **Chat only exists after acceptance.**
5. **Chat**: `get_chat`/`get_messages`; `send_message(client_id)` idempotent; `trg_messages_ai` broadcasts on `chat:{id}`, bumps inbox, queues `message_new`. Text screened by `check_text`; photos in chat are off (`chat_photos_enabled=false`).
6. **Meetup**: `propose_meetup(chat_id, starts_at, spot_id | custom_place)` (20/day; a new proposal cancels the prior one with reason "replaced"); the other party `confirm_meetup`; `checkin_meetup` at the spot; `running_late`; `cancel_meetup`; `report_noshow` (feeds strikes/pause); crons `meetup_reminders`, `noshow_autoconfirm`, `deal_checks` (prompt both sides). Spot choices come from `safe_spots` ("Meetup spot", `police` flag for police-designated). Optional public share link `/m/{token}` (`create_meetup_share`). Payment is in person; no payment code exists.
7. **Mark sold**: two routes. (a) Seller `mark_sold(id, buyer_id)` (`0213_mark_sold_chat_note.sql:8`): listing `sold`, `sold_at`, `buyer_id`, system line in that buyer's open chat. (b) Both sides `confirm_deal(chat_id, outcome)` (`0026_deals.sql:50`) with outcomes done / not_yet / fell_through; when both say done: meetup `completed`, listing `sold` (`sold_in_app=true`), `rate_prompt` pushes; "fell through" cancels meetups, returns the listing to `active` if it was on hold for this offer, closes the chat, and notifies watchers `watch_available`.
8. **Rating**: `submit_rating(chat_id, thumbs_up, tags[], comment<=200)` (`0026_deals.sql:114`) only inside the meetup/sold window; one per rater (unique); comment text-checked. Blind reveal: trigger `ratings_reveal_ai` (`0205_r11_extras.sql:1025`) and hourly cron `rating_reveal` make both ratings visible together (`ratings_visible` view), sending `rating_revealed`.
9. Retention: chats are archived (`archive_chats`), never hard-deleted; listing delete is soft (`status='deleted'`).

---------------------------------------------------------------------

## 5. Third-party SDKs and what leaves the device

Versions are the resolved versions from `pnpm-lock.yaml`; `package.json` carries the ranges.

### 5.1 Mobile (`apps/mobile/package.json`)

| Package (resolved) | Role | Off-device data |
|---|---|---|
| `@supabase/supabase-js` 2.117.2 | Auth, RPC, Realtime, Edge invoke | Everything functional goes to the project's Supabase URL (`EXPO_PUBLIC_SUPABASE_URL`). Session tokens stored in `expo-secure-store` 57.0.4 via `secureSessionStorage` (`lib/supabase.ts:15`). Anon/publishable key only. |
| `@sentry/react-native` 7.11.0 | crash/perf | Init only if `EXPO_PUBLIC_SENTRY_DSN` set (`lib/sentry.ts:53-61`). `sendDefaultPii:false`, `tracesSampleRate 0.05`, no screenshots/view hierarchy, `beforeSend` deletes `user`, `request`, `extra`, strips http/fetch/xhr breadcrumbs, redacts emails in breadcrumb messages, drops all events when `privacy.crashOptOut` is true. Still sent: stack traces, release/dist, environment, device/OS context and RPC-name breadcrumbs (`rpc.ts:14-17` records function names, not args). Note the opt-out is read from local storage, and `profiles.crash_reports_opt_in` mirrors it server-side. |
| `posthog-react-native` 4.78.0 | product analytics | Init only with `EXPO_PUBLIC_POSTHOG_KEY`; host default `https://us.i.posthog.com` (`lib/analytics.ts:162`). `personProfiles:'identified_only'`, no lifecycle events, no session replay, `disableGeoip:true`, `defaultOptIn` follows the F12 switch. Exactly 18 events (`app_opened, signup_started, email_verified, onboarding_completed, card_swiped{dir}, listing_viewed{source}, offer_sheet_opened, offer_sent{pct bucket}, search_performed{count bucket}, search_saved, listing_create_started, listing_posted{photos_count}, chat_opened, meetup_planned{spot_type}, deal_confirmed{outcome}, rating_submitted, report_submitted{target_type}, share_tapped{surface}`), properties are enums/buckets; distinct id is SHA-256(`onlyswap:`+userId); the IP is still visible to PostHog as the TCP source (GeoIP lookup disabled). |
| first-party `track_events` (not an SDK) | admin activity | See section 0 #6: kind, listing id, source, dwell ms, search text (<=80 chars), platform, app version, timestamp -> `activity_events`, batches of 50, 15 s flush, 100 batches/hour client cap (server 120). Not covered by the analytics opt-out; cleared on sign-out; pruned by `prune_activity`. |
| `expo-notifications` 57.0.23 | push | `getExpoPushTokenAsync({projectId})` (`lib/push.ts:93`); token + platform stored via `register_push_token`. Pushes are sent by the server to Expo's push service (`EXPO_SEND` in `_shared/push.ts`) with title/body/data/badge/channelId; title/body contain sender display name, listing title, offer amount; message text only if user enabled previews (default off). Apple/Google then see the notification content. |
| `expo-updates` 57.0.26 | OTA | Contacts EAS Update with runtime/fingerprint, platform, channel. |
| `@maplibre/maplibre-react-native` 11.4.1 | spots map | Tile/style requests to `tiles.openfreemap.org` (IP + viewed area). No device location (section 0 #4). |
| `expo-age-range` 57.0.5 | OS age signal | Local OS API (Apple Declared Age Range / Play Age Signals); result (adult yes/no) is sent to our `confirm_age`. |
| `expo-image-picker` 57.0.20 / `expo-image-manipulator` 57.0.21 | photos | Resize + re-encode to WebP on device (drops EXIF/GPS, `lib/media.ts:9,56`); PUT directly to R2 presigned URLs. Picker never asks for EXIF; Android media-read permissions are blocked. |
| `expo-store-review` 57.0.3 | review prompt | OS-level prompt only. |
| `expo-widgets` 57.0.25, `react-native-android-widget` 0.22.1 | next-meetup widget / Live Activity | Local only (App Group); no remote push to Live Activities. |
| `expo-secure-store`, `react-native-mmkv` 4.3.2 | storage | Local. MMKV holds the activity queue (contains listing ids, search text) and prefs. |
| `expo-application`, `expo-device`, `expo-constants`, `expo-clipboard`, `expo-crypto`, `expo-haptics`, `expo-image`, `expo-linking`, `expo-system-ui`, `expo-splash-screen`, `expo-status-bar`, `expo-dev-client`, `expo-build-properties`, `expo-alternate-app-icons` 8.0.0, `@expo/ui`, `@react-native-community/netinfo` 12.0.1, `@react-native-community/datetimepicker` 9.1.0, `@shopify/flash-list` 2.0.2, `@tanstack/react-query` 5.103.3, `zustand` 5.0.15, `react-native-*` UI libs, `react-native-view-shot` 5.1.0 (share card capture) | UI/utility | No network egress of their own. |

Env surface (`lib/env.ts`): `EXPO_PUBLIC_APP_ENV, SUPABASE_URL, SUPABASE_ANON_KEY, MEDIA_URL, SITE_URL, SENTRY_DSN?, POSTHOG_KEY?, POSTHOG_HOST?` only. Android permission blocklist in `app.config.ts:27-45` (location, media, contacts, audio, exact alarm...), validated in CI by `check-prebuild.mjs`.

### 5.2 Admin (`apps/admin`): `@supabase/supabase-js` 2.117.2, `@tanstack/react-router` 1.170.40, react/react-dom 19.2.3, `@onlyswap/tokens`. No Sentry, PostHog or other third-party SDK; the only egress is Supabase.
### 5.3 Site (`apps/site`): `astro` 7.3.5 (+ tokens). No analytics SDK in `package.json`. Client JS calls Supabase REST/Auth/Functions and loads Cloudflare Turnstile (`https://challenges.cloudflare.com`, allowed by CSP). `invite.js` and `localtime.js` are first-party.
### 5.4 Worker/Edge: Edge Functions use `postgres` driver, S3-style R2 signer (`_shared/s3.ts`, `r2.ts`), Expo Push + Receipts HTTP APIs, Gmail SMTP or Resend (`EMAIL_PROVIDER`), Cloudflare Turnstile siteverify. Secrets (service key, `INTERNAL_FUNCTION_KEY`, `EXPO_ACCESS_TOKEN`, `GMAIL_APP_PASSWORD`, `E2E_SECRET`, `TURNSTILE_SECRET_KEY`) are read from `Deno.env` only.

---------------------------------------------------------------------

## 6. Existing tests and CI

| Layer | Count | Where |
|---|---|---|
| pgTAP | 57 files, 1538 planned assertions (sum of `plan(n)`; no file lacks a plan) | `supabase/tests/**` (e.g. `000_setup.test.sql`, `account_rpcs.test.sql`, `rls_*`) |
| Jest (mobile) | 62 files, ~819 `it/test` calls | `apps/mobile/src/**` (`jest --ci`) |
| Vitest/Jest admin | 4 files, ~48 | `apps/admin` |
| Site | 4 files, ~31 | `apps/site` |
| Node `--test` (Edge shared logic, Worker, scripts) | Edge `_shared` 12 files ~68 cases, `workers/media` 1 file ~7, `scripts/*.test.ts` 4 files ~20 | run by root `pnpm test:scripts` |
| Maestro | 14 flows in `apps/mobile/.maestro/flows` (e2e-01 signup, 02 underage, 03 unknown school, 04 reviewer, 05 swipe-offer, 06 accept-chat, 08 meetup, 10 sell, 11 search, 13 report-block, 14 notification settings, 15 delete account, 17 offline, 18 deeplinks) + 7 subflows/tour files | not run in CI |
| Playwright web E2E | 3 specs, 20 tests (`e2e/web/tests/{site,admin,invite}.spec.ts`) | `web-e2e.yml`, `workflow_dispatch` only |

Gaps visible from the numbering: flows 07, 09, 12, 16 are missing from the Maestro set (e.g. no flow for Quad, the Feed tab, appeals, mark-sold-from-chat).

### CI workflows (`.github/workflows`)
- `ci.yml` - triggers: `pull_request` (all) and `push` to `main`. Jobs: `changes` (dorny/paths-filter), `checks` (always): pnpm install --frozen-lockfile, G1 `pnpm lint` (eslint with max-warnings 0 for mobile + `prettier --check .`), G2 `pnpm typecheck`, G3 `pnpm test` (all packages + `test:scripts`, which also runs `check-staging-migrations.mjs` and `sync-legal.mjs --check`), G5 `pnpm audit --audit-level high`, G5 gitleaks over full history. `mobile` (only if mobile paths changed): expo-doctor; `expo prebuild` for development and production variants + `check-prebuild.mjs`; Android release merged-manifest check (Gradle `processReleaseMainManifest`); production `expo export` + `scan-bundle.mjs` secret scan. `db` (only if db paths changed): `supabase start` (minus studio, imgproxy, vector, logflare, supavisor, edge-runtime), `supabase test db` (pgTAP), `rpc-contract.ts check`, `check-db-types.sh`.
- `backup.yml` - daily 03:00 UTC + manual (database backup).
- `keepalive.yml` - daily 12:17 UTC ping of staging (free-tier pause avoidance).
- `usage-report.yml` - Monday 14:00 UTC free-tier usage report.
- `web-e2e.yml` - manual only.
- There is **no deploy workflow**: deploys are local scripts (`scripts/deploy/*.command`, EAS CLI), so nothing in CI gates a release; branch protection (CLAUDE.md rule 14) is not verifiable from the repo.
- Not run in CI: Maestro, Edge Function runtime (Deno) integration, Worker integration against real R2, any load test.

---------------------------------------------------------------------

## 7. Observations worth passing to the other audit tracks (facts only, not yet triaged)

1. Reveal path requires TOTP even though the admin console's two-step is off (4.4, 4.1). Check that an owner without TOTP enrolled cannot be locked out of safety actions.
2. `confirm_age` `os_signal` branch trusts a client boolean (4.1 step 6); a minor could call the RPC with `is_adult=true` directly. `self_declared` is also unverifiable. Both are by-design soft gates; the hard stop is only `age_blocks` after a "no".
3. Listing, avatar and Quad photo URLs are unauthenticated public (unguessable keys) via the Worker, despite "campus-only" positioning (2.4).
4. Owner's personal Gmail is hardcoded in a committed migration (`0210_staff_admin.sql:14`) and bypasses the campus allowlist and creates an owner admin automatically at sign-up on any environment that runs the migration.
5. `apps/site/wrangler.toml` commits staging Supabase URL and a Turnstile **always-pass** test key; confirm production Pages env overrides.
6. First-party `activity_events` stores per-user browsing behaviour and search text outside the analytics opt-out (DEC 93).
7. `quad_enabled` default in app_config seed is `true` locally though PRD marks Quad as release 1.1.
8. Paused users: client gate sends them to `account-status`, while the server allows them to read/finish chats (`require_member`).
9. `demo_autoplay` cron runs every minute on all environments; confirm no-op in production.
10. Unused Supabase Storage buckets remain configured (7 above).
11. Admin staging page references `admin_mock_status`, which exists only on the staging database; the production console build must have `STAGING` false.
