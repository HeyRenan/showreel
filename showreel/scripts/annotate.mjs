#!/usr/bin/env node
// annotate.mjs — removes trial-and-error from annotating proof screenshots.
//
// It CANNOT drive the browser (zero-dep: no MCP client). Instead it does every
// measurable step in node and EMITS the exact MCP snippets the agent must run.
// All geometry/validation happens here so coords are authored against the REAL
// PNG pixels (read from IHDR), never the downscaled Read-tool preview.
//
// Subcommands (node stdlib only):
//   node annotate.mjs dims   <png>
//   node annotate.mjs freeze
//   node annotate.mjs grid   <raw.png> <out-inject.js> [step]
//   node annotate.mjs check  <target.json> <annotations.json>
//   node annotate.mjs vcheck <annotated.png> <target.json> [hexcolor] [tol]
//   node annotate.mjs recipe <group/repo>
//
// Pain this fixes (seen in the field):
//   1. swiper autoplay moved content between getBoundingClientRect and the shot
//      -> `freeze` stops every swiper + pauses CSS motion before screenshotting.
//   2. Read-tool preview is ~884px while the real PNG is 1764px, so eyeballed
//      coords landed at half scale -> `dims` reads IHDR; `grid` overlays a
//      numbered 100px lattice the agent Reads to author true-pixel coords;
//      `check` proves a drawn rect actually overlaps the intended target.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { decodePNG, pixelAt, parseHexColor, colorMatches } from './pngread.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// Default marker color = the green the canvas annotator stamps boxes with.
export const DEFAULT_MARKER_HEX = '16a34a';

// ---------------------------------------------------------------------------
// 1. REAL PNG pixel dimensions, straight from the IHDR chunk.
//    PNG layout: 8-byte signature, then IHDR length(4)+type(4) at offset 8..15,
//    width = big-endian uint32 at bytes 16..19, height at bytes 20..23.
// ---------------------------------------------------------------------------
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

export function pngDimsFromFile(path) {
  return pngDims(readFileSync(path));
}

// ---------------------------------------------------------------------------
// 3. FREEZE snippet — injected (via MCP evaluate) BEFORE any screenshot.
//    Kills swiper autoplay AND its transforms (setTranslate snaps the active
//    slide, no in-flight transition), pauses CSS animations/transitions with a
//    forced style tag, and stops generic carousels. Returns a readiness report
//    so the agent can confirm motion is actually dead before shooting.
//    Emitted as a no-arg arrow fn: the only evaluate channel that works on BOTH
//    chrome-devtools and playwright (verified — see build-inject.mjs note).
// ---------------------------------------------------------------------------
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
// 2. GRID injectable — overlays a numbered 100px calibration lattice on the raw
//    PNG so the agent Reads the gridded image and authors coords in TRUE PNG
//    space. Reuses the EXACT build-inject contract (baked __PAYLOAD, no args)
//    and the same canvas image-load path as annotate-canvas.js, so it behaves
//    identically on chrome-devtools and playwright.
// ---------------------------------------------------------------------------
const GRID_DRAW = `function GRID(payload){
  return new Promise(function(resolve,reject){
    var p=typeof payload==='string'?JSON.parse(payload):payload;
    var step=p.step&&p.step>0?p.step:100;
    var img=new Image();
    img.onload=function(){
      try{
        var W=img.naturalWidth||img.width, H=img.naturalHeight||img.height;
        var cv=document.createElement('canvas'); cv.width=W; cv.height=H;
        var ctx=cv.getContext('2d');
        ctx.drawImage(img,0,0,W,H);
        var FONT='system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif';
        ctx.lineWidth=1;
        var x,y;
        for(x=0;x<=W;x+=step){
          ctx.strokeStyle=(x%500===0)?'rgba(255,0,0,.85)':'rgba(255,0,0,.30)';
          ctx.beginPath(); ctx.moveTo(x+0.5,0); ctx.lineTo(x+0.5,H); ctx.stroke();
        }
        for(y=0;y<=H;y+=step){
          ctx.strokeStyle=(y%500===0)?'rgba(255,0,0,.85)':'rgba(255,0,0,.30)';
          ctx.beginPath(); ctx.moveTo(0,y+0.5); ctx.lineTo(W,y+0.5); ctx.stroke();
        }
        ctx.font='700 13px '+FONT; ctx.textBaseline='top';
        for(x=0;x<=W;x+=step){
          for(y=0;y<=H;y+=step){
            var t=x+','+y;
            var w=ctx.measureText(t).width;
            ctx.fillStyle='rgba(0,0,0,.72)'; ctx.fillRect(x+2,y+2,w+6,17);
            ctx.fillStyle='#fff'; ctx.fillText(t,x+5,y+4);
          }
        }
        resolve(cv.toDataURL('image/png'));
      }catch(err){ reject('grid failed: '+(err&&err.message?err.message:err)); }
    };
    img.onerror=function(){ reject('grid image failed to load: '+(p.imageUrl||'base64')); };
    img.src=p.imageUrl||p.imageB64;
  });
}`;

