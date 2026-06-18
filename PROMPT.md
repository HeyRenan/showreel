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
recommend stopping rather than inventing work — but do NOT stop the cron yet (see
the stop rule below). Keep finding new angles.

## Stop rule (the ONLY condition to kill the cron)

The cron may be killed ONLY after 15 CONSECUTIVE iterations with no improvement
or adjustment (no real bug fixed, no clean-code simplification, no test added).
A single iteration that ships ANY change RESETS the counter to 0.

Track it on the line below; update it every iteration:

  DRY STREAK: 13/15   (last change: badgeInk, 31st bug. dry: …countup+typeon, framedSel cross-step state re-validated each use)

While the streak is < 15: even on a clean iteration, pick a genuinely NEW angle
next time — clean ≠ done, and this session has repeatedly found a real bug right
after a clean trace. Only at 15/15 may you recommend `CronDelete`.

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
- live registry coupling + offline scene-clear parity — CLEAN (no bug, traced
  precisely, two angles). (a) The `liveSceneClear` early-return `if (!liveReg.order
  .length) return` looked like it could skip the DOM clear and leak a node into the
  next scene IF host order could be empty while a DOM node lived. Traced EVERY
  registry write site (the only ones): create writes both host `registerLive` +
  DOM `__live.nodes` together (rec.mjs:834→838 / rec-live:210); remove drops both
  together (rec.mjs:848 / rec-live:282). They move in lockstep, so host order 0 ⇒
  DOM nodes 0 — the early-return is a valid optimization, not a leak. The nav case
  (a `screen` URL load wipes DOM `__live` but not host `liveReg`) self-heals: host
  order is non-empty so the guard doesn't fire and `clearScene(liveReg)` cleans the
  stale host entry. (b) Offline scene-clear parity: live pumps a frame via
  `clock.tick()`; masks use `clock.wait(ms(360), true)` (realtime-sampled) + a
  sync removal — different mechanism, both land the cleared state in the held/next
  frame offline. No divergence. NO FIX — manufacturing one against lockstep-correct
  code is the overengineering the prompt forbids (honesty clause).
- live color → innerHTML injection (security, untraced inject surface) — 1 bug
  fixed: a row/badge/accent color was interpolated RAW into a style="" attribute
  inside innerHTML. esc() strips <>& but LEAVES quotes, so `#000"><b data-pwned=
  "yes` broke out of the attribute and injected markup into the live panel (proven
  in real Chromium — data-pwned element appeared). SAME class as the cursor-inject
  safeColor fix (iter "inject-snippet builders"); live was the last raw inject
  path. Added safeCol (the SAME charset as cursor-inject: #0-9a-zA-Z(),.%\s/-,
  fallback DEF) in BOTH safeEval closures, applied to every color that lands in an
  innerHTML/cssText STRING: row badge bg, panel accent (border + title dot), append
  rows. Colors set via .style.X assignment (update/recolor) were NEVER a markup
  vector (browser parses them as CSS values) — left unchanged, measured that
  distinction before touching them. Proven: create-row/accent/append injections all
  neutralized, valid #e11d48 still renders. 526 green, audit clean. KEEP-IN-SYNC
  ties both closures to cursor-inject. LESSON: the inject-escaping "family" I'd
  called closed (end-card model, cursor-inject) had a THIRD member unaudited — live
  rowEl. Same as the luma-detector third copy: a "closed family" can hide a member
  in a file I hadn't re-read through THAT lens.
- annotate badge → innerHTML injection (security, the inject family's 4th member)
  — 1 bug fixed: the static glossary + standalone/marks badge baked an author
  badge value RAW into innerHTML while the SIBLING text on the same construction
  line was escaped — a `<img src=x onerror=…>` badge injected markup (proven in
  real Chromium). Three sites, one class: glossary explicit-items row (:444, n raw
  / t escaped), glossary marks-derived row (:438, same split), drawBadge label
  (:379 — covers step.badge + mk.badge, baked via add()'s html arg). Escaped all
  three with the SAME [<>&] strip the siblings already use (drawBadge is the one
  home for both badge call-sites). Verified NO author-string sink left raw in
  rec-annotate (grep: every String(step./it./mk./g./modal./gOpt.) now has the
  strip). 526 green, audit clean. LESSON (repeated, now a firm rule): right after
  fixing live-color injection I called the inject-escape family closed — and it had
  a 4th member in rec-annotate, a file I'd never read through the inject lens. The
  GREEN accent there WAS already saneado (safeAccent) + most text escaped; only
  badge slipped. A "closed family" is only closed for files re-read under that lens.
- chrome/letterbox text (rec-encode) — CLEAN (no bug, two lenses, measured). (a)
  INJECT lens: the inject family chase (live-color, annotate-badge) pointed here
  next, but the chrome strips (screen pill / stamp / bar) rasterize author text via
  `ctx.fillText` on a canvas (rec-encode:53/68) — canvas text is pixels, not markup,
  so `<img>`/quotes can't inject. Canvas-imune by construction; the inject family
  IS now closed across DOM-emitting files (live/annotate/cursor/end-card/before-
  after) — chrome was the one that looked like a member but isn't a DOM sink. (b)
  TRUNCATION + DEDUP lens: `fit()` measures + ellipsizes correctly; font state is
  re-set after each `getContext` recreate (49/51/52, 57/60/61) so no stale-font
  mismeasure; the `lane\0slot\0text` dedup key is used identically at render-time
  (uniq:74) and composite-time (assets.get:110), so repeated identical pills share
  one PNG with per-event x/timing — correct, not a collision. `assets.get(key(ev))`
  can't be undefined in normal flow (uniq is built from ALL events; a render throw
  aborts before line 110). NO FIX — fabricating one against canvas-safe + correct
  code is the overengineering the prompt forbids. LESSON CONFIRMED: chasing a family
  to its next suspect and finding it's a DIFFERENT mechanism (canvas, not DOM) is a
  legit clean — the lens still had to be applied to KNOW that.
- chrome trim-timing + shrink ladder — CLEAN (no bug, two lenses, measured). (a)
  rec-encode trim math: suspected a zero-width overlay (an event ending INSIDE the
  trimmed head: t0===t1===0) would still flash, contradicting the "drop out"
  comment — but line 138 filters `t1 > t0 + 0.05`, so it IS dropped. False alarm,
  caught by measuring. The short-event fade overlap (fade-in + fade-out both start
  at t0 when t1-t0 < 0.35) is a cosmetic degradation under a sub-0.35s strip, not a
  correctness bug; left as-is (rare, and inflating it would be the manufactured
  work the prompt forbids). `shortest=1` + `-loop 1` PNG: base (video) governs,
  overlay painted only within enable window — correct. (b) shrink runLadder: stops
  at the FIRST attempt that fits the target (122) and returns `best` = smallest
  seen (121). Looked like it could miss a smaller later rung, but the ladder
  degrades quality monotonically and stopping at first-fit = HIGHEST quality that
  fits = the documented intent ("quality losses reserved for the ladder"); smaller-
  than-needed is NOT better here. best-on-no-fit returns the smallest of all =
  best effort. Correct by design. NO FIX. LESSON: two consecutive measured cleans
  on the encode/shrink layer — this layer (unlike the live verb-surface + inject
  families) holds no easy vein; cleans here are real coverage, not fatigue.
- progress/countdown lifecycle (state↔DOM lens on the NON-live stateful prims) —
  CLEAN (no bug, measured, one corrected false alarm). Applied the verb-surface
  lens (which gave 3 live bugs) to the anchored prims the comment calls "re-anchored
  each step, not live". Suspected a ride-along: clearAnnotations (627) only removes
  #__ann__, so anything attached elsewhere survives into the next step. FALSE ALARM
  #1: I first misread applyRedact's bar (:768 el.appendChild) as progress — it's the
  censor mask (`__sr_mask__`, "exit fade via clearMasks"), correct. The REAL
  applyProgress (:2184) builds `rail.className='__sr_mask__'` (:2237) — so progress
  IS a mask, scene-scoped, cleared by clearMasks at boundaries, and guarded against
  dupes by `el.dataset.srProgress` (:2194). Coherent with its category. Second
  angle: `addsMask` (rec.mjs:581) OMITS progress/countdown — traced the consequence
  precisely: clearMasks runs BEFORE applyProgress (582 vs 666), so it only wipes the
  PRIOR scene's masks; progress is added after and never self-wiped. The omission is
  harmless, verified not assumed. NO FIX. LESSON: applying a high-yield lens (verb-
  surface/state↔DOM) to a NEW target is the right instinct, but here the target was
  already coherent — and measure-before-claiming caught me misattributing redact's
  node to progress. A clean from a corrected false alarm is still a real clean.
- liveOpDom NOTEINK theme source (DRY-of-a-decision, the 5th theme detector) — 1
  bug fixed, and the worst flavor: a VISIBLE split inside one panel. liveCreate
  derives row text color from rctx.pageTheme (central detector: Rec.601 + 127.5);
  liveOpDom re-detected on its OWN off document.body with a DIFFERENT rule (simple
  (R+G+B)/3 < 128). On a page with bg on <html> + transparent body, or borderline
  luminance, the two disagreed — a row appended/replaced LATER got a different text
  color than its created siblings in the SAME panel. Proven in real Chromium:
  created row #0f172a vs appended row #f8fafc on an html-bg light page (white text
  on light glass = unreadable). Fix: pass theme into the liveOpDom safeEval (as
  liveCreate already does) and derive NOTEINK identically — one home. Proven:
  create/append/replace now share ink in light AND dark. 526 green, audit clean.
  LESSON: the luma/theme DRY family I "unified" (iter-8 rec-page, then annotate-
  canvas as the 3rd) had a 4th in readLiveTheme AND this 5th hiding in a DIFFERENT
  function of an ALREADY-EDITED file (rec-live) — I'd added safeCol/badge fixes to
  liveOpDom twice this session and never noticed its inline theme re-detect. A file
  you've edited is NOT a file you've audited under every lens. The "3 cleans in a
  row" before this proves again: clean streak ≠ dry.
