# Cinematic Grammar for Automated Product-Demo Recordings

Rules for an AI that scripts screen recordings. Every rule is generic and binary-checkable.
Vocabulary: a **scene** = one framing + one idea; a **beat** = one attention event inside a scene
(a click, a reveal, a note). Sources are cited as plain URLs.

---

## 1. Shot Grammar

- **Open wide.** The first scene of any demo (and of any new screen/page) is an establishing
  shot: full viewport, no zoom, long enough to register layout and context before any close
  framing. Film grammar uses the wide shot to fix spatial relationships before cutting close
  (https://en.wikipedia.org/wiki/Establishing_shot).
- **Re-establish after disorientation.** After 3+ consecutive framed-in scenes, or after any
  navigation/scroll that changed what's on screen, return to a wide shot before framing in again.
- **Motivation rule: the camera only moves when attention must move.** If the viewer's eye is
  already where it needs to be, hold the frame. Unmotivated movement reads as noise — motion must
  communicate, never decorate (https://developer.apple.com/design/human-interface-guidelines/motion).
- **Push-in = importance.** Frame-in on an element means "this matters now; look here." Use it
  right before an action on that element or right when a result appears there.
- **Pull-out = context or closure.** Zoom-out means "see how this fits the whole" (after a local
  change, show its global effect) or "this chapter is over." End every demo on a wide shot.
- **Hold duration.** A framing holds at minimum: 1.5s for pure UI (no text to read), 4.5s when
  text/notes must be read, and never longer than ~8s without a new beat inside it. Average
  readers cover ~200–250 words/min and actually read ~20% of on-screen text, so on-screen copy
  must be short and dwell generous (https://www.nngroup.com/articles/how-little-do-users-read/).
- **One idea per framing.** If a scene needs the viewer to look at two distant regions, that's
  two scenes (or one camera-follow journey), not one wide ambiguous frame. This is Disney's
  *staging* principle: the key idea must be unmistakable
  (https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation).

## 2. Camera-Follow (chase the cursor)

- **Use follow when the journey IS the message:** long cursor travels (> ~40% of viewport),
  cause→effect paths ("drag from here, drop there", "click here, watch that panel"), and
  multi-stop tours where each stop is brief. The moving frame keeps the actor (cursor) center
  stage, the way a tracking shot follows a character.
- **Do NOT follow for:** short hops (< ~15% of viewport — just glide inside a static frame),
  dense text regions (the background sliding under text is unreadable), or while typing
  (lock the frame on the field; let characters animate, not the camera).
- **Chase feel:** the camera lags the cursor, never leads or hard-locks. Use eased smoothing
  (lerp/critically-damped follow) so the frame accelerates and settles gradually — slow in,
  slow out is what makes motion read as natural
  (https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation). Cap chase speed so the
  background never whips; if the cursor outruns the cap, let it drift toward frame edge rather
  than jerking the camera. Sustained whip-pans risk motion sickness
  (https://developer.apple.com/design/human-interface-guidelines/motion).
- **Always release explicitly.** A follow ends in one of exactly two ways: settle into a
  frame-in on the destination element (the journey arrived somewhere) or zoom-out to wide
  (the journey was the point). Never cut away mid-chase.

## 3. Zoom Semantics — camera zoom vs element loupe

| Question | Camera frame-in | Element loupe |
|---|---|---|
| What it says | "Look HERE now" (attention) | "Inspect THIS detail" (magnify without leaving context) |
| Context kept? | No — surroundings leave frame | Yes — page stays wide, clone inset magnifies |
| Best for | The element the user acts on next; the result of an action | Tiny readouts: badges, counters, icons, diffs, micro-states |
| Interaction during? | Yes — act inside the zoom | No — loupe is read-only inspection |
| Cost | Disorienting if overused | Adds visual clutter; one loupe at a time |

- **Zoom in BEFORE the action, not after.** The viewer must see the click happen, not be
  teleported to its aftermath. Auto-zoom-on-action exists precisely to make demos easier to
  follow on small screens (https://screen.studio/). Sequence: frame-in → micro-dwell (~0.5s)
  → glide → ripple → click → hold for result.
- **Zoom in AFTER only for results** that appear somewhere other than where the action happened
  (toast, sidebar update) — and then it is a new motivated move, not a continuation.
- **Zoom-out timing:** leave a zoom as soon as its idea lands — after result dwell, before the
  next unrelated beat. Never start a new topic while still framed on the old one.
- **Zoom multiplier discipline:** prefer auto-fit on the target; cap manual zoom so at least
  one recognizable landmark (panel edge, header) stays in frame — full-bleed abstract zooms
  break spatial continuity.

## 4. Pacing — the 2-minute curve

- **Shape: hook → build → climax → resolution.**
  - *Hook (0:00–0:10):* show the most impressive end-state or the core promise immediately.
    Viewers expect value in the first seconds; front-load it
    (https://wistia.com/learn/marketing/optimal-video-length).
  - *Build (0:10–1:20):* step-by-step scenes, moderate tempo, scene length 6–12s.
  - *Climax (1:20–1:40):* the biggest payoff beat — densest motion, boldest framing. Exactly
    one climax must exist.
  - *Resolution (1:40–2:00):* pull out, recap glossary/summary, closing card. Tempo slows.
- **Alternate dwell and motion.** Never chain two motion-heavy scenes or two static scenes
  back-to-back. Motion without rest is unreadable; rest without motion is dead air. Engagement
  declines monotonically with runtime, so every static second must earn itself
  (https://wistia.com/learn/marketing/optimal-video-length).
- **Slow down for first-time concepts:** first occurrence of a novel UI pattern gets full
  treatment (establish → frame-in → annotate → dwell ≥ 4.5s).
- **Speed up repeats:** the 2nd+ occurrence of the same pattern runs at ~60% duration, no
  annotations; by the 3rd it can compress into montage.
- **Montage ramp rule:** start at normal speed, accelerate exponentially (each step ~70–80% of
  the previous duration), use color-flash or quick-cut rhythm, then **hard stop** — one full
  beat of stillness (~1s) before the closing card. The contrast of sudden stillness is the
  punctuation; this is *timing* and *exaggeration* applied to editing
  (https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation).

## 5. Annotation Choreography

- **One focal point per beat.** A note, a badge reveal, a loupe, and a click are four beats —
  never simultaneous. Stagger with 300–500ms offsets so the eye is led, not scattered.
- **Stagger reveals top-to-bottom / reading order.** Numbered badges appear in their numeric
  order; the corner glossary entry for badge N appears with (or just after) badge N, never all
  at once.
- **Arrows/leaders only when the spatial relation is not obvious.** If the pill sits adjacent
  to its target, no arrow. Arrows earn their pixels when the label must live far from the
  target (dense UI) or when two elements must be explicitly related.
- **Glossary/legend placement:** corner opposite the action region, never covering the focal
  element, and on the side that matches reading flow exit (bottom-right for LTR closing
  summaries). It persists across beats of one scene, then clears at scene end.
- **Modal cards are scene-break punctuation.** A centered modal card = chapter title or
  verdict. Use at act boundaries (hook→build, build→climax, end). Never mid-flow; it kills
  momentum. Anchored cards (attached to an element) are in-scene commentary, not breaks.
- **Text budget per note:** ≤ 12 words. Dwell ≥ 4.5s for any readable text; add ~0.3s per word
  beyond 12 (derived from ~200 wpm, https://www.nngroup.com/articles/how-little-do-users-read/).
- **Group marks** outline a region when the unit of meaning is a cluster, not an element;
  never nest a group mark inside another visible group mark.

## 6. Transitions & Continuity

- **State hygiene (hard rule):** every panel, menu, dropdown, tooltip, or modal the script
  opened must be closed before the scene/context changes. Leaving UI debris breaks the
  seamless-reality effect that continuity editing exists to protect
  (https://en.wikipedia.org/wiki/Match_cut). Corollaries: clear typed test input you don't
  need, restore scroll position if returning, dismiss toasts before cutting.
- **Match the cut:** when changing scenes, keep the focal subject in a similar frame position
  across the cut where possible — the eye shouldn't have to hunt after a transition.
- **Scroll as transition:** an animated scroll is a motivated camera move — use it to travel
  between vertically separated topics instead of a cut, at constant eased speed, never while
  text must be read. A scroll that ends exactly framing the next subject is the screen-capture
  match cut.
- **Fade durations by purpose:** fast fades (150–250ms) for rhythm inside a scene (notes,
  badges, ripples); medium (300–500ms) for scene changes; slow (600–1000ms) only for gravitas —
  act breaks, the closing card. UI-scale motion lives around 0.2–0.35s; longer means "this is
  ceremonial" (https://developer.apple.com/design/human-interface-guidelines/motion,
  https://m3.material.io/styles/motion/overview).
- **Letterbox bars** are OPTIONAL — use them only when the context strip carries real
  information for the scene (environment, build line, screen name). When used, bring them
  in at an act boundary and let them vanish when the scene moves on; a bar that hangs
  around with nothing to say is noise, not cinema. Most proofs need no bars at all.
- **Blur/hide is continuity too:** sensitive or irrelevant regions stay blurred for their
  entire on-screen life — a region that flickers between blurred and sharp is a continuity error.

## 7. Color & Theme

- **One accent color per step/topic, consistent across all of that step's artifacts** (frame
  highlight, pill, badge, glossary entry, ripple tint). The accent is the scene's signature.
- **Sequential steps may rotate a small palette (3–5 hues)** so the glossary reads as a map,
  but each hue must keep meaning — never reuse step 1's color for step 4's unrelated topic.
- **Multi-color simultaneously = celebration only.** A color-flash montage or final recap may
  fire the whole palette; any instructional beat uses exactly one accent plus neutrals. More
  than one saturated accent in a teaching beat = noise.
- **Contrast adapts to background:** accents must pass contrast against the actual UI region
  they annotate (light/dark areas may need per-region adjustment).

## 8. Primitive Mini-Guide (how to use each feature)

| Primitive | Use when | Avoid when | Key habits |
|---|---|---|---|
| Camera frame-in (auto-fit/zoom×) | Next action or result lives in one region | Viewer hasn't seen the wide layout yet | Zoom before action; keep a landmark in frame |
| Camera-follow-cursor | Long travel, cause→effect journey | Short hops, dense text, typing | Lagged ease; release into frame-in or wide |
| Zoom out / reset | Idea landed; topic change; closure | Mid-action | Always reset before a new unrelated topic |
| Element loupe | Tiny detail must be legible in context | Element will be interacted with | One loupe at a time; read-only |
| Cursor glide | Every pointer travel | — | Eased, smooth; ~650ms typical; never teleport (https://screen.studio/) |
| Click ripple | Every click | Decorative pulses with no click | Fire at target before click; let it breathe (~0.8s) |
| Typed input (char-by-char) | Showing real data entry | Long strings (>~25 chars: type a prefix, paste rest) | Frame locked on the field; human-ish cadence |
| Fake select dropdown | Native select is unrecordable/ugly | Real dropdown renders fine | Match UI theme; close it afterward (state hygiene) |
| Notes/pills + arrows | Labeling a focal element | Label restates visible text | ≤12 words; arrow only if relation non-obvious |
| Numbered badges + glossary | 3+ related points in one frame | Single point (use one pill) | Stagger in numeric order; glossary in opposite corner |
| Group marks | Meaning lives in a cluster | Overlaps another group | One level deep only |
| Modal card (anchored/centered) | Chapter break, verdict, intro/outro | Mid-flow commentary | Centered = scene break; anchored = in-scene aside |
| Letterbox bars | A scene whose context strip informs | Default-on forever | Optional; appear and vanish at act boundaries |
| Screen-context pill | Viewer may not know which screen this is | Context obvious from establishing shot | Update on every navigation; keep position fixed |
| Blur/hide | Secrets, irrelevant noisy regions | Hiding things the demo references later | Blur for the region's whole screen life |
| Per-step accent color | Always — one per step | Multiple accents in one teaching beat | Consistent across all step artifacts |
| Per-step fade duration | Rhythm control | Slow fades on minor beats | Fast=rhythm, medium=scene, slow=gravitas |
| Reading-time dwell | Any on-screen text | Cutting early because "it looks slow" | ≥4.5s; +0.3s/word past 12 |
| Scroll animation | Vertical topic travel; reveal below fold | While text must be read | Eased, ends framing next subject |
| Color-flash montage | Repeats compression; celebratory recap | First-time concepts | Exponential speedup; hard stop before close |

## 9. Pre-Flight Checklist (binary, run over the step-script before recording)

1. First scene is a wide establishing shot of the starting screen.
2. Last scene is a wide shot or closing modal card (no ending while zoomed in).
3. Every camera move is motivated by an attention shift (no move without a new beat).
4. Every frame-in happens BEFORE its action, with ≥0.5s settle before the click.
5. Every zoom has a matching zoom-out/reset before the next unrelated topic.
6. No camera-follow segment covers a travel shorter than ~15% of the viewport.
7. Every camera-follow ends in an explicit release (frame-in or wide), never a cut.
8. Every panel/menu/dropdown/modal opened by the script is closed before context changes.
9. No toast, tooltip, or test input remains visible across a scene boundary.
10. Every text-bearing beat dwells ≥ 4.5s (+0.3s per word past 12).
11. No two consecutive scenes are both static; no two are both motion-heavy.
12. Exactly one climax beat exists, in the final third before resolution.
13. The first 10 seconds show the core payoff or promise (hook present).
14. Repeated patterns after first occurrence run compressed and unannotated.
15. Any montage accelerates monotonically and hard-stops ≥1s before the closing card.
16. Each beat has exactly one focal point; simultaneous reveals are staggered ≥300ms.
17. Badges reveal in numeric order; each glossary entry appears with its badge.
18. Arrows exist only where target–label adjacency is broken.
19. Each step uses exactly one accent color, consistent across its artifacts; multi-color
    appears only in montage/celebration beats.
20. Blurred regions stay blurred for their entire on-screen life.

## Sources

- https://screen.studio/ — auto-zoom on action and smooth cursor glide rationale
- https://developer.apple.com/design/human-interface-guidelines/motion — purposeful motion, durations, motion sickness
- https://m3.material.io/styles/motion/overview — motion duration/easing canon
- https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation — staging, slow in/out, timing, exaggeration
- https://en.wikipedia.org/wiki/Establishing_shot — wide-shot grammar
- https://en.wikipedia.org/wiki/Match_cut — continuity editing, seamless reality effect
- https://www.nngroup.com/articles/how-little-do-users-read/ — reading speed and read-percentage data
- https://wistia.com/learn/marketing/optimal-video-length — engagement vs length, front-loading value
