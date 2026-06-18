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
