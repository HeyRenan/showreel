# Live Elements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let stateful annotation overlays (glossary first, then note/modal/progress/marks) persist across steps and accept `append`/`update`/`recolor`/`replace`/`remove` ops with per-item color, instead of the current wipe-and-rebuild.

**Architecture:** An in-page registry (`window.__live`) holds live elements keyed by id. A new host module `rec-live.mjs` owns lifecycle (resolve target, reflow, fade, scene-clear); each stateful primitive provides a two-function adapter (`createContainer` + `renderPart`). A new `live` step key carries mutation ops, validated with the same hostile-input rigor as every other key. Ephemeral one-shot animations are out of scope.

**Tech Stack:** Node ESM, `node:test`, Playwright (offline render), ffmpeg (frame extract), the existing `safeEval`/`rctx` plumbing in `rec-annotate.mjs`/`rec.mjs`.

**Reference spec:** `docs/superpowers/specs/2026-06-18-live-elements-design.md`

**Working dir note:** git root is `~/.claude/plugins/showreel` (outer); code lives in `showreel/scripts/` (inner). Run tests from the inner dir: `cd ~/.claude/plugins/showreel/showreel && node --test scripts/__tests__/<file>`.

---

## Phase 0 — Validation surface (pure, no browser)

Lock the author-facing contract before any rendering. This is fully unit-testable.

### Task 0.1: Add `live` to STEP_KEYS + a live-op shape validator

**Files:**
- Modify: `showreel/scripts/rec-steps.mjs` (STEP_KEYS set ~line 62; add validator in `validateSteps`)
- Test: `showreel/scripts/__tests__/live-validate.test.mjs` (create)

- [ ] **Step 1: Write the failing test**

```javascript
// live-validate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSteps, STEP_KEYS, LIVE_OPS, EPHEMERAL_TYPES } from '../rec-steps.mjs';

test('live is a known step key', () => {
  assert.ok(STEP_KEYS.has('live'));
});

test('live op must be exactly one of the five verbs', () => {
  assert.equal(validateSteps([{ live: { append: { text: 'x' } } }]).ok, true);
  assert.equal(validateSteps([{ live: { update: { item: 1, text: 'x' } } }]).ok, true);
  assert.equal(validateSteps([{ live: { recolor: { color: 'red' } } }]).ok, true);
  assert.equal(validateSteps([{ live: { replace: { items: [] } } }]).ok, true);
  assert.equal(validateSteps([{ live: { remove: true } }]).ok, true);
  // zero verbs, two verbs, unknown verb -> reject
  assert.equal(validateSteps([{ live: {} }]).ok, false);
  assert.equal(validateSteps([{ live: { append: {}, remove: true } }]).ok, false);
  assert.equal(validateSteps([{ live: { frobnicate: 1 } }]).ok, false);
});

test('live never crashes on hostile shapes', () => {
  for (const bad of [null, 5, [1], true, 'x', {}]) {
    assert.doesNotThrow(() => validateSteps([{ live: bad }]));
  }
});

test('live target id, when present, must be a non-empty string', () => {
  assert.equal(validateSteps([{ live: { id: '', append: { text: 'x' } } }]).ok, false);
  assert.equal(validateSteps([{ live: { id: 'feat', append: { text: 'x' } } }]).ok, true);
  assert.equal(validateSteps([{ live: { id: 5, append: { text: 'x' } } }]).ok, false);
});

test('update/recolor item, when present, must be a positive integer', () => {
  assert.equal(validateSteps([{ live: { update: { item: 0, text: 'x' } } }]).ok, false);
  assert.equal(validateSteps([{ live: { recolor: { item: 1.5, color: 'red' } } }]).ok, false);
  assert.equal(validateSteps([{ live: { update: { item: 2, text: 'x' } } }]).ok, true);
});

test('an ephemeral primitive given an id is rejected as one-shot', () => {
  assert.ok(EPHEMERAL_TYPES.has('confetti'));
  assert.equal(validateSteps([{ confetti: { id: 'x', sel: '#a' } }]).ok, false);
});
```

- [ ] **Step 2: Run, verify it fails** — `cd ~/.claude/plugins/showreel/showreel && node --test scripts/__tests__/live-validate.test.mjs` — expect FAIL (`live` not in STEP_KEYS, `LIVE_OPS`/`EPHEMERAL_TYPES` undefined).

