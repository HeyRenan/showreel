// beautify.test.mjs — pure logic of the frame compositor. The in-page canvas
// draw (Browser.beautify) is browser-bound and out of scope; this probes the
// pure geometry (frameLayout), background resolution, and the CLI parser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../beautify.mjs';
import { frameLayout, resolveBackground, RATIOS } from '../beautify-frame.mjs';

// ── parse ──────────────────────────────────────────────────────────────────
test('parse: defaults stand, empty argv binds no input', () => {
  const a = parse([]);
  assert.equal(a.frame, 'window');
  assert.equal(a.pad, 64);
  assert.equal(a.radius, 14);
  assert.equal(a.ratio, 'free');
  assert.equal(a.shadow, true);
  assert.equal(a.in, undefined);
});

test('parse: binds in/out and all flags', () => {
  const a = parse(['shot.png', 'out.png', '--frame', 'card', '--bg', '#fff,#000', '--pad', '40', '--radius', '8', '--url', 'acme.com', '--ratio', '16:9', '--no-shadow']);
  assert.equal(a.in, 'shot.png');
  assert.equal(a.out, 'out.png');
  assert.equal(a.frame, 'card');
  assert.equal(a.bg, '#fff,#000');
  assert.equal(a.pad, 40);
  assert.equal(a.radius, 8);
  assert.equal(a.url, 'acme.com');
  assert.equal(a.ratio, '16:9');
  assert.equal(a.shadow, false);
});

test('parse: surplus positional + unknown flag + bad number throw', () => {
  assert.throws(() => parse(['a.png', 'b.png', 'c.png']), /too many positional/);
  assert.throws(() => parse(['a.png', '--nope']), /unknown arg/);
  assert.throws(() => parse(['a.png', '--pad', 'abc']), /--pad must be a number/);
});

// ── frameLayout ──────────────────────────────────────────────────────────────
test('frameLayout: window frame adds a chrome bar above the image', () => {
  const L = frameLayout(800, 600, { frame: 'window', pad: 50, radius: 12, ratio: 'free' });
  assert.ok(L.chromeH > 0, 'window has a chrome bar');
  assert.equal(L.imgW, 800);
  assert.equal(L.imgH, 600);
  assert.equal(L.imgY, L.winY + L.chromeH);
  assert.equal(L.winH, L.chromeH + 600);
  // free ratio: canvas hugs window + padding on both axes
  assert.equal(L.canvasW, 800 + 100);
  assert.equal(L.canvasH, L.chromeH + 600 + 100);
  assert.equal(L.radius, 12);
});

test('frameLayout: card has no chrome bar, minimal has no radius', () => {
  const card = frameLayout(400, 300, { frame: 'card', pad: 20, radius: 16, ratio: 'free' });
  assert.equal(card.chromeH, 0);
  assert.equal(card.imgY, card.winY);
  assert.equal(card.radius, 16);
  const min = frameLayout(400, 300, { frame: 'minimal', pad: 20, radius: 16, ratio: 'free' });
  assert.equal(min.chromeH, 0);
  assert.equal(min.radius, 0);
});

test('frameLayout: ratio enlarges (never crops) and centers the window', () => {
  const wide = frameLayout(400, 600, { frame: 'card', pad: 0, ratio: '16:9' });
  assert.ok(Math.abs(wide.canvasW / wide.canvasH - 16 / 9) < 0.02, 'canvas is ~16:9');
  assert.ok(wide.canvasW >= 400 && wide.canvasH >= 600, 'never smaller than the window');
  assert.equal(wide.winX, Math.round((wide.canvasW - wide.winW) / 2), 'window centered horizontally');

  const tall = frameLayout(600, 400, { frame: 'card', pad: 0, ratio: '9:16' });
  assert.ok(Math.abs(tall.canvasW / tall.canvasH - 9 / 16) < 0.02, 'canvas is ~9:16');

  const sq = frameLayout(600, 400, { frame: 'card', pad: 0, ratio: '1:1' });
  assert.ok(Math.abs(sq.canvasW / sq.canvasH - 1) < 0.02, 'canvas is ~1:1');
});

test('frameLayout: hostile input clamps to a 1px floor, never throws', () => {
  const L = frameLayout(0, -5, {});
  assert.ok(L.canvasW >= 1 && L.canvasH >= 1);
  assert.equal(L.imgW, 1);
  assert.equal(L.imgH, 1);
});

test('frameLayout: unknown ratio falls back to free (no enlargement)', () => {
  const L = frameLayout(300, 200, { frame: 'minimal', pad: 10, ratio: 'banana' });
  assert.equal(L.canvasW, 300 + 20);
  assert.equal(L.canvasH, 200 + 20);
  assert.equal(RATIOS.free, null);
});

// ── resolveBackground ────────────────────────────────────────────────────────
test('resolveBackground: array, csv string, single, and empty fallback', () => {
  assert.deepEqual(resolveBackground(['#a', '#b']), ['#a', '#b']);
  assert.deepEqual(resolveBackground('#a,#b'), ['#a', '#b']);
  assert.deepEqual(resolveBackground('#solid'), ['#solid']);
  assert.equal(resolveBackground('').length, 2, 'empty → default 2-stop gradient');
  assert.equal(resolveBackground(undefined).length, 2);
  assert.equal(resolveBackground(['#a', '#b', '#c']).length, 2, 'capped at 2 stops');
});
