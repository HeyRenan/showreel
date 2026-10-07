#!/usr/bin/env node
// overlay.mjs — showreel for Claude in Chrome (or any browser you can run JS in).
//
// The headless motor cannot see state that only exists in YOUR live tab: a modal
// opened by a click, a logged-in view, a form half filled. This prints a small
// library to inject into that tab. It draws the same placed annotations
// (marker + wrapped callout + arrow, same placement engine) as a DOM overlay on
// the live page, so you screenshot it with the browser tool. No pixel coords.
//
//   node overlay.mjs --install   # JS for the browser's javascript tool. Once per page load.
//   then, in the page:
//     __showreel.annotate("#sel", "short label", { circle: true })   // -> JSON verdict
//     __showreel.clear()
//
// Verdict: {"ok":true,"side":"below","target":{...},"callout":{...}}
//          {"ok":false,"reason":"selector not found: #sel"}
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isMain } from './cli-args.mjs';
import { measureInPage, textNeighborsInPage } from '../lib/page-measure.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// Drops comment-only lines, blank lines and indentation: the library crosses the
// agent's context twice (stdout, then the tool call), so every byte is tokens.
const squeeze = (src) => src.split('\n')
  .map((l) => l.replace(/ \/\/ .*$/, '').trim())
  .filter((l) => l && !l.startsWith('//'))
  .join('\n');

// Top-level functions the overlay never calls — dropped from the embedded
// placer so the install stays small.
function dropFunctions(src, names) {
  for (const name of names) {
    const start = src.search(new RegExp('^function ' + name + '\\b', 'm'));
    if (start < 0) continue;
    src = src.slice(0, start) + src.slice(src.indexOf('\n}\n', start) + 3);
  }
  return src;
}

