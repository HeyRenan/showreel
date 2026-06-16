import { test } from 'node:test';
import assert from 'node:assert/strict';
import { place, pillOutside, badgeOutside, snapCropToAncestor } from '../../lib/autoplace.mjs';

const VP = { w: 900, h: 600 };

function intersects(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}
function within(r, vp) {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h;
}

test('rect always equals the target exactly', () => {
  const t = { x: 300, y: 200, w: 160, h: 60 };
  const r = place({ target: t, viewport: VP });
  assert.ok(!r.error);
  assert.deepEqual(r.rect, t);
});

test('center target: callout placed, in viewport, not over target', () => {
  const t = { x: 370, y: 270, w: 160, h: 60 };
  const r = place({ target: t, viewport: VP });
  assert.ok(!r.error);
  assert.ok(within(r.callout, VP), 'callout in viewport');
  assert.ok(!intersects(r.callout, t), 'callout not over target');
});

test('arrow head lands inside the target', () => {
  const t = { x: 300, y: 200, w: 160, h: 60 };
  const r = place({ target: t, viewport: VP });
  const { x2, y2 } = r.arrow;
  assert.ok(x2 >= t.x && x2 <= t.x + t.w, 'arrow x2 in target');
  assert.ok(y2 >= t.y && y2 <= t.y + t.h, 'arrow y2 in target');
});

test('target at very top: callout does not go off-screen (no negative y)', () => {
  const t = { x: 370, y: 0, w: 160, h: 60 };
  const r = place({ target: t, viewport: VP });
  assert.ok(!r.error);
  assert.ok(within(r.callout, VP));
  assert.ok(r.callout.y >= 0);
});

test('target in top-left corner: still fits, clamped', () => {
  const t = { x: 0, y: 0, w: 120, h: 40 };
  const r = place({ target: t, viewport: VP });
  assert.ok(!r.error);
  assert.ok(within(r.callout, VP));
  assert.ok(!intersects(r.callout, t));
});

test('target bottom-right corner: callout flips to a free side', () => {
  const t = { x: VP.w - 160, y: VP.h - 60, w: 160, h: 60 };
  const r = place({ target: t, viewport: VP });
  assert.ok(!r.error);
  assert.ok(within(r.callout, VP));
  assert.ok(!intersects(r.callout, t));
});

test('neighbor below blocks below, callout avoids it', () => {
  const t = { x: 370, y: 250, w: 160, h: 60 };
  const below = { x: 370, y: 250 + 60 + 12, w: 160, h: 60 };
  const r = place({ target: t, viewport: VP, neighbors: [below] });
  assert.ok(!r.error);
  assert.ok(!intersects(r.callout, below), 'callout avoids neighbor');
  assert.ok(!intersects(r.callout, t));
});

test('neighbors on all 4 sides but corners free -> still finds space or NO_SPACE cleanly', () => {
  const t = { x: 400, y: 270, w: 100, h: 60 };
  // tight neighbors hugging each side
  const neighbors = [
    { x: 400, y: 270 + 60 + 12, w: 100, h: 30 }, // below
    { x: 400 + 100 + 12, y: 270, w: 100, h: 60 }, // right
    { x: 400, y: 270 - 12 - 30, w: 100, h: 30 }, // above
    { x: 400 - 12 - 100, y: 270, w: 100, h: 60 }, // left
  ];
  const r = place({ target: t, viewport: VP, neighbors });
  // no clean outside side -> falls back to an inside label (never a bad box)
  if (!r.error) {
    if (r.mode === 'inside') {
      // label sits inside the target, no arrow
      assert.equal(r.arrow, null);
      assert.ok(r.callout.x >= t.x && r.callout.y >= t.y);
    } else {
      assert.ok(within(r.callout, VP));
      for (const n of neighbors) assert.ok(!intersects(r.callout, n));
      assert.ok(!intersects(r.callout, t));
    }
  } else {
    assert.equal(r.error, 'NO_SPACE');
  }
});

test('giant target filling viewport -> inside label (holds it), no arrow', () => {
  const t = { x: 0, y: 0, w: VP.w, h: VP.h };
  const r = place({ target: t, viewport: VP });
  assert.ok(!r.error, 'a huge target can hold an inside label');
  assert.equal(r.mode, 'inside');
  assert.equal(r.arrow, null);
});

test('tiny target hemmed in: slide pass finds the free spot past the blockers', () => {
  const t = { x: 60, y: 60, w: 50, h: 18 }; // too small to hold an inside label
  const neighbors = [
    { x: 60, y: 90, w: 50, h: 40 },
    { x: 122, y: 60, w: 60, h: 18 },
    { x: 60, y: 20, w: 50, h: 28 },
    { x: 0, y: 60, w: 48, h: 18 },
  ];
  const r = place({ target: t, viewport: VP, neighbors, calloutW: 200, calloutH: 44 });
  assert.ok(!r.error, 'slide must find genuinely free space');
  assert.ok(within(r.callout, VP));
  assert.ok(!intersects(r.callout, t));
  for (const n of neighbors) assert.ok(!intersects(r.callout, n));
});

test('tiny target with the whole viewport blocked -> NO_SPACE', () => {
  const t = { x: 60, y: 60, w: 50, h: 18 }; // too small to hold an inside label
  const r = place({ target: t, viewport: VP, neighbors: [{ x: 0, y: 0, w: VP.w, h: VP.h }], calloutW: 200, calloutH: 44 });
  assert.equal(r.error, 'NO_SPACE');
});

