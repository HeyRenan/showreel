#!/usr/bin/env node
// Compose two PNGs into one BEFORE | AFTER image. Zero-dep primary path: builds
// a self-contained HTML with both images base64-embedded; the agent screenshots
// it via the browser MCP. Prints the HTML file path.
// (Geometry matches the browser render; an ffmpeg hstack fallback is in README
//  if no browser is available — note: even-width rounding can differ by ~2px.)
//   node before-after.mjs <before.png> <after.png> <out.html> [labelA] [labelB]
import { readFileSync, writeFileSync } from 'node:fs';

const [a, b, out, labelA = 'BEFORE', labelB = 'AFTER'] = process.argv.slice(2);
if (!a || !b || !out) { console.error('usage: before-after.mjs <before.png> <after.png> <out.html> [labelA] [labelB]'); process.exit(2); }

function b64(p) {
  try { return readFileSync(p).toString('base64'); }
  catch { console.error('cannot read ' + p); process.exit(1); }
}

// Escape labels — they come from argv and are interpolated into HTML that gets
// rendered/screenshotted; unescaped input would inject markup.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const html = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#0d0d0d;display:inline-block">
<div style="display:flex;gap:0;font:700 22px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#fff">
  <figure style="margin:0;padding:0 12px 12px"><figcaption style="padding:10px 2px">${esc(labelA)}</figcaption><img src="data:image/png;base64,${b64(a)}" style="display:block;max-width:48vw;height:auto"></figure>
  <figure style="margin:0;padding:0 12px 12px"><figcaption style="padding:10px 2px">${esc(labelB)}</figcaption><img src="data:image/png;base64,${b64(b)}" style="display:block;max-width:48vw;height:auto"></figure>
</div></body>`;
writeFileSync(out, html);
console.error('wrote ' + out + ' — screenshot it via browser MCP to get the BEFORE/AFTER PNG');
console.log(out);
