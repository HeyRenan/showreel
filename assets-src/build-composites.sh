#!/usr/bin/env bash
# build-composites.sh — README assets that need multi-step orchestration:
# auto-discovery (+ role→name mapping), before/after compose, framed beautify,
# and the primitive-callout batch. The single-tool assets live in roster.json
# (run: node assets-src/build-assets.mjs). Run this from anywhere.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(cd "$here/.." && pwd)"; cd "$repo"
export PLAYWRIGHT_BROWSERS_PATH="$repo/showreel/scripts/.deps/ms-playwright"
S="showreel/scripts"; U="file://$repo/assets-src/demo"; T="$(mktemp -d)"

# auto.mjs discovers elements by role on the console; map the role files to README names
node "$S/auto.mjs" "$U/index.html" --out-dir "$T/auto" --width 1100 --max 8
cp "$T/auto/01-primary-action.png" assets/auto-action.png
cp "$T/auto/02-form.png"           assets/auto-form.png
cp "$T/auto/03-key-metric.png"     assets/auto-metric.png
cp "$T/auto/04-hero-image.png"     assets/auto-hero.png

# compose: dark vs light before/after of the ship panel
node "$S/shot.mjs" "$U/index.html"             "#deploy-panel" "$T/dark.png"  --pad 20 --width 900
node "$S/shot.mjs" "$U/index.html?theme=light" "#deploy-panel" "$T/light.png" --pad 20 --width 900
node "$S/compose.mjs" "$T/dark.png" "$T/light.png" assets/compose.png --labels "Dark,Light"

# compose-motion: two takes side by side
node "$S/compose.mjs" assets/camera.gif assets/marks.gif assets/compose-motion.gif --labels "Camera,Marks"
node "$S/shrink.mjs" assets/compose-motion.gif --target-kb 1500 >/dev/null 2>&1 || true
[ -f assets/compose-motion.min.gif ] && mv -f assets/compose-motion.min.gif assets/compose-motion.gif

# beautify: KPI row wrapped in a browser-window frame
node "$S/shot.mjs" "$U/overview.html" "#kpis" "$T/bty.png" --pad 16 --width 1000
node "$S/beautify.mjs" "$T/bty.png" assets/beautify.png --frame window --url "lumen.dev"

# primitives p1-p8 — one callout kind each
node "$S/demo.mjs" "$U/index.html" --batch assets-src/primitives-jobs.json --width 1100

echo "composites rebuilt"
