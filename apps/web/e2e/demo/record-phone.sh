#!/usr/bin/env bash
# Records the phone segments of the Shipaton demo video (MOL-44) from the iOS
# simulator: first open → the six onboarding steps → continue as guest → the
# path → the sign-up sheet with the age gate → the Molo Plus paywall. Companion to
# record-web.ts; cut.sh joins the two.
#
# Needs: a booted simulator with the `simulator` EAS build installed (see
# docs/screenshots/ios/README.md), `idb` (brew install idb-companion) and
# Xcode's simctl. The app is reinstalled from a copy of its own bundle so the
# recording starts at a true first open; nothing is fetched.
#
#   DEMO_UDID=<udid> DEMO_LANG=en apps/web/e2e/demo/record-phone.sh
#
# Output: apps/web/e2e/demo/out/phone-<lang>.mp4 and phone-<lang>.stops.json
# (the second each screen was reached, for cut.sh), gitignored. Nothing here
# creates an account or buys anything: the sign-up screen is shown and left,
# and the paywall is opened by deep link and left.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/out"
mkdir -p "$OUT"

UDID="${DEMO_UDID:?set DEMO_UDID to the udid of the booted simulator}"
LANG_CODE="${DEMO_LANG:-en}"
BUNDLE_ID="com.hardmax.molo"
case "$LANG_CODE" in
  nb) LOCALE=nb_NO ;;
  *) LOCALE=en_GB ;;
esac
VIDEO="$OUT/phone-$LANG_CODE.mp4"
STOPS="$OUT/phone-$LANG_CODE.stops.json"

# --- helpers ---------------------------------------------------------------

# Prints "x y" of the centre of the first element whose label matches, or
# nothing. describe-all reports points, which is what `idb ui tap` takes.
centre_of() {
  idb ui describe-all --udid "$UDID" 2>/dev/null | python3 -c '
import json, re, sys
pattern = re.compile(sys.argv[1], re.I)
for e in json.load(sys.stdin):
    label = e.get("AXLabel") or ""
    if pattern.search(label):
        f = e["frame"]
        print(int(f["x"] + f["width"] / 2), int(f["y"] + f["height"] / 2))
        break
' "$1"
}

# Retries for a few seconds: a screen mid-transition has no tree yet.
tap_label() {
  local xy="" attempt
  for attempt in 1 2 3 4 5 6; do
    xy="$(centre_of "$1" || true)"
    [ -n "$xy" ] && break
    sleep 1
  done
  if [ -z "$xy" ]; then
    echo "no element matching /$1/ on screen" >&2
    return 1
  fi
  # shellcheck disable=SC2086
  idb ui tap --udid "$UDID" $xy >/dev/null
}

# --- a true first open -----------------------------------------------------

APP_PATH="$(xcrun simctl get_app_container "$UDID" "$BUNDLE_ID")"
STAGE="$(mktemp -d)"
cp -R "$APP_PATH" "$STAGE/Molo.app"
xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
xcrun simctl uninstall "$UDID" "$BUNDLE_ID"
xcrun simctl install "$UDID" "$STAGE/Molo.app"
rm -rf "$STAGE"
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged \
  --batteryLevel 100 --cellularBars 4 --wifiBars 3

# --- record ----------------------------------------------------------------

xcrun simctl io "$UDID" recordVideo --codec h264 --force "$VIDEO" &
REC=$!
# Whatever happens below, the recorder must not outlive the script.
trap 'kill -INT "$REC" 2>/dev/null; wait "$REC" 2>/dev/null' EXIT
T0="$(python3 -c 'import time; print(time.time())')"
MARKS=()
# Records when a screen came up, in seconds since the recorder started.
mark() {
  MARKS+=("{\"name\":\"$1\",\"at\":$(python3 -c "import time; print(round(time.time() - $T0, 3))")}")
}
sleep 2

xcrun simctl launch "$UDID" "$BUNDLE_ID" -AppleLanguages "($LANG_CODE)" -AppleLocale "$LOCALE" >/dev/null
sleep 1
mark onboarding
sleep 3

# Steps 1 → 6. The label is "Next" / "Neste"; step 6 has no Next.
for _ in 1 2 3 4 5; do
  tap_label '^(Next|Neste)$'
  sleep 2.2
done
sleep 1.5

# Step 6 → continue as guest → the path, in its true state (empty until an
# editor publishes Unit 1).
tap_label '^(Continue as guest|Fortsett som gjest)$'
sleep 0.8
mark path
sleep 4.5

# The sign-up sheet with the age gate, by deep link; look, do not fill it.
xcrun simctl openurl "$UDID" "molo:///auth?mode=signup"
sleep 0.8
mark signup
sleep 4.5

# The paywall, by deep link.
xcrun simctl openurl "$UDID" "molo:///plus"
sleep 0.8
mark paywall
sleep 5

END="$(python3 -c "import time; print(round(time.time() - $T0, 3))")"
kill -INT "$REC"
wait "$REC" 2>/dev/null || true
trap - EXIT
printf '{"lang":"%s","seconds":%s,"stops":[%s]}\n' "$LANG_CODE" "$END" "$(IFS=,; echo "${MARKS[*]}")" > "$STOPS"
xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true

ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO" |
  sed "s|^|recorded $VIDEO, |; s|\$| s|"
