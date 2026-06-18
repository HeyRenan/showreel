// rec-live.mjs — live element engine.
//
// Two halves. The PURE half (this file, below) owns the registry: which live
// elements exist, how an op resolves to a target, and how an op mutates an
// element's plain state descriptor. No DOM — fully unit-testable in Node.
//
// The BROWSER glue (makeLive, added alongside in a later phase) does the DOM
// work — it calls these to decide WHAT to render, then renders it on the page.
//
// A live element entry: { id, type, root?, state }.
//   state for a list-like element (glossary/marks): { rows: [...], color? }
//   state for a scalar element (progress):          { value, color }
// The registry survives between safeEval calls because the glue mirrors it onto
// window.__live; this pure module is the host-side source of truth for control
// flow (resolve/ambiguity), kept testable without a page.

export function newRegistry() {
  return { byId: Object.create(null), order: [] };
}

// Register (or replace) a live element. Re-registering an existing id updates in
// place and does NOT duplicate the order list.
export function registerLive(reg, entry) {
  if (!reg.byId[entry.id]) reg.order.push(entry.id);
  reg.byId[entry.id] = entry;
  return entry;
}

// Resolve an op to its target element. Returns { target, id?, reason }:
//   - explicit id present -> that element, or null + reason if unknown
//   - no id, exactly one live element -> that one (the common concise case)
//   - no id, zero or many -> null + reason (caller logs a no-op, never crashes)
export function resolveTarget(reg, op) {
  const id = op && typeof op.id === 'string' && op.id ? op.id : null;
  if (id) {
    const t = reg.byId[id] || null;
    return { target: t, id, reason: t ? null : 'no live element id "' + id + '"' };
  }
  if (reg.order.length === 1) {
    const only = reg.order[0];
    return { target: reg.byId[only], id: only, reason: null };
  }
  if (reg.order.length === 0) return { target: null, reason: 'no live element on screen' };
  return { target: null, reason: 'ambiguous: ' + reg.order.length + ' live elements — pass an id' };
}

// Mutate entry.state in place for ONE op. Out-of-range item, missing op, and
// hostile shapes are no-ops — this never throws (the engine's mid-render
// contract). `update` with an `item` edits that 1-based row; without an `item`
// it merges scalar fields into state (a progress value/color bump).
export function applyState(entry, op) {
  if (!entry || !op || typeof op !== 'object') return entry;
  const st = entry.state || (entry.state = {});
  const rows = Array.isArray(st.rows) ? st.rows : null;
  const rowAt = (item) => (rows && Number.isInteger(item) && item >= 1 && item <= rows.length) ? rows[item - 1] : null;

  if (op.append && typeof op.append === 'object') {
    st.rows = rows || [];
    st.rows.push({ ...op.append });
  } else if (op.update && typeof op.update === 'object') {
    // update edits one row (validator requires item). A missing/out-of-range item
    // is a no-op, never a throw.
    const r = rowAt(op.update.item);
    if (r) { const { item, ...fields } = op.update; Object.assign(r, fields); }
  } else if (op.recolor && typeof op.recolor === 'object') {
    if (op.recolor.item != null) { const r = rowAt(op.recolor.item); if (r && op.recolor.color != null) r.color = op.recolor.color; }
    else if (op.recolor.color != null) st.color = op.recolor.color;
  } else if (op.replace && typeof op.replace === 'object') {
    // the author's body field is `items` (matches creation spec); the canonical
    // state field is `rows`. Map it so host state stays consistent with the DOM
    // (which renders op.replace.items) — a blind Object.assign would leave a stale
    // st.rows beside a new st.items, diverging from what is on screen.
    const { items, ...rest } = op.replace;
    if (items !== undefined) st.rows = Array.isArray(items) ? items.map((r) => ({ ...r })) : [];
    Object.assign(st, rest);
  }
  return entry;
}

