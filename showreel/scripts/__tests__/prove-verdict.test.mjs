import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCollisions, placedBoxes, buildAnnotations } from '../prove.mjs';

const target = { x: 100, y: 100, w: 200, h: 50 };

test('checkCollisions: clean layout returns null', () => {
  const placed = [
    { name: 'label', x: 100, y: 20, w: 180, h: 38 },
    { name: 'zoom', x: 400, y: 300, w: 300, h: 120 },
  ];
  assert.equal(checkCollisions(placed, target), null);
});

test('checkCollisions: placed box over the target names it', () => {
  const placed = [{ name: 'zoom', x: 150, y: 110, w: 100, h: 60 }];
  assert.equal(checkCollisions(placed, target), 'zoom overlaps target');
});

test('checkCollisions: two placed boxes overlapping each other', () => {
  const placed = [
    { name: 'label', x: 400, y: 300, w: 180, h: 38 },
    { name: 'zoom', x: 450, y: 310, w: 200, h: 100 },
  ];
  assert.equal(checkCollisions(placed, target), 'label overlaps zoom');
});

test('checkCollisions: edge contact is not a collision', () => {
  const placed = [
    { name: 'label', x: 100, y: 150, w: 180, h: 38 },
    { name: 'zoom', x: 280, y: 150, w: 100, h: 38 },
  ];
  assert.equal(checkCollisions(placed, target), null);
});

test('checkCollisions: target reported before pairwise overlaps (deterministic)', () => {
  const placed = [
    { name: 'callout', x: 110, y: 110, w: 50, h: 20 },
    { name: 'zoom', x: 120, y: 115, w: 50, h: 20 },
  ];
  assert.equal(checkCollisions(placed, target), 'callout overlaps target');
});

test('placedBoxes: zoom inset uses at + scaled size; marker shapes excluded', () => {
  const ann = [
    { type: 'blur', x: 0, y: 0, w: 10, h: 10 },
    { type: 'zoom', x: 100, y: 100, w: 200, h: 50, scale: 2, at: { x: 400, y: 300 } },
    { type: 'rect', x: 100, y: 100, w: 200, h: 50 },
    { type: 'circle', x: 200, y: 125, rx: 124, ry: 47 },
    { type: 'callout', x: 100, y: 200, w: 220 },
  ];
  const boxes = placedBoxes(ann, { calloutW: 220, calloutH: 40 });
  assert.deepEqual(boxes, [
    { name: 'zoom', x: 400, y: 300, w: 400, h: 100 },
    { name: 'callout', x: 100, y: 200, w: 220, h: 40 },
  ]);
});

test('placedBoxes: label pill sized by calloutW/calloutH', () => {
  const boxes = placedBoxes([{ type: 'label', x: 50, y: 30, text: 'x' }], { calloutW: 180, calloutH: 38 });
  assert.deepEqual(boxes, [{ name: 'label', x: 50, y: 30, w: 180, h: 38 }]);
});

test('buildAnnotations output feeds placedBoxes + checkCollisions cleanly', () => {
  const layout = { mode: 'below', callout: { x: 100, y: 200, w: 220 }, arrow: { x2: 200, y2: 125 } };
  const ann = buildAnnotations({
    t: target, viewport: { w: 1280, h: 900 }, fontSize: 16, strokeW: 4,
    label: 'menu opens', layout, calloutW: 220, calloutH: 40,
  });
  const boxes = placedBoxes(ann, { calloutW: 220, calloutH: 40 });
  assert.equal(boxes.length, 1);
  assert.equal(checkCollisions(boxes, target), null);
});
