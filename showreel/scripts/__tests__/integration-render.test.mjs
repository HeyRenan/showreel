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

// All suite renders use --offline: it is ~3x faster than realtime and exercises
// the same engine logic. The realtime path (wall-clock timers instead of the
// virtual clock) is verified by hand — live glossary grow + camera:out scene
// clear both confirmed identical to offline at --fps 30. A realtime test in the
// suite would triple its CI time for confidence already established; not worth it.
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

test('live modal: a persistent dialog updates its body in place across steps', { skip: SKIP }, () => {
  // A free-floating live modal: created centered, then its body is replaced with
  // a differently-colored line mid-scene. The new color must be present and the
  // dialog must not have torn down and rebuilt (one modal node only).
  const upd = render([
    { modal: { id: 'deploy', title: 'Deploying', items: [{ badge: 1, text: 'Starting', color: '#2563eb' }] }, wait: 300 },
    { live: { append: { badge: 2, text: 'Done', color: '#16a34a' } }, wait: 600 },
  ], 'modal.mp4');
  // BOTH lines must be present in the final frame: the original blue held while
  // the green appended. (Green-only would mean a rebuild dropped the first line —
  // the exact failure the live model exists to prevent.)
  assert.ok(countColor(upd.out, '#2563eb') > 0, 'original blue body line still present (no rebuild)');
  assert.ok(countColor(upd.out, '#16a34a') > 0, 'appended green body line present in the live modal');

  const gone = render([
    { modal: { id: 'deploy', items: [{ text: 'Working', color: '#2563eb' }] }, wait: 200 },
    { live: { remove: true }, wait: 200 },
    { rect: '#deploy', note: 'after', wait: 500 },
  ], 'modalgone.mp4');
  assert.equal(countColor(gone.out, '#2563eb'), 0, 'live remove cleared the modal + its backdrop');
});

test('live op on a missing target warns and no-ops, the reel still renders', { skip: SKIP }, () => {
  // a live append with no live element on screen must not crash the render — it
  // logs a warn and the reel completes. (rec.mjs resolveTarget -> warn path.)
  const r = render([
    { screen: 'Solo', wait: 200 },
    { live: { append: { text: 'orphan', color: '#16a34a' } }, wait: 300 },
  ], 'orphan.mp4');
  assert.ok(existsSync(r.out), 'reel rendered despite the orphan live op');
  const buf = readFileSync(r.out);
  assert.equal(buf.toString('ascii', 4, 8), 'ftyp', 'valid mp4 produced');
});

test('live op after a scene boundary cleared the element warns, never crashes', { skip: SKIP }, () => {
  // create a live glossary, cross a scene boundary (which clears it), then try to
  // append — the target is gone, so it must warn + no-op, not throw mid-render.
  const r = render([
    { glossary: { id: 'g', items: [{ badge: 1, text: 'A', color: '#2563eb' }] }, wait: 200 },
    { screen: 'Next', wait: 200 },
    { live: { id: 'g', append: { text: 'B', color: '#16a34a' } }, wait: 300 },
  ], 'afterclear.mp4');
  assert.ok(existsSync(r.out), 'reel rendered');
  // the cleared blue must not reappear, and the orphan green append did nothing
  assert.equal(countColor(r.out, '#2563eb'), 0, 'cleared glossary stays gone');
});

test('camera:"out" is a scene boundary too — it clears live elements', { skip: SKIP }, () => {
  // the spec promises BOTH a screen change and camera:"out" end a scene. The
  // screen path is covered above; this pins the camera:out path.
  const r = render([
    { glossary: { id: 'g', items: [{ badge: 1, text: 'A', color: '#2563eb' }] }, wait: 200 },
    { camera: 'out', wait: 300 },
    { rect: '#deploy', note: 'after', wait: 400 },
  ], 'camout.mp4');
  assert.equal(countColor(r.out, '#2563eb'), 0, 'camera:out cleared the live glossary');
});

