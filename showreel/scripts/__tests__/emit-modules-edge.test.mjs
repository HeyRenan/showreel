// emit-modules-edge.test.mjs — hostile inputs against the pure helpers of the
// CLI/emit modules (cursor-inject, end-card-inject).
// These modules are mostly browser-snippet emitters and screenshot drivers; the
// only deterministic logic worth locking is the string builders that take inputs
// and return a string with no FS/browser/subprocess. A failure here is a real
// injection or geometry bug, not a typo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgba, buildCursorSnippet } from '../cursor-inject.mjs';
import { buildEndCardSnippet } from '../end-card-inject.mjs';

// ── hexToRgba: 3- vs 6-digit expansion + alpha passthrough ─────────────────
test('hexToRgba: 6-digit hex parses each channel; alpha is verbatim', () => {
  assert.equal(hexToRgba('#16a34a', 0.18), 'rgba(22,163,74,0.18)');
});

test('hexToRgba: 3-digit hex is expanded to 6 before parsing', () => {
  // #abc -> aabbcc; this is the shorthand authors actually type.
  assert.equal(hexToRgba('#abc', 1), 'rgba(170,187,204,1)');
});

test('hexToRgba: a missing leading # is tolerated', () => {
  assert.equal(hexToRgba('ffffff', 0.5), 'rgba(255,255,255,0.5)');
});

test('hexToRgba: malformed hex yields NaN channels (documented), never throws', () => {
  // KNOWN trade-off: the helper does no validation. A too-short hex parses the
  // missing channel as NaN rather than crashing — the bad color shows up loud
  // in the emitted snippet, which is preferable to an exception in the CLI.
  assert.equal(hexToRgba('#ff', 0.18), 'rgba(255,NaN,NaN,0.18)');
  assert.doesNotThrow(() => hexToRgba('', 1));
});

// ── buildCursorSnippet: numbers + color baked into emitted source ───────────
test('buildCursorSnippet: size/ripple numbers are interpolated into the source', () => {
  const s = buildCursorSnippet({ color: '#16a34a', size: 30, rippleMs: 750, rippleMax: 110 });
  assert.match(s, /width:30px;height:30px/);     // cursor size
  assert.match(s, /dur = 750, max = 110/);        // ripple timing
  assert.match(s, /border:5px solid #16a34a/);    // ring uses the raw color
  assert.match(s, /background:rgba\(22,163,74,0\.18\)/); // fill is the .18 rgba
});

test('buildCursorSnippet: a quote in the color cannot break out of the cssText', () => {
  // color is baked raw into a single-quoted cssText; a stray quote would corrupt
  // the injected snippet. safeColor charset-strips it (end-card JSON-encodes its
  // text for the same reason). Valid colors pass through untouched.
  const s = buildCursorSnippet({ color: "red';alert(1);'", size: 28, rippleMs: 750, rippleMax: 110 });
  const seg = s.match(/solid ([^;]*);background/);
  assert.ok(seg && !seg[1].includes("'"), 'no quote survives in the baked color');
  assert.match(buildCursorSnippet({ color: 'rebeccapurple', size: 28, rippleMs: 1, rippleMax: 2 }), /solid rebeccapurple;/);
  assert.match(buildCursorSnippet({ color: 'rgb(1,2,3)', size: 28, rippleMs: 1, rippleMax: 2 }), /solid rgb\(1,2,3\);/);
});

test('buildCursorSnippet: the emitted snippet is a self-invoking IIFE', () => {
  // it gets pasted straight into page.evaluate(); it must be one callable expr.
  const s = buildCursorSnippet({ color: '#000', size: 28, rippleMs: 1, rippleMax: 2 });
  assert.ok(s.startsWith('(() => {'));
  assert.ok(s.trimEnd().endsWith('})()'));
});

// ── buildEndCardSnippet: JSON-encoded text + conditional note branch ────────
test('buildEndCardSnippet: text is JSON-encoded so quotes cannot break out', () => {
  const s = buildEndCardSnippet('"DONE"\nx', '');
  // the newline + quotes survive as a single safe JS string literal
  assert.match(s, /card\.textContent = "\\"DONE\\"\\nx"/);
});

test('buildEndCardSnippet: an empty note omits the subtitle node entirely', () => {
  // the `if (${N})` guard with N === "" is falsy -> no subtitle is appended.
  const s = buildEndCardSnippet('END', '');
  assert.match(s, /if \(""\)/);
});

test('buildEndCardSnippet: a non-empty note is appended and JSON-encoded', () => {
  const s = buildEndCardSnippet('END', 'cart stays in sync');
  assert.match(s, /if \("cart stays in sync"\)/);
  assert.match(s, /s\.textContent = "cart stays in sync"/);
});

test('buildEndCardSnippet: output is a self-invoking IIFE', () => {
  const s = buildEndCardSnippet('END', '');
  assert.ok(s.startsWith('(() => {'));
  assert.ok(s.trimEnd().endsWith('})()'));
});
