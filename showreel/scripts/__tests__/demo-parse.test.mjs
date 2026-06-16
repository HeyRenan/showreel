import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../demo.mjs';

test('single mode: url, selector, out positionals + kind/text flags', () => {
  const a = parse(['http://x/', '.sel', 'out.png', '--kind', 'circle', '--text', 'hi']);
  assert.equal(a.url, 'http://x/');
  assert.equal(a.selector, '.sel');
  assert.equal(a.out, 'out.png');
  assert.equal(a.kind, 'circle');
  assert.equal(a.text, 'hi');
});

test('batch mode: only url positional, batch path captured', () => {
  const a = parse(['http://x/', '--batch', 'jobs.json']);
  assert.equal(a.url, 'http://x/');
  assert.equal(a.batch, 'jobs.json');
  assert.equal(a.selector, undefined);
});

test('unknown flag throws', () => {
  assert.throws(() => parse(['http://x/', '.s', 'o.png', '--nope']), /unknown arg/);
});

test('width/height numeric', () => {
  const a = parse(['u', 's', 'o', '--width', '1440', '--height', '900']);
  assert.equal(a.width, 1440);
  assert.equal(a.height, 900);
});