- [ ] **Step 3: Implement in `rec-steps.mjs`**

Add `'live'` to the `STEP_KEYS` set. Then add near the other exported sets:

```javascript
export const LIVE_OPS = new Set(['append', 'update', 'recolor', 'replace', 'remove']);
// one-shot animations: events, not state — cannot be made live.
export const EPHEMERAL_TYPES = new Set([
  'confetti', 'ripple', 'flash', 'shake', 'pulse', 'kenburns', 'sparkline',
  'glow', 'checkmark', 'typeon', 'reveal', 'orbit', 'countdown', 'countup', 'trail',
]);
```

In `validateSteps`, inside the per-step loop (after the existing key checks), add:

```javascript
if ('live' in s) {
  const v = s.live;
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    errors.push(n + ': live must be an object {op, id?}');
  } else {
    const verbs = [...LIVE_OPS].filter((k) => k in v);
    if (verbs.length !== 1) errors.push(n + ': live needs exactly one of ' + [...LIVE_OPS].join('/'));
    if ('id' in v && (typeof v.id !== 'string' || !v.id)) errors.push(n + ': live.id must be a non-empty string');
    for (const verb of ['update', 'recolor']) {
      const o = v[verb];
      if (o && typeof o === 'object' && 'item' in o
        && (typeof o.item !== 'number' || !Number.isInteger(o.item) || o.item < 1))
        errors.push(n + ': live.' + verb + '.item must be a positive integer (1-based)');
    }
  }
}
// ephemeral primitive carrying an id cannot be live
for (const t of EPHEMERAL_TYPES) {
  const tv = s[t];
  if (tv && typeof tv === 'object' && !Array.isArray(tv) && 'id' in tv)
    errors.push(n + ': ' + t + ' is a one-shot animation and cannot be a live element (drop id)');
}
```

- [ ] **Step 4: Run, verify pass** — same command — expect PASS, all assertions green.

- [ ] **Step 5: Run the full suite for regression** — `cd ~/.claude/plugins/showreel/showreel && node --test scripts/__tests__/*.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)'` — expect 0 fail.

- [ ] **Step 6: Commit**

```bash
cd ~/.claude/plugins/showreel
git add showreel/scripts/rec-steps.mjs showreel/scripts/__tests__/live-validate.test.mjs
git commit -m "feat(live): validate the live step key + op shapes (phase 0)"
```

---

## Phase 1 — The generic engine (registry logic, unit-tested without a browser)

`rec-live.mjs` has two halves: a **pure registry-state module** (testable in Node) and the **in-page browser glue** (exercised later by integration). Phase 1 builds + unit-tests the pure half.

### Task 1.1: Pure registry-state functions

**Files:**
- Create: `showreel/scripts/rec-live.mjs`
- Test: `showreel/scripts/__tests__/rec-live.test.mjs` (create)

The pure functions operate on a plain registry object `{ byId, order }` and a target spec — NO DOM. The browser glue (Phase 2) calls these to decide WHAT to do, then does the DOM work.

- [ ] **Step 1: Write the failing test**

