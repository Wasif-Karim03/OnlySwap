#!/usr/bin/env bash
# Pulls the newest OnlySwap crash report off a USB-connected iPhone so Claude
# can read it. Plug the iPhone in, unlock it, tap "Trust" if asked, then:
#   bash scripts/verify/ios-crash.command
# Output: crash-logs/ (git-ignored) and crash.log (the key lines).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG=crash.log
: > "$LOG"
say() { echo "== $*" | tee -a "$LOG"; }

command -v idevicecrashreport >/dev/null 2>&1 || { say "Installing libimobiledevice (free)"; brew install libimobiledevice || exit 1; }
idevice_id -l | grep -q . || { say "No iPhone found. Plug it in with a cable, unlock it and tap Trust."; exit 1; }

rm -rf crash-logs && mkdir -p crash-logs/all
say "Copying crash reports from the iPhone"
idevicecrashreport -e -k crash-logs/all >/dev/null 2>&1 || { say "Copy failed. Unlock the phone and run again."; exit 1; }

latest=$(grep -rl -i "onlyswap" crash-logs/all 2>/dev/null | xargs ls -t 2>/dev/null | head -1)
[ -z "$latest" ] && { say "No OnlySwap crash report on the phone yet. Open the app once, wait 10 seconds, run again."; exit 1; }
cp "$latest" crash-logs/
say "Newest report: $(basename "$latest")"

# The parts that say why it crashed: the exception reason (JS errors show here)
# and the top of the crashing thread.
grep -E '"(exception|termination|reason|type|signal|codes|indicator|message)"|Unhandled JS Exception|RCTFatal|EXC_|SIG[A-Z]+|Termination Reason|Exception (Type|Reason)|reason:' "$latest" | head -40 | tee -a "$LOG"
echo "exit 0 $(date)" >> "$LOG"
say "Done. Tell Claude it's ready (Claude reads crash.log and crash-logs/ directly)."
