// rec-camera.mjs — the camera: ensureCam/camTo/camFrame (frame an element,
// auto-fit + explicit zoom, sticky-bar pin, anti-cut clamp), initialFit
// (establishing shot on the page's text span), panToInclude (temporary pan for
// an off-frame target), camOut (release to base or identity). Extracted from
// rec.mjs (stage 5c) as makeCamera(rctx). This is the load-bearing piece —
// 16 rounds of bugfix live in the in-page math — so the move is byte-identical.
// camFrame returns the element's final on-screen point (aim) for rec-motion's
// glideChase; the handoff is the return value, not shared state.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const camSnippet = readFileSync(join(HERE, 'cam-inject.js'), 'utf8');

// Single source of the framing math, shared with the audit's `reach` estimate
// (rec-steps makeAuditBridge) so the two can never drift. FILL = fraction of
// the viewport auto-fit aims to fill; CAP = auto-fit ceiling; MARGIN = no-crop
// breathing room (element never flush to the edge); MAX = hard scale ceiling an
// explicit zoom can reach; ZOOM = the default zoom the audit assumes when it
// asks "can a zoom magnify this?". Both run inside page.evaluate (no module
// scope), so they receive this object as an argument rather than closing over it.
export const FRAME = { FILL: 0.86, CAP: 2.4, MARGIN: 0.94, MAX: 3, ZOOM: 2 };

