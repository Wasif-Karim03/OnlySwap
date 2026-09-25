# OnlySwap

This is a marketplace only for students at your school. You verify with a .edu email, swipe through listings, make an offer, chat after the seller accepts, and meet at a campus safe-exchange spot. It also has "The Quad", a moderated campus board.

Nothing has been built yet. This repo holds the design, the research, and the complete build blueprint.

## What's here

| Path | What |
|---|---|
| `design/OS_FInal Design.html` | Full design board: 212 frames covering the app, web, admin, store assets and handoff. Open it in a browser. The color and logo switchers at the top work. |
| `design/source-parts/` | Source files for the board. Rebuild with `design/build.sh`. |
| `design/concepts/` | Early prototypes, logo concepts and color explorations |
| `docs/OnlySwap-Build-Plan.md` | Stack, free-tier limits, costs, and store compliance (§19) |
| `docs/blueprint/` | Build blueprint: `screens.md`, `backend.md`, `functions.md`, `tasks.md` (198 tasks), `testing.md`, `launch.md` |
| `docs/research/` | Market research and the engagement memo |
| `CLAUDE.md` | Instructions for Claude Code sessions |

## Stack (summary)

- **App and web:** Expo SDK 57 (React Native 0.86, TypeScript, Expo Router).
- **Backend:** Supabase (Postgres + RLS, Auth, Realtime, Edge Functions, Cron).
- **Photos and web hosting:** Cloudflare R2, Workers and Pages.
- **Notifications:** Expo Push.
- **Monitoring:** Sentry and PostHog.
- **Builds:** EAS.

The running cost target is $0/month. See the build plan for details.

## How to build

Follow the build order in `docs/blueprint/launch.md` §7, one session at a time. For example, "S1: do P1-SETUP-01 through P1-SETUP-06". Tick the boxes in `docs/blueprint/tasks.md` as you go.