- rec-live full duplication + z-order sweep (acting on last iter's lesson) — CLEAN
  (no bug, measured char-by-char). Last iter's lesson was "a file you've EDITED is
  not a file you've AUDITED under every lens" — the 5th theme detector hid in a
  rec-live function I'd edited 2x. So I swept rec-live for EVERY duplicated decision
  across its two safeEval closures. The three duplicated helpers — badgeInk, safeCol,
  rowEl — I diffed by brace-matching + whitespace-normalizing the actual bodies (not
  eyeballing): ALL THREE byte-identical between liveCreate and liveOpDom. My 3 edits
  this session (badge render, safeCol, theme) kept both copies in sync; the KEEP-IN-
  SYNC comments held. Second angle: z-index hierarchy — mapped every max-z value and
  its owner (masks 2147483600 < live backdrop/panel 639/640 < effects/cursor/endcard
  645/646/647). Order is coherent: cursor + end-card + one-shot effects correctly sit
  ABOVE the live panel; masks below. No wrong occlusion. NO FIX. LESSON: the "edited
  ≠ audited" rule cuts both ways — applied deliberately to rec-live THIS time, it was
  genuinely clean (no 6th detector). The difference from last iter: I actually ran
  the char-level diff instead of trusting the KEEP-IN-SYNC comments.
- form-input validator↔normalizer (select/fill) — CLEAN (no bug, measured, two
  false suspects killed). Applied THE high-yield lens — "validator accepts / runtime
  silently ignores" (gave live update-badge + replace-keyless) — to the form inputs.
  Suspect 1: object-form `{select:{sel,value}}` validates (rec-steps:327) but maybe
  the normalizer only reads the string-form. FALSE: selectSpec:126 covers object-
  form (sel + value??option); fillSpec:120 is symmetric. rec.mjs uses selectSpec/
  fillSpec (708/710), so both shapes reach doSelect/doFill — no silent no-op.
  Suspect 2: `{select:"#x", option:2}` (numeric) is rejected — looked like a
  legit-value-dropped bug, but option is BY DESIGN the visible label (string only;
  :326), index is not a supported addressing mode — the reject is correct. Cross-
  check: validator blocks fill/select with no text/label on BOTH forms, so the
  normalizer never yields a text:undefined spec in the validated flow — the divergence
  that bit live (validator looser than runtime) does NOT exist here; the validator is
  STRICTER than what the normalizer needs. NO FIX. LESSON: same lens, opposite
  result — form inputs were built validator-first (strict gate, total normalizer),
  unlike live which grew verb-by-verb and drifted. A lens isn't a bug detector; it's
  a question. Sometimes the answer is "sound."
- camera validator↔spec↔runtime trio (the 3rd validator↔runtime pair) — clean-code
  fix (dead, misleading guard removed; not a functional bug but a real change). The
  same lens that was CLEAN on form inputs found a PHANTOM shape on camera:
  {camera:{out:true}}. Three places disagreed: validator (rec-steps:302) rejects it
  (demands sel); cameraSpec (:234) silently drops `out` → {zoom:0}; runtime
  (rec.mjs:579) carried `&& c.out` pretending to honor it, while the real exec path
  (:694 reads cam.out off the SPEC) would camFrame(undefined). Because the validator
  rejects {out:true} it never renders, so the :579 clause was DEAD and MISLEADING —
  it implied an object-out form that doesn't exist. Every real use (showcase/presets/
  tests) is the string "out". Removed the dead clause so all three agree: out === the
  string. Verified the term never affected valid inputs (c.out always undefined for
  them). 526 green, audit clean (camera:"out" heavy in showcase). LESSON: the form-
  input iter said "a lens is a question, sometimes the answer is sound" — same lens,
  same family (validator↔runtime), and the THIRD member (camera) answered "phantom
  shape." Form inputs sound, camera not — you can't predict which from the family.
- ephemeral opts: validator gate vs applyX clamp (4th validator↔runtime member) —
  CLEAN (no bug, FULL clamp table measured, DRY-violation ruled out). The validator
  range-checks every opt strictly (count[1,60], scale(0,4], intensity[0.2,2],
  duration[120,12000]; rejects -5 / "lots" / 99999) — a GENERIC sanity gate for all
  ephemeral types (rec-steps:362-378). Each applyX then clamps with its OWN per-
  effect range. Suspected DRY-of-a-decision: confetti's runtime clamps duration
  [200,8000] + scale[0.3,3] are NARROWER than the gate, so author scale:3.5 validates
  but renders as 3 — "accepted value silently adjusted." Tabulated EVERY runtime
  clamp (grep): duration [200/600,8000], scale [0.3,3], intensity [0.2,2], count
  [1,8]/[1,12]/[1,20]/[1,60] — ALL ⊆ the gate, NONE wider. So the validator never
  rejects a value any effect could use; the gate is the broad sanity ceiling, each
  applyX the physical fit (particle count ≠ orbit laps ≠ countup digits — genuinely
  different per effect). Two LEGITIMATE layers, not a drifting single decision.
  Making the validator per-type (16×4 ranges) is the bloated abstraction the prompt
  forbids; the silent in-bounds clamp is graceful degradation, not silent-wrong. NO
  FIX. LESSON: family member #4 — form-inputs SOUND, camera PHANTOM, ephemeral TWO-
  LAYER-BY-DESIGN. Three real answers, none predictable from the family name; and a
  narrower-than-gate clamp is correct, only a WIDER-than-gate one would be the bug.