```javascript
// rec-live.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRegistry, registerLive, resolveTarget, applyState, dropLive, clearScene } from '../rec-live.mjs';

test('register + resolve by explicit id', () => {
  const r = newRegistry();
  registerLive(r, { id: 'feat', type: 'glossary', state: { rows: [] } });
  assert.equal(resolveTarget(r, { id: 'feat' }).id, 'feat');
});

test('resolve the sole live element when no id given', () => {
  const r = newRegistry();
  registerLive(r, { id: 'a', type: 'glossary', state: { rows: [] } });
  assert.equal(resolveTarget(r, {}).id, 'a');
});

test('resolve with no id and two live elements is ambiguous -> null + reason', () => {
  const r = newRegistry();
  registerLive(r, { id: 'a', type: 'glossary', state: { rows: [] } });
  registerLive(r, { id: 'b', type: 'glossary', state: { rows: [] } });
  const res = resolveTarget(r, {});
  assert.equal(res.target, null);
  assert.match(res.reason, /ambiguous/);
});

test('resolve a missing id -> null + reason, never throws', () => {
  const r = newRegistry();
  assert.doesNotThrow(() => resolveTarget(r, { id: 'nope' }));
  assert.equal(resolveTarget(r, { id: 'nope' }).target, null);
});

test('applyState append adds a row; update mutates by 1-based item; recolor sets color', () => {
  const e = { id: 'f', type: 'glossary', state: { rows: [{ badge: '1', text: 'A', color: 'blue' }] } };
  applyState(e, { append: { badge: '2', text: 'B', color: 'green' } });
  assert.equal(e.state.rows.length, 2);
  applyState(e, { update: { item: 1, text: 'A2' } });
  assert.equal(e.state.rows[0].text, 'A2');
  applyState(e, { recolor: { item: 2, color: 'red' } });
  assert.equal(e.state.rows[1].color, 'red');
  applyState(e, { recolor: { color: 'amber' } }); // whole-element recolor
  assert.equal(e.state.color, 'amber');
  applyState(e, { replace: { rows: [{ badge: '9', text: 'Z' }] } });
  assert.deepEqual(e.state.rows.map((x) => x.badge), ['9']);
});

test('applyState update/recolor on an out-of-range item is ignored, never throws', () => {
  const e = { id: 'f', type: 'glossary', state: { rows: [{ text: 'A' }] } };
  assert.doesNotThrow(() => applyState(e, { update: { item: 99, text: 'x' } }));
  assert.equal(e.state.rows[0].text, 'A');
});

test('dropLive removes one; clearScene empties all', () => {
  const r = newRegistry();
  registerLive(r, { id: 'a', type: 'glossary', state: { rows: [] } });
  registerLive(r, { id: 'b', type: 'glossary', state: { rows: [] } });
  dropLive(r, 'a');
  assert.equal(resolveTarget(r, { id: 'a' }).target, null);
  assert.equal(r.order.length, 1);
  clearScene(r);
  assert.equal(r.order.length, 0);
});
```

- [ ] **Step 2: Run, verify it fails** — `cd ~/.claude/plugins/showreel/showreel && node --test scripts/__tests__/rec-live.test.mjs` — expect FAIL (module/functions missing).

- [ ] **Step 3: Implement the pure half of `rec-live.mjs`**

```javascript
// rec-live.mjs — live element engine. The pure half (below) owns registry state
// and target resolution; the browser glue (makeLive, added in phase 2) does the
// DOM work, calling these to decide WHAT to do.

export function newRegistry() {
  return { byId: Object.create(null), order: [] };
}

export function registerLive(reg, entry) {
  if (!reg.byId[entry.id]) reg.order.push(entry.id);
  reg.byId[entry.id] = entry;
  return entry;
}

// { target, reason }. target null when missing/ambiguous; reason explains.
export function resolveTarget(reg, op) {
  if (op && typeof op.id === 'string') {
    const t = reg.byId[op.id] || null;
    return { target: t, id: op.id, reason: t ? null : 'no live element id "' + op.id + '"' };
  }
  if (reg.order.length === 1) return { target: reg.byId[reg.order[0]], id: reg.order[0], reason: null };
  if (reg.order.length === 0) return { target: null, reason: 'no live element on screen' };
  return { target: null, reason: 'ambiguous: ' + reg.order.length + ' live elements — pass an id' };
}

// mutate entry.state in place for one op. Out-of-range item is a no-op.
export function applyState(entry, op) {
  const st = entry.state;
  const rowAt = (item) => (Number.isInteger(item) && item >= 1 && item <= st.rows.length) ? st.rows[item - 1] : null;
  if (op.append) { st.rows = st.rows || []; st.rows.push({ ...op.append }); }
  else if (op.update) { const r = rowAt(op.update.item); if (r) Object.assign(r, op.update); }
  else if (op.recolor) {
    if (op.recolor.item != null) { const r = rowAt(op.recolor.item); if (r) r.color = op.recolor.color; }
    else st.color = op.recolor.color;
  }
  else if (op.replace) { Object.assign(st, op.replace); }
  return entry;
}

export function dropLive(reg, id) {
  if (!reg.byId[id]) return;
  delete reg.byId[id];
  reg.order = reg.order.filter((x) => x !== id);
}

export function clearScene(reg) {
  reg.byId = Object.create(null);
  reg.order = [];
}
```

- [ ] **Step 4: Run, verify pass** — same command — expect PASS.

- [ ] **Step 5: Hostile pass** — add to the SAME test file:

