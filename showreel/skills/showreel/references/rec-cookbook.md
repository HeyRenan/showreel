# rec.mjs cookbook — steps, camera, interactions, pacing

Read this before writing any rec step JSON beyond a straight preset swap. This file is
**THE CONTRACT** — the only file you need to write VALID JSON. Craft (arc, easing numbers)
lives in `cinematic-grammar.md` + `motion-design.md`; open those only for a hero/cinematic reel.

## STEP GRAMMAR — correct by construction (all 56 keys)

Write every step against this table. **ANCHOR**: `element` = pinned to the target, travels
with it on scroll/camera (keep the element framed for the overlay's whole life — moving away
leaves the mask behind = the drift bug); `viewport` = fixed to frame; `page` = outside canvas.

| key | shape | REQUIRES sibling | ILLEGAL without | range | anchor |
|---|---|---|---|---|---|
| `click` | selector | — | — | — | element |
| `glide` | selector | — | — | — | element (cursor) |
| `scrollTo` | selector | — | — | — | — |
| `scrollIn` | selector \| `{sel,to?,dur?}` — scrolls INSIDE an overflow div, not the page | — | — | — | element |
| `to` | selector — the descendant to centre | **rides `scrollIn`** | ILLEGAL w/o `scrollIn` | — | — |
| `wait` | number ms | — | — | ≥0 | — |
| `note` | string | — | — | ≤12 words | element (w/ arrow) |
| `arrow` | `true`/`"top"`/`"bottom"` | rides `note`/anchored `modal` | — | — | — |
| `badge` | number | — | — | — | element |
| `rect` | selector | — | — | — | **element** |
| `circle` | selector | — | — | — | **element** |
| `blur` | selector | — | — | — | **element** |
| `hide` | selector | — | — | — | **element** |
| `redact` | selector | — | — | — | **element** |
| `highlight` | selector | — | — | a SMALL text run / cell / label — NOT a whole panel or row (a marker swipe over a big dark panel reads as nothing); blend auto-adapts to the surface | **element** |
| `spotlight` | selector, or `true` (rides step click/fill) | — | — | — | **element** |
| `inset` | selector or `{sel,zoom}` | — | — | zoom (1,3] | **element** |
| `marks` | array `{sel,badge?,rect?,circle?,text?}` | — | — | — | element each |
| `glossary` | `true` or `{items:[{badge,text}],pos?,title?,width?,stagger?}` | — | — | width [160,720] | viewport |
| `stagger` | number ms | **rides `marks`/`glossary`** | ILLEGAL standalone | ~320–400 | — |
| `modal` | string = THE TEXT shown, or `{header,html,footer,pos?,backdrop?}` | — | — | a bare string auto-centers over a dim backdrop; there is NO `"centered"` keyword and `note` is ignored on a modal step | viewport |
| `screen` | string | — | — | — | viewport |
| `topbar` | non-empty string, or `false` | — | — | — | page |
| `bottombar` | non-empty string, or `false` | — | — | — | page |
| `fill` | selector string | **`text`** | — | — | element |
| `text` | string to type | **`fill`** | ILLEGAL w/o `fill` | — | — |
| `delay` | number ms/char | **rides `fill`** | ILLEGAL w/o `fill` | 40–80 | — |
| `select` | selector string | **`option`** | — | — | element |
| `option` | string = **VISIBLE LABEL** | **`select`** | ILLEGAL w/o `select` | — | — |
| `camera` | `"out"` \| selector \| `{sel,zoom}` | — | — | zoom (1,3] | viewport |
| `zoom` | w/ `camera`→number(1,3]; alone→selector\|`"out"`\|`true` | `true` only w/ `click` | number ILLEGAL w/o `camera` | (1,3] | viewport |
| `follow` | `true` or number(1,3] | **`click`\|`glide`\|`fill`\|`select`** | `false`/`0` ILLEGAL | (1,3] | viewport |
| `accent` | CSS color | — | — | — | — |
| `fade` | number ms | — | — | [60,1500] | — |
| `speed` | number — **OFFLINE ONLY** | — | **ERROR in any realtime/`--fps` take** | [0.1,8] | — |
| `size` | number — proportional multiplier for THIS step's effects | — | — | (0,4] | — |
| `dur` | number ms — shared duration for THIS step's effects | — | — | [120,12000] | — |
| `count` | integer — shared count (rings/dots/particles/laps/digits) | — | — | [1,60] | — |
| `intensity` | number — shared strength (glow/amplitude/drift) | — | — | [0.2,2] | — |

