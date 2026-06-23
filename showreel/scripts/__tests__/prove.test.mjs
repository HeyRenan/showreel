// prove.test.mjs — hostile inputs against the pure logic of the proof engine.
// The browser-bound proveOne/main are out of scope; this file probes the pure
// exports: parse, placeZoomInset, buildAnnotations, placedBoxes, checkCollisions,
// summarize. A pure verdict helper must NEVER throw on hostile input — it returns
// a clean result. Validators (parse's numeric/string flags) are SUPPOSED to throw
// a clear, scoped error; those throws are pinned, not removed. A failure here is
// a real bug, not a typo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse, placeZoomInset, buildAnnotations, placedBoxes, checkCollisions, summarize,
} from '../prove.mjs';

const VP = { w: 1000, h: 800 };

// ── parse: positional binding + flag toggles ───────────────────────────────
test('parse: defaults stand and an empty argv binds nothing (no crash)', () => {
  // proveOne is never reached with an undefined url — main() guards that — but
  // parse itself must return a clean partial, never throw on []
  const a = parse([]);
  assert.equal(a.width, 900);
  assert.equal(a.height, 1400);
  assert.equal(a.dpr, 1);
  assert.equal(a.url, undefined);
  assert.equal(a.selector, undefined);
  assert.equal(a.out, undefined);
});

test('parse: single mode binds url/selector/out in order', () => {
  const a = parse(['http://x', '#sel', 'o.png']);
  assert.equal(a.url, 'http://x');
  assert.equal(a.selector, '#sel');
  assert.equal(a.out, 'o.png');
});

test('parse: batch mode binds ONLY url; selector/out stay undefined', () => {
  // with --batch the only positional consumed is the url; jobs come from the file
  const a = parse(['http://x', '--batch', 'jobs.json']);
  assert.equal(a.url, 'http://x');
  assert.equal(a.batch, 'jobs.json');
  assert.equal(a.selector, undefined);
  assert.equal(a.out, undefined);
});

test('parse: surplus positionals throw (the unquoted-selector footgun)', () => {
  // an unquoted selector with spaces splits into extra tokens; binding them
  // silently put the out filename in the wrong slot. Now it errors.
  assert.throws(() => parse(['http://x', '.my', 'selector', 'out.png']), /too many positional/);
  assert.throws(() => parse(['http://x', '--batch', 'j.json', 'extra']), /too many positional/);
  // the valid arities still pass
  assert.doesNotThrow(() => parse(['http://x', '#sel', 'o.png']));
  assert.doesNotThrow(() => parse(['http://x', '--batch', 'j.json']));
});

test('parse: --circle and --zoom are booleans, not value-consuming', () => {
  const a = parse(['u', 's', 'o', '--circle', '--zoom']);
  assert.equal(a.circle, true);
  assert.equal(a.zoom, true);
  assert.equal(a.out, 'o'); // the boolean flags did not swallow the positionals
});

// (the old "extra positionals silently dropped" test was removed — it documented
// the unquoted-selector footgun as the contract; prove now rejects surplus
// positionals, covered by the "surplus positionals throw" test above.)

// ── parse: validators are SUPPOSED to throw a scoped error ──────────────────
test('parse: --width rejects non-number / non-integer / below-floor', () => {
  assert.throws(() => parse(['u', 's', 'o', '--width', 'abc']), /--width must be a number/);
  assert.throws(() => parse(['u', 's', 'o', '--width', '1.5']), /--width must be a whole number/);
  assert.throws(() => parse(['u', 's', 'o', '--width', '0']), /--width must be >= 1/);
});

test('parse: --dpr rejects 0 (below 0.1 floor) but accepts a fraction', () => {
  assert.throws(() => parse(['u', 's', 'o', '--dpr', '0']), /--dpr must be >= 0.1/);
  assert.equal(parse(['u', 's', 'o', '--dpr', '0.5']).dpr, 0.5);
});