```javascript
test('registry functions never throw on hostile input', () => {
  const r = newRegistry();
  assert.doesNotThrow(() => resolveTarget(r, null));
  assert.doesNotThrow(() => resolveTarget(r, {}));
  assert.doesNotThrow(() => dropLive(r, 'ghost'));
  assert.doesNotThrow(() => clearScene(r));
  const e = { id: 'x', type: 'glossary', state: { rows: [] } };
  for (const bad of [{}, { append: null }, { update: {} }, { recolor: {} }, { replace: {} }]) {
    assert.doesNotThrow(() => applyState(e, bad));
  }
});
```

Adjust `applyState`/`resolveTarget` minimally if any case throws (e.g. guard `op` null at top: `if (!op || typeof op !== 'object') return entry;`). Re-run until green.

- [ ] **Step 6: Commit**

```bash
cd ~/.claude/plugins/showreel
git add showreel/scripts/rec-live.mjs showreel/scripts/__tests__/rec-live.test.mjs
git commit -m "feat(live): pure registry + state engine, unit-tested (phase 1)"
```

---

## Phase 2 — Browser glue + glossary adapter (the engine proof)

Wire the engine into the page and prove it on glossary end-to-end. This is the risky integration phase — do glossary ALONE first, prove it, then Phase 3 fans out.

### Task 2.1: `makeLive(rctx)` browser glue + glossary adapter

**Files:**
- Modify: `showreel/scripts/rec-live.mjs` (add `makeLive` + glossary adapter)
- Modify: `showreel/scripts/rec-annotate.mjs` (extract glossary panel build into `createContainer`/`renderPart` reused by the adapter; lines 446-485)
- Modify: `showreel/scripts/rec.mjs` (wire `live` step key + scene-clear at the screen/camOut sites: ~835, ~873, ~874; build `makeLive` in rctx near line 456)

**Design contract for the in-page side:**
- `window.__live` is the registry serialized into the page (created on first use).
- `makeLive(rctx)` returns `{ liveCreate(spec), liveOp(op), liveClearScene() }`.
- `liveCreate` runs a `safeEval` that builds the glossary panel via the SAME HTML
  the current glossary build uses (factor the panel shell + row template out of
  `rec-annotate.mjs:448-456` into a shared in-page function the adapter injects),
  appends it WITHOUT removing `#__ann__`, and records it in `window.__live`.
- `liveOp` runs a `safeEval` that finds the node, then for `append` injects ONE new
  row node (reusing the row template) with the entry transition, animating the
  panel height; `update`/`recolor` mutate the existing row node's text/colors;
  `replace` rebuilds rows inside the kept panel; `remove` fades+removes the node.
- `liveClearScene` fades+removes every node referenced by `window.__live` and resets it.

- [ ] **Step 1: Extract the glossary row template + panel shell**

In `rec-annotate.mjs`, factor the panel-shell string (458-459) and the per-row
string (452-456) into two in-page helpers defined once and reused by BOTH the
existing static path and the live adapter. Keep the existing static glossary
rendering working (no behavior change yet). Run the FULL suite + the roster audit
to prove zero regression:

```bash
cd ~/.claude/plugins/showreel/showreel && node --test scripts/__tests__/*.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)'
cd ~/.claude/plugins/showreel && PLAYWRIGHT_BROWSERS_PATH=showreel/scripts/.deps/ms-playwright node showreel/scripts/audit-roster.mjs "file://$PWD/assets-src/demo/index.html?gate=fail" assets-src/showcase-steps.json --width 1280 --height 676
```
Expect: tests green, audit `✓ no off-screen / broken-anchor errors`.

- [ ] **Step 2: Commit the safe refactor** (separate from new behavior)

```bash
cd ~/.claude/plugins/showreel
git add showreel/scripts/rec-annotate.mjs
git commit -m "refactor(annotate): extract glossary shell + row template (no behavior change)"
```

- [ ] **Step 3: Write the integration test FIRST (failing)**

Add to `showreel/scripts/__tests__/integration-render.test.mjs` (reuses its
`render`, `markerPixelsInLastFrame`, SKIP guard). Pattern: a reel that creates a
glossary live, appends a differently-colored row, then asserts both rows are
present in the SAME final frame, and that after a scene boundary it is gone.

