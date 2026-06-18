#!/usr/bin/env node
// rec.mjs — record a flow as a GIF with a moving cursor, click ripples, and
// PER-STEP annotations anchored to selectors (appear with the action, gone next
// step). No MCP, no hand-written Playwright. The AI passes a steps roster; the
// script owns cursor motion, timing, annotation placement, and webm->gif.
//
//   node rec.mjs <url> --steps steps.json out.gif \
//     [--steps-json '[...]'] [--stamp] [--width 900] [--height 1400] \
//     [--gif-width 460] [--fps 18] [--mp4 out.mp4] [--keep-webm out.webm] \
//     [--offline] [--auto-annotate] [--block-hosts [csv]] \
//     [--storage-state auth.json] [--cookies cookies.json]  |  node rec.mjs [url] --batch takes.json
//   --storage-state = Playwright storage-state JSON (cookies + localStorage) to
//   record a LOGGED-IN page; passed to every context (render + safeguard audit).
//   --cookies = JSON array of Playwright cookie objects, added before goto.
//   Both hold live session secrets — keep the file OUTSIDE the repo, never commit.
//   --auto-annotate = a bare click/fill/select step gets a rect outline on the
//   target plus a note with the element's visible label, for free — author
//   writes {click:"#deploy"} and the viewer sees "Deploy to production" boxed
//   without declaring it. An author-declared rect/note/circle/badge/modal wins.
//   --offline = render on the page's VIRTUAL clock instead of recording in
//   real time: the clock pauses, hot spans advance frame by frame (one
//   screenshot per frame), static dwells collapse to a single advance, and
//   ffmpeg assembles the stills via the concat demuxer. Scene time decouples
//   from wall time — long reading holds become nearly free. Side effect: the
//   page's own Date/performance clock runs virtual (visible wall clocks on
//   the target page freeze between frames). fps defaults to 15 offline.
//   No webm exists in this mode, so --keep-webm is unavailable.
//   --steps-json = inline steps (no temp file). --stamp = "n / total" step
//   counter pill in the top letterbox strip.
//   --mp4 = also export H.264 (same trim + letterbox graph, full capture res).
//   --keep-webm = keep the raw webm + write '<out>.timeline.json' sidecar
//   ({trimSec, width, height, fps, steps:[{i,t0,t1,label}]}, t0/t1 relative
//   to the trimmed start) for compose-video.mjs --sync-trim.
//   --block-hosts [csv] = abort requests to hosts that are neither the page's
//   own host nor on the optional comma list; unique blocked hosts print once.
//   --batch takes.json = [{steps, out, url?, gifWidth?, fps?, stamp?, mp4?,
//   keepWebm?}] — one chromium, one context per take, pool of 3; CLI
//   url/width/height act as defaults.
//
// steps.json: array of { click?, scrollTo?, wait?, note?, arrow?, badge?,
//                        rect?, circle?, blur?, hide?, modal? }
//   click/scrollTo = CSS selector (the step's anchor element).
//   note  = text pill near the anchor.       arrow = true, links note -> anchor.
//   badge = number on the anchor's corner.   rect/circle = true, green marker.
//   blur  = CSS selector; that element stays blurred for the rest of the take.
//   hide  = CSS selector; removed from view for the take (cookie bars, chat
//           widgets — page noise that pollutes the recording).
//   glide = true: the cursor walks to the anchor (landing just OUTSIDE its
//           box) BEFORE the step's annotations fade in — eyes follow the
//           pointer to the thing being explained. click steps glide anyway.
//   marks = [{sel, badge?, rect?, circle?}]: SECONDARY targets inside the
//           step — e.g. badge the section as 1 and its inner elements as
//           1.1 / 1.2. Each mark anchors to its own selector; long badge
//           text renders as a pill.
//   screen = "Home": persistent context pill naming the current screen. Lives
//           in the top letterbox strip (composited at gif time — it can never
//           cover the page). On a click step it updates AFTER the navigation.
//   topbar/bottombar = "text": persistent letterbox strips. The gif canvas is
//           padded +44px per used lane and the strips render there, OUTSIDE
//           the page — bar text left, screen/stamp pills right. false removes
//           the bar.
//   modal = "text" or {title, text, position?, backdrop?}: descriptive card.
//           No anchor in the step -> centered over a dimmed backdrop (narration).
//           With an anchor (click/scrollTo) -> no backdrop, placed in the corner
//           with the least page text under it (the corner farthest from the
//           element gets first refusal; explicit position: top-left|top-right|
//           bottom-left|bottom-right|center always wins) and tied to the
//           element by a 2px leader line.
//   zoom = ".sel": the camera frames that element (smooth zoom+pan, persists
//          across steps). "out": camera resets. true (click steps only):
//          zooms toward the click target before the cursor glides.
//   fill = "input#iemail" + text:"dana@co.com" (+ delay: ms/char, default 45):
//          cursor glides to the input, click-focus with ripple, types char by
//          char with real input events. Object form {sel, value, delay?} works.
//   select = "select#region" + option:"São Paulo" (or {sel, value}): native
//          dropdowns don't render in headless screencast, so a theme-aware
//          fake panel lists the select's REAL option labels, the cursor picks
//          the row, the real select.value is set (input+change dispatched).
//   camera = ".sel" (+ zoom: number, 1<zoom<=3) or {sel, zoom?}: explicit-scale
//          framing; translate is clamped so the window never leaves the page
//          canvas. "out" resets. Numeric zoom is ONLY valid alongside camera.
// note/arrow/badge/rect/circle/modal FADE in with the step and FADE out on the
// next one; blur persists; scrolling is smooth. The take ends with an injected
// END card so the looping gif has a clear stop. Prints `OK <gif> (<MB>)`.

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { makeClock, buildConcatList } from './clock.mjs';
import { convertOutputs } from './rec-encode.mjs';
import { cursorSnippet, endCardSnippet, detectPageLook, readLiveTheme, loadChromium, OFFLINE_ARGS } from './rec-page.mjs';
import { makeAnnotator } from './rec-annotate.mjs';
import { makeLive, newRegistry, registerLive, resolveTarget, applyState, dropLive, clearScene } from './rec-live.mjs';
import { makeMotion } from './rec-motion.mjs';
import { makeInput } from './rec-input.mjs';
import { makeCamera } from './rec-camera.mjs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Parse JSON with a scoped error: a steps/batch file with a typo (trailing
// comma) otherwise throws a bare V8 SyntaxError with no clue which file failed.
function parseJsonOrDie(text, src) {
  try { return JSON.parse(text); }
  catch (e) { console.error(`rec: invalid JSON in ${src}: ${e.message}`); process.exit(2); }
}

