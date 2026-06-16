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
        if (modal.backdrop) add('left:0;top:0;width:100%;height:100%;background:rgba(12,27,45,.45)', null, 1);
        const cardHtml =
          (modal.title ? '<div style="color:' + T.modalTitle + ';font:700 24px system-ui;margin-bottom:10px">' + String(modal.title).replace(/[<>&]/g, '') + '</div>' : '') +
          '<div style="color:' + T.modalText + ';font:400 18px/1.55 system-ui">' + String(modal.text || '').replace(/[<>&]/g, '') + '</div>';
        const cardCss = (max) => 'max-width:' + max + 'px;width:calc(100% - 80px);' +
          'background:' + T.modalBg + ';border:1px solid ' + GREEN + ';border-radius:14px;padding:24px 28px;' +
          'box-shadow:0 12px 40px rgba(0,0,0,.5)';
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
      // pulling the eye to one element. A transparent box at the target rect
      // with a viewport-spanning box-shadow spread paints the dim everywhere
      // but the hole; a faint accent ring traces the lit edge. Sits at the
      // backdrop level (z=1) so markers/notes still read on top of it.
      const drawSpotlight = (b, pad) => {
        const p = pad != null ? pad : 10;
        add('left:' + (b.x - p) + 'px;top:' + (b.y - p) + 'px;width:' + (b.w + p * 2) + 'px;height:' + (b.h + p * 2) + 'px;' +
          'border-radius:10px;box-shadow:0 0 0 9999px ' + (T.spotlight || 'rgba(8,14,28,.62)') + ',inset 0 0 0 1px ' + GREEN + '55', null, 1);
      };
      const drawCircle = (b) => {
        // a +10 ellipse passes INSIDE the corners of wide flat boxes and cuts
        // the target's own caption — over-axis it so the stroke clears them.
        const rx = (b.w / 2) * 1.12 + 12, ry = (b.h / 2) * 1.35 + 12;
        add('left:' + (b.x + b.w / 2 - rx) + 'px;top:' + (b.y + b.h / 2 - ry) + 'px;width:' + rx * 2 + 'px;height:' + ry * 2 + 'px;' +
          'border:3px solid ' + GREEN + ';border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.35)');
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
          'background:' + GREEN + ';border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);' +
          'color:#fff;font:700 16px system-ui;display:flex;align-items:center;justify-content:center', label, 4);
        if (delay != null) {
          d.style.opacity = '0';
          d.style.transition = 'opacity .45s ease';
          setTimeout(() => { d.style.opacity = '1'; }, delay);
        }
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
          ? '<div style="color:' + T.modalTitle + ';font:700 16px system-ui;margin:2px 0 8px">' + String(gOpt.title).replace(/[<>&]/g, '') + '</div>'
          : '') + rows.map((g) =>
          '<div data-gd="' + g.delay + '" style="display:flex;gap:10px;align-items:flex-start;margin:9px 0;opacity:0;transition:opacity .45s ease">' +
          '<span style="flex:0 0 auto;min-width:22px;height:22px;border-radius:11px;background:' + GREEN + ';border:2px solid #fff;' +
          'color:#fff;font:700 12px/18px system-ui;text-align:center;padding:0 4px">' + g.n + '</span>' +
          '<span style="color:' + T.modalText + ';font:400 15px/1.45 system-ui">' + g.t + '</span></div>').join('');
        const gw = gOpt.width || 320;
        const panel = add('left:-9999px;top:0;width:' + gw + 'px;background:' + T.modalBg + ';border:1px solid ' + GREEN + ';' +
          'border-radius:14px;padding:14px 18px;box-shadow:0 12px 40px rgba(0,0,0,.5)', rowsHtml, 6);
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
          setTimeout(() => { row.style.opacity = '1'; }, +row.getAttribute('data-gd'));
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
            'box-shadow:0 14px 44px rgba(0,0,0,.55);overflow:hidden', null, 7);
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
        const noteW = Math.min(W - 32, Math.max(120, Math.round(txt.length * 10) + 24));
        const noteH = 40;
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
        add('left:' + noteX + 'px;top:' + noteY + 'px;background:' + DARK + ';color:' + T.ink + ';font:600 18px system-ui;' +
          'padding:8px 12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.4)',
          txt, 6);
        // a rescued note may land far from its anchor — a label without a
        // visible tie is forbidden, so distance forces a leader even when the
        // caller didn't ask for an arrow.
        const far = noteX + noteW < box.x - 60 || noteX > box.x + box.w + 60 ||
          noteY + noteH < box.y - 60 || noteY > box.y + box.h + 60;
        if (step.arrow && vertical) {
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
        el.style.transition = (el.style.transition ? el.style.transition + ',' : '') + 'filter .45s ease';
        requestAnimationFrame(() => { el.style.filter = 'blur(8px)'; });
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

  return { showAnnotations, clearAnnotations, applyBlur, applyHide };
}