### DYNAMIC PRIMITIVES — fire-and-forget motion (every one has SANE DEFAULTS)
Each row is a self-contained effect. **The bare form is enough — defaults are tuned.** Add knobs
only to deviate. Two ways to pass knobs: the step's shared `size`/`dur`/`count`/`intensity` keys
(affect every effect on the step), OR the effect's own object form `{sel, duration, count, scale,
intensity}` (overrides the shared keys for that one effect). `scale` (object form) == `size` (shared).

| key | bare shape | object form (knobs) | default | anchor |
| --- | --- | --- | --- | --- |
| `confetti` | `true` \| selector | `{sel?,duration,count,scale,intensity}` | 28 mini-rect chips, 1.05s flight | free |
| `pulse` | `true` \| selector | `{sel?,duration,count,scale,intensity}` | 3 rings, proportional | element |
| `ripple` | `true` \| selector | `{sel?,duration,count,scale,intensity}` | 2 rings + core | free |
| `shake` | `true` \| selector | `{sel?,duration,scale,intensity}` | 600ms, amp∝width | element |
| `glow` | selector | `{sel,duration,count,scale,intensity}` | 2 breaths | element |
| `orbit` | `true` \| selector | `{sel?,duration,count,scale,intensity}` | comet + 5 dots, 2 laps | element |
| `checkmark` | `true` \| selector | `{sel?,duration,scale}` | glass disc, drawn tick | free |
| `kenburns` | `true` \| selector | `{sel?,duration,scale}` | 2.5s drift, scale 1.06 | element |
| `flash` | `true` \| CSS color | — (use `dur`/`intensity`) | 560ms accent bloom | free |
| `progress` | selector | `{sel,duration,scale}` | 1.1s fill, bottom rail | element |
| `countdown` | seconds \| selector \| `{n,sel}` | `{n,sel?,duration,scale}` | 3..2..1, 900ms/digit | free/element |
| `trail` | `{from,to}` | `{from,to,duration,count,scale,intensity}` | comet + 12 tail dots | free |
| `countup` | `true` \| selector | `{sel,to?,duration}` | 1.2s ease-out count | element |
| `typeon` | selector | `{sel,text?,duration}` | 1.2s type w/ caret | element |
| `reveal` | selector | `{sel,duration}` | 0.9s L→R wipe | element |
| `sparkline` | selector | `{sel,points?,duration,scale}` | 1.2s draw + hold | free |

> Defaults exist so a weak agent fires `{"pulse":"#deploy"}` and gets a good result. Reach for knobs
> only when the user asks for "bigger / longer / more / faster". `count` means the natural unit per
> effect (rings, particles, comet dots, orbit laps, countdown seconds). All knobs clamp — out-of-range
> is rejected by the validator, never silently coerced.

> **`confetti` and `sparkline` are realtime-only.** Their motion is a transform / stroke-dashoffset
> CSS transition; under the paused virtual clock (`--offline`) the engine jumps the transition to its
> end pose without sampling the in-between, so the burst captures BLANK. `rec` now refuses these steps
> under `--offline` with a hard error (a silent blank burst is worse than a refusal). Record any take
> carrying them realtime (`--fps 30`, no `--offline`). `flash` is opacity-on-a-static-layer and renders
> fine offline.

### LIVE ELEMENTS — persist across steps + mutate in place (glossary, modal)
A **glossary** or **modal** carrying an `id` is born LIVE: it stays on screen
through the following steps instead of the usual wipe-and-rebuild, and a later
`live` step mutates it in place — grow it, recolor it, swap its body — with no
blink. Per-item `color` is honoured (rotate hues as the panel grows).

```jsonc
// birth: an id makes it live. items carry their own color.
{"glossary":{"id":"feat","title":"Shipped","items":[{"badge":1,"text":"Auth","color":"#2563eb"}]},"wait":3000}
{"live":{"append":{"badge":2,"text":"Cache","color":"#16a34a"}},"wait":2500}   // grows, old rows hold
{"live":{"update":{"item":1,"text":"Auth ✓"}}}                                  // 1-based row edit
{"live":{"recolor":{"item":2,"color":"#e11d48"}}}                               // one row…
{"live":{"recolor":{"color":"#a855f7"}}}                                        // …or the whole accent
{"live":{"replace":{"items":[{"badge":1,"text":"Reset"}]}}}                     // swap body, keep panel
{"live":{"remove":true}}                                                        // or {"remove":"feat"} by id
```
RULES:
- `live` takes **exactly one** verb: `append` | `update` | `recolor` | `replace` | `remove`.
- No `id` → mutates the sole live element; with several, pass `{"live":{"id":"feat",…}}`.
- A scene boundary (`screen` change / `camera:"out"`) **clears all** live elements — no carry-over between scenes. No need to `remove` before a new scene.
- `live` is **its own step** — it cannot share a step with `note`/`rect`/`glossary`/`modal`/etc (rejected; the live op would suppress them).
- A `live` op on a missing/ambiguous target is a logged no-op, never a crash.
- ONLY glossary + modal are live. Anchored primitives (`note`, `marks`, `progress`) pin to a page element and are NOT live — re-anchoring each step is not persistence.
- An `id` on an ephemeral one-shot (`confetti`/`ripple`/`pulse`/…) is rejected — those are events, not state.

### FORBIDDEN FORMS — rejected; never write them
```jsonc
{"camera":"out","follow":false}        // follow:false is INVALID — release is a BARE camera:out
{"follow":0}                            // 0 not in (1,3]
{"follow":1.5}                          // follow alone — must ride click/glide/fill/select
{"text":"Dana"}                         // text without fill
{"select":"#region","option":"sa-east"} // option = value attr; use the LABEL "São Paulo"
{"stagger":300}                         // stagger without marks/glossary
{"zoom":1.5}                            // zoom number without camera
{"camera":{"sel":".x","zoom":1.5},"speed":0.7} // speed in a realtime reel (no-op + misleads)
{"modal":"centered","note":"Done"}     // "centered" renders as the modal TEXT; note is ignored
```
> `modal` value IS the text: `{"modal":"Deployed in four clicks.","wait":2500}`. A bare string
> auto-centers over a dim backdrop. Pull `{"camera":"out"}` BEFORE a closing modal so it is full-frame.

### CORRECT FORMS — copy these shapes
```jsonc
{"fill":"#iname","text":"Dana Lima","delay":70,"note":"Typed live","arrow":true,"wait":4500}
{"select":"#region","option":"São Paulo","note":"Pick a region","arrow":true,"wait":4500}
// "São Paulo" is the LABEL of <option value="sa-east">São Paulo</option> — never "sa-east".

