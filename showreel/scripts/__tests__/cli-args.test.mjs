import { test } from 'node:test';
import assert from 'node:assert/strict';
import { num, str } from '../cli-args.mjs';

test('num: parses a valid number', () => {
  assert.equal(num('rec', '--width', '1600'), 1600);
  assert.equal(num('rec', '--scale', '1.5'), 1.5);
});

test('num: a non-numeric value throws a clear, scoped error', () => {
  assert.throws(() => num('rec', '--width', 'abc'), /rec: --width must be a number, got "abc"/);
});

test('num: a missing value throws', () => {
  assert.throws(() => num('rec', '--width', undefined), /rec: --width needs a number/);
  assert.throws(() => num('rec', '--width', ''), /rec: --width needs a number/);
});

test('num: int option rejects a float', () => {
  assert.throws(() => num('rec', '--fps', '15.5', { int: true }), /--fps must be a whole number/);
  assert.equal(num('rec', '--fps', '15', { int: true }), 15);
});

test('num: min option enforces a floor', () => {
  assert.throws(() => num('rec', '--width', '0', { min: 1 }), /--width must be >= 1/);
  assert.equal(num('rec', '--width', '1', { min: 1 }), 1);
});

test('str: returns a real value', () => {
  assert.equal(str('prove', '--label', 'menu opens'), 'menu opens');
});

test('str: a missing value throws (does not swallow the next flag)', () => {
  assert.throws(() => str('prove', '--label', undefined), /prove: --label needs a value/);
  assert.throws(() => str('prove', '--label', ''), /prove: --label needs a value/);
  // the bug this guards: `--label --circle` must not bind "--circle" as the label
  assert.throws(() => str('prove', '--label', '--circle'), /prove: --label needs a value/);
});
