# Changelog

All notable changes to Showreel are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Showreel turns "show me" into a finished visual — annotated screenshots, isolated
demos, flow GIFs, terminal recordings and before/after composites — driven entirely
by CSS selectors and JSON steps.

## [1.6.1] — 2026-07-08

### Fixed
- **Recording against a drifted app state is now refused, not silently mis-recorded.** Re-running a roster after the app moved on — a submitted form's button now `disabled`, a spent one-time action, a control now sitting under an overlay — used to slip the live safeguard: it drove the target with a DOM `el.click()`, which punches through a disabled/covered element without erroring, so the real coordinate-click then hit nothing or the overlay (reading as random clicks). The safeguard now asserts the target is actionable the way the real take clicks it and **refuses** (`[not-actionable]`, exit 2) on a `disabled` / `aria-disabled` / `pointer-events:none` / covered target, routing you to reset the app to a fresh state (occlusion is viewport-guarded, so a below-fold target is not false-flagged).
- **Audit driving now matches real typing.** The safeguard's `fill` sets the value through the native input setter and dispatches `input` + `change` + `blur`, so a submit gated on `change`/blur/controlled-state enables during the audit too — a valid fill→enable-submit flow (the `form-flow` preset) is no longer false-refused.

## [1.6.0] — 2026-07-07

### Added
- **Effort dial.** Ask for `quick` / `standard` / `rich` / `cinematic` in any language; absent a request, showreel now defaults to **`rich`** so a first render impresses with zero config. Effort scales the craft poured into the *right* artifact — it never forces a bigger artifact than the subject needs (one element → a polished annotated still, not a movie).
- **Storyboard preview.** Before recording a flow, showreel states the beats in plain language ("enter → zoom into #hero → click #deploy → pick a region → scroll to #services"). It proceeds by default; at `cinematic` effort — or on request — it waits for your nod.

### Changed
- **No more "economy mode".** The instruction surface is rebalanced: the default is rich rather than lowest-effort; a coherent multi-step flow is treated as one narrative (not "two concepts"); motion composition is the agent's judgment while easing/counts still come from the tables; and an explicit permission was added — *richness that explains is not filler*. Technical guardrails (`--dry`, render mode, label anchoring, shrink-before-deliver) are unchanged.

## [1.5.0] — 2026-07-07

### Added
- **Reproducible asset roster.** `assets-src/roster.json` + `assets-src/build-assets.mjs`
  regenerate every README asset from one manifest (`--group` / `--name` filters,
  resolution-safe shrink). `assets-src/build-composites.sh` + `primitives-jobs.json`
  cover the multi-step assets (auto discovery, before/after compose, framed beautify,
  primitive-callout batch). The ~50 grid gifs/pngs were previously hand-made against
  an uncommitted page — they now rebuild deterministically.
- **Shared premium design system.** `assets-src/demo/theme.css` holds the tokens and
  components both fixtures link; a new `assets-src/demo/overview.html` fixture gives
  the grid demos varied surface in one visual language.

### Changed
- **README graphics overhaul.** The hero is now an autoplaying `showcase.gif` (linking
  to the full MP4); the demo console is re-styled premium; all ~50 grid assets were
  re-recorded against the two fixtures in one consistent look.

### Fixed
- **Light theme** is no longer clobbered by the premium overlay (panels/KPIs stayed
  dark under `body.light`).
- **Pipeline spine** no longer bleeds through the stage icons, nor lights the connector
  into the still-pending deploy node.
- **Grid GIFs** render realtime at a uniform size — dropped an `--offline` pass that
  cropped camera/effect frames and a post-shrink that softened resolution.

## [1.4.1] — 2026-07-06

### Fixed
- **Showcase re-rendered — zoom churn removed.** The v1.4.0 showcase re-zoomed the
  deploy card three times (it framed `#deploy-panel`, pulled out, framed
  `#rollback-countdown` — which lives *inside* the panel — pulled out, then framed
  `#deploy-panel` again). Now one held camera on `#deploy-panel` carries the whole
  deploy flow (block → auto-rollback → re-run → ship), swapping only the annotation
  and the state colour. Authoring fix, not the motor. The committed source
  (`assets-src/showcase-steps.json`) is replaced with this didactic flow too, so
  the shipped mp4 and its source stay in sync — re-rendering reproduces the fixed
  reel, not the old feature-cram roster.

