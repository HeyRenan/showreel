// rec-annotate.mjs — the annotation engine: draws note/rect/circle/badge/
// spotlight/marks/glossary/modal/loupe + blur/hide, with collision-aware
// placement. Extracted from rec.mjs (stage 5a) as a factory over the shared
// recorder context (rctx). Most of showAnnotations is one big in-page
// safeEval string; the host side only needs safeEval + a few read-only deps.

import { modalLayout } from './rec-steps.mjs';

export function makeAnnotator(rctx) {
  const { safeEval, clock, a, ms, pageTheme, accent } = rctx;

  let lastFade = 400;
  const showAnnotations = async (box, step, sel) => {
    lastFade = step.fade || 400;
    const modal = step.modal ? modalLayout(step.modal, box, { w: a.width, h: a.height }) : null;
    const modalExplicit = !!(step.modal && typeof step.modal === 'object' && step.modal.position);
    return await safeEval(({ box, step, modal, modalExplicit, theme, sel, accent }) => {
      document.getElementById('__ann__')?.remove();
      const GREEN = step.accent || accent || '#16a34a';
      const T = theme === 'dark'
        ? { card: 'rgba(248,250,252,.96)', ink: '#0f172a', modalBg: '#f8fafc', modalTitle: '#0f172a', modalText: '#334155' }
        : { card: 'rgba(15,23,42,.95)', ink: '#fff', modalBg: '#0d1b2d', modalTitle: '#fff', modalText: '#c9d4e0' };
      const DARK = T.card;
      // Shared glass tokens (see references/visual-system.md) — one premium look
      // across note / badge / glossary / modal: frosted surface, hairline border,
      // accent left-edge, floating shadow, inset top highlight.
      const isDark = theme === 'dark';
      const GLASS = isDark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.80)';
      // notes float WITHOUT a dim backdrop, so they need more opacity than cards
      // to stay legible over busy UI.
      const NOTEBG = isDark ? 'rgba(17,26,44,0.92)' : 'rgba(255,255,255,0.94)';
      const NOTEINK = isDark ? '#f8fafc' : '#0f172a'; // contrast vs NOTEBG, not T.ink
      const HAIR = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)';
      const SHADOW = '0 10px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.16)';
      const BLUR = 'backdrop-filter:blur(13px) saturate(140%);-webkit-backdrop-filter:blur(13px) saturate(140%)';
      const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const W = innerWidth, H = innerHeight;
      const anchorEl = sel ? document.querySelector(sel) : null;
      const wrap = document.createElement('div');
      wrap.id = '__ann__';
      wrap.style.cssText = 'position:fixed;z-index:2147483640;pointer-events:none;left:0;top:0;width:100%;height:100%;opacity:0;transition:opacity ' + ((step.fade || 400) / 1000) + 's ease;';
      // appended invisible up-front: the modal can measure its real rect, and
      // pointer-events:none keeps the whole tree out of elementFromPoint.
      document.documentElement.appendChild(wrap);
      // stacking ladder: precedence is semantic, never DOM-append order —
      // backdrop(1) < markers(2) < leaders/arrows(3) < badges(4) <
      // text cards: note/modal/glossary(6) < loupe(7). Cursor/ripple/select
      // panel live outside the wrap, always above.
      const add = (css, html, z = 2) => {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;pointer-events:none;z-index:' + z + ';' + css;
        if (html != null) d.innerHTML = html;
        wrap.appendChild(d);
        return d;
      };
      // Nothing may overlap on the canvas: annotations avoid the target box,
      // each other, the viewport edges — and the PAGE'S OWN TEXT. A 3x3 probe
      // grid over a candidate rect counts points landing on text-bearing page
      // elements (the target and its descendants are exempt — covering your
      // own anchor is the collision check's job, not the text score's).
      const placed = [];
      // the placer KNOWS when it degraded — surfacing that as a verdict means
      // a clean take never needs frame-by-frame eyes afterwards.
      const warns = [];
      if (box) placed.push({ x: box.x - 6, y: box.y - 6, w: box.w + 12, h: box.h + 12, anchor: true });
      // Point sampling (elementFromPoint grids) threads BETWEEN text lines on
      // real pages — and element boxes lie (a full-width <h2> "occupies" far
      // right of its glyphs). Ground truth: index every visible text line's
      // client rect once per step, then score a candidate by how many line
      // rects intersect it (6px slack so edge clips count). Elements with a
      // direct text node catch <b>, <span> and bare <div> logos too.
      const glyphIndex = [];
      // page SURFACES (cards, panels — anything with an authored edge): a
      // label straddling a card's boundary reads as sloppy even over blank
      // padding, so surface edges score against a candidate too.
      const surfaceIndex = [];
      for (const e of document.body.querySelectorAll('*')) {
        if (e.closest('#__ann__')) continue;
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
        let texty = false;
        for (const c of e.childNodes) if (c.nodeType === 3 && c.nodeValue.trim()) { texty = true; break; }
        if (texty) {
          for (const c of e.childNodes) {
            if (c.nodeType !== 3 || !c.nodeValue.trim()) continue;
            const rg = document.createRange();
            rg.selectNodeContents(c);
            for (const g of rg.getClientRects())
              if (g.width && g.height && g.right > 0 && g.bottom > 0 && g.left < W && g.top < H)
                glyphIndex.push({ l: g.left, t: g.top, r: g.right, b: g.bottom, el: e });
          }
        }
        const edged = (parseFloat(cs.borderRadius) || 0) >= 4 || cs.boxShadow !== 'none' || parseFloat(cs.borderTopWidth) > 0;
        if (edged) {
          const g = e.getBoundingClientRect();
          if (g.width >= 90 && g.height >= 40 && g.width * g.height <= 0.6 * W * H &&
              g.right > 0 && g.bottom > 0 && g.left < W && g.top < H)
            surfaceIndex.push({ l: g.left, t: g.top, r: g.right, b: g.bottom, el: e });
        }
      }
      const textScore = (r) => {
        let s = 0;
        const L = r.x - 6, T = r.y - 6, R = r.x + r.w + 6, B = r.y + r.h + 6;
        for (const g of glyphIndex) {
          if (g.r <= L || g.l >= R || g.b <= T || g.t >= B) continue;
          if (anchorEl && (g.el === anchorEl || anchorEl.contains(g.el))) continue;
          s++;
        }
        return s;
      };
      const straddleScore = (r) => {
        let s = 0;
        for (const g of surfaceIndex) {
          if (g.r <= r.x || g.l >= r.x + r.w || g.b <= r.y || g.t >= r.y + r.h) continue;
          if (anchorEl && (g.el === anchorEl || anchorEl.contains(g.el) || g.el.contains(anchorEl))) continue;
          const inside = r.x >= g.l + 8 && r.x + r.w <= g.r - 8 && r.y >= g.t + 8 && r.y + r.h <= g.b - 8;
          if (!inside) s++;
        }
        return s;
      };
      // glyphs are unreadable under a label; a straddled card edge is merely
      // ugly — weight them so text always dominates the choice.
      const occlusion = (r) => textScore(r) * 10 + straddleScore(r);
      const apart = (r, p) => r.x + r.w + 6 <= p.x || p.x + p.w + 6 <= r.x || r.y + r.h + 6 <= p.y || p.y + p.h + 6 <= r.y;
      const collides = (r, skipAnchor) => placed.some((p) => !(skipAnchor && p.anchor) && !apart(r, p));
      const inView = (r) => r.x >= 8 && r.y >= 8 && r.x + r.w <= W - 8 && r.y + r.h <= H - 8;
      const settle = (cands, w, h, skipAnchor, kind = 'overlay') => {
        // the loupe is a raised shadowed circle — resting over a card reads
        // fine; only covered TEXT counts against it. Penalizing card edges
        // chased it across the screen on a frame-long leader.
        const occl = kind === 'loupe' ? (r) => textScore(r) * 10 : occlusion;
        let best = null;
        for (const c of cands) {
          const r = { x: c.x, y: c.y, w, h };
          if (!inView(r) || collides(r, skipAnchor || c.skip)) continue;
          const sc = occl(r);
          if (!sc) { placed.push(r); return r; }
          if (!best || sc < best.sc) best = { r, sc };
        }
        if (best) {
          // every anchored candidate lands on glyphs (crowded zoomed frames):
          // scan the viewport for the nearest truly-free spot — the leader
          // line keeps the connection, free space keeps it readable. Any
          // covered glyph (score >= 10) qualifies; surface-edge-only doesn't.
          // Badges never roam: a number far from its target marks nothing.
          if (best.sc >= 10 && !kind.startsWith('badge')) {
            let rescue = null;
            const sx = Math.max(60, (W - w) / 10), sy = Math.max(40, (H - h) / 8);
            for (let gy = 8; gy + h <= H - 8; gy += sy)
              for (let gx = 8; gx + w <= W - 8; gx += sx) {
                const r = { x: gx, y: gy, w, h };
                if (collides(r, skipAnchor) || occl(r)) continue;
                const dd = Math.hypot(gx - cands[0].x, gy - cands[0].y);
                if (!rescue || dd < rescue.dd) rescue = { r, dd };
              }
            if (rescue) { placed.push(rescue.r); return rescue.r; }
            warns.push(kind + ' covers page text (score ' + best.sc + ')');
          }
          placed.push(best.r);
          return best.r;
        }
        warns.push(kind + ' fallback-clamped — may overlap');
        const f = { x: cl(cands[0].x, 8, W - w - 8), y: cl(cands[0].y, 8, H - h - 8), w, h };
        placed.push(f);
        return f;
      };
      if (modal) {
        if (modal.backdrop) add('left:0;top:0;width:100%;height:100%;background:rgba(8,15,30,.5);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)', null, 1);
        // sanitize HTML content to a safe inline subset (layout tags only).
        const safeHtml = (h) => String(h).replace(/<(?!\/?(p|b|i|em|strong|code|ul|ol|li|br|span)\b)[^>]*>/gi, '');
        const isDark = theme !== 'light';
        const glassBg = isDark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.80)';
        const ink = isDark ? '#f8fafc' : '#0f172a';
        const muted = isDark ? 'rgba(248,250,252,0.62)' : 'rgba(15,23,42,0.58)';
        const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)';
        const header = modal.title
          ? '<div style="display:flex;align-items:center;gap:9px;padding:14px 20px;border-bottom:1px solid ' + hairline + '">'
            + '<span style="width:9px;height:9px;border-radius:50%;background:' + GREEN + ';box-shadow:0 0 8px ' + GREEN + '"></span>'
            + '<span style="color:' + ink + ';font:700 19px/1.2 system-ui;letter-spacing:-.01em">' + String(modal.title).replace(/[<>&]/g, '') + '</span></div>'
          : '';
        const body = (modal.html || modal.text)
          ? '<div style="padding:16px 20px;color:' + ink + ';font:400 16px/1.55 system-ui">'
            + (modal.html ? safeHtml(modal.html) : String(modal.text || '').replace(/[<>&]/g, '')) + '</div>'
          : '';
        const footer = modal.footer
          ? '<div style="padding:11px 20px;border-top:1px solid ' + hairline + ';color:' + muted + ';font:500 13px system-ui">' + String(modal.footer).replace(/[<>&]/g, '') + '</div>'
          : '';
        const cardHtml = header + body + footer;
        const cardCss = (max) => 'max-width:' + max + 'px;width:calc(100% - 80px);overflow:hidden;'
          + 'background:' + glassBg + ';backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);'
          + 'border:1px solid ' + hairline + ';border-left:2px solid ' + GREEN + ';border-radius:16px;'
          + 'box-shadow:0 12px 40px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.16)';
        if (modal.pos === 'center' || !box) {
          add('left:50%;top:50%;transform:translate(-50%,-50%);' + cardCss(540), cardHtml, 6);
        } else {
          // anchored: measure off-screen, then take the corner with the lowest
          // text-occlusion score (same 3x3 probe) that clears the target — the
          // geometric farthest corner gets first refusal. Explicit position wins.
          const card = add('left:-9999px;top:0;' + cardCss(420), cardHtml, 6);
          const mr = card.getBoundingClientRect();
          const mw = Math.round(mr.width), mh = Math.round(mr.height);
          const corners = {
            'top-left': { x: 28, y: 28 },
            'top-right': { x: W - 28 - mw, y: 28 },
            'bottom-left': { x: 28, y: H - 28 - mh },
            'bottom-right': { x: W - 28 - mw, y: H - 28 - mh },
          };
          let at = corners[modal.pos] || corners['bottom-left'];
          if (!modalExplicit) {
            const order = [modal.pos, ...Object.keys(corners).filter((k) => k !== modal.pos)];
            let best = null;
            for (const k of order) {
              const c = corners[k];
              if (!c) continue;
              const r = { x: c.x, y: c.y, w: mw, h: mh };
              if (collides(r)) continue;
              const sc = occlusion(r);
              if (!sc) { best = { c }; break; }
              if (!best || sc < best.sc) best = { c, sc };
            }
            if (best) at = best.c;
          }
          card.style.left = at.x + 'px';
          card.style.top = at.y + 'px';
          const M = { x: at.x, y: at.y, w: mw, h: mh };
          placed.push(M);
          // leader line: a 2px connector from the card edge to the nearest
          // target edge (border color) so viewers tie the card to its element.
          const B = { x: box.x - 4, y: box.y - 4, w: box.w + 8, h: box.h + 8 };
          const mc = { x: M.x + M.w / 2, y: M.y + M.h / 2 };
          const bc = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
          if (Math.abs(bc.x - mc.x) + Math.abs(bc.y - mc.y) > 40) {
            const exit = (r, from, to) => {
              const dx = to.x - from.x, dy = to.y - from.y;
              const tx = dx > 0 ? (r.x + r.w - from.x) / dx : dx < 0 ? (r.x - from.x) / dx : Infinity;
              const ty = dy > 0 ? (r.y + r.h - from.y) / dy : dy < 0 ? (r.y - from.y) / dy : Infinity;
              const t = Math.min(tx, ty);
              return { x: from.x + dx * t, y: from.y + dy * t };
            };
            const p1 = exit(M, mc, bc), p2 = exit(B, bc, mc);
            const lx = Math.min(p1.x, p2.x) - 4, ly = Math.min(p1.y, p2.y) - 4;
            const lw = Math.abs(p1.x - p2.x) + 8, lh = Math.abs(p1.y - p2.y) + 8;
            add('left:' + lx + 'px;top:' + ly + 'px;width:' + lw + 'px;height:' + lh + 'px',
              '<svg width="' + lw + '" height="' + lh + '"><line x1="' + (p1.x - lx) + '" y1="' + (p1.y - ly) +
              '" x2="' + (p2.x - lx) + '" y2="' + (p2.y - ly) + '" stroke="' + GREEN + '" stroke-width="2"/>' +
              '<circle cx="' + (p2.x - lx) + '" cy="' + (p2.y - ly) + '" r="3.5" fill="' + GREEN + '"/></svg>', 3);
          }
        }
      }
      const drawRect = (b) =>
        add('left:' + (b.x - 4) + 'px;top:' + (b.y - 4) + 'px;width:' + (b.w + 8) + 'px;height:' + (b.h + 8) + 'px;' +
          'border:3px solid ' + GREEN + ';border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.35)');
      // spotlight: dim the whole frame EXCEPT a clear window around the target,
      // pulling the eye to one element.
      //
      // DIM = FOUR SOLID PANELS (top/bottom/left/right of the hole), NOT a single
      // box-shadow:0 0 0 9999px spread. The huge-spread trick paints fine in a
      // screenshot but DROPS OUT during video capture when the target sits in a
      // container scrolled to an INTERMEDIATE offset (not top/not bottom): Chromium
      // promotes that scroller to its own composited layer, and the 9999px shadow
      // on an overlay outside it gets culled from the captured frame. Four plain
      // opaque rects have no spread to cull — the compositor always rasterizes
      // them — so the dim is rock-solid regardless of scroll/camera state.
      // A separate ring div carries the accent edge + glow.
      const drawSpotlight = (b, pad) => {
        const p = pad != null ? pad : 12;
        const dim = T.spotlight || 'rgba(8,14,28,.66)';
        const W = innerWidth, H = innerHeight;
        const L = b.x - p, Tp = b.y - p, R = b.x + b.w + p, B = b.y + b.h + p;
        const panel = (css) => add(css + ';background:' + dim, null, 1);
        panel('left:0;top:0;width:' + W + 'px;height:' + Math.max(0, Tp) + 'px');            // above
        panel('left:0;top:' + B + 'px;width:' + W + 'px;height:' + Math.max(0, H - B) + 'px'); // below
        panel('left:0;top:' + Math.max(0, Tp) + 'px;width:' + Math.max(0, L) + 'px;height:' + Math.max(0, B - Tp) + 'px'); // left
        panel('left:' + R + 'px;top:' + Math.max(0, Tp) + 'px;width:' + Math.max(0, W - R) + 'px;height:' + Math.max(0, B - Tp) + 'px'); // right
        // the lit window's accent ring + soft outward glow (no fill — the hole stays clear).
        add('left:' + L + 'px;top:' + Tp + 'px;width:' + (b.w + p * 2) + 'px;height:' + (b.h + p * 2) + 'px;' +
          'border-radius:12px;box-shadow:0 0 28px 4px ' + GREEN + '55,inset 0 0 0 2px ' + GREEN + 'cc', null, 1);
      };
      const drawCircle = (b) => {
        // a +10 ellipse passes INSIDE the corners of wide flat boxes and cuts
        // the target's own caption — over-axis it so the stroke clears them.
        const rx = (b.w / 2) * 1.12 + 12, ry = (b.h / 2) * 1.35 + 12;
        // a 50% ellipse on a WIDE target becomes a stretched 5:1 oval that reads
        // as a mistake. Past ~2.4:1 aspect, draw a rounded-rect (pill) instead —
        // radius = the short side — so it stays a deliberate "ring", not an oval.
        const wide = (rx * 2) / (ry * 2) > 2.4;
        const radius = wide ? Math.round(Math.min(rx, ry)) + 'px' : '50%';
        add('left:' + (b.x + b.w / 2 - rx) + 'px;top:' + (b.y + b.h / 2 - ry) + 'px;width:' + rx * 2 + 'px;height:' + ry * 2 + 'px;' +
          'border:3px solid ' + GREEN + ';border-radius:' + radius + ';box-shadow:0 1px 4px rgba(0,0,0,.35)');
      };
      // any annotation that explains a target must visibly CONNECT to it: a
      // 2.5px leader from the card/pill edge to the target edge, ending in an
      // oriented arrowhead — never a floating label.
      const drawLeader = (Mr, Br, color) => {
        const mc = { x: Mr.x + Mr.w / 2, y: Mr.y + Mr.h / 2 };
        // aim at the point of the target NEAREST the label, not its center —
        // a tall/wide target would otherwise get a long skewed diagonal.
        const bc = {
          x: Math.max(Br.x + 6, Math.min(Br.x + Br.w - 6, mc.x)),
          y: Math.max(Br.y + 6, Math.min(Br.y + Br.h - 6, mc.y)),
        };
        if (Math.abs(bc.x - mc.x) + Math.abs(bc.y - mc.y) <= 40) return;
        const exit = (r, from, to) => {
          const dx = to.x - from.x, dy = to.y - from.y;
          const tx2 = dx > 0 ? (r.x + r.w - from.x) / dx : dx < 0 ? (r.x - from.x) / dx : Infinity;
          const ty2 = dy > 0 ? (r.y + r.h - from.y) / dy : dy < 0 ? (r.y - from.y) / dy : Infinity;
          const t = Math.min(tx2, ty2);
          return { x: from.x + dx * t, y: from.y + dy * t };
        };
        const p1 = exit(Mr, mc, bc), p2 = exit(Br, bc, mc);
        const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const base = { x: p2.x - ux * 12, y: p2.y - uy * 12 };
        const px = -uy * 6, py = ux * 6;
        const lx = Math.min(p1.x, p2.x) - 10, ly = Math.min(p1.y, p2.y) - 10;
        const lw = Math.abs(p1.x - p2.x) + 20, lh = Math.abs(p1.y - p2.y) + 20;
        add('left:' + lx + 'px;top:' + ly + 'px;width:' + lw + 'px;height:' + lh + 'px',
          '<svg width="' + lw + '" height="' + lh + '"><line x1="' + (p1.x - lx) + '" y1="' + (p1.y - ly) +
          '" x2="' + (base.x - lx) + '" y2="' + (base.y - ly) + '" stroke="' + color + '" stroke-width="2.5"/>' +
          '<polygon points="' + (base.x + px - lx) + ',' + (base.y + py - ly) + ' ' + (base.x - px - lx) + ',' + (base.y - py - ly) +
          ' ' + (p2.x - lx) + ',' + (p2.y - ly) + '" fill="' + color + '"/></svg>', 3);
      };
      const drawBadge = (b, n, mark, delay) => {
        const label = String(n);
        const wpx = label.length > 1 ? 16 + label.length * 9 : 28;
        const sides = [
          { x: b.x - wpx - 10, y: b.y - 10 },
          { x: b.x + b.w + 10, y: b.y - 10 },
          { x: b.x - wpx - 10, y: b.y + b.h - 18 },
          { x: b.x + b.w + 10, y: b.y + b.h - 18 },
        ];
        const topCenter = { x: b.x + b.w / 2 - wpx / 2, y: b.y - 38 };
        const botCenter = { x: b.x + b.w / 2 - wpx / 2, y: b.y + b.h + 10 };
        const corners = [
          { x: b.x, y: b.y - 38 },
          { x: b.x + b.w - wpx, y: b.y - 38 },
          { x: b.x, y: b.y + b.h + 10 },
          { x: b.x + b.w - wpx, y: b.y + b.h + 10 },
        ];
        // full-width targets leave no room beside them — the badge may sit
        // just inside the outline's corners as a last resort (marks style).
        const insides = [
          { x: b.x + 8, y: b.y + 8, skip: true },
          { x: b.x + b.w - wpx - 8, y: b.y + 8, skip: true },
        ];
        // marks sub-badges live INSIDE the group's outline by design: ignore
        // the anchor rect collision (top-center above their own card), but
        // keep avoiding other badges, page glyphs and the viewport edges.
        const at = mark
          ? settle([topCenter, botCenter, ...sides], wpx, 28, true, 'badge ' + label)
          : settle([...sides, topCenter, botCenter, ...corners, ...insides], wpx, 28, false, 'badge ' + label);
        const d = add('left:' + at.x + 'px;top:' + at.y + 'px;min-width:28px;width:' + wpx + 'px;height:28px;border-radius:14px;' +
          'background:' + GREEN + ';border:2px solid rgba(255,255,255,.92);' +
          'box-shadow:0 2px 8px rgba(0,0,0,.45),0 0 0 4px ' + GREEN + '2e;' +
          'color:#fff;font:700 16px system-ui;display:flex;align-items:center;justify-content:center', label, 4);
        // pop-scale entrance (overshoot) — a badge should snap in, not fade.
        d.style.opacity = '0';
        d.style.transform = 'scale(.4)';
        d.style.transformOrigin = 'center';
        d.style.transition = 'opacity .25s ease,transform .4s cubic-bezier(.34,1.56,.64,1)';
        setTimeout(() => { d.style.opacity = '1'; d.style.transform = 'scale(1)'; }, delay != null ? delay : 0);
        return d;
      };
      if (box && step.spotlight) drawSpotlight(box);
      if (box && step.rect) drawRect(box);
      if (box && step.circle) drawCircle(box);
      if (box && step.badge != null) drawBadge(box, step.badge);
      // Reveal cadence: explicit glossary.stagger > step stagger > 380ms.
      const gOpt = step.glossary && typeof step.glossary === 'object' ? step.glossary : {};
      const STAG = gOpt.stagger != null ? gOpt.stagger : step.stagger != null ? step.stagger : 380;
      const glossRows = [];
      if (step.marks) {
        // sub-badges reveal one after another, each in sync with its glossary
        // row — a guided tour, not a simultaneous splash.
        step.marks.forEach((mk, mi) => {
          const el = document.querySelector(mk.sel);
          if (!el) return;
          const r = el.getBoundingClientRect();
          const b = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
          if (mk.rect) drawRect(b);
          if (mk.circle) drawCircle(b);
          if (mk.badge != null) drawBadge(b, mk.badge, true, 250 + mi * STAG);
          if (mk.badge != null && mk.text != null) glossRows.push({ n: String(mk.badge), t: String(mk.text).replace(/[<>&]/g, ''), delay: 250 + mi * STAG });
        });
      }
      // Glossary panel: explicit items win over marks-derived rows; position,
      // width, title and cadence are all caller-controlled, auto by default.
      const explicitItems = Array.isArray(gOpt.items)
        ? gOpt.items.map((it, j) => ({ n: String(it.badge), t: String(it.text).replace(/[<>&]/g, ''), delay: 250 + j * STAG }))
        : null;
      const rows = explicitItems || glossRows;
      if ((step.glossary || glossRows.length) && rows.length) {
        const rowsHtml = (gOpt.title
          ? '<div style="display:flex;align-items:center;gap:8px;color:' + NOTEINK + ';font:700 15px system-ui;letter-spacing:-.01em;margin:0 0 11px;padding-bottom:9px;border-bottom:1px solid ' + HAIR + '">'
            + '<span style="width:7px;height:7px;border-radius:50%;background:' + GREEN + ';box-shadow:0 0 7px ' + GREEN + '"></span>'
            + String(gOpt.title).replace(/[<>&]/g, '') + '</div>'
          : '') + rows.map((g) =>
          '<div data-gd="' + g.delay + '" style="display:flex;gap:10px;align-items:center;margin:8px 0;opacity:0;transform:translateX(-6px);transition:opacity .4s ease,transform .4s cubic-bezier(.22,1,.36,1)">' +
          '<span style="flex:0 0 auto;min-width:22px;height:22px;border-radius:11px;background:' + GREEN + ';border:1.5px solid rgba(255,255,255,.9);box-shadow:0 0 0 3px ' + GREEN + '26;' +
          'color:#fff;font:700 12px/19px system-ui;text-align:center;padding:0 4px">' + g.n + '</span>' +
          '<span style="color:' + NOTEINK + ';font:400 15px/1.4 system-ui">' + g.t + '</span></div>').join('');
        const gw = gOpt.width || 320;
        const panel = add('left:-9999px;top:0;width:' + gw + 'px;background:' + GLASS + ';' + BLUR + ';border:1px solid ' + HAIR + ';border-left:2px solid ' + GREEN + ';' +
          'border-radius:16px;padding:15px 18px;box-shadow:' + SHADOW + '', rowsHtml, 6);
        const pr = panel.getBoundingClientRect();
        const pw = Math.round(pr.width), ph = Math.round(pr.height);
        const cornerMap = {
          'top-right': { x: W - 24 - pw, y: 24 }, 'top-left': { x: 24, y: 24 },
          'bottom-right': { x: W - 24 - pw, y: H - 24 - ph }, 'bottom-left': { x: 24, y: H - 24 - ph },
        };
        let at = cornerMap[gOpt.pos];
        if (!at) {
          const order = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
          let best = null;
          for (const k of order) {
            const c = cornerMap[k];
            const r = { x: c.x, y: c.y, w: pw, h: ph };
            if (collides(r)) continue;
            const sc = occlusion(r);
            if (!sc) { best = { c }; break; }
            if (!best || sc < best.sc) best = { c, sc };
          }
          at = (best && best.c) || cornerMap['top-right'];
        }
        panel.style.left = at.x + 'px';
        panel.style.top = at.y + 'px';
        placed.push({ x: at.x, y: at.y, w: pw, h: ph });
        for (const row of panel.querySelectorAll('[data-gd]'))
          setTimeout(() => { row.style.opacity = '1'; row.style.transform = 'none'; }, +row.getAttribute('data-gd'));
      }
      // Element zoom: a live DOM clone of the target, magnified inside an
      // accent-bordered card, leader back to the original — the page itself
      // stays untouched.
      if (step.inset) {
        const ispec = typeof step.inset === 'string' ? { sel: step.inset } : step.inset;
        const iel = document.querySelector(ispec.sel);
        if (iel) {
          const ir = iel.getBoundingClientRect();
          // rects come back post-camera-transform but the frozen clone renders
          // at LAYOUT size — size the card in layout space or it inflates by
          // the camera scale and the clone rattles inside dead padding.
          const camS = (window.__cam && window.__cam.s) || 1;
          const lw = ir.width / camS, lh = ir.height / camS;
          // a loupe is ROUND: the lens is the circle circumscribing the
          // magnified clone (hypotenuse + breathing room), so nothing is ever
          // clipped. zoom is VISUAL — relative to what the viewer sees — and
          // shrinks until the lens fits ~55% of the shorter viewport side.
          let S = Math.max(1.2, Math.min((ispec.zoom || 1.8) * camS, 2.6));
          const lensCap = 0.55 * Math.min(W, H);
          let D = Math.ceil(Math.hypot(lw * S, lh * S)) + 24;
          if (D > lensCap) {
            S = Math.max(1.1, S * lensCap / D);
            D = Math.ceil(Math.hypot(lw * S, lh * S)) + 24;
          }
          const iw = D, ih = D;
          if (!box || sel !== ispec.sel)
            placed.push({ x: ir.x - 6, y: ir.y - 6, w: ir.width + 12, h: ir.height + 12, anchor: true });
          const at = settle([
            { x: ir.x + ir.width / 2 - iw / 2, y: ir.y - ih - 28 },
            { x: ir.x + ir.width / 2 - iw / 2, y: ir.y + ir.height + 28 },
            { x: ir.x - iw - 28, y: ir.y + ir.height / 2 - ih / 2 },
            { x: ir.x + ir.width + 28, y: ir.y + ir.height / 2 - ih / 2 },
            { x: ir.x - iw - 28, y: ir.y - ih - 28 },
            { x: ir.x + ir.width + 28, y: ir.y - ih - 28 },
            { x: ir.x - iw - 28, y: ir.y + ir.height + 28 },
            { x: ir.x + ir.width + 28, y: ir.y + ir.height + 28 },
          ], iw, ih, false, 'loupe');
          // the inset reads as a magnified CUTOUT of the page: page background
          // behind the clone (nearest opaque ancestor) PLUS a faint veil, so
          // the card stays a raised loupe even over bare text on a flat body.
          let pageBg = theme === 'dark' ? '#0b1322' : '#ffffff';
          for (let anc = iel; anc; anc = anc.parentElement) {
            const bg = getComputedStyle(anc).backgroundColor;
            if (bg && bg !== 'transparent' && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(bg)) { pageBg = bg; break; }
          }
          const veil = theme === 'dark' ? 'rgba(248,250,252,.07)' : 'rgba(15,23,42,.045)';
          const card = add('left:' + at.x + 'px;top:' + at.y + 'px;width:' + iw + 'px;height:' + ih + 'px;' +
            'background:linear-gradient(' + veil + ',' + veil + '),' + pageBg + ';border:3px solid ' + GREEN + ';border-radius:50%;' +
            'box-shadow:0 14px 44px rgba(0,0,0,.55),0 0 0 5px ' + GREEN + '22,inset 0 1px 0 rgba(255,255,255,.18);overflow:hidden', null, 7);
          // scale-in: the lens pops from ~70% so it reads as rising off the page.
          card.style.opacity = '0';
          card.style.transform = 'scale(.7)';
          card.style.transformOrigin = 'center';
          card.style.transition = 'opacity .3s ease,transform .42s cubic-bezier(.34,1.4,.64,1)';
          requestAnimationFrame(() => { card.style.opacity = '1'; card.style.transform = 'scale(1)'; });
          const k = iel.cloneNode(true);
          // a clone outside its ancestors loses every contextual CSS rule —
          // freeze the ORIGINAL's computed styles inline, node by node.
          const freeze = (src, dst) => {
            const cs = getComputedStyle(src);
            let css = '';
            for (let i = 0; i < cs.length; i++) { const p = cs[i]; css += p + ':' + cs.getPropertyValue(p) + ';'; }
            dst.style.cssText = css;
            for (let i = 0; i < src.children.length; i++) if (dst.children[i]) freeze(src.children[i], dst.children[i]);
          };
          freeze(iel, k);
          k.style.margin = '0';
          // cloneNode copies attributes, not live form state — mirror values
          // so the magnified clone never contradicts the real control.
          const sync = (src, dst) => {
            if (!dst) return;
            if (src.type === 'checkbox' || src.type === 'radio') dst.checked = src.checked;
            else if ('value' in src) dst.value = src.value;
          };
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(iel.tagName)) sync(iel, k);
          const sc = iel.querySelectorAll('input,select,textarea'), dc = k.querySelectorAll('input,select,textarea');
          sc.forEach((e, i) => sync(e, dc[i]));
          const zw = document.createElement('div');
          zw.style.cssText = 'position:absolute;left:' + ((D - lw * S) / 2) + 'px;top:' + ((D - lh * S) / 2) + 'px;' +
            'transform:scale(' + S + ');transform-origin:0 0;width:' + lw + 'px;height:' + lh + 'px';
          zw.appendChild(k);
          card.appendChild(zw);
          drawLeader({ x: at.x, y: at.y, w: iw, h: ih }, { x: ir.x - 4, y: ir.y - 4, w: ir.width + 8, h: ir.height + 8 }, GREEN);
        }
      }
      if (box && step.note) {
        const txt = String(step.note).replace(/[<>&]/g, '');
        // width accounts for the new layout: 13+14 padding, 7px dot, 8px gap,
        // ~9px/char at 17px. height fits the 17px line + 9px vert padding.
        const noteW = Math.min(W - 32, Math.max(130, Math.round(txt.length * 9) + 56));
        const noteH = 38;
        const gap = step.arrow ? 56 : 12;
        const at = settle([
          { x: box.x, y: box.y - noteH - gap },
          { x: box.x, y: box.y + box.h + gap },
          { x: box.x + box.w / 2 - noteW / 2, y: box.y - noteH - gap },
          { x: box.x + box.w / 2 - noteW / 2, y: box.y + box.h + gap },
          { x: box.x + box.w - noteW, y: box.y - noteH - gap },
          { x: box.x + box.w - noteW, y: box.y + box.h + gap },
          { x: box.x - noteW - 14, y: box.y + box.h / 2 - noteH / 2 },
          { x: box.x + box.w + 14, y: box.y + box.h / 2 - noteH / 2 },
        ], noteW, noteH, false, 'note');
        const noteX = at.x, noteY = at.y;
        const below = noteY >= box.y + box.h;
        const vertical = noteX < box.x + box.w && noteX + noteW > box.x && (below || noteY + noteH <= box.y);
        add('left:' + noteX + 'px;top:' + noteY + 'px;background:' + NOTEBG + ';color:' + NOTEINK + ';font:600 17px system-ui;letter-spacing:-.01em;white-space:nowrap;' +
          'padding:9px 14px 9px 13px;border-radius:10px;border:1px solid ' + HAIR + ';border-left:2px solid ' + GREEN + ';box-shadow:' + SHADOW + ';' +
          'display:flex;align-items:center;gap:8px',
          '<span style="width:7px;height:7px;border-radius:50%;background:' + GREEN + ';box-shadow:0 0 7px ' + GREEN + ';flex:0 0 auto"></span><span>' + txt + '</span>', 6);
        // a rescued note may land far from its anchor — a label without a
        // visible tie is forbidden, so distance forces a leader even when the
        // caller didn't ask for an arrow.
        const far = noteX + noteW < box.x - 60 || noteX > box.x + box.w + 60 ||
          noteY + noteH < box.y - 60 || noteY > box.y + box.h + 60;
        if (far) {
          // a rescued note sits far from its target (dense layout, no adjacent
          // free spot) — the short vertical arrow would point at empty space near
          // the note, NOT span to the real box. Force a full leader that aims at
          // the actual target, so the tie is always correct.
          drawLeader({ x: noteX, y: noteY, w: noteW, h: noteH }, { x: box.x - 4, y: box.y - 4, w: box.w + 8, h: box.h + 8 }, DARK);
        } else if (step.arrow && vertical) {
          const ax = cl(box.x + Math.min(box.w / 2, 110), Math.max(16, noteX + 10), Math.min(W - 16, noteX + noteW - 10));
          const y1 = cl(below ? noteY - 2 : noteY + 38, 8, H - 8);
          const y2 = cl(below ? box.y + box.h + 4 : box.y - 4, 8, H - 8);
          const top = Math.min(y1, y2), h = Math.abs(y2 - y1);
          const tipY = below ? 0 : h, baseY = below ? Math.min(10, h) : Math.max(0, h - 10);
          add('left:' + (ax - 8) + 'px;top:' + top + 'px;width:16px;height:' + h + 'px',
            '<svg width="16" height="' + h + '"><line x1="8" y1="' + (below ? h : 0) + '" x2="8" y2="' + tipY +
            '" stroke="' + DARK + '" stroke-width="3"/><polygon points="2,' + baseY + ' 14,' + baseY + ' 8,' + tipY +
            '" fill="' + DARK + '"/></svg>', 3);
        } else if (step.arrow || far) {
          // non-vertical placement: oriented leader so the arrow ALWAYS shows.
          drawLeader({ x: noteX, y: noteY, w: noteW, h: noteH }, { x: box.x - 4, y: box.y - 4, w: box.w + 8, h: box.h + 8 }, DARK);
        }
      }
      requestAnimationFrame(() => { wrap.style.opacity = '1'; });
      return warns;
    }, { box, step, modal, modalExplicit, theme: pageTheme, sel, accent });
  };
  const clearAnnotations = async () => {
    await safeEval(() => {
      const w = document.getElementById('__ann__');
      if (w) w.style.opacity = '0';
    });
    await clock.wait(ms(lastFade + 50), true);
    await safeEval(() => document.getElementById('__ann__')?.remove());
  };
  const applyBlur = async (sel) => {
    await safeEval((s) => {
      document.querySelectorAll(s).forEach((el) => {
        if (el.style.filter) return;
        // SIZE-AWARE radius + contain: an 8px blur on a short table cell bleeds
        // its smear past the cell edge into neighbours. Scale the radius to the
        // box and clip the spill so the blur stays inside the element.
        const r = el.getBoundingClientRect();
        const rad = Math.max(3, Math.min(8, Math.min(r.width, r.height) * 0.45));
        if (!el.style.overflow) { el.style.overflow = 'hidden'; el.dataset.srBlurClip = '1'; }
        el.style.transition = (el.style.transition ? el.style.transition + ',' : '') + 'filter .45s ease';
        requestAnimationFrame(() => { el.style.filter = 'blur(' + rad.toFixed(1) + 'px)'; });
      });
    }, sel);
  };
  const applyHide = async (sel) => {
    await safeEval((s) => {
      document.querySelectorAll(s).forEach((el) => {
        if (el.style.display === 'none') return;
        el.style.transition = 'opacity .4s ease';
        el.style.opacity = '0';
        setTimeout(() => { el.style.display = 'none'; }, 420);
      });
    }, sel);
  };
  // Solid opaque bar over sensitive data — stronger than blur. An overlay div
  // sized to the element's box so the original text never renders through it.
  const applyRedact = async (sel, color) => {
    await safeEval((s, col) => {
      // MOTOR RULE (see applyHighlight): hug the text, not a wide box — but a
      // CENSOR bar must fully COVER the text, so the inset overshoots the glyph
      // box by a few px on each side (never short of it). Plain text containers
      // only; controls/elements-with-children use the full box.
      const textInset = (el, r) => {
        if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return { l: 0, rt: 0 };
        if (el.querySelector && el.querySelector('*')) return { l: 0, rt: 0 };
        try {
          const rng = document.createRange(); rng.selectNodeContents(el);
          const tr = rng.getBoundingClientRect();
          // the band is a CHILD positioned in LAYOUT px, but the rects are read
          // under the camera transform — divide the gap by the camera scale so
          // the inset matches layout (a zoom:2 frame otherwise doubles it and the
          // censor bar lands short of the text).
          const cs2 = (window.__cam && window.__cam.s) || 1;
          if (tr.width > 2 && (r.width - tr.width) / cs2 > 24) {
            return { l: Math.max(0, (tr.left - r.left) / cs2 - 4), rt: Math.max(0, (r.right - tr.right) / cs2 - 4) };
          }
        } catch (e) { /* no text — use box */ }
        return { l: 0, rt: 0 };
      };
      document.querySelectorAll(s).forEach((el, i) => {
        if (el.dataset.srRedacted) return;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return;
        el.dataset.srRedacted = '1';
        const ti = textInset(el, r);
        // ATTACH AS A CHILD OF THE TARGET (inset:0) so the mask inherits the
        // element's own box AND any camera transform on an ancestor — a
        // body-level absolute div diverges from the target under a zoom
        // transform (the drawer-highlight-landing-in-the-wrong-place bug).
        // Make the target a positioning context if it is static.
        if (cs.position === 'static') { el.style.position = 'relative'; el.dataset.srPosPatched = '1'; }
        const bar = document.createElement('div');
        bar.className = '__sr_mask__';
        bar.dataset.srFor = s;
        // OVERHANG the text box so no glyph edge peeks out — but SCALE it to the
        // box so a small table cell doesn't bleed its censor bar into the next
        // column (-6px is huge on a narrow cell). Vertical overhang buries
        // ascenders/descenders; horizontal stays tight on small targets.
        const ovY = Math.max(1, Math.min(3, r.height * 0.12));
        const ovX = Math.max(1, Math.min(6, r.width * 0.03));
        // hug text horizontally on wide boxes; overhang vertically to bury glyphs
        const lIn = (ti.l - ovX).toFixed(1), rIn = (ti.rt - ovX).toFixed(1);
        bar.style.cssText = 'position:absolute;top:-' + ovY.toFixed(1) + 'px;bottom:-' + ovY.toFixed(1) + 'px;left:' + lIn + 'px;right:' + rIn + 'px;z-index:2147483600;border-radius:4px;pointer-events:none;overflow:hidden;opacity:0;transition:opacity .35s ease;';
        requestAnimationFrame(() => { bar.style.opacity = '1'; }); // fade IN (exit fade via clearMasks)
        // surface luminance so the censor bar always CONTRASTS the page: a dark
        // bar on a dark table is invisible. Dark page → light-grey bar; light
        // page → near-black bar. A hairline outline seals the edge either way.
        const lum2 = (c) => { const m = c && c.match(/\d+/g); if (!m) return 0.1; return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255; };
        let sb = cs.backgroundColor, pp = el;
        while ((!sb || sb === 'rgba(0, 0, 0, 0)' || sb === 'transparent') && pp.parentElement) { pp = pp.parentElement; sb = getComputedStyle(pp).backgroundColor; }
        const darkPage = lum2(sb) < 0.5;
        // FULLY OPAQUE (alpha 1) — a censor bar must not let the text bleed
        // through; even 0.96 leaves it faintly readable.
        const barBg = col || (darkPage ? 'rgb(148,163,184)' : 'rgb(15,23,42)');
        const barLine = darkPage ? 'rgba(226,232,240,0.9)' : 'rgba(71,85,105,0.9)';
        const fill = document.createElement('div');
        // motion: the bar WIPES in from the left (scaleX 0->1, ease-out).
        fill.style.cssText = 'width:100%;height:100%;border-radius:4px;'
          + 'background:' + barBg + ';box-shadow:inset 0 0 0 1px ' + barLine + ',0 1px 4px rgba(0,0,0,.4);'
          + 'transform:scaleX(0);transform-origin:left center;'
          + 'transition:transform .42s cubic-bezier(.22,1,.36,1);';
        bar.appendChild(fill);
        el.appendChild(bar);
        setTimeout(() => { fill.style.transform = 'scaleX(1)'; }, i * 90);
      });
    }, sel, color || '');
  };
  // Highlighter that SWIPES across the region like a marker pen. The blend
  // ADAPTS to the surface: multiply tints a light element (classic highlighter),
  // but multiply on a DARK UI is invisible (amber × near-black ≈ black) — there
  // we use `screen` (additive) so the swipe BRIGHTENS the target instead. A soft
  // accent ring frames it so it always reads as a deliberate highlight.
  const applyHighlight = async (sel, color) => {
    await safeEval((s, col) => {
      const lum = (c) => { const m = c.match(/\d+/g); if (!m) return 1; return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255; };
      // MOTOR RULE: a marker on a block much wider than its text (a table cell,
      // a full-width row) must hug the TEXT, not the box — else it extrapolates
      // the content and bleeds into neighbours. Measure the real text run with a
      // Range; return left/right insets to pull the band tight to the glyphs.
      const textInset = (el, r) => {
        // only for plain text containers (a table cell, a label). Interactive
        // controls (button/link/input) have icon spans + centered text — hugging
        // their Range mis-sizes the band (a stray streak); use the whole box.
        if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return { l: 0, rt: 0 };
        if (el.querySelector && el.querySelector('*')) return { l: 0, rt: 0 }; // has element children — not a plain text run
        try {
          const rng = document.createRange(); rng.selectNodeContents(el);
          const tr = rng.getBoundingClientRect();
          // insets are layout px on a child; rects are under the camera transform
          // — divide by the camera scale (a zoom:2 frame would otherwise double them).
          const cs2 = (window.__cam && window.__cam.s) || 1;
          if (tr.width > 2 && (r.width - tr.width) / cs2 > 24) {
            return { l: Math.max(0, (tr.left - r.left) / cs2 - 4), rt: Math.max(0, (r.right - tr.right) / cs2 - 4) };
          }
        } catch (e) { /* no text content — use the box */ }
        return { l: 0, rt: 0 };
      };
      document.querySelectorAll(s).forEach((el) => {
        if (el.dataset.srHighlit) return;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return;
        el.dataset.srHighlit = '1';
        const ti = textInset(el, r);
        // ATTACH AS A CHILD OF THE TARGET so the band inherits the element box
        // and any ancestor camera transform — a body-level div diverges under a
        // zoom transform and lands in the wrong place.
        if (cs.position === 'static') { el.style.position = 'relative'; el.dataset.srPosPatched = '1'; }
        // surface luminance: prefer the element's own bg, else walk up.
        let bg = cs.backgroundColor; let p = el;
        while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
        const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
        const accent = col || (dark ? 'rgba(250,204,21,0.85)' : 'rgba(250,204,21,0.55)');
        // SIZE-AWARE inset/ring/glow: a fixed -4px inset + 16px glow overflows a
        // small target (a table cell) into its neighbours — ugly, extrapolates
        // the box. Scale the overhang, ring and glow to the SHORT edge so a tiny
        // cell gets a tight, contained highlight and a big card still reads bold.
        const short = Math.min(r.width, r.height);
        const over = Math.max(1, Math.min(4, short * 0.12));
        const ring = Math.max(1, Math.min(2, short * 0.06));
        const glow = Math.max(4, Math.min(16, short * 0.5));
        const band = document.createElement('div');
        band.className = '__sr_mask__';
        band.dataset.srFor = s;
        // horizontal edges hug the text when the box is wider than its content
        const lIn = (ti.l - over).toFixed(1), rIn = (ti.rt - over).toFixed(1);
        band.style.cssText = 'position:absolute;top:-' + over.toFixed(1) + 'px;bottom:-' + over.toFixed(1) + 'px;left:' + lIn + 'px;right:' + rIn + 'px;z-index:2147483600;pointer-events:none;border-radius:6px;overflow:hidden;opacity:0;transition:opacity .35s ease;'
          + 'box-shadow:0 0 0 ' + ring.toFixed(1) + 'px ' + (col || (dark ? 'rgba(250,204,21,0.9)' : 'rgba(202,138,4,0.8)')) + ',0 0 ' + glow.toFixed(1) + 'px 1px ' + (col || 'rgba(250,204,21,0.45)') + ';';
        requestAnimationFrame(() => { band.style.opacity = '1'; }); // fade IN
        // The ink swipe recolours the target — fine on a neutral surface, but on a
        // SATURATED control (a green "Deployed" CTA, a coloured pill) it fights the
        // element's own meaningful colour and leaves an off-hue streak. On those,
        // the ring + glow alone mark it; skip the ink fill.
        const bgm = (cs.backgroundColor || '').match(/\d+/g);
        const saturated = bgm && bgm.length >= 3 && (Math.max(+bgm[0], +bgm[1], +bgm[2]) - Math.min(+bgm[0], +bgm[1], +bgm[2])) > 60;
        el.appendChild(band);
        if (!saturated) {
          const ink = document.createElement('div');
          ink.style.cssText = 'width:100%;height:100%;mix-blend-mode:' + (dark ? 'screen' : 'multiply') + ';border-radius:6px;'
            + 'background:' + accent + ';opacity:' + (dark ? '0.5' : '1') + ';'
            + 'transform:scaleX(0);transform-origin:left center;'
            + 'transition:transform .5s cubic-bezier(.22,1,.36,1);';
          band.appendChild(ink);
          requestAnimationFrame(() => { ink.style.transform = 'scaleX(1)'; });
        }
      });
    }, sel, color || '');
  };

  // Element-anchored masks (redact bars, highlight bands) live OUTSIDE the
  // annotation wrap and persist on the page until explicitly removed — otherwise
  // they pile up across scenes (a drawer highlight from scene 1 still painting
  // half the frame in scene 4). clearMasks wipes them at scene boundaries.
  // blur is a filter ON the element; lift it too so a scene change starts clean.
  const clearMasks = async () => {
    // PHASE 1 — fade every mask OUT (and lift blur with a transition) so nothing
    // pops; matches the annotation wrap's fade so ALL elements enter AND exit on
    // opacity. Then wait the fade, then remove.
    const any = await safeEval(() => {
      let n = 0;
      document.querySelectorAll('.__sr_mask__').forEach((m) => { m.style.opacity = '0'; n++; });
      document.querySelectorAll('*').forEach((el) => {
        if (el.style && el.style.filter && el.style.filter.indexOf('blur') !== -1) {
          el.style.transition = (el.style.transition ? el.style.transition + ',' : '') + 'filter .35s ease';
          el.style.filter = ''; n++;
        }
      });
      return n;
    });
    if (any) await clock.wait(ms(360), true);
    await safeEval(() => {
      document.querySelectorAll('.__sr_mask__').forEach((m) => m.remove());
      document.querySelectorAll('[data-sr-redacted]').forEach((el) => { delete el.dataset.srRedacted; });
      document.querySelectorAll('[data-sr-highlit]').forEach((el) => { delete el.dataset.srHighlit; });
      document.querySelectorAll('[data-sr-pos-patched]').forEach((el) => { el.style.position = ''; delete el.dataset.srPosPatched; });
    });
  };

  // Minimalist confetti burst from a target's center — small accent shards fly
  // out on an arc and fade. A celebration primitive (deploy succeeded, etc.).
  // Self-cleaning: the layer removes itself after the animation.
  const applyConfetti = async (sel, color, opts) => {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
        // duration = chip FLIGHT time (default 1050). count = chips (default 28).
        // scale = chip-size multiplier (default 1). intensity = throw/spread mult
        // (default 1) — bigger fans the burst wider and flings chips further.
        const FLIGHT = clamp(o.duration, 200, 8000, 1050);
        const N = Math.round(clamp(o.count, 1, 60, 28));
        const SC = clamp(o.scale, 0.3, 3, 1);
        const INT = clamp(o.intensity, 0.2, 2, 1);
        await safeEval(({ s, col, FLIGHT, N, SC, INT }) => {
          const el = document.querySelector(s);
          if (!el) return;
          const r = el.getBoundingClientRect();
          if (r.width < 1 && r.height < 1 && r.left === 0 && r.top === 0) return;
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          // classic mini-rectangle confetti: small solid chips that burst up, spin,
          // then fall with gravity + sideways drift. Not glass — confetti is paper.
          // Scene accent leads; a few sibling hues keep it festive but on-brand.
          const accent = col || '#22c55e';
          const palette = col ? [col] : [accent, '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#fde047'];
          // PROPORTIONAL: a burst fires FROM this target, so chip size, throw and
          // origin-spread all derive from the target box — never fixed pixels.
          //  - chip side anchors on the geometric mean of w·h (balanced "size"
          //    that ignores extreme aspect), clamped 4..16px so a 28px logo still
          //    throws readable shards and a 1024px table stays paper-thin.
          //  - launch reach (upward power) anchors on HEIGHT, drift on WIDTH, and
          //    chips spawn along the target's full width — so a wide table bursts
          //    WIDE and a tall box bursts TALL: the cloud takes the element's shape.
          //  - all clamped so tiny reads and huge doesn't fling off-screen. scale
          //    multiplies the chip size; intensity multiplies throw/drift/spread.
          const span = Math.sqrt(Math.max(1, r.width) * Math.max(1, r.height));
          const chip = Math.max(4, Math.min(16, span * 0.06)) * SC;
          const reach = Math.max(70, Math.min(240, r.height * 1.7 + 60)) * INT; // up, from height
          const fall = Math.max(120, Math.min(340, r.height * 2.2 + 110)) * INT; // gravity drop
          const drift = Math.max(26, Math.min(120, r.width * 0.5)) * INT;        // sideways, from width
          const originW = Math.min(r.width * 0.7, 520);                          // spawn band width
          // fan half-angle widens with intensity: a calm pop goes mostly straight
          // up, a punchy throw sprays nearly horizontal. base 1.1rad each side.
          const fan = Math.min(2.7, 1.1 * INT);
          const flightS = (FLIGHT / 1000);
          const layer = document.createElement('div');
          layer.className = '__sr_confetti__';
          layer.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;';
          document.documentElement.appendChild(layer);
          const chips = [];
          for (let i = 0; i < N; i++) {
            // spawn across the target's width so the burst inherits its shape.
            const ox = cx + (Math.random() - 0.5) * originW;
            // launch in a fan upward, varied power; gravity pulls them down after.
            const ang = (-Math.PI / 2) + (Math.random() - 0.5) * 2 * fan; // mostly up, spread by intensity
            const power = reach * (0.55 + Math.random() * 0.75);
            const ux = Math.cos(ang) * power, uy = Math.sin(ang) * power;
            const w = Math.round(chip * (0.8 + Math.random() * 0.7));   // mini rectangles
            const h = Math.round(chip * (0.4 + Math.random() * 0.4));   // wider than tall
            const tint = palette[i % palette.length];
            const c = document.createElement('div');
            c.style.cssText = 'position:absolute;left:' + ox + 'px;top:' + cy + 'px;width:' + Math.max(2, w) + 'px;height:' + Math.max(1, h) + 'px;'
              + 'background:' + tint + ';border-radius:1px;opacity:0;'
              + 'transform:translate(-50%,-50%) rotate(' + Math.round(Math.random() * 180) + 'deg);'
              + 'transition:transform ' + flightS + 's cubic-bezier(.2,.6,.35,1),opacity ' + flightS + 's ease-out;';
            layer.appendChild(c);
            // gravity: end point = launch impulse + downward fall.
            const ex = ux + (Math.random() - 0.5) * drift;
            const ey = uy + fall * (0.55 + Math.random() * 0.6); // fall below origin
            const spin = (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540);
            chips.push({ c, ex, ey, spin });
          }
          void layer.offsetWidth;
          // paint visible burst on its own frame, defer fade (pulse-bug guard):
          // never opacity 1 and 0 in the same frame.
          requestAnimationFrame(() => {
            chips.forEach((k) => {
              k.c.style.opacity = '1';
              k.c.style.transform = 'translate(calc(-50% + ' + Math.round(k.ex) + 'px),calc(-50% + ' + Math.round(k.ey) + 'px)) rotate(' + Math.round(k.spin) + 'deg)';
            });
          });
          // exit ALSO on a fade (anti-pop): begin the fade in the last ~40% of the
          // flight so chips dissolve as they settle, not snap out.
          setTimeout(() => { chips.forEach((k) => { k.c.style.opacity = '0'; }); }, Math.round(FLIGHT * 0.6));
          setTimeout(() => layer.remove(), Math.round(FLIGHT + 160));
        }, { s: sel, col: color || '', FLIGHT, N, SC, INT });
        // host life tracks the chosen flight (entrance frame + full flight + exit
        // fade) so the burst is captured whole, not cut nor lingering into the next.
        await clock.wait(ms(FLIGHT + 200), true);
      };
