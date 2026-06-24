// spotlight-note-contrast.test.mjs — render-real guard for the spotlight note
// dim-on-dark bug.
//
// A spotlight dims the whole frame except a lit window on the target. A `note`
// that lands on that dimmed field must pick its pill colour against the EFFECTIVE
// surface (page darkened by the dim), not the bright page underneath. The colour
// picker samples the page with elementFromPoint, but the dim overlay is
// pointer-events:none — so on a light page it reads "light surface" and paints a
// glaring WHITE pill on a dark scene (and, with the old global-theme path, a dark
// ink that vanished). Same grammar, two placements, two looks.
//
// A static headless probe can't see this: the dim's effect on the note is a
// real-render concern. So this drives the REAL pipeline — rec.mjs renders a
// light page with one spotlight+note step, extracts frames, and asserts the note
// pill resolved DARK (navy, light ink) against the dimmed surface, not white.
// GUARDED: skips cleanly when chromium or ffmpeg are absent.

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
const REC = join(SCRIPTS, 'rec.mjs');
const BROWSERS = join(DEPS_DIR, 'ms-playwright');

function chromiumPresent() {
  try { return readdirSync(BROWSERS).some((d) => d.startsWith('chromium')); } catch { return false; }
}
function ffmpegPresent() {
  try { execFileSync(ffmpegPath(), ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}
const READY = chromiumPresent() && ffmpegPresent();
const SKIP = READY ? false : 'render deps absent (chromium/ffmpeg) — run ensure-deps.mjs';
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS };

const W = 1280, H = 720;

// the target sits at y=340; with an arrow the note settles ABOVE it, around
// y≈246. This band brackets that note row and excludes the lit window + arrow +
// accent ring (all below y=300), so every coloured pixel here belongs to the
// note pill itself.
const BAND_Y0 = 200, BAND_Y1 = 300;

// the dark-theme note pill is rgba(17,26,44,.97) → ~navy once composited. The
// light page (#eef2f9) under the .66 dim is mid-grey (~rgb 90), and the lit
// window is bright — neither matches navy.
const isNavyPill = (c) => c.r < 45 && c.g < 60 && c.b < 80 && c.b >= c.r;
// a white pill is the broken look: a glaring light box on the dimmed scene.
const isWhitePill = (c) => c.r > 235 && c.g > 235 && c.b > 235;

function renderNote() {
  const dir = mkdtempSync(join(tmpdir(), 'showreel-spot-'));
  try {
    const page = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#eef2f9;width:${W}px;height:${H}px">
<button id="btn" style="position:absolute;left:560px;top:340px;width:160px;height:48px;border:0;border-radius:10px;background:#16a34a;color:#fff;font:700 16px system-ui">Deploy</button>
</body></html>`;
    const pagePath = join(dir, 'page.html');
    writeFileSync(pagePath, page);

    const steps = [{ spotlight: '#btn', note: 'Ship the build to production', arrow: true, wait: 1200 }];
    const stepsPath = join(dir, 'steps.json');
    writeFileSync(stepsPath, JSON.stringify(steps));
    const out = join(dir, 'out.mp4');
    execFileSync('node', [
      REC, 'file://' + pagePath, '--steps', stepsPath, out,
      '--width', String(W), '--height', String(H), '--ratio', 'free',
    ], { env, stdio: 'pipe' });

    const fdir = join(dir, 'frames');
    execFileSync('node', ['-e', `require('fs').mkdirSync(${JSON.stringify(fdir)},{recursive:true})`]);
    execFileSync(ffmpegPath(), ['-y', '-i', out, '-vf', 'fps=4', join(fdir, 'f%03d.png')], { stdio: 'ignore' });

    // the note fades in and holds — take the frame with the strongest pill signal.
    let navy = 0, white = 0;
    for (const name of readdirSync(fdir)) {
      const dec = decodePNGFromFile(join(fdir, name));
      let n = 0, w = 0;
      for (let y = BAND_Y0; y < BAND_Y1; y++)
        for (let x = 0; x < dec.width; x++) {
          const c = pixelAt(dec, x, y);
          if (isNavyPill(c)) n++;
          else if (isWhitePill(c)) w++;
        }
      navy = Math.max(navy, n);
      white = Math.max(white, w);
    }
    return { navy, white };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('spotlight note resolves a dark pill against the dimmed surface, not a white box', { skip: SKIP }, () => {
  const { navy, white } = renderNote();
  // the note pill must actually render — a fix may not delete the note.
  assert.ok(navy > 1500, `spotlight note pill should be a dark navy surface (got ${navy} navy px) — judged against the dimmed scene`);
  // and it must NOT be the glaring white box the bright-page verdict produced.
  // (a few hundred near-white px are the light INK glyphs on the navy pill; a
  // white PILL background is thousands — that gap is the bug signal.)
  assert.ok(white < 3000, `spotlight note rendered a white pill (${white} px) — the dim was ignored when picking its surface`);
});
