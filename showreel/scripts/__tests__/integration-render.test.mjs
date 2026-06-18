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
import { decodePNG, decodePNGFromFile, pixelAt, parseHexColor, colorMatches } from '../pngread.mjs';
import { DEFAULT_MARKER_HEX } from '../annotate.mjs';
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

// pull the LAST frame of the rendered mp4 to a PNG (the held closing frame),
// then count pixels matching the marker color within tol. The last frame is the
// dwell on the final annotated step, so a drawn marker is guaranteed visible.
// tol 15: tight enough that the demo's own muted greens do NOT match, loose
// enough to survive h.264 chroma subsampling on the pure marker stroke. Probed
// empirically — at tol 40 the demo UI swamps the signal; at tol 8 the encode
// dilutes the stroke below threshold. 15 cleanly separates marked from plain.
function markerPixelsInLastFrame(mp4) {
  const png = mp4.replace(/\.mp4$/, '.frame.png');
  execFileSync(ffmpegPath(), ['-y', '-i', mp4, '-update', '1', png], { stdio: 'ignore' }); // -update 1 overwrites per frame, leaving the true last
  const dec = decodePNGFromFile(png);
  const tgt = parseHexColor(DEFAULT_MARKER_HEX);
  let hits = 0;
  for (let y = 0; y < dec.height; y++)
    for (let x = 0; x < dec.width; x++)
      if (colorMatches(pixelAt(dec, x, y), tgt, 15)) hits++;
  return hits;
}

// count pixels matching an arbitrary hex in the last frame (tol 15, same as the
// marker helper). Used to prove a specific live row color reached the encode.
function countColor(mp4, hex) {
  const png = mp4.replace(/\.mp4$/, '.cc.png');
  execFileSync(ffmpegPath(), ['-y', '-i', mp4, '-update', '1', png], { stdio: 'ignore' }); // -update 1 overwrites per frame, leaving the true last
  const dec = decodePNGFromFile(png);
  const tgt = parseHexColor(hex);
  let hits = 0;
  for (let y = 0; y < dec.height; y++)
    for (let x = 0; x < dec.width; x++)
      if (colorMatches(pixelAt(dec, x, y), tgt, 15)) hits++;
  return hits;
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

test('the marker actually paints: a rect step shows green, a screen-only step does not', { skip: SKIP }, () => {
  // The strongest pipeline proof: not "the video has content" but "the green
  // annotation reached the encoded pixels." Differential, so it cannot pass by
  // accident on the demo's own colors — a rect reel must show MORE marker green
  // in its final frame than a plain screen reel with no annotation at all.
  const withMark = render(
    [{ screen: 'IT', wait: 200 }, { rect: '#deploy', note: 'Ship it', wait: 500 }],
    'mark.mp4',
  );
  const noMark = render(
    [{ screen: 'IT', wait: 200 }, { wait: 500 }],
    'plain.mp4',
  );
  const marked = markerPixelsInLastFrame(withMark.out);
  const plain = markerPixelsInLastFrame(noMark.out);
  assert.ok(marked > 0, 'the rect marker painted real marker-green pixels (' + marked + ')');
  assert.ok(marked > plain, `marker reel (${marked}) must exceed the unannotated reel (${plain})`);
});

test('live glossary: append grows the panel in place, scene boundary clears it', { skip: SKIP }, () => {
  // The live-elements proof. Distinct hues so the assertion cannot pass on the
  // demo's own colors: a blue first row + a green appended row must BOTH be
  // present in the same final frame (old row held while the new one appended,
  // no rebuild). A second reel proves a screen change clears the live panel.
  const grown = render([
    { glossary: { id: 'feat', title: 'Shipped', items: [{ badge: 1, text: 'Auth', color: '#2563eb' }] }, wait: 300 },
    { live: { append: { badge: 2, text: 'Cache', color: '#16a34a' } }, wait: 600 },
  ], 'grown.mp4');
  const blue = countColor(grown.out, '#2563eb');
  const green = countColor(grown.out, '#16a34a');
  assert.ok(blue > 0, 'first (blue) row still present after append (' + blue + ')');
  assert.ok(green > 0, 'appended (green) row present (' + green + ')');

  const cleared = render([
    { glossary: { id: 'feat', items: [{ badge: 1, text: 'Auth', color: '#2563eb' }] }, wait: 200 },
    { screen: 'Next', wait: 600 },
  ], 'cleared.mp4');
  assert.equal(countColor(cleared.out, '#2563eb'), 0, 'scene boundary cleared the live glossary');
});
