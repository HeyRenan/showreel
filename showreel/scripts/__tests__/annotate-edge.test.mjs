// annotate-edge.test.mjs — hostile inputs against annotate.mjs pure exports.
// Happy/visual paths live in pngread.test.mjs; this file probes the boundaries
// of pngDims, selfCheck, the grid-inject builders, and the UNTESTED visualCheck
// edges (null opts, zero-area target, tol extremes, minInside floor). A failure
// here is a real bug, not a typo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  pngDims, pngDimsFromFile, buildGridInjectUrl, buildGridInject,
  selfCheck, visualCheck, DEFAULT_MARKER_HEX,
} from '../annotate.mjs';
import { decodePNG } from '../pngread.mjs';
import { writeFileSync, rmSync } from 'node:fs';

// --- minimal PNG helpers (copied from pngread.test.mjs — do not import tests) -
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, cb]);
}
// flat (filter 0) RGBA encoder — enough to round-trip through decodePNG.
function encodePNG(width, height, raw) {
  const stride = width * 4;
  const filtered = Buffer.alloc((stride + 1) * height);
  let fp = 0;
  for (let y = 0; y < height; y++) { filtered[fp++] = 0; for (let i = 0; i < stride; i++) filtered[fp++] = raw[y * stride + i]; }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(filtered)), chunk('IEND', Buffer.alloc(0))]);
}
// a real PNG header buffer reporting the given dims (signature + IHDR only).
function pngHeader(w, h) {
  const buf = Buffer.alloc(24);
  SIG.copy(buf, 0);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(w, 16); buf.writeUInt32BE(h, 20);
  return buf;
}
// a decoded fixture with a hollow green box stroked at `rect` over a neutral bg.
function boxFixture(W, H, rect, hex = DEFAULT_MARKER_HEX) {
  const C = 4, raw = Buffer.alloc(W * H * C);
  for (let i = 0; i < raw.length; i += C) { raw[i] = 200; raw[i + 1] = 200; raw[i + 2] = 205; raw[i + 3] = 255; }
  const n = parseInt(hex, 16);
  const g = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }, bw = 4;
  const { x: rx, y: ry, w: rw, h: rh } = rect;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inX = x >= rx && x < rx + rw, inY = y >= ry && y < ry + rh;
    if (!inX && !inY) continue;
    const onV = (Math.abs(x - rx) < bw || Math.abs(x - (rx + rw)) < bw) && y >= ry - bw && y <= ry + rh + bw;
    const onH = (Math.abs(y - ry) < bw || Math.abs(y - (ry + rh)) < bw) && x >= rx - bw && x <= rx + rw + bw;
    if (onV || onH) { const i = (y * W + x) * C; raw[i] = g.r; raw[i + 1] = g.g; raw[i + 2] = g.b; raw[i + 3] = 255; }
  }
  return decodePNG(encodePNG(W, H, raw));
}

// ── pngDims: IHDR header reader fed hostile buffers ─────────────────────────
test('pngDims: reads width/height from a valid IHDR header', () => {
  assert.deepEqual(pngDims(pngHeader(1764, 992)), { width: 1764, height: 992 });
});

test('pngDims: a Uint8Array with a valid sig is coerced, not mis-rejected', () => {
  // BUG GUARD: decodePNG coerces Uint8Array -> Buffer; pngDims must too, else
  // buf.toString('ascii',12,16) on a Uint8Array yields commas, not "IHDR",
  // and a caller passing the same bytes decodePNG accepts gets a wrong error.
  assert.deepEqual(pngDims(new Uint8Array(pngHeader(640, 480))), { width: 640, height: 480 });
});

test('pngDims: null/undefined throw a clear type error, not a length crash', () => {
  // BUG GUARD: a missing/empty file read is plausible; the message must name the
  // type, not "Cannot read properties of null (reading 'length')".
  assert.throws(() => pngDims(null), /type|Buffer|argument/);
  assert.throws(() => pngDims(undefined), /type|Buffer|argument/);
});

test('pngDims: a too-short buffer is rejected as a bad signature', () => {
  assert.throws(() => pngDims(Buffer.alloc(10)), /not a PNG/);
});

test('pngDims: correct length but wrong magic bytes is a bad signature', () => {
  const buf = pngHeader(10, 10); buf[1] = 0x00; // break the 'P'
  assert.throws(() => pngDims(buf), /bad signature/);
});

test('pngDims: a valid sig whose first chunk is not IHDR is named', () => {
  const buf = pngHeader(10, 10); buf.write('IDAT', 12, 'ascii');
  assert.throws(() => pngDims(buf), /not IHDR/);
});

