# Annotated Screencast Direction — recipes for explaining software on screen

This file directs cursor, camera, and on-screen signaling so a viewer who is
**watching, not driving** understands a software feature faster and trusts it
more. It is NOT motion art, NOT a title sequence, NOT decoration. Every block
below makes the SOFTWARE clearer. Each rule is a number or a copy-paste step.

**You are a low-capability executor.** Do not weigh tradeoffs. Do not infer
intent. Do not improvise numbers. MATCH a row in a table, COPY the block, SWAP
only the marked tokens. If a step needs a judgment call, you will get it wrong —
so there are no judgment calls here, only counts and fixed values.

Grammar, render mode, and anchoring gates live in `rec-cookbook.md`. This file
assumes those pass. Scene-level shot order lives in `cinematic-grammar.md`.

---

## 0. THE PROCEDURE — do this top to bottom, never skip a step

1. Write **one establishing step** first (Preset A or a bare `screen` pill). Full
   page, no `camera` key. `wait: 1200`.
2. For each feature, copy **the canonical feature beat** (Section 3) and swap
   selectors + note text.
3. Run the **counting check** (Section 1) on every step: ≤1 marker and ≤1 note
   (a marker may carry its note; `camera` goes alone). Split extra markers out.
4. Set every `wait` from the **number table** (Section 4). Never invent one.
5. Write **one closing step** (Preset H). Camera on the result, longest `wait`,
   no action after it.
6. Assign **one accent per scene** from the fixed list (Section 5).
7. Run the **final checklist** (Section 9). Every line must be true.

---

## 1. ONE-FOCAL-POINT — a counting rule, not a feeling

A step reveals everything on it **at the same instant**. To show things in order,
put them on **consecutive steps**. This is the only way to sequence.

**THE COUNT.** A step may show ONE marker plus its ONE label. Count two buckets:

```
MARKERS (max 1):  camera   marks   spotlight   blur   redact   highlight   rect   circle   badge
LABEL  (max 1):   note     (its arrow rides free — arrow never counts)
```

- **≤ 1 MARKER and ≤ 1 note** → legal. A note is the LABEL for that one marker
  (point + explain = one signaling act, per Mayer). Example legal step:
  `{ "rect": "#toast", "note": "Invite sent", "wait": 1500 }` — one marker, its label.
- **2+ markers on one step** → ILLEGAL. Move each extra marker to its own step.
- `camera` is a marker: a `camera` frame-in goes on its OWN step (no other marker,
  no note) — frame first, reveal next step. A `note` MAY ride a `click` (label the
  action) or a non-camera marker, never a `camera` step.
- `marks` + `glossary` + `stagger` = ONE marker (the one way to reveal an ordered
  set on a single frame).
- `glide`, `click`, `fill`, `text`, `select`, `option`, `wait`, `screen`, `accent`,
  `topbar`, `bottombar`, `arrow` do **not** count.

> TWO MARKERS? MAKE TWO STEPS. A marker plus its own note is fine — that is one cue.

---

## 2. DECISION TABLE — match what you are explaining, copy that preset

| IF you are explaining…                       | USE      | Block (Section 6/3) |
|----------------------------------------------|----------|---------------------|
| What this whole screen/app is (the opener)   | Preset A | establishing pill   |
| A single fact about one element              | Preset C → just the `highlight`+`note` step | one cue |
| A group of items that must be read in order  | Preset C | metrics marks+glossary |
| One tiny detail / unreadable fine print      | Preset D | spotlight (or `inset`) |
| Hiding sensitive data on screen              | Preset E | blur + redact       |
| Filling a form and submitting it             | Preset F | full form → result  |
| A click and the result it causes             | Section 3 | canonical beat      |
| Navigating through a menu/drawer             | Preset B | open + walk + close |
| A cursor journey across the page (3+ stops)  | Preset G | follow chase + out  |
| A closing summary of the outcome             | Preset H | closing frame       |
| Show the outcome first, then the how (opt.)  | Preset I | end-state-first opener (OPTIONAL) |

Match exactly one row. Copy that block. Swap only the marked tokens.

