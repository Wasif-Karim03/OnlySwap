# OnlySwap load tests (LOCAL Supabase only)

Never point these at a hosted project. Local Docker on a laptop is not hosted capacity: it shares CPU with k6 itself.

## One-time setup
1. `supabase start` (already running for the audit). Do NOT `supabase db reset` while others use the DB.
2. Seed a dedicated campus (loadtest.edu, 5k users, 20k listings, 100k swipes, 45k offers, 200k messages, Quad, 100k notifications):
   `psql "$PGURL" -v ON_ERROR_STOP=1 -f audit/scripts/seed/seed-load.sql`  (about 3 minutes)
   Remove it all later: `psql "$PGURL" -f audit/scripts/seed/cleanup.sql`
   (`PGURL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`)
3. `brew install k6`, then `audit/scripts/k6/export-data.sh` (writes data/*.json with listing, chat and Quad ids).

## Run
`audit/scripts/k6/run.sh <scenario>`; scenarios: `mixed` (all actions), `feed`, `offer`, `chat` (WebSocket Realtime), `quad`, `listing`, `otp`.
- `SCALE=1` stage-length multiplier (mixed uses 1, others 0.5). Stages: 0-100 VUs, 500 VUs (hold), spike to 1000 VUs (hold), ramp down.
- `SMOKE=3 ./run.sh chat` runs 3 VUs for 20 s to check wiring.
- `THINK_MIN/THINK_MAX` (mixed) think time seconds; default 1-3 is roughly 5-10x faster than a real student, `8`/`15` is human pace.
- `HOT=1 ./run.sh offer` sends 80% of offers to 20 listings (viral item).
The runner mints HS256 JWTs for seeded users inside k6 from the local `JWT_SECRET` (read from `supabase status -o env`, never printed or stored), clears `rate_counters` for load users, resets `pg_stat_statements`, samples `docker stats` every 5 s, and writes to `audit/raw/`:
`load-<s>-summary.json` (k6 `--summary-export`), `load-<s>.log`, `load-<s>-docker.txt`, `load-<s>-pgss.txt` (top statements).

## Notes
- 4xx answers are business results and counted separately (`rate_limited`, `business_errors`); failures are 5xx, timeouts, `deadlocks`, `statement_timeouts`.
- Server-side per-user rate limits (e.g. get_feed 120/h, search 120/h) are real; k6 spreads calls over 5000 users to stay under them.
- `upload-url` Edge Function is not served locally (HTTP 503), so the R2 upload step is not tested; `listing.js` sends photo paths only.
- OTP: all VUs share one IP so local GoTrue limits from `supabase/config.toml` [auth.rate_limit] dominate.
- Single-call timings: `audit/scripts/seed/bench-rpcs.sh`; plans: `audit/scripts/seed/explain-rpc.sh <user> "<select rpc>"`; races: `audit/scripts/seed/races.sh`.

## Extra knobs

- `PEAK=250` sets the peak VU count (spike is 2x). `SMOKE=1` runs a short smoke.
- `EXCLUDE=search,quad` removes those scenarios from `mixed.js` (shows the rest scales).
- `HOT=1` (offer.js) sends all offers at one listing to expose lock contention.
- `run-p250.sh` is the second-pass runner (peak 250, spike 500).
- Local Kong caps at 512 worker_connections: above ~500 VUs, and for WebSocket VUs (2 connections each), EOF errors are a local gateway artifact, not hosted capacity.
