// demo-camera-edge.test.mjs — hostile inputs against demo.mjs's argv parser, plus
// a note on why rec-camera.mjs has no further node-pure surface to probe.
//
// Style mirrors edge-cases.test.mjs (the rec-steps parse tests): feed malformed
// argv, assert clean throws with named flags, pin precedence and falsy-but-valid
// handling. A failure here is a real bug, not a typo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../demo.mjs';
import { FRAME, makeCamera } from '../rec-camera.mjs';

// ── parse: defaults + happy positionals ────────────────────────────────────
test('parse: empty argv yields documented defaults, no positionals', () => {
  const a = parse([]);
  assert.equal(a.width, 1280);
  assert.equal(a.height, 900);
  assert.equal(a.kind, 'rect');
  assert.equal(a.url, undefined);
  assert.equal(a.selector, undefined);
  assert.equal(a.out, undefined);
});

test('parse: three positionals fill url/selector/out in order', () => {
  const a = parse(['http://x', '#sel', 'out.png']);
  assert.equal(a.url, 'http://x');
  assert.equal(a.selector, '#sel');
  assert.equal(a.out, 'out.png');
});

test('parse: batch mode takes exactly the url positional', () => {
  const a = parse(['http://x', '--batch', 'jobs.json']);
  assert.equal(a.batch, 'jobs.json');
  assert.equal(a.url, 'http://x');
  assert.equal(a.selector, undefined);
  assert.equal(a.out, undefined);
});

// ── parse: too-many-positionals guard (the bug this file caught) ────────────
test('parse: a FOURTH positional throws instead of silently dropping it', () => {
  // BUG (fixed): demo.parse used `[url, selector, out] = pos`, which silently
  // discarded any 4th+ token — the classic "unquoted selector with spaces"
  // footgun that rec-steps' parse already guards. The extra token must surface
  // as an error, never vanish.
  assert.throws(() => parse(['a', 'b', 'c', 'd']), /too many positional/);
});

test('parse: batch mode rejects a stray second positional', () => {
  // batch expects ONLY the url; a leftover selector/out is a mistake, not silent
  assert.throws(() => parse(['a', 'b', '--batch', 'jobs.json']), /too many positional/);
});

test('parse: the overflow error echoes the dropped tokens and the quoting hint', () => {
  assert.throws(() => parse(['a', 'b', 'c', 'extra one']), (e) => {
    assert.match(e.message, /extra one/);
    assert.match(e.message, /quote a value with spaces/);
    return true;
  });
});

// ── parse: flag value capture, missing values, flag-shaped values ──────────
test('parse: --kind/--text/--batch capture their following value', () => {
  const a = parse(['u', 's', 'o', '--kind', 'circle', '--text', 'Hello']);
  assert.equal(a.kind, 'circle');
  assert.equal(a.text, 'Hello');
});

test('parse: a string flag with no following value throws (names the flag)', () => {
  // str() rejects a missing value rather than swallowing the next token
  assert.throws(() => parse(['u', 's', 'o', '--text']), /--text needs a value/);
  assert.throws(() => parse(['u', 's', 'o', '--kind']), /--kind needs a value/);
  assert.throws(() => parse(['u', '--batch']), /--batch needs a value/);
});

test('parse: a flag-shaped value to a string flag is rejected, not consumed', () => {
  // contrast with rec-steps' --storage-state, which consumes "--weird" verbatim:
  // demo routes string flags through str(), which refuses a /^--/ value so a
  // dropped argument (`--kind --text X`) fails loud instead of mis-binding.
  assert.throws(() => parse(['u', 's', 'o', '--kind', '--text', 'X']), /--kind needs a value/);
});

// ── parse: numeric flags validate at the point of parse ────────────────────
test('parse: --width/--height accept valid integers', () => {
  const a = parse(['u', 's', 'o', '--width', '800', '--height', '600']);
  assert.equal(a.width, 800);
  assert.equal(a.height, 600);
});

test('parse: non-numeric, zero, and missing numeric values throw clearly', () => {
  assert.throws(() => parse(['u', 's', 'o', '--width', 'abc']), /--width must be a number/);
  assert.throws(() => parse(['u', 's', 'o', '--width', '0']), /--width must be >= 1/);
  assert.throws(() => parse(['u', 's', 'o', '--height', '-5']), /--height must be >= 1/);
  assert.throws(() => parse(['u', 's', 'o', '--width']), /--width needs a number/);
});

test('parse: a fractional dimension is rejected (int required)', () => {
  assert.throws(() => parse(['u', 's', 'o', '--width', '12.5']), /whole number/);
});

// ── parse: unknown flags + duplicate flags (precedence) ─────────────────────
test('parse: an unknown flag throws and names itself', () => {
  assert.throws(() => parse(['u', 's', 'o', '--nope']), /unknown arg --nope/);
});

test('parse: a consumed value is never re-scanned as a flag', () => {
  // "circle" follows --kind and must not be treated as a positional or flag
  const a = parse(['u', 's', 'o', '--kind', 'circle']);
  assert.equal(a.kind, 'circle');
  assert.equal(a.out, 'o');
});

test('parse: duplicate flags — last occurrence wins', () => {
  assert.equal(parse(['u', 's', 'o', '--kind', 'rect', '--kind', 'blur']).kind, 'blur');
  assert.equal(parse(['u', 's', 'o', '--width', '800', '--width', '1024']).width, 1024);
});

// ── parse: flags interleaved with positionals ──────────────────────────────
test('parse: flags may appear before, between, or after positionals', () => {
  const a = parse(['--kind', 'label', 'u', '--text', 'T', 's', 'o', '--width', '700']);
  assert.equal(a.url, 'u');
  assert.equal(a.selector, 's');
  assert.equal(a.out, 'o');
  assert.equal(a.kind, 'label');
  assert.equal(a.text, 'T');
  assert.equal(a.width, 700);
});

// ── rec-camera: node-pure surface assessment ───────────────────────────────
// makeCamera(rctx) returns six methods (ensureCam, camTo, camFrame, initialFit,
// panToInclude, camOut). Every one is async and its first act is safeEval(...),
// i.e. all real logic — the fit/no-crop/clamp math — executes inside the browser
// page via page.evaluate and is therefore NOT unit-testable here. The framing
// math is already reproduced + asserted by the `reach:` tests in
// edge-cases.test.mjs. The ONE node-side computation, FIT_MAX (from a.fit), is a
// closure-local const that is never returned or exposed, so it cannot be observed
// without driving the browser. Conclusion: no further node-pure surface to test
// beyond FRAME (covered in edge-cases.test.mjs). We only smoke-check the shape.
test('makeCamera: returns the six camera methods without touching the browser', () => {
  // a stub rctx is enough to build the closure; we never CALL the methods (that
  // would need a live page), we only assert the contract surface exists.
  const rctx = { safeEval: async () => {}, clock: { wait: async () => {} }, ms: (n) => n, a: { width: 1280, height: 720 } };
  const cam = makeCamera(rctx);
  for (const name of ['ensureCam', 'camTo', 'camFrame', 'initialFit', 'panToInclude', 'camOut']) {
    assert.equal(typeof cam[name], 'function', `missing camera method ${name}`);
  }
});

test('FRAME: is the shared, frozen-in-spirit cap object (sanity re-anchor)', () => {
  // edge-cases.test.mjs owns the value assertions; here we only confirm the
  // import path used by demo-camera tests resolves the same object.
  assert.equal(typeof FRAME, 'object');
  assert.equal(FRAME.FILL, 0.86);
  assert.equal(FRAME.MAX, 3);
});