// FOLLOW LIFECYCLE — bind on the FIRST travel step, glide ≥2 more, then release:
{"glide":".hero h1","follow":1.6,"accent":"#a855f7","note":"Camera chases the cursor","arrow":true,"wait":4500},
{"glide":".stat:nth-child(3) b","note":"…to the deploys metric","arrow":true,"wait":4500},
{"glide":".card:nth-child(3) h3","note":"…down to a service","arrow":true,"wait":4500},
{"glide":"#deploy","note":"…onto the ship button","arrow":true,"wait":4500},
{"camera":"out","wait":900}            // the ONLY way to release follow
```
> `fill`/`select` also accept a nested `{sel, value}` object (both forms validate); the flat
> sibling form above is canonical — prefer it so every example matches.

## RENDER MODE — the #1 fidelity gate

- **Moving reel (any `glide`/`follow`/`camera`/`fill`/`select`) = realtime `--fps 30`.** Why:
  realtime captures continuous eased motion at 30fps; `--offline` is 15fps stills → reads as a
  slideshow. Record verbatim, no `--offline`, no `--pace fast` (it trims holds/fades ~45% and
  collapses the easing you authored), no `--speed`:
  ```
  node scripts/rec.mjs <url> --steps steps.json out.mp4 --fps 30 --width 1600 --height 812
  ```
- `--offline` is ONLY for static dwell/text-only takes with no cursor or camera motion.
- `speed` is a no-op in realtime (wall-clock bound). To slow-mo a moving beat, render THAT clip
  `--offline` separately and composite — never put `speed` in the realtime reel.

## FIXED PANELS under camera — keep them flat

A `position:fixed` element (a nav drawer, a sticky modal) opened DURING a `camera`
zoom rides the transform and drifts. RULE: open/show a fixed panel in a FULL-PAGE
scene (no `camera` zoom active) — demo the drawer/menu before or after a framed
scene, never inside one. (The motor compensates fixed bars it injected, not the
page's own dynamically-opened fixed nodes.)

## ANCHORING — the overlay-drift gate

Element-anchored overlays (`rect/circle/blur/hide/redact/highlight/spotlight/inset/marks`)
travel with the element and live until cleared. **RULE: the `scrollTo`/`camera` that frames the
element must be on the SAME step that introduces the overlay** (so it resolves at final
position), OR clear the overlay before any later scroll/camera move. Never scroll/camera-move
while an element-anchored overlay from an EARLIER step is still meant to be visible — that is
exactly how masks slide off their target.

## SAFEGUARDS — the recorder REFUSES these (don't fight the gate, author it right)

`rec` runs a live pre-flight before any render and **exits with an error** on the
failures below (override only with `--no-safeguards`, for a deliberate exception).
Run `node scripts/audit-roster.mjs <url> <roster.json>` to check a roster without rendering.

**1. Off-screen action (ERROR).** Every action/primitive must anchor to an element
INSIDE the current scene's camera frame. Firing on an element the camera doesn't
show = the viewer never sees it.
```jsonc
WRONG: { "camera": {"sel":"#metrics","zoom":2} }, { "click": "#deploy" }   // #deploy is in another panel
RIGHT: { "camera": {"sel":"#deploy-panel","zoom":2} }, { "click": "#deploy" } // frame the panel that holds it
```
Multi-panel beat? Frame panel A, act, `camera:"out"` or re-frame panel B, then act there. One event, one frame.

**1b. Partial visibility — mark the WHOLE element, never a sliver (engine, automatic + RULE).**
An element may be highlighted/redacted/spotlit/circled ONLY when its ENTIRE box is on
screen. Never mark a card half off the viewport, and never mark one half-clipped by an
inner scroll container — a marker drawn over a sliver, with the rest cut by the fold or a
container edge, is broken. The motor now brings every mark target FULLY into view before it
fires: it scrolls the target's overflow containers (inner-first) THEN the page, so the whole
box shows. If the element is bigger than the viewport (can never fully fit), the motor refuses
to scroll uselessly and logs an error — you must frame it with `camera` first, or mark a
smaller sub-element. Don't fight this: anchor marks to things that fit, and let the gate do
the scrolling. (Inner-scroll reveal uses the same machinery as `scrollIn`.)

**2. Screen-breaker (ERROR).** An anchor that is `display:none` / zero-area when the
step fires paints on nothing (or leaves a stray box). Reveal it first (the page's
own JS, e.g. a `click` that un-hides a toast/row) BEFORE the step references it.
The audit drives clicks as it walks, so a toast revealed by an earlier `click` is fine.

**3. Arbitrary state primitive (WARN).** State primitives (`orbit glow trail progress
checkmark flash ripple countup sparkline reveal confetti typeon countdown`) must ride a
REAL state change — a `click` on the deploy/ship control earlier in the reel. Firing one
on a resting element is decoration, the thing this whole grammar exists to prevent.
```jsonc
WRONG: { "camera": {"sel":"#pipeline"} }, { "orbit": "#stage-deploy .stage-ring" }  // stage is idle
RIGHT: …{ "click": "#deploy" }… (earlier) … then { "orbit": "#stage-deploy .stage-ring" } // stage is running
```
State persists across scenes: one deploy click legitimizes every later payoff (checkmark, confetti…).
Always-on primitives (`pulse` on a live dot, `kenburns` on an image) need no trigger.

**4. One camera target per event.** Don't pan to a new selector mid-beat expecting two
things in one breath — the off-screen gate will catch the second one. Close with
`camera:"out"` between distinct frames.

**5. Zoom only what can be magnified (ERROR).** `camera:{sel,zoom:N>1}` on an element
too wide or tall to enlarge without cropping (a full-width header, a full-height rail)
is clamped to ~1x by the no-crop ceiling — the scene renders WIDE and the zoom reads as
a random pan. The audit errors when the achievable scale is < 1.15x. Frame a SMALLER
sub-element (a button group, a field, a row, a content-height dropdown), not the wide
container. If you must show a wide element, frame it with NO zoom number (fit), and
expect a wide shot.

**6. Zoom-churn (WARN).** Framing panel A, `camera:"out"`, then framing panel A again
is a wasted zoom-out/zoom-in cycle the viewer reads as the camera flickering on the same
element. Multiple notes on ONE panel must KEEP the zoom and only swap the annotation —
the camera holds, the label cross-fades (the engine cross-fades note→note automatically).
```jsonc
WRONG: { "camera":{"sel":"#card"} }, {"note":"A","highlight":"#card"}, { "camera":"out" },
       { "camera":{"sel":"#card"} }, {"note":"B","highlight":"#card"}   // out + re-zoom = flicker
