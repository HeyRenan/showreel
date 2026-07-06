---
name: showreel
description: Use when the user wants to explain or document something visually — annotated screenshots, feature demos, flow GIFs, terminal recordings, before/after comparisons — or says "take a screenshot", "record this flow", "make a gif of", "show how this works", "annotate this page", "demo this feature", "grava um gif", "tira um print anotado". Covers web pages (self-contained Chromium) and terminal sessions (vhs).
---

# Showreel

## Overview

Turn "explain this" into professional visual artifacts in one command each: annotated screenshots, isolated feature demos, animated flow recordings (gif or mp4), terminal session GIFs, and before/after composites. **You speak in CSS selector + text. Never in pixels, never in seconds.** The motor (self-contained Chromium in `scripts/.deps/`, auto-installed on first use) measures the DOM, places annotations deterministically (`lib/autoplace.mjs`), draws, and gates the result — the verdict covers dominance, collision, contrast, and target-text-present. Any agent with Bash can run it, no browser MCP needed.

Scripts live in this plugin's `scripts/` dir. Run `scripts/preflight.sh` once on a new machine (node required; ffmpeg + vhs optional).

Default output dir: `./showreel-out/` in the current project (create it; respect the user's choice if they name another).

## One command per artifact

| Need | Command | Output |
|---|---|---|
| Annotated screenshot (marker + callout, self-validated) | `node scripts/prove.mjs <url> "<selector>" out.png --label "menu opens"` | `PASS out.png kb=<n>` |
| Quick auto-annotate — URL only, no selectors (discovers salient elements: heading, primary action, nav, hero, cards; role-based notes; same gate) | `node scripts/auto.mjs <url> [--max N] [--out-dir DIR]` | `PASS <out> kb=<n>` per element, then `AUTO <k>/<n> PASS`; writes `index.json` |
| N annotated shots, ONE browser launch (DEFAULT for 2+) | `node scripts/prove.mjs <url> --batch jobs.json` — jobs: `[{selector,out,label,circle,blur,zoom}]` | `PASS <out> kb=<n>` / `FAIL <out> reason=<short>` per job, then `PROVE <k>/<n> PASS` |
| Desktop layout (defaults are 900x1400 portrait = mobile breakpoint!) | add `--width 1440 --height 900` to prove/shot/demo | |
| Per-shot options | `circle` (ring hugging target), `blur "<sel>"` (pixelate region), `zoom` (magnified inset) | |
| Raw tight crop of one element | `node scripts/shot.mjs <url> "<selector>" out.png` | `OK out.png` |
| Flow gif (cursor, ripples, per-step notes) | `node scripts/rec.mjs <url> --steps steps.json out.gif` | `OK out.gif` |
| Flow mp4 (cinematic / over gif limits) | `node scripts/rec.mjs <url> --steps steps.json out.gif --mp4 out.mp4` (`--keep-webm` keeps the intermediate) | `OK out.mp4` |
| N takes, ONE browser (pool of 3) | `node scripts/rec.mjs --batch takes.json` | `OK` per take |
| Terminal session gif (needs `vhs`) | `node scripts/tape.mjs --steps steps.json out.gif` | `OK out.gif` |
| Side-by-side of two PNGs or two GIFs | `node scripts/compose.mjs a.png b.png pair.png --labels "Before,After"` (gifs: `a.gif b.gif pair.gif [--height N]`) | `OK pair.png` |
| Side-by-side VIDEO | `node scripts/compose-video.mjs a.webm b.webm out.mp4 [--labels "Before,After"] [--sync-trim]` — `--sync-trim` reads the `.timeline.json` sidecars from `rec --keep-webm` and aligns both takes | `OK out.mp4` |
| Shrink a gif/png without visible quality loss | `node scripts/shrink.mjs in.gif [out.gif] [--target-kb N]` | `OK out (X KB -> Y KB, -N%)`; may print `RECOMMEND-MP4 <reason>` |
| Wrap a PNG in a share-ready frame (browser window / card, shadow, social aspect) | `node scripts/beautify.mjs in.png [out.png] [--frame window\|card\|minimal] [--ratio 16:9\|9:16\|1:1] [--url "..."] [--bg "c1,c2"]` | `OK out.png (WxH) kb=<n>` |
| One isolated annotation primitive | `node scripts/demo.mjs <url> "<sel>" out.png --kind <k>` — k: rect, circle, arrow, badge, blur, label, zoom, callout | `OK out.png` |
| N captures, ONE browser launch | `node scripts/demo.mjs <url> --batch jobs.json` — jobs: `[{selector,out,kind,text}]` | `OK` per job |
| Lighthouse before/after across branches | `bash scripts/lh-ba.sh <url> showreel-out [audit] [base-branch]` then `shot.mjs` each audit card + `compose.mjs` | real reports, never hand-built |

## Picking the right tool

- **Don't know the selectors / want a fast overview of a page** → `auto` (URL only; it picks the salient elements). For precise control of WHICH element + WHAT note → `prove`.
- **Static UI state** → `prove` (annotated) or `shot` (clean crop).
- **Motion / multi-step flow in a browser** → `rec`.
- **CLI / terminal behavior** → `tape` (vhs). Browser things never go through vhs; terminal things never through rec.
- **Comparison** → capture both states, then `compose` (stills) or `compose-video` (takes).
- **Doc page needing one concept per image** → `demo --batch`.
- **Make a capture share-ready (slides, social, marketing)** → `beautify` — frames any PNG with window chrome, shadow and social aspect presets.

## Fidelity — match the artifact to the subject

There is no effort flag; pick the lowest-effort artifact that still EXPLAINS the point. Default to a still unless the subject is motion or a flow.

| Subject | Artifact | How |
|---|---|---|
| One element / one fact | **annotated still** | `prove.mjs` — rect/badge + a note, zoom inset on the key detail. |
| A set of related elements | **still with marks** | `demo.mjs` primitives, or `prove` with badges on the group. |
| A user flow (click → result) | **flow gif** | `rec.mjs` with cursor glide, per-step notes (arrow on each), stamp counter. |
| A rich walkthrough / the hero | **rich mp4** | `rec.mjs` realtime `--fps 30`. **`references/rec-cookbook.md` is THE CONTRACT — read it first; its GRAMMAR TABLE + FORBIDDEN FORMS + RENDER-MODE/ANCHORING gates + pre-flight make valid, complete output correct-by-construction.** Then read `references/cinematic-grammar.md` (shot/camera/pacing for legible motion) and `references/motion-design.md` (easing/stagger numbers, compositing-by-splitting) for craft. A rich walkthrough shows the real end-to-end flow in the order it actually happens (or the order that best explains it), one focal point per beat, with smooth viewport motion (camera/follow/loupe) keeping the longer flow legible — never a flat numbered feature list, never a story arc. |
| Before vs after | **compose** | `compose.mjs` two stills or two gifs side by side; `lh-ba.sh` for real Lighthouse. |

Whatever you pick: every label visibly connects to its target, and the final frame still shows the effect (persist the note/rect/bar through the last step) so the artifact reads even when paused.

## Flow recordings (`rec.mjs`)

**Discipline:** `--dry` is MANDATORY before any recording — resolves every selector ([ok]/[MISS]), no recording. A [MISS] on a glide/camera/click/fill/select target is a frozen dead beat — fix to zero MISS, then record ONCE.

**Render mode (decides at the command line, not in the frames):** a MOVING reel — any `glide`/`follow`/`camera`/`fill`/`select` — records realtime `--fps 30`, NO `--offline` (15fps stills → slideshow), NO `--pace fast` (collapses easing), NO `speed` (a no-op in realtime). `--pace fast` and `--offline` are ONLY for quick static/dwell-only proofs.

**Presets:** don't write step JSON from scratch. Copy a starting roster from `scripts/presets/` — `form-flow.json`, `nav-flow.json`, `dashboard.json` — and swap the selectors for the page under test.

EVERY explanatory label must visibly connect to its target (arrow on the note, leader on the anchored modal, or centered modal narration) — never floating.

**Before writing any rec steps beyond a straight preset swap, read `references/rec-cookbook.md` — THE CONTRACT:** the full step-key GRAMMAR TABLE (shape, required siblings, forbidden forms, element-vs-viewport anchor), the RENDER-MODE + ANCHORING gates, the authoring procedure, and the one binary pre-flight. Write every step against the table, never from memory. Takes open 1:1; establishing auto-fit is opt-in via `--fit`. Need to reveal something clipped inside an `overflow` div (log/list/chat)? Use `scrollIn` — see cookbook.

## Terminal recordings (`tape.mjs`)

Wraps [charmbracelet/vhs](https://github.com/charmbracelet/vhs). Steps JSON → generated `.tape` → `vhs` renders a terminal gif. Step keys: `type` (string typed with realistic delay), `enter`, `sleep`/`wait` (ms), `hide`/`show` (omit setup from the recording), `ctrl` (e.g. `"c"`). Options: `--width`, `--height`, `--font-size`, `--theme`, `--shell`. Raw passthrough: `node scripts/tape.mjs --tape file.tape out.gif`.

Requires the `vhs` binary (`brew install vhs`) — preflight reports it; if missing, say so and offer the install command instead of failing silently.

## Artifact optimization + video policy (hard rules)

- **ALWAYS optimize before delivering** — every png/gif goes through `node scripts/shrink.mjs <file>` first, no exceptions. Optimization is quality-preserving by default: no visible degradation, ever. When only a lossy step would hit a size target, don't take it — switch format instead (gif → mp4).
- gif > 2 MB (GIF_MAX_KB=2048) or > 8 s (GIF_MAX_SEC=8) → deliver mp4 instead (`rec --mp4`). When shrink can't reach the target it prints `RECOMMEND-MP4 <reason>` on stdout — obey it, re-export as mp4. In docs, a gif poster may link to the mp4.

## Rules

- One artifact = one message. Each demo/print shows ONLY its feature — never stack two concepts in one image.
- **Per-file `prove` for 2+ shots is forbidden.** Use `prove --batch` — one browser launch, N shots.
- **No eyeballing on PASS.** The motor verifies placement: each shot ends in `PASS <out> kb=<n>` or `FAIL <out> reason=<short>`; a batch ends `PROVE <k>/<n> PASS`. Open a PNG with Read ONLY when the verdict is FAIL (to diagnose the wrong selector/state). Never re-read passing shots.
- `prove` exits 0 only on internal vcheck PASS. `FAIL`/`NO_SPACE` are actionable errors (wrong selector, element too small) — fix the input, never the coordinates.
- Annotation text in the page's language unless the user asks otherwise; keep labels short (3-6 words).
- Never hand-write pixel coords or ann.json when `prove.mjs` works — selector + text in, verdict line out.
- Don't rect/circle an element that fills (or nearly fills) the screen — markers outline DETAIL; mark an inner element, or use camera/notes for whole-screen context. The motor skips such markers and warns.

## Portability rules (apply to everything you generate with this plugin)

- No machine-specific commands, no absolute personal paths (`/Users/...`), no personal hosts, no assumptions about local tool builds (ffmpeg drawtext/palettegen vary by build).
- Feature-detect, or let `scripts/preflight.sh` surface missing dependencies with install hints — never assume.
- Anything machine-local (local URLs, tokens, scratch config) stays out of generated docs and committed files.

## MCP fallback

Only when the page needs an authenticated/live session the motor can't reach (requires a browser MCP in the user's Claude Code, e.g. chrome-devtools or `claude mcp add playwright -- npx -y @playwright/mcp@latest`): `annotate.mjs freeze` → MCP `take_screenshot` → `annotate.mjs dims` → `grid` calibration → hand-write `target.json` + `ann.json` → `annotate.mjs check` → `build-inject.mjs` + evaluate → `dataurl-to-png.mjs` → `annotate.mjs vcheck` must PASS. Coords from real PNG pixels (not the downscaled Read preview); only the target rect is green `#16a34a`, everything else neutral dark `rgba(15,23,42,.95)`. Tight crops via `capture.mjs prep/scroll` + `resize_page`. Cursor gifs via `cursor-inject.mjs` + `end-card-inject.mjs` + `webm-to-gif.sh` (recipe: `scripts/drive-recipe.md`).

## Common mistakes

| Mistake | Fix |
|---|---|
| Per-file `prove` calls | `prove --batch`, one browser launch |
| Re-reading a PNG whose verdict was PASS | Open with Read ONLY on `FAIL <out> reason=...` |
| Bare screenshot that shows but doesn't explain | zoom + note + badges — make it EXPLAIN |
| Recording without `--dry` first | `--dry`, fix every [MISS] to zero, record ONCE |
| Recording a MOVING reel with `--offline`, `--pace fast`, or `speed` | Realtime `--fps 30`, no `speed` (those are stills-only / no-ops in motion) |
| Releasing follow with `follow:false` | Bare `{"camera":"out"}` — `follow:false` is INVALID |
| Scrolling/camera-moving while a prior step's blur/redact/highlight/rect is still up | Frame the element in the SAME step as the overlay, or clear it first |
| Writing rec step JSON from scratch | Copy `scripts/presets/*.json`, swap selectors |
| Viewport-motion take scripted without the grammar | Read `references/cinematic-grammar.md`, run its checklist |
| Label floating with no visual tie to its target | `arrow` on the note, leader on the modal — never loose |
| Delivering a 5 MB gif | gif > 2 MB or > 8 s → `rec --mp4`; obey `RECOMMEND-MP4` |
| Artifact that skipped `shrink.mjs` | Optimize every png/gif first — quality-preserving |
| Hand-writing pixel coords / ann.json when the motor works | Selector + text in, verdict line out |
| Personal path/host in generated content | Portability rules — feature-detect, preflight |

## Red flags — STOP

- About to guess pixel coordinates → use `prove`/`demo` with a selector.
- About to run `prove.mjs` per file for several shots → batch it.
- About to Read a shot PNG that printed PASS → don't; only FAIL gets eyes.
- About to stack two features in one image → one concept per artifact.
- About to record without `--dry` → dry-run, fix [MISS], then record ONCE.
- About to write rec step JSON from scratch → copy `scripts/presets/*.json`, swap selectors.
- About to deliver a png/gif that skipped `shrink.mjs` → optimize first (quality-preserving).
- About to deliver a 5 MB gif → gif > 2 MB or > 8 s means mp4; obey `RECOMMEND-MP4`.
- About to record a terminal demo with `rec` (or a browser demo with `tape`) → wrong motor.
- About to put `/Users/...`, a personal host, or a machine-specific command in generated content → portability rules.