- ephemeral opt DEFAULTS + opt-combinations (2nd pass, new falsifiable rule) —
  CLEAN (no bug, one regex-artifact false alarm killed by reading source). Last
  iter gave a falsifiable rule ("a clamp WIDER than the gate would be the bug");
  this iter tested a NEW falsifiable rule on the same layer: "every default must
  sit inside its own clamp AND the gate" — because clamp(v,lo,hi,d) returns `d`
  UN-clamped when v is non-numeric, so a default outside [lo,hi] would render a
  value no author could pass. A grep tabulation flagged `scale clamp[0.3,3]
  default=0` — scale 0 = zero-size effect (invisible). Read the actual lines (906/
  1084/…/2307): EVERY scale default is 1 (or a dynamic arg>0); the `=0` was a sed
  mis-parse, not real. All defaults verified ∈ their clamp ∈ the gate (duration
  560–2600 ⊂ [200,8000], count 2–28 ⊂ clamp, scale/intensity =1). 2nd angle: opt
  COMBINATIONS — checked for N*SC-style blowups; element loops are all `i<N` with N
  = clamp(count)≤60, scale only sizes (never multiplies count), post-clamp math
  (ZOOM=1+SC*0.06 ⇒ [1.018,1.18]) stays sane. No combinatorial explosion. NO FIX.
  LESSON: a falsifiable rule that COULD have caught a real bug (default=0 breaks
  render) but didn't = real coverage, not a shrug — and measure-before-claiming
  (read the lines, don't trust the grep) killed the one false positive.
- ephemeral offline-trap gate (glow/pulse/ripple/orbit vs the 2-effect gate) —
  CLEAN (no bug, RENDER-PROVEN, static suspicion falsified). The offline-trap lens
  (setTimeout/rAF under paused virtual clock) had only been applied to live +
  masks. OFFLINE_INCOMPATIBLE gates just confetti+sparkline (rec-steps:602). Built
  a strong static case for a bug: (1) hotHeadFor (the offline hot-window arbiter)
  has NO term for ephemeral effect DURATION — a bare {glow} gets only fade=400ms
  hot, but glow default DUR=2600ms; (2) applyOfflineDefaults only sets fps, doesn't
  widen hot; (3) glow/pulse/ripple/orbit ALL animate via CSS transition — the exact
  mechanism the comment says makes confetti "resolve to end pose without sampling".
  So static analysis SCREAMED "4 more effects belong in the gate." Then I MEASURED:
  rendered {glow}{pulse}{ripple} offline at 640x400, extracted 188 frames, counted
  green effect-ring pixels per frame — baseline 0, PEAK 1096 at frame 98 with spikes
  through each window. The rings DO appear offline. Suspicion FALSIFIED: the effects
  leave a ring visible long enough for the hot span to catch a frame, unlike
  confetti (chips fly out + self-remove) / sparkline (stroke-draw). The 2-effect
  gate is correct. NO FIX. LESSON: the strongest static case of the session (3
  independent reinforcing signals) was still WRONG — only the render settled it.
  When the verdict is "should be blank," render before gating; measure-before-
  claiming beat a very convincing analysis.
- edge-arrow safeguard false-reject (validator↔runtime↔SAFEGUARD, a NEW 3rd party)
  — 1 bug fixed. Setting up a showcase regression render (to catch visual drift from
  ~24 session changes), the render exited 2 on a hidden #rollback-countdown — a known
  ?gate=fail demo coupling, NOT a bug. But chasing the safeguard surfaced a real one:
  arrow:"top"/"bottom" is a VALID edge arrow (rec.mjs:752 arrowEdge — points from the
  letterbox edge, anchored to NOTHING). The validator accepts it + the runtime renders
  it, but stepAnchors emitted the value as a selector, so the off-screen safeguard ran
  querySelector("top") → no match → HARD-REJECTED (exit 2) a valid roster. Proven pure:
  stepAnchors({arrow:"top"}) returned ["top"]. Fixed: stepAnchors skips arrow when the
  value is the edge keyword (like it already skips "true" / #hex). +4 assertions, 526
  green. LESSON: the validator↔runtime family had a THIRD party I'd never traced — the
  SAFEGUARD. validator+runtime agreed (accept+render); the safeguard was the outlier
  (false-reject). A "pair" can be a trio; the off-screen gate is its own oracle that
  must agree with the other two. NOTE: showcase full-render regression check still
  PENDING — the realtime GIF encode is too heavy (>92MB, 84 steps @30fps); needs the
  MP4 path or a sliced roster. Not done, said plainly.
- flash-not-an-anchor safeguard false-reject (edge-arrow's sibling, wider blast) —
  1 bug fixed. Applied last iter's lesson directly: "if one ANCHOR_KEY value can be a
  non-selector keyword, others can too." flash paints a FULL-SCREEN color wash —
  applyFlash takes a COLOR as arg 1, never a sel (rec.mjs:679 passes step.flash
  through as the color). But flash was in ANCHOR_KEYS, so stepAnchors emitted its
  value as a selector. The #hex form was filtered BY ACCIDENT (the hex guard), but
  NAMED ('red') + rgb()/hsl() colors slipped through → querySelector("red") → no
  match → off-screen safeguard HARD-REJECTED (exit 2) a valid roster using a common
  flash form (proven pure: stepAnchors({flash:'red'})=['red']). Root fix: removed
  flash from ANCHOR_KEYS entirely — it has no element anchor, needs no off-screen
  guard; kills hex/named/rgb/hsl in one move, no special-case color filter. +2
  assertions, 526 green. LESSON: a fix's LESSON is itself a lens — "edge-arrow was a
  non-selector keyword in ANCHOR_KEYS" generalized to "audit EVERY ANCHOR_KEY for
  non-selector values," and flash (a worse case: common + multi-form) fell out
  immediately. Fixing a bug should spawn the next angle, not close the topic. NOTE:
  showcase MP4 regression render still in flight (long realtime take) — monitor armed.
- false-NEGATIVE hunt: scrollTo/scrollIn missing not gated at render — 1 bug fixed,
  render-PROVEN, + the pending showcase visual-regression check RESOLVED in the same
  turn. The edge-arrow/flash fixes were false-POSITIVES; chased the inverse — a key
  that anchors but ESCAPES the render safeguard (silent-wrong scene, worse than a
  loud reject). Compared the TWO selector lists: rec.mjs:259 (`--dry` preflight,
  EXISTENCE, includes scrollTo/zoom, process.exit) vs ANCHOR_KEYS (render off-screen
  gate). The gap: scrollTo/scrollIn are in --dry but NOT the render gate, and unlike
  click/fill/select they were never existence-checked at render. RENDER-PROVEN it's
  silent: {scrollTo:"#gone"} rendered "PLACE clean / OK", exit 0, no warning — the
  scene just doesn't scroll (shows the wrong position, author unaware). That IS the
  silent-wrong-video class the prompt prioritizes; --dry is opt-in, not the auto
  gate. FIX: auditRosterLive now existence-checks scroll targets (scrollTo + scrollIn
  string/obj) — EXISTENCE ONLY, not off-screen (scrolling TO a below-fold element is
  the whole point). Render-proven both ways: missing → refused ("scene never
  scrolls"); a real below-fold #metrics → passes. +async test (mock bridge: missing
  errors, below-fold ok, scrollIn-obj errors), 526 green, showcase audit clean.
  ALSO: showcase MP4 regression render (pending 2 iters) finished — extracted 509
  frames, scanned for blank/flat (sd<6): ZERO broken frames across the whole reel
  after ~25 session changes. Visual regression CLEAN, pending RESOLVED. LESSON: the
  prior iter logged this as a low-severity candidate "won't claim without render-
  proof" — the render proved it silent-wrong (higher severity than guessed) AND
  proved the fix safe. Deferring to render-proof (not guessing severity) was right.
- zoom-string missing render-gate (scrollTo's direct sibling) — 1 bug fixed,
  render-proven. Last iter's lesson "fixing a bug spawns the next angle" pointed
  straight here: zoom was in the SAME --dry list as scrollTo and had the SAME render
  gap. zoom-as-string is a camera frame (rec.mjs camFrame(step.zoom)), but stepCamera
  only reads s.camera, so a zoom-string target escaped both the camera path AND
  existence checking at render. Render-proven silent: {zoom:"#gone"} rendered "OK",
  exit 0, no warning — camera never frames it, scene renders WIDE (random pan),
  author unaware. Chose the minimal-risk fix: NOT touching stepCamera (also used by
  auditScenes, camera semantics) — instead generalized my scroll-existence block to
  VIEW-MOVERS (scrollTo + scrollIn + zoom-string), existence-only (framing a below-
  fold element is valid), zoom-specific message. Render-proven both ways: missing →
  refused; zoom:"#metrics" → passes; zoom:"out" → ignored (not a selector). +test,
  527 green, showcase audit clean. LESSON: two fixes in a row from the same --dry-vs-
  render-gate divergence (scrollTo, then zoom) — when you find ONE list that should
  mirror another, check EVERY member, not just the one that bit you. The --dry list
  (click/scrollTo/blur/hide/redact/highlight/countup/zoom/fill/select/camera/marks)
  is now FULLY mirrored at the render gate (the anchored ones via stepAnchors, the
  view-movers via this block) — that divergence family is closed.
- STEP_KEYS ↔ render-loop mirror (both directions, programmatic) — CLEAN (no bug,
  grep-measured both ways, suspects all resolved). Last iter's lesson "when one list
  should mirror another, check EVERY member" generalized from --dry↔render-gate to
  the bigger pair: STEP_KEYS (what the validator accepts) ↔ what the render consumes.
  Direction 1 (validator→render): 7 of 56 keys had no `step.<key>` in rec.mjs —
  scrollIn/to/text/delay/option/stagger/fade — but ALL are consumed via normalizers
  (fillSpec reads step.text+delay :119; selectSpec step.option; scrollInSpec
  step.scrollIn+to; hotHeadFor+annotate step.stagger+fade). None orphaned. Direction
  2 (render→validator): grepped every `step.<ident>` read in rec.mjs against
  STEP_KEYS → EMPTY — the render reads no key the validator would reject. Mirror
  complete both ways. One borderline non-bug: delay+select (delay is typing speed,
  meaningless for a dropdown) is accepted + silently ignored — low severity, not the
  silent-wrong-video class, left as-is. NO FIX. LESSON: the mirror-lens that found 2
  bugs in --dry (an ad-hoc list) found NOTHING in STEP_KEYS (the validator's single
  source of truth, which the render was built against). Same lens; a SOT-backed pair
  holds, an ad-hoc pair drifts. Where two lists exist, ask which is the SOT — the
  other is the suspect.
- batch contact-sheet silently dropped (TAKE_KEYS allowlist vs normalizer consumer)
  — 1 bug fixed, applying the previous iter's exact rule. The prior iter said "where
  two lists exist, ask which is the SOT — the other is the suspect," and tested
  STEP_KEYS (SOT, held). This iter swept the OTHER allowlists (MARK_KEYS, TAKE_KEYS)
  against their hand-written consumers. MARK_KEYS held (annotate reads exactly the 5,
  allowlist enforced). But TAKE_KEYS vs validateBatch's normalizer DRIFTED: `sheet`
  is an allowlisted take field (a per-take contact sheet), so {sheet:"x.png"}
  validates — but the normalizer returned every other field (width/fps/mp4/keepWebm…)
  and OMITTED sheet, so a batch take's contact sheet validated then NEVER rendered
  (convertOutputs got no sheet), no warning. The single-render path passes a.sheet;
  only batch had the gap. Fixed: normalizer propagates sheet (true→<out>.png like
  mp4, path passes through, absent→null). +3 assertions, 527 green. LESSON: the SOT-
  vs-consumer rule is now a repeatable PROCEDURE — list every allowlist, diff it
  against the code that consumes it. STEP_KEYS+MARK_KEYS held (consumed via specs);
  --dry (2 bugs) + TAKE_KEYS (1 bug) drifted. The hand-written CONSUMER is always
  the suspect, never the allowlist. NOTE: this closes the allowlist-mirror sweep —
  STEP_KEYS, MARK_KEYS, TAKE_KEYS, --dry all now verified against their consumers.
- field-by-field NORMALIZERS subset-complete (modalLayout, scrollInSpec) — CLEAN
  (no bug, both directions, one false suspect killed). The sheet bug was a normalizer
  returning a SUBSET of the fields it should; generalized to the other curated specs
  (fillSpec/selectSpec already clean, cameraSpec had the phantom-out). modalLayout:
  suspected the doc says {header,html,footer} but the render reads modal.title —
  author writes {header:"X"}, gets no title. FALSE: modalLayout (:254) maps
  `title: m.header || m.title`, and rec-annotate:18 normalizes via modalLayout BEFORE
  reading modal.title (:216) — so header IS honored. Mirror both ways: render reads
  title/html/text/footer/backdrop/pos; modalLayout returns all six. scrollInSpec:
  returns {sel,to,dur}; scrollContainer (:612) reads exactly those three positionally
  — trivially complete. NO FIX. LESSON: extended the SOT-consumer procedure from
  allowlists to field-curating normalizers (same drift class: a hand-written object
  literal that forgets a field). Of the curated specs — fill/select/scrollIn/modal
  hold, only camera (phantom-out) + batch (sheet) drifted. The step-spec layer is now
  swept. measure-before-claiming again caught me: "render reads .title raw" was false,
  it reads the modalLayout output.
- degenerate ratio forces capture height (DRY-of-a-decision, NEW layer: geometry
  math) — 1 bug fixed, real DRY home extracted. Moved off the step-spec layer to the
  aspect-ratio helpers (padToRatio / deriveCaptureHeight / resolveCaptureHeight), lens
  = arithmetic under boundary inputs. The "valid ratio" rule (W:H regex + both dims
  >0) lived in THREE copies; the >0 guard was in TWO (padToRatio, derive) but NOT
  resolveCaptureHeight (bare regex .test()). So "0:9"/"5:0" read as a FORCED ratio
  ONLY in resolveCaptureHeight — it overrode the author's --height to 812 with a
  "breaks --ratio 0:9" warning, while padToRatio padded nothing and derive returned
  the default: the ratio never applied, the author silently lost their height for
  nothing. Proven across all three. Fix: extracted parseRatio (one home, parse + >0
  guard), routed all three through it. KEY DRY nuance: these are PLAIN module
  functions, not safeEval closures — so a SHARED HELPER is the correct fix (no eval
  smell), UNLIKE rec-live's rowEl where duplication+KEEP-IN-SYNC won. +test (3-way
  consistency), 528 green, audit clean. LESSON: DRY-of-a-decision recurs at EVERY
  layer (luma detectors, theme, now ratio math) — and the right remedy depends on
  the boundary: same-module → extract a helper; across-safeEval → KEEP-IN-SYNC. The
  guard-in-2-of-3-copies pattern is the tell; grep the rule's literal, count copies.
- zoom (1,3] + scale [0.3,3] guard copies — CLEAN (no bug, ran last iter's exact
  procedure, copies identical). Applied "grep the rule's literal, count copies" to
  the next numeric guard: zoom's (1,3]. Found 4 validator copies (camera-alongside
  :286, camera-obj :303, follow :431, inset :442) — ALL identical `>1 && <=3` — and
  the runtime clamp `Math.max(1, Math.min(3, …))` (:699/:709). Unlike ratio (where
  resolveCaptureHeight forgot the >0 guard), every zoom copy matches: validator is
  the stricter (1,3] open-low, runtime clamp [1,3] is a defensive SUPERSET, so no
  valid input is altered (clamp-wider-than-gate is correct, per the ephemeral lens).
  zoom=1/≤1 rejected at validation, never reaches the clamp; cam.zoom is 0 (no-zoom)
  or (1,3]. Also checked scale's double-clamp (rec-annotate:2307 host clamp + :2311
  in-page re-clamp): same [0.3,3] both sides — redundant belt-and-suspenders, not a
  divergence (re-clamping an already-clamped value is a no-op). NO FIX. LESSON: the
  same grep-and-count procedure that FOUND the ratio bug came back CLEAN here —
  identical copies, superset runtime. That's the difference between a real sweep and
  fabrication: run the proven detector; sometimes it fires (ratio), sometimes it
  confirms sound (zoom). The procedure is trustworthy BECAUSE it does both.
- luma/theme family RE-SWEPT after ~30 session changes (regression check) — CLEAN
  (no bug, every copy categorized line-by-line). Re-ran grep-and-count on the family
  I aligned EARLY (iter-8 rec-page, annotate-canvas, then liveOpDom's <128 fix) to
  confirm ~30 later changes didn't drift it or add an escaped detector. Rec.601
  weights: 19 copies, ALL identical 0.299/0.587/0.114 (the per-safeEval-closure luma
  formula — can't share a helper across the eval boundary, so duplication+identical
  is the accepted state). Rec.709: 2 copies, both badgeInk (WCAG contrast, different
  purpose, correct). Dark/light THRESHOLDS (where the <128 bug bit): all page-theme
  detectors now use the midpoint — `< 0.5` (normalized) or `< 127.5` (0-255), NO
  `<128` survives. The `> 0.45` pair is badgeInk's WCAG threshold (not page-theme).
  False positives killed by reading: rec-motion's `k < 0.5` is EASING midpoint (k =
  animation progress), not luma. Every threshold accounted for, none divergent. NO
  FIX. LESSON: re-sweeping a PREVIOUSLY-FIXED family is real coverage, not a rerun —
  ~30 changes could have added a 6th detector or drifted a copy (exactly how the
  liveOpDom <128 escaped the original alignment). It held. The grep-and-count detector
  doubles as a regression guard for the families it already cleaned.
- hide/restore/executedHides state↔DOM (the live-bug lens on persistent hide state)
  — CLEAN (no bug, 4 angles traced). Applied the richest lens of the session (state↔
  DOM divergence — gave the live update/recolor/replace/theme bugs) to the other
  persistent-state surface: `hide`. Angle 1 idempotency: applyHide guards `if
  (display==='none' || dataset.srHiding) return` — re-applying is a no-op, so the
  per-step re-apply (rec.mjs:588) can't corrupt. Angle 2 re-apply: executedHides is
  re-applied each step + after navigation (:891 restore) because a fresh DOM loses
  the hide — correct, intentional (hide is narrative + persistent by selector). Angle
  3 navigation: a prev-screen-only selector (#cookie-bar) just no-ops on the new doc
  (querySelectorAll empty). Angle 4 restore: re-applies cursor+cam+hides on the new
  document after a navigating click — a reused id re-hides (expected for a
  by-selector persistent hide). NO divergence: unlike live (host registry + DOM
  mirror that drifted), hide uses the DOM ITSELF as source of truth via an idempotent
  guard — executedHides is the only list, applyHide is idempotent against the real
  DOM. NO FIX. LESSON: the same lens, on a structurally DIFFERENT design, finds
  nothing — live drifted because it kept TWO copies of state (host + DOM); hide
  can't drift because it keeps ONE (DOM, guarded). The lens looks for dual-state; a
  single-source-of-truth design is immune to it by construction.
- cursor visual ↔ Playwright pointer dual-state (post-nav) — NOT A BUG (and this
  CORRECTS my own prior-iter verdict — I was wrong). Last iter I logged a "mechanism
  real, cosmetic" mismatch: ensureCursor re-injects the cursor post-nav, a glide
  reads start from c.style.left, and I claimed it falls back to 80,80 while the
  pointer is elsewhere. THAT WAS WRONG — my harness HARDCODED `left:80px` instead of
  reading the real cursor-inject cssText. The real inject (cursor-inject:48) sets
  `left:-80px;top:-80px` (off-screen by design), and glide's `parseFloat("-80px")||80`
  reads -80 (NOT the 80 fallback — only an EMPTY left hits the fallback, which never
  happens). So post-nav the glide starts at -80,-80: the cursor slides IN FROM THE
  EDGE — the intended "cursor enters" animation. Visual and glide-start AGREE (both
  -80); the unrendered pointer ends at the target by glide's end (the click fires
  there). No descoupling, no jump, no cosmetic glitch. NO FIX, and the prior "logged
  candidate" is RETRACTED. LESSON (sharp): measure-before-claiming applies to your
  OWN past conclusions — I asserted a mismatch from an ASSUMED fallback (80,80)
  without reading the one line that set the real value (-80px). The third verdict
  "mechanism real, severity unproven" was itself unproven; reading the actual cssText
  dissolved it. Always read the literal that sets the value before claiming a
  divergence — twice now an assumed-default vs real-default flipped the verdict
  (this, and the ratio sed-artifact). Re-audit a "logged candidate" before trusting
  it; a candidate is a hypothesis, not a finding.
- glide `parseFloat(style)||80` mishandles a real 0 (the idiom that misled me) — 1
  bug fixed. Last iter's retraction taught the idiom `parseFloat(x)||N` treats 0 as
  absent; turned that into a grep: `parseFloat(...)||` across the motor. Triage of 12
  hits: borderRadius||N (cosmetic corner fallback, fine), fit||1 (clamped ≥1 after),
  panToInclude ||0 (0 is both value and fallback, consistent). The two REAL ones:
  glide + glideChase read the cursor start as `parseFloat(c.style.left)||80`. PROVEN:
  parseFloat("0px")||80 === 80 (a cursor at the viewport edge, left "0px", reads as
  absent → an 80px jump), while "0.4px"→0.4. Only NaN should fall back; 0 and the
  initial -80px are real. Fixed both with Number.isFinite(v)?v:80 (KEEP-IN-SYNC, two
  safeEval closures). -80 stays -80, 0 stays 0, unset→80. Low severity (cursor exactly
  at 0 is rare) but a PROVEN wrong 0-handling, fixed at no cost — NOT speculative
  (the old code demonstrably mis-reads 0), NOT the retracted -80 case (which read
  correctly). 528 green, audit clean. LESSON: a RETRACTION is generative — being
  wrong about the cursor (-80 read fine) exposed the real idiom flaw (0 doesn't), and
  grepping the idiom found the genuine instance two lines away. The bug wasn't where I
  first claimed it; it was the same SHAPE one edge-case over. Mine a wrong verdict for
  the true lesson inside it.
- `X || nonzero-default` class, rest of the motor (fade||400, cam.s||1) — CLEAN (no
  bug, the cursor-0 fix's class chased to exhaustion). After fixing glide's
  parseFloat||80, swept the whole `X || nonzero` idiom (where a real 0 would be lost).
  fade||400 (×3 rec-annotate + hotHeadFor's >0?:400): LOOKS like the cursor-0 class
  (fade:0 = "instant, no fade" → 400), BUT the validator gates fade to [60,1500]
  (:426), so 0 AND negative are rejected before the runtime — unreachable. (A latent
  hotHeadFor vs rec-annotate divergence on NEGATIVE fade, -5→400 vs -5→-5, is also
  gated away.) cam.s||1 (×3): cam.s=0 is the no-zoom state, which IS 1x — so the
  fallback to 1 is semantically correct, not a lost value. NO FIX. KEY DISTINCTION:
  the cursor-0 was a bug because left/top come from UNVALIDATED clientX (0 reachable
  + wrong); fade is VALIDATED (0 unreachable) and cam.s's 0 already MEANS the
  fallback. LESSON: `X || default` is only a bug when (a) 0 is reachable AND (b) 0 ≠
  the default's meaning. The idiom alone isn't the bug — the input's provenance
  (validated? 0 meaningful?) decides. Read where the value comes from, not just the
  ||. The cursor-0 fix's class is now exhausted: one real (unvalidated clientX), two
  protected (validated / 0-means-fallback).
- unvalidated DATA inputs → degenerate arithmetic (sparkline.points, countup.to) —
  CLEAN (no bug, runtime-guarded by design). Took the cursor-0's distilled rule
  ("unvalidated AND wrong-handling reachable") to the DATA inputs that feed chart/
  count math. Both ARE loosely validated: sparkline.points all-equal [5,5,5] passes,
  countup.to accepts non-numeric "abc". Suspected degenerate math: zero range (div-by-
  zero → NaN path) and NaN target. PROVEN both guarded in the runtime: sparkline does
  `span = hi - lo || 1` (range-0 → 1, a flat mid-line) + `pts.map(Number).filter
  (isFinite)` + `length>=2 ? raw : default` — sound against all-equal/NaN/empty.
  countup does `src.match(/^(\D*?)([\d.,]+)(\D*)$/); if(!m) return false` + `if(!isFinite
  (target)) return false` — non-numeric "abc" → graceful no-op dwell, never NaN in the
  DOM (deliberate: `to` is free text like "$1,234.50"). NO FIX. KEY DISTINCTION from
  cursor-0/safeguards: those fed unvalidated input STRAIGHT to math/DOM with no
  downstream guard; sparkline/countup have defensive runtime (||1, regex+isFinite) that
  neutralizes degenerates. LESSON: "unvalidated input" is necessary but NOT sufficient
  for a bug — the second half is "AND no downstream guard." A loose validator is fine
  when the consumer is defensive; the bug is loose-validator + naive-consumer. Read the
  CONSUMER's guards, not just the validator's gaps.
- glossary stagger/item-count vs hot-window (head>hold timing) — CLEAN (no bug,
  render-proven, static analysis falsified). The "loose validator + naive consumer"
  rule pointed here: stagger has NO upper bound (validator only checks >=0) and item
  count is uncapped, so hotHeadFor's head = 250+(n-1)*STAG+450 grows unbounded with
  n while hold is ~constant (dwellMs caps at 12000, baseHold ~1200). STATIC analysis
  screamed: n=15 → head 6020ms >> hold ~1200ms, and clock.wait does Math.min(hold,
  hot) — so the hot window CUTS before the last items reveal → glossary visually
  incomplete. RENDER-PROVEN FALSE: rendered a 15-item glossary, extracted frames,
  measured panel fill per frame — ALL 15 reveal (fill plateaus ~3900) WITHIN scene 1
  (f1-f27), before the scene-2 cut (f28). The panel reserves full height from the
  start (extent fixed 372px) and items fade in staggered, completing in time. Why no
  cut despite head>hold? The stagger spaces fade STARTS (overlapping ~0.4s fades),
  not full waits — real reveal is far faster than the head formula models, and the
  cold-frame tail catches any remainder. NO FIX. LESSON: the static head>hold
  inequality was a real computation but the WRONG model — it assumed stagger =
  sequential full waits; the actual fades overlap. The "loose validator + naive
  consumer" rule found a real gap (no stagger cap) but the consumer is NOT naive:
  reserved-height + overlapping fades absorb it. Render-prove a TIMING claim before
  trusting an inequality — the formula isn't the animation.
- encode trim-sync + compose-video shortest=1 — CLEAN (no bug, both intentional by
  design). Two independent encode/compose angles while a showcase regression render
  ran in the background (deferred to monitor). (1) rec-encode trim: TRIM_S (webm?1.0:0)
  is applied to BOTH the video (`-ss` before `-i`, :127) AND the chrome event
  timestamps (`tStart - TRIM_S`, :137) — same offset, synced (the design the :131
  comment states). A sub-frame keyframe-snap residual from input-seek is ffmpeg-
  inherent + sub-perceptible, not worth render-investigating. (2) compose-video
  hstack `shortest=1` (:32): a before/after side-by-side ends at the shorter stream,
  "losing" the longer take's tail — but that's the correct side-by-side convention
  (the alternative, a frozen/black frame while the longer one plays, is worse);
  trimSec aligns the HEADS, shortest aligns the TAILS. Deliberate composition
  semantics, not silent loss. NO FIX. ALSO (completed SAME turn — the monitor fired):
  showcase visual-regression scan RESOLVED — rendered the full showcase to MP4,
  extracted 510 frames, scanned for blank/flat (sd<6): ZERO broken across the whole
  reel after ~8 render-path changes since the last scan (ratio parse, cursor-0, glide
  Number.isFinite, scrollTo/zoom gates, sheet, flash/edge-arrow safeguards). No visual
  regression. LESSON: a long background render shouldn't idle the loop — do a real
  independent angle while it runs (the encode-reads were genuine consumer-reads, not
  busywork), and the monitor lets the deferred unit finish the SAME turn the render
  completes. Periodic full-reel regression scans are cheap insurance after a batch of
  render-path edits — silent compositing breakage is exactly what unit tests miss.
- badgeInk L>0.45 threshold mis-picks low-contrast digit (a11y/WCAG lens) — 1 bug
  fixed, computed + render-proven. Re-ran the WCAG-contrast lens (which gave the
  original badgeInk) on the per-item badge colors after ~30 changes. badgeInk chose
  the digit via `luminance > 0.45 ? dark : white` — but that threshold optimizes the
  wrong quantity: for MID-luminance pills, DARK text scores higher contrast than
  white yet L<0.45 picked white. Computed across 8 colors: green #16a34a white 3.30
  (AA-FAIL) vs dark 5.42; purple #a855f7 white 3.96 (FAIL) vs dark 4.51 — the
  threshold picked the FAILING option both times. Fix: compute the real WCAG contrast
  of white vs dark against the pill, pick the higher (the WCAG-correct method, also
  simpler than a magic 0.45). Proven non-regressive across all 8 (green/purple
  improve to AA-pass, the rest identical). Both safeEval closures, KEEP-IN-SYNC.
  Render-proven: green+purple badges now render the dark digit. 528 green, audit
  clean. LESSON: a THRESHOLD that approximates a computation is a bug magnet — 0.45
  was a luminance proxy for "which text contrasts better," but the real answer is
  max(contrast(white), contrast(dark)), and the proxy diverges from it in the middle
  band. When you see a magic threshold standing in for a comparison you could compute
  directly, compute it — the proxy is wrong somewhere by construction. (Same shape as
  the luma 0.5 detectors, but there 0.5 IS the right midpoint; here 0.45 approximated
  a contrast crossover that isn't at any fixed L.)
- threshold-as-proxy-for-computation lens, rest of the motor — CLEAN (no bug, lens
  exhausted). Last iter's lesson "a magic threshold standing in for a computable
  comparison is a bug magnet" → grepped for other numeric-threshold ternaries picking
  a VALUE. Findings all legitimate, NOT proxies: the remaining luma comparisons are
  `0.5` (the correct dark/light midpoint, already swept) or easing `k<0.5`; the
  ternaries in rec-annotate are `dx>0 ? edge : dx<0 ? edge : Infinity` (ray-box
  EXIT geometry — sign-of-direction, not a magic cutoff; dx===0 → Infinity → Math.min
  picks the other axis; guarded by a >40px centre-distance check so dx,dy are never
  both 0) and `N>1`/`>0` division guards. None approximate a computation the way
  badgeInk's 0.45 did. NO FIX. LESSON: badgeInk's 0.45 was the ONLY genuine
  proxy-threshold in the motor; the rest are midpoints (0.5 is exactly right),
  sign-tests, or guards — all of which SHOULD be constants. The lens distinguishes
  "threshold approximating a comparison" (bug) from "threshold that IS the boundary"
  (correct). One real (badgeInk), rest sound. The lens is now exhausted.
- author-doc vs the session's ~31 contract changes (doc-rot lens) — CLEAN (no rot,
  measured against the live/scrollTo/zoom/batch surfaces). Doc-rot gave bugs early
  (hardcoded counts, "55-key grammar"), so re-checked the author-facing docs (cookbook,
  SKILL.md) against the contract I changed 31× this session. The live block (the
  richest surface, cookbook:95-115) is fully aligned: examples match the current
  contract (update item+text, replace with items, recolor item/whole), and RULES
  cover exactly-one-verb / scene-clear / own-step / glossary+modal-only. The
  restrictions I ADDED (update→text/color/badge only, replace requires items) are
  guard-rails the examples already imply — no author would write update:{value} (no
  such row field), and every replace example shows items. scrollTo/zoom "must exist"
  is the new gate, but that's obvious + gives a clear error, not a doc-able surface.
  Batch docs never enumerated take-keys (cookbook:321 = "N takes, ONE browser"), so
  the sheet-propagation fix has no doc to rot. NO FIX. LESSON: I expected doc-rot
  after 31 changes, but MOST of those were INTERNAL (silent-bug fixes: wrong output→
  right, doc unchanged) or guard-rails (reject garbage the doc never suggested) — few
  touched the DOCUMENTED surface. Doc-rot only happens when a change alters what the
  author TYPES; internal correctness fixes don't rot docs. Classify your own changes:
  surface-changing vs internal — only the former can rot the contract.
- test-coverage + error-message UX of the session's fixes — CLEAN (no bug, no
  unguarded gap, all messages coherent — and HONESTLY no code change, per rule 4).
  Checked whether the ~31 fixes have regression guards and whether the new gates'
  error messages are consistent. Coverage: pure-module fixes (validator update-fields/
  replace-items/scrollTo-zoom gate/sheet-propagate, parseRatio, stepAnchors edge-arrow/
  flash) have 61 related assertions; browser-glue fixes (badgeInk, theme, recolor-dot,
  safeCol, glide-0) have manual render-proofs. parseRatio is exported + guarded
  INDIRECTLY via its 3 consumers' tests — a direct test would be redundant (the
  "manufacture tests against guarded code" rule 4 forbids). Error-UX: the gates I
  added share one shape — kind:'missing', `<what> "<sel>" matches no element — <specific
  consequence>` (anchor/scroll target/zoom target), and live.update/replace give
  actionable messages (`only edits text/color/badge (got X)`, `needs items (use
  items:[] to clear)`). All coherent. NO FIX, NO TEST (adding either would be
  fabrication). LESSON: a "verify my own fixes are guarded" pass is legitimate due
  diligence, but when everything IS guarded the honest output is a clean ledger entry
  with NO code — rule 4 explicitly forbids manufacturing a redundant test to look
  productive. Three clean iters in a row (threshold-proxy, doc-rot, this) — the vein
  is thinning (badgeInk was 3 iters back); not dry, but the easy lenses are spent.
- light-theme text-over-glass contrast (a11y render lens) — CLEAN (no bug, the
  premise is structurally impossible). Wanted to render-measure WCAG contrast of live
  text on glass in a LIGHT scene (after the theme + badgeInk fixes). Rendered with
  --theme light, but measure-before-claiming first traced --theme: rec.mjs:359 sets
  pageTheme from --theme as a FALLBACK, then :543-544 OVERWRITES it every step with
  readLiveTheme(page) — the live detection of the real page. The render came out DARK
  (bg L=0.005) despite --theme light, because the demo IS dark and readLiveTheme wins.
  That's DESIGN (:538 comment: a mid-reel page theme-flip must be tracked; the overlay
  must match the page being recorded, not a flag). The consequence: the "illegible
  text on light glass" case is STRUCTURALLY IMPOSSIBLE — readLiveTheme keeps overlay
  and page in agreement, and NOTEINK derives from that same theme (the liveOpDom fix).
  Text-vs-glass can't mismatch by construction. To even test light, I'd need a light
  PAGE, not a flag — and there the system would still match correctly. NO FIX. LESSON:
  a render lens needs a reachable STATE, not just a flag — --theme light didn't produce
  a light render because a stronger signal (readLiveTheme) overrides it. Trace the flag
  to the value it actually sets before building a test around it (the --theme→
  readLiveTheme override is the same shape as: read what really sets the value). FOUR
  clean iters now (threshold-proxy, doc-rot, coverage/UX, this) — the vein is genuinely
  thin. Next angles need a real second page/OS or are low-value; honesty clause looms.
- pngread.mjs — the decoder ALL my pixel-proofs relied on (never-opened file) — CLEAN
  (correct + well-scoped). Resisted declaring "dry" without opening files I'd never
  read critically — and pngread is the one that mattered most: every render-proof this
  session measured pixels through it. If it decoded wrong, my proofs were garbage. It
  supports ONLY bitDepth 8, interlace 0, colorType 2(RGB)/6(RGBA) — throws (explicit
  message) on anything else (paletted/gray/interlaced). Traced its motor uses: all
  decode page.screenshot({type:'png'}) (rec-page:20, prove:341, annotate:315) =
  Playwright PNG, which is ALWAYS RGBA/8/non-interlaced — so the guards never fire in
  the real flow, and my measurements were valid (no crashes all session = the inputs
  were always 6/8/0). The one path taking an EXTERNAL png (annotate vcheck :461, a
  debug subcommand) throws a CLEAR "unsupported colorType 3" on a paletted input —
  loud, not silent-wrong. Supporting paletted would be YAGNI (the motor never makes
  one; the debug path errors clearly). NO FIX. LESSON: opening the never-examined
  BASE tool (the one my own method depended on) is the highest-value clean to confirm
  — if pngread were wrong, 30+ pixel-proofs collapse. It's correct + scoped + loudly-
  guarded. FIVE clean iters now; opening a brand-new file came back clean too, which
  (unlike past iters where new files held bugs) genuinely reinforces the floor.
- dataurl-to-png + build-inject (two more never-opened util files) — CLEAN (correct +
  guarded, debug-only paths). Continued opening never-examined files. dataurl-to-png:
  decodeDataUrl strips JSON-quotes + data-url prefix, base64-decodes, validates PNG
  magic (8 bytes) + length>=67, throws on invalid — sound; only referenced as a
  standalone debug CLI (annotate's comments, no code call). build-inject: wrap() bakes
  the payload via JSON.stringify (the correct injection defense — a hostile imageUrl/
  annotation is JSON-encoded, not break-out-able, same as end-card), src is the
  controlled annotate source; MCP/debug tool, not the record flow. The injection lens
  (which gave live-color + annotate-badge) came back CLEAN here — build-inject used
  JSON.stringify from the start. NO FIX. SIX clean iters; the remaining never-opened
  files (capture/demo/shot/compose) are utils/drivers reusing already-swept infra.
  The floor is firm: bug-bearing surfaces (live state, validator↔runtime, injection,
  DRY-decisions, ||-idiom, thresholds) are all swept; new files keep coming back
  clean. This is a real bottom, not fatigue — 31 real bugs + 1 clean-code harvested.
- demo --text → annotate (author-text injection, the demo/MCP path) — CLEAN (no bug,
  canvas-immune by construction). Traced author --text end to end (demo:77 → ann
  {type:'label',text} :137 → b.annotate :185 → ANNOTATE in annotate-canvas.js),
  expecting the annotate-badge class (raw text in innerHTML). But the demo/MCP path
  renders via CANVAS fillText (annotate-canvas.js), NOT innerHTML — so author text is
  rasterized, never injected (same immunity as the chrome strips). The annotate-badge
  bug was the rec-annotate LIVE path (innerHTML, fixed); this is a DIFFERENT renderer
  (canvas). NO FIX. LESSON: the author-text surface is now FULLY covered across BOTH
  renderers — innerHTML paths escaped (badge/live-color fixes), canvas paths immune
  (chrome, demo/annotate). When a class (injection) is closed, confirm it across
  every RENDERER, not every file — two renderers (canvas/innerHTML) is the real axis,
  and each handles author text correctly. SEVEN clean iters; every remaining trace
  confirms a closed class in a new place rather than finding a new class.
- ledger anchor maintenance: refreshed the stale "Untried angles" section — CLEAN
  (no code bug; legitimate anchor upkeep, not fabrication). capture.mjs (the last
  never-opened cluster) is a standalone MCP-snippet emitter, NOT imported by any motor
  script, already tested for injection (emit-modules-edge), offline-irrelevant — no
  new lens. Rather than force a fake angle (item 4 forbids), did the one real
  non-code unit: the "Untried angles" section still claimed "18 iterations: 16 bugs +
  4 clean" while we're at ~50 iters / 31 bugs / 7 clean — a stale copy of state that
  MISLEADS the anchor I re-read every loop (DRY-of-a-decision in my own file: real
  state lives in DRY STREAK + the ledger, this section had a contradictory old copy).
  Refreshed it to the true state + the closed-family list + the method that still
  finds things. NO CODE FIX. LESSON: when the code is genuinely swept, the honest
  remaining work is keeping the ANCHOR accurate (a misleading anchor wastes every
  future iter), not manufacturing a code change — but distinguish anchor-upkeep
  (real, the guide must be true) from ledger-inflation (fabrication, padding for
  productivity's sake). This was the former: a contradiction corrected, not bulk added.
- NOTEINK row-text contrast over glass, worst case (a11y, alpha-composited) — CLEAN
  (no bug, computed the right way). The badgeInk fix covered the DIGIT; the row TEXT
  uses NOTEINK directly — never measured its real contrast over the semi-transparent
  glass. Computed via alpha compositing (glass rgba(15,23,42,0.72) over the page):
  dark #f8fafc = 17.41, light #0f172a = 17.70 — both far past AA. WORST case (dark
  glass over BRIGHT content behind it — white/yellow/green/blue): still 6.81-12.86,
  all AA-pass, because the glass's 0.72 opacity DOMINATES the effective background
  (the content behind contributes only 28%), so the text always sits on a near-glass
  tone. NO FIX. LESSON: glass/translucent contrast must be computed via ALPHA
  COMPOSITING against the worst content behind it, not against the glass color alone
  — and high opacity (0.72/0.80) is itself the a11y guarantee (it caps how far the
  effective bg can drift). All live text now covered: digit (badgeInk max-contrast),
  row text (NOTEINK ≥6.8 worst-case), theme-matched (liveOpDom fix). NINTH clean iter.
- multi-primitive combos in one step (blur+redact+highlight+spotlight) — CLEAN (no
  bug, deterministic, no silent clash). A GENUINELY new angle (interaction BETWEEN
  primitives, not a re-check of one isolated) — the kind that used to break "dry". The
  validator permits all mask primitives together (blur+redact+highlight OK). Traced
  the runtime: only applyBlur sets `el.style.filter` (rec-annotate:646; :881 is
  clearMasks), so NO two primitives fight over a CSS property — the rest use separate
  `.__sr_mask__` overlay layers that coexist. blur+redact = blur on the el + opaque
  overlay above it (overlay wins visually, but it IS one of the two the author asked
  for — redundant, not silent-wrong). Contradictory combos (blur+highlight: hide vs
  emphasize the same el) apply BOTH visibly — garbage-in-VISIBLE, not silent-drop.
  The validator doesn't forbid every nonsensical pair because (a) the result is
  deterministic + visible (author sees it, corrects it) and (b) a full clash matrix
  is more rule-surface than the narrow nonsense warrants. NO FIX. LESSON: a silent
  clash needs two primitives writing the SAME sink (property/id); here only blur owns
  `filter`, overlays are separate layers — structurally no silent overwrite. A new
  angle (combos) still confirmed the floor: the bug-class (silent property overwrite)
  is absent by the layer-separation design. TENTH clean iter — even an unthought-of
  angle holds.
- position-patch clash (two primitives patching el.style.position) — CLEAN (no
  observable bug; the CLOSEST call in 11 iters — converges correct but fragile-by-
  design). The "silent clash needs two writing the same sink" lesson → applied to
  `el.style.position`: ~10 primitives patch static→relative to anchor overlays, each
  with its OWN flag (srPosPatched / srCuPos / local posPatched). REACHABLE clash:
  {progress:'#x',countup:'#x'} validates OK and both target #x. Traced: primitive A
  patches (static→relative, flag A); primitive B checks `cs.position==='static'` —
  now FALSE (A changed it) → B does NOT patch, does NOT set its flag. Static analysis
  screamed "orphan overlay on cleanup". But it CONVERGES correct: during the step
  position IS relative (one patch suffices, both overlays anchor right); on cleanup
  every restore is `position=''` (→ static) and the element ends static = the
  original. No leaked state. WHY it works: (a) one patch is enough for the duration,
  (b) all restores target the SAME value (''), so order doesn't matter. NO FIX —
  no observable bug. But FRAGILE: it holds only because every restorer wants static;
  if one restored to a specific non-static value, the convergence breaks. Logged as
  fragility, not a bug (a fix would be speculative — KISS/honesty). LESSON: a
  reachable clash isn't a bug if all writers CONVERGE on the same final state — the
  bug condition is divergent restores, not concurrent patches. The closest-to-a-bug
  angle in 11 iters still resolves correct; the floor holds even here. ELEVENTH clean.
- countup+typeon DIVERGENT save/restore clash — the bug-CATEGORY exists, but only
  behind a nonsense precondition → NO FIX (honest third verdict). Last iter's lesson
  "the bug condition is DIVERGENT restores" → hunted save-the-original-then-restore
  primitives: countup saves transition/transform + srCuReal=textContent; typeon saves
  srOrigHtml=innerHTML; kenburns saves transform. The DIVERGENT pair: countup+typeon
  on the same el (both MUTATE the text). Order is typeon(673) then countup(680), and
  countup's `srCuReal = el.textContent` is captured AFTER typeon already started
  mutating the text — so countup restores typeon's PARTIAL state as "original" =
  corrupted final text. Unlike position-clash (converges, all restore to ''), this
  DIVERGES (each saved a different snapshot). Validator allows it; neither checks the
  other's active-flag (srCountup/srTyping). BUT the precondition — two text-mutators
  on the SAME node (count AND type the same element) — is self-contradictory author
  nonsense no one writes, and the result is VISIBLE garbage (corrupted text, author
  sees+fixes), not plausible-silent. All 31 real bugs were reachable with PLAUSIBLE
  input; this needs absurd input. A guard (forbid 2 text-mutators/sel) is defensible
  but a fix for input that doesn't occur = the overengineering the session forbids.
  NO FIX (logged). LESSON: a real bug CATEGORY (divergent restore) can still be
  non-actionable if its only gateway is self-contradictory input producing visible
  (not silent) garbage. The triage axis isn't "is the category real" but "is it
  reachable with PLAUSIBLE input AND silent". This is the most bug-qualifying angle in
  12 iters and STILL gated by nonsense — the floor is confirmed even at the category
  level. TWELFTH clean.
- framedSel cross-step camera state (PLAUSIBLE+silent filter) — CLEAN (re-validated
  each use). Applied the distilled triage axis "reachable with PLAUSIBLE input AND
  silent" to cross-step state — the kind normal sequential steps could trip silently
  (unlike countup+typeon's nonsense). framedSel persists across steps (set on camera-in
  :699 / zoom-string :702, cleared on screen/modal/out). A step that marks a target
  while framedSel still points at a prior panel: rec.mjs:638-642 re-checks
  `he.contains(se)` against the LIVE DOM — if the target is inside the framed panel,
  trust the camera; if NOT (other panel) cameraFramed=false → bringFullyIntoView
  re-shows it. And a STALE/orphan framedSel (panel removed) → querySelector(h)=null →
  cameraFramed=false → re-shows. So the persistent frame is ALWAYS re-validated at the
  point of use (contains + null-check), never trusted blind. NO FIX. LESSON: cross-step
  persistent state is only a silent-bug risk if it's READ without re-validation against
  current reality; framedSel re-queries the DOM every use, so a stale frame degrades
  to "re-show the target", not "mark off-screen silently". The plausible+silent filter
  — the strictest I have — finds nothing: persistent state here is re-checked by design.
  THIRTEENTH clean; even the sharpest triage criterion comes back empty.

## Untried angles (candidates — pick one, then move it to the ledger)

- HONEST STATE (refreshed ~iter 50): 31 real bugs + 1 clean-code fixed; currently
  7 consecutive clean iters. The reachable surface is SWEPT. Bug-bearing classes are
  all closed AND re-verified across renderers/files: live state↔DOM (update/recolor/
  replace/theme), validator↔runtime↔safeguard (scrollTo/zoom/replace/flash/edge-arrow),
  injection (innerHTML escaped + canvas immune, both renderers), DRY-of-a-decision
  (luma/theme/ratio — same-module→helper, cross-safeEval→KEEP-IN-SYNC), the X||default
  0-trap, threshold-as-proxy, doc-rot, allowlist↔normalizer mirrors.
- CLOSED FAMILIES: CLI surplus-positional (all parsers), inject-escaping (innerHTML
  paths + canvas-immune paths), live verb-surface (3 verbs), --dry↔render-gate,
  allowlist mirrors (STEP/MARK/TAKE_KEYS + normalizers), luma/theme detectors (5),
  X||nonzero-default.
- REMAINING need infra I lack or are low-value: real cross-machine capture diff
  (2nd OS); a 200-step perf reel; concurrent cold-start renders sharing .deps.
- METHOD that still works when a lens looks dry: open a NEVER-examined file
  critically (pngread/dataurl/build-inject came back clean — they reinforced the
  floor); RENDER-prove a timing/visual claim before trusting a formula; read the
  literal that sets a value before claiming a divergence; re-audit a logged candidate
  (one retraction this session). When every trace only CONFIRMS a closed class in a
  new place (not finds a new class), that is the bottom — recommend CronDelete.

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