RIGHT: { "camera":{"sel":"#card"} }, {"note":"A","highlight":"#card"},
       {"note":"B","highlight":"#card"}                                  // zoom held, note swaps
```
`camera:"out"` belongs only at the END of a panel's story, when the next beat is a
DIFFERENT panel. The engine never re-zooms an unchanged frame on its own — only an
explicit `out` + re-frame does, so just don't write it.

## AUTHORING RULES the engine now enforces or the design must honour

- **Markers hug their content, not the box** (engine, automatic). highlight/redact/blur
  measure the real text run and size to it; a marker on a wide table cell no longer
  bleeds into neighbours. You don't need to wrap text in a span — the motor does it.
- **State must persist for its scene** (page-design rule). A failure/success state the
  reel narrates (a blocked button, a failed stage) must STAY for the whole scene, not
  flash for 600ms. Separate the one-shot ANIMATION (e.g. a `.shaking` class) from the
  STATE COLOUR (`.blocked` red) — remove the animation, keep the colour until the next
  real transition. An error the viewer can't dwell on reads as a glitch.
- **A note never repeats a visible label or rides an ephemeral toast.** Don't `rect` a
  toast that auto-fades or sits in a cramped slot — point the note at the durable result
  (the button that now says "Deployed"). `note` states the WHY, ≤8 words, never echoes
  on-screen text.
- **`fill` wipes the field before typing** (engine, automatic). Re-filling a field that
  was filled earlier in the reel clears it first, then types — content never stacks. You
  can revisit an input freely; the motor resets it.
- **Notes cross-fade, never hard-cut** (engine, automatic). A new note fades the previous
  one out as it rises, so consecutive labels on a held frame dissolve into each other
  instead of popping. This is why rule 6 (keep the zoom, swap the note) looks smooth — let
  it; don't `camera:"out"` to "reset" between notes.
- **Markers never bleed a table cell** (engine, automatic). redact/highlight on a `td`/`th`/
  row use ZERO vertical overhang so the bar hugs its row and can't touch the line above or
  below. Elsewhere the overhang stays. You don't manage this — just anchor to the real cell.
- **Countdown disc fits its target** (engine, automatic). The countdown ring is capped to
  the target's SHORT side, so circling a wide-but-short control (a full-width button) keeps
  the disc INSIDE the box instead of spilling above and below it.
- **Don't pre-`glide` before a `click`/`fill`/`select` on the same target** (engine collapses
  it, but author it clean). A bare `{"glide":"#x"}` immediately followed by an action on `#x`
  is a wasted second cursor move — the action already glides there. The motor drops the
  pre-glide and carries its accent forward, but don't write it. `glide` is for a cursor TOUR
  (consecutive glides to DIFFERENT targets, e.g. a `follow` walk) or a glide with its own note.
