import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { LABEL_CACHE_DIR, LABEL_STYLE, gifFilter, labelCacheKey, labelCachePath, labelPngs } from '../compose.mjs';

test('gifFilter builds two lanes, label overlays, gap pad, hstack shortest and shared palette', () => {
  const f = gifFilter({ height: 360, gap: 20, pad: 30 });
  assert.match(f, /\[0:v\]fps=15,scale=-2:360/);
  assert.match(f, /\[1:v\]fps=15,scale=-2:360/);
  assert.match(f, /pad=iw:ih\+44:0:44:0xf1f5f9\[b0\]/, 'lane label bar must be light for dark-text labels');
  assert.match(f, /pad=iw:ih\+44:0:44:0xf1f5f9\[b1\]/);
  assert.match(f, /\[b0\]\[2:v\]overlay=14:10\[l0\]/);
  assert.match(f, /\[b1\]\[3:v\]overlay=14:10\[l1\]/);
  assert.match(f, /\[l0\]pad=iw\+20:ih:0:0:0x0d1117\[v0\]/);
  assert.match(f, /\[v0\]\[l1\]hstack=shortest=1/);
  assert.match(f, /pad=iw\+60:ih\+60:30:30/);
  assert.match(f, /\[s0\]palettegen\[p\]/);
  assert.match(f, /\[s1\]\[p\]paletteuse/);
});

test('gifFilter respects custom fps and defaults', () => {
  assert.match(gifFilter({ fps: 10 }), /fps=10,scale=-2:480/);
  assert.match(gifFilter({}), /pad=iw\+56:ih\+56:28:28/);
});

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const testStyle = (theme) => ({ ...LABEL_STYLE, theme });

test('labelCacheKey: stable, and distinct per text and per style input', () => {
  assert.equal(labelCacheKey('Before'), labelCacheKey('Before'));
  assert.match(labelCacheKey('Before'), /^[0-9a-f]{40}$/);
  assert.notEqual(labelCacheKey('Before'), labelCacheKey('After'));
  assert.notEqual(labelCacheKey('Before'), labelCacheKey('Before', testStyle('dark')));
  assert.notEqual(labelCacheKey('Before'), labelCacheKey('Before', { ...LABEL_STYLE, width: 800 }));
  assert.notEqual(labelCacheKey('Before'), labelCacheKey('Before', { ...LABEL_STYLE, font: '400 20px serif' }));
});

test('labelCachePath lives under os.tmpdir()/showreel-labels', () => {
  assert.ok(labelCachePath('X').startsWith(LABEL_CACHE_DIR + '/'));
  assert.ok(labelCachePath('X').endsWith('.png'));
});

test('labelPngs full cache hit skips browser launch entirely', async () => {
  const style = testStyle('hit-test-' + process.pid);
  mkdirSync(LABEL_CACHE_DIR, { recursive: true });
  const pa = labelCachePath('Before', style);
  const pb = labelCachePath('After', style);
  writeFileSync(pa, Buffer.from(PNG_1PX, 'base64'));
  writeFileSync(pb, Buffer.from(PNG_1PX, 'base64'));
  let launches = 0;
  const launch = async () => { launches++; throw new Error('browser must not launch on full hit'); };
  try {
    const paths = await labelPngs(['Before', 'After'], { launch, style });
    assert.deepEqual(paths, [pa, pb]);
    assert.equal(launches, 0);
  } finally {
    rmSync(pa, { force: true }); rmSync(pb, { force: true });
  }
});

test('labelPngs miss renders via browser and writes cache atomically', async () => {
  const style = testStyle('miss-test-' + process.pid + '-' + Date.now());
  const pa = labelCachePath('Before', style);
  const pb = labelCachePath('After', style);
  rmSync(pa, { force: true }); rmSync(pb, { force: true });
  let launches = 0, renders = 0, closed = 0;
  const launch = async () => {
    launches++;
    return {
      page: { evaluate: async () => { renders++; return 'data:image/png;base64,' + PNG_1PX; } },
      close: async () => { closed++; },
    };
  };
  try {
    const paths = await labelPngs(['Before', 'After'], { launch, style });
    assert.deepEqual(paths, [pa, pb]);
    assert.equal(launches, 1);
    assert.equal(renders, 2);
    assert.equal(closed, 1);
    assert.ok(existsSync(pa) && existsSync(pb));
    assert.equal(readFileSync(pa).toString('base64'), PNG_1PX);
    assert.ok(!existsSync(pa + '.' + process.pid + '.tmp'), 'tmp file must be renamed away');

    const second = await labelPngs(['Before', 'After'], { launch, style });
    assert.deepEqual(second, [pa, pb]);
    assert.equal(launches, 1, 'second run is a full hit — no new launch');
  } finally {
    rmSync(pa, { force: true }); rmSync(pb, { force: true });
  }
});

test('labelPngs renders only the missing label on partial hit', async () => {
  const style = testStyle('partial-test-' + process.pid + '-' + Date.now());
  mkdirSync(LABEL_CACHE_DIR, { recursive: true });
  const pa = labelCachePath('Before', style);
  const pb = labelCachePath('After', style);
  rmSync(pb, { force: true });
  writeFileSync(pa, Buffer.from(PNG_1PX, 'base64'));
  let renders = 0;
  const launch = async () => ({
    page: { evaluate: async () => { renders++; return 'data:image/png;base64,' + PNG_1PX; } },
    close: async () => {},
  });
  try {
    const paths = await labelPngs(['Before', 'After'], { launch, style });
    assert.deepEqual(paths, [pa, pb]);
    assert.equal(renders, 1);
    assert.ok(existsSync(pb));
  } finally {
    rmSync(pa, { force: true }); rmSync(pb, { force: true });
  }
});
