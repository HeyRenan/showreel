#!/usr/bin/env node
// compose.mjs — side-by-side of two PNGs or two GIFs on a card, with auto A/B labels.
// Generalizes before-after.mjs (no Lighthouse hardcoding). PNGs composite on the
// browser motor's canvas; GIFs go through system ffmpeg (hstack + shared palette).
//
//   node compose.mjs a.png b.png pair.png [--labels "Before,After"] [--gap N]
//   node compose.mjs a.gif b.gif pair.gif [--labels "Before,After"] [--height N]
// Prints `OK <out>`.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Browser } from '../lib/browser.mjs';
import { pngDims } from './annotate.mjs';
import { num, str } from './cli-args.mjs';

// One filter graph: scale each gif to a common height, top label bar, label
// text overlaid from canvas-rendered PNGs (inputs 2 and 3 — drawtext is not in
// every ffmpeg build, overlay is), gap + outer padding in the card color,
// hstack on the shortest stream, then a shared palette so colors stay stable
// across both halves.
export function gifFilter({ height = 480, gap = 24, pad = 28, fps = 15 } = {}) {
  // ES defaults only fire on undefined; a NaN/Infinity knob would otherwise leak
  // a non-numeric token (e.g. pad*2 -> "NaN") into the graph and make ffmpeg fail
  // cryptically. Finite values (incl. 0/negative/huge) pass through untouched —
  // upstream `num(...)` validates real runs; this only blocks silent corruption.
  const fin = (v, d) => (Number.isFinite(v) ? v : d);
  height = fin(height, 480); gap = fin(gap, 24); pad = fin(pad, 28); fps = fin(fps, 15);
  const lane = (i) =>
    `[${i}:v]fps=${fps},scale=-2:${height}:flags=lanczos,pad=iw:ih+44:0:44:0xf1f5f9[b${i}]`;
  return [
    lane(0),
    lane(1),
    `[b0][2:v]overlay=14:10[l0]`,
    `[b1][3:v]overlay=14:10[l1]`,
    `[l0]pad=iw+${gap}:ih:0:0:0x0d1117[v0]`,
    `[v0][l1]hstack=shortest=1,pad=iw+${pad * 2}:ih+${pad * 2}:${pad}:${pad}:0x0d1117,split[s0][s1]`,
    `[s0]palettegen[p]`,
    `[s1][p]paletteuse`,
  ].join(';');
}

// Label PNGs are browser-rendered (this machine's ffmpeg has no drawtext) and
// cached in os.tmpdir()/showreel-labels keyed by sha1 of text + every style
// input. Full cache hit = no browser launch at all. Writes are atomic
// (tmp file + rename) so concurrent composes never read half a PNG.
export const LABEL_CACHE_DIR = join(tmpdir(), 'showreel-labels');
export const LABEL_STYLE = {
  theme: 'light',
  font: '700 20px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
  color: '#0f172a',
  height: 28,
  padX: 4,
  baseline: 2,
  width: 400,
  dpr: 1,
};

export function labelCacheKey(text, style = LABEL_STYLE) {
  return createHash('sha1').update(JSON.stringify({ text: String(text), ...style })).digest('hex');
}

export function labelCachePath(text, style = LABEL_STYLE) {
  return join(LABEL_CACHE_DIR, labelCacheKey(text, style) + '.png');
}

export async function labelPngs(labels, { launch = (o) => Browser.launch(o), style = LABEL_STYLE } = {}) {
  mkdirSync(LABEL_CACHE_DIR, { recursive: true });
  const wanted = labels.slice(0, 2).map((t) => String(t || ' '));
  const paths = wanted.map((t) => labelCachePath(t, style));
  const misses = wanted
    .map((text, i) => ({ text, path: paths[i] }))
    .filter((m) => !existsSync(m.path));
  if (!misses.length) return paths;

  const b = await launch({ width: style.width, height: 60, dpr: style.dpr });
  try {
    for (const m of misses) {
      const url = await b.page.evaluate(({ t, s }) => {
        const cv = document.createElement('canvas');
        const ctx = cv.getContext('2d');
        ctx.font = s.font;
        cv.width = Math.ceil(ctx.measureText(t).width) + s.padX; cv.height = s.height;
        const c2 = cv.getContext('2d');
        c2.font = s.font;
        c2.fillStyle = s.color; c2.textBaseline = 'top';
        c2.fillText(t, 0, s.baseline);
        return cv.toDataURL('image/png');
      }, { t: m.text, s: style });
      const tmpPath = `${m.path}.${process.pid}.tmp`;
      writeFileSync(tmpPath, Buffer.from(url.split(',')[1], 'base64'));
      renameSync(tmpPath, m.path);
    }
    return paths;
  } finally {
    await b.close();
  }
}

