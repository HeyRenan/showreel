# Motion Design for Showreel — best practices + ready presets

How to make a recording read as *designed*, not dumped. Every rule maps to a real
`rec.mjs` step key. The cinematic-grammar.md covers shot/camera/pacing at the
scene level; THIS file covers the motion-design craft inside and across beats —
easing, stagger, compositing, color, kinetic text — plus copy-paste presets.

Sources distilled: NN/g (reading), Apple HIG motion, Material 3 motion, Disney's
12 principles, kinetic-typography practice, SaaS demo editing (Figma Config /
Slack as references — interface does the talking, brisk, ≤2min, no fluff).

---

## 1. The non-negotiables

1. **Never linear.** Every move eases. The motor already eases glide/camera; your
   job is to never fake motion with instant jumps. Entrances ease-out (fast→slow,
   land soft), transitions ease-in-out, exits ease-in.
2. **One focal point per beat.** A note, a badge, a loupe, a click are FOUR beats.
   Stagger them; never fire together. Animating everything at once flattens
   hierarchy and creates cognitive overload.
3. **Stillness is emphasis.** The strongest moment is when motion STOPS. Hold the
   hero frame ~1s of pure stillness before the closing card. Contrast = punctuation.
4. **Reading-time dwell.** Any on-screen text holds ≥ 4.5s, +0.3s per word past 12.
   Cutting text early to "look fast" is the #1 amateur tell.
5. **Restraint beats richness.** Compositing (below) means *layering with intent*,
   not piling effects. If a beat has 4 things moving and you can't name the single
   focal point, it's noise.

## 2. Timing & easing numbers (use these)

| Motion | Duration | Easing | Step keys |
|---|---|---|---|
| Cursor glide | ~650ms | ease-out | `glide` (motor-driven) |
| Click ripple breathe | ~800ms | — | fires on `click`; let it land before the next beat |
| Note / badge reveal (rhythm) | 150–250ms | ease-out | `fade` 150–250 |
| Scene change | 300–500ms | ease-in-out | `fade` 300–500 |
| Act break / closing card (gravitas) | 600–1000ms | ease-in-out | `fade` 600–1000 |
| Camera push-in/out | motor eased | slow-in/slow-out | `camera` |
| Per-character typing | 40–80ms/char | human cadence | `fill` + `delay` 40–80 |
| Badge stagger (sequential reveal) | 280–400ms apart | reading order | `stagger` |

**Two-level easing for staggered reveals (marks/glossary):** the *whole* reveal
arc eases (recipe level) AND the gap between items is the stagger (selector level).
Narrow stagger (~150ms) = items mostly together; wide (~400ms) = counted one by
one. Use wide for teaching, narrow for a quick group flash.

## 3. Compositing — layering tools per beat (the part most demos miss)

Compositing = more than one tool active in ONE beat, staggered so the eye is led.
The motor lets several annotations coexist; the craft is ordering their reveal.

**Legal stacks (focal point stays singular):**
- **Camera + rect + note+arrow** — frame in, box the target, label it. Classic.
  The camera move motivates; the box + arrow resolve attention. (push-in → 0.5s
  settle → rect fades in → note+arrow 200ms later.)
- **Camera + marks + glossary** — frame a cluster, sub-badge each item in numeric
  order (`stagger`), the corner glossary entry appears WITH its badge. A map builds.
- **Spotlight + accent + note** — dim all but one, the lit element wears the scene
  accent, the note explains. Focus + color + words, one subject.
- **Blur + redact + badge** (privacy beat) — mask two ways on the same screen,
  badge points to which is which. Shows two tools solving one job.
- **Camera-follow + ripple + note** — the journey IS the message; cursor travels,
  ripple marks the click, note names the result. Release into a frame-in.

**Illegal stacks (kill them):**
- Two notes in one beat. Two saturated accents in a teaching beat. A loupe AND a
  camera zoom on the same region (redundant magnification). Marks nested in marks.
- Any beat where removing one layer loses nothing — that layer was decoration.

