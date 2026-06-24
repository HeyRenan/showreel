#!/usr/bin/env node
// prove.mjs — ONE command to produce an annotated proof screenshot.
// The AI passes url + selector + text. It NEVER reads a PNG, writes a coord, or
// fixes a layout. autoplace decides position; vcheck gates the result.
//
//   node prove.mjs <url> "<selector>" out.png --label "menu opens" \
//     [--circle] [--blur "<sel>"] [--zoom] [--width N] [--height N] [--dpr N]
//
// Batch mode — ONE browser launch + ONE page load for N proofs:
//
//   node prove.mjs <url> --batch jobs.json [--width N] [--height N]
//   jobs.json: [{"selector":"...","out":"...","label":"...","circle":true,"blur":"<sel>","zoom":true,"expect":"text or true"}]
//
// Exit: 0 all PASS, 1 any FAIL, 3 any NO_SPACE or selector/runtime ERROR.
// stdout = one verdict line per proof, then a batch summary:
//   PASS <out> kb=<n>          n = output file size in KB (integer)
//   FAIL <out> reason=<short>  short = first failing check:
//     dominance | collision | target-text | empty-output
//   NO_SPACE <out>             target too small to hold a label
//   ERROR <out>                selector not found / runtime failure (see stderr)
//   PROVE <k>/<n> PASS|FAIL    FAIL when k < n (any non-PASS proof)
// Checks per proof, in order: vcheck dominance, annotation collision (placed
// callout/label/zoom must not overlap the target or each other), target text
// present (only when the job sets "expect"), output non-empty.
// Diagnostics -> stderr.

import { writeFileSync, readFileSync, statSync } from 'node:fs';
import { Browser } from '../lib/browser.mjs';
import { place, pillOutside, snapCropToAncestor } from '../lib/autoplace.mjs';
import { visualCheck, DEFAULT_MARKER_HEX } from './annotate.mjs';
import { num, str } from './cli-args.mjs';
import { decodePNG } from './pngread.mjs';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const NEUTRAL = 'neutral'; // engine resolves vs page tone (light on dark, dark on light)

// Byte size of a written output, or 0 when it is missing or unreadable (which
// the caller treats as an empty-output failure).
function outputByteSize(path) {
  try { return statSync(path).size; } catch { return 0; }
}

// Ancestor boxes innermost -> outermost (up to body) for crop snapping.
async function ancestorBoxes(b, selector) {
  return b.page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const out = [];
    let n = el && el.parentElement;
    while (n) {
      const r = n.getBoundingClientRect();
      out.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      if (n === document.body) break;
      n = n.parentElement;
    }
    return out;
  }, selector);
}

// Draw order is load-bearing: blur masks first (so a zoom of a masked region
// stays masked), zoom snapshots the still-unmarked pixels (a green marker
// magnified into the inset would count as green OUTSIDE the target and tank
// vcheck dominance), and only then the green marker goes on. Pure; unit tested.
// The inset is placed before the callout so the callout ladder can treat it as
// an obstacle. Pure given placeFn.
export function placeZoomInset({ t, neighbors = [], textNeighbors = [], viewport, placeFn = place }) {
  const vp = viewport;
  const scale = clamp(Math.min(2.4, (vp.w * 0.6) / t.w, (vp.h * 0.6) / t.h), 1.4, 2.4);
  const insetW = Math.round(t.w * scale), insetH = Math.round(t.h * scale);
  let spot = placeFn({ target: t, neighbors, viewport: vp, calloutW: insetW, calloutH: insetH });
  if (spot.error || spot.mode === 'inside')
    spot = placeFn({ target: t, neighbors: textNeighbors, viewport: vp, calloutW: insetW, calloutH: insetH });
  if (spot.error || spot.mode === 'inside')
    spot = placeFn({ target: t, neighbors: [], viewport: vp, calloutW: insetW, calloutH: insetH });
  const at = (spot.error || spot.mode === 'inside')
    ? { x: clamp(t.x, 12, vp.w - insetW - 12), y: clamp(t.y + t.h + 28, 12, vp.h - insetH - 12) }
    : { x: spot.callout.x, y: spot.callout.y };
  return { at, scale, insetW, insetH };
}

