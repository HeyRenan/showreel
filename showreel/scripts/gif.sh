#!/usr/bin/env bash
# Build an animated GIF from annotated step frames. Needs ffmpeg (optional dep —
# preflight warns if missing). Zero npm/brew at runtime beyond ffmpeg itself.
#   gif.sh <dir> <name-glob> <out.gif> [seconds-per-frame]
# Frames are ordered with sort -V (step-2 before step-10). Last frame held 2x.
set -euo pipefail

DIR="${1:-}" GLOB="${2:-}" OUT="${3:-}" SPF="${4:-1.5}"
[ -n "$DIR" ] && [ -n "$GLOB" ] && [ -n "$OUT" ] || { echo "usage: gif.sh <dir> <name-glob> <out.gif> [sec-per-frame]" >&2; exit 2; }
command -v ffmpeg >/dev/null 2>&1 || { echo "gif.sh: ffmpeg not installed (brew install ffmpeg)" >&2; exit 3; }
# A glob with whitespace can never word-split correctly — reject up front.
case "$GLOB" in *[[:space:]]*) echo "gif.sh: name-glob must not contain spaces: '$GLOB'" >&2; exit 2;; esac

# Collect + natural-sort frames.
IFS=$'\n' read -r -d '' -a FRAMES < <(ls -1 "$DIR"/$GLOB 2>/dev/null | sort -V && printf '\0') || true
[ "${#FRAMES[@]}" -gt 0 ] || { echo "gif.sh: no frames match $DIR/$GLOB" >&2; exit 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
MANIFEST="$TMP/frames.txt"
: > "$MANIFEST"
for f in "${FRAMES[@]}"; do
  printf "file '%s'\nduration %s\n" "$f" "$SPF" >> "$MANIFEST"
done
# Hold the last frame longer (concat needs the final file repeated).
printf "file '%s'\nduration %s\n" "${FRAMES[${#FRAMES[@]}-1]}" "$SPF" >> "$MANIFEST"
printf "file '%s'\n" "${FRAMES[${#FRAMES[@]}-1]}" >> "$MANIFEST"

# Two stages: concat -> plain rgb gif (palette filters crash or drop frames on
# the concat demuxer variable-duration stream in minimal ffmpeg builds), then
# gif -> gif palette re-encode (the gif demuxer preserves frame durations).
RAW="$TMP/raw.gif"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$MANIFEST" \
  -vf "scale=trunc(iw/2)*2:-2:flags=lanczos" -pix_fmt rgb24 "$RAW"
ffmpeg -hide_banner -loglevel error -y -i "$RAW" \
  -lavfi "split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none" \
  -loop 0 "$OUT"

# Guard the silent concat rc=0 corruption: assert frame count. The manifest
# emits every frame once, repeats the last with a duration (the 2x hold), then
# names it again bare so concat honors that duration -> N + 2 encoded frames.
EXPECT=$(( ${#FRAMES[@]} + 2 ))
GOT="$(ffprobe -hide_banner -loglevel error -count_frames -select_streams v \
        -show_entries stream=nb_read_frames -of default=noprint_wrappers=1:nokey=1 "$OUT" 2>/dev/null || echo 0)"
if [ "$GOT" != "$EXPECT" ]; then
  echo "gif.sh: frame count $GOT != expected $EXPECT (some frames failed to encode)" >&2
  exit 1
fi
echo "wrote $OUT ($GOT frames)"
