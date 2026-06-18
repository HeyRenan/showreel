// rec-motion.mjs — cursor + scroll motion: glide/glideChase (cursor walks on
// the take's clock, chasing the camera curve), smoothScroll/scrollDeltaFor
// (distance-scaled scroll the native API can't do), boxOf, ripple, ensureCursor.
// Extracted from rec.mjs (stage 5b) as a factory over the shared recorder
// context (rctx). The camera→cursor handoff is an object return (camFrame's
// aim), not shared state, so camera (rec-camera.mjs) stays a separate file.

import { cursorSnippet } from './rec-page.mjs';

export function makeMotion(rctx) {
  const { page, safeEval, clock, ms } = rctx;

  const glide = async (x, y, ms = 600) => {
    const [sx, sy] = await safeEval(() => {
      const c = document.getElementById('__cursor__');
      return [parseFloat(c.style.left) || 80, parseFloat(c.style.top) || 80];
    });
    // progress rides the clock: realtime that's the wall (each mouse.move
    // costs a protocol round-trip, so a fixed-N loop would overshoot and
    // desync from the camera's CSS transition); offline it's the SAME virtual
    // clock the CSS runs on — cursor and camera land together by construction.
    await clock.motion(ms, async (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
    });
  };

  // The camera animates on cubic-bezier(.4,0,.2,1); the same curve here lets
  // the cursor reproduce the camera's clock exactly.
  const camBez = (() => {
    const X = (u) => 3 * u * (1 - u) * (1 - u) * 0.4 + 3 * u * u * (1 - u) * 0.2 + u * u * u;
    const Y = (u) => 3 * u * u * (1 - u) + u * u * u;
    return (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      let lo = 0, hi = 1, u = t;
      for (let i = 0; i < 24; i++) { if (X(u) < t) lo = u; else hi = u; u = (lo + hi) / 2; }
      return Y(u);
    };
  })();
  // Follow glide: a straight screen-space line to the element's FINAL point
  // only meets the element at the end — mid-move the page slides under a
  // cursor headed somewhere else, which reads as aimless wandering. Chase
  // the element's CURRENT on-screen point instead, reconstructed from the
  // camera's own curve, so cursor and target converge together.
  const glideChase = async (aim, msDur) => {
    const c = aim.cam;
    if (!c) return glide(aim.fx, aim.fy, msDur);
    const [sx, sy] = await safeEval(() => {
      const k = document.getElementById('__cursor__');
      return [parseFloat(k.style.left) || 80, parseFloat(k.style.top) || 80];
    });
    await clock.motion(msDur, async (k) => {
      const e = camBez(k);
      const s = c.s0 + (c.s1 - c.s0) * e;
      const tx = c.tx0 + (c.tx1 - c.tx0) * e, ty = c.ty0 + (c.ty1 - c.ty0) * e;
      // offline: a CSS transition armed in a paused instant does not advance
      // under the clock pump within the step (it only lands on the NEXT step's
      // frames), so the camera renders a full step behind. Drive the transform
      // by JS each frame from the SAME curve the cursor uses — camera and
      // cursor share one source of truth and land together. Realtime keeps the
      // CSS transition (smoother, compositor-driven) untouched.
      if (clock.offline) {
        await safeEval(({ s, tx, ty }) => {
          const b = document.body.style;
          b.transition = 'none';
          b.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
          window.__cam.s = s; window.__cam.tx = tx; window.__cam.ty = ty;
        }, { s, tx, ty });
      }
      const px = tx + c.bx + s * (c.cx - c.bx);
      const py = c.bar
        ? c.by + ty + s * (c.bar.cssTop + c.bar.relIn - c.by)
        : ty + c.by + s * (c.cy - c.by);
      await page.mouse.move(sx + (px - sx) * e, sy + (py - sy) * e);
    });
  };

  // Chromium's native smooth scrollIntoView caps its duration (~400ms) no
  // matter the distance, so long jumps read as instant on video. Animate the
  // scroll ourselves: duration scales with distance, cubic ease both ends.
  // the scroll destination is deterministic — expose it so a follow move can
  // pre-aim camera and cursor at the POST-scroll frame and run all three on
  // one clock.
  // KEEP IN SYNC with the scroll-target math in smoothScroll's plan (b0/layTop/
  // winH/docH/wanted/denom). Two safeEval closures can't share a host helper
  // across the serialization boundary; a comment is cleaner than eval. This one
  // returns the DELTA (target - scrollY); smoothScroll keeps the absolute target.
  const scrollDeltaFor = async (sel) => safeEval((s) => {
    const el = document.querySelector(s);
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const cam = window.__cam || { s: 1, ty: 0 };
    const cs = cam.s || 1;
    const br = document.body.getBoundingClientRect();
    const b0 = br.y - cam.ty;
    const layTop = b0 + (r.top - cam.ty - b0) / cs + scrollY;
    const winH = innerHeight / cs;
    const docH = document.documentElement.scrollHeight;
    let wanted = layTop - (winH - r.height / cs) / 2;
    const denom = docH - winH;
    if (denom > 0) wanted = wanted * (docH - innerHeight) / denom;
    return Math.max(0, Math.min(docH - innerHeight, wanted)) - scrollY;
  }, sel);
  const smoothScroll = async (sel, durOverride) => {
    // the destination is measured once in-page, but the ANIMATION runs on the
    // host clock (one scrollTo per motion tick). An in-page rAF-progress loop
    // here was the one animation whose clock the offline renderer couldn't
    // own — rAF cadence sags below the virtual budget after a camera cycle
    // and the scroll crawled. CSS transitions interpolate by clock and are
    // immune; this was the only rAF-timestamp progression in the page.
    const plan = await safeEval(({ s, durOverride }) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      // KEEP IN SYNC with scrollDeltaFor's scroll-target math (b0/layTop/winH/
      // docH/wanted/denom) — same rule, two safeEval closures that can't share a
      // helper. This keeps the absolute target for the animation.
      // Under a camera scale the rect comes back scaled and the visible
      // window only covers innerHeight/scale LAYOUT pixels — aim in layout
      // space, then map the wanted window top onto the NATIVE scroll range
      // (the base scroll-sync stretches it over the taller scaled page).
      const cam = window.__cam || { s: 1, ty: 0 };
      const cs = cam.s || 1;
      const br = document.body.getBoundingClientRect();
      const b0 = br.y - cam.ty;
      const layTop = b0 + (r.top - cam.ty - b0) / cs + scrollY;
      const winH = innerHeight / cs;
      const docH = document.documentElement.scrollHeight;
      let wanted = layTop - (winH - r.height / cs) / 2;
      const denom = docH - winH;
      if (denom > 0) wanted = wanted * (docH - innerHeight) / denom;
      const targetY = Math.max(0, Math.min(docH - innerHeight, wanted));
      const startY = scrollY;
      const dist = targetY - startY;
      if (Math.abs(dist) < 2) return null;
      const dur = durOverride || Math.max(700, Math.min(1800, Math.abs(dist) * 0.9));
      return { startY, dist, dur };
    }, { s: sel, durOverride: durOverride || 0 });
    if (plan) {
      // a translucent backdrop-filter header veils the content scrolling under
      // it (dim/blur ghost); soften the chrome for the scroll, restore after.
      // No-op under a live camera (it already degraded the chrome).
      await safeEval(() => window.__scrollSoftenChrome && window.__scrollSoftenChrome());
      await clock.motion(plan.dur, async (k) => {
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        await safeEval((y) => scrollTo(0, y), plan.startY + plan.dist * e);
      });
      await safeEval(() => window.__scrollRestoreChrome && window.__scrollRestoreChrome());
    }
    await clock.wait(ms(250));
  };

  const boxOf = async (sel) => safeEval((s) => {
    const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);

  // Is the element FULLY visible? Not just "some of it shows" — the whole box
  // must sit inside the viewport AND inside the visible (un-clipped) rect of
  // every overflow ancestor (a card half-hidden in a scroll container counts as
  // NOT fully visible). Returns { full, fits, clippers } — `fits` is false when
  // the element is simply bigger than the viewport so no scroll can ever show it
  // whole (the caller then frames it with the camera instead of scrolling).
  const visibilityOf = async (sel) => safeEval((s) => {
    const el = document.querySelector(s); if (!el) return { full: true, fits: true, clippers: 0 };
    // layout-space rect: undo the body camera transform so scroll math is sane.
    const cam = window.__cam || { s: 1, tx: 0, ty: 0 };
    const cs = cam.s || 1;
    const raw = el.getBoundingClientRect();
    const br = document.body.getBoundingClientRect();
    const b0x = br.x - cam.tx, b0y = br.y - cam.ty;
    const top = b0y + (raw.top - cam.ty - b0y) / cs;
    const bottom = b0y + (raw.bottom - cam.ty - b0y) / cs;
    const left = b0x + (raw.left - cam.tx - b0x) / cs;
    const right = b0x + (raw.right - cam.tx - b0x) / cs;
    const vh = innerHeight / cs, vw = innerWidth / cs;
    const PAD = 6;
    let full = top >= PAD && bottom <= vh - PAD && left >= -PAD && right <= vw + PAD;
    // walk overflow ancestors: any scroll/clip container whose visible rect cuts
    // the element means part of it is hidden behind the container edge.
    let clippers = 0, p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      const st = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(st.overflow + st.overflowX + st.overflowY)) {
        clippers++;
        const cr = p.getBoundingClientRect();
        const cTop = b0y + (cr.top - cam.ty - b0y) / cs, cBot = b0y + (cr.bottom - cam.ty - b0y) / cs;
        const cLef = b0x + (cr.left - cam.tx - b0x) / cs, cRig = b0x + (cr.right - cam.tx - b0x) / cs;
        if (top < cTop - PAD || bottom > cBot + PAD || left < cLef - PAD || right > cRig + PAD) full = false;
      }
      p = p.parentElement;
    }
    const fits = (bottom - top) <= vh - 2 * PAD && (right - left) <= vw - 2 * PAD;
    return { full, fits, clippers };
  }, sel);

  // Bring the element FULLY into view before it is marked: scroll each overflow
  // container that clips it so the whole box shows, then the page. Order matters
  // — inner clippers first (page scroll can't reveal what a container hides),
  // page last. Returns false when the element is bigger than the viewport (no
  // scroll can show it whole — the caller frames it with the camera instead).
  // cameraFramed = the camera already frames this element (or an ancestor), so
  // the page-viewport fit is handled by the transform — we still reveal it from
  // any INNER scroll container (the camera can't scroll a container), but we do
  // NOT page-scroll or fail when its raw box exceeds the untransformed viewport.
  const bringFullyIntoView = async (sel, cameraFramed = false) => {
    const vis = await visibilityOf(sel);
    if (vis.full) return true;
    // 1. ALWAYS scroll every clipping ancestor to reveal the element inside it —
    // a camera frame never scrolls a container, so a line clipped by an inner
    // overflow box must be scrolled into the container's view regardless.
    if (vis.clippers > 0) {
      const containers = await safeEval((s) => {
        const el = document.querySelector(s); if (!el) return [];
        const out = []; let p = el.parentElement;
        while (p && p !== document.body && p !== document.documentElement) {
          const st = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(st.overflow + st.overflowX + st.overflowY)
            && (p.scrollHeight - p.clientHeight > 1 || p.scrollWidth - p.clientWidth > 1)) {
            if (!p.id) p.dataset.srClipId = p.dataset.srClipId || ('srclip' + Math.floor(performance.now()));
            out.push(p.id ? '#' + p.id : '[data-sr-clip-id="' + p.dataset.srClipId + '"]');
          }
          p = p.parentElement;
        }
        return out.reverse(); // innermost first
      }, sel);
      for (const cSel of containers) await scrollContainer(cSel, sel);
    }
    // the camera owns the viewport fit — inner reveal done, that's all we can/should do.
    if (cameraFramed) return true;
    if (!vis.fits) return false; // too big to ever fully fit + no camera — caller's problem
    // 2. page scroll for the residual (element clipped by the window itself).
    const after = await visibilityOf(sel);
    if (!after.full) await smoothScroll(sel);
    const fin = await visibilityOf(sel);
    return fin.full;
  };

  // scroll INSIDE a container (overflow:auto/scroll div — a log, a list, a feed)
  // rather than the page. window.scrollTo can't reach content clipped inside an
  // overflow box; this animates the container's own scrollTop on the take's
  // clock (same one-write-per-tick model as smoothScroll, immune to the paused
  // virtual clock). Without a `to` target it scrolls the container to its
  // BOTTOM (the common "follow the log as it grows" move). With `to`, it centres
  // that descendant in the container's viewport. Camera-scale-agnostic: scrollTop
  // is a layout property, unaffected by the body transform.
  const scrollContainer = async (sel, toSel, durOverride) => {
    const plan = await safeEval(({ s, toSel }) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 1) return null; // nothing to scroll
      const startY = el.scrollTop;
      let targetY;
      if (toSel) {
        const t = document.querySelector(toSel);
        if (!t) return null;
        // descendant offset within the container's scroll space, centred.
        const er = el.getBoundingClientRect(), tr = t.getBoundingClientRect();
        const rel = (tr.top - er.top) + el.scrollTop; // layout offset top-of-target
        targetY = rel - (el.clientHeight - tr.height) / 2;
      } else {
        targetY = max; // bottom
      }
      targetY = Math.max(0, Math.min(max, targetY));
      const dist = targetY - startY;
      if (Math.abs(dist) < 2) return null;
      return { startY, dist };
    }, { s: sel, toSel: toSel || null });
    if (plan) {
      const dur = durOverride || Math.max(600, Math.min(1800, Math.abs(plan.dist) * 1.1));
      await clock.motion(dur, async (k) => {
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        await safeEval(({ s, y }) => { const el = document.querySelector(s); if (el) el.scrollTop = y; },
          { s: sel, y: plan.startY + plan.dist * e });
      });
    }
    await clock.wait(ms(200));
  };

  // page.evaluate injections die on navigation (a click that routes away) —
  // restore the cursor so the next glide still has something to move.
  const ensureCursor = async () => {
    const alive = await safeEval(() => !!document.getElementById('__cursor__'));
    if (!alive) await safeEval(cursorSnippet());
  };

  const ripple = async (x, y) => {
    // fire-and-forget: __ripple returns a Promise that resolves only when its
    // rAF animation ends. Returning it to page.evaluate would make evaluate
    // AWAIT that animation — and under a paused virtual clock the rAF never
    // advances, so the call hangs ~18s until virtual-time starvation. Trigger
    // it as a statement (no return); the following clock.wait pumps the frames
    // that actually animate it.
    await page.evaluate(([px, py]) => { if (window.__ripple) window.__ripple(px, py); }, [x, y]);
  };

  return { glide, glideChase, camBez, scrollDeltaFor, smoothScroll, scrollContainer, visibilityOf, bringFullyIntoView, boxOf, ensureCursor, ripple };
}