test('pngDims: an IHDR reporting a zero dimension throws', () => {
  // a 0-width screenshot can never be annotated; reject before coords are authored.
  assert.throws(() => pngDims(pngHeader(0, 100)), /zero dimension/);
  assert.throws(() => pngDims(pngHeader(100, 0)), /zero dimension/);
});

test('pngDimsFromFile: a missing path surfaces the fs error (intentional throw)', () => {
  assert.throws(() => pngDimsFromFile('/no/such/raw.png'), /ENOENT|no such file/);
});

// ── selfCheck: pure geometry fed malformed annotation sets ──────────────────
test('selfCheck: a missing/invalid target throws clearly', () => {
  assert.throws(() => selfCheck(null, []), /target must be/);
  assert.throws(() => selfCheck({ x: 0, y: 0, h: 1 }, []), /target must be/); // no w
  assert.throws(() => selfCheck({ x: 0, y: 0, w: 1 }, []), /target must be/); // no h
});

test('selfCheck: non-array annotations are tolerated, never crash', () => {
  // BUG GUARD: the CLI JSON.parses annotations.json and passes it straight in; a
  // file holding {} or null must yield a clean FAIL verdict, not a length crash.
  const t = { x: 0, y: 0, w: 100, h: 100 };
  for (const bad of [null, undefined, {}, 5, 'x']) {
    const r = selfCheck(t, bad);
    assert.equal(r.pass, false);
    assert.equal(r.hits.length, 0);
    assert.equal(r.passingCount, 0);
  }
});

test('selfCheck: a null/string/number entry never derefs, reports a label miss', () => {
  // BUG GUARD: annToGeom(null) and the hit record both used to read .type on the
  // raw entry — a [{...}, null] array crashed the gate meant to catch bad coords.
  const t = { x: 0, y: 0, w: 100, h: 100 };
  const r = selfCheck(t, [null, '#a', 7]);
  assert.equal(r.hits.length, 3);
  assert.ok(r.hits.every((h) => h.type === 'label' && h.pass === false));
});

test('selfCheck: an empty annotations array is a clean FAIL (nothing proven)', () => {
  const r = selfCheck({ x: 0, y: 0, w: 100, h: 100 }, []);
  assert.equal(r.pass, false);
  assert.equal(r.bestOverlap, 0);
});

test('selfCheck: a rect overlapping the target passes via area mode', () => {
  const r = selfCheck({ x: 0, y: 0, w: 100, h: 100 }, [{ type: 'rect', x: 10, y: 10, w: 20, h: 20 }]);
  assert.equal(r.hits[0].mode, 'area');
  assert.equal(r.pass, true);
});

test('selfCheck: an arrowhead landing inside passes via point mode; outside fails', () => {
  const t = { x: 0, y: 0, w: 100, h: 100 };
  assert.equal(selfCheck(t, [{ type: 'arrow', x2: 50, y2: 50 }]).hits[0].mode, 'point');
  assert.equal(selfCheck(t, [{ type: 'arrow', x2: 50, y2: 50 }]).pass, true);
  assert.equal(selfCheck(t, [{ type: 'arrow', x2: 500, y2: 500 }]).pass, false);
});

test('selfCheck: a zero-area target still runs (area divides by a 1 floor)', () => {
  // targetArea is Math.max(1, w*h) so a degenerate target never divides by zero.
  const r = selfCheck({ x: 0, y: 0, w: 0, h: 0 }, [{ type: 'rect', x: 0, y: 0, w: 10, h: 10 }]);
  assert.equal(r.pass, false); // a 0x0 target can never be overlapped by area
  assert.ok(Number.isFinite(r.bestOverlap));
});

// ── buildGridInjectUrl / buildGridInject: pure injection-string builders ─────
function payloadOf(inject) {
  // the inject is `()=>{const __PAYLOAD={...};function GRID...`; pull the literal.
  const start = inject.indexOf('__PAYLOAD=') + '__PAYLOAD='.length;
  const end = inject.indexOf(';function');
  return JSON.parse(inject.slice(start, end));
}

test('buildGridInjectUrl: a positive step is honored, default is 100', () => {
  assert.equal(payloadOf(buildGridInjectUrl('u', 50)).step, 50);
  assert.equal(payloadOf(buildGridInjectUrl('u')).step, 100); // omitted -> default
});

test('buildGridInjectUrl: 0/negative/NaN step all fold to the 100 default', () => {
  // the lattice spacing must be a usable positive number or the grid loop hangs.
  for (const s of [0, -10, NaN, undefined]) assert.equal(payloadOf(buildGridInjectUrl('u', s)).step, 100);
});