- **Theme is read LIVE per step** (engine, automatic). A mid-reel `click` on a theme toggle
  re-colours every annotation built afterward — the motor re-reads the page's body luminance
  each step. An author accent that would wash out on the new surface is auto-mixed toward
  contrast (the 0.32 floor). So a half-dark/half-light reel just works: toggle the theme with
  the camera pulled OUT (so the viewer sees the surface re-theme), then keep authoring.
- **`scrollIn` scrolls INSIDE a container, `scrollTo` scrolls the PAGE.** When the element you
  want is clipped inside an `overflow:auto/scroll` div (a log viewer, a list, a chat feed),
  `scrollTo`/`smoothScroll` move the window and never reveal it — the content is inside the
  box, not the page. Use `{"scrollIn":"#log"}` to scroll that container to its bottom (the
  "follow the log as it grows" move) or `{"scrollIn":"#log","to":"#row-42"}` to centre a
  specific descendant. Animated on the take's clock, camera-scale-agnostic (scrollTop is
  layout). Pair with `camera` framing the container first so the scroll is visible.

## Inputs

- `--steps steps.json` or `--steps-json '[...]'` (inline, no temp file).
- Output positional: `out.gif`, or `out.mp4` for **mp4-only** (skips the gif encode entirely — the fast default when no gif is needed). `--mp4 out.mp4` exports h264 alongside a gif; `--keep-webm out.webm` keeps the intermediate + `.timeline.json` sidecar (compose-video consumes it).
- `steps.json` — selectors + text only; the script owns cursor motion, timing, and annotation placement.
- Step keys — the STEP GRAMMAR + DYNAMIC PRIMITIVES tables above are the authoritative list (unknown keys are rejected up front); count must equal `STEP_KEYS.size` in `rec-steps.mjs` (56). The **STEP GRAMMAR** table above is the authoritative shape contract — write every step against it, never from memory.
- `spotlight` — `{"spotlight":".target","note":"..."}` dims the whole frame EXCEPT a lit window around the target, pulling the eye to one element (a soft accent ring traces the lit edge). `spotlight: true` rides the step's own click/fill anchor. Works under camera zoom. Use it instead of `rect` when the goal is focus, not just a box.