---

## 3. THE CANONICAL FEATURE BEAT — the 6-step skeleton

Every feature is this. Frame → aim → type → act → result → release. Repeat per
feature. Open with Preset A, close with Preset H.

```json
{ "camera": { "sel": "#region", "zoom": 2 }, "wait": 1300 },
{ "glide": "#control", "wait": 400 },
{ "fill": "#control", "text": "real value", "delay": 45, "wait": 700 },
{ "click": "#submit", "wait": 800 },
{ "highlight": "#result", "note": "non-obvious effect", "wait": 1500 },
{ "camera": "out", "wait": 700 }
```

**SWAP ONLY:** `#region`, `#control`, `#submit`, `#result`, the `text` value, the
`note` text. Touch no number.

**WHY each step exists (do not collapse them):**
- Frame on its **own** step BEFORE the action — or the viewer never sees the
  change (change blindness). `wait: 1300` lets the camera settle.
- `glide` before every `click` — the cursor must visibly arrive (`wait: 400`).
- `click` then `wait: 800` — the result must land while the camera is held.
- Result note fires on the step AFTER the click, **same camera**, so the eye does
  not relocate.

---

## 4. THE NUMBER TABLE — one value each, no ranges, no choices

| Concern                                   | EXACT value                          |
|-------------------------------------------|--------------------------------------|
| Camera frame-in before a click            | `wait: 1300`                         |
| Cursor settle after `glide`, before click | `wait: 400`                          |
| Hold after a `click` (result lands)       | `wait: 800`                          |
| Hold after a `fill`                       | `wait: 700`                          |
| Establishing / wide hold                  | `wait: 1200`                         |
| Result / outcome hold (longest in reel)   | `wait: 2500`                         |
| Annotation / new-info hold                | omit `wait` — auto-dwell ≥ 4500 runs |
| Typing speed                              | `delay: 45` (hero value: `delay: 70`)|
| `follow` glide hold per stop              | `wait: 1600`                         |
| Numbered reveal cadence                   | `stagger: 360`                       |
| marks-step total hold                     | `wait: 360 * N + 4500` (table below) |
| Frame a WIDE row (a whole `.stats`/`.cards`/`table`/`form`) | `"camera": ".sel"` — NO zoom number (auto-fit shows every item) |
| Frame ONE small control (a button/input/cell) | `{ "sel": ".sel", "zoom": 2 }` |
| Frame ONE tiny detail (once, then `out`)  | `{ "sel": ".sel", "zoom": 3 }`       |
| Scene-break fade                          | `fade: 700`                          |
| In-scene fade                             | `fade: 200` (or omit — default 400)  |

**marks-step `wait` lookup** (N = number of marks):

| N marks | `wait` value |
|---------|--------------|
| 2       | `5220`       |
| 3       | `5580`       |
| 4       | `5940`       |
| 5       | `6300`       |

Max 5 marks per step. More than 5 → split into a second marks step.

**TEXT DWELL — never undercut it.** Any step with `note`/`modal`/`glossary` is
auto-held to `max(4500, 4500 + (words-8)*250)` ms, capped 12000. Do **not** set a
`wait` lower than that on a text step. Only ADD `wait` for non-text settle.

---

## 5. ACCENT — one per scene, fixed rotation

Set **one** `accent` per scene and keep it on every step of that scene. When the
scene changes (new feature / new camera target), advance to the next color **in
this exact order**:

```
Scene 1: #3b82f6   (blue)
Scene 2: #f59e0b   (amber)
Scene 3: #ef4444   (red)
Scene 4: #22c55e   (green)
Scene 5: #8b5cf6   (violet)
```

After scene 5, loop back to `#3b82f6`. Never use two accents in one scene. Never
pick a hex outside this list.

**WEED everything off-message.** Use `blur` / `hide` / `redact` on off-topic or
sensitive regions. Add **zero** decoration-only keys. A `rect`/`circle`/`badge`
that labels nothing load-bearing = delete the whole step.

