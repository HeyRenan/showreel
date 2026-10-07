// annotate.mjs — pure helpers the capture motor shares: PNG dimensions straight
// from the IHDR, the page-freeze snippet, and visualCheck (the pixel gate that
// proves the green marker dominates the target region).

import { pixelAt, parseHexColor, colorMatches } from './pngread.mjs';

// Default marker color = the green the canvas annotator stamps boxes with.
export const DEFAULT_MARKER_HEX = '16a34a';

// Real PNG pixel dimensions, straight from the IHDR chunk.
//    PNG layout: 8-byte signature, then IHDR length(4)+type(4) at offset 8..15,
//    width = big-endian uint32 at bytes 16..19, height at bytes 20..23.
export function pngDims(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf); // accept Uint8Array, match decodePNG
  if (
    buf.length < 24 ||
    buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47 ||
    buf[4] !== 0x0d || buf[5] !== 0x0a || buf[6] !== 0x1a || buf[7] !== 0x0a
  ) throw new Error('not a PNG (bad signature)');
  if (buf.toString('ascii', 12, 16) !== 'IHDR')
    throw new Error('first chunk is not IHDR');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) throw new Error('IHDR reports zero dimension');
  return { width, height };
}


// Injected before any screenshot: stops swiper autoplay (snapping the active slide),
// pauses CSS animations/transitions, and pauses video — so geometry measured now is
// the geometry in the shot. A no-arg arrow fn, returns a readiness report.
export const FREEZE_FN = `()=>{
  var report={swipers:0,videos:0,scrolled:false,styleInjected:false};
  try{
    var sels=document.querySelectorAll('.swiper,.swiper-container');
    for(var i=0;i<sels.length;i++){
      var sw=sels[i].swiper;
      if(sw){
        try{ if(sw.autoplay&&sw.autoplay.stop) sw.autoplay.stop(); }catch(e){}
        try{ if(sw.params) sw.params.autoplay=false; }catch(e){}
        try{ if(sw.setTranslate) sw.setTranslate(sw.translate); }catch(e){}
        try{ if(sw.setTransition) sw.setTransition(0); }catch(e){}
        report.swipers++;
      }
    }
  }catch(e){}
  try{
    var vids=document.querySelectorAll('video');
    for(var v=0;v<vids.length;v++){ try{ vids[v].pause(); report.videos++; }catch(e){} }
  }catch(e){}
  try{
    var st=document.getElementById('__freeze_style__');
    if(!st){
      st=document.createElement('style'); st.id='__freeze_style__';
      st.textContent='*,*::before,*::after{animation-play-state:paused !important;'+
        'animation-duration:0s !important;animation-delay:0s !important;'+
        'transition-duration:0s !important;transition-delay:0s !important;'+
        'scroll-behavior:auto !important;caret-color:transparent !important;}';
      (document.head||document.documentElement).appendChild(st);
      report.styleInjected=true;
    }
  }catch(e){}
  try{ window.scrollTo(0,0); report.scrolled=true; }catch(e){}
  report.devicePixelRatio=window.devicePixelRatio||1;
  report.innerWidth=window.innerWidth;
  report.docWidth=document.documentElement.scrollWidth;
  return report;
}`;


