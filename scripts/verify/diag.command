#!/usr/bin/env bash
# Collects Simulator diagnostics for OnlySwap into diag.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
{
  echo "== $(date)"
  echo "== metro on 8081:"; lsof -nP -iTCP:8081 -sTCP:LISTEN 2>/dev/null
  curl -s http://localhost:8081/status; echo
  echo "== latest crash report:"
  f="$(ls -t ~/Library/Logs/DiagnosticReports/OnlySwap* 2>/dev/null | head -1)"
  [ -n "$f" ] && { echo "$f"; head -c 12000 "$f"; }
  echo; echo "== device log (last 4 min):"
  xcrun simctl spawn booted log show --last 4m --style compact \
    --predicate 'process == "OnlySwap" AND (messageType == error OR messageType == fault OR eventMessage CONTAINS[c] "exception" OR eventMessage CONTAINS[c] "error")' 2>&1 | tail -150
} > diag.log 2>&1
echo done >> diag.log
