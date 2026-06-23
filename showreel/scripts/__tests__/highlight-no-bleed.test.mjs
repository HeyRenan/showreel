// highlight-no-bleed.test.mjs — render-real regression guard for the highlight.
//
// The highlight band carries a soft OUTSET glow (a spotlight look — an inset
// glow reads flat, like a filled form field). An outset glow would bleed past
// the card under a camera zoom, so applyHighlight clips the containing card
// (overflow:hidden + reflow) for the life of the highlight: the glow stays a
// real outer glow yet is contained. This proves BOTH at once on the real
// pipeline — the glow paints (so a fix may not just delete it) AND none of it
// escapes the card edge. GUARDED: skips cleanly when chromium/ffmpeg are absent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNGFromFile, pixelAt } from '../pngread.mjs';
import { DEPS_DIR, ffmpegPath } from '../ensure-deps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..');
const REPO = join(SCRIPTS, '..', '..');
const DEMO = join(REPO, 'assets-src', 'demo', 'index.html');
const REC = join(SCRIPTS, 'rec.mjs');
const BROWSERS = join(DEPS_DIR, 'ms-playwright');

function chromiumPresent() {
  try { return readdirSync(BROWSERS).some((d) => d.startsWith('chromium')); } catch { return false; }
}
function ffmpegPresent() {
  try { execFileSync(ffmpegPath(), ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}
const READY = chromiumPresent() && ffmpegPresent() && existsSync(DEMO);
const SKIP = READY ? false : 'render deps absent (chromium/ffmpeg/demo) — run ensure-deps.mjs';
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS };

const W = 1280, H = 676;
const OUT_X0 = Math.floor(W * 0.90);            // outside the zoomed card → any amber here is bleed
const IN_X0 = Math.floor(W * 0.55), IN_X1 = Math.floor(W * 0.86); // halo band inside the card

// amber/gold = the highlight glow (high R, mid-high G, low B), clear of the
// demo's reds (low G) and greens (low R).
const isAmber = (c) => c.r > 180 && c.g > 110 && c.b < 150 && c.r - c.b > 55 && c.r - c.g < 120;

test('highlight glow is a real outer glow yet does not bleed past the card under zoom', { skip: SKIP }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'showreel-hl-'));
  try {
    // ?gate=fail arms the gate; the first #deploy click fails it, which reveals
    // #rollback-countdown (without that click the countdown stays display:none
    // and the pre-flight rejects the highlight).
    const steps = [
      { screen: 'Ship', wait: 300 },
      { click: '#theme', wait: 400 },
      { click: '#deploy', wait: 600 },
      { camera: { sel: '#deploy-panel', zoom: 2 }, accent: '#D03A3A', wait: 800 },
      { highlight: '#rollback-countdown', note: 'armed', wait: 1500 },
    ];
    const stepsPath = join(dir, 'steps.json');
    writeFileSync(stepsPath, JSON.stringify(steps));
    const out = join(dir, 'out.mp4');
    execFileSync('node', [REC, 'file://' + DEMO + '?gate=fail', '--steps', stepsPath, out,
      '--width', String(W), '--height', String(H)], { env, stdio: 'pipe' });

    const fdir = join(dir, 'frames');
    execFileSync('node', ['-e', `require('fs').mkdirSync(${JSON.stringify(fdir)},{recursive:true})`]);
    execFileSync(ffmpegPath(), ['-y', '-i', out, '-vf', 'fps=4', join(fdir, 'f%03d.png')], { stdio: 'ignore' });

    let outside = 0, inside = 0;
    for (const name of readdirSync(fdir)) {
      const dec = decodePNGFromFile(join(fdir, name));
      let o = 0, i = 0;
      for (let y = 0; y < dec.height; y++) {
        for (let x = OUT_X0; x < dec.width; x++) if (isAmber(pixelAt(dec, x, y))) o++;
        for (let x = IN_X0; x < IN_X1; x++) if (isAmber(pixelAt(dec, x, y))) i++;
      }
      outside = Math.max(outside, o);
      inside = Math.max(inside, i);
    }
    assert.ok(inside > 300, `the highlight glow must paint inside the card (got ${inside} amber px) — a fix may not delete it`);
    assert.ok(outside < 200, `the highlight glow bled ${outside} amber px past the card edge under zoom`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
