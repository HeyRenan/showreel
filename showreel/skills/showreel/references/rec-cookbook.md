# rec.mjs cookbook — steps, camera, interactions, pacing

Read this before writing any rec step JSON beyond a straight preset swap.

## Inputs

- `--steps steps.json` or `--steps-json '[...]'` (inline, no temp file).
- Output positional: `out.gif`, or `out.mp4` for **mp4-only** (skips the gif encode entirely — the fast default when no gif is needed). `--mp4 out.mp4` exports h264 alongside a gif; `--keep-webm out.webm` keeps the intermediate + `.timeline.json` sidecar (compose-video consumes it).
- `steps.json` — selectors + text only; the script owns cursor motion, timing, and annotation placement.
- Step keys: `click, scrollTo, wait, note, arrow, badge, rect, circle, spotlight, blur, hide, glide, modal, marks, screen, zoom, topbar, bottombar, fill, text, delay, select, option, camera, glossary, stagger, accent, inset, follow, fade, speed` (unknown keys are rejected up front).
- `spotlight` — `{"spotlight":".target","note":"..."}` dims the whole frame EXCEPT a lit window around the target, pulling the eye to one element (a soft accent ring traces the lit edge). `spotlight: true` rides the step's own click/fill anchor. Works under camera zoom. Use it instead of `rect` when the goal is focus, not just a box.

## Flags

- `--stamp` — "n / total" step counter pill.
- `--theme auto|light|dark` — force the palette; auto samples the page.
- `--accent <css-color>` — recolors every marker (rect/circle/badge/leader/glossary/inset; default green). Honor the user's color ask; beauty is the default otherwise. `accent` also works per step (montage finales).
- `--ratio` — final canvas forced to **16:9 by default**; any `W:H` or `free` only when asked.
- `--end-card gif|all|none` — **none by default**; the END card exists only on explicit request. When present: gif closes with it (loop marker), mp4 cuts before it.
- `--fit <n|off>` — establishing auto-fit is OPT-IN; takes open 1:1.
- `--pace fast` — default for takes (trims scripted holds/fades ~45%).
- `--gif-width`, `--fps`, `--width/--height` (defaults are 900x1400 portrait = mobile breakpoint; desktop = `--width 1440 --height 900`). Cinematic ~16:9: `--width 1600 --height 812` + both bars = 1600×900.
- `--block-hosts` — allowlist external hosts.
- `--auto-annotate` — every bare `click`/`fill`/`select` step gets a rect outline on the target + a note with the element's visible label (aria-label > placeholder > title > text/value), for free. Lets the agent write `{click:"#deploy"}` and still get "Deploy to production" boxed — no per-step `rect`/`note` verbosity. Author-declared rect/note/circle/badge/modal on a step always wins (auto adds nothing there).

**Per-step `speed` (offline only — slow-mo / fast-forward):**
- `{"camera":".x","zoom":2,"speed":0.25}` plays THIS step's motion at quarter speed — smooth slow motion for showing a fast effect (the virtual clock samples the animation into ~4x the frames, not a stretched still). `speed: 2` fast-forwards a boring stretch. Range [0.1, 8]. Only the motion/animation of the step slows; static reading holds are unaffected. Realtime ignores `speed` (recordVideo is wall-bound) — this is a thing only the offline virtual clock can do.
- `--batch takes.json` — N takes, ONE browser, concurrency 3.
- `--offline` — render on the page's VIRTUAL clock: animated spans capture frame by frame, static reading dwells collapse to one advance, ffmpeg assembles stills (concat demuxer). Same steps, same verdicts, pixel-identical static frames; long text-heavy takes finish in a fraction of their scene time. fps defaults to 15 offline; `--keep-webm` is unavailable (no webm exists). Caveat: the page's own Date/clock runs virtual — a wall clock rendered BY the target page will look frozen.

## Camera, loupe, follow

- `{"camera":".sel","zoom":1.3}` frames the element and multiplies the auto-fit by 1.3 (clamped, anti-cut against the CONTENT bounds). `{"camera":"out"}` resets to base.
- Legacy: `{"zoom":".sel"}` auto-fits; `{"click":"x","zoom":true}` follows the click at 1.6x.
- `inset` = element loupe: a live style-frozen clone magnified in a round accent card with a leader back to the original — `{"inset":{"sel":"#kpi","zoom":2}}`. Use it for DETAIL inspection, camera for ATTENTION.
- `follow` (true or 1–3) makes the camera chase the cursor through that step's movement (long glides, cause→effect journeys); it persists across steps until `{"camera":...}`, `"out"`, or `follow:false`. Camera and cursor travel on the same clock and land together.

## Interactions

- `{"fill":"#email","text":"a@b.com","delay":45}` types char-by-char with real input events.
- `{"select":"#region","option":"São Paulo"}` opens a themed fake dropdown panel and picks the real option.

## Annotation grammar

- `marks` sub-badges inner elements (1.1, 1.2...) revealing one-by-one (`stagger` ms apart, default 380); add `text` per mark and a corner `glossary` panel lists every badge with its explanation — or pass `{"glossary":{"items":[{badge,text}...],"pos":"top-left","title":"...","width":360,"stagger":300}}` standalone, any content anywhere.
- EVERY explanatory label must visibly connect to its target: notes with `arrow` always draw one (vertical arrow or oriented leader); anchored modals draw a leader line — never leave a label floating. `arrow` also accepts `"top"`/`"bottom"` to point at the letterbox bars (they live outside the page canvas).
- `modal` without an anchor = centered narration over a dimmed backdrop; with an anchor = corner card farthest from the element; `{"backdrop":false}` = centered card without the dim.
- `hide` is narrative: the element fades out AT its step (not before the take) and stays hidden for the rest.
- `screen` = top-right pill naming the current screen (updates after a navigating click).
- Bars: `topbar`/`bottombar` persist, restyle to the page tone, `false` removes them clean.
- `fade` (60–1500ms) overrides that step's overlay fade for rhythm work — montages accelerate by shrinking wait+fade together.
- Text-bearing overlays hold on screen for reading time (≥4.5s, +250ms/word past 8, cap 12s — survives `--pace fast`).

## Verdicts

- Overlay precedence is a fixed ladder (backdrop < markers < leaders < badges < text cards < loupe; cursor always on top) — never DOM order.
- The placer self-reports: a take ends with `PLACE clean` or `PLACE warn step N: <what>` lines (fallback-clamped overlay, label covering page text). Inspect frames ONLY on warns — a clean take needs no eyes.

## Discipline

- `--dry` is MANDATORY before any recording — resolves every selector against the live page in <1s, prints [ok]/[MISS] per step, no recording. Fix misses, then record ONCE.
- Don't write step JSON from scratch: copy a preset from `scripts/presets/` (`form-flow.json`, `nav-flow.json`, `dashboard.json`) and swap selectors.
- For a cinematic take, also read `cinematic-grammar.md` (shot grammar, pacing curve, state hygiene, pre-flight checklist) and run its checklist over your steps.
