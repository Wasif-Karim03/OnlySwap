# E / F: Scalability, load and DB races (backend performance audit)

Scope: locked R1.0 spec, branch `audit/production-readiness`. App code untouched. All tests ran on the LOCAL Supabase in Docker (10 CPUs, ~8 GB RAM, Postgres max_connections=100, shared_buffers=128MB, PostgREST pool 10). No hosted service was touched.

## 0. Caveats (read first)

- Local Docker is NOT hosted capacity. k6 and the whole Supabase stack shared the same 10 cores. Absolute numbers are indicative; the ranking of bottlenecks and the per-query costs are the useful output.
- The local Kong gateway caps at 512 worker_connections ("512 worker_connections are not enough", ~22k alerts). Every "EOF" failure above ~500 VUs, and all WebSocket failures at scale, come from this local artifact. They are NOT evidence about hosted Supabase.
- Local auth rate limits were not enforced (1043 OTPs sent in 70 s, 2 x 429). Hosted OTP limits are NOT TESTED.
- `upload-url` Edge Function is not served locally (503). R2 upload path is NOT TESTED.
- Realtime 200-connection cap is NOT TESTED (Kong died first). Socket maths below is arithmetic only.
- Free-tier limits come from web search (secondary sources) plus `docs/ARCHITECTURE.md` section 6. Items marked (unverified) must be re-checked on the vendor pages.
- Seed: campus `90000000-0000-4000-8000-000000000001` (domain loadtest.edu): 5,000 users, 20,000 listings (49,961 photos), 100,452 swipes, 44,802 offers, 11,141 chats, 200,000 messages, 3,000 quad posts (+~15k replies, ~40k votes), 100,844 notifications. Removal: `audit/scripts/seed/cleanup.sql`.

## 1. Findings

Format: ID | what | how | evidence | status | severity | fix | effort