// Pure step/arg helpers live in rec-steps.mjs (extracted for readability +
// isolation). Re-exported so existing importers of rec.mjs keep working.
// only the names used INSIDE this file are imported by name; everything else
// rec-steps exports reaches downstream importers via the `export *` below.
import {
  parse, dwellMs, applyOfflineDefaults, hotHeadFor, fillSpec,
  selectSpec, autoAnnotateStep, cameraSpec,
  screenPhase, stepLabel,
  resolveCaptureHeight, validateSteps, validateBatch, offlineMotionConflicts,
  auditScenes, auditRosterLive, makeAuditBridge, collapseRedundantGlides, scrollInSpec,
} from "./rec-steps.mjs";
export * from "./rec-steps.mjs";

// camera = a CSS transform on <body>; every recorder overlay rides on <html>
// so its position:fixed stays in true viewport space while the page moves.
const camSnippet = readFileSync(join(HERE, 'cam-inject.js'), 'utf8');

async function main() {
  const a = applyOfflineDefaults(parse(process.argv.slice(2)));
  // --block-hosts [csv]: requests to hosts that are neither the page's own
  // host nor on the optional allow list are aborted at the context — file://
  // pages treat every http(s) host as foreign. Unique blocked hosts surface
  // once on stderr at the end of the run.
  const block = a.blockHosts ? { allow: new Set(a.blockHosts), blocked: new Set() } : null;
  const reportBlocked = () => {
    if (block && block.blocked.size)
      console.error('rec: blocked ' + block.blocked.size + ' hosts: ' + [...block.blocked].sort().join(', '));
  };

  // --storage-state / --cookies: seed the recording context with auth so a take
  // can film a LOGGED-IN page. storageState is a Playwright-native JSON path
  // (cookies + localStorage) passed by reference into every newContext; cookies
  // is a JSON array applied via addCookies after each context opens, before goto.
  // Both apply to the render AND safeguard/audit contexts — the audit drives the
  // real page, so deslogado it would false-fail every logged-in anchor.
  const auth = {
    storageState: a.storageState || undefined,
    cookies: a.cookies ? parseJsonOrDie(readFileSync(a.cookies, 'utf8'), a.cookies) : null,
  };
  const applyCookies = async (ctx) => { if (auth.cookies) await ctx.addCookies(auth.cookies); };

  // --batch takes.json: ONE chromium, one context per take (recordVideo is
  // per-context), a 3-wide pool, conversion as each take finishes.
  if (a.batch) {
    const vb = validateBatch(parseJsonOrDie(readFileSync(a.batch, 'utf8'), a.batch), {
      url: a.url, width: a.width, height: a.height,
      gifWidth: a.gifWidth, fps: a.fps, stamp: a.stamp, pace: a.pace,
    });
    if (!vb.ok) {
      vb.errors.forEach((e) => console.error('rec: ' + e));
      process.exit(2);
    }
    if (a.offline) {
      const conflicts = vb.takes.flatMap((t, ti) =>
        offlineMotionConflicts(t.steps).map((c) => `rec: take ${ti + 1} step ${c.step}: "${c.key}" does not render under --offline (blank burst). Record this take realtime (--fps 30).`));
      if (conflicts.length) { conflicts.forEach((e) => console.error(e)); process.exit(2); }
    }
    const chromium = await loadChromium();
    const browser = await chromium.launch(a.offline ? { args: OFFLINE_ARGS } : undefined);
    let next = 0, done = 0;
    const worker = async () => {
      while (next < vb.takes.length) {
        const t = vb.takes[next++];
        t.offline = a.offline;
        const art = await recordTake(browser, t, block, auth);
        const sizeMB = await convertOutputs(t, art);
        console.log(`OK ${t.out} (${sizeMB}MB)`);
        done++;
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(3, vb.takes.length) }, worker));
    } finally {
      await browser.close();
    }
    reportBlocked();
    console.log(`BATCH ${done}/${vb.takes.length} OK`);
    return;
  }

  if (!a.url || (!a.steps && !a.stepsJson) || !a.out) {
    console.error('usage: rec.mjs <url> --steps steps.json out.gif  |  --steps-json \'[...]\'  |  --batch takes.json');
    process.exit(2);
  }
  const steps = a.stepsJson
    ? parseJsonOrDie(a.stepsJson, '--steps-json')
    : parseJsonOrDie(readFileSync(a.steps, 'utf8'), a.steps);
  const v = validateSteps(steps);
  if (!v.ok) {
    v.errors.forEach((e) => console.error('rec: ' + e));
    process.exit(2);
  }
  // SAFEGUARDS (static): scene-level heuristics for arbitrary-primitive and
  // random-camera misuse. Warnings, not refusals — surfaced unless --no-safeguards.
  if (!a.noSafeguards) {
    const { warnings } = auditScenes(steps);
    warnings.forEach((w) => console.error(`rec: WARN step ${w.step} [${w.kind}]: ${w.message}`));
  }
  if (a.offline) {
    const conflicts = offlineMotionConflicts(steps);
    if (conflicts.length) {
      conflicts.forEach((c) => console.error(
        `rec: step ${c.step}: "${c.key}" does not render under --offline (its transform/stroke transition never samples on the paused virtual clock — blank burst). Record this take realtime (drop --offline, --fps 30).`));
      process.exit(2);
    }
  }
  {
    const rh = resolveCaptureHeight(a.width, a.height, a.ratio, steps, a.stamp);
    if (rh.warn) console.error(rh.warn);
    a.height = rh.height;
  }
  const chromium = await loadChromium();

  // SAFEGUARDS (live): off-screen + screen-breaker gate. Renders the page once
  // and refuses (exit 2) if any action/primitive anchors outside its scene's
  // camera frame or to a hidden/zero-area element — the off-screen and
  // breaks-the-screen failures that PLACE warnings can't catch. --no-safeguards
  // skips it for the rare authored exception.
  if (!a.noSafeguards) {
    const sgBrowser = await chromium.launch();
    const sgCtx = await sgBrowser.newContext({ viewport: { width: a.width, height: a.height }, ...(auth.storageState ? { storageState: auth.storageState } : {}) });
    await applyCookies(sgCtx);
    const sgPage = await sgCtx.newPage();
    await sgPage.goto(a.url, { waitUntil: 'domcontentloaded' });
    await sgPage.waitForTimeout(350);
    // audit-only bridge (measure/click/fill/select/settle/contains/reach),
    // factored into rec-steps so rec.mjs and audit-roster.mjs share one copy.
    const bridge = makeAuditBridge(sgPage, a.width, a.height);
    const { errors } = await auditRosterLive(steps, bridge);
    await sgBrowser.close();
    if (errors.length) {
      errors.forEach((e) => console.error(`rec: step ${e.step} [${e.kind}]: ${e.message}`));
      console.error(`rec: ${errors.length} safeguard error(s) — fix the roster, or pass --no-safeguards to override.`);
      process.exit(2);
    }
  }

  // --dry: resolve every selector against the live page and report, no video,
  // no waits — the cheap authoring loop before the one real take.
  if (a.dry) {
    const browser = await chromium.launch();
    const dryCtx = await browser.newContext({ viewport: { width: a.width, height: a.height }, ...(auth.storageState ? { storageState: auth.storageState } : {}) });
    await applyCookies(dryCtx);
    const pg = await dryCtx.newPage();
    await pg.goto(a.url, { waitUntil: 'domcontentloaded' });
    let missing = 0;
    let resolved = 0;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const sels = [];
      for (const k of ['click', 'scrollTo', 'blur', 'hide', 'redact', 'highlight']) if (typeof st[k] === 'string') sels.push([k, st[k]]);
      if (st.countup && st.countup !== true) sels.push(['countup', typeof st.countup === 'string' ? st.countup : st.countup.sel]);
      if (typeof st.zoom === 'string' && st.zoom !== 'out') sels.push(['zoom', st.zoom]);
      const fl = fillSpec(st);
      if (fl && fl.sel) sels.push(['fill', fl.sel]);
      const sp = selectSpec(st);
      if (sp && sp.sel) sels.push(['select', sp.sel]);
      const cm = cameraSpec(st);
      if (cm && !cm.out && cm.sel) sels.push(['camera', cm.sel]);
      for (const mk of st.marks || []) if (mk.sel) sels.push(['mark', mk.sel]);
      for (const [kind, sel] of sels) {
        const hit = await pg.evaluate((q) => {
          const el = document.querySelector(q);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return Math.round(r.width) + 'x' + Math.round(r.height);
        }, sel);
        // misses are the signal — resolving selectors print only as a count.
        if (hit) resolved++;
        else { console.log(`  [MISS] step ${i + 1} ${kind} ${sel}`); missing++; }
      }
    }
    await browser.close();
    console.log(missing
      ? `DRY FAIL — ${missing} selector(s) missing, ${resolved} resolve`
      : `DRY PASS — ${resolved} selectors resolve`);
    process.exit(missing ? 1 : 0);
  }

  const mp4Only = /\.mp4$/i.test(String(a.out || ''));
  const t = {
    url: a.url, out: a.out, width: a.width, height: a.height,
    gifWidth: a.gifWidth, fps: a.fps, stamp: a.stamp, pace: a.pace,
    theme: a.theme, accent: a.accent, ratio: a.ratio, endCard: a.endCard ?? 'none',
    gif: !mp4Only, mp4: mp4Only ? a.out : a.mp4, keepWebm: a.keepWebm, sheet: a.sheet, steps,
    offline: a.offline, autoAnnotate: a.autoAnnotate,
  };
  const browser = await chromium.launch(a.offline ? { args: OFFLINE_ARGS } : undefined);
  let art;
  try {
    art = await recordTake(browser, t, block, auth);
  } finally {
    await browser.close();
  }
  const sizeMB = await convertOutputs(t, art);
  reportBlocked();
  console.log(`OK ${t.out} (${sizeMB}MB)`);
}

