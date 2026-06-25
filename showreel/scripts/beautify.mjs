#!/usr/bin/env node
// beautify.mjs — wrap a screenshot in a frame on a styled background.
//
//   node beautify.mjs <in.png> [out.png] [--frame window|card|minimal]
//        [--bg "c1[,c2]"] [--pad N] [--radius N] [--url TEXT]
//        [--ratio 16:9|9:16|1:1|free] [--no-shadow]
//
// Default: a browser-window frame (traffic lights + url bar) with a soft shadow
// and rounded corners, on a slate gradient. `--ratio` sizes the canvas to a
// social aspect (the window is centered, never cropped). Output → `<in>.framed.png`
// unless an out path is given. stdout: `OK <out> (WxH) kb=<n>`.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { Browser } from '../lib/browser.mjs';
import { frameLayout, resolveBackground, RATIOS } from './beautify-frame.mjs';
import { pngDims } from './annotate.mjs';
import { num, str } from './cli-args.mjs';

const FRAMES = ['window', 'card', 'minimal'];

export function parse(argv) {
  const a = { frame: 'window', pad: 64, radius: 14, ratio: 'free', shadow: true };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--frame') a.frame = str('beautify', '--frame', argv[++i]);
    else if (k === '--bg') a.bg = str('beautify', '--bg', argv[++i]);
    else if (k === '--pad') a.pad = num('beautify', '--pad', argv[++i], { int: true, min: 0 });
    else if (k === '--radius') a.radius = num('beautify', '--radius', argv[++i], { int: true, min: 0 });
    else if (k === '--url') a.url = str('beautify', '--url', argv[++i]);
    else if (k === '--ratio') a.ratio = str('beautify', '--ratio', argv[++i]);
    else if (k === '--shadow') a.shadow = true;
    else if (k === '--no-shadow') a.shadow = false;
    else if (k.startsWith('--')) throw new Error('beautify: unknown arg ' + k);
    else pos.push(k);
  }
  if (pos.length > 2) throw new Error('beautify: too many positional args (expected in.png [out.png]): ' + pos.slice(2).join(' '));
  [a.in, a.out] = pos;
  return a;
}

function defaultOut(inPath) {
  return inPath.replace(/\.png$/i, '') + '.framed.png';
}

async function main() {
  const a = parse(process.argv.slice(2));
  if (!a.in) {
    console.error('usage: beautify.mjs <in.png> [out.png] [--frame window|card|minimal] [--bg "c1[,c2]"] [--pad N] [--radius N] [--url TEXT] [--ratio 16:9|9:16|1:1|free] [--no-shadow]');
    process.exit(2);
  }
  if (!FRAMES.includes(a.frame)) { console.error('beautify: --frame must be one of ' + FRAMES.join(', ')); process.exit(2); }
  if (!(a.ratio in RATIOS)) { console.error('beautify: --ratio must be one of ' + Object.keys(RATIOS).join(', ')); process.exit(2); }

  const out = a.out || defaultOut(a.in);
  let dims;
  try { dims = pngDims(readFileSync(a.in)); }
  catch (e) { console.error('beautify: cannot read PNG ' + a.in + ' — ' + (e.message || e)); process.exit(1); }

  const layout = frameLayout(dims.width, dims.height, a);
  const draw = { bg: resolveBackground(a.bg), url: a.url, shadow: a.shadow, frame: layout.frame };

  const b = await Browser.launch({ width: 100, height: 100 });
  try {
    const framed = await b.beautify(readFileSync(a.in), layout, draw);
    writeFileSync(out, framed);
  } finally {
    await b.close();
  }
  const kb = Math.max(1, Math.round(statSync(out).size / 1024));
  console.log('OK ' + out + ' (' + layout.canvasW + 'x' + layout.canvasH + ') kb=' + kb);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