export function buildAnnotations({ t, blurBox, zoom, circle, label, layout, viewport, fontSize, strokeW, calloutW, calloutH, textNbrs = [], placeFn = place }) {
  const annotations = [];
  let insetRect = null;
  if (blurBox) {
    annotations.push({ type: 'blur', x: blurBox.x, y: blurBox.y, w: blurBox.w, h: blurBox.h, px: 16 });
  }
  if (zoom) {
    const spot = zoom.at
      ? zoom
      : placeZoomInset({ t, neighbors: zoom.neighbors || [], textNeighbors: zoom.textNeighbors || [], viewport, placeFn });
    insetRect = { x: spot.at.x, y: spot.at.y, w: spot.insetW, h: spot.insetH };
    annotations.push({ type: 'zoom', x: t.x, y: t.y, w: t.w, h: t.h, scale: spot.scale, color: NEUTRAL, at: spot.at });
  }
  annotations.push({ type: 'rect', x: t.x, y: t.y, w: t.w, h: t.h, color: '#16a34a', width: strokeW });
  if (circle) {
    annotations.push({
      type: 'circle',
      x: t.x + t.w / 2, y: t.y + t.h / 2,
      rx: (t.w / 2) * 1.12 + 12, ry: (t.h / 2) * 1.35 + 12,
      color: '#16a34a', width: strokeW,
    });
  }
  if (label) {
    if (layout.mode === 'inside') {
      // never cover the target's own text: pill goes OUTSIDE (above > below >
      // beside); pillOutside returns inside coords only as a last resort.
      const w = calloutW || (layout.callout && layout.callout.w) || 220;
      const h = calloutH || Math.round(fontSize * 1.3) + 20;
      const at = pillOutside({ target: t, viewport, w, h, neighbors: insetRect ? [...textNbrs, insetRect] : textNbrs });
      annotations.push({ type: 'label', x: at.x, y: at.y, text: label, bg: NEUTRAL, size: fontSize });
    } else {
      annotations.push({
        type: 'callout',
        x: layout.callout.x, y: layout.callout.y, w: layout.callout.w,
        text: label, bg: NEUTRAL, size: fontSize,
        anchorX: layout.arrow.x2, anchorY: layout.arrow.y2,
      });
    }
  }
  return annotations;
}

// Boxes of the freely-placed annotations (zoom inset, callout, label pill) in
// viewport coords. The marker rect/circle/blur intentionally sit on the target
// and are excluded. Pure; unit tested.
export function placedBoxes(annotations, { calloutW = 220, calloutH = 40 } = {}) {
  const out = [];
  if (!Array.isArray(annotations)) return out; // hostile non-array -> no placed boxes
  for (const an of annotations) {
    if (an.type === 'zoom' && an.at) {
      out.push({ name: 'zoom', x: an.at.x, y: an.at.y, w: Math.round(an.w * (an.scale || 2)), h: Math.round(an.h * (an.scale || 2)) });
    } else if (an.type === 'callout') {
      out.push({ name: 'callout', x: an.x, y: an.y, w: an.w || 220, h: calloutH });
    } else if (an.type === 'label') {
      out.push({ name: 'label', x: an.x, y: an.y, w: calloutW, h: calloutH });
    }
  }
  return out;
}

// null when clean; otherwise a short message naming the first overlap. Edge
// contact does not count. Pure; unit tested.
export function checkCollisions(placed, targetRect) {
  if (!Array.isArray(placed)) return null; // nothing placed -> nothing collides
  const hits = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const p of placed) if (hits(p, targetRect)) return p.name + ' overlaps target';
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (hits(placed[i], placed[j])) return placed[i].name + ' overlaps ' + placed[j].name;
    }
  }
  return null;
}

async function targetVisibleText(b, selector) {
  return b.page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return '';
    return (el.innerText || el.textContent || '').trim();
  }, selector);
}

// the zoom inset is drawn at `at` with size w*scale x h*scale — include it in
// the crop window so the magnified panel isn't clipped.
function an_zoomAt(annotations) {
  const z = annotations.find((an) => an.type === 'zoom');
  if (!z || !z.at) return null;
  return { x: z.at.x, y: z.at.y, w: z.w * (z.scale || 2), h: z.h * (z.scale || 2) };
}

// Batch summary + exit policy, pure for testing. `results` is an array of
// per-proof verdicts ('PASS' | 'FAIL' | 'NO_SPACE' | 'ERROR'). The summary line
// says PASS only when every proof passed; any non-PASS makes it FAIL. Exit code:
// 3 if any ERROR/NO_SPACE (input problem — wrong selector, target too small),
// 1 if any FAIL (placement failed), 0 only when all passed.
export function summarize(results) {
  if (!Array.isArray(results)) results = []; // hostile non-array -> empty run, clean FAIL
  const total = results.length;
  const passed = results.filter((r) => r === 'PASS').length;
  const verdict = total > 0 && passed === total ? 'PASS' : 'FAIL';
  let exitCode = 0;
  if (results.includes('ERROR') || results.includes('NO_SPACE')) exitCode = 3;
  else if (results.includes('FAIL')) exitCode = 1;
  return { passed, total, verdict, exitCode, line: `PROVE ${passed}/${total} ${verdict}` };
}

