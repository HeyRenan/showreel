// emit-modules-edge.test.mjs — hostile inputs against the pure helpers of the
// CLI/emit modules (before-after, cursor-inject, capture, end-card-inject).
// These modules are mostly browser-snippet emitters and screenshot drivers; the
// only deterministic logic worth locking is the string builders that take inputs
// and return a string with no FS/browser/subprocess. A failure here is a real
// injection or geometry bug, not a typo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, buildBeforeAfterHtml } from '../before-after.mjs';
import { hexToRgba, buildCursorSnippet } from '../cursor-inject.mjs';
import { prepFn, scrollFn } from '../capture.mjs';
import { buildEndCardSnippet } from '../end-card-inject.mjs';

// ── esc: HTML escaping of argv-sourced labels ──────────────────────────────
test('esc: the five markup-significant chars all become entities', () => {
  // labels are interpolated raw into rendered HTML; a stray < or " would inject.
  assert.equal(esc(`<b>"x"&'y'`), '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;');
});

test('esc: a closing figure/script tag in a label cannot break out', () => {
  // the real attack: a label ending the surrounding markup early.
  assert.equal(esc('</figure><script>alert(1)</script>'),
    '&lt;/figure&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('esc: non-string input is coerced, never throws', () => {
  // argv is always strings, but the default-param path can pass undefined.
  assert.equal(esc(undefined), 'undefined');
  assert.equal(esc(5), '5');
  assert.equal(esc(null), 'null');
});

// ── buildBeforeAfterHtml: payload + label placement ────────────────────────
test('buildBeforeAfterHtml: both base64 payloads land in their img src', () => {
  const html = buildBeforeAfterHtml('AAAA', 'BBBB');
  assert.match(html, /base64,AAAA"/);
  assert.match(html, /base64,BBBB"/);
});

test('buildBeforeAfterHtml: labels default to BEFORE/AFTER and are escaped', () => {
  assert.match(buildBeforeAfterHtml('a', 'b'), />BEFORE</);
  assert.match(buildBeforeAfterHtml('a', 'b'), />AFTER</);
  // a hostile label is escaped inside the caption, not injected
  assert.match(buildBeforeAfterHtml('a', 'b', '<x>', 'ok'), />&lt;x&gt;</);
});

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

test('buildCursorSnippet: the emitted snippet is a self-invoking IIFE', () => {
  // it gets pasted straight into page.evaluate(); it must be one callable expr.
  const s = buildCursorSnippet({ color: '#000', size: 28, rippleMs: 1, rippleMax: 2 });
  assert.ok(s.startsWith('(() => {'));
  assert.ok(s.trimEnd().endsWith('})()'));
});

// ── prepFn / scrollFn: selector is baked via JSON.stringify (no break-out) ──
test('prepFn: a selector with quotes is JSON-encoded, not concatenated raw', () => {
  // a selector like [data-x="y"] must not terminate the JS string literal.
  const fn = prepFn('[data-x="y\'z"]', '#000', 24);
  // JSON.stringify wraps the whole selector in a quoted string with " escaped.
  assert.match(fn, /SEL="\[data-x=\\"y'z\\"\]"/);
  assert.ok(!fn.includes('SEL=[data-x="y')); // never the raw unquoted form
});

test('prepFn: bg and pad are baked as their JSON values', () => {
  const fn = prepFn('.x', '#0d1117', 24);
  assert.match(fn, /BG="#0d1117"/);
  assert.match(fn, /PAD=24/);
});

test('prepFn: the emitted fn is a no-arg arrow (the only cross-MCP channel)', () => {
  const fn = prepFn('.x', '#000', 0);
  assert.ok(fn.startsWith('()=>{'));
});

test('scrollFn: selector JSON-encoded and pad subtracted in the math', () => {
  const fn = scrollFn('#a"b', 16);
  assert.match(fn, /querySelector\("#a\\"b"\)/); // quote inside id is escaped
  assert.match(fn, /window\.scrollY-16/);          // pad folded into the offset
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
