// compose-edge.test.mjs — hostile inputs against compose.mjs pure logic.
// gifFilter builds an ffmpeg filter string from numeric knobs; labelCacheKey/
// labelCachePath hash text into a tmpdir path. labelPngs is impure (launches a
// browser) and is NOT tested here. A failure here is a real bug: NaN bleeding
// into the graph, or a quote/slash escaping the cache dir.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gifFilter, labelCacheKey, labelCachePath, LABEL_CACHE_DIR, LABEL_STYLE,
} from '../compose.mjs';

// ── gifFilter: defaults only apply to undefined, never to falsy-but-finite ──
test('gifFilter: no arg / empty object yields the all-defaults graph', () => {
  // `= {}` param default: calling with nothing must not throw on destructure.
  const a = gifFilter();
  const b = gifFilter({});
  assert.equal(a, b);
  assert.match(a, /fps=15,scale=-2:480/);
  assert.match(a, /pad=iw\+24:ih/);        // gap default
  assert.match(a, /pad=iw\+56:ih\+56:28:28/); // pad default (28*2=56, offset 28)
});

test('gifFilter: a finite 0/negative/huge knob is kept verbatim, not defaulted', () => {
  // 0 is a real (if useless-to-ffmpeg) value; the builder must not silently swap
  // it for the default. It is upstream `num({min})` that rejects bad runs.
  assert.match(gifFilter({ height: 0 }), /scale=-2:0:/);
  assert.match(gifFilter({ gap: -5 }), /pad=iw\+-5:ih/);
  assert.match(gifFilter({ height: 1e9 }), /scale=-2:1000000000:/);
  assert.match(gifFilter({ fps: 60 }), /fps=60,/);
});

test('gifFilter: NaN/Infinity knobs fall back to defaults (no NaN in the graph)', () => {
  // REGRESSION: pad*2 used to stringify NaN -> "pad=iw+NaN:ih+NaN:NaN:NaN",
  // an unparseable graph that ffmpeg rejects with a cryptic error.
  const f = gifFilter({ height: NaN, gap: NaN, pad: NaN, fps: NaN });
  assert.doesNotMatch(f, /NaN/);
  assert.doesNotMatch(f, /Infinity/);
  // each non-finite knob is replaced by its own default
  assert.match(f, /fps=15,scale=-2:480/);
  assert.match(f, /pad=iw\+24:ih/);
  assert.match(f, /pad=iw\+56:ih\+56:28:28/);
  assert.doesNotMatch(gifFilter({ pad: Infinity }), /Infinity/);
  assert.doesNotMatch(gifFilter({ height: -Infinity }), /Infinity/);
});

test('gifFilter: a non-integer pad still produces a numeric (never NaN) graph', () => {
  // ffmpeg may want even dims, but a fractional pad is finite — keep it, do not
  // round or default it away. The key invariant is "numeric, not NaN".
  const f = gifFilter({ pad: 2.5 });
  assert.match(f, /pad=iw\+5:ih\+5:2\.5:2\.5/); // 2.5*2 = 5, offset 2.5
  assert.doesNotMatch(f, /NaN/);
});

test('gifFilter: undefined knobs (explicit) take the default like a missing key', () => {
  const f = gifFilter({ height: undefined, fps: undefined });
  assert.match(f, /fps=15,scale=-2:480/);
});

test('gifFilter: output is always one ;-joined graph ending in paletteuse', () => {
  // structural contract: 8 stages, palette last. Hostile knobs must not drop or
  // reorder stages, only change the numbers inside them.
  for (const arg of [{}, { height: 0 }, { pad: NaN }, { gap: -1 }, { fps: 1e6 }]) {
    const stages = gifFilter(arg).split(';');
    assert.equal(stages.length, 8, JSON.stringify(arg));
    assert.match(stages.at(-1), /paletteuse$/);
  }
});

// ── labelCacheKey: hashing is total and deterministic over hostile text ─────
test('labelCacheKey: every text shape yields a stable 40-char sha1 hex', () => {
  const hex = /^[0-9a-f]{40}$/;
  for (const t of ['', '   ', 'A', 'héllo 日本語 🎉', 'x'.repeat(100000)]) {
    assert.match(labelCacheKey(t), hex, JSON.stringify(t.slice(0, 12)));
  }
  // deterministic: same input -> same digest
  assert.equal(labelCacheKey('Before'), labelCacheKey('Before'));
  // distinct inputs -> distinct digests (no trivial collisions)
  assert.notEqual(labelCacheKey('Before'), labelCacheKey('After'));
});

test('labelCacheKey: null/undefined/number text is String()-coerced, never throws', () => {
  // String(null) === "null"; the cache just keys on that. No crash is the point.
  assert.doesNotThrow(() => labelCacheKey(null));
  assert.doesNotThrow(() => labelCacheKey(undefined));
  assert.match(labelCacheKey(null), /^[0-9a-f]{40}$/);
  assert.equal(labelCacheKey(null), labelCacheKey('null')); // coercion is explicit
});

test('labelCacheKey: a null style spreads to {} and still hashes', () => {
  // {...null} is {} in JS, so a null style degrades to "just the text" — no throw.
  assert.doesNotThrow(() => labelCacheKey('x', null));
  assert.match(labelCacheKey('x', null), /^[0-9a-f]{40}$/);
});

test('labelCacheKey: style variation changes the key (cache is style-aware)', () => {
  const k1 = labelCacheKey('X', LABEL_STYLE);
  const k2 = labelCacheKey('X', { ...LABEL_STYLE, color: '#fff' });
  assert.notEqual(k1, k2);
});

// ── labelCachePath: path-injection shapes can never escape the cache dir ────
test('labelCachePath: slashes/quotes/traversal in text cannot escape the cache dir', () => {
  // the text is hashed before it touches the filesystem, so path metacharacters
  // dissolve into hex. This is the security-relevant invariant.
  for (const t of ['a/../../etc/passwd', '"; rm -rf /"', '../../x', 'a/b/c', '\n\0']) {
    const p = labelCachePath(t);
    assert.ok(p.startsWith(LABEL_CACHE_DIR + '/'), 'inside cache dir: ' + JSON.stringify(t));
    // nothing after the dir except <hex>.png — no nested path segments
    assert.match(p.slice(LABEL_CACHE_DIR.length + 1), /^[0-9a-f]{40}\.png$/);
  }
});

test('labelCachePath: path is key + .png and agrees with labelCacheKey', () => {
  const t = 'Before';
  assert.equal(labelCachePath(t), LABEL_CACHE_DIR + '/' + labelCacheKey(t) + '.png');
});

test('labelCachePath: null style does not throw and stays in the cache dir', () => {
  assert.doesNotThrow(() => labelCachePath('x', null));
  assert.ok(labelCachePath('x', null).startsWith(LABEL_CACHE_DIR + '/'));
});