const OVERLAY_DRAW = `
function showreelAnnotate(sel, label, opts) {
  opts = opts || {};
  const ID = '__showreel_overlay';
  const old = document.getElementById(ID); if (old) old.remove();
  const el = document.querySelector(sel);
  if (!el) return { ok: false, reason: 'selector not found: ' + sel };
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const geo = measureInPage(sel);
  const t = geo.target;
  if (t.w < 1 || t.h < 1) return { ok: false, reason: 'target has zero size (hidden or collapsed): ' + sel };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fs = clamp(Math.round(Math.min(t.w, t.h) * 0.10), 14, 26);
  const root = document.createElement('div');
  root.id = ID;
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  document.documentElement.appendChild(root);
  const GREEN = '#16a34a';
  // light neutrals on a dark page, dark on a light one — read from the first
  // opaque background behind the target, so lines and pills never sink in.
  const lum = (css) => { const m = css.match(/[\\d.]+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : null; };
  let bgLum = null;
  for (let n = el; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor, m = c.match(/[\\d.]+/g);
    if (m && (m.length < 4 || +m[3] > 0.5)) { bgLum = lum(c); break; }
  }
  // gradient / image backgrounds report no color: light text means a dark page
  if (bgLum == null) bgLum = 1 - lum(getComputedStyle(el).color);
  const dark = bgLum < 0.5;
  const INK = dark ? 'rgba(248,250,252,.96)' : 'rgba(15,23,42,.95)';
  const FG = dark ? '#0f172a' : '#fff';
  const EDGE = dark ? 'rgba(15,23,42,.25)' : 'rgba(255,255,255,.25)';
  const box = (x, y, w, h, css) => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;box-sizing:border-box;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;' + css;
    root.appendChild(d); return d;
  };
  const sw = clamp(Math.round(Math.min(t.w, t.h) * 0.04), 3, 8);
  box(t.x, t.y, t.w, t.h, 'border:' + sw + 'px solid ' + GREEN + ';border-radius:6px;box-shadow:0 0 3px rgba(0,0,0,.35);');
  if (opts.circle) {
    const rx = (t.w / 2) * 1.12 + 12, ry = (t.h / 2) * 1.35 + 12;
    box(t.x + t.w / 2 - rx, t.y + t.h / 2 - ry, rx * 2, ry * 2, 'border:' + sw + 'px solid ' + GREEN + ';border-radius:50%;');
  }
  let callout = null, side = null;
  if (label) {
    const pill = document.createElement('div');
    pill.textContent = label;
    pill.style.cssText = 'position:absolute;left:0;top:0;box-sizing:border-box;max-width:' + Math.min(420, geo.viewport.w - 24) +
      'px;padding:10px 14px;border-radius:8px;background:' + INK + ';color:' + FG + ';border:1px solid ' + EDGE + ';' +
      'font:600 ' + fs + 'px/1.3 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;width:max-content;box-shadow:0 2px 8px rgba(0,0,0,.35);';
    root.appendChild(pill);
    const pr = pill.getBoundingClientRect();
    const w = Math.ceil(pr.width), h = Math.ceil(pr.height);
    const textNbrs = textNeighborsInPage(sel);
    let layout = null, inside = null;
    for (const nbrs of [[...geo.neighbors, ...textNbrs], textNbrs, []]) {
      const lay = place({ target: t, neighbors: nbrs, viewport: geo.viewport, calloutW: w, calloutH: h });
      if (!lay.error && lay.mode !== 'inside') { layout = lay; break; }
      if (!lay.error && !inside) inside = lay;
    }
    if (layout) {
      callout = layout.callout; side = callout.side;
      pill.style.left = callout.x + 'px'; pill.style.top = callout.y + 'px';
      const a = layout.arrow;
      const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
      const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
      const back = Math.min(12, len * 0.4), head = 12;
      const tx = a.x2 - Math.cos(ang) * back, ty = a.y2 - Math.sin(ang) * back;
      const bx = tx - Math.cos(ang) * head * 0.9, by = ty - Math.sin(ang) * head * 0.9;
      const p1 = [tx - head * Math.cos(ang - 0.45), ty - head * Math.sin(ang - 0.45)];
      const p2 = [tx - head * Math.cos(ang + 0.45), ty - head * Math.sin(ang + 0.45)];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', geo.viewport.w); svg.setAttribute('height', geo.viewport.h);
      svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;';
      svg.innerHTML = '<line x1="' + a.x1 + '" y1="' + a.y1 + '" x2="' + bx + '" y2="' + by + '" stroke="' + INK +
        '" stroke-width="3" stroke-linecap="round"/><polygon points="' + tx + ',' + ty + ' ' + p1 + ' ' + p2 + '" fill="' + INK + '"/>';
      root.insertBefore(svg, pill);
    } else {
      const at = pillOutside({ target: t, viewport: geo.viewport, w, h, neighbors: textNbrs });
      pill.style.left = at.x + 'px'; pill.style.top = at.y + 'px';
      callout = { x: at.x, y: at.y, w, h }; side = at.side;
    }
  }
  return { ok: true, side, target: t, callout };
}
window.__showreel = {
  annotate: (sel, label, opts) => JSON.stringify(showreelAnnotate(sel, label, opts)),
  clear: () => { const o = document.getElementById('__showreel_overlay'); if (o) o.remove(); return 'cleared'; },
};
return 'window.__showreel ready';
`;

export function buildOverlayLib() {
  const placer = dropFunctions(
    readFileSync(join(HERE, '..', 'lib', 'autoplace.mjs'), 'utf8').replace(/^export /gm, ''),
    ['wrapLabel', 'snapCropToAncestor', 'badgeOutside'],
  );
  // IIFE: re-installing on a live page must not redeclare top-level consts
  return '(() => {\n' + squeeze([
    placer,
    measureInPage.toString(),
    textNeighborsInPage.toString(),
    OVERLAY_DRAW,
  ].join('\n')) + '\n})()';
}

function main() {
  const arg = process.argv[2];
  if (arg !== '--install') {
    console.error('usage: overlay.mjs --install   (prints JS for the browser javascript tool; then call __showreel.annotate(sel, label, {circle}) / __showreel.clear())');
    process.exit(2);
  }
  process.stdout.write(buildOverlayLib() + '\n');
}

if (isMain(import.meta.url)) {
  try { main(); } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