**Stagger rule for a stack:** never reveal the layers simultaneously. Order them
focal→supporting, 300–500ms apart. Camera move first (it's the "why"), then the
mark (the "what"), then the words (the "so what").

## 4. Color — the signature system

- **One accent per scene/topic**, consistent across ALL that scene's artifacts:
  frame highlight, pill, badge, glossary entry, ripple tint. Set with `accent`
  (per-step) or `--accent` (whole take default). The accent IS the scene's identity.
- **Rotate a 3–5 hue palette across sequential topics** so a final glossary reads
  as a color-coded map. Each hue keeps ONE meaning — never reuse topic 1's blue
  for topic 4's unrelated idea.
- **Suggested palette** (high contrast on dark UI): `#3b82f6` blue (metrics) ·
  `#f59e0b` amber (services) · `#ef4444` red (privacy/danger) · `#22c55e` green
  (success/ship) · `#a855f7` purple (AI/extra). Pick per topic, keep it consistent.
- **Multi-color at once = celebration ONLY.** A color-flash recap or finale may
  fire the whole palette. Any instructional beat = one accent + neutrals.
- **Contrast adapts to region** — the motor auto-themes neutrals light-on-dark /
  dark-on-light; for a manual accent, make sure it pops against the actual area.

## 5. Kinetic text (modals, notes, glossary)

- **≤ 12 words per note.** A note that restates visible UI text is noise — say the
  *why*, not the *what*.
- **Reveal by fade/slide, never spin.** The motor fades; don't fight it.
- **Modal cards = scene-break punctuation only.** Centered modal = chapter title /
  verdict / intro / outro. Anchored card = in-scene aside. NEVER a modal mid-flow.
- **Pace reveals to reading.** A staggered glossary at ~300ms/item lets each line
  land before the next — matches how people actually read (~20% of on-screen text).

## 6. The arc (hook → build → climax → resolution)

- **Hook (0:00–0:10):** show the payoff or core promise FIRST — the end-state
  (e.g. the one-click deploy landing "live"), or a fast brand title push-in. Earn
  the next 90 seconds in the first 10.
- **Build (0:10–~70%):** topic scenes, 6–12s each, moderate tempo. First time a
  pattern appears: full treatment (establish → frame-in → annotate → dwell ≥4.5s).
  Repeats run ~60% duration, fewer annotations.
- **Climax (~70–85%):** ONE beat, the biggest payoff — densest compositing,
  boldest framing, strongest accent. Exactly one.
- **Resolution (last ~15%):** pull to wide, recap (glossary/montage of accents),
  closing modal card, slow fade. Tempo drops. End on stillness or the card —
  never while zoomed in.
- **Alternate motion and rest.** Never two motion-heavy scenes back to back, never
  two static. Motion without rest is unreadable; rest without motion is dead air.
- **Montage ramp for repeats/finale:** start normal, each cut ~70–80% of the prior
  duration (exponential speedup), optional color-flash rhythm, then a HARD STOP —
  one full beat (~1s) of stillness before the closing card.

## 7. Presets — copy, swap selectors

### Preset A — Hook (brand + payoff push-in)
```json
[
 {"modal":"Showreel","note":"Documentation that moves","fade":700,"wait":1600},
 {"scrollTo":"#deploy","camera":{"sel":"#deploy","zoom":1.5},"click":"#deploy","follow":1.4,"accent":"#22c55e","note":"One click, shipped","arrow":true,"wait":1800},
 {"camera":"out","wait":700}
]
```

### Preset B — Metrics scene (camera + marks + glossary, blue)
```json
[
 {"scrollTo":".stats","camera":{"sel":".stats","zoom":1.3},"accent":"#3b82f6","note":"The numbers that matter","arrow":true,"wait":1300},
 {"marks":[{"sel":".stat:nth-child(1)","text":"Uptime"},{"sel":".stat:nth-child(2)","text":"Latency"},{"sel":".stat:nth-child(3)","text":"Deploys"}],"stagger":340,"glossary":{"items":[{"badge":"1","text":"Uptime"},{"badge":"2","text":"p95 latency"},{"badge":"3","text":"Deploys"}],"title":"Metrics","pos":"top-left"},"wait":2600},
 {"inset":{"sel":".stat:first-child .delta","zoom":3},"note":"Loupe the fine print","arrow":true,"wait":2000},
 {"camera":"out","wait":800}
]
```

### Preset C — Focus scene (spotlight + accent + note, amber)
```json
[
 {"scrollTo":".cards","camera":{"sel":".cards","zoom":1.15},"accent":"#f59e0b","wait":1200},
 {"spotlight":".card:first-child","note":"Dim everything but one","fade":300,"wait":1700},
 {"camera":"out","wait":700}
]
```

### Preset D — Privacy beat (blur + redact + badge, red)
```json
[
 {"scrollTo":".email","accent":"#ef4444","blur":".email","badge":1,"note":"Pixelate sensitive data","arrow":true,"wait":1600},
 {"redact":".email","badge":2,"note":"Or a hard solid bar","arrow":true,"wait":1700}
]
```

### Preset E — Flow + climax (follow + fill + select, green)
```json
[
 {"click":"#invite","accent":"#22c55e","note":"Drive a real flow","arrow":true,"screen":"Team","wait":1100},
 {"camera":{"sel":".invite","zoom":1.2},"fill":"#iname","text":"Dana Lima","delay":70,"note":"Typed, character by character","arrow":true,"wait":900},
 {"select":"#region","option":"São Paulo","note":"Pick from a dropdown","arrow":true,"wait":1200},
 {"camera":"out","wait":600},
 {"click":"#deploy","follow":1.5,"note":"One click ships it","arrow":true,"wait":1500}
]
```

### Preset F — Resolution (pull-out + closing card, slow)
```json
[
 {"camera":"out","wait":500},
 {"modal":"That is Showreel.","fade":800,"wait":2600}
]
```

**Compose the full reel:** concatenate the scenes in arc order (Hook → B → C → D →
E → F), one accent per scene, alternate the motion-heavy (E, hook) with calmer
(C, F). Record realtime at `--fps 30` for smooth cinematic motion (offline's 15fps
is for stills/dwell, NOT a moving showreel). `speed` is offline-only — show it in
its own short clip, not the realtime reel.

## 8. Pre-flight (run before recording a showcase)
1. First scene = wide establishing or brand hook. Last = wide / closing card.
2. Hook in first 10s (payoff or promise shown immediately).
3. Exactly one climax, in the final third.
4. Every camera move motivated; every frame-in before its action (≥0.5s settle).
5. Every zoom has a matching zoom-out before a new topic.
6. One accent per scene, consistent across that scene's artifacts; palette rotates.
7. Every text beat dwells ≥4.5s (+0.3s/word past 12), ≤12 words/note.
8. No two consecutive scenes both static or both motion-heavy.
9. Every opened panel/dropdown/modal closed before context changes (state hygiene).
10. Compositing stacks are staggered 300–500ms, focal→supporting; one focal/beat.
11. A held ~1s stillness before the closing card.
12. `--fps 30` realtime; not offline for a moving reel.
