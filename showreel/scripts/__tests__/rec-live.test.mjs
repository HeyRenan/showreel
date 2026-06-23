// rec-live.test.mjs — the pure half of the live-element engine: registry state
// + target resolution, no DOM. The browser glue (makeLive) is exercised by the
// integration render. These functions decide WHAT to do; the glue does it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRegistry, registerLive, resolveTarget, applyState, dropLive, clearScene } from '../rec-live.mjs';

test('register + resolve by explicit id', () => {
  const r = newRegistry();
  registerLive(r, { id: 'feat', type: 'glossary', state: { rows: [] } });
  assert.equal(resolveTarget(r, { id: 'feat' }).target.id, 'feat');
});

test('resolve the sole live element when no id given', () => {
  const r = newRegistry();
  registerLive(r, { id: 'a', type: 'glossary', state: { rows: [] } });
  assert.equal(resolveTarget(r, {}).target.id, 'a');
});

test('resolve with no id and two live elements is ambiguous -> null + reason', () => {
  const r = newRegistry();
  registerLive(r, { id: 'a', type: 'glossary', state: { rows: [] } });
  registerLive(r, { id: 'b', type: 'glossary', state: { rows: [] } });
  const res = resolveTarget(r, {});
  assert.equal(res.target, null);
  assert.match(res.reason, /ambiguous/);
});

test('resolve a missing id -> null + reason, never throws', () => {
  const r = newRegistry();
  assert.doesNotThrow(() => resolveTarget(r, { id: 'nope' }));
  assert.equal(resolveTarget(r, { id: 'nope' }).target, null);
});

test('applyState append/update/recolor/replace mutate state in place', () => {
  const e = { id: 'f', type: 'glossary', state: { rows: [{ badge: '1', text: 'A', color: 'blue' }] } };
  applyState(e, { append: { badge: '2', text: 'B', color: 'green' } });
  assert.equal(e.state.rows.length, 2);
  applyState(e, { update: { item: 1, text: 'A2' } });
  assert.equal(e.state.rows[0].text, 'A2');
  applyState(e, { recolor: { item: 2, color: 'red' } });
  assert.equal(e.state.rows[1].color, 'red');
  applyState(e, { recolor: { color: 'amber' } }); // whole-element recolor
  assert.equal(e.state.color, 'amber');
  // the author's replace field is `items` (matches creation spec); it must land
  // on the canonical st.rows, not create a stale st.items beside it.
  applyState(e, { replace: { items: [{ badge: '9', text: 'Z' }] } });
  assert.deepEqual(e.state.rows.map((x) => x.badge), ['9']);
  assert.equal(e.state.items, undefined, 'replace maps items -> rows, no stray st.items');
});

test('applyState update/recolor on an out-of-range item is ignored, never throws', () => {
  const e = { id: 'f', type: 'glossary', state: { rows: [{ text: 'A' }] } };
  assert.doesNotThrow(() => applyState(e, { update: { item: 99, text: 'x' } }));
  assert.equal(e.state.rows[0].text, 'A');
});

test('dropLive removes one; clearScene empties all', () => {
  const r = newRegistry();
  registerLive(r, { id: 'a', type: 'glossary', state: { rows: [] } });
  registerLive(r, { id: 'b', type: 'glossary', state: { rows: [] } });
  dropLive(r, 'a');
  assert.equal(resolveTarget(r, { id: 'a' }).target, null);
  assert.equal(r.order.length, 1);
  clearScene(r);
  assert.equal(r.order.length, 0);
});

test('registry functions never throw on hostile input', () => {
  const r = newRegistry();
  assert.doesNotThrow(() => resolveTarget(r, null));
  assert.doesNotThrow(() => resolveTarget(r, {}));
  assert.doesNotThrow(() => dropLive(r, 'ghost'));
  assert.doesNotThrow(() => clearScene(r));
  const e = { id: 'x', type: 'glossary', state: { rows: [] } };
  for (const bad of [{}, { append: null }, { update: {} }, { recolor: {} }, { replace: {} }, null]) {
    assert.doesNotThrow(() => applyState(e, bad));
  }
});

test('re-registering the same id replaces in place, does not duplicate order', () => {
  const r = newRegistry();
  registerLive(r, { id: 'a', type: 'glossary', state: { rows: [{ text: 'old' }] } });
  registerLive(r, { id: 'a', type: 'glossary', state: { rows: [{ text: 'new' }] } });
  assert.equal(r.order.length, 1);
  assert.equal(resolveTarget(r, { id: 'a' }).target.state.rows[0].text, 'new');
});

// Contract test for the badge-text-color rule used in both rowEl closures
// (badgeInk). The closures can't import a host helper across the safeEval
// boundary, so this asserts the intended behavior against a replica — if the
// in-closure copies drift from this, the contrast contract is broken.
test('badge text color: dark on a light pill, white on a dark pill, white on non-hex', () => {
  const badgeInk = (col) => {
    const h = String(col).trim().replace(/^#/, '');
    const x = h.length === 3 ? h.split('').map((d) => d + d).join('') : h;
    if (!/^[0-9a-f]{6}$/i.test(x)) return '#fff';
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.45 ? '#0f172a' : '#fff';
  };
  assert.equal(badgeInk('#ffe066'), '#0f172a', 'pale yellow -> dark digit');
  assert.equal(badgeInk('#93c5fd'), '#0f172a', 'light blue -> dark digit');
  assert.equal(badgeInk('#16a34a'), '#fff', 'default green -> white digit');
  assert.equal(badgeInk('#2563eb'), '#fff', 'dark blue -> white digit');
  assert.equal(badgeInk('rebeccapurple'), '#fff', 'named color -> default white');
  assert.equal(badgeInk('#fff'), '#0f172a', '3-hex white -> dark digit');
});
