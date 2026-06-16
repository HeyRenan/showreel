#!/usr/bin/env node
// Bake an annotation payload INTO the ANNOTATE source so it can be passed as the
// MCP evaluate `function` with NO args (the only channel that works on both
// chrome-devtools and playwright). Zero-dep: node stdlib only.
//
// TWO modes:
//   URL mode (PREFERRED — tiny injectable ~2KB):
//     node build-inject.mjs --url <same-origin-img-url> <annotations.json> <out.js>
//     The image loads from a same-origin URL (e.g. the page already serves
//     raw.png). Keeps the canvas untainted, and the function stays small enough
//     to pass through the MCP evaluate arg without bloating context.
//   B64 mode (fallback — embeds the whole image, large injectable):
//     node build-inject.mjs <raw.png> <annotations.json> <out.js>
//
// buildInjectUrl / buildInject are exported pure for tests.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function wrap(payload, src) {
  return '()=>{const __PAYLOAD=' + JSON.stringify(payload) + ';' + src + '\nreturn ANNOTATE(__PAYLOAD);}';
}

// PREFERRED: image by same-origin URL — small injectable.
export function buildInjectUrl(imageUrl, ann, src) {
  return wrap({ scale: 1, imageUrl, annotations: ann }, src);
}

// Fallback: image embedded as base64 — large injectable.
export function buildInject(png, ann, src) {
  return wrap({ scale: 1, imageB64: 'data:image/png;base64,' + Buffer.from(png).toString('base64'), annotations: ann }, src);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  let src;
  try { src = readFileSync(join(here, 'annotate-canvas.js'), 'utf8'); } catch { console.error('annotate-canvas.js missing'); process.exit(1); }

  if (argv[0] === '--url') {
    const [, imageUrl, annPath, outPath] = argv;
    if (!imageUrl || !annPath || !outPath) { console.error('usage: build-inject.mjs --url <img-url> <annotations.json> <out.js>'); process.exit(2); }
    let ann;
    try { ann = JSON.parse(readFileSync(annPath, 'utf8')); } catch (e) { console.error('bad annotations json: ' + e.message); process.exit(1); }
    const inject = buildInjectUrl(imageUrl, ann, src);
    writeFileSync(outPath, inject);
    console.error('wrote ' + outPath + ' (' + inject.length + ' bytes, URL mode)');
  } else {
    const [pngPath, annPath, outPath] = argv;
    if (!pngPath || !annPath || !outPath) { console.error('usage: build-inject.mjs <raw.png> <annotations.json> <out.js>   (or --url <img-url> ...)'); process.exit(2); }
    let png, ann;
    try { png = readFileSync(pngPath); } catch { console.error('cannot read png: ' + pngPath); process.exit(1); }
    try { ann = JSON.parse(readFileSync(annPath, 'utf8')); } catch (e) { console.error('bad annotations json: ' + e.message); process.exit(1); }
    const inject = buildInject(png, ann, src);
    writeFileSync(outPath, inject);
    console.error('wrote ' + outPath + ' (' + inject.length + ' bytes, base64 mode)');
  }
}