**MARKER → TARGET SIZE.** Pick the marker that fits the target's size:
- `highlight` = a SMALL text run / cell / label (`.card h3`, a table cell). NEVER a
  whole panel/row/drawer — a marker swipe over a big dark block reads as nothing.
- `spotlight` / `rect` = a whole element or card (dims-rest / boxes it).
- `circle` = a small round-ish detail (an icon, a bar, a number).
- `inset` = a TINY detail that must stay legible (a delta, a badge) — magnifies it.
- `redact` / `blur` = sensitive data; `hide` = a row/element to remove.
Wrong-size marker is the #1 "this annotation makes no sense" cause.

**BARS ARE DEMO-ONCE.** `topbar`/`bottombar` PERSIST until set `false`. Only keep
them the whole reel if every scene truly needs a context strip. To just SHOW the
feature: one scene sets them, the NEXT step sets both `false`. Never leave them on
the whole video as decoration.

**NOTE TEXT RULE.** A note states the WHY / the non-obvious effect. It NEVER
repeats a visible button label or a value you just typed.
- BANNED: `"note": "Click Save"` over a button labeled Save.
- REQUIRED: `"note": "Saves a draft without publishing"`.
- Keep notes ≤ 8 words.

---

## 6. PRESET BLOCKS — complete, valid, swap only the marked tokens

All presets use the real demo selectors. Every number already obeys Section 4.

### Preset A — establishing opener (always step 1)
```json
{ "screen": "Billing dashboard", "accent": "#3b82f6", "wait": 1200 }
```
SWAP ONLY: the `screen` label.

### Preset B — menu: open + walk + close
```json
{ "camera": { "sel": "#menu", "zoom": 2 }, "accent": "#3b82f6", "wait": 1300 },
{ "glide": "#menu", "wait": 400 },
{ "click": "#menu", "wait": 800 },
{ "highlight": "#drawer", "note": "Every workspace action lives here", "wait": 1500 },
{ "click": "#menu", "wait": 800 },
{ "camera": "out", "wait": 700 }
```
SWAP ONLY: selectors `#menu`/`#drawer`, the `note`.

### Preset C — metrics: camera + marks + stagger + glossary (the ONE legal multi-cue step)
```json
{ "camera": { "sel": ".stats", "zoom": 2 }, "accent": "#f59e0b", "wait": 1300 },
{ "marks": [
    { "sel": ".stat:nth-child(1)", "badge": "1", "text": "Active users today" },
    { "sel": ".stat:nth-child(2)", "badge": "2", "text": "Revenue this month" },
    { "sel": ".stat:nth-child(3)", "badge": "3", "text": "Open tickets" }
  ],
  "glossary": true, "stagger": 360, "wait": 5580 },
{ "camera": "out", "wait": 700 }
```
SWAP ONLY: each mark's `sel` and `text`. `marks` is an array of OBJECTS
`{sel,badge,text}`; `glossary:true` auto-lists every mark's `text`. If you change
the NUMBER of marks, renumber `badge` 1..N and set `wait` to the lookup (3 → `5580`).

### Preset D — focus one tiny detail (spotlight)
```json
{ "camera": { "sel": ".card:nth-child(1)", "zoom": 3 }, "accent": "#ef4444", "wait": 1300 },
{ "spotlight": ".card:nth-child(1)", "note": "Status flips to live on deploy", "wait": 1500 },
{ "camera": "out", "wait": 700 }
```
SWAP ONLY: the `.card:nth-child(1)` selector, the `note`. `zoom: 3` is allowed
here because it is a single tiny target, released by `out` immediately.

### Preset E — privacy: blur + redact + highlight (3 emphasis keys → 3 steps)
```json
{ "camera": { "sel": "table", "zoom": 2 }, "accent": "#ef4444", "wait": 1300 },
{ "blur": "tr:nth-child(2) .email", "wait": 800 },
{ "redact": "tr:nth-child(3) .email", "wait": 800 },
{ "highlight": "tr:nth-child(1) .email", "note": "Only owners see full addresses", "wait": 1500 },
{ "camera": "out", "wait": 700 }
```
SWAP ONLY: the `tr:nth-child(n) .email` selectors, the `note`. Note each emphasis
key is on its **own** step (the counting rule).

