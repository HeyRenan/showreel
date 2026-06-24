# Changelog

All notable changes to Showreel are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Showreel turns "show me" into a finished visual — annotated screenshots, isolated
demos, flow GIFs, terminal recordings and before/after composites — driven entirely
by CSS selectors and JSON steps.

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

[1.1.5]: https://github.com/HeyRenan/showreel/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/HeyRenan/showreel/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/HeyRenan/showreel/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/HeyRenan/showreel/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/HeyRenan/showreel/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/HeyRenan/showreel/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/HeyRenan/showreel/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/HeyRenan/showreel/commits/v1.0.0
