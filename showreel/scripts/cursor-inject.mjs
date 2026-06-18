#!/usr/bin/env node
// cursor-inject.mjs — emit a JS snippet that injects a fake cursor + click ripple
// into a live page, so a recorded screencast/video shows the mouse moving and
// every click pulsing. Paste the printed snippet inside the Playwright MCP
// `browser_run_code_unsafe` page.evaluate() BEFORE driving the flow.
//
// Why a fake cursor: Playwright's real mouse pointer is NOT painted into the
// recorded video. We mirror page mousemove events onto an SVG arrow, and expose
// window.__ripple(x,y) to pulse a ring on demand (call it right before each click).
//
// The ripple is driven by requestAnimationFrame, NOT CSS @keyframes, so it
// survives the usual "freeze all animations" style you inject for stable shots.
//
// usage:
//   node scripts/cursor-inject.mjs            # default green ripple, 28px cursor
//   node scripts/cursor-inject.mjs --color="#2563eb" --size=30 --ripple-ms=750 --ripple-max=110
//
// Companion: drive-recipe.md shows the exact MCP call sequence + clickAt() helper.

// rgba fill derived from the ripple color (hex -> rgba). Exported pure for
// tests; expands a 3-digit hex to 6 first. Malformed hex yields NaN channels.
export function hexToRgba(hex, a) {
  const m = String(hex).replace('#', '');
  const n = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Build the injectable cursor + ripple snippet string from resolved options.
// Pure/deterministic: numbers and color are baked into the returned source.
export function buildCursorSnippet({ color, size, rippleMs, rippleMax }) {
  const fill = hexToRgba(color, 0.18);
  return `(() => {
  // ---- fake cursor + click ripple (cursor-inject.mjs) ----
  document.getElementById('__cursor__')?.remove();
  const c = document.createElement('div');
  c.id = '__cursor__';
  c.style.cssText = 'position:fixed;width:${size}px;height:${size}px;z-index:2147483647;pointer-events:none;left:-80px;top:-80px;transform:translate(-4px,-2px);';
  c.innerHTML = '<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="M3 1.5l8 19 2.7-7.6L21 10.2 3 1.5z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  c.firstChild.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,.6))';
  // on <html>, not <body>: the recorder's camera transforms <body>
  document.documentElement.appendChild(c);
  window.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);

  // rAF ripple — immune to CSS animation freeze. Returns a Promise that resolves
  // when the pulse finishes, so the driver can await it before clicking.
  window.__ripple = (x, y) => new Promise(resolve => {
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:5px solid ${color};background:${fill};border-radius:50%;left:' + x + 'px;top:' + y + 'px;box-sizing:border-box;';
    document.documentElement.appendChild(r);
    const t0 = performance.now(), dur = ${rippleMs}, max = ${rippleMax};
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const s = 12 + (max - 12) * k;
      r.style.width = s + 'px'; r.style.height = s + 'px';
      r.style.marginLeft = (-s/2) + 'px'; r.style.marginTop = (-s/2) + 'px';
      r.style.opacity = String(0.95 * (1 - k));
      if (k < 1) requestAnimationFrame(step); else { r.remove(); resolve(); }
    };
    requestAnimationFrame(step);
  });

  // freeze page motion (page swipers/animations) WITHOUT freezing our overlay nodes
  if (!document.getElementById('__freeze_cursor__')) {
    const st = document.createElement('style');
    st.id = '__freeze_cursor__';
    st.textContent = 'img,section{animation-duration:0s!important;} html{scroll-behavior:auto!important;}';
    document.head.appendChild(st);
  }
  return { cursor: true };
})()`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => {
    const hit = process.argv.find(a => a.startsWith(`--${k}=`));
    return hit ? hit.slice(k.length + 3) : d;
  };
  const snippet = buildCursorSnippet({
    color: arg('color', '#16a34a'),
    size: parseInt(arg('size', '28'), 10),
    rippleMs: parseInt(arg('ripple-ms', '750'), 10),
    rippleMax: parseInt(arg('ripple-max', '110'), 10),
  });
  process.stdout.write(snippet + '\n');
}