const applyCountup = async (sel, to, opts) => {
    const o = (opts && typeof opts === 'object') ? opts : {};
    const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
    // duration = the count's ROLL length (default 1200). count/scale/intensity n/a.
    // BUG FIX ("add duration of the count"): the roll length now honors the
    // duration knob — was a hardcoded 1200 baked into BOTH the in-page loop and
    // the host wait, so a longer/shorter request did nothing.
    const DUR = Math.round(clamp(o.duration, 200, 8000, 1200));
    const POP = 300; // settle-pop tail (scale bounce) after the roll lands
    // SETUP: parse the number, stash render config on the element, mark active.
    // Returns false when there is nothing numeric to count — then we just dwell
    // the chosen life so the step timing is unchanged for non-numeric targets.
    const ok = await safeEval(({ s, to }) => {
      const el = document.querySelector(s);
      if (!el) return false;
      // SOURCE string: explicit `to` wins, else the element's own text.
      const src = to != null ? String(to) : (el.textContent || '');
      // split into [prefix][number][suffix]; number may have commas + decimals.
      const m = src.match(/^(\D*?)([\d.,]+)(\D*)$/);
      if (!m) return false; // nothing numeric — leave the element untouched
      const rawNum = m[2];
      const dot = rawNum.replace(/,/g, '');
      const decI = dot.indexOf('.');
      const target = parseFloat(dot);
      if (!isFinite(target)) return false;
      el.dataset.srCountup = '1';
      el.dataset.srCuReal = el.textContent; // restore verbatim (exact glyphs)
      el.dataset.srCuPre = m[1];
      el.dataset.srCuSuf = m[3];
      el.dataset.srCuTgt = String(target);
      el.dataset.srCuDec = String(decI === -1 ? 0 : dot.length - decI - 1);
      el.dataset.srCuComma = rawNum.indexOf(',') !== -1 ? '1' : '';
      // paint the FROM value (0) so the roll starts visibly at the bottom — no
      // jump from the final number down to 0.
      const dec = decI === -1 ? 0 : dot.length - decI - 1;
      el.textContent = m[1] + (0).toFixed(dec) + m[3];
      return true;
    }, { s: sel, to: to == null ? null : String(to) });
    if (!ok) { await clock.wait(ms(DUR + POP), true); return; }
    // capture the FROM (0) value on its own frame so the roll reads as starting
    // at the bottom and counting UP — not popping in already part-way.
    await clock.tick();
    // ROLL: virtual-clock native — set the value each captured tick (like
    // kenburns drives its transform), so the FULL chosen duration is sampled
    // frame-by-frame offline instead of a wall-clock rAF loop that compresses.
    // ease-out cubic so the count decelerates into its final value.
    await clock.motion(DUR, async (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      await safeEval(({ s, e }) => {
        const el = document.querySelector(s);
        if (!el || !el.dataset.srCountup) return;
        const tgt = parseFloat(el.dataset.srCuTgt);
        const dec = parseInt(el.dataset.srCuDec, 10) || 0;
        const group = (v) => el.dataset.srCuComma ? v.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : v;
        const fixed = (tgt * e).toFixed(dec);
        const parts = fixed.split('.');
        parts[0] = group(parts[0]);
        el.textContent = el.dataset.srCuPre + parts.join('.') + el.dataset.srCuSuf;
      }, { s: sel, e });
    });
    // SETTLE: restore the EXACT original text (glyph-perfect), then a faint
    // accent pop (scale) so the landing reads as deliberate. anti-pop: the pop
    // is a transition (enter scale 1.08 -> ease back), never an instant jump.
    await safeEval((s) => {
      const el = document.querySelector(s);
      if (!el || !el.dataset.srCountup) return;
      el.textContent = el.dataset.srCuReal;
      const cs = getComputedStyle(el);
      if (cs.position === 'static') { el.style.position = 'relative'; el.dataset.srCuPos = '1'; }
      el.dataset.srCuPrevT = el.style.transition;
      el.dataset.srCuPrevTf = el.style.transform;
      el.style.transition = 'transform .26s cubic-bezier(.34,1.56,.64,1)';
      el.style.transform = (el.style.transform && el.style.transform !== 'none' ? el.style.transform + ' ' : '') + 'scale(1.08)';
    }, sel);
    await clock.wait(ms(130), true);
    // ease the pop back, then a real tick later strip the transition + clean up.
    await safeEval((s) => {
      const el = document.querySelector(s);
      if (!el || !el.dataset.srCountup) return;
      el.style.transform = el.dataset.srCuPrevTf || '';
    }, sel);
    await clock.wait(ms(POP - 130), true);
    await safeEval((s) => {
      const el = document.querySelector(s);
      if (!el || !el.dataset.srCountup) return;
      el.style.transition = el.dataset.srCuPrevT || '';
      if (el.dataset.srCuPos) el.style.position = '';
      el.textContent = el.dataset.srCuReal; // ensure verbatim, no leftover
      delete el.dataset.srCountup; delete el.dataset.srCuReal; delete el.dataset.srCuPre;
      delete el.dataset.srCuSuf; delete el.dataset.srCuTgt; delete el.dataset.srCuDec;
      delete el.dataset.srCuComma; delete el.dataset.srCuPos;
      delete el.dataset.srCuPrevT; delete el.dataset.srCuPrevTf;
    }, sel);
  };
  const applySparkline = async (sel, points, opts) => {
    const o = (opts && typeof opts === 'object') ? opts : {};
    const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
    // duration = stroke DRAW length (default 1200). scale = chart-box size
    // multiplier (default 1). count/intensity unused for a sparkline.
    const DRAW = clamp(o.duration, 200, 8000, 1200);
    const SC = clamp(o.scale, 0.3, 3, 1);
    const ENTER = 300;               // layer fade-in (anti-pop entrance)
    const HOLD = 800;                // BUG FIX: hold the drawn chart visible before fade
    const EXIT = 350;                // layer fade-out (anti-pop exit)
    await safeEval(({ s, pts, DRAW, SC, ENTER, HOLD, EXIT }) => {
      const el = document.querySelector(s);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      // surface luminance under the target so the accent contrasts the page:
      // walk up for a real bg, then pick a stroke that pops on dark vs light.
      const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
      let bg = getComputedStyle(el).backgroundColor, p = el;
      while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
      const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
      const stroke = dark ? '#34d399' : '#059669'; // emerald — brighter on dark, deeper on light
      const fillTop = dark ? 'rgba(52,211,153,0.34)' : 'rgba(5,150,105,0.22)';
      // data: explicit points win; else a pleasant upward trend. Normalize to
      // 0..1 so any scale of input maps into the chart box.
      const raw = Array.isArray(pts) && pts.length >= 2 ? pts.map(Number).filter((n) => isFinite(n)) : [4, 6, 5, 8, 7, 11, 13];
      const data = raw.length >= 2 ? raw : [4, 6, 5, 8, 7, 11, 13];
      const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
      // CHART BOX: sit ABOVE the target, right-aligned to it, clamped on-screen.
      // PROPORTIONAL: width tracks the target, then *scale, then clamp; height
      // and padding scale in step so the chart keeps its aspect under any knob.
      const W = Math.round(Math.max(120, Math.min(220, r.width)) * SC);
      const H = Math.round(56 * SC), PAD = Math.max(4, Math.round(6 * SC));
      let left = r.left + r.width - W;
      let top = r.top - H - 12;
      if (top < 8) top = r.bottom + 12;           // flip below if no room above
      if (left < 8) left = 8;
      if (left + W > window.innerWidth - 8) left = window.innerWidth - 8 - W;
      const ix = W - PAD * 2, iy = H - PAD * 2;
      const X = (i) => PAD + (ix * i) / (data.length - 1);
      const Y = (v) => PAD + iy - (iy * (v - lo)) / span;
      const linePts = data.map((v, i) => X(i) + ',' + Y(v)).join(' ');
      const areaPts = PAD + ',' + (H - PAD) + ' ' + linePts + ' ' + (W - PAD) + ',' + (H - PAD);
      const lastX = X(data.length - 1), lastY = Y(data[data.length - 1]);
      // free-floating layer on the fixed overlay (like confetti) — self-cleaning.
      const layer = document.createElement('div');
      layer.className = '__sr_sparkline__';
      layer.style.cssText = 'position:fixed;left:' + Math.round(left) + 'px;top:' + Math.round(top) + 'px;'
        + 'width:' + W + 'px;height:' + H + 'px;z-index:2147483646;pointer-events:none;'
        + 'border-radius:' + Math.round(8 * SC) + 'px;opacity:0;transition:opacity ' + (ENTER / 1000) + 's ease;overflow:hidden;'
        + 'background:' + (dark ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.65)')
        + ';box-shadow:0 4px 16px rgba(0,0,0,' + (dark ? '0.45' : '0.18') + '),inset 0 0 0 1px '
        + (dark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)') + ';';
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      // draw choreography rides the chosen DRAW length: fill leads in at ~40%,
      // head dot pops at ~80% — proportional to duration, not hardcoded seconds.
      const drawS = DRAW / 1000;
      const area = document.createElementNS(NS, 'polygon');
      area.setAttribute('points', areaPts);
      area.setAttribute('fill', fillTop);
      area.setAttribute('opacity', '0');
      area.style.cssText = 'transition:opacity ' + (drawS * 0.5).toFixed(2) + 's ease ' + (drawS * 0.4).toFixed(2) + 's;'; // fade the fill in after the line leads
      const line = document.createElementNS(NS, 'polyline');
      line.setAttribute('points', linePts);
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', stroke);
      line.setAttribute('stroke-width', (2.5 * Math.sqrt(SC)).toFixed(2));
      line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('stroke-linejoin', 'round');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', lastX); dot.setAttribute('cy', lastY); dot.setAttribute('r', (3.5 * Math.sqrt(SC)).toFixed(2));
      dot.setAttribute('fill', stroke);
      dot.style.cssText = 'opacity:0;transition:opacity .25s ease ' + (drawS * 0.8).toFixed(2) + 's;'; // pop the head dot once the line arrives
      svg.appendChild(area); svg.appendChild(line); svg.appendChild(dot);
      layer.appendChild(svg);
      document.documentElement.appendChild(layer);
      // STROKE DRAW-ON: dasharray = full length, dashoffset animates length->0
      // over DRAW. dashoffset stays = len (line hidden) until armed next frame.
      const len = line.getTotalLength ? line.getTotalLength() : W;
      line.style.cssText = 'stroke-dasharray:' + len + ';stroke-dashoffset:' + len + ';'
        + 'transition:stroke-dashoffset ' + drawS.toFixed(2) + 's cubic-bezier(.18,.7,.3,1);';
      void layer.offsetWidth; // commit the from-pose before arming the transition
      // pulse-bug guard: paint the visible (drawn) state on its OWN frame; the
      // fade-out is deferred to a far later tick (after draw + hold), never the
      // same frame as the paint — so the chart can never appear and vanish at once.
      requestAnimationFrame(() => {
        layer.style.opacity = '1';
        line.style.strokeDashoffset = '0';
        area.setAttribute('opacity', '1');
        dot.style.opacity = '1';
      });
      // self-clean: HOLD the finished chart, THEN fade the whole layer and remove.
      const hot = DRAW + HOLD;                  // draw + the visible hold
      setTimeout(() => { layer.style.transition = 'opacity ' + (EXIT / 1000) + 's ease'; layer.style.opacity = '0'; }, hot);
      setTimeout(() => layer.remove(), hot + EXIT + 50);
    }, { s: sel, pts: Array.isArray(points) ? points : null, DRAW, SC, ENTER, HOLD, EXIT });
    // host life MUST cover entrance + draw + hold + exit fade so the on-screen
    // life is fully captured — not cut mid-draw, not lingering into the next step.
    await clock.wait(ms(DRAW + HOLD + EXIT + 80), true);
  };
  const applyPulse = async (sel, color, opts) => {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
        // duration = per-ring LIFE (default 900). count = rings (default 3). scale = size
        // multiplier (default 1). intensity = glow/grow strength (default 1).
        const LIFE = clamp(o.duration, 200, 8000, 900);
        const N = Math.round(clamp(o.count, 1, 8, 3));
        const SC = clamp(o.scale, 0.3, 3, 1);
        const INT = clamp(o.intensity, 0.2, 2, 1);
        const GAP = Math.round(LIFE * 0.33); // ring stagger tracks the chosen life
        await safeEval(({ s, col, LIFE, N, SC, INT, GAP }) => {
          const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
          const el = document.querySelector(s);
          if (!el) return;
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return;
          const k = SC;
          let posPatched = false;
          if (cs.position === 'static') { el.style.position = 'relative'; posPatched = true; }
          // surface luminance: prefer the element's own bg, else walk up to a painted ancestor.
          let bg = cs.backgroundColor; let p = el;
          while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
          const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
          const accent = col || '#16a34a';
          const blend = dark ? 'screen' : 'multiply';
          // PROPORTIONAL: every key dimension derives from the target's short edge,
          // so the ring hugs a 28px icon and a 332px card with the same visual weight.
          const minEdge = Math.min(r.width, r.height);
          const maxEdge = Math.max(r.width, r.height);
          // inset: ring sits just outside the box, ~9% of the short edge, clamped so
          // tiny targets still get a readable gap and huge ones don't balloon.
          const inset = Math.max(4, Math.min(minEdge * 0.09, 26)) * k;
          // stroke: ~5% of short edge — thin on icons, bold on cards. clamped 2..7.
          // intensity fattens the stroke for a punchier pulse.
          const bw = Math.max(2, Math.min(minEdge * 0.05, 7)) * Math.sqrt(k) * (0.7 + INT * 0.3);
          // glow blur scales with the box too (airy halo on dark, denser drop on light);
          // intensity drives the halo brightness/reach.
          const gb = Math.max(8, Math.min(minEdge * 0.4, 34)) * k * INT;
          const glow = dark ? '0 0 ' + gb + 'px ' + (gb * 0.12) + 'px ' + accent
                            : '0 ' + (gb * 0.34) + 'px ' + (gb * 1.1) + 'px ' + accent + '55';
          // GROW: rings expand by an ABSOLUTE margin (~half the short edge) past the
          // host, so the overshoot feels constant — a fat target doesn't fling rings
          // miles out, a thin one still visibly pops. expressed as a scale factor
          // relative to the host (box + 2*inset). wide/short boxes honor the tighter
          // axis so the ring never shoots off the sides. intensity pushes rings further.
          const hostW = r.width + inset * 2, hostH = r.height + inset * 2;
          const ringMargin = Math.max(10, Math.min(minEdge * 0.5, 70)) * k * INT; // px past the host edge
          const growX = 1 + ringMargin / hostW, growY = 1 + ringMargin / hostH;
          const GROW = Math.min(growX, growY);
          // hug the target shape: inherit radius (discs/pills round, cards softened),
          // padded by the inset so the ring rounds in step with the box.
          let rad = parseFloat(cs.borderTopLeftRadius) || 0;
          if (rad >= minEdge / 2 - 1) rad = 999; // already a disc/pill
          else rad = Math.min(rad + inset, maxEdge * 0.5); // proportional softening, never over-round
          const host = document.createElement('div');
          host.className = '__sr_pulse__ __sr_mask__';
          host.style.cssText = 'position:absolute;inset:-' + inset + 'px;z-index:2147483600;pointer-events:none;mix-blend-mode:' + blend + ';';
          el.appendChild(host);
          const STEP = (GROW - 1) * 0.26; // trailing rings fan a touch further, proportionally
          for (let i = 0; i < N; i++) {
            const lead = i === 0;
            const ringEl = document.createElement('div');
            ringEl.style.cssText = 'position:absolute;inset:0;border-radius:' + rad + 'px;border:' + bw + 'px solid ' + accent + ';'
              + 'box-shadow:' + glow + ';opacity:0;will-change:transform,opacity;'
              + 'transform:scale(.94);transform-origin:center;'
              // lead ring overshoots (pop); trailing rings glide out (entrance ease).
              + 'transition:transform ' + (LIFE / 1000) + 's ' + (lead ? 'cubic-bezier(.34,1.56,.64,1)' : 'cubic-bezier(.18,.7,.3,1)') + ',opacity ' + (LIFE / 1000) + 's ease-out;';
            host.appendChild(ringEl);
            void ringEl.offsetWidth;
            setTimeout(() => {
              // paint the visible state on its own frame first (pulse-bug guard):
              // enter ON a fade so the ring never pops in.
              requestAnimationFrame(() => {
                ringEl.style.opacity = lead ? '1' : '0.85';
                ringEl.style.transform = 'scale(' + (GROW + i * STEP) + ')';
              });
              // the fade-to-0 MUST be a later tick — setting opacity 1 then 0 in the
              // same frame collapses the transition to 0->0 (ring never paints).
              // exit ALSO on a fade (anti-pop).
              setTimeout(() => { ringEl.style.opacity = '0'; }, LIFE * 0.45);
            }, i * GAP);
          }
          setTimeout(() => {
            host.remove();
            if (posPatched) el.style.position = '';
          }, (N - 1) * GAP + LIFE + 120);
        }, { s: sel, col: color || '', LIFE, N, SC, INT, GAP });
        // host life tracks the chosen duration so the full ring train (last ring's
        // entrance + main + hold + exit fade) is captured, not cut or left lingering.
        await clock.wait(ms((N - 1) * GAP + LIFE + 220), true);
      };
