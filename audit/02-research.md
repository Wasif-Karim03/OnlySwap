# 02 Research: standards, free-tier limits, tools, targets
Date: 2026-10-14. Sources fetched live this session unless marked UNVERIFIED (from memory or secondary sources).

## A. Checklist (each item has a source)

### A1. OWASP MASVS v2 / MASTG (https://mas.owasp.org/MASVS/ , https://mas.owasp.org/MASTG/)
Groups: STORAGE-1/2, CRYPTO-1/2, AUTH-1/2/3, NETWORK-1/2, PLATFORM-1/2/3, CODE-1..4, RESILIENCE-1..4, PRIVACY-1..4.
- [ ] STORAGE: no tokens/PII in AsyncStorage/MMKV unencrypted; session in SecureStore/Keychain; no sensitive data in logs, screenshots, backups, clipboard, keyboard cache; Sentry/PostHog scrubbing.
- [ ] CRYPTO: no hardcoded keys; no custom crypto; MMKV encryption key not in bundle.
- [ ] AUTH: server-side enforcement of every check (RPC + RLS), OTP rate limits, session expiry/refresh, step-up for sensitive actions.
- [ ] NETWORK: TLS only, ATS/cleartext off (Android `usesCleartextTraffic=false`), no debug proxies in release; pinning optional (RESILIENCE/NETWORK-2 judgement call).
- [ ] PLATFORM: deep link/universal link validation (`/l`, `/m`), no exported components without need, WebView off or locked, intent/URL param validation, push payload not trusted.
- [ ] CODE: dependency CVE scan, release build with debug off, no `console.log` secrets, source maps not shipped to clients, up-to-date SDKs.
- [ ] RESILIENCE (L2, optional for marketplace): Hermes bytecode, no root/jailbreak requirement. Treat as low priority.
- [ ] PRIVACY: data minimization, EXIF stripped, no location permission, deletion in app + web, consent for telemetry, privacy labels match reality.

### A2. OWASP API Security Top 10 2023 (https://api-security.owasp.org/editions/2023/en/0x11-t10)
- [ ] API1 BOLA: every RPC taking an id checks ownership/participation (listings, offers, chats, reports, media presign).
- [ ] API2 Broken auth: OTP brute force, verify limits, JWT expiry, admin TOTP.
- [ ] API3 BOPLA: RPC/view column exposure (no `select *` of profiles; mass assignment in update RPCs).
- [ ] API4 Unrestricted resource consumption: pagination caps, presign quotas, image size caps, message length, per-user rate limits in RPC, Edge Function CPU 2 s.
- [ ] API5 BFLA: `admin_*` RPCs need `private.require_admin()`; `anon`/`authenticated` EXECUTE grants on security definer functions reviewed.
- [ ] API6 Sensitive business flows: offer spam, swipe scraping, account farming, report abuse, referral/OTP abuse.
- [ ] API7 SSRF: Edge Functions/Workers that fetch user-supplied URLs (link previews, image URLs).
- [ ] API8 Misconfig: CORS on Worker/Edge, verbose errors, default keys, public buckets, service key exposure.
- [ ] API9 Inventory: rpc-contract.json vs deployed functions, old `_v1` RPCs, staging endpoints exposed.
- [ ] API10 Unsafe consumption: Expo push receipts, SMTP/Resend responses, webhook signature verification.

### A3. Supabase
Production checklist https://supabase.com/docs/guides/platform/going-into-prod :
- [ ] RLS on all tables; SSL enforcement; network restrictions; org MFA, multiple owners.
- [ ] Email confirmations on; OTP expiry <= 1 h; custom SMTP (built-in is 2/hour); "custom SMTP defaults to 30 new users per hour" so raise the auth email rate limit before launch.
- [ ] Run Security Advisor and Performance Advisor; indexes for query patterns; `pg_stat_statements`; load test with k6 on staging.
- [ ] Free projects pause after 7 days of low activity and have no downloadable backups (take own `pg_dump` via GitHub Action to R2 or similar).
- [ ] PITR when DB expected > 4 GB (paid; not applicable on free).