## Flags

- `--stamp` — "n / total" step counter pill.
- `--theme auto|light|dark` — force the palette; auto samples the page.
- `--accent <css-color>` — recolors every marker (rect/circle/badge/leader/glossary/inset; default green). Honor the user's color ask; beauty is the default otherwise. `accent` also works per step (montage finales).
- `--ratio` — final canvas forced to **16:9 by default**; any `W:H` or `free` only when asked.
- `--end-card gif|all|none` — **none by default**; the END card exists only on explicit request. When present: gif closes with it (loop marker), mp4 cuts before it.
- `--fit <n|off>` — establishing auto-fit is OPT-IN; takes open 1:1.
- `--pace fast` — trims scripted holds/fades ~45%. **NOT for a cinematic/motion reel** — it collapses the easing you authored. Use only for quick proofs, never a hero reel (see RENDER MODE gate).
- `--gif-width`, `--fps`, `--width/--height` (defaults are 900x1400 portrait = mobile breakpoint; desktop = `--width 1440 --height 900`). Cinematic ~16:9: `--width 1600 --height 812` + both bars = 1600×900.
- `--block-hosts` — allowlist external hosts.
- `--storage-state <file.json>` — record a LOGGED-IN page. Playwright storage-state JSON
  (cookies + localStorage) seeded into EVERY context (render + safeguard audit + dry), so the
  audit drives the page logged in too (deslogado it would false-fail every authed anchor).
- `--cookies <file.json>` — JSON array of Playwright cookie objects, added before `goto`.
  Combine with `--storage-state` (state at context creation, cookies augment after).
  ⚠️ Both files hold LIVE session secrets — keep them OUTSIDE the repo, never commit.
- `--auto-annotate` — every bare `click`/`fill`/`select` step gets a rect outline on the target + a note with the element's visible label (aria-label > placeholder > title > text/value), for free. Lets the agent write `{click:"#deploy"}` and still get "Deploy to production" boxed — no per-step `rect`/`note` verbosity. Author-declared rect/note/circle/badge/modal on a step always wins (auto adds nothing there).