async function composeGifs(a, labels) {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
  catch { console.error('compose: gif mode needs system ffmpeg (brew install ffmpeg)'); process.exit(3); }
  const [la, lb] = await labelPngs(labels);
  const filter = gifFilter({ height: a.height || 480, gap: a.gap, pad: a.pad });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', a.aPng, '-i', a.bPng, '-i', la, '-i', lb,
    '-filter_complex', filter, '-loop', '0', a.out], { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log('OK ' + a.out);
}

export function parse(argv) {
  const a = { gap: 24, pad: 28, labelH: 44 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--labels') a.labels = str('compose', '--labels', argv[++i]);
    else if (k === '--gap') a.gap = num('compose', '--gap', argv[++i], { min: 0 });
    else if (k === '--height') a.height = num('compose', '--height', argv[++i], { int: true, min: 1 });
    else if (k.startsWith('--')) throw new Error('compose: unknown arg ' + k);
    else pos.push(k);
  }
  // reject surplus positionals — an unquoted path with spaces splits into extra
  // tokens and the out filename lands in the wrong slot with no error. Mirrors
  // the demo / rec / prove / shot parsers.
  if (pos.length > 3) {
    throw new Error('compose: too many positional args (expected before + after + out): '
      + pos.slice(3).join(' ') + ' — quote a path with spaces?');
  }
  [a.aPng, a.bPng, a.out] = pos;
  return a;
}

async function main() {
  const a = parse(process.argv.slice(2));
  if (!a.aPng || !a.bPng || !a.out) {
    console.error('usage: compose.mjs a.(png|gif) b.(png|gif) out.(png|gif) [--labels "Before,After"] [--height N]');
    process.exit(2);
  }
  for (const input of [a.aPng, a.bPng]) {
    if (!existsSync(input)) {
      console.error('compose: input not found: ' + input);
      process.exit(2);
    }
  }
  const labels = (a.labels || 'A,B').split(',').map((s) => s.trim());
  const gifIn = /\.gif$/i.test(a.aPng) || /\.gif$/i.test(a.bPng);
  if (gifIn || /\.gif$/i.test(a.out)) {
    if (!(/\.gif$/i.test(a.aPng) && /\.gif$/i.test(a.bPng) && /\.gif$/i.test(a.out))) {
      console.error('compose: gif mode needs BOTH inputs and the output as .gif');
      process.exit(2);
    }
    return composeGifs(a, labels);
  }
  const aBuf = readFileSync(a.aPng), bBuf = readFileSync(a.bPng);
  const ad = pngDims(aBuf), bd = pngDims(bBuf);

  const colW = Math.max(ad.width, bd.width);
  const colH = Math.max(ad.height, bd.height);
  const W = a.pad * 2 + colW * 2 + a.gap;
  const H = a.pad * 2 + a.labelH + colH;

  const aUrl = 'data:image/png;base64,' + aBuf.toString('base64');
  const bUrl = 'data:image/png;base64,' + bBuf.toString('base64');

  const b = await Browser.launch({ width: W, height: H, dpr: 1 });
  try {
    const out = await b.page.evaluate(async ({ W, H, pad, gap, labelH, colW, aUrl, bUrl, labels }) => {
      const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej('img'); i.src = src; });
      const [ia, ib] = await Promise.all([load(aUrl), load(bUrl)]);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
      ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, W, H);
      const cols = [{ img: ia, label: labels[0] || 'A' }, { img: ib, label: labels[1] || 'B' }];
      cols.forEach((c, idx) => {
        const x = pad + idx * (colW + gap);
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, pad, colW, labelH + c.img.height);
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(x, pad, colW, labelH);
        ctx.fillStyle = '#0f172a'; ctx.font = '700 18px ' + FONT; ctx.textBaseline = 'middle';
        ctx.fillText(c.label, x + 14, pad + labelH / 2);
        ctx.drawImage(c.img, x + (colW - c.img.width) / 2, pad + labelH);
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, pad + 0.5, colW - 1, labelH + c.img.height - 1);
      });
      return cv.toDataURL('image/png');
    }, { W, H, pad: a.pad, gap: a.gap, labelH: a.labelH, colW, aUrl, bUrl, labels });
    writeFileSync(a.out, Buffer.from(out.split(',')[1], 'base64'));
    console.log('OK ' + a.out);
  } finally {
    await b.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
