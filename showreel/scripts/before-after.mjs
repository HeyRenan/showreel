#!/usr/bin/env node
// Compose two PNGs into one BEFORE | AFTER image. Zero-dep primary path: builds
// a self-contained HTML with both images base64-embedded; the agent screenshots
// it via the browser MCP. Prints the HTML file path.
// (Geometry matches the browser render; an ffmpeg hstack fallback is in README
//  if no browser is available — note: even-width rounding can differ by ~2px.)
//   node before-after.mjs <before.png> <after.png> <out.html> [labelA] [labelB]
import { readFileSync, writeFileSync } from 'node:fs';

// Escape labels — they come from argv and are interpolated into HTML that gets
// rendered/screenshotted; unescaped input would inject markup. Exported pure
// for tests; the CLI body below is guarded so importing this module is inert.
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Build the BEFORE|AFTER HTML page from two base64 PNG payloads + labels.
// Pure/deterministic: no FS, no argv. b64 strings are caller-supplied.
export function buildBeforeAfterHtml(b64A, b64B, labelA = 'BEFORE', labelB = 'AFTER') {
  return `<!doctype html><meta charset=utf-8><body style="margin:0;background:#0d0d0d;display:inline-block">
<div style="display:flex;gap:0;font:700 22px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#fff">
  <figure style="margin:0;padding:0 12px 12px"><figcaption style="padding:10px 2px">${esc(labelA)}</figcaption><img src="data:image/png;base64,${b64A}" style="display:block;max-width:48vw;height:auto"></figure>
  <figure style="margin:0;padding:0 12px 12px"><figcaption style="padding:10px 2px">${esc(labelB)}</figcaption><img src="data:image/png;base64,${b64B}" style="display:block;max-width:48vw;height:auto"></figure>
</div></body>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [a, b, out, labelA = 'BEFORE', labelB = 'AFTER'] = process.argv.slice(2);
  if (!a || !b || !out) { console.error('usage: before-after.mjs <before.png> <after.png> <out.html> [labelA] [labelB]'); process.exit(2); }

  const b64 = (p) => {
    try { return readFileSync(p).toString('base64'); }
    catch { console.error('cannot read ' + p); process.exit(1); }
  };

  writeFileSync(out, buildBeforeAfterHtml(b64(a), b64(b), labelA, labelB));
  console.error('wrote ' + out + ' — screenshot it via browser MCP to get the BEFORE/AFTER PNG');
  console.log(out);
}