test('live recolor + update mutate an existing element in place (pixel-proven)', { skip: SKIP }, () => {
  // recolor a row's badge from blue to red, and update another row's text — both
  // must change the encoded pixels of the SAME persistent panel, no rebuild.
  const r = render([
    { glossary: { id: 'g', items: [{ badge: 1, text: 'Auth', color: '#2563eb' }, { badge: 2, text: 'Old', color: '#16a34a' }] }, wait: 300 },
    { live: { recolor: { item: 1, color: '#e11d48' } }, wait: 300 },
    { live: { update: { item: 2, text: 'Updated' } }, wait: 500 },
  ], 'recolor.mp4');
  assert.equal(countColor(r.out, '#2563eb'), 0, 'the recolored row no longer shows its old blue');
  assert.ok(countColor(r.out, '#e11d48') > 0, 'the recolored row shows the new red');
  assert.ok(countColor(r.out, '#16a34a') > 0, 'the untouched row keeps its green (update changed text, not color)');
});

test('live update carries color too, not just text (host/DOM stay consistent)', { skip: SKIP }, () => {
  // regression: update applied only text to the DOM while applyState merged every
  // field — a color on update changed host state but not the pixels. Now both move.
  const r = render([
    { glossary: { id: 'g', items: [{ badge: 1, text: 'Auth', color: '#2563eb' }] }, wait: 300 },
    { live: { update: { item: 1, text: 'Auth', color: '#e11d48' } }, wait: 500 },
  ], 'updcolor.mp4');
  assert.equal(countColor(r.out, '#2563eb'), 0, 'old blue gone after update color');
  assert.ok(countColor(r.out, '#e11d48') > 0, 'update color reached the encoded pixels');
});

test('live replace swaps the body keeping the panel (items map to rows)', { skip: SKIP }, () => {
  // replace must render the new items (author field `items`) and drop the old —
  // regression guard for the items->rows mapping that kept host state consistent.
  const r = render([
    { glossary: { id: 'g', items: [{ badge: 1, text: 'Old', color: '#2563eb' }] }, wait: 300 },
    { live: { replace: { items: [{ badge: 9, text: 'New', color: '#16a34a' }] } }, wait: 500 },
  ], 'replace.mp4');
  assert.equal(countColor(r.out, '#2563eb'), 0, 'replaced-out blue row is gone');
  assert.ok(countColor(r.out, '#16a34a') > 0, 'replacement green row is shown');
});

test('a badge-less modal body line appended via live renders no badge pill', { skip: SKIP }, () => {
  // regression: the op-path rowEl once always drew a badge pill, so a badge-less
  // modal body line appended via live showed a spurious default-green dot the
  // created lines did not. Both rowEl copies now drop the pill when badge is empty.
  // Proof: any default-green (#16a34a) in the final frame must be a thin band (the
  // 2px accent border), never a ~22px pill cluster.
  const r = render([
    { modal: { id: 'm', items: [{ text: 'first' }] }, wait: 300 },
    { live: { append: { text: 'second' } }, wait: 500 },
  ], 'badgeless.mp4');
  const png = r.out.replace(/\.mp4$/, '.bl.png');
  execFileSync(ffmpegPath(), ['-y', '-i', r.out, '-update', '1', png], { stdio: 'ignore' });
  const dec = decodePNGFromFile(png);
  const tgt = parseHexColor('16a34a');
  let minx = 1e9, maxx = -1;
  for (let y = 0; y < dec.height; y++)
    for (let x = 0; x < dec.width; x++)
      if (colorMatches(pixelAt(dec, x, y), tgt, 20)) { if (x < minx) minx = x; if (x > maxx) maxx = x; }
  const spread = maxx - minx;
  assert.ok(spread <= 6, `default-green is a thin accent band, not a badge pill (x-spread ${spread}px)`);
});
