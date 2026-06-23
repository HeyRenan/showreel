#!/usr/bin/env node
// Decode a returned dataURL file to a PNG. Strips JSON quotes + data-url prefix.
// Validates PNG magic before writing. Zero-dep. decodeDataUrl is exported pure.
//   node dataurl-to-png.mjs <in.dataurl> <out.png>
import { readFileSync, writeFileSync } from 'node:fs';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function decodeDataUrl(s) {
  if (typeof s !== 'string') throw new Error('input must be a string');
  s = s.trim().replace(/^"|"$/g, '').replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(s, 'base64');
  if (buf.length < 67 || PNG_MAGIC.some((b, i) => buf[i] !== b)) {
    throw new Error('not a valid PNG (got ' + buf.length + ' bytes)');
  }
  return buf;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) { console.error('usage: dataurl-to-png.mjs <in.dataurl> <out.png>'); process.exit(2); }
  let raw;
  try { raw = readFileSync(inPath, 'utf8'); } catch { console.error('cannot read ' + inPath); process.exit(1); }
  let buf;
  try { buf = decodeDataUrl(raw); } catch (e) { console.error(e.message + ' — the evaluate call probably failed'); process.exit(1); }
  writeFileSync(outPath, buf);
  console.error('wrote ' + outPath + ' (' + buf.length + ' bytes)');
}