RLS performance https://supabase.com/docs/guides/database/postgres/row-level-security :
- [ ] Wrap `auth.uid()`, `auth.jwt()`, and security definer calls in `(select ...)` (initPlan).
- [ ] Index every column used in policies (leading column of a btree; a composite PK does not index the second column).
- [ ] Specify `to authenticated` on every policy.
- [ ] Security definer fns: `set search_path = ''`, never in an exposed schema. Views: `security_invoker = true`.

Advisor lints (splinter https://supabase.com/docs/guides/database/database-advisors , repo https://github.com/supabase/splinter):
- Security: 0002_auth_users_exposed, 0007_policy_exists_rls_disabled, 0008_rls_enabled_no_policy, 0010_security_definer_view, 0011_function_search_path_mutable, 0012_auth_allow_anonymous_sign_ins, 0013_rls_disabled_in_public, 0014_extension_in_public, 0015_rls_references_user_metadata, 0016_materialized_view_in_api, 0017_foreign_table_in_api, 0018_unsupported_reg_types, 0019_insecure_queue_exposed_in_api, 0021_fkey_to_auth_unique, 0022_extension_versions_outdated, 0023_sensitive_columns_exposed, 0024_permissive_rls_policy, 0025_public_bucket_allows_listing, 0026/0027_pg_graphql_*_table_exposed, 0028_anon_security_definer_function_executable, 0029_authenticated_security_definer_function_executable.
- Performance: 0001_unindexed_foreign_keys, 0003_auth_rls_initplan, 0004_no_primary_key, 0005_unused_index, 0006_multiple_permissive_policies, 0009_duplicate_index, 0020_table_bloat, 0030_autovacuum_disabled.
- [ ] Expect 0028/0029 hits for `public` security definer RPCs: confirm each is intended (they are the app API) and each calls `require_active()`; move helpers to `private`.

Realtime authorization https://supabase.com/docs/guides/realtime/authorization :
- [ ] Disable "Allow public access" in Realtime settings so private channels are enforced; clients use `config: { private: true }`.
- [ ] Policies on `realtime.messages` (select = receive, insert = send), match `realtime.topic()`, wrap in `(select ...)`, index tables the policy queries.
- [ ] Do NOT `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` in migrations (42501, aborts migration); do not create objects in `realtime` schema.
- [ ] Revoked access persists until JWT expires/refreshes: keep JWT expiry short; policy results cached per connection.

Auth rate limits https://supabase.com/docs/guides/auth/rate-limits : see table B.

### A4. Expo / React Native performance
- [ ] Measure in release builds only; strip `console.*` in production (babel `transform-remove-console`). https://reactnative.dev/docs/performance
- [ ] Lists: FlashList 2, stable `keyExtractor`, memoised row, no inline closures in rows. https://reactnative.dev/docs/performance
- [ ] Animations on UI thread (Reanimated worklets, `useNativeDriver`); no heavy JS during gestures.
- [ ] Profile: React Native DevTools + Hermes profiler, Perf Monitor (JS FPS vs UI FPS). https://reactnative.dev/docs/profiling
- [ ] Bundle: Expo Atlas to inspect bundle; `expo-doctor` clean. https://docs.expo.dev/guides/analyzing-bundles/
- [ ] EAS Update: runtime version policy, channels, staged rollout, republish previous update to roll back; native/permission/SDK changes need a new build; each MAU that downloads an update counts. https://docs.expo.dev/eas-update/introduction/
- [ ] Android target API 36 for new apps and updates from 2026-08-31 (extension to 2026-11-01 possible). https://support.google.com/googleplay/android-developer/answer/11926878

### A5. Apple App Review (https://developer.apple.com/app-store/review/guidelines/)
- [ ] 1.2 UGC: objectionable-content filter, report with timely response, block abusive users, published contact info. No random/anonymous chat or "hot-or-not".
- [ ] 1.2.1(a)/age: age restriction mechanism; answer age rating questions honestly (2.3.6). 18+ gate is declared, not verified by Apple.
- [ ] 1.4 physical harm / meeting strangers: in-person meetup copy points to public spots; no encouragement of risky behaviour.
- [ ] 5.1.1(v): account deletion in app (not just deactivation). 5.1.1(i): privacy policy in metadata and in app.
- [ ] 2.1(a): demo account with working backend; this app is campus-email-OTP gated, so provide a review account plus a fixed OTP bypass or prefilled mailbox in review notes (or ask Apple-approved demo mode).
- [ ] Privacy manifest: PrivacyInfo.xcprivacy with required-reason APIs (FileTimestamp, SystemBootTime, DiskSpace, UserDefaults, ActiveKeyboards); ITMS-91053 on missing reasons. https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api . Third-party SDK manifests/signatures: https://developer.apple.com/support/third-party-SDK-requirements/
- [ ] Privacy nutrition labels match PostHog/Sentry/push token collection. UNVERIFIED: current minimum Xcode/iOS SDK for uploads (check App Store Connect "Upcoming requirements").

### A6. Google Play
- [ ] UGC policy: users accept terms before creating UGC; in-app reporting; one-to-one messaging requires user blocking; act on reports. https://support.google.com/googleplay/android-developer/answer/9876937
- [ ] Account deletion: in-app path AND a web URL for deletion request, entered in Data safety form; retention disclosed. https://support.google.com/googleplay/android-developer/answer/13327111
- [ ] Data safety form accurate (Sentry, PostHog, push token, photos, email).
- [ ] Photo permissions: use the Android Photo Picker; do not declare READ_MEDIA_IMAGES/VIDEO unless core function needs it. https://support.google.com/googleplay/android-developer/answer/14115180
- [ ] Target API 36 (above). Location: none requested in R1.0 so no declaration. Verify merged manifest has no stray permissions (`expo prebuild` + check `AndroidManifest.xml`).
- [ ] UNVERIFIED this session: new personal developer account closed-testing requirement (12-20 testers for 14 days); check Play Console if the account is a new personal account.

## B. Free-tier limits (verified 2026-10-14)

| Service / limit | Current value | Source |
|---|---|---|
| Supabase DB size | 500 MB per project | https://supabase.com/pricing |
| Supabase egress | 5 GB uncached + 5 GB cached per cycle; no overage billing on Free, over-quota => notification, grace, then restriction (details in Fair Use Policy, not fully stated) | https://supabase.com/docs/guides/platform/manage-your-usage/egress |
| Supabase Auth MAU | 50,000 | pricing |
| Supabase Storage | 1 GB, 50 MB max upload | pricing |
| Realtime concurrent connections | 200 | https://supabase.com/docs/guides/realtime/limits |
| Realtime messages/month | 2 million | pricing |
| Realtime messages/sec | 100; channel joins/sec 100; channels per connection 100; payload 256 KB | realtime/limits |
| Edge Function invocations | 500,000/mo; CPU 2 s/request; 256 MB mem; wall clock 150 s; 100 functions/project | pricing; https://supabase.com/docs/guides/functions/limits |
| Auth built-in email | 2 emails/hour per project | https://supabase.com/docs/guides/auth/rate-limits |
| Auth custom SMTP | rate limit configurable; production checklist says custom SMTP defaults to 30 new users/hour (raise in dashboard) | going-into-prod page |
| Auth per-IP limits | sign-up/otp/recover/resend/magiclink/user: 30 req per 5 min; verify: 30/5 min; token (refresh): 150/5 min; per-user OTP resend window 60 s; MFA 15/min | auth/rate-limits |
| Projects | 2 active | pricing |
| Pausing | after 1 week of inactivity | pricing |
| Backups / PITR | automatic backups not included; cannot download backups; PITR paid | pricing; going-into-prod |
| R2 free | 10 GB-month storage, 1M Class A, 10M Class B per month, egress free (Standard class only) | https://developers.cloudflare.com/r2/pricing/ |
| Workers Free | 100,000 requests/day (UTC reset, error 1027 over), 10 ms CPU/request, 50 subrequests, 128 MB, 100 Workers | https://developers.cloudflare.com/workers/platform/limits/ |
| Pages Free | 500 builds/mo, 1 concurrent build, 20,000 files; Functions requests count against Workers 100k/day; bandwidth not listed (static asset requests unlimited) | https://developers.cloudflare.com/pages/platform/limits/ |
| Expo Push | 600 notifications/sec per project; 100 messages/request; 1,000 receipt ids/request; receipts kept 24 h; payload 4 KiB | https://docs.expo.dev/push-notifications/sending-notifications/ |
| EAS Free | up to 15 Android + 15 iOS builds (pricing page does not say "per month"; docs historically say monthly, treat as monthly), low-priority queue, 45 min timeout; Update: 1,000 MAU, 100 GiB bandwidth, 20 GiB storage, no overage on Free | https://expo.dev/pricing |
| Sentry Developer | 5k errors, 5M spans, 50 replays, 5 GB logs, 1 GB attachments, 1 user, 30-day retention | https://sentry.io/pricing/ |
| PostHog free | 1M events, 5,000 recordings, 1M flag requests, 100k error-tracking exceptions, 1,500 survey responses per month. Third-party sources only; official page did not render the numbers. UNVERIFIED on posthog.com. Ingestion stops at limit, data lost | https://posthog.com/pricing ; https://posthog.com/docs/billing/limits-alerts |
| Gmail SMTP | personal Gmail commonly 500 messages per rolling 24 h (secondary sources; may count recipients), 100 recipients/message, lockout up to 24 h when exceeded. Google Workspace: 2,000 messages / 10,000 recipients/day. Google doc for consumer limit NOT verified | https://serversmtp.com/limits-of-gmail-smtp-server/ ; https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace |
| Resend Free | 3,000 emails/mo, 100/day, 3 domains | https://resend.com/pricing |
| GitHub Actions free | 2,000 min/mo private repos: UNVERIFIED this session | https://docs.github.com/billing |

Could not verify: Supabase Realtime "peak" vs concurrent definition for overage; PostHog official numbers; Gmail consumer limit from Google; EAS "per month" wording; Supabase egress restriction behaviour.

## C. Tool catalogue
Last release dates from GitHub/npm API, 2026-10-14. Installed locally already: gitleaks, osv-scanner, k6 (brew). Not installed: semgrep, trufflehog, maestro, artillery.

| Tool | Checks | Free | Run here | Maintained (last release) | Expo 57 / Hermes / New Arch | Verdict |
|---|---|---|---|---|---|---|
| Semgrep CE | SAST rules (TS, SQL-ish, secrets patterns) | yes (CE, OSS rules) | `brew install semgrep; semgrep scan --config p/typescript --config p/react --config p/owasp-top-ten apps packages supabase/functions workers` | v1.181.0 2026-10-14 | n/a (source scan) | PICK |
| gitleaks | secrets in tree + git history | yes | `gitleaks detect --redact -v` (installed) | v8.30.1 2026-03-21 | n/a | PICK |
| trufflehog | verified secrets, history | yes | `brew install trufflehog; trufflehog git file://. --only-verified` | v3.99.2 2026-10-08 | n/a | SKIP if gitleaks clean; optional second pass |
| osv-scanner | dependency CVEs from pnpm lockfile | yes | `osv-scanner scan -L pnpm-lock.yaml` (installed) | v2.7.0 2026-10-12 | n/a | PICK |
| pnpm audit | CVEs via npm registry | yes | `pnpm audit --prod` | pnpm v12.11.2 2026-10-09 | n/a | PICK (cheap, overlaps osv) |
| MobSF | APK/IPA static analysis, manifest, permissions, trackers | yes | `docker run -p 8000:8000 opensecurity/mobile-security-framework-mobsf` then upload release APK | v4.5.3 2026-09-21 | scans binary; fine with Hermes (limited JS insight) | PICK for manifest/permission/ATS check on a release APK; SKIP iOS dynamic |
| supabase db lint | plpgsql_check lint of functions | yes | `supabase db lint --level warning` (needs local DB, Docker on the Mac) | CLI v2.121.0 2026-10-14 | n/a | PICK |
| splinter / Advisors | the lints in A3 | yes | Dashboard Advisors, or run splinter SQL on the DB (https://github.com/supabase/splinter) | 2026.09.1 2026-09-08 | n/a | PICK |
| pgTAP | SQL unit tests (already used) | yes | `supabase test db` | UNVERIFIED (no GitHub release; ships in Supabase image) | n/a | PICK (exists) |
| EXPLAIN (ANALYZE, BUFFERS) | query plans under RLS (`set role authenticated; set request.jwt.claims`) | yes | psql | n/a | n/a | PICK for feed, inbox, chat list RPCs |
| pg_stat_statements | slowest/most-called queries | yes (ext on Supabase) | `select * from pg_stat_statements order by total_exec_time desc limit 20` or Dashboard Query Performance | n/a | n/a | PICK after a k6 run |
| index_advisor | suggests indexes | yes | `select * from index_advisor('select ...')` (Supabase extension) | v0.2.0 2024-04-03 (stale but stable) | n/a | PICK as hint only; verify with EXPLAIN |
| k6 | HTTP + WebSocket load (use `k6/experimental/websockets` or `k6/ws` for Realtime Phoenix protocol) | yes | `k6 run script.js` (installed) | v2.3.0 2026-09-21 | n/a | PICK; Supabase recommends it. Run against staging project only |
| Artillery | HTTP/WS/Playwright load | yes | `npx artillery run test.yml` | 2.0.34 2026-10-13 | n/a | SKIP, k6 already installed and covers need |
| Maestro | E2E on simulator/emulator (project already uses) | yes (CLI) | `curl -Ls "https://get.maestro.mobile.dev" | bash; maestro test apps/mobile/.maestro` | cli-2.11.0 2026-09-29 | works with RN/Expo dev builds | PICK (exists) |
| Detox | gray-box E2E | yes | `npx detox` | 20.51.4 2026-09-04 | RN New Arch supported in recent versions: UNVERIFIED for RN 0.86 | SKIP (duplicates Maestro, heavy setup) |
| Flashlight | Android perf score (FPS, CPU, RAM) on release APK | yes | `curl https://get.flashlight.dev | bash; flashlight test --bundleId ... --testCommand "maestro test flow.yaml"` | v0.18.0 2024-07-04 (stale) | black-box, works on any APK; Android only | PICK with caution; stale but fine for relative runs |
| Reassure | render-time regression tests in Jest | yes | `npx reassure init` | 1.6.0 2026-07-22 | RN Testing Library based, JS only | PICK for deck card + chat row |
| React Native DevTools / Hermes profiler | JS CPU profile, React Profiler, memory | yes | `j` in Metro, or Dev Menu; release profiling via `npx react-native profile-hermes` (RN docs) | ships with RN 0.86 | native to Hermes/New Arch | PICK |
| why-did-you-render | finds avoidable re-renders | yes | `@welldone-software/why-did-you-render` dev-only | v10.0.1 2025-01-18 | React 19 support: UNVERIFIED | SKIP, React Profiler "why did this render" plus Reassure suffice |
| Expo Atlas | bundle treemap | yes | `EXPO_ATLAS=1 npx expo export` then `npx expo-atlas` | 0.5.0 2026-10-14 | built for Metro/Expo | PICK |
| Hermes heap snapshots | JS leaks | yes | DevTools Memory tab, take snapshots before/after 20 deck swipes and chat open/close | with RN | yes | PICK |
| Xcode Instruments | iOS Allocations, Leaks, Time Profiler, Animation Hitches | yes (Mac) | Xcode > Product > Profile on release build | n/a | yes | PICK (iOS, Mac only) |
| Android Studio Profiler | CPU/memory/energy | yes | attach to release-ish (profileable) build | n/a | yes | PICK |
| Perfetto | system traces, startup, jank | yes | https://ui.perfetto.dev with `adb shell perfetto` or Android Studio system trace | n/a | yes | PICK for cold start and swipe jank on mid-range device |
| tsc | type errors | yes | `pnpm typecheck` | n/a | strict mode | PICK (exists) |
| ESLint react-hooks | hook deps, React Compiler rules | yes | `pnpm lint`; plugin 7.x | eslint-plugin-react-hooks 7.1.1 modified 2026-10-14 | n/a | PICK; confirm `exhaustive-deps` is `error` |
| knip | unused files/exports/deps | yes | `npx knip` | 6.41.0 modified 2026-10-09 | needs Expo Router entry config | PICK (report-only) |
| expo-doctor | SDK/dep mismatch, config | yes | `npx expo-doctor` | 1.20.4 2026-10-03 | built for SDK | PICK (exists) |
| Accessibility Inspector | iOS a11y audit, labels, targets | yes (Xcode) | Xcode > Open Developer Tool | n/a | yes | PICK |
| Android Accessibility Scanner | touch target, contrast, labels | yes | install from Play Store on emulator/device | n/a | yes | PICK |

## D. Performance targets (justified)
- Frame rate: 60 fps = 16.67 ms/frame on both threads (https://reactnative.dev/docs/performance); Android treats >16 ms as slow, >700 ms as frozen, and lists 11 ms for 90 fps and 8 ms for 120 fps (https://developer.android.com/topic/performance/vitals/render). Target: swipe deck holds 60 fps on a mid-range Android (UI + JS), 120 fps on ProMotion iPhones where Reanimated runs on the UI thread. Acceptance: no frozen frames (>700 ms), <5% slow frames on deck swipe and feed scroll (the 5% is our own bar, not a source figure).
- JS-thread long task: RAIL says respond to input within 100 ms, work in idle chunks <= 50 ms, animation frame <= 10 ms of own work (https://web.dev/articles/rail); RN docs: a 200 ms JS stall drops ~12 frames. Target: no JS task >100 ms during interaction, none >50 ms during a gesture/animation; any >100 ms is a defect to fix.
- Cold start: Android flags cold start as excessive at about 5 s (warm 2 s, hot 1.5 s) in Play vitals. That threshold is from general knowledge, NOT confirmed this session (the fetched page linked to it, https://developer.android.com/topic/performance/vitals/launch-time). Our target: TTID cold start <= 2.5 s and time-to-first-feed-card <= 4 s on a mid-range Android (e.g. Pixel 6a/Galaxy A-series) on a release build, hard fail at 5 s. Measure with `adb shell am start -S -W` and Perfetto.
- ANR: >5 s unresponsive (Android vitals page above). Target 0.
- Play vitals bad-behavior thresholds (user-perceived crash 1.09%, ANR 0.47%) UNVERIFIED this session; aim for crash-free sessions >= 99.5%.
- Memory: no growth over 20 repeat cycles (deck swipe x50, chat open/close x20) in heap snapshots; our bar.

## E. Scale math (5,000 DAU / 500 concurrent) in one line each
- Realtime: 500 concurrent sockets > 200 cap; focus-scoped sockets (Chat + Inbox only) must keep peak <= ~150-200. 100 msgs/s cap.
- Workers 100k req/day with 10 ms CPU: 5,000 DAU x 40 images = 200k/day, over unless cached on-device or a custom domain with Cache.
- PostHog 1M events/mo: 5,000 DAU x ~6 events/day x 30 = 900k, near cap.
- Gmail 500/day and Resend 100/day cap OTP sign-ins; custom SMTP default 30 new users/hour.