test('parse: a string flag with a missing value or a flag-shaped value throws', () => {
  // str() refuses to swallow the next flag as a label (--label --circle bug)
  assert.throws(() => parse(['u', 's', 'o', '--label']), /--label needs a value/);
  assert.throws(() => parse(['u', 's', 'o', '--label', '--circle']), /--label needs a value/);
});

test('parse: an unknown flag throws and names itself', () => {
  assert.throws(() => parse(['u', '--bogus']), /unknown arg --bogus/);
});

test('parse: --label and --blur consume their following value verbatim', () => {
  const a = parse(['u', 's', 'o', '--label', 'menu opens', '--blur', '#secret']);
  assert.equal(a.label, 'menu opens');
  assert.equal(a.blur, '#secret');
});

// ── summarize: exit policy + the empty-run trap ─────────────────────────────
test('summarize: all-PASS yields a PASS verdict and exit 0', () => {
  const s = summarize(['PASS', 'PASS']);
  assert.equal(s.verdict, 'PASS');
  assert.equal(s.exitCode, 0);
  assert.equal(s.line, 'PROVE 2/2 PASS');
});

test('summarize: an empty run is FAIL (passed===total but total is 0)', () => {
  // 0/0 must not read as success — a reel that proved nothing did not pass
  const s = summarize([]);
  assert.equal(s.verdict, 'FAIL');
  assert.equal(s.exitCode, 0); // no FAIL/ERROR/NO_SPACE entries -> exit stays 0
  assert.equal(s.line, 'PROVE 0/0 FAIL');
});

test('summarize: any ERROR or NO_SPACE forces exit 3 (input problem)', () => {
  assert.equal(summarize(['PASS', 'ERROR']).exitCode, 3);
  assert.equal(summarize(['PASS', 'NO_SPACE']).exitCode, 3);
  // ERROR/NO_SPACE dominate a plain FAIL when both are present
  assert.equal(summarize(['FAIL', 'NO_SPACE']).exitCode, 3);
});

test('summarize: a FAIL with no ERROR/NO_SPACE is exit 1 (placement failure)', () => {
  const s = summarize(['PASS', 'FAIL']);
  assert.equal(s.exitCode, 1);
  assert.equal(s.verdict, 'FAIL');
});

test('summarize: hostile non-array input returns a clean FAIL, never throws', () => {
  // BUG FIXED: summarize(null/undefined) read .length on a non-array and threw.
  // The exit-policy verdict is the contract; it must degrade to an empty run.
  for (const bad of [null, undefined]) {
    const s = summarize(bad);
    assert.equal(s.total, 0);
    assert.equal(s.verdict, 'FAIL');
    assert.equal(s.exitCode, 0);
  }
});

// ── checkCollisions: edge-contact precision + hostile shapes ────────────────
test('checkCollisions: a clean placement returns null', () => {
  const placed = [{ name: 'callout', x: 500, y: 500, w: 100, h: 40 }];
  assert.equal(checkCollisions(placed, { x: 0, y: 0, w: 50, h: 50 }), null);
});

test('checkCollisions: edge contact does NOT count as a collision', () => {
  // strict < in the overlap test: a box whose left edge == target right edge is
  // touching, not overlapping. Off-by-one here would fail clean proofs.
  const touch = [{ name: 'label', x: 10, y: 0, w: 10, h: 10 }];
  assert.equal(checkCollisions(touch, { x: 0, y: 0, w: 10, h: 10 }), null);
});

test('checkCollisions: a 1px overlap with the target IS reported', () => {
  const over = [{ name: 'label', x: 9, y: 0, w: 10, h: 10 }];
  assert.equal(checkCollisions(over, { x: 0, y: 0, w: 10, h: 10 }), 'label overlaps target');
});

test('checkCollisions: pairwise overlap is reported with both names', () => {
  const placed = [
    { name: 'zoom', x: 0, y: 0, w: 10, h: 10 },
    { name: 'callout', x: 5, y: 5, w: 10, h: 10 },
  ];
  // target far away so only the pair collides
  assert.equal(checkCollisions(placed, { x: 800, y: 700, w: 5, h: 5 }), 'zoom overlaps callout');
});

