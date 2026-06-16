#!/usr/bin/env node
// demo.mjs — render ONE annotation primitive on a real page target, ISOLATED,
// for documentation/showcase. Unlike prove.mjs (which always stamps the green
// marker rect + runs vcheck), demo draws exactly the requested primitive and
// nothing else, then crops tight. One image = one feature.
//
//   node demo.mjs <url> "<selector>" out.png --kind <rect|circle|blur|label|zoom|callout|arrow|badge> [--text "..."] [--width N] [--height N]
//
// Batch mode — ONE browser launch + ONE page load for N captures (the per-image
// cost drops to annotate+crop only):
//
//   node demo.mjs <url> --batch jobs.json [--width N] [--height N]
//   jobs.json: [{"selector":"...","out":"...","kind":"rect","text":"..."}]
//
// Prints `OK <out.png>` per capture.

import { writeFileSync, readFileSync } from 'node:fs';
import { Browser } from '../lib/browser.mjs';
import { place, pillOutside, badgeOutside, snapCropToAncestor } from '../lib/autoplace.mjs';
import { num, str } from './cli-args.mjs';

const NEUTRAL = 'neutral'; // engine resolves vs page tone (light on dark, dark on light)
const GREEN = '#16a34a';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Visible text-bearing rects in the viewport (excluding the target and its
// descendants) — extra autoplace obstacles so callouts/zoom insets never land
// on page text the sibling-only measure() misses.
async function textNeighbors(b, selector) {
  return b.page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const vw = window.innerWidth, vh = window.innerHeight;
    const out = [];
    const seen = new Set();
    const nodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,button,td,th,li,label,code,b,strong,em,span,small');
    for (const n of nodes) {
      if (out.length >= 50) break;
      if (el && (n === el || el.contains(n) || n.contains(el))) continue;
      if (!(n.textContent || '').trim()) continue;
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
      const r = n.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
      const box = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      const key = box.x + ':' + box.y + ':' + box.w + ':' + box.h;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(box);
    }
    return out;
  }, selector);
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

export function parse(argv) {
  const a = { width: 1280, height: 900, kind: 'rect' };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--kind') a.kind = str('demo', '--kind', argv[++i]);
    else if (k === '--text') a.text = str('demo', '--text', argv[++i]);
    else if (k === '--batch') a.batch = str('demo', '--batch', argv[++i]);
    else if (k === '--width') a.width = num('demo', '--width', argv[++i], { int: true, min: 1 });
    else if (k === '--height') a.height = num('demo', '--height', argv[++i], { int: true, min: 1 });
    else if (k.startsWith('--')) throw new Error('demo: unknown arg ' + k);
    else pos.push(k);
  }
  if (a.batch) [a.url] = pos;
  else [a.url, a.selector, a.out] = pos;
  return a;
}

