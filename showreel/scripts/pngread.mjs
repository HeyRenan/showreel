#!/usr/bin/env node
// pngread.mjs — minimal, correct PNG decoder using ONLY node stdlib (node:zlib).
//
// Why this exists: the annotate self-check used to be pure geometry, so a set of
// coords that were INTERNALLY consistent but pointed at the wrong place still
// PASSed. To actually prove the drawn marker lands on the target we have to read
// the real pixels of the annotated PNG. Browser canvas.toDataURL() emits exactly
// one shape — 8-bit, non-interlaced, colorType 2 (RGB) or 6 (RGBA), zlib IDAT —
// which is all we support (and we throw a clear error on anything else).
//
// Exports:
//   decodePNG(buf)        -> { width, height, channels, data }  (raw bytes, row-major)
//   pixelAt(decoded,x,y)  -> { r, g, b, a }
//   decodePNGFromFile(p)  -> decodePNG(readFileSync(p))
//
// The two classic bug sites are handled explicitly and tested:
//   (a) multiple IDAT chunks MUST be concatenated BEFORE inflate (zlib stream is
//       split across chunk boundaries, each chunk is NOT independently valid).
//   (b) Average and Paeth un-filtering reference reconstructed bytes a/b/c with
//       precise out-of-bounds rules (a,c=0 in first column; b,c=0 in first row).

import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// colorType -> channels per pixel (only the 8-bit canvas-emitted types).
const CHANNELS_BY_COLOR_TYPE = {
  2: 3, // truecolor RGB
  6: 4, // truecolor + alpha RGBA
  0: 1, // grayscale (canvas never emits this, but cheap + correct to support)
  4: 2, // grayscale + alpha
};

function assertSignature(buf) {
  if (buf.length < 8) throw new Error('not a PNG (too short for signature)');
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIG[i]) throw new Error('not a PNG (bad signature byte ' + i + ')');
  }
}

// Walk the chunk stream once: capture IHDR fields and collect every IDAT payload.
function parseChunks(buf) {
  let off = 8; // past the 8-byte signature
  let ihdr = null;
  const idatParts = [];
  let sawIEND = false;

  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buf.length) {
      throw new Error('truncated chunk "' + type + '" (declared len ' + len + ' overruns buffer)');
    }

    if (type === 'IHDR') {
      if (len !== 13) throw new Error('IHDR has wrong length ' + len + ' (expected 13)');
      ihdr = {
        width: buf.readUInt32BE(dataStart),
        height: buf.readUInt32BE(dataStart + 4),
        bitDepth: buf[dataStart + 8],
        colorType: buf[dataStart + 9],
        compression: buf[dataStart + 10],
        filterMethod: buf[dataStart + 11],
        interlace: buf[dataStart + 12],
      };
    } else if (type === 'IDAT') {
      // Copy the payload slice; concatenation across ALL IDATs happens after.
      idatParts.push(buf.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      sawIEND = true;
    }

    off = dataEnd + 4; // skip the 4-byte CRC that trails every chunk
    if (sawIEND) break;
  }

  if (!ihdr) throw new Error('no IHDR chunk found');
  if (idatParts.length === 0) throw new Error('no IDAT chunks found');
  return { ihdr, idatParts };
}

// Paeth predictor — the reference implementation from the PNG spec, byte exact.
// a = left, b = above, c = above-left (all already-reconstructed bytes).
function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Reverse the per-scanline filters in place, producing tightly-packed pixel bytes
// (filter bytes stripped). `raw` is the inflated stream: each row is
// 1 filter byte + (width * bpp) data bytes.
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;            // bytes per reconstructed scanline
  const expected = (stride + 1) * height; // +1 filter byte per row
  if (raw.length < expected) {
    throw new Error('inflated data too small: got ' + raw.length + ', need ' + expected);
  }

  const out = Buffer.allocUnsafe(stride * height);
  let inPos = 0;       // cursor into `raw`
  let outRow = 0;      // start of current row in `out`
  let prevRow = -1;    // start of previous reconstructed row in `out` (-1 = none)

  for (let y = 0; y < height; y++) {
    const filter = raw[inPos++];

    for (let i = 0; i < stride; i++) {
      const x = raw[inPos++];                       // current filtered byte
      const a = i >= bpp ? out[outRow + i - bpp] : 0;          // left
      const b = prevRow >= 0 ? out[prevRow + i] : 0;          // above
      const c = prevRow >= 0 && i >= bpp ? out[prevRow + i - bpp] : 0; // above-left

      let recon;
      switch (filter) {
        case 0: recon = x; break;                              // None
        case 1: recon = x + a; break;                          // Sub
        case 2: recon = x + b; break;                          // Up
        case 3: recon = x + ((a + b) >> 1); break;             // Average (floor)
        case 4: recon = x + paethPredictor(a, b, c); break;    // Paeth
        default: throw new Error('unknown PNG filter type ' + filter + ' on row ' + y);
      }
      out[outRow + i] = recon & 0xff;               // wrap to byte
    }

    prevRow = outRow;
    outRow += stride;
  }

  return out;
}