// One take = one browser context (recordVideo rides the context). The param
// keeps the historical name `a` so the recording runtime below reads as the
// single-take code it grew from.
async function recordTake(browser, a, block, auth) {
  const steps = collapseRedundantGlides(a.steps);
  const offline = !!a.offline;
  const vidDir = mkdtempSync(join(tmpdir(), 'showreel-rec-'));
  // offline renders stills on the virtual clock — recordVideo would tape a
  // paused page in wall time, pure waste.
  const ctx = await browser.newContext({
    viewport: { width: a.width, height: a.height },
    ...(auth && auth.storageState ? { storageState: auth.storageState } : {}),
    ...(offline ? {} : { recordVideo: { dir: vidDir, size: { width: a.width, height: a.height } } }),
  });
  // seed logged-in cookies before the page navigates (storageState above covers
  // cookies + localStorage; addCookies augments when only cookies were given).
  if (auth && auth.cookies) await ctx.addCookies(auth.cookies);
  if (block) {
    let pageHost = '';
    try { pageHost = new URL(a.url).host; } catch { /* bare path */ }
    await ctx.route('**/*', (route) => {
      let h = '';
      try { h = new URL(route.request().url()).host; } catch { /* opaque scheme */ }
      if (!h || h === pageHost || block.allow.has(h)) return route.continue();
      block.blocked.add(h);
      return route.abort();
    });
  }
  // The scrollbar is browser chrome, not page content — on video it reads as
  // a stray gray bar hugging the edge, flashing on every programmatic scroll.
  // Strip it from every document this context loads (init script survives
  // in-take navigations).
  await ctx.addInitScript(() => {
    const drop = () => {
      const st = document.createElement('style');
      st.textContent = '::-webkit-scrollbar{display:none!important}html{scrollbar-width:none!important}';
      document.documentElement.appendChild(st);
    };
    if (document.documentElement) drop();
    else addEventListener('DOMContentLoaded', drop);
  });
  const page = await ctx.newPage();
  // recordVideo runs from page open — every chrome timestamp anchors here.
  const recStart = Date.now();
  await page.goto(a.url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(cursorSnippet());
  await page.evaluate(camSnippet);
  // Palette: auto-detected from rendered pixels, forceable per take; accent
  // recolors every marker (rect/circle/badge/leader/glossary) — beauty is the
  // default, the caller is the authority.
  const look = await detectPageLook(page);
  const pageTheme = (a.theme === 'light' || a.theme === 'dark') ? a.theme : look.theme;
  const pageBg = look.bg;
  const accent = a.accent || null;
  // --pace fast trims every scripted hold/fade ~45% for quick iteration takes;
  // user-authored step.wait values are never scaled.
  const PACE = a.pace === 'fast' ? 0.55 : 1;
  const ms = (n) => Math.round(n * PACE);

  // ---- the take's clock --------------------------------------------------
  // One object owns time (see clock.mjs). Realtime: wall passthrough anchored
  // at recStart. Offline: the page clock pauses HERE — after the load and the
  // pixel-truth palette read ran in real time — and from this point time only
  // passes when the clock pumps it, one captured frame per hot step.
  let cdp = null;
  let frameN = 0;
  const frameWrites = [];
  const epochBase = Date.now() / 1000;
  if (offline) {
    cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setVirtualTimePolicy', {
      policy: 'pause',
      initialVirtualTime: epochBase,
    });
  }
  const io = {
    wait: (n) => page.waitForTimeout(n),
    // budget expiry is async — never screenshot before it lands, or the
    // capture reads the PREVIOUS frame's surface. Starvation cap + a wall
    // watchdog turn a timer-storm page into a named error, not a hang.
    advance: (budget) => new Promise((resolve, reject) => {
      const dog = setTimeout(() => {
        cdp.off('Emulation.virtualTimeBudgetExpired', on);
        reject(new Error('rec: virtual time stalled — the page starves every budget (timer loop at one instant?)'));
      }, 20000);
      const on = () => {
        clearTimeout(dog);
        cdp.off('Emulation.virtualTimeBudgetExpired', on);
        resolve();
      };
      cdp.on('Emulation.virtualTimeBudgetExpired', on);
      cdp.send('Emulation.setVirtualTimePolicy', {
        policy: 'advance', budget, maxVirtualTimeTaskStarvationCount: 5000,
      }).catch((e) => { clearTimeout(dog); cdp.off('Emulation.virtualTimeBudgetExpired', on); reject(e); });
    }),
    // jpeg q95: q85's ringing around UI text dirties the gif palette; 95 is
    // visually clean and still a fraction of a png's encode+disk cost.
    capture: async () => {
      try {
        const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, optimizeForSpeed: true, fromSurface: true });
        const f = join(vidDir, 'f' + String(frameN++).padStart(6, '0') + '.jpg');
        frameWrites.push(writeFile(f, Buffer.from(r.data, 'base64')));
        return f;
      } catch { return null; /* mid-navigation surface — extend the last frame */ }
    },
    // a navigation swaps the renderer and drops the virtual-time policy: the
    // new document boots on the wall clock. Let the load finish in REAL time
    // (network never ran virtual anyway), then re-arm with the continuation
    // epoch so the page's Date never jumps backwards.
    navSettle: async (vtMs) => {
      try { await page.waitForLoadState('domcontentloaded'); } catch { /* racing */ }
      try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch { /* slow assets keep loading */ }
      await cdp.send('Emulation.setVirtualTimePolicy', {
        policy: 'pause',
        initialVirtualTime: epochBase + vtMs / 1000,
      });
    },
  };
  const clock = makeClock({ offline, fps: a.fps, io, wallStart: recStart });
  if (offline) page.on('framenavigated', (f) => { if (f === page.mainFrame()) clock.markNav(); });

  const canvasSrc = readFileSync(join(HERE, 'annotate-canvas.js'), 'utf8');

  const safeEval = async (fn, arg) => {
    for (let i = 0; ; i++) {
      try { return await page.evaluate(fn, arg); }
      catch (e) {
        if (i >= 2 || !/context was destroyed|navigat/i.test(String(e))) throw e;
        await clock.wait(ms(600), true);
      }
    }
  };

  // Shared context handed to the extracted helper factories (stage 5). Holds
  // the read-only deps every cluster needs; the recording loop keeps its own
  // mutable scalars (stepIndex/followOn/placeWarns) since they never leave it.
  // (named rctx — `ctx` is already the Playwright BrowserContext above.)
  const rctx = { page, clock, a, ms, PACE, safeEval, vidDir, offline, pageTheme, pageBg, accent, canvasSrc };

  // cursor + scroll motion lives in rec-motion.mjs as a factory over rctx
  // (stage 5b). camBez is internal to it; the camera→cursor handoff is the
  // object camFrame returns (aim), not shared state.
  const motion = makeMotion(rctx);
  const { glide, glideChase, scrollDeltaFor, smoothScroll, scrollContainer, bringFullyIntoView, boxOf, ensureCursor, ripple } = motion;

  // transient DOM overlays for one step (note/arrow/badge/rect/circle/modal),
  // faded out + removed on the next step. blur persists on the element itself.
  // annotation engine (showAnnotations/clearAnnotations/applyBlur/applyHide)
  // lives in rec-annotate.mjs as a factory over rctx (stage 5a).
