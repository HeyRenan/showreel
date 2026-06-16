---
name: guide
description: Open the showreel visual setup guide, or walk the user through installing the plugin's dependencies. Use when the user asks how to set up showreel, install its dependencies, pre-warm the capture motor, install vhs, or says "showreel guide", "setup guide", "como instalar o showreel".
---

# showreel setup guide

The full visual guide — every step with real captured terminal output and real
sample artifacts — ships with the plugin as `GUIDE.html` in the plugin root
(`<plugin>/GUIDE.html`, sibling of this skills/ dir).

## What to do

1. Open it in the user's browser:
   - macOS: `open <plugin>/GUIDE.html`
   - Linux: `xdg-open <plugin>/GUIDE.html`
   - Windows: `start <plugin>/GUIDE.html`
   Resolve `<plugin>` from this skill's own path (two directories up from this file).
2. Tell the user it covers, in order: install (from GitHub or a local folder),
   preflight, pre-warming the capture motor (one-time ~90MB Chromium download),
   optional ffmpeg (best gif quality) and vhs (terminal recordings), and the
   first self-validated annotated screenshot.

## If no GUI browser is available

Don't open the HTML; run the live diagnostic instead and relay its output —
it prints `[ok]`/`[warn]` per dependency plus copy-paste Setup commands:

```bash
bash <plugin>/scripts/preflight.sh
node <plugin>/scripts/ensure-deps.mjs   # pre-warm the motor now, not later
```