| ID | What | How | Evidence | Status | Sev | Fix | Effort |
|---|---|---|---|---|---|---|---|
| E-01 | `search_listings` and `search_suggest` scan every campus listing. Predicate `private.text_matches(l,q)` is an opaque function (ts match OR word_similarity>=0.5), so the GIN indexes on `search` and `title` are never used. ~35 us/row x ~10.7k rows = 200 to 350 ms per call. `search_listings` also uses OFFSET paging. Typeahead (`search_suggest`, 600/h limit) fires per keystroke. | auto_explain nested plans, single-call bench, pg_stat_statements under mixed load | `raw/explain-search_listings.txt`, `explain-search_suggest.txt`, `explain-bench-rpcs.txt` (302 / 203 / 304 ms warm). In `load-mixed-p100-pgss.txt` these two = 47% + 46% of all DB time (351 calls each, mean ~1.3 s under load). | FAIL | Critical | Rewrite as UNION of two indexable branches (`search @@ tsq` on GIN, `title %> q` on gin_trgm_ops), keyset paging, min 2 to 3 chars and client debounce, cap suggest to 5 rows. | M |
| E-02 | `get_quad_feed` seq-scans all campus posts and computes `quad_hot` / `quad_hidden_for` per row, OFFSET paging. 144 ms (hot), 79 ms (new) at 3k posts; grows linearly with posts. | EXPLAIN ANALYZE, k6 quad scenario | `raw/explain-get_quad_feed_hot.txt`, `..._new.txt`; quad-p500: p95 3341 ms, DB CPU 938%. Quad ships behind a per-campus switch. | FAIL | High | Store a materialised hot score (updated on vote/reply or by cron), index `(campus_id, hot_score desc, id)`, keyset paging. Filter hidden via anti-join on an indexed table. | M |
| E-03 | `activity_events` retention (90 d) vs 500 MB DB cap. 343 B/row incl. 5 indexes; ~64 events per DAU per day (deck_shown per card, swiped_left per swipe, listing_viewed, saved, app_open). | measured bytes/row, arithmetic (section 4) | `raw/load-table-sizes.txt`. 64 x 343 B x 90 d = 1.98 MB per steady-state DAU. 500 MB is gone at ~253 DAU (735 DAU at 10 cards/day). At 5k DAU: 3.4 to 9.9 GB. | FAIL | Critical | Drop `deck_shown` and `swiped_left` events (derivable from swipes) or sample them; cut retention to 14 to 30 d; drop 3 of 5 indexes; aggregate to daily counters. | S |
| E-04 | Other retention vs 500 MB: swipes (only `dir='left'` pruned at 30 d, rights kept forever), notifications 60 d, messages kept 90 d after chat closes, offers and listings grow forever. | arithmetic with measured bytes/row | Swipes-left 24/day x 152 B x 30 d = 110 KB/DAU = 547 MB at 5k DAU. Notifications 3/day x 352 B x 60 d = 63 KB/DAU = 317 MB. Messages 3/day x 358 B x ~104 d = 112 KB/DAU = 560 MB. Offers ~310 MB/yr, listings ~290 MB/yr. Total far above 500 MB. | FAIL | High | Move to Pro ($25/mo, 8 GB) before 1k DAU, or shorten retention and archive chats to R2. Owner decision (rule 2: $0). | M |
| E-05 | `make_offer` deadlocks on concurrent first offers for one listing. It takes `select ... from listings for share`, then `update listings set offer_count = offer_count + 1`; two sessions each hold SHARE then both want UPDATE. | `races.sh` FR-02, k6 `offer-p250-hot` | 24 clients: 479/480 deadlock failures. 5 clients: 195/200. 2 clients: 3/80. k6 hot run: 47.7% failures, 92 "deadlock detected" in DB log in ~1 min, plus 47 PGRST003 pool timeouts. Free-item drops would trigger exactly this. | FAIL | High | `for key share` or `for no key update` on the listing select, or drop `offer_count` from the hot path (count async / derive). Add pgTAP concurrency test. | S |
| E-06 | PostgREST pool is 10 connections, local `[db.pooler]` disabled. Under saturation requests queue then fail with PGRST003. Hosted Nano/Micro: 60 direct and 200 pooler client connections (Supabase docs); default pool size not confirmed. | k6 logs, PostgREST log | "Connection Pool initialized with a maximum size of 10", 47 PGRST003 in offer-p250-hot. | RISK | Medium | Keep every RPC under ~50 ms (E-01/E-02 first). Do not use session-mode pooling for the app. Check Dashboard pool size on staging. | S |
| E-07 | Media Worker sets `Cache-Control: immutable` but never uses the Cache API, so every image GET runs the Worker plus an R2 GET (Class B). On workers.dev the cap is 100k requests/day. | read `workers/media/src/handler.ts`, arithmetic | ~25 unique images/session x 10k sessions = 250k/day, 2.5x the cap. Breaks at ~2k DAU. | RISK | High | Add `caches.default` match/put in the Worker, serve through a custom domain with Cloudflare cache (planned Q2), or give R2 a public custom domain. | S |
| E-08 | Gmail SMTP (Plan A) caps at 500 recipients/day (24 h suspension if exceeded). Launch day ~2,600 OTP emails. | arithmetic, web research (unverified) | Section 4, free-tier table. | RISK | High | Switch to Resend (Plan B, free 100/day or 3k/mo, check) or another provider before launch; stagger campus launches; raise Supabase custom SMTP rate limit. | S |
| E-09 | Realtime: each chat message calls `realtime.send` 3 times (chat topic plus two inbox topics) from `messages_ai`. Concurrent sockets and messages/month exceed free caps at 5k DAU. | code read, arithmetic | ~125 sockets at peak, ~250 at 2x spike vs 200 cap. ~1.44M broadcasts/mo, ~2.9M counting deliveries vs 2M cap; break-even ~3,470 DAU. | RISK | High | Send inbox broadcast only (drop chat topic when peer not in chat), or poll inbox. Unsubscribe when app backgrounded (already focus-scoped). Pro tier lifts cap. | M |
| E-10 | `get_inbox` and `my_listings` are unbounded (all offers in window plus all chats, `chat_summary` per chat). | code read, bench | get_inbox 1.6 to 3.0 ms at 9 chats, response 19 KB. Cost and size scale with chat count. | RISK | Medium | Add limit + keyset cursor; return counts only for the tab badge. | M |
| E-11 | `cron.job_run_details` is never pruned. ~4,800 rows/day (~1.7 MB/day, ~600 MB/yr) from per-minute jobs. | cron inventory, arithmetic | `raw/explain-cron-timing.txt`. | FAIL | Medium | Add a daily `delete from cron.job_run_details where end_time < now() - interval '3 days'` job (or `cron.log_run = off` for frequent jobs). | S |
| E-12 | Every RPC does a `private.hit()` upsert into `rate_counters` and `require_active` writes `activity_days`: a write per read. `rate_counters` is 2.7 MB for 76 rows (bloat). | pg stats, code read | `raw/load-table-sizes.txt`. Mixed run at one core was still fine (163 rps, p95 18 ms), so impact is write amplification and WAL, not latency. | RISK | Low | Skip `hit()` on read RPCs; tune autovacuum on `rate_counters`; write `activity_days` once per day via cached check. | S |
| E-13 | `get_campus_feed` runs `count(*)` over active listings plus a profiles count on every call. 5.1 ms at 10.7k listings, linear. | bench | `raw/explain-get_campus_feed.txt`. | RISK | Low | Read counts from `refresh_stats` (cron already exists, 425 ms / 10 min). | S |
| E-14 | RLS: 21 policies use bare `auth.uid()` (not `(select auth.uid())`) and `private.is_admin()` per row. | `pg_policies` scan | `raw/explain-policies.txt`. Impact is low: client reads only safe_spots, campuses, categories, profiles directly; everything else is security-definer RPC. | RISK | Low | Wrap in `(select auth.uid())` the next time those policies are touched. | S |
| E-15 | Unindexed FKs: `messages.sender_id` (ON DELETE SET NULL) and `listings.hold_offer_id`. Account deletion seq-scans `messages` (~20 ms at 200k, linear). | FK scan, timing | `raw/explain-unindexed-fks.txt`. | RISK | Low | Add partial indexes `where sender_id is not null`; or batch deletion in `delete-account`. | S |
| E-16 | `cron` load: `refresh_stats` 425 ms every 10 min, `prune_all` 362 ms daily, `refresh_trending` 99 ms, all others under 15 ms. | timed each job on seed data | `raw/explain-cron-timing.txt`. Negligible vs request load at 5k DAU. | PASS | Info | None. Re-time `prune_all` at 10x data. | n/a |
| E-17 | Client N+1 / polling. Swipes batched (`record_swipes` at 10, max 50), events flushed every 15 s (max 50), TanStack staleTime 30 s, refetch on focus. Polling only waitlist 60 s and meetup day 60 s. One supabase-js client, private channels `inbox` and `chat:<id>` focus-scoped. | code read | `apps/mobile/src` (read-only). | PASS | Info | None. | n/a |
| E-18 | `get_feed` uses keyset pagination with a swipes anti-join. | EXPLAIN + load | 2.2 ms single call; feed-p500: p50 3 / p95 8 / p99 20 ms at 394 rps, 0.01% errors, 1000 VUs OK. | PASS | Info | None. | n/a |
| E-19 | index_advisor (hypopg, temporary, dropped) found no worthwhile missing index on the hot queries. | extension run | `raw/explain-index-advisor.txt`. Problems are query shape (E-01, E-02), not indexes. | PASS | Info | None. | n/a |
| E-20 | Egress: JSON responses are large (get_feed 17 KB, get_campus_feed 19 KB, get_inbox 19 KB, search 26 KB). ~244 KB per session raw. | measured sizes, arithmetic (section 4) | 10k sessions/day x 244 KB = 2.4 GB/day, ~73 GB/mo raw vs 5 GB free. Gzip (if applied to the count) gives 4x to 8x, still 9 to 18 GB. | FAIL | High | Trim columns (feed cards need ~6 fields), smaller page for inbox, `Accept-Encoding: gzip` verified, cache `get_campus_feed` client-side longer. Pro plan has 250 GB. | M |
| E-21 | OTP burst: 1043 sends in 70 s, p50 29 / p95 77 ms, 2 x 429. Local limits not enforced, so hosted behaviour unknown. | k6 `otp.js` | `raw/load-otp-summary.json`. | NOT TESTED (hosted) | Medium | Test against staging only with owner approval; verify SMTP rate limit in Dashboard. | S |
| E-22 | R2 upload path (`upload-url` Edge Function plus 2 R2 PUTs per photo). | not served locally | HTTP 503 | NOT TESTED | Medium | Test on staging. Maths: 2,000 photos/day, 300 per peak hour, Class A ~120k/mo (fine vs 1M). | S |
| E-23 | Search/quad drag the whole DB down: at peak 250 VUs with search+quad, 39% 5xx and DB CPU 1302%; without them 0.05% errors at ~1 core. | k6 mixed-p250 vs mixed-p250-nosearch | Section 2. | FAIL | Critical | Same fix as E-01 and E-02. | M |
| FR-01 | Two accepts of two offers on one listing. | `races.sh`, 20 rounds | Exactly one winner in 20/20. `raw/load-races.txt`. | PASS | Info | None. | n/a |
| FR-02 | Concurrent first offers on one listing. | see E-05 | 479/480, 195/200, 3/80 failures. | FAIL | High | See E-05. | S |
| FR-03 | accept_offer vs withdraw_offer interleave. | `races.sh` | Withdraw blocks on `my_offer FOR UPDATE`, then gets OFFER_NOT_PENDING. Final state consistent (accepted, hold, 1 chat). | PASS | Info | None. | n/a |
| FR-04 | `send_message` same `client_id` from two sessions. | `races.sh`, 10 rounds | 0 duplicates, same id returned. | PASS | Info | None. | n/a |
| FR-05 | `create_listing` double submit with same reserved id. | `races.sh`, 10 rounds | Exactly 1 row every round. Second caller gets a `listings_pkey` duplicate key error instead of the first result. | RISK | Low | Catch `unique_violation` and return the existing row (same pattern as send_message). Client retry already recovers. | S |
| FR-06 | `mark_sold(buyer_id)` in flight vs `send_message`. | `races.sh` | Message succeeds; buyer chat stays open by design, other chats close. No race. | PASS | Info | None. | n/a |

