---
name: showreel
description: Use when the user wants to explain or document something visually — annotated screenshots, feature demos, flow GIFs, terminal recordings, before/after comparisons — or says "take a screenshot", "record this flow", "make a gif of", "show how this works", "annotate this page", "demo this feature", "grava um gif", "tira um print anotado". Covers web pages (self-contained Chromium), the user's live Chrome tab (Claude in Chrome overlay) and terminal sessions (vhs).
---

# Showreel

One command per visual. **You speak in CSS selector + text — never pixels, never seconds.** The motor measures the DOM, places annotations deterministically, draws, and gates the result (dominance, collision, contrast, target-text).

Run scripts as `node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs"` (below: `$S/<name>.mjs`; if the variable is unset, the plugin dir is two levels above this file). First run on a machine: `bash $S/preflight.sh`. Output goes to `./showreel-out/` unless the user names another dir. Every script supports `--help`.

## Commands

| Need | Command | Output |
|---|---|---|
| Annotated screenshot | `node $S/prove.mjs <url> "<sel>" out.png --label "menu opens"` | `PASS out.png kb=<n>` |
| N shots, ONE browser (default for 2+) | `node $S/prove.mjs <url> --batch jobs.json` — `[{selector,out,label,circle,blur,zoom,do}]` | `PASS`/`FAIL` per job, `PROVE k/n PASS` |
| URL only, no selectors | `node $S/auto.mjs <url> [--max N]` | `AUTO k/n PASS` |
| **State that only exists after an interaction** (modal, menu, fetched list) | add `--do '[{"click":"#menu"},{"waitFor":"#drawer"}]'` to `prove`/`shot` (per job: `"do":[...]`). Steps: `click` `hover` `fill`+`value` `press` `wait` `waitFor` | same |
| Raw tight crop | `node $S/shot.mjs <url> "<sel>" out.png` | `OK out.png` |
| Flow gif / mp4 | `node $S/rec.mjs <url> --steps steps.json out.gif [--mp4 out.mp4]` | `OK out.gif` |
| N takes, one browser | `node $S/rec.mjs --batch takes.json` | `OK` per take |
| Terminal gif (needs `vhs`) | `node $S/tape.mjs --steps steps.json out.gif` | `OK out.gif` |
| Side by side (png/gif) | `node $S/compose.mjs a.png b.png pair.png --labels "Before,After"` | `OK pair.png` |
| Side by side video | `node $S/compose-video.mjs a.webm b.webm out.mp4 [--sync-trim]` | `OK out.mp4` |
| Shrink png/gif | `node $S/shrink.mjs in.gif [--target-kb N]` | `OK`, maybe `RECOMMEND-MP4` |
| Share-ready frame | `node $S/beautify.mjs in.png [--frame window\|card\|minimal] [--ratio 16:9]` | `OK out.png` |
| One primitive (rect, circle, arrow, badge, blur, label, zoom, callout) | `node $S/demo.mjs <url> "<sel>" out.png --kind <k>` | `OK out.png` |

Desktop layout: add `--width 1440 --height 900` (default is a 900×1400 portrait = mobile breakpoint).

## The user's own Chrome tab (Claude in Chrome)

The headless motor cannot see a logged-in view or a state you reached by hand. Use the overlay instead — same placement engine, drawn on the live page, no pixel coordinates:

1. Drive the tab with the Chrome tools until the target is on screen (click, fill, wait).
2. Once per page load: `node $S/overlay.mjs --install` → pass its output to the Chrome `javascript_tool`.
3. `window.__showreel.annotate("#sel", "short label", {circle:true})` → JSON verdict `{ok,side,target,callout}`. `ok:false` + `reason` means fix the selector or state (an element that is not on screen yet is the usual cause).
4. Take the screenshot with the Chrome tool. `window.__showreel.clear()` removes the overlay.

## Choosing the artifact

- One element or fact → annotated still (`prove`). A set → `prove --batch` / `demo` primitives. Unknown selectors → `auto`.
- A flow (click → result) → `rec`. A rich walkthrough or hero → `rec` realtime `--fps 30` + mp4.
- A terminal → `tape` (never `rec`). A browser → `rec`/`prove` (never `tape`).
- Before/after → capture both, then `compose` / `compose-video`.
- Effort dial (user can say quick / standard / rich / cinematic; default **rich**): it scales craft inside the right artifact, never the artifact's size. One element is a polished still, not a movie.

Every label must visibly connect to its target (arrow, leader, or centered narration). The final frame must still show the effect.

## Flow recordings

1. **Storyboard first**: say the beats in one plain line ("enter → zoom #hero → click #deploy → scroll to #services"), then record. At `cinematic`, or if asked, wait for a nod.
2. **Copy a preset** from `$S/presets/` (`form-flow`, `nav-flow`, `dashboard`) and swap selectors. For any other key, look it up instead of reading docs: `node $S/rec.mjs --grammar click,fill,camera` prints just those rows (shape, required sibling, range, anchor); no args prints all 56. Open `references/rec-cookbook.md` only for FORBIDDEN FORMS / anchoring detail, and `cinematic-grammar.md` / `motion-design.md` only for cinematic craft.
3. **`--dry` is mandatory**: resolves every selector. Fix every `[MISS]`, then record once.
4. **Fresh app state before every (re-)record.** A disabled / covered / spent target is refused (`[not-actionable]`, exit 2): reset the app and re-run. Never `--no-safeguards` past it.
5. **Moving reel** (any glide/follow/camera/fill/select) → realtime `--fps 30`; never `--offline`, `--pace fast` or `speed`.

## Terminal recordings

`tape.mjs` wraps [vhs](https://github.com/charmbracelet/vhs): steps `type`, `enter`, `sleep`, `ctrl`, `hide`, `show`. Missing `vhs` → say so and offer `brew install vhs`.

## Delivery rules

- Run `shrink.mjs` on every png/gif before delivering. gif > 2 MB or > 8 s, or `RECOMMEND-MP4` → deliver mp4.
- Trust the verdict: read a PNG only on `FAIL`. `FAIL` / `NO_SPACE` mean a wrong selector or state — fix the input, never the coordinates.
- Never `prove` file by file for 2+ shots; use `--batch`.
- Don't mark an element that fills the screen; mark an inner one.
- Labels: page language, 3–6 words.
- No machine-specific paths, hosts or commands in generated content.