// PREFERRED: image by same-origin URL — tiny injectable (~2KB vs ~270KB).
export function buildGridInjectUrl(imageUrl, step) {
  const payload = { step: step && step > 0 ? step : 100, imageUrl };
  return '()=>{const __PAYLOAD=' + JSON.stringify(payload) + ';' + GRID_DRAW + '\nreturn GRID(__PAYLOAD);}';
}

// Fallback: embed the image as base64 — large injectable.
export function buildGridInject(pngPath, step) {
  const png = readFileSync(pngPath);
  const payload = {
    step: step && step > 0 ? step : 100,
    imageB64: 'data:image/png;base64,' + png.toString('base64'),
  };
  return '()=>{const __PAYLOAD=' + JSON.stringify(payload) + ';' + GRID_DRAW + '\nreturn GRID(__PAYLOAD);}';
}

// ---------------------------------------------------------------------------
// 4. SELF-CHECK — pure geometry, no pixel decode. Confirms that at least one
//    drawn annotation actually lands inside the intended target rect, so a
//    mis-scaled or transposed coord is caught BEFORE you ship.
//    Each annotation reduces to a test geometry:
//      rect/label/callout/badge -> a box (or point box)
//      arrow                     -> its head endpoint (x2,y2) — that's what points
// ---------------------------------------------------------------------------
function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  const w = r - x, h = btm - y;
  if (w <= 0 || h <= 0) return { area: 0 };
  return { x, y, w, h, area: w * h };
}

function annToGeom(a) {
  if (!a || typeof a !== 'object') a = {}; // tolerate null/string/number entries
  if (a.type === 'arrow') {
    // The arrowhead is the assertion. Treat as a tiny box around (x2,y2).
    return { kind: 'arrow', x: a.x2 - 1, y: a.y2 - 1, w: 2, h: 2, point: { x: a.x2, y: a.y2 } };
  }
  if (a.type === 'badge') {
    const r = a.r || 16;
    return { kind: 'badge', x: a.x - r, y: a.y - r, w: r * 2, h: r * 2, point: { x: a.x, y: a.y } };
  }
  if (a.type === 'rect') {
    return { kind: 'rect', x: a.x, y: a.y, w: a.w, h: a.h };
  }
  if (a.type === 'callout') {
    // The anchor is where it points; if absent, fall back to the label box.
    if (a.anchorX != null && a.anchorY != null)
      return { kind: 'callout', x: a.anchorX - 1, y: a.anchorY - 1, w: 2, h: 2, point: { x: a.anchorX, y: a.anchorY } };
    return { kind: 'callout', x: a.x, y: a.y, w: a.w || 220, h: 60 };
  }
  // label or unknown: a point box at its origin
  return { kind: a.type || 'label', x: a.x, y: a.y, w: a.w || 2, h: a.h || 2 };
}