**Per-step `speed` (OFFLINE ONLY — slow-mo / fast-forward):**
- `{"camera":".x","zoom":2,"speed":0.25}` plays THIS step's motion at quarter speed — smooth slow motion (the virtual clock samples the animation into ~4x frames, not a stretched still). `speed: 2` fast-forwards. Range [0.1, 8]. Only the step's motion slows; reading holds unaffected.
- **Realtime IGNORES `speed` (recordVideo is wall-bound).** A `speed` key in a realtime/`--fps` take is an ERROR — it silently does nothing and misleads you into thinking you added slow-mo. See the RENDER MODE gate: a moving reel is realtime, so it must carry NO `speed`. Slow-mo only exists in a separate `--offline` clip.
- `--batch takes.json` — N takes, ONE browser, concurrency 3.
- `--offline` — render on the page's VIRTUAL clock: animated spans capture frame by frame, static reading dwells collapse to one advance, ffmpeg assembles stills (concat demuxer). Same steps, same verdicts, pixel-identical static frames; long text-heavy takes finish in a fraction of their scene time. fps defaults to 15 offline; `--keep-webm` is unavailable (no webm exists). Caveat: the page's own Date/clock runs virtual — a wall clock rendered BY the target page will look frozen.

## Camera, loupe, follow

- `{"camera":".sel","zoom":1.3}` frames the element and multiplies the auto-fit by 1.3 (clamped, anti-cut against the CONTENT bounds). `{"camera":"out"}` resets to base.
- Legacy: `{"zoom":".sel"}` auto-fits; `{"click":"x","zoom":true}` follows the click at 1.6x.
- `inset` = element loupe: a live style-frozen clone magnified in a round accent card with a leader back to the original — `{"inset":{"sel":"#kpi","zoom":2}}`. Use it for DETAIL inspection, camera for ATTENTION.
- `follow` (true, or a number in (1, 3]) makes the camera chase the cursor through that step's movement (long glides, cause→effect journeys); it persists across steps until a step carries `camera`/`zoom`. Camera and cursor travel on the same clock and land together.
- **RELEASE follow with a bare `{"camera":"out"}` step (or a new `{"camera":{sel,zoom}}`). That is the ONLY release.** `follow:false` and `follow:0` are INVALID and rejected by the validator — never write them. `follow` MUST share its step with `click`/`glide`/`fill`/`select` (it rides a cursor move; it cannot stand alone).
- **A follow chase must span ≥3 consecutive moving steps before its release** — bind it on the first glide, glide ≥2 more, then `{"camera":"out"}`. A single-step follow is imperceptible and reads as absent.

## Interactions

- `{"fill":"#email","text":"a@b.com","delay":45}` types char-by-char with real input events.
- `{"select":"#region","option":"São Paulo"}` opens a themed fake dropdown panel and picks the real option.

## Annotation grammar

- `marks` sub-badges inner elements (1.1, 1.2...) revealing one-by-one (`stagger` ms apart, default 380); add `text` per mark and a corner `glossary` panel lists every badge with its explanation — or pass `{"glossary":{"items":[{badge,text}...],"pos":"top-left","title":"...","width":360,"stagger":300}}` standalone, any content anywhere.
- EVERY explanatory label must visibly connect to its target: notes with `arrow` always draw one (vertical arrow or oriented leader); anchored modals draw a leader line — never leave a label floating. `arrow` also accepts `"top"`/`"bottom"` to point at the letterbox bars (they live outside the page canvas).
- `modal` without an anchor = centered narration over a dimmed backdrop; with an anchor = corner card farthest from the element; `{"backdrop":false}` = centered card without the dim.
- `hide` is narrative: the element fades out AT its step (not before the take) and stays hidden for the rest.
- `screen` = top-right pill naming the current screen (updates after a navigating click).
- Bars: `topbar`/`bottombar` PERSIST once set, so they are for a context strip that genuinely informs the WHOLE reel. To merely DEMONSTRATE the bars (a showcase) show them in ONE scene then remove with `false` the next step — do NOT leave them on for the whole video unless every scene needs them. A bar that hangs around with nothing to say is noise.
- `fade` (60–1500ms) overrides that step's overlay fade for rhythm work — montages accelerate by shrinking wait+fade together.
- Text-bearing overlays hold on screen for reading time (≥4.5s, +250ms/word past 8, cap 12s — survives `--pace fast`).

