# Project guide — practices for building & shipping well

A grounded, instructive reference for working on this (and any) project: code,
testing, visual/motion output, docs, and release hygiene. Each section is
**principles first (portable)**, then a **→ showreel** note applying it here.
Every claim is researched, not invented; sources at the bottom.

Read the section you need. Don't read it all at once.

---

## 1. Code — clean, simple, readable

**The bar (KISS · DRY · YAGNI).** Code is read far more than written, so optimize
for the next reader (often future-you).
- **KISS** — the simplest thing that meets the requirement. A bicycle, not a rocket.
  If a reader would flinch (e.g. `eval` of a string), it is too clever; prefer the
  plain version even at a small cost.
- **DRY** — one authoritative home per *rule/decision*, not merely "no copy-paste".
  But: if abstracting forces a smell or deep coupling and the duplication is small +
  stable, **duplication + a KEEP-IN-SYNC comment beats premature abstraction.**
  When uncertain, duplicate.
- **YAGNI** — build only what is needed now. Delete speculative generality on sight;
  "just in case" code is where bugs and divergence hide. YAGNI ≠ inflexible — it
  means don't build for a guessed future.
- Overengineering is the silent enemy: extra abstractions/patterns/flexibility added
  for imagined needs make code harder to read, maintain, debug. Use a pattern only
  when truly necessary.

**Node.js / ESM specifics.**
- ESM is the default (`"type":"module"`). Prefer zero-dependency: Node's built-ins
  (`node:test`, `node:assert`, `node:fs/promises`, `zlib`) cover a lot. Fewer deps =
  less supply-chain risk + no build step.
- Define an **explicit public API** (an index or `exports`); don't let callers reach
  into internals. Keep files focused — one clear responsibility each.
- **Errors**: throw real `Error` objects (never strings — you lose the stack).
  Centralize handling. In a CLI, show a clean message to the user but keep full debug
  internally; `process.exit(code)` with meaningful codes. Test the error paths, not
  just the happy path.
- Organize by **feature/domain**, not by technical layer — things that change
  together live together.

→ **showreel**: zero-dep by design (`node:test`, own PNG decoder in `pngread.mjs`,
no framework). Pure logic is split out of browser closures so it's unit-testable
(`rec-steps.mjs`, `rec-live.mjs` pure half). The recurring bug class here is
**host-state ↔ DOM divergence** in dual-sided code — when you touch one side, touch
both, or add a KEEP-IN-SYNC comment (the two `rowEl` copies already drifted once).

## 2. Testing — confidence per unit of effort, not coverage for its own sake

**The shape.** Many fast cheap unit tests (base), fewer integration (middle), fewest
E2E (peak). The pyramid encodes an economic truth: a bug caught in a unit test is
far cheaper than one caught in a full-system test. Don't invert it into an
"ice-cream cone" (mostly slow E2E).

**But: "write tests, not too many, mostly integration."** Unit tests that mock
everything can pass while the real wiring breaks. Integration tests give the best
ROI for "does it actually work together". Balance by **risk and value**, not a
coverage %.

**When NOT to test (diminishing returns).** Every technique stops paying off. Test
critical paths thoroughly, lightly test the rest. Manufacturing tests against
already-guarded code is overengineering — when a genuine new angle finds nothing,
**stop and say so** rather than padding the count.

**Distrust a green suite.** A passing test says "ran without error", not "does what
was intended" (intent drift). A model grading its own work is consistently too
lenient (~50% of real failures slip). The things tests miss — state divergence,
behavior changes, duplication drift — are exactly what **code review** catches. So:
read the code critically, trace one input shape end-to-end (validator → state →
output, every field), diff two paths that "do the same thing".

**Never let the test assert the bug as expected.** When a test reveals your
expectation was wrong, the code is right — fix the test. When it reveals a real
defect, fix the code. Decide honestly each time. Don't auto-generate assertions that
lock in current (possibly buggy) behavior.

