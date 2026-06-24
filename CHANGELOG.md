# Changelog

All notable changes to Showreel are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Showreel turns "show me" into a finished visual — annotated screenshots, isolated
demos, flow GIFs, terminal recordings and before/after composites — driven entirely
by CSS selectors and JSON steps.

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

[1.1.1]: https://github.com/HeyRenan/showreel/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/HeyRenan/showreel/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/HeyRenan/showreel/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/HeyRenan/showreel/commits/v1.0.0
