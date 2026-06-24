// prove-circle-dominance.test.mjs — guards the fix for `prove --circle` always
// failing vcheck. A circle marker is drawn padded out beyond the target rect, so
// most of its green ring lands OUTSIDE that rect; judging dominance against the
// bare rect failed a perfectly-drawn ring (dominance ~0.37 < 0.6). dominanceTarget
// expands the judged box to the ellipse's own bounds for a circle marker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dominanceTarget } from '../prove.mjs';

test('circle marker is judged against the ellipse box, not the bare target', () => {
  const targetRect = { x: 100, y: 100, w: 40, h: 20 };
  const annotations = [{ type: 'circle', x: 120, y: 110, rx: 60, ry: 40 }];
  const box = dominanceTarget(annotations, targetRect);
  // centre 120,110 with rx/ry 60/40 → box 60,70 .. 180,150
  assert.deepEqual(box, { x: 60, y: 70, w: 120, h: 80 });
  // and it must fully contain the target rect (so the ring's green reads "inside").
  assert.ok(box.x <= targetRect.x && box.y <= targetRect.y);
  assert.ok(box.x + box.w >= targetRect.x + targetRect.w);
  assert.ok(box.y + box.h >= targetRect.y + targetRect.h);
});

test('a circle with a single radius r uses it for both axes', () => {
  const box = dominanceTarget([{ type: 'circle', x: 50, y: 50, r: 30 }], { x: 0, y: 0, w: 10, h: 10 });
  assert.deepEqual(box, { x: 20, y: 20, w: 60, h: 60 });
});

test('no circle marker keeps the bare target rect', () => {
  const rect = { x: 5, y: 6, w: 7, h: 8 };
  assert.equal(dominanceTarget([{ type: 'rect', x: 5, y: 6, w: 7, h: 8 }], rect), rect);
  assert.equal(dominanceTarget([], rect), rect);
});
