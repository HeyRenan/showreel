# Changelog

All notable changes to Showreel are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Showreel turns "show me" into a finished visual — annotated screenshots, isolated
demos, flow GIFs, terminal recordings and before/after composites — driven entirely
by CSS selectors and JSON steps.

## [Unreleased]

### Fixed
- `prove` batch summary said `PROVE 0/1 PASS` even when nothing passed, and a
  missing selector was mislabeled `NO_SPACE`. Now: the summary reads `PASS` only
  when every proof passes (else `FAIL`), a selector/runtime failure is its own
  `ERROR` verdict, and the exit code is 3 for ERROR/NO_SPACE, 1 for FAIL, 0 only
  on all-pass. Logic extracted to a pure `summarize()` with full test coverage.
- String CLI flags (`--label`, `--blur`, `--kind`, `--text`, `--theme`, `--steps`,
  `--labels`, `--batch`, …) silently swallowed the next flag when their value was
  missing — `prove … --label --circle` bound the label to "--circle" and dropped
  the circle. A shared `str()` guard now rejects a missing or flag-shaped value
  with a scoped error, across all six entrypoints.
- `rec` now reports a malformed steps/batch JSON as `rec: invalid JSON in <src>: …`
  (was a bare V8 SyntaxError with no file context).
- `runLadder` (shrink) throws a clear error on an empty attempt list instead of
  dereferencing a null `best`.
- `tape` wraps `main()` so a failure prints a clean scoped message like the other
  scripts, not a raw stack trace.

### Added
- Direct unit coverage for the annotation core: `pngDims` (PNG IHDR parsing,
  malformed-input rejection) and `selfCheck` (does an annotation land on its
  target — area vs point modes), plus `prove` batch `summarize()`. 247 tests total.

## [1.0.0] — 2026-06-16

First stable release — the full capture motor.

### Added
- **Annotated proofs**: rect, badge, circle, blur, note and arrow callouts placed
  by CSS selector, verified for placement (no eyeballing).
- **Annotation primitives**: `marks` sub-badges, `glossary` panels, `spotlight`
  (dims the frame except a lit window on the target).
- **Flow recordings**: typed `fill`, faked `select` panels, `click` ripples, the
  full 31-key step vocabulary.
- **Cinematic camera**: `camera`/`follow` (chase the cursor), the `inset` loupe,
  per-step `accent` and `fade`, anti-cut clamping.
- **`--auto-annotate`**: a bare `click`/`fill`/`select` step gets a rect outline +
  the element's own label, for free.
- **Offline render** (`--offline`): renders on the page's paused virtual clock
  instead of recording in real time. Animated spans capture frame by frame; static
  reading dwells collapse to a single advance; ffmpeg assembles the stills.
- **Per-step `speed`** (offline only): slow-motion (`<1`) or fast-forward (`>1`),
  range 0.1–8.
- **`--contact-sheet`**: a tile of ~24 frames spanning the take, so it reviews
  itself in one image.
- **Terminal recordings** and **before/after composites**.
- **Size optimizer** (`shrink`): quality-preserving by default, optional target-kb.
- Bundled "Lumen" demo page, self-contained Chromium, zero credentials.

### Architecture
- **Modular recorder**: `rec.mjs` orchestrates single-responsibility modules
  (`rec-steps`, `cam-inject`, `rec-camera`, `rec-motion`, `rec-annotate`,
  `rec-input`, `rec-encode`, `rec-page`) over one `clock` that makes realtime and
  offline two implementations of the same time contract. 247 tests, no network or
  browser needed.

[Unreleased]: https://github.com/HeyRenan/showreel/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/HeyRenan/showreel/commits/main
