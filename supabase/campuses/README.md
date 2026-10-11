# supabase/campuses

Schools and test data for **staging**, kept as idempotent SQL (data, not schema). None of this is a migration, so production never gets it.

| File | What it is |
|---|---|
| `owu.sql` | Ohio Wesleyan (DEC 91): the campus, the `owu.edu` domain and one meetup spot. Apply with `bash scripts/deploy/add-campus.command owu`. |
| `owu-mock.sql` | OWU mock data and the mock seller bot (DEC 92). Staging only. |
| `owu-mock-remove.sql` | Stops the bot and removes the mock data. |
| `tests/mock_status.test.sql` | pgTAP for the console's Staging tools read (`admin_mock_status`). Not run by CI (see Testing). |
| `mock-photos/` | The listing photos (WebP, full and thumb) uploaded to R2, plus `SOURCES.txt` (all CC0 or public domain). |

## Mock data (staging only, DEC 92)

Lets the owner test the whole app alone on staging, signed in with his own @owu.edu address.

```bash
bash scripts/deploy/mock-data.command owu            # add or refresh (safe to re-run)
bash scripts/deploy/mock-data.command owu --status   # what the bot did lately
bash scripts/deploy/mock-data.command owu --remove   # stop the bot, remove the mock data
```

The command checks that the linked Supabase project is the staging one from `.env.staging`, uploads the photos to `onlyswap-media-staging` (keys `c/mock/l/<name>_full.webp` and `_thumb.webp`, public through the media Worker), runs the SQL with the Keychain database password (like `add-campus.command`) and prints a summary. Output goes to `mock.log` (git-ignored).

What it adds on the OWU campus:

- 6 mock users on the test domain `mock.onlyswap.test` (never real @owu.edu addresses): Maya R., Jordan T., Priya S. and Eli W. sell; Theo M. and Nora B. are the mock buyers. Onboarding is finished (18+, current rules). Ids start with `b0000000-`.
- 24 listings with photos (22 for sale, 2 free) spread over the last 4 days, so Discover, search and Around campus have items. Ids start with `b1000000-`.
- 2 free food posts that expire after 2 to 3 hours (run the command again to bring them back) and 2 Wanted posts (a mini fridge, a bike lock).

### The bot

`mock.tick()` runs every minute (pg_cron job `mock_bot`). It acts as the mock user through the same RPCs the app calls, by setting the request JWT claims for the transaction, so every rule (offer limits, chat only after accept, meetup windows) applies as it would on a phone. It only acts on deals between a mock user and a real person.

| You do | The bot does |
|---|---|
| Make an offer on a mock listing | The seller accepts within 1 to 2 minutes (at least 20 to 50 s after the offer, on the next run) and says hi in the chat. A first offer under 60% of the price gets one counter halfway instead. |
| Send a chat message | One short reply 15 to 40 s later, at most one every 2 minutes and 8 per chat. |
| Suggest a meetup | The other side confirms it. If nobody suggests one within 10 minutes of the chat opening, the mock user suggests one. |
| Answer "Did it sell?" with done | The mock side answers done too (a mock seller marks it sold) and leaves a thumbs up. |
| Post a sale or free item | 2 to 5 minutes later a mock buyer offers about 85% of the price (the asking price if firm, nothing for free). One mock offer per listing. "I have this" on a mock Wanted gets the offer from its poster, up to their max. |
| Counter a mock buyer's offer | The mock buyer accepts the counter. |

Every action is logged in `mock.log` (see `--status`); a failing action is retried at most 3 times.

### Staging tools in the admin console

`owu-mock.sql` also adds `public.admin_mock_status()` (owner with the two-step check, read only, no audit row). The console built for staging (`VITE_APP_ENV=staging`, set by `cloudflare-staging.command`) shows it under **Settings > Staging tools**: mock students and listings, the `mock_bot` job (on or off, last run, runs and failures in 24 hours), what the bot did lately and its failures. A production build never shows the section or its address. On a server without the mock data the function doesn't exist and the section says "Mock data isn't installed on this server". After changing the SQL, run `mock-data.command owu` again to install it.

### Testing

The mock SQL isn't a migration, so CI never loads it and `supabase test db` doesn't run `tests/`. On a local database with the migrations applied:

```bash
supabase db reset                       # migrations + seed
psql "$DB_URL" -f supabase/tests/000_setup.test.sql
psql "$DB_URL" -f supabase/campuses/tests/mock_status.test.sql   # loads owu.sql + owu-mock.sql itself, rolls back
```

### Removing

`--remove` unschedules the job, drops `admin_mock_status` and the `mock` schema, deletes the test domain and deletes the mock users and listings. Real people's deal data is never deleted or changed: a mock user who shares an offer, chat, rating, report or block with a real person is kept and switched off (`suspended`), and a mock listing a real person made an offer on, chatted about or answered with "I have this" is soft-deleted instead, because a hard delete would cascade into their rows. Saves, swipes and watches of deleted mock listings go with them. The R2 photos are deleted only when nothing points at them any more.
