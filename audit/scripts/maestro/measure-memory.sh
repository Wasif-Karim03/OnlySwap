#!/usr/bin/env bash
# Samples app memory every 60 s into a CSV. Read-only; run while long-session.yaml plays.
#   bash audit/scripts/maestro/measure-memory.sh [android|ios] [minutes=35] [out.csv]
# Android: `adb shell dumpsys meminfo app.onlyswap` (TOTAL PSS, Java Heap, Native Heap, Graphics, Views).
# iOS Simulator: `footprint` on the simulator process (physical footprint, includes Hermes + images + GPU).
# Real iPhone: use Xcode Instruments (Allocations + VM Tracker) or `xcrun xctrace record --template Allocations --attach OnlySwap`.
set -u
PLAT="${1:-android}"; MIN="${2:-35}"; OUT="${3:-audit/raw/client-memory-$PLAT-$(date +%H%M).csv}"
PKG="app.onlyswap"
mkdir -p "$(dirname "$OUT")"
if [ "$PLAT" = android ]; then
  echo "minute,total_pss_kb,java_heap_kb,native_heap_kb,graphics_kb,views,activities" > "$OUT"
  for i in $(seq 0 "$MIN"); do
    M=$(adb shell dumpsys meminfo "$PKG" 2>/dev/null)
    pss=$(echo "$M"  | awk '/TOTAL PSS:/ {print $3; exit} /^ *TOTAL / {print $2; exit}')
    jh=$(echo "$M"   | awk '/Java Heap:/ {print $3; exit}')
    nh=$(echo "$M"   | awk '/Native Heap:/ {print $3; exit}')
    gr=$(echo "$M"   | awk '/Graphics:/ {print $2; exit}')
    vw=$(echo "$M"   | awk '/Views:/ {print $2; exit}')
    ac=$(echo "$M"   | awk '/Activities:/ {print $2; exit}')
    echo "$i,${pss:-},${jh:-},${nh:-},${gr:-},${vw:-},${ac:-}" | tee -a "$OUT"
    sleep 60
  done
else
  echo "minute,footprint_mb,pid" > "$OUT"
  for i in $(seq 0 "$MIN"); do
    PID=$(xcrun simctl spawn booted launchctl list 2>/dev/null | awk -v p="$PKG" '$3 ~ p {print $1; exit}')
    [ -z "${PID:-}" ] || [ "$PID" = "-" ] && PID=$(pgrep -f "OnlySwap.app/OnlySwap" | head -1)
    FP=$(footprint "$PID" 2>/dev/null | awk '/Footprint:/ {print $2 $3; exit}')
    echo "$i,${FP:-},${PID:-}" | tee -a "$OUT"
    sleep 60
  done
fi
echo "done -> $OUT"
# Reading it: a healthy app plateaus after ~5 min. Flag if total PSS / footprint climbs > 1.5x
# from minute 10 to the end, if Views/Activities keep rising (Android leak signal), or Java Heap never drops.
#
# Hermes heap snapshot (JS leaks): dev client or a profileable release build.
#   1. Metro dev server running, open the app, press `j` (Chrome DevTools via React Native DevTools).
#   2. Memory tab -> "Heap snapshot" -> take at minute 2 (baseline) and again after the soak (use Allocation
#      timeline if hunting). Compare with "Comparison" view; look for growth in Array, Map (chat `stores`,
#      query cache), Object, and closures from useChat / SwipeDeck.
#   3. Android alternative: `adb shell am start -n app.onlyswap/.MainActivity`, then
#      `npx react-native-devtools` / Chrome chrome://inspect for Hermes. Force GC (trash icon) before each snapshot.
