// beautify-frame.mjs — the PURE geometry of the beautify compositor.
//
// beautify.mjs wraps a screenshot in a frame (browser window / card / minimal)
// on a padded background, optionally sized to a social aspect ratio. All the
// MATH that decides canvas size and where the window sits is here so it is
// unit-testable with no browser; the actual pixels are drawn in Browser.beautify.

// Social aspect presets. 'free' = no ratio, canvas just hugs the framed window.
export const RATIOS = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  'free': null,
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Compute the full layout for a capture of imgW×imgH given the frame options.
// Pure and total: bad dimensions clamp to a 1px floor, an unknown ratio falls
// back to 'free'. Returns every box the draw step needs, all integers.
//   opts: { frame:'window'|'card'|'minimal', pad, radius, ratio, chrome? }
export function frameLayout(imgW, imgH, opts = {}) {
  const w = Math.max(1, Math.round(imgW || 0));
  const h = Math.max(1, Math.round(imgH || 0));
  const frame = ['window', 'card', 'minimal'].includes(opts.frame) ? opts.frame : 'window';
  const pad = Math.max(0, Math.round(opts.pad != null ? opts.pad : 64));
  // minimal is flat (no rounded corners); window/card round to opts.radius.
  const radius = frame === 'minimal' ? 0 : Math.max(0, Math.round(opts.radius != null ? opts.radius : 14));
  // The window bar only exists for the 'window' frame. Scale it with width but
  // keep it in a sane band so it reads as a title bar, never a thick slab.
  const chromeH = frame === 'window'
    ? clamp(Math.round(w * 0.032), 30, 46)
    : 0;

  const winW = w;
  const winH = chromeH + h;

  // The framed window plus its padding is the minimum canvas. A ratio enlarges
  // (never crops) the smaller axis and centers the window in the extra space.
  const baseW = winW + pad * 2;
  const baseH = winH + pad * 2;
  const ar = RATIOS[opts.ratio] != null ? RATIOS[opts.ratio] : null;
  let canvasW = baseW;
  let canvasH = baseH;
  if (ar) {
    if (baseW / baseH < ar) canvasW = Math.round(baseH * ar);
    else canvasH = Math.round(baseW / ar);
  }

  const winX = Math.round((canvasW - winW) / 2);
  const winY = Math.round((canvasH - winH) / 2);

  return {
    canvasW, canvasH,
    winX, winY, winW, winH,
    chromeH, radius, frame, pad,
    imgX: winX, imgY: winY + chromeH, imgW: w, imgH: h,
  };
}

// Resolve the background into a 1- or 2-stop gradient (always an array of CSS
// color strings). A single color renders as a flat fill; two as a vertical
// gradient. Pure. Unknown/empty input falls back to the default slate gradient.
export function resolveBackground(bg) {
  const DEFAULT = ['#1e293b', '#0f172a'];
  if (Array.isArray(bg)) {
    const stops = bg.filter((c) => typeof c === 'string' && c.trim()).slice(0, 2);
    return stops.length ? stops : DEFAULT;
  }
  if (typeof bg === 'string' && bg.trim()) {
    const stops = bg.split(',').map((c) => c.trim()).filter(Boolean).slice(0, 2);
    return stops.length ? stops : DEFAULT;
  }
  return DEFAULT;
}