// ---------------------------------------------------------------------------
// 5. VISUAL SELF-CHECK — the hole geometry can't close. Decodes the ACTUAL
//    annotated PNG and proves the drawn marker (a colored box border, default
//    green 16a34a) has real pixels INSIDE the intended target rect and is NOT
//    mostly painted somewhere else. A consistent-but-wrong coord set draws its
//    box off-target, so its colored pixels land in the OUTSIDE band, not inside
//    -> this catches what `check` cannot.
//
//    Geometry of what we sample (three concentric regions):
//      INSIDE  = the target rect, clamped to the image. A box stroked at the
//                target has its border on this rect's perimeter, so its colored
//                pixels fall in here (the inner half of a centered stroke).
//      GAP     = a thin neutral ring just OUTSIDE the rect edge, `gap` px wide.
//                A centered stroke straddles the edge and a drop shadow bleeds a
//                few px out — that paint is legitimate, so it is counted as
//                NEITHER inside nor a violation. Without this ring a correctly
//                placed box looks ~half "outside" and false-FAILs.
//      OUTSIDE = a band `band` px wide BEYOND the gap. This region should be
//                clean for a correct box; a mis-placed box dumps its border here.
//
//    PASS requires BOTH:
//      - insideMatches >= a floor derived from the rect perimeter (a borderW px
//        border has ~ perimeter*borderW colored px; demand a modest fraction so
//        shadow softening / partial occlusion doesn't false-FAIL), and
//      - inside strongly DOMINATES outside (insideMatches >= dominance * total),
//        so a marker mostly outside the target fails even if a sliver clips in.
// ---------------------------------------------------------------------------
function clampRect(r, W, H) {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(W, Math.ceil(r.x + r.w));
  const y1 = Math.min(H, Math.ceil(r.y + r.h));
  return { x0, y0, x1, y1, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function visualCheck(decoded, target, opts = {}) {
  if (!opts) opts = {}; // explicit null/0 slips past the default param
  if (!target || target.x == null || target.y == null || target.w == null || target.h == null)
    throw new Error('target must be {x,y,w,h}');

  const W = decoded.width, H = decoded.height;
  const hex = opts.hex || DEFAULT_MARKER_HEX;
  const tol = opts.tol == null ? 40 : opts.tol;       // per-channel slack for AA
  const gap = opts.gap == null ? 12 : opts.gap;       // neutral straddle/shadow ring
  const band = opts.band == null ? 48 : opts.band;    // outside violation band width
  const dominance = opts.dominance == null ? 0.6 : opts.dominance;
  const color = parseHexColor(hex);

  const inner = clampRect(target, W, H);
  if (inner.w === 0 || inner.h === 0)
    throw new Error('target rect is empty after clamping to ' + W + 'x' + H);

  // The neutral gap ring stops at this rect; everything from here out to `outer`
  // (minus the gap) is the OUTSIDE violation band.
  const gapRect = clampRect(
    { x: target.x - gap, y: target.y - gap, w: target.w + gap * 2, h: target.h + gap * 2 },
    W, H
  );
  const outer = clampRect(
    { x: target.x - gap - band, y: target.y - gap - band, w: target.w + (gap + band) * 2, h: target.h + (gap + band) * 2 },
    W, H
  );

  let insideMatches = 0;
  let outsideMatches = 0;
  let insideSamples = 0;
  let outsideSamples = 0;

  for (let y = outer.y0; y < outer.y1; y++) {
    const inInnerRow = y >= inner.y0 && y < inner.y1;
    const inGapRow = y >= gapRect.y0 && y < gapRect.y1;
    for (let x = outer.x0; x < outer.x1; x++) {
      const isInside = inInnerRow && x >= inner.x0 && x < inner.x1;
      const isGap = !isInside && inGapRow && x >= gapRect.x0 && x < gapRect.x1;
      if (isGap) continue; // neutral straddle/shadow ring — counts toward nothing
      const px = pixelAt(decoded, x, y);
      const hit = colorMatches(px, color, tol);
      if (isInside) {
        insideSamples++;
        if (hit) insideMatches++;
      } else {
        outsideSamples++;
        if (hit) outsideMatches++;
      }
    }
  }

  // Floor: a stroked rect border of `borderW` px has roughly perimeter*borderW
  // colored pixels. Demand a modest fraction of that so a real (even partly
  // shadowed / occluded) border passes, but a near-empty inside fails.
  const borderW = opts.borderW == null ? 4 : opts.borderW;
  const perimeter = 2 * (inner.w + inner.h);
  const expectedBorderPx = perimeter * borderW;
  const minInside = Math.max(
    opts.minInside == null ? 12 : opts.minInside, // absolute floor (tiny rects)
    Math.round(expectedBorderPx * (opts.borderFraction == null ? 0.15 : opts.borderFraction))
  );

  const totalMatches = insideMatches + outsideMatches;
  const enoughInside = insideMatches >= minInside;
  const dominates = totalMatches === 0
    ? false
    : insideMatches >= dominance * totalMatches;

  const pass = enoughInside && dominates;

  return {
    pass,
    image: { width: W, height: H, channels: decoded.channels },
    color: hex,
    tol,
    gap,
    band,
    insideMatches,
    outsideMatches,
    insideSamples,
    outsideSamples,
    minInside,
    dominance,
    dominanceActual: totalMatches === 0 ? 0 : insideMatches / totalMatches,
    enoughInside,
    dominates,
    inner,
    gapRect,
    outer,
  };
}