export function parse(argv) {
  const a = { width: 900, height: 1400, dpr: 1 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--label') a.label = str('prove', '--label', argv[++i]);
    else if (k === '--circle') a.circle = true;
    else if (k === '--blur') a.blur = str('prove', '--blur', argv[++i]);
    else if (k === '--zoom') a.zoom = true;
    else if (k === '--batch') a.batch = str('prove', '--batch', argv[++i]);
    else if (k === '--width') a.width = num('prove', '--width', argv[++i], { int: true, min: 1 });
    else if (k === '--height') a.height = num('prove', '--height', argv[++i], { int: true, min: 1 });
    else if (k === '--dpr') a.dpr = num('prove', '--dpr', argv[++i], { min: 0.1 });
    else if (k.startsWith('--')) throw new Error('prove: unknown arg ' + k);
    else pos.push(k);
  }
  // reject surplus positionals instead of silently mis-binding them — an
  // unquoted selector with spaces is the usual cause (it splits into extra
  // tokens, so the out filename lands in the wrong slot with no error). Mirrors
  // the demo/rec parsers.
  const maxPos = a.batch ? 1 : 3;
  if (pos.length > maxPos) {
    const expected = a.batch ? 'url' : 'url + selector + out';
    throw new Error(`prove: too many positional args (expected ${expected}): ${pos.slice(maxPos).join(' ')} — quote a selector with spaces?`);
  }
  if (a.batch) [a.url] = pos;
  else [a.url, a.selector, a.out] = pos;
  return a;
}