const applyRipple = async (sel, color, opts) => {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
        // duration = main expand (default 900). count = rings (default 2). scale = size
        // multiplier (default 1). intensity = glow brightness + ring opacity (default 1).
        const DUR = clamp(o.duration, 200, 8000, 900);
        const CNT = Math.round(clamp(o.count, 1, 8, 2));
        const SC = clamp(o.scale, 0.3, 3, 1);
        const INT = clamp(o.intensity, 0.2, 2, 1);
        await safeEval(({ s, col, DUR, CNT, SC, INT }) => {
          const el = document.querySelector(s);
          if (!el) return;
          const r = el.getBoundingClientRect();
          if (r.width < 1 && r.height < 1 && r.left === 0 && r.top === 0) return;
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          // PROPORTIONAL: rings settle just OUTSIDE the target box. The base ring
          // diameter tracks the target's larger side so a wide table gets a wide
          // wave and a tiny chip a tiny one; clamped so micro targets still read
          // and a full-width row does not flood the frame. scale multiplies it.
          const k = SC;
          const span = Math.max(r.width, r.height);
          const vp = Math.min(window.innerWidth, window.innerHeight) || 800;
          // cap the base diameter to min(vp*0.32, 180) so even a wide target's wave
          // stays a tasteful accent, not a screen-flooding bloom. scale lifts it
          // past the cap on demand.
          const base = Math.max(26, Math.min(Math.min(vp * 0.32, 180), span * 0.62)) * k;
          const D = Math.round(base);
          const accent = col || '#16a34a';
          const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
          let bg = getComputedStyle(el).backgroundColor, p = el;
          while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
          const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
          const glass = dark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.82)';
          const hair = dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)';
          const shadow = '0 10px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.16)';
          // glow brightness rides intensity — a stronger ripple flares harder.
          const gpx = Math.round(16 * INT);
          const glow = dark ? '0 0 ' + gpx + 'px 2px ' + accent : '0 6px ' + Math.round(18 * INT) + 'px ' + accent + '55';
          const blend = dark ? 'screen' : 'multiply';
          const blur = 'backdrop-filter:blur(13px) saturate(140%);-webkit-backdrop-filter:blur(13px) saturate(140%)';
          // stroke + core scale with the wave so big ripples are not hairlines and
          // tiny ones are not blobs; clamped to keep them crisp at the extremes.
          const stroke = Math.max(2, Math.min(5, D * 0.022));
          const ENTER = 'cubic-bezier(.18,.7,.3,1)';
          const POP = 'cubic-bezier(.34,1.56,.64,1)';
          // timings derive from duration: main expand = DUR; the fade fires after
          // ~40% of DUR so the visible peak lands first; exit fade lasts ~55% of DUR.
          const main = DUR / 1000;
          const fadeAt = Math.round(DUR * 0.4);
          const fadeDur = (DUR * 0.55) / 1000;
          const layer = document.createElement('div');
          layer.className = '__sr_ripple__';
          layer.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;';
          document.documentElement.appendChild(layer);
          // glass core disc — a small accent-tinted glass puck that pops at the hit point
          const cd = Math.round(D * 0.42);
          const core = document.createElement('div');
          core.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:' + cd + 'px;height:' + cd + 'px;'
            + 'margin-left:' + (-cd / 2) + 'px;margin-top:' + (-cd / 2) + 'px;border-radius:999px;'
            + 'background:' + glass + ';' + blur + ';border:1px solid ' + hair + ';'
            + 'box-shadow:' + shadow + ',0 0 0 ' + (stroke * 0.9).toFixed(1) + 'px ' + accent + ',' + glow + ';'
            + 'opacity:0;transform:scale(.4);transform-origin:center;'
            + 'transition:transform ' + (main * 0.66).toFixed(2) + 's ' + POP + ',opacity ' + (main * 0.66).toFixed(2) + 's ' + ENTER + ';';
          layer.appendChild(core);
          // `CNT` staggered accent rings expanding outward with glow
          const rings = [];
          for (let j = 0; j < CNT; j++) {
            const w = document.createElement('div');
            w.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:' + D + 'px;height:' + D + 'px;'
              + 'margin-left:' + (-D / 2) + 'px;margin-top:' + (-D / 2) + 'px;border-radius:999px;'
              + 'border:' + stroke.toFixed(1) + 'px solid ' + accent + ';box-shadow:' + glow + ',inset ' + glow + ';'
              + 'mix-blend-mode:' + blend + ';opacity:0;'
              + 'transform:scale(.32);transform-origin:center;'
              + 'transition:transform ' + main.toFixed(2) + 's ' + ENTER + ',opacity ' + main.toFixed(2) + 's ' + ENTER + ' ' + (j * 0.12).toFixed(2) + 's;';
            layer.appendChild(w);
            rings.push(w);
          }
          void layer.offsetWidth;
          // PAINT visible state on its own frame (pulse-bug guard: never set 1 and 0 same frame)
          core.style.opacity = '1';
          core.style.transform = 'scale(1)';
          // rings fan further the more of them there are; intensity lifts opacity.
          rings.forEach((w, j) => {
            const op = Math.max(0.18, Math.min(1, (0.92 - j * (0.6 / CNT)) * INT));
            w.style.opacity = op + '';
            w.style.transform = 'scale(' + (1.7 + j * 0.7) + ')';
          });
          // defer the fade with a real timer so the visible frame lands first.
          // exit ALSO on a fade (anti-pop), on its own later tick.
          setTimeout(() => {
            core.style.transition = 'transform ' + fadeDur.toFixed(2) + 's ' + ENTER + ',opacity ' + fadeDur.toFixed(2) + 's ' + ENTER;
            core.style.opacity = '0';
            core.style.transform = 'scale(.7)';
            rings.forEach((w) => { w.style.opacity = '0'; });
          }, fadeAt);
          setTimeout(() => layer.remove(), fadeAt + Math.round(fadeDur * 1000) + 120);
        }, { s: sel, col: color || '', DUR, CNT, SC, INT });
        // host life tracks the chosen duration: paint span (fadeAt ~0.4*DUR) + the
        // exit fade (~0.55*DUR) + cleanup tail, so the full entrance->hold->fade is
        // captured and not cut nor left lingering into the next step.
        await clock.wait(ms(Math.round(DUR * 0.95) + 180), true);
      };
  const applyShake = async (sel, color, opts) => {
      const o = (opts && typeof opts === 'object') ? opts : {};
      const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
      // duration = shake length (default 600). scale = halo/box size mult (default 1).
      // intensity = amplitude multiplier on A (default 1). count = n/a for shake.
      const DUR = clamp(o.duration, 200, 8000, 600);
      const SC = clamp(o.scale, 0.3, 3, 1);
      const INT = clamp(o.intensity, 0.2, 2, 1);
      const LIFE = DUR + 440; // entrance paint + shake + halo fade-out + clean
      await safeEval(({ s, col, DUR, SC, INT }) => {
        const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
        const el = document.querySelector(s);
        if (!el) return;
        if (el.dataset.srShaking) return;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return;
        el.dataset.srShaking = '1';
        const k = SC;
        // surface luminance under the target so the halo + glow read on dark AND light
        let bg = cs.backgroundColor; let pw = el;
        while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && pw.parentElement) { pw = pw.parentElement; bg = getComputedStyle(pw).backgroundColor; }
        const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
        const accent = col || '#16a34a';
        const blend = dark ? 'screen' : 'multiply';
        // intensity drives the halo glow reach so a punchier shake also glows harder.
        const gb = (dark ? 18 : 20) * INT;
        const glow = dark ? '0 0 ' + gb + 'px ' + (gb * 0.17) + 'px ' + accent : '0 6px ' + gb + 'px ' + accent + '66';
        const SHADOW = '0 10px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.16)';
        const HAIR = dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)';
        const radius = Math.max(12, Math.round(parseFloat(cs.borderRadius) || 12) + 5);
        // proportional halo gap: ~7px base, scaled. tiny targets still get a readable frame.
        const gap = Math.max(4, Math.round(7 * k));
        // GLASS ERROR HALO. The host MUST be a CHILD so it inherits any ancestor camera
        // transform — but replaced controls (input/select/textarea/img) can't render
        // children, so for those we anchor the host to the nearest block ANCESTOR and
        // offset it to the control's box (still in the camera-transformed subtree).
        const replaced = /^(INPUT|SELECT|TEXTAREA|IMG|VIDEO|CANVAS|BUTTON)$/.test(el.tagName);
        const anchor = replaced ? (el.offsetParent || el.parentElement || el) : el;
        const acs = getComputedStyle(anchor);
        let posPatched = false;
        if (!replaced && acs.position === 'static') { anchor.style.position = 'relative'; posPatched = true; }
        const ar = anchor.getBoundingClientRect();
        // offset of the control's box within the anchor (so the frame hugs the field).
        const offX = replaced ? (r.left - ar.left) : 0;
        const offY = replaced ? (r.top - ar.top) : 0;
        const host = document.createElement('div');
        host.className = '__sr_mask__ __sr_shake__';
        host.dataset.srFor = s;
        const frame = replaced
          ? 'left:' + (offX - gap) + 'px;top:' + (offY - gap) + 'px;width:' + (r.width + gap * 2) + 'px;height:' + (r.height + gap * 2) + 'px;'
          : 'inset:-' + gap + 'px;';
        host.style.cssText = 'position:absolute;' + frame + 'z-index:2147483600;pointer-events:none;'
          + 'border-radius:' + radius + 'px;opacity:0;transition:opacity .26s cubic-bezier(.18,.7,.3,1);'
          + 'box-shadow:' + glow + ',' + SHADOW + ';';
        // frosted ring border (hollow center via mask so the field text stays readable),
        // tinted glass + accent stroke. NO blend on the stroke so it never washes out.
        const bw = (2.5 * Math.sqrt(k)).toFixed(2);
        const ring = document.createElement('div');
        ring.style.cssText = 'position:absolute;inset:0;border-radius:' + radius + 'px;pointer-events:none;'
          + 'padding:' + gap + 'px;border:' + bw + 'px solid ' + accent + ';'
          + 'background:' + (dark ? 'rgba(15,23,42,0.40)' : 'rgba(255,255,255,0.48)') + ';'
          + 'backdrop-filter:blur(13px) saturate(140%);-webkit-backdrop-filter:blur(13px) saturate(140%);'
          + 'box-shadow:inset 0 0 0 1px ' + HAIR + ',inset 0 0 24px ' + accent + (dark ? '55' : '40') + ';'
          + '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);'
          + '-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);'
          + 'mask-composite:exclude;';
        // a soft inner accent sheen, blended to the surface for the family tint
        const sheen = document.createElement('div');
        sheen.style.cssText = 'position:absolute;inset:0;border-radius:' + radius + 'px;pointer-events:none;'
          + 'mix-blend-mode:' + blend + ';box-shadow:inset 0 0 20px 2px ' + accent + ';opacity:.6;';
        host.appendChild(ring);
        host.appendChild(sheen);
        anchor.appendChild(host);
        // shake the ELEMENT (and, when same node, the halo rides along) — transform-only.
        const base = (cs.transform && cs.transform !== 'none') ? cs.transform + ' ' : '';
        const prevInline = el.style.transform;
        // PROPORTIONAL amplitude derives from the box width, then *scale, *intensity,
        // then clamps. intensity=amplitude multiplier (the named knob).
        const A = Math.max(5, Math.min(14, Math.round(r.width * 0.03))) * k * INT;
        const frames = [0, -A, A, -A * 0.7, A * 0.7, -A * 0.4, A * 0.4, 0]
          .map((dx) => ({ transform: base + 'translateX(' + dx + 'px)' }));
        // when the halo is on an ancestor (replaced control), shake the halo too so it
        // tracks the field — same keyframes, no base transform on the host.
        const hostFrames = [0, -A, A, -A * 0.7, A * 0.7, -A * 0.4, A * 0.4, 0]
          .map((dx) => ({ transform: 'translateX(' + dx + 'px)' }));
        let anim = null, hanim = null;
        // PULSE-BUG GUARD: paint the halo (opacity 1) on its own frame, THEN start the
        // shake, THEN defer the fade-out to a real later tick — never 1->0 same frame.
        void host.offsetWidth;
        requestAnimationFrame(() => {
          host.style.opacity = '1';
          anim = el.animate(frames, { duration: DUR, easing: 'cubic-bezier(.36,.07,.19,.97)', fill: 'none' });
          anim.onfinish = () => { el.style.transform = prevInline; };
          anim.oncancel = () => { el.style.transform = prevInline; };
          if (replaced) hanim = host.animate(hostFrames, { duration: DUR, easing: 'cubic-bezier(.36,.07,.19,.97)', fill: 'none' });
          setTimeout(() => { host.style.opacity = '0'; }, DUR + 40); // fade halo once the shake settles (anti-pop exit)
        });
        // self-clean: cancel any running shake, remove the halo, restore the element.
        setTimeout(() => {
          try { if (anim) anim.cancel(); } catch (e) {}
          try { if (hanim) hanim.cancel(); } catch (e) {}
          host.remove();
          el.style.transform = prevInline;
          delete el.dataset.srShaking;
          if (posPatched) anchor.style.position = '';
        }, DUR + 400);
      }, { s: sel, col: color || '', DUR, SC, INT });
      // host life tracks the chosen duration so the full shake (entrance + shake +
      // halo exit fade) is captured, not cut nor left lingering into the next step.
      await clock.wait(ms(LIFE), true);
    };
  const applyGlow = async (sel, color, opts) => {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
        // duration = total breathe span (default 2600). count = number of breaths
        // (default 2 -> the 4-leg in/out/in/out it always did). scale = size mult.
        // intensity = glow brightness/reach (default 1).
        const DUR = clamp(o.duration, 200, 8000, 2600);
        const N = Math.round(clamp(o.count, 1, 12, 2));
        const SC = clamp(o.scale, 0.3, 3, 1);
        const INT = clamp(o.intensity, 0.2, 2, 1);
        // split the chosen span across the N breaths; each breath = a peak + a dip
        // leg, plus a one-off entrance pop and exit. Per-leg time tracks DUR so a
        // longer duration breathes slower, a shorter one quicker — never hardcoded.
        const legCount = N * 2;
        const legT = Math.max(160, Math.round(DUR / (legCount + 0.7)));
        const popT = Math.round(legT * 0.85);
        await safeEval(({ s, col, SC, INT, legT, popT, N }) => {
          const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
          const el = document.querySelector(s);
          if (!el) return;
          if (el.dataset.srGlowing) return;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return;
          el.dataset.srGlowing = '1';
          // ATTACH AS A CHILD so the ring inherits the element box + any ancestor
          // camera transform (a body-level layer diverges under a zoom).
          if (cs.position === 'static') { el.style.position = 'relative'; el.dataset.srPosPatched = '1'; }
          // surface luminance: own bg, else walk up to a painted ancestor.
          let bg = cs.backgroundColor, p = el;
          while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
          const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
          const accent = col || '#16a34a';
          // PROPORTIONAL SIZING: every key dimension derives from the target box.
          // `base` = the smaller half-extent of the element (so a wide bar keys off
          // its height, a tall pill off its width) — the natural radius the glow
          // should feel relative to. Clamp so a 28px icon still reads and a
          // 1024px-wide bar does not bloom into a fog. `scale` multiplies the base.
          const base = Math.max(7, Math.min(34, Math.min(r.width, r.height) * 0.42)) * SC;
          const stroke = Math.max(2, Math.min(4, base * 0.16)) * (0.7 + INT * 0.3); // accent ring weight, intensity fattens
          const inset = -(stroke + base * 0.14);                   // ring sits just outside
          const halo = base * 0.95 * INT;                          // soft inner glow blur, intensity reaches
          const haloSp = base * 0.16 * INT;                        // inner glow spread
          const outer = base * 2.4 * INT;                          // wide ambient bloom
          const outerSp = base * 0.6 * INT;                        // ambient spread
          const lift = base * 0.42;                                // light-mode drop offset
          const px = (n) => Math.round(n * 100) / 100 + 'px';
          // hug the element's own corner radius so the ring tracks pills/cards/discs;
          // the +pad keeps the corner concentric now that the inset is proportional.
          const tr = parseFloat(cs.borderRadius) || 0;
          const pad = -inset;
          const rad = (tr > 999 ? 999 : (tr > 0 ? tr + pad : Math.max(8, base * 0.5))) + 'px';
          // design-system accent ring + glow: proportional stroke, soft halo,
          // screen/multiply tint per surface.
          const glow = dark
            ? '0 0 0 ' + px(stroke) + ' ' + accent + ',0 0 ' + px(halo) + ' ' + px(haloSp) + ' ' + accent + ',0 0 ' + px(outer) + ' ' + px(outerSp) + ' ' + accent + '4d'
            : '0 0 0 ' + px(stroke) + ' ' + accent + ',0 ' + px(lift) + ' ' + px(halo * 1.1) + ' ' + accent + '55,0 0 ' + px(outer * 0.85) + ' ' + px(outerSp) + ' ' + accent + '33';
          const ring = document.createElement('div');
          ring.className = '__sr_mask__';
          ring.dataset.srFor = s;
          ring.style.cssText = 'position:absolute;inset:' + px(inset) + ';z-index:2147483600;pointer-events:none;border-radius:' + rad + ';'
            + 'box-shadow:' + glow + ';mix-blend-mode:' + (dark ? 'screen' : 'multiply') + ';'
            + 'opacity:0;transform:scale(.92);transform-origin:center;'
            + 'transition:opacity ' + (legT / 1000).toFixed(2) + 's cubic-bezier(.18,.7,.3,1),transform ' + (legT / 1000).toFixed(2) + 's cubic-bezier(.34,1.56,.64,1);';
          el.appendChild(ring);
          // smooth breathe: pop in w/ overshoot, then N breaths (each peak->dip),
          // then settle + fade — opacity + transform only, never a flicker. Each
          // leg eased, timing derived from the chosen duration. count drives breaths.
          const legs = [];
          for (let b = 0; b < N; b++) {
            legs.push({ o: '1', s: '1.02', t: legT });    // peak (inhale)
            legs.push({ o: '0.55', s: '0.97', t: legT }); // dip (exhale)
          }
          let i = 0;
          const cleanup = () => {
            ring.remove();
            if (el.dataset.srPosPatched) { el.style.position = ''; delete el.dataset.srPosPatched; }
            delete el.dataset.srGlowing;
          };
          const stepFn = () => {
            if (i >= legs.length) {
              // pulse-bug guard: the visible peak is already painted on its own frame;
              // settle to a clean full-strength pose, THEN defer the fade a real tick.
              ring.style.opacity = '1'; ring.style.transform = 'scale(1)';
              setTimeout(() => { ring.style.opacity = '0'; ring.style.transform = 'scale(1.06)'; setTimeout(cleanup, popT); }, popT * 0.56);
              return;
            }
            const leg = legs[i++];
            ring.style.opacity = leg.o; ring.style.transform = 'scale(' + leg.s + ')';
            setTimeout(stepFn, leg.t);
          };
          // paint the entrance state on its own frame before the breathe starts.
          requestAnimationFrame(() => { requestAnimationFrame(stepFn); });
        }, { s: sel, col: color || '', SC, INT, legT, popT, N });
        // host life tracks the chosen duration: N breaths (2 legs each) + entrance
        // pop + settle + exit fade, so the full breathe is captured, never cut.
        await clock.wait(ms(legCount * legT + popT * 1.56 + 240), true);
      };
  const applyCheckmark = async (sel, color, opts) => {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
        // duration = total seal life (default 1300). scale = disc size multiplier
        // (default 1). count/intensity n/a for a single seal.
        const LIFE = clamp(o.duration, 200, 8000, 1300);
        const SC = clamp(o.scale, 0.3, 3, 1);
        // life budget split off the chosen duration so a longer/shorter duration
        // stretches/compresses the whole seal — never cut, never lingering.
        const DRAW = Math.round(Math.min(520, LIFE * 0.4));   // check-stroke draw
        const HOLD = Math.round(LIFE * 0.34);                  // peak dwell
        const FADE = Math.round(Math.min(320, LIFE * 0.24));   // exit fade
        await safeEval(({ s, col, SC, LIFE, DRAW, HOLD, FADE }) => {
          const el = document.querySelector(s);
          if (!el) return;
          const r = el.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return;
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const accent = col || '#16a34a';
          // luminance: walk up to a non-transparent bg, adapt glass dark/light.
          const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
          let bg = getComputedStyle(el).backgroundColor, p = el;
          while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
          const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
          const GLASS = dark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.82)';
          const HAIR = dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(15,23,42,0.10)';
          const SHADOW = '0 10px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.16)';
          const BLUR = 'backdrop-filter:blur(13px) saturate(140%);-webkit-backdrop-filter:blur(13px) saturate(140%)';
          const GLOW = dark ? '0 0 16px 2px ' + accent : '0 6px 18px ' + accent + '55';
          // PROPORTIONAL disc, MUCH smaller than before: the seal is a compact
          // badge stamped on its target, not a slab covering it. Base off the
          // SHORTER side (fits inside a chip) lightly lifted by the longer side so
          // a wide row/h1 still reads, capped tight so a big card or the viewport
          // never gets a disc that eats the frame.
          const shortSide = Math.min(r.width, r.height);
          const longSide = Math.max(r.width, r.height);
          // base: ~0.7 of the short edge, gently lifted toward the long edge, then
          // hard-capped at 96 so even a tall card yields a small, clean badge.
          const base = Math.min(shortSide * 0.7 + Math.min(longSide - shortSide, longSide * 0.5) * 0.12, 96);
          // cap = 0.22*vmin (was 0.42 — the bug); floor 36 keeps tiny chips legible.
          // scale multiplies the proportional base, THEN re-clamps so scale stays sane.
          const vmin = Math.min(innerWidth, innerHeight);
          const D = Math.round(Math.max(36, Math.min(vmin * 0.22, base * SC)));

          const layer = document.createElement('div');
          layer.className = '__sr_checkmark__';
          layer.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;';
          document.documentElement.appendChild(layer);

          // accent glow ring just outside the glass disc — soft halo, blends in.
          const halo = document.createElement('div');
          halo.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:' + D + 'px;height:' + D + 'px;'
            + 'margin-left:' + (-D / 2) + 'px;margin-top:' + (-D / 2) + 'px;border-radius:999px;'
            + 'box-shadow:' + GLOW + ';mix-blend-mode:' + (dark ? 'screen' : 'multiply') + ';'
            + 'opacity:0;transform:scale(.5);transform-origin:center;'
            + 'transition:opacity .6s cubic-bezier(.18,.7,.3,1),transform .6s cubic-bezier(.34,1.56,.64,1);';
          layer.appendChild(halo);

          // clean glass disc — accent reads through the thin ring + check.
          const disc = document.createElement('div');
          disc.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:' + D + 'px;height:' + D + 'px;'
            + 'margin-left:' + (-D / 2) + 'px;margin-top:' + (-D / 2) + 'px;border-radius:999px;'
            + 'background:' + GLASS + ';' + BLUR + ';border:' + HAIR + ';box-shadow:' + SHADOW + ';'
            + 'opacity:0;transform:scale(.4);transform-origin:center;'
            + 'transition:opacity .26s cubic-bezier(.18,.7,.3,1),transform .6s cubic-bezier(.34,1.56,.64,1);';
          layer.appendChild(disc);

          // THIN accent hairline ring inside the rim — ties accent to the glass.
          // inset, ring stroke, check stroke, svg box all derive from D, so they
          // stay proportional at every disc size automatically.
          const ring = document.createElement('div');
          const inset = Math.round(D * 0.12);
          const ringSW = Math.max(1.5, Math.round(D * 0.028)); // thinner ring
          ring.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;'
            + 'width:' + (D - inset * 2) + 'px;height:' + (D - inset * 2) + 'px;'
            + 'margin-left:' + (-(D - inset * 2) / 2) + 'px;margin-top:' + (-(D - inset * 2) / 2) + 'px;'
            + 'border-radius:999px;border:' + ringSW + 'px solid ' + accent + ';'
            + 'opacity:0;transform:scale(.4);transform-origin:center;'
            + 'transition:opacity .3s ease,transform .6s cubic-bezier(.34,1.56,.64,1);';
          layer.appendChild(ring);

          // accent check stroke (drawn) — accent, not white-on-green.
          const sw = Math.max(2.5, Math.round(D * 0.085));
          const cd = D - inset * 2;
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.setAttribute('width', String(cd));
          svg.setAttribute('height', String(cd));
          svg.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;'
            + 'margin-left:' + (-cd / 2) + 'px;margin-top:' + (-cd / 2) + 'px;overflow:visible;';
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'M6 12.5 L10.5 17 L18 7.5');
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', accent);
          path.setAttribute('stroke-width', String(sw));
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          const LEN = path.getTotalLength ? path.getTotalLength() : 24;
          path.style.cssText = 'stroke-dasharray:' + LEN + ';stroke-dashoffset:' + LEN + ';'
            + 'filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));'
            + 'transition:stroke-dashoffset ' + (DRAW / 1000) + 's cubic-bezier(.18,.7,.3,1);';
          svg.appendChild(path);
          layer.appendChild(svg);

          // PAINT visible state on its own frame, THEN defer the draw — never set
          // a transition prop and its target value in the same frame (pulse bug).
          void layer.offsetWidth;
          requestAnimationFrame(() => {
            disc.style.opacity = '1'; disc.style.transform = 'scale(1)';
            halo.style.opacity = '1'; halo.style.transform = 'scale(1)';
            ring.style.opacity = '1'; ring.style.transform = 'scale(1)';
          });
          // draw the check on a later tick (defer); timings derive from LIFE.
          setTimeout(() => { path.style.strokeDashoffset = '0'; }, 200);
          // self-clean: exit fade on its own tick (anti-pop), then remove.
          const OUT = 200 + DRAW + HOLD;
          setTimeout(() => {
            disc.style.transition = 'opacity ' + (FADE / 1000) + 's ease,transform ' + (FADE / 1000) + 's ease';
            halo.style.transition = 'opacity ' + (FADE / 1000) + 's ease';
            ring.style.transition = 'opacity ' + (FADE / 1000) + 's ease';
            svg.style.transition = 'opacity ' + (FADE / 1000) + 's ease';
            disc.style.opacity = '0'; halo.style.opacity = '0'; ring.style.opacity = '0'; svg.style.opacity = '0';
          }, OUT);
          setTimeout(() => layer.remove(), OUT + FADE + 80);
        }, { s: sel, col: color || '', SC, LIFE, DRAW, HOLD, FADE });
        // host life tracks the chosen duration: entrance + draw + hold + exit fade
        // so the full seal life is captured, not cut nor lingering into next step.
        await clock.wait(ms(200 + DRAW + HOLD + FADE + 80), true);
      };