test('checkCollisions: pairwise edge contact is also clean', () => {
  const placed = [
    { name: 'zoom', x: 0, y: 0, w: 10, h: 10 },
    { name: 'callout', x: 10, y: 0, w: 10, h: 10 },
  ];
  assert.equal(checkCollisions(placed, { x: 800, y: 700, w: 5, h: 5 }), null);
});

test('checkCollisions: hostile inputs return a clean verdict, never throw', () => {
  // BUG FIXED: a non-iterable `placed`, a null `targetRect`, or a null entry in
  // `placed` each crashed ("not iterable" / "reading x"). The contract is "null
  // when clean", so hostile input must degrade to null, not blow up the gate.
  assert.equal(checkCollisions(null, { x: 0, y: 0, w: 5, h: 5 }), null);
  assert.equal(checkCollisions(undefined, { x: 0, y: 0, w: 5, h: 5 }), null);
  assert.equal(checkCollisions([{ name: 'a', x: 0, y: 0, w: 5, h: 5 }], null), null);
  assert.equal(checkCollisions([null], { x: 0, y: 0, w: 5, h: 5 }), null);
});

test('checkCollisions: still detects a real hit after the null guards', () => {
  // the guards must not blunt the actual check
  const hit = checkCollisions([{ name: 'a', x: 1, y: 1, w: 5, h: 5 }], { x: 0, y: 0, w: 10, h: 10 });
  assert.equal(hit, 'a overlaps target');
});

// ── placedBoxes: only freely-placed shapes, with size defaults ──────────────
test('placedBoxes: the on-target marker shapes (rect/circle/blur) are excluded', () => {
  const ann = [
    { type: 'rect', x: 0, y: 0, w: 50, h: 30 },
    { type: 'circle', x: 25, y: 15, rx: 40, ry: 30 },
    { type: 'blur', x: 5, y: 5, w: 20, h: 20 },
  ];
  assert.deepEqual(placedBoxes(ann), []);
});

test('placedBoxes: a zoom inset is sized w*scale x h*scale at its `at`', () => {
  const out = placedBoxes([{ type: 'zoom', at: { x: 100, y: 120 }, w: 50, h: 30, scale: 2 }]);
  assert.deepEqual(out, [{ name: 'zoom', x: 100, y: 120, w: 100, h: 60 }]);
});

test('placedBoxes: a zoom without `at` is not placeable (skipped)', () => {
  // the marker zoom lives on the target until `at` exists; no `at` => no box
  assert.deepEqual(placedBoxes([{ type: 'zoom', w: 50, h: 30, scale: 3 }]), []);
});

test('placedBoxes: zoom scale defaults to 2 when absent', () => {
  const out = placedBoxes([{ type: 'zoom', at: { x: 0, y: 0 }, w: 10, h: 20 }]);
  assert.deepEqual(out, [{ name: 'zoom', x: 0, y: 0, w: 20, h: 40 }]);
});

test('placedBoxes: callout/label fall back to the passed/default dimensions', () => {
  const out = placedBoxes(
    [{ type: 'callout', x: 1, y: 2 }, { type: 'label', x: 3, y: 4 }],
    { calloutW: 200, calloutH: 36 },
  );
  assert.deepEqual(out, [
    { name: 'callout', x: 1, y: 2, w: 220, h: 36 }, // callout w defaults to 220
    { name: 'label', x: 3, y: 4, w: 200, h: 36 },   // label w uses calloutW opt
  ]);
});

test('placedBoxes: hostile non-array input returns [], never throws', () => {
  // BUG FIXED: placedBoxes(null/undefined) iterated a non-iterable and threw.
  // It is consumed directly by checkCollisions; an empty box list is the safe
  // degradation (nothing placed -> nothing collides).
  assert.deepEqual(placedBoxes(null), []);
  assert.deepEqual(placedBoxes(undefined), []);
  assert.deepEqual(placedBoxes(5), []);
});