test('buildGridInjectUrl: the image URL is embedded verbatim for same-origin load', () => {
  assert.equal(payloadOf(buildGridInjectUrl('https://x/raw.png', 100)).imageUrl, 'https://x/raw.png');
});

test('buildGridInjectUrl: the result is a no-arg arrow that returns GRID(...)', () => {
  // the evaluate channel only accepts a no-arg arrow on BOTH MCP backends.
  const out = buildGridInjectUrl('u', 100);
  assert.match(out, /^\(\)=>\{/);
  assert.match(out, /return GRID\(__PAYLOAD\);\}$/);
});

test('buildGridInject: a missing png path surfaces the fs error (intentional)', () => {
  assert.throws(() => buildGridInject('/no/such/raw.png'), /ENOENT|no such file/);
});

test('buildGridInject: base64-embeds a real png and keeps the step contract', () => {
  // round-trip a tiny PNG so the base64 path is exercised end to end.
  const png = encodePNG(2, 2, Buffer.alloc(2 * 2 * 4, 255));
  const tmp = `${process.env.TMPDIR || '/tmp'}/annotate-edge-${process.pid}.png`;
  writeFileSync(tmp, png);
  try {
    const p = payloadOf(buildGridInject(tmp, -5)); // negative step -> default 100
    assert.equal(p.step, 100);
    assert.match(p.imageB64, /^data:image\/png;base64,/);
  } finally { rmSync(tmp, { force: true }); }
});

// ── visualCheck: ONLY the edges pngread.test.mjs leaves uncovered ────────────
test('visualCheck: explicit null opts is tolerated (default param only fixes undefined)', () => {
  // BUG GUARD: opts = {} catches `undefined` but a caller passing `null` slipped
  // through to opts.hex and crashed. Both forms must behave like the default.
  const rect = { x: 50, y: 50, w: 80, h: 60 };
  const dec = boxFixture(200, 200, rect);
  const withNull = visualCheck(dec, rect, null);
  const withNone = visualCheck(dec, rect);
  assert.equal(withNull.pass, withNone.pass);
  assert.equal(withNull.tol, 40);   // documented defaults applied
  assert.equal(withNull.gap, 12);
});

test('visualCheck: a zero-area or off-image target throws after clamping', () => {
  const dec = boxFixture(200, 200, { x: 50, y: 50, w: 80, h: 60 });
  assert.throws(() => visualCheck(dec, { x: 50, y: 50, w: 0, h: 60 }), /empty after clamping/);
  assert.throws(() => visualCheck(dec, { x: 500, y: 500, w: 80, h: 60 }), /empty after clamping/);
});

test('visualCheck: tol 0 still matches the exact stamped green (lower boundary)', () => {
  // the fixture paints pure 16a34a pixels, so an exact-match tol must find them.
  const rect = { x: 50, y: 50, w: 80, h: 60 };
  const dec = boxFixture(200, 200, rect);
  const r = visualCheck(dec, rect, { tol: 0 });
  assert.ok(r.insideMatches > 0);
  assert.equal(r.pass, true);
});

test('visualCheck: tol 255 makes everything "match" so inside no longer dominates', () => {
  // upper boundary: an over-broad tolerance counts the neutral bg as green too,
  // collapsing dominance below the threshold -> a correct box now FAILs loudly.
  const rect = { x: 50, y: 50, w: 80, h: 60 };
  const dec = boxFixture(200, 200, rect);
  const r = visualCheck(dec, rect, { tol: 255 });
  assert.equal(r.pass, false);
  assert.ok(r.dominanceActual < r.dominance);
});

test('visualCheck: an impossibly high minInside floor forces a FAIL', () => {
  // the absolute floor is the larger of opts.minInside and a perimeter fraction;
  // a huge explicit floor must override and fail an otherwise-correct box.
  const rect = { x: 50, y: 50, w: 80, h: 60 };
  const dec = boxFixture(200, 200, rect);
  const r = visualCheck(dec, rect, { minInside: 100000 });
  assert.equal(r.enoughInside, false);
  assert.equal(r.pass, false);
});

test('visualCheck: minInside defaults to the perimeter floor when omitted', () => {
  // omitting minInside must NOT mean "zero required"; the derived floor still applies.
  const rect = { x: 50, y: 50, w: 80, h: 60 };
  const dec = boxFixture(200, 200, rect);
  const r = visualCheck(dec, rect, {});
  assert.ok(r.minInside >= 12); // never below the absolute floor
});