async function captureOne(b, job) {
  const geo = await b.measureVisible(job.selector);
  const t = geo.target;
  if (t.w < 1 || t.h < 1) throw new Error('demo: target has zero size (hidden or collapsed): ' + job.selector);
  const kind = job.kind || 'rect';
  const text = job.text || job.selector;
  const fontSize = clamp(Math.round(Math.min(t.w, t.h) * 0.10), 14, 24);
  const strokeW = clamp(Math.round(Math.min(t.w, t.h) * 0.04), 3, 7);

  const ann = [];
  const boxes = [{ x: t.x, y: t.y, w: t.w, h: t.h }];

  const vp = geo.viewport;
  const textNbrs = await textNeighbors(b, job.selector);
  const labelW = clamp(Math.round(text.length * fontSize * 0.62) + 20, 80, 420);
  const labelH = Math.round(fontSize * 1.3) + 12;

  // Obstacle ladder: full neighbor set first, then text rects only, then
  // nothing — never accept an inside layout while a less-constrained outside
  // one exists, and never fall back straight to "ignore all page text".
  function placeLadder(cw, ch) {
    let inside = null;
    for (const nbrs of [[...geo.neighbors, ...textNbrs], textNbrs, []]) {
      const lay = place({ target: t, neighbors: nbrs, viewport: vp, calloutW: cw, calloutH: ch });
      if (!lay.error && lay.mode !== 'inside') return lay;
      if (!lay.error && !inside) inside = lay;
    }
    return inside || { error: 'NO_SPACE' };
  }

  if (kind === 'rect') {
    ann.push({ type: 'rect', x: t.x, y: t.y, w: t.w, h: t.h, color: GREEN, width: strokeW });
  } else if (kind === 'circle') {
    const rx = (t.w / 2) * 1.12 + 12, ry = (t.h / 2) * 1.35 + 12;
    ann.push({ type: 'circle', x: t.x + t.w / 2, y: t.y + t.h / 2, rx, ry, color: GREEN, width: strokeW });
    boxes.push({ x: t.x + t.w / 2 - rx, y: t.y + t.h / 2 - ry, w: rx * 2, h: ry * 2 });
  } else if (kind === 'blur') {
    ann.push({ type: 'blur', x: t.x, y: t.y, w: t.w, h: t.h, px: 16 });
  } else if (kind === 'label') {
    const at = pillOutside({ target: t, viewport: vp, w: labelW, h: labelH, neighbors: textNbrs });
    ann.push({ type: 'label', x: at.x, y: at.y, text, bg: NEUTRAL, size: fontSize });
    boxes.push({ x: at.x, y: at.y, w: labelW, h: labelH });
  } else if (kind === 'callout') {
    const cw = clamp(text.length * fontSize * 0.62 + 28, 120, 420);
    const ch = Math.round(fontSize * 1.3) + 20;
    const lay = placeLadder(cw, ch);
    if (lay.error || lay.mode === 'inside') {
      const at = pillOutside({ target: t, viewport: vp, w: labelW, h: labelH, neighbors: textNbrs });
      ann.push({ type: 'label', x: at.x, y: at.y, text, bg: NEUTRAL, size: fontSize });
      boxes.push({ x: at.x, y: at.y, w: labelW, h: labelH });
    } else {
      ann.push({ type: 'callout', x: lay.callout.x, y: lay.callout.y, w: lay.callout.w, text, bg: NEUTRAL, size: fontSize, anchorX: lay.arrow.x2, anchorY: lay.arrow.y2 });
      boxes.push({ x: lay.callout.x, y: lay.callout.y, w: lay.callout.w, h: ch });
    }
  } else if (kind === 'arrow') {
    const lay = placeLadder(40, 40);
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    const LEN = 90;
    const side = (!lay.error && lay.mode !== 'inside' && lay.callout && lay.callout.side) || 'below';
    const ar = {
      below: { x1: cx, y1: t.y + t.h + 4 + LEN, x2: cx, y2: t.y + t.h + 4 },
      above: { x1: cx, y1: t.y - 4 - LEN, x2: cx, y2: t.y - 4 },
      right: { x1: t.x + t.w + 4 + LEN, y1: cy, x2: t.x + t.w + 4, y2: cy },
      left: { x1: t.x - 4 - LEN, y1: cy, x2: t.x - 4, y2: cy },
    }[side];
    ar.x1 = clamp(ar.x1, 12, vp.w - 12);
    ar.y1 = clamp(ar.y1, 12, vp.h - 12);
    ann.push({ type: 'arrow', x1: ar.x1, y1: ar.y1, x2: ar.x2, y2: ar.y2, color: NEUTRAL, width: 5 });
    boxes.push({ x: Math.min(ar.x1, ar.x2) - 14, y: Math.min(ar.y1, ar.y2) - 14, w: Math.abs(ar.x2 - ar.x1) + 28, h: Math.abs(ar.y2 - ar.y1) + 28 });
  } else if (kind === 'badge') {
    const n = /^\d+(\.\d+)?$/.test(text) ? text : '1';
    const at = badgeOutside({ target: t, viewport: vp, r: 18 });
    ann.push({ type: 'badge', x: at.x, y: at.y, n, r: 18 });
    boxes.push({ x: at.x - 24, y: at.y - 24, w: 48, h: 48 });
  } else if (kind === 'zoom') {
    const scale = clamp(Math.min(2.4, (vp.w * 0.6) / t.w, (vp.h * 0.6) / t.h), 1.4, 2.4);
    const iw = Math.round(t.w * scale), ih = Math.round(t.h * scale);
    const spot = placeLadder(iw, ih);
    const at = (spot.error || spot.mode === 'inside')
      ? { x: clamp(t.x, 12, vp.w - iw - 12), y: clamp(t.y + t.h + 28, 12, vp.h - ih - 12) }
      : { x: spot.callout.x, y: spot.callout.y };
    ann.push({ type: 'zoom', x: t.x, y: t.y, w: t.w, h: t.h, scale, color: NEUTRAL, at });
    boxes.push({ x: at.x, y: at.y, w: iw, h: ih });
  } else {
    throw new Error('demo: unknown kind ' + kind);
  }

  const shot = await b.screenshot({});
  const annotated = await b.annotate(shot, ann);

  const PAD = 48;
  const minX = Math.max(0, Math.min(...boxes.map((x) => x.x)) - PAD);
  const minY = Math.max(0, Math.min(...boxes.map((x) => x.y)) - PAD);
  const maxX = Math.max(...boxes.map((x) => x.x + x.w)) + PAD;
  const maxY = Math.max(...boxes.map((x) => x.y + x.h)) + PAD;
  // Snap the crop to the smallest ancestor boundary that contains it so the
  // window never slices a table row / card mid-text.
  const ancestors = await ancestorBoxes(b, job.selector);
  const region = snapCropToAncestor({
    crop: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    ancestors,
    viewport: vp,
  });
  const cropped = await b.crop(annotated, region);
  writeFileSync(job.out, cropped);
  console.log('OK ' + job.out);
}

async function main() {
  const a = parse(process.argv.slice(2));
  const jobs = a.batch
    ? JSON.parse(readFileSync(a.batch, 'utf8'))
    : (a.url && a.selector && a.out ? [{ selector: a.selector, out: a.out, kind: a.kind, text: a.text }] : null);
  if (!a.url || !jobs || !jobs.length) {
    console.error('usage: demo.mjs <url> "<selector>" out.png --kind <k> [--text "..."]  |  demo.mjs <url> --batch jobs.json');
    process.exit(2);
  }
  const b = await Browser.launch({ width: a.width, height: a.height });
  let failed = 0;
  try {
    await b.open(a.url);
    await b.freeze();
    await b.fitToContent();
    for (const job of jobs) {
      try { await captureOne(b, job); }
      catch (e) { failed++; console.error(String(e.message || e)); }
    }
  } finally {
    await b.close();
  }
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