// ── placeZoomInset: scale clamp + the placeFn fallback ladder ───────────────
test('placeZoomInset: scale is clamped to [1.4, 2.4]', () => {
  // a tiny target wants to magnify a lot but the cap holds at 2.4
  const tiny = placeZoomInset({ t: { x: 100, y: 100, w: 10, h: 8 }, viewport: VP, placeFn: () => ({ error: 'NO_SPACE' }) });
  assert.equal(tiny.scale, 2.4);
  // a target near 60% of the viewport is held DOWN to the 1.4 floor
  const big = placeZoomInset({ t: { x: 0, y: 0, w: 700, h: 560 }, viewport: VP, placeFn: () => ({ error: 'NO_SPACE' }) });
  assert.equal(big.scale, 1.4);
});

test('placeZoomInset: a good placeFn spot is used verbatim', () => {
  const r = placeZoomInset({
    t: { x: 100, y: 100, w: 50, h: 40 }, viewport: VP,
    placeFn: () => ({ mode: 'below', callout: { x: 300, y: 320 } }),
  });
  assert.deepEqual(r.at, { x: 300, y: 320 });
});

test('placeZoomInset: placeFn error/inside falls through to a clamped deterministic spot', () => {
  // every placeFn attempt fails -> the helper still returns a usable, in-bounds
  // `at` (below the target, clamped to the viewport with a 12px margin)
  const r = placeZoomInset({ t: { x: 100, y: 100, w: 50, h: 40 }, viewport: VP, placeFn: () => ({ error: 'NO_SPACE' }) });
  assert.ok(r.at.x >= 12 && r.at.x + r.insetW <= VP.w - 12);
  assert.ok(r.at.y >= 12 && r.at.y + r.insetH <= VP.h - 12);
});

test('placeZoomInset: an inside-mode spot is rejected and the ladder relaxes', () => {
  // a placeFn that only ever returns mode:"inside" must NOT be accepted as the
  // inset position (inside would cover the target); fall to the deterministic at
  const r = placeZoomInset({ t: { x: 100, y: 100, w: 50, h: 40 }, viewport: VP, placeFn: () => ({ mode: 'inside', callout: { x: 5, y: 5 } }) });
  assert.notDeepEqual(r.at, { x: 5, y: 5 });
});

test('placeZoomInset: zero-size target produces a zero inset but no NaN/crash', () => {
  // a collapsed target (w/h 0) must not divide-by-zero into a NaN scale
  const r = placeZoomInset({ t: { x: 0, y: 0, w: 0, h: 10 }, viewport: VP, placeFn: () => ({ error: 'NO_SPACE' }) });
  assert.ok(Number.isFinite(r.scale));
  assert.equal(r.insetW, 0);
  assert.ok(Number.isFinite(r.at.x) && Number.isFinite(r.at.y));
});

// ── buildAnnotations: draw order + label-mode precedence ────────────────────
test('buildAnnotations: the green rect is always present at the target coords', () => {
  const ann = buildAnnotations({
    t: { x: 5, y: 6, w: 50, h: 30 },
    layout: { mode: 'below', callout: { x: 0, y: 80, w: 100 }, arrow: { x2: 25, y2: 30 } },
    viewport: VP, fontSize: 16, strokeW: 4,
  });
  const rect = ann.find((a) => a.type === 'rect');
  assert.equal(rect.color, '#16a34a');
  assert.deepEqual({ x: rect.x, y: rect.y, w: rect.w, h: rect.h }, { x: 5, y: 6, w: 50, h: 30 });
});

test('buildAnnotations: draw order is blur -> zoom -> rect (then marker shapes)', () => {
  // load-bearing: blur masks first, zoom snapshots unmarked pixels, marker last,
  // so a magnified green marker never tanks vcheck dominance
  const ann = buildAnnotations({
    t: { x: 0, y: 0, w: 50, h: 30 },
    blurBox: { x: 5, y: 5, w: 20, h: 20 },
    zoom: { at: { x: 200, y: 200 }, scale: 2, insetW: 100, insetH: 60 },
    layout: { mode: 'below', callout: { x: 0, y: 0, w: 1 }, arrow: { x2: 0, y2: 0 } },
    viewport: VP, fontSize: 16, strokeW: 3,
  });
  const order = ann.map((a) => a.type);
  assert.equal(order.indexOf('blur'), 0);
  assert.ok(order.indexOf('zoom') < order.indexOf('rect'));
});

