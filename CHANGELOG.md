# Changelog

All notable changes to Showreel are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Showreel turns "show me" into a finished visual — annotated screenshots, isolated
demos, flow GIFs, terminal recordings and before/after composites — driven entirely
by CSS selectors and JSON steps.

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

[1.0.0]: https://github.com/HeyRenan/showreel/commits/v1.0.0
