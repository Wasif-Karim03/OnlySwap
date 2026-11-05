#!/usr/bin/env bash
# Visual layout audit: screenshots every screen on a small and a large iPhone,
# at default and larger text sizes, using only Apple's `xcrun simctl`.
#
#   bash scripts/dev/sim-audit.sh setup   # boot SE + Pro Max, install the dev build, open the app
#   bash scripts/dev/sim-audit.sh shoot   # screenshot every route (run after signing in on both)
#   bash scripts/dev/sim-audit.sh shoot out   # signed-out screens only (welcome, email, legal, dev states)
#
# Needs: Xcode with an iOS simulator runtime, a dev build already made once with
# `npx expo run:ios`, and Metro running (`npx expo start --dev-client` in apps/mobile).
# Optional ids for screens that need data: LISTING_ID, CHAT_ID, USER_ID, QUAD_ID, MEETUP_ID.
# Screenshots land in sim-shots/audit/<device>/<text-size>/<route>.png (gitignore them).
set -euo pipefail
cd "$(dirname "$0")/../.."

MODE="${1:-}"
SCOPE="${2:-all}"
OUT="sim-shots/audit"
STATE="sim-shots/.audit-devices"
METRO_URL=""   # found by metro_url (8081 to 8085)
WAIT="${WAIT:-3}"          # seconds to let each screen settle before the shot
SIZES=(large extra-extra-large accessibility-large)   # default, 2 notches up, accessibility

die() { echo "error: $*" >&2; exit 1; }
command -v xcrun >/dev/null || die "xcrun not found (install Xcode)"

# Picks the iOS runtime and the two device types to test, printed as
# "<runtime> <small-type> <small-name> <large-type> <large-name>" (names with
# spaces replaced by _). The runtime is the newest general one (most device
# types). Small: the smallest iPhone it supports (SE, then an "e" model, then
# mini, then the plain base model). Large: the newest Pro Max.
pick() {
  xcrun simctl list runtimes -j | python3 -c '
import json,re,sys
rs=[r for r in json.load(sys.stdin)["runtimes"]
    if r.get("isAvailable") and r.get("platform","iOS")=="iOS" and "iOS" in r["identifier"]]
if not rs: sys.exit("no iOS simulator runtime installed (Xcode > Settings > Components)")
ver=lambda r:[int(x) for x in re.findall(r"\d+",r["version"])]
rs.sort(key=lambda r:(ver(r),len(r.get("supportedDeviceTypes",[]))))
best=max(rs,key=lambda r:(ver(r),len(r.get("supportedDeviceTypes",[]))))
ts=[t for t in best.get("supportedDeviceTypes",[]) if t["name"].startswith("iPhone")]
def num(t):
  m=re.search(r"iPhone (\d+)",t["name"]); return int(m.group(1)) if m else 0
def first(pred,newest=True):
  c=[t for t in ts if pred(t["name"])]
  c.sort(key=num)
  return (c[-1] if newest else c[0]) if c else None
small=(first(lambda n:"SE" in n and "1st" not in n) or first(lambda n:re.search(r"\d+e$",n)) or
       first(lambda n:"mini" in n) or first(lambda n:re.fullmatch(r"iPhone \d+",n)))
large=first(lambda n:"Pro Max" in n) or first(lambda n:"Plus" in n or "Air" in n)
if not small or not large: sys.exit("no suitable iPhone device types in "+best["name"])
u=lambda x:x.replace(" ","_")
print(best["identifier"],small["identifier"],u(small["name"]),large["identifier"],u(large["name"]))'
}

# UDID of an available device named $1 on runtime $2, else create it.
device() {
  local name="$1" rt="$2" type="$3" udid
  udid=$(xcrun simctl list devices available -j | python3 -c '
import json,sys
ds=json.load(sys.stdin)["devices"].get(sys.argv[2],[])
for d in ds:
  if d["name"]==sys.argv[1]: print(d["udid"]); break' "$name" "$rt")
  [ -n "$udid" ] || udid=$(xcrun simctl create "$name" "$type" "$rt")
  echo "$udid"
}

# Metro's URL: METRO_PORT, else the first local port 8081-8085 that answers.
metro_url() {
  local port host
  for port in ${METRO_PORT:-} 8081 8082 8083 8084 8085; do
    for host in 127.0.0.1 localhost; do
      # --noproxy: a shell proxy setting must not swallow a localhost check.
      if curl -s --noproxy '*' --max-time 2 "http://$host:$port/status" | grep -q running; then
        echo "http://$host:$port"; return 0
      fi
    done
  done
  # Fallback: a node process listening on 8081-8085, or the port you gave.
  port=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '/node/ {n=split($9,a,":"); print a[n]}' \
    | grep -E '^808[1-5]$' | head -1 || true)
  [ -n "$port" ] || port="${METRO_PORT:-}"
  [ -n "$port" ] && echo "http://127.0.0.1:$port"
  return 0
}

app_path() {
  ls -dt "$HOME"/Library/Developer/Xcode/DerivedData/OnlySwap-*/Build/Products/Debug-iphonesimulator/OnlySwap.app 2>/dev/null | head -1
}