const applyTypeon = async (arg, opts) => {
      const o = (opts && typeof opts === 'object') ? opts : {};
      const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
      // duration = the WHOLE-TYPE length (default 1200): the per-glyph cadence is
      // derived from it, so the full line finishes in ~duration ms. scale n/a.
      const DUR = clamp(o.duration, 200, 8000, 1200);
      const sel = typeof arg === 'string' ? arg : arg.sel;
      const override = typeof arg === 'string' ? null : (arg.text != null ? String(arg.text) : null);
      const setup = await safeEval((s, ov, ac) => {
        const el = document.querySelector(s);
        if (!el || el.dataset.srTyping) return null;
        // innerText (not textContent) so block children — log lines, list items —
        // keep their line breaks; textContent glues them ("threshold10:42:09deploy").
        const full = ov != null ? ov : (el.innerText || el.textContent || '');
        if (!full) return null;
        const multiline = /\n/.test(full);
        const accent = ac || '#16a34a';
        // surface luminance: own bg, else walk up to a painted ancestor.
        const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
        let bg = getComputedStyle(el).backgroundColor, p = el;
        while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
        const dark = lum(bg || 'rgb(11,19,34)') < 0.5;
        el.dataset.srTyping = '1';
        el.dataset.srOrigHtml = el.innerHTML; // restore the real markup, not flat text
        el.textContent = '';
        if (multiline) el.style.whiteSpace = 'pre-wrap'; // honour the line breaks
        // settled trail keeps the element's own ink; only the writing HEAD carries
        // the accent glow, then settles — same accent-glow language as the rings,
        // not a flat band over the whole string.
        const txt = document.createElement('span');
        txt.className = '__sr_type_txt__';
        const head = document.createElement('span');
        head.className = '__sr_type_head__';
        // the writing head: newest glyph lit in accent with an accent halo; as it
        // scrolls into the settled trail it becomes plain ink, so the glow rides
        // the cursor instead of bathing the whole line.
        head.style.cssText = 'color:' + accent + ';'
          + 'text-shadow:' + (dark ? '0 0 12px ' + accent : '0 1px 8px ' + accent + '66') + ';';
        // glass caret: an accent bar on a frosted pill, hairline + accent glow.
        const car = document.createElement('span');
        car.className = '__sr_type_caret__';
        car.style.cssText = 'display:inline-block;width:3px;height:0.95em;margin:0 1px -0.08em 3px;vertical-align:baseline;'
          + 'border-radius:999px;background:' + accent + ';'
          + 'box-shadow:' + (dark ? '0 0 14px 1px ' + accent : '0 6px 18px ' + accent + '55') + ',inset 0 1px 0 rgba(255,255,255,.5);'
          + 'opacity:1;transition:opacity .14s linear;';
        el.appendChild(txt);
        el.appendChild(head);
        el.appendChild(car);
        return { full };
      }, sel, override, accent || '');
      if (!setup) return;
      const full = setup.full;
      // per-glyph cadence derived from the chosen whole-type duration, so the host
      // wait (sum of all `per` slices) tracks DUR — the full line is captured, not cut.
      const per = Math.max(1, Math.round(ms(DUR) / Math.max(1, full.length)));
      for (let i = 1; i <= full.length; i++) {
        await safeEval(({ s, settled, head, blink }) => {
          const el = document.querySelector(s);
          if (!el) return;
          const txt = el.querySelector('.__sr_type_txt__');
          const hd = el.querySelector('.__sr_type_head__');
          const car = el.querySelector('.__sr_type_caret__');
          // settled trail = all but the last char (inherits ink, glow already
          // decayed); head = the newest char, lit in accent then cooling.
          if (txt) txt.textContent = settled;
          if (hd) hd.textContent = head;
          if (car) car.style.opacity = blink ? '1' : '0.35';
        }, { s: sel, settled: full.slice(0, Math.max(0, i - 1)), head: full.slice(Math.max(0, i - 1), i), blink: i % 2 === 0 });
        await clock.wait(per, true);
      }
      // merge the last head glyph into the settled trail so it cools to ink too.
      await safeEval((s) => {
        const el = document.querySelector(s);
        const txt = el?.querySelector('.__sr_type_txt__');
        const hd = el?.querySelector('.__sr_type_head__');
        if (txt && hd) { txt.textContent = (txt.textContent || '') + (hd.textContent || ''); hd.textContent = ''; }
      }, sel);
      // a few caret blinks to punctuate the finished line.
      for (let k = 0; k < 3; k++) {
        await safeEval(({ s, on }) => { const c = document.querySelector(s)?.querySelector('.__sr_type_caret__'); if (c) c.style.opacity = on ? '1' : '0.2'; }, { s: sel, on: k % 2 === 0 });
        await clock.wait(ms(160), true);
      }
      // pulse-bug guard: paint the visible (caret faded) state, THEN restore next tick.
      await safeEval((s) => { const c = document.querySelector(s)?.querySelector('.__sr_type_caret__'); if (c) c.style.opacity = '0'; }, sel);
      await clock.wait(ms(140), true);
      await safeEval((s) => {
        const el = document.querySelector(s);
        if (!el) return;
        if (el.dataset.srOrigHtml != null) el.innerHTML = el.dataset.srOrigHtml; // restore real markup
        el.style.whiteSpace = '';
        delete el.dataset.srTyping; delete el.dataset.srOrigHtml;
      }, sel);
      await clock.wait(ms(120), true);
    };
  const applyReveal = async (sel, color, opts) => {
      const o = (opts && typeof opts === 'object') ? opts : {};
      const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
      // duration = the WIPE length (default 900). count/scale/intensity n/a per contract.
      const DUR = clamp(o.duration, 200, 8000, 900);
      const STAGGER = Math.round(Math.min(160, DUR * 0.14)); // per-element delay tracks the wipe
      await safeEval(({ s, col, DUR, STAGGER }) => {
        const accent = col || '#16a34a';
        const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
        const EASE = 'cubic-bezier(.18,.7,.3,1)';
        const DURs = (DUR / 1000).toFixed(3) + 's';
        let maxEnd = 0;
        document.querySelectorAll(s).forEach((el, i) => {
          if (el.dataset.srRevealing) return;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') return;
          el.dataset.srRevealing = '1';
          // surface luminance: prefer the element's own bg, else walk up.
          let bg = cs.backgroundColor, p = el;
          while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
          const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
          const radius = parseFloat(cs.borderRadius) || 12;
          // anchor patch so child overlays inherit the camera transform.
          const prevClip = el.style.clipPath;
          const prevWebkitClip = el.style.webkitClipPath;
          const prevTransition = el.style.transition;
          const posPatched = cs.position === 'static';
          if (posPatched) { el.style.position = 'relative'; }
          const delay = i * STAGGER;
          el.style.transition = 'none';
          el.style.clipPath = 'inset(0 100% 0 0)';
          el.style.webkitClipPath = 'inset(0 100% 0 0)';
          void el.offsetWidth;
          el.style.transition = (prevTransition ? prevTransition + ',' : '')
            + 'clip-path ' + DURs + ' ' + EASE + ' ' + delay + 'ms,'
            + '-webkit-clip-path ' + DURs + ' ' + EASE + ' ' + delay + 'ms';
          // GLASS leading edge that rides the reveal boundary L->R: a hairline
          // accent bar with soft accent glow, fronted by a thin glass veil so the
          // newly-revealed content emerges from frosted light, on-brand with the
          // note/modal glass family. Element-anchored child -> inherits transform.
          const GLASS = dark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.82)';
          const HAIR = dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)';
          const glow = dark ? '0 0 16px 2px ' + accent : '0 6px 18px ' + accent + '55';
          const layer = document.createElement('div');
          layer.className = '__sr_mask__';
          layer.dataset.srFor = s;
          layer.style.cssText = 'position:absolute;inset:0;z-index:2147483600;pointer-events:none;'
            + 'border-radius:' + radius + 'px;overflow:hidden;opacity:0;transition:opacity .3s ease;';
          // frosted veil: covers the not-yet-revealed right side, retreats with edge.
          const veil = document.createElement('div');
          veil.style.cssText = 'position:absolute;inset:0;border-radius:' + radius + 'px;'
            + 'background:' + GLASS + ';' + 'backdrop-filter:blur(13px) saturate(140%);-webkit-backdrop-filter:blur(13px) saturate(140%);'
            + 'border:1px solid ' + HAIR + ';'
            + 'clip-path:inset(0 0 0 0);-webkit-clip-path:inset(0 0 0 0);'
            + 'transition:clip-path ' + DURs + ' ' + EASE + ' ' + delay + 'ms,-webkit-clip-path ' + DURs + ' ' + EASE + ' ' + delay + 'ms;'
            + 'mix-blend-mode:' + (dark ? 'screen' : 'normal') + ';';
          // accent edge: vertical 2.5px stroke sitting at the wipe boundary.
          const edge = document.createElement('div');
          edge.style.cssText = 'position:absolute;top:0;bottom:0;left:0;width:2.5px;'
            + 'background:' + accent + ';box-shadow:' + glow + ';opacity:0;'
            + 'transform:translateX(0);'
            + 'transition:transform ' + DURs + ' ' + EASE + ' ' + delay + 'ms,opacity .25s ease ' + delay + 'ms;';
          layer.appendChild(veil);
          layer.appendChild(edge);
          el.appendChild(layer);
          void layer.offsetWidth;
          // paint visible on its own frame; the wipe + edge fade-in run together
          // (anti-pop enter). pulse-bug guard: opacity 1 is set here, the fade-to-0
          // is deferred to a LATER real tick below (never 1 and 0 same frame).
          requestAnimationFrame(() => {
            layer.style.opacity = '1';
            edge.style.opacity = '1';
            el.style.clipPath = 'inset(0 0 0 0)';
            el.style.webkitClipPath = 'inset(0 0 0 0)';
            veil.style.clipPath = 'inset(0 0 0 100%)';
            veil.style.webkitClipPath = 'inset(0 0 0 100%)';
            edge.style.transform = 'translateX(' + (r.width - 2.5) + 'px)';
          });
          const endAt = delay + DUR;
          if (endAt > maxEnd) maxEnd = endAt;
          // pulse-bug guard: keep the edge fully painted, fade it on its OWN tick.
          setTimeout(() => { edge.style.opacity = '0'; layer.style.opacity = '0'; }, endAt + 40);
          setTimeout(() => {
            layer.remove();
            el.style.clipPath = prevClip;
            el.style.webkitClipPath = prevWebkitClip;
            el.style.transition = prevTransition;
            if (posPatched) { el.style.position = ''; }
            delete el.dataset.srRevealing;
          }, endAt + 360);
        });
        return maxEnd;
      }, { s: sel, col: color || '', DUR, STAGGER });
      // host life tracks the chosen wipe duration (+ stagger + edge fade + tail) so
      // the full reveal is captured, not cut nor left lingering into the next step.
      await clock.wait(ms(DUR + STAGGER + 400), true);
    };
  const applyOrbit = async (sel, color, opts) => {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
        // duration = per-LAP time (default 900). count drives TWO things: the number
        // of LAPS the comet runs (default 2) AND the number of orbs = 1 head +
        // (count-1) trailing dots fanned behind it (default 5 orbs). scale = size
        // mult (default 1). intensity = glow strength (default 1).
        const LAP = clamp(o.duration, 200, 8000, 900);
        const N = Math.round(clamp(o.count, 1, 12, 5));
        const LAPS = Math.max(1, N);
        const SC = clamp(o.scale, 0.3, 3, 1);
        const INT = clamp(o.intensity, 0.2, 2, 1);
        const ENTER = Math.min(280, Math.round(LAP * 0.34));
        const EXIT = 360;
        const SPIN = LAP * LAPS;
        const setup = await safeEval(({ s, col, N, SC, INT, ENTER }) => {
          const el = document.querySelector(s);
          if (!el) return null;
          if (el.dataset.srOrbiting) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return null;
          el.dataset.srOrbiting = '1';
          if (cs.position === 'static') { el.style.position = 'relative'; el.dataset.srPosPatched = '1'; }
          const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
          let bg = cs.backgroundColor, p = el;
          while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
          const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
          const accent = col || '#16a34a';
          const SCk = SC;
          const HAIR = dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)';
          // PROPORTIONAL: every dimension derives from the target box. `minSide`
          // drives the comet head (its weight tracks the smaller edge so it reads on
          // a tiny chip yet swells on a big card); `OFF` is how far the orbit track
          // floats outside the box — a fraction of the box too, so the glass ring
          // hugs small targets and gives wide ones breathing room.
          const minSide = Math.min(r.width, r.height);
          const OFF = Math.round(Math.max(4, Math.min(18, minSide * 0.14)) * SCk);
          const D = Math.round(Math.max(9, Math.min(46, minSide * 0.34)) * SCk);
          // glow + ring weight scale with the head (and intensity) so the look stays
          // balanced from a 28px icon to a 332px card.
          const blur = Math.max(8, Math.round(D * 0.9 * INT));
          const spread = Math.max(1, Math.round(D * 0.12 * INT));
          const GLOW = dark ? '0 0 ' + blur + 'px ' + spread + 'px ' + accent : '0 ' + Math.round(D * 0.3) + 'px ' + blur + 'px ' + accent + '55';
          const bw = Math.max(1, Math.round(D * 0.09));
          const rad = (parseFloat(cs.borderRadius) || 10);
          const trackRad = rad + OFF;
          const path = 'inset(0 round ' + trackRad + 'px)';
          // element-anchored layer (CHILD of target -> inherits camera transform): a
          // glass hairline ring tracing the box, plus a comet head + (N-1) trailing
          // dots all riding the SAME offset-path. mix-blend adapts to luminance.
          const layer = document.createElement('div');
          layer.className = '__sr_mask__';
          layer.dataset.srFor = s;
          layer.dataset.srOrbitLayer = '1';
          layer.style.cssText = 'position:absolute;inset:-' + OFF + 'px;z-index:2147483600;pointer-events:none;'
            + 'border-radius:' + trackRad + 'px;opacity:0;transition:opacity .4s cubic-bezier(.18,.7,.3,1);'
            + 'mix-blend-mode:' + (dark ? 'screen' : 'multiply') + ';';
          const ring = document.createElement('div');
          ring.style.cssText = 'position:absolute;inset:0;border-radius:' + trackRad + 'px;'
            + 'border:' + bw + 'px solid ' + HAIR + ';box-shadow:inset 0 1px 0 rgba(255,255,255,.10);'
            + 'opacity:0;transition:opacity .4s cubic-bezier(.18,.7,.3,1);';
          layer.appendChild(ring);
          // build the comet: index 0 is the bright head, 1..N-1 are trailing dots
          // shrinking + dimming the further back they sit. opacity 0 at birth; the
          // paint frame fades them in (anti-pop), the drift loop places them.
          const orbs = [];
          for (let i = 0; i < N; i++) {
            const head = i === 0;
            const t = N > 1 ? i / (N - 1) : 0;
            const size = head ? D : Math.max(3, Math.round(D * (0.62 - t * 0.34)));
            const dim = head ? GLOW : '0 0 ' + Math.max(5, Math.round(D * 0.4 * INT)) + 'px ' + Math.max(1, Math.round(D * 0.07)) + 'px ' + accent + '99';
            const orb = document.createElement('div');
            orb.dataset.srOrb = String(i);
            orb.style.cssText = 'position:absolute;left:0;top:0;width:' + size + 'px;height:' + size + 'px;'
              + 'margin:-' + (size / 2) + 'px 0 0 -' + (size / 2) + 'px;border-radius:50%;'
              + 'background:radial-gradient(circle at 50% 50%,' + accent + ' 0%,' + accent + ' 55%,' + accent + '00 100%);'
              + 'box-shadow:' + dim + ';opacity:0;'
              + 'offset-path:' + path + ';offset-rotate:0deg;offset-distance:0%;'
              + 'transition:opacity ' + (ENTER / 1000) + 's cubic-bezier(.18,.7,.3,1);';
            layer.appendChild(orb);
            orbs.push(orb);
          }
          el.appendChild(layer);
          void layer.offsetWidth;
          // pulse-bug guard: paint the ring + layer VISIBLE on their own frame, and
          // fade the orbs IN (enter anti-pop). Defer any fade-to-0 to a later tick.
          requestAnimationFrame(() => {
            layer.style.opacity = '1';
            ring.style.opacity = '1';
            for (let i = 0; i < orbs.length; i++) orbs[i].style.opacity = String(i === 0 ? 1 : 0.82 - (i / Math.max(1, orbs.length)) * 0.5);
          });
          return { ok: true };
        }, { s: sel, col: color || '', N, SC, INT, ENTER });
        if (!setup) { await clock.wait(ms(LAP), true); return; }
        // DRIFT: clock.motion drives offset-distance each tick (virtual-clock native,
        // can't snap like a CSS offset-distance transition — which only ever ran ONE
        // lap then froze: the named bug). Head leads; each trailing dot lags a small
        // constant fraction so the comet reads as one streak doing `LAPS` laps.
        const LAG = 0.05;
        await clock.motion(SPIN, async (k) => {
          const ease = k < 0.06 ? k / 0.06 : 1;
          const prog = k * LAPS * ease;
          await safeEval(({ s, prog, LAG }) => {
            const el = document.querySelector(s);
            if (!el) return;
            const layer = el.querySelector('[data-sr-orbit-layer]');
            if (!layer) return;
            const orbs = layer.querySelectorAll('[data-sr-orb]');
            for (const orb of orbs) {
              const i = parseInt(orb.dataset.srOrb, 10) || 0;
              const d = ((prog - i * LAG) % 1 + 1) % 1;
              orb.style.offsetDistance = (d * 100).toFixed(2) + '%';
            }
          }, { s: sel, prog, LAG });
        });
        // EXIT: fade orbs + ring + layer on a real later tick (anti-pop), then clean.
        await safeEval(({ s, EXIT }) => {
          const el = document.querySelector(s);
          if (!el) return;
          const layer = el.querySelector('[data-sr-orbit-layer]');
          if (!layer) return;
          const orbs = layer.querySelectorAll('[data-sr-orb]');
          for (const orb of orbs) { orb.style.transition = 'opacity ' + (EXIT / 1000) + 's cubic-bezier(.4,0,.2,1)'; }
          requestAnimationFrame(() => {
            layer.style.opacity = '0';
            for (const orb of orbs) orb.style.opacity = '0';
          });
        }, { s: sel, EXIT });
        await clock.wait(ms(EXIT + 80), true);
        await safeEval((s) => {
          const el = document.querySelector(s);
          if (!el) return;
          const layer = el.querySelector('[data-sr-orbit-layer]');
          if (layer) layer.remove();
          delete el.dataset.srOrbiting;
          if (el.dataset.srPosPatched) { el.style.position = ''; delete el.dataset.srPosPatched; }
        }, sel);
      };
  const applyKenburns = async (sel, opts) => {
      const o = (opts && typeof opts === 'object') ? opts : {};
      const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
      const DUR = ms(clamp(o.duration, 600, 8000, 2500));
      const ZOOM = 1 + (clamp(o.scale, 0.3, 3, 1) * 0.06); // default 1.06; scale multiplies the 6% push
      const setup = await safeEval(({ s, durMs, acc, ZOOM }) => {
        const el = document.querySelector(s);
        if (!el) return null;
        if (el.dataset.srKenburns) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return null;
        el.dataset.srKenburns = '1';
        el.dataset.srKbT = el.style.transform || '';
        el.dataset.srKbTr = el.style.transition || '';
        el.dataset.srKbWc = el.style.willChange || '';
        el.dataset.srKbTo = el.style.transformOrigin || '';
        el.dataset.srKbPos = el.style.position || '';
        // DESIGN SYSTEM: surface luminance -> dark/light, scene accent.
        const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
        let bg = cs.backgroundColor, p = el;
        while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
        const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
        const accent = acc || '#16a34a';
        const HAIR = dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)';
        const GLOW = dark ? '0 0 16px 2px ' + accent : '0 6px 18px ' + accent + '55';
        const INSET = dark ? 'inset 0 0 0 1px rgba(255,255,255,.10),inset 0 24px 60px rgba(0,0,0,.34)'
                           : 'inset 0 0 0 1px rgba(15,23,42,.06),inset 0 24px 60px rgba(15,23,42,.14)';
        // base pose — NO transition (clock.motion drives the transform tick by tick).
        el.style.transformOrigin = '50% 45%';
        el.style.willChange = 'transform';
        el.style.transition = 'none';
        el.style.transform = (el.dataset.srKbT ? el.dataset.srKbT + ' ' : '') + 'scale(1) translate(0px,0px)';
        if (cs.position === 'static') { el.style.position = 'relative'; }
        // GLASS VIEWFINDER child — fades IN on its own transition (anti-pop).
        const radius = Math.round(parseFloat(cs.borderRadius) || 16);
        const view = document.createElement('div');
        view.className = '__sr_mask__';
        view.dataset.srFor = s;
        view.dataset.srKbView = '1';
        view.style.cssText = 'position:absolute;inset:0;z-index:2147483600;pointer-events:none;'
          + 'border-radius:' + radius + 'px;border:1px solid ' + HAIR + ';'
          + 'box-shadow:' + GLOW + ',' + INSET + ';opacity:0;'
          + 'transition:opacity ' + (durMs * 0.3 / 1000).toFixed(2) + 's cubic-bezier(.18,.7,.3,1);';
        el.appendChild(view);
        requestAnimationFrame(() => { view.style.opacity = '1'; });
        return { dx: -Math.min(10, r.width * 0.012), dy: -Math.min(8, r.height * 0.012) };
      }, { s: sel, durMs: DUR, acc: accent || '', ZOOM });
      if (!setup) { await clock.wait(DUR, true); return; }
      const { dx, dy } = setup;
      // DRIFT: set the transform each tick (virtual-clock native, can't snap).
      // easeInOut for a smooth cinematic accel/decel into the held end pose.
      await clock.motion(DUR, async (k) => {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        await safeEval(({ s, e, ZOOM, dx, dy }) => {
          const el = document.querySelector(s);
          if (!el || !el.dataset.srKenburns) return;
          const sc = 1 + (ZOOM - 1) * e;
          el.style.transform = (el.dataset.srKbT ? el.dataset.srKbT + ' ' : '') + 'scale(' + sc.toFixed(4) + ') translate(' + (dx * e).toFixed(2) + 'px,' + (dy * e).toFixed(2) + 'px)';
        }, { s: sel, e, ZOOM, dx, dy });
      });
      // EXIT: ease back to base on a short transition (anti-pop), fade viewfinder.
      await safeEval((s) => {
        const el = document.querySelector(s);
        if (!el || !el.dataset.srKenburns) return;
        el.style.transition = 'transform .4s cubic-bezier(.4,0,.2,1)';
        el.style.transform = (el.dataset.srKbT ? el.dataset.srKbT + ' ' : '') + 'scale(1) translate(0px,0px)';
        const view = el.querySelector('[data-sr-kb-view]');
        if (view) { view.style.transition = 'opacity .4s cubic-bezier(.4,0,.2,1)'; requestAnimationFrame(() => { view.style.opacity = '0'; }); }
      }, sel);
      await clock.wait(ms(420), true);
      await safeEval((s) => {
        const el = document.querySelector(s);
        if (!el || !el.dataset.srKenburns) return;
        const view = el.querySelector('[data-sr-kb-view]');
        if (view) view.remove();
        el.style.transform = el.dataset.srKbT;
        el.style.transition = el.dataset.srKbTr;
        el.style.willChange = el.dataset.srKbWc;
        el.style.transformOrigin = el.dataset.srKbTo;
        el.style.position = el.dataset.srKbPos;
        delete el.dataset.srKenburns; delete el.dataset.srKbT; delete el.dataset.srKbTr;
        delete el.dataset.srKbWc; delete el.dataset.srKbTo; delete el.dataset.srKbPos;
      }, sel);
    };
