#!/usr/bin/env bash
# Cuts the Shipaton demo video (MOL-44) from what record-phone.sh, record-web.ts
# and cards.ts produced: a title card, the phone footage with a caption beside
# it, a placeholder card for the segments that need published Unit 1, the web
# editor-gate footage with a caption band, and an outro. 1920×1080, 30 fps,
# H.264 with a silent AAC track so every player and YouTube accept it.
#
#   DEMO_LANG=en apps/web/e2e/demo/cut.sh
#
# Reads out/phone-<lang>.mp4 + .stops.json, out/web-<lang>.webm + .stops.json
# and out/cards/*.png; writes out/molo-demo-<lang>.mp4 (gitignored). The
# captions and their order are cards.json; a caption runs from its stop until
# the next card's stop. The placeholder card is deliberate and stays until the
# lesson, drill, speaking-check and sandbox-purchase segments exist.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/out"
CARDS="$OUT/cards"
LANG_CODE="${DEMO_LANG:-en}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PHONE="$OUT/phone-$LANG_CODE.mp4"
PHONE_STOPS="$OUT/phone-$LANG_CODE.stops.json"
WEB="$OUT/web-$LANG_CODE.webm"
WEB_STOPS="$OUT/web-$LANG_CODE.stops.json"
FINAL="$OUT/molo-demo-$LANG_CODE.mp4"
for f in "$PHONE" "$PHONE_STOPS" "$WEB" "$WEB_STOPS" "$CARDS/title.png"; do
  [ -f "$f" ] || { echo "missing $f (run record-phone.sh, record-web.ts and cards.ts first)" >&2; exit 1; }
done

INDIGO=0x26264F
W=1920; H=1080; FPS=30
ENC=(-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r "$FPS" -c:a aac -b:a 96k)
SILENCE=(-f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=48000")

# A full-frame card held for a few seconds, with a fade at each end.
card() { # png seconds out
  local fade_out
  fade_out="$(python3 -c "print(round($2 - 0.6, 3))")"
  ffmpeg -v error -y -loop 1 -framerate "$FPS" -i "$1" "${SILENCE[@]}" -t "$2" \
    -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=$fade_out:d=0.6" "${ENC[@]}" "$3"
}

# Footage plus caption overlays. Python works out the caption windows from the
# sidecar and cards.json and prints: the extra -i arguments, the filter, the
# segment length. The first N inputs are the footage and a background; the
# captions follow, one PNG each.
plan() { # phone|web stops.json
  python3 - "$1" "$2" "$HERE/cards.json" "$CARDS" <<'PY'
import json, sys
kind, stops_path, cards_path, cards_dir = sys.argv[1:]
sidecar = json.load(open(stops_path))
at = {s["name"]: s["at"] for s in sidecar["stops"]}
end = sidecar["seconds"]
cards = json.load(open(cards_path))[kind]

if kind == "phone":
    # The six onboarding taps run faster; everything after is real time.
    speed = 1.8
    t_path = at["path"]
    def place(t):  # source second → output second
        return round((t - at["onboarding"]) / speed if t <= t_path else (t_path - at["onboarding"]) / speed + (t - t_path), 3)
    length = place(end)
    chain = (
        f"[0:v]trim=start={at['onboarding']}:end={t_path},setpts=(PTS-STARTPTS)/{speed}[a];"
        f"[0:v]trim=start={t_path}:end={end},setpts=PTS-STARTPTS[b];"
        f"[a][b]concat=n=2:v=1:a=0,scale=-2:1000,fps=30[f];"
        f"[1:v][f]overlay=x=300:y=40:shortest=1[v0]"
    )
else:
    # Landing, then straight to the dashboard: the sign-in typing is cut.
    land = at["auth"] - at["landing"]
    def place(t):
        return round(t - at["landing"] if t < at["auth"] else land + (t - at["edit-overview"]), 3)
    length = place(end)
    chain = (
        f"[0:v]trim=start={at['landing']}:end={at['auth']},setpts=PTS-STARTPTS[a];"
        f"[0:v]trim=start={at['edit-overview']}:end={end},setpts=PTS-STARTPTS[b];"
        f"[a][b]concat=n=2:v=1:a=0,scale=1600:-2,fps=30[f];"
        f"[1:v][f]overlay=x=(W-w)/2:y=20:shortest=1[v0]"
    )

inputs = []
windows = []
for i, card in enumerate(cards):
    start = place(at[card["from"]])
    nxt = cards[i + 1]["from"] if i + 1 < len(cards) else None
    stop = place(at[nxt]) if nxt else length
    inputs += ["-loop", "1", "-framerate", "30", "-i", f"{cards_dir}/{card['id']}.png"]
    windows.append((start, stop))
label = "v0"
for i, (start, stop) in enumerate(windows):
    nxt = f"v{i + 1}"
    chain += f";[{label}][{i + 2}:v]overlay=enable='between(t,{start},{stop})'[{nxt}]"
    label = nxt
chain += f";[{label}]fade=t=in:st=0:d=0.5,fade=t=out:st={round(length - 0.6, 3)}:d=0.6[v]"
print(json.dumps({"inputs": inputs, "filter": chain, "length": length}))
PY
}

footage() { # phone|web source stops.json out
  local spec
  spec="$(plan "$1" "$3")"
  local -a inputs
  IFS=$'\n' read -r -d '' -a inputs < <(python3 -c 'import json,sys; [print(x) for x in json.loads(sys.argv[1])["inputs"]]' "$spec" && printf '\0')
  local filter length
  filter="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["filter"])' "$spec")"
  length="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["length"])' "$spec")"
  ffmpeg -v error -y -i "$2" -f lavfi -i "color=c=$INDIGO:s=${W}x${H}:r=$FPS" "${inputs[@]}" "${SILENCE[@]}" \
    -filter_complex "$filter" -map "[v]" -map "$((${#inputs[@]} / 6 + 2)):a" -t "$length" "${ENC[@]}" "$4"
}

card "$CARDS/title.png" 7 "$WORK/1-title.mp4"
footage phone "$PHONE" "$PHONE_STOPS" "$WORK/2-phone.mp4"
card "$CARDS/placeholder.png" 6 "$WORK/3-placeholder.mp4"
footage web "$WEB" "$WEB_STOPS" "$WORK/4-web.mp4"
card "$CARDS/outro.png" 6 "$WORK/5-outro.mp4"

for i in 1-title 2-phone 3-placeholder 4-web 5-outro; do echo "file '$WORK/$i.mp4'"; done > "$WORK/list.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$WORK/list.txt" -c copy -movflags +faststart "$FINAL"
printf '%s: %s s\n' "$FINAL" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FINAL")"