### Preset F — FULL form: every field + submit + hold result
```json
{ "camera": { "sel": "#invite", "zoom": 2 }, "accent": "#22c55e", "wait": 1300 },
{ "glide": "#iname", "wait": 400 },
{ "fill": "#iname", "text": "Dana Reyes", "delay": 45, "wait": 700 },
{ "glide": "#iemail", "wait": 400 },
{ "fill": "#iemail", "text": "dana@acme.co", "delay": 70, "wait": 700 },
{ "glide": "#region", "wait": 400 },
{ "select": "#region", "option": "São Paulo", "wait": 700 },
{ "glide": "#invite", "wait": 400 },
{ "click": "#invite", "wait": 800 },
{ "note": "Invite sent — pending until accepted", "rect": "#toast", "wait": 1500 },
{ "camera": "out", "wait": 700 }
```
SWAP ONLY: field selectors, `text` values, the `option` VISIBLE label, the
`note`. Fill EVERY required field. `option` must be the on-screen label
(`São Paulo`), never a value attribute. `delay: 70` on the hero email so it reads.
The result toast is EPHEMERAL (auto-fades) — cue it with `note`+`rect`, NOT
`highlight`/`redact` (those paint a coloured mask that can outlive the toast and
leave a stray box; the script now skips invisible targets, but prefer note+rect).

### Preset G — multi-stop FOLLOW chase + bare camera:out release (needs ≥3 moving steps)
```json
{ "follow": 2, "glide": "#menu", "accent": "#8b5cf6", "wait": 1600 },
{ "glide": ".cards", "wait": 1600 },
{ "glide": "#deploy", "wait": 1600 },
{ "camera": "out", "wait": 700 }
```
SWAP ONLY: the three `glide` selectors. There must be **≥ 3** moving steps before
the release. The bare `{ "camera": "out" }` is what RELEASES follow — never omit
it. `follow` level is `2`.

### Preset H — closing summary frame (always the last steps)
```json
{ "camera": "out", "accent": "#22c55e", "wait": 700 },
{ "modal": "Deployed in four clicks.", "wait": 2500 }
```
SWAP ONLY: the `modal` text (the closing line). The `modal` VALUE IS THE TEXT —
a bare string auto-centers over a dimmed backdrop. There is NO `"centered"`
keyword and NO separate `note` on a modal step. Pull the camera `out` FIRST so
the card is full-frame. `wait: 2500` is the longest hold in the reel. NO
`click`/`glide`/`fill`/`select` after this. The reel ends here.

### Preset I — end-state-first opener (OPTIONAL, only as step 1 if you use it)
```json
{ "modal": "What you'll build.", "wait": 2500 },
{ "scrollTo": ".hero h1", "wait": 1200 }
```
SWAP ONLY: the `modal` text. The `modal` value IS the text (auto-centers over a
dim backdrop). No `"centered"` keyword, no `note`. If you use this, it REPLACES
Preset A as step 1; step 2 scrolls to the start.

---

## 7. ANTI-EXAMPLES — the top failures, WRONG vs RIGHT