const applyFlash = async (color, opts) => {
      const o = (opts && typeof opts === 'object') ? opts : {};
      const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
      // duration = whole flash life (rise + hold + fade), default 560. scale n/a.
      // count n/a. intensity = PEAK OPACITY multiplier (default 1 -> base peak).
      const DUR = clamp(o.duration, 200, 8000, 560);
      const INT = clamp(o.intensity, 0.2, 2, 1);
      await safeEval(({ col, acc, DUR, INT }) => {
        const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
        let bg = getComputedStyle(document.body).backgroundColor, p = document.body;
        while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
        const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
        const accent = col || acc || '#16a34a';
        // phases track the chosen duration: rise into peak, then fade out so the
        // whole flash finishes within DUR (not lingering into the next step).
        const rise = DUR * 0.42, fade = DUR * 0.5, fadeAt = DUR * 0.46;
        // PEAK opacity = base surface peak * intensity, clamped so a loud knob can't
        // wash the frame to solid and a soft one still reads.
        const basePeak = dark ? 0.62 : 0.5;
        const peak = Math.max(0.08, Math.min(0.95, basePeak * INT));
        const layer = document.createElement('div');
        layer.className = '__sr_flash__';
        layer.style.cssText = 'position:fixed;inset:0;z-index:2147483645;pointer-events:none;opacity:0;'
          + 'mix-blend-mode:' + (dark ? 'screen' : 'multiply') + ';'
          + 'transition:opacity ' + (rise / 1000).toFixed(3) + 's cubic-bezier(.18,.7,.3,1);';
        const bloom = document.createElement('div');
        bloom.style.cssText = 'position:absolute;inset:0;'
          + 'background:radial-gradient(120% 120% at 50% 46%,' + accent + ' 0%,' + accent + '88 26%,transparent 62%);'
          + 'transform:scale(.82);transform-origin:50% 46%;'
          + 'transition:transform ' + (rise / 1000).toFixed(3) + 's cubic-bezier(.34,1.56,.64,1);';
        const ring = document.createElement('div');
        ring.style.cssText = 'position:absolute;inset:0;'
          + 'box-shadow:inset 0 0 140px 30px ' + accent + (dark ? 'cc' : '99') + ',inset 0 0 0 2.5px ' + accent + (dark ? '99' : '66') + ';';
        layer.appendChild(bloom); layer.appendChild(ring);
        document.documentElement.appendChild(layer);
        void layer.offsetWidth;
        // PEAK on its own frame (pulse-bug guard): paint visible, defer the fade.
        // enter ON a fade (anti-pop) so it never pops from opacity 0 to peak.
        requestAnimationFrame(() => {
          layer.style.opacity = String(peak);
          bloom.style.transform = 'scale(1.06)';
        });
        // the fade MUST be a later real tick — setting opacity peak then 0 in the
        // same frame collapses the transition. exit ALSO on a fade (anti-pop).
        setTimeout(() => {
          layer.style.transition = 'opacity ' + (fade / 1000).toFixed(3) + 's ease';
          layer.style.opacity = '0';
        }, fadeAt);
        setTimeout(() => layer.remove(), DUR + 80);
      }, { col: color || '', acc: accent || '', DUR, INT });
      // host life tracks the chosen duration so the full flash (rise + peak + exit
      // fade) is captured, not cut nor left lingering into the next step.
      await clock.wait(ms(DUR), true);
    };
  const applyProgress = async (sel, color, opts) => {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
        // duration = fill animation length (default 1100). scale = size multiplier
        // of the proportional rail (default 1). count/intensity n/a for a bar.
        const DUR = clamp(o.duration, 200, 8000, 1100);
        const SC = clamp(o.scale, 0.3, 3, 1);
        await safeEval(({ s, col, SC, DUR }) => {
          const el = document.querySelector(s);
          if (!el) return;
          if (el.dataset.srProgress) return;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return;
          el.dataset.srProgress = '1';
          // Element-anchored: attach as a CHILD so the rail inherits the element box
          // and any ancestor camera transform (a body-level div diverges under zoom).
          if (cs.position === 'static') { el.style.position = 'relative'; el.dataset.srProgPatched = '1'; }
          // surface luminance: prefer the element's own bg, else walk up.
          const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
          let bg = cs.backgroundColor, p = el;
          while ((!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && p.parentElement) { p = p.parentElement; bg = getComputedStyle(p).backgroundColor; }
          const dark = lum(bg || 'rgb(10,15,30)') < 0.5;
          const accent = col || (dark ? 'rgb(74,222,128)' : 'rgb(22,163,74)');
          // PROPORTIONAL SIZING — every key dimension DERIVES from the target box,
          // then clamps so a 28px chip still reads and a 1024px table does not get a
          // chunky bar. scale (default 1) multiplies the proportional base.
          const sc = SC;
          const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
          const shortSide = Math.min(r.width, r.height);
          // rail thickness ~ 14% of the box's short side; floor 4px (tiny stays
          // visible), ceil 16px (wide/tall does not balloon). scale grows it.
          const H = clampN(shortSide * 0.14 * sc, 4, 16 * sc);
          // side inset ~ 7% of width so margins track the box; floor 5px, ceil 22px.
          const INS = clampN(r.width * 0.07, 5, 22);
          // bottom gap ~ 0.55x the thickness, clamped — keeps the pill tucked just
          // inside the lower edge regardless of box height.
          const BOT = clampN(H * 0.55, 4, 14);
          const RAD = H + 6; // fully rounded pill
          // DESIGN SYSTEM tokens — the rail is a GLASS pill, not a flat fill.
          const GLASS = dark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.82)';
          // blur scales gently with thickness so big rails read as deeper glass.
          const BL = clampN(H * 1.4, 9, 18);
          const BLUR = 'backdrop-filter:blur(' + BL + 'px) saturate(140%);-webkit-backdrop-filter:blur(' + BL + 'px) saturate(140%)';
          const HAIR = dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(15,23,42,0.10)';
          const SHADOW = '0 ' + (H * 1.1).toFixed(1) + 'px ' + (H * 3.3).toFixed(1) + 'px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.16)';
          const GLOW = dark ? '0 0 ' + (H * 1.8).toFixed(1) + 'px 2px ' + accent : '0 6px 18px ' + accent + '55';
          const TRACK = dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';
          const SHEEN = dark ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.9)';
          // fill + sheen transition length tracks the chosen DUR (in seconds) so the
          // fill speed is tunable, not hardcoded at 1.1s.
          const FS = (DUR / 1000).toFixed(3);
          const rail = document.createElement('div');
          rail.className = '__sr_mask__';
          rail.dataset.srFor = s;
          // glass track pill resting just inside the bottom edge; radius pill, soft
          // shadow + hairline so it reads as a surface, not a painted line. Enters with
          // a brief rise + settle on the entrance ease. Dimensions are proportional.
          rail.style.cssText = 'position:absolute;left:' + INS + 'px;right:' + INS + 'px;bottom:' + BOT + 'px;height:' + H + 'px;z-index:2147483600;'
            + 'border-radius:' + RAD + 'px;overflow:hidden;pointer-events:none;opacity:0;transform:translateY(4px) scaleX(.94);transform-origin:center;'
            + 'background:' + GLASS + ';border:' + HAIR + ';box-shadow:' + SHADOW + ';' + BLUR + ';'
            + 'transition:opacity .6s cubic-bezier(.18,.7,.3,1),transform .6s cubic-bezier(.18,.7,.3,1);';
          // a tinted track groove inside the glass so the unfilled portion reads.
          const groove = document.createElement('div');
          groove.style.cssText = 'position:absolute;inset:0;border-radius:' + RAD + 'px;background:' + TRACK + ';';
          // accent fill = scene color, solid + accent glow per the system. It fills
          // 0->100% on the entrance ease (transform-only, 60fps) over DUR.
          const fill = document.createElement('div');
          fill.style.cssText = 'position:absolute;inset:0;border-radius:' + RAD + 'px;background:' + accent + ';'
            + 'box-shadow:' + GLOW + ';transform:scaleX(0);transform-origin:left center;'
            + 'transition:transform ' + FS + 's cubic-bezier(.18,.7,.3,1);';
          // a travelling sheen riding the leading edge — premium, opacity/transform only.
          const sheen = document.createElement('div');
          sheen.style.cssText = 'position:absolute;top:0;bottom:0;width:40%;left:-40%;'
            + 'background:linear-gradient(90deg,transparent,' + SHEEN + ',transparent);opacity:0;'
            + 'transition:left ' + FS + 's cubic-bezier(.18,.7,.3,1),opacity .4s ease;';
          fill.appendChild(sheen);
          rail.appendChild(groove);
          rail.appendChild(fill);
          el.appendChild(rail);
          // PULSE-BUG GUARD: paint the hidden state, THEN on the next frame trigger
          // the entrance — never set opacity 0 and 1 in the same frame.
          requestAnimationFrame(() => { requestAnimationFrame(() => {
            rail.style.opacity = '1'; rail.style.transform = 'translateY(0) scaleX(1)';
            fill.style.transform = 'scaleX(1)';
            sheen.style.opacity = '1'; sheen.style.left = '100%';
          }); });
        }, { s: sel, col: color || '', SC, DUR });
        // host life tracks the chosen fill duration (+ entrance settle) so the full
        // fill + brim is captured, not cut nor left lingering into the next step.
        await clock.wait(ms(DUR + 350), true);
        // self-clean + self-restore: fade the rail out on its own frame, then remove
        // and revert the position patch so the element is left exactly as found.
        await safeEval((s) => {
          const el = document.querySelector(s);
          if (!el) return;
          const rail = el.querySelector('.__sr_mask__[data-sr-for="' + s + '"]');
          if (rail) {
            rail.style.opacity = '0'; rail.style.transform = 'translateY(4px) scaleX(.94)';
            setTimeout(() => {
              rail.remove();
              if (el.dataset.srProgPatched) { el.style.position = ''; delete el.dataset.srProgPatched; }
              delete el.dataset.srProgress;
            }, 380);
          }
        }, sel);
        await clock.wait(ms(420), true);
      };
  const applyCountdown = async (arg, sel, opts) => {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
        // BUG FIX + DINAMICIDADE:
        //   count    = the seconds N (the number it counts down FROM). default 3.
        //   duration = the per-digit STEP in ms (each number's on-screen beat). default 900.
        //   scale    = disc size multiplier. default 1.
        //   intensity n/a here.
        // arg back-compat: number => seconds; {n,sel,accent,scale}. opts.count wins over arg.n.
        const argN = typeof arg === 'number' ? arg
          : (arg && typeof arg === 'object' && typeof arg.n === 'number' ? arg.n : null);
        const N = Math.round(clamp(o.count != null ? o.count : argN, 1, 20, 3)); // seconds, sub-clamped 1..20 for legibility
        const STEP = ms(clamp(o.duration, 200, 8000, 900));                      // per-digit beat
        const selector = sel || (arg && typeof arg === 'object' ? arg.sel : null) || null;
        const col = (arg && typeof arg === 'object' && arg.accent) ? arg.accent : (accent || '#16a34a');
        const scaleArg = clamp(o.scale, 0.3, 3, (arg && typeof arg === 'object' && typeof arg.scale === 'number' && arg.scale > 0) ? arg.scale : 1);
        await safeEval(({ N, STEP, selector, col, scaleArg }) => {
          const accent = col || '#16a34a';
          const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
          const SC = Math.max(0.3, Math.min(3, scaleArg || 1));
          let cx = innerWidth / 2, cy = innerHeight / 2;
          // SIZE IS PROPORTIONAL. Anchored to a selector: the disc derives from the
          // target box (a fraction of its short side, plus a sliver of the long
          // side so a wide-but-thin band still reads at its scale) — clamped to a
          // readability floor so a 28px icon still shows a legible digit, and a
          // ceiling so a huge card does not explode. Free-floating (no selector or
          // unresolved): viewport-proportional off the short viewport side — a
          // centered countdown is not tied to one element, so that is legitimate.
          const vmin = Math.min(innerWidth, innerHeight);
          let SZ;
          const el = selector ? document.querySelector(selector) : null;
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width && r.height) {
              cx = r.left + r.width / 2; cy = r.top + r.height / 2;
              const short = Math.min(r.width, r.height);
              const long = Math.max(r.width, r.height);
              const base = short * 0.92 + long * 0.06;
              SZ = Math.max(56, Math.min(0.52 * vmin, base));
            } else { SZ = vmin * 0.22; }
          } else { SZ = vmin * 0.22; }
          SZ = Math.max(48, Math.min(0.6 * vmin, SZ * SC));
          const R = SZ * 0.455, C = 2 * Math.PI * R;
          const fontPx = Math.round(SZ * 0.48);
          const strokeW = Math.max(2, SZ * 0.019);
          const blurPx = Math.max(6, SZ * 0.1);
          let bg = '', p = el || document.body;
          while (p) { const b = getComputedStyle(p).backgroundColor; if (b && b !== 'transparent' && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(b)) { bg = b; break; } p = p.parentElement; }
          const dark = lum(bg || (document.body ? getComputedStyle(document.body).backgroundColor : '')) < 0.5;
          const glass = dark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.82)';
          const hair = dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)';
          const shadow = '0 10px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.16)';
          const glow = dark ? '0 0 16px 2px ' + accent : '0 6px 18px ' + accent + '55';
          const ink = dark ? '#f8fafc' : '#0f172a';
          const track = dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';
          const POP = 'cubic-bezier(.34,1.56,.64,1)', ENTER = 'cubic-bezier(.18,.7,.3,1)';
          const layer = document.createElement('div');
          layer.className = '__sr_countdown__';
          layer.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;';
          document.documentElement.appendChild(layer);
          // arc transition tracks the chosen STEP so the sweep fills exactly one beat.
          const arcDur = Math.max(0.12, (STEP - 120) / 1000);
          for (let i = 0; i < N; i++) {
            const val = N - i;
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:absolute;left:' + cx + 'px;top:' + cy + 'px;width:' + SZ + 'px;height:' + SZ + 'px;'
              + 'opacity:0;transform:translate(-50%,-50%) scale(.5);transform-origin:center;'
              + 'transition:opacity .3s ' + ENTER + ',transform .6s ' + POP + ';';
            const disc = document.createElement('div');
            disc.style.cssText = 'position:absolute;inset:0;border-radius:999px;'
              + 'background:' + glass + ';backdrop-filter:blur(' + blurPx + 'px) saturate(140%);-webkit-backdrop-filter:blur(' + blurPx + 'px) saturate(140%);'
              + 'border:1px solid ' + hair + ';box-shadow:' + shadow + ',' + glow + ';'
              + 'display:flex;align-items:center;justify-content:center;'
              + 'color:' + ink + ';font:800 ' + fontPx + 'px/1 system-ui;letter-spacing:-.02em;';
            disc.textContent = String(val);
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 ' + SZ + ' ' + SZ);
            svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);mix-blend-mode:' + (dark ? 'screen' : 'multiply') + ';';
            const mk = (strokeCol, dash) => { const a = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); a.setAttribute('cx', SZ / 2); a.setAttribute('cy', SZ / 2); a.setAttribute('r', R); a.setAttribute('fill', 'none'); a.setAttribute('stroke', strokeCol); a.setAttribute('stroke-width', String(strokeW)); a.setAttribute('stroke-linecap', 'round'); if (dash != null) { a.setAttribute('stroke-dasharray', C); a.setAttribute('stroke-dashoffset', dash); } return a; };
            svg.appendChild(mk(track, null));
            const arc = mk(accent, C);
            arc.style.transition = 'stroke-dashoffset ' + arcDur + 's linear';
            svg.appendChild(arc);
            wrap.appendChild(svg); wrap.appendChild(disc);
            layer.appendChild(wrap);
            const t0 = i * STEP;
            setTimeout(() => {
              // paint the visible enter state, then sweep the arc on a later frame
              // (pulse-bug guard — never the visible+target write in one frame).
              wrap.style.opacity = '1'; wrap.style.transform = 'translate(-50%,-50%) scale(1)';
              requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = '0'; }));
            }, t0);
            // exit fade also on its own later tick (anti-pop); proportional to STEP
            // so a short beat still gets a visible out, a long one is not abrupt.
            const out = Math.max(120, Math.min(STEP * 0.4, 260));
            setTimeout(() => {
              wrap.style.transition = 'opacity ' + (out / 1000) + 's ease-in,transform ' + ((out + 80) / 1000) + 's cubic-bezier(.4,0,1,1)';
              wrap.style.opacity = '0';
              wrap.style.transform = 'translate(-50%,-50%) scale(1.22)';
            }, t0 + STEP - out);
          }
          setTimeout(() => layer.remove(), N * STEP + 240);
        }, { N, STEP, selector, col, scaleArg });
        // host life tracks N beats so the whole run (every digit's enter + arc +
        // exit fade) is captured, not cut short nor lingering into the next step.
        await clock.wait(N * STEP + ms(180), true);
      };
  const applyTrail = async (from, to, color, opts) => {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const clamp = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : d;
        // duration = travel time (default 760). count = tail dots (default 12).
        // scale = size multiplier (default 1). intensity = glow/spread strength (default 1).
        const DUR = clamp(o.duration, 200, 8000, 760);
        const N = Math.round(clamp(o.count, 1, 60, 12));
        const SC = clamp(o.scale, 0.3, 3, 1);
        const INT = clamp(o.intensity, 0.2, 2, 1);
        const STAG = Math.round(clamp(DUR * 0.04, 12, 60, 30)); // per-dot stagger tracks travel
        // total on-screen life: last dot launch + travel + landing ring pop + hold/fade.
        const LIFE = (N - 1) * STAG + DUR + 700;
        await safeEval(({ from, to, col, DUR, N, SC, INT, STAG }) => {
          const a = document.querySelector(from), b = document.querySelector(to || from);
          if (!a || !b) return;
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          const x0 = ra.left + ra.width / 2, y0 = ra.top + ra.height / 2;
          const x1 = rb.left + rb.width / 2, y1 = rb.top + rb.height / 2;
          const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
          const lum = (c) => { const m = c && c.match(/\d+/g); return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255 : 0.1; };
          let bg = 'rgb(11,19,34)', probe = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
          for (let p = probe; p; p = p.parentElement) {
            const c = getComputedStyle(p).backgroundColor;
            if (c && c !== 'transparent' && !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(c)) { bg = c; break; }
          }
          const dark = lum(bg) < 0.5;
          const accent = col || '#16a34a';
          // PROPORTIONAL SIZING — the trail is a comet that lands ON the
          // destination box (the `to` element, or `from` when solo). Its head,
          // tail dots, and landing ring all derive from that box's smaller side
          // so the effect is right-sized for a 28px icon and a 332px card alike.
          // The landing ring is sized to HUG the box (a fraction of its diagonal),
          // clamped so it neither vanishes on a chip nor swallows a wide card.
          const dx = x1 - x0, dy = y1 - y0;
          const minSide = Math.min(rb.width, rb.height);   // governs head + dots
          const diag = Math.hypot(rb.width, rb.height);     // governs landing ring
          // head puck: ~70% of the destination's short side, clamped so it reads
          // small but never dwarfs a thin chip nor balloons on a big card.
          const headSz = Math.round(cl(minSide * 0.7, 14, 40) * SC);
          const coreSz = Math.round(headSz * 0.38);
          // tail dots: a hair smaller than the head, growing toward the front.
          const dotMax = cl(headSz * 0.62, 6, 18);
          const dotMin = cl(dotMax * 0.5, 3, 11);
          // landing ring: hugs the box — half its diagonal, padded, clamped so a
          // tiny target still gets a visible ring and a wide card isn't ringed by
          // a monster. min(diag*0.62, longest side + pad) keeps wide boxes sane.
          const ringD = Math.round(cl(Math.min(diag * 0.62, Math.max(rb.width, rb.height) * 0.85 + 24), headSz * 1.4, 240) * SC);
          const ringR = ringD / 2;
          const ringStroke = cl(ringD * 0.07, 2, 5);
          // glow radius tracks the head AND intensity so a punchy trail blooms harder.
          const glowR = Math.round(cl(headSz * 0.55, 8, 22) * INT);
          const GLASS = dark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.82)';
          const HAIR = dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(15,23,42,0.10)';
          const SHADOW = '0 10px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.16)';
          const BLUR = 'backdrop-filter:blur(13px) saturate(140%);-webkit-backdrop-filter:blur(13px) saturate(140%)';
          const GLOW = dark ? '0 0 ' + glowR + 'px 2px ' + accent : '0 6px ' + (glowR + 4) + 'px ' + accent + '55';
          const BLEND = dark ? 'screen' : 'multiply';
          const EASE = 'cubic-bezier(.18,.7,.3,1)';   // entrance
          const POP = 'cubic-bezier(.34,1.56,.64,1)';  // overshoot
          const layer = document.createElement('div');
          layer.className = '__sr_trail__';
          layer.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;overflow:hidden;';
          document.documentElement.appendChild(layer);
          // Trailing accent dots: soft glow, blend with surface (mirror applyHighlight),
          // no hard rim. They fade as the head pulls ahead — a comet tail in the accent.
          // Dot count is knob-driven (N); a 1-dot trail is just the head's wake.
          const denom = N > 1 ? (N - 1) : 1;
          for (let i = 0; i < N; i++) {
            const t = i / denom;
            const sz = Math.round(dotMin + t * (dotMax - dotMin));
            // intensity lifts the tail opacity so a punchy comet leaves a brighter wake.
            const op = cl((0.16 + t * 0.5) * INT, 0.08, 0.95);
            const dotGlow = Math.max(4, Math.round(sz * 0.9 * INT));
            const d = document.createElement('div');
            d.style.cssText = 'position:absolute;left:' + x0 + 'px;top:' + y0 + 'px;width:' + sz + 'px;height:' + sz + 'px;'
              + 'margin-left:' + (-sz / 2) + 'px;margin-top:' + (-sz / 2) + 'px;border-radius:999px;'
              + 'background:radial-gradient(circle at 50% 50%,' + accent + ',' + accent + '00 70%);'
              + 'mix-blend-mode:' + BLEND + ';box-shadow:0 0 ' + dotGlow + 'px 1px ' + accent + ';'
              + 'opacity:0;transform:translate(0,0);'
              + 'transition:transform ' + DUR + 'ms ' + EASE + ' ' + (i * STAG) + 'ms,opacity ' + DUR + 'ms ease ' + (i * STAG) + 'ms;';
            layer.appendChild(d);
            void d.offsetWidth;                       // paint start pose, then animate
            d.style.opacity = String(op);
            d.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px)';
            setTimeout(() => { d.style.opacity = '0'; }, i * STAG + DUR * 0.5);
          }
          // Head: a glass puck with an accent core + glow — the cursor leading the
          // trail. Size + core + glow now scale with the destination box.
          const head = document.createElement('div');
          head.style.cssText = 'position:absolute;left:' + x0 + 'px;top:' + y0 + 'px;width:' + headSz + 'px;height:' + headSz + 'px;'
            + 'margin-left:' + (-headSz / 2) + 'px;margin-top:' + (-headSz / 2) + 'px;border-radius:999px;'
            + 'background:' + GLASS + ';' + BLUR + ';border:' + HAIR + ';box-shadow:' + SHADOW + ',' + GLOW + ';'
            + 'display:flex;align-items:center;justify-content:center;'
            + 'opacity:0;transform:translate(0,0) scale(.6);'
            + 'transition:transform ' + DUR + 'ms ' + EASE + ',opacity 220ms ease;';
          const core = document.createElement('div');
          core.style.cssText = 'width:' + coreSz + 'px;height:' + coreSz + 'px;border-radius:999px;background:' + accent + ';box-shadow:0 0 ' + glowR + 'px 1px ' + accent + ';';
          head.appendChild(core);
          layer.appendChild(head);
          void head.offsetWidth;
          // anti-pop: head fades IN (opacity 0 painted above on its own frame) as it travels.
          head.style.opacity = '1';
          head.style.transform = 'translate(' + Math.round(dx) + 'px,' + Math.round(dy) + 'px) scale(1)';
          // Landing: an accent ring that overshoots open at the destination, DS
          // glow. Diameter + stroke now hug the destination box (ringD/ringStroke).
          const ring = document.createElement('div');
          ring.style.cssText = 'position:absolute;left:' + x1 + 'px;top:' + y1 + 'px;width:' + ringD + 'px;height:' + ringD + 'px;margin:' + (-ringR) + 'px 0 0 ' + (-ringR) + 'px;'
            + 'border-radius:999px;border:' + ringStroke + 'px solid ' + accent + ';box-shadow:' + GLOW + ';'
            + 'opacity:0;transform:scale(.3);transform-origin:center;'
            + 'transition:transform .5s ' + POP + ',opacity .5s ease;';
          layer.appendChild(ring);
          const land = (N - 1) * STAG + DUR - 140;
          setTimeout(() => {
            // pulse-bug guard: paint the visible state on its OWN frame.
            void ring.offsetWidth;
            ring.style.opacity = dark ? '.95' : '.8';
            ring.style.transform = 'scale(1)';
            // the fade-to-0 MUST be a later real tick — never opacity-in and -out
            // on the same frame. exit ALSO on a fade (anti-pop).
            setTimeout(() => { ring.style.opacity = '0'; ring.style.transform = 'scale(1.45)'; head.style.opacity = '0'; head.style.transform += ' scale(.7)'; }, 320);
          }, land);
          setTimeout(() => layer.remove(), land + 700);
        }, { from, to, col: color || '', DUR, N, SC, INT, STAG });
        // host life tracks the chosen duration so the comet's full flight, landing
        // and exit fade are captured — not cut short nor lingering into the next step.
        await clock.wait(ms(LIFE), true);
      };


  return { showAnnotations, clearAnnotations, applyBlur, applyHide, applyRedact, applyHighlight, clearMasks, applyConfetti, applyCountup, applySparkline, applyPulse, applyRipple, applyShake, applyGlow, applyCheckmark, applyTypeon, applyReveal, applyOrbit, applyKenburns, applyFlash, applyProgress, applyCountdown, applyTrail };
}
