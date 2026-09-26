# OWNER_TODO.md — Account setup waiting on the owner

Deferred on 2026-09-26 by the owner ("we will set up Supabase later"). Claude keeps building the parts that don't need these. The source of truth for each item is its row in `docs/TASKS.md`.

| # | What to do | TASKS row | What it unblocks |
|---|---|---|---|
| 1 | Supabase: create `onlyswap-staging` (Free plan). An existing Supabase project either becomes staging (if it's an unused OnlySwap project) or gets paused before prod is created. The Free plan allows 2 active projects. | P0-ACC-04 | P1-DB-01 staging link, S3 part B, every session that deploys SQL or functions |
| 2 | Sentry: free Developer plan (no trial), React Native project. Send the DSN to Claude (not a secret). | P0-ACC-08 | P1-LIB-02 |
| 3 | Gmail sender: turn on 2-Step Verification and create an app password named `OnlySwap`. Never paste it in chat; Claude gives a command that stores it in Supabase secrets. | P0-ACC-10 | P1-SPIKE-01 (needs item 1 first) |
| 4 | Supabase `onlyswap-prod`: create it only close to launch. Pause or delete any other active project first. | P0-ACC-04 | release sessions |

When items 1 to 3 are done: Claude finishes S3 part B, then the S3, S4 and S5 PRs merge in that order, followed by later sessions.
