# Install showreel

> Prefer a visual walkthrough? Open **showreel/GUIDE.html** — every
> step with the real terminal output and a real capture you should see.

A Claude Code plugin for annotated screenshots, flow GIFs, terminal
recordings and before/after composites, driven by CSS selectors.

## 1. Register + install (from GitHub)

```bash
claude plugin marketplace add HeyRenan/showreel
claude plugin install showreel@showreel
```

From a local folder instead (clone or tgz extracted into your plugins dir):

```bash
claude plugin marketplace add ~/.claude/plugins/showreel
claude plugin install showreel@showreel
```

After installing, `/showreel:guide` opens the visual setup guide.

## 2. Check your machine

```bash
bash ~/.claude/plugins/showreel/showreel/scripts/preflight.sh
```

It prints `[ok]`/`[warn]` per dependency, with copy-paste Setup commands
for anything missing. Required: node 18+. Everything else is optional
with fallbacks. No git, no tokens, no credentials of any kind.

## 3. Pre-warm the capture motor (one-time, ~90MB)

The first capture installs Playwright + downloads Chromium into the
plugin's own `scripts/.deps/` — self-contained, no browser MCP needed.
Do it now so a network problem surfaces here, not mid-capture:

```bash
node ~/.claude/plugins/showreel/showreel/scripts/ensure-deps.mjs
```

Behind a proxy: set `HTTPS_PROXY` (npm) and `PLAYWRIGHT_DOWNLOAD_HOST`
(mirror). Linux: if Chromium then fails to launch, run once
`sudo ~/.claude/plugins/showreel/showreel/scripts/.deps/node_modules/.bin/playwright install-deps chromium`.

## 4. Use

Restart Claude Code, then invoke `/showreel`. Point it at any URL or
local HTML file and describe what to capture.

## Optional dependencies

| Tool | Install | Unlocks |
|---|---|---|
| `ffmpeg` | `brew install ffmpeg` | best GIF quality for `rec.mjs` (palette-optimized encode) |
| `vhs` | `brew install vhs` | terminal recordings via `tape.mjs` |

Both are detected by `preflight.sh`; without them the rest of the
plugin works unchanged.

## Notes

- Run the tests if you want:
  `cd ~/.claude/plugins/showreel/showreel && node --test 'scripts/__tests__/*.test.mjs'`
