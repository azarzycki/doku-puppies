#!/usr/bin/env bash
# Drives a debug build of the app on a running emulator through the ways the game can start, against the game's own
# web files served from this checkout:
#   1. first run with no network at all        -> the copy bundled in the APK plays
#   2. a captive portal answering every request -> the bundled copy plays; only the preflight request reaches the portal
#   3. online                                   -> the live page loads from the server (and installs its service worker)
#   4. network gone again                       -> the game still starts
# Screenshots, UI dumps, the server's request log and logcat land in the output dir.
#   run.sh <app-debug.apk> <outdir>
set -u
APK=${1:-android/app/build/outputs/apk/debug/app-debug.apk}
OUT=${2:-emulator-test-out}
PKG=ca.zarzycki.dokupuppies
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
URL=http://localhost:8080/   # localhost on the emulator, tunnelled to the host's test server with "adb reverse"
mkdir -p "$OUT/state"; : > "$OUT/state/requests.log"; echo normal > "$OUT/state/mode"
fail=0
say() { echo; echo "== $*"; }
check() { local d=$1; shift; if "$@"; then echo "  ok   $d"; else echo "  FAIL $d"; fail=1; fi; }
has() { python3 "$HERE/ui.py" has "$OUT/$1.xml" "$2"; }
lacks() { ! has "$@"; }
requests() { wc -l < "$OUT/state/requests.log" | tr -d ' '; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
dump() { # uiautomator can refuse while the screen is still changing: try a few times
  for i in 1 2 3 4 5; do adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/$1.xml" > /dev/null 2>&1 && grep -q '<node' "$OUT/$1.xml" && return 0; sleep 2; done
  echo "  (no UI dump for $1)"; : > "$OUT/$1.xml"; return 1; }
launch() { adb shell am force-stop $PKG; adb shell am start -W -n $PKG/.MainActivity --es url "$URL" > /dev/null; }
net() { if [ "$1" = on ]; then adb reverse tcp:8080 tcp:8080 > /dev/null; adb shell svc wifi enable; adb shell svc data enable
        else adb reverse --remove-all; adb shell svc wifi disable; adb shell svc data disable; fi; sleep 2; }

node "$HERE/server.mjs" "$ROOT" "$OUT/state" > "$OUT/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2> /dev/null; adb logcat -d > "$OUT/logcat.txt" 2> /dev/null' EXIT
sleep 1
adb logcat -c
adb shell settings put global window_animation_scale 0 > /dev/null 2>&1
adb shell input keyevent 82 > /dev/null 2>&1   # wake / unlock

say "install"
adb install -r "$APK" | tail -1
adb shell pm clear $PKG > /dev/null

say "1. first run with no network: the bundled copy should play"
net off
launch; sleep 8; shot 1-offline-first-run; dump 1
check "home screen shows (bundled copy)" has 1 "Puppy Park"
check "no 'can't reach the kennel' page" lacks 1 "reach the kennel"
if center=$(python3 "$HERE/ui.py" center "$OUT/1.xml" "Puppy Park"); then
  adb shell input tap $center; sleep 5; shot 2-offline-board; dump 2
  check "a board opens and is playable (yard tray present)" has 2 "yards have a pup"
else echo "  FAIL Play button not found in the UI dump"; fail=1; fi
check "nothing reached the server" [ "$(requests)" = 0 ]

say "2. captive portal: every request is answered with a sign-in page"
net on; echo portal > "$OUT/state/mode"; : > "$OUT/state/requests.log"
launch; sleep 2; shot 3-portal-toast; sleep 5; shot 3-portal; dump 3
check "home screen shows, not the portal's page" has 3 "Puppy Park"
check "the portal page is nowhere on screen" lacks 3 "CoffeeNet"
check "only the preflight reached the portal (1 request)" [ "$(requests)" = 1 ]
sed 's/^/     portal saw: /' "$OUT/state/requests.log"

say "3. online: the live page loads from the server"
echo normal > "$OUT/state/mode"; : > "$OUT/state/requests.log"
launch; sleep 10; shot 4-online; dump 4
check "home screen shows" has 4 "Puppy Park"
check "the page came from the server" grep -q "^GET / " "$OUT/state/requests.log"
check "its scripts came from the server" grep -q "js/app.js" "$OUT/state/requests.log"
check "the service worker was fetched" grep -q "sw.js" "$OUT/state/requests.log"
echo "     server saw $(requests) requests"

say "4. network gone again after an online run: the game should still start"
sleep 3; net off; : > "$OUT/state/requests.log"
launch; sleep 8; shot 5-offline-again; dump 5
check "home screen shows" has 5 "Puppy Park"
check "no 'can't reach the kennel' page" lacks 5 "reach the kennel"
net on

echo
adb logcat -d 2> /dev/null | grep -i "chromium\|console" | grep -iv "deprecat" | tail -15 | sed 's/^/     logcat: /'
if [ $fail = 0 ]; then echo "all good"; else echo "FAILED"; fi
exit $fail