test('slide keeps the box on its side and clear of a full-width band blocker', () => {
  const t = { x: 380, y: 200, w: 140, h: 40 };
  // a heading-like rect sits where the centered below-candidate would land
  const heading = { x: 300, y: 260, w: 300, h: 30 };
  // block right/above/left centered spots so the slide pass must engage
  const neighbors = [
    heading,
    { x: 532, y: 180, w: 220, h: 80 },  // right
    { x: 340, y: 130, w: 220, h: 58 },  // above
    { x: 148, y: 180, w: 220, h: 80 },  // left
  ];
  const r = place({ target: t, viewport: VP, neighbors, calloutW: 220, calloutH: 48 });
  assert.ok(!r.error);
  assert.notEqual(r.mode, 'inside');
  for (const n of neighbors) assert.ok(!intersects(r.callout, n));
  assert.ok(!intersects(r.callout, t));
});

test('arrow anchors at the NEAR edge of a wide target, not its center', () => {
  const t = { x: 100, y: 200, w: 600, h: 50 }; // wide heading-like target
  // force a right-side approach: below/above blocked by full-width bands
  const bands = [
    { x: 0, y: 262, w: 900, h: 60 },
    { x: 0, y: 130, w: 900, h: 58 },
  ];
  const rr = place({ target: t, viewport: { w: 900, h: 600 }, neighbors: bands, calloutW: 120, calloutH: 40 });
  assert.ok(!rr.error);
  assert.equal(rr.callout.side, 'right');
  assert.equal(rr.arrow.x2, t.x + t.w - 28, 'head enters just inside the near edge');
  assert.equal(rr.arrow.y2, t.y + t.h / 2);
});

test('preference order: empty page prefers below', () => {
  const t = { x: 370, y: 200, w: 160, h: 60 };
  const r = place({ target: t, viewport: VP });
  assert.equal(r.callout.side, 'below');
});

test('pillOutside prefers above and never overlaps the target', () => {
  const t = { x: 370, y: 200, w: 160, h: 60 };
  const at = pillOutside({ target: t, viewport: VP, w: 140, h: 30 });
  assert.equal(at.side, 'above');
  assert.ok(at.y + 30 <= t.y);
  assert.ok(within({ x: at.x, y: at.y, w: 140, h: 30 }, VP));
});

test('pillOutside falls to below when no room above', () => {
  const t = { x: 370, y: 8, w: 160, h: 60 };
  const at = pillOutside({ target: t, viewport: VP, w: 140, h: 30 });
  assert.equal(at.side, 'below');
  assert.ok(at.y >= t.y + t.h);
});

test('pillOutside goes beside when above and below blocked', () => {
  const t = { x: 100, y: 8, w: 160, h: VP.h - 16 };
  const at = pillOutside({ target: t, viewport: VP, w: 140, h: 30 });
  assert.equal(at.side, 'right');
  assert.ok(at.x >= t.x + t.w);
});

test('pillOutside inside only as last resort (target ~ viewport)', () => {
  const t = { x: 4, y: 4, w: VP.w - 8, h: VP.h - 8 };
  const at = pillOutside({ target: t, viewport: VP, w: 140, h: 30 });
  assert.equal(at.side, 'inside');
  assert.ok(within({ x: at.x, y: at.y, w: 140, h: 30 }, VP));
});

test('badgeOutside circle box sits fully outside the target, in viewport', () => {
  const t = { x: 370, y: 200, w: 160, h: 60 };
  const at = badgeOutside({ target: t, viewport: VP, r: 18 });
  const box = { x: at.x - 18, y: at.y - 18, w: 36, h: 36 };
  assert.ok(!intersects(box, t), 'badge must not touch the target');
  assert.ok(within(box, VP));
});

test('badgeOutside at the top-left corner flips to a side that fits', () => {
  const t = { x: 0, y: 0, w: 120, h: 40 };
  const at = badgeOutside({ target: t, viewport: VP, r: 18 });
  const box = { x: at.x - 18, y: at.y - 18, w: 36, h: 36 };
  assert.ok(!intersects(box, t));
  assert.ok(within(box, VP));
});

test('snapCropToAncestor picks the smallest containing ancestor', () => {
  const crop = { x: 100, y: 100, w: 200, h: 80 };
  const ancestors = [
    { x: 120, y: 110, w: 100, h: 40 },   // too small, does not contain
    { x: 80, y: 80, w: 300, h: 150 },    // smallest containing -> winner
    { x: 0, y: 0, w: VP.w, h: VP.h },
  ];
  const r = snapCropToAncestor({ crop, ancestors, viewport: VP });
  assert.deepEqual(r, { x: 80, y: 80, w: 300, h: 150 });
});

test('snapCropToAncestor falls back to viewport for near-viewport ancestors', () => {
  const crop = { x: 100, y: 100, w: 200, h: 80 };
  const ancestors = [{ x: 0, y: 0, w: VP.w - 10, h: VP.h - 10 }]; // > 92% of vp
  const r = snapCropToAncestor({ crop, ancestors, viewport: VP });
  assert.deepEqual(r, { x: 0, y: 0, w: VP.w, h: VP.h });
});

test('snapCropToAncestor caps ancestors at the viewport and handles none containing', () => {
  const crop = { x: -40, y: 100, w: 200, h: 80 }; // clipped to x:0 first
  const r1 = snapCropToAncestor({ crop, ancestors: [{ x: 0, y: 60, w: 400, h: 200 }], viewport: VP });
  assert.deepEqual(r1, { x: 0, y: 60, w: 400, h: 200 });
  const r2 = snapCropToAncestor({ crop: { x: 10, y: 10, w: 50, h: 50 }, ancestors: [], viewport: VP });
  assert.deepEqual(r2, { x: 0, y: 0, w: VP.w, h: VP.h });
});
