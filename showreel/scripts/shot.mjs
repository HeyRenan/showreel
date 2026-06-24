#!/usr/bin/env node
// shot.mjs — tight screenshot of ONE element, no MCP, no black background.
//   node shot.mjs <url> "<selector>" out.png [--pad N] [--width N] [--height N] [--dpr N]
// Prints `OK <out.png>`.

import { writeFileSync } from 'node:fs';
import { Browser } from '../lib/browser.mjs';
import { num } from './cli-args.mjs';

export function parse(argv) {
  const a = { width: 900, height: 1400, dpr: 1, pad: 16 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--pad') a.pad = num('shot', '--pad', argv[++i], { min: 0 });
    else if (k === '--width') a.width = num('shot', '--width', argv[++i], { int: true, min: 1 });
    else if (k === '--height') a.height = num('shot', '--height', argv[++i], { int: true, min: 1 });
    else if (k === '--dpr') a.dpr = num('shot', '--dpr', argv[++i], { min: 0.1 });
    else if (k.startsWith('--')) throw new Error('shot: unknown arg ' + k);
    else pos.push(k);
  }
  // reject surplus positionals — an unquoted selector with spaces splits into
  // extra tokens and the out filename lands in the wrong slot with no error.
  // Mirrors the demo / rec / prove parsers.
  if (pos.length > 3) {
    throw new Error('shot: too many positional args (expected url + selector + out): '
      + pos.slice(3).join(' ') + ' — quote a selector with spaces?');
  }
  [a.url, a.selector, a.out] = pos;
  return a;
}

async function main() {
  const a = parse(process.argv.slice(2));
  if (!a.url || !a.selector || !a.out) {
    console.error('usage: shot.mjs <url> "<selector>" out.png [--pad N]');
    process.exit(2);
  }
  const b = await Browser.launch({ width: a.width, height: a.height, dpr: a.dpr });
  try {
    await b.open(a.url);
    await b.freeze();
    const geo = await b.measureVisible(a.selector);
    const t = geo.target;
    const clip = {
      x: Math.max(0, t.x - a.pad),
      y: Math.max(0, t.y - a.pad),
      width: Math.min(geo.viewport.w, t.w + a.pad * 2),
      height: Math.min(geo.viewport.h, t.h + a.pad * 2),
    };
    const buf = await b.screenshot({ clip });
    writeFileSync(a.out, buf);
    console.log('OK ' + a.out);
  } finally {
    await b.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