→ **showreel**: pure logic = hostile unit tests (null/NaN/empty/out-of-range, "never
throws" contract). The full pipeline = ONE guarded integration test that renders
real, extracts a frame, and **pixel-asserts differentially** (changed color present,
old gone, untouched content still there — a "has content" check passes on rebuilds).
Suite green + roster audit green is the floor, not the goal.

## 3. Visual capture — deterministic screenshots & recordings

- **Determinism is fragile**: OS, fonts, headless vs headed, hardware all shift
  pixels. Pin the environment (same Docker/runner for baselines). Disable animations,
  mask volatile regions, retry-until-two-frames-match for stable shots.
- **Format**: PNG (lossless) for screenshots & visual diffs; JPEG only where size
  beats fidelity (`quality` 0–100).
- **Recording quality**: browser-native recorders are often hardcoded low-bitrate
  (Playwright ≈ 1 Mbit/s VP8, single-thread) → poor on demanding content. For
  fidelity, **capture a deterministic PNG frame sequence at a fixed cadence, then
  re-encode with pinned ffmpeg flags** — removes realtime-encoder nondeterminism.
- **GIF vs MP4/WebM**: MP4/WebM = true-color, real compression, smaller for long
  content → prefer when `<video>` is allowed. GIF = 256-color palette, no inter-frame
  compression, balloons fast → only for universal embedding (README/chat). When you
  must GIF, use the **two-pass `palettegen` → `paletteuse`** workflow (with dithering)
  to avoid banding.

→ **showreel**: offline render = virtual-clock frame sequence (deterministic), then
ffmpeg encode. The reel is *moving* → realtime fps30 for the showcase (gate refuses
burst primitives under `--offline`). GIF outputs use the palette workflow. PNG
decode is verified by the project's own `pngread.mjs`.

## 4. Motion design — for product demos

Already deep in `showreel/skills/showreel/references/motion-design.md` +
`cinematic-grammar.md`. This is the consolidated, researched core to reason from.

**The trinity: timing · easing · duration.**
- **Easing** is what's felt most. Linear = mechanical (nothing real moves that way).
  **Entrances ease-out** (arrive fast, settle); **exits ease-in** (start slow, leave
  fast); ease-in-out for moves between on-screen positions. Easing is the digital
  "slow in / slow out".
- **Duration is contextual, never one value.** Rough scale: micro-interactions
  100–200ms; view/context transitions 300–500ms; large page transitions 500–700ms.
  Scale to distance/size; exits can be quicker. Desktop tends faster (150–200ms).
  Movement ≈ 100ms per 10% of viewport traversed.

**Choreography & staging.**
- **Stagger** entrances of a set (short offsets) to soften and to steer the eye.
- **Hierarchy**: animate in order of importance — hero leads, supporting follows.
  More important = more prominent movement + longer duration; group minor elements
  with synchronized timing.
- **Compositing**: 3–4 tools in the SAME beat, staggered 300–500ms focal→supporting
  (e.g. camera + marks + glossary). Show more than one tool at once.

**Disney principles that matter for UI/demos.**
- **Follow-through**: an element overshoots its target a few px then settles → mass.
- **Overlap**: container leads, content arrives slightly behind → trackable, not a
  blur.

**Philosophy & restraint.** Apple HIG = motion in service of content (subtle, gets
you A→B without distraction). Material = expressive, personality. IBM Carbon's split
is useful: **productive motion** (most of the time) vs **expressive motion**
(reserve for key moments — a rhythmic break that earns attention). Every animation
is a *promise about what the system is doing*; bad motion breaks trust. Move past
"motion for motion's sake" → "motion as communication".

**Always** respect `prefers-reduced-motion`.

→ **showreel**: 1 accent per scene, rotating palette across scenes; arc =
hook(payoff first) → build → one climax(70–85%) → resolution(pull-out + recap +
stillness). fps30 realtime (offline 15fps reads as stutter). Big is fine — use every
tool fluidly, not just "when showing it".

## 5. Documentation

**README — a route map, not an encyclopedia.** It's the first thing seen and doubles
as marketing; a weak one quietly kills adoption. Structure around reader goals
(user wants install + happy path; contributor wants the dev loop).
Recommended spine:
```
# Title (clear, bold — obvious what it is)
One-line description: what it does + why you should care (NOT the tech stack first)
Badges (ci, version, tests, license) — optional, auto-updating
Demo (GIF/image/link) — visuals hook
Installation (exact steps + Requirements if any)
Usage (smallest happy-path example EARLY, with expected output)
Configuration (env vars, credentials, failure modes — where users get stuck)
Features
Project structure (tree)
Contributing (minimum dev loop; how contributions are judged)
Support / License
```
Rules: real examples not placeholders; show expected output; anchor-linked ToC if
long; visuals (GIF/diagram). **Test it on a clean machine** — clone→running in <10
min means it worked. Keep it living: when behavior changes, the README changes.
Too-long beats too-short (move overflow to other docs).

**Other docs.** CHANGELOG (Keep-a-Changelog format), CONTRIBUTING (the vocabulary +
"bugs require tests, features require an example"), LICENSE. Comments explain WHY or
warn (KEEP IN SYNC) — never restate the code.

→ **showreel**: README EN + pt-BR, badges, demo GIFs from the engine itself. The
cookbook (`rec-cookbook.md`) is the authoritative step-grammar; key counts there must
equal `STEP_KEYS.size`.

## 6. Release hygiene

- **SemVer** `MAJOR.MINOR.PATCH`: breaking / feature / fix. Communicates compatibility.
- **Conventional Commits** `type(scope): desc` (feat/fix/refactor/docs/test/chore…).
  Type describes the *outcome for users*, not the technique (a refactor that fixes a
  bug is `fix`). Ties to SemVer (feat→minor, fix→patch, BREAKING CHANGE→major) and
  lets changelogs/versions be generated. Pick one scope vocabulary and keep it.
- Avoid: wrong type, scope inconsistency, vague descriptions ("fix issue"), missing
  BREAKING CHANGE footer.
- Commit/push/merge only when the user asks. **Never** add a `Co-authored-by` line.

→ **showreel**: branch `v1.1.0-dev`, `main` clean at v1.0.0. Commits already follow
`type(scope):`. Release = merge→main + tag + release with the showcase mp4 — user's
call.

## 7. Accessibility of visual output

- **Contrast**: WCAG AA = **4.5:1** for text (3:1 for large text). Don't round up.
- **Text over image/video** (annotations!): the background changes, so — scrim/fog
  the area behind text, OR halo/outline the text, OR vary text luminance to track the
  background. Verify by hand (automated tools can't inspect text-over-image). Note
  **alpha reduces effective contrast** (underlying color bleeds through).
- Respect `prefers-reduced-motion` (disable/min animation).
- AA is the practical/legal target. Low contrast is the #1 web a11y failure (~80% of
  top sites) — what looks elegant on a 5K screen fails on a cheap laptop in sunlight.

→ **showreel**: annotations already use a frosted scrim + accent edge + contrast
floor (`safeAccent` lifts a low-contrast author accent to readable before paint).
Open angle: verify live-element contrast in light theme by hand.

---

## Quick decision heuristics

- "Should I abstract this?" → Is the same *rule* in 2+ places AND will it change
  together? Yes → abstract. Smell/coupling cost high + duplication small → duplicate +
  comment.
- "Should I add this flexibility?" → Do I need it *now*? No → don't (YAGNI).
- "Is it tested enough?" → Are the critical paths + the error paths covered, and did a
  fresh review angle find nothing? Yes → stop (diminishing returns).
- "Is this fix real?" → Measure precisely BEFORE touching code (a 2px accent border is
  not a badge bug). Prove with a differential test. Never claim "fixed" from belief.
- "GIF or MP4?" → Embedding in README/chat → GIF (palette workflow). Anywhere `<video>`
  works → MP4/WebM.
- "How long should this animation be?" → micro 100–200ms, transition 300–500ms; scale
  to distance; ease-out in, ease-in out.

---

### Sources
**Code/clean:** [Node best practices](https://github.com/goldbergyoni/nodebestpractices) ·
[Clean Code Essentials KISS/DRY/YAGNI](https://dev.to/juniourrau/clean-code-essentials-yagni-kiss-and-dry-in-software-engineering-4i3j) ·
[DRY misunderstood](https://dev.to/walternascimentobarroso/dry-the-principle-that-most-developers-misunderstand-5ef9)
**Testing:** [Test pyramid 2025](https://www.devzery.com/post/software-testing-pyramid-guide-2025) ·
[Write tests. Not too many. Mostly integration. (Kent C. Dodds)](https://kentcdodds.com/blog/write-tests) ·
[Intent drift — tests pass, code wrong](https://www.tricentis.com/blog/intent-drift-ai-code-fix-regression-blind-spots) ·
[Missed bugs in code review (SmartSHARK)](https://arxiv.org/pdf/2205.09428)
**Visual capture:** [Playwright videos](https://playwright.dev/docs/videos) ·
[Playwright screenshots](https://playwright.dev/docs/screenshots) ·
[Visual comparisons](https://playwright.dev/docs/test-snapshots)
**Motion:** [Material duration & easing](https://m1.material.io/motion/duration-easing.html) ·
[Apple HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion) ·
[IBM Carbon motion](https://carbondesignsystem.com/elements/motion/overview/) ·
[LottieFiles motion-design-skill](https://github.com/LottieFiles/motion-design-skill)
**Docs:** [Make a README](https://www.makeareadme.com/) ·
[freeCodeCamp README structure](https://www.freecodecamp.org/news/how-to-structure-your-readme-file/) ·
[dbader great README](https://dbader.org/blog/write-a-great-readme-for-your-github-project)
**Release:** [SemVer + Conventional Commits](https://negg.blog/en/semantic-versioning-and-conventional-commits/) ·
[Keep a Changelog](https://keepachangelog.com/)
**A11y:** [WebAIM contrast](https://webaim.org/articles/contrast/) ·
[WCAG G18 text-over-image](https://www.w3.org/WAI/WCAG21/Techniques/general/G18) ·
[WCAG 1.4.3 Contrast Minimum](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