const { showAnnotations, clearAnnotations, applyBlur, applyHide, applyRedact, applyHighlight, clearMasks, applyConfetti, applyCountup, applySparkline, applyPulse, applyRipple, applyShake, applyGlow, applyCheckmark, applyTypeon, applyReveal, applyOrbit, applyKenburns, applyFlash, applyProgress, applyCountdown, applyTrail } = makeAnnotator(rctx);
  // the camera (ensureCam/camTo/camFrame/initialFit/panToInclude/camOut) lives
  // in rec-camera.mjs as a factory over rctx (stage 5c) — the load-bearing
  // piece. camFrame returns the element's final on-screen point (aim) which
  // glideChase rides; the handoff is the return value, not shared state.
  const { ensureCam, camFrame, initialFit, panToInclude, camOut } = makeCamera(rctx);

  // live elements: persist across steps, mutate in place, cleared at scene
  // boundaries. liveReg is the host-side registry mirror (state of record);
  // makeLive does the DOM. Phase 2 wires glossary; the lifecycle is generic.
  const { liveCreate, liveOpDom, liveClearScene } = makeLive(rctx);
  const liveReg = newRegistry();
  // free-floating stateful elements that can persist + mutate across steps.
  // Anchored primitives (note/marks/progress: pinned to a page element) are
  // deliberately NOT live — re-anchoring each step is not persistence, and the
  // value the author asked for (a panel/dialog that grows) is exactly these two.
  const LIVE_TYPES = new Set(['glossary', 'modal']);
  // clear all live elements (scene boundary). Offline: a cold dwell extends the
  // LAST captured frame, which may predate this clear — so pump one fresh frame
  // after removing, making the cleared state the held frame, not a stale pre-clear
  // one. No-op cost in realtime (tick is a tiny wait).
  const liveSceneClear = async () => {
    if (!liveReg.order.length) return;
    await liveClearScene();
    clearScene(liveReg);
    if (offline) await clock.tick();
  };

  // form interactions (doFill/doSelect) live in rec-input.mjs as a factory
  // over rctx + the motion helpers (stage 5d).
  const { doFill, doSelect } = makeInput(rctx, motion);

  // Letterbox chrome (topbar/bottombar/screen pill/stamp) never touches the
  // page: the loop only records a timeline of {lane, slot, text, tStart, tEnd}
  // as clock seconds from recording start. webm->gif pads the canvas
  // (+44px per used lane) and composites the strips THERE — page content can
  // never be covered. Timestamps shift by the head-trim at conversion time.
  // Host-side bookkeeping is also navigation-proof: no DOM to restore.
  const chrome = [];
  const chromeOpen = {};
  const chromeSet = (lane, slot, text) => {
    const t = clock.now();
    const k = lane + ':' + slot;
    const cur = chromeOpen[k];
    if (cur && text !== false && cur.text === String(text)) return;
    if (cur) { cur.tEnd = t; delete chromeOpen[k]; }
    if (text === false || text == null || text === '') return;
    const ev = { lane, slot, text: String(text), tStart: t, tEnd: null };
    chrome.push(ev);
    chromeOpen[k] = ev;
  };

  let stepIndex = 0;
  let followOn = 0;
  const stepTimes = [];
  let placeWarns = 0;
  // hide is NARRATIVE: the element fades out AT its step — the viewer watches
  // the noise being removed instead of never seeing it. Re-application across
  // steps and navigations covers only the hides that already played.
  const executedHides = [];

  await initialFit();

  await page.mouse.move(120, 160, { steps: 6 });
  await clock.wait(ms(500));

  // The scene accent persists across steps: an author sets `accent` once on the
  // scene's opening step and every primitive in that scene should ride it. Track
  // the current accent so a primitive in a later step (with no accent of its own)
  // inherits the scene's colour instead of falling back to the amber default.
  let sceneAccent = accent;
  // the selector the camera currently frames (persists across steps until an
  // `out`/screen/modal). The full-visibility gate trusts the camera: a target
  // that IS the framed element (or lives inside it) is already shown by the
  // frame even if its raw geometry exceeds the untransformed viewport — don't
  // force a useless scroll on it.
  let framedSel = null;
  for (let step of steps) {
    stepIndex++;
    if (step.accent) sceneAccent = step.accent;
    if ('screen' in step || 'modal' in step) framedSel = null;
    // LIVE THEME: a mid-reel theme toggle (the page flips its own colours) must
    // re-colour every annotation built from here on. Re-read the page's actual
    // body luminance once per step (cheap, no screenshot) and overwrite the
    // shared context the annotator reads; fall back to the load-time seed when
    // the bg is transparent/unreadable. Generic — keyed on pixels, not a class.
    const liveTheme = await readLiveTheme(page);
    rctx.pageTheme = liveTheme || pageTheme;
    // --auto-annotate: a bare click/fill/select gets a rect + the element's
    // visible label as a note, for free (author annotations always win).
    if (a.autoAnnotate) {
      const sel = typeof step.click === 'string' ? step.click
        : step.fill ? (typeof step.fill === 'string' ? step.fill : step.fill.sel)
        : step.select ? (typeof step.select === 'string' ? step.select : step.select.sel)
        : null;
      let label = '';
      if (sel) {
        label = await safeEval((q) => {
          const el = document.querySelector(q);
          if (!el) return '';
          const t = (el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
            el.getAttribute('title') || el.innerText || el.value || '').trim();
          return t.length > 60 ? t.slice(0, 57) + '…' : t;
        }, sel).catch(() => '');
      }
      step = autoAnnotateStep(step, label);
    }
    // per-step playback speed: 0.25 = slow-mo (camera/glide/scroll/fades of this
    // step play 4x slower, smoothly), 2 = fast. Offline samples the animation at
    // the matching density; realtime setRate is a no-op (wall-bound). Reset after.
    if (typeof step.speed === 'number') clock.setRate(step.speed);
    const stepT0 = clock.now();
    await ensureCursor();
    await ensureCam();
    if (a.stamp) chromeSet('top', 'stamp', stepIndex + ' / ' + steps.length);
    // SCENE-TRANSITION mask clear: a step that moves the view (scrollTo or a
    // camera frame-in) and does NOT itself add a mask starts a new scene — wipe
    // any element-anchored masks (blur/redact/highlight) left from the previous
    // scene so they don't ride along over unrelated content. (camera:"out" also
    // clears, below; this covers no-zoom scenes that only scrollTo.)
    {
      const c = step.camera;
      // camera-out is ONLY the string "out" (validator + cameraSpec agree). An
      // object {out:true} is not a supported shape — it's rejected at pre-flight
      // and cameraSpec drops it, so the runtime must not pretend to honor it here
      // (the old `&& c.out` guard was dead, and implied a form that never renders).
      const cameraFrameIn = c && c !== 'out';
      const movesView = !!step.scrollTo || cameraFrameIn;
      const addsMask = step.blur || step.redact || step.highlight || step.hide;
      if (movesView && !addsMask) await clearMasks();
    }
    for (const sel of executedHides) await applyHide(sel);
    if ('topbar' in step) chromeSet('top', 'bar', step.topbar);
    if ('bottombar' in step) chromeSet('bottom', 'bar', step.bottombar);
    if (screenPhase(step) === 'before') { await liveSceneClear(); chromeSet('top', 'screen', step.screen); }
    // under follow the cursor must TRAVEL, not park: while the page scrolls,
    // glide it toward the screen center (where a followed target ends up) on
    // the same clock — the fine chase right after stitches into one long move.
    const willFollow = followOn || step.follow === true || typeof step.follow === 'number';
    if (step.scrollTo && willFollow) {
      const dy = await scrollDeltaFor(step.scrollTo);
      if (Math.abs(dy) > 2) {
        const sdur = Math.round(Math.max(700, Math.min(1800, Math.abs(dy) * 0.9)));
        await safeEval(() => window.__camScrollClamp && window.__camScrollClamp(true));
        await Promise.all([
          smoothScroll(step.scrollTo, sdur),
          glide(a.width / 2, a.height / 2, sdur + 150),
        ]);
        await safeEval(() => window.__camScrollClamp && window.__camScrollClamp(false));
      }
    } else if (step.scrollTo) await smoothScroll(step.scrollTo);
    // scrollIn: scroll INSIDE an overflow container (a log/list/feed div) — the
    // page-level scroll above can't reach content clipped inside it.
    {
      const si = scrollInSpec(step);
      if (si && si.sel) await scrollContainer(si.sel, si.to, si.dur);
    }
    // FULL-VISIBILITY GATE: an element may be marked ONLY when its WHOLE box is
    // on screen — never a card half off the viewport, never one half-clipped by
    // an inner scroll container. Before any effect/marker fires, bring each
    // target FULLY into view (scroll its overflow containers, then the page). If
    // it is simply bigger than the viewport (can't ever fit), the camera frames
    // it elsewhere; we don't scroll uselessly, just warn once.
    {
      const tgts = [
        typeof step.confetti === 'string' && step.confetti, typeof step.pulse === 'string' && step.pulse,
        step.glow, typeof step.orbit === 'string' && step.orbit, step.progress,
        typeof step.shake === 'string' && step.shake, step.reveal, (typeof step.typeon === 'string' ? step.typeon : step.typeon && step.typeon.sel),
        typeof step.kenburns === 'string' && step.kenburns, typeof step.checkmark === 'string' && step.checkmark,
        typeof step.ripple === 'string' && step.ripple, step.blur, step.redact, step.highlight,
        typeof step.spotlight === 'string' && step.spotlight, typeof step.rect === 'string' && step.rect,
        typeof step.circle === 'string' && step.circle, typeof step.inset === 'string' && step.inset,
        (typeof step.sparkline === 'string' ? step.sparkline : step.sparkline && step.sparkline.sel),
        (typeof step.countup === 'string' ? step.countup : step.countup && step.countup !== true && step.countup.sel),
      ].filter((x) => typeof x === 'string' && x);
      for (const tg of tgts) {
        // is this target already framed by the camera (it IS the framed element
        // or a descendant)? then the viewport fit is the camera's job — but inner
        // overflow containers must STILL be scrolled (the camera can't do that),
        // so we pass the hint, not skip the call.
        let cameraFramed = false;
        if (framedSel) {
          cameraFramed = await safeEval(({ h, s }) => {
            const he = document.querySelector(h), se = document.querySelector(s);
            return !!(he && se && (he === se || he.contains(se)));
          }, { h: framedSel, s: tg });
        }
        const ok = await bringFullyIntoView(tg, cameraFramed);
        if (!ok) console.error(`rec: step ${stepIndex} target "${tg}" cannot be shown whole (larger than the viewport or clipped) — frame it with camera before marking`);
      }
    }
    // DINAMICIDADE: every primitive accepts {duration,count,scale,intensity}.
    // Read each knob from the primitive's own object form first, else the step's
    // shared top-level keys (dur/count/intensity/size), else null = the fn's
    // default. The fn clamps. A weak AI fires the bare selector and gets the
    // default; a power user passes an object or the shared keys to tune.
    const effOpts = (v) => {
      const o = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
      const pick = (a, b) => (a != null ? a : (b != null ? b : null));
      return {
        duration: pick(o.duration, step.dur),
        count: pick(o.count, step.count),
        scale: pick(o.scale, typeof step.size === 'number' ? step.size : null),
        intensity: pick(o.intensity, step.intensity),
      };
    };
    if (step.blur) await applyBlur(step.blur);
    if (step.redact) await applyRedact(step.redact, step.accent || sceneAccent || null);
    if (step.highlight) await applyHighlight(step.highlight, step.accent || sceneAccent || null);
    if (step.confetti) await applyConfetti(typeof step.confetti === 'string' ? step.confetti : (step.confetti.sel || step.click || step.glide || 'body'), step.accent || sceneAccent, effOpts(step.confetti));
    if (step.pulse) await applyPulse(typeof step.pulse === 'string' ? step.pulse : (step.pulse.sel || step.click || step.glide || 'body'), step.accent || sceneAccent, effOpts(step.pulse));
    if (step.glow) await applyGlow(typeof step.glow === 'string' ? step.glow : step.glow.sel, step.accent || sceneAccent || null, effOpts(step.glow));
    if (step.orbit) await applyOrbit(typeof step.orbit === 'string' ? step.orbit : (step.orbit.sel || step.click || step.glide || 'body'), step.accent || sceneAccent, effOpts(step.orbit));
    if (step.progress) await applyProgress(typeof step.progress === 'string' ? step.progress : step.progress.sel, step.accent || sceneAccent || null, effOpts(step.progress));
    if (step.shake) await applyShake(typeof step.shake === 'string' ? step.shake : (step.shake.sel || step.click || step.glide || 'body'), step.accent || sceneAccent, effOpts(step.shake));
    if (step.reveal) await applyReveal(typeof step.reveal === 'string' ? step.reveal : step.reveal.sel, null, effOpts(step.reveal));
    if (step.typeon) await applyTypeon(step.typeon, effOpts(step.typeon));
    if (step.kenburns) await applyKenburns(typeof step.kenburns === 'string' ? step.kenburns : (step.kenburns.sel || step.click || step.glide || step.scrollTo || 'body'), effOpts(step.kenburns));
    if (step.checkmark) await applyCheckmark(typeof step.checkmark === 'string' ? step.checkmark : (step.checkmark.sel || step.click || step.glide || 'body'), step.accent || sceneAccent, effOpts(step.checkmark));
    if (step.ripple) await applyRipple(typeof step.ripple === 'string' ? step.ripple : (step.ripple.sel || step.click || step.glide || 'body'), step.accent || sceneAccent, effOpts(step.ripple));
    if (step.trail) await applyTrail(typeof step.trail === 'string' ? step.trail : step.trail.from, typeof step.trail === 'string' ? null : step.trail.to, step.accent || sceneAccent || null, effOpts(step.trail));
    if (step.countdown != null) await applyCountdown(typeof step.countdown === 'number' ? step.countdown : (typeof step.countdown === 'object' ? step.countdown : 3), typeof step.countdown === 'string' ? step.countdown : null, effOpts(step.countdown));
    if (step.flash) await applyFlash(typeof step.flash === 'string' ? step.flash : (step.accent || sceneAccent), effOpts(step.flash));
    if (step.countup) await applyCountup(step.countup === true ? (step.click || step.scrollTo) : (typeof step.countup === 'string' ? step.countup : step.countup.sel), typeof step.countup === 'object' ? step.countup.to : null, effOpts(step.countup));
    if (step.sparkline) await applySparkline(typeof step.sparkline === 'string' ? step.sparkline : step.sparkline.sel, typeof step.sparkline === 'object' ? step.sparkline.points : null, effOpts(step.sparkline));
    // a hide note must anchor to where the row WAS: capture its rect BEFORE it
    // collapses, else the note loses its box and gets clamped to a corner.
    let preHideBox = null;
    if (step.hide && typeof step.hide === 'string') preHideBox = await boxOf(step.hide);
    if (step.hide) {
      await applyHide(step.hide);
      if (!executedHides.includes(step.hide)) executedHides.push(step.hide);
      await clock.wait(ms(500), true);
    }
    // camera moves land between the previous step's fade-out and this step's
    // overlays; every box below is measured after the camera settles.
    if (step.zoom === 'out') await camOut();
    else if (typeof step.zoom === 'string') await camFrame(step.zoom, 0, 800, true);
    const cam = cameraSpec(step);
    if (cam || step.follow === false) followOn = 0; // explicit camera takes the wheel
    if (cam) {
      if (cam.out) { await liveSceneClear(); await clearMasks(); await camOut(); framedSel = null; } // camera:out is a scene boundary — clear live elements + masks before the pull-out
      else { await camFrame(cam.sel, cam.zoom ? Math.max(1, Math.min(3, cam.zoom)) : 0, 800, true); framedSel = cam.sel; }
    } else if (step.follow === false) await camOut();
    if (step.zoom === 'out') framedSel = null;
    else if (typeof step.zoom === 'string') framedSel = step.zoom;
    // follow: bind ONCE and the camera re-aims at every step target from here
    // on — one smooth camFrame per move, cursor and camera arrive together —
    // until {"camera":...}, {"camera":"out"} or {"follow":false} takes it
    // back. (A per-frame cursor chase reads viewport coords as page coords
    // under an active transform and drifts; aiming at the target does not.)
    const followScale = step.follow === true ? 1.4
      : typeof step.follow === 'number' ? Math.max(1, Math.min(3, step.follow)) : null;
    if (followScale) followOn = followScale;
    const fillS = fillSpec(step);
    const selectS = selectSpec(step);
    if (fillS) await doFill(fillS);
    if (selectS) await doSelect(selectS);
    const zoomSel = typeof step.zoom === 'string' && step.zoom !== 'out' ? step.zoom : null;
    const camSel = cam && !cam.out ? cam.sel : null;
    // annotation-only steps anchor on their own selector (rect/circle/arrow);
    // a bare note falls back to a top-center pseudo-target so it still shows.
    const arrowEdge = step.arrow === 'top' || step.arrow === 'bottom';
    const annSel = (typeof step.rect === 'string' && step.rect) ||
      (typeof step.circle === 'string' && step.circle) ||
      (typeof step.spotlight === 'string' && step.spotlight) ||
      // a note on a mask step (blur/redact/highlight/hide) must anchor to the
      // MASKED element — otherwise it has no box, drifts to center/top, and its
      // arrow points at whatever is nearest (a card), not the thing it labels.
      (typeof step.blur === 'string' && step.blur) ||
      (typeof step.redact === 'string' && step.redact) ||
      (typeof step.highlight === 'string' && step.highlight) ||
      (typeof step.hide === 'string' && step.hide) ||
      (typeof step.confetti === 'string' && step.confetti) ||
      (typeof step.pulse === 'string' && step.pulse) ||
      (typeof step.ripple === 'string' && step.ripple) ||
      (typeof step.shake === 'string' && step.shake) ||
      (typeof step.glow === 'string' && step.glow) ||
      (typeof step.checkmark === 'string' && step.checkmark) ||
      (typeof step.typeon === 'string' ? step.typeon : (step.typeon && step.typeon.sel)) ||
      (typeof step.reveal === 'string' && step.reveal) ||
      (typeof step.orbit === 'string' && step.orbit) ||
      (typeof step.progress === 'string' && step.progress) ||
      (step.countup ? (step.countup === true ? null : (typeof step.countup === 'string' ? step.countup : step.countup.sel)) : null) ||
      (step.sparkline ? (typeof step.sparkline === 'string' ? step.sparkline : step.sparkline.sel) : null) ||
      (typeof step.arrow === 'string' && !arrowEdge && step.arrow) ||
      (step.inset ? (typeof step.inset === 'string' ? step.inset : step.inset.sel) : null) || null;
    // glide is a real cursor target: include it so a {follow, glide} step has a
    // box for the camera to chase (without it, follow never engages — the camera
    // stays wide and the chase is invisible). Action keys still take priority.
    const sel = step.click || (fillS && fillS.sel) || (selectS && selectS.sel) || (typeof step.glide === 'string' && step.glide) || step.scrollTo || zoomSel || camSel || annSel;
    let box = sel ? await boxOf(sel) : null;
    // a hidden element's live rect is collapsed — use the pre-hide rect so the
    // note anchors where the row was (and its arrow points there), not a corner.
    if (step.hide && sel === step.hide && preHideBox && (!box || box.h < 4)) box = preHideBox;
    if (!box && arrowEdge) {
      // edge arrow: the letterbox strips live OUTSIDE the page canvas — a
      // synthetic margin target lets a note point at the bar above/below.
      box = { x: Math.round(a.width / 2) - 1, y: step.arrow === 'top' ? 6 : a.height - 8, w: 2, h: 2 };
    }
    if (!box && step.note && !step.modal && !(step.marks || []).some((m) => m.text)) {
      // bare note rides top-center — also alongside marks, as long as none of
      // them carries text (text marks summon the glossary panel there)
      box = { x: Math.round(a.width / 2) - 1, y: 120, w: 2, h: 2 };
    }
    if (step.click && box && (box.y < 0 || box.y + box.h > a.height)) {
      await smoothScroll(step.click);
      box = await boxOf(step.click);
    }
    // A marker must show WHOLE: rect/circle overshoot the target (ellipse
    // +35%, badge sits 38px above) — if any of it would clip the viewport,
    // scroll the target into full view and re-measure before drawing.
    if (box && sel && (step.rect || step.circle || step.badge != null || step.spotlight)) {
      const m = Math.max(step.badge != null ? 48 : 0, step.circle ? Math.round(box.h * 0.18) + 26 : 0, step.rect ? 20 : 0, step.spotlight ? 14 : 0);
      if (box.y - m < 0 || box.y + box.h + m > a.height) {
        await smoothScroll(sel);
        box = await boxOf(sel);
      }
    }
    let panned = false;
    let followAimed = false;
    if (followOn && box && sel && !camSel && !(step.zoom === true && step.click)) {
      // camera and cursor travel TOGETHER on one clock; the scroll leg (with
      // the cursor already gliding) happened just above, so this is the fine
      // approach stitched onto it.
      const dist = Math.hypot(box.x + box.w / 2 - a.width / 2, box.y + box.h / 2 - a.height / 2);
      const dur = Math.round(Math.max(450, Math.min(900, 240 + dist * 0.5)));
      const aim = await camFrame(sel, followOn, dur, true, true, false);
      if (aim) {
        await glideChase(aim, dur);
        await clock.wait(100, true); // transition tail frames — measure after they land
        box = await boxOf(sel);
        followAimed = true; // cursor is ON the target — no glide-beside after
        // the chase is only right if it LANDED — measure, don't assume.
        const off = await safeEval((q) => {
          const c = document.getElementById('__cursor__');
          const el = document.querySelector(q);
          if (!c || !el) return null;
          const r = el.getBoundingClientRect();
          return Math.hypot(
            (parseFloat(c.style.left) || 0) - (r.x + r.width / 2),
            (parseFloat(c.style.top) || 0) - (r.y + r.height / 2));
        }, sel);
        if (off != null && off > 48) {
          placeWarns++;
          console.log(`FOLLOW warn step ${stepIndex}: cursor ${Math.round(off)}px off target`);
        }
      }
    } else if (box && sel && !camSel && !(step.zoom === true && step.click) &&
        (box.x < 8 || box.x + box.w > a.width - 8)) {
      panned = await panToInclude(sel);
      if (panned) box = await boxOf(sel);
    }
    if (step.zoom === true && step.click && box) {
      await camFrame(step.click, 1.6, 700, true, true);
      box = await boxOf(step.click); // post-zoom rect = where glide/click must land
    }
    if (step.glide && box && !step.click && !followAimed) {
      // Land the cursor just off the RIGHT edge at the element's VERTICAL CENTER
      // — a small, natural arrival beside the target, not a diagonal hop to the
      // far bottom-right corner (which read as the cursor overshooting then
      // doubling back). Small gap so the pointer doesn't cover the content.
      const gx = Math.min(a.width - 16, Math.max(16, box.x + box.w + 10));
      const gy = Math.min(a.height - 16, Math.max(16, box.y + box.h / 2));
      await glide(gx, gy, 700);
      await clock.wait(ms(150));
    }
    // markers outline DETAIL: a rect/circle hugging a near-fullscreen element
    // is just a picture frame — skip it (the note/badge still render).
    if (box && (step.rect || step.circle) && box.w >= a.width * 0.85 && box.h >= a.height * 0.85) {
      console.error(`rec: step ${stepIndex} target fills the viewport — rect/circle skipped (mark something smaller)`);
      step = { ...step };
      delete step.rect;
      delete step.circle;
    }
    // live elements: a stateful primitive carrying an `id` is born live (persists
    // instead of wipe-and-rebuild); a `live` step mutates one in place.
    let liveHandled = false;
    for (const t of LIVE_TYPES) {
      const tv = step[t];
      if (tv && typeof tv === 'object' && !Array.isArray(tv) && typeof tv.id === 'string' && tv.id) {
        await liveCreate(t, tv);
        // host-side state mirror: rows (deep-copied so a later applyState never
        // aliases the original step JSON — matches the replace path) + the accent.
        const rows = Array.isArray(tv.items) ? tv.items.map((r) => ({ ...r })) : [];
        registerLive(liveReg, { id: tv.id, type: t, state: { rows, color: tv.color } });
        liveHandled = true;
      }
    }
    if (step.live && typeof step.live === 'object') {
      const { target, id, reason } = resolveTarget(liveReg, step.live);
      if (!target) console.log(`LIVE warn step ${stepIndex}: ${reason}`);
      else {
        applyState(target, step.live);
        await liveOpDom(id, step.live);
        if (step.live.remove) dropLive(liveReg, id);
      }
      liveHandled = true;
    }
    const hasOverlay = !liveHandled && (step.modal || (step.marks && step.marks.length) || step.inset || step.glossary ||
      (box && (step.note || step.rect || step.circle || step.arrow || step.badge != null || step.spotlight)));
    if (hasOverlay) {
      const w = await showAnnotations(box, step, sel);
      for (const m of w || []) {
        placeWarns++;
        console.log(`PLACE warn step ${stepIndex}: ${m}`);
      }
    }
    if (step.click && box) {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      await glide(cx, cy, 600);
      await clock.wait(ms(120));
      await ripple(cx, cy);
      await clock.wait(ms(500), true);
      // hit-target guard: an overlay (fixed panel, drawer) may sit above the
      // target's coordinates — a raw mouse click would hit IT instead. When
      // the point doesn't resolve to the target, dispatch on the element.
      const onTarget = await safeEval(({ x, y, q }) => {
        const t = document.querySelector(q);
        const el = document.elementFromPoint(x, y);
        return !!(t && el && (el === t || t.contains(el)));
      }, { x: cx, y: cy, q: step.click });
      if (onTarget) {
        try { await page.mouse.click(cx, cy); } catch { /* ignore */ }
      } else {
        await safeEval((q) => document.querySelector(q)?.click(), step.click);
      }
      try { await page.waitForLoadState('domcontentloaded'); } catch { /* no nav */ }
      if (step.screen) {
        // the click may navigate; any evaluate racing the navigation dies with
        // "execution context destroyed" — settle, then retry once on the new doc.
        const restore = async () => {
          await ensureCursor();
          await ensureCam();
          for (const sel of executedHides) await applyHide(sel);
        };
        try { await page.waitForLoadState('domcontentloaded'); } catch { /* no nav */ }
        await clock.wait(ms(900), true);
        try { await restore(); } catch { await clock.wait(ms(900), true); await restore(); }
        await liveSceneClear();
        chromeSet('top', 'screen', step.screen);
      }
    }
    const dwellTexts = [];
    if (step.note) dwellTexts.push(String(step.note));
    if (step.marks) {
      const gloss = step.marks.map((m) => m.text).filter(Boolean).join(' ');
      if (gloss) dwellTexts.push(gloss);
    }
    if (step.glossary && typeof step.glossary === 'object' && Array.isArray(step.glossary.items)) {
      dwellTexts.push([step.glossary.title, ...step.glossary.items.map((it) => it.text)].filter(Boolean).join(' '));
    }
    if (step.modal) {
      const m = typeof step.modal === 'string' ? { text: step.modal } : step.modal;
      dwellTexts.push([m.title, m.text].filter(Boolean).join(' '));
    }
    const baseHold = step.wait != null ? step.wait : ms(1200);
    const hold = dwellTexts.length
      ? Math.max(baseHold, 400 + Math.max(...dwellTexts.map((t) => dwellMs(t, PACE))))
      : baseHold;
    // the dwell is static EXCEPT its head: overlay fade-in, badge/glossary
    // staggers and click reactions animate inside the first slice.
    await clock.wait(hold, hotHeadFor(step));
    // HOLD the final overlay: clearing it on the last step ends the reel on a
    // mid-dissolve smear. Keep the closing card/note fully present as the last
    // frame; only clear overlays on non-final steps.
    const isLastStep = stepIndex === steps.length;
    if (hasOverlay && !isLastStep) await clearAnnotations();
    if (panned) await camOut();
    if (typeof step.speed === 'number') clock.setRate(1);
    stepTimes.push({ i: stepIndex, t0: stepT0, t1: clock.now(), label: stepLabel(step) });
  }

  try { await page.waitForLoadState('domcontentloaded'); } catch { /* idle */ }
  // END card only on explicit request. endCard: 'none' (default) = never
  // recorded; 'gif' = card recorded, mp4 cuts before it; 'all' = everywhere.
  // REC_PROF=1: per-step scene seconds on stderr — the cheap first probe when
  // a take's duration surprises (it caught the offline scroll crawl).
  if (process.env.REC_PROF) console.error('PROF ' + JSON.stringify(stepTimes.map((s) => ({ i: s.i, d: +(s.t1 - s.t0).toFixed(2), label: s.label.slice(0, 24) }))));
  const endT0 = clock.now();
  if (a.endCard !== 'none') {
    await safeEval(endCardSnippet());
    await clock.wait(dwellMs('END', PACE), 400); // card entrance, then a still
  }
  let webm = null, listPath = null;
  if (offline) {
    const frames = await clock.flush();
    await Promise.all(frameWrites);
    listPath = join(vidDir, 'list.txt');
    writeFileSync(listPath, buildConcatList(frames));
  }
  await page.close();
  if (!offline) webm = await page.video().path();
  await ctx.close();
  console.log(placeWarns ? `PLACE ${placeWarns} warning(s) — inspect those steps` : 'PLACE clean');
  return { webm, listPath, chrome, pageTheme, pageBg, vidDir, stepTimes, endT0 };
}

// webm -> gif (+ optional --mp4, --keep-webm sidecar). Prefer the two-pass
// palette path (system ffmpeg). If only the stripped bundled ffmpeg is
// available (no palettegen), fall back to a simple scale conversion so a gif
// is still produced.
// Skip the first second of the take: recordVideo starts at context open, so
// the head of the webm is the blank page still loading — a gif opening on a
// white frame reads as broken.
// Offline input is the concat demuxer over the captured stills instead of a
// webm. The list is a curated sequence (no blank head), so TRIM_S drops to 0
// — every re-base below becomes a no-op — and the demuxer's cumulative PTS
// line up with the chrome/step timestamps because the clock guaranteed
// sum(frame durations) == its own timeline.

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