## 2. Load results (k6, local Docker, thresholds p95<500 ms and errors<1%)

Scripts: `audit/scripts/k6/`. Raw: `audit/raw/load-*`. JWTs minted HS256 locally. Think time 1 to 3 s.

| Run | VUs (peak / spike) | p50 | p95 | p99 | Error rate | RPS | DB CPU (of 10 cores) | Verdict |
|---|---|---|---|---|---|---|---|---|
| mixed-p500 | 500 / 1000 | 12 ms | 4507 ms | 8475 ms | 58.7% (mostly Kong EOF) | 226 | ~950% | FAIL |
| mixed-p250 (with search+quad) | 250 / 500 | n/r | 9.7 s | n/r | 39% 5xx | n/r | 1302% | FAIL |
| mixed-p250-nosearch | 250 / 500 | 4 ms | 18 ms | 82 ms (max 324) | 0.05% | 163 | ~95% (one core) | PASS |
| mixed-p100 (pg_stat_statements run) | 100 | n/r | 3000 ms | n/r | 8 errors | n/r | high | FAIL (search) |
| feed-p500 | 500 / 1000 | 3 ms | 8 ms | 20 ms | 0.01% | 394 | 151% | PASS |
| offer-p500 | 500 | n/r | 798 ms | n/r | 1.85% (EOF) | n/r | n/r | FAIL |
| offer-p250-hot (one listing) | 250 | n/r | 10 s | n/r | 47.7% (deadlocks, pool timeouts) | n/r | n/r | FAIL (E-05) |
| listing-p500 | 500 | n/r | 1330 ms | n/r | 6.5% (EOF) | n/r | n/r | FAIL (Kong) |
| listing-p250 | 250 | 10 ms | 537 ms | 1377 ms | 0.01% | 167 | n/r | borderline |
| quad-p500 | 500 | n/r | 3341 ms | n/r | 81% | n/r | 938% | FAIL (E-02) |
| chat-p500 (WS) | 500 | n/r | n/r | n/r | 70% (23k WS attempts failed) | n/r | n/r | Kong artifact |
| chat-p150 (WS) | 150 | ws_delivery 7 ms | 16 ms | 39 ms | 8.15% (Kong cap) | n/r | n/r | PASS on delivery; 1248 joins OK, 10 fail |
| otp | burst | 29 ms | 77 ms | n/r | 0.2% (2 x 429) | ~15 | n/r | local limits off |