// One proof against an already-open page. Returns 'PASS' | 'FAIL' | 'NO_SPACE'.
async function proveOne(b, job) {
  const geo = await b.measureVisible(job.selector);

  // Measure the blur region up front so autoplace treats it as an obstacle
  // (callout won't land on it) and the crop includes it.
  let blurBox = null;
  if (job.blur) {
    try { const bg = await b.measureVisible(job.blur); blurBox = bg.target; }
    catch (e) { console.error('prove: --blur selector not found, skipping: ' + e.message); }
  }

  const t = geo.target;
  if (t.w < 1 || t.h < 1) {
    console.error('prove: target has zero size (hidden or collapsed): ' + job.selector);
    console.log('NO_SPACE ' + job.out);
    return 'NO_SPACE';
  }
  // Scale stroke + font with the target so a big element gets a bolder rect and
  // a small one stays delicate. Clamp to sane bounds.
  const strokeW = clamp(Math.round(Math.min(t.w, t.h) * 0.04), 3, 8);
  const fontSize = clamp(Math.round(Math.min(t.w, t.h) * 0.10), 14, 26);
  const calloutW = clamp(Math.round((job.label || '').length * fontSize * 0.62) + 28, 120, 420);
  const calloutH = Math.round(fontSize * 1.3) + 20; // matches pill(): size*1.3 + 2*padY(10)

  const textNbrs = await b.textNeighbors(job.selector);
  // Zoom inset placed FIRST so the callout ladder dodges it (inset is the
  // biggest box; callout adapts, collision check gates).
  const zoomSpot = job.zoom
    ? placeZoomInset({ t, neighbors: [...geo.neighbors, ...textNbrs], textNeighbors: textNbrs, viewport: geo.viewport })
    : null;
  const extraObstacles = [
    ...(blurBox ? [blurBox] : []),
    ...(zoomSpot ? [{ x: zoomSpot.at.x, y: zoomSpot.at.y, w: zoomSpot.insetW, h: zoomSpot.insetH }] : []),
  ];
  // Obstacle ladder: full set first; relax toward fewer obstacles before
  // accepting an inside layout (inside pills cover the target's own text).
  const ladder = [
    [...geo.neighbors, ...textNbrs, ...extraObstacles],
    [...textNbrs, ...extraObstacles],
    [...extraObstacles],
  ];
  let layout = null, insideLayout = null;
  for (const nbrs of ladder) {
    const lay = place({ target: t, neighbors: nbrs, viewport: geo.viewport, calloutW, calloutH });
    if (!lay.error && lay.mode !== 'inside') { layout = lay; break; }
    if (!lay.error && !insideLayout) insideLayout = lay;
  }
  layout = layout || insideLayout;
  if (!layout) {
    console.error('prove: NO_SPACE — target too small to hold even an inside label (selector ' + job.selector + ')');
    console.log('NO_SPACE ' + job.out);
    return 'NO_SPACE';
  }

  const annotations = buildAnnotations({
    t, blurBox,
    zoom: zoomSpot,
    circle: job.circle, label: job.label,
    layout, viewport: geo.viewport, fontSize, strokeW, calloutW, calloutH, textNbrs,
  });

  const shot = await b.screenshot({});
  let annotated = await b.annotate(shot, annotations);

  // Window-crop to the union of all drawn shapes + padding, so the proof stays
  // legible on tall/wide real pages (a full-page shot makes the annotation a
  // speck). vcheck runs on the cropped image; the target rect is offset too.
  const boxes = annotations.map((an) => {
    if (an.type === 'rect' || an.type === 'blur' || an.type === 'zoom') return { x: an.x, y: an.y, w: an.w, h: an.h };
    if (an.type === 'circle') {
      const rx = an.rx != null ? an.rx : an.r, ry = an.ry != null ? an.ry : an.r;
      return { x: an.x - rx, y: an.y - ry, w: rx * 2, h: ry * 2 };
    }
    if (an.type === 'callout') return { x: an.x, y: an.y, w: an.w || 220, h: calloutH };
    if (an.type === 'label') return { x: an.x, y: an.y, w: calloutW, h: calloutH };
    return null;
  }).filter(Boolean);
  if (an_zoomAt(annotations)) boxes.push(an_zoomAt(annotations));
  const PAD = 48;
  const minX = Math.min(...boxes.map((bx) => bx.x)) - PAD;
  const minY = Math.min(...boxes.map((bx) => bx.y)) - PAD;
  const maxX = Math.max(...boxes.map((bx) => bx.x + bx.w)) + PAD;
  const maxY = Math.max(...boxes.map((bx) => bx.y + bx.h)) + PAD;
  // Snap the crop to the smallest ancestor boundary that contains it so the
  // window never slices a table row / card mid-text.
  const ancestors = await ancestorBoxes(b, job.selector);
  const region = snapCropToAncestor({
    crop: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    ancestors,
    viewport: geo.viewport,
  });
  annotated = await b.crop(annotated, region);
  writeFileSync(job.out, annotated);

  // target rect in cropped coordinates
  const croppedTarget = {
    x: layout.rect.x - region.x, y: layout.rect.y - region.y, w: layout.rect.w, h: layout.rect.h,
  };
  const decoded = decodePNG(annotated);
  const res = visualCheck(decoded, croppedTarget, { hex: DEFAULT_MARKER_HEX });
  let reason = null;
  if (!res.pass) {
    console.error('prove: vcheck FAIL dominance=' + res.dominanceActual.toFixed(3) + ' minInside=' + res.minInside);
    reason = 'dominance';
  }
  if (!reason) {
    const hit = checkCollisions(placedBoxes(annotations, { calloutW, calloutH }), t);
    if (hit) { console.error('prove: collision — ' + hit); reason = 'collision'; }
  }
  if (!reason && job.expect) {
    const txt = await targetVisibleText(b, job.selector);
    const ok = typeof job.expect === 'string' ? (txt || '').includes(job.expect) : !!txt;
    if (!ok) { console.error('prove: target text missing on ' + job.selector); reason = 'target-text'; }
  }
  const size = outputByteSize(job.out);
  if (!reason && size <= 0) reason = 'empty-output';
  if (reason) {
    console.log('FAIL ' + job.out + ' reason=' + reason);
    return 'FAIL';
  }
  console.log('PASS ' + job.out + ' kb=' + Math.max(1, Math.round(size / 1024)));
  return 'PASS';
}

async function main() {
  const a = parse(process.argv.slice(2));
  const jobs = a.batch
    ? JSON.parse(readFileSync(a.batch, 'utf8'))
    : (a.url && a.selector && a.out ? [{ selector: a.selector, out: a.out, label: a.label, circle: a.circle, blur: a.blur, zoom: a.zoom }] : null);
  if (!a.url || !jobs || !jobs.length) {
    console.error('usage: prove.mjs <url> "<selector>" out.png --label "text" [--circle] [--blur sel] [--zoom]  |  prove.mjs <url> --batch jobs.json');
    process.exit(2);
  }

  const b = await Browser.launch({ width: a.width, height: a.height, dpr: a.dpr });
  const results = [];
  try {
    await b.open(a.url);
    await b.freeze();
    await b.fitToContent();
    for (const job of jobs) {
      try { results.push(await proveOne(b, job)); }
      catch (e) {
        console.error(String(e.message || e));
        console.log('ERROR ' + job.out);
        results.push('ERROR');
      }
    }
  } finally {
    await b.close();
  }
  const { line, exitCode } = summarize(results);
  console.log(line);
  if (exitCode) process.exit(exitCode);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
