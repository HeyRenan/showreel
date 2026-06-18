# Self-improvement loop — showreel

Read this file at the start of every loop iteration. Do ONE discrete unit of work,
verify it, commit it, stop. Progress lives in git + tests, never in the conversation.

This prompt is grounded in researched practice (sources at the bottom). Follow it
literally — it encodes lessons paid for in real bugs this codebase already had.

---

## The prime directive

Converge the code toward its **spec and a clean, simple, readable shape** — NOT
toward a metric. "All tests green" is not the goal; it is the floor. Optimizing the
green count is Goodharting: the product can rot in dimensions no test measures.

## Pick ONE unit of work per iteration (in priority order)

1. **A real bug** with a failing test that proves it. Fix it. (Highest value.)
2. **A clean-code defect**: duplication that can drift, a function doing two jobs, a
   name that lies, an abstraction nobody needed. Simplify it.
3. **An untested angle** of existing behavior — but only a *new* angle, never a
   re-run of one already covered. (See the angle ledger below.)
4. If 1–3 yield nothing after a genuine look: **stop and say so plainly.** Do not
   manufacture tests against already-guarded code. That is overengineering — the
   thing you are explicitly forbidden to do.

## How to actually find something (the angle, not the rerun)

Bugs cluster where complex NEW hand-written code keeps dual state. Tests miss what
code review catches: **state/DOM divergence, behavior changes, intent drift.** A
green suite is a lenient self-grader — distrust it. Each iteration, take an angle
you have NOT taken:
- Read code you wrote critically, line by line, asking "what does THIS contradict?"
- Trace one author-facing input shape end to end: validator → host state → DOM/output.
  Do the two sides agree for EVERY field (text, color, count…)? Divergence here is
  the #1 bug class in this repo.
- Cross a boundary the suite skips: realtime vs offline, gif vs mp4, tiny viewport,
  overflow, a primitive combined with another.
- Diff two code paths that "do the same thing" — they drift (two rowEl copies did).

## Clean code bar (KISS · DRY · YAGNI)

- **KISS**: the simplest thing that meets the requirement. A bicycle, not a rocket.
  If a reader would flinch (e.g. `eval` of a string), it is too clever — prefer the
  plain version even at the cost of a little duplication.
- **DRY**: one authoritative home per *rule*. But if abstracting forces a smell
  (eval, deep coupling) and the duplication is small + stable, duplication + a
  KEEP-IN-SYNC comment is the cleaner call. Uncertain → duplication beats premature
  abstraction.
- **YAGNI**: build only what is needed now. Delete speculative generality on sight
  (a scalar-merge path for a type that was cut, dead state fields). Code you keep
  "just in case" is where divergence hides.
- Code is read more than written. Name truth. No comment that restates the code;
  comments explain WHY, or warn (KEEP IN SYNC), nothing else.

## Verify before claiming (evidence, not assertion)

- A fix is not done until a test proves it AND the full suite + roster audit are
  green. Run them; read the output; quote it. Never say "fixed" from belief.
- Do NOT let the test assert the buggy behavior as "expected." When a test reveals
  YOUR expectation was wrong, the code is right — fix the test. When it reveals a
  real defect, fix the code. Decide which honestly each time.
- Beware false alarms in the OTHER direction too: this session once counted a 2px
  accent border as a "badge bug." Measure precisely before fixing; verify the bug is
  real before touching code.
- Pixel-assert render changes (differential: the changed color present, the old gone,
  untouched content still there) — a "video has content" check passes on rebuilds.

## Commit discipline

- One unit = one commit. Message: what + why + the class of bug + the green count.
- Never `Co-authored-by`. Never push or merge without the user asking.
- After committing, update the angle ledger below (append the angle you used).

## Honesty clause

You have claimed "everything is tested and clean" and been wrong every time a new
angle was tried. So: never claim absence of bugs. Claim only "the angles run so far
came back clean; these remain untried." If an iteration finds nothing real,
recommend stopping rather than inventing work.

---

## Angle ledger (append one line per iteration; never repeat an angle)