n/r = not recorded in the summary I kept.

First bottleneck (real): DB CPU saturation from `search_suggest`, `search_listings` and `get_quad_feed` (E-01, E-02). Second: the PostgREST pool of 10 (PGRST003). Third: `make_offer` lock contention on hot listings (E-05). Local-only artifact: Kong 512 connections (the "EOF" failures).

Everything else scales: 163 rps at p95 18 ms on about one core, per-RPC p95 8 to 30 ms.

Single-call warm latency (median ms): get_feed 2.2, get_campus_feed 5.1, get_listing 0.7, my_listings 1.1, get_inbox 1.6 to 3.0, get_messages ~0.7, get_notifications 0.4, get_quad_thread 1.3, admin_list_users_v2 14, search_listings 302 (no query 203), search_suggest 304, get_quad_feed 144 hot / 79 new, admin_overview_v2 349.

## 3. Load maths (5,000 DAU, 500 concurrent peak, 2x spike)

Assumptions: 2 sessions/day/DAU, 6 min per session.

- Sessions per day = 5,000 x 2 = 10,000.
- Concurrent 500 / 6 min per session = 83 sessions/min = 1.39 sessions/s starting.
- Requests per session ~44: get_me 1, get_feed 3, record_swipes 4, get_listing 4, record_view 4, get_campus_feed 2, search_suggest 1.5, search_listings 1, get_inbox 3, get_notifications 1, get_messages 3, send_message 3, mark_chat_read 1, make_offer 0.3, quad feed/thread/vote 1.5 + 1 + 1, track_events 6, save/hide 2.
- Peak RPS = 1.39 x 44 = ~61 rps (call it 62). Spike (2x) = ~124 rps.
- Search RPS at peak = 1.39 x 2.5 = 3.5 rps. DB CPU = 0.30 s x 3.5 = 1.05 cores (peak), 2.1 cores (spike).
- Quad: 1.39 x 1.5 = 2.1 rps x 0.11 s avg = 0.23 core. Everything else (~55 rps x ~3.5 ms) = ~0.19 core.
- Total ~1.5 cores at peak, ~3 cores at spike. A free/Nano or Micro instance (2 shared vCPU) saturates at spike, and under load the search latency inflates (measured mean 1.3 s at 100 VUs). With E-01 fixed (~5 ms/search) the total drops to ~0.4 cores at peak.
- Realtime sockets: ~25% of a session in Inbox/Chat -> 500 x 0.25 = 125 sockets at peak, 250 at spike vs 200 cap (Supabase free).
- Realtime messages: 5,000 x 3.2 sends x 3 broadcasts = 48k/day = 1.44M/mo; counting about 6 deliveries per message ~2.9M/mo vs 2M cap. Break-even 2M / (3.2 x 6 x 30) = ~3,470 DAU.
- Messages per second: 500 concurrent x 3 sends / 360 s = ~4.2/s at peak, ~8.3/s at spike. Fine for Postgres.
- Uploads: ~0.4 photos/DAU/day = 2,000/day. Peak hour 15% = 300/h (~5/min), spike 600/h. R2: 2,000 x 135 KB = 270 MB/day, 10 GB full in ~37 days.
- Worker: ~25 images/session x 10,000 = 250k requests/day vs 100k/day cap.
- OTP launch day: ~2,000 signups x 1.3 (resends) = 2,600 emails, peak hour ~650/h.
- Egress per session (raw JSON): get_feed 3 x 17.4 = 52 KB; get_campus_feed 2 x 18.9 = 38 KB; get_listing 4 x 1.4 = 6 KB; get_inbox 3 x 19 = 57 KB; get_messages 3 x 10.7 = 32 KB; get_notifications 1 x 5.1 = 5 KB; search_listings 1 x 26 = 26 KB; quad feed 1.5 x 7 = 10.5 KB; suggest and misc ~18 KB. Total ~244 KB. x 10,000 sessions = 2.44 GB/day = ~73 GB/mo.
  Break-even for 5 GB: 5 GB / 244 KB = ~20.5k sessions/mo = ~340 DAU (raw JSON). If the egress meter counts gzip, divide by 4 to 8.

