(() => {
  window.__cam = { s: 1, tx: 0, ty: 0 };
  // sticky and backdrop-filter break under an ancestor transform: sticky
  // stops sticking (renders at its static slot) and backdrop-filter samples
  // the wrong region — a translucent header smears a band across the zoomed
  // frame. Degrade them deterministically while the camera holds the body:
  // sticky -> relative (same slot, keeps z-index), backdrop-filter -> none
  // with the translucent bg solidified. Restored on identity.
  window.__camDegradeFx = () => {
    if (window.__camFx) return;
    window.__camFx = [];
    for (const e of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(e);
      const sticky = cs.position === 'sticky';
      const fixed = cs.position === 'fixed';
      const bf = (cs.backdropFilter && cs.backdropFilter !== 'none') ||
                 (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none');
      if (!sticky && !fixed && !bf) continue;
      window.__camFx.push({ e, pos: e.style.position, bf: e.style.backdropFilter,
        wbf: e.style.webkitBackdropFilter, bg: e.style.backgroundColor,
        top: e.style.top, left: e.style.left, tl: e.style.translate,
        op: e.style.opacity, trn: e.style.transition });
      if (sticky) {
        // Mutating position teleports the bar or strands it at a stale
        // offset. Leave the page's CSS ALONE: under the camera the broken
        // sticky renders at its natural slot, and a per-frame compensating
        // translateY (driven by the body's REAL interpolated matrix) pins it
        // to the screen top whenever it would be stuck — exact through
        // transitions, scrolls and release.
        const fx = window.__camFx[window.__camFx.length - 1];
        fx.sticky = true;
        fx.cssTop = parseFloat(cs.top) || 0;
        fx.d = 0;
        let slot = 0;
        for (let o = e; o; o = o.offsetParent) slot += o.offsetTop;
        fx.slotDoc = slot;
      }
      if (fixed) {
        // fixed under a transformed ancestor resolves against the BODY, not
        // the viewport — pin it back to viewport space (post-production: it
        // shows where the crop shows that part of the screen). Computed
        // top/left track the element's own transitions per frame.
        const fx = window.__camFx[window.__camFx.length - 1];
        fx.fixed = true;
        fx.dx = 0;
        fx.dy = 0;
      }
      if (bf) {
        e.style.backdropFilter = 'none';
        e.style.webkitBackdropFilter = 'none';
        const m = cs.backgroundColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) e.style.backgroundColor = 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')';
      }
    }
    // measured, incremental pin: under a transformed ancestor the engine
    // still "sticks" the bar, just in the wrong coordinate space — so the
    // stuck test must come from LAYOUT (scroll vs slot, transform-immune)
    // and the pin from where the bar actually rendered, corrected per frame.
    // The pin target is the NATIVE viewport top, not the frame top: the
    // camera is post-production zoom — framing the page top shows the bar
    // magnified, framing the footer leaves it outside the crop.
    const tick = () => {
      const tStr = getComputedStyle(document.body).transform;
      // dirty-check: with the camera and scroll both still, sticky state
      // cannot change — skip the forced layouts. Pinned FIXED elements keep
      // ticking (their own transitions move them under a static camera).
      const gate = tStr + '|' + scrollY;
      if (gate === window.__camFxGate && !(window.__camFx || []).some((q) => q.fixed)) {
        window.__camFxR = requestAnimationFrame(tick);
        return;
      }
      window.__camFxGate = gate;
      const mt = new DOMMatrix(tStr);
      const s = mt.a || 1, tx = mt.e, ty = mt.f;
      const br = document.body.getBoundingClientRect();
      const bxN = br.x - tx, byN = br.y - ty;
      // the pin rides the independent CSS "translate" property: it composes
      // with the element's own "transform" (class animations included)
      // instead of overwriting it.
      // every pin model dragged the bar across the frame in SOME flow — a
      // camera living on the content simply doesn't show floating chrome
      // (post-production would only reveal it with the crop at the screen
      // top). Under zoom the bar fades out; it returns at 1:1, and stays
      // pinned to the frame top only while the camera targets something
      // INSIDE it (the menu shot).
      const zoomed = s > 1.04 || Math.abs(ty) > 2 || Math.abs(tx) > 2;
      for (const q of window.__camFx || []) {
        if (q.sticky) {
          if (!q.fad) { q.e.style.transition = (q.trn ? q.trn + ',' : '') + 'opacity .25s ease'; q.fad = true; }
          if (!zoomed) {
            q.e.style.opacity = q.op || '';
            if (q.d) { q.d = 0; q.e.style.translate = q.tl || ''; }
          } else if (window.__camBarT) {
            q.e.style.opacity = q.op || '';
            const r = q.e.getBoundingClientRect();
            q.d += (q.cssTop * s - r.y) / s;
            q.e.style.translate = '0px ' + q.d + 'px';
          } else {
            q.e.style.opacity = '0';
          }
        } else if (q.fixed) {
          const cs2 = getComputedStyle(q.e);
          const r = q.e.getBoundingClientRect();
          // natural viewport position (untransformed) of the element's top-left.
          // left/top positioned: read directly. right/bottom positioned (a cart
          // drawer parked at right:-300px): the left edge is innerWidth - width
          // - right — WITHOUT this, an off-canvas drawer reads as natX=0 and the
          // pin drags it INTO frame ("appears from nowhere"). width/height are
          // the layout (unscaled) box: r.width / s.
          const lRaw = parseFloat(cs2.left), tRaw = parseFloat(cs2.top);
          const rRaw = parseFloat(cs2.right), bRaw = parseFloat(cs2.bottom);
          const natX = !isNaN(lRaw) ? lRaw
            : !isNaN(rRaw) ? innerWidth - r.width / s - rRaw : 0;
          const natY = !isNaN(tRaw) ? tRaw
            : !isNaN(bRaw) ? innerHeight - r.height / s - bRaw : 0;
          q.dx += (bxN + tx + s * (natX - bxN) - r.x) / s;
          q.dy += (byN + ty + s * (natY - byN) - r.y) / s;
          q.e.style.translate = q.dx + 'px ' + q.dy + 'px';
        }
      }
      window.__camFxR = requestAnimationFrame(tick);
    };
    window.__camFxR = requestAnimationFrame(tick);
  };
  window.__camRestoreFx = () => {
    cancelAnimationFrame(window.__camFxR);
    for (const r of window.__camFx || []) {
      r.e.style.position = r.pos;
      r.e.style.backdropFilter = r.bf;
      r.e.style.webkitBackdropFilter = r.wbf;
      r.e.style.backgroundColor = r.bg;
      r.e.style.top = r.top;
      r.e.style.left = r.left;
      if (r.sticky || r.fixed) r.e.style.translate = r.tl || '';
      if (r.sticky) { r.e.style.opacity = r.op; r.e.style.transition = r.trn; }
    }
    window.__camFx = null;
  };
  window.__camTo = (s, tx, ty, ms) => {
    if (s !== 1 || tx || ty) window.__camDegradeFx();
    // the crop is anchored to the DOCUMENT while a camera holds the body —
    // pinned bars must hold still RELATIVE TO THE CROP through native
    // scrolls, or they sweep across the frame. Freeze the scroll reference
    // at each aim.
    window.__camScrollRef = scrollY;
    const b = document.body.style;
    b.transformOrigin = '0 0';
    // commit the FROM pose (what's on screen now) with no transition, force a
    // reflow to lock it as the transition's start value, THEN arm the timed
    // transition to the TO pose. Under a paused virtual clock the engine
    // otherwise resolves straight to the end and the move renders frozen;
    // realtime gets this commit free via a real frame between moves. (mirror
    // of camTransitionPlan, unit-tested.)
    const f = window.__cam;
    b.transition = 'none';
    b.transform = 'translate(' + f.tx + 'px,' + f.ty + 'px) scale(' + f.s + ')';
    void document.body.offsetHeight;
    b.transition = 'transform ' + ms + 'ms cubic-bezier(.4,0,.2,1)';
    b.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
    Object.assign(window.__cam, { s, tx, ty });
    // a late scroll event mid-transition must not let the scroll-sync stomp
    // the transform with transition:none — that snaps the move to its end
    // frame ("zoom out without animation"). Moving = sync hands off.
    window.__camMoving = true;
    clearTimeout(window.__camMovT);
    window.__camMovT = setTimeout(() => { window.__camMoving = false; }, ms + 60);
    clearTimeout(window.__camIdT);
    if (s === 1 && !tx && !ty) {
      // identity: drop the property entirely after the transition so the body
      // leaves its compositing layer (residual scale(1) re-rasterizes text).
      window.__camIdT = setTimeout(() => { b.transform = ''; b.transition = ''; window.__camRestoreFx(); }, ms + 80);
    }
  };
  // a native scroll under a held camera slides the document through the
  // crop — past its edges the crop exposes the void above/below the page
  // (the black bar). While a scroll leg runs, clamp the crop to the content
  // every frame, like a real pinch viewport that can never leave the page.
  window.__camScrollClamp = (on) => {
    cancelAnimationFrame(window.__camSCr);
    if (!on) {
      // release: leave __cam == the rendered transform and clear the residual
      // transition:none the clamp stamped on its last frame — otherwise the
      // next __camTo inherits 'none' and skips its animation. (mirror of
      // clampRelease, unit-tested.)
      const c = window.__cam, b = document.body.style;
      if (c && (c.s !== 1 || c.tx || c.ty)) {
        b.transition = 'none';
        b.transform = 'translate(' + c.tx + 'px,' + c.ty + 'px) scale(' + c.s + ')';
        void document.body.offsetHeight;
        b.transition = '';
      }
      return;
    }
    const step = () => {
      const c = window.__cam;
      if (c && (c.s !== 1 || c.tx || c.ty)) {
        const br = document.body.getBoundingClientRect();
        let ty = c.ty;
        if (br.y > 0) ty -= br.y;
        else if (br.y + br.height < innerHeight) ty += innerHeight - (br.y + br.height);
        if (ty !== c.ty) {
          const b = document.body.style;
          b.transition = 'none';
          b.transform = 'translate(' + c.tx + 'px,' + ty + 'px) scale(' + c.s + ')';
          c.ty = ty;
        }
      }
      window.__camSCr = requestAnimationFrame(step);
    };
    window.__camSCr = requestAnimationFrame(step);
  };
  // Base framing = the establishing auto-fit. A persistent scale outgrows the
  // native scroll range (the scaled page is taller than what scrollY can
  // traverse), so ty blends toward the page bottom as scrollY approaches max
  // — the WHOLE page stays reachable. Explicit camera steps own the
  // transform until released back to base.
  window.__camBase = null;
  window.__camExplicit = false;
  window.__camBaseTy = () => {
    const b = window.__camBase;
    if (!b) return 0;
    const docH = document.documentElement.scrollHeight, vh = innerHeight;
    const max = docH - vh;
    if (max <= 0) return b.ty;
    const tyEnd = vh - b.bodyTop + max - b.s * (docH - b.bodyTop);
    const k = Math.min(1, Math.max(0, scrollY / max));
    return b.ty + (tyEnd - b.ty) * k;
  };
  window.__camScrollSync = () => {
    if (window.__camSyncOn) return;
    window.__camSyncOn = true;
    const apply = () => {
      const b = window.__camBase;
      if (!b || window.__camExplicit || window.__camMoving) return;
      const st = document.body.style;
      st.transition = 'none';
      st.transformOrigin = '0 0';
      const ty = window.__camBaseTy();
      st.transform = 'translate(' + b.tx + 'px,' + ty + 'px) scale(' + b.s + ')';
      Object.assign(window.__cam, { s: b.s, tx: b.tx, ty });
    };
    addEventListener('scroll', () => requestAnimationFrame(apply), { passive: true });
  };
  return { cam: true };
})()
