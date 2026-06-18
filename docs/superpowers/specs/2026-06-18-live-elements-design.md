# Live Elements — design

## Problem

Today the annotation engine is **stateless per step**. Every annotation step calls
`showAnnotations`, which demotes the previous wrap (`#__ann__` → fade out →
`.remove()`) and rebuilds the whole overlay from scratch (`rec-annotate.mjs:16-33`).
A glossary is reconstructed in full each step from `step.glossary.items`.

So an author cannot *grow* an element across steps. To show a glossary gaining a
row, they must repeat every prior row in each step — and even then the entire
panel cross-fades (it visibly blinks) instead of the new row sliding in while the
old rows hold still.

The user wants **live elements**: an on-screen element that persists between steps
and accepts incremental mutation — append a row (with its own color), update an
item, recolor, remove, or replace its contents — without tearing down and
rebuilding the container.

## Key enabling fact

`safeEval` always runs against the **same live page** (`rec.mjs:430` =
`page.evaluate`). A DOM node left in place **survives** to the next step. Persistence
is therefore a *policy* change, not a new capability — today the engine wipes
deliberately. Live elements stop wiping for the elements that carry state.

## Locked decisions

1. **Generic shared engine**, applied to all stateful elements — not 16 bespoke
   implementations.
2. **Hybrid reference**: implicit by type when exactly one live element exists;
   explicit `id` when several do. (Mirrors the plugin's "weak AI uses bare, strong
   AI passes knobs" philosophy.)
3. **Scene-scoped lifetime**: a live element persists across steps until an explicit
   `remove`, OR a scene boundary (`screen` change / `camera:"out"`) clears all live
   elements. Fluid append within a scene; no carry-over between scenes.
4. **Full op set**: `append`, `update`, `recolor`, `remove`, `replace`.
5. **Intensive tests across every element** that becomes live.

## Scope clarification — which elements become "live"

"Apply to all" splits into two honest classes:

- **Stateful elements** (a persistent container with renderable contents):
  glossary, note, modal, progress, and badge/mark sets. These become live —
  appending/updating/recoloring is meaningful.
- **Ephemeral one-shot animations**: confetti, ripple, flash, shake, pulse,
  kenburns, sparkline, glow, checkmark, typeon, reveal, orbit, countdown, countup,
  trail. These are *events*, not *state* — they fire and dissolve. "Append to a
  confetti" is meaningless. They stay one-shot (YAGNI: forcing them live breaks
  their semantics and adds surface for no use case).

The engine is generic; "live" applies to every element that has renderable state.
That is the faithful reading of "apply to all".

## Architecture

### 1. The live registry (in-page)

A registry lives on the page: `window.__live = { byId: {}, order: [] }`. Each entry:

```
{ id, type, root: <DOM node>, state: <type-specific descriptor> }
```

- `state` for a glossary = `{ rows: [{id, badge, text, color}], title }`
- `state` for a progress = `{ value, color }`
- `state` for marks = `{ pins: [...] }`

The registry survives between `safeEval` calls because it's on `window`.

### 2. `rec-live.mjs` — the generic engine (new module)

Host-side module returning a small API wired into `rctx`, mirroring how
`makeAnnotator`/`makeCamera` are built:

- `live.create(id, type, spec)` — build the container via the type's adapter,
  register it.
- `live.op(id|null, op)` — resolve the target (explicit id, else the sole live
  element of inferred type, else error), then apply one of:
  - `append(part)` — render one new part into the existing container; old parts
    hold still, the new part transitions in. Container reflows smoothly (height
    animates), never fades out.
  - `update({item, ...fields})` — mutate one existing part in place.
  - `recolor({item?, color})` — recolor one part, or the whole element.
  - `replace({...})` — swap all contents, keep the container node (smooth reflow,
    no container fade).
  - `remove()` — fade out + unregister this element only.
- `live.clearScene()` — fade out + unregister **all** live elements (scene boundary).