export function dropLive(reg, id) {
  if (!reg.byId[id]) return;
  delete reg.byId[id];
  reg.order = reg.order.filter((x) => x !== id);
}

export function clearScene(reg) {
  reg.byId = Object.create(null);
  reg.order = [];
}

// ── browser glue ───────────────────────────────────────────────────────────
// makeLive(rctx) returns the host-side methods the recording loop calls. Each
// runs a safeEval that owns a DOM-side registry (window.__live): live nodes
// persist on the page between steps (the engine simply stops wiping them).
// Phase 2 ships the glossary adapter; later phases add note/progress/marks/modal
// by extending the in-page `adapters` map — the lifecycle here is type-agnostic.
export function makeLive(rctx) {
  const { safeEval } = rctx;
  const theme = () => rctx.pageTheme || 'dark';

  // create or rebuild a live element. spec = the primitive's object form + id.
  const liveCreate = (type, spec) => safeEval(({ type, spec, theme }) => {
    const reg = (window.__live = window.__live || { nodes: {} });
    const isDark = theme === 'dark';
    const GLASS = isDark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.80)';
    const NOTEINK = isDark ? '#f8fafc' : '#0f172a';
    const HAIR = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)';
    const SHADOW = '0 10px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.16)';
    const BLUR = 'backdrop-filter:blur(13px) saturate(140%);-webkit-backdrop-filter:blur(13px) saturate(140%)';
    const DEF = '#16a34a';
    const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g, '');
    // a color is baked raw into a style="" attribute inside innerHTML; a stray
    // quote/angle would break out and inject markup. esc (for text/badge) leaves
    // quotes; a color sits in a CSS slot, so charset-sanitize instead. KEEP IN
    // SYNC with liveOpDom's safeCol and cursor-inject's safeColor.
    const safeCol = (s) => String(s == null ? '' : s).replace(/[^#0-9a-zA-Z(),.%\s/-]/g, '').trim() || DEF;

    // readable badge-number color: pick whichever of dark/white text has the HIGHER
    // WCAG contrast against the pill, not a luminance threshold. The old L>0.45 cut
    // mis-chose white for mid-luminance pills where dark scores higher (green
    // 3.30 vs dark 5.42; purple 3.96 vs 4.51 — both then PASS AA). Computing the
    // real contrast never regresses a case the threshold already got right. Only a
    // parseable #hex; named/rgb keep white. KEEP IN SYNC with liveOpDom.
    const badgeInk = (col) => {
      const h = String(col).trim().replace(/^#/, '');
      const x = h.length === 3 ? h.split('').map((d2) => d2 + d2).join('') : h;
      if (!/^[0-9a-f]{6}$/i.test(x)) return '#fff';
      const [r2, g2, b2] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
      const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      const L = 0.2126 * lin(r2) + 0.7152 * lin(g2) + 0.0722 * lin(b2);
      const cWhite = 1.05 / (L + 0.05), cDark = (L + 0.05) / (0.0088 + 0.05); // 0.0088 = L of #0f172a
      return cDark > cWhite ? '#0f172a' : '#fff';
    };
    // one part node, shared by both element types. A glossary part has a badge
    // pill + text; a modal body part is just text (empty badge renders nothing).
    // KEEP IN SYNC with the rowEl in liveOpDom (two safeEval closures can't share
    // a JS helper without eval; a comment is cleaner than that).
    const rowEl = (r) => {
      const d = document.createElement('div');
      d.className = '__live_row';
      d.style.cssText = 'display:flex;gap:10px;align-items:center;margin:8px 0;opacity:0;transform:translateX(-6px);'
        + 'transition:opacity .4s ease,transform .4s cubic-bezier(.22,1,.36,1)';
      const c = safeCol(r.color);
      const badge = (r.badge == null || r.badge === '') ? ''
        : '<span style="flex:0 0 auto;min-width:22px;height:22px;border-radius:11px;background:' + c + ';'
          + 'border:1.5px solid rgba(255,255,255,.9);box-shadow:0 0 0 3px ' + c + '26;color:' + badgeInk(c) + ';'
          + 'font:700 12px/19px system-ui;text-align:center;padding:0 4px">' + esc(r.badge) + '</span>';
      d.innerHTML = badge + '<span style="color:' + NOTEINK + ';font:400 15px/1.4 system-ui">' + esc(r.text) + '</span>';
      return d;
    };

    document.getElementById('__live_' + spec.id)?.remove();
    if (type === 'modal') document.getElementById('__live_bd_' + spec.id)?.remove();
    const panel = document.createElement('div');
    panel.id = '__live_' + spec.id;
    panel.dataset.liveType = type;
    const accent = safeCol(spec.color);

    if (type === 'modal') {
      // free-floating centered dialog + dim backdrop. Body parts append like rows.
      const bd = document.createElement('div');
      bd.id = '__live_bd_' + spec.id;
      bd.style.cssText = 'position:fixed;inset:0;z-index:2147483639;pointer-events:none;background:rgba(8,15,30,.5);'
        + 'backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);opacity:0;transition:opacity .4s ease';
      document.documentElement.appendChild(bd);
      requestAnimationFrame(() => { bd.style.opacity = '1'; });
      panel.style.cssText = 'position:fixed;z-index:2147483640;pointer-events:none;left:50%;top:50%;transform:translate(-50%,-50%);'
        + 'max-width:540px;width:calc(100% - 80px);overflow:hidden;background:' + GLASS + ';' + BLUR + ';'
        + 'border:1px solid ' + HAIR + ';border-left:2px solid ' + accent + ';border-radius:16px;box-shadow:' + SHADOW + ';'
        + 'opacity:0;transition:opacity .4s ease';
      if (spec.title) {
        const h = document.createElement('div');
        h.style.cssText = 'display:flex;align-items:center;gap:9px;padding:14px 20px;border-bottom:1px solid ' + HAIR;
        h.innerHTML = '<span class="__live_dot" style="width:9px;height:9px;border-radius:50%;background:' + accent + ';box-shadow:0 0 8px ' + accent + '"></span>'
          + '<span style="color:' + NOTEINK + ';font:700 19px/1.2 system-ui;letter-spacing:-.01em">' + esc(spec.title) + '</span>';
        panel.appendChild(h);
      }
    } else {
      // corner glossary panel.
      const gw = spec.width || 320;
      const cornerName = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(spec.pos) ? spec.pos : 'top-right';
      const vert = cornerName.startsWith('top') ? 'top' : 'bottom';
      const horiz = cornerName.endsWith('left') ? 'left' : 'right';
      // Cascade: live panels persist, so several can share a corner. Stack each
      // new one below (top corners) / above (bottom corners) the ones already
      // there instead of dropping it on top and hiding them. Sum the heights of
      // existing live panels anchored to THIS corner. (The static glossary uses
      // full collision-search; a deterministic cascade is the simpler fit here.)
      let stackOff = 24;
      for (const el of document.querySelectorAll('[id^="__live_"]')) {
        if (el.dataset.liveCorner === cornerName) stackOff += el.getBoundingClientRect().height + 12;
      }
      panel.dataset.liveCorner = cornerName;
      panel.style.cssText = 'position:fixed;z-index:2147483640;pointer-events:none;' + horiz + ':24px;' + vert + ':' + stackOff + 'px;width:' + gw + 'px;'
        + 'background:' + GLASS + ';' + BLUR + ';border:1px solid ' + HAIR + ';border-left:2px solid ' + accent + ';'
        + 'border-radius:16px;padding:15px 18px;box-shadow:' + SHADOW + ';opacity:0;transition:opacity .4s ease,height .35s cubic-bezier(.22,1,.36,1)';
      if (spec.title) {
        const t = document.createElement('div');
        t.style.cssText = 'display:flex;align-items:center;gap:8px;color:' + NOTEINK + ';font:700 15px system-ui;'
          + 'letter-spacing:-.01em;margin:0 0 11px;padding-bottom:9px;border-bottom:1px solid ' + HAIR;
        t.innerHTML = '<span class="__live_dot" style="width:7px;height:7px;border-radius:50%;background:' + accent
          + ';box-shadow:0 0 7px ' + accent + '"></span>' + esc(spec.title);
        panel.appendChild(t);
      }
    }
    const body = document.createElement('div');
    body.className = '__live_body';
    if (type === 'modal') body.style.cssText = 'padding:16px 20px';
    panel.appendChild(body);
    document.documentElement.appendChild(panel);
    const rows = Array.isArray(spec.items) ? spec.items : [];
    // initial rows render visible immediately. A setTimeout stagger never fires
    // under the paused virtual clock (offline), which would leave them invisible
    // forever — the same class as the confetti/sparkline offline trap. The append
    // op carries the "grows" animation via requestAnimationFrame (which the clock
    // does sample); the opening rows are simply present.
    rows.forEach((r) => { const el = rowEl(r); el.style.opacity = '1'; el.style.transform = 'none'; body.appendChild(el); });
    requestAnimationFrame(() => { panel.style.opacity = '1'; });
    reg.nodes[spec.id] = { id: spec.id, type };
    return spec.id;
  }, { type, spec, theme: theme() });

  // mutate an existing live element. resolved = the chosen id (host resolves via
  // the pure resolveTarget before calling this); op = the single verb object.
  const liveOpDom = (id, op) => safeEval(({ id, op, theme }) => {
    const panel = document.getElementById('__live_' + id);
    if (!panel) return false;
    const body = panel.querySelector('.__live_body');
    // NOTEINK MUST come from the same theme source liveCreate used (rctx.pageTheme,
    // resolved by the central detector) — re-detecting here off document.body
    // diverged: a transparent body or a borderline-luminance page gave a different
    // verdict, so a row appended later had a different text color than its created
    // siblings in the SAME panel. One home for the theme decision.
    const isDark = theme === 'dark';
    const NOTEINK = isDark ? '#f8fafc' : '#0f172a';
    const DEF = '#16a34a';
    const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g, '');
    // colors baked into style/innerHTML must be charset-sanitized (a stray quote
    // breaks out and injects markup). KEEP IN SYNC with liveCreate's safeCol.
    const safeCol = (s) => String(s == null ? '' : s).replace(/[^#0-9a-zA-Z(),.%\s/-]/g, '').trim() || DEF;
    // KEEP IN SYNC with the rowEl in liveCreate (two safeEval closures can't share
    // a JS helper without eval; a comment is cleaner than that). Both: empty badge
    // => no pill (a modal body line has text only); badgeInk picks readable text.
    const badgeInk = (col) => {
      const h = String(col).trim().replace(/^#/, '');
      const x = h.length === 3 ? h.split('').map((d2) => d2 + d2).join('') : h;
      if (!/^[0-9a-f]{6}$/i.test(x)) return '#fff';
      const [r2, g2, b2] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
      const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      const L = 0.2126 * lin(r2) + 0.7152 * lin(g2) + 0.0722 * lin(b2);
      // max-contrast pick (not L>0.45). KEEP IN SYNC with liveCreate's badgeInk.
      const cWhite = 1.05 / (L + 0.05), cDark = (L + 0.05) / (0.0088 + 0.05);
      return cDark > cWhite ? '#0f172a' : '#fff';
    };
    const rowEl = (r) => {
      const d = document.createElement('div');
      d.className = '__live_row';
      d.style.cssText = 'display:flex;gap:10px;align-items:center;margin:8px 0;opacity:0;transform:translateX(-6px);'
        + 'transition:opacity .4s ease,transform .4s cubic-bezier(.22,1,.36,1)';
      const c = safeCol(r.color);
      const badge = (r.badge == null || r.badge === '') ? ''
        : '<span style="flex:0 0 auto;min-width:22px;height:22px;border-radius:11px;background:' + c + ';'
          + 'border:1.5px solid rgba(255,255,255,.9);box-shadow:0 0 0 3px ' + c + '26;color:' + badgeInk(c) + ';'
          + 'font:700 12px/19px system-ui;text-align:center;padding:0 4px">' + esc(r.badge) + '</span>';
      d.innerHTML = badge + '<span style="color:' + NOTEINK + ';font:400 15px/1.4 system-ui">' + esc(r.text) + '</span>';
      return d;
    };
    const rowsNow = () => Array.from(body.querySelectorAll('.__live_row'));

    if (op.append) {
      const el = rowEl(op.append);
      body.appendChild(el);
      // force a reflow so the from-state commits, THEN reveal: the transition
      // animates in realtime and the row still ends visible offline (a bare
      // requestAnimationFrame can coalesce under the paused virtual clock).
      void el.offsetWidth;
      el.style.opacity = '1'; el.style.transform = 'none';
    } else if (op.update && op.update.item != null) {
      // mirror applyState: render EVERY field the validator permits (text/color/
      // badge), not a subset — else host state and the DOM diverge. The validator
      // (rec-steps) restricts update to exactly these three; KEEP IN SYNC with it.
      const r = rowsNow()[op.update.item - 1];
      if (r) {
        if (op.update.text != null) r.querySelector('span:last-child').textContent = esc(op.update.text);
        const b = r.querySelector('span:first-child');
        if (op.update.color && b) { b.style.background = op.update.color; b.style.boxShadow = '0 0 0 3px ' + op.update.color + '26'; }
        if (op.update.badge != null && b) { b.textContent = esc(op.update.badge); }
      }
    } else if (op.recolor) {
      const rs = rowsNow();
      if (op.recolor.item != null) {
        const r = rs[op.recolor.item - 1];
        if (r && op.recolor.color) { const b = r.querySelector('span:first-child'); b.style.background = op.recolor.color; b.style.boxShadow = '0 0 0 3px ' + op.recolor.color + '26'; }
      } else if (op.recolor.color) {
        // the panel accent lives in TWO places at create: the left border AND the
        // title dot (background + glow). Recolor both, else half the accent flips
        // (red border, stale-blue dot) — a visible state divergence.
        panel.style.borderLeftColor = op.recolor.color;
        const dot = panel.querySelector('.__live_dot');
        if (dot) { dot.style.background = op.recolor.color; dot.style.boxShadow = '0 0 8px ' + op.recolor.color; }
      }
    } else if (op.replace) {
      body.innerHTML = '';
      (Array.isArray(op.replace.items) ? op.replace.items : []).forEach((r) => { const el = rowEl(r); el.style.opacity = '1'; el.style.transform = 'none'; body.appendChild(el); });
    } else if (op.remove) {
      // immediate: a setTimeout fade never lands offline (paused virtual clock).
      panel.remove();
      document.getElementById('__live_bd_' + id)?.remove(); // modal backdrop, if any
      if (window.__live && window.__live.nodes) delete window.__live.nodes[id];
    }
    return true;
  }, { id, op, theme: theme() });

  // remove every live node now. A timed fade (setTimeout) never lands under the
  // paused virtual clock — the panel would persist through the new scene. Removal
  // is synchronous; a scene boundary is a cut, so an abrupt drop is correct.
  const liveClearScene = () => safeEval(() => {
    const reg = window.__live;
    if (!reg || !reg.nodes) return 0;
    let n = 0;
    for (const id of Object.keys(reg.nodes)) {
      const el = document.getElementById('__live_' + id);
      if (el) { el.remove(); n++; }
      document.getElementById('__live_bd_' + id)?.remove(); // modal backdrop, if any
    }
    reg.nodes = {};
    return n;
  });

  return { liveCreate, liveOpDom, liveClearScene };
}