function pointInRect(pt, rect) {
  return pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h;
}

// target: {x,y,w,h}; annotations: array of annotation objects (same as ANNOTATE input)
export function selfCheck(target, annotations) {
  if (!target || target.w == null || target.h == null)
    throw new Error('target must be {x,y,w,h}');
  if (!Array.isArray(annotations)) annotations = []; // tolerate null/object/missing input
  const targetArea = Math.max(1, target.w * target.h);
  const hits = [];
  for (let i = 0; i < annotations.length; i++) {
    const g = annToGeom(annotations[i]);
    let pass = false, overlap = 0, mode = '';
    if (g.point) {                       // arrow/badge/callout: endpoint must land inside
      pass = pointInRect(g.point, target);
      mode = 'point';
      overlap = pass ? 1 : 0;
    } else {                             // box: needs real area overlap
      const ix = intersect(g, target);
      overlap = ix.area / targetArea;
      pass = ix.area > 0;
      mode = 'area';
    }
    hits.push({ index: i, type: g.kind, mode, pass, overlap });
  }
  const passing = hits.filter((h) => h.pass);
  const best = hits.reduce((m, h) => (h.overlap > m ? h.overlap : m), 0);
  return { pass: passing.length > 0, target, hits, passingCount: passing.length, bestOverlap: best };
}

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

