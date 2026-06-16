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
      await clock.motion(plan.dur, async (k) => {
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        await safeEval((y) => scrollTo(0, y), plan.startY + plan.dist * e);
      });
    }
    await clock.wait(ms(250));
  };

  const boxOf = async (sel) => safeEval((s) => {
    const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);

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

  return { glide, glideChase, camBez, scrollDeltaFor, smoothScroll, boxOf, ensureCursor, ripple };
}