### Changed
- **Zoom-churn audit now catches nested re-framing.** The audit only flagged
  re-framing the *same selector* after a `camera:"out"`; it missed re-framing a
  nested / containing element of the same card (the exact bug above). The live
  audit (`auditRosterLive`) now runs the DOM `contains` check both ways, so
  framing a child — or the parent — of a card framed a beat ago is flagged as
  `zoom-churn`. Warning, never fatal — churn is a craft issue, not broken output,
  and the `contains` heuristic can flag a motivated return, so blocking every
  render would be wrong. CI now audits the committed showcase roster in
  `--strict`, so any warning (churn included) fails the build: the project
  enforces zero-churn on its own artifacts while everyone else keeps
  warn-by-default plus opt-in `--strict`. +1 test (573 total).

## [1.4.0] — 2026-07-06

### Changed
- **Instructions realigned to the didactic purpose.** The reference docs had
  drifted into film / "cinematic" theory — a `hook → build → climax → resolution`
  story arc, "exactly one climax", a 2-minute retention curve cited to
  video-marketing — which pushed models to add drama (stacked payoff effects,
  on-screen chapter pills, panel-jumping) to what are really didactic
  feature-flow / showcase / e2e walkthroughs. Showreel documents software to
  **inform, not entertain**; this removes the drift and promotes the legibility
  spine already in the same files (the Motivation rule, one-message-per-beat,
  reading-time dwell).
  - `cinematic-grammar.md` §4: content-driven pacing replaces the "2-minute
    curve" story arc; the mandated climax/hook + marketing citation are dropped;
    the checklist items that gated an arc are deleted and renumbered 1–18; modal
    / montage / color reframed from "act boundaries / celebration" to topic.
  - `motion-design.md`: Preset H/I "resolution / hook teaser" → "closing summary
    / end-state-first opener"; payoff/arc delexicalized in the number table + MASTERS.
  - `rec-cookbook.md`: now-stale "arc" cross-refs → "pacing, shot grammar".
  - `SKILL.md`: hero row "arc order" → the real end-to-end flow, "never a story arc".
  - README (EN + pt-BR), `plugin.json`, `marketplace.json`: "cinematic" branding
    demoted to smooth-motion / walkthrough; the didactic positioning sharpened.

### Validation
- Docs only — motor untouched (**572/572** tests green). A blind matrix of
  artifacts (still, auto, demo, gif, mp4, e2e) authored from the realigned docs
  passes every motor gate (dry / PLACE / audit) and comes out drama-free.

## [1.3.0] — 2026-06-25

### Added
- **`beautify.mjs` — share-ready frames.** Wraps any PNG in a browser-window
  (traffic lights + url bar), card, or minimal frame — soft shadow, rounded
  corners, gradient background — and sizes the canvas to a social aspect with
  `--ratio 16:9|9:16|1:1` (the window is centered, never cropped). Flags
  `--frame`, `--bg "c1,c2"`, `--pad`, `--radius`, `--url`, `--no-shadow`. New pure
  geometry module `beautify-frame.mjs` (`frameLayout`, `resolveBackground`) plus a
  `Browser.beautify` in-page compositor; the README "Share-ready frames" image is
  one `beautify` call.

### Tests
- Added `beautify.test.mjs` — frame layout (window/card/minimal), ratio
  enlargement, background resolution, CLI parse. 572 tests.

## [1.2.0] — 2026-06-25

### Added
- **`auto.mjs` — URL-only quick path.** Point it at a page with no selectors: it
  discovers the salient elements (main heading, primary action, navigation, hero
  image, key metrics, cards), annotates each with a role-based note, and runs the
  same `vcheck` gate as `prove`. One browser launch; writes N annotated PNGs plus
  an `index.json` manifest, then an `AUTO <k>/<n> PASS|FAIL` line. Flags `--max`,
  `--width`, `--height`, `--dpr`, `--out-dir`. A discovered element that vanishes
  before capture (SPA re-render, themed dark/light swap) is a soft skip, not a
  failure. New pure core `auto-rank.mjs` (ranking, role→label, in-page collector).

### Changed
- Exported `proveOne` from `prove.mjs` (behavior unchanged) so `auto` runs the
  exact same capture + gate path as a hand-authored proof.
- `auto` ranking prefers the stronger selector within a role (a real `.cta` over a
  bare `button`) and requires a digit for `key-metric` candidates — so it marks the
  actual primary action and real numbers, not an icon toggle or a status pill.

### Docs
- README (EN + pt-BR): new "Zero config — just a URL" section showing four
  elements auto-discovered and annotated from one `auto.mjs` command, plus an
  Auto row at the top of the capability table.

### Tests
- Added `auto.test.mjs` — pure ranking, role labels, option helpers, CLI parse,
  and `summarize` reuse (pins `auto` to the same gate as `prove`). 563 tests.