export function decodePNG(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  assertSignature(buf);

  const { ihdr, idatParts } = parseChunks(buf);
  const { width, height, bitDepth, colorType, interlace } = ihdr;

  if (bitDepth !== 8) {
    throw new Error('unsupported bitDepth ' + bitDepth + ' (only 8 is supported)');
  }
  if (interlace !== 0) {
    throw new Error('unsupported interlace ' + interlace + ' (only 0 / non-interlaced is supported)');
  }
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (!channels) {
    throw new Error('unsupported colorType ' + colorType + ' (expected 2 RGB or 6 RGBA)');
  }
  if (!width || !height) throw new Error('IHDR reports zero dimension');

  // (a) concat ALL IDAT payloads, THEN inflate the single zlib stream.
  const compressed = idatParts.length === 1 ? idatParts[0] : Buffer.concat(idatParts);
  let raw;
  try {
    raw = zlib.inflateSync(compressed);
  } catch (e) {
    throw new Error('IDAT inflate failed: ' + (e && e.message ? e.message : e));
  }

  const data = unfilter(raw, width, height, channels);
  return { width, height, channels, data };
}

export function decodePNGFromFile(path) {
  return decodePNG(readFileSync(path));
}

// Read a single pixel. RGB images report a = 255 (fully opaque) so callers can
// treat every decode uniformly as RGBA.
export function pixelAt(decoded, x, y) {
  const { width, height, channels, data } = decoded;
  if (x < 0 || y < 0 || x >= width || y >= height) {
    throw new Error('pixelAt out of bounds: (' + x + ',' + y + ') in ' + width + 'x' + height);
  }
  const idx = (y * width + x) * channels;
  if (channels >= 3) {
    return {
      r: data[idx],
      g: data[idx + 1],
      b: data[idx + 2],
      a: channels === 4 ? data[idx + 3] : 255,
    };
  }
  // grayscale (1 or 2 channels): mirror the gray value across r/g/b.
  const v = data[idx];
  return { r: v, g: v, b: v, a: channels === 2 ? data[idx + 1] : 255 };
}

// Helpers shared with the vcheck command -----------------------------------

// "#16a34a" / "16a34a" / "#1a3" -> {r,g,b}. Throws on garbage.
export function parseHexColor(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error('bad hex color: ' + hex);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// Chebyshev (max per-channel) distance — tolerant of canvas anti-aliasing while
// still rejecting clearly different colors. Alpha is ignored (border is opaque).
export function colorMatches(px, target, tol) {
  return (
    Math.abs(px.r - target.r) <= tol &&
    Math.abs(px.g - target.g) <= tol &&
    Math.abs(px.b - target.b) <= tol
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  // Tiny CLI: `node pngread.mjs <png>` prints decoded dimensions + a center pixel.
  const p = process.argv[2];
  if (!p) { console.error('usage: pngread.mjs <png>'); process.exit(2); }
  try {
    const dec = decodePNGFromFile(p);
    const cx = dec.width >> 1, cy = dec.height >> 1;
    console.log(JSON.stringify({
      width: dec.width, height: dec.height, channels: dec.channels,
      bytes: dec.data.length, center: pixelAt(dec, cx, cy),
    }));
  } catch (e) {
    console.error('error: ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}
