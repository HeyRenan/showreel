import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { decodePNG, pixelAt, parseHexColor, colorMatches } from '../pngread.mjs';
import { visualCheck, DEFAULT_MARKER_HEX } from '../annotate.mjs';

// --- PNG encoder for fixtures (tests must build real PNGs to decode) ---------
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
const Paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); if (pa <= pb && pa <= pc) return a; if (pb <= pc) return b; return c; };

function encodePNG(width, height, channels, raw, { rowFilters = [0], idatSplits = 1 } = {}) {
  const colorType = channels === 4 ? 6 : channels === 3 ? 2 : channels === 2 ? 4 : 0;
  const bpp = channels, stride = width * bpp;
  const filtered = Buffer.alloc((stride + 1) * height);
  let fp = 0;
  for (let y = 0; y < height; y++) {
    const ft = rowFilters[y % rowFilters.length];
    filtered[fp++] = ft;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * stride + i];
      const a = i >= bpp ? raw[y * stride + i - bpp] : 0;
      const b = y > 0 ? raw[(y - 1) * stride + i] : 0;
      const c = (y > 0 && i >= bpp) ? raw[(y - 1) * stride + i - bpp] : 0;
      let v;
      switch (ft) { case 0: v = x; break; case 1: v = x - a; break; case 2: v = x - b; break; case 3: v = x - ((a + b) >> 1); break; case 4: v = x - Paeth(a, b, c); break; }
      filtered[fp++] = v & 0xff;
    }
  }
  const comp = zlib.deflateSync(filtered);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const part = Math.ceil(comp.length / idatSplits);
  const idats = [];
  for (let i = 0; i < idatSplits; i++) {
    const s = comp.subarray(i * part, Math.min(comp.length, (i + 1) * part));
    if (s.length || idatSplits === 1) idats.push(chunk('IDAT', s));
  }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), ...idats, chunk('IEND', Buffer.alloc(0))]);
}

function makeRaw(width, height, channels, seed = 1) {
  const raw = Buffer.alloc(width * height * channels);
  let s = seed >>> 0;
  for (let i = 0; i < raw.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; raw[i] = (s >> 8) & 0xff; }
  return raw;
}

// --- decoder fidelity: every filter type must reconstruct byte-exactly --------
for (const ft of [0, 1, 2, 3, 4]) {
  test(`decodePNG reconstructs filter ${ft} (RGBA) exactly`, () => {
    const W = 23, H = 17, C = 4, raw = makeRaw(W, H, C, 100 + ft);
    const dec = decodePNG(encodePNG(W, H, C, raw, { rowFilters: [ft] }));
    assert.equal(dec.width, W); assert.equal(dec.height, H); assert.equal(dec.channels, C);
    assert.ok(dec.data.equals(raw));
  });
  test(`decodePNG reconstructs filter ${ft} (RGB) exactly`, () => {
    const W = 19, H = 21, C = 3, raw = makeRaw(W, H, C, 200 + ft);
    const dec = decodePNG(encodePNG(W, H, C, raw, { rowFilters: [ft] }));
    assert.equal(dec.channels, 3);
    assert.ok(dec.data.equals(raw));
  });
}

test('decodePNG handles mixed per-row filters (all 5 cycling)', () => {
  const W = 40, H = 30, C = 4, raw = makeRaw(W, H, C, 999);
  const dec = decodePNG(encodePNG(W, H, C, raw, { rowFilters: [0, 1, 2, 3, 4] }));
  assert.ok(dec.data.equals(raw));
});

test('decodePNG concatenates multiple IDAT chunks before inflate', () => {
  const W = 60, H = 45, C = 4, raw = makeRaw(W, H, C, 4242);
  const single = decodePNG(encodePNG(W, H, C, raw, { rowFilters: [4], idatSplits: 1 }));
  const multi = decodePNG(encodePNG(W, H, C, raw, { rowFilters: [4], idatSplits: 7 }));
  assert.ok(single.data.equals(raw));
  assert.ok(multi.data.equals(single.data));
});

test('pixelAt returns source bytes; RGB reports alpha 255', () => {
  const W = 50, H = 50, C = 4, raw = makeRaw(W, H, C, 7);
  const dec = decodePNG(encodePNG(W, H, C, raw, { rowFilters: [0, 1, 2, 3, 4] }));
  const idx = (13 * W + 25) * C;
  const px = pixelAt(dec, 25, 13);
  assert.deepEqual(px, { r: raw[idx], g: raw[idx + 1], b: raw[idx + 2], a: raw[idx + 3] });
  const rgb = decodePNG(encodePNG(4, 4, 3, makeRaw(4, 4, 3, 5), { rowFilters: [2] }));
  assert.equal(pixelAt(rgb, 0, 0).a, 255);
});