## [1.1.6] — 2026-06-24

### Fixed
- **`shot.mjs` ran `main()` on import.** Unlike every other script it had no
  entry-point guard, so importing it (to reuse `parse`, or from a test) executed
  the CLI against the importer's argv — printing usage and calling `process.exit`.
  Wrapped `main()` in the standard `import.meta.url` guard.

### Tests
- Exported `parse` from `shot`/`compose` and added argument-parsing tests for
  `shot`, `compose` and `tape` — the CLI parsers that had no dedicated coverage.
  547 tests.

## [1.1.5] — 2026-06-24

### Fixed
- **`prove --circle` always failed vcheck.** Dominance was judged against the bare
  target rect, but the circle marker is drawn padded OUT beyond it, so most of its
  green ring read "outside" (~0.37 vs the 0.6 floor) — a correctly drawn ring
  exited non-zero. It is now judged against the ellipse's own box.
- **`rec --dry` was unusable as documented.** It required an output path (though it
  writes nothing), was preempted by the safeguard audit on a missing selector, and
  only checked a subset of selector keys — `rect`/`circle`/`spotlight`/`glow`/… were
  skipped, so a missing selector there read as a false PASS. `--dry` now runs with
  no output, reports `[MISS]` for every missing selector across all selector-bearing
  keys, and exits non-zero on any miss.

### Changed
- `compose` / `compose-video` report `input not found: <path>` for a missing input
  instead of leaking a raw `ENOENT`/ffmpeg error (matches `shrink`/`demo`/`shot`).

### Tests
- Added unit + render-real regression tests for `prove --circle` and `rec --dry`
  (found by intensive testing). 541 tests.

## [1.1.4] — 2026-06-24

### Internal
- De-duplicated `ancestorBoxes` — the crop-snapping ancestor walk was copy-pasted
  byte-for-byte in `prove.mjs` and `demo.mjs` (same pattern as the v1.1.1
  `textNeighbors` cleanup). Moved to a single `Browser.ancestorBoxes` method,
  keeping `lib/autoplace.mjs` pure. No behavior change (verified by real `demo` +
  `prove` renders; 536 tests green).

## [1.1.3] — 2026-06-24

### Fixed
- **Demo build log was out of chronological order.** On a failed gate the demo
  appended "deploy gate FAILED" stamped `10:42:05` — a duplicate of the static
  "scanned image · 10:42:05" line, and it landed *after* `10:42:08 awaiting deploy
  approval`, so the log read 06 → 07 → 08 → 05 → 09. The failure now stamps
  `10:42:09` and the success `10:42:11`, so the log is monotonic with no duplicate
  timestamps (verified by driving the gate→ship flow). Re-rendered the showcase.

## [1.1.2] — 2026-06-24

