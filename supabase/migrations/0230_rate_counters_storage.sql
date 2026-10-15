-- 0230: keep rate_counters small (audit E-12, DEC 117).
-- Nearly every RPC bumps a row here (private.hit). With the default fillfactor
-- each bump wrote a new tuple on another page and autovacuum waited for 20% of
-- the table to be dead: 2.7 MB for 76 live rows. Room on each page lets the
-- bump be a HOT update (count is not indexed), and vacuum runs every 1000 dead
-- rows. The read-RPC limits themselves stay: API.md specifies them (scraping).

alter table public.rate_counters set (
  fillfactor = 70,
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0,
  autovacuum_analyze_threshold = 1000
);
