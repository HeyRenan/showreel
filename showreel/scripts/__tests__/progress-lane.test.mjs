// progress-lane.test.mjs — unit tests for the progress rail geometry + lane.
//
// The lane choice is the fix for the rail covering a trailing status chip: a
// card with bottom padding keeps the rail INSIDE; a content-flush node (pipeline
// stage whose last child is a chip) drops the rail to an UNDER lane so the chip
// is never occluded.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressRailGeometry } from '../rec-annotate.mjs';

test('card with bottom padding keeps the rail inside', () => {
  // host 400x180 ending at y=600; lowest content ends at y=560 → 40px clear.
  const g = progressRailGeometry({ width: 400, height: 180, hostBottom: 600, contentBottom: 560 });
  assert.equal(g.lane, 'inside');
  assert.ok(g.bottom > 0, 'inside lane sits at a positive bottom inset');
  assert.equal(g.bottom, g.BOT);
});

test('content-flush node drops the rail to an under lane', () => {
  // host 156x165 ending at y=343; the "ready" chip ends flush at y=341 → 2px clear.
  const g = progressRailGeometry({ width: 156, height: 165, hostBottom: 343, contentBottom: 341 });
  assert.equal(g.lane, 'under');
  assert.ok(g.bottom < 0, 'under lane sits below the host bottom edge');
  // the rail's top edge clears the host bottom, so the chip above is never covered.
  assert.ok(g.bottom + g.H <= 0, 'the whole rail is below the host bottom');
});

test('dimensions are proportional and clamped', () => {
  const tiny = progressRailGeometry({ width: 28, height: 28, hostBottom: 28, contentBottom: 0 });
  assert.ok(tiny.H >= 4, 'rail never thinner than 4px');
  const huge = progressRailGeometry({ width: 1024, height: 1024, hostBottom: 1024, contentBottom: 0 });
  assert.ok(huge.H <= 16, 'rail never thicker than 16px at scale 1');
  assert.ok(huge.INS <= 22, 'side inset clamps so wide hosts do not get huge margins');
});

test('scale multiplies the rail thickness', () => {
  const base = progressRailGeometry({ width: 300, height: 60, hostBottom: 60, contentBottom: 0 }, 1);
  const big = progressRailGeometry({ width: 300, height: 60, hostBottom: 60, contentBottom: 0 }, 2);
  assert.ok(big.H > base.H, 'a larger scale yields a thicker rail');
});