**Piling vs splitting** (the #1 failure)
```json
WRONG: { "camera": { "sel": "#region", "zoom": 2 }, "highlight": "#result", "note": "Saved" }
RIGHT: { "camera": { "sel": "#region", "zoom": 2 }, "wait": 1300 },
       { "highlight": "#result", "note": "Saved to your team", "wait": 1500 }
```
WRONG mixes a `camera` frame-in WITH a marker+note on one step. `camera` is a
marker and goes alone; frame first, reveal next step. (A `rect`+`note` together is
fine — one marker + its label — just never with `camera`.)

**Stagger too fast**
```json
WRONG: { "marks": ["#a","#b","#c"], "glossary": ["..","..",".."], "stagger": 300, "wait": 4500 }
RIGHT: { "marks": ["#a","#b","#c"], "glossary": ["..","..",".."], "stagger": 360, "wait": 5580 }
```
`stagger` is always `360`. marks `wait` for N=3 is always `5580`.

**One-step follow (illegal)**
```json
WRONG: { "follow": 2, "glide": "#deploy", "wait": 1600 }, { "camera": "out", "wait": 700 }
RIGHT: { "follow": 2, "glide": "#menu", "wait": 1600 },
       { "glide": ".cards", "wait": 1600 },
       { "glide": "#deploy", "wait": 1600 },
       { "camera": "out", "wait": 700 }
```
Follow needs ≥ 3 moving steps before the bare `camera: out` release.

**Zoom after the click (the result is missed)**
```json
WRONG: { "click": "#invite", "wait": 800 }, { "camera": { "sel": "#toast", "zoom": 2 }, "note": "Sent" }
RIGHT: { "camera": { "sel": "#region", "zoom": 2 }, "wait": 1300 },
       { "click": "#invite", "wait": 800 },
       { "highlight": "#toast", "note": "Sent", "wait": 1500 }
```
Frame BEFORE the click. Reveal the result in the camera that is already held.

---

## 8. MASTERS — pedigree (the one rule, the number each gave us)

| Source | The one rule | Number / block |
|---|---|---|
| Mayer — Signaling | Cue exactly one thing | 1 emphasis key/step (§1) |
| Mayer — Segmenting | One idea per beat, pause between | split across steps; post-click `wait: 800` |
| Mayer — Coherence | Delete what does not explain | 0 decoration keys (§5) |
| Mayer — Redundancy | Don't echo the visible label | note = the WHY, ≤8 words (§5) |
| Mayer — Spatial/Temporal contiguity | Cue with its target, same beat | result note same camera as click (§3) |
| Sweller — Cognitive Load | Zoom to the feature, drop clutter | `zoom: 2` default (§4) |
| van Merriënboer — Worked example | Show before→action→result | canonical 6-step beat (§3) |
| Tversky — Attention guidance | Arrows/cues direct gaze | `note`+`arrow` bridges a gap only |
| Screen Studio | Frame before the click, settle | camera `wait: 1300` (§4) |
| Camtasia / TechSmith | Pause before/after a click | glide `wait: 400`, click `wait: 800` |
| DevRel screencast craft | Smooth single-glide cursor | one `glide` per step; realtime fps30 |
| Material 3 motion | Stagger related reveals | `stagger: 360` (§4) |
| Apple keynote | End on a clear final state | Preset H, `wait: 2500` |
| BBC / NN/g | Hold text to reading speed | auto-dwell ≥ 4500 (§4) |
| Eriksen / Lavie spotlight | Dim all but the target | Preset D `spotlight` |

---

## 9. FINAL CHECKLIST — binary, count it over the JSON

Grammar / render / anchoring gates: see `rec-cookbook.md` (do not re-run here).

- [ ] Step 1 has NO `camera` key (Preset A or I). Full page first.
- [ ] Every step passes the count: ≤ 1 marker AND ≤ 1 note (§1); a marker may carry its note.
- [ ] Every `click` has a `glide` to the same selector on an earlier step.
- [ ] No step has both a `camera` move AND a result reveal (`highlight`/`note`/`badge`).
- [ ] Every result `note` is on the step AFTER its `click`, same camera target.
- [ ] Every `marks` step: `stagger` == `360` AND `wait` == `360*N+4500` (use the lookup).
- [ ] No `marks` step has more than 5 marks.
- [ ] Every camera frame-in step before a click has `wait: 1300`.
- [ ] Any `follow` run has ≥ 3 moving steps and ends with a bare `{ "camera": "out" }`.
- [ ] No `note` repeats a visible label or a typed value; every `note` ≤ 8 words.
- [ ] Exactly one `accent` per scene, from the fixed list, advancing in order.
- [ ] Every required form field is filled before its `click` submit.
- [ ] Every `select` uses the VISIBLE option label, not a value attribute.
- [ ] The last step is the result (Preset H), `wait: 2500`, with NO action after it.
- [ ] No text step has a `wait` below 4500.
- [ ] Moving reel rendered realtime `--fps 30`.
