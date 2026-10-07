import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pngDims } from '../annotate.mjs';

// --- pngDims: parse the IHDR header, reject malformed input ---------------

function fakePng(width, height, { sig = true, ihdr = true } = {}) {
  const buf = Buffer.alloc(24);
  if (sig) Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  // bytes 8-11 = chunk length, 12-15 = chunk type
  buf.write(ihdr ? 'IHDR' : 'XXXX', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

test('pngDims reads width/height from a valid IHDR', () => {
  assert.deepEqual(pngDims(fakePng(1600, 900)), { width: 1600, height: 900 });
  assert.deepEqual(pngDims(fakePng(1, 1)), { width: 1, height: 1 });
});

test('pngDims rejects a buffer that is too short', () => {
  assert.throws(() => pngDims(Buffer.alloc(10)), /not a PNG/);
});

test('pngDims rejects a bad signature', () => {
  assert.throws(() => pngDims(fakePng(100, 100, { sig: false })), /bad signature/);
});

test('pngDims rejects a first chunk that is not IHDR', () => {
  assert.throws(() => pngDims(fakePng(100, 100, { ihdr: false })), /not IHDR/);
});

test('pngDims rejects zero dimensions', () => {
  assert.throws(() => pngDims(fakePng(0, 100)), /zero dimension/);
  assert.throws(() => pngDims(fakePng(100, 0)), /zero dimension/);
});

// --- selfCheck: does an annotation actually land on its target? -----------

const TARGET = { x: 100, y: 100, w: 200, h: 100 };