test('decodePNG throws clear errors on unsupported inputs', () => {
  assert.throws(() => decodePNG(Buffer.alloc(40)), /signature/);
  const interlaced = encodePNG(4, 4, 4, makeRaw(4, 4, 4), { rowFilters: [0] });
  interlaced[16 + 12] = 1; // IHDR data + interlace offset
  assert.throws(() => decodePNG(interlaced), /interlace/);
  const deep = encodePNG(4, 4, 4, makeRaw(4, 4, 4), { rowFilters: [0] });
  deep[16 + 8] = 16; // IHDR data + bitDepth offset
  assert.throws(() => decodePNG(deep), /bitDepth/);
});

test('color helpers', () => {
  assert.deepEqual(parseHexColor('16a34a'), { r: 22, g: 163, b: 74 });
  assert.deepEqual(parseHexColor('#fff'), { r: 255, g: 255, b: 255 });
  assert.throws(() => parseHexColor('zzz'), /bad hex/);
  const t = { r: 22, g: 163, b: 74 };
  assert.equal(colorMatches({ r: 30, g: 170, b: 80 }, t, 40), true);
  assert.equal(colorMatches({ r: 200, g: 0, b: 0 }, t, 40), false);
});

// --- visualCheck behavior: PASS on-target, FAIL off-target --------------------
// Draw a hollow green box border at a known rect into an RGBA fixture.
function drawBoxFixture(W, H, rect, hex) {
  const C = 4, raw = Buffer.alloc(W * H * C);
  for (let i = 0; i < raw.length; i += C) { raw[i] = 200; raw[i + 1] = 200; raw[i + 2] = 205; raw[i + 3] = 255; }
  const g = parseHexColor(hex), bw = 4;
  const { x: rx, y: ry, w: rw, h: rh } = rect;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inX = x >= rx && x < rx + rw, inY = y >= ry && y < ry + rh;
    if (!inX && !inY) continue;
    const nearL = Math.abs(x - rx) < bw, nearR = Math.abs(x - (rx + rw)) < bw;
    const nearT = Math.abs(y - ry) < bw, nearB = Math.abs(y - (ry + rh)) < bw;
    const onV = (nearL || nearR) && y >= ry - bw && y <= ry + rh + bw;
    const onH = (nearT || nearB) && x >= rx - bw && x <= rx + rw + bw;
    if (onV || onH) { const i = (y * W + x) * C; raw[i] = g.r; raw[i + 1] = g.g; raw[i + 2] = g.b; raw[i + 3] = 255; }
  }
  return decodePNG(encodePNG(W, H, C, raw, { rowFilters: [0, 1, 2, 3, 4], idatSplits: 3 }));
}

test('visualCheck PASSes when the box is at the target', () => {
  const rect = { x: 500, y: 300, w: 400, h: 150 };
  const dec = drawBoxFixture(1440, 900, rect, DEFAULT_MARKER_HEX);
  const r = visualCheck(dec, rect, { hex: DEFAULT_MARKER_HEX });
  assert.equal(r.pass, true);
  assert.ok(r.insideMatches > 0 && r.outsideMatches === 0);
});

test('visualCheck FAILs on a consistent-but-wrong target (the closed hole)', () => {
  const rect = { x: 500, y: 300, w: 400, h: 150 };
  const dec = drawBoxFixture(1440, 900, rect, DEFAULT_MARKER_HEX);
  const r = visualCheck(dec, { x: 100, y: 100, w: 400, h: 150 }, { hex: DEFAULT_MARKER_HEX });
  assert.equal(r.pass, false);
});

test('visualCheck FAILs when expecting the wrong color', () => {
  const rect = { x: 500, y: 300, w: 400, h: 150 };
  const dec = drawBoxFixture(1440, 900, rect, DEFAULT_MARKER_HEX);
  const r = visualCheck(dec, rect, { hex: 'e11d48' });
  assert.equal(r.pass, false);
});

test('visualCheck FAILs when target is the hollow interior (border in band)', () => {
  const rect = { x: 500, y: 300, w: 400, h: 150 };
  const dec = drawBoxFixture(1440, 900, rect, DEFAULT_MARKER_HEX);
  const hollow = { x: rect.x + 120, y: rect.y + 50, w: 160, h: 50 };
  const r = visualCheck(dec, hollow, { hex: DEFAULT_MARKER_HEX });
  assert.equal(r.pass, false);
  assert.ok(r.insideMatches < r.minInside);
});
