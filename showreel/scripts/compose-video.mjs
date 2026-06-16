#!/usr/bin/env node
// compose-video.mjs — side-by-side MP4 of two recorded takes: the before/after
// format for hosted review (gifs blow past attachment limits; mp4 renders inline).
// Same card layout as compose.mjs gif mode: lanes scaled to a common height,
// 44px label bar per lane, label text overlaid from canvas-rendered PNGs at
// inputs 2/3 (this ffmpeg build has no drawtext), gap + outer padding in the
// card color, hstack on the shortest stream. libx264 crf 20 yuv420p +faststart.
//
//   node compose-video.mjs a.webm b.webm out.mp4 [--labels "BEFORE,AFTER"]
//        [--height N] [--gap N] [--sync-trim]
//
// --sync-trim reads '<input>.timeline.json' sidecars (rec.mjs --keep-webm) and
// trims each input's head by its own trimSec (-ss before -i) so both takes
// start at their load anchor. Missing sidecar(s): warn + 1.0s default trim on
// both. Prints `OK <out>`.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { Browser } from '../lib/browser.mjs';
import { num } from './cli-args.mjs';

export function videoFilter({ height = 480, gap = 24, pad = 28 } = {}) {
  const lane = (i) =>
    `[${i}:v]scale=-2:${height}:flags=lanczos,pad=iw:ih+44:0:44:0xf1f5f9[b${i}]`;
  return [
    lane(0),
    lane(1),
    `[b0][2:v]overlay=14:10[l0]`,
    `[b1][3:v]overlay=14:10[l1]`,
    `[l0]pad=iw+${gap}:ih:0:0:0x0d1117[v0]`,
    `[v0][l1]hstack=shortest=1,pad=iw+${pad * 2}:ih+${pad * 2}:${pad}:${pad}:0x0d1117,pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0:0x0d1117`,
  ].join(';');
}

export function videoArgs({ aIn, bIn, la, lb, out, filter, trims = [0, 0] }) {
  const seek = (t) => (t > 0 ? ['-ss', String(t)] : []);
  return ['-y', '-v', 'error',
    ...seek(trims[0]), '-i', aIn,
    ...seek(trims[1]), '-i', bIn,
    '-i', la, '-i', lb,
    '-filter_complex', filter,
    '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out];
}

export function sidecarPath(input) {
  return input + '.timeline.json';
}

export function trimSeconds(syncTrim, aSide, bSide) {
  if (!syncTrim) return { a: 0, b: 0 };
  const sec = (s) => (s && typeof s.trimSec === 'number' ? s.trimSec : null);
  const ta = sec(aSide), tb = sec(bSide);
  if (ta != null && tb != null) return { a: ta, b: tb };
  return { a: 1, b: 1, warn: 'sidecar(s) missing — 1.0s default head trim on both' };
}

export function parseLabels(s) {
  return (s || 'BEFORE,AFTER').split(',').map((x) => x.trim()).slice(0, 2);
}

export function parse(argv) {
  const a = { height: 480, gap: 24, pad: 28 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--labels') a.labels = argv[++i];
    else if (k === '--height') a.height = num('compose-video', '--height', argv[++i], { int: true, min: 1 });
    else if (k === '--gap') a.gap = num('compose-video', '--gap', argv[++i], { min: 0 });
    else if (k === '--sync-trim') a.syncTrim = true;
    else if (k.startsWith('--')) throw new Error('compose-video: unknown arg ' + k);
    else pos.push(k);
  }
  [a.aIn, a.bIn, a.out] = pos;
  return a;
}

export function extOk({ aIn, bIn, out }) {
  if (!aIn || !bIn || !out) return 'usage';
  if (!/\.(webm|mp4)$/i.test(aIn) || !/\.(webm|mp4)$/i.test(bIn)) return 'inputs must be .webm or .mp4';
  if (!/\.mp4$/i.test(out)) return 'output must be .mp4';
  return null;
}

function loadSidecar(input) {
  const p = sidecarPath(input);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

async function labelPngs(labels) { // same canvas technique as compose.mjs
  const b = await Browser.launch({ width: 400, height: 60, dpr: 1 });
  try {
    const render = (text) => b.page.evaluate((t) => {
      const cv = document.createElement('canvas');
      const ctx = cv.getContext('2d');
      ctx.font = '700 20px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
      cv.width = Math.ceil(ctx.measureText(t).width) + 4; cv.height = 28;
      const c2 = cv.getContext('2d');
      c2.font = '700 20px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
      c2.fillStyle = '#0f172a'; c2.textBaseline = 'top';
      c2.fillText(t, 0, 2);
      return cv.toDataURL('image/png');
    }, text);
    const out = [];
    for (const t of labels.slice(0, 2)) {
      const url = await render(String(t || ' '));
      const path = `${tmpdir()}/compose-video-label-${out.length}-${process.pid}.png`;
      writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
      out.push(path);
    }
    return out;
  } finally {
    await b.close();
  }
}

async function main() {
  const a = parse(process.argv.slice(2));
  const bad = extOk(a);
  if (bad) {
    console.error(bad === 'usage'
      ? 'usage: compose-video.mjs a.(webm|mp4) b.(webm|mp4) out.mp4 [--labels "BEFORE,AFTER"] [--height N] [--gap N] [--sync-trim]'
      : 'compose-video: ' + bad);
    process.exit(2);
  }
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); }
  catch { console.error('compose-video: needs system ffmpeg (brew install ffmpeg)'); process.exit(3); }
  const t = trimSeconds(a.syncTrim, loadSidecar(a.aIn), loadSidecar(a.bIn));
  if (t.warn) console.error('compose-video: warn — ' + t.warn);
  const [la, lb] = await labelPngs(parseLabels(a.labels));
  try {
    execFileSync('ffmpeg', videoArgs({
      aIn: a.aIn, bIn: a.bIn, la, lb, out: a.out,
      filter: videoFilter(a), trims: [t.a, t.b],
    }), { stdio: ['ignore', 'inherit', 'inherit'] });
  } finally {
    rmSync(la, { force: true }); rmSync(lb, { force: true });
  }
  console.log('OK ' + a.out);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
