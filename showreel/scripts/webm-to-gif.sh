#!/usr/bin/env bash
# webm-to-gif.sh — convert a recorded Playwright video (webm) into an optimized,
# loopable GIF using a two-pass palette for clean colors. This is the REAL-TIME
# path: the input is an actual screen recording of the flow (with the injected
# cursor + ripple from cursor-inject.mjs), not a slideshow of stills.
#
# usage:
#   webm-to-gif.sh <input.webm> <output.gif> [width] [fps] [colors]
# defaults: width=520 fps=15 colors=160
#
# Tips to keep size down (GitLab attaches up to ~10MB):
#   - lower width (480) and fps (12) first; they cut size the most
#   - a playing YouTube video generates lots of inter-frame delta -> bigger gif;
#     trim dead air in the flow instead of dropping quality.
set -euo pipefail

IN="${1:-}"; OUT="${2:-}"; W="${3:-460}"; FPS="${4:-18}"; COLORS="${5:-160}"
[ -n "$IN" ] && [ -n "$OUT" ] || { echo "usage: webm-to-gif.sh <input.webm> <output.gif> [width] [fps] [colors]" >&2; exit 2; }
[ -f "$IN" ] || { echo "webm-to-gif.sh: input not found: $IN" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "webm-to-gif.sh: ffmpeg not installed (brew install ffmpeg)" >&2; exit 3; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PAL="$TMP/pal.png"

# sierra2_4a dither looks far smoother than bayer for screen recordings
# (bayer's ordered pattern reads as "stuttery/blocky" on motion).
ffmpeg -hide_banner -loglevel error -y -i "$IN" \
  -vf "fps=${FPS},scale=${W}:-1:flags=lanczos,palettegen=max_colors=${COLORS}:stats_mode=diff" "$PAL"
ffmpeg -hide_banner -loglevel error -y -i "$IN" -i "$PAL" \
  -lavfi "fps=${FPS},scale=${W}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a" \
  -loop 0 "$OUT"

SIZE_MB="$(ls -la "$OUT" | awk '{printf "%.2f", $5/1024/1024}')"
echo "wrote $OUT (${SIZE_MB}MB, ${W}px ${FPS}fps ${COLORS}col)"
if awk "BEGIN{exit !($SIZE_MB > 10)}"; then
  echo "WARNING: >10MB — lower width/fps or trim the flow before uploading" >&2
fi