- offline render pipeline (mp4 ftyp, contact-sheet decode, off-screen reject) — clean
- marker pixel-assert (differential green) — clean
- binary parse + virtual clock error paths — hardened
- pure-module hostile inputs (prove/annotate/compose/demo/ensure-deps) — 9 bugs fixed
- realtime render path (grow + camera:out clear) — clean, hand-verified
- gif path + palette quantization + before-after — clean
- effOpts dispatch + sel-less object validation — clean (guarded upstream)
- live state↔DOM divergence review — 4 bugs fixed (update-color, replace items/rows, aliasing, scalar-merge)
- weak-assertion review (modal no-rebuild) — strengthened
- subagent-fix critical review (annotate/compose/prove) — clean, 1 imprecise commit note
- clean-code dedup pass (two rowEl copies) — badge-less drift fixed; reverted an eval over-abstraction
- cli-args num/str hostile review — 1 bug fixed (whitespace-only value silently became 0)
- rec-encode review (trim math, event sentinel, mp4/gif/sheet paths, line-248 crash path) — clean; no pure surface to unit-test without risking the frame-verified encode (real paths already covered by integration test + rec.mjs:293 gif/mp4 contract)
- shrink/tape review — 1 bug fixed (shrink attempts() ignored an explicit --fps when --target-kb set; the size ladder overrode it. fps is now a ceiling)
- GUIDE.html + INSTALL/README review — INSTALL paths + /showreel:guide skill all real; fixed doc rot: both READMEs claimed "tests-247 passing" (actually 520). Removed the hardcoded-count badge (the ci badge is the live proof) so it can't rot again
- live-element light-theme a11y — text-over-glass contrast fine (>=11:1 even worst case); but the NEW per-item badge color had NO contrast floor (white digit on a pale color ~1.3:1). Fixed: badgeInk picks dark/white digit by pill luminance. (Default-green 3.3:1 left as-is — pre-existing plugin-wide design, not a live regression.)
- showcase rendered end-to-end + watched (realtime, 151s, valid mp4) — CLEAN. Sampled ~7 frames across the reel (dark console, light forms, deploy climax, confirmations): no broken layout, no contrast failure, no overlap/empty frames, coherent arc. No bug. Roster has no dead-air steps, 8 accents, scene-clear present. (Reel is realtime-only — confetti/sparkline refuse --offline by design.)
- rec-motion easing review — CLEAN. ease-in-out-quad (glide) and the camBez cubic-bezier(.4,0,.2,1) solver (X/Y formulas + bisection invert) both verified correct; glide uses quad (cursor-only), glideChase uses camBez (camera-synced) by design. No bug. Only finding: scrollDeltaFor and smoothScroll duplicate identical scroll-target math across two safeEval closures (no drift yet) — added KEEP-IN-SYNC comments (eval abstraction would be the smell, per the DRY nuance).
- rec-page theme luminance — 1 bug fixed (DRY-of-a-decision): detectPageLook seeded theme at lum<118 while readLiveTheme used <0.5 (=127.5), so a mid-gray page (118–127) seeded 'light' then flipped 'dark' on the first live read — an unwanted mid-reel recolor. Aligned both to the 0–255 midpoint + KEEP-IN-SYNC comments.
- presets/ review — all 3 presets VALID + DRY PASS (every selector resolves on the bundled demo); no broken examples. Doc rot fixed: SKILL.md "55-key grammar" (now 56) and presets/README ">=0.9 vocabulary" — both made un-rottable (point to the cookbook/STEP_KEYS.size instead of a number); dropped a contradictory hardcoded "(56)" in the cookbook that sat next to "must equal STEP_KEYS.size".
- preflight.sh review — 2 bugs fixed: (a) it printed [ok] for ANY node (only checked existence) while Setup says "Node 18+ required" — now parses the major and warns if <18; (b) its copy-paste Verify command was `node --test scripts/__tests__/` (a dir) which CRASHES (ERR_MODULE_NOT_FOUND) — fixed to the working glob `'scripts/__tests__/*.test.mjs'`. First script a new user runs; both were false-confidence traps.
- compose-video sync-trim — 1 bug fixed (a test had LOCKED it in): trimSeconds was all-or-nothing — if one sidecar was missing it discarded the OTHER side's known trimSec and defaulted both to 1.0, mis-aligning the side we actually knew. Now per-side fallback (keep known, default only the missing side, warn names which). Replaced the test that asserted the buggy behavior.
- rec-input doSelect — 1 bug fixed (silent no-op): a select with an option that matched no <select> label (typo, or wrong element) silently did nothing — no value set, no warning, reel rendered as if the step worked. Now warns "select skipped — <sel>: no option matches ... (have: ...)". Also KEEP-IN-SYNC comments on the option-match logic duplicated across the panel-build + value-set safeEvals.
- prove.mjs parse — 1 bug fixed (a test had LOCKED it in, again): surplus positionals were silently dropped (an unquoted selector with spaces mis-bound the out filename, no error) — the demo/rec parsers guard this, prove did not. Added the too-many-positionals guard; removed the test that documented the footgun as the contract ("surplus ignored, never throw") + added one asserting it throws. (Required positionals were already caught at main() line 364.)
- CLI parser footgun SWEEP — 3 more parsers fixed (shot.mjs, compose-video.mjs, compose.mjs) all had the same unguarded surplus-positional mis-bind. Closed the whole family: demo/rec/prove/shot/compose-video/compose now all reject too-many positionals with a quote-your-path hint; tape uses positional[0] (immune). +test for compose-video (exported); shot/compose parse aren't exported so fix-only (verified via real CLI). This recurring class is now exhausted.
- inject-snippet builders — 1 bug fixed: cursor-inject baked the raw --color into a single-quoted cssText with no escaping (a stray quote corrupts the injected snippet), while sibling end-card-inject JSON-encodes its text for exactly that reason. Added safeColor (charset-strip to real CSS-color chars); valid colors untouched. +test. (Author-controlled, so low severity, but the silent-corruption class + the inconsistency with end-card made it worth closing.)
- before-after HTML escape — CLEAN. esc() covers all 5 dangerous chars (&<>"'), proven to neutralize a real markup/attribute-break injection in a label; b64 is safe by its charset (no quote); surplus-label drop is non-dangerous (trailing slots are optional labels, not a mis-bound output path). No bug. This is the bottom of the severity curve — see the STOP guidance below.
- doFill re-fill / contenteditable clearing — CLEAN. Re-filling an input replaces (not stacks): "First Value"->cleared->"Second" pixel-proven on the demo. Exercised the contenteditable branch directly on a synthetic page (not assumed): "old content"->cleared->"fresh" pixel-proven. Both clear-then-type paths sound. No bug.
- tape.mjs vhs flow — CLEAN. q() escaping correct (quotes + backslashes, balanced) on a nasty Type string; validateSteps thorough (shape/unknown-key/ctrl-length/sleep-range). The sleep/wait alias picks sleep and drops wait silently, but they mean the SAME concept (a pause) so the single Sleep is coherent — borderline non-bug, not worth a fix. No real bug.
- many-live-elements stress — 1 bug fixed (good thing we kept going): multiple live panels with no explicit pos all landed at the default top-right corner and HID each other — only the last showed (red=0/blue=1/green=298 px). Added a deterministic cascade (stack each new panel below/above the ones already at that corner, summing their heights). Now all visible (221/205/478) in a clean vertical stack, pixel + eyeball confirmed. +test. (A false alarm first — my own test had given two panels the same pos; measuring precisely revealed the REAL auto-pos bug underneath.)
- annotate-canvas.js (MCP-path canvas annotator) — 1 bug fixed: its detectTheme
  used Rec.709 weights + threshold 118, while rec-page.detectPageLook (SAME
  purpose: page light/dark) uses Rec.601 + 127.5 — so a mid-gray page got a
  different theme on the MCP path vs the rec path. (This is the SAME class as the
  iter-8 rec-page fix; that fix aligned rec-page's two functions but missed this
  THIRD detector — the memory's "Luma Rec.601 unified" note had skipped it.)
  Aligned to 601 + 127.5. rec-live's 709 is left — it's WCAG contrast (different
  purpose, correct formula). No more 118 anywhere. NOTE: a recurring bug surviving
  in a third copy is itself evidence DRY-of-a-decision needs one home, not 3.
- concurrent renders sharing scripts/.deps — CLEAN (no bug, design documented).
  Per-render work files are race-safe: rec.mjs uses mkdtempSync for vidDir, so two
  renders get separate dirs (frames/pal.png/list.txt/strips all under it). The one
  real window — two captures COLD-starting at the same instant racing the shared
  npm install / chromium download — is narrow (one-time, fresh machine) and the
  documented setup (INSTALL.md §3 pre-warm) serializes it. A cross-platform install
  lock would be more risk than the window warrants (overengineering). Added a
  CONCURRENCY design comment to ensureDeps; concurrent cold-start is intentionally
  unsupported. No fix.
- camera bezier under extreme zoom — CLEAN (no bug). The reach/clamp math is
  finite at the extremes: a 2px element gives fit=2.4, noCrop=282, s2=3 (MAX),
  finite tx/ty — verified by computing it in-page. Realtime zoom on the tiny
  element frames it correctly (green=28). A red herring along the way: offline +
  camera rendered the un-zoomed frame (green=0) — but the cookbook (line 157)
  documents `--offline` as ONLY for static/text takes with NO camera/cursor
  motion; a moving reel is realtime. So that's the documented contract, not a
  bug (measure-before-claiming caught me). OBSERVATION (not fixed): confetti/
  sparkline+offline get a HARD error gate, but camera+offline silently renders
  wrong — an enforcement inconsistency. Left as-is: docs warn, and a gate could
  block a valid held-zoom use; a feature call, not a defect.
- cross-browser font fallback — CLEAN. 14 bare `system-ui` uses (vs end-card's fuller stack) looked like a determinism risk, but the plugin SHIPS + uses one bundled Chromium for every capture, so resolution is identical local & CI. Verified in that browser: system-ui lays out real text (1264x47 box, non-empty), and every annotation frame inspected this session rendered legible. The research's Mac-vs-CI font warning needs DIFFERENT browsers; not the case here. The end-card stack is cosmetic belt-and-suspenders, not a fix the others need. No bug.
- live `update` field contract (validator↔host↔DOM trace) — 1 bug fixed (the #1
  class, again): applyState blind-merges EVERY update field into host row state,
  but the DOM update path rendered only text+color. So `{update:{item,badge:'9'}}`
  set the badge in host state while the screen kept the old digit; `{update:{item,
  value:5}}`/`{junk}` polluted host state and never reached the DOM. All reachable,
  all green, all silently wrong. Fixed with ONE home for the rule: the validator
  now restricts update to item/text/color/badge (exactly what rowEl renders), and
  the DOM update path now re-renders badge too (mirroring applyState). KEEP-IN-SYNC
  both ways. Proven in real Chromium (badge 1→9 on screen; combined text+color+
  badge applies all three), 525 green, audit clean. LESSON: "esgotado" was wrong
  AGAIN — I'd traced live state↔DOM in iter-8 but only for the verbs that existed
  then; the field-level contract of `update` was never traced end to end. Untraced
  sub-shapes of a "covered" feature are still untried angles.
- live `recolor` panel accent (create-vs-recolor surface trace) — 1 bug fixed
  (state/DOM divergence): a panel's accent is set in TWO places at create — the
  left border AND the title dot (bg + glow) — but the recolor-panel branch
  (`{recolor:{color}}`, no item) only repainted borderLeftColor. So recoloring a
  modal/glossary gave a red border beside a stale-blue header dot: half the accent
  flipped, visibly incoherent. Tagged the dot `.__live_dot` at create (both panel
  types), recolor now repaints both surfaces, guarded for title-less panels.
  Proven in real Chromium (modal + glossary: dot AND border both red; no-title
  recolors border without crashing). 525 green, integration render real, audit
  clean. SAME lesson as last iter: I'd "traced live state↔DOM" but never matched
  the create-time accent SURFACES against the recolor-time ones — drift between
  what a verb sets and what create set is its own angle. NON-BUG ruled out first
  (measure-before-claiming): append/replace accept arbitrary row fields too, but
  host state is a mirror never re-rendered, and rowEl ignores unknown fields
  everywhere — so stray append fields are inert pollution, NOT visible divergence
  (unlike update's badge, which was renderable-but-skipped). Restricting them
  would be consistency-for-its-own-sake / YAGNI — left as-is per the honesty clause.
- live `replace` items contract (verb-vs-create surface, 3rd in the family) — 1
  bug fixed (state/DOM divergence): `{replace:{}}` (no items key) wiped every row
  in the DOM (liveOpDom: `Array.isArray(undefined)?…:[]` → empty body) while
  applyState left the OLD host rows untouched (it only rewrites rows when `items`
  is present). Screen empty, host state still lists old rows. Mirrored the
  update-requires-item precedent: validator now rejects keyless replace; `items:[]`
  (explicit clear, both sides → 0) stays valid. Proven both sides (host keeps 2 /
  DOM wipes to 0). 526 green, audit clean. NON-BUG ruled out first
  (measure-before-claiming): replace.color/title pollute host st via Object.assign
  but st is a mirror NEVER re-rendered, so they never reach the screen — inert,
  same as append's stray fields; recolor is the documented color verb. No fix
  (YAGNI / honesty clause). PATTERN NOW CLEAR: each list verb (update/recolor/
  replace) had a subset-vs-create-surface gap — that family of three is now closed.
- <next iteration: append here>

## Untried angles (candidates — pick one, then move it to the ledger)

- EXHAUSTED — every listed angle has been run (18 iterations: 16 real bugs + 4
  clean). Lesson: "two clean angles in a row" was NOT a reliable stop signal —
  many-live-elements found a real bug right after two cleans. So clean streaks
  don't mean dry; a covered SURFACE does.
- Remaining angles all need new infra or are genuinely low-value: a real
  cross-machine capture diff (needs a 2nd OS); a 200-step load/perf reel; the
  camera bezier under extreme zoom; concurrent renders sharing scripts/.deps.
- NOTE: several bugs were TESTS that locked in buggy behavior — when a fix breaks
  an existing test, check whether the test was asserting the bug.
- NOTE: closed families — CLI surplus-positional (all parsers), inject-snippet
  escaping (end-card was the model), live-element corner cascade.
- HONEST STATE: the reachable surface (core logic + CLI/IO/doc/a11y/render) is
  swept. This is a real stopping point — not fatigue, but coverage. Continuing
  means new infra or manufacturing low-value work (the honesty clause forbids).

## Anchor files (read these, not the whole tree)

- spec: `docs/superpowers/specs/2026-06-18-live-elements-design.md`
- plan: `docs/superpowers/plans/2026-06-18-live-elements.md`
- engine: `showreel/scripts/rec-live.mjs`, `rec-steps.mjs`, `rec.mjs`
- tests: `showreel/scripts/__tests__/`
- run suite: `cd showreel && node --test scripts/__tests__/*.test.mjs`
- run audit: `node showreel/scripts/audit-roster.mjs "file://$PWD/assets-src/demo/index.html?gate=fail" assets-src/showcase-steps.json --width 1280 --height 676`

---

### Sources this prompt is grounded in
- Loop/Ralph pattern, deterministic gates, anchor-to-spec: explainx.ai "Loop Engineering" (2026); SICA (ICLR 2025); Darwin Gödel Machine (arXiv 2505.22954)
- Self-grading is too lenient (agreement bias ~50% TNR); never let the agent write its own oracle: ReVeal (arXiv 2506.11442); Konstantinou et al. ICST 2025
- Intent drift / tests pass but behavior wrong: Tricentis "Your Tests Pass. Your Code Is Still Wrong."; SmartSHARK missed-bug study (arXiv 2205.09428)
- KISS/DRY/YAGNI, duplication-vs-premature-abstraction: dev.to "Clean Code Essentials"; "DRY: The Principle Most Developers Misunderstand"