DB size at 5,000 DAU (steady state): see E-03/E-04. Sum of retention-bounded tables is ~5 to 11 GB, vs 500 MB.

## 4. Free-tier table (projected at 5,000 DAU)

| Service / limit | Free limit | Projected usage | BREAKS? | Cheapest fix |
|---|---|---|---|---|
| Supabase DB size | 500 MB | 5 to 11 GB (activity_events alone 3.4 to 9.9 GB) | YES (~250 DAU) | Cut event volume + retention (E-03), then Pro $25/mo |
| Supabase egress | 5 GB/mo (one source says 500 MB, unresolved) | ~73 GB raw, 9 to 18 GB gzip | YES (~340 DAU raw) | Slim payloads, cache; Pro 250 GB |
| Supabase compute | Nano, shared CPU, ~0.5 GB | 1.5 cores peak, 3 at spike (with E-01 unfixed) | YES at spike | Fix search first (0.4 core), then Micro/Small |
| Supabase connections | Nano/Micro: 60 direct, 200 pooler clients (docs; default pool size unconfirmed); PostgREST pool 10 | PostgREST needs ~peak rps x latency = 62 x 0.05 = ~3 busy; with search at 0.3 s = 20 busy | YES while E-01 open | Fix slow RPCs; confirm pool size in Dashboard |
| Supabase Realtime concurrent | 200 | 125 peak, 250 spike | YES at spike | Poll inbox, drop chat-topic broadcast, or Pro |
| Supabase Realtime messages | 2M/mo | 1.44M sends, ~2.9M with deliveries | YES (~3,470 DAU) | Reduce to 1 broadcast per message |
| Supabase MAU | 50k | 5k | NO | None |
| Supabase Edge invocations | 500k/mo | `notify_push` ~43k/mo plus upload-url ~60k/mo plus misc | NO | None |
| Supabase pause | After 7 days idle | n/a once live | NO (staging only) | Keep a health ping |
| pg_cron | n/a | 425 ms / 10 min worst job; `job_run_details` +600 MB/yr | Storage only (E-11) | Prune job |
| Auth email (built-in) | ~2 to 4/h (unverified) | 650/h peak | YES | Custom SMTP (already planned) |
| Gmail SMTP (Plan A) | 500 recipients/day | 2,600 launch day | YES | Resend or other (E-08) |
| Cloudflare R2 storage | 10 GB | 270 MB/day | YES at ~37 days | Compress harder (~60 KB per pair), lifecycle delete of removed listings, then $0.015/GB |
| R2 Class A | 1M/mo | ~120k | NO | None |
| R2 Class B | 10M/mo | 250k image GETs/day x 30 = 7.5M if Worker uncached | Close | Cache API (E-07) |
| Workers free | 100k req/day, 1,000/min burst | 250k/day images | YES (~2k DAU) | Cache API + custom domain (E-07) |
| Sentry Developer | 5k errors/mo | depends on bugs; a crash loop burns it | RISK | Sample, rate-limit, `beforeSend` dedupe |
| PostHog | 1M events/mo | Only 18 event types, ~6 per session x 300k sessions = 1.8M | YES (unverified) | Sample high-volume events |
| EAS Update | 1,000 MAU (2023, may be outdated) | 5k | YES (unverified) | Check current plan; ship by store releases |
| EAS Build | 15 builds/mo | n/a | NO | None |

## 5. Re-run

```
bash audit/scripts/k6/run.sh <scenario>     # see audit/scripts/k6/README.md
bash audit/scripts/seed/races.sh
```
Cleanup: `psql ... -f audit/scripts/seed/cleanup.sql`.

## 6. Priority fixes

1. E-03 (activity_events volume/retention) and E-01 (search rewrite): Critical, both small to medium.
2. E-05 (make_offer lock mode): one-line fix, High.
3. E-02 (quad feed), E-07 (Worker cache), E-08 (SMTP), E-09 (Realtime), E-20 (egress), E-04 (retention): High, before the first full-campus launch.
