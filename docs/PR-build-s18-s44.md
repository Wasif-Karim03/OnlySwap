# PR: build/s17-onward → main (S18 to S44)

## What

Everything from the swipe deck to store prep, built under DEC 56 (one branch,
a tag per session, device checks in one testing phase at the end).

| Sessions | What |
|---|---|
| S18-S21 | Feed, swipe deck with screen-reader list mode, listing detail, report, search with typo tolerance, saved searches, saved items, seller profiles |
| S22-S27 | Offers (race-safe), inbox with realtime pings, chat (idempotent sends), meetups with share links and no-shows, deal confirm, ratings |
| S28-S31 | Push outbox with prefs, quiet hours and caps; every notification type and cron; email outbox; safety screens; profile and settings |
| S32-S33 | Astro site skeleton, deep links and App Links, update/maintenance/link-error screens, automated a11y audit |
| S34-S36 | Admin RPCs (24, each audited) and the admin console with email code + TOTP |
| S37-S38 | Landing, legal drafts, help, web deletion, headers, sitemap; share pages /l and /m |
| S39 | Sentry + PostHog (18 events, opt-outs), function error reporting, health, backup, keepalive, usage report |
| S40 | test-inbox (staging only), Maestro suite, Playwright site + admin with axe |
| S41 | Security suite, load test, bundle size check, legal bundled in the app with CI diff |
| S42-S44 | Store screenshot flow + export script, listing and reviewer notes draft |

Decisions: DEC 57 to 74 in `docs/DECISIONS_LOG.md`. Per-session notes: `docs/BUILD_PROGRESS.md`.

## Sandbox gates (all PASS)

- G1 lint + prettier; G2 typecheck (mobile, admin, site, e2e)
- G3 Jest 45 suites / 5,445 tests; node tests 79 + site 16 + admin 5
- G7 pgTAP 900 assertions, all suites
- G4 contract regenerated (105 functions); db.ts updated
- Playwright site + admin: 11 pass locally (10 skip without staging data)
- Load: get_feed p95 1.1 ms, search p95 182 ms, 21 MB at 10k listings

## Mac and device (G7-G11)

`bash scripts/verify/all.sh`, then the device testing phase (TESTING §3, §4),
Maestro (`apps/mobile/.maestro/README.md`).

## Not done here (owner)

`docs/OWNER_TODO.md` items 1-15: accounts, secrets, deploys, legal text review,
beta, store submission. Unticked tasks: P11-BETA-01, P14-E2E-01, P14-SEC-01 (live
half), P14-PERF-01 (device metrics), P14-LEGAL-01 (final text), P14-BAK-02,
P14-OPS-01, P15-*, P16-STORE-01..07, P17-*.
