#!/usr/bin/env bash
# Rebuild assets/showcase.mp4 from the demo + roster.
#
# The ?gate=fail query param is REQUIRED: it arms the deploy gate so the first
# #deploy click fails (revealing the red blocked state + auto-rollback timer)
# and the second click ships. Render without it and the deploy succeeds on the
# first click, so the whole blocked -> fixed -> shipped arc plays over an
# already-"Deployed" console — a broken reel. The audit + render tests use the
# same param.
#
# --width 1280 with no --ratio yields 1280x720: a `screen` step reserves a 44px
# topbar band, so 16:9 content (676) + 44 = 720. Passing --ratio free would keep
# 720 of content and ADD the band -> 1280x764.
#
# Usage:  bash assets-src/build-showcase.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
demo="file://$repo/assets-src/demo/index.html?gate=fail"
steps="$repo/assets-src/showcase-steps.json"
out="$repo/assets/showcase.mp4"

node "$repo/showreel/scripts/rec.mjs" "$demo" --steps "$steps" --width 1280 --no-safeguards "$out"
echo "built $out"
