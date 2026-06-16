import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildInject, buildInjectUrl } from '../build-inject.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const ANN = [{ type: 'rect', x: 10, y: 20, w: 30, h: 40, color: '#f00' }, { type: 'label', text: 'hi' }];
const SRC = 'function ANNOTATE(payload){ var img = new Image(); return document.body.appendChild(img); }';

test('produces a single arrow-fn string', () => {
  const inject = buildInject(PNG, ANN, SRC);
  assert.equal(typeof inject, 'string');
  assert.match(inject, /^\(\)\s*=>\s*\{/);
  assert.ok(inject.endsWith('return ANNOTATE(__PAYLOAD);}'));
});

test('embeds __PAYLOAD with base64 image and annotations', () => {
  const inject = buildInject(PNG, ANN, SRC);
  assert.ok(inject.includes('__PAYLOAD'));
  assert.ok(inject.includes('data:image/png;base64,' + PNG.toString('base64')));
  assert.ok(inject.includes('"type":"rect"'));
  assert.ok(inject.includes('"text":"hi"'));
  assert.ok(inject.includes('return ANNOTATE(__PAYLOAD)'));
});

test('inject string is syntactically valid JS (vm + Function compile, no exec)', () => {
  const inject = buildInject(PNG, ANN, SRC);
  assert.doesNotThrow(() => new vm.Script('(' + inject + ')'));
  assert.doesNotThrow(() => new Function('return (' + inject + ')'));
});

test('payload JSON round-trips back to original annotations + scale + image', () => {
  const inject = buildInject(PNG, ANN, SRC);
  const PRE = '()=>{const __PAYLOAD=';
  const sep = ';' + SRC;
  assert.ok(inject.startsWith(PRE));
  const start = PRE.length;
  const end = inject.indexOf(sep, start);
  assert.ok(end > start, 'separator (;<src>) found after payload');
  const payload = JSON.parse(inject.slice(start, end));
  assert.equal(payload.scale, 1);
  assert.deepEqual(payload.annotations, ANN);
  assert.ok(payload.imageB64.startsWith('data:image/png;base64,'));
});

test('works with a large brace-heavy source body', () => {
  const big = 'function ANNOTATE(p){ if(p){ for(var i=0;i<3;i++){ var o={a:{b:{c:1}}}; } } return p; }';
  const inject = buildInject(PNG, ANN, big);
  assert.doesNotThrow(() => new vm.Script('(' + inject + ')'));
  const PRE = '()=>{const __PAYLOAD=';
  const end = inject.indexOf(';' + big, PRE.length);
  const payload = JSON.parse(inject.slice(PRE.length, end));
  assert.deepEqual(payload.annotations, ANN);
});

test('URL mode: tiny injectable with imageUrl, no base64', () => {
  const inject = buildInjectUrl('http://x.test/raw.png', ANN, SRC);
  assert.doesNotThrow(() => new vm.Script('(' + inject + ')'));
  assert.ok(inject.includes('"imageUrl":"http://x.test/raw.png"'));
  assert.ok(!inject.includes('base64'), 'URL mode must not embed base64');
  assert.ok(inject.endsWith('return ANNOTATE(__PAYLOAD);}'));
});

test('URL mode is dramatically smaller than base64 mode', () => {
  const big = Buffer.alloc(50000, 1); // 50KB fake image
  const urlInject = buildInjectUrl('http://x.test/raw.png', ANN, SRC);
  const b64Inject = buildInject(big, ANN, SRC);
  assert.ok(urlInject.length < 1000, 'URL injectable should be tiny');
  assert.ok(b64Inject.length > 60000, 'base64 injectable carries the image');
  assert.ok(urlInject.length * 50 < b64Inject.length, 'URL mode >50x smaller for a 50KB image');
});