open_dev_client() {
  local udid="$1" enc
  enc=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' "$METRO_URL")
  xcrun simctl launch "$udid" app.onlyswap >/dev/null 2>&1 || true
  sleep 2
  xcrun simctl openurl "$udid" "exp+onlyswap://expo-development-client/?url=$enc"
}

setup() {
  local app se max
  app=$(app_path); [ -n "$app" ] || die "no dev build found; run 'npx expo run:ios' in apps/mobile once"
  METRO_URL=$(metro_url)
  [ -n "$METRO_URL" ] || die "can't find Metro; if it is running, pass its port: METRO_PORT=8082 bash scripts/dev/sim-audit.sh setup"
  echo "Metro: $METRO_URL"
  local picked rt stype sname ltype lname
  picked=$(pick) || die "couldn't pick simulators"
  read -r rt stype sname ltype lname <<<"$picked"
  sname=${sname//_/ }; lname=${lname//_/ }
  echo "Runtime: $rt"
  echo "Small phone: $sname   Large phone: $lname"
  se=$(device "$sname" "$rt" "$stype")
  max=$(device "$lname" "$rt" "$ltype")
  mkdir -p sim-shots
  printf 'se %s\nmax %s\n' "$se" "$max" > "$STATE"
  for udid in "$se" "$max"; do
    xcrun simctl boot "$udid" 2>/dev/null || true
    xcrun simctl bootstatus "$udid" -b >/dev/null
    xcrun simctl status_bar "$udid" override --time 9:41 --batteryState charged --batteryLevel 100 \
      --cellularBars 4 --wifiBars 3 2>/dev/null || true
    xcrun simctl ui "$udid" appearance light
    xcrun simctl ui "$udid" content_size large
    xcrun simctl install "$udid" "$app"
    open_dev_client "$udid"
  done
  # Show the phones so you can sign in (the Simulator app is "Device Hub" in Xcode 27).
  open -b com.apple.iphonesimulator 2>/dev/null || open -b com.apple.dt.Devices 2>/dev/null || true
  echo
  echo "Booted: iPhone SE ($se) and Pro Max ($max). OnlySwap is opening on both."
  echo "Next: sign in on BOTH phones (same staging account is fine), then run:"
  echo "  bash scripts/dev/sim-audit.sh shoot"
  echo "Signed-out screens only: bash scripts/dev/sim-audit.sh shoot out"
}

routes() {
  if [ "$SCOPE" = out ]; then
    echo welcome email legal/terms legal/privacy legal/rules
  else
    echo discover discover/campus feed quad quad/new quad/activity quad/mine quad/muted \
      sell sell/details sell/meetup sell/news sell/food sell/wanted \
      inbox notifications saved search profile profile/edit profile/listings \
      settings settings/about settings/appearance settings/blocked settings/data settings/delete \
      settings/language settings/notifications settings/privacy settings/school \
      safety help help/email-access account-status legal/terms legal/privacy legal/rules
    [ -n "${LISTING_ID:-}" ] && echo "listing/$LISTING_ID listing/$LISTING_ID/offer listing/$LISTING_ID/sold listing/$LISTING_ID/comments listing/$LISTING_ID/stats"
    [ -n "${CHAT_ID:-}" ] && echo "chat/$CHAT_ID chat/$CHAT_ID/details chat/$CHAT_ID/meetup chat/$CHAT_ID/deal"
    [ -n "${USER_ID:-}" ] && echo "user/$USER_ID"
    [ -n "${QUAD_ID:-}" ] && echo "quad/$QUAD_ID"
    [ -n "${MEETUP_ID:-}" ] && echo "meetup/$MEETUP_ID"
  fi
  # Dev-only gallery of every empty/error/loading state with fixtures (no data needed).
  for i in $(seq 1 39); do echo "dev/states/X$i"; done
}

shoot() {
  [ -f "$STATE" ] || die "run setup first"
  rm -rf "$OUT"; mkdir -p "$OUT"
  local list="$OUT/.routes" port=8799 name udid pids=()
  routes | tr ' ' '\n' | grep -v '^$' > "$list"
  echo "$(wc -l < "$list" | tr -d ' ') screens x 3 text sizes per phone."
  while read -r name udid; do
    python3 scripts/dev/sim-audit-server.py "$port" "$udid" "$OUT/$name" "$list" "$((WAIT * 1000))" &
    pids+=($!)
    sleep 1
    # The one link the run needs: opens the dev-only audit screen, which then
    # navigates by itself (no "Open in OnlySwap?" prompt per screen).
    xcrun simctl openurl "$udid" "onlyswap://dev/audit?port=$port"
    port=$((port + 1))
  done < "$STATE"
  echo
  echo "If a phone shows \"Open in OnlySwap?\", tap Open. Screens are being captured now."
  echo "(Ctrl+C stops it.)"
  wait "${pids[@]}"
  echo
  echo "Done: $(find "$OUT" -name '*.png' | wc -l | tr -d ' ') screenshots in $OUT/"
}

case "$MODE" in
  setup) setup ;;
  shoot) shoot ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