test('buildAnnotations: a precomputed zoom.at is honored without re-placing', () => {
  const ann = buildAnnotations({
    t: { x: 0, y: 0, w: 50, h: 30 },
    zoom: { at: { x: 100, y: 100 }, scale: 2, insetW: 100, insetH: 60 },
    layout: { mode: 'below', callout: { x: 0, y: 0, w: 100 }, arrow: { x2: 5, y2: 5 } },
    viewport: VP, fontSize: 16, strokeW: 3,
  });
  const z = ann.find((a) => a.type === 'zoom');
  assert.deepEqual(z.at, { x: 100, y: 100 });
  assert.equal(z.scale, 2);
});

test('buildAnnotations: inside layout emits a label (pillOutside), not a callout', () => {
  // inside mode would cover the target text -> the pill goes OUTSIDE, typed
  // 'label'; there must be NO 'callout' in this branch
  const ann = buildAnnotations({
    t: { x: 400, y: 300, w: 50, h: 30 }, label: 'hi',
    layout: { mode: 'inside' }, viewport: VP, fontSize: 16, strokeW: 3, calloutW: 120, calloutH: 40,
  });
  assert.ok(ann.some((a) => a.type === 'label'));
  assert.ok(!ann.some((a) => a.type === 'callout'));
});

test('buildAnnotations: non-inside layout emits a callout carrying the arrow anchors', () => {
  const ann = buildAnnotations({
    t: { x: 0, y: 0, w: 50, h: 30 }, label: 'hi',
    layout: { mode: 'below', callout: { x: 10, y: 80, w: 120 }, arrow: { x2: 25, y2: 30 } },
    viewport: VP, fontSize: 16, strokeW: 3,
  });
  const c = ann.find((a) => a.type === 'callout');
  assert.equal(c.anchorX, 25);
  assert.equal(c.anchorY, 30);
  assert.equal(c.w, 120);
});

test('buildAnnotations: no label -> no callout and no label annotation', () => {
  const ann = buildAnnotations({
    t: { x: 0, y: 0, w: 50, h: 30 },
    layout: { mode: 'below', callout: { x: 0, y: 80, w: 100 }, arrow: { x2: 0, y2: 0 } },
    viewport: VP, fontSize: 16, strokeW: 3,
  });
  assert.ok(!ann.some((a) => a.type === 'callout' || a.type === 'label'));
});

test('buildAnnotations: circle is centered on the target with padded radii', () => {
  // x = t.x + t.w/2; rx = (t.w/2)*1.12 + 12; ry = (t.h/2)*1.35 + 12
  const ann = buildAnnotations({
    t: { x: 0, y: 0, w: 100, h: 40 }, circle: true,
    layout: { mode: 'below', callout: { x: 0, y: 0, w: 1 }, arrow: { x2: 0, y2: 0 } },
    viewport: VP, fontSize: 16, strokeW: 3,
  });
  const c = ann.find((a) => a.type === 'circle');
  assert.equal(c.x, 50);
  assert.equal(c.y, 20);
  assert.equal(c.rx, 68); // 50*1.12 + 12
  assert.equal(c.ry, 39); // 20*1.35 + 12
});

test('buildAnnotations: placedBoxes of its own output never collides the target', () => {
  // round-trip: a non-inside layout with a label + zoom should produce placed
  // boxes that clear the target rect (the engine's core invariant)
  const t = { x: 100, y: 100, w: 60, h: 40 };
  const ann = buildAnnotations({
    t, label: 'open menu',
    zoom: { at: { x: 600, y: 500 }, scale: 2, insetW: 120, insetH: 80 },
    layout: { mode: 'below', callout: { x: 100, y: 200, w: 140 }, arrow: { x2: 130, y2: 140 } },
    viewport: VP, fontSize: 16, strokeW: 3, calloutW: 140, calloutH: 40,
  });
  assert.equal(checkCollisions(placedBoxes(ann, { calloutW: 140, calloutH: 40 }), t), null);
});
