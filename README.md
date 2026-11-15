# OnlySwap

A campus marketplace for verified students: discover listings, make an offer, chat after acceptance, and arrange an in-person meetup. The product also includes “The Quad”, a moderated campus board.

## Current status

**In development.** This repository contains application and backend source as well as the design and product specifications: an Expo mobile app, browser application, admin interface, public site, media worker, Supabase migrations/functions, and test suites. Source and completed checklist items are not a claim that every flow has passed device testing or is ready for public launch.

For implementation progress, start with [the task checklist](docs/TASKS.md), [verification gates](docs/GOALS.md), and [CI runs](https://github.com/Wasif-Karim03/OnlySwap/actions/workflows/ci.yml). Local integration checks, device checks and release requirements are distinct gates.

## Engineering focus

- TypeScript applications backed by Postgres policies and RPC contracts.
- Separate student, administration, public-site and media components.
- Automated checks for code, database behavior, contracts and mobile build configuration.
- Documented product, security, accessibility and release requirements.

## What's here

| Path | What |
|---|---|
| `apps/` | Student mobile/web, admin, and public-site source. |
| `supabase/` | Database migrations, functions, seed data and policy tests. |
| `packages/` | Shared types, validation and design tokens. |
| `workers/media/` | Media delivery worker. |
| `e2e/` | Browser-flow checks. |
| `design/OS_FInal Design.html` | Full design board: 212 frames covering the app, web, admin, store assets and handoff. Open it in a browser. The color and logo switchers at the top work. |
| `design/source-parts/` | Source files for the board. Rebuild with `design/build.sh`. |
| `design/concepts/` | Early prototypes, logo concepts and color explorations |
| `docs/PRD.md` … `docs/DECISIONS_LOG.md` | **Locked spec**: PRD, design system, architecture, data model, API, security, testing, release, tasks, decisions |
| `docs/REVIEW.md` | Pre-build review: 102 findings, decisions, open questions, verdict |
| `docs/OnlySwap-Build-Plan.md` | Research plan: stack, free-tier limits, store research |
| `docs/archive/` | Superseded blueprint v0 (history only) |
| `docs/research/` | Market research and the engagement memo |
| `CLAUDE.md` | Instructions for Claude Code sessions |

## Stack (summary)

- **Mobile:** Expo SDK 57, React Native 0.86, TypeScript and Expo Router.
- **Web interfaces:** see the individual application manifests under `apps/` for the browser app, admin and public site.
- **Backend:** Supabase (Postgres + RLS, Auth, Realtime, Edge Functions, Cron).
- **Photos and web hosting:** Cloudflare R2, Workers and Pages.
- **Notifications:** Expo Push.
- **Monitoring:** Sentry and PostHog.
- **Builds:** EAS.

The running cost target is $0/month. See the build plan for details.

## How to build

Read `CLAUDE.md`, then follow the build order at the end of `docs/TASKS.md`, one session at a time. For example: "Do session S1 (P1-SETUP-01 to P1-SETUP-06)".
