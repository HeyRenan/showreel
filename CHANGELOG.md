# Changelog

All notable changes to Showreel are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Showreel turns "show me" into a finished visual — annotated screenshots, isolated
demos, flow GIFs, terminal recordings and before/after composites — driven entirely
by CSS selectors and JSON steps.

## [Unreleased]

## [1.1.0] — 2026-06-18

### Added
- **Live elements** — a `glossary` or `modal` given an `id` becomes *live*: later
  `live` steps mutate it in place across steps with no rebuild and no blink, via
  five verbs — `append`, `update` (text/color/badge of a row), `recolor` (one row
  or the whole accent), `replace` (swap the body), `remove`. Per-item colors, text
  that matches the page theme, automatic corner-cascade when several share a corner,
  scene-scoped lifetime (cleared at a `screen` change / `camera:"out"`).
- The full step vocabulary is now **56 keys** (was 31): adds the motion/state kit —
  `confetti, countup, sparkline, pulse, ripple, shake, glow, checkmark, typeon,
  reveal, orbit, kenburns, flash, progress, countdown, trail`, plus `redact`,
  `highlight`, `scrollIn`, and the per-effect knobs `size, dur, count, intensity`.
- README now shows every feature with its own generated GIF, plus a regenerated
  full showcase. 528 tests total.

### Fixed
- **`rect` outline overflowed the frame**: the outline inflates 4px around the
  target, but a target flush against the viewport edge (e.g. a deploy button the
  camera cuts) pushed the border off-screen — it read as the rectangle
  "extrapolating" the element. Every edge now clamps inside the viewport so the
  outline hugs the visible bounds.
- **`progress` bar never appeared** (several stacked causes): (1) anchored on a
  zero-width fill element (`.deploy-progress i`, `width:0`) the render-time guard
  silently no-opped — it now reports the dead step instead of failing mute; (2) on
  a light surface the glass rail was near-white-on-white and only a thin fill
  showed — the light-theme rail now has a tinted track, a stronger hairline and a
  real drop shadow; (3) the rail is culled from the video capture when its target
  was already touched by another overlay (a `marks` badge, a deploy click) — so the
  showcase now runs the `progress` beat on a pristine pipeline stage before anything
  else marks it, and leaves the deploy climax to the demo's own native rollout bar.
  Render-proven (the bar fills 0→100% in frame).
- **Live state↔DOM divergence** (the biggest class): `update` rendered only a
  subset of fields (badge skipped); `recolor` of the panel accent flipped the
  border but not the title dot; `replace` with no `items` wiped the DOM while host
  state kept the old rows; the row text color (`NOTEINK`) was re-detected per op
  off `document.body` instead of the central theme, so a row appended later could
  read a different theme than its siblings. All now consistent, render-proven.
- **DOM injection**: author color/badge values were interpolated raw into
  `innerHTML` (live rows + the static glossary/marks badge) — a hostile value could
  break out of the attribute. Charset-sanitized colors, escaped badge text.
- **Safeguard false-rejects & false-negatives**: edge `arrow:"top"/"bottom"` and a
  `flash` color were treated as selectors (rejected valid rosters); missing
  `scrollTo`/`scrollIn`/`zoom` targets weren't gated at render (silently wrong
  scene). Both directions fixed.
- **WCAG contrast**: the badge digit color used a luminance threshold that picked
  the lower-contrast option for mid-luminance pills — now picks the higher-contrast
  digit (green/purple badges go from AA-fail to AA-pass).
- **DRY-of-a-decision**: the luma/theme dark-light midpoint and the aspect-ratio
  parse each had copies that had drifted (a degenerate `"0:9"` ratio forced the
  capture height in one of three functions); unified.
- The cursor glide read a real `0` start position as the `80` fallback (an 80px
  jump); a dead `{camera:{out:true}}` guard implied an unsupported form; the batch
  normalizer silently dropped a per-take `contact-sheet`.
- Carried over from the prior cycle: `prove` batch `summarize()` verdicts +
  exit codes, the shared `str()` flag guard, scoped JSON-parse errors, `runLadder`
  empty-list error, `tape` clean failure message.

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