export function makeCamera(rctx) {
  const { page, safeEval, clock, ms, a } = rctx;

  const ensureCam = async () => {
    const alive = await safeEval(() => !!window.__camTo);
    if (!alive) await safeEval(camSnippet);
  };
  const camTo = async (s, tx, ty, ms) => {
    await safeEval(({ s, tx, ty, ms }) => window.__camTo(s, tx, ty, ms), { s, tx, ty, ms });
    await clock.wait(ms, true);
    await clock.wait(50);
  };
  // settle=false fires the camera move and returns the element's FINAL
  // viewport point immediately — the caller can ride a cursor glide on the
  // same clock so camera and pointer travel together.
  const camFrame = async (sel, fixed, ms, clampPan, raw, settle = true, scrollDy = 0) => {
    const ok = await safeEval(({ sel, fixed, ms, vw, vh, clampPan, raw, scrollDy, cap }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      // degrade BEFORE measuring: the freeze is position-preserving, so rects
      // stay valid — and the ex-sticky list below needs to exist already.
      if (window.__camDegradeFx) window.__camDegradeFx();
      const { s, tx, ty } = window.__cam;
      const r = el.getBoundingClientRect();
      // rects come back post-transform; body's transform-origin is its own
      // corner b (not the viewport — scroll/margin shift it), so undo the
      // camera around b:  layout = b + (visual - t - b)/s  (b=0 -> (r.x-tx)/s)
      // then re-aim so the element center lands mid-viewport:
      //   t2 = v/2 - b - s2*(center - b)
      const br = document.body.getBoundingClientRect();
      const bx = br.x - tx, by = br.y - ty;
      const lx = bx + (r.x - tx - bx) / s, ly = by + (r.y - ty - by) / s;
      const lw = r.width / s, lh = r.height / s;
      // auto-fit frames the element at 86% of the viewport; an explicit zoom
      // MULTIPLIES that fit (1.3 = 30% tighter than fitted) — a raw scale like
      // 1.3 is invisible on wide viewports where the element already fits.
      // auto-fit caps at 2.4: filling 86% of the viewport with a small button
      // amputates its surroundings — explicit zoom can still push to 3.
      const fit = Math.max(1, Math.min(cap.CAP, Math.min(cap.FILL * vw / lw, cap.FILL * vh / lh)));
      // NO-CROP CEILING (correct-by-construction): zoom is "free" up to a hard
      // ceiling that the script enforces so a too-big zoom can never crop the
      // element it is supposed to show. The ceiling is a fit that leaves a
      // breathing MARGIN around the element (94% of the viewport, not flush to
      // the edge) — a wide row (.stats/.cards/table) at zoom:2 would otherwise
      // amputate half its items. Any explicit zoom is clamped to this; it may
      // tighten toward the margin but never past it. No author/agent can crop.
      const noCrop = cap.MARGIN * Math.min(vw / lw, vh / lh); // never flush to edge
      const s2raw = raw ? Math.max(1, Math.min(cap.MAX, fixed)) : fixed ? Math.max(1, Math.min(cap.MAX, fit * fixed)) : fit;
      const s2 = Math.max(1, Math.min(s2raw, noCrop));
      let tx2 = vw / 2 - bx - s2 * (lx + lw / 2 - bx);
      let ty2 = vh / 2 - by - s2 * (ly + lh / 2 - by);
      // a target inside the sticky bar: keep the bar visible and pinned to
      // the frame top for this shot; everywhere else the bar fades out under
      // zoom (chrome doesn't float over a content camera).
      const fxBar = (window.__camFx || []).find((q) => q.sticky && (q.e === el || q.e.contains(el)));
      window.__camBarT = !!fxBar;
      if (fxBar) ty2 = by * (s2 - 1);
      if (clampPan) {
        // anti-cut: keep the visible window inside the CONTENT bounds (union
        // of the body's children in layout space) — clamping to the body lets
        // a centered max-width layout pan into its own empty margins.
        let cL = Infinity, cT = Infinity, cR = -Infinity, cB = -Infinity;
        for (const ch of document.body.children) {
          if (ch.id === '__cursor__' || ch.id === '__ann__') continue;
          const cr0 = ch.getBoundingClientRect();
          if (!cr0.width || !cr0.height) continue;
          const clx = bx + (cr0.x - tx - bx) / s, cly = by + (cr0.y - ty - by) / s;
          cL = Math.min(cL, clx); cT = Math.min(cT, cly);
          cR = Math.max(cR, clx + cr0.width / s); cB = Math.max(cB, cly + cr0.height / s);
        }
        if (!isFinite(cL)) { cL = bx; cT = by; cR = bx + br.width / s; cB = by + br.height / s; }
        // never frame past the page canvas: off-canvas furniture (a drawer
        // parked at right:-280px) must not let the camera show the void
        cL = Math.max(cL, bx); cT = Math.max(cT, by);
        cR = Math.min(cR, bx + br.width / s); cB = Math.min(cB, by + br.height / s);
        const maxTx = -bx - s2 * (cL - bx), minTx = vw - bx - s2 * (cR - bx);
        tx2 = minTx > maxTx ? (minTx + maxTx) / 2 : Math.max(minTx, Math.min(maxTx, tx2));
        const maxTy = -by - s2 * (cT - by), minTy = vh - by - s2 * (cB - by);
        ty2 = minTy > maxTy ? (minTy + maxTy) / 2 : Math.max(minTy, Math.min(maxTy, ty2));
      }
      window.__camExplicit = true;
      // a planned native scroll shifts the frame by a known delta; the
      // post-scroll transform is the current aim displaced by it, while the
      // on-screen landing point (fy and the chase path) is scroll-invariant.
      window.__camTo(s2, tx2, ty2 + scrollDy, ms);
      // a pinned bar ignores the camera's vertical pan — the landing point of
      // a target inside it is its offset within the bar, scaled, from y=0.
      const bar = fxBar
        ? { cssTop: fxBar.cssTop, relIn: (r.y + r.height / 2 - fxBar.e.getBoundingClientRect().y) / s }
        : null;
      return {
        fx: tx2 + bx + s2 * (lx + lw / 2 - bx),
        fy: bar
          ? (bar.cssTop + bar.relIn) * s2
          : ty2 + by + s2 * (ly + lh / 2 - by),
        cam: { s0: s, tx0: tx, ty0: ty, s1: s2, tx1: tx2, ty1: ty2, bx, by, cx: lx + lw / 2, cy: ly + lh / 2, bar },
      };
    }, { sel, fixed, ms, vw: a.width, vh: a.height, clampPan: !!clampPan, scrollDy, cap: FRAME });
    // settle = the camera's CSS transition (hot) plus a dead 50ms margin.
    if (ok && settle) { await clock.wait(ms, true); await clock.wait(50); }
    return ok;
  };

  // establishing fit is OPT-IN: the take opens at true 1:1 on the real page
  // proportion — no zoom the author didn't ask for. '--fit <n>' enables the
  // auto-fit with that ceiling.
  const FIT_MAX = a.fit && a.fit !== 'off' ? Math.max(1, Math.min(1.6, parseFloat(a.fit) || 1)) : 1;

  // Establishing shot: a centered max-width layout reads as dead side gutters
  // when the viewport outgrows the content column. Fit the camera to the
  // page's text span — trimmed percentiles, so a full-bleed header can't veto
  // the fit. Step targets do NOT widen the span: one corner control (a Menu
  // pill at the far edge) drags the whole take off-center; a target that
  // lands off-frame gets a temporary pan at step time instead. Camera steps
  // compose on top; "out" returns HERE, not identity.
  const initialFit = async () => {
    if (FIT_MAX <= 1) return;
    const fitted = await safeEval(({ vw, fitMax }) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const lefts = [], rights = [];
      for (let t = walker.nextNode(); t && lefts.length < 800; t = walker.nextNode()) {
        if (!t.textContent.trim()) continue;
        const el = t.parentElement;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight * 3) continue;
        // off-canvas elements (toasts parked beyond an edge) must not widen
        // the measured span — they are invisible until something moves them.
        if (r.right <= 0 || r.left >= innerWidth) continue;
        // floating chrome (cookie banners, FABs, sticky bars) is not page
        // content — a corner overlay must not drag the framing its way.
        let fixed = false;
        for (let p = el; p && p !== document.body; p = p.parentElement) {
          const pos = getComputedStyle(p).position;
          if (pos === 'fixed' || pos === 'sticky') { fixed = true; break; }
        }
        if (fixed) continue;
        lefts.push(r.left); rights.push(Math.min(r.right, innerWidth));
      }
      if (lefts.length < 6) return false;
      lefts.sort((x, y) => x - y); rights.sort((x, y) => x - y);
      const q = (arr, p) => arr[Math.max(0, Math.min(arr.length - 1, Math.round(p * (arr.length - 1))))];
      let L = q(lefts, 0.08), R = q(rights, 0.92);
      L = Math.max(0, L - 24); R = Math.min(innerWidth, R + 24);
      const span = R - L;
      if (!(span > 0)) return false;
      const s = Math.min(fitMax, vw * 0.94 / span);
      if (s < 1.06) return false;
      const br = document.body.getBoundingClientRect();
      const tx = (vw - s * span) / 2 - br.x - s * (L - br.x);
      window.__camBase = { s, tx, ty: 0, bodyTop: br.y + scrollY };
      window.__camScrollSync();
      window.__camTo(s, tx, 0, 700);
      return true;
    }, { vw: a.width, fitMax: FIT_MAX });
    if (fitted) { await clock.wait(ms(700), true); await clock.wait(ms(50)); }
  };

  // A scripted target the establishing fit pushed off-frame (corner pills,
  // edge controls) gets a temporary horizontal pan at the SAME scale — the
  // framing never jumps, it slides. Released back to base after the step.
  const panToInclude = async (sel) => {
    const ok = await safeEval(({ sel, vw }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const pad = 32;
      let dx = 0;
      if (r.left < pad) dx = pad - r.left;
      else if (r.right > vw - pad) dx = (vw - pad) - r.right;
      if (!dx) return false;
      const { s, tx, ty } = window.__cam;
      window.__camExplicit = true;
      window.__camTo(s, tx + dx, ty, 600);
      return true;
    }, { sel, vw: a.width });
    if (ok) { await clock.wait(600, true); await clock.wait(50); }
    return ok;
  };

  // "out" releases an explicit camera back to the BASE framing (the
  // establishing fit at the current scroll), or true identity when no fit.
  const camOut = async () => {
    await safeEval(() => {
      window.__camExplicit = false;
      const b = window.__camBase;
      if (b) window.__camTo(b.s, b.tx, window.__camBaseTy(), 700);
      else window.__camTo(1, 0, 0, 700);
    });
    await clock.wait(700, true);
    await clock.wait(50);
  };

  return { ensureCam, camTo, camFrame, initialFit, panToInclude, camOut };
}