## Verdicts

- Overlay precedence is a fixed ladder (backdrop < markers < leaders < badges < text cards < loupe; cursor always on top) — never DOM order.
- The placer self-reports: a take ends with `PLACE clean` or `PLACE warn step N: <what>` lines (fallback-clamped overlay, label covering page text). Inspect frames ONLY on warns — a clean take needs no eyes.

## Authoring procedure (top to bottom — do not skip)

1. **Inventory the page.** List every interactive surface (buttons, nav toggle, every `<form>` + its inputs, every `<select>`, drawer/modal triggers). You cannot tour what you have not listed.
2. **Map primitives → scenes.** For a feature tour, assign each relevant key to a scene by step index; write down any key you omit + why.
3. **Write steps against the GRAMMAR TABLE** (above) — never from memory. Composite by SPLITTING layers across steps (camera-step → mark-step → note-step), never piling keys on one object.
4. **`--dry` GATE (MANDATORY).** `node scripts/rec.mjs <url> --steps steps.json --dry` resolves every selector ([ok]/[MISS]). A [MISS] on a glide/camera/click/fill/select target = a frozen dead beat — recording is FORBIDDEN until zero MISS. Then re-read the pre-flight below over the JSON.
5. **Record realtime fps30** (RENDER MODE gate). One command, verbatim.
6. **PLACE check.** `PLACE clean` → done, do not watch the video. `PLACE warn step N` → fix THAT step's overlay, re-run from 4. This is the only post-record action — never re-watch for "feel" and re-tune.

- **Don't write from scratch:** copy a preset from `scripts/presets/` (`form-flow.json`, `nav-flow.json`, `dashboard.json`) and swap selectors AND values. If `--dry` MISSes after a swap, the SELECTOR is wrong, never the schema.
- For a cinematic take, also read `cinematic-grammar.md` (arc, shot grammar, state hygiene) and `motion-design.md` (easing/stagger numbers, compositing-by-splitting).

## Pre-flight — one binary checklist (run over the JSON before recording)

```
GRAMMAR  (all enforced by the validator; this is what it checks)
[ ] Only known keys appear (56 total; see grammar tables). No FORBIDDEN FORM (see table): no follow:false/0; follow rides
    click/glide/fill/select; text/delay only with fill; option only with select; option = LABEL
    not value; stagger only with marks/glossary; zoom-number only with camera; zoom:true only
    with click; NO speed anywhere (realtime reel).
[ ] Every camera frame-in has a matching camera:"out" before the next topic.
[ ] Every follow released by a bare camera:"out"; every follow run ≥3 consecutive moving steps.
RENDER MODE
[ ] Reel has motion ⇒ realtime --fps 30, NO --offline, NO --pace fast.
ANCHORING
[ ] No scrollTo/camera move while an element-anchored overlay from an EARLIER step is still up.
COMPLETENESS (feature tour)
[ ] Every assigned primitive present. Touched <form>: ALL fields filled + select picked +
    submit clicked + result held ≥1.5s. Nav/menu opened, ≥1 link walked, closed.
[ ] State hygiene: every opened panel/drawer/modal closed; no lingering toast/test input.
FIDELITY (numbers from motion-design.md)
[ ] One accent per scene. stagger ≥320ms; marks step wait ≥ 320*N + 4500. Camera frame-in
    wait ≥1200ms; follow glide wait ≥1500ms. No step piles >1 of {camera, a draw primitive, note}.
SELECTORS
[ ] --dry [ok] for EVERY glide/camera/follow/click/fill/select target. Zero [MISS].
```

> Text dwell is **motor-enforced** (≥4.5s, +250ms/word past 8, cap 12s — survives `--pace fast`).
> You do NOT compute `wait` for text holds; this is the one true dwell formula (the craft files
> point here). Just don't author a `wait` shorter than the read — let the motor hold.