// ---------------------------------------------------------------------------
// Recipe text — printed for the agent so the full loop is self-documenting.
// ---------------------------------------------------------------------------
function recipe(repo) {
  const R = repo || '<group/repo>';
  return `ANNOTATE-RELIABLE recipe (run from ${HERE}):

0. Navigate the browser MCP to the page.

1. FREEZE motion BEFORE shooting (kills the swiper-moved-content bug):
   evaluate function = output of \`node annotate.mjs freeze\`
   Confirm the returned report shows swipers>0 (if any) and styleInjected=true.

2. Screenshot the FULL page to a real PNG (NOT the Read preview):
   chrome-devtools: take_screenshot { fullPage:true, filePath:"/tmp/raw.png" }
   playwright:      browser_take_screenshot { fullPage:true, filename:"/tmp/raw.png" }

3. Read TRUE pixel size (never trust the preview's size):
   node annotate.mjs dims /tmp/raw.png        # -> {width,height}

4. Build the calibration grid injectable and run it:
   node annotate.mjs grid /tmp/raw.png /tmp/grid-inject.js
   evaluate function = contents of /tmp/grid-inject.js  (dump result to /tmp/grid.dataurl)
   node dataurl-to-png.mjs /tmp/grid.dataurl /tmp/grid.png

5. Read /tmp/grid.png. Author coords by reading the numbered 100px labels.
   These are REAL-PNG coords. Write target.json {x,y,w,h} (the thing to prove)
   and annotations.json (array of rect/arrow/label/badge/callout).

6. Bake + draw the real annotations (reuse the existing build-inject path):
   node build-inject.mjs /tmp/raw.png annotations.json /tmp/ann-inject.js
   evaluate function = contents of /tmp/ann-inject.js  (dump to /tmp/ann.dataurl)
   node dataurl-to-png.mjs /tmp/ann.dataurl /tmp/annotated.png

7. SELF-CHECK geometry before you trust it:
   node annotate.mjs check target.json annotations.json   # must print PASS

8. VISUAL SELF-CHECK — decode the real annotated pixels and prove the drawn box
   actually lands on the target (catches consistent-but-wrong coords that step 7
   cannot). Pass the SAME color you drew the rect with (default ${DEFAULT_MARKER_HEX}):
   node annotate.mjs vcheck /tmp/annotated.png target.json [hexcolor] [tol]  # must print PASS

9. Read /tmp/annotated.png to eyeball, then upload:
   node upload.mjs ${R} /tmp/annotated.png

If step 7 PASSes but step 8 FAILs, the coords are internally consistent yet point
at the wrong pixels — re-read the grid and re-author target.json/annotations.json.
If step 7 FAILs, your coords are in the wrong space (often preview scale):
recompute width-ratio = realWidth / previewWidth and multiply coords. Do NOT ship a FAIL.`;
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------
function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'dims') {
      if (!rest[0]) { console.error('usage: annotate.mjs dims <png>'); process.exit(2); }
      const d = pngDimsFromFile(rest[0]);
      console.log(JSON.stringify(d));
    } else if (cmd === 'freeze') {
      console.log(FREEZE_FN);
    } else if (cmd === 'grid') {
      // URL mode (preferred, tiny): grid --url <img-url> <out.js> [step]
      if (rest[0] === '--url') {
        if (!rest[1] || !rest[2]) { console.error('usage: annotate.mjs grid --url <img-url> <out-inject.js> [step]'); process.exit(2); }
        const step = rest[3] ? parseInt(rest[3], 10) : 100;
        const inject = buildGridInjectUrl(rest[1], step);
        writeFileSync(rest[2], inject);
        console.error('wrote ' + rest[2] + ' (' + inject.length + ' bytes, URL mode)');
      } else {
        if (!rest[0] || !rest[1]) { console.error('usage: annotate.mjs grid <raw.png> <out-inject.js> [step]   (or --url <img-url> ...)'); process.exit(2); }
        const step = rest[2] ? parseInt(rest[2], 10) : 100;
        const inject = buildGridInject(rest[0], step);
        writeFileSync(rest[1], inject);
        console.error('wrote ' + rest[1] + ' (' + inject.length + ' bytes, base64 mode)');
      }
    } else if (cmd === 'check') {
      if (!rest[0] || !rest[1]) { console.error('usage: annotate.mjs check <target.json> <annotations.json>'); process.exit(2); }
      const target = JSON.parse(readFileSync(rest[0], 'utf8'));
      const ann = JSON.parse(readFileSync(rest[1], 'utf8'));
      const res = selfCheck(target, ann);
      for (const h of res.hits)
        console.error(`  [${h.index}] ${h.type} (${h.mode}) ${h.pass ? 'hit' : 'miss'} overlap=${h.overlap.toFixed(3)}`);
      console.error(`target=${JSON.stringify(target)} passing=${res.passingCount}/${res.hits.length} bestOverlap=${res.bestOverlap.toFixed(3)}`);
      console.log(res.pass ? 'PASS' : 'FAIL');
      process.exit(res.pass ? 0 : 1);
    } else if (cmd === 'vcheck') {
      if (!rest[0] || !rest[1]) {
        console.error('usage: annotate.mjs vcheck <annotated.png> <target.json> [hexcolor] [tol]');
        process.exit(2);
      }
      const decoded = decodePNG(readFileSync(rest[0]));
      const target = JSON.parse(readFileSync(rest[1], 'utf8'));
      const hex = rest[2] || DEFAULT_MARKER_HEX;
      const tol = rest[3] != null ? parseInt(rest[3], 10) : undefined;
      const res = visualCheck(decoded, target, { hex, tol });
      console.error(
        `image=${res.image.width}x${res.image.height} ch=${res.image.channels} color=#${res.color} tol=${res.tol} gap=${res.gap} band=${res.band}`
      );
      console.error(
        `inside: ${res.insideMatches}/${res.insideSamples} matched  outside: ${res.outsideMatches}/${res.outsideSamples} matched`
      );
      console.error(
        `minInside=${res.minInside} (enough=${res.enoughInside})  dominance=${res.dominanceActual.toFixed(3)} need>=${res.dominance} (ok=${res.dominates})`
      );
      console.log(res.pass ? 'PASS' : 'FAIL');
      process.exit(res.pass ? 0 : 1);
    } else if (cmd === 'recipe') {
      console.log(recipe(rest[0]));
    } else {
      console.error('usage: annotate.mjs <dims|freeze|grid|check|vcheck|recipe> ...');
      process.exit(2);
    }
  } catch (e) {
    console.error('error: ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
