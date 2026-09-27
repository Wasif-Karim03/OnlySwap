# OWNER_TODO.md — Account setup waiting on the owner

Deferred on 2026-09-26 by the owner ("we will set up Supabase later"). Claude keeps building the parts that don't need these. The source of truth for each item is its row in `docs/TASKS.md`.

| # | What to do | TASKS row | What it unblocks |
|---|---|---|---|
| 1 | Supabase: create `onlyswap-staging` (Free plan). An existing Supabase project either becomes staging (if it's an unused OnlySwap project) or gets paused before prod is created. The Free plan allows 2 active projects. | P0-ACC-04 | P1-DB-01 staging link, S3 part B, every session that deploys SQL or functions |
| 2 | Sentry: free Developer plan (no trial), React Native project. Send the DSN to Claude (not a secret). | P0-ACC-08 | P1-LIB-02 |
| 3 | Gmail sender: turn on 2-Step Verification and create an app password named `OnlySwap`. Never paste it in chat; Claude gives a command that stores it in Supabase secrets. | P0-ACC-10 | P1-SPIKE-01 (needs item 1 first) |
| 5 | After items 1 and 3: Claude adds a `[remotes.staging]` block to `supabase/config.toml` (Gmail SMTP on 465, sender, the same hooks and templates) and gives you one command that pushes it with the app password typed at a hidden prompt. Then you request a code with your real .edu address. | P3-AUTH-01 (staging part), P3-AUTH-03 | S10 sign-off: "a real .edu inbox gets a code from staging" |
| 6 | Welcome photos: one campus photo you took (buildings or a walkway, no university names, logos or signs) and three photos of real items (fridge, textbooks, monitor). Put them in `apps/mobile/assets/images/welcome/` as `hero.jpg`, `item-fridge.jpg`, `item-books.jpg`, `item-monitor.jpg`; Claude wires the hero in one line. | P4-AUTH-04 | Welcome matches board A2 exactly |
| 7 | Cloudflare (free): create the account, enable R2 (it asks for a card even on the free tier; set a billing alert at $1), create buckets `onlyswap-media-staging`, `onlyswap-private-staging` (and later the prod ones), and an R2 API token scoped to those buckets. Claude then deploys `workers/media` and gives you one command that stores the token as `R2_*` secrets in Supabase (typed at a hidden prompt, never pasted in chat). | P0-ACC-05, P5-MEDIA-01/02/04 staging | photos on staging; T-SEC-18 (R2 refuses a body larger than the signed size) |
| 4 | Supabase `onlyswap-prod`: create it only close to launch. Pause or delete any other active project first. | P0-ACC-04 | release sessions |

When items 1 to 3 are done: Claude finishes S3 part B, then the S3, S4 and S5 PRs merge in that order, followed by later sessions.
