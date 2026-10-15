# B. Privacy and compliance (code-derived; locked R1.0 spec)

Format: ID | what | how | evidence | status | severity | fix | effort

| ID | What | How | Evidence | Status | Sev | Fix | Effort |
|---|---|---|---|---|---|---|---|
| B-01 | `track_events` is a second analytics pipeline that ignores the analytics opt-out (F12). It stores per user id: cards shown, listing views with time on page and source, search text (up to 80 chars), app opens, device type, app version. SECURITY section 6 promises behaviour-only PostHog with an opt-out and no content | Code review | `apps/mobile/src/lib/activity.ts:1-12` ("the analytics opt-out does not turn it off"); `public.track_events` has no read of `profiles.analytics_opt_in`; table `activity_events` FK to `auth.users` | FAIL (policy vs promise) | Medium | Either honour `analytics_opt_in` in the client and the RPC, or state it plainly in the Privacy policy and the store forms (search history, product interaction, linked to identity) and drop search text | M |
| B-02 | Data export omits `activity_events` (and `account_deletions`) although they are user-linked | `private.export_user_data` lists 33 tables, none is `activity_events` | grep count 0 | FAIL | Medium | Add it to the export | S |
| B-03 | Closed-chat archives `archive/chats/{chat}.json` (private R2) are not removed on account deletion; DATA_MODEL section 5 says archives are deleted on account deletion. `prepare_account_deletion` only returns prefixes `c/{campus}/u/{uid}/`, `c/.../l/{id}/`, `share/{id}.jpg` | Code review | `private.prepare_account_deletion`, `archive-chats/index.ts:32` | FAIL | Medium | Delete archives for chats the user took part in (or anonymise the JSON) in `deleteAccount` | M |
| B-04 | Deletion leaves the user's chat message bodies in the other person's chat (sender nulled, system "This account was deleted"); reports kept 180 d; banned hash kept. Documented, so only the Privacy policy wording needs to match | `prepare_account_deletion` | n/a | RISK (disclosure) | Low | Make the policy say message text stays visible to the other party | S |
| B-05 | `account_deleted` email is queued inside `prepare_account_deletion`, before R2 cleanup and the Auth delete; if those fail the user got a goodbye email but the account exists | `deleteAccount.ts` flow | n/a | RISK | Low | Queue the email after `deleteUser` succeeds | S |
| B-06 | Sentry: `beforeSend` scrubs user/request/extra/breadcrumbs, but 5% performance transactions (`tracesSampleRate 0.05`) bypass `beforeSend` (no `beforeSendTransaction`), and exception messages and route names with ids are not scrubbed | `lib/sentry.ts:46-58` | n/a | RISK | Low | Add `beforeSendTransaction` (strip ids from names) or set traces to 0 | S |
| B-07 | Apple privacy manifest: app config declares UserDefaults CA92.1 and FileTimestamp C617.1 only; generated prebuild also has SystemBootTime 35F9.1; DiskSpace not declared. Tracking false, no tracking domains | `app.config.ts:139-152`, `ios/OnlySwap/PrivacyInfo.xcprivacy` | Archive privacy report not generated | RISK / NOT TESTED | Low | Run Xcode "Generate Privacy Report" on the archive; add missing reasons to `privacyManifests` | S |
| B-08 | PostHog identity hash is `sha256("onlyswap:"+user_id)` without a secret; anyone holding a user id can compute it | `lib/analytics.ts` identify | n/a | RISK | Low | Acceptable (ids are not public); note only | - |
| B-09 | 18+ gate enforcement | See A-03 (retry bypass, High) and A-04 (client-asserted) | pgTAP sec_05 | FAIL | High (A-03) | See A-03 | S |

## Checks that PASS

