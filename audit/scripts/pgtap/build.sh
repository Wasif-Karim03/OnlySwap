#!/bin/bash
# Assemble sec_*.test.sql = header + begin + no_plan + prelude + body + finish + rollback.
cd "$(dirname "$0")"
mk() { # name header body
  { echo "-- $2"; echo "-- AUDIT (read-only on app code). LOCAL DB only. Runs inside begin..rollback."; echo "-- Run: pnpm -s supabase test db \$(pwd)/audit/scripts/pgtap/$1.test.sql   (or pg_prove -h 127.0.0.1 -p 54322 -U postgres -d postgres)"
    echo "begin;"; echo "select * from no_plan();"; cat _prelude.sql; cat "$3"; echo "select * from finish();"; echo "rollback;"; } > "$1.test.sql"
}
mk sec_01_rls_roles "Per-role RLS and grant matrix: anon, same campus, blocked, other campus, suspended, banned, moderator." _body_rls.sql
[ -f _body_idor.sql ] && mk sec_02_idor "IDOR: every id-taking RPC called with someone else's ids." _body_idor.sql
[ -f _body_quad.sql ] && mk sec_03_quad_anon "Quad anonymity: no author id or name in any student-visible response; reveal is owner-only and audited." _body_quad.sql
[ -f _body_rt.sql ] && mk sec_04_realtime "Realtime Broadcast authorization: who can receive chat:{id} and user:{id}; clients cannot publish." _body_rt.sql
[ -f _body_age.sql ] && mk sec_05_age_gate "Age gate: client-asserted os_signal and birth date; retry after a minor result." _body_age.sql
true