```javascript
test('live glossary: append grows the panel in place, scene boundary clears it', { skip: SKIP }, () => {
  const grown = render([
    { glossary: { id: 'feat', title: 'Shipped', items: [{ badge: 1, text: 'Auth', color: '#2563eb' }] }, wait: 300 },
    { live: { append: { badge: 2, text: 'Cache', color: '#16a34a' } }, wait: 500 },
  ], 'grown.mp4');
  // both colors present in the final frame == old row held while new appended
  const blue = countColor(grown.out, '#2563eb');
  const green = countColor(grown.out, '#16a34a');
  assert.ok(blue > 0, 'first (blue) row still present after append (' + blue + ')');
  assert.ok(green > 0, 'appended (green) row present (' + green + ')');

  const cleared = render([
    { glossary: { id: 'feat', items: [{ badge: 1, text: 'Auth', color: '#2563eb' }] }, wait: 200 },
    { screen: 'Next', wait: 400 },
  ], 'cleared.mp4');
  assert.equal(countColor(cleared.out, '#2563eb'), 0, 'scene boundary cleared the live glossary');
});
```

Add a `countColor(mp4, hex)` helper next to `markerPixelsInLastFrame` (same
frame-extract, count pixels matching `parseHexColor(hex)` at tol 15).

- [ ] **Step 4: Run, verify it fails** — `cd ~/.claude/plugins/showreel/showreel && node --test scripts/__tests__/integration-render.test.mjs` — expect the new test FAILs (append not wired; `live` does nothing yet).

- [ ] **Step 5: Implement `makeLive` + glossary adapter + rec.mjs wiring**

Build the browser glue in `rec-live.mjs` and wire it in `rec.mjs`:
- In the step loop, BEFORE the static annotation path: if the step's primitive
  carries an `id`, route to `liveCreate`. If the step has a `live` key, route to
  `liveOp` and SKIP the per-step `clearAnnotations` wipe.
- At the scene boundaries (`step.screen` handling ~835 and the `camOut` path ~874),
  call `liveClearScene()`.
- Construct `makeLive(rctx)` next to `makeAnnotator(rctx)` (~456) and destructure
  its three methods.

(Exact in-page DOM code: reuse the extracted shell + row template from Step 1;
`append` injects one row node with the existing `[data-gd]` entry transition and
sets the panel to animate height; `recolor`/`update` mutate the row node; `remove`
fades via the same opacity transition the wrap teardown uses.)

- [ ] **Step 6: Run, verify pass** — `cd ~/.claude/plugins/showreel/showreel && node --test scripts/__tests__/integration-render.test.mjs` — expect PASS.

- [ ] **Step 7: Full regression + audit**

```bash
cd ~/.claude/plugins/showreel/showreel && node --test scripts/__tests__/*.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)'
cd ~/.claude/plugins/showreel && PLAYWRIGHT_BROWSERS_PATH=showreel/scripts/.deps/ms-playwright node showreel/scripts/audit-roster.mjs "file://$PWD/assets-src/demo/index.html?gate=fail" assets-src/showcase-steps.json --width 1280 --height 676
```
Expect: green + clean audit.

- [ ] **Step 8: Commit**

```bash
cd ~/.claude/plugins/showreel
git add showreel/scripts/rec-live.mjs showreel/scripts/rec.mjs showreel/scripts/__tests__/integration-render.test.mjs
git commit -m "feat(live): glossary live element — create/append/recolor/remove + scene clear (phase 2)"
```

---

## Phase 3 — Fan out to the other stateful elements

Glossary proved the engine. Each remaining stateful element is now a SMALL,
independent adapter task reusing the proven engine: note, modal, progress, marks.
Do them one task each; each gets its own per-element integration test mirroring the
glossary one (create → mutate with a different color → assert both states coexist →
scene boundary clears).

