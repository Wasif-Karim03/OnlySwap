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
