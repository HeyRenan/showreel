// autoplace.mjs — deterministic annotation layout. PURE: no browser, no I/O.
//
// Given a target rect (from the DOM, pixel-exact), the neighbor rects it must
// not cover, and the viewport, decide WHERE the callout box and its arrow go so
// that:
//   - the green marker rect == the target (always correct, never guessed)
//   - the callout sits in PROVEN-FREE space (no neighbor overlap, no off-screen)
//   - the arrow links the callout to the target center
// If nothing fits, return { error:'NO_SPACE' } instead of a bad layout. This is
// what removes the AI's coordinate-guessing + correction loop.
//
// All coords are CSS pixels, ints. place() is exported pure for unit tests.

const GAP = 12; // min gap between callout and target / viewport edge
const MAX_SLIDE = 280; // max offset from the preferred alignment when sliding —
// beyond this the box reads as unrelated and the arrow crosses the screen

function rectsIntersect(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function insideViewport(r, vp) {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h;
}

function clampToViewport(r, vp) {
  let x = r.x, y = r.y;
  if (x < GAP) x = GAP;
  if (y < GAP) y = GAP;
  if (x + r.w > vp.w - GAP) x = vp.w - GAP - r.w;
  if (y + r.h > vp.h - GAP) y = vp.h - GAP - r.h;
  return { x: Math.round(x), y: Math.round(y), w: r.w, h: r.h };
}

// Base callout position next to a side of the target. align 'center' centers
// it on the target; 'start' lines it up with the target's leading edge.
function sideBase(side, t, c, gap, align) {
  const ax = align === 'start' ? t.x : t.x + t.w / 2 - c.w / 2;
  const ay = align === 'start' ? t.y : t.y + t.h / 2 - c.h / 2;
  if (side === 'below') return { x: ax, y: t.y + t.h + gap };
  if (side === 'above') return { x: ax, y: t.y - gap - c.h };
  if (side === 'right') return { x: t.x + t.w + gap, y: ay };
  return { x: t.x - gap - c.w, y: ay };
}

const isHoriz = (side) => side === 'below' || side === 'above';

function fitsAt(box, vp, obstacles) {
  return insideViewport(box, vp) && !obstacles.some((o) => rectsIntersect(box, o));
}

// Slide the box along the side's free axis (x for above/below, y for left/
// right) to the obstacle-free position nearest the preferred alignment. The
// perpendicular offset stays fixed, so the box always hugs its side.
function slideSide(side, t, c, vp, obstacles, gap, align) {
  const base = sideBase(side, t, c, gap, align);
  const horiz = isHoriz(side);
  const lo = GAP, hi = horiz ? vp.w - c.w - GAP : vp.h - c.h - GAP;
  if (hi < lo) return null;
  const pref = Math.round(Math.max(lo, Math.min(hi, horiz ? base.x : base.y)));
  const mk = (v) => horiz
    ? { x: v, y: Math.round(base.y), w: c.w, h: c.h }
    : { x: Math.round(base.x), y: v, w: c.w, h: c.h };
  const cands = [pref];
  for (const o of obstacles) {
    const v1 = Math.round((horiz ? o.x - c.w : o.y - c.h) - gap);
    const v2 = Math.round((horiz ? o.x + o.w : o.y + o.h) + gap);
    if (v1 >= lo && v1 <= hi) cands.push(v1);
    if (v2 >= lo && v2 <= hi) cands.push(v2);
  }
  const seen = new Set();
  const ordered = cands
    .filter((v) => Math.abs(v - pref) <= MAX_SLIDE && !seen.has(v) && seen.add(v))
    .sort((a, b) => Math.abs(a - pref) - Math.abs(b - pref));
  for (const v of ordered) {
    const box = mk(v);
    if (fitsAt(box, vp, obstacles)) return box;
  }
  return null;
}

// Arrow from the callout edge nearest the target, ending just inside the
// target's NEAR edge (not its center): on wide/tall targets a center anchor
// drags the shaft across the element's own text.
function arrowFor(callout, target) {
  const tcx = target.x + target.w / 2;
  const tcy = target.y + target.h / 2;
  const ccx = callout.x + callout.w / 2;
  const ccy = callout.y + callout.h / 2;
  let sx = ccx, sy = ccy, ex, ey;
  const dx = tcx - ccx, dy = tcy - ccy;
  if (Math.abs(dx) > Math.abs(dy)) {
    sx = dx > 0 ? callout.x + callout.w : callout.x;
    sy = ccy;
    const inset = Math.min(target.w / 2, 28);
    ex = dx > 0 ? target.x + inset : target.x + target.w - inset;
    ey = tcy;
  } else {
    sy = dy > 0 ? callout.y + callout.h : callout.y;
    sx = ccx;
    const inset = Math.min(target.h / 2, 28);
    ey = dy > 0 ? target.y + inset : target.y + target.h - inset;
    ex = tcx;
  }
  return { x1: Math.round(sx), y1: Math.round(sy), x2: Math.round(ex), y2: Math.round(ey) };
}

export function place({ target, neighbors = [], viewport, calloutW = 220, calloutH = 48 }) {
  if (!target || !viewport) throw new Error('place: target and viewport required');
  const vp = { w: viewport.w, h: viewport.h };
  const callout = { w: calloutW, h: calloutH };
  const obstacles = [target, ...neighbors];
  const SIDES = ['below', 'right', 'above', 'left'];
  const result = (box, side) => ({
    rect: { x: target.x, y: target.y, w: target.w, h: target.h },
    callout: { x: box.x, y: box.y, w: box.w, h: box.h, side },
    arrow: arrowFor(box, target),
  });

  // pass 1: centered next to each side (then a viewport-clamped variant)
  for (const side of SIDES) {
    const b0 = sideBase(side, target, callout, GAP, 'center');
    const cand = { x: Math.round(b0.x), y: Math.round(b0.y), w: callout.w, h: callout.h };
    for (const box of [cand, clampToViewport(cand, vp)]) {
      if (fitsAt(box, vp, obstacles)) return result(box, side);
    }
  }
  // pass 2: slide along each side to the nearest obstacle-free position —
  // finds real free space (e.g. beside a heading) before giving up.
  for (const side of SIDES) {
    const box = slideSide(side, target, callout, vp, obstacles, GAP, 'center');
    if (box) return result(box, side);
  }

  // Fallback: no neighbor-free side fits (common on full-width real-page
  // elements). Don't fling a callout to a far corner with a screen-crossing
  // arrow — instead place the LABEL INSIDE a corner of the target, no arrow.
  // Clean, always legible, never crosses anything. Only the rect + an inside
  // label. NO_SPACE only when the target itself is too small to hold a label.
  const inside = labelInsideTarget(target, callout);
  if (inside) {
    return {
      rect: { x: target.x, y: target.y, w: target.w, h: target.h },
      callout: { x: inside.x, y: inside.y, w: inside.w, h: inside.h, side: 'inside' },
      arrow: null,
      mode: 'inside',
    };
  }
  return { error: 'NO_SPACE' };
}

// Place the label inside a corner of the target. Prefer top-left; if the target
// is too short/narrow to hold the label with padding, return null.
function labelInsideTarget(target, callout) {
  const m = 10; // inset margin from the target edge
  const w = Math.min(callout.w, target.w - m * 2);
  const h = Math.min(callout.h, target.h - m * 2);
  if (w < 80 || h < 24) return null; // too small to hold a readable label
  return { x: target.x + m, y: target.y + m, w, h };
}

// Pill placed OUTSIDE the target so it never covers the target's own text:
// above when it fits, else below, else beside; inside (clamped to the
// target's top-left corner) only as a last resort. Pass `neighbors` (e.g.
// text-bearing rects) and the pill also dodges page text: clean sides first,
// then slid positions, then text-blind geometry, then inside.
export function pillOutside({ target: t, viewport, w, h, gap = 10, neighbors = [] }) {
  const vp = { w: viewport.w, h: viewport.h };
  const c = { w, h };
  const SIDES = ['above', 'below', 'right', 'left'];
  const withNbrs = [t, ...neighbors];
  const fixedAt = (side, obstacles) => {
    const base = sideBase(side, t, c, gap, 'start');
    const horiz = isHoriz(side);
    const lo = GAP, hi = horiz ? vp.w - w - GAP : vp.h - h - GAP;
    if (hi < lo) return null;
    const v = Math.round(Math.max(lo, Math.min(hi, horiz ? base.x : base.y)));
    const box = horiz
      ? { x: v, y: Math.round(base.y), w, h }
      : { x: Math.round(base.x), y: v, w, h };
    return fitsAt(box, vp, obstacles) ? box : null;
  };
  for (const side of SIDES) {
    const b = fixedAt(side, withNbrs);
    if (b) return { x: b.x, y: b.y, side };
  }
  for (const side of SIDES) {
    const b = slideSide(side, t, c, vp, withNbrs, gap, 'start');
    if (b) return { x: b.x, y: b.y, side };
  }
  for (const side of SIDES) {
    const b = fixedAt(side, [t]);
    if (b) return { x: b.x, y: b.y, side };
  }
  return {
    x: Math.round(Math.max(GAP, Math.min(t.x + 10, vp.w - w - GAP))),
    y: Math.round(Math.max(GAP, Math.min(t.y + 10, vp.h - h - GAP))),
    side: 'inside',
  };
}

// Badge center FULLY outside the target: outside-corner candidates first
// (mirrors rec.mjs), then above/below center. Returns the circle center.
export function badgeOutside({ target: t, viewport: vp, r = 18, gap = 6 }) {
  const d = r + gap;
  const cands = [
    { x: t.x - d, y: t.y - d },
    { x: t.x + t.w + d, y: t.y - d },
    { x: t.x - d, y: t.y + t.h + d },
    { x: t.x + t.w + d, y: t.y + t.h + d },
    { x: t.x + t.w / 2, y: t.y - d },
    { x: t.x + t.w / 2, y: t.y + t.h + d },
  ];
  for (const c of cands) {
    const box = { x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 };
    if (!insideViewport(box, vp)) continue;
    if (rectsIntersect(box, t)) continue;
    return { x: Math.round(c.x), y: Math.round(c.y) };
  }
  return {
    x: Math.round(Math.max(r + GAP, Math.min(cands[0].x, vp.w - r - GAP))),
    y: Math.round(Math.max(r + GAP, Math.min(cands[0].y, vp.h - r - GAP))),
  };
}

// Expand an annotation-extent crop to the SMALLEST ancestor box that fully
// contains it (capped at the viewport), so crops end on element boundaries
// instead of slicing cells mid-text. Ancestors come innermost -> outermost.
// If the chosen ancestor covers more than maxAreaFrac of the viewport — or
// nothing contains the crop — fall back to the full viewport.
export function snapCropToAncestor({ crop, ancestors = [], viewport, maxAreaFrac = 0.92 }) {
  const vp = { x: 0, y: 0, w: viewport.w, h: viewport.h };
  const clip = (r) => {
    const x = Math.max(r.x, 0), y = Math.max(r.y, 0);
    const x2 = Math.min(r.x + r.w, vp.w), y2 = Math.min(r.y + r.h, vp.h);
    return { x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(0, x2 - x)), h: Math.round(Math.max(0, y2 - y)) };
  };
  const contains = (a, b) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
  const want = clip(crop);
  if (want.w < 1 || want.h < 1) return vp;
  for (const anc of ancestors) {
    const box = clip(anc);
    if (box.w < 1 || box.h < 1) continue;
    if (!contains(box, want)) continue;
    if (box.w * box.h > maxAreaFrac * vp.w * vp.h) return vp;
    return box;
  }
  return vp;
}
