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
    if ('item' in op.update) {
      const r = rowAt(op.update.item);
      if (r) { const { item, ...fields } = op.update; Object.assign(r, fields); }
    } else {
      const { item, ...fields } = op.update; // tolerate a stray item key
      Object.assign(st, fields);
    }
  } else if (op.recolor && typeof op.recolor === 'object') {
    if (op.recolor.item != null) { const r = rowAt(op.recolor.item); if (r && op.recolor.color != null) r.color = op.recolor.color; }
    else if (op.recolor.color != null) st.color = op.recolor.color;
  } else if (op.replace && typeof op.replace === 'object') {
    Object.assign(st, op.replace);
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

    // one glossary row node; color is per-row (falls back to the default green).
    const rowEl = (r) => {
      const d = document.createElement('div');
      d.className = '__live_row';
      d.style.cssText = 'display:flex;gap:10px;align-items:center;margin:8px 0;opacity:0;transform:translateX(-6px);'
        + 'transition:opacity .4s ease,transform .4s cubic-bezier(.22,1,.36,1)';
      const c = r.color || DEF;
      d.innerHTML = '<span style="flex:0 0 auto;min-width:22px;height:22px;border-radius:11px;background:' + c + ';'
        + 'border:1.5px solid rgba(255,255,255,.9);box-shadow:0 0 0 3px ' + c + '26;color:#fff;'
        + 'font:700 12px/19px system-ui;text-align:center;padding:0 4px">' + esc(r.badge) + '</span>'
        + '<span style="color:' + NOTEINK + ';font:400 15px/1.4 system-ui">' + esc(r.text) + '</span>';
      return d;
    };

    document.getElementById('__live_' + spec.id)?.remove();
    const panel = document.createElement('div');
    panel.id = '__live_' + spec.id;
    panel.dataset.liveType = type;
    const gw = spec.width || 320;
    const corner = spec.pos === 'top-left' ? 'left:24px;top:24px'
      : spec.pos === 'bottom-right' ? 'right:24px;bottom:24px'
      : spec.pos === 'bottom-left' ? 'left:24px;bottom:24px'
      : 'right:24px;top:24px';
    panel.style.cssText = 'position:fixed;z-index:2147483640;pointer-events:none;' + corner + ';width:' + gw + 'px;'
      + 'background:' + GLASS + ';' + BLUR + ';border:1px solid ' + HAIR + ';border-left:2px solid ' + (spec.color || DEF) + ';'
      + 'border-radius:16px;padding:15px 18px;box-shadow:' + SHADOW + ';opacity:0;transition:opacity .4s ease,height .35s cubic-bezier(.22,1,.36,1)';
    if (spec.title) {
      const t = document.createElement('div');
      t.style.cssText = 'display:flex;align-items:center;gap:8px;color:' + NOTEINK + ';font:700 15px system-ui;'
        + 'letter-spacing:-.01em;margin:0 0 11px;padding-bottom:9px;border-bottom:1px solid ' + HAIR;
      t.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:' + (spec.color || DEF)
        + ';box-shadow:0 0 7px ' + (spec.color || DEF) + '"></span>' + esc(spec.title);
      panel.appendChild(t);
    }
    const body = document.createElement('div');
    body.className = '__live_body';
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
  const liveOpDom = (id, op) => safeEval(({ id, op }) => {
    const panel = document.getElementById('__live_' + id);
    if (!panel) return false;
    const body = panel.querySelector('.__live_body');
    const isDark = (document.body && getComputedStyle(document.body).backgroundColor || '').match(/\d+/g);
    const NOTEINK = (isDark && (+isDark[0] + +isDark[1] + +isDark[2]) / 3 < 128) ? '#f8fafc' : '#0f172a';
    const DEF = '#16a34a';
    const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g, '');
    const rowEl = (r) => {
      const d = document.createElement('div');
      d.className = '__live_row';
      d.style.cssText = 'display:flex;gap:10px;align-items:center;margin:8px 0;opacity:0;transform:translateX(-6px);'
        + 'transition:opacity .4s ease,transform .4s cubic-bezier(.22,1,.36,1)';
      const c = r.color || DEF;
      d.innerHTML = '<span style="flex:0 0 auto;min-width:22px;height:22px;border-radius:11px;background:' + c + ';'
        + 'border:1.5px solid rgba(255,255,255,.9);box-shadow:0 0 0 3px ' + c + '26;color:#fff;'
        + 'font:700 12px/19px system-ui;text-align:center;padding:0 4px">' + esc(r.badge) + '</span>'
        + '<span style="color:' + NOTEINK + ';font:400 15px/1.4 system-ui">' + esc(r.text) + '</span>';
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
    } else if (op.update) {
      const rs = rowsNow();
      const r = rs[(op.update.item || 0) - 1];
      if (r && op.update.text != null) r.querySelector('span:last-child').textContent = esc(op.update.text);
    } else if (op.recolor) {
      const rs = rowsNow();
      if (op.recolor.item != null) {
        const r = rs[op.recolor.item - 1];
        if (r && op.recolor.color) { const b = r.querySelector('span:first-child'); b.style.background = op.recolor.color; b.style.boxShadow = '0 0 0 3px ' + op.recolor.color + '26'; }
      } else if (op.recolor.color) {
        panel.style.borderLeftColor = op.recolor.color;
      }
    } else if (op.replace) {
      body.innerHTML = '';
      (Array.isArray(op.replace.items) ? op.replace.items : []).forEach((r) => { const el = rowEl(r); el.style.opacity = '1'; el.style.transform = 'none'; body.appendChild(el); });
    } else if (op.remove) {
      // immediate: a setTimeout fade never lands offline (paused virtual clock).
      panel.remove();
      if (window.__live && window.__live.nodes) delete window.__live.nodes[id];
    }
    return true;
  }, { id, op });

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
    }
    reg.nodes = {};
    return n;
  });

  return { liveCreate, liveOpDom, liveClearScene };
}