### Task 3.1: `note` live adapter
**Files:** Modify `rec-live.mjs` (note adapter), `rec-annotate.mjs` (extract note shell if needed). Test: add `live note` case to `integration-render.test.mjs`.
- [ ] Write failing per-element integration test (create note with id, `update` its text mid-scene, assert the new text's ink color is present and the panel did not blink — assert the container node identity is stable by tagging it `data-live="note"` and checking only one exists).
- [ ] Run, verify fail.
- [ ] Implement the note adapter (`createContainer` = the note card shell; `renderPart` = the note body; `update`/`recolor`/`replace`/`remove` supported; `append` for note = append a paragraph).
- [ ] Run, verify pass.
- [ ] Full suite + audit green.
- [ ] Commit: `feat(live): note live adapter (phase 3)`

### Task 3.2: `progress` live adapter
**Files:** Modify `rec-live.mjs`, `rec-annotate.mjs` (progress is `applyProgress`). Test: integration case.
- [ ] Write failing test: create progress at 30% with id, `update` to 80% via `{live:{update:{value:80}}}` (note: progress state is `{value,color}` not rows — `applyState` already handles `replace`/`recolor`; extend `applyState` to honor a top-level `value` on `update` when the entry has no rows). Assert the bar visibly widened (more colored pixels in the bar region in the later frame than the earlier — extract two frames).
- [ ] Run, verify fail.
- [ ] Implement: extend `applyState` so `update` without `item` merges scalar fields (`value`, `color`) into `state`; add the progress adapter.
- [ ] Add a unit test in `rec-live.test.mjs` for the scalar-update branch.
- [ ] Run, verify pass. Full suite + audit green.
- [ ] Commit: `feat(live): progress live adapter + scalar update (phase 3)`

### Task 3.3: `marks` live adapter
**Files:** Modify `rec-live.mjs`, `rec-annotate.mjs` (marks build, ~424-440). Test: integration case.
- [ ] Write failing test: create marks with id (one pin), `append` a second pin on a different selector with a different color, assert both pins present in the same final frame.
- [ ] Run, verify fail.
- [ ] Implement marks adapter (`renderPart` = one numbered pin on a selector; append adds a pin; the registry `state.rows` holds pin specs).
- [ ] Run, verify pass. Full suite + audit green.
- [ ] Commit: `feat(live): marks live adapter (phase 3)`

### Task 3.4: `modal` live adapter
**Files:** Modify `rec-live.mjs`, `rec-annotate.mjs` (modal build). Test: integration case.
- [ ] Write failing test: create modal with id, `replace` its body mid-scene keeping the same card, assert the new body text color is present and exactly one modal node exists (no double-card).
- [ ] Run, verify fail.
- [ ] Implement modal adapter (`replace`/`update`/`recolor`/`remove`; `append` = append a paragraph to the body).
- [ ] Run, verify pass. Full suite + audit green.
- [ ] Commit: `feat(live): modal live adapter (phase 3)`

---

## Phase 4 — Docs, cookbook, showcase, release readiness

### Task 4.1: Document live elements in the cookbook
**Files:** Modify `showreel/skills/showreel/references/rec-cookbook.md`.
- [ ] Add a "LIVE ELEMENTS" section: the `id` birth rule, the `live` op verbs, the per-item `color`, the scene-clear rule, and one worked glossary-grows example. Note ephemeral primitives reject `id`.
- [ ] Commit: `docs(cookbook): live elements section`

### Task 4.2: Add a live-elements beat to the showcase roster
**Files:** Modify `assets-src/showcase-steps.json`.
- [ ] Add a short scene: a glossary that grows two rows (different colors), then clears on the next scene. Keep total runtime within the existing budget.
- [ ] Run the roster audit (`?gate=fail`) — expect clean.
- [ ] Commit: `feat(showcase): live glossary beat`

### Task 4.3: Final verification sweep
- [ ] Full suite: `cd ~/.claude/plugins/showreel/showreel && node --test scripts/__tests__/*.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)'` — 0 fail.
- [ ] Roster audit `--strict` exit 0.
- [ ] Every touched module imports clean (`node -e import` per module).
- [ ] Lint: `node -c` on every touched `.mjs`.
- [ ] Commit any cleanup; do NOT push without the user's say-so.

---

## Self-review notes (filled by author)

- **Spec coverage:** generic engine (Phase 1), apply-to-all-stateful (Phase 2 glossary + Phase 3 note/progress/marks/modal), hybrid id (Task 0.1 + resolveTarget), scene lifetime (liveClearScene wiring), 5 ops (applyState + adapters), per-item color (row spec carries color), ephemeral-rejected (Task 0.1), intensive tests (unit Phases 0-1 + per-element integration Phase 3). All covered.
- **No placeholders:** validation + registry code is complete and literal. The in-page DOM glue in Task 2.1 Step 5 references the extracted template from Step 1 rather than re-pasting the full HTML — that is a deliberate DRY pointer to code created earlier in the same task, not a placeholder.
- **Type consistency:** registry entry shape `{id,type,root,state}`, `state.rows` for list-like elements, `state.value/color` for progress; `resolveTarget` returns `{target,id,reason}`; ops are the five `LIVE_OPS` verbs everywhere.
