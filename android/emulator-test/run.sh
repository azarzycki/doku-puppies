#!/usr/bin/env bash
# Drives a debug build of the app on a running emulator through the ways the game can start, against the game's own
# web files served from this checkout:
#   1. first run with no network at all        -> the copy bundled in the APK plays
#   2. a captive portal answering every request -> the bundled copy plays; only the preflight request reaches the portal
#   3. online                                   -> the live page loads from the server and installs its service worker
#   4. network gone again                       -> the game still starts, served by the worker's cache
# What the WebView shows is checked through Chrome DevTools (page.mjs; debug builds expose it), so the checks read the
# page itself: its title, the app's current screen, the marker, the service worker state. Screenshots, the server's
# request log and logcat land in the output dir.
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
page() { node "$HERE/page.mjs" "$1"; }
is() { [ "$(page "$1" 2> /dev/null)" = "$2" ]; }   # is <expression> <json value>
requests() { wc -l < "$OUT/state/requests.log" | tr -d ' '; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
net() { if [ "$1" = on ]; then adb reverse tcp:8080 tcp:8080 > /dev/null; adb shell svc wifi enable; adb shell svc data enable
        else adb reverse --remove-all; adb shell svc wifi disable; adb shell svc data disable; fi; sleep 2; }
attach() { # forward the WebView's DevTools socket and wait for the game's page to be up
  local pid="" i v
  for i in $(seq 1 20); do pid=$(adb shell pidof -s $PKG 2> /dev/null | tr -d '\r '); [ -n "$pid" ] && break; sleep 1; done
  adb forward --remove-all > /dev/null 2>&1; adb forward tcp:9222 "localabstract:webview_devtools_remote_$pid" > /dev/null
  for i in $(seq 1 40); do
    v=$(page "document.readyState === 'complete' && !!(window.dokuPuppies && window.dokuPuppies.current)" 2> /dev/null)
    [ "$v" = true ] && return 0; sleep 1
  done
  echo "  (the game's page did not come up in 40 s; title: $(page document.title 2>&1))"; return 1; }
launch() { adb shell am force-stop $PKG; adb shell am start -W -n $PKG/.MainActivity --es url "$URL" > /dev/null; attach; }
state() { echo "     page: $(page "JSON.stringify({ title: document.title, url: location.href, screen: window.dokuPuppies.current, workerControlled: !!navigator.serviceWorker.controller })" 2>&1)"; }
game_shows() { # the game's home screen, on our own page (the marker), not a portal's
  check "the game's home screen shows" is "window.dokuPuppies.current" '"home"'
  check "it is our page (marker present)" is "!!document.querySelector('meta[name=doku-puppies]')" true
  check "not a sign-in page" is "/sign in/i.test(document.title)" false; }

node "$HERE/server.mjs" "$ROOT" "$OUT/state" > "$OUT/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2> /dev/null; adb logcat -d > "$OUT/logcat.txt" 2> /dev/null' EXIT
sleep 1
adb logcat -c
adb shell settings put global window_animation_scale 0 > /dev/null 2>&1
adb shell settings put global hide_error_dialogs 1 > /dev/null 2>&1   # no "isn't responding" dialogs over the app
adb shell input keyevent 82 > /dev/null 2>&1   # wake / unlock

say "install"
adb install -r "$APK" | tail -1
adb shell pm clear $PKG > /dev/null

say "1. first run with no network: the bundled copy should play"
net off
launch; state; shot 1-offline-first-run
game_shows
check "nothing reached the server" [ "$(requests)" = 0 ]
page "window.dokuPuppies.go('game', { kind: 'level', id: 1 }); true" > /dev/null
sleep 3; shot 2-offline-board
check "a level opens and lays out a board (bundled puzzle data)" is "!!(window.dokuPuppies.game && window.dokuPuppies.game.cellEls && window.dokuPuppies.game.cellEls.length > 0)" true
check "still nothing reached the server" [ "$(requests)" = 0 ]

say "2. captive portal: every request is answered with a sign-in page"
net on; echo portal > "$OUT/state/mode"; : > "$OUT/state/requests.log"
adb shell am force-stop $PKG; adb shell am start -W -n $PKG/.MainActivity --es url "$URL" > /dev/null; sleep 2; shot 3-portal-toast
attach; state; shot 3-portal
game_shows
check "only the preflight reached the portal (1 request)" [ "$(requests)" = 1 ]
check "no service worker got installed from the portal" is "navigator.serviceWorker.getRegistration().then(r => !!r)" false
sed 's/^/     portal saw: /' "$OUT/state/requests.log"

say "3. online: the live page loads from the server"
echo normal > "$OUT/state/mode"; : > "$OUT/state/requests.log"
launch; state; shot 4-online
game_shows
check "the page came from the server" grep -qx "GET /" "$OUT/state/requests.log"
check "its scripts came from the server" grep -q "js/app.js" "$OUT/state/requests.log"
for i in $(seq 1 20); do is "navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))" true && break; sleep 1; done
check "the service worker installed" is "navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))" true
echo "     server saw $(requests) requests"

say "4. network gone again after an online run: the game should still start"
sleep 2; net off; : > "$OUT/state/requests.log"
launch; state; shot 5-offline-again
game_shows
check "the page is served by the service worker's cache" is "!!navigator.serviceWorker.controller" true
net on

echo
adb logcat -d 2> /dev/null | grep -i "chromium\|console" | grep -iv "deprecat\|simple_\|nativeloader" | tail -12 | sed 's/^/     logcat: /'
if [ $fail = 0 ]; then echo "all good"; else echo "FAILED"; fi
exit $fail
