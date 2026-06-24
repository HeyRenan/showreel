// progress-renders.test.mjs — render-real guard that the progress rail actually
// paints on a content-flush node (a pipeline stage whose last child is a status
// chip). The old rail sat ON TOP of that chip and read as "nothing happened";
// the fix drops it to a clean under-lane. This asserts the accent rail truly
// rasterizes (regression guard for "the progress bar doesn't work").
// GUARDED: skips cleanly when chromium/ffmpeg/demo are absent.

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

const W = 1280, H = 720;
// the bright accent fill, rgb(74,222,128) — well clear of the demo's muted
// chip/checkmark greens (which are smaller and darker).
const isRailGreen = (c) => c.g > 180 && c.g - c.r > 60 && c.g - c.b > 40;

function renderProgress() {
  const dir = mkdtempSync(join(tmpdir(), 'showreel-prog-'));
  try {
    const steps = [{ progress: '#stage-deploy', note: 'Rollout fills as the stage completes', wait: 2000 }];
    const stepsPath = join(dir, 'steps.json');
    writeFileSync(stepsPath, JSON.stringify(steps));
    const out = join(dir, 'out.mp4');
    execFileSync('node', [
      REC, 'file://' + DEMO, '--steps', stepsPath, out,
      '--width', String(W), '--height', String(H), '--ratio', 'free',
    ], { env, stdio: 'pipe' });

    const fdir = join(dir, 'frames');
    execFileSync('node', ['-e', `require('fs').mkdirSync(${JSON.stringify(fdir)},{recursive:true})`]);
    execFileSync(ffmpegPath(), ['-y', '-i', out, '-vf', 'fps=4', join(fdir, 'f%03d.png')], { stdio: 'ignore' });

    // the rail fills then fades — take the frame with the most accent-green.
    let railPixels = 0;
    for (const name of readdirSync(fdir)) {
      const dec = decodePNGFromFile(join(fdir, name));
      let g = 0;
      for (let y = 0; y < dec.height; y++)
        for (let x = 0; x < dec.width; x++) if (isRailGreen(pixelAt(dec, x, y))) g++;
      railPixels = Math.max(railPixels, g);
    }
    return railPixels;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('progress rail rasterizes on a content-flush node', { skip: SKIP }, () => {
  const railPixels = renderProgress();
  // a filled rail is a wide accent bar — thousands of px. The demo's own chips
  // and checkmarks contribute only a few hundred muted-green px.
  assert.ok(railPixels > 1500, `progress rail should render as a visible accent bar (got ${railPixels} accent-green px)`);
});
