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
- <next iteration: append here>

## Untried angles (candidates — pick one, then move it to the ledger)

- rec-encode stage (mp4/webm/gif encode flags, faststart, trims) — never reviewed
- tape / shrink modules — never reviewed
- GUIDE.html + INSTALL flow — never reviewed
- cli-args parse (str/num helpers) — used everywhere, never hostile-tested directly
- the showcase reel rendered end-to-end + watched (not just audited)
- accessibility/contrast of live elements in light theme

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
