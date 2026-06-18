// integration-render.test.mjs — the ONE end-to-end test: drive rec.mjs through
// a real offline render against the bundled demo, then prove the whole pipeline
// (clock + camera + annotate + encode) produced a real artifact. Every other
// suite tests a pure slice in isolation; this is the only one that exercises the
// browser-closure modules (rec-input/motion/annotate/camera/encode) wired
// together. It is GUARDED: if chromium or ffmpeg are absent it skips cleanly, so
// a dev without `ensure-deps` run still gets a green unit suite. CI installs both
// (see ci.yml), so there the render genuinely runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, pixelAt } from '../pngread.mjs';
import { DEPS_DIR, ffmpegPath } from '../ensure-deps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..');
const REPO = join(SCRIPTS, '..', '..');          // outer git root holds assets-src/
const DEMO = join(REPO, 'assets-src', 'demo', 'index.html');
const REC = join(SCRIPTS, 'rec.mjs');

// deps present? chromium under .deps + a runnable ffmpeg + the demo on disk.
function chromiumPresent() {
  const browsers = join(DEPS_DIR, 'ms-playwright');
  try { return readdirSync(browsers).some((d) => d.startsWith('chromium')); }
  catch { return false; }
}
function ffmpegPresent() {
  try { execFileSync(ffmpegPath(), ['-version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}
const READY = chromiumPresent() && ffmpegPresent() && existsSync(DEMO);
const SKIP = READY ? false : 'render deps absent (chromium/ffmpeg/demo) — run ensure-deps.mjs';

const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(DEPS_DIR, 'ms-playwright') };

function render(steps, outName, extraArgs = []) {
  const dir = mkdtempSync(join(tmpdir(), 'showreel-it-'));
  const stepsPath = join(dir, 'steps.json');
  writeFileSync(stepsPath, JSON.stringify(steps));
  const out = join(dir, outName);
  execFileSync('node', [
    REC, 'file://' + DEMO, '--steps', stepsPath, out,
    '--offline', '--ratio', 'free', '--width', '800', '--height', '500',
    ...extraArgs,
  ], { env, stdio: 'pipe' });
  return { dir, out };
}

test('offline render produces a valid mp4 (full pipeline smoke)', { skip: SKIP }, () => {
  const { out } = render(
    [{ screen: 'IT', wait: 300 }, { rect: '#deploy', note: 'Ship it', wait: 400 }],
    'out.mp4',
  );
  assert.ok(existsSync(out), 'mp4 was written');
  const buf = readFileSync(out);
  assert.ok(buf.length > 1000, 'mp4 is non-trivial (' + buf.length + ' bytes)');
  // MP4 starts with an ftyp box: bytes 4..8 == 'ftyp'. Proves a real container,
  // not a truncated/zero-byte file from a half-finished encode.
  assert.equal(buf.toString('ascii', 4, 8), 'ftyp', 'mp4 has an ftyp box header');
});

test('offline render contact-sheet is a decodable PNG with real content', { skip: SKIP }, () => {
  // The contact sheet is the one render artifact our own (tested) decoder can
  // read, so it closes the loop: pipeline output -> decodePNG -> pixel assert.
  const sheetDir = mkdtempSync(join(tmpdir(), 'showreel-sheet-'));
  const sheet = join(sheetDir, 'sheet.png');
  render(
    [{ screen: 'IT', wait: 300 }, { rect: '#deploy', note: 'Ship it', wait: 400 }],
    'out.mp4',
    ['--contact-sheet', sheet], // absolute: the sheet path is resolved from cwd
  );
  assert.ok(existsSync(sheet), 'contact sheet PNG was written');
  const dec = decodePNG(readFileSync(sheet));
  assert.ok(dec.width > 100 && dec.height > 100, 'sheet has real dimensions');
  assert.ok([3, 4].includes(dec.channels), 'sheet is RGB or RGBA');
  // not a flat fill: sample a spread of pixels, demand more than one distinct
  // color. A solid-color sheet means the render captured nothing.
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const x = Math.floor((i / 40) * (dec.width - 1));
    const y = Math.floor(((i * 7) % 40) / 40 * (dec.height - 1));
    const p = pixelAt(dec, x, y);
    seen.add(p.r + ',' + p.g + ',' + p.b);
  }
  assert.ok(seen.size > 1, 'sheet is not a single flat color (' + seen.size + ' distinct sampled)');
});

test('a roster with an off-screen anchor is rejected before render', { skip: SKIP }, () => {
  // the pre-flight PLACE gate must refuse a selector that does not exist on the
  // page, rather than silently rendering an empty marker. rec exits non-zero.
  assert.throws(() => render(
    [{ rect: '#this-selector-does-not-exist-anywhere', note: 'nope', wait: 200 }],
    'out.mp4',
  ), /Command failed|exited|status/i);
});