### 3. Adapters — one per stateful type

Each stateful primitive declares two pure-ish browser functions:

- `createContainer(spec) -> rootNode` — the empty shell (panel chrome, title bar).
- `renderPart(root, part, {transition}) -> partNode` — render/transition ONE part.

The existing draw code is **refactored into these two halves** rather than
rewritten. The generic engine owns lifecycle (registry, reflow, fade); the adapter
owns appearance. One engine, N adapters.

### 4. Author syntax

Container is born **live** when its primitive spec carries an `id`. Per-item
`color` becomes supported (today glossary has one accent per step):

```json
{"glossary":{"id":"feat","title":"Shipped","items":[{"badge":1,"text":"Auth","color":"blue"}]}}
```

A new step key **`live`** carries mutation ops:

```json
{"live":{"append":{"badge":2,"text":"Cache","color":"green"}}}      // sole live element
{"live":{"id":"feat","append":{"badge":3,"text":"CDN","color":"amber"}}}
{"live":{"update":{"item":1,"text":"Auth ✓"}}}
{"live":{"recolor":{"item":2,"color":"red"}}}
{"live":{"replace":{"items":[...]}}}
{"live":{"remove":true}}            // or {"remove":"feat"}
```

`color` accepts the same palette names / hex the rest of the engine uses, run
through the existing `safeAccent` contrast floor so a low-contrast color is lifted
to readable before paint (reuses `rec-annotate.mjs:35-59`).

### 5. Lifecycle wiring (call sites in rec.mjs)

- A step with `id` on its primitive → `live.create` instead of the
  wipe-and-rebuild path.
- A step with `live` key → `live.op`; it does NOT wipe the overlay
  (the per-step `clearAnnotations` at `rec.mjs:873` is skipped when the step is a
  live mutation or when live elements exist for the current scene).
- Scene boundary: `live.clearScene()` is called where the engine already resets —
  on a `screen` change (`rec.mjs:835`) and on `camOut` (`rec.mjs:874`).
- Validation: `STEP_KEYS` gains `live`; `validateSteps` gains a `live`-shape
  validator (op is one of the five, target is optional string, item is an int,
  color is a string) — same hostile-input rigor as every other key, so a bad live
  op is a clean pre-flight error, never a render crash.

## Error handling

- `live.op` on a missing/ambiguous target → clear pre-flight error from
  `validateSteps` where statically detectable; at render time a missing live id is
  a logged no-op (never a crash), consistent with the engine's "annotation never
  throws mid-render" contract.
- `append`/`update` with a bad `item` index → clamped/ignored with a warning, never
  a throw.
- Ephemeral primitives given an `id` → validation rejects with a message naming
  them as one-shot (they cannot be live).

## Testing — intensive, across every live element

1. **Pure validation (unit, hostile):** every `live` op shape fed null/number/
   array/empty/out-of-range/unknown-op — must return a clean verdict, never throw.
   Ephemeral-with-id rejected. Added to `edge-cases.test.mjs` style.
2. **Registry logic (unit):** create/op/remove/clearScene state transitions on a
   stubbed registry (no browser) — resolve-by-id, resolve-sole-by-type, ambiguity
   error, scene-clear empties the registry, remove drops one.
3. **Per-element integration (real render):** for EACH live type (glossary, note,
   modal, progress, marks), a mini reel that: creates it, appends with a different
   color, updates an item, recolors, then a scene boundary — extract frames,
   pixel-assert that (a) the appended row's color is present, (b) prior content is
   still present in the SAME frame (proving no rebuild), (c) after the scene
   boundary the element is gone. Differential, in the integration-render harness.
4. **Regression:** the full existing suite (491 tests) stays green; the showcase
   roster audit stays clean.

## Out of scope (YAGNI)

- Making ephemeral animations live.
- Cross-scene persistence.
- Animating individual item reordering (only append/update/recolor/replace/remove).
- A timeline/diff UI — ops are explicit per step.
