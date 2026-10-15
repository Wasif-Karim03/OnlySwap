# Re-running the audit after fixes

Everything here runs against the LOCAL Supabase in Docker (`supabase start`) or reads the repo. Never point any script at the hosted project.

```bash
PGURL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

| What | Command | Pass looks like |
|---|---|---|
| Security scans (gitleaks history, trufflehog, osv-scanner, pnpm audit, semgrep, bundle scan, db lint) | `bash audit/scripts/scan/run-security-scans.sh` | no new findings vs `audit/raw/sec-*` |
| Security pgTAP (RLS per role, IDOR on every id-taking RPC, Quad anonymity, Realtime topics, age gate) | `bash audit/scripts/pgtap/clone-db.sh && bash audit/scripts/pgtap/run.sh` (runs in a scratch clone `audit_sec`, so seeding or other work can't block it) | all 5 files PASS; today A-01, A-02, A-03, A-05 fail on purpose |
| Seed one 5k-user campus | `psql "$PGURL" -v ON_ERROR_STOP=1 -f audit/scripts/seed/seed-load.sql` (about 3 min) then `bash audit/scripts/k6/export-data.sh` | prints row counts |
| Hot-query plans and single-call bench | `bash audit/scripts/seed/explain-rpc.sh <rpc>` / `bash audit/scripts/seed/bench-rpcs.sh` | search under 20 ms, quad feed under 20 ms (E-01, E-02) |
| DB races (two accepts, first offers, accept vs withdraw, duplicate client_id, duplicate reserved id, mark_sold vs send) | `bash audit/scripts/seed/races.sh` | 0 deadlocks on FR-02 (E-05) |
| Load (k6: feed, offer, chat over WebSocket, OTP burst, listing, Quad, mixed) | `brew install k6`; `bash audit/scripts/k6/run.sh <scenario>`; details in `k6/README.md` | p95 < 500 ms, errors < 1% at 250 VUs with search and Quad on |
| Remove the seed | `psql "$PGURL" -f audit/scripts/seed/cleanup.sql` | loadtest.edu gone |
| Client static checks (effects without cleanup, a11y props, contrast, per-route states) | `python3 audit/scripts/effects-scan.py`, `a11y-scan.py`, `contrast.py`, `route-states.py` | compare with `audit/raw/client-*` |
| Long session and memory (needs a simulator or device) | see `audit/notes/C-memory.md` "Run it" | memory plateaus after about minute 10 |
| Rebuild the findings index and scorecard | `python3 audit/scripts/findings-index.py Critical High` | update the IDs in the notes to PASS as you fix them, then re-run |

Notes:
- `audit/scripts/k6/data/` is git-ignored; `export-data.sh` regenerates it from the seed.
- The local Kong gateway caps at 512 connections, so failures above about 500 VUs locally are not hosted behaviour.
- Hosted limits (OTP rate, Realtime 200 sockets, pool size, egress) can only be checked in the Supabase Dashboard or on staging, with the owner's approval.
