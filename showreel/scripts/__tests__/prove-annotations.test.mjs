import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnnotations } from '../prove.mjs';

const t = { x: 100, y: 100, w: 200, h: 50 };
const viewport = { w: 1280, h: 900 };
const layoutOutside = { mode: 'below', callout: { x: 100, y: 200, w: 220 }, arrow: { x2: 200, y2: 125 } };
const layoutInside = { mode: 'inside', callout: { x: 110, y: 110, w: 180 } };
const base = { t, viewport, fontSize: 16, strokeW: 4 };

test('green rect always present and is the only green when plain', () => {
  const ann = buildAnnotations({ ...base, layout: layoutOutside });
  assert.equal(ann.length, 1);
  assert.equal(ann[0].type, 'rect');
  assert.equal(ann[0].color, '#16a34a');
});

test('draw order: blur before zoom before green rect (privacy + vcheck)', () => {
  const ann = buildAnnotations({
    ...base,
    blurBox: { x: 100, y: 100, w: 200, h: 50 },
    zoom: { neighbors: [] },
    circle: true,
    label: 'x',
    layout: layoutOutside,
  });
  const types = ann.map((a) => a.type);
  assert.ok(types.indexOf('blur') < types.indexOf('zoom'), 'blur must precede zoom so the inset magnifies MASKED pixels');
  assert.ok(types.indexOf('zoom') < types.indexOf('rect'), 'zoom must snapshot before the green marker is drawn');
  assert.ok(types.indexOf('rect') < types.indexOf('circle'));
});

test('zoom inset placed via placeFn when space exists, fallback below otherwise', () => {
  const placed = buildAnnotations({
    ...base, zoom: { neighbors: [] }, layout: layoutOutside,
    placeFn: () => ({ callout: { x: 500, y: 300 } }),
  });
  const z1 = placed.find((a) => a.type === 'zoom');
  assert.deepEqual(z1.at, { x: 500, y: 300 });

  const fallback = buildAnnotations({
    ...base, zoom: { neighbors: [] }, layout: layoutOutside,
    placeFn: () => ({ error: 'NO_SPACE' }),
  });
  const z2 = fallback.find((a) => a.type === 'zoom');
  assert.equal(z2.at.x, 100);
  assert.equal(z2.at.y, t.y + t.h + 28);
});

test('label renders as callout outside, plain label inside-mode (no arrow)', () => {
  const outside = buildAnnotations({ ...base, label: 'menu opens', layout: layoutOutside });
  const c = outside.find((a) => a.type === 'callout');
  assert.ok(c);
  assert.equal(c.anchorX, 200);

  const inside = buildAnnotations({ ...base, label: 'menu opens', layout: layoutInside });
  assert.ok(inside.find((a) => a.type === 'label'));
  assert.ok(!inside.find((a) => a.type === 'callout'));
});

test('inside-mode label is placed OUTSIDE the target (never covers its text)', () => {
  const ann = buildAnnotations({ ...base, label: 'menu opens', layout: layoutInside, calloutW: 180, calloutH: 38 });
  const l = ann.find((a) => a.type === 'label');
  const pill = { x: l.x, y: l.y, w: 180, h: 38 };
  const overlaps = !(pill.x + pill.w <= t.x || t.x + t.w <= pill.x || pill.y + pill.h <= t.y || t.y + t.h <= pill.y);
  assert.ok(!overlaps, 'pill must not overlap the target');
  assert.ok(l.y + 38 <= t.y, 'plenty of space above -> pill goes above');
});

test('circle is an ellipse clearing the target caption (wide-target safe)', () => {
  const ann = buildAnnotations({ ...base, circle: true, layout: layoutOutside });
  const c = ann.find((a) => a.type === 'circle');
  assert.equal(c.rx, (t.w / 2) * 1.12 + 12);
  assert.equal(c.ry, (t.h / 2) * 1.35 + 12);
});
