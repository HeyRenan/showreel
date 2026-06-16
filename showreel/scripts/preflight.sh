#!/usr/bin/env bash
# Report what the showreel plugin needs and what's missing on THIS machine, then
# print copy-paste Setup commands for whatever is missing. Exits 0 always.
echo "showreel preflight"
echo "------------------"

ok()   { printf '  [ok]   %s\n' "$1"; }
warn() { printf '  [warn] %s\n' "$1"; }

need_node=0 need_ffmpeg=0 need_vhs=0

# --- Required ---
if command -v node >/dev/null 2>&1; then ok "node $(node -v)"; else warn "node MISSING (required)"; need_node=1; fi
if command -v npm  >/dev/null 2>&1; then ok "npm present (motor installs Playwright via npm)"; else warn "npm MISSING (required for the capture motor first run)"; need_node=1; fi

# --- Capture motor (self-contained Chromium in scripts/.deps) ---
HERE="$(cd "$(dirname "$0")" && pwd)"
if ls "$HERE/.deps/ms-playwright" 2>/dev/null | grep -q '^chromium'; then
  ok "capture motor warm (Chromium in scripts/.deps)"
else
  warn "capture motor cold — FIRST prove/shot/rec/demo run does 'npm install playwright' + ~90MB Chromium download"
  echo "         pre-warm now:  node $HERE/ensure-deps.mjs"
fi

# --- Optional tooling ---
if command -v ffmpeg >/dev/null 2>&1; then ok "ffmpeg present (high-quality gif palette)"; else warn "system ffmpeg absent — gifs still work via Playwright's bundled ffmpeg (lower quality); install for best results"; need_ffmpeg=1; fi
if command -v vhs >/dev/null 2>&1; then ok "vhs present (terminal recordings via tape.mjs)"; else warn "vhs absent — tape.mjs (terminal gifs) unavailable; browser capture unaffected"; need_vhs=1; fi

pkg_hint() { # <brew-formula>
  if command -v brew    >/dev/null 2>&1; then echo "brew install $1";
  elif command -v apt    >/dev/null 2>&1; then echo "sudo apt install $1";
  elif command -v dnf    >/dev/null 2>&1; then echo "sudo dnf install $1";
  else echo "install '$1' with your package manager"; fi
}

if [ $((need_node+need_ffmpeg+need_vhs)) -gt 0 ]; then
  echo "------------------"
  echo "Setup — run what applies:"
  [ "$need_node" = 1 ]   && echo "  # Node 18+ (required):    $(pkg_hint node)   # or https://nodejs.org"
  [ "$need_ffmpeg" = 1 ] && echo "  # ffmpeg (optional, best gif quality): $(pkg_hint ffmpeg)"
  [ "$need_vhs" = 1 ]    && echo "  # vhs (optional, terminal recordings): $(pkg_hint vhs)   # https://github.com/charmbracelet/vhs"
fi

echo "------------------"
echo "Verify: (cd plugin root && node --test scripts/__tests__/)"
echo "Capture motor: prove/shot/rec/demo run a self-contained Chromium from scripts/.deps — no MCP needed."
echo "Linux only: if Chromium fails to launch after install, run: sudo \$PWD/scripts/.deps/node_modules/.bin/playwright install-deps"