### Fixed
- **showcase.mp4 deploy arc was broken.** The v1.1.0 re-render dropped the
  `?gate=fail` query param, so the first `#deploy` click shipped instead of
  failing the gate — the whole blocked → auto-rollback → fixed → shipped story
  then played over an already-"Deployed" console (orphaned rollback note, "gate
  blocked" over a live stage). Re-rendered with the gate armed; the fail scene
  (red button, ticking rollback) and the ship now read correctly.

### Added
- `assets-src/build-showcase.sh` — reproducible showcase render that bakes in the
  required `?gate=fail` param and the `--width 1280` (1280×720) framing, so the
  reel can't be regenerated wrong again.

## [1.1.1] — 2026-06-24

### Internal
- De-duplicated `textNeighbors` (the autoplace text-obstacle scan was copy-pasted
  byte-for-byte in `prove.mjs` and `demo.mjs`) into a single `Browser.textNeighbors`
  method, keeping `lib/autoplace.mjs` pure (no browser I/O).
- Replaced a silent `statSync` try/catch in `prove.mjs` with a named
  `outputByteSize` helper, so a missing/unreadable output reads as 0 by intent.

## [1.1.0] — 2026-06-24

### Fixed
- **`progress` rail no longer reads as broken.** The rail anchored to the host's
  bottom edge, so on a content-flush node (a pipeline stage whose last child is a
  status chip) it painted ON TOP of that chip and flashed by — in the showcase and
  the README gif it looked like nothing happened. The rail now picks a lane: it
  stays INSIDE a host that has bottom padding (the premium card look), and drops to
  a clean UNDER lane just beneath a content-flush host so the chip is never covered.

### Changed
- The `progress` geometry + lane choice moved to a pure, unit-tested function
  (`progressRailGeometry`), split measure → compute → draw. An under-lane rail also
  reveals a clipping host's overflow for the duration, then restores it.

### Assets
- Re-rendered `assets/showcase.mp4` (+ poster) and `assets/progress.gif` so the
  rollout actually reads. The renders also pick up the v1.0.1 spotlight-note fix.

## [1.0.1] — 2026-06-24

### Fixed
- **Spotlight notes legible on the dimmed field**: a `note` paired with `spotlight`
  chose its pill colour from the bright page underneath — but the spotlight dim is a
  `pointer-events:none` overlay the colour probe (`elementFromPoint`) can't see, so on
  a light page the note resolved a glaring white box on a dark scene (same grammar,
  different placement, different look). The note now judges the EFFECTIVE surface —
  page luminance composited with the spotlight dim — and resolves a dark, high-contrast
  pill wherever it lands.

### Internal
- Dropped the dead `NOTEBG` token; the note surface is resolved per-placement.
- Added a render-real regression test that drives the full pipeline and asserts the
  spotlight note pill on rasterized frames. 531 tests.

## [1.0.0] — 2026-06-23

First stable release — the full capture motor.

### Added
- **Annotated proofs**: rect, badge, circle, blur, note and arrow callouts placed
  by CSS selector, verified for placement (no eyeballing).
- **Annotation primitives**: `marks` sub-badges, `glossary` panels, `spotlight`
  (dims the frame except a lit window on the target).
- **Live elements** — a `glossary` or `modal` given an `id` becomes *live*: later
  `live` steps mutate it in place across steps with no rebuild and no blink, via
  five verbs — `append`, `update`, `recolor`, `replace`, `remove`. Per-item colors,
  page-theme-matched text, automatic corner-cascade, scene-scoped lifetime.
- **Motion / state kit** — the step vocabulary is **56 keys**: `confetti, countup,
  sparkline, pulse, ripple, shake, glow, checkmark, typeon, reveal, orbit, kenburns,
  flash, progress, countdown, trail`, plus `redact`, `highlight`, `scrollIn`, and the
  per-effect knobs `size, dur, count, intensity`.
- **Flow recordings**: typed `fill`, faked `select` panels, `click` ripples.
- **Cinematic camera**: `camera`/`follow` (chase the cursor), the `inset` loupe,
  per-step `accent` and `fade`, anti-cut clamping. Annotation halos stay contained
  inside their card under a camera zoom.
- **`--auto-annotate`**: a bare `click`/`fill`/`select` step gets a rect outline +
  the element's own label, for free.
- **Offline render** (`--offline`): renders on the page's paused virtual clock
  instead of recording in real time. Animated spans capture frame by frame; static
  reading dwells collapse to a single advance; ffmpeg assembles the stills.
- **Per-step `speed`** (offline only): slow-motion (`<1`) or fast-forward (`>1`),
  range 0.1–8.
- **`--contact-sheet`**: a tile of ~24 frames spanning the take.
- **Terminal recordings** and **before/after composites**.
- **Size optimizer** (`shrink`): quality-preserving by default, optional target-kb.
- README shows every feature with its own generated GIF, plus a full showcase.
- Bundled "Lumen" demo page, self-contained Chromium, zero credentials.

### Quality
- **WCAG contrast**: badge digit and note pill colors pick by real contrast against
  their surface, not a fixed luminance threshold (AA-pass on green/purple accents,
  readable notes over opposite-theme sections).
- **Capture-robust progress**: the rail animates `width` (not `scaleX`, which the
  video capture culls at large render widths), reads on light surfaces, and reports
  a zero-box target instead of silently no-opping.
- **DOM-injection-safe authoring**: author color/badge values are charset-sanitized
  and escaped before they reach `innerHTML`.
- **Render-validated**: output is asserted on the rasterized frame, not eyeballed.

### Architecture
- **Modular recorder**: `rec.mjs` orchestrates single-responsibility modules
  (`rec-steps`, `cam-inject`, `rec-camera`, `rec-motion`, `rec-annotate`, `rec-live`,
  `rec-input`, `rec-encode`, `rec-page`) over one `clock` that makes realtime and
  offline two implementations of the same time contract. 530 tests, no network or
  browser needed.

[1.1.6]: https://github.com/HeyRenan/showreel/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/HeyRenan/showreel/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/HeyRenan/showreel/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/HeyRenan/showreel/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/HeyRenan/showreel/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/HeyRenan/showreel/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/HeyRenan/showreel/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/HeyRenan/showreel/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/HeyRenan/showreel/commits/v1.0.0