| ID | Check | Evidence |
|---|---|---|
| B-10 | PostHog: exactly the 18 events of PRD 5.4 (`EVENT_NAMES`), values pass a strict regex and numeric cap, `personProfiles identified_only`, replay off, geoip off, lifecycle events off, opt-out stored first and honoured | `lib/analytics.ts` |
| B-11 | Sentry `sendDefaultPii:false`, no screenshots/view hierarchy, http breadcrumbs dropped, opt-out drops events, DSN only via `EXPO_PUBLIC_SENTRY_DSN` | `lib/sentry.ts` |
| B-12 | Permissions: iOS camera and photos strings only, no location, no microphone, no Face ID, no ATT, `NSAllowsArbitraryLoads=false`; dev-only network keys stripped from release; Android blocks location, READ_MEDIA_*, storage, contacts, record audio, AD_ID, exact alarms, foreground service (35 `tools:node="remove"` entries); photos use the system picker | `app.config.ts:24-60,178-230`, `plugins/withReleaseHardening.js`, generated manifest |
| B-13 | Account deletion in app (Settings) and on web (`apps/site/src/pages/delete.astro`, email code then the same `delete-account` function); typed confirmation; 3/day limit; R2 prefixes for avatar, listings, share cards deleted; open-report evidence moved to the private bucket first; Auth user delete cascades profile data; underage mode only for accounts with an `age_blocks` row | `deleteAccount.ts`, `prepare_account_deletion` |
| B-14 | Data export: `export-data` (JWT, rate limited, JSON to private bucket, presigned GET with expiry, row in `data_exports`) covers profile, settings, listings, offers, chats, messages, swipes, saves, ratings, Quad posts/votes, push token ending only | `export_user_data` (gap: B-02) |
| B-15 | UGC safety (Apple 1.2): `create_report` for listing, user, chat, message, Quad post, Quad reply with 15 reasons and evidence snapshot, rate limit 20/day; `block_user`/`unblock_user` (instantly closes chat access); Quad hide author and keyword mute; banned-word `check_text` on listings and Quad (PII patterns blocked); admin moderation with reasons, audit log, appeals; priority-1 reasons for threats, self-harm, minors | RPC list, `create_report`, `quad.test.sql` |
| B-16 | Push token handling: registered by RPC, platform and version validated, disabled on sign-out, only `token_ending` exported | `lib/push.ts`, `register_push_token` |

## Play Data safety (derived from code, for the form)

| Data type | Collected | Shared | Purpose | Optional | Source |
|---|---|---|---|---|---|
| Email address | Yes (school email, OTP) | No | Account, verification | No | Supabase Auth |
| Name | Yes (first name, last initial, display name) | Shown to other students | Profile | No | profiles |
| Photos | Yes (listing, avatar; chat/Quad when on) | Visible to campus | App function | Yes | R2 |
| Other user content: listings, offers, messages, Quad posts | Yes | Offers/messages to the counterparty | App function | No | RPCs |
| User IDs | Yes | PostHog gets a hashed id | Analytics, functionality | Analytics opt-out | analytics.ts |
| App interactions | Yes (18 PostHog events; `activity_events`) | PostHog (processor) | Analytics, service operation | PostHog opt-out only; `activity_events` not optional (B-01) | |
| Search history | Yes (`activity_events` search text, saved searches) | No | Service operation | No | activity.ts |
| Crash logs / diagnostics | Yes (Sentry, device model/OS, app version) | Sentry (processor) | Diagnostics | Opt-out | sentry.ts |
| Device or other IDs | Push token (Expo) | Expo push service | Notifications | Permission-based | push.ts |
| Approximate/precise location | No | - | - | - | permissions blocked |
| Contacts, microphone, SMS, financial info, health | No | - | - | - | |
Data encrypted in transit (HTTPS); users can request deletion (in app and web). No advertising ID (AD_ID removed), no tracking.

## NOT TESTED
Final privacy policy text versus these findings; Apple App Privacy answers in App Store Connect; device-level confirmation of EXIF removal and permission prompts.
