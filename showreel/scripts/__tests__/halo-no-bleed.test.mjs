// halo-no-bleed.test.mjs — render-real regression guard for the halo bleed bug.
//
// applyHighlight was clipped to its card (commit 0fb0d20) so its band can't
// escape under a camera zoom. The shake halo is a RECTANGLE (glass ring + bg +
// glow) sized to the target plus a gap — on a wide control under a 2x camera
// zoom that rectangle reached far past the card's right edge, spilling a red
// haze onto the page beside the Ship panel (visible in the showcase).
//
// A headless simulation of the zoom (static transform / will-change) does NOT
// reproduce it: the real bug only shows under the camera's ANIMATED CSS
// transition on <body>. So this test drives the REAL pipeline — rec.mjs renders
// a minimal roster that zooms #deploy-panel then shakes #deploy, exactly the
// showcase condition — extracts video frames, and asserts no accent-red paints
// past the card's right edge. Slower, but the only faithful check. GUARDED:
// skips cleanly when chromium or ffmpeg are absent.

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
// The Ship/deploy-panel card sits in the right column. Once #deploy-panel is
// zoomed 2x and centred, the card's right edge lands around 86% of the frame
// width, so the strip from 90% to the frame edge is OUTSIDE the card, over the
// page gutter. Any accent-red there is bleed. (Measured: with the halo clipped,
// red past 90% drops to 0; the unclipped halo paints ~1600 px there. The 80%
// strip is NOT safe — under this zoom the card still covers it, so the halo's
// own in-card area reads there and would mask a real fix.)
const STRIP_X0 = Math.floor(W * 0.90);
// the band JUST INSIDE the card edge, where the halo legitimately paints — used
// to prove a fix clips the overhang without deleting the halo itself.
const INSIDE_X0 = Math.floor(W * 0.55), INSIDE_X1 = Math.floor(W * 0.86);

// red = the #D03A3A accent the shake halo carries, well clear of the demo's
// own muted greens and inks.
const isRed = (c) => c.r > 150 && c.r - c.g > 45 && c.r - c.b > 45;

function renderBleed() {
  const dir = mkdtempSync(join(tmpdir(), 'showreel-halo-'));
  try {
    // light surface (click #theme) reproduces the showcase condition where the
    // bug shows: a light card on a light page, so any accent-red on the page to
    // the right of the card is unambiguous bleed (in dark mode the Ship panel's
    // own dark fill reaches that strip and confounds the measurement).
    const steps = [
      { screen: 'Ship', wait: 300 },
      { click: '#theme', wait: 400 },
      { camera: { sel: '#deploy-panel', zoom: 2 }, accent: '#D03A3A', wait: 800 },
      { shake: '#deploy', wait: 1200 },
    ];
    const stepsPath = join(dir, 'steps.json');
    writeFileSync(stepsPath, JSON.stringify(steps));
    const out = join(dir, 'out.mp4');
    execFileSync('node', [
      REC, 'file://' + DEMO + '?gate=fail', '--steps', stepsPath, out,
      '--width', String(W), '--height', String(H),
    ], { env, stdio: 'pipe' });

    // sample frames across the shake (1 fps over the whole reel) and take the
    // worst — the halo grows and fades, so a single frame can miss the peak.
    const fdir = join(dir, 'frames');
    execFileSync('node', ['-e', `require('fs').mkdirSync(${JSON.stringify(fdir)},{recursive:true})`]);
    execFileSync(ffmpegPath(), ['-y', '-i', out, '-vf', 'fps=4', join(fdir, 'f%03d.png')], { stdio: 'ignore' });

    // Two measurements per frame, worst taken across the reel:
    //  outside — accent-red strictly RIGHT of the card edge (bleed; must be ~0)
    //  inside  — accent-red in the band just LEFT of the card edge, over the
    //            halo's own area (presence; a fix that deletes the halo drops
    //            this to 0 and must FAIL — clipping the bleed must not erase the
    //            effect inside the card).
    let outside = 0, inside = 0;
    for (const name of readdirSync(fdir)) {
      const dec = decodePNGFromFile(join(fdir, name));
      let out = 0, ins = 0;
      const inX0 = INSIDE_X0, inX1 = INSIDE_X1; // halo band inside the card
      for (let y = 0; y < dec.height; y++) {
        for (let x = STRIP_X0; x < dec.width; x++) if (isRed(pixelAt(dec, x, y))) out++;
        for (let x = inX0; x < inX1; x++) if (isRed(pixelAt(dec, x, y))) ins++;
      }
      outside = Math.max(outside, out);
      inside = Math.max(inside, ins);
    }
    return { outside, inside };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('shake halo does not bleed past the card edge under a real camera zoom', { skip: SKIP }, () => {
  const { outside, inside } = renderBleed();
  assert.ok(inside > 500, `the shake halo must still render inside the card (got ${inside} accent px) — a fix may not delete the effect`);
  const red = outside;
  // a small tolerance for h.264 chroma fringing on the legitimate in-card edge;
  // the real bug paints thousands of pixels, so anything over ~200 is a bleed.
  assert.ok(red < 200, `shake halo bled ${red} accent pixels onto the page past the card edge`);
});
