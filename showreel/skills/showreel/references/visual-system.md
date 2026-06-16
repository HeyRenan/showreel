# Showreel Visual System — the look of every drawn element

The tokens every annotation (modal, note/pill, badge, glossary, spotlight, loupe,
leaders, bars) shares so the output looks like one designed product, not a pile
of canvas primitives. Distilled from current glass/depth practice (Apple iOS 26 /
macOS Tahoe, Material 3) — premium = translucent + soft depth + one accent +
motion on opacity/transform only (60fps).

## Tokens

**Surface (cards: modal, note, glossary, loupe frame)**
- background: `rgba(15,23,42,0.72)` on dark pages / `rgba(255,255,255,0.78)` on light
- backdrop-filter: `blur(14px) saturate(140%)` — frosted, context shows through
- border: `1px solid rgba(255,255,255,0.14)` (dark) — a faint top/left highlight
- top highlight: inset `box-shadow: inset 0 1px 0 rgba(255,255,255,0.18)`
- drop shadow: `0 12px 40px rgba(0,0,0,0.45)` — floats above the page
- border-radius: 16px (cards), 999px (pills/badges)

**Accent (per-scene signature color)**
- the scene accent tints: a 2px left border on cards, the badge fill, the leader
  line, the spotlight ring, the ripple. One accent per scene (see motion-design.md).
- accent glow on the focal element: `box-shadow: 0 0 0 3px <accent>33, 0 8px 24px <accent>22`

**Typography**
- card title: `700 22px/1.2`, content `400 16px/1.5`, footer `500 13px` muted
- letter-spacing on titles: `-0.01em` (tighter = more designed)
- color: `#f8fafc` ink on dark, `#0f172a` on light; muted = 70% opacity

**Motion (ALWAYS opacity + transform only)**
- enter: `opacity 0→1` + `transform: translateY(8px) scale(.98) → none`,
  `.4s cubic-bezier(.22,1,.36,1)` (ease-out, lands soft)
- exit: reverse, `.25s ease-in`
- stagger children (header→content→footer, or badge list) 60–90ms
- never animate width/height/blur (jank) — wipe via `transform: scaleX()`

## Rich modal (header / content / footer + optional HTML)

A modal may be a plain string (title+text) OR a structured card:
```json
{"modal":{"header":"Deploy","html":"<p>Ships the current build to <b>production</b>.</p>","footer":"takes ~40s","pos":"center"}}
```
- **header**: accent-tinted bar, 700 title, optional close-dot decoration
- **content**: sanitized HTML (`<p><b><i><code><ul><li><br>` allowed) for real layout
- **footer**: muted, smaller — meta/hint line
- glass surface + accent left-border + the enter motion above

## Per-element upgrades (apply the tokens)

| Element | Before | After |
|---|---|---|
| modal | flat dark box, hard border | glass card, header/content/footer, enter-motion |
| note/pill | solid pill | glass pill, accent dot, slide-in from target |
| badge | flat circle | accent-fill, white ring, soft drop, pop-scale in |
| glossary | plain list | glass panel, accent title bar, rows stagger in |
| spotlight | dim + ring | dim + accent ring with soft glow pulse |
| loupe | bordered inset | glass frame, accent border, scale-in from source |
| leader line | plain 2px | accent, slight draw-on (dash→solid) |

## Hard rules
- One accent per scene across ALL its elements (card border, badge, leader, ring).
- Glass only on cards/overlays — never the whole frame (perf + readability).
- Blur ≤ 16px. Motion only on opacity/transform.
- Contrast: ink must pass on the actual surface; muted never below 60% on glass.
