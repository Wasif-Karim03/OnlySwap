# Build progress (DEC 56)

One branch, `build/s17-onward`, a git tag per finished session (`sNN-done`).
Each session: sandbox gates pass (lint, tsc, Jest, pgTAP, rpc contract) before its tag.
Device checks (G8) are deferred to the testing phase at the end.

| Session | Status | Tag | Notes |
|---|---|---|---|
| S17 Sell 2 | done | s17-done | Mac verify PASS (2026-09-28); G8 deferred; fix e52dbba (stale reservation) |
| S18 Feed backend + deck | done (sandbox) | s18-done | feed RPCs + pgTAP 34; SwipeDeck/SwipeCard + list mode; 60 fps check (Perf-02) in testing phase |
| S19 Discover + listing | done (sandbox) | s19-done | get_listing (DEC 57) + pgTAP 12; Discover deck/queue/undo/coach/end/day-one; listing buyer/owner/hold/gone; options + report; photo viewer. Offer sheet route lands in S22 |
| S20 Search | done (sandbox) | s20-done | search RPCs + saved searches + trending cron (DEC 58), pgTAP 24; Search, Results grid, Filters sheet |
| S21 Saved + profiles | done (sandbox) | s21-done | get_saved, get_profile (DEC 59) pgTAP 14; Saved items/searches; seller profile with block/report |
| S22 Offers backend | done (sandbox) | s22-done | offer RPCs + expire cron (DEC 60), pgTAP 51; offer-race.mjs for the Mac |
| S23 Offers UI | done (sandbox) | s23-done | offer sheet, inbox (realtime user channel, trg_offers_ping), offer screen E3-E8, listing offers; two-device loop in testing phase |
| S24 Chat core | done (sandbox) | s24-done | chat RPCs + trg_messages_ai (DEC 61) pgTAP 26; useChat store (merge, catch-up, ordered offline queue); two-device realtime in testing phase |
| S25 Chat UI | done (sandbox) | s25-done | chat screen (deal bar, safety tip, scam hint, pending/failed, blocked/closed/deleted), chat details (mute, report, block, hide) |
| S26 Meetups | done (sandbox) | s26-done | meetup RPCs + reminders/no-show crons (DEC 62) pgTAP 34; plan sheet, MeetupCard in chat, meetup day screen |
| S27 Deals | done (sandbox) | s27-done | confirm_deal, submit_rating, get_my_rating, deal_checks, wind-down notifications, account-deletion chat close (DEC 63) pgTAP 27; Did it sell, Mark sold, Rate, store review |
| S28 Push | done (sandbox) | s28-done | push SQL (claim/finish/receipts/quiet/cap, DEC 64) pgTAP 29; send-push + push-receipts functions (node tests); lib/push.ts; P9-PUSH-01 is OWNER_TODO 10 |
| S29 Notifications + email + cron | done (sandbox) | s29-done | listing triggers, all §6 crons, email outbox + send-email + archive-chats functions, demo bot (DEC 65) pgTAP 32; F09/F11 screens; fire-all-notifications.ts |
| S30 Safety screens | done (sandbox) | s30-done | get_account_status, list_blocked (DEC 66) pgTAP 7; account status + appeal, report timeline, blocked, safety center, help, delete account |
| S31 Profile + settings | done (sandbox) | s31-done | get_me, my_listings, listing_stats (DEC 67) pgTAP 9; F01-F08, F10, F12, F14, F15, F18 |
| S32 Site foundation + deep links | done (sandbox) | s32-done | apps/site Astro skeleton + well-known generator (node tests), App Links intent filter, +native-intent rewrite, X11/X12/X14/X31 (DEC 68); AASA/App Links verification is OWNER_TODO 11 |
| S33 A11y + beta start | done (sandbox) | s33-done | automated a11y audit over main screens (role + name on every control, list mode); manual VoiceOver/TalkBack walk and P11-BETA-01 (OWNER_TODO 12) in the testing phase |
| S34 Admin 1 | done (sandbox) | s34-done | 0031_admin: 24 admin RPCs with require_admin + one audit row each (DEC 69) pgTAP 34 (T-INT-ADMIN-01/02/04); apps/admin Vite + React + TanStack Router, email code + TOTP gate, 8 h session, node tests 5; Pages deploy is OWNER_TODO 13 |
| S35 Admin 2 | done (sandbox) | s35-done | overview, reports queue + detail + actions, appeals, users + user detail (pause, suspend, ban, re-verify, clear strike, change email) |
| S36 Admin 3 | done (sandbox) | s36-done | listings (held queue, remove, restore), report-gated chat reading, campuses (status, dials, domains, meetup spots with police date), flags/config, audit log + CSV |
| S37 Site pages | done (sandbox) | s37-done | landing with campus progress + school check (waitlist + Turnstile), 7 legal pages from markdown (drafts for owner review, DEC 70), help FAQ + support form, web deletion, 404, headers/CSP, sitemap, robots; 0032 public RPCs pgTAP 10; node tests; Lighthouse and live URLs in the testing phase |
| S38 Share pages | done (sandbox) | s38-done | Pages Functions /l/:id (OG, blurred wall, app banner) and /m/:token (status, 60 s refresh, expired page); node tests cover E2E-W02/W03 logic; iMessage preview check in the testing phase |
| S39 Monitoring + ops | done (sandbox) | s39-done | lib/sentry + lib/analytics (18 events wired, T-DATA-01 Jest), Sentry Expo plugin + metro, functions error reporting (_shared/monitor.ts, node tests), health function, backup/keepalive/usage-report workflows, usage-report.ts (node tests), runbooks restore + monitoring (DEC 71). Owner: accounts, secrets, UptimeRobot, the restore drill (P14-BAK-02) and keystore backup (P14-OPS-01), OWNER_TODO 14 |
| S40 E2E | done (sandbox) | s40-done | test-inbox function + guard (node tests), staging E2E domain, TOTP on in config; Maestro suite (18 YAML files, parsed) waiting for the Mac run (P14-E2E-01 not ticked); Playwright e2e/web: 11 pass locally against built site + admin incl. axe, 10 skip without staging data (DEC 72) |
| S41 Hardening + legal | partly done (sandbox) | s41-done | security.test.sql 20/20, full pgTAP 900/900; security.mjs (live, Mac); load/feed.sql: feed p95 1.1 ms, search p95 182 ms, 21 MB at 10k listings; bundle size check; legal bundled in the app with CI diff and an offline legal screen (DEC 73). Not ticked: P14-SEC-01 (live half), P14-PERF-01 (device metrics), P14-LEGAL-01 (owner finalizes the text) |
